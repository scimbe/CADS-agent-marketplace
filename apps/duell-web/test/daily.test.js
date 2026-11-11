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
  assert.deepEqual([...new Set(D.IDEAS.map((i) => i.kind))].sort(), [...D.KINDS.filter((k) => k !== "lauf" && k !== "duel" && k !== "code"), ...D.PLAY].sort());   // the runner has no catalog card yet; the one duel (duell-liest) is parked until it is rebuilt; a code game is only made (Code-Modus)
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
  // Mechanik: the kind, for a turn card its situation (D.mech; since the shelf clean-up most cards are turn cards)
  let same = 0; for (let i = 1; i < n; i++) if (D.mech(seq[i]) === D.mech(seq[i - 1])) same++;
  assert.equal(same, 0);
});
test("Tagesfolge: jede Runde enthaelt jede Idee genau einmal, keine Mechanik doppelt, auch nicht ueber die Rundennaht", () => {
  const n = D.ROUND.length, all = D.ROUND.map((x) => x.id).sort();
  for (let r = 0; r < 1000; r++) {
    const seq = D.roundOrder(r), next = D.roundOrder(r + 1);
    assert.deepEqual(seq.map((x) => x.id).sort(), all, "Runde " + r);
    for (let i = 1; i < n; i++) assert.notEqual(D.mech(seq[i]), D.mech(seq[i - 1]), "Runde " + r + " Platz " + i);
    assert.notEqual(D.mech(next[0]), D.mech(seq[n - 1]), "Naht nach Runde " + r);
  }
});
test("Tagesfolge: ueber 30 Jahre nie zweimal dieselbe Mechanik, in jeder Geraeteklasse, nie eine Karte, die aus dem Regal ist", () => {
  const start = Date.UTC(2026, 9, 1), days = 366 * 30;
  const classes = [{ crypto: true }, { crypto: false }, { crypto: true, call: true }, { crypto: false, call: true }, { crypto: true, channel: true, call: true }];
  for (const c of classes) {
    let prev = null;
    for (let n = 0; n < days; n++) {
      const day = new Date(start + n * 86400000), idea = D.ideaForDay(day, c), key = day.toISOString().slice(0, 10);
      assert.ok(idea, key); assert.ok(D.available(idea, c), idea.id + " " + key);
      if (prev) assert.notEqual(D.mech(idea), D.mech(prev), key + ": " + prev.id + " und " + idea.id + " mit " + JSON.stringify(c));
      assert.ok(D.IDEAS.includes(idea) || D.GATED.includes(idea), key + ": " + idea.id);
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
  for (let i = 0; i < 2000; i++) assert.ok(!D.randomIdea(Math.random, "").on);
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
  const base = D.docFromIdea(D.byId("advent-tuer"), me, "de"), doc = D.sanitizeDoc(base);
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
  const a = D.docFromIdea(D.byId("foto-alien"), me, "de");
  assert.deepEqual(D.changedAreas(a, D.sanitizeDoc(a)), []);
});
test("Remix: voll beladen bleibt der Link unter der Grenze, die die Seite annimmt", () => {
  const d = D.docFromIdea(D.byId("foto-alien"), me, "de");
  d.t = "Ü".repeat(40); d.s = "Ö".repeat(70); d.x = "Ä".repeat(28); d.y = "Ä".repeat(28);
  d.sk = Array.from({ length: 8 }, (_, i) => ({ e: "🍕", x: 0.123456789 + i / 10, y: 0.987654321 - i / 10, r: 0.5555555, z: 1.2345678 }));
  d.by = Array.from({ length: 5 }, () => ({ n: "Ü".repeat(16), w: ["text", "farbe", "stil", "sticker", "foto"] }));
  const url = D.docUrl(d), f = url.slice(url.indexOf("#c=") + 3);
  assert.ok(f.length <= C.MAX_FRAGMENT, String(f.length));
  assert.equal(D.parseRoute("#c=" + f).type, "doc");
});
test("Remix: Linkbudget – erst Sticker, dann der Options-Hash h, dann die Spur; das Siegel bleibt pruefbar, solange Sticker weichen koennen", () => {
  const ki = { k: "line", s: "s1.line.mhl2x0ab.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef", h: "Y-feMaAnaOXUrB2BxPv3vUTgMan0NNfOQmA6jhDp_Tc" };
  const load = (trail) => {
    const d = D.docFromIdea(D.byId("foto-alien"), me, "de");
    d.t = "Ü".repeat(40); d.s = "Ö".repeat(70); d.x = "Ä".repeat(28); d.y = "Ä".repeat(28);
    d.sk = Array.from({ length: 8 }, (_, i) => ({ e: "🍕", x: 0.123456789 + i / 10, y: 0.987654321 - i / 10, r: 0.5555555, z: 1.2345678 }));
    d.by = Array.from({ length: trail }, () => ({ n: "Ü".repeat(16), w: ["text", "farbe", "stil", "sticker", "foto"] }));
    d.ki = { ...ki };
    return d;
  };
  const back = (d) => { const u = D.docUrl(d), f = u.slice(u.indexOf("#c=") + 3); assert.ok(f.length <= C.MAX_FRAGMENT, String(f.length)); return D.parseRoute("#c=" + f).doc; };
  let partly = 0;
  for (let trail = 0; trail <= 5; trail++) {
    const d = load(trail), r = back(d);
    assert.equal(r.ki.s, ki.s, "das Siegel bleibt immer");
    if (r.sk.length) assert.equal(r.ki.h, ki.h, "h bleibt, solange noch ein Sticker weichen koennte (Spur " + trail + ")");
    if (r.by.length < trail) assert.equal(r.ki.h, undefined, "die Spur weicht erst nach h");
    if (r.sk.length > 0 && r.sk.length < 8) partly++;
  }
  assert.ok(partly > 0, "mindestens ein Fall, in dem nur ein Teil der Sticker weicht und h bleibt");
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
  const d = D.docFromIdea(D.byId("beat-pausenhof"), me, "de");
  d.pcm = [1, 2, 3]; d.photo = "data:image/png;base64,AAAA"; d.th = "x";
  const s = JSON.stringify(D.sanitizeDoc(d));
  assert.ok(!/pcm|photo|data:|th"/.test(s), s);
});
test("Mein Stil: nur gueltige Werte, Filter greift beim Spitznamen", () => {
  assert.deepEqual(D.sanitizeProfile({ nick: "Fuck", emoji: "<b>", colors: ["x"], set: "evil" }), { nick: "", emoji: "🪁", colors: ["#ffd400", "#ff3b1d"], set: "tiere" });
  assert.equal(D.sanitizeProfile(null).nick, "");
  assert.equal(D.docFromIdea(D.byId("foto-alien"), me, "de").col[0], "#2b4bff", "Stil fliesst in die Idee");
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

test("Regal-Bereinigung (2026-11): freie Kalendertage gehen an den Traeger oder in die Runde, nie an eine entfernte Karte", () => {
  // the day a merged card had goes to the card it went into, if that one is a calendar card itself (ideas.json retired, to)
  const own = { "11-09": "zug-termin", "11-20": "zug-einig", "11-30": "zug-auktion", "12-11": "zug-auktion",
    "11-06": "arcade-kick", "11-10": "arcade-kick", "11-16": "arcade-kick", "11-18": "arcade-panzer", "12-23": "arcade-stock" };
  for (const [md, id] of Object.entries(own)) assert.equal(D.ideaForDay(new Date("2026-" + md + "T12:00:00Z")).id, id, md);
  // every other freed day (Halloween, the plan-* days, the eight Wohlfuehl days) is a day of the round: a card that is on the shelf
  for (const md of ["10-31", "12-01", "11-03", "11-05", "11-07", "11-11", "11-13", "11-15", "11-17", "11-19", "11-21", "11-23", "11-25", "11-27", "11-29", "12-06", "12-08", "12-10", "12-12", "12-14", "12-16", "12-18", "12-20"]) {
    const idea = D.ideaForDay(new Date("2026-" + md + "T12:00:00Z"));
    assert.ok(idea && D.IDEAS.includes(idea) && !idea.on, md + ": " + (idea && idea.id));
  }
  assert.notEqual(D.ideaForDay(new Date("2026-11-11T12:00:00Z")).id, "plan-10", "Auktion der Agenten ist aus dem Kalender");
  // Halloween is off the shelf (merged into "Mach auf, wenn ..."), a link shared before still opens it with its look
  assert.deepEqual(D.parseRoute("#i=halloween"), { type: "idea", id: "halloween" });
  const h = D.byId("halloween"); assert.ok(D.RETIRED.includes(h) && h.to === "zug-umschlag" && !h.on);
  const doc = D.docFromIdea(h, D.sanitizeProfile({}), "de");
  assert.deepEqual(doc.col, ["#120b1f", "#ff7a00"]); assert.equal(doc.st, "neon");
  assert.ok(D.SETS.grusel.includes("🎃"));
  // a retired card never comes up by itself: not in the round, not as a random idea, not in the search
  for (let n = 0; n < 2000; n++) assert.ok(!D.RETIRED.includes(D.randomIdea(Math.random, "")));
  assert.deepEqual(D.searchIdeas("Halloween", new Date("2026-11-10T12:00:00Z")), []);
});
test("Plan: 30 Tage ab 2. November, jeden Tag eine Karte aus dem Regal, nie zweimal dieselbe Mechanik hintereinander", () => {
  // ab dem 6. November wechseln sich Arcade-Spiele und Karten ab, damit die Spiele nicht erst im Dezember auftauchen
  for (let d = 6; d <= 18; d += 2) assert.equal(D.ideaForDay(new Date(Date.UTC(2026, 10, d)), { crypto: true }).kind, "arcade", "11-" + d);
  // The plan-* cards (and with them "jeden Tag eine eigene Idee") left with the shelf clean-up: 74 cards instead of 209, the
  // arcade days of the merged duels belong to Stangen-Kick and Insel-Panzer now, so an arcade card may come twice.
  let prev = "";
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.UTC(2026, 10, 2 + i)), idea = D.ideaForDay(day, { crypto: true, channel: false, call: false });
    assert.ok(D.IDEAS.includes(idea) && !D.GONE.includes(idea.id) && !D.RETIRED.includes(idea), day.toISOString());
    assert.notEqual(D.mech(idea), prev, idea.id); prev = D.mech(idea);
  }
});
test("Adventstuerchen: nur am 22. und 24. Dezember zwischen zwei Arcade-Tagen, der Dezember-Plan bleibt, wie er ist", () => {
  const DAYS = ["12-22", "12-24"], CAPS = [{ crypto: true }, { crypto: false }, { crypto: true, call: true }, { crypto: true, channel: false, call: false }];
  // every other calendar idea still owns its day: plan-30, Geld einsammeln, Termin finden, Wohlfuehl- und Arcade-Tage
  for (const i of D.IDEAS.filter((x) => x.on && x.id !== "advent-tuer")) for (const md of [].concat(i.on)) assert.equal(D.ideaForDay(new Date("2026-" + md + "T12:00:00Z")).id, i.id, md);
  for (const year of [2026, 2027, 2030]) {
    let prev = null;
    for (let d = 0; d < 34; d++) {
      const day = new Date(Date.UTC(year, 10, 29 + d, 12)), key = day.toISOString().slice(5, 10);
      for (const c of CAPS) {
        const idea = D.ideaForDay(day, c);
        if (DAYS.includes(key)) {
          assert.equal(idea.id, "advent-tuer", year + "-" + key);
          for (const n of [-1, 1]) assert.notEqual(D.ideaForDay(new Date(day.getTime() + n * 86400000), c).kind, "card", year + "-" + key + " Nachbar");
          assert.equal(D.ideaForDay(new Date(day.getTime() - 86400000), c).kind, "arcade", "davor wird gespielt");
        } else assert.notEqual(idea.id, "advent-tuer", year + "-" + key);
      }
      const idea = D.ideaForDay(day, { crypto: true });
      if (prev) assert.notEqual(D.mech(idea), D.mech(prev), year + "-" + key + ": " + prev.id + " und " + idea.id);
      prev = idea;
    }
  }
  assert.equal(D.ideaForDay(new Date("2026-12-23T12:00:00Z")).kind, "arcade", "zwischen den beiden Tuerchen-Tagen wird gespielt");
  for (let i = 0; i < 2000; i++) assert.notEqual(D.randomIdea(Math.random, "").id, "advent-tuer");
  assert.ok(D.searchIdeas("Adventstürchen", new Date("2026-11-03T12:00:00Z")).some((h) => h.idea.id === "advent-tuer"), "jederzeit ueber die Suche");
  assert.ok(D.searchIdeas("tuerchen", new Date("2026-07-01T12:00:00Z")).some((h) => h.idea.id === "advent-tuer"));
});
test("Adventstuerchen: Nummer 1 bis 24 reist im Link, Vorbelegung ist der Dezembertag, sonst 1", () => {
  assert.equal(D.doorNumber(new Date("2026-12-06T10:00:00Z")), 6);
  assert.equal(D.doorNumber(new Date("2026-12-24T23:59:00Z")), 24);
  assert.equal(D.doorNumber(new Date("2026-12-25T10:00:00Z")), 1);
  assert.equal(D.doorNumber(new Date("2026-11-03T10:00:00Z")), 1);
  const doc = D.docFromIdea(D.byId("advent-tuer"), D.sanitizeProfile({}), "de");
  assert.equal(doc.k, "card"); assert.equal(doc.st, "advent"); assert.ok(doc.nr >= 1 && doc.nr <= 24);
  assert.deepEqual(doc.col, ["#0f5132", "#ffd400"]); assert.ok(D.STYLES.card.includes("advent"));
  for (const e of ["🎄", "⭐", "🎁", "❄️", "⛄"]) assert.ok(D.SETS.advent.includes(e), e);
  for (const [v, want] of [[7, 7], [0, 1], [99, 24], ["12", 12], [3.6, 4], ["x", 1]]) assert.equal(D.sanitizeDoc({ ...doc, nr: v }).nr, want, String(v));
  assert.equal(D.sanitizeDoc({ k: "card", x: "Hallo" }).nr, undefined, "normale Karte bekommt keine Nummer");
  assert.equal(D.sanitizeDoc({ k: "photo", nr: 5 }).nr, undefined);
  const r = D.parseRoute(D.docUrl({ ...doc, nr: 17, x: "Für dich" }).split("#")[1].replace(/^/, "#"));
  assert.equal(r.type, "doc"); assert.equal(r.doc.nr, 17); assert.equal(r.doc.x, "Für dich"); assert.equal(r.doc.st, "advent");
  assert.deepEqual(D.changedAreas(doc, { ...doc, nr: doc.nr % 24 + 1 }), ["text"]);
});

test("plainTitle: Bindestrich-Titel einzeilig richtig zusammengesetzt (Tür-|steher, Winter-|Tunnel), kein \"|\" in Titeln", () => {
  assert.equal(D.plainTitle("Tür-|steher"), "Türsteher");
  assert.equal(D.plainTitle("Geister-|schicht"), "Geisterschicht");
  assert.equal(D.plainTitle("Winter-|Tunnel"), "Winter-Tunnel");
  assert.equal(D.plainTitle("Rätsel-|Staffel"), "Rätsel-Staffel");
  assert.equal(D.plainTitle("Letzte Socke|unterm Hammer"), "Letzte Socke unterm Hammer");
  assert.equal(D.plainTitle("Ghost|shift"), "Ghost shift");
  for (const i of D.IDEAS) for (const l of ["de", "en"]) {
    const s = D.plainTitle(i[l].t);
    assert.ok(!/\||- /.test(s), i.id + " " + l + ": " + s);
  }
  const geist = D.IDEAS.find((i) => i.id === "spiel-geist");
  if (geist) assert.equal(D.docFromIdea(geist, me, "de").g.title, "Geisterschicht");
});

test("Geparkte Karte (duell-liest, Bot als Akteur, bis zum Umbau): nie ein Tag, nie im Regal oder in der Suche, alle anderen Tage bleiben", () => {
  const P = D.byId("duell-liest");
  assert.ok(P && D.RETIRED.includes(P) && !D.IDEAS.includes(P), "nicht im Regal, Link oeffnet weiter");
  assert.ok(D.ROUND.includes(P), "behaelt den Platz in der Runde: die Reihenfolge der anderen Tage bleibt");
  for (const c of [{ crypto: true }, { crypto: false, channel: true, call: true }]) for (let d = 0; d < 1200; d++) {
    assert.notEqual(D.ideaForDay(new Date(Date.UTC(2026, 10, 10 + d, 10)), c).id, "duell-liest");
  }
  assert.deepEqual(D.searchIdeas("liest dich", new Date("2026-11-10T10:00:00Z")), []);
  const rnd = C.mulberry32(7); for (let k = 0; k < 500; k++) assert.notEqual(D.randomIdea(rnd).id, "duell-liest");
});
