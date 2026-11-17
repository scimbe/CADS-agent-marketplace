// Freie Karte 2, P4: Push-Abo der neuen App (src/broker/push-abo.js), Service Worker nur fuer Push und Klick
// (src/broker/push-sw.js) und der Ablauf auf dem Bau-Bildschirm: das Haekchen gilt erst nach Erlaubnis und Abo.
import test from "node:test";
import assert from "node:assert/strict";
import { createPushAbo, SW_FILE } from "../src/broker/push-abo.js";
import { installiere, mitteilung, ARTEN } from "../src/broker/push-sw.js";
import { createRuntime } from "../src/app/runtime.js";
import { OPS } from "../src/broker/klaerung.js";
import * as K from "../src/features/frei/klaerung.js";
import { makeKlaerenView } from "../src/features/frei/klaeren-view.js";
import { h } from "../src/ui/dom.js";

const MARK = "M".repeat(22), AUF = "B".repeat(22), KEY = "BAAAAA";
/** Browser-Double: Erlaubnis, Service Worker, Push-Dienst */
function win({ perm = "granted", push = true } = {}) {
  const seen = { register: [], subscribe: [] };
  const w = {
    location: { protocol: "https:", origin: "https://demos.example", pathname: "/duell", host: "demos.example" },
    Notification: { requestPermission: async () => perm },
    PushManager: push ? function PushManager() {} : undefined,
    navigator: { serviceWorker: { register: async (url, o) => { seen.register.push([url, o]); return { pushManager: { subscribe: async (x) => { seen.subscribe.push(x); return { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } }) }; } } }; } } }
  };
  return { w, seen };
}
const api = (calls, key = { status: 200, body: { on: true, key: KEY } }, sub = { status: 200, body: { mark: MARK, del: "d".repeat(30), days: 30 } }) => ({ raw: async (m, p, b) => { calls.push([m, p, b]); return p.endsWith("/key") ? key : sub; } });

test("Push-Abo: Erlaubnis, eigener Service Worker, VAPID vom Server, Abo beim Server -> Marke; sonst ehrlich warum nicht", async () => {
  const calls = [], { w, seen } = win();
  assert.deepEqual(await createPushAbo({ win: w, api: api(calls) }).abonnieren(), { how: "ok", mark: MARK });
  assert.deepEqual(seen.register, [["https://demos.example/duell/" + SW_FILE, { scope: "/duell" }]]);
  assert.equal(seen.subscribe[0].userVisibleOnly, true); assert.ok(seen.subscribe[0].applicationServerKey instanceof Uint8Array);
  assert.deepEqual(calls.map((c) => c.slice(0, 2)), [["GET", "/api/duell/push/key"], ["POST", "/api/duell/push/subscribe"]]);
  assert.deepEqual(calls[1][2].sub.keys, { p256dh: "p", auth: "a" });
  assert.deepEqual(await createPushAbo({ win: win({ perm: "denied" }).w, api: api([]) }).abonnieren(), { how: "verweigert" });
  assert.deepEqual(await createPushAbo({ win: win({ push: false }).w, api: api([]) }).abonnieren(), { how: "nicht-hier" });
  assert.deepEqual(await createPushAbo({ win: win().w, api: api([], { status: 200, body: { on: false } }) }).abonnieren(), { how: "fehler" }, "Server ohne VAPID");
  assert.deepEqual(await createPushAbo({ win: win().w, api: api([], undefined, { status: 429, body: {} }) }).abonnieren(), { how: "fehler" });
});

test("Service Worker: nur die drei Karten-Arten, Satz in der Sprache des Geraets, Klick oeffnet ?go=fertig&auftrag=<id>; kein fetch, kein Cache", async () => {
  const L = {}, shown = [], opened = [];
  const sw = { registration: { scope: "https://demos.example/duell", showNotification: async (t, o) => { shown.push([t, o]); } }, navigator: { language: "de-DE" }, location: { origin: "https://demos.example" },
    clients: { openWindow: async (u) => { opened.push(u); } }, addEventListener: (t, f) => { L[t] = f; } };
  installiere(sw);
  assert.deepEqual(Object.keys(L).sort(), ["notificationclick", "push"], "kein fetch-Handler");
  const waits = [];
  const ev = (data) => ({ data: { json: () => data }, waitUntil: (p) => waits.push(p) });
  L.push(ev({ r: "karte-fast", a: AUF })); await Promise.all(waits);
  assert.deepEqual(shown[0], ["Deine Karte ist fast fertig", { body: "Ein Punkt fehlt noch – abgebucht ist nichts.", tag: "mdi-" + AUF, data: { url: "https://demos.example/duell?go=fertig&auftrag=" + AUF } }]);
  L.push(ev({ r: "reply" })); L.push(ev({ r: "karte-fertig", a: "kurz" })); L.push({ data: { json: () => { throw new Error("x"); } }, waitUntil: () => {} });
  assert.equal(shown.length, 1, "andere Arten und kaputte Nachrichten zeigen nichts");
  let closed = 0;
  L.notificationclick({ notification: { close: () => closed++, data: shown[0][1].data }, waitUntil: (p) => waits.push(p) }); await Promise.all(waits);
  assert.deepEqual(opened, ["https://demos.example/duell?go=fertig&auftrag=" + AUF]); assert.equal(closed, 1);
  L.notificationclick({ notification: { close: () => {}, data: { url: "https://boese.example/" } }, waitUntil: (p) => waits.push(p) });
  assert.equal(opened.length, 1, "nur der eigene Ursprung");
  assert.equal(mitteilung({ r: "karte-nicht", a: AUF }, "en", "https://x.example/duell").titel, "Your card did not work out");
  assert.deepEqual([...ARTEN], ["karte-fertig", "karte-fast", "karte-nicht"]);
});

function fakeDienst(answers) {
  const calls = [], d = { calls };
  for (const op of OPS) d[op] = async (body) => { calls.push({ op, body }); const a = answers[op]; const v = Array.isArray(a) ? a.shift() : a; return typeof v === "function" ? v(body) : v || { how: "off" }; };
  return d;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const text = (v) => (typeof v === "string" ? v : v && v.children ? v.children.map(text).join("") : "");
const V = makeKlaerenView({ h, K });
const FRAGEN = { id: "A".repeat(22), verstehe: "ein Spiel.", fragen: [{ frage: "Wer bist du im Spiel?", hinweis: "", kacheln: [{ label: "Ein Segelboot", sub: "", emoji: "⛵" }, { label: "Eine Badeente", sub: "", emoji: "🦆" }] }] };
const LISTE = { titel: "Segelboot", verstehe: "Ein Spiel.", nicht: [], dauerMaxMin: 15, kosten: { guthaben: 1, nurBeiErfolg: true }, punkte: [
  { id: "p1", text: "Du steuerst ein Boot.", pruefung: "Links bewegt es." }, { id: "p2", text: "Tropfen fallen.", pruefung: "Feuer wirft." }, { id: "p3", text: "Es wird schneller.", pruefung: "Runde 2 schneller." }] };
/** echter Ablauf bis zum Bau-Bildschirm (Server: Bau wartet, Push und Mail zustellbar) */
async function zumBau(abo) {
  const klaerung = fakeDienst({ an: { how: "ok", body: { on: true } }, fragen: { how: "ok", body: FRAGEN }, liste: { how: "ok", body: LISTE },
    auftrag: { how: "ok", body: { auftrag: AUF, status: "bestaetigt", bau: "wartet", kanaele: { push: true, mail: true } } },
    optin: (b) => ({ how: "ok", body: { optin: { push: b.push, mail: b.mail }, kanaele: { push: true, mail: true } } }) });
  const rt = createRuntime({ lang: "de", entropy: () => "e".repeat(32), schedule: (f) => f(), onChange: () => {}, storage: { loadKonto: () => null, saveKonto: () => true, loadFeature: () => null, saveFeature: () => true },
    klaerung, pushAbo: abo, api: { loginHref: (r) => "/gate?r=" + r, status: async () => ({ ok: true, canLogin: true, account: false }), me: async () => ({ ok: false }) } });
  rt.dispatch({ type: "FREI" }); await tick(); rt.dispatch({ type: "KLAEREN" });
  rt.dispatch({ type: "K_TEXT", value: "Boot gegen Wolken" }); rt.dispatch({ type: "K_GO" }); await tick();
  rt.dispatch({ type: "K_PICK", kachel: 0 }); rt.dispatch({ type: "K_WEITER" }); await tick();
  rt.dispatch({ type: "K_JA" }); await tick();
  assert.ok(rt.matches("inhalt.frei.kbauen"));
  return { rt, klaerung, k: () => rt.state.ctx.frei.k };
}

test("Bau-Bildschirm: das Push-Haekchen gilt erst nach Erlaubnis und Abo; verweigert bleibt es leer, mit ehrlichem Satz", async () => {
  let resolve;
  const { rt, klaerung, k } = await zumBau({ abonnieren: () => new Promise((r) => { resolve = r; }) });
  rt.dispatch({ type: "K_OPTIN", kanal: "push", on: true });
  assert.equal(k().pushSt, "frage"); assert.deepEqual(k().optin, { push: false, mail: false }, "noch nicht angehakt");
  assert.ok(!klaerung.calls.some((c) => c.op === "optin"), "kein Opt-in vor der Erlaubnis");
  assert.match(text({ children: V.klaerenView(rt.state, () => {}, "kbauen").body }), /Dein Browser fragt gleich/);
  resolve({ how: "ok", mark: MARK }); await tick(); await tick();
  assert.deepEqual(klaerung.calls.at(-1), { op: "optin", body: { auftrag: AUF, push: true, mail: false, mark: MARK } });
  assert.deepEqual(k().optin, { push: true, mail: false }); assert.equal(k().pushMark, MARK);
  rt.dispatch({ type: "K_OPTIN", kanal: "mail", on: true }); await tick();
  assert.deepEqual(klaerung.calls.at(-1).body, { auftrag: AUF, push: true, mail: true, mark: MARK }, "die Marke bleibt beim naechsten Opt-in dabei");
  const b = await zumBau({ abonnieren: async () => ({ how: "verweigert" }) });
  b.rt.dispatch({ type: "K_OPTIN", kanal: "push", on: true }); await tick();
  assert.equal(b.k().pushSt, "verweigert"); assert.deepEqual(b.k().optin, { push: false, mail: false });
  assert.ok(!b.klaerung.calls.some((c) => c.op === "optin"));
  assert.match(text({ children: V.klaerenView(b.rt.state, () => {}, "kbauen").body }), /Mitteilungen sind in diesem Browser nicht erlaubt/);
});
