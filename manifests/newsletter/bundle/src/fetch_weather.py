"""Real HTTP client for the Open-Meteo forecast API.

No API key required. Docs: https://open-meteo.com/en/docs

This module does exactly one thing: fetch raw JSON from a real, live,
third-party API and hand it back unmodified (plus a sha256 of the raw
bytes, for provenance in run-manifest.json). No numbers are invented,
smoothed, or estimated here -- that would defeat the point of the demo.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

DEFAULT_DAILY_VARS = (
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
)


class FetchError(RuntimeError):
    """Raised when the Open-Meteo API cannot be reached or returns bad data."""


@dataclass
class FetchResult:
    raw_json: dict[str, Any]
    raw_bytes: bytes
    source_url: str
    sha256: str
    fetched_at: str


def build_url(
    base_url: str,
    latitude: float,
    longitude: float,
    timezone: str,
    forecast_days: int,
    daily_vars: tuple[str, ...] = DEFAULT_DAILY_VARS,
) -> str:
    params = (
        f"latitude={latitude}&longitude={longitude}"
        f"&daily={','.join(daily_vars)}"
        f"&timezone={timezone.replace('/', '%2F')}"
        f"&forecast_days={forecast_days}"
    )
    return f"{base_url}?{params}"


def fetch_forecast(
    base_url: str,
    latitude: float,
    longitude: float,
    timezone: str,
    forecast_days: int,
    daily_vars: tuple[str, ...] = DEFAULT_DAILY_VARS,
    session: requests.Session | None = None,
    timeout: float = 15.0,
) -> FetchResult:
    """Fetch one real forecast from Open-Meteo. Raises FetchError on any
    non-200 response, network failure, or schema surprise."""
    url = build_url(base_url, latitude, longitude, timezone, forecast_days, daily_vars)
    sess = session or requests.Session()
    try:
        resp = sess.get(url, timeout=timeout)
    except requests.RequestException as exc:
        raise FetchError(f"network error fetching {url}: {exc}") from exc

    if resp.status_code != 200:
        raise FetchError(f"Open-Meteo returned HTTP {resp.status_code} for {url}: {resp.text[:500]}")

    raw_bytes = resp.content
    try:
        raw_json = resp.json()
    except ValueError as exc:
        raise FetchError(f"Open-Meteo response was not valid JSON: {exc}") from exc

    validate_schema(raw_json, forecast_days, daily_vars)

    return FetchResult(
        raw_json=raw_json,
        raw_bytes=raw_bytes,
        source_url=url,
        sha256=hashlib.sha256(raw_bytes).hexdigest(),
        fetched_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    )


def validate_schema(raw_json: dict[str, Any], forecast_days: int, daily_vars: tuple[str, ...]) -> None:
    """Fail loudly if the response doesn't have the shape we depend on,
    rather than silently propagating bad/missing data downstream."""
    if "daily" not in raw_json:
        raise FetchError(f"Open-Meteo response missing 'daily' key: {list(raw_json.keys())}")
    daily = raw_json["daily"]
    if "time" not in daily:
        raise FetchError("Open-Meteo 'daily' block missing 'time' array")
    n = len(daily["time"])
    if n != forecast_days:
        raise FetchError(f"expected {forecast_days} daily entries, got {n}")
    for var in daily_vars:
        if var not in daily:
            raise FetchError(f"Open-Meteo 'daily' block missing expected variable '{var}'")
        if len(daily[var]) != n:
            raise FetchError(f"variable '{var}' has {len(daily[var])} entries, expected {n}")


def save_raw(result: FetchResult, out_dir: Path, run_id: str) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{run_id}.json"
    path.write_text(json.dumps(result.raw_json, indent=2, sort_keys=True))
    return path
