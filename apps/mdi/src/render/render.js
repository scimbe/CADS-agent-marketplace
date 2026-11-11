// Ein Renderer fuer alle Karten: Anzeigeliste (Primitive + Token-Namen) -> DOM. Karten liefern nie HTML, nie Farben
// als Werte, nie Ereignis-Handler; Eingaben sind Daten (option.input), die der Host gegen moves() prueft.
// Unbekannte Primitive und Token fallen weg (gesaeubert), damit erzeugte Karten wie handgebaute aussehen.
import { h } from "../ui/dom.js";
import { FILLS, SHAPES } from "../contract/tokens.js";

const ROLES = ["title", "body", "label", "big", "small"];
const MAX_TEXT = 300, MAX_NODES = 200;

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
 * @param {{onInput:(input:object)=>void, disabled?:boolean, idp?:string}} host
 */
export function render(node, host) {
  let count = 0, ids = 0;
  const idp = host.idp || "c";
  function el(n, abs) {
    if (!n || typeof n !== "object" || ++count > MAX_NODES) return null;
    const part = typeof n.part === "string" && /^[a-z]{1,16}$/.test(n.part) ? n.part : null;
    const style = abs && ("x" in n || "y" in n) ? { left: pct(n.x) + "%", top: pct(n.y) + "%", ...(n.w ? { width: pct(n.w, 1) + "%" } : {}) } : null;
    switch (n.t) {
      case "frame":
        return h("div", { class: "frame fill-" + fill(n.fill, "paper"), "data-part": part }, (n.children || []).map((c) => el(c, true)));
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
        return h("div", { class: "tile fill-" + fill(n.fill, "red") + " ink-" + fill(n.ink, "ink") + (shown ? "" : " back") + (n.focus ? " focus" : "") + " mark-" + (["ok", "hit", "none"].includes(n.mark) ? n.mark : "none"), role: "img", "aria-label": txt(n.a11y), "data-part": part },
          h("span", { class: "tv", "aria-hidden": "true" }, shown ? txt(n.value).slice(0, 3) : "?"),
          n.sub ? h("span", { class: "ts", "aria-hidden": "true" }, txt(n.sub)) : null);
      }
      case "choice": {
        const id = idp + "-q" + (++ids);
        const opts = Array.isArray(n.options) ? n.options.slice(0, 12) : [];
        return h("div", { class: "choice", role: "group", "aria-labelledby": id, "data-part": part },
          h("p", { class: "choice-label", id }, txt(n.label)),
          h("div", { class: "options" }, opts.map((o, i) => h("button", { type: "button", class: "opt", key: i, disabled: host.disabled || null, on: { click: () => host.onInput(o.input) } }, txt(o.label)))));
      }
      default:
        return null;
    }
  }
  return el(node, false);
}
