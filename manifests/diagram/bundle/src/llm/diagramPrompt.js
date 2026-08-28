"use strict";

/**
 * Prompt builders for the diagram-generation retry loop. Kept as pure string functions
 * (no LLM calls here) so they're trivially unit-testable and so retryLoop.test.js can
 * assert on their exact output without a network call.
 */

const ENGINE_LABEL = { mermaid: "Mermaid", graphviz: "Graphviz (DOT language)" };

function engineLabel(engine) {
  const label = ENGINE_LABEL[engine];
  if (!label) throw new Error(`buildSystemPrompt: unknown engine "${engine}"`);
  return label;
}

/**
 * buildSystemPrompt(engine) -> string
 * Sets the model's role and output contract: DSL source only, no fences, no commentary.
 */
function buildSystemPrompt(engine) {
  const label = engineLabel(engine);
  return [
    `You are a diagramming assistant. You write ${label} diagram source code from a`,
    `natural-language description of a system or process.`,
    ``,
    `Output rules (must follow exactly):`,
    `- Output ONLY the raw ${label} source. No markdown code fences, no explanation,`,
    `  no commentary before or after.`,
    `- The output must be syntactically valid ${label} source that a real ${label}`,
    `  renderer can parse without error.`,
    `- Any text taken from the description that becomes a node or edge label must be`,
    `  properly quoted/escaped so that literal characters in that text (such as | { } [ ]`,
    `  " or newlines) cannot be mistaken for ${label} syntax delimiters.`,
  ].join("\n");
}

/**
 * buildInitialPrompt(description, engine) -> string
 * The first-attempt user prompt: just the raw description plus the engine reminder.
 */
function buildInitialPrompt(description, engine) {
  const label = engineLabel(engine);
  return [
    `Write ${label} diagram source for the following description:`,
    ``,
    description.trim(),
  ].join("\n");
}

/**
 * buildCorrectionPrompt(engine, prevDsl, rendererError) -> string
 * The retry-attempt user prompt. Must include the LITERAL previous DSL source and the
 * LITERAL renderer error string — this is the load-bearing part of the feature: the model
 * sees exactly what it wrote and exactly what the real renderer said was wrong with it,
 * with no paraphrasing or summarizing in between.
 */
function buildCorrectionPrompt(engine, prevDsl, rendererError) {
  const label = engineLabel(engine);
  return [
    `The ${label} source you wrote failed to render. Here is exactly what you wrote:`,
    ``,
    "```",
    prevDsl,
    "```",
    ``,
    `Here is the exact error the ${label} renderer reported:`,
    ``,
    "```",
    rendererError,
    "```",
    ``,
    `Fix the source so it renders without error, while still matching the original`,
    `description as closely as possible. Output ONLY the corrected raw ${label} source —`,
    `no markdown code fences, no explanation.`,
  ].join("\n");
}

module.exports = { buildSystemPrompt, buildInitialPrompt, buildCorrectionPrompt };
