"""Enforces the 'LLM does not invent numbers' contract.

This module is deliberately independent of the LLM call: it takes any
narrative string and a facts dict (the exact JSON payload the LLM was
given) and verifies that every numeric token in the narrative is one
of:

  1. a real value taken from facts['days'][*] or facts['highlights'][*]
     (within an absolute tolerance, to allow for LLM rounding), or
  2. a small, fixed "structural" allowlist: the number of days in the
     report (e.g. "a 7-day outlook"), or a day-of-month digit that
     appears verbatim in one of the report's dates (e.g. "on the 28th").

Any other number in the narrative is treated as a fabrication and the
guard fails. This is what makes "the LLM doesn't invent data" a checked
contract instead of a prompt-only promise -- see generate_report.py for
the retry-then-deterministic-fallback behaviour when the guard fails.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# (?<!\d) before the optional "-" stops a hyphen inside a larger digit run (e.g. the "-08-28" in
# an ISO date "2026-08-28") from being read as a minus sign -- without it, that one date fragment
# parses as three tokens (2026, -8, -28), with the negative pair almost never in `facts` and
# therefore an almost-guaranteed guard failure any time the narrative embeds a raw ISO date.
# A genuine negative number (e.g. a below-freezing "-3" degrees) still matches correctly, since it
# is preceded by whitespace/punctuation, never another digit.
_NUMBER_RE = re.compile(r"(?<!\d)-?\d+(?:\.\d+)?")

ABS_TOL = 0.05


@dataclass
class GuardResult:
    ok: bool
    checked_numbers: list[float] = field(default_factory=list)
    violations: list[float] = field(default_factory=list)

    @property
    def reason(self) -> str:
        if self.ok:
            return "all numeric tokens in narrative are grounded in facts"
        return f"unverified number(s) in narrative: {self.violations}"


def _allowed_values(facts: dict[str, Any]) -> set[float]:
    values: set[float] = set()
    for day in facts.get("days", []):
        for key in ("tmax", "tmin", "precip_mm", "wind_max_kmh"):
            if key in day:
                values.add(round(float(day[key]), 1))
    for h in facts.get("highlights", []):
        if "value" in h:
            values.add(round(float(h["value"]), 1))
    return values


def _structural_allowed(facts: dict[str, Any]) -> set[float]:
    structural: set[float] = set()
    days = facts.get("days", [])
    structural.add(float(len(days)))
    for day in days:
        date = day.get("date", "")
        # "2026-08-28" -> day-of-month 28, month 8, year 2026 -- all three are structural facts a
        # narrative may legitimately restate verbatim (e.g. if it embeds the raw ISO date instead
        # of natural-language phrasing), not fabricated numbers.
        parts = date.split("-")
        if len(parts) == 3:
            try:
                structural.add(float(int(parts[2])))  # day of month, e.g. 28
                structural.add(float(int(parts[1])))  # month number, e.g. 8
                structural.add(float(int(parts[0])))  # year, e.g. 2026
            except ValueError:
                pass
    return structural


def _is_close(x: float, allowed: set[float], tol: float = ABS_TOL) -> bool:
    return any(abs(x - a) <= tol for a in allowed)


def check_narrative(narrative: str, facts: dict[str, Any]) -> GuardResult:
    """Returns a GuardResult. Does not raise -- callers decide policy
    (retry / fallback) based on `.ok`."""
    allowed = _allowed_values(facts)
    structural = _structural_allowed(facts)

    checked: list[float] = []
    violations: list[float] = []

    for match in _NUMBER_RE.finditer(narrative):
        token = match.group(0)
        try:
            value = float(token)
        except ValueError:
            continue
        checked.append(value)
        rounded = round(value, 1)
        if _is_close(rounded, allowed) or rounded in structural or value in structural:
            continue
        violations.append(value)

    return GuardResult(ok=not violations, checked_numbers=checked, violations=violations)
