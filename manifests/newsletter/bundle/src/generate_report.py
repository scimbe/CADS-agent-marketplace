"""Orchestrator CLI: real fetch -> facts -> chart -> LLM narrative -> HTML/PDF.

    python3 -m src.generate_report --out docs/sample-report --pdf

This module wires the other modules together; it deliberately contains
no business logic of its own beyond argument parsing, run bookkeeping,
and writing run-manifest.json (the provenance record that
scripts/verify_sample.py re-checks against the committed artifact).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

import yaml

from . import build_chart, facts as facts_mod, fetch_weather, llm_narrative, render_report

ROOT = Path(__file__).parent.parent


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (no external dependency): sets os.environ for
    any KEY=VALUE line not already present in the environment. Lines
    starting with # are comments; blank lines are skipped."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_config(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text())


def run(out_dir: Path, write_pdf: bool, config_path: Path, dotenv_path: Path) -> dict[str, Any]:
    load_dotenv(dotenv_path)
    cfg = load_config(config_path)

    loc = cfg["location"]
    fc = cfg["forecast"]
    api_cfg = cfg["api"]
    llm_cfg = cfg["llm"]
    out_cfg = cfg["output"]

    daily_vars = tuple(fc["daily_vars"])

    # --- 1. real fetch ---
    fetch_result = fetch_weather.fetch_forecast(
        base_url=api_cfg["base_url"],
        latitude=loc["latitude"],
        longitude=loc["longitude"],
        timezone=loc["timezone"],
        forecast_days=fc["days"],
        daily_vars=daily_vars,
    )
    run_id = time.strftime("%Y%m%d-%H%M%S")
    raw_dir = ROOT / "data" / "raw"
    fetch_weather.save_raw(fetch_result, raw_dir, run_id)

    # --- 2. deterministic facts (no LLM) ---
    computed = facts_mod.compute_facts(
        fetch_result.raw_json,
        location_name=loc["name"],
        latitude=loc["latitude"],
        longitude=loc["longitude"],
        source_url=fetch_result.source_url,
    )
    facts_dict = computed.to_dict()

    # --- 3. real charts ---
    out_dir.mkdir(parents=True, exist_ok=True)
    temp_chart = build_chart.render_temperature_chart(facts_dict["days"], out_dir / "chart-temperature.png")
    precip_chart = build_chart.render_precipitation_chart(facts_dict["days"], out_dir / "chart-precipitation.png")
    (out_dir / "chart-temperature.json").write_text(json.dumps(temp_chart.plotted_data, indent=2))
    (out_dir / "chart-precipitation.json").write_text(json.dumps(precip_chart.plotted_data, indent=2))

    # --- 4. LLM narrative (facts-only, guarded) ---
    api_base = os.environ.get("LITELLM_API_BASE") or os.environ.get("LITELLM_BASE_URL")
    api_key = os.environ.get("LITELLM_API_KEY")
    model = os.environ.get("LITELLM_MODEL") or os.environ.get("LITELLM_DEFAULT_MODEL") or llm_cfg["model"]
    if not api_base or not api_key:
        raise RuntimeError(
            "LITELLM_API_BASE/LITELLM_BASE_URL and LITELLM_API_KEY must be set (via .env or environment) "
            "to call the LLM for narrative generation."
        )

    outcome = llm_narrative.generate_narrative(
        facts_dict,
        api_base=api_base,
        api_key=api_key,
        model=model,
        temperature=llm_cfg.get("temperature", 0.2),
        max_tokens=llm_cfg.get("max_tokens", 400),
    )

    selected = [h for h in facts_dict["highlights"] if h["id"] in outcome.selected_highlight_ids]
    if not selected:
        selected = facts_dict["highlights"][:3]

    # --- 5. real HTML + PDF ---
    html = render_report.render_html(
        facts=facts_dict,
        selected_highlights=selected,
        narrative=outcome.narrative,
        report_title=out_cfg["report_title"],
        model_name=model if outcome.used_llm else f"{model} (fallback template, guard failed)",
        llm_fallback_used=outcome.llm_fallback_used,
        chart_temperature_path="chart-temperature.png",
        chart_precipitation_path="chart-precipitation.png",
    )
    html_path = out_dir / "report.html"
    html_path.write_text(html)

    pdf_path = out_dir / "report.pdf"
    if write_pdf:
        render_report.render_pdf(html_path, pdf_path)

    # --- 6. manifest (provenance for scripts/verify_sample.py) ---
    manifest = {
        "run_id": run_id,
        "generated_at": facts_dict["generated_at"],
        "source_url": fetch_result.source_url,
        "raw_response_sha256": fetch_result.sha256,
        "fetched_at": fetch_result.fetched_at,
        "model_name": model,
        "llm_used": outcome.used_llm,
        "llm_fallback_used": outcome.llm_fallback_used,
        "llm_attempts": outcome.attempts,
        "llm_request_ids": outcome.request_ids,
        "guard_reason": outcome.guard_reason,
        "selected_highlight_ids": outcome.selected_highlight_ids,
        "narrative": outcome.narrative,
        "facts": facts_dict,
        "pdf_written": write_pdf,
    }
    manifest_path = out_dir / "run-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "docs" / "sample-report")
    parser.add_argument("--pdf", action="store_true", help="also render report.pdf via headless Chrome")
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "report.yaml")
    parser.add_argument("--dotenv", type=Path, default=ROOT / ".env")
    args = parser.parse_args()

    manifest = run(args.out, args.pdf, args.config, args.dotenv)
    print(json.dumps({
        "run_id": manifest["run_id"],
        "llm_used": manifest["llm_used"],
        "llm_fallback_used": manifest["llm_fallback_used"],
        "pdf_written": manifest["pdf_written"],
        "out_dir": str(args.out),
    }, indent=2))


if __name__ == "__main__":
    main()
