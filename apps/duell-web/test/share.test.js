"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const S = require("../src/shortlink.js");
const Card = require("../src/statuscard.js");
const qrcode = require("qrcode-generator");
const jsQR = require("jsqr");

const F = "c=eyJ2IjoxfQ", LONG = C.SHARE_BASE + "#" + F, ID = "aB3dE5gH", N = 1000;
const ok = (over) => async () => ({ status: 201, json: async () => ({ id: ID, url: C.SHORT_BASE + ID, token: "tok", exp: N + 90 * 86400000, ...over }) });

test("kuerzen: nur c= und i=, p= und alles andere geht nie an den Dienst", async () => {
  let calls = 0; const f = async () => { calls++; throw new Error("x"); };
  for (const u of [C.SHARE_BASE + "#p=geheim", C.SHARE_BASE, C.SHARE_BASE + "#c=a&p=b", C.SHARE_BASE + "#x=1"]) {
    assert.deepEqual(await S.shorten(u, {}, {}, { fetch: f }), { url: u, short: false }, u);
  }
  assert.equal(calls, 0);
  assert.equal(S.fragmentOf(C.SHARE_BASE + "#i=quiz-chaos"), "i=quiz-chaos");
});

test("kuerzen: Erfolg merkt id und Loeschtoken lokal, derselbe Link fragt nicht noch einmal", async () => {
  const store = {}; let n = 0, sent;
  const f = async (u, o) => { n++; sent = { u, o }; return ok()(); };
  const r = await S.shorten(LONG, { k: "game", n: 7, l: "de" }, store, { fetch: f, now: () => N });
  assert.deepEqual(r, { url: "https://bunsenbrenner.org/s/" + ID, short: true, id: ID });
  assert.equal(sent.u, "https://demos-34a13a96.bunsenbrenner.org/api/s");
  assert.deepEqual(JSON.parse(sent.o.body), { f: F, k: "game", n: 7, l: "de" });
  assert.equal(sent.o.credentials, "omit");
  assert.equal(store.links[0].t, "tok");
  await S.shorten(LONG, {}, store, { fetch: f, now: () => N + 5 });
  assert.equal(n, 1);
});

test("Rueckfall: Netzfehler, Timeout-Abbruch, 429, 503 und kaputte Antworten behalten den langen Link", async () => {
  const bad = [async () => { throw new Error("net"); }, async () => { throw Object.assign(new Error("a"), { name: "AbortError" }); },
    async () => ({ status: 429, json: async () => ({}) }), async () => ({ status: 503, json: async () => ({}) }), async () => ({ status: 201, json: async () => { throw 1; } }),
    ok({ id: "nope" }), ok({ url: "https://evil.example/s/" + ID }), ok({ token: 5 })];
  for (const f of bad) {
    const store = {};
    assert.deepEqual(await S.shorten(LONG, {}, store, { fetch: f, now: () => N }), { url: LONG, short: false });
    assert.equal(store.links.length, 0);
  }
});

test("lokale Liste: Abgelaufenes faellt raus, hoechstens 30 Eintraege, Unsinn wird ignoriert", async () => {
  assert.deepEqual(S.kept([null, 5, { id: "x", t: "t", exp: 9 }, { id: ID, t: "t", exp: 1 }], 2), []);
  assert.deepEqual(S.kept("x", 2), []);
  const store = { links: Array.from({ length: 30 }, (_, i) => ({ id: "22222" + "abc"[i % 3] + "abc"[(i / 3 | 0) % 3] + "abc"[(i / 9 | 0) % 3], t: "t", exp: 1e15, f: "c=" + i })) };
  await S.shorten(LONG, {}, store, { fetch: ok({ exp: 1e15 }), now: () => N });
  assert.equal(store.links.length, 30); assert.equal(store.links[0].id, ID);
});

test("loeschen: mit Token; schon weg zaehlt als erledigt; offline bleibt der Eintrag", async () => {
  const mk = () => ({ links: [{ id: ID, t: "tok", exp: 1e15, f: F }] });
  let sent; const s = mk();
  assert.equal(await S.remove(ID, s, { fetch: async (u, o) => { sent = { u, o }; return { status: 204 }; } }), true);
  assert.equal(sent.o.method, "DELETE"); assert.equal(sent.o.headers.Authorization, "Bearer tok"); assert.ok(sent.u.endsWith("/api/s/" + ID));
  assert.deepEqual(s.links, []);
  for (const st of [404, 410]) { const x = mk(); assert.equal(await S.remove(ID, x, { fetch: async () => ({ status: st }) }), true); assert.equal(x.links.length, 0); }
  for (const f of [async () => ({ status: 403 }), async () => ({ status: 503 }), async () => { throw 1; }]) { const x = mk(); assert.equal(await S.remove(ID, x, { fetch: f }), false); assert.equal(x.links.length, 1); }
  assert.equal(await S.remove("22222222", mk(), { fetch: async () => ({ status: 204 }) }), false);
});

test("oeffnen: #s=<id> in der App-Huelle, nur gueltige ids und Fragmente", async () => {
  assert.deepEqual(D.parseRoute("#s=" + ID), { type: "short", id: ID });
  for (const h of ["#s=short", "#s=aB3dE5g0", "#s=" + ID + "&c=x"]) assert.equal(D.parseRoute(h), null, h);
  assert.equal(await S.resolve(ID, { fetch: async () => ({ status: 200, json: async () => ({ f: F }) }) }), F);
  for (const f of [async () => ({ status: 410 }), async () => ({ status: 404 }), async () => { throw 1; }, async () => ({ status: 200, json: async () => ({ f: "p=geheim" }) })]) assert.equal(await S.resolve(ID, { fetch: f }), null);
  assert.equal(await S.resolve("x", { fetch: async () => { throw new Error("nie"); } }), null);
});

// Pixel wie auf dem Bild: Module als Quadrate mit Ruhezone, ein echter Decoder liest sie zurueck.
function pixels(m, s) {
  const n = (m.length + 8) * s, d = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) { const i = ((y + 4) * s + a) * n * 4 + ((x + 4) * s + b) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
  return { d, n };
}
test("QR: jsQR liest die Kurzlinks zurueck, Groesse passt auf 300 Pixel mit ganzen Modulen", () => {
  for (let i = 0; i < 40; i++) {
    const id = Array.from({ length: 8 }, (_, j) => "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"[(i * 7 + j * 13) % 56]).join("");
    const url = C.SHORT_BASE + id, m = Card.qrMatrix(url, qrcode);
    const s = Math.floor(300 / (m.length + 8)); assert.ok(s >= 7, "Modul " + s + " Pixel");
    const { d, n } = pixels(m, s), r = jsQR(d, n, n);
    assert.ok(r, url); assert.equal(r.data, url);
  }
});

test("Adresse auf dem Bild: Kopf und id getrennt, Rueckfall ohne id", () => {
  assert.deepEqual(Card.splitUrl("https://bunsenbrenner.org/s/" + ID), { head: "bunsenbrenner.org/s/", id: ID });
  assert.deepEqual(Card.splitUrl("https://bunsenbrenner.org/duell"), { head: "bunsenbrenner.org/duell", id: "" });
});
