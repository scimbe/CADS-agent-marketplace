"use strict";
// Part direkt (editor E1): history, sticker steps, colour names and the spoken description, pure (src/editmodel.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../src/editmodel.js");
const D = require("../src/daily.js");
const TEXTS = require("../src/texts.json"), DUEL = require("../src/duel.json").texts, DIREKT = require("../src/direkt.json");
const me = D.sanitizeProfile({ nick: "Mira", emoji: "🐙", colors: ["#2b4bff", "#ffe600"], set: "essen" });
// Kit.t as the page has it once the part is in: core texts, duel texts, the part's texts; {x} filled in.
const tr = (l) => { const b = Object.assign({}, TEXTS[l], DUEL[l], DIREKT.texts[l]); return (k, o) => { assert.ok(b[k] != null, l + ": Text fehlt " + k); return b[k].replace(/\{(\w+)\}/g, (_, x) => (o && o[x] != null ? o[x] : "")); }; };
const PAIRS = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8").match(/var PAIRS = (\[\[.*?\]\]);/)[1];

test("Verlauf: jede Aenderung ein Schritt, Undo/Redo symmetrisch, neue Aenderung loescht das Redo", () => {
  const h = M.history("a");
  assert.equal(M.canUndo(h), false); assert.equal(M.undo(h), null);
  M.record(h, "b", 0, null); M.record(h, "c", 10, null);
  assert.equal(M.record(h, "c", 20, null), false, "gleicher Stand ist kein Schritt");
  assert.equal(M.undo(h), "b"); assert.equal(M.undo(h), "a"); assert.equal(M.undo(h), null);
  assert.equal(M.redo(h), "b"); assert.equal(M.redo(h), "c"); assert.equal(M.redo(h), null);
  M.undo(h); M.record(h, "x", 30, null);
  assert.equal(M.canRedo(h), false, "Redo weg nach neuer Aenderung"); assert.deepEqual(h.list, ["a", "b", "x"]);
});
test("Verlauf: Tippen in einem Feld wird ein Schritt pro Pause von 600 ms; anderes Feld oder Pause trennt", () => {
  const h = M.history("");
  ["H", "Ha", "Hal", "Hall", "Hallo"].forEach((s, i) => M.record(h, s, i * 150, "f1"));
  assert.deepEqual(h.list, ["", "Hallo"], "ein Wort, ein Schritt");
  M.record(h, "Hallo W", 600 + 700, "f1");
  assert.deepEqual(h.list, ["", "Hallo", "Hallo W"], "nach der Pause ein neuer Schritt");
  M.record(h, "Hallo W!", 1400, "f2");
  assert.equal(h.list.length, 4, "anderes Feld, neuer Schritt");
  assert.equal(M.undo(h), "Hallo W"); M.record(h, "Hallo W?", 1500, "f2");
  assert.deepEqual(h.list.slice(-2), ["Hallo W", "Hallo W?"], "nach Undo verschmilzt nichts mit dem alten Schritt");
  const z = M.history("A"); M.record(z, "AB", 0, "f9"); M.record(z, "A", 100, "f9");
  assert.deepEqual(z.list, ["A"], "getippt und gleich wieder geloescht: kein leerer Schritt"); assert.equal(M.canUndo(z), false);
  const g = M.history("0"); M.record(g, "1", 0, "p1"); M.record(g, "2", 5000, "p1"); M.record(g, "3", 5100, "p2");
  assert.deepEqual(g.list, ["0", "2", "3"], "eine Ziehgeste bleibt ein Schritt, wie lange sie auch dauert; die naechste Geste ist ein neuer");
});
test("Verlauf: hoechstens 50 Staende, die aeltesten fallen weg, Undo geht 49 Schritte zurueck", () => {
  const h = M.history("0");
  for (let i = 1; i <= 80; i++) M.record(h, String(i), i * 1000, null);
  assert.equal(h.list.length, M.LIMIT); assert.equal(h.list[h.pos], "80");
  let n = 0; while (M.undo(h) != null) n++;
  assert.equal(n, M.LIMIT - 1); assert.equal(h.list[h.pos], "31");
  for (let i = 0; i < 10; i++) M.redo(h);
  assert.equal(h.list[h.pos], "41");
});
test("Sticker: Schritte bleiben auf der Karte und in den Grenzen; Tasten 2 %, mit Shift 10 %", () => {
  const s = { e: "🐸", x: 0.99, y: 0.01, r: 3.1, z: 2.4 };
  assert.deepEqual(M.nudge(s, { dx: 0.05, dy: -0.05 }), { e: "🐸", x: 1, y: 0, r: 3.1, z: 2.4 });
  assert.equal(M.nudge(s, { dz: 0.2 }).z, 2.5); assert.equal(M.nudge({ e: "a", x: 0, y: 0, r: 0, z: 0.6 }, { dz: -0.2 }).z, 0.5);
  const turned = M.nudge(s, { dr: 0.25 }).r; assert.ok(turned >= -3.14 && turned <= 3.14 && turned < 0, "Drehung laeuft rum: " + turned);
  assert.deepEqual(M.keyStep("ArrowLeft", false), { dx: -0.02 }); assert.deepEqual(M.keyStep("ArrowDown", true), { dy: 0.1 });
  assert.deepEqual(M.keyStep("+"), { dz: 0.2 }); assert.deepEqual(M.keyStep("-"), { dz: -0.2 }); assert.deepEqual(M.keyStep("R", true), { dr: -0.25 });
  assert.equal(M.keyStep("a"), null);
  assert.equal(M.where(0.1, 0.1), "00"); assert.equal(M.where(0.5, 0.5), "11"); assert.equal(M.where(0.9, 0.95), "22"); assert.equal(M.where(0.9, 0.2), "02");
});
test("Farbnamen: jedes Farbpaar der App hat zwei Namen, nie einen Hexcode; Browser-Schreibweise rgb() geht auch", () => {
  const want = { "#ffd400": "gelb", "#ff3b1d": "rot", "#2b4bff": "blau", "#ffe600": "gelb", "#ff4fa3": "pink", "#0a7f55": "gruen", "#14c872": "gruen", "#ff3da5": "pink",
    "#ff6a1f": "orange", "#1b2bd8": "blau", "#c8ff00": "limette", "#7a1fff": "lila", "#ffffff": "weiss", "#ff2d2d": "rot", "#7ee0ff": "hellblau", "#ff5a1f": "orange" };
  for (const pair of JSON.parse(PAIRS)) for (const c of pair) assert.equal(M.colorName(c), want[c], c);
  assert.equal(M.colorName("#000000"), "schwarz"); assert.equal(M.colorName("#808080"), "grau"); assert.equal(M.colorName("#5a3210"), "braun");
  assert.equal(M.hexOf("rgb(255, 212, 0)"), "#ffd400"); assert.equal(M.hexOf("#FFD400"), "#ffd400"); assert.equal(M.hexOf("nix"), null);
  for (const l of ["de", "en"]) for (const n of new Set(Object.values(want).concat(["schwarz", "grau", "braun", "tuerkis"]))) assert.ok(DIREKT.texts[l]["dk_c_" + n], l + " " + n);
});
test("Beschreibung der Vorschau: jede Kartenart in de und en, mit Text, Stickern und Farbnamen, ohne Hexcode", () => {
  const kinds = {};
  for (const i of D.IDEAS) if (D.KINDS.indexOf(i.kind) >= 0 && i.kind !== "table" && !kinds[i.kind]) kinds[i.kind] = i;
  for (const l of ["de", "en"]) {
    const t = tr(l);
    for (const [k, idea] of Object.entries(kinds)) {
      const d = D.docFromIdea(idea, me, l), s = M.describe(d, t);
      assert.ok(s.length > 10, k + " " + l + ": " + s); assert.doesNotMatch(s, /#[0-9a-f]{6}|undefined|\{/i, k + " " + l + ": " + s);
    }
    const card = D.sanitizeDoc({ k: "card", col: ["#ffd400", "#ff3b1d"], by: [], x: "Heimliche Chefin", st: "druck", sk: [{ e: "🐸", x: 0.1, y: 0.1, r: 0, z: 1 }, { e: "🦆", x: 0.8, y: 0.9, r: 0, z: 1 }] });
    const s = M.describe(card, t);
    assert.match(s, /Heimliche Chefin/); assert.match(s, /🐸/); assert.match(s, /🦆/);
    assert.match(s, l === "de" ? /Gelb und Rot/ : /yellow and red/); assert.match(s, l === "de" ? /oben links/ : /top left/); assert.match(s, l === "de" ? /2 Sticker/ : /2 stickers/);
    const L = M.layers(card, t);
    assert.deepEqual(L.map((x) => x.k), ["text", "sk", "sk", "bg"]); assert.equal(L[1].i, 0);
  }
  assert.equal(M.describe(null, tr("de")), "");
  // quest: only what the sheet shows, never the hidden end
  const q = D.IDEAS.find((i) => i.kind === "quest");
  if (q) { const d = D.docFromIdea(q, me, "de"), s = M.describe(d, tr("de")); for (const v of Object.values(d)) if (typeof v === "string" && v.length > 3 && v !== d.t && v !== d.k && v !== d.i) assert.ok(!s.includes(v), "Quest verraet " + v); }
});
test("Texte des Teils direkt: de und en vollstaendig, einfache Sprache ersetzt nur vorhandene Texte", () => {
  assert.deepEqual(Object.keys(DIREKT.texts.de).sort(), Object.keys(DIREKT.texts.en).sort());
  assert.deepEqual(Object.keys(DIREKT.einfach.de).sort(), Object.keys(DIREKT.einfach.en).sort());
  for (const l of ["de", "en"]) for (const k of Object.keys(DIREKT.einfach[l])) assert.ok(TEXTS[l][k] != null || DUEL[l][k] != null || DIREKT.texts[l][k] != null, l + " " + k);
  const src = fs.readFileSync(path.join(__dirname, "../src/direkt-ui.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../src/editmodel.js"), "utf8");
  for (const m of src.matchAll(/t\("(dk_[a-zA-Z0-9]+)"\s*[,)]/g)) assert.ok(DIREKT.texts.de[m[1]], "Text fehlt: " + m[1]);
});
