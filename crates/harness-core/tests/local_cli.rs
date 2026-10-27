//! LocalCli backend tests against fake CLI executables (tiny shell scripts in a temp dir).
//! Serialized: writing an executable and exec'ing it while another test thread forks can hit
//! ETXTBSY, so every test holds `LOCK` for its whole body.
#![cfg(unix)]

use harness_core::backend::{AgentBackend, AgentRequest, BackendKind, Maturity};
use harness_core::local_cli::{
    build_env, detect_backends_in, parse_claude_stream, parse_version, LocalCliBackend,
};
use harness_core::report::TranscriptEntry;
use harness_core::LiteLlmBackend;
use std::ffi::OsString;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

static LOCK: Mutex<()> = Mutex::new(());

fn lock() -> std::sync::MutexGuard<'static, ()> {
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

fn fake_cli(dir: &Path, name: &str, body: &str) -> PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
    std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    p
}

const NASTY_PROMPT: &str =
    "it's \"quoted\" $(touch PWNED) `touch PWNED2` ; rm -rf /\nline2\n--help\n$HOME \\n";

fn req<'a>(prompt: &'a str, work: &'a Path) -> AgentRequest<'a> {
    AgentRequest {
        prompt,
        model: "ignored",
        max_turns: 7,
        max_output_tokens: 1234,
        work_dir: work,
        compose_file: "docker-compose.yml",
    }
}

fn backend(kind: BackendKind, bin: PathBuf) -> LocalCliBackend {
    let mut b = LocalCliBackend::from_binary(kind, bin)
        .unwrap()
        .unconfined_for_tests();
    b.rebuild_after = false;
    b.timeout = Duration::from_secs(20);
    b
}

fn run(
    b: &LocalCliBackend,
    r: &AgentRequest<'_>,
) -> (
    Result<harness_core::backend::AgentSuccess, harness_core::backend::AgentFailure>,
    Vec<TranscriptEntry>,
) {
    let mut log = Vec::new();
    let res = b.run(r, &mut |e| log.push(e));
    (res, log)
}

const CLAUDE_OK_STREAM: &str = r#"echo '{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}'
echo '{"type":"result","subtype":"success","is_error":false,"num_turns":3}'"#;

#[test]
fn detection_lists_installed_clis_with_versions_and_skips_missing() {
    let _g = lock();
    let bin = tempfile::tempdir().unwrap();
    fake_cli(bin.path(), "claude", "echo '2.9.9 (Claude Code)'");
    fake_cli(bin.path(), "ollama", "echo 'Warning: could not connect to a running Ollama instance' >&2; echo 'Warning: client version is 0.34.0' >&2");
    fake_cli(bin.path(), "gemini", "exit 1"); // installed but --version fails: still listed, no version
    let found = detect_backends_in(bin.path().as_os_str(), None);
    let by = |k| found.iter().find(|d| d.kind == k);
    let c = by(BackendKind::ClaudeCode).unwrap();
    assert_eq!(c.version.as_deref(), Some("2.9.9"));
    assert_eq!(c.maturity, Maturity::Supported);
    assert_eq!(
        by(BackendKind::Ollama).unwrap().version.as_deref(),
        Some("0.34.0")
    );
    assert_eq!(by(BackendKind::Gemini).unwrap().version, None);
    assert!(by(BackendKind::Codex).is_none());
    assert!(by(BackendKind::LiteLlm).is_none());
}

#[test]
fn detection_ignores_relative_path_entries_and_non_executables() {
    let _g = lock();
    let bin = tempfile::tempdir().unwrap();
    let p = bin.path().join("codex");
    std::fs::write(&p, "#!/bin/sh\necho 1.0.0\n").unwrap(); // mode 0644
    let path = std::env::join_paths([PathBuf::from("."), bin.path().to_path_buf()]).unwrap();
    assert!(detect_backends_in(&path, None).is_empty());
}

#[test]
fn version_parsing() {
    assert_eq!(
        parse_version("2.1.310 (Claude Code)\n", "").as_deref(),
        Some("2.1.310")
    );
    assert_eq!(
        parse_version("codex-cli v0.141.0", "").as_deref(),
        Some("0.141.0")
    );
    assert_eq!(
        parse_version("", "Warning: x\nWarning: client version is 0.34.0").as_deref(),
        Some("0.34.0")
    );
    assert_eq!(parse_version("nothing here", ""), None);
}

#[test]
fn build_command_passes_the_prompt_verbatim_never_through_a_shell() {
    let work = Path::new("/tmp/work");
    let r = req(NASTY_PROMPT, work);

    let claude = backend(BackendKind::ClaudeCode, "/bin/claude".into()).build_command(&r);
    assert_eq!(claude.stdin, NASTY_PROMPT.as_bytes());
    assert!(
        claude
            .args
            .iter()
            .all(|a| !a.to_string_lossy().contains("PWNED")),
        "prompt must not appear in argv"
    );
    let a: Vec<String> = claude
        .args
        .iter()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    for flag in [
        "-p",
        "stream-json",
        "--max-turns",
        "7",
        "dontAsk",
        "--allowedTools",
        "--tools",
    ] {
        assert!(a.iter().any(|x| x == flag), "missing {flag} in {a:?}");
    }
    assert!(
        a.iter().any(|x| x == "--restricted"),
        "claude must run --restricted: {a:?}"
    );
    assert!(!a.iter().any(|x| x == "--setting-sources"), "{a:?}");
    assert!(!a.iter().any(|x| x.contains("Bash")), "no Bash tool");
    assert!(
        !a.iter().any(|x| x == "--bare" || x.contains("dangerously")),
        "{a:?}"
    );

    let codex = backend(BackendKind::Codex, "/bin/codex".into()).build_command(&r);
    assert_eq!(codex.stdin, NASTY_PROMPT.as_bytes());
    let a: Vec<String> = codex
        .args
        .iter()
        .map(|a| a.to_string_lossy().into_owned())
        .collect();
    assert_eq!(a.last().map(String::as_str), Some("-"));
    assert!(a.windows(2).any(|w| w[0] == "-C" && w[1] == "/tmp/work"));
    assert!(a
        .windows(2)
        .any(|w| w[0] == "-s" && w[1] == "workspace-write"));
    assert!(!a.iter().any(|x| x.contains("dangerously")));

    let gemini = backend(BackendKind::Gemini, "/bin/gemini".into()).build_command(&r);
    assert!(gemini.stdin.is_empty());
    assert_eq!(
        gemini.args[0],
        OsString::from(format!("--prompt={NASTY_PROMPT}"))
    );
    assert!(!gemini
        .args
        .iter()
        .skip(1)
        .any(|a| a.to_string_lossy().contains("PWNED")));
}

#[test]
fn run_delivers_nasty_prompt_verbatim_and_does_not_execute_it() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let rec = tmp.path().join("rec");
    std::fs::create_dir(&rec).unwrap();
    let work = tmp.path().join("bundle");
    std::fs::create_dir(&work).unwrap();
    let body = format!(
        "cat > '{rec}/stdin'\nfor a in \"$@\"; do printf '%s\\n' \"$a\"; done > '{rec}/args'\npwd > '{rec}/cwd'\necho changed > edited.txt\n{CLAUDE_OK_STREAM}",
        rec = rec.display()
    );
    let bin = fake_cli(tmp.path(), "claude", &body);
    let (res, log) = run(
        &backend(BackendKind::ClaudeCode, bin),
        &req(NASTY_PROMPT, &work),
    );
    let ok = res.unwrap();
    assert_eq!(ok.turns_used, 3);
    assert_eq!(ok.files_changed, vec!["edited.txt".to_string()]);
    assert!(!ok.rebuild_ran);
    assert_eq!(
        std::fs::read_to_string(rec.join("stdin")).unwrap(),
        NASTY_PROMPT
    );
    let args = std::fs::read_to_string(rec.join("args")).unwrap();
    assert!(args.contains("--max-turns\n7\n"), "{args}");
    assert!(!args.contains("PWNED"));
    assert_eq!(
        Path::new(std::fs::read_to_string(rec.join("cwd")).unwrap().trim())
            .canonicalize()
            .unwrap(),
        work.canonicalize().unwrap()
    );
    assert!(
        !work.join("PWNED").exists() && !work.join("PWNED2").exists(),
        "prompt was shell-evaluated"
    );
    assert!(log.iter().any(|e| matches!(
        e,
        TranscriptEntry::CliExit {
            exit_code: Some(0),
            timed_out: false,
            ..
        }
    )));
    assert!(log.iter().any(
        |e| matches!(e, TranscriptEntry::ModelMessage { content: Some(c), .. } if c == "done")
    ));
}

#[test]
fn experimental_clis_are_refused_without_a_sandbox_and_never_spawned() {
    let _g = lock();
    for kind in [BackendKind::Codex, BackendKind::Gemini] {
        let tmp = tempfile::tempdir().unwrap();
        let work = tmp.path().join("b");
        std::fs::create_dir(&work).unwrap();
        let marker = tmp.path().join("spawned");
        let bin = fake_cli(
            tmp.path(),
            kind.id(),
            &format!("touch '{}'", marker.display()),
        );
        let f = run(&backend(kind, bin), &req("hi", &work)).0.unwrap_err();
        assert!(
            f.reason.contains("refused") && f.reason.contains("sandbox"),
            "{}",
            f.reason
        );
        assert!(!marker.exists(), "{} was executed unconfined", kind.id());
    }
}

#[test]
fn host_side_rebuild_is_refused_before_anything_runs() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let marker = tmp.path().join("spawned");
    let bin = fake_cli(
        tmp.path(),
        "claude",
        &format!("touch '{}'\n{CLAUDE_OK_STREAM}", marker.display()),
    );
    let mut b = backend(BackendKind::ClaudeCode, bin);
    b.rebuild_after = true;
    let f = run(&b, &req("hi", &work)).0.unwrap_err();
    assert!(
        f.reason
            .contains("rebuild needs the sandboxed installer path"),
        "{}",
        f.reason
    );
    assert!(!marker.exists());
    // And by default the backend never asks for one.
    assert!(
        !LocalCliBackend::from_binary(BackendKind::ClaudeCode, "x".into())
            .unwrap()
            .rebuild_after
    );
}

#[test]
fn secrets_in_cli_output_are_redacted_in_the_reason_and_on_disk() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let secret = format!("{}{}", "sk-ant-", "api03-abcdefghijklmnopqrstuvwxyz0123");
    let bin = fake_cli(
        tmp.path(),
        "claude",
        &format!("echo 'key={secret}'\necho 'bad {secret}' >&2\nexit 2"),
    );
    let (res, log) = run(&backend(BackendKind::ClaudeCode, bin), &req("hi", &work));
    let reason = res.unwrap_err().reason;
    assert!(
        !reason.contains(&secret) && reason.contains("[REDACTED]"),
        "{reason}"
    );
    let state = tempfile::tempdir().unwrap();
    for e in &log {
        harness_core::report::append_transcript(state.path(), "abc", e);
    }
    let disk = std::fs::read_to_string(harness_core::report::transcript_path(state.path(), "abc"))
        .unwrap();
    assert!(
        !disk.contains(&secret),
        "secret reached the transcript: {disk}"
    );
    assert!(disk.contains("[REDACTED]"));
}

#[test]
fn env_allowlist_pure() {
    let ambient = |k: &str| -> Option<OsString> {
        match k {
            "HOME" => Some("/h".into()),
            "PATH" => Some("/p".into()),
            "CLAUDE_CONFIG_DIR" => Some("/cc".into()),
            "CODEX_HOME" => Some("/cx".into()),
            "ANTHROPIC_API_KEY"
            | "OPENAI_API_KEY"
            | "GEMINI_API_KEY"
            | "GITHUB_TOKEN"
            | "CLAUDE_CODE_OAUTH_TOKEN" => Some("secret".into()),
            "EMPTY" => Some("".into()),
            _ => None,
        }
    };
    let names = |k| {
        build_env(k, &ambient, 99)
            .into_iter()
            .map(|(n, _)| n.to_string_lossy().into_owned())
            .collect::<Vec<_>>()
    };
    let c = names(BackendKind::ClaudeCode);
    assert!(
        c.contains(&"HOME".into())
            && c.contains(&"PATH".into())
            && c.contains(&"CLAUDE_CONFIG_DIR".into())
    );
    assert!(c.contains(&"CLAUDE_CODE_MAX_OUTPUT_TOKENS".into()));
    assert!(!c.contains(&"CODEX_HOME".into()));
    for secret in [
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "GITHUB_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
    ] {
        assert!(!c.contains(&secret.to_string()), "{secret} leaked");
    }
    let x = names(BackendKind::Codex);
    assert!(x.contains(&"CODEX_HOME".into()) && !x.contains(&"CLAUDE_CONFIG_DIR".into()));
    assert!(!x.contains(&"CLAUDE_CODE_MAX_OUTPUT_TOKENS".into()));
}

#[test]
fn child_really_gets_only_allowlisted_env() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let dump = tmp.path().join("env");
    let bin = fake_cli(
        tmp.path(),
        "claude",
        &format!("env > '{}'\n{CLAUDE_OK_STREAM}", dump.display()),
    );
    let (res, _) = run(&backend(BackendKind::ClaudeCode, bin), &req("hi", &work));
    res.unwrap();
    let env = std::fs::read_to_string(dump).unwrap();
    for l in env.lines() {
        let n = l.split('=').next().unwrap();
        let bad = n.starts_with("ANTHROPIC_")
            || n.starts_with("OPENAI_")
            || n.starts_with("GEMINI_")
            || n.starts_with("CLAUDE_FLOW")
            || n == "CLAUDECODE"
            || (n.starts_with("CLAUDE_CODE_") && n != "CLAUDE_CODE_MAX_OUTPUT_TOKENS");
        assert!(!bad, "unexpected variable forwarded: {n}");
    }
    assert!(env.contains("CLAUDE_CODE_MAX_OUTPUT_TOKENS=1234"), "{env}");
}

#[test]
fn timeout_kills_the_whole_process_group() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let pidfile = tmp.path().join("pid");
    let bin = fake_cli(
        tmp.path(),
        "claude",
        &format!("sleep 60 &\necho $! > '{}'\nwait", pidfile.display()),
    );
    let mut b = backend(BackendKind::ClaudeCode, bin);
    b.timeout = Duration::from_millis(400);
    let t = Instant::now();
    let (res, log) = run(&b, &req("hi", &work));
    assert!(
        t.elapsed() < Duration::from_secs(10),
        "took {:?}",
        t.elapsed()
    );
    let f = res.unwrap_err();
    assert!(f.reason.contains("timed out"), "{}", f.reason);
    assert!(log.iter().any(|e| matches!(
        e,
        TranscriptEntry::CliExit {
            timed_out: true,
            ..
        }
    )));
    let pid: i32 = std::fs::read_to_string(pidfile)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    std::thread::sleep(Duration::from_millis(200));
    let alive = std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .unwrap()
        .success();
    assert!(!alive, "grandchild {pid} survived the timeout");
}

#[test]
fn non_zero_exit_is_a_failure_with_stderr_in_reason_and_transcript() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let bin = fake_cli(tmp.path(), "claude", "echo 'not logged in' >&2\nexit 3");
    let (res, log) = run(&backend(BackendKind::ClaudeCode, bin), &req("hi", &work));
    let f = res.unwrap_err();
    assert!(
        f.reason.contains("3") && f.reason.contains("not logged in"),
        "{}",
        f.reason
    );
    assert!(log.iter().any(|e| matches!(e, TranscriptEntry::CliOutput { stream, text, .. } if stream == "stderr" && text.contains("not logged in"))));
}

#[test]
fn claude_error_result_is_a_failure_even_with_exit_zero() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let bin = fake_cli(
        tmp.path(),
        "claude",
        r#"echo '{"type":"result","subtype":"error_max_turns","is_error":false,"num_turns":7}'"#,
    );
    let (res, _) = run(&backend(BackendKind::ClaudeCode, bin), &req("hi", &work));
    let f = res.unwrap_err();
    assert!(f.reason.contains("error_max_turns"), "{}", f.reason);
    assert_eq!(f.turns_used, 7);
}

#[test]
fn claude_without_a_result_event_is_a_failure() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let bin = fake_cli(tmp.path(), "claude", "echo garbage");
    assert!(
        run(&backend(BackendKind::ClaudeCode, bin), &req("hi", &work))
            .0
            .is_err()
    );
}

#[test]
fn a_new_symlink_escaping_the_bundle_is_a_containment_violation() {
    let _g = lock();
    let tmp = tempfile::tempdir().unwrap();
    let work = tmp.path().join("b");
    std::fs::create_dir(&work).unwrap();
    let bin = fake_cli(
        tmp.path(),
        "claude",
        &format!("ln -s /etc evil\n{CLAUDE_OK_STREAM}"),
    );
    let f = run(&backend(BackendKind::ClaudeCode, bin), &req("hi", &work))
        .0
        .unwrap_err();
    assert!(
        f.reason.contains("containment violation") && f.reason.contains("evil"),
        "{}",
        f.reason
    );
}

#[test]
fn missing_binary_is_a_failure_not_a_panic() {
    let tmp = tempfile::tempdir().unwrap();
    let (res, _) = run(
        &backend(BackendKind::ClaudeCode, tmp.path().join("nope")),
        &req("hi", tmp.path()),
    );
    assert!(res.unwrap_err().reason.contains("failed to spawn"));
}

#[test]
fn claude_stream_parser() {
    let p = parse_claude_stream(b"junk\n{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"a\"},{\"type\":\"tool_use\"}]}}\n{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"num_turns\":2}\n");
    assert_eq!(p.assistant_texts, vec!["a"]);
    assert_eq!(p.num_turns, Some(2));
    assert!(!p.is_error);
}

#[test]
fn ollama_backend_refuses_non_loopback_endpoints() {
    assert!(LiteLlmBackend::ollama_local("http://127.0.0.1:11434/v1").is_ok());
    assert!(LiteLlmBackend::ollama_local("http://localhost:11434/v1").is_ok());
    assert!(LiteLlmBackend::ollama_local("http://[::1]:11434/v1").is_ok());
    for bad in [
        "https://127.0.0.1/v1",
        "http://example.com/v1",
        "http://127.0.0.1.evil.com/v1",
        "http://10.0.0.5:11434/v1",
        "http://localhost@evil.com/v1",
    ] {
        assert!(LiteLlmBackend::ollama_local(bad).is_err(), "{bad}");
    }
}

#[test]
fn only_cli_kinds_construct_a_local_cli_backend() {
    assert!(LocalCliBackend::from_binary(BackendKind::LiteLlm, "x".into()).is_err());
    assert!(LocalCliBackend::from_binary(BackendKind::Ollama, "x".into()).is_err());
}
