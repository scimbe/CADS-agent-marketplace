/* Bubbles on the picture (Blasen-Ebene, A3b of the plan "freie Karte"; the design canvas "Anpassen mit Blasen"): every part
   a card names (src/teile.js) gets a round bubble over the picture, with a thread to what it changes; a tap opens that
   part's sheet (A.PANEL, the same sheet as its tab). The AI wish is the red bubble (no thread: it may change anything), the
   direct settings are yellow. Bubbles can be moved (drag) and hidden ("Blasen aus"). The tab bar stays: it is the
   keyboard's way (role=tab, arrows) and the fallback for cards that name fewer than two parts.
   In the part blasen after src/teile.js and src/blasen.js (scripts/build.js PARTS.blasen). The core does not change. */
(function (root) {
"use strict";
var A = root.DailyApp, Kit = root.Kit, T = root.Teile, B = root.Blasen;
var $ = function (id) { return document.getElementById(id); };
var NS = "http://www.w3.org/2000/svg";
var WORDS = {
  de: { on: "Blasen an", off: "Blasen aus", set: "{x} einstellen, ziehen zum Verschieben", wish: "Wunsch" },
  en: { on: "Bubbles on", off: "Bubbles off", set: "Set {x}, drag to move", wish: "Wish" }
};
var EN = { figur: "Figure", saeule: "Column", himmel: "Sky", titel: "Title", hindernis: "Obstacle", muenze: "Coin", gegner: "Enemy", welt: "World", signatur: "Signature" };
function w(k) { return (WORDS[Kit.lang] || WORDS.de)[k]; }
function label(p) { return p.id === "wunsch" ? w("wish") : Kit.lang === "de" ? p.label : EN[p.id] || p.label; }
// 24 x 24 line icons, as in the design canvas
var ICON = {
  figur: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  welt: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  saeule: "M6 3v7M6 14v7M18 3v4M18 11v10M3 10h6M15 7h6",
  titel: "M5 6h14M12 6v13M9 19h6",
  wunsch: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
  muenze: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4",
  gegner: "M5 19c0-6 3-11 7-11s7 5 7 11zM9 13h.01M15 13h.01M8 8L6 4M16 8l2-4",
  signatur: "M3 17c3-1 4-6 6-6s1 6 3 6 3-4 5-4 2 3 4 3M3 21h18"
};
ICON.himmel = ICON.welt; ICON.hindernis = ICON.saeule;
var CSS = "#blasen{position:absolute;inset:0;pointer-events:none;z-index:6}" +
  "#blasen>svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}" +
  ".blase{position:absolute;left:0;top:0;pointer-events:auto;margin:0;padding:0;border:3px solid #17140F;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;" +
  "background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#FFE680 0 58%,#E0A800 100%);color:#17140F;box-shadow:0 4px 0 #17140F;" +
  "font:800 10.5px/1.05 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;touch-action:none;cursor:grab;transition:transform .12s;-webkit-user-select:none;user-select:none}" +
  ".blase.ki{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#E0533C 0 58%,#8E2415 100%);color:#fff}" +
  ".blase[aria-expanded=true]{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.6) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#3A352B 0 58%,#17140F 100%);color:#fff;transform:scale(1.08)}" +
  ".blase.drag{cursor:grabbing;transform:scale(1.12)}.blase:focus-visible{outline:3px solid #fff;outline-offset:2px}" +
  ".blase svg{width:22px;height:22px;flex:none}.blase span{max-width:92%;text-align:center}" +
  "#blasenan{position:absolute;left:6px;bottom:6px;pointer-events:auto;min-height:44px;padding:0 12px;border:2px solid #17140F;border-radius:999px;background:#FBF5DD;color:#17140F;font:700 13px system-ui,sans-serif;box-shadow:2px 2px 0 #17140F}" +
  "#blasen.aus>.blase,#blasen.aus>svg{display:none}#blasen.aus>#blasenan{background:#F9D84A;font-weight:800}" +
  "@media (prefers-reduced-motion:reduce){.blase{transition:none}}";

// st.pos: where each bubble stands (px in #stagewrap), by kind and part; moved ones (st.moved) stay where they were put.
var st = { on: true, pos: {}, moved: {}, open: null, ed: null, size: "", layer: null, svg: null, timer: 0, dragged: false, seen: {} };

function css() { if ($("blasencss")) return; var s = document.createElement("style"); s.id = "blasencss"; s.textContent = CSS; document.head.appendChild(s); }
function svgEl(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
function icon(id) { var s = svgEl("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }); s.appendChild(svgEl("path", { d: ICON[id] || ICON.titel })); return s; }
function rect(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function tabs() { return Array.prototype.map.call($("tabs").children, function (b) { return b.dataset.k; }); }
function wishTab() { var l = tabs(); return l.indexOf("Wish") >= 0 ? "Wish" : l.indexOf("LWish") >= 0 ? "LWish" : null; }
function size(W) { return Math.max(56, Math.min(76, Math.round(W * 0.16))); }

// The parts in px of #stagewrap, with the point each thread ends on; the background's point sits in its upper right, so
// its thread does not cross the picture. Only parts whose sheet is a tab of this card.
function parts() {
  var d = A.ed() && A.ed().doc, wrap = $("stagewrap"), box = $(d && d.k === "game" ? "gamestage" : "stage");
  if (!d || !wrap || !box) return [];
  var wr = rect(wrap), br = rect(box), ox = br.x + box.clientLeft - wr.x, oy = br.y + box.clientTop - wr.y, l = tabs();
  return T.teile(d).filter(function (p) { return l.indexOf(p.panel) >= 0; }).map(function (p) {
    var a = p.w * p.h / (box.clientWidth * box.clientHeight), big = a > 0.5;
    return { id: p.id, panel: p.panel, label: p.label, big: big, small: a < 0.15, x: p.x + ox, y: p.y + oy, w: p.w, h: p.h, tx: ox + (big ? p.x + p.w * 0.82 : p.ax), ty: oy + (big ? p.y + p.h * 0.18 : p.ay) };
  });
}

// Greedy placement on a grid over #stagewrap: each new bubble as near as one bubble width to what it changes, never on the
// figure (in the flying game the bird's whole column: it moves up and down), never on another bubble, a button of the
// stage, the switch or a thread's end; if there is room, not on any other small part either (the title's words, a coin).
function place(list, W, H, S) {
  var k = A.ed().doc.k, keep = [], fig = list.filter(function (p) { return p.id === "figur"; })[0], no = [];
  if (fig) no.push(k === "game" ? { x: fig.x - 6, y: 0, w: fig.w + 12, h: H } : { x: fig.x - 6, y: fig.y - 6, w: fig.w + 12, h: fig.h + 12 });
  var wr = rect($("stagewrap"));
  Array.prototype.forEach.call($("stagewrap").querySelectorAll("button"), function (b) {
    if (st.layer && st.layer.contains(b) && b.id !== "blasenan") return;
    var r = rect(b); if (r.w && r.h) no.push({ x: r.x - wr.x - 4, y: r.y - wr.y - 4, w: r.w + 8, h: r.h + 8 });
  });
  var soft = no.concat(list.filter(function (p) { return p.small && p.id !== "figur"; }).map(function (p) { return { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 }; }));
  list.forEach(function (p) { var q = st.pos[k + ":" + p.id]; if (q) keep.push(q); });
  list.forEach(function (p) {
    var key = k + ":" + p.id; if (st.pos[key]) return;
    st.pos[key] = spot(p, soft) || spot(p, no) || { x: 2, y: 2 }; keep.push(st.pos[key]);
  });
  function spot(p, no) {
    var tx = p.id === "wunsch" ? W - S : p.tx, ty = p.id === "wunsch" ? H - S : p.ty, best = null, bs = 1e9;
    for (var y = 2; y <= H - S - 2; y += 8) for (var x = 2; x <= W - S - 2; x += 8) {
      var cx = x + S / 2, cy = y + S / 2, ok = true, i;
      for (i = 0; ok && i < no.length; i++) { var r = no[i]; if (x < r.x + r.w && x + S > r.x && y < r.y + r.h && y + S > r.y) ok = false; }
      for (i = 0; ok && i < keep.length; i++) if (Math.hypot(keep[i].x - x, keep[i].y - y) < S + 6) ok = false;
      for (i = 0; ok && i < list.length; i++) if (!list[i].big && Math.hypot(list[i].tx - cx, list[i].ty - cy) < S / 2 + 8) ok = false;
      if (!ok) continue;
      var s = Math.abs(Math.hypot(tx - cx, ty - cy) - (p.id === "wunsch" ? 0 : S * 0.95));
      if (s < bs) { bs = s; best = { x: x, y: y }; }
    }
    return best;
  }
}

function build() {
  css();
  var wrap = $("stagewrap"), L = st.layer;
  if (!L) {
    L = st.layer = document.createElement("div"); L.id = "blasen";
    st.svg = svgEl("svg", { "aria-hidden": "true" }); L.appendChild(st.svg);
    var sw = document.createElement("button"); sw.type = "button"; sw.id = "blasenan";
    sw.addEventListener("click", function () { Kit.sfx.tap(); st.on = !st.on; if (!st.on) st.open = null; sync(); tick(); });
    L.appendChild(sw);
  }
  if (L.parentNode !== wrap) wrap.appendChild(L);
}
// one bubble; its click opens the sheet (a tap, Enter or Space), a drag only moves it
function bubble(p) {
  var b = document.createElement("button"), k = A.ed().doc.k + ":" + p.id;
  b.type = "button"; b.className = "blase" + (p.id === "wunsch" ? " ki" : ""); b.dataset.blase = p.id; b.dataset.blatt = p.panel;
  b.appendChild(icon(p.id)); var s = document.createElement("span"); s.textContent = label(p); if (s.textContent.length > 7) s.style.fontSize = "9px"; b.appendChild(s);
  b.setAttribute("aria-label", w("set").replace("{x}", label(p)));
  var d = null;
  b.addEventListener("pointerdown", function (e) { d = { x: e.clientX, y: e.clientY, p: st.pos[k], moved: false }; st.dragged = false; try { b.setPointerCapture(e.pointerId); } catch (x) {} });
  b.addEventListener("pointermove", function (e) {
    if (!d) return;
    var dx = e.clientX - d.x, dy = e.clientY - d.y, wrap = $("stagewrap"), S = b.offsetWidth;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    d.moved = true; b.classList.add("drag");
    st.pos[k] = { x: Math.max(0, Math.min(wrap.clientWidth - S, d.p.x + dx)), y: Math.max(0, Math.min(wrap.clientHeight - S, d.p.y + dy)) }; st.moved[k] = 1;
    tick();
  });
  function up() { if (d && d.moved) st.dragged = true; d = null; b.classList.remove("drag"); }
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  b.addEventListener("click", function () {
    if (st.dragged) { st.dragged = false; return; }
    Kit.sfx.tap(); st.open = p.id; B.tab(p.panel); sync();
  });
  return b;
}

// which bubble is open: the one tapped while its sheet shows, else the first bubble of the sheet the tab bar opened
function sync() {
  if (!st.layer) return;
  var cur = A.ed() && A.ed().tab, bs = st.layer.querySelectorAll(".blase"), first = {};
  st.layer.classList.toggle("aus", !st.on);
  var sw = $("blasenan"); sw.textContent = w(st.on ? "off" : "on"); sw.setAttribute("aria-pressed", String(!st.on));
  if (st.open && !Array.prototype.some.call(bs, function (b) { return b.dataset.blase === st.open && b.dataset.blatt === cur; })) st.open = null;
  Array.prototype.forEach.call(bs, function (b) {
    var on = b.dataset.blatt === cur && (st.open ? b.dataset.blase === st.open : !first[cur]);
    if (on) first[cur] = 1;
    b.setAttribute("aria-expanded", String(on));
  });
}

// ten times a second while the editor is open: the threads follow the game (the flying demo keeps moving)
function tick() {
  var e = A.ed();
  if (!e || $("editor").hidden) { stop(); return; }
  if (e !== st.ed) { st.ed = e; st.open = null; st.seen = {}; st.size = ""; Object.keys(st.pos).forEach(function (k) { if (!st.moved[k]) delete st.pos[k]; }); }
  var list = parts(), wrap = $("stagewrap"), W = wrap.clientWidth, H = wrap.clientHeight, S = size(W), wt = wishTab();
  list.forEach(function (p) { st.seen[p.id] = p; });
  var all = Object.keys(st.seen).map(function (id) { return st.seen[id]; });
  if (all.length < 2 || !W || !H) { if (st.layer) st.layer.hidden = true; return; }
  if (wt) all.push({ id: "wunsch", panel: wt, label: w("wish"), tx: 0, ty: 0 });
  build(); st.layer.hidden = false;
  var key = W + "x" + H;
  if (st.size !== key) { if (st.size) Object.keys(st.pos).forEach(function (k) { if (!st.moved[k]) delete st.pos[k]; }); st.size = key; }
  place(all, W, H, S);
  var now = {}, path = "", dots = "", k = e.doc.k;
  list.forEach(function (p) { now[p.id] = p; });
  all.forEach(function (p) {
    var b = st.layer.querySelector('.blase[data-blase="' + p.id + '"]'), q = st.pos[k + ":" + p.id];
    if (!b) { b = bubble(p); st.layer.insertBefore(b, $("blasenan")); sync(); }
    b.style.width = b.style.height = S + "px"; b.style.left = q.x + "px"; b.style.top = q.y + "px";
    var t = now[p.id]; if (!t) return;   // a column out of sight for a moment: the bubble stays, its thread waits
    var cx = q.x + S / 2, cy = q.y + S / 2, mx = (cx + t.tx) / 2, my = Math.max(cy, t.ty) + 18;
    path += "M" + cx.toFixed(1) + " " + cy.toFixed(1) + "Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + t.tx.toFixed(1) + " " + t.ty.toFixed(1);
    dots += "M" + (t.tx - 5).toFixed(1) + " " + t.ty.toFixed(1) + "a5 5 0 1 0 10 0a5 5 0 1 0-10 0z";
  });
  var svg = st.svg; svg.textContent = "";
  svg.appendChild(svgEl("path", { d: path, fill: "none", stroke: "#17140F", "stroke-width": "5", "stroke-linecap": "round" }));
  svg.appendChild(svgEl("path", { d: path, fill: "none", stroke: "#FFFFFF", "stroke-width": "2", "stroke-linecap": "round", "stroke-dasharray": "1 6" }));
  svg.appendChild(svgEl("path", { d: dots, fill: "#FFFFFF", stroke: "#17140F", "stroke-width": "2.5" }));
  sync();
}
function stop() { clearInterval(st.timer); st.timer = 0; if (st.layer) { st.layer.remove(); st.layer = null; } st.ed = null; }
function start() {
  if (st.layer) { st.layer.remove(); st.layer = null; }
  st.ed = null; clearInterval(st.timer); st.timer = setInterval(tick, 100); tick();
}

var open0 = B.open;
B.open = function (opt) { open0(opt); start(); };
B.ebene = { tick: tick, state: function () { return st; } };
})(window);
