"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const S = require("../src/collab.js");

const me = D.sanitizeProfile({ nick: "Mira" });
const idea = (k) => D.IDEAS.find((i) => i.kind === k);
const start = (k) => D.docFromIdea(idea(k), me, "de");
function rng(seed) { return C.mulberry32(seed); }

// Two peers over a wire we control: it can reorder, repeat, lose and cut.
function pair(k, opt = {}) {
  const r = rng(opt.seed || 1), wire = { a: [], b: [] }, t = { now: 1000 };
  const mk = (name, actor, nick) => {
    const self = { name, doc: null, frames: 0 };
    self.c = S.create({ actor, nick: () => nick, emoji: () => "🐙", onPeer() { self.peerCalls = (self.peerCalls || 0) + 1; },
      send(f) { self.frames += 1; self.sent = f; self.maxFrame = Math.max(self.maxFrame || 0, Buffer.byteLength(f)); if (wire.cut) return; wire[name === "a" ? "b" : "a"].push(f); } });
    return self;
  };
  const a = mk("a", "aaaa1111", "Ada"), b = mk("b", "bbbb2222", "Ben");
  a.doc = start(k); a.c.seed(a.doc);
  const deliver = (p, q) => {
    const inbox = wire[q.name]; wire[q.name] = [];
    if (opt.shuffle) for (let i = inbox.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [inbox[i], inbox[j]] = [inbox[j], inbox[i]]; }
    for (const f of inbox) {
      if (opt.lose && r() < opt.lose) continue;
      q.c.receive(f, t.now);
      if (opt.dup && r() < opt.dup) q.c.receive(f, t.now);
    }
    if (!q.doc && q.c.hasWork()) q.doc = q.c.doc();
    if (q.doc) { q.c.applyTo(q.doc); }
  };
  const run = (ms) => {
    for (let e = 0; e < ms; e += 50) {
      t.now += 50;
      for (const p of [a, b]) { if (p.doc) p.c.local(p.doc); p.c.tick(t.now); }
      deliver(a, b); deliver(b, a);
    }
  };
  a.c.connected(t.now); b.c.connected(t.now);
  return { a, b, wire, t, run, up() { wire.cut = false; a.c.connected(t.now); b.c.connected(t.now); }, down() { wire.cut = true; wire.a = []; wire.b = []; a.c.disconnected(); b.c.disconnected(); } };
}
function same(n) { assert.equal(n.a.c.hash(), n.b.c.hash(), "Hash"); assert.deepEqual(n.a.c.snapshot(), n.b.c.snapshot()); assert.deepEqual(D.sanitizeDoc(n.a.doc), D.sanitizeDoc(n.b.doc)); }

test("Beitritt: B startet leer und hat nach dem Abgleich die Arbeit von A, je Mechanik", () => {
  for (const k of S.KINDS) {
    const n = pair(k); n.run(6000);
    assert.ok(n.b.doc, k); same(n);
    assert.equal(n.a.c.peer().nick, "Ben"); assert.equal(n.b.c.peer().nick, "Ada");
  }
});
test("Der Beitretende bekommt nie ein Standard-Dokument: hello allein ist noch keine Arbeit", () => {
  const n = pair("card"), a = n.a.c;
  n.wire.cut = true; n.t.now += 100; a.tick(n.t.now); n.wire.cut = false;
  const hello = n.a.sent; assert.match(hello, /"t":"hello"/);
  const c = S.create({ actor: "cccc3333", nick: () => "", emoji: () => "", onPeer() {}, send() {} });
  c.receive(hello, n.t.now);
  assert.ok(c.meta()); assert.equal(c.hasWork(), false);
});
test("Aenderung auf A erscheint inhaltlich auf B in unter einer Sekunde", () => {
  const n = pair("card"); n.run(6000);
  n.a.doc.x = "Mein Hund kann rechnen"; n.run(1000);
  assert.equal(n.b.doc.x, "Mein Hund kann rechnen");
});
test("Gleichzeitig dasselbe Feld: beide Seiten landen deterministisch auf demselben Wert", () => {
  const n = pair("card"); n.run(6000); n.down();
  n.a.doc.x = "von Ada"; n.b.doc.x = "von Ben"; n.run(300); n.up(); n.run(7000);
  same(n); assert.equal(n.a.doc.x, "von Ben", "gleiche Lamport-Zeit: hoehere Actor-Id");
});
test("Verschiedene Felder gehen nie verloren, auch nicht verschiedene Schritte einer Beat-Spur", () => {
  const n = pair("sound"); n.run(6000); n.down();
  n.a.doc.p.k = "x" + n.a.doc.p.k.slice(1); n.b.doc.p.k = n.b.doc.p.k.slice(0, 7) + "x" + n.b.doc.p.k.slice(8); n.a.doc.bpm = 150; n.b.doc.x = "Beat";
  n.run(300); n.up(); n.run(7000);
  same(n); assert.equal(n.a.doc.p.k[0], "x"); assert.equal(n.a.doc.p.k[7], "x"); assert.equal(n.b.doc.bpm, 150); assert.equal(n.a.doc.x, "Beat");
});
test("Sticker: geloescht bleibt geloescht, auch wenn der Partner ihn gleichzeitig verschiebt oder alte Nachrichten nachkommen", () => {
  const n = pair("card"); n.run(6000);
  n.a.doc.sk.push({ e: "🐸", x: 0.2, y: 0.2, r: 0, z: 1 }); n.run(1500);
  assert.equal(n.b.doc.sk.length, 1);
  const old = n.a.sent;
  n.down();
  n.a.doc.sk.length = 0; n.b.doc.sk[0].x = 0.9; n.run(300); n.up(); n.run(7000);
  same(n); assert.equal(n.b.doc.sk.length, 0);
  n.b.c.receive(old, n.t.now); n.b.c.applyTo(n.b.doc); assert.equal(n.b.doc.sk.length, 0, "alte Nachricht");
});
test("Loeschen vor Hinzufuegen in vertauschter Reihenfolge: nichts taucht auf", () => {
  const n = pair("card"); n.run(6000);
  const id = "99.aaaa1111", d = n.a.c.meta(), g = { e: "🐸", x: 0.5, y: 0.5, r: 0, z: 1 };
  n.b.c.receive(JSON.stringify({ v: 1, t: "ops", d, o: [["d", id, 100]] }), n.t.now);
  n.b.c.receive(JSON.stringify({ v: 1, t: "ops", d, o: [["s", id, g, 99, "aaaa1111"]] }), n.t.now);
  n.b.c.applyTo(n.b.doc); assert.equal(n.b.doc.sk.length, 0);
});
test("Rueckgaengig baut die Liste neu auf: gleiche Sticker bleiben gleich, ein wiederhergestellter kommt wieder", () => {
  const n = pair("card"); n.run(6000);
  n.a.doc.sk.push({ e: "🐸", x: 0.2, y: 0.2, r: 0, z: 1 }, { e: "🦆", x: 0.7, y: 0.7, r: 0, z: 1 }); n.run(1500);
  const dead = n.a.c.snapshot().dead.length, ids = n.a.c.snapshot().stickers.map((s) => s[0]);
  n.a.doc.sk.splice(0, 2, ...JSON.parse(JSON.stringify(n.a.doc.sk))); n.run(1500);
  assert.equal(n.a.c.snapshot().dead.length, dead, "kein Loeschen"); assert.deepEqual(n.a.c.snapshot().stickers.map((s) => s[0]), ids);
  const was = JSON.stringify(n.a.doc.sk);
  n.a.doc.sk.shift(); n.run(1500); assert.equal(n.b.doc.sk.length, 1);
  n.a.doc.sk.length = 0; JSON.parse(was).forEach((s) => n.a.doc.sk.push(s)); n.run(1500);
  same(n); assert.equal(n.b.doc.sk.length, 2);
});
test("Mehr Sticker als erlaubt: beide zeigen dieselben, nie mehr als die Grenze", () => {
  const n = pair("card"); n.run(6000); n.down();
  for (let i = 0; i < 6; i++) { n.a.doc.sk.push({ e: "🐸", x: 0.1, y: 0.1, r: 0, z: 1 }); n.b.doc.sk.push({ e: "🦆", x: 0.9, y: 0.9, r: 0, z: 1 }); }
  n.run(300); n.up(); n.run(8000);
  same(n); assert.equal(n.a.doc.sk.length, D.MAX_STICKERS);
});
test("Konvergenz: 40 Zufallslaeufe mit vertauschten, doppelten und verlorenen Nachrichten und einem Abbruch", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const k = S.KINDS[seed % 4], n = pair(k, { seed, shuffle: true, dup: 0.3, lose: 0.3 }), r = rng(seed * 7);
    n.run(9000); assert.ok(n.b.doc, "Beitritt " + seed);
    const edit = (d) => {
      const c = r();
      if (d.k === "game") { d.g.params.speed = 90 + Math.floor(r() * 170); if (c < 0.5) d.g.emoji = "🦖"; return; }
      if (c < 0.3) d.col = c < 0.15 ? ["#2b4bff", "#ffe600"] : ["#ffffff", "#ff2d2d"];
      else if (d.k === "sound") { const i = Math.floor(r() * 16), v = d.p.s; d.p.s = v.slice(0, i) + (v[i] === "x" ? "-" : "x") + v.slice(i + 1); }
      else if (c < 0.6) d.x = "Satz " + Math.floor(r() * 100);
      else if (c < 0.8 && d.sk.length) d.sk.splice(Math.floor(r() * d.sk.length), 1);
      else if (d.sk.length < 8) d.sk.push({ e: "🐸", x: r(), y: r(), r: 0, z: 1 });
    };
    for (let i = 0; i < 30; i++) {
      edit(r() < 0.5 ? n.a.doc : n.b.doc); n.run(100);
      if (i === 15) { n.down(); edit(n.a.doc); edit(n.b.doc); n.run(500); n.up(); }
    }
    n.run(30000);
    same(n);
  }
});
test("Ratenlimit: Dauerfeuer bleibt unter dem Kanal-Limit, die letzte Aenderung kommt trotzdem an", () => {
  const n = pair("card"); n.run(6000);
  const before = n.a.frames;
  for (let i = 0; i < 1200; i++) { n.a.doc.x = "Zeile " + i; n.run(50); }
  assert.ok(n.a.frames - before <= 106, "Frames in 60 s: " + (n.a.frames - before));
  n.run(1000); assert.equal(n.b.doc.x, "Zeile 1199");
});
test("Zustandsabgleich sprengt keinen Frame: 330 lange Sticker kommen stueckweise an", () => {
  const n = pair("card");
  for (let i = 0; i < 330; i++) n.a.doc.sk.push({ e: "👨‍👩‍👧‍👦", x: 0.5, y: 0.5, r: 0, z: 1 });
  n.a.c.local(n.a.doc);
  n.run(30000);
  same(n); assert.equal(n.a.c.pending(), 0); assert.equal(n.b.doc.sk.length, D.MAX_STICKERS);
  assert.ok(n.a.maxFrame <= S.MAX_FRAME && n.a.maxFrame > 8000, "groesster Frame " + n.a.maxFrame);
});
test("Harte Grenzen: zu gross, zu viele Ops, zu viele Ids, zu schnell, Muell", () => {
  const n = pair("card"); n.run(6000);
  const c = n.b.c, d = n.a.c.meta(), now = n.t.now, before = c.hash();
  assert.equal(c.receive("x".repeat(S.MAX_FRAME + 1), now), "dropped");
  for (const junk of ["", "null", "[]", "{", '{"v":2}', '{"v":1,"t":"exec","cmd":"rm"}', 7, null]) assert.equal(c.receive(junk, now), "dropped");
  assert.equal(c.receive(JSON.stringify({ v: 1, t: "ops", d, o: new Array(S.MAX_OPS + 1).fill(["f", "x", "a", 9, "aaaa1111"]) }), now), "dropped");
  assert.equal(c.receive(JSON.stringify({ v: 1, t: "ops", d: { k: "game" }, o: [] }), now), "dropped", "fremde Art");
  const o = [];
  for (let i = 0; i < S.MAX_IDS + 20; i++) o.push(["d", (1000 + i) + ".aaaa1111", 5000]);
  for (let i = 0; i < o.length; i += 400) c.receive(JSON.stringify({ v: 1, t: "ops", d, o: o.slice(i, i + 400) }), now);
  assert.ok(c.snapshot().dead.length <= S.MAX_IDS);
  assert.notEqual(c.hash(), before);
  const m = pair("card"); m.run(6000);
  let dropped = 0; for (let i = 0; i < S.MAX_IN_PER_MIN + 10; i++) if (m.b.c.receive('{"v":1,"t":"nix"}', m.t.now) === "dropped") dropped++;
  assert.equal(dropped, S.MAX_IN_PER_MIN + 10);
  assert.equal(m.b.c.receive(JSON.stringify({ v: 1, t: "ops", d: m.a.c.meta(), o: [] }), m.t.now), "dropped", "Fenster voll");
});
test("Filter: unbekannte Felder, Markup, Woerter vom Filter und kaputte Werte kommen nicht in den Zustand", () => {
  const n = pair("card"); n.run(6000);
  const c = n.b.c, d = n.a.c.meta(), now = n.t.now, x0 = n.b.doc.x;
  const bad = [
    ["f", "__proto__", "x", 900, "aaaa1111"], ["f", "constructor", "x", 900, "aaaa1111"], ["f", "toString", "x", 900, "aaaa1111"], ["f", "x", "<img src=x onerror=alert(1)>", 900, "aaaa1111"],
    ["f", "x", "a".repeat(91), 900, "aaaa1111"], ["f", "x", 7, 900, "aaaa1111"], ["f", "col", ["red", "url(x)"], 900, "aaaa1111"], ["f", "st", "<b>", 900, "aaaa1111"],
    ["f", "x", "ok", 2e15, "aaaa1111"], ["f", "x", "ok", 900, "BAD ACTOR"], ["f", "x", "ok", 1.5, "aaaa1111"],
    ["s", "../x", { e: "🐸", x: 0, y: 0, r: 0, z: 1 }, 900, "aaaa1111"], ["s", "9.aaaa1111", { e: "<b>", x: 0, y: 0, r: 0, z: 1 }, 900, "aaaa1111"], ["s", "9.aaaa1111", { e: "🐸", x: 9, y: 0, r: 0, z: 1 }, 900, "aaaa1111"]
  ];
  assert.equal(c.receive(JSON.stringify({ v: 1, t: "ops", d, o: bad }), now), "partly");
  assert.equal(c.rejected(), bad.length);
  c.applyTo(n.b.doc); assert.equal(n.b.doc.x, x0); assert.equal({}.polluted, undefined); assert.equal(n.b.doc.sk.length, 0);
  assert.equal(C.isClean("arschloch"), false, "Testwort muss gefiltert sein");
  c.receive(JSON.stringify({ v: 1, t: "ops", d, o: [["f", "x", "arschloch", 901, "aaaa1111"]] }), now); c.applyTo(n.b.doc); assert.equal(n.b.doc.x, x0);
  c.receive(JSON.stringify({ v: 1, t: "dig", d, h: 1, id: "aaaa1111", n: "<script>", e: "<b>" }), now);
  assert.ok(!/[<>]/.test(c.peer().nick + c.peer().emoji));
});
test("Kein Medium im Protokoll: Foto und Stimme haben kein Feld, das Foto-Doc enthaelt nur Rahmen, Text und Sticker", () => {
  for (const k of S.KINDS) assert.ok(!Object.keys(S.rules(k)).some((f) => /photo|pcm|raw|voice|image|peaks/.test(f)), k);
  const n = pair("photo"); n.a.doc.bild = "data:image/png;base64,AAAA"; n.run(6000);
  assert.ok(!JSON.stringify(n.b.c.snapshot()).includes("AAAA")); assert.equal(n.b.doc.bild, undefined);
});
test("Praesenz: da, Spitzname, weg nach Stille", () => {
  const n = pair("card"); n.run(6000);
  assert.ok(n.a.c.peerHere(n.t.now));
  n.wire.cut = true; n.t.now += 12000; assert.equal(n.a.c.peerHere(n.t.now), false);
});
test("Grenze: Duell und Geheimkanal lassen sich nicht zusammen bauen, auch nicht ueber fremde Metadaten", () => {
  assert.deepEqual([...S.KINDS].sort(), D.KINDS.filter((k) => k !== "duel" && k !== "quest" && k !== "turn").sort());
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/collab.js"), "utf8");
  assert.match(src, /\|\| KINDS\.indexOf\(m\.k\) < 0\) return false/, "okMeta prueft die eigene Liste");
});
