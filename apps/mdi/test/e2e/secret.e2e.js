// Abnahme D0: "gegnerische Hand aus Geraet, Link oder Netz lesen" muss scheitern.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, waitScreen, screen } from "./lib/grund.mjs";
import { pickMode, pickSeat, turnLink, turnLive } from "./lib/scenarios.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const HEX32 = /[0-9a-f]{32}/g;
// Alles, was ein Angreifer auf dem Geraet ohne Debugger sieht: Text, Attribute, Speicher, Adresse, globale Namen
async function deviceSnapshot(p) {
  return p.evaluate(() => {
    const attrs = []; for (const el of document.querySelectorAll("*")) for (const a of el.attributes) attrs.push(a.value);
    const st = (s) => { const o = {}; try { for (let i = 0; i < s.length; i++) o[s.key(i)] = s.getItem(s.key(i)); } catch (e) { /* gesperrt */ } return o; };
    return { text: document.body.innerText, attrs: attrs.join("\n"), local: st(localStorage), session: st(sessionStorage), url: location.href, cookie: document.cookie,
      globals: Object.keys(window).filter((k) => k !== "__baseGlobals" && !globalThis.__baseGlobals.includes(k)), tiles: [...document.querySelectorAll(".tile .tv")].map((x) => x.textContent) };
  });
}
const BASE = () => { globalThis.__baseGlobals = Object.keys(window); };

test("Geraet: gegen den Bot sieht der Pruefer bis zur Aufloesung nur verdeckte Karten, nichts in Speicher/Adresse/Globalen", async () => {
  const A = await open(b, { init: [BASE] });
  await act(A.p, "open-bluff"); await pickMode(A.p, "de", "bot"); await pickSeat(A.p, "Prüfer"); await act(A.p, "go");
  const snaps = [];
  for (let i = 0; i < 30; i++) {
    const s = await screen(A.p);
    if (s === "card-play-over") break;
    if (s === "card-play-turn") { snaps.push(await deviceSnapshot(A.p)); await A.p.locator(".choice .opt").first().click(); }
    else await A.p.waitForTimeout(30);
  }
  await waitScreen(A.p, "card-play-over");
  const truth = await A.p.locator(".tile .tv").allTextContents();
  assert.ok(truth.every((x) => /^[1-6]$/.test(x)), "nach der Aufloesung offen: " + truth);
  assert.ok(snaps.length >= 5, "mindestens fuenf Entscheidungen beobachtet");
  for (const s of snaps) {
    assert.ok(s.tiles.every((x) => x === "?"), "Karten des Boten verdeckt: " + s.tiles);
    assert.deepEqual(s.globals, [], "keine globalen Objekte (A1)");
    assert.equal(JSON.stringify(s.local).includes(truth.join(",")), false);
    assert.deepEqual(Object.keys(s.session), []);
    assert.equal(s.url.includes("#"), false);
    assert.equal(s.cookie, "");
    assert.match(s.attrs, /verdeckt/, "Barrierefreiheits-Text sagt verdeckt, nicht den Wert");
  }
  assert.deepEqual(A.ctx._blocked, []);
  assert.deepEqual(A.errs, []);
});

test("Link: Ansage-Link enthaelt kein Salz und keine Karten; der Pruefer sieht verdeckte Karten", async () => {
  const { A, B, hops } = await turnLink(b, { view: "phone390", lang: "de" });
  const payload = (h) => JSON.parse(Buffer.from(h.split(".")[2], "base64url").toString("utf8"));
  const first = payload(hops[0]);
  assert.deepEqual(Object.keys(first).sort(), ["c", "g", "h", "k", "m", "p", "s", "v"]);
  assert.ok(first.m.every((x) => x.t === "say" && !("salt" in x)), "nur oeffentliche Ansagen");
  const hex = JSON.stringify(first).match(HEX32) || [];
  assert.ok(hex.every((x) => x === first.s || first.k.some((k) => k && k.includes(x))), "einzige 32-Hex-Werte sind Seed und Commitment: " + hex);
  const salt = (await A.p.evaluate(() => Object.values(localStorage).map((v) => JSON.parse(v).salt).find(Boolean)));
  assert.match(salt, /^[0-9a-f]{32}$/, "Salz liegt nur auf dem Geraet des Boten");
  assert.equal(hops[0].includes(salt) || JSON.stringify(first).includes(salt), false);
  assert.equal(JSON.stringify(payload(hops[1])).includes(salt), false, "auch der Pruef-Link nicht");
  assert.ok(JSON.stringify(payload(hops[2])).includes(salt), "erst die Aufloesung bringt das Salz");
  const bStore = await B.p.evaluate(() => JSON.stringify(localStorage));
  assert.equal(bStore.includes(salt), false, "Geraet des Pruefers speichert kein fremdes Salz");
  assert.deepEqual([...A.ctx._blocked, ...B.ctx._blocked], []);
});

test("Netz: live sieht der Kanal vor der Aufloesung weder Salz noch Karten", async () => {
  const { A, B, net } = await turnLive(b, { view: "phone390", lang: "de" });
  const msgs = net.wire.dc.map((x) => x.s);
  const ri = msgs.findIndex((m) => m.includes('"reveal"'));
  assert.ok(ri > 0, "Aufloesung lief ueber den Kanal");
  const salt = JSON.parse(msgs[ri]).x.salt;
  const truth = await B.p.locator(".tile .tv").allTextContents();
  const before = msgs.slice(0, ri).join("\n") + net.wire.edge.join("\n") + net.wire.http.join("\n");
  assert.equal(before.includes(salt), false, "Salz vor der Aufloesung im Netz");
  assert.equal(before.includes(truth.join(",")), false, "Kartenfolge vor der Aufloesung im Netz");
  assert.equal(/"priv"|"mine"|"truth":\[/.test(before), false, "private Struktur im Netz");
  assert.ok(truth.every((x) => /^[1-6]$/.test(x)));
  for (const m of msgs) assert.ok(m.length < 4096);
  assert.deepEqual([...A.errs, ...B.errs], []);
});

test("Realm-Trennung (Review M4): Webkonferenz-Modul, Socket und PeerConnection nur im abgeschotteten Rahmen; App-Realm ohne Netz", async () => {
  const { liveInvite } = await import("./lib/scenarios.mjs");
  const { A, B } = await liveInvite(b, { view: "phone390", lang: "de" }, "bluff");
  await B.p.locator("main.s-card-play-wait, main.s-card-play-turn").first().waitFor({ timeout: 20000 });
  for (const P of [A.p, B.p]) {
    const main = await P.evaluate(() => ({ ws: typeof globalThis.__fakeWs, pc: typeof globalThis.__fakePc }));
    assert.deepEqual(main, { ws: "undefined", pc: "undefined" }, "kein Socket/keine PeerConnection im App-Realm");
    const frames = P.frames().filter((f) => f !== P.mainFrame());
    assert.equal(frames.length, 1, "genau ein Live-Rahmen");
    const fr = await frames[0].evaluate(() => ({ origin: self.origin, ws: typeof globalThis.__fakeWs, parent: (() => { try { return typeof parent.document; } catch (e) { return "gesperrt"; } })() }));
    assert.deepEqual(fr, { origin: "null", ws: "object", parent: "gesperrt" }, "opaker Ursprung, kein Zugriff auf die App");
    const net = await P.evaluate(() => fetch("https://webconference.bunsenbrenner.org/api/play/ice").then(() => "durch", () => "gesperrt"));
    assert.equal(net, "gesperrt", "CSP des App-Realms: connect-src 'none'");
  }
});
