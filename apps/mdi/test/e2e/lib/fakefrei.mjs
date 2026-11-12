// Strang K: falscher Wrapper fuer die freie Karte, das Deck, die Meldung und das KI-Bild, ueber dem falschen Konto-Wrapper
// (fakewrapper.mjs, Strang F/P1). Antworten sind die Aufnahmen des echten Servers (test/fixtures/wrapper-frei.json,
// scripts/record-frei.mjs). Neuere Routen gewinnen in Playwright: diese Route bedient nur ihre Pfade und reicht den Rest
// an den Konto-Wrapper weiter (route.fallback). Identitaet nur ueber das Cookie der Anfrage (wie dort).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./grund.mjs";
import crypto from "node:crypto";
import { APP } from "./fakewrapper.mjs";
import { gateView } from "../../../src/features/frei/doc.js";
import { canonical } from "../../../src/broker/ai.js";

/** Gate-Hash wie der Server (lib/duell-deck.mjs gateHash, fix/deck-status-hash) fuer die Karten der Aufnahme */
const gateHash = (doc) => crypto.createHash("sha256").update(canonical(gateView(doc))).digest("base64url");
const GH = new Map(REC_CARDS().map((c) => [c.cid, gateHash(c.doc)]));
function REC_CARDS() { return JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/wrapper-frei.json"), "utf8")).exchanges.find((e) => e.name === "deck-mit-karte").res.body.cards; }

const REC = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/wrapper-frei.json"), "utf8"));
export const rec = (n) => JSON.parse(JSON.stringify(REC.exchanges.find((e) => e.name === n).res));
const PATHS = /^\/(api\/duell\/(ai(\/(status|accept|discard))?|queue|report|deck(\/(key|status|use|vote|me))?|bild(\/(status|job|cancel|keep|avatar))?)|duell\/bild\/[A-Za-z0-9_-]{22}\.png)$/;

/**
 * @param fw   fakeWrapper() (Konto, Sitzungen)
 * @param o.karte  Antwort auf POST /api/duell/ai kind karte: Name einer Aufnahme oder "queue" (202 -> 202 -> 200) oder "queue-forever"
 * @param o.status Aufnahme fuer /ai/status (angemeldet), sonst die des Konto-Wrappers
 * @param o.deckStatus "ok" | "blocked" | "unknown"
 */
export function fakeFrei(fw, o = {}) {
  const origin = o.origin || APP;
  const S = { karte: o.karte || "karte-ok-card", status: o.status || null, deckStatus: o.deckStatus || "ok", log: [], queued: 0 };
  const json = (status, body) => ({ status, contentType: "application/json; charset=utf-8", headers: { "cache-control": "no-store" }, body: JSON.stringify(body) });
  async function signedIn(req) {
    const h = await req.allHeaders(), m = /(?:^|;\s*)ct_gate_session=([^;]+)/.exec(h.cookie || "");
    return !!(m && fw.state.sessions.has(m[1]));
  }
  async function attach(ctx) {
    await ctx.route(origin + "/**", async (r) => {
      const req = r.request(), u = new URL(req.url()), p = u.pathname;
      if (origin !== APP && (p === "/duell" || p === "/duell/")) return r.fulfill({ status: 200, path: path.join(ROOT, "dist/index.html"), contentType: "text/html; charset=utf-8" });
      if (!PATHS.test(p)) return origin === APP ? r.fallback() : r.fulfill(json(404, { error: "nf" }));
      let body = null; try { body = req.postDataJSON(); } catch (e) { body = null; }
      S.log.push(req.method() + " " + p + (body && body.kind ? " " + body.kind : ""));
      const me = await signedIn(req);
      if (p === "/api/duell/ai/status") {
        if (!S.status || !me) return origin === APP ? r.fallback() : r.fulfill(json(503, { error: "auth-unavailable" }));
        const st = rec(S.status); if (S.age16 === false && st.body.create) st.body.create.age16 = false;
        return r.fulfill(json(st.status, st.body));
      }
      if (p === "/api/duell/ai") {
        if (!me) { const x = rec("karte-anonym"); return r.fulfill(json(x.status, x.body)); }
        if (body.kind === "line") { const x = rec("ki-line"); return r.fulfill(json(x.status, x.body)); }
        if (S.karte === "queue" || S.karte === "queue-forever") { S.queued = 0; const x = rec("karte-warteschlange"); x.body.position = 2; return r.fulfill(json(x.status, x.body)); }
        const x = rec(S.karte); return r.fulfill(json(x.status, x.body));
      }
      if (p === "/api/duell/queue") {
        S.queued++;
        if (S.karte === "queue-forever" || S.queued < 3) { const x = rec("karte-queue-202"); x.body.position = S.queued < 2 ? 1 : 0; await new Promise((ok) => setTimeout(ok, 150)); return r.fulfill(json(202, x.body)); }
        const x = rec("karte-queue-fertig"); return r.fulfill(json(x.status, x.body));
      }
      if (p === "/api/duell/ai/accept" || p === "/api/duell/ai/discard") return r.fulfill(json(200, rec(p.endsWith("accept") ? "karte-accept" : "karte-discard").body));
      if (p === "/api/duell/deck/key") return r.fulfill(json(200, rec("deck-key").body));
      if (p === "/api/duell/deck") return r.fulfill(json(200, rec("deck-mit-karte").body));
      if (p === "/api/duell/deck/status") {
        const c = u.searchParams.get("c"), d = u.searchParams.has("d") ? u.searchParams.get("d") : null;
        S.log.push("STATUS " + c + " d=" + (d ? "ja" : "nein"));
        // wie der Server mit fix/deck-status-hash: gegebenes d muss der Inhalt der freigegebenen Karte sein
        if (S.deckStatus === "ok" && d !== null && GH.has(c) && d !== GH.get(c)) return r.fulfill(json(200, { c, st: "changed" }));
        return r.fulfill(json(200, { c, st: S.deckStatus }));
      }
      if (p === "/api/duell/deck/use") { if (!me) return r.fulfill(json(401, { error: "login" })); return body.ev === "start" ? r.fulfill(json(200, rec("deck-use-start").body)) : r.fulfill({ status: 204, body: "" }); }
      if (p === "/api/duell/deck/vote") return r.fulfill({ status: 204, body: "" });
      if (p === "/api/duell/deck/me") return me ? r.fulfill(json(200, rec("deck-me").body)) : r.fulfill(json(401, { error: "login" }));
      if (p === "/api/duell/report") return r.fulfill(json(202, rec("report-ok").body));
      if (p === "/api/duell/bild/status") { const x = rec(me ? "bild-status" : "bild-status-anonym"); return r.fulfill(json(x.status, x.body)); }
      if (p === "/api/duell/bild") { const x = rec("bild-auftrag"); return r.fulfill(json(x.status, x.body)); }
      if (p === "/api/duell/bild/job") { const x = rec("bild-job-fertig"); return r.fulfill(json(x.status, x.body)); }
      if (p === "/api/duell/bild/keep") return r.fulfill(json(200, rec("bild-keep").body));
      if (p.startsWith("/duell/bild/")) { const x = rec("bild-datei"); return r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(x.base64, "base64") }); }
      return r.fulfill(json(404, { error: "nf" }));
    });
  }
  return { attach, state: S };
}
