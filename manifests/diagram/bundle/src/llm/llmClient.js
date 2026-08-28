"use strict";

/**
 * OpenAI-chat-completions-compatible HTTP client. Fetch-based (Node 18+ global fetch), no
 * SDK dependency. Reads LITELLM_BASE_URL / LITELLM_API_KEY / LITELLM_DEFAULT_MODEL from the
 * given env object (defaults to process.env). Provider-swap (litellm-proxy, a raw local
 * Ollama OpenAI-compatible endpoint, or a future Anthropic/Google-routed litellm model) is
 * purely an env-var edit — no other module reads a provider-specific env var.
 *
 * Adapted from CADS-DEMO-codereview's src/llm/llmClient.js. One deliberate behavioral
 * change from that precedent: this demo's LLM output is Mermaid/Graphviz DSL *source text*,
 * never JSON, so `chat()` here does NOT send `response_format: { type: "json_object" }`
 * (the codereview client hardcodes that field because its callers all want JSON back).
 * Forcing JSON mode on a DSL-generation prompt would actively fight the task — the model
 * would have to escape the diagram source into a JSON string instead of emitting it
 * directly. `chatJSON` is dropped entirely for the same reason: nothing in this repo wants
 * JSON out of the LLM.
 */

const REQUIRED_ENV_VARS = ["LITELLM_BASE_URL", "LITELLM_API_KEY", "LITELLM_DEFAULT_MODEL"];
const REQUEST_TIMEOUT_MS = 60000;

class LlmHttpError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "LlmHttpError";
    this.status = status;
    this.body = body;
  }
}

/**
 * createLlmClient(env = process.env) -> { chat, baseUrl, defaultModel }
 *
 * Fails fast — throws a plain Error naming every missing/empty required var (not just the
 * first) if any are absent. No silent default: a wrong silent default would mean talking to
 * the wrong provider without anyone noticing.
 *
 * baseUrl is the env value with exactly one trailing "/" trimmed. The caller (the deployment's
 * .env) is responsible for baseUrl already including any provider-specific path prefix — the
 * litellm-proxy convention is to include "/v1". This client does not guess or append one.
 */
function createLlmClient(env = process.env) {
  const missing = REQUIRED_ENV_VARS.filter((name) => {
    const value = env[name];
    return value === undefined || value === null || String(value).trim() === "";
  });
  if (missing.length > 0) {
    throw new Error(
      `createLlmClient: missing required environment variable(s): ${missing.join(", ")}`
    );
  }

  const baseUrl = String(env.LITELLM_BASE_URL).replace(/\/+$/, "");
  const apiKey = String(env.LITELLM_API_KEY);
  const defaultModel = String(env.LITELLM_DEFAULT_MODEL);

  /**
   * chat({ model, system, user, temperature = 0, maxTokens = 2000 }) -> Promise<string>
   * POSTs `${baseUrl}/chat/completions`. Returns choices[0].message.content as a raw string.
   * Throws LlmHttpError on non-2xx, network error, or a 60s abort/timeout — always carrying
   * `status` (undefined for network error/timeout) and a `body` string truncated to 500 chars.
   *
   * Deliberately does NOT send response_format — see module docstring.
   */
  async function chat({ model, system, user, temperature = 0, maxTokens = 2000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model ?? defaultModel,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
          signal: controller.signal,
        });
      } catch (err) {
        // Network error, DNS failure, connection refused, or our own AbortController firing
        // on timeout all land here — none of them have an HTTP status.
        throw new LlmHttpError(`LLM request failed: network error`, {
          status: undefined,
          body: String(err && err.message ? err.message : err).slice(0, 500),
        });
      }

      const bodyText = await response.text().catch(() => "");

      if (!response.ok) {
        throw new LlmHttpError(`LLM request failed: ${response.status}`, {
          status: response.status,
          body: bodyText.slice(0, 500),
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        throw new LlmHttpError(`LLM request failed: ${response.status}`, {
          status: response.status,
          body: `response body was not valid JSON: ${bodyText}`.slice(0, 500),
        });
      }

      const content = parsed?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new LlmHttpError(`LLM request failed: ${response.status}`, {
          status: response.status,
          body: `response missing choices[0].message.content: ${bodyText}`.slice(0, 500),
        });
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  return { chat, baseUrl, defaultModel };
}

module.exports = { createLlmClient, LlmHttpError };
