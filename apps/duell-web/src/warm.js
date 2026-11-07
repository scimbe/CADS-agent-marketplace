/* Feel-good cards: a short warm line for someone, sent in two taps, optionally with their name in front. Whoever gets one
   can send one too, never has to: no counter, no "send it on", nothing that rewards passing it along. The rules run in
   Node (tests); the picture and the few hooks on the calendar sheet only in the page. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var C = node ? require("./core.js") : root.DuellCore;
  var D = node ? require("./daily.js") : root.Daily;

  var MAX_NAME = 14, NAME_RE = /^[\p{L}][\p{L} .'-]*$/u;
  var MOTIFS = ["herz", "blume", "stern", "mond", "klee", "regenbogen", "ballon", "sonne", "pflaster", "tasse", "brief"];

  function list() { return D.IDEAS.filter(function (i) { return !!i.warm; }); }
  // A doc ({i}) or an idea ({id, warm}) -> its motif, or null when it is no feel-good card.
  function motif(x) {
    var i = x && (x.warm ? x : x.i ? D.byId(x.i) : null);
    return i && MOTIFS.indexOf(i.warm) >= 0 ? i.warm : null;
  }
  function is(x) { return !!motif(x); }
  // Only a plain first name: letters, no digits, handles or links, and through the same word filter as every text.
  // "" means no name, null means one that does not go on a card.
  function name(raw) {
    var s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
    if (!s) return "";
    var n = D.cleanInput(s, MAX_NAME);
    return n && n === s && NAME_RE.test(n) ? n : null;
  }
  // "Lea" + "Du bist toll." -> "Lea, du bist toll." English keeps its capital I.
  function named(line, who) {
    var n = name(who);
    if (!n) return line;
    var rest = /^I\b/.test(line) ? line : line.charAt(0).toLowerCase() + line.slice(1);
    return D.cleanInput(n + ", " + rest, 90) || line;
  }
  // Who sent it: the last person in the trail, else the maker.
  function sender(doc) {
    var by = doc && doc.by && doc.by.length ? doc.by[doc.by.length - 1].n : "";
    return name(by || (doc && doc.n)) || "";
  }
  // Another feel-good card, never the one that just arrived.
  function reply(doc, rnd) {
    var pool = list().filter(function (i) { return i.id !== (doc && doc.i); });
    return pool[Math.floor(rnd() * pool.length)];
  }
  // The card offered back: from the card that came (sender, text, idea), never Math.random.
  function answer(doc) { return reply(doc, C.mulberry32(C.hash32("warm|" + (doc.i || "") + "|" + (doc.n || "") + "|" + (doc.x || "")))); }
  function cardFor(idea, who, me, lang) {
    var d = D.docFromIdea(idea, me, lang);
    d.x = named(d.x, who); if (me.nick) d.n = me.nick;
    return D.sanitizeDoc(d);
  }

  var api = { MOTIFS: MOTIFS, MAX_NAME: MAX_NAME, list: list, motif: motif, is: is, name: name, named: named, sender: sender, reply: reply, answer: answer, cardFor: cardFor };
  if (node) { module.exports = api; return; }
  root.Warm = api;

  /* ---------- the picture: warm surface, a cream sheet, the motif as a drawn sticker (no system emoji, so it stays in the export) ---------- */
  var INK = "#3a2a28", SHEET = "#fff6e6";
  function rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function heart(c, s) { c.beginPath(); c.moveTo(0, 30 * s); c.bezierCurveTo(-62 * s, -8 * s, -30 * s, -58 * s, 0, -24 * s); c.bezierCurveTo(30 * s, -58 * s, 62 * s, -8 * s, 0, 30 * s); c.fill(); }
  function star(c, s, n) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, q = (i % 2 ? 18 : 42) * s; c[i ? "lineTo" : "moveTo"](Math.cos(a) * q, Math.sin(a) * q); }
    c.closePath(); c.fill();
  }
  // Each motif on a grid of about -45..45, in colour a on the sticker's colour b.
  var DRAW = {
    herz: function (c, a) { c.fillStyle = a; heart(c, 1.05); },
    blume: function (c, a) { c.fillStyle = a; for (var i = 0; i < 5; i++) { var w = i * 1.2566 - 1.57; c.beginPath(); c.arc(Math.cos(w) * 23, Math.sin(w) * 23, 17, 0, 6.3); c.fill(); } c.fillStyle = SHEET; c.beginPath(); c.arc(0, 0, 13, 0, 6.3); c.fill(); },
    stern: function (c, a) { c.fillStyle = a; c.strokeStyle = a; c.lineWidth = 7; c.lineJoin = "round"; star(c, 1, 5); c.stroke(); },
    mond: function (c, a, b) { c.fillStyle = a; c.beginPath(); c.arc(-4, 0, 36, 0, 6.3); c.fill(); c.fillStyle = b; c.beginPath(); c.arc(12, -12, 30, 0, 6.3); c.fill(); c.fillStyle = a; c.translate(24, 18); star(c, 0.3, 4); },
    klee: function (c) { c.fillStyle = "#5ba868"; [[-15, -15], [15, -15], [-15, 15], [15, 15]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 17, 0, 6.3); c.fill(); }); c.strokeStyle = "#3f7f4c"; c.lineWidth = 6; c.lineCap = "round"; c.beginPath(); c.moveTo(0, 6); c.quadraticCurveTo(10, 30, 26, 42); c.stroke(); },
    regenbogen: function (c) { c.lineWidth = 9; ["#e2574c", "#f7b733", "#5ba868", "#4a90c2"].forEach(function (k, i) { c.strokeStyle = k; c.beginPath(); c.arc(0, 18, 42 - i * 9, Math.PI, 0); c.stroke(); }); },
    ballon: function (c, a) { c.fillStyle = a; c.beginPath(); c.ellipse(0, -12, 27, 33, 0, 0, 6.3); c.fill(); c.beginPath(); c.moveTo(-6, 22); c.lineTo(6, 22); c.lineTo(0, 15); c.fill(); c.strokeStyle = a; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 22); c.bezierCurveTo(-10, 32, 10, 38, 0, 46); c.stroke(); c.fillStyle = "rgba(255,255,255,.55)"; c.beginPath(); c.ellipse(-10, -24, 6, 10, -0.5, 0, 6.3); c.fill(); },
    sonne: function (c, a) { c.fillStyle = a; c.strokeStyle = a; c.lineWidth = 7; c.lineCap = "round"; c.beginPath(); c.arc(0, 0, 21, 0, 6.3); c.fill(); for (var i = 0; i < 10; i++) { var w = i * 0.6283; c.beginPath(); c.moveTo(Math.cos(w) * 30, Math.sin(w) * 30); c.lineTo(Math.cos(w) * 42, Math.sin(w) * 42); c.stroke(); } },
    pflaster: function (c, a) { c.rotate(-0.6); c.fillStyle = a; rr(c, -44, -16, 88, 32, 16); c.fill(); c.fillStyle = SHEET; rr(c, -14, -12, 28, 24, 5); c.fill(); c.fillStyle = a; [[-30, -5], [-30, 5], [30, -5], [30, 5]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 2.5, 0, 6.3); c.fill(); }); },
    tasse: function (c, a) { c.fillStyle = a; c.strokeStyle = a; rr(c, -28, -8, 46, 40, 9); c.fill(); c.lineWidth = 7; c.beginPath(); c.arc(20, 10, 11, -1.4, 1.4); c.stroke(); c.lineWidth = 5; c.lineCap = "round"; [-14, 2].forEach(function (x) { c.beginPath(); c.moveTo(x, -16); c.bezierCurveTo(x - 7, -24, x + 7, -30, x, -40); c.stroke(); }); },
    brief: function (c, a) { c.fillStyle = a; rr(c, -40, -26, 80, 52, 6); c.fill(); c.strokeStyle = SHEET; c.lineWidth = 5; c.lineJoin = "round"; c.beginPath(); c.moveTo(-36, -22); c.lineTo(0, 6); c.lineTo(36, -22); c.stroke(); c.fillStyle = SHEET; c.translate(0, 14); heart(c, 0.25); }
  };
  function textBlock(c, R, text, x, y, w, h) {
    var max = w * 0.19, lines = R.layout(c, text, w, h), low = Math.min.apply(null, lines.map(function (l) { return l.size; }));
    lines.forEach(function (l) { l.size = Math.min(l.size, max, low * 1.35); });     // warm, not loud: no line gets poster-huge
    var total = lines.reduce(function (s, l) { return s + l.size * 1.06; }, 0), yy = y + (h - total) / 2;
    c.textAlign = "center"; c.textBaseline = "alphabetic"; c.fillStyle = INK;
    lines.forEach(function (l) { yy += l.size * 1.06; c.font = "900 " + l.size + "px " + R.FONT; c.fillText(l.t, x + w / 2, yy - l.size * 0.12); });
  }
  function draw(c, W, H, doc) {
    var R = root.Render, a = doc.col[0], b = doc.col[1], m = motif(doc) || MOTIFS[C.hash32(doc.x || "") % MOTIFS.length];
    c.fillStyle = a; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W / 2, H * 0.12, 0, W / 2, H * 0.12, H * 0.8);
    glow.addColorStop(0, "rgba(255,255,255,.32)"); glow.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.save(); c.shadowColor = "rgba(58,42,40,.18)"; c.shadowBlur = W * 0.03; c.shadowOffsetY = W * 0.01;
    c.fillStyle = SHEET; rr(c, W * 0.07, H * 0.17, W * 0.86, H * 0.72, W * 0.04); c.fill(); c.restore();
    // a few small hearts beside the motif, the same for the same line
    var r = C.mulberry32(C.hash32("warm|" + (doc.x || ""))); c.fillStyle = a;
    for (var i = 0; i < 4; i++) { c.save(); c.globalAlpha = 0.75; c.translate(W * (i % 2 ? 0.7 + r() * 0.16 : 0.14 + r() * 0.16), H * (0.22 + r() * 0.06)); c.rotate((r() - 0.5) * 0.8); heart(c, W * (0.0004 + r() * 0.0003)); c.restore(); }
    textBlock(c, R, doc.x || "…", W * 0.14, H * 0.31, W * 0.72, H * 0.55);
    // the sticker: white rim, soft shadow, half over the sheet's edge
    var cx = W / 2, cy = H * 0.17, rad = W * 0.17;
    c.save(); c.shadowColor = "rgba(58,42,40,.22)"; c.shadowBlur = W * 0.02; c.shadowOffsetY = W * 0.008;
    c.fillStyle = "#fff"; c.beginPath(); c.arc(cx, cy, rad, 0, 6.3); c.fill(); c.restore();
    c.fillStyle = b; c.beginPath(); c.arc(cx, cy, rad - W * 0.014, 0, 6.3); c.fill();
    c.save(); c.translate(cx, cy); c.scale(rad / 62, rad / 62); DRAW[m](c, a, b); c.restore();
  }
  root.Render.styles.herz = draw;

  /* ---------- hooks on the calendar sheet (app.js calls these) ---------- */
  var box = null, field = null, warnEl = null;
  function app() { return root.DailyApp; }
  function t(k, o) { return root.Kit.t(k, o); }
  function nameBox() {
    if (box) return box;
    var A = app(); box = A.el("div", "warmto"); box.id = "warmto";
    var lbl = A.el("label", "", t("warm_to")); lbl.htmlFor = "warmname";
    field = A.el("input", "field"); field.id = "warmname"; field.maxLength = MAX_NAME; field.autocomplete = "off";
    warnEl = A.el("span", "warmwarn"); warnEl.setAttribute("aria-live", "polite");
    box.appendChild(lbl); box.appendChild(field); box.appendChild(warnEl);
    var go = document.getElementById("go"); go.parentNode.insertBefore(box, go);
    field.addEventListener("input", function () { var h = A.home(); if (h) h.to = field.value; preview(h); });
    return box;
  }
  // The sheet's picture already shows the name while it is typed; a name the filter keeps out is said so, not dropped silently.
  function preview(h) {
    var n = name(field.value); warnEl.textContent = n === null ? t("filter") : "";
    if (!h || !h.idea) return;
    if (field.value && app().unpic) app().unpic();   // with a name the drawn card shows it again, in place of the picture
    var cv = document.querySelector("#leaf .pvcard");
    if (cv) root.Render.draw(cv, cardFor(h.idea, n || "", app().me(), root.Kit.lang), { me: app().me(), photo: null, peaks: null, x: {} });
  }
  function sheet(h, got, animate) {
    var mine = !!(h && h.idea && !h.doc && is(h.idea)), recv = !!(h && h.doc && got && is(h.doc)), leaf = document.getElementById("leaf");
    nameBox().hidden = !mine;
    leaf.classList.remove("warmin"); leaf.querySelectorAll(".wh").forEach(function (x) { x.remove(); });
    if (mine) {
      box.firstChild.textContent = t("warm_to"); field.placeholder = t("warm_name");
      field.value = h.to || ""; preview(h);
      document.getElementById("go").textContent = t("warm_go");
    }
    if (recv) {
      var who = sender(h.doc), from = document.getElementById("from");
      from.textContent = who ? t("warm_from", { n: who }) : t("warm_fromNone"); from.hidden = false;
      document.getElementById("go").textContent = t("warm_reply"); document.getElementById("wishgo").hidden = true;
      if (animate) {
        leaf.classList.remove("enter"); void leaf.offsetWidth; leaf.classList.add("warmin");
        for (var i = 0; i < 6; i++) { var s = app().el("i", "wh", "♥"); s.setAttribute("aria-hidden", "true"); s.style.setProperty("--i", i); leaf.appendChild(s); }
        setTimeout(function () { leaf.querySelectorAll(".wh").forEach(function (x) { x.remove(); }); }, 2200);
      }
    }
    return mine || recv;
  }
  // true when the tap belongs to a feel-good card: finish it at once, or show another one to send back.
  function start(h, tabName) {
    var A = app(), me = A.me();
    if (h.doc && h.note && is(h.doc) && !tabName) {
      A.sheet({ date: h.date, idea: answer(h.doc), to: sender(h.doc) });
      return true;
    }
    if (!h.idea || h.doc || !is(h.idea)) return false;
    var who = name(field ? field.value : h.to);
    if (who === null) { root.Kit.toast(t("filter")); field.focus(); return true; }
    var doc = cardFor(h.idea, who, me, root.Kit.lang);
    if (tabName) { A.openEditor(doc, { idea: h.idea, tab: tabName }); return true; }
    // "Finish the card" means sending it: the short link is made right away, so the next tap shares.
    A.quick(doc, h.idea).then(function () { var s = document.getElementById("share"); s.click(); s.focus(); });
    return true;
  }
  // Once the display font is there (app.js): the own card's picture again, with the name typed so far. Only the picture:
  // no animation, no class, no text of the sheet changes. true when it drew.
  function redraw(h) {
    if (!field || box.hidden || !h || !h.idea || h.doc || !is(h.idea)) return false;
    preview(h); return true;
  }
  Object.assign(api, { draw: draw, sheet: sheet, start: start, redraw: redraw });
})(typeof globalThis !== "undefined" ? globalThis : this);
