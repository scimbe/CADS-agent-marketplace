"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const T = require("../src/texts.json");
const me = D.sanitizeProfile({ nick: "Mira", emoji: "🐙", colors: ["#2b4bff", "#ffe600"], set: "essen" });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const FORBIDDEN = /vorlage|signatur|sandbox|template|prompt|manifest|\bapi\b|lernziel|lektion/i;
const UNSAFE = /alkohol|bier\b|schnaps|vodka|wodka|zigarett|rauch|droge|kiffen|nackt|kuss|küss|sex|waffe|messer|klau|stehl|prügel|schlag dich|dach|gleis|autobahn|fremde an|hässlich|fett\b|beer\b|cigarette|smok|drug|naked|kiss|steal|weapon|knife|ugly|\broof|train track/i;

test("Daten: mindestens 40 Tagesideen als Daten, 4 Mechaniken, Ids eindeutig, DE und EN vollstaendig", () => {
  assert.ok(D.IDEAS.length >= 40);
  assert.deepEqual([...new Set(D.IDEAS.map((i) => i.kind))].sort(), [...D.KINDS].sort());
  assert.equal(new Set(D.IDEAS.map((i) => i.id)).size, D.IDEAS.length);
  for (const i of D.IDEAS) {
    assert.ok(/^[a-z0-9-]{1,32}$/.test(i.id), i.id);
    assert.ok(i.de.t && i.en.t && i.de.s && i.en.s, i.id);
    if (i.kind === "card") { assert.ok(i.de.lines.length && i.en.lines.length, i.id); }
    assert.ok(D.docFromIdea(i, me, "de"), i.id);
  }
});
test("Inhalt 14+: Wortfilter und Sicherheitsliste ueber alle Ideentexte und Oberflaechentexte", () => {
  for (const i of D.IDEAS) for (const s of D.ideaStrings(i)) {
    assert.ok(C.isClean(s), i.id + ": " + s);
    assert.ok(!UNSAFE.test(s), i.id + ": " + s);
    assert.ok(!FORBIDDEN.test(s), i.id + ": " + s);
  }
  for (const l of ["de", "en"]) for (const k of Object.keys(T[l])) {
    assert.ok(C.isClean(T[l][k]) , k); assert.ok(!FORBIDDEN.test(T[l][k]), k + ": " + T[l][k]);
  }
  assert.deepEqual(Object.keys(T.de).sort(), Object.keys(T.en).sort());
});
test("Tagesidee: gleich fuer alle am selben UTC-Tag, Tageswechsel genau um 0 Uhr UTC", () => {
  const a = D.ideaForDay(new Date("2026-11-01T00:00:01Z")), b = D.ideaForDay(new Date("2026-11-01T23:59:59Z")), c = D.ideaForDay(new Date("2026-11-02T00:00:00Z"));
  assert.equal(a.id, b.id); assert.notEqual(a.id, c.id);
});
test("Tagesidee: in einer Runde keine Wiederholung, nie zweimal dieselbe Mechanik hintereinander", () => {
  const n = D.ROUND.length, seq = D.roundOrder(Math.floor(D.dayNumber(new Date("2026-11-01Z")) / n));
  assert.equal(new Set(seq.map((x) => x.id)).size, n);
  let same = 0; for (let i = 1; i < n; i++) if (seq[i].kind === seq[i - 1].kind) same++;
  assert.equal(same, 0);
});
test("Tagesfolge: jede Runde enthaelt jede Idee genau einmal, keine Mechanik doppelt, auch nicht ueber die Rundennaht", () => {
  const n = D.ROUND.length, all = D.ROUND.map((x) => x.id).sort();
  for (let r = 0; r < 1000; r++) {
    const seq = D.roundOrder(r), next = D.roundOrder(r + 1);
    assert.deepEqual(seq.map((x) => x.id).sort(), all, "Runde " + r);
    for (let i = 1; i < n; i++) assert.notEqual(seq[i].kind, seq[i - 1].kind, "Runde " + r + " Platz " + i);
    assert.notEqual(next[0].kind, seq[n - 1].kind, "Naht nach Runde " + r);
  }
});
test("Tagesfolge: ueber 30 Jahre nie zweimal dieselbe Mechanik, in jeder Geraeteklasse und um Halloween herum", () => {
  const start = Date.UTC(2026, 9, 1), days = 366 * 30;
  const classes = [{ crypto: true }, { crypto: false }, { crypto: true, call: true }, { crypto: false, call: true }, { crypto: true, channel: true, call: true }];
  for (const c of classes) {
    let prev = null;
    for (let n = 0; n < days; n++) {
      const day = new Date(start + n * 86400000), idea = D.ideaForDay(day, c), key = day.toISOString().slice(0, 10);
      assert.ok(idea, key); assert.ok(D.available(idea, c), idea.id + " " + key);
      if (prev) assert.notEqual(idea.kind, prev.kind, key + ": " + prev.id + " und " + idea.id + " mit " + JSON.stringify(c));
      if (key.slice(5) === "10-31") assert.equal(idea.id, "halloween", key); else assert.notEqual(idea.id, "halloween", key);
      prev = idea;
    }
  }
});
test("Tagesfolge: heute, 2026-11-01, zeigt eine lauffaehige Idee", () => {
  const day = new Date("2026-11-01T12:00:00Z"), me = D.sanitizeProfile({});
  for (const c of [{ crypto: true }, { crypto: false }, { crypto: true, call: true }]) {
    const idea = D.ideaForDay(day, c);
    assert.ok(D.available(idea, c)); assert.ok(D.docAvailable(D.sanitizeDoc(D.docFromIdea(idea, me, "de")), c), idea.id);
  }
});
test("Zufallsidee: Kalenderideen bleiben ihrem Tag vorbehalten", () => {
  for (let i = 0; i < 2000; i++) assert.notEqual(D.randomIdea(Math.random, "").id, "halloween");
});
test("Archiv: die letzten Tage, neueste zuerst, ohne heute", () => {
  const d = new Date("2026-11-10T12:00:00Z"), l = D.lastDays(d, 7);
  assert.equal(l.length, 7); assert.equal(l[0].key, "2026-11-09"); assert.equal(l[6].key, "2026-11-03");
  assert.equal(l[0].idea.id, D.ideaForDay(new Date("2026-11-09T01:00:00Z")).id);
});
test("Links: alte Challenge v:1 bleibt gueltig, auch mit Name", () => {
  const st = { v: 1, seed: 42, params: { gravity: 1800, jump: 430, gap: 140, speed: 130 }, theme: "night", title: "Alt", emoji: "🚀", score: 17, name: "Mira" };
  const r = D.parseRoute("#c=" + C.encodeState(st));
  assert.equal(r.type, "challenge"); assert.deepEqual(r.state, st);
  assert.equal(D.parseRoute("#c=" + C.encodeState({ v: 1, name: "Mira-Test", score: 7 })).state.name, "Mira-Test");
});
test("Links: neue Challenge traegt keinen Namen", () => {
  const st = { v: 1, seed: 1, params: {}, theme: "day", title: "X", emoji: "🐤", name: "Geheim" };
  const url = D.challengeUrl(C.sanitizeState(st), 9), r = D.parseRoute(url.slice(url.indexOf("#")));
  assert.equal(r.state.score, 9); assert.equal(r.state.name, undefined);
});
test("Links: #i= Einladung; unbekannte und boese Ids werden verworfen", () => {
  const id = D.IDEAS[0].id;
  assert.deepEqual(D.parseRoute("#i=" + id), { type: "idea", id });
  for (const h of ["#i=", "#i=gibtsnicht", "#i=<img>", "#i=" + "a".repeat(40), "#i=__proto__"]) assert.equal(D.parseRoute(h), null, h);
  assert.equal(D.inviteUrl(id), "https://bunsenbrenner.org/duell#i=" + id);
  const host = D.inviteUrl(id, true);
  assert.match(host, /^https:\/\/bunsenbrenner\.org\/duell#c=[A-Za-z0-9_-]+$/, "muss den c=-Filter der Huellen passieren");
  assert.deepEqual(D.parseRoute(host.slice(host.indexOf("#"))), { type: "idea", id });
});
test("Remix: Kreation geht durch den Link, Spur bleibt, Link passiert den c=-Filter der Huellen", () => {
  const base = D.docFromIdea(D.byId("karte-spruch"), me, "de"), doc = D.sanitizeDoc(base);
  doc.x = "Mein eigener Satz"; doc.col = ["#14c872", "#ff3da5"]; doc.st = "neon";
  doc.sk = [{ e: "🍕", x: 0.3, y: 0.4, r: 0.1, z: 1 }];
  const areas = D.changedAreas(base, doc);
  assert.deepEqual(areas.sort(), ["farbe", "sticker", "stil", "text"]);
  const url = D.docUrl(D.withTrail(doc, "Mira", areas));
  assert.match(url, /#c=[A-Za-z0-9_\-]+$/);
  const r = D.parseRoute(url.slice(url.indexOf("#")));
  assert.equal(r.type, "doc"); assert.equal(r.doc.x, "Mein eigener Satz"); assert.equal(r.doc.st, "neon");
  assert.equal(r.doc.by[0].n, "Mira"); assert.deepEqual(r.doc.by[0].w.sort(), areas);
  const two = D.withTrail(r.doc, "Ben", ["farbe"]);
  assert.deepEqual(two.by.map((e) => e.n), ["Mira", "Ben"]);
});
test("Remix: unveraenderte Idee hat keine eigene Zutat; Wuerfel-Startsatz bleibt Basis", () => {
  const a = D.docFromIdea(D.byId("foto-boss"), me, "de");
  assert.deepEqual(D.changedAreas(a, D.sanitizeDoc(a)), []);
});
test("Remix: voll beladen bleibt der Link unter der Grenze, die die Seite annimmt", () => {
  const d = D.docFromIdea(D.byId("foto-boss"), me, "de");
  d.t = "Ü".repeat(40); d.s = "Ö".repeat(70); d.x = "Ä".repeat(28); d.y = "Ä".repeat(28);
  d.sk = Array.from({ length: 8 }, (_, i) => ({ e: "🍕", x: 0.123456789 + i / 10, y: 0.987654321 - i / 10, r: 0.5555555, z: 1.2345678 }));
  d.by = Array.from({ length: 5 }, () => ({ n: "Ü".repeat(16), w: ["text", "farbe", "stil", "sticker", "foto"] }));
  const url = D.docUrl(d), f = url.slice(url.indexOf("#c=") + 3);
  assert.ok(f.length <= C.MAX_FRAGMENT, String(f.length));
  assert.equal(D.parseRoute("#c=" + f).type, "doc");
});
test("Link-Inhalte: Markup, Schimpfwoerter, Mist werden entfernt oder abgelehnt", () => {
  const evil = { k: "card", x: "<img src=x onerror=alert(1)>", st: "<script>", col: ["red", "javascript:x"], t: "fuck you", n: "<b>x", sk: [{ e: "<svg>", x: 99, y: -9, r: 9, z: 99 }], by: [{ n: "<i>", w: ["text", "<x>"] }], evil: 1 };
  const r = D.parseRoute("#c=" + b64({ v: 1, d: evil }));
  assert.equal(r.type, "doc");
  assert.ok(!/[<>]/.test(JSON.stringify(r.doc)), JSON.stringify(r.doc));
  assert.equal(r.doc.t, undefined); assert.equal(r.doc.st, "druck"); assert.equal(r.doc.evil, undefined);
  assert.deepEqual(r.doc.col, ["#ffd400", "#ff3b1d"]);
  assert.equal(r.doc.sk[0].x, 1); assert.equal(r.doc.sk[0].z, 2.5); assert.equal(r.doc.by[0].w.length, 1);
  assert.equal(D.parseRoute("#c=" + b64({ v: 1, d: { k: "boese" } })), null);
  assert.equal(D.parseRoute("#c=" + b64({ v: 1, d: null })), null);
  assert.equal(D.parseRoute("#c=!!!"), null);
});
test("Link: weder Foto noch Ton reisen mit, nur Einstellungen", () => {
  const d = D.docFromIdea(D.byId("stimme-monster"), me, "de");
  d.pcm = [1, 2, 3]; d.photo = "data:image/png;base64,AAAA"; d.th = "x";
  const s = JSON.stringify(D.sanitizeDoc(d));
  assert.ok(!/pcm|photo|data:|th"/.test(s), s);
});
test("Mein Stil: nur gueltige Werte, Filter greift beim Spitznamen", () => {
  assert.deepEqual(D.sanitizeProfile({ nick: "Fuck", emoji: "<b>", colors: ["x"], set: "evil" }), { nick: "", emoji: "🐤", colors: ["#ffd400", "#ff3b1d"], set: "tiere" });
  assert.equal(D.sanitizeProfile(null).nick, "");
  assert.equal(D.docFromIdea(D.byId("karte-spruch"), me, "de").col[0], "#2b4bff", "Stil fliesst in die Idee");
});
test("Eingaben: Filter und Laenge", () => {
  assert.equal(D.cleanInput("scheiße"), ""); assert.equal(D.cleanInput("  hallo   du "), "hallo du");
  assert.equal(D.cleanInput("a<b>c"), "a b c"); assert.equal(Array.from(D.cleanInput("x".repeat(200))).length, 90);
});
test("Wand: nur gueltige Eintraege, Deckel, keine fremden Bildquellen", () => {
  const ok = { id: D.IDEAS[0].id, ts: 1, th: "data:image/jpeg;base64,AAAA" };
  assert.deepEqual(D.sanitizeWall([ok, { ...ok, th: "https://evil/x.png" }, { ...ok, id: "x" }, null]), [ok]);
  assert.deepEqual(D.sanitizeWall("kaputt"), []);
  let l = []; for (let i = 0; i < 50; i++) l = D.addToWall(l, { ...ok, ts: i });
  assert.equal(l.length, D.MAX_WALL); assert.equal(l[0].ts, 49);
});

test("Kalenderidee: Halloween erscheint genau am 31.10. und sonst nie", () => {
  assert.equal(D.ideaForDay(new Date("2026-10-31T19:00:00Z")).id, "halloween");
  assert.equal(D.ideaForDay(new Date("2027-10-31T00:00:00Z")).id, "halloween");
  for (let i = 0; i < 365; i++) {
    const d = new Date(Date.UTC(2027, 0, 1) + i * 86400000);
    if (d.toISOString().slice(5, 10) !== "10-31") assert.notEqual(D.ideaForDay(d).id, "halloween");
  }
  const doc = D.docFromIdea(D.byId("halloween"), D.sanitizeProfile({}), "de");
  assert.deepEqual(doc.col, ["#120b1f", "#ff7a00"]); assert.equal(doc.st, "neon");
  assert.ok(D.SETS.grusel.includes("🎃"));
});
test("Plan: 30 Tage ab 2. November, jeden Tag eine eigene Idee, nie zweimal dieselbe Art hintereinander", () => {
  const seen = new Set(); let prev = "";
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.UTC(2026, 10, 2 + i)), idea = D.ideaForDay(day, { crypto: true, channel: false, call: false });
    assert.match(idea.id, /^(plan|zug)-/, day.toISOString()); assert.ok(!seen.has(idea.id)); seen.add(idea.id);
    assert.notEqual(idea.kind, prev, idea.id); prev = idea.kind;
  }
  assert.ok(D.IDEAS.filter((i) => /^plan-/.test(i.id) && i.live).length >= 15, "mindestens die Haelfte fuehrt zu einem echten Dienst");
});
