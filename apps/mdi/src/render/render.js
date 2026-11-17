// Ein Renderer fuer alle Karten: Anzeigeliste (Primitive + Token-Namen) -> DOM. Karten liefern nie HTML, nie Farben
// als Werte, nie Ereignis-Handler; Eingaben sind Daten (option.input), die der Host gegen moves() prueft.
// Unbekannte Primitive und Token fallen weg (gesaeubert), damit erzeugte Karten wie handgebaute aussehen.
import { h } from "../ui/dom.js";
import { FILLS, SHAPES } from "../contract/tokens.js";
import { renderWidget, TX as WTX } from "./widgets.js";
import "./widgets-more.js";
import { paint, tokenColors } from "./canvas.js";

const ROLES = ["title", "body", "label", "big", "small"];
const MAX_TEXT = 300, MAX_NODES = 400;

function fill(f, fallback = "text") { return FILLS.includes(f) ? f : fallback; }
function txt(s) { return String(s === undefined || s === null ? "" : s).slice(0, MAX_TEXT); }
function pct(n, lo = 0, hi = 100) { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; }

const SHAPE = {
  star: () => h("polygon", { points: "50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38" }),
  heart: () => h("path", { d: "M50 88C22 66 6 50 6 31 6 16 18 6 31 6c9 0 15 5 19 12 4-7 10-12 19-12 13 0 25 10 25 25 0 19-16 35-44 57z" }),
  bolt: () => h("polygon", { points: "58,4 18,56 45,56 37,96 82,40 55,40 64,4" }),
  drop: () => h("path", { d: "M50 6S16 47 16 65c0 19 15 30 34 30s34-11 34-30C84 47 50 6 50 6z" }),
  coin: () => h("circle", { cx: "50", cy: "50", r: "42" }),
  ring: () => h("circle", { cx: "50", cy: "50", r: "36", class: "ring" })
};

/**
 * @param {object} node Anzeigeliste der Karte
 * @param {{onInput:(input:object)=>void, onDraft?:(d:object)=>void, onAction?:(a:object)=>void, onPrepare?:(n:object)=>void,
 *          draft?:object, lang?:string, age18?:boolean, minor?:boolean, disabled?:boolean, idp?:string, onUnknown?:(t:string)=>void}} host
 */
export function render(node, host) {
  let count = 0, ids = 0;
  const idp = host.idp || "c";
  function el(n, abs) {
    if (!n || typeof n !== "object" || ++count > MAX_NODES) return null;
    const part = typeof n.part === "string" && /^[a-z]{1,16}$/.test(n.part) ? n.part : null;
    const style = abs && ("x" in n || "y" in n) ? { left: pct(n.x) + "%", top: pct(n.y) + "%", ...(n.w ? { width: pct(n.w, 1) + "%" } : {}) } : null;
    switch (n.t) {
      case "frame": {
        // ratio "16:9" | "4:5" | "3:4" | "9:16" | "1:1" wird ausgewertet (Anfrage P)
        const r = typeof n.ratio === "string" && /^(16:9|4:5|3:4|9:16|1:1|4:3)$/.test(n.ratio) ? n.ratio.replace(":", " / ") : null;
        return h("div", { class: "frame fill-" + fill(n.fill, "paper") + (r ? " has-ratio" : ""), "data-part": part, style: r ? { "aspect-ratio": r } : null }, (n.children || []).map((c) => el(c, true)));
      }
      case "stack":
        return h("div", { class: "stack", "data-part": part }, (n.children || []).map((c) => el(c, false)));
      case "row":
        return h("div", { class: "row" + (n.wrap ? " wrap" : ""), "data-part": part }, (n.children || []).map((c) => el(c, false)));
      case "text": {
        const role = ROLES.includes(n.role) ? n.role : "body";
        const tag = role === "title" ? "h2" : "p";
        return h(tag, { class: "t-" + role + (n.fill ? " ink-" + fill(n.fill) : "") + (abs ? " abs" : ""), "data-part": part, style }, txt(n.text));
      }
      case "shape": {
        if (!SHAPES.includes(n.kind)) return null;
        const rot = Number.isInteger(n.rot) ? Math.max(-45, Math.min(45, n.rot)) : 0;
        return h("svg", { class: "shape size-" + (n.size === "l" ? "l" : "m") + " fill-" + fill(n.fill, "red") + (abs ? " abs" : ""), viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false", "data-part": part, style: { ...(style || {}), transform: "translate(-50%,-50%) rotate(" + rot + "deg)" } }, SHAPE[n.kind]());
      }
      case "tile": {
        const shown = n.value !== null && n.value !== undefined;
        // Kartenflaeche nur mit dem Wert; Beschriftung darunter auf ruhigem Grund (lesbar, Kritikrunde 1)
        return h("div", { class: "tilebox" + (n.focus ? " focus" : ""), role: "img", "aria-label": txt(n.a11y), "data-part": part },
          h("div", { class: "tile fill-" + fill(n.fill, "red") + " ink-" + fill(n.ink, "ink") + (shown ? "" : " back") + " mark-" + (["ok", "hit", "none"].includes(n.mark) ? n.mark : "none"), "aria-hidden": "true" },
            h("span", { class: "tv" }, shown ? txt(n.value).slice(0, 3) : "?")),
          n.sub ? h("span", { class: "ts", "aria-hidden": "true" }, txt(n.sub)) : null);
      }
      case "choice": {
        const id = idp + "-q" + (++ids);
        const opts = Array.isArray(n.options) ? n.options.slice(0, 24) : [];
        // option.input = Eingabe; option.draft = Entwurf (Z1); option.on = gewaehlt; option.disabled
        const click = (o) => {
          if (o.memo !== undefined && host.onMemo) host.onMemo(o.memo);
          if (o.draft !== undefined) { if (host.onDraft) host.onDraft(o.draft); }
          else if (o.input !== undefined) host.onInput(o.input);
        };
        return h("div", { class: "choice", role: "group", "aria-labelledby": id, "data-part": part },
          h("p", { class: "choice-label", id }, txt(n.label)),
          h("div", { class: "options" + (n.wrap ? " wrap" : "") }, opts.map((o, i) => h("button", { type: "button", class: "opt" + (o.on ? " on" : ""), key: i, "aria-pressed": o.on === undefined ? null : o.on ? "true" : "false", disabled: (host.disabled && o.input !== undefined) || o.disabled || (o.draft !== undefined && !host.onDraft) ? true : null, on: { click: () => click(o) } }, txt(o.label)))));
      }
      case "image": {
        // Bild als DOM-Knoten (KI-Bild, Foto): nur data:-URLs von Bildtypen oder Quellen, die der Host aufloest
        // (host.images.url({kind, ref|slot})); Alt-Text Pflicht. CSP: img-src data: blob: 'self'.
        const src = typeof n.src === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n.src) ? n.src
          : n.src && typeof n.src === "object" && host.images && typeof host.images.url === "function" ? host.images.url(n.src) : null;
        const ratio = typeof n.ratio === "string" && /^\d{1,2}:\d{1,2}$/.test(n.ratio) ? n.ratio.replace(":", " / ") : null;
        if (!src) { if (host.onUnknown) host.onUnknown("image:quelle"); return h("p", { class: "w-unknown", role: "note", "data-part": part }, txt(n.alt) || (WTX[host.lang] || WTX.de).unknown); }
        return h("img", { class: "w-img" + (abs ? " abs" : ""), src, alt: txt(n.alt), "data-part": part, style: { ...(style || {}), ...(ratio ? { "aspect-ratio": ratio } : {}) } });
      }
      case "canvas": {
        // statische Canvas-Liste (Poster, Dart-Scheibe, Tischbild): gezeichnet beim Einhaengen und bei jeder Aenderung
        const ratio = typeof n.ratio === "string" && /^\d{1,2}:\d{1,2}$/.test(n.ratio) ? n.ratio.replace(":", " / ") : (Number(n.w) || 1) + " / " + (Number(n.h) || 1);
        return h("canvas", { class: "w-canvas" + (abs ? " abs" : ""), role: "img", "aria-label": txt(n.a11y), "data-part": part, style: { "aspect-ratio": ratio }, ref: (el) => paintStatic(el, n, host) });
      }
      default: {
        const w = renderWidget({ ...n, id: typeof n.id === "string" ? n.id : idp + "-" + (++ids) }, { ...host, idp, renderChild: (c) => el(c, false) });
        if (w) return w;
        if (host.onUnknown) host.onUnknown(String(n.t));
        // kein stilles Weglassen (A4): sichtbarer Hinweis statt Luecke
        return h("p", { class: "w-unknown", role: "note" }, (WTX[host.lang] || WTX.de).unknown + " (" + txt(n.t, 24) + ")");
      }
    }
  }
  return el(node, false);
}

// Zeichnet nur, wenn sich Liste oder Groesse geaendert haben (ref laeuft bei jedem Neuzeichnen); Flaeche hoechstens
// 4096 px je Seite und 8 MPixel, damit kein Geraet an einer riesigen Leinwand scheitert.
const MAX_SIDE = 4096, MAX_PIX = 8e6;
function paintStatic(el, node, host) {
  if (!el || typeof el.getContext !== "function") return;
  const doc = el.ownerDocument, win = doc && doc.defaultView;
  if (!win) return;
  const go = () => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    let dpr = Math.min(win.devicePixelRatio || 1, 2);
    dpr = Math.min(dpr, MAX_SIDE / r.width, MAX_SIDE / r.height, Math.sqrt(MAX_PIX / (r.width * r.height)));
    // Bildstand im Schluessel: ein Bild, das nach dem ersten Zeichnen fertig wird, zeichnet die Leinwand neu (Befund P)
    const iv = host.images && Number.isFinite(host.images.version) ? host.images.version : 0;
    const key = JSON.stringify(node) + "|" + Math.round(r.width) + "x" + Math.round(r.height) + "|" + dpr + "|" + iv;
    if (el.__painted === key) return;
    el.__painted = key;
    el.width = Math.max(1, Math.round(r.width * dpr)); el.height = Math.max(1, Math.round(r.height * dpr));
    const cs = win.getComputedStyle(doc.documentElement);
    const info = paint(el.getContext("2d"), node, { cw: r.width, ch: r.height, dpr, colors: tokenColors((v) => cs.getPropertyValue(v)), reduced: win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches, t: 0, images: host.images || null, high: host.high || null, src: node.src || null, path2d: (d) => new win.Path2D(d), makeCanvas: (w, hh) => { const c = doc.createElement("canvas"); c.width = w; c.height = hh; return c; }, cache: null });
    if (info.unknown.length && host.onUnknown) host.onUnknown("canvas:" + info.unknown.join(","));
  };
  if (el.isConnected) go(); else win.requestAnimationFrame(go);
}
