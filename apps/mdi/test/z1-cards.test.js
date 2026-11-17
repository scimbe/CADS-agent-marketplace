// Z1-Karten: Verdrahtung (Manifest <-> Varianten <-> Altregel), Alt-Orakel ueber die echten Karten, Bildschirme aus
// Draft-Knoten (Geld, PayPal ab 18, Termine, Liste, Wunschzettel-Geheimnis, Tor), Vereinigung und freie Karte.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rng } from "../src/contract/sdk.js";
import * as L from "../src/engines/zug/merge.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALT = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures/zug-golden-z1.json"), "utf8"));
const IDS = ["zug-sammeln", "zug-termin", "zug-einkauf", "zug-wichteln", "zug-reihum", "zug-einig", "zug-wunschzettel", "geschenk-finder", "karte-danke", "zug-umschlag", "zug-kapsel", "zug-gutschein", "raum-sorry"];
const CARD = {};
for (const id of IDS) CARD[id] = (await import("../src/cards/" + id + "/card.js")).default;
// Altspiel -> (Karte, Variante)
const WHERE = { sammeln: ["zug-sammeln"], termin: ["zug-termin"], einkauf: ["zug-einkauf"], wichteln: ["zug-wichteln"], reihum: ["zug-reihum", "reihum"], kerzen: ["zug-reihum", "kerzen"], einig: ["zug-einig", "einig"], rangliste: ["zug-einig", "rangliste"], wunsch: ["zug-wunschzettel"], geschenk: ["geschenk-finder"], danke: ["karte-danke", "danke"], urkunde: ["karte-danke", "urkunde"], umschlag: ["zug-umschlag", "umschlag"], morgen: ["zug-umschlag", "morgen"], kapsel: ["zug-kapsel", "kapsel"], post: ["zug-kapsel", "post"], gutschein: ["zug-gutschein", "gutschein"], rubbellos: ["zug-gutschein", "rubbellos"], sorry: ["raum-sorry", "sorry"] };

function defaults(card, variant) {
  const p = {}; for (const [k, v] of Object.entries(card.manifest.params.properties)) p[k] = structuredClone(v.default);
  if (variant) p.spiel = variant;
  return p;
}
function start(id, variant, seed) {
  const card = CARD[id], st = card.init({ rng: rng("t|" + id), params: defaults(card, variant), players: card.manifest.players.max });
  if (seed !== undefined) st.pub.seed = seed;
  return st;
}
function play(card, st, v, d) { const seat = card.status(st).turn; const x = card.answer(st.pub, seat, v, d); assert.ok(card.accepts(card.observe(st, seat), seat, x), "angenommen: " + JSON.stringify(v)); return card.step(st, x); }
function walk(n, f) { if (!n || typeof n !== "object") return; f(n); for (const c of n.children || []) walk(c, f); }
function nodes(n, t) { const out = []; walk(n, (x) => { if (x.t === t) out.push(x); }); return out; }
function texts(n) { const out = []; walk(n, (x) => { if (x.t === "text") out.push(x.text); if (x.t === "choice") { out.push(x.label); for (const o of x.options) out.push(o.label); } if (x.t === "field") out.push(x.label, x.value); }); return out.join(" | "); }

test("13 Karten: Manifest, Varianten, Altkennungen und Vertrag passen zusammen", () => {
  for (const id of IDS) {
    const c = CARD[id], m = c.manifest;
    assert.equal(m.id, id); assert.equal(m.kind, "turn"); assert.equal(m.mode, "turn");
    for (const k of ["init", "step", "observe", "status", "moves", "view", "accepts", "fromFree", "toFree", "compact", "merge"]) assert.equal(typeof c[k], "function", id + "." + k);
    assert.ok(m.legacy.includes(id), id + ": eigene Altkennung");
    const variants = m.params.properties.spiel ? m.params.properties.spiel.enum : [null];
    for (const v of variants) {
      const st = start(id, v);
      assert.ok(c.status(st).turn >= 0, id + "/" + v + " startet");
      for (const lang of ["de", "en"]) {
        const tree = c.view(c.observe(st, 0), 0, { lang, today: 20770, age18: true, nick: "Ana" });
        assert.equal(tree.t, "stack"); assert.ok(tree.children.length > 0, id + "/" + v + " zeigt etwas");
        assert.ok(tree.head && tree.head.turn === 1 && tree.head.total >= 1, id + " Kopf Zug n von m");
        c.view(c.observe(st, 0), 0, { lang, preview: true });
      }
    }
    const pairs = [...m.legacy.map((l) => [l, m.params.properties.spiel ? m.params.properties.spiel.default : null]), ...(m.variants || []).flatMap((v) => v.legacy.map((l) => [l, v.params.spiel]))];
    for (const [legacyId, v] of pairs) {
      const p = c.fromFree({ k: "turn", i: legacyId, t: "Für Oma" });
      assert.ok(p, id + " fromFree " + legacyId);
      if (v) assert.equal(p.spiel, v);
      assert.equal(p.titel, "Für Oma");
      assert.equal(c.fromFree(c.toFree(p)).spiel, p.spiel, "Rundreise");
    }
    assert.equal(c.fromFree({ k: "turn", i: "zug-bluff" }), null, "fremde Karte -> null");
  }
});

test("Alt-Orakel ueber die echten Karten: alle Faelle der Fixture spielen durch", () => {
  let n = 0;
  for (const f of ALT.faelle) {
    const [id, v] = WHERE[f.g], card = CARD[id];
    let st = start(id, v, f.seed);
    f.turns.forEach((t, ti) => {
      for (const a of t.a) st = play(card, st, a, t.d);
      if (f.g === "wunsch" && f.closed && ti === f.turns.length - 1) st = card.step(st, { t: "close", seat: card.status(st).turn });
    });
    assert.deepEqual(st.pub.m, f.m, f.g);
    assert.deepEqual(card.result(st.pub, "de"), f.results.de, f.g + " Ergebnis");
    if (f.over) {
      const tree = card.view(card.observe(st, 0), 0, { lang: "de", today: ALT.heute + 40 });
      assert.ok(tree.result, f.g + " Ergebnisansicht");
      assert.ok(texts(tree).includes(f.results.de.h), f.g + " Ergebnis sichtbar");
    }
    n++;
  }
  assert.equal(n, ALT.faelle.length);
});

test("Geld einsammeln: Name nur ab 18, Betrag in Cent mit Anteil und Rest, PayPal-Knopf nur ab 18", () => {
  const c = CARD["zug-sammeln"];
  let st = start("zug-sammeln");
  const minor = c.view(c.observe(st, 0), 0, { lang: "de", age18: false });
  assert.equal(nodes(minor, "field").length, 0, "ohne 18+ kein Namensfeld");
  assert.deepEqual(nodes(minor, "action").map((x) => x.act), ["age18"]);
  const adult = c.view(c.observe(st, 0), 0, { lang: "de", age18: true, draft: { v: "annaSammelt" } });
  assert.equal(nodes(adult, "field")[0].key, "v");
  assert.equal(nodes(adult, "go")[0].input.a, "annaSammelt");
  const bad = c.view(c.observe(st, 0), 0, { lang: "de", age18: true, draft: { v: "anna sammelt" } });
  assert.equal(nodes(bad, "go")[0].disabled, true); assert.ok(nodes(bad, "go")[0].why.length > 0, "sichtbarer Grund");
  st = play(c, st, "annaSammelt"); st = play(c, st, "Pizza-Abend"); st = play(c, st, 4);
  const m = c.view(c.observe(st, 0), 0, { lang: "de", age18: true, draft: { v: "37,50" } });
  assert.ok(texts(m).includes("37,50 € geteilt durch 4 · 9,37 € pro Person · Rest 2 ct übernimmt, wer sammelt"), texts(m));
  assert.equal(nodes(m, "go")[0].input.a, 3750);
  const tooMuch = c.view(c.observe(st, 0), 0, { lang: "de", age18: true, draft: { v: "201" } }); // > 50 € je Person
  assert.equal(nodes(tooMuch, "go")[0].disabled, true);
  st = play(c, st, 3750);
  assert.equal(c.status(st).turn, 1); assert.equal(c.status(st).local, true, "Zahlen bleibt auf dem Geraet");
  const payMinor = c.view(c.observe(st, 1), 1, { lang: "de", age18: false });
  assert.equal(nodes(payMinor, "link").length, 0, "kein PayPal-Link ohne 18+");
  const pay = c.view(c.observe(st, 1), 1, { lang: "de", age18: true });
  assert.deepEqual(nodes(pay, "link").map((x) => x.href), ["https://paypal.me/annaSammelt/9.37EUR"]);
  assert.equal(nodes(pay, "go").length, 0, "Zahlen ist das Ende, kein Weiter");
});

test("Termin: Uhrzeit + Tage antippen, Name vorbelegt, Feiertag am Tag, doppelter Name abgelehnt, .ics", () => {
  const c = CARD["zug-termin"], today = 20811; // 2026-12-23
  let st = start("zug-termin");
  const v0 = c.view(c.observe(st, 0), 0, { lang: "de", today, nick: "Ana" });
  assert.ok(texts(v0).includes("1. Weihnachtstag"), "Feiertag steht am Tag");
  assert.equal(nodes(v0, "go")[0].disabled, true);
  const d = { h: 6, picked: [(today + 1) * 10 + 6, (today + 3) * 10 + 6], name: "Ana" };
  const v1 = c.view(c.observe(st, 0), 0, { lang: "de", today, draft: d });
  assert.deepEqual(nodes(v1, "go")[0].input.a, ["Ana", d.picked]);
  // Satz zu Formular ohne KI
  const vs = c.view(c.observe(st, 0), 0, { lang: "de", today: 20770, draft: { satz: "Grillen bei mir nächsten Samstagabend" } });
  assert.ok(texts(vs).includes("Ohne KI erkannt"));
  assert.ok(nodes(vs, "ai").some((x) => x.kind === "plan"));
  st = play(c, st, ["Ana", d.picked]);
  assert.equal(c.status(st).turn, 1, "Sitz = Zug");
  const vv = c.view(c.observe(st, 1), 1, { lang: "de", today, draft: { name: "ana", v: [0, 0] } });
  assert.ok(texts(vv).includes("Den Namen gibt es schon"));
  assert.equal(nodes(vv, "go")[0].disabled, true);
  assert.equal(nodes(vv, "file")[0].mime, "text/calendar");
  assert.match(nodes(vv, "file")[0].text, /^BEGIN:VCALENDAR\r\n/);
  st = play(c, st, ["Ben", [0, 1]]);
  assert.equal(c.status(st).turn, 2);
});

test("Wunschzettel: die Wuenschende sieht keine Marke und keinen Namen; Familie sieht nur 'vergeben'", () => {
  const c = CARD["zug-wunschzettel"], cf = L.WISH;
  let st = start("zug-wunschzettel");
  let list = L.shopApply(null, { name: "", adds: [{ text: "Hörbuch", qty: 1 }, { text: "Socken", qty: 1 }], marks: {} }, cf);
  st = play(c, st, list);
  list = L.shopApply(list, { name: "Ben", face: 2, adds: [], marks: { [L.shopKey("Hörbuch")]: 1 } }, cf);
  st = play(c, st, list); // Ben (Familie) schickt zurueck
  const own = c.view(c.observe(st, 0), 0, { lang: "de", memo: { own: true } });
  const t = texts(own);
  assert.ok(t.includes("Hörbuch") && t.includes("Socken"));
  for (const s of ["Ben", "vergeben", "Du schenkst", "🎁"]) assert.ok(!t.includes(s), "Wuenschende sieht nicht: " + s);
  const ask = c.view(c.observe(st, 0), 0, { lang: "de" });
  assert.ok(texts(ask).includes("Wer bist du?"), "fremdes Geraet fragt zuerst");
  const fam = c.view(c.observe(st, 0), 0, { lang: "de", memo: { own: false }, draft: { name: "Cem" } });
  assert.ok(texts(fam).includes("Hörbuch · Schon vergeben"));
  assert.ok(!texts(fam).includes("Ben"), "auch die Familie sieht nicht, wer");
  // schliessen kann nur die Wuenschende; danach vorbei
  st = c.step(st, { t: "close", seat: c.status(st).turn });
  assert.equal(c.status(st).over, true);
});

test("Einkauf: Vereinigung ist kommutativ, idempotent; compact ergibt denselben Listenstand", () => {
  const c = CARD["zug-einkauf"], cf = L.SHOP;
  let a = start("zug-einkauf", undefined, 7);
  const l0 = L.shopApply(null, { name: "", adds: [{ text: "Milch", qty: 2 }, { text: "Brot", qty: 1 }], marks: {} }, cf);
  a = play(c, a, l0);
  const lb = L.shopApply(l0, { name: "Ben", adds: [{ text: "Käse", qty: 1 }], marks: { milch: 2 } }, cf);
  const lc = L.shopApply(l0, { name: "Cem", adds: [{ text: "Äpfel", qty: 3 }], marks: { brot: 1 } }, cf);
  const b = play(c, a, lb), cc = play(c, a, lc);
  const x = c.merge(b.pub, cc.pub), y = c.merge(cc.pub, b.pub);
  assert.deepEqual(x.m, y.m, "kommutativ");
  assert.deepEqual(c.merge(x, x).m, x.m, "idempotent");
  assert.deepEqual(L.shopRows(x.m[0][0]).map((r) => r.label).sort(), ["2× Milch", "3× Äpfel", "Brot", "Käse"].sort());
  const log = c.compact([{ t: "ans", seat: 0, a: l0 }, { t: "ans", seat: 1, a: lb }]);
  assert.equal(log.length, 2, "zwei Antworten -> k = 2");
  let r = start("zug-einkauf", undefined, 7);
  for (const i of log) r = c.step(r, i);
  assert.deepEqual(r.pub.m, [[lb]]); assert.deepEqual(r.pub, b.pub, "verdichtetes Log ergibt genau den Stand des Absenders");
  // nach merge: compact(log, state) spielt den vereinigten Stand nach (Empfang, ADR 0001 f)
  const log2 = c.compact([], { pub: x });
  let r2 = start("zug-einkauf", undefined, 7);
  for (const i of log2) r2 = c.step(r2, i);
  assert.deepEqual(r2.pub, x);
  // Ansicht: abhaken braucht einen Namen
  const v = c.view(c.observe(b, 0), 0, { lang: "de", draft: {} });
  assert.ok(nodes(v, "choice").some((ch) => ch.options.some((o) => o.label === "Hab ich gekauft" && o.disabled)));
});

test("Wichteln: jede Person sieht nur ihren Zettel, das Ergebnis bleibt lokal", () => {
  const c = CARD["zug-wichteln"];
  let st = start("zug-wichteln", undefined, 123);
  st = play(c, st, ["Ana", "Ben", "Cem", "Dana", "", "", "", "", "", "", "", ""]);
  st = play(c, st, [1]);
  const v = c.view(c.observe(st, 1), 1, { lang: "de" });
  const shown = nodes(v, "text").filter((x) => x.role === "big").map((x) => x.text);
  assert.equal(shown.length, 1); assert.ok(["Ana", "Cem", "Dana"].includes(shown[0]), "nie sich selbst");
  st = play(c, st, 0);
  assert.equal(c.status(st).over, true); assert.equal(c.status(st).local, true);
});

test("Kapsel: Tor nur ueber ctx.today; ohne Tag bleibt es zu (kein stilles Oeffnen)", () => {
  const c = CARD["zug-kapsel"];
  let st = start("zug-kapsel", "kapsel");
  st = play(c, st, [2]); st = play(c, st, 5, 20770);
  assert.equal(st.pub.o, 20775);
  assert.match(texts(c.view(c.observe(st, 1), 1, { lang: "de", today: 20771 })), /Noch 4 Tage verschlossen/);
  assert.match(texts(c.view(c.observe(st, 1), 1, { lang: "de" })), /Verschlossen, bis das Datum bekannt ist/);
  assert.equal(nodes(c.view(c.observe(st, 1), 1, { lang: "de", today: 20775 }), "choice").length, 1);
  assert.equal(c.accepts(c.observe(start("zug-kapsel", "kapsel"), 0), 0, { t: "ans", seat: 0, a: [2], d: 5 }), false, "d ausserhalb des Bereichs");
});

test("Poster-Varianten: Satz, Vorname vorn, Empfang zeigt die Karte, Antwortkarte genannt", () => {
  const c = CARD["karte-danke"];
  let st = start("karte-danke", "warm-toll");
  st = play(c, st, [1]); st = play(c, st, "Lea"); st = play(c, st, "");
  assert.equal(c.accepts(c.observe(st, 1), 1, c.answer(st.pub, 1, 0)), true);
  const v = c.view(c.observe(st, 1), 1, { lang: "de" });
  assert.ok(texts(v).includes("Lea, nur kurz: Du bist toll."), texts(v));
  st = play(c, st, 0);
  assert.match(c.result(st.pub, "de").lines.join(" "), /Antworten mit:/);
  const bad = start("karte-danke", "warm-toll"), b2 = play(c, bad, [0]);
  assert.equal(c.accepts(c.observe(b2, 0), 0, c.answer(b2.pub, 0, "lea@x.de")), false, "kein Kontakt im Namen");
});

test("Geschenk: Fragen als Chips, fuenf Ideen im Budget, Ergebnis fuehrt zu Geld einsammeln", () => {
  const c = CARD["geschenk-finder"];
  let st = start("geschenk-finder", undefined, 99);
  st = play(c, st, [4]); st = play(c, st, [1]); st = play(c, st, [0, 2]);
  const v = c.view(c.observe(st, 0), 0, { lang: "de", draft: { i: 2 } });
  const list = nodes(v, "choice")[0].options.map((o) => o.label);
  assert.equal(list.length, 5);
  assert.deepEqual(nodes(v, "go")[0].input.a, [list, 2]);
  st = play(c, st, [list, 2]); st = play(c, st, [2]);
  const r = c.result(st.pub, "de");
  assert.ok(r.open && r.open.i === "zug-sammeln");
  assert.ok(nodes(c.view(c.observe(st, 0), 0, { lang: "de" }), "open").some((x) => x.card === "zug-sammeln"));
});

test("Der erste Satz: auf einem Geraet, Ergebnis zum Kopieren", () => {
  const c = CARD["raum-sorry"];
  let st = start("raum-sorry", "sorry");
  for (let i = 0; i < 3; i++) { assert.equal(c.status(st).turn, 0); st = play(c, st, [i % 2]); }
  const v = c.view(c.observe(st, 0), 0, { lang: "de" });
  assert.equal(nodes(v, "copy").length, 1);
  assert.equal(nodes(v, "copy")[0].text, c.result(st.pub, "de").copy);
});

test("Review H1/L2/L6: geerbte Schluessel, Geschenkfilter aus dem Link, leere Eingabe", () => {
  for (const id of ["zug-einkauf", "zug-wunschzettel"]) {
    const c = CARD[id];
    let st = start(id);
    const evil = [[["Constructor", 0]], [["Constructor", 0, 1, [[0, 1]]], ["toString", 1, 1, []], ["Brot", 2, 1, []]]];
    const ok = c.accepts(c.observe(st, 0), 0, { t: "ans", seat: 0, a: evil });
    if (ok) {
      st = c.step(st, { t: "ans", seat: 0, a: evil });
      c.view(c.observe(st, 1), 1, { lang: "de", memo: { own: false }, draft: { name: "Ana" } });
      assert.deepEqual(L.shopRows(c.merge(st.pub, st.pub).m[0][0], id === "zug-einkauf" ? L.SHOP : L.WISH).map((r) => r.text), ["Constructor", "toString", "Brot"]);
      c.moves(c.observe(st, 1), 1);
    }
    assert.equal(Object.prototype.t, undefined); assert.equal(Object.t, undefined, "kein Schreiben auf Object");
  }
  const g = CARD["geschenk-finder"];
  let st = start("geschenk-finder", undefined, 5);
  st = play(g, st, [4]); st = play(g, st, [1]); st = play(g, st, [0, 2]);
  assert.equal(g.accepts(g.observe(st, 0), 0, { t: "ans", seat: 0, a: [["Wodka", "Zigarren"], 0] }), false, "Filter auch fuer Link-Ideen");
  assert.equal(g.accepts(g.observe(st, 0), 0, null), false);
});

test("Wunschzettel merkt sich je Partie, wessen Geraet es ist (ctx.memo): Anlegen setzt own, fremdes Geraet fragt einmal", () => {
  const c = CARD["zug-wunschzettel"];
  let st = start("zug-wunschzettel");
  const draft = { neu: "", adds: [{ text: "Buch", qty: 1 }] };
  const v0 = c.view(c.observe(st, 0), 0, { lang: "de", draft });
  assert.deepEqual(nodes(v0, "go")[0].memo, { own: true }, "Anlegen merkt sich: mein Zettel");
  st = play(c, st, L.shopApply(null, { name: "", adds: [{ text: "Buch", qty: 1 }] }, L.WISH));
  const ask = c.view(c.observe(st, 1), 1, { lang: "de" });
  assert.deepEqual(nodes(ask, "choice")[0].options.map((o) => o.memo), [{ own: true }, { own: false }], "einmal fragen, Antwort merken");
  assert.equal(nodes(ask, "go").length, 0);
  const known = c.view(c.observe(st, 1), 1, { lang: "de", memo: { own: false }, draft: { name: "Ben" } });
  assert.ok(!texts(known).includes("Wer bist du?"), "gemerkt: keine Frage mehr");
  assert.equal(nodes(known, "go")[0].memo, undefined, "nichts Neues zu merken");
});
