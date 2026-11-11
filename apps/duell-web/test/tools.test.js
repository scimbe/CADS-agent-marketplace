"use strict";
// Tools (src/tools.js): SHA-256 in pieces, the note as a link, the note for two, and the file protocol over a fake channel
// that behaves like an RTCDataChannel (ordered, a send buffer that drains at a fixed rate, bufferedamountlow).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const T = require("../src/tools.js");
const C = require("../src/core.js");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

test("SHA-256 in Stuecken: gleich wie node:crypto, fuer jede Laenge und jede Stueckelung", () => {
  for (let n = 0; n <= 300; n++) {
    const b = crypto.randomBytes(n), h = T.sha256();
    let o = 0;
    while (o < n) { const k = Math.min(n - o, 1 + Math.floor(Math.random() * 70)); h.update(b.subarray(o, o + k)); o += k; }
    assert.equal(h.hex(), sha(b), "Laenge " + n);
  }
  const big = crypto.randomBytes(3 * 1048576 + 7), h = T.sha256();
  for (let o = 0; o < big.length; o += 16384) h.update(big.subarray(o, o + 16384));
  assert.equal(h.hex(), sha(big));
  assert.equal(T.sha256().hex(), sha(Buffer.alloc(0)));
  assert.equal(T.sha256().update(Buffer.from("abc")).hex(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const d = T.sha256(); d.hex(); assert.throws(() => d.update(Buffer.from("x")), /already/);
});

test("Notizzettel: Link hin und zurueck, Farbe und Sticker nur aus der Liste, Steuerzeichen raus, nie ueber MAX_FRAGMENT", () => {
  const n = { x: "Milch\nBrot 🥨\r\nOma anrufen", c: 2, s: 6 };
  const code = T.noteCode(n);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(T.noteFrom(code), { x: "Milch\nBrot 🥨\nOma anrufen", c: 2, s: 6 });
  assert.deepEqual(T.cleanNote({ x: "a\u0000b\u202ec", c: 99, s: -1 }), { x: "a b c", c: 0, s: 0 });
  assert.deepEqual(T.cleanNote({ x: 5, c: 1.5, s: "2" }), { x: "", c: 0, s: 0 });
  assert.equal(T.cleanNote(null), null);
  assert.equal(Array.from(T.cleanNote({ x: "🍕".repeat(900) }).x).length, T.MAX_NOTE, "hoechstens MAX_NOTE Zeichen, ein Emoji ist eines");
  // ASCII up to the limit fits a link; the same number of emoji does not, and the link is then neither written nor read
  assert.ok(T.noteFits({ x: "x".repeat(T.MAX_NOTE) }), "500 Buchstaben passen in den Link");
  const fat = { x: "🍕".repeat(T.MAX_NOTE) };
  assert.ok(!T.noteFits(fat) && T.noteLoad(fat) > 1);
  assert.equal(T.noteFrom(T.noteCode(fat)), null, "zu lang: wird nicht gelesen");
  assert.ok(T.noteCode(fat).length > C.MAX_FRAGMENT);
  for (const bad of ["", "!!", "e30", "a".repeat(C.MAX_FRAGMENT + 1), Buffer.from('{"v":2,"x":"a"}').toString("base64url"), Buffer.from("[1]").toString("base64url")]) assert.equal(T.noteFrom(bad), null, bad.slice(0, 20));
});

test("Notiz fuer zwei: beide enden auf demselben Zettel, auch wenn gleichzeitig geschrieben wird", () => {
  const box = { a: [], b: [] }, seen = { a: null, b: null };
  const A = T.shared({ side: "a", send: (m) => box.b.push(m), apply: (n) => { seen.a = n; } });
  const B = T.shared({ side: "b", send: (m) => box.a.push(m), apply: (n) => { seen.b = n; } });
  const flush = () => { while (box.a.length || box.b.length) { box.a.splice(0).forEach((m) => A.msg(m)); box.b.splice(0).forEach((m) => B.msg(m)); } };
  A.local({ x: "Einkauf", c: 0, s: 0 }); flush();
  assert.deepEqual(seen.b, { x: "Einkauf", c: 0, s: 0 });
  // both type at the same moment: the same counter, the inviter's note wins on both devices
  let a = { x: "Einkauf: Milch", c: 0, s: 0 }, b = { x: "Einkauf: Brot", c: 3, s: 1 };
  A.local(a); B.local(b); flush();
  const endA = seen.a || a, endB = seen.b;
  assert.deepEqual(endB, a); assert.deepEqual(endA, a);
  // the later change wins
  B.local({ x: "Einkauf: Milch, Brot", c: 3, s: 1 }); flush();
  assert.deepEqual(seen.a, { x: "Einkauf: Milch, Brot", c: 3, s: 1 });
  assert.equal(A.clock(), B.clock());
  assert.equal(A.msg({ t: "f-offer" }), false); assert.equal(A.msg({ t: "n-set", v: -1 }), false); assert.equal(A.msg({ t: "n-set", v: 2e9 }), false);
});

// Two ends of a data channel: ordered, strings and bytes in one queue, a send buffer (bufferedAmount) that drains at RATE
// bytes per tick, onLow once it is at or below LOW. tamper(u8) may change bytes in flight.
function pair(o) {
  o = o || {};
  const RATE = o.rate || 96 * 1024;
  const ends = ["a", "b"].map((side) => ({ side, q: [], buffered: 0, maxBuf: 0, low: null, bins: 0, log: [] }));
  ends[0].peer = ends[1]; ends[1].peer = ends[0];
  for (const e of ends) {
    e.ch = {
      send: (m) => { e.q.push({ s: JSON.stringify(m) }); kick(e); },
      bin: (b) => { assert.ok(b instanceof ArrayBuffer); e.q.push({ b }); e.buffered += b.byteLength; e.maxBuf = Math.max(e.maxBuf, e.buffered); e.bins++; kick(e); },
      buffered: () => e.buffered,
      onLow: (f) => { e.low = f; }
    };
    e.T = T.transfer(e.ch, { side: e.side, max: (o.max || {})[e.side], on: (ev) => e.log.push(ev) });
  }
  function kick(e) {
    if (e.busy) return; e.busy = true;
    setImmediate(function tick() {
      let budget = RATE;
      while (e.q.length && budget > 0) {
        const it = e.q.shift();
        if (it.s) { const m = JSON.parse(it.s); e.peer.T.msg(m); (e.peer.got = e.peer.got || []).push(m.t); }
        else { budget -= it.b.byteLength; e.buffered -= it.b.byteLength; let u = new Uint8Array(it.b); if (o.tamper) u = o.tamper(u) || u; e.peer.T.bin(u.buffer); }
      }
      if (e.buffered <= T.LOW && e.low) e.low();
      if (e.q.length) setImmediate(tick); else e.busy = false;
    });
  }
  return ends;
}
const until = async (f, ms) => { const end = Date.now() + (ms || 10000); while (!f()) { if (Date.now() > end) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 5)); } };
const ev = (e, k) => e.log.filter((x) => x.e === k);
function file(n, name) { const b = crypto.randomBytes(n); return { buf: b, f: new File([b], name || "foto.jpg", { type: "image/jpeg" }) }; }

test("Datei: erst Ja zu Name und Groesse, dann Stuecke mit Gegendruck, echter Fortschritt, gleiche SHA-256, Teile = Datei", async () => {
  const [a, b] = pair(), { buf, f } = file(3 * 1048576 + 12345, "../../Urlaub/Strand 2026.jpg");
  assert.equal(a.T.send(f), true);
  await until(() => ev(b, "offer").length);
  assert.deepEqual(ev(b, "offer")[0], { e: "offer", n: "Strand 2026.jpg", s: buf.length }, "Name ohne Ordner, Groesse vor dem ersten Byte");
  assert.equal(a.bins, 0, "vor dem Ja fliesst kein Byte");
  assert.equal(a.T.send(f), false, "eine Uebertragung auf einmal");
  assert.equal(b.T.accept(), true);
  await until(() => ev(a, "done").length && ev(b, "done").length);
  const inDone = ev(b, "done")[0], outDone = ev(a, "done")[0];
  assert.equal(inDone.ok, true); assert.equal(outDone.ok, true);
  assert.equal(inDone.h, sha(buf)); assert.equal(outDone.h, sha(buf), "beide Seiten dieselbe Pruefsumme");
  assert.deepEqual(Buffer.concat(inDone.parts.map((u) => Buffer.from(u))), buf);
  assert.ok(inDone.parts.every((u) => u.length <= T.CHUNK));
  // back pressure: the send buffer never grows past HIGH plus one block read from the file
  assert.ok(a.maxBuf <= T.HIGH + 262144, "Puffer " + a.maxBuf);
  // the sender's bar follows what the receiver reported as arrived, up to the full size; the receiver's grows with every piece
  const outP = ev(a, "progress").map((p) => p.b), inP = ev(b, "progress").map((p) => p.b);
  assert.ok(outP.length >= 10 && outP.every((x, i) => i === 0 || x >= outP[i - 1]) && outP[outP.length - 1] === buf.length, "Sender: " + outP.length);
  assert.ok(inP.length > outP.length && inP[inP.length - 1] === buf.length);
  assert.equal(a.T.busy(), false); assert.equal(b.T.busy(), false);
  // the next file goes the other way round on the same channel
  const g = file(1000, "notiz.txt"); assert.equal(b.T.send(g.f), true);
  await until(() => ev(a, "offer").length); a.T.accept();
  await until(() => ev(a, "done").length === 2);
  assert.equal(ev(a, "done")[1].h, sha(g.buf));
});

test("Datei: Ablehnen - kein Byte fliesst, der Sender erfaehrt es; leere Datei geht auch", async () => {
  const [a, b] = pair(), { f } = file(500000);
  a.T.send(f); await until(() => ev(b, "offer").length);
  assert.equal(b.T.reject(), true);
  await until(() => ev(a, "no").length);
  assert.deepEqual(ev(a, "no")[0], { e: "no", why: "no" }); assert.equal(a.bins, 0); assert.equal(b.T.busy(), false); assert.equal(a.T.busy(), false);
  assert.equal(b.T.bin(new ArrayBuffer(10)), false, "Bytes ohne angenommenes Angebot fallen weg");
  const e = file(0, "leer.txt"); a.T.send(e.f); await until(() => ev(b, "offer").length === 2); b.T.accept();
  await until(() => ev(b, "done").length);
  assert.equal(ev(b, "done")[0].ok, true); assert.equal(ev(b, "done")[0].h, sha(Buffer.alloc(0)));
});

test("Datei: Abbrechen auf beiden Seiten, danach kommt nichts mehr an", async () => {
  for (const who of ["a", "b"]) {
    const [a, b] = pair({ rate: 32 * 1024 }), { f } = file(4 * 1048576);
    a.T.send(f); await until(() => ev(b, "offer").length); b.T.accept();
    await until(() => ev(b, "progress").length > 20);
    assert.equal((who === "a" ? a : b).T.cancel(), true);
    await until(() => ev(a, "stop").length && ev(b, "stop").length);
    assert.equal(ev(who === "a" ? a : b, "stop")[0].by, "me"); assert.equal(ev(who === "a" ? b : a, "stop")[0].by, "them");
    const n = ev(b, "progress").length;
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(ev(b, "progress").length, n, who + ": nach dem Abbruch kein Fortschritt mehr");
    assert.equal(ev(a, "done").length + ev(b, "done").length, 0);
    assert.ok(!a.T.busy() && !b.T.busy());
  }
});

test("Datei: Groessengrenze beim Sender und beim Empfaenger; mehr Bytes als angesagt brechen ab", async () => {
  const [a, b] = pair({ max: { a: 1000, b: 500 } });
  assert.equal(a.T.send(file(1001).f), false); assert.deepEqual(ev(a, "error")[0], { e: "error", dir: "out", why: "big", s: 1001 });
  a.T.send(file(800, "gross.bin").f);
  await until(() => ev(a, "no").length);
  assert.equal(ev(a, "no")[0].why, "big"); assert.deepEqual(ev(b, "big")[0], { e: "big", n: "gross.bin", s: 800 }); assert.equal(a.bins, 0);
  assert.equal(T.MAX_BYTES, 100e6); assert.equal(T.size(T.MAX_BYTES, "de"), "100 MB");
  // a sender that lies about the size: the receiver stops at the first byte too many
  const [c, d] = pair();
  c.ch.send({ t: "f-offer", id: "a9", n: "x", s: 10 }); await until(() => ev(d, "offer").length); d.T.accept();
  await until(() => (d.got || []).length === 0 || true);
  d.T.bin(new Uint8Array(8).buffer); assert.equal(d.T.bin(new Uint8Array(8).buffer), false);
  assert.deepEqual(ev(d, "error")[0], { e: "error", dir: "in", why: "size" }); assert.equal(d.T.busy(), false);
});

test("Datei: ein veraendertes Byte unterwegs - die Pruefsumme passt nicht, nichts wird angeboten", async () => {
  let hit = false;
  const [a, b] = pair({ tamper: (u) => { if (!hit && u.length > 100) { hit = true; const c = u.slice(); c[50] ^= 1; return c; } return null; } });
  const { buf, f } = file(300000);
  a.T.send(f); await until(() => ev(b, "offer").length); b.T.accept();
  await until(() => ev(a, "done").length && ev(b, "done").length);
  assert.equal(ev(b, "done")[0].ok, false); assert.equal(ev(b, "done")[0].parts, null, "keine Teile zum Speichern");
  assert.equal(ev(a, "done")[0].ok, false); assert.equal(ev(a, "done")[0].h, sha(buf)); assert.notEqual(ev(b, "done")[0].h, sha(buf));
});

test("Datei: gleichzeitige Angebote, fremde Nachrichten, Kanal weg", async () => {
  const [a, b] = pair();
  a.T.send(file(100).f); b.T.send(file(100).f);
  await until(() => ev(a, "no").length && ev(b, "no").length);
  assert.equal(ev(a, "no")[0].why, "busy"); assert.equal(ev(b, "no")[0].why, "busy");
  assert.equal(a.T.msg({ t: "n-set" }), false); assert.equal(a.T.msg({ t: "f-offer", id: "../x", s: 1 }), false); assert.equal(a.T.msg({ t: "f-offer", id: "b7", s: -1 }), true);
  assert.ok(!a.T.busy());
  a.T.send(file(5 * 1048576).f); await until(() => ev(b, "offer").length); b.T.accept();
  await until(() => ev(b, "progress").length > 3);
  a.T.close(); b.T.close();
  assert.equal(ev(a, "stop").pop().by, "net"); assert.equal(ev(b, "stop").pop().by, "net");
  assert.equal(a.T.send(file(1).f), false, "nach dem Schliessen nichts mehr");
});

test("Dateiname und Groesse: ohne Ordner und Steuerzeichen, wie Menschen sie lesen", () => {
  assert.equal(T.cleanName("C:\\Users\\x\\Bild.png"), "Bild.png");
  assert.equal(T.cleanName("../../etc/passwd"), "passwd");
  assert.equal(T.cleanName("..."), "datei"); assert.equal(T.cleanName(""), "datei"); assert.equal(T.cleanName(null), "datei");
  assert.equal(T.cleanName("a\u202egnp.exe"), "agnp.exe", "keine Richtungszeichen, die eine Endung verstecken");
  assert.equal(Array.from(T.cleanName("x".repeat(300))).length, 120);
  assert.equal(T.size(830, "de"), "830 B"); assert.equal(T.size(12345678, "de"), "12,3 MB"); assert.equal(T.size(12345678, "en"), "12.3 MB"); assert.equal(T.size(209715200, "en"), "210 MB");
});

test("Relais nur fuer Zahlende: Guthaben > 0 darf, sonst nur direkt; ein Schalter fuer alle oder keinen; ohne TURN keine Relais-Kandidaten", () => {
  assert.equal(T.relayFor(0, {}), false); assert.equal(T.relayFor(null, {}), false); assert.equal(T.relayFor(undefined, {}), false); assert.equal(T.relayFor("5", {}), false);
  assert.equal(T.relayFor(1, {}), true); assert.equal(T.relayFor(0.5, null), true);
  assert.equal(T.relayFor(0, { toolRelay: true }), true, "Schalter: fuer alle"); assert.equal(T.relayFor(9, { toolRelay: false }), false, "Schalter: fuer keinen");
  assert.equal(T.relayFor(9, { toolRelay: "ja" }), true, "nur ein echtes true/false schaltet");
  delete globalThis.Live; require("../src/live.js"); const L = globalThis.Live;
  assert.deepEqual(L.directServers([{ urls: ["stun:a.example:3478", "turn:a.example:3478?transport=udp"], username: "u", credential: "c" }, { urls: "turns:b.example:5349", username: "u", credential: "c" }, { urls: "stun:c.example" }]),
    [{ urls: ["stun:a.example:3478"] }, { urls: ["stun:c.example"] }], "kein TURN, keine Zugangsdaten");
  assert.equal(L.directServers(undefined).length, 0);
  assert.equal(L.relayCandidate("candidate:1 1 udp 41885439 203.0.113.5 3478 typ relay raddr 0.0.0.0 rport 0"), true);
  assert.equal(L.relayCandidate("candidate:2 1 udp 1677729535 198.51.100.7 51000 typ srflx raddr 10.0.0.2 rport 51000"), false);
  assert.equal(L.relayCandidate("candidate:3 1 udp 2122260223 192.168.1.4 51000 typ host"), false);
  // only the file tool asks for direct; live.js keeps its old calls (no third argument) for games and the note for two
  const ui = require("node:fs").readFileSync(require.resolve("../src/tools-ui.js"), "utf8");
  assert.match(ui, /function opts\(w\) \{ return \{ direct: w === "datei" && !paid\(\) \}; \}/);
  assert.match(ui, /window\.Ai\.post\("\/status"/, "Guthaben ueber den vorhandenen Weg (ai.js), kein eigenes fetch");
});
