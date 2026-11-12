// Karte als Bild teilen (Entscheidung Integrator "Foto mitschicken"): kein Upload, nur das System-Teilen bzw. Download,
// zusaetzlich zum fotofreien Link. Die Karte bietet es ueber ihre Anzeigeliste an; gezeichnet wird ueber env.cardImage (P).
import test from "node:test";
import assert from "node:assert/strict";
import { shareImageOffer, shareImageBox } from "../src/ui/home/views.js";
import { home } from "../src/ui/home/feature.js";

const canvas = { t: "canvas", id: "poster", w: 960, h: 540, ops: [] };
const tree = { t: "frame", children: [canvas, { t: "action", act: "share-image", label: { de: "Mit Foto als Bild teilen", en: "Share as picture with photo" }, name: "adventstuerchen-5.png", of: "poster" }] };
function find(n, pred, out = []) { if (!n || typeof n !== "object") return out; if (pred(n)) out.push(n); for (const c of n.children || []) find(c, pred, out); return out; }

test("Angebot: nur mit action share-image und passendem canvas-Knoten; Dateiname geprueft", () => {
  assert.deepEqual(shareImageOffer(tree), { label: tree.children[1].label, name: "adventstuerchen-5.png", node: canvas });
  assert.equal(shareImageOffer({ t: "frame", children: [canvas] }), null, "ohne Angebot kein Knopf");
  assert.equal(shareImageOffer({ t: "frame", children: [tree.children[1]] }), null, "ohne Bild kein Knopf");
  assert.equal(shareImageOffer({ t: "frame", children: [canvas, { ...tree.children[1], name: "../x.exe" }] }).name, "my-daily-idea.png");
});

test("Knopf im Teilen-Blatt sendet SHARE_IMAGE mit Knoten; busy und Fehler ehrlich", () => {
  const sent = [], ctx = { lang: "de", home: {} };
  const box = shareImageBox(tree, ctx, (e) => sent.push(e));
  const btn = find(box, (n) => n.props && n.props["data-act"] === "share-image")[0];
  assert.equal(btn.children[0], "Mit Foto als Bild teilen");
  btn.props.on.click(); assert.deepEqual(sent, [{ type: "SHARE_IMAGE", name: "adventstuerchen-5.png", node: canvas }]);
  const busy = shareImageBox(tree, { lang: "de", home: { img: "busy" } }, () => {});
  assert.ok(JSON.stringify(busy).includes("gezeichnet"));
  assert.ok(JSON.stringify(shareImageBox(tree, { lang: "de", home: { img: "foto-fehlt" } }, () => {})).includes("nicht mehr da"));
  assert.equal(shareImageBox({ t: "frame", children: [] }, ctx, () => {}), null);
});

test("SHARE_IMAGE haengt am Teilen-Zustand; Aktion setzt busy und loest home.image aus", () => {
  assert.ok(home.on["inhalt.card.share"].SHARE_IMAGE);
  const out = [], c = home.actions.shareImage(home.context(), { name: "a.png", node: canvas }, (fx) => out.push(fx));
  assert.equal(c.home.img, "busy"); assert.deepEqual(out, [{ type: "home.image", name: "a.png", node: canvas }]);
  assert.equal(home.actions.shareImage(home.context(), { node: { t: "text" } }, () => assert.fail()).home.img, "fehler");
  assert.equal(home.actions.imageDone(c, { st: "ok" }).home.img, "ok");
});

async function run(env) {
  const got = [];
  home.effects["home.image"]({ name: "a.png", node: canvas }, { dispatch: (e) => got.push(e), deps: { home: env } });
  for (let i = 0; i < 100 && !got.length; i++) await new Promise((r) => setTimeout(r, 2));
  return got;
}
const fakeCanvas = (blob) => ({ toBlob: (cb) => cb(blob) });

test("home.image: System-Teilen mit Datei, sonst Download; ohne Dienst nicht-verfuegbar; fehlendes Foto ehrlich", async () => {
  const blob = new Blob([new Uint8Array([1])], { type: "image/png" }), shared = [], drawn = [];
  const doc = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
  const base = { document: doc, File, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} }, images: { tag: "img" }, setTimeout: () => {} };
  const cardImage = { draw: async (node, o) => { drawn.push([node, o.images]); return fakeCanvas(blob); } };
  let got = await run({ ...base, cardImage, navigator: { canShare: () => true, share: async (d) => { shared.push(d.files[0].name); } } });
  assert.deepEqual(got, [{ type: "IMAGE_DONE", st: "ok" }]); assert.deepEqual(shared, ["a.png"]); assert.equal(drawn[0][0], canvas); assert.deepEqual(drawn[0][1], { tag: "img" });
  let clicked = 0;
  got = await run({ ...base, cardImage, document: { ...doc, createElement: () => ({ click() { clicked++; }, remove() {} }) }, navigator: {} });
  assert.deepEqual(got, [{ type: "IMAGE_DONE", st: "ok" }]); assert.equal(clicked, 1, "Download");
  assert.deepEqual(await run({ ...base, navigator: {} }), [{ type: "IMAGE_DONE", st: "nicht-verfuegbar" }]);
  const missing = { draw: async () => { const e = new Error("foto"); e.code = "foto-fehlt"; throw e; } };
  assert.deepEqual(await run({ ...base, cardImage: missing, navigator: {} }), [{ type: "IMAGE_DONE", st: "foto-fehlt" }]);
});
