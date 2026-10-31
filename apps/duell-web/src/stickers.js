/* My Daily Idea: stickers on the preview. Tap selects (visible X and grip), drag moves, drop on the bin deletes,
   two fingers or the grip scale and turn, undo reverts the last step. The chrome is DOM above the canvas, so it never ends up in the picture. */
(function (root) {
  "use strict";
  var MIN_Z = 0.5, MAX_Z = 2.5, MAX_R = 3.14, HISTORY = 20, ASPECT = 1.25;   // canvas is 4:5

  // ---------- pure rules (unit-tested) ----------
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  // Topmost sticker under p (0..1 canvas units). minR: smallest hit radius, a finger must always find a small sticker.
  function hit(list, p, minR) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (Math.hypot(list[i].x - p.x, (list[i].y - p.y) * ASPECT) < Math.max(0.1 * list[i].z, minR || 0)) return i;
    }
    return -1;
  }
  function inBox(p, b) { return !!b && p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom; }
  function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  // Sticker s0 follows the change from line a0-b0 to line a1-b1 (two fingers, or centre and grip).
  function transform(s0, a0, b0, a1, b1) {
    var d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1, d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    var turn = Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x);
    return { z: Math.round(clamp(s0.z * d1 / d0, MIN_Z, MAX_Z) * 1000) / 1000, r: Math.round(clamp(wrapAngle(s0.r + turn), -MAX_R, MAX_R) * 1000) / 1000 };
  }
  function snapshot(list) { return JSON.stringify(list || []); }
  function remember(hist, before) { if (!hist.length || hist[hist.length - 1] !== before) hist.push(before); while (hist.length > HISTORY) hist.shift(); return hist; }
  function restore(hist, list) { if (!hist.length) return false; var was = JSON.parse(hist.pop()); list.length = 0; was.forEach(function (s) { list.push(s); }); return true; }
  var api = { hit: hit, inBox: inBox, transform: transform, snapshot: snapshot, remember: remember, restore: restore, MIN_Z: MIN_Z, MAX_Z: MAX_Z, MAX_R: MAX_R };

  // ---------- page part ----------
  // o: { cv, wrap, state: () => editor or null, changed(), onChange(), t(key), sfx(name) }
  api.attach = function (o) {
    var cv = o.cv, ui = document.createElement("div"), ring = document.createElement("div"), mk = function (cls, text) {
      var b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; ui.appendChild(b); return b;
    };
    var bin = document.createElement("div"), x, grip, back;
    ui.id = "skui"; ring.className = "skring"; bin.className = "skbin"; bin.textContent = "🗑"; bin.hidden = true;
    ui.appendChild(ring); ui.appendChild(bin);
    x = mk("skx", "✕"); grip = mk("skgrip", "⤡"); back = mk("skundo", "↶");
    o.wrap.appendChild(ui);

    var fingers = {}, drag = null, pinch = null, turn = null;
    var ed = o.state;
    var list = function () { var e = ed(); return e && e.doc.sk ? e.doc.sk : null; };
    var hist = function () { var e = ed(); if (!e.skHist) e.skHist = []; return e.skHist; };
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
    function centre(s) { var r = cv.getBoundingClientRect(); return { x: r.left + s.x * r.width, y: r.top + s.y * r.height }; }
    function fingerList() { return Object.keys(fingers).map(function (k) { return fingers[k]; }); }
    function done() { o.changed(); o.onChange(); }

    function sync() {
      var l = list(), e = ed(); ui.hidden = !l;
      if (!l) return;
      var r = cv.getBoundingClientRect(), w = o.wrap.getBoundingClientRect();
      ui.style.left = r.left - w.left + "px"; ui.style.top = r.top - w.top + "px"; ui.style.width = r.width + "px"; ui.style.height = r.height + "px";
      var s = l[e.sel], on = !!s && !!r.width;
      ring.hidden = x.hidden = grip.hidden = !on;
      back.hidden = !hist().length;
      if (!on) return;
      var rad = 0.1 * s.z * r.width + 3, cx = s.x * r.width, cy = s.y * r.height, q = Math.SQRT1_2 * rad;
      ring.style.width = ring.style.height = rad * 2 + "px"; ring.style.left = cx - rad + "px"; ring.style.top = cy - rad + "px";
      var place = function (b, px, py) { b.style.left = clamp(px, 0, r.width) + "px"; b.style.top = clamp(py, 0, r.height) + "px"; };
      place(x, cx + q, cy - q); place(grip, cx + q, cy + q);
    }
    function select(i) { var e = ed(); if (e) { e.sel = i; sync(); o.onChange(); } }
    function remove(i, before) {
      var l = list(); if (!l || !l[i]) return;
      remember(hist(), before || snapshot(l)); l.splice(i, 1); ed().sel = -1; o.sfx("thud"); done();
    }

    cv.addEventListener("pointerdown", function (e) {
      var l = list(); if (!l) return;
      fingers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      var two = fingerList();
      if (two.length === 2 && l[ed().sel]) {       // second finger: stop moving, start scaling and turning
        drag = null; bin.hidden = true;
        pinch = { i: ed().sel, s: { z: l[ed().sel].z, r: l[ed().sel].r }, a: two[0], b: two[1], before: snapshot(l) };
        pinch.a = { x: two[0].x, y: two[0].y }; pinch.b = { x: two[1].x, y: two[1].y };
        return;
      }
      if (two.length > 1) return;
      var p = pos(e), i = hit(l, p, 26 / Math.max(1, cv.getBoundingClientRect().width));
      if (i < 0) { select(-1); return; }
      drag = { i: i, sx: e.clientX, sy: e.clientY, moved: false, over: false, before: snapshot(l) };
      select(i); o.sfx("tap");
    });
    cv.addEventListener("pointermove", function (e) {
      if (!fingers[e.pointerId]) return;
      fingers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var l = list(); if (!l) return;
      if (pinch) {
        var two = fingerList(), s = l[pinch.i]; if (two.length < 2 || !s) return;
        var n = transform(pinch.s, pinch.a, pinch.b, two[0], two[1]); s.z = n.z; s.r = n.r; pinch.moved = true; o.changed(); return;
      }
      if (!drag || !l[drag.i]) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;   // a tap with a slightly shaky finger is still a tap
      drag.moved = true; bin.hidden = false;
      var p = pos(e), t = l[drag.i]; t.x = clamp(p.x, 0, 1); t.y = clamp(p.y, 0, 1);
      var r = bin.getBoundingClientRect(), near = { left: r.left - 14, right: r.right + 14, top: r.top - 14, bottom: r.bottom + 14 };
      drag.over = inBox({ x: e.clientX, y: e.clientY }, near); bin.classList.toggle("over", drag.over);
      o.changed();
    });
    function up(e) {
      var cancelled = e.type === "pointercancel";
      delete fingers[e.pointerId];
      if (pinch) { if (fingerList().length < 2) { if (pinch.moved) { remember(hist(), pinch.before); done(); } pinch = null; } return; }
      if (!drag) return;
      var g = drag; drag = null; bin.hidden = true; bin.classList.remove("over");
      var l = list(); if (!l) return;
      if (g.moved && cancelled) { restore([g.before], l); done(); return; }
      if (g.over) { remove(g.i, g.before); return; }
      if (g.moved) { remember(hist(), g.before); done(); }
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);

    x.addEventListener("click", function () { remove(ed().sel); });
    back.addEventListener("click", function () { var l = list(); if (l && restore(hist(), l)) { ed().sel = -1; o.sfx("pop"); done(); } });
    grip.addEventListener("pointerdown", function (e) {
      var l = list(), s = l && l[ed().sel]; if (!s) return;
      e.stopPropagation(); e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      var c = centre(s);
      turn = { s: { z: s.z, r: s.r }, c: c, from: { x: e.clientX, y: e.clientY }, before: snapshot(l), moved: false };
    });
    grip.addEventListener("pointermove", function (e) {
      var l = list(), s = l && l[ed().sel]; if (!turn || !s) return;
      var n = transform(turn.s, turn.c, turn.from, turn.c, { x: e.clientX, y: e.clientY }); s.z = n.z; s.r = n.r; turn.moved = true; o.changed();
    });
    function gripUp() { if (!turn) return; var g = turn; turn = null; if (g.moved) { remember(hist(), g.before); done(); } }
    grip.addEventListener("pointerup", gripUp); grip.addEventListener("pointercancel", gripUp);
    window.addEventListener("resize", sync);

    function labels() { x.setAttribute("aria-label", o.t("skDelete")); grip.setAttribute("aria-label", o.t("skGrip")); back.setAttribute("aria-label", o.t("skUndo")); bin.setAttribute("aria-label", o.t("skBin")); }
    labels();
    return {
      sync: sync, select: select, remove: remove, labels: labels,
      // A step from the panel: everything that changes the list goes through here, so undo always knows about it.
      step: function (fn) { var l = list(); if (!l) return; remember(hist(), snapshot(l)); fn(l); done(); }
    };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Stickers = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
