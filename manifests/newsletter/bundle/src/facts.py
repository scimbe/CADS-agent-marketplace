"""Deterministic, LLM-free computation of the 'facts' contract.

This is the single source of truth for every number that can legally
appear in the generated narrative or on the charts. No LLM call happens
in this module -- it is pure arithmetic over the fetched JSON, so its
output is reproducible and independently checkable.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DayFacts:
    date: str
    tmax: float
    tmin: float
    precip_mm: float
    wind_max_kmh: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "date": self.date,
            "tmax": self.tmax,
            "tmin": self.tmin,
            "precip_mm": self.precip_mm,
            "wind_max_kmh": self.wind_max_kmh,
        }


@dataclass
class Highlight:
    id: str
    label: str
    value: float
    unit: str
    date: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = {"id": self.id, "label": self.label, "value": self.value, "unit": self.unit}
        if self.date is not None:
            d["date"] = self.date
        return d


@dataclass
class Facts:
    location: str
    source_url: str
    generated_at: str
    days: list[DayFacts] = field(default_factory=list)
    highlights: list[Highlight] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "location": self.location,
            "source_url": self.source_url,
            "generated_at": self.generated_at,
            "days": [d.to_dict() for d in self.days],
            "highlights": [h.to_dict() for h in self.highlights],
        }


def _round1(x: float) -> float:
    return round(x + 0.0, 1)


def compute_facts(raw_json: dict[str, Any], location_name: str, latitude: float, longitude: float, source_url: str) -> Facts:
    daily = raw_json["daily"]
    dates = daily["time"]
    tmax = daily["temperature_2m_max"]
    tmin = daily["temperature_2m_min"]
    precip = daily["precipitation_sum"]
    wind = daily["wind_speed_10m_max"]

    grid_lat = raw_json.get("latitude", latitude)
    grid_lon = raw_json.get("longitude", longitude)

    days = [
        DayFacts(
            date=dates[i],
            tmax=_round1(tmax[i]),
            tmin=_round1(tmin[i]),
            precip_mm=_round1(precip[i]),
            wind_max_kmh=_round1(wind[i]),
        )
        for i in range(len(dates))
    ]

    hottest_idx = max(range(len(days)), key=lambda i: tmax[i])
    coldest_idx = min(range(len(days)), key=lambda i: tmin[i])
    wettest_idx = max(range(len(days)), key=lambda i: precip[i])
    windiest_idx = max(range(len(days)), key=lambda i: wind[i])

    week_avg_tmax = _round1(sum(tmax) / len(tmax))
    week_avg_tmin = _round1(sum(tmin) / len(tmin))
    total_precip = _round1(sum(precip))
    dry_days = sum(1 for p in precip if p < 1.0)

    highlights = [
        Highlight(
            id="hottest_day",
            label="Warmest day",
            value=days[hottest_idx].tmax,
            unit="°C",
            date=days[hottest_idx].date,
        ),
        Highlight(
            id="coldest_day",
            label="Coldest night",
            value=days[coldest_idx].tmin,
            unit="°C",
            date=days[coldest_idx].date,
        ),
        Highlight(
            id="wettest_day",
            label="Wettest day",
            value=days[wettest_idx].precip_mm,
            unit="mm",
            date=days[wettest_idx].date,
        ),
        Highlight(
            id="windiest_day",
            label="Windiest day",
            value=days[windiest_idx].wind_max_kmh,
            unit="km/h",
            date=days[windiest_idx].date,
        ),
        Highlight(
            id="week_avg_tmax",
            label="Average daily high",
            value=week_avg_tmax,
            unit="°C",
        ),
        Highlight(
            id="week_avg_tmin",
            label="Average overnight low",
            value=week_avg_tmin,
            unit="°C",
        ),
        Highlight(
            id="total_precip",
            label="Total precipitation this week",
            value=total_precip,
            unit="mm",
        ),
        Highlight(
            id="dry_days",
            label="Dry days (< 1mm)",
            value=float(dry_days),
            unit="days",
        ),
    ]

    return Facts(
        location=f"{location_name} ({grid_lat:.2f}N, {grid_lon:.2f}E)",
        source_url=source_url,
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        days=days,
        highlights=highlights,
    )
