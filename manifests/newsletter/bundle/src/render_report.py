"""Real HTML templating (Jinja2) + real PDF rendering (headless Chrome
print-to-pdf). No hand-built strings pretending to be a document -- this
runs an actual browser layout/print pipeline over the actual HTML file.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"


class PdfRenderError(RuntimeError):
    pass


def render_html(
    facts: dict[str, Any],
    selected_highlights: list[dict[str, Any]],
    narrative: str,
    report_title: str,
    model_name: str,
    llm_fallback_used: bool,
    chart_temperature_path: str,
    chart_precipitation_path: str,
) -> str:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "j2"]),
    )
    template = env.get_template("report.html.j2")
    return template.render(
        facts=facts,
        selected_highlights=selected_highlights,
        narrative=narrative,
        report_title=report_title,
        model_name=model_name,
        llm_fallback_used=llm_fallback_used,
        chart_temperature_path=chart_temperature_path,
        chart_precipitation_path=chart_precipitation_path,
    )


def find_chrome_binary() -> str:
    for candidate in ("google-chrome", "google-chrome-stable", "chromium-browser", "chromium"):
        path = shutil.which(candidate)
        if path:
            return path
    raise PdfRenderError("no Chrome/Chromium binary found on PATH (tried google-chrome, chromium-browser, chromium)")


def render_pdf(html_path: Path, pdf_path: Path, timeout: float = 60.0) -> None:
    """Shell out to headless Chrome to print the HTML file to a real PDF
    with an actual text layer (Chrome's print-to-pdf preserves selectable
    text, unlike a screenshot-based approach)."""
    chrome = find_chrome_binary()
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        chrome,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        f"--print-to-pdf={pdf_path}",
        "--no-pdf-header-footer",
        str(html_path),
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise PdfRenderError(f"chrome print-to-pdf timed out after {timeout}s") from exc

    if result.returncode != 0:
        raise PdfRenderError(f"chrome print-to-pdf failed (rc={result.returncode}): {result.stderr[:1000]}")
    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        raise PdfRenderError(f"chrome print-to-pdf produced no output at {pdf_path}")
