// Blasen-Ebene beim Anpassen (Muster des Users seit 10.11., Canvas „Anpassen mit Bubbles“): die Karte meldet ihre Teile,
// jede Blase haengt mit einem Faden am Teil, Antippen oeffnet die Einstellung als Dialog aus der Blase. Blasen sind
// verschiebbar (Lage je Kartenart auf dem Geraet, ctx.pref.blasen) und ausblendbar (Pinsel, durchgestrichen = aus).
// Rot ist KI (Magie: offene Felder fuellen), dazu die Signatur (Logo, Hintergrund, Name). Eine Schicht fuer alle Karten:
// Anker eines Teils ist ein Knoten der Anzeigeliste mit part (DOM data-part) oder die Angabe parts[].at im Manifest
// (Bruchteile der Kartenflaeche, z. B. fuer gezeichnete Echtzeitkarten). Ein Teil ohne beides verletzt den Vertrag
// (test/blasen-vertrag.test.js); hier wird keine Ersatzlage erfunden.
// Ansicht: reine Funktion des Zustands. Lage: placeBubbles() liest Anker und gemerkte Lage aus dem DOM (data-*), schreibt
// nur left/top und die Fadenpfade (Layout, kein Zustand). Ziehen: createBubbleDrag() meldet das Ergebnis als BLASE_LAGE.
import { h } from "./dom.js";
import { HOST_PARTS } from "../app/host-parts.js";

// Symbole (24er Raster, Strich): je Teil aus dem Feldtyp seines ersten sichtbaren Parameters abgeleitet, nicht je Karte
const ICON = {
  farbe: "M12 3a9 9 0 1 0 0 18c1 0 2-1 1.4-2-.6-1 0-2 1.1-2H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11h.01M12 7.5h.01M16.5 11h.01",
  text: "M5 6h14M12 6v13M9 19h6",
  bild: "M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01",
  figur: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  regler: "M6 3v7M6 14v7M18 3v4M18 11v10M3 10h6M15 7h6",
  sticker: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z",
  wetter: "M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z",
  ton: "M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2",
  welt: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  magie: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  signatur: "M3 17c3-6 5-9 7-9s-1 9 1 9 3-5 5-5 1 4 3 4M3 21h18"
};
const BY_FIELD = { color: "farbe", pair: "farbe", text: "text", "media.local": "bild", "media.server": "bild", kibild: "bild", choice: "figur", number: "regler", slide: "regler", steps: "ton", stickers: "sticker", list: "sticker", weather: "wetter", spiel: "welt", secret: "text" };
/** Symbol eines Kartenteils: Feldtyp des ersten sichtbaren Parameters (Farbe, Text, Bild …). */
export function iconOf(manifest, part) {
  if (part.kind === "ki") return "magie";
  if (part.kind === "sig") return "signatur";
  const props = manifest.params.properties, k = part.params.find((x) => props[x] && props[x]["x-hidden"] !== true) || part.params[0];
  return BY_FIELD[props[k] && props[k]["x-field"]] || "regler";
}
const svgIcon = (name, cls) => h("svg", { class: cls, viewBox: "0 0 24 24", "aria-hidden": "true" }, h("path", { d: ICON[name] }));

/** Alle Blasen einer Karte: ihre Teile (Manifest) und die Teile des Hosts (Magie, Signatur). */
export function bubblePartsOf(manifest) { return [...manifest.parts.map((p) => ({ ...p, kind: "part" })), ...HOST_PARTS]; }

/** Pinsel-Schalter: Blasen zeigen/ausblenden (durchgestrichen = ausgeblendet). */
export function bubbleToggle(ctx, X, dispatch) {
  const aus = ctx.pref.blasen.aus;
  return h("button", { type: "button", class: "bubble-toggle", key: "btog", "data-act": "blasen", "aria-pressed": aus ? "false" : "true", "aria-label": aus ? X.bubblesShow : X.bubblesHide, title: aus ? X.bubblesShow : X.bubblesHide, on: { click: () => dispatch({ type: "BLASEN" }) } },
    h("svg", { class: "bt-icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, h("path", { d: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" }), aus ? h("path", { class: "bt-strike", d: "M3 3l18 18" }) : null),
    h("span", { class: "bt-text", "aria-hidden": "true" }, aus ? X.bubblesOff : X.bubblesOn));
}

/**
 * Blasen-Ebene ueber der Buehne. Knoepfe in Teile-Reihenfolge (Tastatur, Vorleser), Faeden als dekoratives SVG.
 * @param tree Anzeigeliste der Vorschau (fuer die Anker mit part)
 */
export function bubbleLayer(card, ctx, X, dispatch, tree, lang) {
  const m = card.manifest, inTree = partsInTree(tree), lage = (ctx.pref.blasen.lage[m.id] || {});
  const parts = bubblePartsOf(m);
  return h("div", { class: "bubbles", key: "bubbles", "data-card": m.id },
    h("svg", { class: "threads", "aria-hidden": "true", key: "threads" },
      parts.filter((p) => p.kind === "part").map((p) => h("g", { key: p.id, "data-for": p.id }, h("path", { class: "th-a" }), h("path", { class: "th-b" }), h("circle", { class: "th-dot", r: "5" })))),
    parts.map((p) => {
      const label = p.label[lang] || p.label.de, open = !!ctx.part && ctx.part === p.id;
      const at = p.kind === "part" && !inTree.has(p.id) && Array.isArray(p.at) ? p.at.join(",") : null;
      const pos = Array.isArray(lage[p.id]) ? lage[p.id].join(",") : null;
      const aria = p.kind === "part" ? X.bubble.replace("{p}", label) : p.kind === "ki" ? X.bubbleMagic : X.bubbleSig;
      return h("button", { type: "button", class: "bubble" + (p.kind === "ki" ? " ki" : p.kind === "sig" ? " sig" : ""), key: p.id, "data-for": p.id, "data-kind": p.kind,
        "data-anchor": p.kind !== "part" ? null : at ? "at" : "part", "data-at": at, "data-pos": pos,
        "aria-label": aria + " " + X.bubbleDrag, "aria-expanded": open ? "true" : "false", on: { click: () => dispatch({ type: "BUBBLE", part: p.id }) } },
        svgIcon(iconOf(m, p), "b-icon"), h("span", { class: "b-label", "aria-hidden": "true" }, label));
    }));
}
export function partsInTree(tree) { const out = new Set(); (function walk(n) { if (!n || typeof n !== "object") return; if (typeof n.part === "string") out.add(n.part); for (const c of n.children || []) walk(c); for (const l of n.layers || []) walk(l); for (const o of n.ops || []) walk(o); })(tree); return out; }

// ---------- Lage (Layout) ----------
const num2 = (s) => (s ? s.split(",").map(Number) : null);
function anchorOf(b, stage, card, lr) {
  if (b.dataset.anchor === "at") { const [fx, fy] = num2(b.dataset.at), r = card.getBoundingClientRect(); return [r.left - lr.left + fx * r.width, r.top - lr.top + fy * r.height]; }
  if (b.dataset.anchor !== "part") return null;
  const els = stage.querySelectorAll('[data-part="' + b.dataset.for + '"]');
  if (!els.length) return null;
  let l = Infinity, t = Infinity, r = -Infinity, bt = -Infinity;
  for (const e of els) { const q = e.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); bt = Math.max(bt, q.bottom); }
  // grosse Teile (ganze Karte): Punkt oben links innen, damit der Faden nicht in die Mitte des Inhalts zeigt
  const big = (r - l) * (bt - t) > 0.5 * lr.width * lr.height;
  return big ? [l - lr.left + 28, t - lr.top + 28] : [(l + r) / 2 - lr.left, (t + bt) / 2 - lr.top];
}
const overlaps = (a, b, s) => Math.abs(a[0] - b[0]) < s && Math.abs(a[1] - b[1]) < s;

/**
 * Blasen an die Teile heften: Ebene deckt die Buehne, Blasen in Ebenen-Koordinaten (Mitte), Faden von der Blase zum Anker.
 * @param root App-Wurzel
 */
export function placeBubbles(root) {
  const stage = root.querySelector("#stage"), layer = root.querySelector(".bubbles");
  if (!stage || !layer) return;
  const card = stage.firstElementChild || stage, sr = stage.getBoundingClientRect();
  for (const [k, v] of [["left", sr.left + window.scrollX + "px"], ["top", sr.top + window.scrollY + "px"], ["width", sr.width + "px"], ["height", sr.height + "px"]]) layer.style.setProperty(k, v);
  const lr = layer.getBoundingClientRect(), W = lr.width, H = lr.height;
  const bubbles = [...layer.querySelectorAll(".bubble")], placed = [], gap = 6;
  // Groesse nach Platz: 72 px auf grossen Karten, kleiner auf kleinen (z. B. 16:9 auf 360 px), nie unter 48 px (Touch-Ziel)
  const size = Math.max(48, Math.min(72, Math.floor(Math.sqrt((W * H) / (bubbles.length * 2.2))))), half = size / 2, step = size + gap;
  layer.style.setProperty("--bs", size + "px");
  const clampC = (c) => [Math.max(half, Math.min(W - half, c[0])), Math.max(half, Math.min(H - half, c[1]))];
  const free = (c) => !placed.some((p) => overlaps(p, c, step));
  const centers = new Map();
  // Raster der moeglichen Mitten: jede Blase nimmt die freie Zelle, die ihrem Anker am naechsten ist (ohne ihn zu verdecken)
  const cells = [];
  for (let y = half; y <= H - half + 0.5; y += step) for (let x = half; x <= W - half + 0.5; x += step) cells.push([x, y]);
  const nearest = (a, avoid) => { let best = null, bd = Infinity; for (const c of cells) { if (!free(c) || (avoid && overlaps(c, a, size * 0.6))) continue; const d = Math.hypot(c[0] - a[0], c[1] - a[1]); if (d < bd) { bd = d; best = c; } } return best; };
  // 1. gemerkte Lagen, 2. Magie/Signatur in die unteren Ecken, 3. Teile nahe an ihrem Anker
  for (const b of bubbles) if (b.dataset.pos) { const [fx, fy] = num2(b.dataset.pos), c = clampC([fx * W, fy * H]); centers.set(b, c); placed.push(c); }
  for (const b of bubbles) if (!centers.has(b) && b.dataset.kind !== "part") {
    const corner = clampC(b.dataset.kind === "ki" ? [half, H - half] : [W - half, H - half]), c = free(corner) ? corner : nearest(corner, false) || corner;
    centers.set(b, c); placed.push(c);
  }
  const anchors = new Map(bubbles.map((b) => [b, anchorOf(b, stage, card, lr)]));
  for (const b of bubbles) {
    if (centers.has(b)) continue;
    const a = anchors.get(b) || [W / 2, H / 2], c = nearest(a, true) || nearest(a, false) || clampC(a);
    centers.set(b, c); placed.push(c);
  }
  for (const b of bubbles) {
    const c = centers.get(b);
    b.style.setProperty("left", c[0] - half + "px"); b.style.setProperty("top", c[1] - half + "px");
    thread(layer, b.dataset.for, c, anchors.get(b));
  }
}
/** Faden einer Blase neu zeichnen (auch waehrend des Ziehens). */
function thread(layer, id, c, a) {
  const g = layer.querySelector('.threads g[data-for="' + id + '"]');
  if (!g) return;
  if (!a) { for (const p of g.children) p.setAttribute("visibility", "hidden"); return; }
  const mx = (c[0] + a[0]) / 2, my = Math.max(c[1], a[1]) + 18, d = "M" + c[0] + " " + c[1] + "Q" + mx + " " + my + " " + a[0] + " " + a[1];
  for (const p of g.querySelectorAll("path")) { p.setAttribute("d", d); p.removeAttribute("visibility"); }
  const dot = g.querySelector("circle"); dot.setAttribute("cx", String(a[0])); dot.setAttribute("cy", String(a[1])); dot.removeAttribute("visibility");
}

// ---------- Ziehen ----------
/**
 * Ziehen einer Blase: unter 6 px bleibt es ein Antippen (Klick oeffnet den Dialog); darueber folgt die Blase dem Zeiger
 * (nur Layout) und meldet beim Loslassen ihre Lage als BLASE_LAGE (Bruchteile der Ebene). Der Klick nach dem Ziehen wird
 * verschluckt. Antippen bleibt die Alternative ohne Ziehen (WCAG 2.5.7).
 * @param root App-Wurzel, dispatch Ereignis an die Statechart
 */
export function createBubbleDrag(root, dispatch) {
  let d = null;
  const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
  root.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(".bubbles .bubble");
    if (!b || e.button > 0) return;
    const layer = b.closest(".bubbles"), lr = layer.getBoundingClientRect();
    d = { b, layer, id: b.dataset.for, sx: e.clientX, sy: e.clientY, x0: b.offsetLeft, y0: b.offsetTop, W: lr.width, H: lr.height, moved: false, pid: e.pointerId };
  });
  root.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    if (!d.moved) { d.moved = true; try { d.b.setPointerCapture(d.pid); } catch (x) { /* Zeiger schon weg */ } }
    const s = d.b.offsetWidth, x = Math.max(0, Math.min(d.W - s, d.x0 + dx)), y = Math.max(0, Math.min(d.H - s, d.y0 + dy));
    d.b.style.setProperty("left", x + "px"); d.b.style.setProperty("top", y + "px");
    const ga = d.layer.querySelector('.threads g[data-for="' + d.id + '"] circle');
    if (ga && ga.getAttribute("visibility") !== "hidden") thread(d.layer, d.id, [x + s / 2, y + s / 2], [Number(ga.getAttribute("cx")), Number(ga.getAttribute("cy"))]);
    e.preventDefault();
  });
  const end = (e) => {
    if (!d || e.pointerId !== d.pid) return;
    const x = d; d = null;
    if (!x.moved) return;
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    const s = x.b.offsetWidth, r = (v) => Math.round(v * 1000) / 1000;
    dispatch({ type: "BLASE_LAGE", part: x.id, at: [r((x.b.offsetLeft + s / 2) / x.W), r((x.b.offsetTop + s / 2) / x.H)] });
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", (e) => { if (d && e.pointerId === d.pid) d = null; });
}
