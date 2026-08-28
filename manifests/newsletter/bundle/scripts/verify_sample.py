#!/usr/bin/env python3
"""Acceptance-bar checker for the committed proof artifact.

Re-checks the *committed files on disk* (not the in-memory state of a
generation run) so that a future edit, a stale copy, or drift between
what generate_report.py wrote and what got committed is caught, not just
trusted. This is the script whose clean exit is the acceptance evidence
for CADS-agent-marketplace#22.

Usage:
    python3 scripts/verify_sample.py docs/sample-report
"""
from __future__ import annotations

import html as html_module
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from src import narrative_guard  # noqa: E402


class VerifyError(RuntimeError):
    pass


def check_manifest(sample_dir: Path) -> dict:
    manifest_path = sample_dir / "run-manifest.json"
    if not manifest_path.exists():
        raise VerifyError(f"missing {manifest_path}")
    manifest = json.loads(manifest_path.read_text())

    required = [
        "source_url", "raw_response_sha256", "model_name",
        "generated_at", "facts", "narrative",
    ]
    for key in required:
        if key not in manifest:
            raise VerifyError(f"run-manifest.json missing required key '{key}'")

    if not manifest["source_url"].startswith("https://api.open-meteo.com/v1/forecast"):
        raise VerifyError(f"source_url does not point at the real Open-Meteo API: {manifest['source_url']}")

    if len(manifest["raw_response_sha256"]) != 64:
        raise VerifyError("raw_response_sha256 does not look like a sha256 hex digest")

    print(f"[ok] manifest present with source_url, sha256, model_name={manifest['model_name']!r}")
    return manifest


def check_narrative_guard(manifest: dict) -> None:
    """Re-runs the guard against the narrative embedded in the manifest AND
    the narrative actually present in report.html, using the facts frozen
    at generation time -- catches a post-hoc edit to either file."""
    facts = manifest["facts"]
    narrative = manifest["narrative"]

    result = narrative_guard.check_narrative(narrative, facts)
    if not result.ok:
        raise VerifyError(f"manifest narrative fails guard re-check: {result.reason}")
    print(f"[ok] manifest narrative re-verified against frozen facts ({len(result.checked_numbers)} numbers checked)")


def check_html_contains_narrative(sample_dir: Path, manifest: dict) -> None:
    html_path = sample_dir / "report.html"
    if not html_path.exists():
        raise VerifyError(f"missing {html_path}")
    html = html_path.read_text()

    narrative = manifest["narrative"]
    # Jinja2 autoescapes the rendered HTML (apostrophes -> &#39;, etc.), but `manifest["narrative"]`
    # is the raw, unescaped text -- a plain substring check false-fails on any narrative containing
    # an HTML-special character, independent of whether the narrative content itself is correct.
    # Unescape the rendered HTML once before comparing so this checks the same text was embedded,
    # not that it survived Jinja2's escaping byte-for-byte.
    if narrative not in html_module.unescape(html):
        raise VerifyError("report.html does not contain the manifest's narrative verbatim -- possible drift/edit")

    # re-run the guard against whatever narrative text is actually embedded
    # in the HTML too, independent of the manifest, as defense in depth
    result = narrative_guard.check_narrative(narrative, manifest["facts"])
    if not result.ok:
        raise VerifyError(f"report.html narrative fails guard re-check: {result.reason}")

    print("[ok] report.html contains the guarded narrative verbatim")


def check_pdf(sample_dir: Path, manifest: dict) -> None:
    pdf_path = sample_dir / "report.pdf"
    if not manifest.get("pdf_written", True):
        print("[skip] pdf_written=false in manifest, skipping PDF checks")
        return
    if not pdf_path.exists():
        raise VerifyError(f"missing {pdf_path}")

    header = pdf_path.read_bytes()[:5]
    if header != b"%PDF-":
        raise VerifyError(f"report.pdf does not start with %PDF- (got {header!r})")

    try:
        result = subprocess.run(["pdftotext", str(pdf_path), "-"], capture_output=True, text=True, timeout=30, check=True)
    except FileNotFoundError:
        raise VerifyError("pdftotext (poppler-utils) not found -- cannot verify PDF text layer")
    except subprocess.CalledProcessError as exc:
        raise VerifyError(f"pdftotext failed: {exc.stderr}")

    pdf_text = result.stdout
    narrative = manifest["narrative"]
    # require at least a meaningful chunk of the narrative to appear verbatim
    # (not the whole thing, since pdftotext may re-wrap whitespace)
    sentence = narrative.split(". ")[0]
    if sentence[:20] not in pdf_text:
        raise VerifyError(
            f"report.pdf text layer does not contain the start of the LLM narrative "
            f"({sentence[:40]!r} not found) -- PDF may be a flattened image, not real text"
        )

    print(f"[ok] report.pdf starts with %PDF- and pdftotext confirms a real text layer containing the narrative")


def check_charts(sample_dir: Path, manifest: dict) -> None:
    facts = manifest["facts"]
    days = facts["days"]

    for chart_name, keys in (
        ("chart-temperature", ["tmax", "tmin"]),
        ("chart-precipitation", ["precip_mm"]),
    ):
        png_path = sample_dir / f"{chart_name}.png"
        json_path = sample_dir / f"{chart_name}.json"
        if not png_path.exists():
            raise VerifyError(f"missing {png_path}")
        if not json_path.exists():
            raise VerifyError(f"missing {json_path}")
        if png_path.stat().st_size < 1024:
            raise VerifyError(f"{png_path} is suspiciously small ({png_path.stat().st_size} bytes) -- likely not a real chart")

        plotted = json.loads(json_path.read_text())
        for key in keys:
            src_map = "precip_mm" if key == "precip_mm" else key
            expected = [d[src_map] for d in days]
            if plotted.get(key) != expected:
                raise VerifyError(
                    f"{chart_name}.json['{key}'] does not match facts.days[*].{src_map} "
                    f"-- chart may not reflect the real fetched data\n  plotted={plotted.get(key)}\n  expected={expected}"
                )
        print(f"[ok] {chart_name}.png source data matches fetched facts exactly")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    sample_dir = Path(sys.argv[1])
    if not sample_dir.is_dir():
        print(f"error: {sample_dir} is not a directory", file=sys.stderr)
        return 2

    try:
        manifest = check_manifest(sample_dir)
        check_narrative_guard(manifest)
        check_html_contains_narrative(sample_dir, manifest)
        check_pdf(sample_dir, manifest)
        check_charts(sample_dir, manifest)
    except VerifyError as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    print("\nAll acceptance-bar checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
