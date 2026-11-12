// Buehne fuer Echtzeitkarten (ADR 0001 b): Canvas mit Letterbox, Zeiger (mehrere, Pointer Capture), Tasten nur solange
// die Buehne steht, echte Bildschirmknoepfe (>= 60 px, aria-pressed bei "hold"), Pause/Weiter, Ansage per aria-live,
// Pause beim Verstecken der Seite. Zeichnet die Anzeigeliste mit src/render/canvas.js. view.js (Strang H) haengt den
// Knoten aus stageNode() im Zustand inhalt.card.rt.* ein; main.js gibt draw() als deps.rt.draw an die Laufzeit.
import { h } from "../ui/dom.js";
import { paint, tokenColors } from "./canvas.js";
import { fitView, toWorld } from "../app/rt/input.js";

const TX = {
  de: { pause: "Pause", resume: "Weiter", ready: "Gleich geht's los: {n}", wait: "Wartet auf den Partner …", paused: "Pausiert", over: "Ende", stage: "Spielfläche" },
  en: { pause: "Pause", resume: "Resume", ready: "Starting in {n}", wait: "Waiting for your partner …", paused: "Paused", over: "Game over", stage: "Play area" }
};
const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => String(o[k]));

/**
 * @param {object} env { win: Window, doc: Document, rt: runtime.rt, images?, reduced?: () => boolean }
 */
export function createStage(env) {
  const { win, doc } = env;
  let canvas = null, ctx2d = null, cache = new Map(), colors = null, colorsKey = "", lastNode = null, lastInfo = null, fit = null, live = null;
  const ptrIds = new Map(); let nextPtr = 0;
  function readColors() {
    const cs = win.getComputedStyle(doc.documentElement);
    colors = tokenColors((n) => cs.getPropertyValue(n));
    colorsKey = Object.values(colors).join(",");
  }
  function size() {
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect(), dpr = Math.min(win.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), hgt = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; cache = new Map(); }
    return { cw: r.width, ch: r.height, dpr, left: r.left, top: r.top };
  }
  function world(e) {
    const s = size(), v = env.rt.view; if (!s || !v) return null;
    fit = fitView(v, s.cw, s.ch);
    return toWorld(fit, e.clientX - s.left, e.clientY - s.top);
  }
  function pid(e, up) {
    if (!ptrIds.has(e.pointerId)) ptrIds.set(e.pointerId, nextPtr++ % 5);
    const id = ptrIds.get(e.pointerId);
    if (up) ptrIds.delete(e.pointerId);
    return id;
  }
  const onKey = (down) => (e) => {
    if (!env.rt.active || e.repeat && !down) return;
    if (e.key === "Escape" || (down && e.code === "KeyP")) return; // Zurueck/Pause bleiben beim Host
    if (env.rt.key(e.code, down)) e.preventDefault();
  };
  const kd = onKey(true), ku = onKey(false);
  const onVis = () => { if (doc.hidden) env.rt.hidden(); };
  const onBlur = () => env.rt.blur();
  function mount(el) {
    if (el === canvas) return;
    unmount();
    canvas = el; ctx2d = el.getContext("2d"); cache = new Map(); readColors();
    el.addEventListener("pointerdown", (e) => { const p = world(e); if (!p) return; e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) { /* ohne Capture */ } env.rt.pointer("down", pid(e), p[0], p[1]); });
    el.addEventListener("pointermove", (e) => { if (!ptrIds.has(e.pointerId)) return; const p = world(e); if (p) env.rt.pointer("move", pid(e), p[0], p[1]); });
    for (const t of ["pointerup", "pointercancel"]) el.addEventListener(t, (e) => { if (!ptrIds.has(e.pointerId)) return; const p = world(e) || [0, 0]; env.rt.pointer(t === "pointerup" ? "up" : "cancel", pid(e, true), p[0], p[1]); });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    win.addEventListener("keydown", kd); win.addEventListener("keyup", ku);
    doc.addEventListener("visibilitychange", onVis); win.addEventListener("blur", onBlur);
    const mq = win.matchMedia ? win.matchMedia("(prefers-color-scheme: dark)") : null;
    if (mq && mq.addEventListener) mq.addEventListener("change", () => { readColors(); cache = new Map(); });
  }
  function unmount() {
    if (!canvas) return;
    win.removeEventListener("keydown", kd); win.removeEventListener("keyup", ku);
    doc.removeEventListener("visibilitychange", onVis); win.removeEventListener("blur", onBlur);
    canvas = null; ctx2d = null; ptrIds.clear();
  }
  /** deps.rt.draw fuer die Laufzeit */
  function draw(node, info) {
    lastNode = node; lastInfo = info;
    if (!canvas || !canvas.isConnected) { if (canvas && !canvas.isConnected) unmount(); return; }
    const s = size(); if (!s) return;
    const r = paint(ctx2d, node, { cw: s.cw, ch: s.ch, dpr: s.dpr, colors, colorsKey, reduced: env.reduced ? env.reduced() : false, t: Date.now() / 1000, cache, makeCanvas: (w, hh) => { const c = doc.createElement("canvas"); c.width = w; c.height = hh; return c; }, images: env.images || null, path2d: (d) => new win.Path2D(d) });
    if (r.unknown.length && env.onUnknown) env.onUnknown(r.unknown);
    canvas.setAttribute("aria-label", String(node.a11y || "").slice(0, 200));
    const say = info.countdown ? fmt((TX[env.lang] || TX.de).ready, { n: info.countdown }) : info.stalled ? (TX[env.lang] || TX.de).wait : info.paused ? (TX[env.lang] || TX.de).paused : (info.status && info.status.say) || "";
    if (live && live.textContent !== say) live.textContent = say;
  }
  /** Knoten fuer view.js im Zustand inhalt.card.rt.* (leaf = "card.rt.run" usw.) */
  function stageNode(leafName, dispatch, lang) {
    env.lang = lang;
    const X = TX[lang] || TX.de, phase = leafName.slice("card.rt.".length);
    const v = env.rt.view, ratio = v ? v.w + " / " + v.h : "3 / 4";
    const buttons = env.rt.screenButtons();
    return h("div", { class: "rt-stage", key: "rt" },
      h("canvas", { class: "rt-canvas", role: "img", "aria-label": X.stage, tabindex: "0", style: { "aspect-ratio": ratio }, ref: mount }),
      h("p", { class: "rt-say", "aria-live": "polite", ref: (el) => { live = el; } }, ""),
      h("div", { class: "rt-controls" },
        ...buttons.map((b) => h("button", {
          type: "button", class: "rt-btn", key: "b-" + b.id, "aria-pressed": b.kind === "hold" ? "false" : null,
          on: {
            pointerdown: (e) => { e.preventDefault(); env.rt.button(b.id, true); if (b.kind === "hold") e.currentTarget.setAttribute("aria-pressed", "true"); },
            pointerup: (e) => { env.rt.button(b.id, false); if (b.kind === "hold") e.currentTarget.setAttribute("aria-pressed", "false"); },
            pointercancel: () => env.rt.button(b.id, false),
            keydown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); env.rt.button(b.id, true); } },
            keyup: (e) => { if (e.key === " " || e.key === "Enter") env.rt.button(b.id, false); }
          }
        }, (b.label && (b.label[lang] || b.label.de)) || b.id)),
        phase === "run" || phase === "pause" ? h("button", { type: "button", class: "rt-btn rt-pause", key: "pause", "aria-pressed": phase === "pause" ? "true" : "false", on: { click: () => dispatch({ type: phase === "pause" ? "RESUME" : "PAUSE" }) } }, phase === "pause" ? X.resume : X.pause) : null));
  }
  return { draw, stageNode, get mounted() { return !!canvas; }, get last() { return { node: lastNode, info: lastInfo, fit }; } };
}
