// Blasen-Muster und Farbfelder (Fix 17.11.): jede Karte meldet ihre Teile mit Ort (Knoten der Anzeigeliste mit part oder
// parts[].at im Manifest), Host-Teile heissen nicht wie Kartenteile, jede Farbe eines Editor-Felds ist darstellbar und hat
// einen Namen, keine Wahl zeigt eine rohe ID, die Gegnerfarbe ist nie die Spielerfarbe.
import test from "node:test";
import assert from "node:assert/strict";
import { ORDER, cardOf } from "../src/cards/index.js";
import * as G from "../src/app/game.js";
import { partsInTree, bubblePartsOf, iconOf } from "../src/ui/bubbles.js";
import { HOST_PART_IDS } from "../src/app/host-parts.js";
import { colorsOf, colorName } from "../src/ui/swatch.js";
import { machine, initialContext } from "../src/app/machine.js";
import { cleanPref } from "../src/app/konto.js";

const defaultsOf = (m) => Object.fromEntries(Object.entries(m.params.properties).map(([k, v]) => [k, structuredClone(v.default)]));
const shownFields = (m) => { const on = new Set(m.parts.flatMap((p) => p.params)); return Object.entries(m.params.properties).filter(([k, v]) => on.has(k) && v["x-hidden"] !== true); };

test("jede Karte meldet jeden Teil mit Ort: Knoten mit part in der Vorschau oder parts[].at", () => {
  const bad = [];
  for (const id of ORDER) {
    const c = cardOf(id), m = c.manifest, inTree = partsInTree(G.previewNode(c, defaultsOf(m), "de", {}));
    for (const p of m.parts) if (!inTree.has(p.id) && !(Array.isArray(p.at) && p.at.length === 2)) bad.push(id + "/" + p.id);
  }
  assert.deepEqual(bad, []);
});

test("Host-Teile (Magie, Signatur) an jeder Karte, ohne Namensgleichheit mit Kartenteilen; jede Blase hat ein Symbol", () => {
  for (const id of ORDER) {
    const m = cardOf(id).manifest, ids = bubblePartsOf(m).map((p) => p.id);
    for (const h of HOST_PART_IDS) assert.ok(ids.includes(h), id + " ohne " + h);
    assert.equal(new Set(ids).size, ids.length, id + ": doppelte Teil-IDs " + ids);
    for (const p of bubblePartsOf(m)) assert.ok(iconOf(m, p), id + "/" + p.id + " ohne Symbol");
  }
});

test("jede Farbe eines Editor-Felds ist eine echte Farbe mit Namen (kein Hex-Text, WCAG 1.4.1)", () => {
  const bad = [];
  for (const id of ORDER) for (const [k, p] of shownFields(cardOf(id).manifest)) {
    if (p["x-field"] === "color" && Array.isArray(p.enum)) for (const v of p.enum) { if (!colorsOf(v) || !colorName(v, "de") || !colorName(v, "en")) bad.push(id + "/" + k + "=" + v); }
    if (p["x-field"] === "pair") for (const v of p.enum) { if (!colorsOf(v, p["x-pairs"]) || !colorName(v, "de", p["x-pairs"])) bad.push(id + "/" + k + "=" + v); }
  }
  assert.deepEqual(bad, []);
});

test("kuratierte Paletten: hoechstens 12 Farben, Teilmenge der erlaubten Werte, Standard enthalten", () => {
  for (const id of ORDER) for (const [k, p] of shownFields(cardOf(id).manifest)) {
    if (p["x-field"] !== "color" || !Array.isArray(p.enum)) continue;
    const shown = p["x-palette"] || p.enum;
    assert.ok(shown.length <= 12, id + "/" + k + ": " + shown.length + " Farben");
    for (const v of shown) assert.ok(p.enum.includes(v), id + "/" + k + ": " + v + " nicht erlaubt");
    assert.ok(shown.includes(p.default), id + "/" + k + ": Standard " + p.default + " fehlt in der Palette");
  }
});

test("Gegnerfarbe ist belegt: x-differs gegenseitig, Standards verschieden", () => {
  let n = 0;
  for (const id of ORDER) { const props = cardOf(id).manifest.params.properties; for (const [k, p] of Object.entries(props)) if (p["x-differs"]) {
    n++; const o = props[p["x-differs"]];
    assert.ok(o && o["x-differs"] === k, id + "/" + k + ": x-differs nicht gegenseitig");
    assert.notEqual(p.default, o.default, id + "/" + k);
  } }
  assert.ok(n >= 20, "Arcade-Karten: colA/colB mit x-differs (" + n + ")");
});

test("keine Wahl zeigt eine rohe ID: jeder Wert einer Wahl hat einen Namen oder ist selbst ein Symbol", () => {
  const sym = (e) => typeof e === "string" && e !== "" && /\p{Extended_Pictographic}/u.test(e);
  const named = (p, e) => { const xn = p["x-names"] || {}; return (xn[e] && typeof xn[e] === "object") || (xn.de && typeof xn.de === "object" && e in xn.de) || ["yellow", "red", "ink", "paper", "star", "heart", "bolt", "drop", "coin", "ring", ""].includes(e); };
  const bad = [];
  for (const id of ORDER) for (const [k, p] of shownFields(cardOf(id).manifest)) {
    if (p["x-field"] === "choice") for (const e of p.enum) if (!named(p, e) && !sym(e)) bad.push(id + "/" + k + "=" + e);
    if (p["x-field"] === "number" && p.maximum - p.minimum <= 12 && !p["x-names"] && !p["x-unit"] && !p["x-steps"]) bad.push(id + "/" + k + " (Zahl ohne Einheit)");
  }
  assert.deepEqual(bad, []);
});

test("Statechart: Magie und Signatur oeffnen als Teil; Pinsel und gezogene Lage landen in pref.blasen", () => {
  let s = machine.initial(initialContext("de"));
  const send = (ev) => { const r = machine.send(s, ev); if (r.consumed) s = r; return r; };
  send({ type: "OPEN", id: "arcade-volley" }); send({ type: "CUSTOMIZE" });
  assert.ok(machine.matches(s, "inhalt.card.customize.bubbles"));
  send({ type: "BUBBLE", part: "magie" }); assert.ok(machine.matches(s, "inhalt.card.customize.dialog")); assert.equal(s.ctx.part, "magie");
  send({ type: "CLOSE" }); send({ type: "BUBBLE", part: "signatur" }); assert.equal(s.ctx.part, "signatur"); send({ type: "CLOSE" });
  assert.equal(send({ type: "BUBBLE", part: "gibtsnicht" }).consumed, false);
  send({ type: "BLASEN" }); assert.equal(s.ctx.pref.blasen.aus, true); send({ type: "BLASEN" }); assert.equal(s.ctx.pref.blasen.aus, false);
  send({ type: "BLASE_LAGE", part: "farben", at: [0.2, 0.7] });
  assert.deepEqual(s.ctx.pref.blasen.lage["arcade-volley"], { farben: [0.2, 0.7] });
  assert.equal(send({ type: "BLASE_LAGE", part: "farben", at: [2, 0.7] }).consumed, false, "Lage ausserhalb wird nicht verbraucht");
  assert.equal(send({ type: "BLASE_LAGE", part: "gibtsnicht", at: [0.1, 0.1] }).consumed, false);
});

test("pref.blasen vom Geraet wird geprueft", () => {
  assert.deepEqual(cleanPref({}).blasen, { aus: false, lage: {} });
  assert.deepEqual(cleanPref({ blasen: { aus: true, lage: { "arcade-volley": { farben: [0.5, 0.5], x1: [1, 1], figur: [3, 0] }, "BAD!": { a: [0, 0] } } } }).blasen,
    { aus: true, lage: { "arcade-volley": { farben: [0.5, 0.5] } } });
});

test("Farbwerte: nur eigene Schluessel, kein Prototyp (constructor, toString, __proto__)", () => {
  for (const v of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(colorsOf(v), null, v); assert.equal(colorName(v, "de"), null, v);
    assert.equal(colorsOf(v, { a: ["#ffffff", "#000000"] }), null, v + " mit Paaren");
  }
  assert.deepEqual(colorsOf("a", { a: ["#FFFFFF", "#000000"] }), ["#ffffff", "#000000"]);
});
