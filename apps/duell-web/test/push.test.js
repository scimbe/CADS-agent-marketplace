"use strict";
// "Bescheid geben" (src/push.js, src/push-sw.js): which channel a device has, nothing before our own "Ja", only the
// subscription goes to the server, off removes everything, the service worker shows only the kind.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const P = require("../src/push.js");

const KEY = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";

/** A browser with push: records every call so the tests can say what happened and in which order. */
function browser({ perm = "default", answer = "granted", server = { on: true, key: KEY } } = {}) {
  const log = [], store = {};
  let sub = null;
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: "p", auth: "a" } }; }, async unsubscribe() { log.push("sub.unsubscribe"); sub = null; return true; } };
  const pushManager = { async getSubscription() { return sub; }, async subscribe(o) { log.push(["pm.subscribe", o.userVisibleOnly, o.applicationServerKey.length]); sub = subscription; return sub; } };
  const Notification = { permission: perm, async requestPermission() { log.push("requestPermission"); Notification.permission = answer; return answer; } };
  const nav = { serviceWorker: { async register(url, o) { log.push(["register", url, o.scope]); return { pushManager }; }, async getRegistration(scope) { log.push(["getRegistration", scope]); return { pushManager }; } } };
  let n = 0;
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    log.push(["fetch", url.replace("https://demos-34a13a96.bunsenbrenner.org", ""), body]);
    assert.equal(init.credentials, "omit", "never a cookie");
    if (url.endsWith("/key")) return { status: 200, json: async () => server };
    if (url.endsWith("/subscribe")) { n++; return { status: 200, json: async () => ({ mark: body.mark || "M".repeat(21) + n, del: body.del || "D".repeat(30), days: 30 }) }; }
    if (url.endsWith("/wake")) return { status: 202, json: async () => ({ ok: true }) };
    return { status: 200, json: async () => ({ ok: true }) };
  };
  const win = { PushManager: function () {}, Notification, matchMedia: () => ({ matches: false }) };
  const api = P.make({ nav, win, loc: { pathname: "/duell" }, fetch, store: () => store, save: () => log.push("save"), api: "https://demos-34a13a96.bunsenbrenner.org/api/duell/config" });
  return { api, log, store, nav, win, setSub: (s) => { sub = s; }, subscription };
}

test("Kanal: App-Huelle nach Bruecke v1, sonst none; Browser mit Push; iPhone im Safari-Tab braucht den Home-Bildschirm", () => {
  const host = (j) => ({ push: () => j });
  assert.deepEqual(P.channel({ host: host('{"v":1,"kind":"fcm","state":"granted"}') }), { via: "host", kind: "fcm", state: "granted" });
  assert.deepEqual(P.channel({ host: host('{"v":1,"kind":"none","state":"unsupported"}') }), { via: "none", why: "app" });
  assert.deepEqual(P.channel({ host: host('{"v":2,"kind":"fcm"}') }), { via: "none", why: "app" }, "unknown bridge version counts as none");
  assert.deepEqual(P.channel({ host: host("kaputt") }), { via: "none", why: "app" });
  assert.deepEqual(P.channel({ host: { share() {} } }), { via: "none", why: "app" }, "a shell without push(): a WebView has no Web Push");
  const b = browser();
  assert.deepEqual(P.channel({ nav: b.nav, win: b.win }), { via: "webpush", state: "default" });
  // Safari on iPhone/iPad in a tab: navigator.standalone exists and is false, PushManager is missing until it is installed
  assert.deepEqual(P.channel({ nav: { standalone: false }, win: { matchMedia: () => ({ matches: false }) } }), { via: "none", why: "install" });
  assert.deepEqual(P.channel({ nav: {}, win: {} }), { via: "none", why: "browser" });
  assert.deepEqual(P.channel({ nav: { standalone: true, serviceWorker: {} }, win: { PushManager: 1, Notification: { permission: "granted" } } }), { via: "webpush", state: "granted" }, "installed on the home screen (iOS >= 16.4)");
});

test("Einschalten: erst nach unserem Ja fragt das System; zum Server geht nur das Abo, zurueck kommt Marke und Loeschschluessel", async () => {
  const b = browser();
  assert.deepEqual(b.log, [], "making the API asks nothing and sends nothing");
  assert.equal(await b.api.enable(), "on");
  assert.equal(b.log[0], "requestPermission");
  assert.deepEqual(b.log.find((x) => x[0] === "register"), ["register", "/duell/push-sw.js", "/duell"]);
  assert.deepEqual(b.log.find((x) => x[0] === "pm.subscribe"), ["pm.subscribe", true, 65]);
  const sent = b.log.find((x) => x[0] === "fetch" && x[1] === "/api/duell/push/subscribe")[2];
  assert.deepEqual(Object.keys(sent), ["sub"], "no name, no card, no text");
  assert.deepEqual(Object.keys(sent.sub).sort(), ["endpoint", "expirationTime", "keys"]);
  assert.equal(b.api.on(), true);
  assert.match(b.api.mark(), /^[A-Za-z0-9_-]{22}$/);
});

test("Ablehnen beim System: kein Schluessel geholt, nichts registriert, nichts gesendet", async () => {
  const b = browser({ answer: "denied" });
  assert.equal(await b.api.enable(), "denied");
  assert.deepEqual(b.log, ["requestPermission"]);
  const blocked = browser({ perm: "denied" });
  assert.equal(await blocked.api.enable(), "denied");
  assert.deepEqual(blocked.log, [], "already blocked: not even the prompt");
  assert.equal(blocked.api.on(), false);
});

test("Server ohne Schluessel: off, kein Abo beim Push-Dienst", async () => {
  const b = browser({ server: { on: false } });
  assert.equal(await b.api.enable(), "off");
  assert.ok(!b.log.some((x) => x[0] === "pm.subscribe" || x[0] === "register"));
});

test("Erneuern behaelt die Marke; Recht entzogen: alles weg; Ausschalten loescht Server, Abo und Geraet", async () => {
  const b = browser();
  await b.api.enable();
  const mark = b.api.mark();
  assert.equal(await b.api.renew(), "on");
  const again = b.log.filter((x) => x[0] === "fetch" && x[1] === "/api/duell/push/subscribe").pop()[2];
  assert.equal(again.mark, mark); assert.ok(again.del);
  assert.equal(b.api.mark(), mark);
  assert.equal(await b.api.disable(), "off");
  assert.deepEqual(b.log.filter((x) => x[0] === "fetch").pop(), ["fetch", "/api/duell/push/unsubscribe", { mark, del: again.del }]);
  assert.ok(b.log.includes("sub.unsubscribe"));
  assert.equal(b.store.push, undefined);
  const gone = browser({ perm: "granted" });
  gone.store.push = { mark: "x".repeat(22), del: "y".repeat(30) };
  gone.win.Notification.permission = "denied";
  assert.equal(await gone.api.renew(), "off");
  assert.equal(gone.store.push, undefined);
});

test("Wecken: nur Marke und eine der zwei Arten", async () => {
  const b = browser();
  assert.equal(await b.api.wake("A".repeat(22), "reply"), true);
  assert.deepEqual(b.log.pop(), ["fetch", "/api/duell/push/wake", { mark: "A".repeat(22), r: "reply" }]);
  for (const r of ["streak", "reminder", ""]) assert.equal(await b.api.wake("A".repeat(22), r), false, r);
  assert.equal(await b.api.wake("kurz", "live"), false);
  assert.equal(b.log.length, 0);
});

test("Service Worker: zeigt nur einen Satz nach Art in der Geraetesprache, Unbekanntes neutral, Tippen oeffnet /duell", async () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/push-sw.js"), "utf8");
  assert.ok(!/addEventListener\("fetch"/.test(src), "no fetch handler: the page loads as without it");
  const on = {}, shown = [], opened = [];
  const self = { navigator: { language: "de-DE" }, addEventListener: (n, f) => { on[n] = f; }, skipWaiting() {}, registration: { scope: "https://demos-34a13a96.bunsenbrenner.org/duell", showNotification: (t, o) => { shown.push([t, o.body, o.tag]); return Promise.resolve(); } }, clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (u) => { opened.push(u); } } };
  vm.runInNewContext(src, { self, URL });
  const push = async (data) => { let w; on.push({ data, waitUntil: (p) => { w = p; } }); await w; };
  await push({ json: () => ({ r: "reply", name: "Mira", text: "geheim" }) });
  await push({ json: () => ({ r: "live" }) });
  await push({ json: () => ({ r: "streak" }) });
  await push(null);
  assert.deepEqual(shown.map((s) => s[1]), ["Jemand hat auf deine Karte geantwortet.", "Deine Live-Einladung wurde angenommen.", "Es gibt etwas Neues für dich.", "Es gibt etwas Neues für dich."]);
  assert.ok(!shown.some((s) => /Mira|geheim/.test(s[1])), "whatever else a payload carries is never shown");
  let w; on.notificationclick({ notification: { close() {} }, waitUntil: (p) => { w = p; } }); await w;
  assert.deepEqual(opened, ["/duell"]);
});

test("Texte: jede pu_-Zeile in de und en, der Build legt sie in den Teil push und den Service Worker neben die Seite", () => {
  const T = require("../src/texts.json"), src = fs.readFileSync(path.join(__dirname, "../src/push.js"), "utf8");
  const used = new Set((src.match(/"pu_[a-z_]+"/g) || []).map((s) => s.slice(1, -1)).filter((k) => !k.endsWith("_")));
  for (const w of ["app", "install", "browser"]) used.add("pu_none_" + w);
  for (const r of ["on", "denied", "off", "none", "error"]) used.add("pu_res_" + r);
  for (const k of used) for (const l of ["de", "en"]) assert.ok(T[l][k], l + " " + k);
  const build = fs.readFileSync(path.join(__dirname, "../scripts/build.js"), "utf8");
  assert.match(build, /push: \/\^pu_\//);
  assert.match(build, /put\("push-sw\.js"/);
});
