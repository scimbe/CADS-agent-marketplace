// Kleinster virtueller DOM: h() beschreibt, patch() gleicht ab. Nur createElement/Textknoten (strikte CSP).
// Textinhalte gehen nur als Textknoten in den DOM.
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "g", "polygon", "rect"]);

export function h(tag, props, ...children) {
  const kids = [];
  (function add(c) { for (const x of c) { if (x === null || x === undefined || x === false) continue; if (Array.isArray(x)) add(x); else kids.push(typeof x === "object" ? x : String(x)); } })(children);
  return { tag, props: props || {}, children: kids, key: props && props.key !== undefined ? props.key : null };
}

function setProp(el, k, v, old, svg) {
  if (k === "key" || k === "ref") return;
  if (k === "on") {
    el.__on = v || {};
    for (const t of new Set([...Object.keys(old || {}), ...Object.keys(v || {})])) {
      if (!el.__bound) el.__bound = new Set();
      if (!el.__bound.has(t)) { el.__bound.add(t); el.addEventListener(t, (e) => { const f = el.__on[t]; if (f) f(e); }); }
    }
    return;
  }
  if (k === "style") { // nur CSSOM (CSP-konform), keine style-Attribute im Markup
    const o = old || {}, n = v || {};
    for (const p of Object.keys(o)) if (!(p in n)) el.style.removeProperty(p);
    for (const p of Object.keys(n)) if (o[p] !== n[p]) el.style.setProperty(p, n[p]);
    return;
  }
  if (!svg && (k === "value" || k === "checked")) { if (el[k] !== v) el[k] = v; return; }
  if (v === null || v === undefined || v === false) el.removeAttribute(k);
  else el.setAttribute(k, v === true ? "" : String(v));
}

function create(v, svg) {
  if (typeof v === "string") return document.createTextNode(v);
  svg = svg || SVG_TAGS.has(v.tag);
  const el = svg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
  for (const k of Object.keys(v.props)) setProp(el, k, v.props[k], undefined, svg);
  for (const c of v.children) el.appendChild(create(c, svg && v.tag !== "foreignObject"));
  v.el = el;
  if (v.props.ref) v.props.ref(el);
  return el;
}

function same(a, b) { return typeof a === typeof b && (typeof a === "string" || (a.tag === b.tag && a.key === b.key)); }

function update(parent, el, ov, nv, svg) {
  if (!same(ov, nv)) { const n = create(nv, svg); parent.replaceChild(n, el); return n; }
  if (typeof nv === "string") { if (ov !== nv) el.nodeValue = nv; return el; }
  svg = svg || SVG_TAGS.has(nv.tag);
  for (const k of new Set([...Object.keys(ov.props), ...Object.keys(nv.props)])) if (ov.props[k] !== nv.props[k] || k === "on" || k === "value") setProp(el, k, nv.props[k], ov.props[k], svg);
  children(el, ov.children, nv.children, svg);
  nv.el = el;
  if (nv.props.ref) nv.props.ref(el);
  return el;
}

function children(el, oc, nc, svg) {
  const keyed = nc.length && nc.every((c) => typeof c === "object" && c.key !== null) && oc.every((c) => typeof c === "object" && c.key !== null);
  if (keyed) {
    const map = new Map(oc.map((c) => [c.key, c]));
    const nodes = nc.map((c) => { const o = map.get(c.key); if (o) { map.delete(c.key); return update(el, o.el, o, c, svg); } return create(c, svg); });
    for (const o of map.values()) if (o.el.parentNode === el) el.removeChild(o.el);
    nodes.forEach((n, i) => { if (el.childNodes[i] !== n) el.insertBefore(n, el.childNodes[i] || null); });
    return;
  }
  const live = Array.from(el.childNodes);
  for (let i = 0; i < nc.length; i++) {
    if (i < oc.length) update(el, live[i], oc[i], nc[i], svg);
    else el.appendChild(create(nc[i], svg));
  }
  for (let i = live.length - 1; i >= nc.length; i--) el.removeChild(live[i]);
}

/** Rendert vnodes (Array) in container; merkt sich den alten Baum am Container. */
export function patch(container, vnodes) {
  const old = container.__v || [];
  if (!container.__v) while (container.firstChild) container.removeChild(container.firstChild);
  children(container, old, vnodes, false);
  container.__v = vnodes;
}
