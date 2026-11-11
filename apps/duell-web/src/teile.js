// My Daily Idea: the parts of a card ("teile"; the name "parts" is taken by the part loader src/parts.js). A card names
// what can be changed on it and where it stands, so the editor can put a bubble on it that opens the matching sheet
// (A.PANEL). Built into the part "blasen" later (A3b); the core only gives the raw state: Game.view() and LaufUI.view().
//   teile(doc)   -> [{ id, x, y, w, h, panel, label, ax, ay }] in CSS px relative to the stage box (inside its border):
//                   the flying game: #gamestage; every other card: the editor picture #stage. (ax, ay): a point inside the
//                   rectangle where teilAt() answers this id (the middle, unless a smaller part covers it).
//   teilAt(x, y) -> id | null, the smallest part under the point (a column in front of the sky, the bird in front of both)
// Flug: figur, saeule, himmel, titel. Lauf: figur, hindernis, muenze, gegner, welt, titel. Cards built from the DOM name
// their parts with [data-part][data-panel] (data-label optional) inside #stagewrap.
// Pure arithmetic up to place(): the node tests feed it a fixed view() snapshot.
(function (root, make) {
  var api = make(root);
  if (typeof module === "object" && module.exports) module.exports = api; else root.Teile = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";
  // the label is the word on the bubble; the panel is the sheet it opens (its tab in A.TABS of the kind)
  var LABEL = { figur: "Figur", saeule: "Säule", himmel: "Himmel", titel: "Titel", hindernis: "Hindernis", muenze: "Münze", gegner: "Gegner", welt: "Welt" };
  function part(id, panel, r) { return { id: id, panel: panel, label: LABEL[id] || id, x: r.x, y: r.y, w: r.w, h: r.h }; }

  // v: Game.view() in game units (w x h, 288 x 512). k: { PIPE_W, GROUND } of the engine (DuellEngine).
  // There is no title on the canvas: its bubble sits on a band at the top, where the game screen shows it.
  function flug(v, k) {
    var out = [], b = v.bird, half = Math.max(b.r, Math.round(k.GROUND * 0.31)), floor = v.h - k.GROUND, p;
    out.push(part("figur", "Figure", { x: b.x - half, y: b.y - half, w: 2 * half, h: 2 * half }));
    for (var i = 0; i < v.pipes.length; i++) {
      p = v.pipes[i];
      if (p.x + k.PIPE_W > 0 && p.x < v.w) { out.push(part("saeule", "Rules", { x: p.x, y: 0, w: k.PIPE_W, h: floor })); break; }   // the next one in sight
    }
    out.push(part("himmel", "World", { x: 0, y: 0, w: v.w, h: v.h }));
    out.push(part("titel", "Text", { x: v.w * 0.1, y: 8, w: v.w * 0.8, h: 40 }));
    return out;
  }
  // v: LaufUI.view() in px of the picture. The first item of a sort in sight stands for all of its sort. A sort the track
  // has but the picture does not show yet (v.ahead: still to the right) gets its bubble at the right edge, at the height
  // where it will come in, marked edge: true; bubbles there are stacked so none covers another.
  var SORT = { o: "hindernis", d: "hindernis", x: "hindernis", c: "muenze", f: "gegner" }, LPANEL = { hindernis: "LWorld", muenze: "LWorld", gegner: "LFigure" };
  function lauf(v) {
    var out = [part("figur", "LFigure", v.me)], seen = {}, z = Math.round(v.w * 0.08), x = v.w - z - 4;
    v.items.forEach(function (it) { var id = SORT[it.t]; if (id && !seen[id]) { seen[id] = 1; out.push(part(id, LPANEL[id], it)); } });
    function free(y) { return out.every(function (p) { return p.x > x + z + 4 || p.x + p.w < x - 4 || p.y > y + z + 4 || p.y + p.h < y - 4; }); }
    (v.ahead || []).forEach(function (it) {
      var id = SORT[it.t], y0, y, i;
      if (!id || seen[id]) return;
      seen[id] = 1; y0 = Math.min(Math.max(0, it.y + it.h / 2 - z / 2), v.h - z);
      for (i = 0, y = y0; i < 40 && !free(y); i++) y = Math.min(Math.max(0, y0 + (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2) * (z + 6)), v.h - z);   // the nearest free place, below or above
      var p = part(id, LPANEL[id], { x: x, y: y, w: z, h: z }); p.edge = true; out.push(p);
    });
    out.push(part("welt", "LWorld", { x: 0, y: 0, w: v.w, h: v.h }));
    out.push(part("titel", "LText", v.band));
    return out;
  }

  // the smallest part under the point wins; on the same size the one named first
  function hit(list, x, y) {
    var best = null;
    list.forEach(function (p) { if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h && (!best || p.w * p.h < best.w * best.h)) best = p; });
    return best ? best.id : null;
  }
  // m: { sx, sy, ox, oy, bw, bh }: from view units to CSS px of the box, then cut to the box (bw x bh); off the box: gone
  function place(list, m) {
    var out = [];
    list.forEach(function (p) {
      var x0 = Math.max(0, p.x * m.sx + m.ox), y0 = Math.max(0, p.y * m.sy + m.oy), x1 = Math.min(m.bw, (p.x + p.w) * m.sx + m.ox), y1 = Math.min(m.bh, (p.y + p.h) * m.sy + m.oy);
      if (x1 - x0 >= 1 && y1 - y0 >= 1) out.push({ id: p.id, panel: p.panel, label: p.label, edge: !!p.edge, x: Math.round(x0 * 10) / 10, y: Math.round(y0 * 10) / 10, w: Math.round((x1 - x0) * 10) / 10, h: Math.round((y1 - y0) * 10) / 10 });
    });
    out.forEach(function (p) {   // where a tap answers this part: its middle, else the first free point of a 9 x 9 grid
      p.ax = p.x + p.w / 2; p.ay = p.y + p.h / 2;
      for (var i = 0; i < 81 && hit(out, p.ax, p.ay) !== p.id; i++) { p.ax = p.x + p.w * ((i % 9) + 0.5) / 9; p.ay = p.y + p.h * (Math.floor(i / 9) + 0.5) / 9; }
    });
    return out;
  }

  // ---------- on the page ----------
  function inner(e) { var r = e.getBoundingClientRect(); return { x: r.left + e.clientLeft, y: r.top + e.clientTop, w: e.clientWidth, h: e.clientHeight }; }
  function box(doc) { return document.getElementById(doc && doc.k === "game" ? "gamestage" : "stage"); }
  function map(cv, b, v) { var c = inner(cv); return { sx: c.w / v.w, sy: c.h / v.h, ox: c.x - b.x, oy: c.y - b.y, bw: b.w, bh: b.h }; }
  function teile(doc) {
    var A = root.DailyApp, ed = A && A.ed && A.ed(), el, b, v, list = [];
    doc = doc || (ed && ed.doc);
    if (!doc || !(el = box(doc)) || el.hidden) return [];
    b = inner(el);
    if (doc.k === "game" && root.Game && (v = root.Game.view())) {
      var cv = el.querySelector("canvas"), E = root.DuellEngine;
      if (cv) list = place(flug(v, { PIPE_W: E.PIPE_W, GROUND: E.GROUND }), map(cv, b, v));
    } else if (doc.k === "lauf" && root.LaufUI) {
      v = root.LaufUI.view(doc, el.width, el.height);
      list = place(lauf(v), map(el, b, v));
    } else {
      var wrap = document.getElementById("stagewrap"), dom = [];
      if (wrap) Array.prototype.forEach.call(wrap.querySelectorAll("[data-part][data-panel]"), function (e) {
        var r = e.getBoundingClientRect();
        dom.push({ id: e.getAttribute("data-part"), panel: e.getAttribute("data-panel"), label: e.getAttribute("data-label") || e.getAttribute("data-part"), x: r.left - b.x, y: r.top - b.y, w: r.width, h: r.height });
      });
      list = place(dom, { sx: 1, sy: 1, ox: 0, oy: 0, bw: b.w, bh: b.h });
    }
    return list;
  }
  // What a bubble must leave free, in the same px as teile(): on every drawn card (#stage, render.js credit) the bottom band
  // with the maker's name and the signet "my daily idea". The flying game draws neither.
  function frei(doc) {
    var A = root.DailyApp, ed = A && A.ed && A.ed(), el;
    doc = doc || (ed && ed.doc);
    if (!doc || doc.k === "game" || !(el = box(doc)) || el.hidden || !el.width) return [];
    var c = inner(el), band = c.w * 0.085;   // render.js credit: name and signet sit at H - W * 0.032, W * 0.036 high
    return [{ id: "signet", x: 0, y: c.h - band, w: c.w, h: band }];
  }
  function teilAt(x, y) { return hit(teile(), x, y); }   // measured anew: the demo keeps flying
  return { teile: teile, teilAt: teilAt, frei: frei, TEXT: ["titel", "text"], flug: flug, lauf: lauf, place: place, hit: hit, LABEL: LABEL };
});
