// Effekte der freien Karte (ADR 0001 (g)): jeder Effekt ruft einen Dienst aus src/broker/ (ai, deck, bild) und meldet das
// Ergebnis als Ereignis zurueck. Kein eigener Zustand: ob eine Anfrage noch gilt (alive), steht in der Statechart
// (ctx.frei.req, ctx.frei.bild.req, ctx.frei.ki.req). Ein Programmfehler wird laut (wie runtime.later), nie verschluckt.
// env: { dispatch(ev), getState(), deps: { ai, deck, bild, storage?, schedule? } }
import { reportBody, KINDS } from "../../broker/ai.js";
import { USE_MS } from "../../broker/deck.js";
import { optionHash } from "../../broker/ai.js";
import { gateView } from "./doc.js";

/** Zustand lesen: F uebergibt state: () => state (ADR 0001 g) */
const cur = (env) => (env.getState || env.state)();
const later = (f) => { f().catch((e) => setTimeout(() => { throw e; }, 0)); };
const none = (env, type, extra) => env.dispatch({ type, r: { how: "nicht-hier" }, ...extra });

/** Was eine Meldung von einer freien Karte traegt: Art, eigene Texte, Siegel. Nie ein Foto. */
export function reportContent(doc) {
  const c = { type: doc.k };
  for (const k of ["t", "s", "x", "y", "w"]) if (typeof doc[k] === "string" && doc[k]) c[k] = doc[k];
  if (doc.g && typeof doc.g.title === "string") c.title = doc.g.title;
  if (doc.pk) c.quiz = doc.pk;
  return c;
}

export const freiEffects = {
  "frei.ask": (fx, env) => later(async () => {
    const ai = env.deps.ai, s = cur(env);
    if (!ai) return none(env, "FREI_RESULT", { req: fx.req });
    // gilt nur, solange die Anfrage die aktuelle ist UND die Ansicht noch wartet (Robot/Warten); sonst geht ein Ergebnis zurueck
    const alive = () => { const st = cur(env); return st.ctx.frei.req === fx.req && st.config.includes("inhalt.frei.warten"); };
    const r = await ai.ask({ kind: "karte", input: fx.input, device: s.ctx.device, lang: s.ctx.lang },
      (step, n) => { if (alive()) env.dispatch({ type: "FREI_PHASE", req: fx.req, step, n }); }, alive);
    if (r.how === "result" && !alive()) { if (r.receipt) await ai.discard(s.ctx.device, r.receipt); return; }
    env.dispatch({ type: "FREI_RESULT", req: fx.req, r });
    if (r.meter || r.how === "quota" || r.how === "result") env.dispatch({ type: "REFRESH" });
  }),
  // Abbrechen: nichts zu tun – die laufende Anfrage sieht ueber alive(), dass sie nicht mehr gilt, und gibt ein spaetes Ergebnis zurueck
  "frei.cancel": () => {},
  "frei.settle": (fx, env) => later(async () => {
    const ai = env.deps.ai; if (!ai) return;
    const dev = cur(env).ctx.device;
    const ok = fx.how === "accept" ? await ai.accept(dev, fx.receipt) : await ai.discard(dev, fx.receipt);
    if (!ok) env.dispatch({ type: "SETTLE_FAIL", how: fx.how });
    env.dispatch({ type: "REFRESH" });
  }),
  "frei.last": (fx, env) => { if (env.deps.storage && env.deps.storage.saveFrei) env.deps.storage.saveFrei({ freiLast: fx.last }); },
  // Status-Gate: jede Pruefung muss "ok" sein; eine Karte mit eigenem Siegel mit dem Inhalts-Hash des Gezeigten. Ohne
  // Pruefungen, ohne Deck oder ohne crypto.subtle: "unknown" (fail closed)
  "frei.status": (fx, env) => later(async () => {
    const deck = env.deps.deck, subtle = globalThis.crypto && globalThis.crypto.subtle;
    const checks = Array.isArray(fx.checks) ? fx.checks : [];
    let st = !deck || !checks.length ? "unknown" : "ok";
    for (const c of checks) {
      if (st !== "ok") break;
      const d = c.doc ? (subtle ? await optionHash(gateView(c.doc), subtle) : "") : undefined;
      st = !c.cid || d === "" ? "unknown" : await deck.status(c.cid, d);   // cid null: Siegel ohne Hash, nie pruefbar (H1)
    }
    env.dispatch({ type: "GATE", st });
  }),
  "frei.deck.load": (fx, env) => later(async () => {
    if (!env.deps.deck) return env.dispatch({ type: "DECK_LOADED", ok: false, why: "nicht-hier" });
    const r = await env.deps.deck.load();
    env.dispatch({ type: "DECK_LOADED", ok: r.ok, why: r.why, cards: r.deck.cards, v: r.deck.v });
  }),
  "frei.use.start": (fx, env) => later(async () => {
    if (!env.deps.deck) return;
    const r = await env.deps.deck.useStart(fx.ki);
    env.dispatch({ type: "USE", ok: r.ok, login: r.login === true });
    // nach >= 20 s: abschliessen, wenn auf der Karte etwas getan wurde (ctx.frei.acted) und sie noch offen ist
    if (r.ok) (env.deps.schedule || setTimeout)(() => later(async () => { const c = cur(env).ctx.frei; if (c.card && c.card.doc.ki === fx.ki) await env.deps.deck.useDone(fx.ki, c.acted); }), USE_MS + 200);
  }),
  "frei.use.acted": (fx, env) => later(async () => { if (env.deps.deck) await env.deps.deck.useDone(fx.ki, true); }),
  "frei.vote": (fx, env) => later(async () => {
    const st = env.deps.deck ? await env.deps.deck.vote(fx.ki, fx.v) : "fehler";
    env.dispatch({ type: "VOTED", st });
  }),
  "frei.mine": (fx, env) => later(async () => {
    const r = env.deps.deck ? await env.deps.deck.mine() : { ok: false, error: "nicht-hier" };
    env.dispatch({ type: "MINE_LOADED", r });
  }),
  "frei.report": (fx, env) => later(async () => {
    const ai = env.deps.ai, d = fx.doc;
    const ok = ai ? await ai.report(reportBody(reportContent(d), d.ki, fx.reason, "")) : false;
    env.dispatch({ type: "REPORTED", ok });
  }),
  "frei.bild.status": (fx, env) => later(async () => env.dispatch({ type: "BILD_STATUS", r: env.deps.bild ? await env.deps.bild.status() : { ok: false, error: "nicht-hier" } })),
  "frei.bild.make": (fx, env) => later(async () => {
    const alive = () => { const st = cur(env); return st.ctx.frei.bild.req === fx.req && st.config.includes("inhalt.frei.bildwarten"); };
    const r = env.deps.bild ? await env.deps.bild.make(fx.input, (step, n) => { if (alive()) env.dispatch({ type: "BILD_PHASE", req: fx.req, step, n }); }, alive) : { how: "nicht-hier" };
    if (alive()) env.dispatch({ type: "BILD_RESULT", req: fx.req, r });
  }),
  "frei.bild.cancel": () => {},
  "frei.bild.keep": (fx, env) => later(async () => {
    const b = env.deps.bild; if (!b) return env.dispatch({ type: "BILD_KEPT", ok: false });
    let ok = await b.keep(fx.id);
    if (ok && fx.avatar) ok = (await b.avatar(fx.id)).ok;
    env.dispatch({ type: "BILD_KEPT", ok });
  }),
  // KI-Knoten einer Zugkarte: Ergebnis als KI_DONE; bleibt die Karte nicht offen, geht es sofort zurueck
  "frei.kiask": (fx, env) => later(async () => {
    const ai = env.deps.ai, s = cur(env);
    if (!ai) return env.dispatch({ type: "KI_DONE", into: fx.into, r: { how: "nicht-hier" } });
    const alive = () => { const st = cur(env); return st.ctx.cardId === fx.cardId && st.config.some((c) => c.startsWith("inhalt.card")); };
    const r = await ai.ask({ kind: fx.kind, input: fx.input, device: s.ctx.device, lang: s.ctx.lang }, () => {}, alive);
    if (!alive()) { if (r.receipt) await ai.discard(s.ctx.device, r.receipt); return; }
    env.dispatch({ type: "KI_DONE", into: fx.into, r: { how: r.how, position: r.position, why: r.why }, option: r.how === "result" ? r.options[0] : null, seal: r.how === "result" && r.seals[0] ? { k: fx.kind, s: r.seals[0], h: r.hashes[0] } : null, receipt: r.receipt || "" });
  }),
  // KI-Arten fuer alle Karten: eine Art aus KINDS; Vorschlaege kommen als Texte (line: options[] Strings; meme: {top,bottom})
  "frei.ki": (fx, env) => later(async () => {
    const ai = env.deps.ai, s = cur(env);
    if (!ai || !KINDS.includes(fx.kind)) return env.dispatch({ type: "KI_RESULT", req: fx.req, r: { how: "nicht-hier" }, opts: [] });
    const alive = () => { const st = cur(env); return st.ctx.frei.ki.req === fx.req && st.config.includes("inhalt.frei.ki"); };
    const r = await ai.ask({ kind: fx.kind, input: fx.input, device: s.ctx.device, lang: s.ctx.lang }, () => {}, alive);
    if (!alive()) { if (r.receipt) await ai.discard(s.ctx.device, r.receipt); return; }
    const opts = r.how === "result" ? r.options.map((o) => (typeof o === "string" ? o : o && typeof o.top === "string" ? o.top + " " + o.bottom : "")).map((x) => [...x].slice(0, fx.max || 90).join("").trim()).filter(Boolean) : [];
    // eine Antwort, aus der hier nichts genommen werden kann, geht sofort zurueck; sonst erst beim Antippen (accept) oder Zurueck (discard)
    if (r.receipt && !opts.length) await ai.discard(s.ctx.device, r.receipt);
    env.dispatch({ type: "KI_RESULT", req: fx.req, r: { how: r.how === "result" && !opts.length ? "bad" : r.how, position: r.position }, opts, receipt: opts.length ? r.receipt : "", seal: r.seals && r.seals[0] ? { k: fx.kind, s: r.seals[0], h: r.hashes[0] } : null });
  })
};
