// KI-Dienst des Clients (Strang K): EIN Ort, der das Protokoll von POST /api/duell/ai spricht – fuer die freie Karte (kind
// "karte") und alle KI-Arten der Karten (wish, line, meme, lyrics, plan, liste, quiz, welt, text, anlass; x-model im Manifest).
// Der Server zaehlt, reiht ein und entscheidet (A5); hier wird nur ehrlich abgebildet, was zurueckkam: Ergebnis, Platz N,
// "noch nicht", aufgebraucht, abgelehnt, Krise, nicht erreichbar. Nie wird ein lokaler Vorschlag als KI-Antwort ausgegeben.
// Server: CADS-DEMO-wrapper lib/duell-ai.mjs (act, route), lib/duell.mjs (/api/duell/queue), lib/duell-report.mjs.
// Altcode (Untergrenze): ai.js – verdict, place, ticket, client.ask/settle, canonical, optionHash, solve, crisis, reportBody.
//
//   POST /api/duell/ai        { kind, input, device, proof, lang, queue:"ticket" }
//     200 { options, seals[], hashes[], cost, receipt?, meter, note? } | 200 { options:[], notyet, reason?, alt?, catalog }
//     202 { ticket, position, etaS } -> POST /api/duell/queue { ticket } (gleiche Antworten; 404 = Ticket verfallen)
//     401 login | 403 age16|age|account-paused | 409 pending | 422 blocked {why: crisis|kind_ok} | 429 quota|busy|throttled|daily-cap|new-limit | 503 off
//   POST /api/duell/ai/accept|discard { device, receipt } -> 200
// Es gibt kein Abbrechen auf dem Server: ein Ticket, nach dem 15 s niemand fragt, verfaellt kostenlos. Wer abbricht, laesst
// die Anfrage im Hintergrund zu Ende laufen und gibt ein spaetes Ergebnis sofort zurueck (wie "Verwerfen").

export const PAUSE = 500, WAIT_MAX = 60000, PROOF_BITS = 16;
export const KINDS = ["karte", "wish", "line", "meme", "lyrics", "plan", "liste", "quiz", "welt", "text", "anlass"];
export const REASONS = ["harm", "sex", "hate", "private", "wrong", "other"];

// Krise: dieselben eindeutigen Woerter wie CRISIS im Server (gefaltet wie foldForFilter), vor dem Senden geprueft. Ein solcher
// Text verlaesst das Geraet nie, die Hilfe erscheint sofort, auch offline. Nur fuer die Arten, die auch der Server prueft.
export const CRISIS_KINDS = ["plan", "liste", "quiz", "welt", "text", "karte"];
const CRISIS = /suizid|selbstmord|selbstverletz|umbring|umzubring|nicht mehr leben|will sterben|sterben will|lebensmud|\bbringe? mich um\b|\b(will|mochte|ware|war) (einfach |lieber )?tot( sein)?\b|\britz(e|te)? mich\b|\b(lust|bock|sinn|grund) mehr (zu|auf|aufs) leben\b|\bhasse mein leben\b|\btu(e|n)? mir (was|etwas) an\b|\bmir (was|etwas) (an ?tun|anzutun)\b|\bkys\b|kill myself|suicid|self.?harm|want to die|end my life/;
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "€": "e", "!": "i" };
export function crisis(text) {
  const f = String(text == null ? "" : text).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss");
  return CRISIS.test(f.replace(/[0134578@$€!]/g, (c) => LEET[c]).replace(/\s+/g, " "));
}
/** Alle Texte einer Anfrage, verbunden: das, worauf crisis() schaut. */
export function textsOf(v) { return typeof v === "string" ? v : v && typeof v === "object" ? Object.keys(v).map((k) => textsOf(v[k])).join(" ") : ""; }

/** Bedeutung der Serverantwort fuer die Seite (Altcode verdict, um die Codes der freien Karte erweitert). */
export function verdict(status, json) {
  if (status === 200 && json && Array.isArray(json.options) && json.options.length) return "result";
  if (status === 200 && json && json.notyet) return "notyet";
  if (status === 202 && json && ticket(json)) return "queued";
  if (status === 429 && json && json.error === "quota") return "quota";
  if (status === 429 && json && (json.error === "throttled" || json.error === "daily-cap")) return "paused";
  if (status === 401) return "login";
  if (status === 403 && json && json.error === "age16") return "age16";
  if (status === 403 && json && json.error === "age") return "age";
  if (status === 403 && json && (json.error === "account-paused" || json.error === "account-banned")) return "modpause";
  if (status === 503 && json && json.error === "karte-off") return "karteoff";
  if (status === 422) return "blocked";
  if (status === 429 || status === 409) return "busy";
  return "off";
}
export function place(json) { const n = Number(json && (json.position != null ? json.position : json.queue && json.queue.position)); return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : 0; }
export function ticket(json) { return json && typeof json.ticket === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(json.ticket) ? json.ticket : ""; }
const okSeal = (x) => (typeof x === "string" && /^[A-Za-z0-9._~-]{8,200}$/.test(x) ? x : "");
const receiptOf = (json) => (json && typeof json.receipt === "string" && /^[A-Za-z0-9._~:-]{4,400}$/.test(json.receipt) ? json.receipt : "");
export const okHash = (x) => (typeof x === "string" && /^[A-Za-z0-9_-]{43}$/.test(x) ? x : "");

/** Die Option als ein exakter Text, dieselbe Regel wie canonical() im Server (lib/duell-seal.mjs). */
export function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map((x) => canonical(x === undefined ? null : x)).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
export function b64url(u8) { let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function unb64url(s) { let b = String(s).replace(/-/g, "+").replace(/_/g, "/"); b += "===".slice(0, (4 - (b.length % 4)) % 4); return Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); }
/** h = base64url(SHA-256(UTF-8(canonical(option)))) ohne Padding, 43 Zeichen; "" ohne crypto.subtle. */
export async function optionHash(opt, subtle) {
  try { return okHash(b64url(new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(canonical(opt)))))); } catch (e) { return ""; }
}
/** Kleiner Arbeitsnachweis eines neuen Geraets: n mit SHA-256(device:n) beginnt mit `bits` Null-Bits. */
export async function solve(device, bits, subtle) {
  const enc = new TextEncoder();
  for (let n = 0; ; n++) {
    const h = new Uint8Array(await subtle.digest("SHA-256", enc.encode(device + ":" + n.toString(36))));
    let ok = true;
    for (let i = 0, left = bits; left > 0 && ok; i++, left -= 8) ok = !(h[i] >> Math.max(0, 8 - left));
    if (ok) return n.toString(36);
  }
}
/** Was eine Meldung traegt (POST /api/duell/report): Grund, die eigenen Texte und Art der Karte, Siegel und Hash. Nie ein Foto.
 *  null, wenn der Grund keiner ist, den der Server kennt. */
export function reportBody(content, ki, reason, link) {
  if (!REASONS.includes(reason)) return null;
  const b = { reason, consent: true, content };
  if (ki && typeof ki.k === "string") b.kind = ki.k;
  if (ki && okSeal(ki.s)) b.seal = ki.s;
  if (b.seal && okHash(ki.h)) b.optionHash = ki.h;
  if (typeof link === "string" && /^[A-Za-z0-9_-]{3,40}$/.test(link)) b.link = link;
  return b;
}

/**
 * @param {object} deps
 * @param {{raw(method:string, path:string, body?:object):Promise<object>}} deps.api   src/broker/api.js
 * @param {SubtleCrypto} [deps.subtle]
 * @param {(ms:number)=>Promise<void>} [deps.sleep]
 * @param {()=>number} [deps.now]
 * @param {number} [deps.waitMax]
 * @param {number} [deps.proofBits]
 */
export function createAi(deps) {
  const api = deps.api, subtle = "subtle" in deps ? deps.subtle : globalThis.crypto && globalThis.crypto.subtle;
  const sleep = deps.sleep || ((ms) => new Promise((ok) => setTimeout(ok, ms)));
  const now = deps.now || (() => Date.now()), max = deps.waitMax || WAIT_MAX, bits = deps.proofBits === undefined ? PROOF_BITS : deps.proofBits;
  let proof = null;
  const send = (path, body) => api.raw("POST", path, body);
  const none = (how, extra = {}) => ({ how, options: [], seals: [], hashes: [], receipt: "", position: 0, ...extra });

  async function proofFor(device) { if (proof && proof.d === device) return proof.p; const p = bits > 0 && subtle ? await solve(device, bits, subtle) : "0"; proof = { d: device, p }; return p; }

  /**
   * Eine Anfrage bis zu ihrem Ende (Ergebnis oder Grund). onPhase(step, n): "send" | "line" (n = Platz) | "make" | "check".
   * alive(): false, sobald die Person abgebrochen oder die Ansicht verlassen hat; die Anfrage laeuft dann zu Ende und ein
   * Ergebnis wird sofort zurueckgegeben (discard), nichts wird gezeigt.
   */
  async function ask({ kind, input, device, lang }, onPhase = () => {}, alive = () => true) {
    if (!KINDS.includes(kind)) return none("off");
    if (CRISIS_KINDS.includes(kind) && crisis(textsOf(input))) return none("crisis");   // nichts gesendet, nichts verbraucht
    onPhase("send", 0);
    const body = { kind, input, device, proof: await proofFor(device), lang: lang === "en" ? "en" : "de", queue: "ticket" };
    let r = await send("/api/duell/ai", body), how, last = 0, tk = "";
    const started = now();
    for (;;) {
      if (!r.status) return none(r.error === "nicht-hier" ? "nicht-hier" : r.error === "zeit" ? "timeout" : "off");
      how = verdict(r.status, r.body);
      if (how !== "queued") break;
      tk = ticket(r.body) || tk; last = place(r.body);
      onPhase(last ? "line" : "make", last);
      await sleep(PAUSE);
      if (!alive()) return none("gone");   // abgebrochen in der Schlange: das Ticket verfaellt auf dem Server, nichts verbraucht
      if (now() - started >= max) return none("busy", { position: last });
      r = await send("/api/duell/queue", { ticket: tk });
    }
    const meter = r.body && typeof r.body === "object" && r.body.meter ? r.body.meter : null;
    if (how !== "result") {
      const b = r.body || {};
      const out = none(how, { position: how === "busy" ? place(b) || last : 0, meter, why: how === "blocked" && (b.why === "crisis" || b.why === "kind_ok") ? b.why : "" });
      if (how === "notyet") Object.assign(out, { notyet: typeof b.notyet === "object" && b.notyet ? b.notyet : {}, catalog: Array.isArray(b.catalog) ? b.catalog.filter((x) => typeof x === "string" && /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 3) : [], reason: typeof b.reason === "string" && /^[a-z0-9_]{1,20}$/.test(b.reason) ? b.reason : "", alt: b.alt && typeof b.alt === "object" ? b.alt : null });
      if (how === "modpause") out.until = typeof b.until === "string" ? b.until : null;
      return out;
    }
    const receipt = receiptOf(r.body);
    if (!alive()) { if (receipt) await settle("discard", device, receipt); return none("gone"); }
    onPhase("check", 0);
    const opts = r.body.options, seals = opts.map((o, i) => okSeal(Array.isArray(r.body.seals) ? r.body.seals[i] : ""));
    // h selbst rechnen: der Server schickt hashes mit, die Seite verlaesst sich aber nur auf ihre eigene Rechnung
    const hashes = await Promise.all(opts.map((o, i) => (seals[i] ? optionHash(o, subtle) : "")));
    const note = [].concat(r.body.note || []).filter((c) => typeof c === "string" && c.length <= 40);
    return { how: "result", options: opts, seals, hashes, receipt, position: 0, meter, note, credit: r.body.credit === true };
  }
  /** Ein ausgegebenes Ergebnis genau einmal abrechnen: accept (genommen) oder discard (zurueck). -> true, wenn der Server ja sagte */
  async function settle(how, device, receipt) {
    if (!receipt || (how !== "accept" && how !== "discard")) return false;
    const r = await send("/api/duell/ai/" + how, { device, receipt });
    return r.status === 200;
  }
  /** POST /api/duell/report -> true, wenn der Server die Meldung genommen hat (202) */
  async function report(body) { if (!body) return false; const r = await send("/api/duell/report", body); return r.status >= 200 && r.status < 300; }
  return { ask, accept: (d, rc) => settle("accept", d, rc), discard: (d, rc) => settle("discard", d, rc), report };
}
