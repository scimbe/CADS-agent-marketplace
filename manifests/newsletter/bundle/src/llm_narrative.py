"""LLM call: the ONLY place the model is allowed to touch the report.

The model's job is strictly limited to (a) picking which pre-computed
highlights matter to a business reader and (b) writing the connecting
prose. It receives the facts payload as data and is never asked to
compute, look up, or estimate a number itself. `narrative_guard.py`
re-checks its output before it is trusted; this module owns the
call + one retry, and the deterministic non-LLM fallback if both the
original call and the retry fail the guard.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from openai import OpenAI

from . import narrative_guard

PROMPT_PATH = Path(__file__).parent / "prompt" / "narrative_system_prompt.txt"

RETRY_REMINDER = (
    "\n\nIMPORTANT: your previous reply used at least one number that does not "
    "appear in the facts payload. Re-read the hard rules: use ONLY numbers "
    "copied from the 'days' or 'highlights' arrays above (rounded to at most "
    "1 decimal). Do not introduce any other number."
)


@dataclass
class NarrativeOutcome:
    narrative: str
    selected_highlight_ids: list[str]
    used_llm: bool
    llm_fallback_used: bool
    attempts: int
    raw_responses: list[str]
    request_ids: list[str]
    guard_reason: str


def _system_prompt() -> str:
    return PROMPT_PATH.read_text()


def _call_model(client: OpenAI, model: str, system_prompt: str, facts_json: str, temperature: float, max_tokens: int) -> tuple[str, str]:
    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"facts = {facts_json}"},
        ],
    )
    content = resp.choices[0].message.content or ""
    request_id = getattr(resp, "id", "") or ""
    return content, request_id


def _parse_reply(content: str) -> tuple[list[str], str]:
    text = content.strip()
    # tolerate accidental markdown fences despite the instruction not to use them
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    data = json.loads(text)
    ids = list(data["selected_highlight_ids"])
    narrative = str(data["narrative"])
    return ids, narrative


def _deterministic_fallback(facts: dict[str, Any]) -> tuple[list[str], str]:
    """Non-LLM safety net: a templated sentence built only from the top-2
    highlights, so a guard failure never blocks report generation -- it
    just becomes an observable, testable fallback instead of a silent
    correctness bug."""
    highlights = facts.get("highlights", [])[:2]
    ids = [h["id"] for h in highlights]
    parts = [f"{h['label'].lower()} of {h['value']}{h['unit']}" for h in highlights]
    if parts:
        narrative = "This week's briefing highlights the " + " and the ".join(parts) + "."
    else:
        narrative = "No highlights were available for this reporting period."
    return ids, narrative


def generate_narrative(
    facts: dict[str, Any],
    api_base: str,
    api_key: str,
    model: str,
    temperature: float = 0.2,
    max_tokens: int = 400,
) -> NarrativeOutcome:
    client = OpenAI(base_url=api_base, api_key=api_key)
    system_prompt = _system_prompt()
    facts_json = json.dumps(facts, sort_keys=True)

    raw_responses: list[str] = []
    request_ids: list[str] = []
    fallback_reason = "LLM output failed the narrative guard twice"

    for attempt in (1, 2):
        prompt = system_prompt if attempt == 1 else system_prompt + RETRY_REMINDER
        try:
            content, request_id = _call_model(client, model, prompt, facts_json, temperature, max_tokens)
        except Exception as exc:  # network / API failure -> go straight to fallback
            raw_responses.append(f"<error: {exc}>")
            request_ids.append("")
            fallback_reason = f"LLM call raised an exception: {exc}"
            break

        raw_responses.append(content)
        request_ids.append(request_id)

        try:
            ids, narrative = _parse_reply(content)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            fallback_reason = f"LLM reply was not valid JSON in the expected shape: {exc}"
            continue  # try the retry-with-reminder attempt

        result = narrative_guard.check_narrative(narrative, facts)
        if result.ok:
            return NarrativeOutcome(
                narrative=narrative,
                selected_highlight_ids=ids,
                used_llm=True,
                llm_fallback_used=False,
                attempts=attempt,
                raw_responses=raw_responses,
                request_ids=request_ids,
                guard_reason=result.reason,
            )
        fallback_reason = result.reason
        # loop again for attempt 2 (stricter reminder); after attempt 2 falls
        # through to the deterministic fallback below.

    ids, narrative = _deterministic_fallback(facts)
    return NarrativeOutcome(
        narrative=narrative,
        selected_highlight_ids=ids,
        used_llm=False,
        llm_fallback_used=True,
        attempts=len(raw_responses),
        raw_responses=raw_responses,
        request_ids=request_ids,
        guard_reason=fallback_reason,
    )
