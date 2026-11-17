// Statische Leinwand mit Bild (Foto, KI-Bild): kommt das Bild nach dem ersten Zeichnen, wird neu gezeichnet (Befund P).
import test from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render/render.js";

function all(v, out = []) { if (v && typeof v === "object") { out.push(v); for (const c of v.children || []) all(c, out); } return out; }
function fakeCanvas() {
  let paints = 0;
  const ctx = new Proxy({ measureText: () => ({ width: 10 }), getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true });
  const win = { devicePixelRatio: 1, getComputedStyle: () => ({ getPropertyValue: () => "#000000" }), matchMedia: () => ({ matches: false }), Path2D: class {}, requestAnimationFrame: (f) => f() };
  const doc = { defaultView: win, documentElement: {}, createElement: () => ({ getContext: () => ctx }) };
  return { el: { isConnected: true, ownerDocument: doc, getBoundingClientRect: () => ({ width: 100, height: 100 }), getContext: () => { paints++; return ctx; }, width: 0, height: 0 }, get paints() { return paints; } };
}

test("Leinwand zeichnet neu, wenn ein Bild fertig wird (images.version), sonst nicht", () => {
  const images = { version: 0, get: () => null, url: () => "", state: () => "busy" };
  const node = { t: "canvas", w: 10, h: 10, ops: [{ o: "rect", x: 0, y: 0, w: 1, h: 1 }] };
  const host = { onInput: () => {}, images, lang: "de" };
  const cv = () => all(render(node, host)).find((x) => x.tag === "canvas");
  const f = fakeCanvas();
  cv().props.ref(f.el); assert.equal(f.paints, 1);
  cv().props.ref(f.el); assert.equal(f.paints, 1, "gleicher Stand: nicht neu");
  images.version = 1;
  cv().props.ref(f.el); assert.equal(f.paints, 2, "Bild fertig: neu gezeichnet");
});
