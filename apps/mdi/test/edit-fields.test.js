// Editor-Felder fuer P und L (Folge-PR 2): jedes Feld aendert seinen Wert nur so, dass das Schema der Karte gilt
// (validParams). Getestet an den echten Manifesten: advent-tuer (pair, stickers, weather, text mit x-suggest),
// beat-pausenhof (steps, slide), flug (Listen/Objekte aus dem Schema).
import test from "node:test";
import assert from "node:assert/strict";
import { extraField, schemaEditor, suggestButton, blank } from "../src/ui/edit-fields.js";
import { manifestOf, validParams } from "../src/cards/index.js";
import { defaults } from "../src/contract/fields.js";

function find(n, pred, out = []) { if (!n || typeof n !== "object") return out; if (pred(n)) out.push(n); for (const c of n.children || []) find(c, pred, out); return out; }
const byAct = (n, a) => find(n, (x) => x.props && x.props["data-act"] === a)[0];
const click = (n) => n.props.on.click();
const ctx = { lang: "de", me: { emoji: "🐸" }, wx: null, slots: {} };
function field(id, key) {
  const m = manifestOf(id), p = m.params.properties[key], params = defaults(m.params);
  let v = params[key];
  const set = (nv) => { v = nv; };
  const render = () => extraField(p, key, v, set, p["x-label"].de, ctx, () => {});
  return { m, p, params, get v() { return v; }, render, ok: () => validParams(id, { ...params, [key]: v }) };
}

test("pair: jede Farbe aus x-pairs waehlbar, Wert bleibt gueltig", () => {
  const f = field("advent-tuer", "pair");
  const radios = find(f.render(), (n) => n.props && n.props.role === "radio");
  assert.equal(radios.length, f.p.enum.length);
  click(radios[3]); assert.equal(f.v, f.p.enum[3]); assert.ok(f.ok());
});

test("stickers: dazulegen bis zur Grenze, schieben, drehen, groesser, loeschen – immer im Schema", () => {
  const f = field("advent-tuer", "sk");
  const pal = find(f.render(), (n) => n.props && n.props.class === "seg-opt emo");
  assert.ok(pal.length >= 6);
  click(pal[0]); assert.equal(f.v.length, 1); assert.ok(f.ok());
  for (const a of ["sk-right", "sk-down", "sk-bigger", "sk-turnR", "sk-turnR"]) click(byAct(f.render(), a));
  assert.ok(f.v[0].x > 0.5 && f.v[0].y > 0.5 && f.v[0].z > 1 && f.v[0].r > 0); assert.ok(f.ok());
  for (let i = 0; i < 12; i++) { const b = find(f.render(), (n) => n.props && n.props.class === "seg-opt emo")[0]; if (!b.props.disabled) click(b); }
  assert.equal(f.v.length, f.p.maxItems, "nicht mehr als maxItems"); assert.ok(f.ok());
  click(byAct(f.render(), "sk-del")); assert.equal(f.v.length, f.p.maxItems - 1);
  for (let i = 0; i < 40; i++) click(byAct(f.render(), "sk-left"));
  assert.equal(f.v.at(-1).x, 0, "am Rand begrenzt"); assert.ok(f.ok());
});

test("steps: jeder Schritt schaltet x/-, 16 je Reihe; slide mit Einheit", () => {
  const f = field("beat-pausenhof", "p"), cells = find(f.render(), (n) => n.props && n.props.class && String(n.props.class).startsWith("ef-step") && n.tag === "button");
  assert.equal(cells.length, 16 * Object.keys(f.p.properties).length);
  const before = f.v.k; click(cells[1]); assert.notEqual(f.v.k, before); assert.ok(f.ok());
  const s = field("beat-pausenhof", "bpm"), inp = find(s.render(), (n) => n.tag === "input")[0];
  inp.props.on.input({ target: { value: "123" } }); assert.equal(s.v, 123); assert.ok(s.ok());
  assert.ok(JSON.stringify(s.render()).includes("BPM"));
});

test("weather: Formular sendet WX_GET mit Ort und Tag; Wetter weg setzt null", () => {
  const m = manifestOf("advent-tuer"), p = m.params.properties.w, sent = [];
  let v = { p: "Hamburg", d: "2026-11-12", hi: 9, lo: 4, rn: 60, c: 61 };
  const n = extraField(p, "w", v, (nv) => { v = nv; }, "Wetter", ctx, (ev) => sent.push(ev));
  const form = find(n, (x) => x.tag === "form")[0];
  form.props.on.submit({ preventDefault() {}, target: { elements: { namedItem: (k) => ({ value: k === "wx-place" ? " Kiel " : "1" }) } } });
  assert.deepEqual(sent, [{ type: "WX_GET", key: "w", place: "Kiel", day: 1 }]);
  assert.ok(JSON.stringify(n).includes("Hamburg: 4 bis 9"));
  click(byAct(n, "wx-off")); assert.equal(v, null);
});

test("Wuerfeln: naechster Vorschlag aus x-suggest, reihum, ohne Zufall", () => {
  const p = manifestOf("advent-tuer").params.properties.x, list = p["x-suggest"].de;
  let v = list[0];
  click(suggestButton(p, v, (nv) => { v = nv; }, "de")); assert.equal(v, list[1]);
  v = list.at(-1); click(suggestButton(p, v, (nv) => { v = nv; }, "de")); assert.equal(v, list[0]);
});

test("Listen und Objekte aus dem Schema (flug route/look): anschalten, Eintraege bearbeiten, Grenzen halten", () => {
  const m = manifestOf("flug"), params = defaults(m.params);
  for (const key of ["route", "look"]) {
    const p = m.params.properties[key];
    let v = params[key];
    const set = (nv) => { v = nv; };
    click(byAct(schemaEditor(p, v, set, "f-" + key, key, "de"), "f-" + key + "-an"));
    assert.ok(v !== null, key + " angeschaltet");
    assert.ok(validParams("flug", { ...params, [key]: v }), key + " gueltig: " + JSON.stringify(v).slice(0, 200));
  }
  assert.equal(blank({ type: "array", minItems: 3, items: { type: "string", enum: ["a", "b"] } }).length, 3);
});

test("media.local: Foto waehlen sendet PHOTO_PUT mit der Datei; gewaehltes Foto ist schemagueltig; Foto weg setzt null; Fehler ehrlich", () => {
  const m = manifestOf("arcade-panzer"), p = m.params.properties.photo, params = defaults(m.params), sent = [];
  let v = params.photo;
  const set = (nv) => { v = nv; };
  let n = extraField(p, "photo", v, set, "Foto", ctx, (ev) => sent.push(ev));
  const input = find(n, (x) => x.tag === "input" && x.props.type === "file")[0], file = { type: "image/png" }, target = { files: [file], value: "C:\\x.png" };
  assert.equal(input.props.accept, "image/*");
  input.props.on.change({ target }); assert.deepEqual(sent, [{ type: "PHOTO_PUT", key: "photo", file }]); assert.equal(target.value, "", "dieselbe Datei erneut waehlbar");
  v = "local:" + "ab".repeat(16); assert.ok(validParams("arcade-panzer", { ...params, photo: v, photoUse: "figure" }));
  n = extraField(p, "photo", v, set, "Foto", ctx, () => {});
  assert.ok(JSON.stringify(n).includes("Foto gewählt")); click(byAct(n, "photo-off")); assert.equal(v, null);
  n = extraField(p, "photo", null, set, "Foto", { ...ctx, photo: { key: "photo", st: "nicht-verfuegbar" } }, () => {});
  assert.ok(JSON.stringify(n).includes("privaten Fenster"));
});
