// Festes postMessage-Schema zwischen App (Host) und Spielrahmen (Frame) – 08-forschung/sandbox-vertrag.md: nur JSON,
// Schema auf Ein- und Ausgang, Ablehnung immer mit Grund. Exakte Schluessel: Unbekanntes wird abgelehnt, nicht
// uebergangen. Handgeschrieben statt Ajv, weil der Rahmen ohne Laufzeit-Abhaengigkeiten auskommen soll.
import { CONTROLS, LIMITS } from "./api.js";
import { checkSzenarien } from "./szenario.js";

export const V = 1;
export const ERROR_CODES = Object.freeze(["modul", "zustand", "api", "zeichnen", "eingabe", "speicher", "exception", "syntax", "watchdog", "netz", "protokoll", "sandbox"]);
export const SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_SECONDS = 600;
export const LANGS = Object.freeze(["de", "en"]);

const isObj = (m) => !!m && typeof m === "object" && !Array.isArray(m);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
function keys(m, want) {
  const k = Object.keys(m).sort(), w = want.slice().sort();
  if (k.length !== w.length || k.some((x, i) => x !== w[i])) return "Schluessel " + JSON.stringify(k) + " statt " + JSON.stringify(w);
  return null;
}

/** Host -> Frame. @returns {string|null} Grund der Ablehnung oder null */
export function checkToFrame(m) {
  if (!isObj(m) || m.v !== V) return "kein Objekt mit v=" + V;
  switch (m.t) {
    case "start": {
      const want = m.mode === "test" ? ["v", "t", "mode", "code", "seed", "lang", "seconds", "szenarien"] : ["v", "t", "mode", "code", "seed", "lang"];
      const bad = keys(m, want); if (bad) return "start: " + bad;
      if (m.mode !== "play" && m.mode !== "test") return "start: mode muss play oder test sein";
      if (typeof m.code !== "string" || m.code.length < 1 || m.code.length > LIMITS.codeBytes) return "start: code fehlt oder ist groesser als " + LIMITS.codeBytes;
      if (typeof m.seed !== "string" || !SEED_RE.test(m.seed)) return "start: seed ungueltig";
      if (!LANGS.includes(m.lang)) return "start: lang muss " + LANGS.join(" oder ") + " sein";
      if (m.mode === "test" && !isInt(m.seconds, 1, MAX_SECONDS)) return "start: seconds muss 1.." + MAX_SECONDS + " sein";
      if (m.mode === "test") { const sz = checkSzenarien(m.szenarien); if (sz) return "start: " + sz; }
      return null;
    }
    case "pause": case "resume": case "stop": return keys(m, ["v", "t"]);
    default: return "unbekannter Typ " + JSON.stringify(m.t);
  }
}

function checkStatus(s) {
  if (!isObj(s)) return "status fehlt";
  const bad = keys(s, ["frame", "score", "lives", "level", "over", "won", "paused"]); if (bad) return "status: " + bad;
  if (!isInt(s.frame, 0, 2 ** 31) || !isInt(s.score, 0, 2 ** 31) || !isInt(s.lives, 0, LIMITS.maxLives) || !isInt(s.level, 1, 2 ** 31)) return "status: Zahlen ausserhalb";
  if (typeof s.over !== "boolean" || typeof s.won !== "boolean" || typeof s.paused !== "boolean") return "status: over/won/paused";
  return null;
}

/** Frame -> Host. @returns {string|null} */
export function checkToHost(m) {
  if (!isObj(m) || m.v !== V) return "kein Objekt mit v=" + V;
  switch (m.t) {
    case "ready": return keys(m, ["v", "t"]);
    case "started": {
      const bad = keys(m, ["v", "t", "meta"]); if (bad) return bad;
      const x = m.meta;
      if (!isObj(x) || keys(x, ["title", "controls", "lives"])) return "started: meta";
      if (typeof x.title !== "string" || x.title.length > 40 || !Array.isArray(x.controls) || !x.controls.every((c) => CONTROLS.includes(c)) || !isInt(x.lives, 1, LIMITS.maxLives)) return "started: meta-Werte";
      return null;
    }
    case "status": return keys(m, ["v", "t", "status"]) || checkStatus(m.status);
    case "progress": return keys(m, ["v", "t", "done", "total"]) || (isInt(m.done, 0, 2 ** 31) && isInt(m.total, 1, 2 ** 31) ? null : "progress: Zahlen");
    case "result": {
      const bad = keys(m, ["v", "t", "report"]); if (bad) return bad;
      const r = m.report;
      if (!isObj(r) || typeof r.ok !== "boolean" || !isObj(r.checks) || !isObj(r.bots)) return "result: Bericht unvollstaendig";
      if (JSON.stringify(r).length > 65536) return "result: Bericht zu gross";
      return null;
    }
    case "error": {
      const bad = keys(m, ["v", "t", "code", "message"]); if (bad) return bad;
      if (!ERROR_CODES.includes(m.code)) return "error: code " + JSON.stringify(m.code);
      if (typeof m.message !== "string" || m.message.length > 500) return "error: message";
      return null;
    }
    default: return "unbekannter Typ " + JSON.stringify(m.t);
  }
}
