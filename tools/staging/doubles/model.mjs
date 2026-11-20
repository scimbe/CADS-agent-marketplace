// Model double for staging: answers the Anthropic Messages protocol that lib/duell-llm.mjs speaks (POST /v1/messages with
// output_config.format json_schema, POST /v1/messages/count_tokens). No model, no network: the answer is the smallest value
// that satisfies the requested JSON schema, with friendly fixed texts. Moderation answers risk 0 / no categories.
// Reachable only inside mdi-staging-net. Every call is logged as one JSON line (schema name and top-level fields).
import { createServer } from "node:http";

const TEXT = { title: "Staging-Karte", x: "Alles Gute! Ein Gruss aus dem Staging.", top: "Wenn Staging", bottom: "einfach laeuft", sub: "Ein Test aus dem Staging.", word: "" };
const NUM = { risk: 0, palette: 0 };
const ENUM = { drink: "none", st: "herz", spiel: "flug", takt: "zug" };
const ARRAY_EMPTY = new Set(["cats"]);

function gen(s, key) {
  if (!s || typeof s !== "object") return null;
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.enum)) return s.enum.includes(ENUM[key]) ? ENUM[key] : s.enum.includes(NUM[key]) ? NUM[key] : s.enum[0];
  if (s.anyOf || s.oneOf) return gen((s.anyOf || s.oneOf)[0], key);
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== "null") : s.type;
  switch (t) {
    case "object": {
      const o = {}, props = s.properties || {}, req = s.required || Object.keys(props);
      for (const k of req) o[k] = gen(props[k], k);
      return o;
    }
    case "array": {
      const n = ARRAY_EMPTY.has(key) ? 0 : Math.max(s.minItems || 0, key === "stickers" ? 1 : 0);
      return Array.from({ length: n }, (_, i) => gen(s.items, key + i));
    }
    case "string": {
      let v = TEXT[key] ?? "Staging";
      if (s.maxLength) v = v.slice(0, s.maxLength);
      if (s.minLength && v.length < s.minLength) v = v.padEnd(s.minLength, ".");
      return v;
    }
    case "integer": case "number": return NUM[key] ?? (s.minimum ?? 0);
    case "boolean": return key === "ok";
    default: return null;
  }
}

// Game kit (G3, wrapper lib/duell-bau.mjs): when this double runs from the wrapper image (host.sh), it answers the kit call
// with the kit's own example quiz (BEISPIELE.quiz, checked by check.js) and the fact check (lib/duell-bau-fakten.mjs) with
// "falsch" for question 0, "sicher" for the rest – so the repair round and the removal of one question are exercised.
let QUIZ = null;
try {
  const { BEISPIELE } = await import("/app/lib/vendor/mdi-baukasten/engines/baukasten/beispiele.js");
  const { check } = await import("/app/lib/vendor/mdi-baukasten/engines/baukasten/check.js");
  QUIZ = { ok: true, ...check(BEISPIELE.quiz).desc };
} catch { /* not in the wrapper image: no kit answers */ }
// the kit call asks for (a subset of) the game description: recognised by its core fields
const isKit = (schema) => !!(QUIZ && schema && schema.properties && ["goal", "things", "turn"].every((k) => k in schema.properties));
const isFakten = (body) => (Array.isArray(body.system) ? body.system : []).some((b) => String(b.text || "").startsWith("You check the facts of a short quiz"));
function fakten(body) {
  const u = typeof body.messages[0].content === "string" ? body.messages[0].content : "";
  let f = []; try { f = JSON.parse(u.slice(u.indexOf("<data>") + 6, u.lastIndexOf("</data>"))); } catch { /* none */ }
  return { items: f.map((x) => ({ i: x.i, urteil: x.i === 0 ? "falsch" : "sicher", grund: x.i === 0 ? "staging: absichtlich falsch markiert" : "", besser: "" })) };
}

const read = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 4e6) req.destroy(); }); req.on("end", () => ok(b)); });
createServer(async (req, res) => {
  const send = (st, o) => res.writeHead(st, { "content-type": "application/json" }).end(JSON.stringify(o));
  if (req.method !== "POST") return send(404, { error: "not found" });
  if (req.headers["x-api-key"] !== "staging-model-double-no-key") return send(401, { type: "error", error: { type: "authentication_error" } });
  let body; try { body = JSON.parse(await read(req)); } catch { return send(400, { type: "error" }); }
  if (req.url === "/v1/messages/count_tokens") return send(200, { input_tokens: 2048 });
  if (req.url !== "/v1/messages") return send(404, { error: "not found" });
  const schema = body.output_config && body.output_config.format && body.output_config.format.schema;
  const kind = isFakten(body) ? "fakten" : isKit(schema) ? "bau" : "schema";
  // a wish with "Vogel" gets a game the kit must refuse (the generic schema answer fails check.js): refusal with alternative
  const wish = typeof body.messages[0].content === "string" ? body.messages[0].content : "";
  const broken = kind === "bau" && /Vogel/i.test(wish);
  const out = kind === "fakten" ? fakten(body) : kind === "bau" && !broken ? QUIZ : schema ? gen(schema, "") : { ok: true };
  console.log(JSON.stringify({ at: new Date().toISOString(), model: body.model, kind, fields: schema ? Object.keys(schema.properties || {}) : [], out: kind === "bau" ? (broken ? "kaputt (Absage-Test)" : "BEISPIELE.quiz") : out }));
  send(200, { id: "msg_staging", type: "message", role: "assistant", model: body.model, stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 40, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
}).listen(8080, () => console.log("model double on :8080"));
