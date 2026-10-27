//! `LocalCli` backend: run an agent CLI the customer already installed and logged in.
//!
//! Guarantees (see `docs/byo-agent-backend.md`):
//! * the prompt reaches the CLI verbatim -- via stdin (claude, codex) or as ONE argv element
//!   (gemini); there is never a shell, so quotes, `$(...)` and newlines are inert;
//! * the child gets `env_clear()` plus an explicit allowlist ([`build_env`]); no API-key or token
//!   variable of the parent is forwarded -- authentication is the CLI's own stored login;
//! * cwd = the bundle work dir, own process group, SIGKILL of the whole group on timeout;
//! * stdout/stderr capture is size-capped; the transcript records exit status and output;
//! * credential files of the CLI are never opened by this crate.

use crate::backend::{
    AgentBackend, AgentFailure, AgentRequest, AgentSuccess, BackendKind, DetectedBackend,
    TranscriptFn, VERSION_PROBE_TIMEOUT,
};
use crate::report::TranscriptEntry;
use std::collections::BTreeMap;
use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub const DEFAULT_CLI_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// Per-stream capture cap; the rest is drained and discarded so the child never blocks on a pipe.
const MAX_CAPTURE_BYTES: usize = 8 * 1024 * 1024;
/// How much of each stream lands in the transcript.
const TRANSCRIPT_TEXT_CAP: usize = 256 * 1024;
const MAX_SNAPSHOT_ENTRIES: usize = 100_000;

/// Variables every CLI may see: process basics, locale, XDG dirs, proxies/CA bundle.
const COMMON_ENV: &[&str] = &[
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_CACHE_HOME",
    "XDG_STATE_HOME",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "https_proxy",
    "http_proxy",
    "no_proxy",
    "all_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
];

/// The CLI's own config-dir variables (where it keeps ITS login -- we only pass the location).
fn cli_env(kind: BackendKind) -> &'static [&'static str] {
    match kind {
        BackendKind::ClaudeCode => &["CLAUDE_CONFIG_DIR"],
        BackendKind::Codex => &["CODEX_HOME"],
        // Unverified for Gemini CLI; harmless if the CLI ignores it.
        BackendKind::Gemini => &["GEMINI_CLI_HOME"],
        BackendKind::Ollama => &["OLLAMA_HOST"],
        BackendKind::LiteLlm => &[],
    }
}

/// Pure: the environment a child of `kind` receives, from an ambient snapshot. Empty values are
/// dropped. `max_output_tokens` is applied through the CLI's own variable where one exists.
pub fn build_env(
    kind: BackendKind,
    ambient: &dyn Fn(&str) -> Option<OsString>,
    max_output_tokens: u64,
) -> Vec<(OsString, OsString)> {
    let mut out = Vec::new();
    for name in COMMON_ENV.iter().chain(cli_env(kind)) {
        if let Some(v) = ambient(name).filter(|v| !v.is_empty()) {
            out.push((OsString::from(name), v));
        }
    }
    if kind == BackendKind::ClaudeCode && max_output_tokens > 0 {
        out.push((
            "CLAUDE_CODE_MAX_OUTPUT_TOKENS".into(),
            max_output_tokens.to_string().into(),
        ));
    }
    out
}

/// The inherited file descriptor number the token is delivered on.
const SECRET_FD: i32 = 3;

const CLAUDE_CREDENTIAL_SETUP: &str = "no Claude credential is available to the sandbox: run `claude setup-token` once, store the \
    token it prints in a file readable only by you (mode 0600) and configure that path (ct-agent: \
    CT_HARNESS_CLAUDE_TOKEN_FILE). The harness never reads the macOS keychain, because a sandboxed agent must not \
    be able to reach it";

struct SandboxedRun {
    spec: CommandSpec,
    env: Vec<(OsString, OsString)>,
    dirs: crate::cli_sandbox::RunDirs,
    token: Option<String>,
}

/// A fully built command: program, argv (without program) and the bytes for stdin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandSpec {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub stdin: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct LocalCliBackend {
    pub kind: BackendKind,
    pub binary: PathBuf,
    pub timeout: Duration,
    /// Customer-chosen model for the CLI (`--model`); `None` = the CLI's own default.
    pub model: Option<String>,
    /// Request a host-side `docker compose build` after the run. REFUSED: building files an agent
    /// just edited on the host is not allowed outside the sandboxed installer path, so `run`
    /// fails fast when this is set. (The legacy LiteLLM loop keeps its own `rebuild` tool.)
    pub rebuild_after: bool,
    /// Test-only (feature `test-unsandboxed`): run without the OS sandbox. Always false otherwise.
    unconfined: bool,
    /// claude only: file holding the long-lived token from `claude setup-token` (mode 0600). It is
    /// read OUTSIDE the sandbox and handed to the CLI over an inherited file descriptor; the
    /// harness never reads the macOS keychain or any other login store for it.
    pub token_file: Option<PathBuf>,
}

impl LocalCliBackend {
    pub fn new(detected: &DetectedBackend) -> Result<Self, String> {
        Self::from_binary(detected.kind, detected.binary.clone())
    }

    pub fn from_binary(kind: BackendKind, binary: PathBuf) -> Result<Self, String> {
        match kind {
            BackendKind::ClaudeCode | BackendKind::Codex | BackendKind::Gemini => Ok(Self {
                kind,
                binary,
                timeout: DEFAULT_CLI_TIMEOUT,
                model: None,
                rebuild_after: false,
                unconfined: false,
                token_file: None,
            }),
            other => Err(format!("{} is not a local agent CLI backend", other.id())),
        }
    }

    /// Wrap `spec` in the platform sandbox with a per-run HOME holding only this CLI's login.
    /// Fails closed: no sandbox backend, an unsupported policy, or an unpreparable HOME is an
    /// error, never a fallback to an unconfined run.
    fn sandboxed(
        &self,
        req: &AgentRequest<'_>,
        spec: &CommandSpec,
        ambient: &dyn Fn(&str) -> Option<OsString>,
    ) -> Result<SandboxedRun, String> {
        use crate::cli_sandbox as cs;
        use installer_engine::sandbox::{self, NetworkPolicy, SandboxPolicy, Selection};
        let backend = match sandbox::select() {
            Selection::Sandboxed(b) => b,
            Selection::Unsandboxed { tried } => {
                return Err(format!(
                    "no OS sandbox backend is available on this host ({tried:?}); refusing to run {} unconfined \
                     (see `doctor`)",
                    self.kind.id()
                ))
            }
        };
        let real_home = ambient("HOME")
            .map(PathBuf::from)
            .ok_or("HOME is not set; cannot locate the CLI login")?;
        let dirs = cs::create_run_dirs().map_err(|e| format!("create per-run HOME/TMPDIR: {e}"))?;
        let copied = cs::prepare_home(
            &cs::credential_files(self.kind, &real_home, ambient),
            &dirs.home,
        )?;
        // Credential: claude needs a long-lived token file (read here, outside the sandbox) or a
        // file-based login copied above. The macOS keychain is deliberately NOT reachable.
        let token = match (self.kind, &self.token_file) {
            (BackendKind::ClaudeCode, Some(path)) => Some(cs::read_token_file(path)?),
            (BackendKind::ClaudeCode, None)
                if !copied.iter().any(|p| p.ends_with(".credentials.json")) =>
            {
                return Err(CLAUDE_CREDENTIAL_SETUP.to_string())
            }
            _ => None,
        };
        let path_var = ambient("PATH").unwrap_or_default();
        let canon = std::fs::canonicalize(&spec.program)
            .map_err(|e| format!("{}: {e}", spec.program.display()))?;
        let policy = SandboxPolicy {
            extra_ro_paths: cs::runtime_ro_paths(&spec.program, &path_var),
            home_dir: Some(dirs.home.clone()),
            tmp_dir: Some(dirs.tmp.clone()),
            network: NetworkPolicy::Outbound,
        };
        let env = cs::sandbox_env(
            self.kind,
            ambient,
            req.max_output_tokens,
            &dirs,
            token.as_ref().map(|_| SECRET_FD),
        );
        let env_refs: Vec<(String, String)> = env
            .iter()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.to_string_lossy().into_owned(),
                )
            })
            .collect();
        let env_refs: Vec<(&str, &str)> = env_refs
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        let args: Vec<String> = spec
            .args
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let (program, wrapped) = backend.wrap_command_with_policy(
            &canon.to_string_lossy(),
            &args,
            req.work_dir,
            &env_refs,
            &policy,
        )?;
        let wrapped = CommandSpec {
            program: PathBuf::from(program),
            args: wrapped.into_iter().map(OsString::from).collect(),
            stdin: spec.stdin.clone(),
        };
        Ok(SandboxedRun {
            spec: wrapped,
            env,
            dirs,
            token,
        })
    }

    /// Run the CLI directly, without the OS sandbox. Only exists for this crate's own tests with
    /// fake CLIs; experimental CLIs stay refused in this mode.
    #[cfg(feature = "test-unsandboxed")]
    pub fn unconfined_for_tests(mut self) -> Self {
        self.unconfined = true;
        self
    }

    /// Pure argv construction -- no spawn. Flags are those printed by each CLI's `--help`
    /// (claude 2.1.x, codex-cli 0.141, gemini 0.46); see the docs for what is unverified.
    pub fn build_command(&self, req: &AgentRequest<'_>) -> CommandSpec {
        let s = |x: &str| OsString::from(x);
        let mut args: Vec<OsString> = Vec::new();
        let mut stdin = Vec::new();
        match self.kind {
            BackendKind::ClaudeCode => {
                // No `--bare` (it disables OAuth/keychain login). `--restricted` drops Bash and all
                // code-running tools, ignores user/project/local settings (a bundle-supplied
                // .claude/settings.json with hooks cannot take effect) and confines the file tools
                // to the working directories; `--tools` scopes to file tools only; `dontAsk`
                // denies whatever is not pre-approved. App-level confinement, not an OS sandbox.
                args.extend(["-p", "--output-format", "stream-json", "--verbose"].map(s));
                args.extend([s("--max-turns"), req.max_turns.to_string().into()]);
                args.extend(["--restricted", "--permission-mode", "dontAsk"].map(s));
                args.extend(["--tools", "Read,Edit,Write,Glob,Grep"].map(s));
                args.extend(["--allowedTools", "Read,Edit,Write,Glob,Grep"].map(s));
                args.extend(["--strict-mcp-config", "--no-session-persistence"].map(s));
                if let Some(m) = &self.model {
                    args.extend([s("--model"), m.into()]);
                }
                stdin = req.prompt.as_bytes().to_vec();
            }
            BackendKind::Codex => {
                // `-` = read the instructions from stdin. workspace-write sandbox rooted at -C.
                args.extend(
                    [
                        "exec",
                        "--json",
                        "--ephemeral",
                        "--skip-git-repo-check",
                        "-s",
                        "workspace-write",
                    ]
                    .map(s),
                );
                args.extend([s("-C"), req.work_dir.as_os_str().to_owned()]);
                if let Some(m) = &self.model {
                    args.extend([s("-m"), m.into()]);
                }
                args.push(s("-"));
                stdin = req.prompt.as_bytes().to_vec();
            }
            BackendKind::Gemini => {
                // `--prompt=<text>` as one argv element, so a prompt starting with `-` is not
                // parsed as a flag. auto_edit approves edit tools; shell tools stay unapproved.
                let mut p = OsString::from("--prompt=");
                p.push(req.prompt);
                args.push(p);
                args.extend(
                    [
                        "--output-format",
                        "stream-json",
                        "--approval-mode",
                        "auto_edit",
                    ]
                    .map(s),
                );
                if let Some(m) = &self.model {
                    args.extend([s("--model"), m.into()]);
                }
            }
            BackendKind::LiteLlm | BackendKind::Ollama => {}
        }
        CommandSpec {
            program: self.binary.clone(),
            args,
            stdin,
        }
    }
}

impl AgentBackend for LocalCliBackend {
    fn kind(&self) -> BackendKind {
        self.kind
    }

    fn run(
        &self,
        req: &AgentRequest<'_>,
        record: &mut TranscriptFn<'_>,
    ) -> Result<AgentSuccess, AgentFailure> {
        let fail = |turns_used: u32, reason: String| AgentFailure { turns_used, reason };
        if self.unconfined && self.kind != BackendKind::ClaudeCode {
            return Err(fail(
                0,
                format!(
                    "{} is refused: an experimental agent CLI only runs wrapped in an OS sandbox",
                    self.kind.id()
                ),
            ));
        }
        if self.rebuild_after {
            return Err(fail(
                0,
                "rebuild needs the sandboxed installer path: the harness will not run `docker compose \
                 build` on the host for files an agent CLI edited"
                    .into(),
            ));
        }
        let ambient = |k: &str| std::env::var_os(k);
        let mut spec = self.build_command(req);
        let (env, limits, _dirs, token) = if self.unconfined {
            let token = match (self.kind, &self.token_file) {
                (BackendKind::ClaudeCode, Some(path)) => {
                    Some(crate::cli_sandbox::read_token_file(path).map_err(|e| fail(0, e))?)
                }
                _ => None,
            };
            let mut env = build_env(self.kind, &ambient, req.max_output_tokens);
            if token.is_some() {
                env.push((
                    "CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR".into(),
                    SECRET_FD.to_string().into(),
                ));
            }
            (env, None, None, token)
        } else {
            let run = self
                .sandboxed(req, &spec, &ambient)
                .map_err(|e| fail(0, e))?;
            spec = run.spec;
            (
                run.env,
                Some(installer_engine::sandbox::DEFAULT_LIMITS),
                Some(run.dirs),
                run.token,
            )
        };

        let before =
            snapshot(req.work_dir).map_err(|e| fail(0, format!("snapshot bundle: {e}")))?;
        let out = run_bounded_io(
            &spec,
            req.work_dir,
            &env,
            self.timeout,
            limits,
            token.as_deref().map(str::as_bytes),
        )
        .map_err(|e| fail(0, e))?;

        for (stream, bytes) in [("stdout", &out.stdout), ("stderr", &out.stderr)] {
            let (text, truncated) = lossy_capped(bytes);
            record(TranscriptEntry::CliOutput {
                stream: stream.into(),
                text,
                truncated,
            });
        }
        record(TranscriptEntry::CliExit {
            exit_code: out.exit_code,
            timed_out: out.timed_out,
            duration_ms: out.duration.as_millis() as u64,
        });

        let parsed = if self.kind == BackendKind::ClaudeCode {
            Some(parse_claude_stream(&out.stdout))
        } else {
            None
        };
        if let Some(p) = &parsed {
            for (i, text) in p.assistant_texts.iter().enumerate() {
                record(TranscriptEntry::ModelMessage {
                    turn: i as u32,
                    content: Some(text.clone()),
                    tool_call_count: 0,
                });
            }
        }
        let turns_used = parsed.as_ref().and_then(|p| p.num_turns).unwrap_or(0);

        if out.timed_out {
            return Err(fail(
                turns_used,
                format!(
                    "{} timed out after {}s and was killed",
                    self.kind.id(),
                    self.timeout.as_secs()
                ),
            ));
        }
        if out.exit_code != Some(0) {
            return Err(fail(
                turns_used,
                format!(
                    "{} exited with {:?}: {}",
                    self.kind.id(),
                    out.exit_code,
                    crate::redact::redact(&tail(&out.stderr, 500))
                ),
            ));
        }
        if let Some(p) = &parsed {
            if p.is_error {
                return Err(fail(
                    turns_used,
                    format!(
                        "claude reported an error result ({})",
                        p.subtype.as_deref().unwrap_or("unknown")
                    ),
                ));
            }
            if p.num_turns.is_none() {
                return Err(fail(
                    0,
                    "claude produced no result event in its stream-json output".into(),
                ));
            }
        }

        let after = snapshot(req.work_dir)
            .map_err(|e| fail(turns_used, format!("snapshot bundle: {e}")))?;
        if let Some(bad) = escaping_new_symlink(req.work_dir, &before, &after) {
            return Err(fail(
                turns_used,
                format!("containment violation: new symlink {bad} points outside the bundle"),
            ));
        }
        let files_changed = diff(&before, &after);

        Ok(AgentSuccess {
            turns_used,
            files_changed,
            rebuild_ran: false,
        })
    }
}

// ---- detection --------------------------------------------------------------------------

/// Installed agent CLIs found on the ambient `PATH`. Runs `<bin> --version` only; never opens a
/// credential file, never touches the network.
pub fn detect_backends() -> Vec<DetectedBackend> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let home = std::env::var_os("HOME");
    detect_backends_in(&path, home.as_deref())
}

/// Like [`detect_backends`] but with an explicit `PATH` value (testable without mutating the
/// process environment).
pub fn detect_backends_in(path_var: &OsStr, home: Option<&OsStr>) -> Vec<DetectedBackend> {
    let mut found = Vec::new();
    for kind in BackendKind::ALL {
        let Some(name) = kind.binary_name() else {
            continue;
        };
        let Some(binary) = find_in_path(name, path_var) else {
            continue;
        };
        let mut env = vec![(OsString::from("PATH"), path_var.to_owned())];
        if let Some(h) = home {
            env.push((OsString::from("HOME"), h.to_owned()));
        }
        let spec = CommandSpec {
            program: binary.clone(),
            args: vec!["--version".into()],
            stdin: Vec::new(),
        };
        let version = run_bounded_io(
            &spec,
            Path::new("/"),
            &env,
            VERSION_PROBE_TIMEOUT,
            None,
            None,
        )
        .ok()
        .filter(|o| !o.timed_out)
        .and_then(|o| {
            parse_version(
                &String::from_utf8_lossy(&o.stdout),
                &String::from_utf8_lossy(&o.stderr),
            )
        });
        found.push(DetectedBackend {
            kind,
            binary,
            version,
            maturity: kind.maturity(),
        });
    }
    found
}

pub fn find_in_path(name: &str, path_var: &OsStr) -> Option<PathBuf> {
    std::env::split_paths(path_var)
        .filter(|d| d.is_absolute())
        .map(|d| d.join(name))
        .find(|p| is_executable_file(p))
}

fn is_executable_file(p: &Path) -> bool {
    let Ok(m) = std::fs::metadata(p) else {
        return false;
    };
    if !m.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        m.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// First token that looks like a version number (`1.2.3`, `v0.34.0`), stdout before stderr.
pub fn parse_version(stdout: &str, stderr: &str) -> Option<String> {
    stdout
        .lines()
        .chain(stderr.lines())
        .flat_map(|l| l.split_whitespace())
        .map(|t| t.trim_start_matches('v'))
        .find(|t| t.starts_with(|c: char| c.is_ascii_digit()) && t.contains('.'))
        .map(|t| t.chars().take(64).collect())
}

// ---- bounded process runner -------------------------------------------------------------

struct ProcOutput {
    exit_code: Option<i32>,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    timed_out: bool,
    duration: Duration,
}

fn run_bounded_io(
    spec: &CommandSpec,
    cwd: &Path,
    env: &[(OsString, OsString)],
    timeout: Duration,
    limits: Option<installer_engine::sandbox::Limits>,
    secret: Option<&[u8]>,
) -> Result<ProcOutput, String> {
    let started = Instant::now();
    let mut cmd = Command::new(&spec.program);
    cmd.args(&spec.args)
        .current_dir(cwd)
        .env_clear()
        .envs(env.iter().map(|(k, v)| (k, v)))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
        if let Some(l) = limits {
            // SAFETY: `apply_limits` only calls the async-signal-safe get/setrlimit.
            unsafe {
                cmd.pre_exec(move || installer_engine::process::apply_limits(l));
            }
        }
    }
    #[cfg(not(unix))]
    let _ = limits;
    // A secret travels over a pipe inherited as fd SECRET_FD: never argv, never the environment.
    #[cfg(unix)]
    let secret_rd = match secret {
        Some(bytes) => {
            let (rd, raw) = secret_pipe(bytes)?;
            unsafe {
                use std::os::unix::process::CommandExt;
                cmd.pre_exec(move || {
                    // dup2 yields a descriptor without CLOEXEC; clear the flag explicitly so the
                    // rd == SECRET_FD case works too.
                    if libc::dup2(raw, SECRET_FD) < 0
                        || libc::fcntl(SECRET_FD, libc::F_SETFD, 0) < 0
                    {
                        return Err(std::io::Error::last_os_error());
                    }
                    Ok(())
                });
            }
            Some(rd)
        }
        None => None,
    };
    #[cfg(not(unix))]
    if secret.is_some() {
        return Err("passing a secret by file descriptor needs Unix".into());
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn {}: {e}", spec.program.display()))?;
    #[cfg(unix)]
    drop(secret_rd); // the parent's read end; the child owns its duplicate
    let pid = child.id();

    // Feed stdin on its own thread (a child that never reads must not stall the timeout loop).
    if let Some(mut stdin) = child.stdin.take() {
        let data = spec.stdin.clone();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&data); // EPIPE if the child exits early is fine
        });
    }
    let (tx, rx) = mpsc::channel::<(bool, Vec<u8>)>();
    for (is_err, pipe) in [
        (
            false,
            child
                .stdout
                .take()
                .map(|p| Box::new(p) as Box<dyn Read + Send>),
        ),
        (
            true,
            child
                .stderr
                .take()
                .map(|p| Box::new(p) as Box<dyn Read + Send>),
        ),
    ] {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut p) = pipe {
                let _ = (&mut p)
                    .take(MAX_CAPTURE_BYTES as u64)
                    .read_to_end(&mut buf);
                let _ = std::io::copy(&mut p, &mut std::io::sink());
            }
            let _ = tx.send((is_err, buf));
        });
    }
    drop(tx);

    let deadline = started + timeout;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break Some(st),
            Ok(None) if Instant::now() >= deadline => {
                timed_out = true;
                kill_group(pid, &mut child);
                break child.wait().ok();
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(e) => return Err(format!("wait failed: {e}")),
        }
    };
    // Readers end when the pipes close; after a kill, give stragglers (escaped descendants) a grace.
    let grace = if timed_out {
        Duration::from_secs(2)
    } else {
        Duration::from_secs(30)
    };
    let (mut stdout, mut stderr) = (Vec::new(), Vec::new());
    let until = Instant::now() + grace;
    for _ in 0..2 {
        match rx.recv_timeout(until.saturating_duration_since(Instant::now())) {
            Ok((true, b)) => stderr = b,
            Ok((false, b)) => stdout = b,
            Err(_) => break,
        }
    }
    Ok(ProcOutput {
        exit_code: status.and_then(|s| s.code()),
        stdout,
        stderr,
        timed_out,
        duration: started.elapsed(),
    })
}

fn kill_group(pid: u32, child: &mut std::process::Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(pid as libc::pid_t), libc::SIGKILL);
    }
    let _ = child.kill();
    let _ = pid;
}

// ---- output handling --------------------------------------------------------------------

fn lossy_capped(bytes: &[u8]) -> (String, bool) {
    let truncated = bytes.len() > TRANSCRIPT_TEXT_CAP;
    let slice = &bytes[..bytes.len().min(TRANSCRIPT_TEXT_CAP)];
    (String::from_utf8_lossy(slice).into_owned(), truncated)
}

fn tail(bytes: &[u8], n: usize) -> String {
    let s = String::from_utf8_lossy(bytes);
    let t = s.trim();
    let chars: Vec<char> = t.chars().collect();
    chars[chars.len().saturating_sub(n)..].iter().collect()
}

#[derive(Debug, Default)]
pub struct ClaudeStream {
    pub assistant_texts: Vec<String>,
    pub num_turns: Option<u32>,
    pub is_error: bool,
    pub subtype: Option<String>,
}

/// Parses `claude -p --output-format stream-json` lines: `assistant` events (text blocks) and the
/// final `result` event (`num_turns`, `is_error`, `subtype`). Unknown lines are ignored.
pub fn parse_claude_stream(stdout: &[u8]) -> ClaudeStream {
    let mut out = ClaudeStream::default();
    for line in String::from_utf8_lossy(stdout).lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        match v.get("type").and_then(|t| t.as_str()) {
            Some("assistant") => {
                let text: String = v
                    .pointer("/message/content")
                    .and_then(|c| c.as_array())
                    .map(|blocks| {
                        blocks
                            .iter()
                            .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join("")
                    })
                    .unwrap_or_default();
                if !text.is_empty() {
                    out.assistant_texts.push(text);
                }
            }
            Some("result") => {
                out.num_turns = v
                    .get("num_turns")
                    .and_then(|n| n.as_u64())
                    .map(|n| n as u32);
                out.is_error = v.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false);
                out.subtype = v
                    .get("subtype")
                    .and_then(|s| s.as_str())
                    .map(str::to_string);
                // `error_max_turns` is reported with is_error=false on some versions.
                if out
                    .subtype
                    .as_deref()
                    .is_some_and(|s| s.starts_with("error"))
                {
                    out.is_error = true;
                }
            }
            _ => {}
        }
    }
    out
}

// ---- bundle snapshot / diff -------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
enum Entry {
    File {
        len: u64,
        mtime: Option<std::time::SystemTime>,
    },
    Symlink(PathBuf),
}

fn snapshot(root: &Path) -> Result<BTreeMap<String, Entry>, String> {
    let mut map = BTreeMap::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for e in std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
            let e = e.map_err(|e| e.to_string())?;
            let path = e.path();
            let meta = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into_owned();
            if map.len() >= MAX_SNAPSHOT_ENTRIES {
                return Err(format!(
                    "bundle has more than {MAX_SNAPSHOT_ENTRIES} entries"
                ));
            }
            if meta.file_type().is_symlink() {
                let target = std::fs::read_link(&path).map_err(|e| e.to_string())?;
                map.insert(rel, Entry::Symlink(target));
            } else if meta.is_dir() {
                stack.push(path);
            } else {
                map.insert(
                    rel,
                    Entry::File {
                        len: meta.len(),
                        mtime: meta.modified().ok(),
                    },
                );
            }
        }
    }
    Ok(map)
}

fn diff(before: &BTreeMap<String, Entry>, after: &BTreeMap<String, Entry>) -> Vec<String> {
    after
        .iter()
        .filter(|(k, v)| before.get(*k) != Some(*v))
        .map(|(k, _)| k.clone())
        .collect()
}

fn escaping_new_symlink(
    root: &Path,
    before: &BTreeMap<String, Entry>,
    after: &BTreeMap<String, Entry>,
) -> Option<String> {
    let canon_root = root.canonicalize().ok()?;
    after.iter().find_map(|(rel, e)| {
        if !matches!(e, Entry::Symlink(_)) || before.get(rel) == Some(e) {
            return None;
        }
        let resolved = root.join(rel).canonicalize().ok(); // dangling links cannot be followed
        match resolved {
            Some(r) if !r.starts_with(&canon_root) => Some(rel.clone()),
            None if matches!(e, Entry::Symlink(t) if t.is_absolute()) => Some(rel.clone()),
            _ => None,
        }
    })
}

/// A pipe pre-filled with `bytes` and with the write end already closed (EOF after the data); both
/// ends are CLOEXEC so only the explicit `dup2` in the child survives `exec`.
#[cfg(unix)]
fn secret_pipe(bytes: &[u8]) -> Result<(std::os::fd::OwnedFd, i32), String> {
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    if bytes.len() > 4096 {
        return Err("secret too large for the pipe".into());
    }
    let mut fds = [0i32; 2];
    // SAFETY: plain libc calls on a fresh two-element array; both descriptors are wrapped at once.
    unsafe {
        if libc::pipe(fds.as_mut_ptr()) != 0 {
            return Err(format!("pipe: {}", std::io::Error::last_os_error()));
        }
        let (rd, wr) = (OwnedFd::from_raw_fd(fds[0]), OwnedFd::from_raw_fd(fds[1]));
        for fd in [rd.as_raw_fd(), wr.as_raw_fd()] {
            libc::fcntl(fd, libc::F_SETFD, libc::FD_CLOEXEC);
        }
        let mut w = std::fs::File::from(wr);
        w.write_all(bytes)
            .map_err(|e| format!("write secret pipe: {e}"))?;
        drop(w);
        let raw = rd.as_raw_fd();
        Ok((rd, raw))
    }
}
