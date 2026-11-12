// Konto in den App-Huellen (src/broker/native.js + api.js + Laufzeit): die Huelle meldet an und fuehrt die Aufrufe mit Bearer
// aus; die Seite sieht kein Token. Die Antworten des Servers sind dieselben Aufnahmen wie im Web (test/fixtures), nur der
// Transport ist die Bruecke. Beide Kanaele (iOS-Promise, Android-WebMessageListener) laufen durch dieselben Faelle.
import test from "node:test";
import assert from "node:assert/strict";
import { nativeAccount } from "../src/broker/native.js";
import { createApi } from "../src/broker/api.js";
import { createRuntime } from "../src/app/runtime.js";
import { machine, initialContext } from "../src/app/machine.js";
import { actionsOf } from "../src/ui/view.js";
import { REC, ex } from "./wrapper.js";
import { counter } from "./helpers.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEV = REC.device, T0 = Date.UTC(2026, 10, 11, 9);

/** Falsche Huelle: Zustand wie die echte (angemeldet ja/nein), Server-Antworten aus den Aufnahmen. */
function shell({ available = true, appLogin = true, signedIn = false, cancel = false } = {}) {
  const S = { available, appLogin, signedIn, calls: [], profile: null };
  function answer(req) {
    S.calls.push(req.op === "api" ? req.method + " " + req.path : req.op);
    assert.equal(req.v, 1);
    if (req.op === "state") return { v: 1, ok: true, available: S.available, signedIn: S.signedIn };
    if (req.op === "login") { if (!cancel) S.signedIn = true; return { v: 1, ok: true, signedIn: S.signedIn }; }
    if (req.op === "logout") { S.signedIn = false; return { v: 1, ok: true, signedIn: false }; }
    if (req.op !== "api") return { v: 1, ok: false, error: "refused" };
    assert.ok(!/[?#]/.test(req.path), "Pfad ohne Query: " + req.path);
    const body = req.body === undefined ? undefined : JSON.parse(req.body);
    let name;
    if (req.path === "/auth/me") return { v: 1, ok: true, status: 200, body: JSON.stringify({ authenticated: S.signedIn, login_url: "https://bunsenbrenner.org/gate/start?host=x&return=%2F", app_login: S.appLogin }) };
    if (req.path === "/api/duell/ai/status") name = S.signedIn ? (S.profile ? "status-angemeldet-16" : "status-angemeldet-ohne-16") : "status-anonym";
    else if (req.path === "/api/duell/profile/get") name = S.signedIn ? (S.profile ? "profil-get-da" : "profil-get-leer") : "profil-get-anonym-konto";
    else if (req.path === "/api/duell/profile/put") { assert.equal(body.via, "account"); name = body.age16 ? "profil-put-mit-16" : "profil-put-ohne-16"; if (body.age16) S.profile = true; }
    else if (req.path === "/api/duell/mod/me") name = S.signedIn ? "mod-me-leer" : "mod-me-anonym";
    else return { v: 1, ok: false, error: "refused" };
    const e = ex(name);
    return { v: 1, ok: true, status: e.res.status, body: JSON.stringify(e.res.body) };
  }
  // iOS: DuellHost.account(req) -> Promise; Android: MdiAccount.postMessage(JSON) -> message-Ereignis
  const ios = { DuellHost: { account: async (req) => answer(req) } };
  const listeners = [];
  const android = { MdiAccount: { addEventListener: (t, f) => { assert.equal(t, "message"); listeners.push(f); },
    postMessage: (s) => { const req = JSON.parse(s); setTimeout(() => { const r = { ...answer(req), id: req.id }; for (const f of listeners) f({ data: JSON.stringify(r) }); }, 1); } } };
  return { S, ios, android };
}

test("Kanal: ohne Bruecke null (Web); iOS und Android liefern dieselben Antworten; fremde/kaputte Antworten werden Fehler", async () => {
  assert.equal(nativeAccount({}), null);
  assert.equal(nativeAccount(null), null);
  assert.equal(nativeAccount({ DuellHost: { share() {} } }), null, "alte Huelle ohne account: Web-Verhalten");
  for (const k of ["ios", "android"]) {
    const sh = shell(), n = nativeAccount(sh[k]);
    assert.deepEqual(await n.call({ op: "state" }), { v: 1, ok: true, available: true, signedIn: false, ...(k === "android" ? { id: 1 } : {}) });
    const [a, b] = await Promise.all([n.call({ op: "login" }), n.call({ op: "state" })]);
    assert.equal(a.signedIn, true, k); assert.equal(b.ok, true, k);
  }
  assert.deepEqual(await nativeAccount({ DuellHost: { account: async () => "kaputt" } }).call({ op: "state" }), { ok: false, error: "refused" });
  assert.deepEqual(await nativeAccount({ DuellHost: { account: async () => { throw new Error("x"); } } }).call({ op: "state" }), { ok: false, error: "refused" });
  const slow = nativeAccount({ DuellHost: { account: () => new Promise(() => {}) } }, { timeout: 20 });
  assert.deepEqual(await slow.call({ op: "api", method: "POST", path: "/api/duell/ai/status" }), { ok: false, error: "netz" });
  // Android: eine Antwort mit fremder id wird ignoriert, nicht einer anderen Anfrage zugeordnet
  const L = [];
  const odd = nativeAccount({ MdiAccount: { addEventListener: (t, f) => L.push(f), postMessage: (s) => { const id = JSON.parse(s).id; setTimeout(() => { for (const f of L) { f({ data: JSON.stringify({ id: id + 99, ok: true }) }); f({ data: "kein json" }); f({ data: JSON.stringify({ id, ok: true, signedIn: false }) }); } }, 1); } } });
  assert.deepEqual(await odd.call({ op: "state" }), { id: 1, ok: true, signedIn: false });
});

test("API ueber die Bruecke: gleiche Abbildung wie im Web; Anmelden nur, wenn Server (app_login) UND Huelle es koennen", async () => {
  for (const k of ["ios", "android"]) {
    let sh = shell(), api = createApi({ location: { protocol: "file:", host: "" }, native: nativeAccount(sh[k]) });
    assert.equal(api.here, true, "Datei-Seite in der App hat einen Server");
    let r = await api.status(DEV);
    assert.deepEqual([r.ok, r.account, r.canLogin, r.app], [true, false, true, true], k);
    assert.deepEqual(sh.S.calls, ["POST /api/duell/ai/status", "state", "GET /auth/me"]);
    sh = shell({ appLogin: false }); api = createApi({ native: nativeAccount(sh[k]) });
    assert.equal((await api.status(DEV)).canLogin, false, "Server ohne App-Anmeldung: kein Anmelde-Knopf");
    sh = shell({ available: false }); api = createApi({ native: nativeAccount(sh[k]) });
    assert.equal((await api.status(DEV)).canLogin, false, "Huelle ohne OIDC-Konfiguration: kein Anmelde-Knopf");
    sh = shell({ signedIn: true }); api = createApi({ native: nativeAccount(sh[k]) });
    assert.equal((await api.status(DEV)).account, true);
    assert.deepEqual(await api.profileGet({ via: "account" }), { ok: true, profile: null, rev: 0, gone: false, age18: false });
    assert.deepEqual(await api.me("/duell?go=konto", "de"), { ok: true, authenticated: true, logoutUrl: null, appLogin: true });
    assert.deepEqual(await api.app.logout(), { ok: true, signedIn: false });
    assert.deepEqual(await api.profileGet({ via: "account" }), { ok: false, error: "login", status: 401 });
  }
  const broken = createApi({ native: { call: async () => ({ ok: false, error: "refused" }) } });
  assert.deepEqual(await broken.modMe(), { ok: false, error: "server" });
  const offline = createApi({ native: { call: async () => ({ ok: false, error: "netz" }) } });
  assert.deepEqual(await offline.modMe(), { ok: false, error: "netz" });
  assert.equal(createApi({ location: { protocol: "file:" } }).app, null, "ohne Bruecke kein App-Weg");
});

function runtime(sh) {
  const store = { k: JSON.stringify({ device: DEV }) };
  const nav = [];
  const rt = createRuntime({ lang: "de", entropy: counter("e"), api: createApi({ native: nativeAccount(sh.ios) }),
    storage: { saveGame() {}, loadGame: () => null, loadKonto: () => JSON.parse(store.k), saveKonto: (v) => { store.k = JSON.stringify(v); } },
    navigate: (u) => { nav.push(u); return true; }, setLook: () => nav.push("look"),
    live: () => Promise.reject(new Error("x")), share: async () => false, clearUrl() {}, schedule: (f) => setTimeout(f, 0), onChange() {}, now: () => T0 + 1000 });
  return { rt, nav, store };
}
const until = async (f) => { for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 2)); assert.ok(f()); };

test("Laufzeit in der App: Anmelden ueber die Huelle (kein Seitenwechsel), Profil mit 16+, Abmelden ueber die Huelle", async () => {
  const sh = shell(), { rt, nav } = runtime(sh);
  await until(() => rt.matches("konto.anonym"));
  rt.dispatch({ type: "STIL" });
  assert.equal(actionsOf(rt.state).primary.id, "login", "Anmelden statt „geht im Browser“");
  rt.dispatch({ type: "AGE16", on: true });
  rt.dispatch({ type: "LOGIN" });
  await until(() => rt.matches("konto.angemeldet") && rt.state.ctx.profil.sync === "ok");
  assert.deepEqual(nav, [], "kein navigate, kein ct_look-Cookie: die Huelle meldet an");
  assert.ok(sh.S.calls.includes("login"));
  assert.ok(sh.S.calls.includes("POST /api/duell/profile/put"), "Profil mit 16+ angelegt");
  assert.equal(rt.state.ctx.konto.st.app, true);
  rt.dispatch({ type: "LOGOUT" });
  await until(() => rt.matches("konto.anonym"));
  assert.equal(sh.S.signedIn, false); assert.deepEqual(nav, []);
  assert.equal(rt.state.ctx.profil.via, null, "Konto-Verknuepfung getrennt");
});

test("Laufzeit in der App: abgebrochene Anmeldung -> wieder anonym mit Hinweis; kaputte Bruecke -> ehrlicher Fehler", async () => {
  const sh = shell({ cancel: true }), { rt } = runtime(sh);
  await until(() => rt.matches("konto.anonym"));
  rt.dispatch({ type: "AGE16", on: true }); rt.dispatch({ type: "LOGIN" });
  await until(() => rt.matches("konto.anonym") && rt.state.ctx.konto.note === "pending");
  // Bruecke antwortet beim Anmelden nicht ok -> fehler „nicht-hier“ (kein toter Knopf)
  let s = machine.initial(initialContext("de", { device: DEV }));
  s = machine.send(s, { type: "STATUS", result: { ok: true, account: false, canLogin: true, ki: { enabled: true, remaining: 7, size: 7, period: "week", resetAt: null }, karte: null, app: true }, at: T0, rand: ["a", "b", "c", "d"] });
  s = machine.send(s, { type: "AGE16", on: true, at: T0, rand: ["a", "b", "c", "d"] });
  s = machine.send(s, { type: "LOGIN", at: T0, rand: ["a", "b", "c", "d"] });
  assert.ok(machine.matches(s, "konto.anmelden"));
  s = machine.send(s, { type: "NAV_FAIL", reason: "nicht-hier", at: T0, rand: ["a", "b", "c", "d"] });
  assert.ok(machine.matches(s, "konto.fehler"));
});

test("Konto-Bruecke: EINE exakte Liste (29 Aufrufe) aus bridge-account-v1.json, generiert fuer iOS und Android, nicht von Hand veraendert", () => {
  const apps = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const fx = JSON.parse(fs.readFileSync(path.join(apps, "android/app/src/test/resources/bridge-account-v1.json"), "utf8")).route;
  const want = fx.filter((c) => c.ok).map((c) => c.method + " " + c.path).sort();
  assert.equal(want.length, 29);
  const listed = (f) => [...fs.readFileSync(path.join(apps, f), "utf8").matchAll(/^\s+"((?:GET|POST) [^"]+)",$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(listed("ios/App/Duell/AccountRoutes.generated.swift"), want, "iOS veraltet: python3 -I apps/gen-account-routes.py");
  assert.deepEqual(listed("android/app/src/main/java/org/bunsenbrenner/cads/duell/AccountRoutes.kt"), want, "Android veraltet");
  const cases = fs.readFileSync(path.join(apps, "ios/Tests/AccountRouteCases.generated.swift"), "utf8");
  assert.equal((cases.match(/^\s+\("/gm) || []).length, fx.length, "iOS-Testfaelle veraltet");
  // jeder Pfad, den apps/mdi aufruft, steht in der Liste
  const api = fs.readFileSync(path.join(apps, "mdi/src/broker/api.js"), "utf8");
  for (const p of [...api.matchAll(/post\("(\/[a-z/]+)"/g)].map((m) => "POST /api/duell" + m[1])) assert.ok(want.includes(p), p);
  assert.ok(want.includes("GET /auth/me"));
});

// Security-Review M6: jeder Aufruf, den die Seite in der App macht, steht EXAKT in der Liste der Huellen (Drift-Test).
// Die Seite ruft jede Server-Funktion des API-Moduls einmal ueber eine falsche Bruecke auf, die nur aufzeichnet.
test("Konto-Bruecke Drift: jeder Aufruf der Seite (Konto, KI, Deck, Gate, Bild, Melden, Kurzlinks) ist erlaubt; Abfragen gehen ueber feste Pfade", async () => {
  const { createApi, appRoute } = await import("../src/broker/api.js");
  const apps = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const want = new Set(JSON.parse(fs.readFileSync(path.join(apps, "android/app/src/test/resources/bridge-account-v1.json"), "utf8")).route.filter((c) => c.ok).map((c) => c.method + " " + c.path));
  const seen = [];
  const native = { call: async (req) => { if (req.op === "api") seen.push(req.method + " " + req.path); if (req.op === "state") return { ok: true, available: true }; return { ok: true, status: 200, body: "{}" }; } };
  const api = createApi({ location: { protocol: "file:", host: "" }, native });
  const cid = "A".repeat(22), h = "B".repeat(43), sid = "abcdefgh";
  await api.status("ab".repeat(16)); await api.me("/duell", "de");
  await api.profileGet({ via: "account" }); await api.profilePut({ via: "account" }, { rev: 0, profile: {} }); await api.profileDelete({ via: "account" });
  await api.redeem("CODE-1234"); await api.modMe(); await api.appeal("n-abcdef", "x");
  if (api.shortCreate) { await api.shortCreate("v2.card.x", "card", "de"); await api.shortDelete(sid, "tok-1"); await api.shortResolve(sid); }
  for (const [m, p] of [["POST", "/api/duell/ai"], ["POST", "/api/duell/ai/accept"], ["POST", "/api/duell/ai/discard"], ["POST", "/api/duell/queue"], ["POST", "/api/duell/report"],
    ["GET", "/api/duell/deck"], ["GET", "/api/duell/deck/key"], ["GET", "/api/duell/deck/status?c=" + cid], ["GET", "/api/duell/deck/status?c=" + cid + "&d=" + h],
    ["POST", "/api/duell/deck/use"], ["POST", "/api/duell/deck/vote"], ["POST", "/api/duell/deck/me"],
    ["POST", "/api/duell/bild/status"], ["POST", "/api/duell/bild"], ["POST", "/api/duell/bild/job"], ["POST", "/api/duell/bild/cancel"], ["POST", "/api/duell/bild/keep"], ["POST", "/api/duell/bild/avatar"]]) {
    const r = await api.raw(m, p, m === "POST" ? {} : undefined);
    assert.ok(r.status === 200, m + " " + p + ": " + JSON.stringify(r));
  }
  for (const x of seen) assert.ok(want.has(x), "nicht in der Liste der Huellen: " + x);
  assert.ok(!seen.some((x) => x.includes("?")), "keine Abfrage durch die Bruecke");
  // Abfrage und Kopf gehen nie still verloren
  assert.deepEqual(appRoute("GET", "/api/duell/deck/status?c=" + cid + "&d=" + h), { method: "POST", path: "/api/duell/deck/status", body: { c: cid, d: h } });
  assert.deepEqual(appRoute("DELETE", "/api/s/" + sid, undefined, { headers: { Authorization: "Bearer tok-1" } }), { method: "POST", path: "/api/s/delete", body: { id: sid, token: "tok-1" } });
  assert.equal(appRoute("GET", "/api/duell/ai/status?x=1"), null);
  assert.equal(appRoute("POST", "/api/duell/ai", {}, { headers: { "X-Foo": "1" } }), null);
});
