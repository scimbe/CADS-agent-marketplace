// Freie Karte 2, P3: Modellaufrufe mit laufender Kostenbuchung und hartem Abbruch.
// - Vor jedem Aufruf wird der schlimmste Fall reserviert (Eingabe als Cache-Write gerechnet + max_tokens als Ausgabe).
//   Passt die Reserve nicht mehr unter die Grenze, wirft der Aufruf BudgetAbbruch und es geht kein Request raus.
// - Nach dem Aufruf wird die Reserve durch die echten Kosten aus usage ersetzt und in die Buchungsdatei geschrieben.
// - Der Key kommt nur aus einer Datei (read-only gemountet) und wird nie ausgegeben oder geloggt.
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

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
 * Buchhaltung: gemeinsam fuer alle Aufrufe eines Prozesses, Stand in einer Datei (ueberlebt Neustarts).
 * @param {{cap:number, file?:string}} o
 */
export function createLedger(o) {
  let spent = 0, reserved = 0;
  if (o.file && fs.existsSync(o.file)) spent = JSON.parse(fs.readFileSync(o.file, "utf8")).spent || 0;
  const save = () => { if (o.file) fs.writeFileSync(o.file, JSON.stringify({ spent, cap: o.cap, at: new Date().toISOString() })); };
  return {
    cap: o.cap,
    get spent() { return spent; },
    get reserved() { return reserved; },
    reserve(x) {
      if (spent + reserved + x > o.cap) throw new BudgetAbbruch("Kostengrenze: ausgegeben " + spent.toFixed(4) + " $ + reserviert " + reserved.toFixed(4) + " $ + naechster Aufruf bis " + x.toFixed(4) + " $ > " + o.cap + " $");
      reserved += x; return x;
    },
    settle(x, actual) { reserved -= x; spent += actual; save(); },
    release(x) { reserved -= x; }
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
 * @param {{keyFile:string, ledger:ReturnType<typeof createLedger>, log?:(row:object)=>void, fake?:(req:object)=>Promise<object>}} o
 *   fake: Ersatz fuer client.messages.create (Tests ohne Netz und ohne Key).
 */
export function createLlm(o) {
  let client = null;
  if (!o.fake) {
    const key = fs.readFileSync(o.keyFile, "utf8").trim();
    client = new Anthropic({ apiKey: key, maxRetries: 4, timeout: 300000 });
  }
  const create = o.fake || ((req) => client.messages.create(req));
  return {
    /**
     * @param {{role:string, model:string, req:object}} call  req ohne model; role nur fuer das Protokoll
     * @returns {Promise<{text:string, json:any, usage:object, usd:number, ms:number, stop:string}>}
     */
    async call({ role, model, req, tag }) {
      const p = PRICES[model]; if (!p) throw new Error("kein Preis fuer " + model);
      const worst = (estimateTokens(req) * p.write + req.max_tokens * p.out) / 1e6;
      const r = o.ledger.reserve(worst);
      const t0 = Date.now();
      let res;
      try { res = await create({ ...req, model }); }
      catch (e) { o.ledger.release(r); const row = { role, model, tag, error: e.status ? "http-" + e.status : e.name, msg: String(e.message).slice(0, 200), ms: Date.now() - t0 }; if (o.log) o.log(row); throw e; }
      const cost = usd(model, res.usage || {});
      o.ledger.settle(r, cost);
      const text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      let json = null;
      if (req.output_config && req.output_config.format) { try { json = JSON.parse(text); } catch { json = null; } }
      const u = res.usage || {};
      const row = { role, model, tag, stop: res.stop_reason, ms: Date.now() - t0, in: u.input_tokens || 0, out: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, usd: cost, spent: o.ledger.spent };
      if (o.log) o.log(row);
      return { text, json, usage: row, usd: cost, ms: row.ms, stop: res.stop_reason };
    }
  };
}
