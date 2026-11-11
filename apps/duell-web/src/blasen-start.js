/* Bubbles on the first page (PR 4 of the bubble plan): the same round bubbles as in the editor (src/blasen-ebene.js) on the
   day's card and on "Erschaffe deine Karte". A tap opens the matching setting at once: on the day's card the editor on
   the sheet of that part (title, look, colour, figure, wish), on the free card its making with the genre or the sentence.
   Bubbles can be moved; where they were put is remembered on this device only (localStorage, never sent).
   In the part blasen; start-ui.js asks for it after the first paint (not with Save-Data), so the page shows as fast as before. */
(function (root) {
"use strict";
var A = root.DailyApp, Kit = root.Kit, B = root.Blasen, Eb = B.ebene;
var $ = function (id) { return document.getElementById(id); };
var KEY = "daily.blasen.start";
var WORDS = {
  de: { titel: "Titel", look: "Look", farbe: "Farbe", figur: "Figur", wunsch: "Wunsch", genre: "Genre", satz: "Satz", set: "{x} einstellen, ziehen zum Verschieben" },
  en: { titel: "Title", look: "Look", farbe: "Colour", figur: "Figure", wunsch: "Wish", genre: "Genre", satz: "Line", set: "Set {x}, drag to move" }
};
function w(k) { return (WORDS[Kit.lang] || WORDS.de)[k]; }
// the day's card: a bubble opens the first of these sheets its kind has; where its thread ends (hero: the title's words
// from below; pic: a point of the picture as a fraction)
var DAY = [["titel", ["Text", "LText", "Arena", "Riddle"], "hero"], ["look", ["Style", "World", "LWorld"], [0.86, 0.14]], ["farbe", ["Color"], [0.14, 0.82]],
  ["figur", ["Figure", "LFigure", "Agent"], [0.5, 0.5]], ["wunsch", ["Wish", "LWish"], null]];
var ICONS = { titel: "titel", look: "stil", farbe: "farbe", figur: "figur", wunsch: "wunsch", genre: "zug", satz: "titel" };
var st = { timer: 0, key: "", pos: load() };
function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st.pos)); } catch (e) {} }
function rect(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function meets(a, c) { return a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y; }
// every word in the box, as rectangles (a bubble never covers a word), and its buttons and picture
function blocked(box, keep) {
  var out = [], tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), n, r = document.createRange();
  while ((n = tw.nextNode())) {
    if (!n.nodeValue.trim() || n.parentNode.closest(".hblasen")) continue;
    r.selectNodeContents(n); Array.prototype.forEach.call(r.getClientRects(), function (q) { if (q.width && q.height) out.push({ x: q.left - 6, y: q.top - 6, w: q.width + 12, h: q.height + 12 }); });
  }
  Array.prototype.forEach.call(box.querySelectorAll("button,canvas,img,input,a"), function (e) {
    if (e === keep || e.closest(".hblasen") || !e.offsetParent) return;
    var q = rect(e); if (q.w && q.h) out.push({ x: q.x - 6, y: q.y - 6, w: q.w + 12, h: q.h + 12 });   // 6 px: the card leans a little (rotate), its boxes are a bit off
  });
  return out;
}
// the nearest free place to the target (page px) inside the box, S px round; null when there is none
function spot(box, S, tx, ty, no, taken) {
  var b = rect(box), best = null, bs = 1e9;
  for (var y = b.y + 2; y <= b.y + b.h - S - 2; y += 4) for (var x = b.x + 2; x <= b.x + b.w - S - 2; x += 4) {
    var q = { x: x, y: y, w: S, h: S }, ok = !no.some(function (r) { return meets(q, r); }) && !taken.some(function (r) { return Math.hypot(r.x - x, r.y - y) < S + 4; });
    if (!ok) continue;
    var s = Math.hypot(tx - x - S / 2, ty - y - S / 2);
    if (s < bs) { bs = s; best = q; }
  }
  return best;
}

// the last line of an element's words (page px), or null
function words(e) { var r = document.createRange(), l = null; r.selectNodeContents(e); Array.prototype.forEach.call(r.getClientRects(), function (q) { if (q.width && q.height) l = { x: q.left, y: q.top, w: q.width, h: q.height }; }); return l; }
function kindOf(h) { var d = h && (h.doc || h.idea); return d ? d.k || d.kind : ""; }
function dayParts(h) {
  var k = kindOf(h), tabs = (A.TABS[k] || []).concat(root.Wish && root.Wish.KINDS.indexOf(k) >= 0 ? ["Wish"] : []);
  return DAY.map(function (p) { var tab = p[1].filter(function (x) { return tabs.indexOf(x) >= 0; })[0]; return tab ? { id: p[0], tab: tab, to: p[2] } : null; }).filter(Boolean);
}

function layer(box, id) {
  var L = $(id);
  if (!L) { L = document.createElement("div"); L.id = id; L.className = "hblasen"; L.appendChild(Eb.svgEl("svg", { "aria-hidden": "true" })); }
  if (L.parentNode !== box) box.appendChild(L);
  return L;
}
function bubble(L, key, label, ico, S, go) {
  var b = L.querySelector('.blase[data-blase="' + key + '"]');
  if (b) return b;
  b = document.createElement("button"); b.type = "button"; b.className = "blase" + (/wunsch$/.test(key) ? " ki" : ""); b.dataset.blase = key;
  b.appendChild(Eb.icon(ico)); var s = document.createElement("span"); s.textContent = label; if (label.length > 6) s.style.fontSize = "9px"; b.appendChild(s);
  b.setAttribute("aria-label", w("set").replace("{x}", label)); b.style.width = b.style.height = S + "px"; b.tabIndex = -1;   // the page keeps its Tab stops: its own buttons lead to the same sheets
  var d = null, moved = false;
  b.addEventListener("pointerdown", function (e) { e.stopPropagation(); d = { x: e.clientX, y: e.clientY, l: b.offsetLeft, t: b.offsetTop }; moved = false; try { b.setPointerCapture(e.pointerId); } catch (x) {} });
  b.addEventListener("pointermove", function (e) {
    if (!d) return; e.stopPropagation();
    var dx = e.clientX - d.x, dy = e.clientY - d.y, P = L.parentNode;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    moved = true; b.classList.add("drag");
    var x = Math.max(0, Math.min(P.clientWidth - S, d.l + dx)), y = Math.max(0, Math.min(P.clientHeight - S, d.t + dy));
    b.style.left = x + "px"; b.style.top = y + "px"; st.pos[key] = { x: Math.round(x), y: Math.round(y) }; threads();
  });
  function up(e) { if (d && moved) save(); if (e) e.stopPropagation(); d = null; b.classList.remove("drag"); }
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  b.addEventListener("click", function (e) { e.stopPropagation(); if (moved) { moved = false; return; } Kit.sfx.tap(); go(); });
  L.appendChild(b); return b;
}
// a bubble at its place: the one put there by hand, else the nearest free one
function put(L, b, key, S, tx, ty, no, taken) {
  var P = L.parentNode, pr = rect(P), q = st.pos[key], x, y;
  if (q) { x = Math.max(0, Math.min(P.clientWidth - S, q.x)); y = Math.max(0, Math.min(P.clientHeight - S, q.y)); }
  else { var s = spot(P, S, tx, ty, no, taken); if (!s) { b.hidden = true; return; } x = s.x - pr.x - P.clientLeft; y = s.y - pr.y - P.clientTop; }   // left/top count from inside the border
  b.hidden = false; b.style.left = x + "px"; b.style.top = y + "px"; taken.push({ x: pr.x + P.clientLeft + x, y: pr.y + P.clientTop + y });
}

function threads() {
  var L = $("hblasenday"), leaf = $("leaf");
  if (!L || !leaf) return;
  var lr = rect(leaf), path = "", dots = "";
  Array.prototype.forEach.call(L.querySelectorAll(".blase"), function (b) {
    if (b.hidden || !b.dataset.tx) return;
    var S = b.offsetWidth, cx = b.offsetLeft + S / 2, cy = b.offsetTop + S / 2, tx = +b.dataset.tx - lr.x - leaf.clientLeft, ty = +b.dataset.ty - lr.y - leaf.clientTop, mx = (cx + tx) / 2, my = Math.max(cy, ty) + 14;
    path += "M" + cx.toFixed(1) + " " + cy.toFixed(1) + "Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + tx.toFixed(1) + " " + ty.toFixed(1);
    dots += "M" + (tx - 4).toFixed(1) + " " + ty.toFixed(1) + "a4 4 0 1 0 8 0a4 4 0 1 0-8 0z";
  });
  var svg = L.querySelector("svg"); svg.textContent = "";
  svg.appendChild(Eb.svgEl("path", { d: path, fill: "none", stroke: "#17140F", "stroke-width": "4", "stroke-linecap": "round" }));
  svg.appendChild(Eb.svgEl("path", { d: path, fill: "none", stroke: "#FFFFFF", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-dasharray": "1 5" }));
  svg.appendChild(Eb.svgEl("path", { d: dots, fill: "#FFFFFF", stroke: "#17140F", "stroke-width": "2" }));
}

function draw() {
  var h = A.home(), leaf = $("leaf"), pic = $("pvcard"), hero = $("hero"), cr = $("create"), row = $("homerow");
  var on = h && h.idea && !h.doc && !h.note, parts = on ? dayParts(h) : [];
  // the day's card
  var L = leaf && parts.length >= 2 && pic && pic.offsetParent ? layer(leaf, "hblasenday") : null;
  if (!L && $("hblasenday")) $("hblasenday").remove();
  if (L) {
    var no = blocked(leaf), taken = [], S = 52;
    Array.prototype.forEach.call(L.querySelectorAll(".blase"), function (b) { if (!parts.some(function (p) { return "day:" + p.id === b.dataset.blase; })) b.remove(); });
    parts.forEach(function (p) {
      var key = "day:" + p.id, pr = rect(pic), hl = hero && words(hero), t = p.to === "hero" && hl ? [hl.x + hl.w + 6, hl.y + hl.h / 2] : p.to ? [pr.x + pr.w * p.to[0], pr.y + pr.h * p.to[1]] : null;   // the title: just after its last word
      var b = bubble(L, key, w(p.id), ICONS[p.id], S, function () { A.startTab(p.tab); });
      b.dataset.tab = p.tab;
      if (t) { b.dataset.tx = t[0]; b.dataset.ty = t[1]; } else { delete b.dataset.tx; }
      var lr = rect(leaf); put(L, b, key, S, t ? t[0] : lr.x + lr.w, t ? t[1] : lr.y + lr.h * 0.62, no, taken);
    });
    threads();
  }
  // the free card: genre and sentence at the two ends of its button, never on its words. Both open the same making as
  // the button (only where the cursor starts differs), so a tap on either end never does something else. Only where the
  // row is wide enough that its words keep their room (not at a big zoom).
  var F = cr && !cr.hidden && cr.offsetParent && row && row.clientWidth >= 330 ? layer(row, "hblasenfree") : null;
  if (!F && $("hblasenfree")) $("hblasenfree").remove();
  if (F) {
    var no2 = blocked(row, cr), taken2 = [], S2 = Math.min(44, row.clientHeight - 4), rr = rect(row);
    [["genre", "art", rr.x], ["satz", "text", rr.x + rr.w]].forEach(function (p) {
      var key = "free:" + p[0], b = bubble(F, key, w(p[0]), ICONS[p[0]], S2, function () { root.Parts.use("erschaffen", function () { root.CreateUI.open({ focus: p[1] }); }).catch(function () {}); });
      b.dataset.focus = p[1]; put(F, b, key, S2, p[2], rr.y + rr.h / 2, no2, taken2);
    });
  }
}
// placed anew when the card, the language or the size changes; four times a second while the first page shows
function tick() {
  var home = $("home");
  if (!home || home.hidden) { clearInterval(st.timer); st.timer = 0; st.key = ""; return; }
  var h = A.home(), leaf = $("leaf"), cr = $("create");
  // everything that moves what a bubble must leave free: the card, its picture, its title, the free card's button
  var key = [h && h.idea && h.idea.id, h && !!h.doc, h && !!h.note, Kit.lang, cr && !cr.hidden, innerWidth].concat(["leaf", "pvcard", "hero", "teaser", "create"].map(function (id) {
    var e = $(id), q = e && e.offsetParent ? rect(e) : null; return q ? [q.x, q.y, q.w, q.h].map(Math.round).join(",") : "-";
  })).join("|");
  if (key !== st.key) { st.key = key; draw(); }
}
function start() { Eb.css(); if (!st.timer) st.timer = setInterval(tick, 250); st.key = ""; tick(); }
B.start = start;
B.startState = function () { return st; };
})(window);
