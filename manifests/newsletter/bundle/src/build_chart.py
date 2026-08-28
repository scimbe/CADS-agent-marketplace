"""Real chart rendering with matplotlib -- actual pixels, not ASCII art
described by an LLM.

Each function returns the exact numeric arrays it plotted (in
`ChartResult.plotted_data`) alongside the PNG path, so a verifier can
confirm the rendered chart's data matches the fetched/fixture data
exactly (see scripts/verify_sample.py).
"""
from __future__ import annotations

import matplotlib

matplotlib.use("Agg")  # headless: no display server in this environment

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt


@dataclass
class ChartResult:
    path: Path
    plotted_data: dict[str, list[float]]


def _dates_short(dates: list[str]) -> list[str]:
    # "2026-08-28" -> "Aug 28"
    out = []
    for d in dates:
        parts = d.split("-")
        if len(parts) == 3:
            months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            out.append(f"{months[int(parts[1])]} {int(parts[2])}")
        else:
            out.append(d)
    return out


def render_temperature_chart(days: list[dict[str, Any]], out_path: Path) -> ChartResult:
    dates = [d["date"] for d in days]
    tmax = [float(d["tmax"]) for d in days]
    tmin = [float(d["tmin"]) for d in days]
    labels = _dates_short(dates)

    fig, ax = plt.subplots(figsize=(7, 3.5), dpi=150)
    ax.plot(labels, tmax, marker="o", color="#c0392b", label="Daily high (°C)")
    ax.plot(labels, tmin, marker="o", color="#2980b9", label="Daily low (°C)")
    ax.fill_between(range(len(labels)), tmin, tmax, color="#f0f0f0", alpha=0.6)
    ax.set_title("Hamburg — Daily Temperature Range")
    ax.set_ylabel("°C")
    ax.legend(loc="upper right", frameon=False)
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)

    return ChartResult(path=out_path, plotted_data={"tmax": tmax, "tmin": tmin})


def render_precipitation_chart(days: list[dict[str, Any]], out_path: Path) -> ChartResult:
    dates = [d["date"] for d in days]
    precip = [float(d["precip_mm"]) for d in days]
    labels = _dates_short(dates)

    fig, ax = plt.subplots(figsize=(7, 3.5), dpi=150)
    ax.bar(labels, precip, color="#2980b9")
    ax.set_title("Hamburg — Daily Precipitation")
    ax.set_ylabel("mm")
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    fig.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path)
    plt.close(fig)

    return ChartResult(path=out_path, plotted_data={"precip_mm": precip})
