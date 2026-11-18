// Freie Karte 2, P3: Modellaufrufe mit laufender Kostenbuchung und hartem Abbruch.
// - Vor jedem Aufruf wird der schlimmste Fall reserviert (Eingabe als Cache-Write gerechnet + max_tokens als Ausgabe).
//   Passt die Reserve nicht mehr unter die Grenze, wirft der Aufruf BudgetAbbruch und es geht kein Request raus.
// - Grenzen lassen sich schachteln (parent): im Bau-Worker hat jeder Auftrag eine Grenze und darueber liegt die des Tages.
// - Nach dem Aufruf wird die Reserve durch die echten Kosten aus usage ersetzt und in die Buchungsdatei geschrieben.
// - Jeder Aufruf streamt (lange Ausgaben, Bauer bis 32k Tokens) und endet hart mit dem AbortSignal des Auftrags.
// - Der Key kommt nur aus einer Datei (read-only gemountet) und wird nie ausgegeben oder geloggt. Das SDK wird erst beim
//   ersten echten Aufruf geladen: Tests mit Modell-Doubles brauchen weder SDK noch Key.
import fs from "node:fs";
import path from "node:path";
import { proxyFetch } from "./proxy-fetch.mjs";

/** Preise USD je MTok (Auftrag FK2-P3). write = Cache-Write (5 min). */
export const PRICES = Object.freeze({
  "claude-haiku-5-5": { in: 0.10, out: 0.50, read: 0.01, write: 0.125 },
  "claude-sonnet-5-5": { in: 2.0, out: 10.0, read: 0.10, write: 2.50 }
});

export class BudgetAbbruch extends Error {
  constructor(msg) { super(msg); this.name = "BudgetAbbruch"; this.code = "budget"; }
}

/** Kosten eines usage-Objekts der Messages-API. */
export function usd(model, u) {
  const p = PRICES[model]; if (!p) throw new Error("kein Preis fuer " + model);
  return ((u.input_tokens || 0) * p.in + (u.output_tokens || 0) * p.out + (u.cache_read_input_tokens || 0) * p.read + (u.cache_creation_input_tokens || 0) * p.write) / 1e6;
}

/**
 * Buchhaltung: Stand optional in einer Datei (ueberlebt Neustarts), optional unter einer uebergeordneten Grenze.
 * @param {{cap:number, file?:string, parent?:ReturnType<typeof createLedger>, name?:string}} o
 */
export function createLedger(o) {
  let spent = 0, reserved = 0;
  if (o.file && fs.existsSync(o.file)) spent = JSON.parse(fs.readFileSync(o.file, "utf8")).spent || 0;
  const save = () => { if (o.file) { fs.writeFileSync(o.file + ".tmp", JSON.stringify({ spent, cap: o.cap, at: new Date().toISOString() })); fs.renameSync(o.file + ".tmp", o.file); } };
  const name = o.name || "Kostengrenze";
  return {
    cap: o.cap,
    get spent() { return spent; },
    get reserved() { return reserved; },
    reserve(x) {
      if (spent + reserved + x > o.cap) throw new BudgetAbbruch(name + ": ausgegeben " + spent.toFixed(4) + " $ + reserviert " + reserved.toFixed(4) + " $ + naechster Aufruf bis " + x.toFixed(4) + " $ > " + o.cap + " $");
      if (o.parent) o.parent.reserve(x);
      reserved += x; return x;
    },
    settle(x, actual) { reserved -= x; spent += actual; save(); if (o.parent) o.parent.settle(x, actual); },
    release(x) { reserved -= x; if (o.parent) o.parent.release(x); }
  };
}

/**
 * Schreibtest fuer den Ordner des Kostenbuchs, genau wie die Buchung schreibt (tmp + rename), beim Start des Workers.
 * Am 18.11. gehoerte das Volume root, der Worker lief als 1000: jeder Bau holte einen Auftrag und scheiterte erst beim ersten
 * Modellaufruf (EACCES auf kosten-*.json.tmp), ohne Ergebnis an den Wrapper. So faellt es beim Start auf.
 * @throws {Error & {code:string}} "Kostenbuch nicht beschreibbar: <dir> (<code>)"
 */
export function schreibtest(dir) {
  const f = path.join(dir, ".schreibtest-" + process.pid);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(f + ".tmp", "ok"); fs.renameSync(f + ".tmp", f); fs.unlinkSync(f);
  } catch (e) {
    try { fs.unlinkSync(f + ".tmp"); } catch { /* gibt es nicht */ }
    throw Object.assign(new Error("Kostenbuch nicht beschreibbar: " + dir + " (" + (e.code || e.message) + ")"), { code: e.code || "SCHREIBTEST" });
  }
}

/**
 * Tagesgrenze ueber alle Auftraege: eine Buchungsdatei je UTC-Tag in dir (kosten-JJJJ-MM-TT.json).
 * @param {{cap:number, dir:string, now?:() => number}} o
 * @returns {() => ReturnType<typeof createLedger>} die Buchung des heutigen Tages
 */
export function createTagesbuch(o) {
  const now = o.now || Date.now;
  let tag = "", buch = null;
  schreibtest(o.dir);
  return () => {
    const t = new Date(now()).toISOString().slice(0, 10);
    if (t !== tag) { tag = t; buch = createLedger({ cap: o.cap, file: path.join(o.dir, "kosten-" + t + ".json"), name: "Tagesgrenze " + t }); }
    return buch;
  };
}

/** Grobe Token-Schaetzung fuer die Reserve (3 Zeichen je Token, bewusst hoch). Bilder: 1600 Token je Bild. */
function estimateTokens(req) {
  let chars = 0, imgs = 0;
  const add = (c) => { if (typeof c === "string") chars += c.length; else if (Array.isArray(c)) for (const b of c) { if (b.type === "text") chars += b.text.length; else if (b.type === "image") imgs++; } };
  add(req.system);
  for (const m of req.messages) add(m.content);
  if (req.output_config && req.output_config.format) chars += JSON.stringify(req.output_config.format).length;
  return Math.ceil(chars / 3) + imgs * 1600 + 500;
}

/**
 * Client fuer die Pipeline.
 * @param {{keyFile?:string, proxy?:string, ledger:ReturnType<typeof createLedger>, log?:(row:object)=>void, fake?:(req:object, o:{signal?:AbortSignal})=>Promise<object>}} o
 *   fake: Modell-Double an Stelle des gestreamten Aufrufs (liefert die fertige Nachricht); Tests ohne Netz, SDK und Key.
 *   proxy: Egress-Proxy (HTTPS_PROXY); ohne ihn gibt es keinen echten Client – der Worker hat keinen anderen Weg hinaus.
 */
export function createLlm(o) {
  let client = null;
  if (!o.fake && !o.proxy) throw new Error("createLlm: ohne Egress-Proxy (HTTPS_PROXY) kein Modellaufruf");
  const viaProxy = o.fake ? null : proxyFetch(o.proxy);
  async function real(req, { signal }) {
    if (!client) {
      const key = fs.readFileSync(o.keyFile, "utf8").trim();
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      client = new Anthropic({ apiKey: key, maxRetries: 4, timeout: 600000, fetch: viaProxy });
    }
    return client.messages.stream(req, { signal }).finalMessage();
  }
  const send = o.fake || real;
  return {
    /**
     * @param {{role:string, model:string, req:object, tag?:string, ledger?:ReturnType<typeof createLedger>, signal?:AbortSignal}} call
     *   req ohne model; role nur fuer das Protokoll; ledger: Grenze dieses Auftrags (Standard: die des Clients)
     * @returns {Promise<{text:string, json:any, usage:object, usd:number, ms:number, stop:string}>}
     */
    async call({ role, model, req, tag, ledger, signal }) {
      const p = PRICES[model]; if (!p) throw new Error("kein Preis fuer " + model);
      const book = ledger || o.ledger;
      if (signal && signal.aborted) throw Object.assign(new Error("Zeitgrenze des Auftrags erreicht"), { name: "AbortError" });
      const worst = (estimateTokens(req) * p.write + req.max_tokens * p.out) / 1e6;
      const r = book.reserve(worst);
      const t0 = Date.now();
      let res;
      try { res = await send({ ...req, model }, { signal }); }
      catch (e) { book.release(r); const row = { role, model, tag, error: e.status ? "http-" + e.status : e.name, msg: String(e.message).slice(0, 200), ms: Date.now() - t0 }; if (o.log) o.log(row); throw e; }
      const cost = usd(model, res.usage || {});
      book.settle(r, cost);
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      let json = null;
      if (req.output_config && req.output_config.format) { try { json = JSON.parse(text); } catch { json = null; } }
      const u = res.usage || {};
      const row = { role, model, tag, stop: res.stop_reason, ms: Date.now() - t0, in: u.input_tokens || 0, out: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, usd: cost, spent: book.spent };
      if (o.log) o.log(row);
      return { text, json, usage: row, usd: cost, ms: row.ms, stop: res.stop_reason };
    }
  };
}
