// Gate C Host (Strang L): grosse Tipp-Taste wie Tippen auf die Buehne, "Gemuetlich spielen" ueber rt.slow + tempo,
// Geist heisst in der Oberflaeche "Aufnahme".
import test from "node:test";
import assert from "node:assert/strict";
import { createSampler } from "../src/app/rt/input.js";
import { createStage } from "../src/render/rt-stage.js";
import { actions } from "../src/app/machine.js";
import { manifest as manifestValidator } from "../src/gen/manifest.js";
import { cardOf } from "../src/cards/index.js";
import { texts } from "../src/app/texts.js";

function all(v, out = []) { if (v && typeof v === "object") { out.push(v); for (const c of v.children || []) all(c, out); } return out; }

test("screenKey: tap druckt alle zone-any-Knoepfe (wie Tippen auf die Buehne), halten bleibt gedrueckt, loslassen loest", () => {
  const s = createSampler({ buttons: [{ id: "tap", kind: "pulse", keys: ["Space"], zone: "any" }, { id: "hold", kind: "hold", keys: ["KeyH"], zone: "any" }, { id: "x", kind: "hold", keys: ["KeyX"], zone: "button" }], pointer: { max: 1 }, screenKey: { label: { de: "TIPPEN", en: "TAP" } } }, { w: 100, h: 100 });
  s.tap(true);
  const a = s.sample(); assert.equal(a.b & 1, 1); assert.equal(a.b & 2, 2); assert.equal(a.b & 4, 0, "zone button bleibt unberuehrt");
  assert.equal(s.sample().b & 2, 2, "halten");
  s.tap(false); assert.equal(s.sample().b & 3, 0);
});

test("screenKey: Buehne zeigt die grosse Taste (>= 84 px), Zeiger und Leertaste wirken ueber rt.tap", () => {
  const taps = [];
  const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => null, getComputedStyle: () => ({ getPropertyValue: () => "" }), devicePixelRatio: 1 };
  const doc = { documentElement: {}, addEventListener() {}, removeEventListener() {}, createElement: () => ({}) };
  const rt = { active: true, view: { w: 10, h: 10 }, controls: { buttons: [], screenKey: { label: { de: "TIPPEN = FLATTERN", en: "TAP = FLAP" }, size: 96 } }, screenButtons: () => [], key: () => false, pointer() {}, button() {}, tap: (d) => taps.push(d), blur() {}, hidden() {} };
  const node = createStage({ win, doc, rt }).stageNode("card.rt.run", () => {}, "de");
  const k = all(node).find((x) => x.props && /rt-key/.test(String(x.props.class)));
  assert.ok(k, "Taste da"); assert.equal(k.props.style["min-height"], "96px");
  const el = { setAttribute() {} };
  k.props.on.pointerdown({ preventDefault() {}, currentTarget: el }); k.props.on.pointerup({ currentTarget: el });
  k.props.on.keydown({ key: " ", repeat: false, preventDefault() {}, currentTarget: el }); k.props.on.keyup({ key: " ", currentTarget: el });
  assert.deepEqual(taps, [true, false, true, false]);
  const none = createStage({ win, doc, rt: { ...rt, controls: { buttons: [] } } }).stageNode("card.rt.run", () => {}, "de");
  assert.ok(!all(none).some((x) => x.props && /rt-key/.test(String(x.props.class))), "ohne screenKey keine Taste");
});

test("Manifest: rt.slow und controls.screenKey sind im Schema erlaubt, Unsinn nicht", () => {
  const m = JSON.parse(JSON.stringify(cardOf("flug").manifest));
  m.rt.slow = [1, 0.75, 0.5]; m.rt.controls.screenKey = { label: { de: "TIPPEN = FLATTERN", en: "TAP = FLAP" }, size: 96 };
  assert.equal(manifestValidator(m), true, JSON.stringify(manifestValidator.errors));
  m.rt.slow = [1, 3]; assert.equal(manifestValidator(m), false);
  m.rt.slow = [1, 0.5]; m.rt.controls.screenKey.size = 40; assert.equal(manifestValidator(m), false, "Taste < 84 px");
});

test("Gemuetlich spielen: SLOW setzt tempo auf die langsamste Stufe aus rt.slow, aus = 1; ohne rt.slow keine Wirkung", () => {
  const flug = cardOf("flug");
  assert.ok(flug.manifest.params.properties.tempo, "flug hat tempo");
  const ctx = { cardId: "flug", params: {}, lang: "de" };
  // ohne rt.slow im Manifest (L traegt es nach dem Merge ein): keine Wirkung
  if (!flug.manifest.rt.slow) assert.equal(actions.setSlow(ctx, { on: true }), ctx);
  else {
    const on = actions.setSlow(ctx, { on: true }); assert.equal(on.params.flug.tempo, Math.min(...flug.manifest.rt.slow));
    assert.equal(actions.setSlow(on, { on: false }).params.flug.tempo, 1);
  }
});

test("Woerter: Geist heisst in der Oberflaeche Aufnahme (de/en)", () => {
  const de = texts("de"), en = texts("en");
  for (const k of ["ghostSend", "ghostFor", "ghostText", "ghostScore"]) { assert.doesNotMatch(de[k], /Geist/); assert.doesNotMatch(en[k], /ghost/i); }
  assert.match(de.ghostSend, /Aufnahme/); assert.equal(de.slowPlay, "Gemütlich spielen");
});
