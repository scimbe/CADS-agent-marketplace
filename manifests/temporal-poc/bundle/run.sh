#!/usr/bin/env bash
# Binary-kind entrypoint for the temporal-poc manifest.
#
# installer-engine's process::run_bounded execs this directly (mark_executable chmod +x's it,
# then runs it as `program` with args=[]) with CWD already set to the run's own work_dir, and a
# SCRUBBED environment: env_clear() wipes everything, then only PATH is re-added plus whatever
# this manifest's env_template resolved (see manifest.json -- RENDER_HOLD_SECONDS is the only
# one, optional). Concretely this means NO $HOME, NO $USER, nothing else ambient -- so this
# script sets its own HOME before doing anything that might expand it (pip's cache dir, a venv,
# etc.), rather than assuming one exists. Two real host prerequisites are checked explicitly and
# failed closed on, rather than silently attempted and producing a confusing downstream error:
# `python3` (3.10+, with the stdlib `venv` module) and the real Temporal CLI (`temporal`) already
# on PATH -- this manifest does not install either, exactly like the llm-node manifest doesn't
# install ct-agent or Ollama itself (see its README's "Prerequisite" section). Bundling/installing
# the Temporal CLI here would mean shipping or downloading a ~140MB platform-specific binary on
# every activation, which is a materially different, heavier thing than "run once, produce
# output, exit" -- see this manifest's own README for the full reasoning.
set -uo pipefail

# CWD is already this bundle's own unpacked directory (installer-engine's opts.work_dir) -- every
# relative path below (poc/, scripts/) resolves against it directly, no BASH_SOURCE tricks needed.
export HOME="$(pwd)"

echo "--- preflight: checking host prerequisites ---"
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 not found on PATH -- this manifest needs Python 3.10+ with the stdlib 'venv' module. Not installed by this manifest; see README.md's Prerequisites section." >&2
  exit 1
fi
PYVER="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
echo "python3: $(command -v python3) (version $PYVER)"

if ! command -v temporal >/dev/null 2>&1; then
  echo "ERROR: 'temporal' CLI not found on PATH -- this manifest needs the real Temporal CLI (temporal server start-dev / operator / workflow subcommands). Not installed by this manifest (it is a large, platform-specific binary -- see README.md's Prerequisites section for the one-line install)." >&2
  exit 1
fi
echo "temporal: $(command -v temporal) ($(temporal --version 2>&1 | head -1))"

echo "--- setting up an isolated Python venv in $(pwd)/.venv ---"
python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q --disable-pip-version-check -r poc/requirements.txt
echo "venv ready: $(python3 --version), temporalio=$(python3 -c 'import temporalio; print(temporalio.__version__)' 2>/dev/null || echo '?')"

echo "--- running the real kill-a-worker demo (scripts/run_demo.sh) ---"
# run_demo.sh computes REPO_ROOT from its own BASH_SOURCE (dirname .. ), which resolves to this
# same work_dir since the bundle's scripts/ directory is laid out identically to the upstream
# CADS-DEMO-temporal-poc repo -- so its relative references to poc/, evidence/, .venv/ all still
# land in the right place. It starts a real local Temporal dev server, creates a namespace, starts
# a worker, starts the workflow, SIGKILLs the worker mid-activity, waits past the heartbeat
# timeout, starts a second worker, waits for completion, writes real evidence/ files, and runs its
# own acceptance check (scripts/check_acceptance.py) -- exiting non-zero if any of that didn't
# genuinely happen. RENDER_HOLD_SECONDS (optional env_template entry) is already present in this
# process's environment if the installer resolved it -- run_demo.sh's own `${RENDER_HOLD_SECONDS:-8}`
# picks it up with no extra plumbing needed here; its default (8s) applies otherwise.
bash scripts/run_demo.sh
DEMO_EXIT=$?

echo "--- run.sh exiting $DEMO_EXIT ---"
exit "$DEMO_EXIT"
