/* Bubbles on the picture (Blasen-Ebene, A3b of the plan "freie Karte"; the design canvas "Anpassen mit Blasen"): every part
   a card names (src/teile.js) gets a round bubble over the picture, with a thread to what it changes; a tap opens that
   part's sheet (A.PANEL, the same sheet as its tab) as an overlay dialog grown from the bubble (src/blasen-dialog.js). The
   AI wish is the red bubble (no thread: it may change anything), the direct settings are yellow. Bubbles can be moved
   (drag) and hidden with the brush in the header (remembered on this device). With bubbles on, the tab bar and the panel
   below the picture are gone (the picture gets the room); with them off, or on a card that names fewer than two parts,
   the tab bar is the way as before. The keyboard's way with bubbles on: "Alle Einstellungen", the first Tab stop.
   In the part blasen after src/teile.js and src/blasen.js (scripts/build.js PARTS.blasen). The core does not change. */
(function (root) {
"use strict";
var A = root.DailyApp, Kit = root.Kit, T = root.Teile, B = root.Blasen;
var $ = function (id) { return document.getElementById(id); };
var NS = "http://www.w3.org/2000/svg";
var WORDS = {
  de: { on: "Bearbeiten-Blasen einblenden", off: "Bearbeiten-Blasen ausblenden", set: "{x} einstellen, ziehen zum Verschieben", wish: "Wunsch", dice: "Würfel", magie: "Magie", roboter: "Mit KI", magieL: "Offene Felder automatisch füllen", roboterL: "Mit KI frei anpassen" },
  en: { on: "Show editing bubbles", off: "Hide editing bubbles", set: "Set {x}, drag to move", wish: "Wish", dice: "Dice", magie: "Magic", roboter: "With AI", magieL: "Fill open fields automatically", roboterL: "Adapt freely with AI" }
};
var EN = { figur: "Figure", saeule: "Column", himmel: "Sky", titel: "Title", hindernis: "Obstacle", muenze: "Coin", gegner: "Enemy", welt: "World", signatur: "Signature",
  text: "Text", text2: "Bottom", stil: "Style", farbe: "Colour", sticker: "Sticker", foto: "Photo", klang: "Sound", zug: "Move", agent: "Agent", rivale: "Rival", arena: "Arena", raetsel: "Riddle", ende: "End" };
function w(k) { return (WORDS[Kit.lang] || WORDS.de)[k]; }
function label(p) { return p.id === "wunsch" ? w("wish") : p.id === "wuerfel" ? w("dice") : p.id === "magie" || p.id === "roboter" ? w(p.id) : Kit.lang === "de" ? p.label : EN[p.id] || p.label; }
// 24 x 24 line icons, as in the design canvas
var ICON = {
  figur: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  welt: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  saeule: "M6 3v7M6 14v7M18 3v4M18 11v10M3 10h6M15 7h6",
  titel: "M5 6h14M12 6v13M9 19h6",
  wunsch: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z",
  muenze: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4",
  gegner: "M5 19c0-6 3-11 7-11s7 5 7 11zM9 13h.01M15 13h.01M8 8L6 4M16 8l2-4",
  signatur: "M3 17c3-1 4-6 6-6s1 6 3 6 3-4 5-4 2 3 4 3M3 21h18",
  stil: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  farbe: "M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 3 0 4-1 2-3 2-4a9 9 0 0 0-8-8zM7.5 11h.01M10 7.5h.01M15 7.5h.01",
  sticker: "M12 3a9 9 0 1 0 9 9h-6a3 3 0 0 1-3-3zM9 10h.01M15 14h.01",
  foto: "M4 7h3l2-3h6l2 3h3v12H4zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  klang: "M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2",
  zug: "M5 12h12M13 7l5 5-5 5",
  wuerfel: "M5 5h14v14H5zM9 9h.01M15 15h.01M12 12h.01",
  raetsel: "M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V15M12 18h.01",
  magie: "M4 20L15 9M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3M18 3l.01 0",
  roboter: "M6 9h12v10H6zM12 5v4M12 4h.01M9 13h.01M15 13h.01M9.5 16.5h5M3 13v3M21 13v3"
};
ICON.himmel = ICON.welt; ICON.hindernis = ICON.saeule; ICON.text = ICON.text2 = ICON.arena = ICON.ende = ICON.titel; ICON.agent = ICON.figur; ICON.rivale = ICON.gegner;
var CSS = "#blasen,.hblasen{position:absolute;inset:0;pointer-events:none;z-index:6}" +
  ".hblasen>svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}" +
  // on the first page the card's own button rules must not reach the bubbles
  "#home .hblasen .blase{flex:none;min-height:0;margin:0;padding:0;border:3px solid #17140F;border-radius:50%;color:#17140F;font:800 10.5px/1.05 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-transform:none;letter-spacing:0;box-shadow:0 3px 0 #17140F;" +
  "background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#FFE680 0 58%,#E0A800 100%)}" +
  "#home .hblasen .blase svg{width:18px;height:18px}" +
  "#home .hblasen .blase.mg{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#9B7BFF 0 58%,#4B2DB0 100%);color:#fff}" +
  "#home .hblasen .blase.rb{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#4FC3E8 0 58%,#13708F 100%);color:#fff}" +
  "#home .hblasen .blase.ki{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#E0533C 0 58%,#8E2415 100%);color:#fff}" +
  "#blasen>svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}" +
  ".blase{position:absolute;left:0;top:0;pointer-events:auto;margin:0;padding:0;border:3px solid #17140F;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;" +
  "background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#FFE680 0 58%,#E0A800 100%);color:#17140F;box-shadow:0 4px 0 #17140F;" +
  "font:800 10.5px/1.05 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;touch-action:none;cursor:grab;transition:transform .12s;-webkit-user-select:none;user-select:none}" +
  ".blase.mg{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#9B7BFF 0 58%,#4B2DB0 100%);color:#fff}" +
  ".blase.rb{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#4FC3E8 0 58%,#13708F 100%);color:#fff}" +
  ".blase.ki{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.95) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#E0533C 0 58%,#8E2415 100%);color:#fff}" +
  ".blase[aria-expanded=true]{background:radial-gradient(circle at 30% 26%,rgba(255,255,255,.6) 0 5px,rgba(255,255,255,0) 6px),radial-gradient(circle at 50% 42%,#3A352B 0 58%,#17140F 100%);color:#fff;transform:scale(1.08)}" +
  ".blase.drag{cursor:grabbing;transform:scale(1.12)}.blase:focus-visible{outline:3px solid #fff;outline-offset:2px}" +
  ".blase svg{width:22px;height:22px;flex:none}.blase span{max-width:92%;text-align:center}" +
  "#blasenan svg{width:24px;height:24px}" +
  // one more icon in the header: the title keeps its two lines on a narrow phone with a slightly smaller type
  "#editor>.bar:has(#blasenan:not([hidden])) #edtitle{font-size:clamp(14px,4.3vw,21px)}" +
  "#editor>.bar.bsmall:has(#blasenan:not([hidden])) #edtitle{font-size:12px;letter-spacing:0}" +
  "#editor>.bar.bwrap{flex-wrap:wrap}#editor>.bar.bwrap #edtitle{order:9;flex-basis:100%;padding:0 8px 2px}" +
  "#blasen.aus>.blase,#blasen.aus>svg{display:none}" +
  "@media (prefers-reduced-motion:reduce){.blase{transition:none}}";

// st.pos: where each bubble stands (px in #stagewrap), by kind and part; moved ones (st.moved) stay where they were put.
var KEY = "daily.blasen";   // "aus": this device hides the bubbles (the brush in the header)
function saved() { try { return localStorage.getItem(KEY) !== "aus"; } catch (e) { return true; } }
var st = { on: saved(), pos: {}, moved: {}, open: null, ed: null, size: "", layer: null, svg: null, timer: 0, dragged: false, seen: {} };

function css() { if ($("blasencss")) return; var s = document.createElement("style"); s.id = "blasencss"; s.textContent = CSS; document.head.appendChild(s); }
function svgEl(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
function icon(id) { var s = svgEl("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }); s.appendChild(svgEl("path", { d: ICON[id] || ICON.titel })); return s; }
function rect(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function tabs() { return Array.prototype.map.call($("tabs").children, function (b) { return b.dataset.k; }); }
function wishTab() { var l = tabs(); return l.indexOf("Wish") >= 0 ? "Wish" : l.indexOf("LWish") >= 0 ? "LWish" : null; }
function size(W) { return Math.max(56, Math.min(76, Math.round(W * 0.16))); }

// where on a part that is the whole picture its thread ends: style upper right, colour lower left, photo in the middle
var BIG = { x: [0.82, 0.18], farbe: [0.12, 0.7], foto: [0.5, 0.42] };
// The parts in px of #stagewrap, with the point each thread ends on; the background's point sits in its upper right, so
// its thread does not cross the picture. Only parts whose sheet is a tab of this card.
function parts() {
  var d = A.ed() && A.ed().doc, wrap = $("stagewrap"), box = $(d && d.k === "game" ? "gamestage" : "stage");
  if (!d || !wrap || !box) return [];
  var wr = rect(wrap), br = rect(box), ox = br.x + box.clientLeft - wr.x, oy = br.y + box.clientTop - wr.y, l = tabs();
  st.frei = T.frei(d).map(function (r) { return { x: r.x + ox - 4, y: r.y + oy - 4, w: r.w + 8, h: r.h + 8 }; });
  return T.teile(d).filter(function (p) { return l.indexOf(p.panel) >= 0; }).map(function (p) {
    var a = p.w * p.h / (box.clientWidth * box.clientHeight), big = a > 0.5, txt = T.TEXT.indexOf(p.id) >= 0, f = BIG[p.id] || BIG.x;
    // a text's thread ends just below its words, never on them
    return { id: p.id, panel: p.panel, label: p.label, big: big, small: a < 0.15, text: txt, x: p.x + ox, y: p.y + oy, w: p.w, h: p.h,
      tx: ox + (big ? p.x + p.w * f[0] : txt ? p.x + p.w / 2 : p.ax), ty: oy + (big ? p.y + p.h * f[1] : txt ? Math.min(p.y + p.h + 4, box.clientHeight - 2) : p.ay) };
  });
}

// The stage's own controls in px of #stagewrap: its buttons and the picture thumbnail that swaps on a tap (#edpic)
function controls() {
  var wr = rect($("stagewrap")), out = [];
  Array.prototype.forEach.call($("stagewrap").querySelectorAll("button,[role=button],#edpic"), function (b) {
    if (st.layer && st.layer.contains(b) || b.id === "ballset") return;
    var r = rect(b); if (r.w && r.h && !b.hidden) out.push({ x: r.x - wr.x - 4, y: r.y - wr.y - 4, w: r.w + 8, h: r.h + 8 });
  });
  return out;
}
// Greedy placement on a grid over #stagewrap: each new bubble as near as one bubble width to what it changes, never on the
// figure (in the flying game the bird's whole column: it moves up and down), never on another bubble, a button of the
// stage, the switch, a thread's end, a title's words or the signet and name at the bottom (Teile.frei); if there is room,
// not on any other small part either (a coin, a sticker).
function place(list, W, H, S) {
  var k = A.ed().doc.k, keep = [], fig = list.filter(function (p) { return p.id === "figur"; })[0], no = [];
  if (fig) no.push(k === "game" ? { x: fig.x - 6, y: 0, w: fig.w + 12, h: H } : { x: fig.x - 6, y: fig.y - 6, w: fig.w + 12, h: fig.h + 12 });
  var least = no.slice();
  no = no.concat(st.frei || [], list.filter(function (p) { return p.text; }).map(function (p) { return { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 }; }));
  no = no.concat(controls());
  var soft = no.concat(list.filter(function (p) { return p.small && p.id !== "figur"; }).map(function (p) { return { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 }; }));
  list.forEach(function (p) { var q = st.pos[k + ":" + p.id]; if (q) keep.push(q); });
  list.forEach(function (p) {
    var key = k + ":" + p.id; if (st.pos[key]) return;
    st.pos[key] = spot(p, soft) || spot(p, no) || spot(p, least) || { x: 2, y: 2 }; keep.push(st.pos[key]);
  });
  function spot(p, no) {
    var corner = { wunsch: [W - S, H - S], roboter: [W - S, H - S], wuerfel: [W - S, S], magie: [S, S] }[p.id], free = !!corner, tx = corner ? corner[0] : p.tx, ty = corner ? corner[1] : p.ty, best = null, bs = 1e9;
    for (var y = 2; y <= H - S - 2; y += 8) for (var x = 2; x <= W - S - 2; x += 8) {
      var cx = x + S / 2, cy = y + S / 2, ok = true, i;
      for (i = 0; ok && i < no.length; i++) { var r = no[i]; if (x < r.x + r.w && x + S > r.x && y < r.y + r.h && y + S > r.y) ok = false; }
      for (i = 0; ok && i < keep.length; i++) if (Math.hypot(keep[i].x - x, keep[i].y - y) < S + 6) ok = false;
      for (i = 0; ok && i < list.length; i++) if (!list[i].big && Math.hypot(list[i].tx - cx, list[i].ty - cy) < S / 2 + 8) ok = false;
      if (!ok) continue;
      var s = Math.abs(Math.hypot(tx - cx, ty - cy) - (free ? 0 : S * 0.95));
      if (!free && p.tx != null) { var e = end(p, cx, cy); if (!clear(cx, cy, [(cx + e[0]) / 2, (cy + e[1]) / 2], { id: p.id, tx: e[0], ty: e[1] }, wordsOf(list, p.id))) s += 400; }   // its thread would cross words
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
  }
  if (L.parentNode !== wrap) wrap.appendChild(L);
  brush();
}
// The brush in the editor's header: crossed out while the bubbles show (a tap hides them), plain while they are hidden
function brush() {
  var sw = $("blasenan"), bar = document.querySelector("#editor>.bar");
  if (!sw && bar) {
    sw = document.createElement("button"); sw.type = "button"; sw.id = "blasenan"; sw.className = "ico";
    sw.addEventListener("click", function () {
      Kit.sfx.tap(); st.on = !st.on; try { localStorage.setItem(KEY, st.on ? "an" : "aus"); } catch (e) {}
      if (!st.on && B.dialog) B.dialog.close(true);
      tick();
    });
    bar.insertBefore(sw, $("edstyle"));
  }
  return sw;
}
var BRUSH = "M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12zM8.3 13.3l2.4 2.4c-.2 2.6-2.3 4.3-5.2 4.3H3c1.3-1 1.5-2.2 1.6-3.4.1-1.9 1.7-3.4 3.7-3.3z";
// one bubble; its click opens the sheet (a tap, Enter or Space), a drag only moves it
function bubble(p) {
  var b = document.createElement("button"), k = A.ed().doc.k + ":" + p.id;
  b.type = "button"; b.className = "blase" + (p.id === "wunsch" ? " ki" : p.id === "magie" ? " mg" : p.id === "roboter" ? " rb" : ""); b.dataset.blase = p.id; b.dataset.blatt = p.panel;
  b.appendChild(icon(p.id)); var s = document.createElement("span"); s.textContent = label(p); if (s.textContent.length > 7) s.style.fontSize = "9px"; b.appendChild(s);
  b.setAttribute("aria-label", p.id === "magie" || p.id === "roboter" ? w(p.id + "L") : w("set").replace("{x}", label(p)));
  b.tabIndex = -1;   // no extra Tab stops: the keyboard's way is the tab bar (same sheets); a screen reader still finds the button
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
    Kit.sfx.tap(); st.open = p.id;
    if (p.act) { p.act(); return; }   // Magie, Roboter: their own way, no sheet
    if (B.dialog) B.dialog.open(p.panel, b, "part"); else B.tab(p.panel);
    sync();
  });
  return b;
}

// which bubble is open: the one tapped while its sheet shows, else the first bubble of the sheet the tab bar opened
function sync() {
  if (!st.layer) return;
  var bs = st.layer.querySelectorAll(".blase"), from = B.dialog && B.dialog.from();
  st.layer.classList.toggle("aus", !st.on);
  var sw = brush();
  if (sw && sw.dataset.on !== String(st.on)) {   // crossed out while the bubbles show
    sw.dataset.on = String(st.on); sw.textContent = "";
    var g = svgEl("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
    g.appendChild(svgEl("path", { d: BRUSH })); if (st.on) g.appendChild(svgEl("path", { d: "M3 3l18 18", "stroke-width": "2.4" }));
    sw.appendChild(g); sw.setAttribute("aria-label", w(st.on ? "off" : "on")); sw.title = w(st.on ? "off" : "on");
  }
  if (sw) sw.setAttribute("aria-pressed", String(!st.on));
  Array.prototype.forEach.call(bs, function (b) { b.setAttribute("aria-expanded", String(b === from)); });
}

// ten times a second while the editor is open: the threads follow the game (the flying demo keeps moving)
function tick() {
  var e = A.ed();
  if (!e || $("editor").hidden) { stop(); return; }
  if (e !== st.ed) { st.ed = e; st.open = null; st.seen = {}; st.size = ""; Object.keys(st.pos).forEach(function (k) { if (!st.moved[k]) delete st.pos[k]; }); }
  var k = e.doc.k, list = parts(), wrap = $("stagewrap"), W = wrap.clientWidth, H = wrap.clientHeight, S = size(W), wt = wishTab();
  if (k !== "game") { st.seen = {}; Array.prototype.forEach.call(st.layer ? st.layer.querySelectorAll(".blase") : [], function (b) { if (["wunsch", "wuerfel", "magie", "roboter"].indexOf(b.dataset.blase) < 0 && !list.some(function (p) { return p.id === b.dataset.blase; })) b.remove(); }); }   // a still picture: only what it shows now (a sticker taken away, a text emptied)
  list.forEach(function (p) { st.seen[p.id] = p; });
  var all = Object.keys(st.seen).map(function (id) { return st.seen[id]; });
  var on = all.length >= 2 && W && H;
  $("editor").classList.toggle("bl", !!(on && st.on));   // the tab bar and the panel below the picture only without bubbles
  if (B.dialog) B.dialog.all(!!(on && st.on));
  if (brush()) brush().hidden = !on;
  // a header with many icons (language, together, brush) on a narrow phone: the title a size smaller, its two lines kept
  // (first a smaller type; only if its words still do not fit, a line of its own)
  var bar = document.querySelector("#editor>.bar"), et = $("edtitle"), key = on + "|" + bar.clientWidth + "|" + (et && et.textContent) + "|" + Array.prototype.filter.call(bar.children, function (x) { return !x.hidden; }).length;
  if (et && bar.dataset.bfit !== key) {
    bar.dataset.bfit = key; bar.classList.remove("bsmall", "bwrap");
    var cut = function () { return et.scrollHeight > et.clientHeight + 3 || et.scrollWidth > et.clientWidth + 1; };
    if (on && cut()) { bar.classList.add("bsmall"); if (cut()) { bar.classList.remove("bsmall"); bar.classList.add("bwrap"); } }
  }
  if (!on) { if (st.layer) st.layer.hidden = true; if ($("blasenan")) $("blasenan").hidden = true; return; }
  // Magie (fill the open fields) and Roboter (make it an own free card, refined by a prompt) come from parts of their own
  // (window.Magic, window.FreeFromCard): only where they are there and say yes. The red wish is the card's own AI wish;
  // where the robot is there it says the same and more, so the wish then steps back (one AI way per card, not two).
  var robot = ask(root.FreeFromCard, function (F) { return F.can(e.doc); }), magic = ask(root.Magic, function (M) { return M.can(e.doc, e.tab); });
  if (wt && !robot) all.push({ id: "wunsch", panel: wt, label: w("wish"), tx: 0, ty: 0 });
  if (magic) all.push({ id: "magie", panel: "", label: w("magie"), tx: 0, ty: 0, act: function () { if (ask(root.Magic, function (M) { M.fill(A.ed().doc, A.ed().tab); return true; })) A.changed(); } });
  if (robot) all.push({ id: "roboter", panel: "", label: w("roboter"), tx: 0, ty: 0, act: function () { ask(root.FreeFromCard, function (F) { F.open(A.ed().doc); return true; }); } });
  if (tabs().indexOf("Dice") >= 0) all.push({ id: "wuerfel", panel: "Dice", label: w("dice"), tx: 0, ty: 0 });
  if (st.layer) Array.prototype.forEach.call(st.layer.querySelectorAll(".blase"), function (b) { if (!all.some(function (p) { return p.id === b.dataset.blase; })) b.remove(); });   // gone when its part or feature goes
  build(); st.layer.hidden = false;
  // a still picture that is drawn anew (the font came, a text or style changed): the bubbles not moved by hand find new places;
  // the flying game moves all the time, there only the frame counts
  var key = W + "x" + H + (k === "game" ? "" : "|" + list.concat(st.frei || [], controls()).map(function (p) { return (p.id || "") + Math.round(p.x / 12) + "," + Math.round(p.y / 12) + "," + Math.round(p.w / 12) + "," + Math.round(p.h / 12); }).join(";"));
  if (st.size !== key) { if (st.size) Object.keys(st.pos).forEach(function (k) { if (!st.moved[k]) delete st.pos[k]; }); st.size = key; }
  place(all, W, H, S);
  var now = {}, path = "", dots = "", words = (st.frei || []).concat(list.filter(function (p) { return p.text; }).map(function (p) { return { id: p.id, x: p.x - 2, y: p.y - 2, w: p.w + 4, h: p.h + 4 }; }));
  list.forEach(function (p) { now[p.id] = p; });
  all.forEach(function (p) {
    var b = st.layer.querySelector('.blase[data-blase="' + p.id + '"]'), q = st.pos[k + ":" + p.id];
    if (!b) { b = bubble(p); st.layer.appendChild(b); sync(); }
    b.style.width = b.style.height = S + "px"; b.style.left = q.x + "px"; b.style.top = q.y + "px";
    var t = now[p.id]; if (!t) return;
    b.dataset.ty = String(Math.round(rect(wrap).y + t.ty));   // where its part is, in page px: its dialog stays off it   // a column out of sight for a moment: the bubble stays, its thread waits
    var cx = q.x + S / 2, cy = q.y + S / 2, e = end(t, cx, cy), tt = { id: t.id, tx: e[0], ty: e[1] }, m = route(cx, cy, tt, wordsOf(list, t.id)), mx = m[0], my = m[1];
    t = tt;
    path += "M" + cx.toFixed(1) + " " + cy.toFixed(1) + "Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + t.tx.toFixed(1) + " " + t.ty.toFixed(1);
    dots += "M" + (t.tx - 5).toFixed(1) + " " + t.ty.toFixed(1) + "a5 5 0 1 0 10 0a5 5 0 1 0-10 0z";
  });
  var svg = st.svg; svg.textContent = "";
  svg.appendChild(svgEl("path", { d: path, fill: "none", stroke: "#17140F", "stroke-width": "5", "stroke-linecap": "round" }));
  svg.appendChild(svgEl("path", { d: path, fill: "none", stroke: "#FFFFFF", "stroke-width": "2", "stroke-linecap": "round", "stroke-dasharray": "1 6" }));
  svg.appendChild(svgEl("path", { d: dots, fill: "#FFFFFF", stroke: "#17140F", "stroke-width": "2.5" }));
  sync();
}
// the words a thread must not cross: the drawn words and the other texts (not its own part)
function wordsOf(list, id) {
  return (st.frei || []).concat(list.filter(function (p) { return p.text && p.id !== id; }).map(function (p) { return { id: p.id, x: p.x - 2, y: p.y - 2, w: p.w + 4, h: p.h + 4 }; }));
}
// where a thread ends: on a text, the point of its box's edge nearest to the bubble (never on its words); else its point
function end(p, cx, cy) {
  if (!p.text) return [p.tx, p.ty];
  var x = Math.max(p.x, Math.min(p.x + p.w, cx)), y = Math.max(p.y, Math.min(p.y + p.h, cy));
  if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) y = cy < p.y + p.h / 2 ? p.y : p.y + p.h;
  var dx = Math.min(x - p.x, p.x + p.w - x), dy = Math.min(y - p.y, p.y + p.h - y);
  if (dx > 0 && dy > 0) { if (dx < dy) x = x - p.x < p.x + p.w - x ? p.x - 3 : p.x + p.w + 3; else y = y - p.y < p.y + p.h - y ? p.y - 3 : p.y + p.h + 3; }
  else { if (y <= p.y) y -= 3; else if (y >= p.y + p.h) y += 3; if (x <= p.x) x -= 3; else if (x >= p.x + p.w) x += 3; }
  return [x, y];
}
// a feature of another part, asked safely: false when it is not there or fails
function ask(api, f) { try { return !!(api && f(api)); } catch (e) { return false; } }
// A thread's bend: the slack one if it crosses no words, else the first of a few other bends that does (around the words
// above, below or to the side); the words of its own part do not count, its thread ends at their edge.
function route(cx, cy, t, words) {
  var own = words.filter(function (r) { return r.id !== t.id; }), dx = t.tx - cx, dy = t.ty - cy, n = Math.hypot(dx, dy) || 1, px = -dy / n, py = dx / n;
  var tries = [[(cx + t.tx) / 2, Math.max(cy, t.ty) + 18], [t.tx, cy], [cx, t.ty]];
  [60, -60, 120, -120].forEach(function (o) { tries.push([(cx + t.tx) / 2 + px * o, (cy + t.ty) / 2 + py * o]); });
  own.forEach(function (r) { var my = (cy + t.ty) / 2; tries.push([r.x - 2 * Math.abs(r.x - Math.min(cx, t.tx)) - 40, my], [r.x + r.w + 2 * Math.abs(Math.max(cx, t.tx) - r.x - r.w) + 40, my]); });   // around a block of words, left or right
  for (var i = 0; i < tries.length; i++) if (clear(cx, cy, tries[i], t, own)) return tries[i];
  return tries[0];
}
function clear(cx, cy, c, t, rects) {
  for (var k = 1; k < 20; k++) {
    var u = k / 20, x = (1 - u) * (1 - u) * cx + 2 * u * (1 - u) * c[0] + u * u * t.tx, y = (1 - u) * (1 - u) * cy + 2 * u * (1 - u) * c[1] + u * u * t.ty;
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return false; }
  }
  return true;
}
function stop() {
  clearInterval(st.timer); st.timer = 0; if (st.layer) { st.layer.remove(); st.layer = null; } st.ed = null;
  if (B.dialog) B.dialog.close(true);
  if ($("blasenan")) $("blasenan").hidden = true;
  $("editor").classList.remove("bl");
}
function start() {
  if (B.dialog) B.dialog.close(true);
  if (st.layer) { st.layer.remove(); st.layer = null; }
  st.ed = null; clearInterval(st.timer); st.timer = setInterval(tick, 100); tick();
}

var open0 = B.open;
// A sheet asked for by name (the day's bubbles on the first page, "Wunsch" there): with bubbles on, it opens as the dialog
// of its bubble once the picture is drawn
B.open = function (opt) {
  open0(opt); start();
  var k = opt && opt.tab, mine = A.ed();
  if (k && B.dialog) setTimeout(function () {
    tick();
    if (A.ed() !== mine || !$("editor").classList.contains("bl")) return;
    var b = st.layer && st.layer.querySelector('.blase[data-blatt="' + mine.tab + '"]');
    B.dialog.open(mine.tab, b, b ? "part" : "all");
  }, 120);
};
B.ebene = { tick: tick, state: function () { return st; }, css: css, svgEl: svgEl, icon: icon };
})(window);
