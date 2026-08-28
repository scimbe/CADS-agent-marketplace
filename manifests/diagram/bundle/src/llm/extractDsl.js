"use strict";

// Strips ONE leading/trailing fenced code block, e.g. ```mermaid\n...\n``` or
// ```dot\n...\n``` or a bare ```\n...\n```. Mirrors CADS-DEMO-codereview's
// FENCED_BLOCK_RE — models routinely ignore a "no fences" instruction, so the
// extractor tolerates the fence rather than trusting the prompt alone.
const FENCED_BLOCK_RE = /^```(?:[a-zA-Z0-9_-]*)\s*\n?([\s\S]*?)\s*```$/;

/**
 * extractDsl(raw) -> string
 * Trims the raw LLM response and, if the whole thing is wrapped in a single fenced code
 * block, unwraps it. Does not attempt to strip inline commentary outside a fence — if the
 * model adds prose the renderer will reject it and the retry loop will feed that exact
 * error back, which is the intended behavior (the DSL contract is enforced by the render
 * step, not guessed at here).
 */
function extractDsl(raw) {
  const trimmed = String(raw ?? "").trim();
  const match = FENCED_BLOCK_RE.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

module.exports = { extractDsl };
