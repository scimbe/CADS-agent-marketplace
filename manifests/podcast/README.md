# podcast — a real ffmpeg + whisper.cpp + LLM pipeline, installable as one signed manifest

Not a test fixture (see `test-manifests/minimal-compose/` for that) — this packages the real
`podcast_producer` pipeline from
[github.com/scimbe/CADS-DEMO-podcast](https://github.com/scimbe/CADS-DEMO-podcast) as an
`InstallerKind::Binary` manifest. Activating it runs the same three real stages that upstream
repo's own README documents, against the same raw audio fixtures it already ships with — no
fixtures invented here, no output faked.

## What it does, concretely

One executable (`bundle/run.sh`), the whole thing bounded by installer-engine's 300s
Binary-kind hard timeout (real runs take ~7-10s, see "Verified for real" below):

1. **`cut_mix.py`** — real `ffmpeg`: trims, concatenates, and encodes `tests/fixtures/raw/track{1,2,3}.wav`
   + `stinger.wav` (the exact fixtures upstream commits, unmodified) into `episode_master.wav` /
   `episode.mp3` / `episode_16k.wav`.
2. **`transcribe.py`** — real `whisper.cpp` `whisper-cli` against the real `ggml-tiny.en.bin`
   model, producing `transcript.srt` / `transcript.json`.
3. **`chapters.py`** — a real call to an LLM endpoint that reads the real transcript segments and
   proposes chapter markers. Every returned timestamp is validated in code against the real
   whisper.cpp segment boundaries (`ChapterValidationError` on anything ungrounded — see
   upstream's `chapters.py` docstring); the LLM never gets the final say on a timestamp.

Stage 4 (`announce.py`, optional Piper TTS chapter announcements) is upstream-optional and is
**not** invoked by `run.sh` — this manifest's acceptance bar is real audio + real transcript +
real, grounded chapters, matching upstream's own `docs/PIPELINE.md`.

## Why Binary, not Compose

This is a short-lived, run-to-completion CLI pipeline — exactly what `InstallerKind::Binary`
is for (see `manifest-core::InstallerKind`'s own doc comment: "pick Binary for anything that's
naturally run once, produce output, exit"). There is no long-running service, no port to bind,
nothing for `guardrails::scan_compose` to check. The tradeoff this manifest accepts in exchange
(see `manifest-core::InstallerKind::Binary`'s doc comment) is that Binary has no equivalent
static safety scan — its entire trust boundary is the publisher allowlist check in
`installer-engine::activate` step 3. Never allowlist this (or any) Binary publisher you would not
also trust with an unscanned Compose bundle.

## Prerequisites — this manifest does NOT install these for you

Same posture as every other manifest in this repo (`manifests/llm-node/README.md`: "`ct-agent`
itself must already be running on the host before any manifest ... can be installed";
`test-manifests/minimal-compose/`: Docker must already be present). `run.sh` checks every one of
these explicitly and fails loudly with a clear message naming exactly what's missing, rather than
silently degrading — it never installs anything itself, and it never falls back to a mock
transcript (upstream's `--allow-mock-transcript` flag is deliberately never passed).

- **`ffmpeg` / `ffprobe`** on `PATH`.
- **A built `whisper.cpp` `whisper-cli` + a downloaded `ggml-tiny.en.bin` model.** Upstream's own
  `scripts/setup_whisper_cpp.sh` does this (clones `ggml-org/whisper.cpp` pinned to tag `b4938`,
  builds with cmake, downloads the model from `huggingface.co/ggerganov/whisper.cpp`) — took
  under 2 minutes end-to-end when this manifest was verified. Point `WHISPER_CLI_PATH` /
  `WHISPER_MODEL_PATH` (env_template, below) at the results.
- **A `python3` interpreter with `openai>=1.0` pip-installed** (see `bundle/requirements.txt` —
  that's the only pip dependency this manifest's own code path actually imports; `pytest` and
  `piper-tts` are upstream dev/optional-feature dependencies this manifest never touches). Point
  `PODCAST_PYTHON_BIN` at it if it is not the `python3` already on `PATH` (e.g. an unactivated
  venv) — see the `env_template` note below on why `verify.sh` can't rely on this var itself.
- **An LLM endpoint** for stage 3 only (`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`) — see
  "Needs an LLM key" below.

None of the above is bundled: whisper.cpp's own model alone is ~75MB, well past what belongs in
a bundle this repo's own `fetch.rs::MAX_FETCH_BYTES` (64MiB) treats as reasonable for
"config/scripts, not large binaries" — see that constant's own doc comment. `bundle.tar.gz` here
is ~600KB: source + the four small raw WAV fixtures only.

## Needs an LLM key for chapter-marking — required, not optional

Stage 3 (`chapters.py`) hard-requires `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` (see
upstream's `llm_client.py::get_client()` — raises `LlmConfigError` if any is missing) and
`run.sh` checks all three are non-empty before running anything at all, exactly like the
whisper.cpp/ffmpeg checks above. **`pipeline.py` is one monolithic run** (cut_mix → transcribe →
chapters, no CLI flag to stop after stage 2), so as packaged, a missing LLM key means `run.sh`
exits before ffmpeg ever runs, not partway through.

**What was verified independently, without any LLM key involved**, to separate "the LLM stage
needs a key" from "the rest of the pipeline works" (see also `docs/LIMITATIONS.md` §5 upstream,
which documents the same key-provisioning gap for CI): stages 1+2 invoked directly as their own
CLI modules (`python -m podcast_producer.cut_mix`, `python -m podcast_producer.transcribe`) in a
fully scrubbed environment (`env -i`, zero `LLM_*` vars present at all) — both exited 0 and
produced the same real `episode.mp3` / `episode_16k.wav` / `transcript.srt` /`transcript.json` as
the full run, word-for-word correct ASR. See "Verified for real" below for the full,
key-included, real `dev_activate` run this manifest was actually shipped against.

## Required env vars (values go in your own local `.env` / `CT_MANIFEST_ENV_FILE`, never in the
manifest — see `manifest.json`'s `env_template` for the authoritative list/descriptions)

- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` — required, stage 3 only.
- `WHISPER_CLI_PATH`, `WHISPER_MODEL_PATH` — required, absolute paths from the whisper.cpp setup
  above.
- `PODCAST_PYTHON_BIN` — optional, defaults to `python3` on `PATH`.

**Why `verify.sh` doesn't check `PODCAST_PYTHON_BIN`/re-run anything with it:** installer-engine
runs `verify.sh` with a scrubbed environment — only `CT_MANIFEST_PROJECT_NAME`, never the
resolved env_template values (`installer-engine::activate` step 10's own comment; the identical
lesson `manifests/llm-node/bundle/verify.sh` documents, there solved by sourcing the `.env`
installer-engine wrote to `work_dir`). This manifest's `verify.sh` doesn't need any of those
values at all — it only inspects files `run.sh` already wrote under `./out` — so unlike
llm-node's verify script there is nothing to source. It deliberately avoids assuming `python3` is
even on `PATH` for the same reason `PODCAST_PYTHON_BIN` exists in the first place (an operator's
real interpreter may not be), and checks JSON output with `grep`/`wc` instead of a JSON parser.

## Verified for real before commit

`cargo run --example dev_activate -p installer-engine` (with `CWD` set to this directory — see
`bundle.url`'s comment below for why), the exact code path a real `ct-agent manifest activate`
runs: fetch → sha256 check → (Binary skips the Compose-only guardrail scan and the Compose-only
docker-collision check, see `installer-engine::activate` steps 5/7's own comments) → chmod+x →
run `run.sh` → run `verify.sh`. Real result, against the real shared demo-portfolio LLM key:

```json
{
  "status": "ok",
  "manifest_id": "b6b9305cdb5123e497892675e6588dfb4daef61d830d41c8d70b63fdb0c160dd",
  "publisher_pubkey": "48a56a4442269b71bcc09a4bb556c6035cf1cb9170c68e2663974418197764b9",
  "compose_up": { "exit_code": 0, "duration_ms": 7347 },
  "verify": { "exit_code": 0, "duration_ms": 111 }
}
```

(`compose_up` is the field name `installer-engine::report` uses for the up-and-running step of
*either* installer kind — Binary's own run, here — not literally `docker compose up`; see
`report.rs`.) `captured_stdout` on that same result is `run.sh`'s full `pipeline_summary.json`,
including three real, word-for-word-correct transcript segments and three real, LLM-generated,
timestamp-validated chapters (`"generated_from_mock_transcript": false`) — omitted here for
length, reproduce it yourself with the command above.

`verify.sh`'s own real output on that run:

```
OK: track track1 matched 2/3 expected keywords
OK: track track2 matched 3/3 expected keywords
OK: track track3 matched 3/3 expected keywords
OK: ./out/chapters.json has 3 chapters
OK: real episode audio + real whisper.cpp transcript + real, grounded chapter markers all present in ./out
```

## `bundle.url` is a RELATIVE path

Same lesson as every other manifest here (see `test-manifests/minimal-compose/README.md`):
`"bundle.tar.gz"` only resolves correctly if the process reading it has this directory
(`manifests/podcast/`) as its own working directory —
`installer-engine::fetch::fetch_bytes` reads anything not `http(s)://` via `std::fs::read`,
resolved against the **process's** CWD, not `manifest.json`'s own location. `cd` here first.

## What's real vs. what's a documented limitation (inherited from upstream)

Everything upstream's own `docs/LIMITATIONS.md` documents still applies unchanged — this
manifest doesn't touch fixture generation, it only runs the pipeline against the fixtures
already committed. Two items from there worth restating in this manifest's own context:

- The fixture speech is real Piper-synthesized audio (not a mock, not a public-domain clip —
  upstream §1), and whisper.cpp's tiny.en model transcribes it word-for-word correctly, which is
  exactly what `run.sh`'s independently-run stage-1+2 check above re-confirmed.
- `--allow-mock-transcript` exists upstream but `run.sh` never passes it — a missing/broken
  whisper.cpp setup is a hard `run.sh` failure here, never a silent mock (upstream §2).

## Round two (not yet built)

Upstream's own scope note (`README.md` "Scope note", `docs/LIMITATIONS.md` §6): this is a local
CLI pipeline, not a `*.bunsenbrenner.org` web/tunnel service, and packaging one was explicitly
out of scope for that repo's own pass. This manifest inherits that same scope — it installs and
runs the CLI pipeline, nothing more.

## Static-scan gap (Binary kind) — disclosed, not this manifest's defect

`installer-engine`'s static guardrail scan (`guardrails.rs`, F.1/F.2/F.3 — loopback-only ports, no
privileged/host-namespace flags, no docker-socket mounts) runs **only for `InstallerKind::Compose`**
today. `InstallerKind::Binary` (what this manifest uses) gets none of that — `activate.rs`'s Binary
arm runs the bundle's executable directly, with no static check and (as of this writing, on `main`)
no sandbox either. This is a known, already-designed-for gap (`docs/design/sandbox-fallback.md`,
marketplace PR#20 — bwrap-based runtime sandboxing, currently unmerged) — not something specific to
this manifest, but worth disclosing here rather than only in that PR: **trust for a Binary manifest
rests entirely on the publisher allowlist, not on any static or runtime containment, until PR#20
lands.** This specific manifest's `run.sh`/entrypoint does not bind any network port (see "What it
does" above), so the network-exposure scenario PR#20 is chiefly about does not apply here today —
but the general absence of sandboxing does, same as every other Binary manifest.
