# Bring your own agent subscription (BYO agent backend)

`harness-core` executes a task prompt through an `AgentBackend`:

| id | what runs | status |
|----|-----------|--------|
| `litellm` | harness-driven loop against the operator's LiteLLM (unchanged default) | supported |
| `claude` | the customer's installed **Claude Code** (`claude -p`) | supported: flags checked against `claude --help`, real runs measured inside the sandbox (2.1.311, macOS Seatbelt) |
| `codex` | **OpenAI Codex CLI** (`codex exec`) | experimental (runs only inside the OS sandbox) |
| `gemini` | **Gemini CLI** (`gemini --prompt=...`) | experimental (runs only inside the OS sandbox) |
| `ollama` | Ollama / OpenAI-compatible server on **loopback only**, via the same loop as `litellm` | experimental |

## Terms and trust boundary

The `claude`/`codex`/`gemini` backends launch a CLI that the customer installed and logged in
themselves, under the customer's own agreement with that vendor. The platform does not proxy,
resell, pool or relay subscription access and receives no credentials; the harness sends nothing to
the platform. Detection (`harness backends`) only looks at `PATH` and runs `--version`. A run copies
the login files of exactly the selected CLI into a throw-away per-run HOME (see below) so the CLI can
authenticate inside the sandbox; they are never read for any other purpose, never logged, and the
copy is deleted afterwards. Whether such automated use is permitted is governed by the vendor's
terms; it is the customer's responsibility to check them.

## OS sandbox (fail closed)

Every CLI run is wrapped by `installer_engine::sandbox` (Seatbelt on macOS, bubblewrap on Linux).
If no backend is usable the run is **refused** ("refusing to run ... unconfined"); there is no
fallback. WSL/Windows does not support the extended policy and is refused as well.

* Filesystem: deny-by-default read-only OS view, no real `$HOME`; writes only to the bundle work dir,
  a per-run HOME and a per-run TMPDIR (both 0700, outside the bundle, deleted after the run).
* The CLI binary and its runtime (e.g. the Node installation of a script CLI) are added read-only.
* Per-run HOME holds only the selected CLI's file-based login: claude `~/.claude/.credentials.json`
  and a filtered `~/.claude.json` (without `projects`/`mcpServers`), codex
  `~/.codex/{auth.json,config.toml}`, gemini
  `~/.gemini/{oauth_creds.json,google_accounts.json,settings.json,installation_id}`
  (`CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`GEMINI_CLI_HOME` locate the source). Nothing is written back.
  Stale `cads-harness-run-<pid>-*` directories of dead processes are swept at the next start.
* **The macOS keychain is not reachable from the sandbox** (`security(1)` and the Security server are
  denied as the last rules of every Seatbelt profile). On macOS Claude Code keeps its login in the
  keychain, so a sandboxed run needs a credential obtained outside the sandbox: run
  `claude setup-token` once, store the printed long-lived token in a file readable only by you
  (mode 0600) and configure it (`LocalCliBackend::token_file`; ct-agent
  `CT_HARNESS_CLAUDE_TOKEN_FILE`). The harness reads that file itself and gives the token to the CLI
  over an inherited file descriptor (`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR=3`), never in argv or
  the environment. Without a token file (and without a file-based login on Linux) the run is
  refused with that instruction; there is no keychain fallback. `CLAUDE_CODE_OAUTH_TOKEN` and the
  descriptor variable are present in the Claude Code binary (verified with `strings`); the
  long-lived token is documented by `claude setup-token --help` as requiring a Claude subscription
  and is inference-only.
* Network: outbound plus name resolution. Seatbelt: tcp/443 only (plus the mDNSResponder socket).
  bwrap: `--share-net` with read-only `resolv.conf`, `hosts` and the CA stores, which shares the
  **host network namespace**: host loopback services and the local network are reachable from the
  sandbox, not just 443 (no `pasta`/`slirp4netns` isolation yet). Neither is a host allowlist.
* `rlimit`s of the installer sandbox (CPU, file size, process count) apply.
* Seatbelt rules were each kept only because removing them broke a real `claude -p` run (macOS 27,
  Claude Code 2.1.311): outbound 443, the mDNSResponder socket and the timezone database. `trustd`,
  `dnssd`, `configd`, `/Library/Keychains`, `mds` and `system-socket` were tried and are not needed. Claude Code is pointed at the per-run TMPDIR via
  `CLAUDE_CODE_TMPDIR` (it otherwise writes the shared `/tmp/claude-<uid>`).

## Bounds

* `max_turns` is signed in the task and capped at 200 locally; passed as `--max-turns` (claude).
* Working directory = the bundle's work dir. claude runs with `--restricted` (no Bash or other
  code-running tools, user/project/local settings ignored, file tools confined to the working
  directories), `--tools`/`--allowedTools` limited to `Read,Edit,Write,Glob,Grep`,
  `--permission-mode dontAsk`, `--strict-mcp-config`: application-level confinement on top of the
  OS sandbox. `auto` never picks `codex`/`gemini`; they must be named explicitly.
* No host-side build: the harness does **not** run `docker compose build` after a CLI run
  (`rebuild_after` defaults to false and, if set, the run is refused with "rebuild needs the
  sandboxed installer path"). Only the legacy LiteLLM loop keeps its `rebuild` tool.
* Transcripts and failure reasons pass through `redact` (sk-, sk-ant-, ghp_/github_pat_, glpat-,
  xox*, AKIA/ASIA, AIza, JWTs, `Bearer ...`, PEM private keys) before they are stored; they are
  written only to the local state dir (0600).
* Wall-clock timeout (default 15 min); the whole process group is SIGKILLed.
* Environment: `env_clear()` + allowlist (`PATH`, `USER`, `LOGNAME`, locale, proxy/CA variables;
  `HOME` and `TMPDIR` point at the per-run directories, `XDG_*` and the CLI config-dir variables are
  not forwarded). API-key variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...) are **not**
  forwarded: authentication is the CLI's stored login.
* The prompt travels on stdin (claude, codex) or as one argv element (gemini); no shell.
* Transcript: `run_start` (backend, prompt SHA-256, provenance digests), capped CLI stdout/stderr,
  exit status. Whether the CLI is logged in is not probed; a logged-out CLI fails with its own
  message in the transcript.
* `SignedTask.model` is a LiteLLM name: only `litellm`/`ollama` send it and enforce the model
  allowlist; the CLIs use the model of the customer's login.

## Residual risk and what is NOT verified

* **Exfiltration over the allowed network.** Outbound 443 is open so the CLI can reach its
  provider; anything inside the sandbox that the agent can read (the bundle, its copied login) can
  be sent to any host on 443 by a prompt-injected agent. Recommended next step: route the sandbox's
  traffic through a proxy that allows only the provider hosts (`api.anthropic.com`, ...).
* The credential (token or copied file login) is readable by the sandboxed CLI, necessarily, and is
  exfiltrable over the allowed network. A long-lived inference-only token limits the damage; revoke
  it if a run is suspect.
* On Linux, bwrap `--share-net` exposes host loopback services (see Network above).
* **Measured vs not:** the sandboxed real `claude` was run with a dummy token on macOS: it read the
  token from the descriptor, reached the API and received the API's 401, which shows the credential
  path and network work. A successful turn with a real `claude setup-token` token was NOT measured
  (minting one needs an interactive login); set `HARNESS_CLAUDE_TOKEN_FILE` to run
  `tests/sandboxed_cli.rs` against a real one.
* `--max-turns` is accepted by claude but is not listed in its `--help`.
* `codex`, `gemini`: flags come from `--help` (codex-cli 0.141, gemini 0.46); they were never run
  end to end under the sandbox. No turn limit (only the timeout); Codex has no per-tool allowlist;
  their runtimes (Node) may need paths the read-only heuristic does not add. `GEMINI_CLI_HOME` is
  unverified. Output-token caps apply only to claude (`CLAUDE_CODE_MAX_OUTPUT_TOKENS`).
* Linux (bwrap) is covered by argv unit tests and by the fake-CLI escape test, which is run in CI;
  a real `claude` under bwrap is skipped where `claude` is absent and was not run for this change.
* A bundle's own `CLAUDE.md`/`GEMINI.md` is still read as context by the CLI.
* `auto` selects only a supported CLI (claude).
