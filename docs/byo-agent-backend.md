# Bring your own agent subscription (BYO agent backend)

`harness-core` executes a task prompt through an `AgentBackend`:

| id | what runs | status |
|----|-----------|--------|
| `litellm` | harness-driven loop against the operator's LiteLLM (unchanged default) | supported |
| `claude` | the customer's installed **Claude Code** (`claude -p`) | supported: flags checked against `claude --help` 2.1.310, one real run measured |
| `codex` | **OpenAI Codex CLI** (`codex exec`) | experimental, **refused** until an OS sandbox wraps it |
| `gemini` | **Gemini CLI** (`gemini --prompt=...`) | experimental, **refused** until an OS sandbox wraps it |
| `ollama` | Ollama / OpenAI-compatible server on **loopback only**, via the same loop as `litellm` | experimental |

## Terms and trust boundary

The `claude`/`codex`/`gemini` backends launch a CLI that the customer installed and logged in
themselves, under the customer's own agreement with that vendor. The platform does not proxy,
resell, pool or relay subscription access, and receives no credentials: the harness never opens
the CLI's credential files, never copies a token, and sends nothing to the platform. Whether such
automated use is permitted is governed by the vendor's terms; it is the customer's responsibility
to check them.

## Bounds

* `max_turns` is signed in the task and capped at 200 locally; passed as `--max-turns` (claude).
* Working directory = the bundle's work dir. claude runs with `--restricted` (no Bash or other
  code-running tools, user/project/local settings ignored, file tools confined to the working
  directories), `--tools`/`--allowedTools` limited to `Read,Edit,Write,Glob,Grep`,
  `--permission-mode dontAsk`, `--strict-mcp-config`. This is application-level confinement, not an
  OS sandbox; wrapping the spawn in the installer-engine sandbox is the follow-up (part B of the
  security review). Until then `codex` and `gemini` are refused outright, and `auto` never picks
  them.
* No host-side build: the harness does **not** run `docker compose build` after a CLI run
  (`rebuild_after` defaults to false and, if set, the run is refused with "rebuild needs the
  sandboxed installer path"). Only the legacy LiteLLM loop keeps its `rebuild` tool.
* Transcripts and failure reasons pass through `redact` (sk-, sk-ant-, ghp_/github_pat_, glpat-,
  xox*, AKIA/ASIA, AIza, JWTs, `Bearer ...`, PEM private keys) before they are stored; they are
  written only to the local state dir (0600).
* Wall-clock timeout (default 15 min); the whole process group is SIGKILLed.
* Environment: `env_clear()` + allowlist (`PATH`, `HOME`, `USER`, `LOGNAME`, locale, `TMPDIR`,
  `XDG_*`, proxy/CA variables, and per CLI `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `GEMINI_CLI_HOME` /
  `OLLAMA_HOST`). API-key variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, ...) are **not**
  forwarded: authentication is the CLI's stored login.
* The prompt travels on stdin (claude, codex) or as one argv element (gemini); no shell.
* Transcript: `run_start` (backend, prompt SHA-256, provenance digests), capped CLI stdout/stderr,
  exit status. Whether the CLI is logged in is not probed; a logged-out CLI fails with its own
  message in the transcript.
* `SignedTask.model` is a LiteLLM name: only `litellm`/`ollama` send it and enforce the model
  allowlist; the CLIs use the model of the customer's login.

## What is NOT verified

* `--max-turns` is accepted by claude 2.1.310 but is not listed in its `--help`.
* `codex`, `gemini`: flags come from `--help` (codex-cli 0.141, gemini 0.46) but were never run
  end to end. They have **no turn limit** (only the timeout), and Codex has no per-tool allowlist
  (its `workspace-write` sandbox may run shell commands inside the work dir). `GEMINI_CLI_HOME` is
  unverified. `--max-output-tokens` is applied only for claude (`CLAUDE_CODE_MAX_OUTPUT_TOKENS`).
* A bundle's own `CLAUDE.md`/`GEMINI.md` is still read as context by the CLI (prompt injection
  surface, same as any bundle file).
* `auto` selects only a supported CLI (claude); experimental ones need an explicit choice.
