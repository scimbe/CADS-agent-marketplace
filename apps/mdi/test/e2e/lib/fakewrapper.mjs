// Falscher Wrapper fuer die E2E-Tests: bedient per Playwright-Route den Host der Seite (wie /duell auf dem Wrapper) und
// das Login-Gate. Verhalten wie CADS-DEMO-wrapper (lib/auth.mjs, duell-ai.mjs, duell-profile.mjs, duell-voucher.mjs,
// duell-deck.mjs/duell-mod.mjs); die Antwortformen stammen aus den Aufnahmen des echten Servers
// (test/fixtures/wrapper-konto.json). Identitaet NUR ueber das Cookie ct_gate_session der Anfrage (fail closed).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./grund.mjs";

export const HOST = "demos-34a13a96.bunsenbrenner.org";
export const APP = "https://" + HOST;
export const GATE = "https://bunsenbrenner.org";
const REC = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/wrapper-konto.json"), "utf8"));
const tpl = (n) => JSON.parse(JSON.stringify(REC.exchanges.find((e) => e.name === n).res.body));
export const VOUCHER = "TEST-GUTSCHEIN-1";

export function fakeWrapper({ accounts = { "lea@example.org": "pw-lea", "tom@example.org": "pw-tom" }, gate = "up" } = {}) {
  const sessions = new Map(), profiles = new Map(), credit = new Map(), tries = new Map(), mod = new Map(), log = [];
  const S = { gate, next: null, log, profiles, sessions };
  const json = (status, body, extra = {}) => ({ status, contentType: "application/json; charset=utf-8", headers: { "cache-control": "no-store", ...extra }, body: JSON.stringify(body) });
  // Weiterleitung als eigene Navigation (meta refresh) statt 302: Playwright routet bei einer Weiterleitung nur die erste
  // Adresse; die zweite ginge sonst am Doppel vorbei ins echte Netz. Der echte Wrapper antwortet mit 302 (Aufnahme auth-login).
  const redirect = (location) => ({ status: 200, contentType: "text/html; charset=utf-8", headers: { "cache-control": "no-store" }, body: '<!doctype html><meta http-equiv="refresh" content="0;url=' + location.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"><title>weiter</title>' });
  const loginUrl = (ret, lang) => GATE + "/gate/start?host=" + HOST + "&return=" + encodeURIComponent(ret) + (lang ? "&lang=" + lang : "");
  const safeReturn = (p) => (typeof p === "string" && /^\/[\x21-\x7e]*$/.test(p) && !p.startsWith("//") && !/[;,\\]/.test(p) ? p : "/");
  async function who(req) {
    if (S.gate === "down") return { error: true };
    const h = await req.allHeaders();
    const m = /(?:^|;\s*)ct_gate_session=([^;]+)/.exec(h.cookie || "");
    return { email: m && sessions.has(m[1]) ? sessions.get(m[1]) : null };
  }
  const key = (b, id) => (b.via === "code" ? "s:" + b.code : "a:" + id.email);

  async function api(req, p, body) {
    const id = await who(req);
    if (id.error) return json(503, { error: "auth-unavailable" });
    if (p === "/api/duell/ai/status") {
      if (!body || !/^[a-f0-9]{32}$/.test(body.device || "")) return json(400, { error: "bad-device" });
      const out = tpl("status-anonym");
      if (id.email) {
        const t = tpl("status-angemeldet-16"), pr = profiles.get("a:" + id.email);
        out.meter.account = true;
        out.create = { ...t.create, age16: !!(pr && !pr.gone && pr.c), age18: !!(pr && !pr.gone && pr.a18), credit: credit.get(id.email) || 0 };
      }
      return json(200, out);
    }
    const pm = /^\/api\/duell\/profile\/(get|put|delete)$/.exec(p);
    if (pm) {
      if (!body || (body.via !== "account" && body.via !== "code")) return json(400, { error: "bad-request" });
      if (body.via === "code" && !/^[a-f0-9]{32}$/.test(body.code || "")) return json(400, { error: "bad-code" });
      if (body.via === "account" && !id.email) return json(401, { error: "login-required", login_url: loginUrl("/duell") });
      const k = key(body, id), rec = profiles.get(k);
      if (pm[1] === "get") {
        if (!rec) return json(200, { profile: null, rev: 0, via: body.via });
        if (rec.gone) return json(200, { profile: null, rev: rec.r, via: body.via, gone: true });
        return json(200, { profile: rec.p, rev: rec.r, via: body.via, ...(body.via === "account" ? { age18: !!rec.a18 } : {}) });
      }
      if (pm[1] === "delete") { if (rec && !rec.gone) profiles.set(k, { r: rec.r + 1, gone: true }); return json(200, { deleted: true }); }
      const rev = rec ? rec.r : 0, isNew = !rec || rec.gone;
      if (rec && rec.gone && body.fresh !== true) return json(410, { error: "gone", rev });
      if (body.rev !== rev) return json(409, { error: "stale", rev });
      if (body.via === "account" && isNew && body.age16 !== true) return json(403, { error: "age16" });
      if (body.via === "code" && isNew && !id.email) return json(403, { error: "code-needs-login", login_url: loginUrl("/duell") });
      const pr = body.profile || {};
      const next = { r: rev + 1, p: { v: 1, me: pr.me || {}, wall: pr.wall || [], saved: pr.saved || [] } };
      if (body.via === "account") {
        next.c = !isNew && rec.c ? rec.c : "2026-11-11";
        if (body.age18 === true) next.a18 = !isNew && rec.a18 ? rec.a18 : "2026-11-11";
        else if (body.age18 !== false && !isNew && rec.a18) next.a18 = rec.a18;
      }
      profiles.set(k, next);
      return json(200, { rev: next.r, via: body.via });
    }
    if (p === "/api/duell/credit/redeem") {
      if (!id.email) return json(401, { ok: false, error: "login" });
      if ((tries.get(id.email) || 0) >= 5) return json(429, { ok: false, error: "limit" });
      if (String((body && body.code) || "").trim().toUpperCase() !== VOUCHER) { tries.set(id.email, (tries.get(id.email) || 0) + 1); return json(403, { ok: false, error: "unknown" }); }
      credit.set(id.email, (credit.get(id.email) || 0) + 5);
      return json(200, { ok: true, added: 5, credit: credit.get(id.email) });
    }
    if (p === "/api/duell/mod/me") {
      if (!id.email) return json(401, { error: "login" });
      return json(200, { st: "ok", notices: mod.get(id.email) || [] });
    }
    if (p === "/api/duell/mod/appeal") {
      if (!id.email) return json(401, { error: "login" });
      const n = (mod.get(id.email) || []).find((x) => x.nid === body.nid);
      if (!n) return json(404, { error: "unknown" });
      if (n.appeal) return json(409, { error: "appealed", state: n.appeal.state });
      if (!String(body.text || "").trim()) return json(400, { error: "bad-text", max: 1000 });
      n.appeal = { text: body.text, at: "2026-11-11T10:00:00.000Z", state: "open" };
      return json(202, { nid: n.nid });
    }
    return null;
  }

  async function attach(ctx) {
    await ctx.route(GATE + "/**", async (r) => {
      const u = new URL(r.request().url());
      log.push("GATE " + u.pathname);
      if (u.pathname === "/gate/start") {
        // Doppel des Anmeldedienstes: meldet das erste Konto an (ein echter Test meldet nie selbst bei Keycloak an)
        const email = S.next || Object.keys(accounts)[0], sid = "s-" + Math.random().toString(16).slice(2);
        sessions.set(sid, email);
        await ctx.addCookies([{ name: "ct_gate_session", value: sid, domain: "." + "bunsenbrenner.org", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
        return r.fulfill(redirect(APP + safeReturn(u.searchParams.get("return"))));
      }
      if (u.pathname === "/gate/logout") {
        const cs = await ctx.cookies(APP);
        for (const c of cs) if (c.name === "ct_gate_session") sessions.delete(c.value);
        await ctx.clearCookies({ name: "ct_gate_session" });
        return r.fulfill(redirect(APP + safeReturn(u.searchParams.get("return"))));
      }
      return r.fulfill({ status: 404, body: "nf" });
    });
    await ctx.route(APP + "/**", async (r) => {
      const req = r.request(), u = new URL(req.url()), p = u.pathname;
      log.push(req.method() + " " + p);
      if (p === "/duell" || p === "/duell/") return r.fulfill({ status: 200, path: path.join(ROOT, "dist/index.html"), contentType: "text/html; charset=utf-8", headers: { "cache-control": "no-cache" } });
      if (p === "/auth/login") return r.fulfill(redirect(loginUrl(safeReturn(u.searchParams.get("return")), u.searchParams.get("lang"))));
      if (p === "/auth/me") {
        const id = await who(req);
        return r.fulfill(json(id.error ? 503 : 200, { authenticated: !!id.email, login_url: loginUrl(safeReturn(u.searchParams.get("return")), u.searchParams.get("lang")) }));
      }
      if (p.startsWith("/api/")) {
        let body = null; try { body = req.postDataJSON(); } catch (e) { body = null; }
        // gleiche Herkunft: der Server prueft Origin wie shared.corsFor (fremde Herkunft -> 403)
        const h = await req.allHeaders();
        if (h.origin && h.origin !== APP) return r.fulfill(json(403, { error: "origin" }));
        const out = await api(req, p, body);
        if (out) return r.fulfill(out);
      }
      return r.fulfill({ status: 404, contentType: "text/plain", body: "nf" });
    });
  }
  /** Moderationshinweise wie lib/duell-mod.mjs notice() fuer ein Konto anlegen (Form aus der Aufnahme). */
  function notices(email) { const m = tpl("mod-me-hinweise"); for (const n of m.notices) { delete n.appeal; n.appealUntil = "2099-01-01T00:00:00.000Z"; } mod.set(email, m.notices); return m.notices; }
  return { attach, state: S, notices, profileOf: (email) => profiles.get("a:" + email) || null };
}
