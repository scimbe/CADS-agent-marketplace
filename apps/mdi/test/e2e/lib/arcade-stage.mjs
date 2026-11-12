// Pruefseite fuer die Arcade-Karten: der echte Echtzeit-Host von Strang F (src/app/rt/session.js), die echte Buehne
// (src/render/rt-stage.js) und der echte Canvas-Ausfuehrer, ohne die App-Statechart (die Einbindung in inhalt.card.rt
// liefert Strang H/F). Gebaut mit esbuild in eine Datei, geladen als file://.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as esbuild from "esbuild";
import { ROOT } from "./grund.mjs";

const ENTRY = `
import { cardOf } from "./src/cards/index.js";
import { defaults } from "./src/contract/fields.js";
import { createRtSession } from "./src/app/rt/session.js";
import { createStage } from "./src/render/rt-stage.js";
import { patch } from "./src/ui/dom.js";
import * as A from "./src/engines/arcade/index.js";
export function boot(o) {
  const card = cardOf(o.card), params = Object.assign(defaults(card.manifest.params), o.params || {});
  const root = document.getElementById("app"), unknown = [], events = [];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Fotoslot wie im Host: ein lokales Bild, das die Karte nur als Slot kennt (hier ein erzeugtes Testbild).
  const photo = document.createElement("canvas"); photo.width = photo.height = 64; const px = photo.getContext("2d");
  px.fillStyle = "#ff00aa"; px.fillRect(0, 0, 64, 64); px.fillStyle = "#00ffaa"; px.fillRect(16, 16, 32, 32);
  const images = { get: (src) => (src && src.kind === "local" && src.slot === "photo" ? photo : null) };
  let session = null;
  const env = { win: window, doc: document, images, reduced, onUnknown: (u) => unknown.push(...u),
    rt: { get view() { return card.manifest.rt.view; }, active: true, key: (c, d) => session.key(c, d), pointer: (t, i, x, y) => session.pointer(t, i, x, y), button: (i, d) => session.button(i, d), screenButtons: () => session.screenButtons(), hidden: () => session.pause(), blur: () => session.blur() } };
  const stage = createStage(env);
  session = createRtSession(card, { mode: o.mode || "bot", seat: o.seat || 0, params, seed: o.seed, serving: o.serving, lang: o.lang || "de", reduced: reduced() }, {
    now: () => performance.now(), frame: (f) => requestAnimationFrame(f), cancel: (h) => cancelAnimationFrame(h),
    send: (m) => { if (window.__arcOut) window.__arcOut(JSON.stringify(m)); },
    draw: (node, info) => stage.draw(o.blank ? { t: "canvas", w: node.w, h: node.h, layers: [] } : node, info),   // blank: Basislinie leere Buehne
    onEvents: (ev) => { for (const e of ev) events.push(e.k); },
    onChange: (info) => { window.__arcPhase = info.type; }
  });
  patch(root, [stage.stageNode("card.rt.run", () => {}, o.lang || "de")]);
  window.__arcIn = (s) => session.receive(JSON.parse(s));
  window.__arc = { session, stage, unknown, events, status: () => session.status(), hash: () => session.hash(), tick: () => session.tick };
  if (o.fast) {   // feste Schritte statt Uhr: n Ticks je Bild, gleiche Partie auf jeder Maschine
    session._go();
    (function f() { for (let i = 0; i < o.fast && !session.status().over; i++) session._tick(); session._frame(0); if (!session.status().over) requestAnimationFrame(f); else window.__arcDone = true; })();
  } else session.start();
}
/** Bot gegen Bot ohne Host: Hash nach n Ticks (Determinismus ueber Engines). */
export function botHash(id, seed, n) {
  const c = cardOf(id); let st = c.init({ params: defaults(c.manifest.params), seed, players: ["bot", "bot"] });
  for (let i = 0; i < n && !c.status(st).over; i++) st = c.step(st, [{ b: 0 }, { b: 0 }]).state;
  return c.hash(st);
}
/** Anteil der Karte je Bild ohne Zeichnen: je Bild zwei Ticks und die Anzeigeliste; Mittel und p95 in ms. */
export function cardCost(id, seed, frames) {
  const c = cardOf(id); let st = c.init({ params: defaults(c.manifest.params), seed, players: ["bot", "bot"] });
  const t = [];
  for (let f = 0; f < frames; f++) {
    const a = performance.now();
    for (let k = 0; k < 2; k++) { st = c.step(st, [{ b: 0 }, { b: 0 }]).state; if (c.status(st).over) st = c.init({ params: defaults(c.manifest.params), seed: seed + f, players: ["bot", "bot"] }); }
    c.view(st, { seat: 0, alpha: 0.5 });
    t.push(performance.now() - a);
  }
  t.sort((x, y) => x - y);
  return { mean: Math.round(t.reduce((x, y) => x + y, 0) / t.length * 100) / 100, p95: Math.round(t[Math.floor(t.length * 0.95)] * 100) / 100, max: Math.round(t[t.length - 1] * 100) / 100 };
}
export { A };
`;

let built = null;
/** Baut die Pruefseite einmal; liefert die file://-Adresse. */
export async function stagePage() {
  if (built) return built;
  const r = await esbuild.build({ stdin: { contents: ENTRY, resolveDir: ROOT, loader: "js" }, bundle: true, format: "iife", globalName: "ARC", write: false, logLevel: "error", target: ["es2022", "safari16"] });
  const css = fs.readFileSync(path.join(ROOT, "src/ui/tokens.css"), "utf8").replace("__ANTON__", "data:font/woff2;base64," + fs.readFileSync(path.join(ROOT, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2")).toString("base64"));
  // Nur Pruefseite, Nachbildung der Buehne von Strang F mit flexibler Hoehe (an F geschickter Patch fuer widgets.css):
  // die Leinwand nimmt die Resthoehe, egal wie viele Knopfreihen die Karte mitbringt; Knoepfe >= 60 px (ADR 0001 b).
  const stageCss = ".rt-stage{display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px;box-sizing:border-box;height:100dvh;min-height:22rem}.rt-canvas{display:block;flex:1 1 0;min-height:0;width:auto;max-width:100%;height:auto;touch-action:none;background:#000}.rt-controls{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.rt-btn{min-height:60px;min-width:60px;padding:0 18px;font-size:18px}.rt-say{min-height:1.4em;margin:0}";
  const html = "<!doctype html><html lang='de'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Arcade-Pruefseite</title><style>" + css + stageCss + "</style></head><body><main id='app'></main><script>" + r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script") + "</script></body></html>";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arc-stage-")), file = path.join(dir, "stage.html");
  fs.writeFileSync(file, html);
  built = "file://" + file;
  return built;
}
