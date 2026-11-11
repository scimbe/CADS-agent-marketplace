// API-Modul (src/broker/api.js) gegen die Antworten des echten Wrappers (aufgenommen, test/fixtures/wrapper-konto.json):
// jede Antwort wird auf genau ein Ergebnis abgebildet, nichts Unbekanntes wird still zu „ok“.
import test from "node:test";
import assert from "node:assert/strict";
import { createApi, safeReturn } from "../src/broker/api.js";
import { apiFor, REC, HERE } from "./wrapper.js";

const DEV = REC.device, CODE = REC.code;

test("status: anonym, angemeldet ohne/mit 16+, Guthaben, ungueltiges Geraet, Gate weg", async () => {
  let { api } = apiFor("status-anonym");
  assert.deepEqual(await api.status(DEV), { ok: true, account: false, canLogin: true, ki: { enabled: true, remaining: 7, size: 7, period: "week", resetAt: "2026-11-16T00:00:00.000Z" }, karte: null });
  ({ api } = apiFor("status-angemeldet-ohne-16"));
  let r = await api.status(DEV);
  assert.equal(r.account, true); assert.equal(r.karte.age16, false); assert.equal(r.karte.remaining, 5); assert.equal(r.karte.voucher, true);
  ({ api } = apiFor("status-angemeldet-18"));
  r = await api.status(DEV); assert.equal(r.karte.age16, true); assert.equal(r.karte.age18, true);
  ({ api } = apiFor("status-guthaben"));
  assert.equal((await api.status(DEV)).karte.credit, 5);
  ({ api } = apiFor("status-geraet-ungueltig"));
  assert.deepEqual(await api.status("kurz"), { ok: false, error: "geraet", status: 400 });
  ({ api } = apiFor("status-gate-weg"));
  assert.deepEqual(await api.status(DEV), { ok: false, error: "anmeldung-weg", status: 503 });
});

test("auth/me: Abmelde-Adresse wird aus der Gate-Adresse des Servers abgeleitet, nur fuer dessen Host", async () => {
  let { api } = apiFor("auth-me-angemeldet");
  const r = await api.me("/duell?go=konto", "de");
  assert.deepEqual(r, { ok: true, authenticated: true, logoutUrl: "https://bunsenbrenner.org/gate/logout?host=demos-34a13a96.bunsenbrenner.org&return=%2Fduell%3Fgo%3Dkonto" });
  ({ api } = apiFor("auth-me-anonym"));
  assert.equal((await api.me("/duell", "de")).authenticated, false);
  ({ api } = apiFor("auth-me-gate-weg"));
  assert.equal((await api.me("/duell", "de")).ok, false);
  assert.equal(api.logoutFrom("http://evil.example/gate/start?host=x", "/duell"), null, "nur https");
  assert.equal(api.logoutFrom("https://bunsenbrenner.org/anders?host=x", "/duell"), null, "nur /gate/start");
  assert.equal(api.logoutFrom("kaputt", "/duell"), null);
});

test("Anmelde-Adresse: relativ (gleicher Host), Ruecksprung nur als Pfad – wie /auth/login des Servers es erwartet", () => {
  const api = createApi({ location: HERE, fetch: async () => { throw new Error("kein Netz"); } });
  const href = api.loginHref("/duell?go=konto", "de");
  assert.equal(href, "/auth/login?return=%2Fduell%3Fgo%3Dkonto&lang=de");
  // derselbe Pfad, den der echte Server an das Gate weiterreicht (Aufnahme auth-login)
  const loc = REC.exchanges.find((e) => e.name === "auth-login");
  assert.equal(loc.req.path, href); assert.equal(loc.res.status, 302);
  for (const bad of ["https://evil.example/", "//evil.example", "/a;b", "x"]) assert.equal(safeReturn(bad), "/duell", bad);
});

test("profile/get: leer, vorhanden mit 18+, Code, unbekannter Code, ungueltiger Code, ohne Login, geloescht", async () => {
  let { api } = apiFor("profil-get-leer");
  assert.deepEqual(await api.profileGet({ via: "account" }), { ok: true, profile: null, rev: 0, gone: false, age18: false });
  ({ api } = apiFor("profil-get-18"));
  let r = await api.profileGet({ via: "account" });
  assert.equal(r.rev, 2); assert.equal(r.age18, true); assert.equal(r.profile.me.nick, "Lea M"); assert.deepEqual(r.profile.wall, []);
  ({ api } = apiFor("profil-get-code"));
  r = await api.profileGet({ via: "code", code: CODE }); assert.equal(r.profile.me.emoji, "🐢");
  ({ api } = apiFor("profil-get-code-unbekannt"));
  assert.equal((await api.profileGet({ via: "code", code: "0".repeat(32) })).profile, null);
  ({ api } = apiFor("profil-get-code-ungueltig"));
  assert.equal((await api.profileGet({ via: "code", code: "xyz" })).error, "code");
  ({ api } = apiFor("profil-get-anonym-konto"));
  assert.equal((await api.profileGet({ via: "account" })).error, "login");
  ({ api } = apiFor("profil-get-geloescht"));
  r = await api.profileGet({ via: "account" }); assert.equal(r.gone, true); assert.equal(r.profile, null); assert.equal(r.rev, 3);
});

test("profile/put: ohne 16+ abgelehnt, mit 16+ angelegt, veraltet mit Revision, 18+, Code ohne Konto, geloescht", async () => {
  const prof = { me: { nick: "Lea", emoji: "🦊", colors: ["#ffd400", "#ff3b1d"], set: "" }, wall: [], saved: [] };
  let { api, f } = apiFor("profil-put-ohne-16");
  assert.deepEqual(await api.profilePut({ via: "account" }, { rev: 0, profile: prof, fresh: true }), { ok: false, error: "age16", status: 403 });
  assert.equal(f.seen[0].body.age16, undefined, "16+ geht nur mit, wenn ausdruecklich gesetzt");
  ({ api, f } = apiFor("profil-put-mit-16"));
  assert.deepEqual(await api.profilePut({ via: "account" }, { rev: 0, profile: prof, fresh: true, age16: true }), { ok: true, rev: 1 });
  assert.equal(f.seen[0].body.age16, true);
  ({ api } = apiFor("profil-put-veraltet"));
  assert.deepEqual(await api.profilePut({ via: "account" }, { rev: 0, profile: { me: { nick: "Alt" } } }), { ok: false, error: "veraltet", rev: 1, status: 409 });
  ({ api, f } = apiFor("profil-put-18"));
  assert.deepEqual(await api.profilePut({ via: "account" }, { rev: 1, profile: prof, age18: true }), { ok: true, rev: 2 });
  assert.equal(f.seen[0].body.age18, true);
  ({ api } = apiFor("profil-put-code-ohne-konto"));
  assert.equal((await api.profilePut({ via: "code", code: CODE }, { rev: 0, profile: { me: { nick: "Kind" } }, fresh: true })).error, "code-login");
  ({ api } = apiFor("profil-put-code-neu"));
  assert.deepEqual(await api.profilePut({ via: "code", code: CODE }, { rev: 0, profile: prof, fresh: true }), { ok: true, rev: 1 });
  ({ api } = apiFor("profil-put-geloescht"));
  assert.equal((await api.profilePut({ via: "account" }, { rev: 3, profile: prof })).error, "geloescht");
});

test("profile/delete", async () => {
  const { api } = apiFor("profil-delete");
  assert.deepEqual(await api.profileDelete({ via: "account" }), { ok: true });
});

test("Gutschein: ohne Login, unbekannt, ok (Guthaben), Grenze, abgeschaltet", async () => {
  const want = { "gutschein-anonym": { ok: false, error: "login", status: 401 }, "gutschein-unbekannt": { ok: false, error: "unknown", status: 403 }, "gutschein-ok": { ok: true, added: 5, credit: 5 }, "gutschein-limit": { ok: false, error: "limit", status: 429 }, "gutschein-aus": { ok: false, error: "off", status: 503 } };
  for (const [n, w] of Object.entries(want)) { const { api, f } = apiFor(n); assert.deepEqual(await api.redeem("  CODE-1234 "), w, n); assert.equal(f.seen[0].body.code, "CODE-1234", "getrimmt"); }
});

test("Moderation: ohne Login, keine Hinweise, Hinweise (neueste zuerst), Widerspruch ok/leer/doppelt", async () => {
  let { api } = apiFor("mod-me-anonym");
  assert.equal((await api.modMe()).error, "login");
  ({ api } = apiFor("mod-me-leer"));
  assert.deepEqual(await api.modMe(), { ok: true, st: "ok", until: null, notices: [] });
  ({ api } = apiFor("mod-me-hinweise"));
  const r = await api.modMe();
  assert.deepEqual(r.notices.map((n) => n.type), ["strike", "card-hidden"]);
  const [strike, hidden] = r.notices;
  assert.equal(strike.ground, "harm"); assert.equal(strike.automated, false); assert.ok(strike.facts.lapses); assert.equal(strike.court, true);
  assert.equal(hidden.facts.down, 8); assert.equal(hidden.facts.share, 72); assert.equal(hidden.automated, true); assert.equal(hidden.appeal, null);
  ({ api } = apiFor("mod-me-nach-widerspruch"));
  assert.deepEqual((await api.modMe()).notices[1].appeal, { state: "open" });
  ({ api } = apiFor("mod-widerspruch-ok"));
  assert.deepEqual(await api.appeal(hidden.nid, "Text"), { ok: true });
  ({ api } = apiFor("mod-widerspruch-leer"));
  assert.equal((await api.appeal(hidden.nid, " ")).error, "leer");
  ({ api } = apiFor("mod-widerspruch-doppelt"));
  assert.equal((await api.appeal(hidden.nid, "x")).error, "doppelt");
});

test("Ehrliche Fehler: ohne Server-Seite (file://) kein Netzaufruf, offline = netz, kaputte Antwort = server", async () => {
  let calls = 0;
  const none = createApi({ location: { protocol: "file:", host: "" }, fetch: async () => { calls++; return null; } });
  for (const r of [await none.status(DEV), await none.profileGet({ via: "account" }), await none.redeem("ABCD"), await none.modMe(), await none.me("/duell", "de")]) assert.deepEqual(r, { ok: false, error: "nicht-hier" });
  assert.equal(calls, 0, "kein Aufruf ausserhalb der eigenen Seite");
  assert.equal(none.here, false);
  const off = createApi({ location: HERE, fetch: async () => { throw new TypeError("Failed to fetch"); } });
  assert.deepEqual(await off.status(DEV), { ok: false, error: "netz" });
  const bad = (body, status = 200) => createApi({ location: HERE, fetch: async () => ({ status, json: async () => body }) });
  assert.equal((await bad({ meter: { remaining: "7" } }).status(DEV)).error, "server", "falscher Typ");
  assert.equal((await bad({ meter: { remaining: 1, size: 1, period: "week", account: true, canLogin: true }, create: { x: 1 } }).status(DEV)).error, "server");
  assert.equal((await bad({ profile: { wall: [] }, rev: 1 }).profileGet({ via: "account" })).error, "server", "Profil ohne me");
  assert.equal((await bad({ ok: true }).redeem("ABCD")).error, "server", "ok ohne Zahlen ist kein ok");
  assert.equal((await bad({ st: "ok", notices: [{ nid: "x" }] }).modMe()).error, "server", "kaputter Hinweis");
  assert.equal((await bad({}, 500).status(DEV)).error, "server");
});
