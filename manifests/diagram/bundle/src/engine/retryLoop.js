"use strict";

const { buildSystemPrompt, buildInitialPrompt, buildCorrectionPrompt } = require("../llm/diagramPrompt");
const { extractDsl } = require("../llm/extractDsl");

/**
 * generateAndRender({ description, engine, llmClient, renderer, outImagePath, maxAttempts,
 *                      model, initialTemperature, correctionTemperature })
 *   -> Promise<{ success: boolean, attempts: Attempt[] }>
 *
 * This IS the demo's core feature: render the LLM's DSL output with a real, deterministic
 * renderer; if the renderer reports a syntax error, feed that EXACT error text back to the
 * LLM (verbatim, via buildCorrectionPrompt — never paraphrased) and ask it to fix its own
 * source, up to maxAttempts total render attempts (attempt 1 counts toward the cap, this is
 * not "retries on top of 1").
 *
 * Attempt = {
 *   attempt: number,               // 1-based
 *   promptKind: "initial" | "correction",
 *   userPrompt: string,            // exact prompt text sent to the LLM this attempt
 *   dslSource: string,             // exact DSL text extracted from the LLM response
 *   renderer: { ok: true, imagePath } | { ok: false, error },
 * }
 */
async function generateAndRender({
  description,
  engine,
  llmClient,
  renderer,
  outImagePath,
  maxAttempts = 3,
  model,
  initialTemperature = 0.7,
  correctionTemperature = 0.2,
} = {}) {
  if (!description || !description.trim()) {
    throw new Error("generateAndRender: description is required");
  }
  if (!llmClient || typeof llmClient.chat !== "function") {
    throw new Error("generateAndRender: llmClient with a chat() method is required");
  }
  if (!renderer || typeof renderer.render !== "function") {
    throw new Error("generateAndRender: renderer with a render() method is required");
  }
  if (!outImagePath) {
    throw new Error("generateAndRender: outImagePath is required");
  }

  const system = buildSystemPrompt(engine);
  const attempts = [];
  let prevDsl = null;
  let prevError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const promptKind = attempt === 1 ? "initial" : "correction";
    const userPrompt =
      promptKind === "initial"
        ? buildInitialPrompt(description, engine)
        : buildCorrectionPrompt(engine, prevDsl, prevError);

    // Deliberately sequential (not Promise.all) — each attempt depends on the previous
    // attempt's renderer error.
    const raw = await llmClient.chat({
      model,
      system,
      user: userPrompt,
      temperature: promptKind === "initial" ? initialTemperature : correctionTemperature,
    });
    const dslSource = extractDsl(raw);

    const result = await renderer.render(dslSource, outImagePath);

    attempts.push({ attempt, promptKind, userPrompt, dslSource, renderer: result });

    if (result.ok) {
      return { success: true, attempts };
    }

    prevDsl = dslSource;
    prevError = result.error;
  }

  return { success: false, attempts };
}

module.exports = { generateAndRender };
