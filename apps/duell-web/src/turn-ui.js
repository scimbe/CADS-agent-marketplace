/* Zug per Link on screen: one renderer for all games, driven by the prompts in turns.js. */
(function () {
"use strict";
var A = window.DailyApp, X = window.DailyModes, Tn = window.Turns, Q = window.Quest, C = window.DuellCore, D = window.Daily, R = window.Render, Kit = window.Kit, t = Kit.t, el = A.el;
function L() { return Tn.T(Kit.lang); }
function say(k, o) { return String(L()[k]).replace(/\{(\w+)\}/g, function (m, n) { return o[n]; }); }
function seed() { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0]; }

/* ---------- picture: own vector shapes, no emoji ---------- */
function shape(c, f, x, y, r, col) {
  c.save(); c.translate(x, y); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = r * 0.28; c.beginPath();
  if (f === "star") { for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath(); c.fill(); }
  else if (f === "heart") { c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.35); c.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.5, -r * 0.1, 0, r * 0.9); c.fill(); }
  else if (f === "bolt") { [[0.2, -1], [-0.55, 0.15], [-0.05, 0.15], [-0.2, 1], [0.55, -0.2], [0.05, -0.2]].forEach(function (p) { c.lineTo(p[0] * r, p[1] * r); }); c.closePath(); c.fill(); }
  else if (f === "ring") { c.arc(0, 0, r * 0.8, 0, 6.3); c.stroke(); }
  else if (f === "drop") { c.moveTo(0, -r); c.bezierCurveTo(r * 1.1, 0, r * 0.7, r, 0, r); c.bezierCurveTo(-r * 0.7, r, -r * 1.1, 0, 0, -r); c.fill(); }
  else { c.arc(0, 0, r, 0, 6.3); c.fill(); c.fillStyle = "rgba(0,0,0,.35)"; [[-0.4, -0.3], [0.35, -0.45], [0.05, 0.1], [-0.3, 0.5], [0.5, 0.4]].forEach(function (p) { c.beginPath(); c.arc(p[0] * r, p[1] * r, r * 0.13, 0, 6.3); c.fill(); }); }
  c.restore();
}
function lines(c, list, W, y, size, col) {
  c.font = "800 " + size + "px system-ui,sans-serif"; c.fillStyle = col; c.textAlign = "center"; c.textBaseline = "top";
  list.forEach(function (s) {
    var cur = "";
    String(s).split(" ").forEach(function (w) { var n = cur ? cur + " " + w : w; if (c.measureText(n).width > W * 0.84 && cur) { c.fillText(cur, W / 2, y); y += size * 1.25; cur = w; } else cur = n; });
    if (cur) { c.fillText(cur, W / 2, y); y += size * 1.25; } y += size * 0.4;
  });
  return y;
}
function title(doc) { var i = doc.i ? D.byId(doc.i) : null, T = i ? (i[Kit.lang] || i.de).t.replace("|", " ") : ""; return doc.t || T || t("turn"); }
R.extra.turn = function (c, W, H, doc) {
  var a = doc.col[0], b = doc.col[1], ink = R.ink(a), st = Tn.state(doc), res = Tn.result(doc, Kit.lang);
  c.fillStyle = a; c.fillRect(0, 0, W, H); R.rays(c, W, H, "rgba(0,0,0,.05)", 0.2);
  shape(c, doc.f, W * 0.84, H * 0.84, W * 0.08, b); shape(c, doc.f, W * 0.14, H * 0.8, W * 0.05, b);
  R.block(c, res ? res.h : title(doc), W * 0.07, H * 0.1, W * 0.86, H * 0.34, ink, null);
  if (res) lines(c, res.lines, W, H * 0.5, W * 0.038, ink);
  else lines(c, [say("picture_turn", { n: st.turn + 1, m: st.total }), L().sealed], W, H * 0.56, W * 0.05, ink);
};

/* ---------- one prompt ---------- */
var draw = {
  slide: function (box, p, set) {
    var v = p.def || p.min || 0, row = el("label", "slide"), r = el("input"), b = el("b", "", v);
    row.appendChild(el("span", "", "")); r.type = "range"; r.min = p.min || 0; r.max = p.max; r.value = v; r.setAttribute("aria-label", L()[p.l]);
    r.addEventListener("input", function () { b.textContent = r.value; set(Number(r.value)); });
    row.appendChild(r); row.appendChild(b); box.appendChild(row); set(v);
  },
  show: function (box, p, set, ctx) {
    p.list(ctx.doc, ctx.m, ctx.now, Kit.lang).forEach(function (s) { box.appendChild(el("p", "qtext", s)); });
    if (p.later) box.appendChild(el("p", "note", L()[p.later]));
    set(0);
  },
  text: function (box, p, set, ctx) {
    var f = el("input", "field"); f.maxLength = p.max; f.autocomplete = "off"; f.setAttribute("aria-label", L()[p.l]);
    f.addEventListener("input", function () { var v = f.value.trim(), ok = Tn.okAnswer(p, v, ctx.doc, Kit.lang, ctx.m, ctx.now); set(ok ? v : null); });
    box.appendChild(f); set(null);
  },
  list: function (box, p, set) {
    var fs = [];
    function up() { var v = fs.map(function (f) { return Q.clean(f.value, p.max); }); set(v.every(Boolean) && new Set(v.map(Q.fold)).size === p.n ? v : null); }
    for (var i = 0; i < p.n; i++) { var f = el("input", "field"); f.maxLength = p.max; f.autocomplete = "off"; f.setAttribute("aria-label", L()[p.l] + " " + (i + 1)); if (p.hints) f.placeholder = p.hints(Kit.lang)[i]; f.addEventListener("input", up); box.appendChild(f); fs.push(f); }
    set(null);
  },
  pick: function (box, p, set, ctx) {
    var on = [], row = el("div", "chips"), items = p.from(ctx.doc, ctx.m, ctx.now, Kit.lang);
    if (p.top) box.appendChild(el("p", "qtext", p.top(ctx.doc, ctx.m, Kit.lang)));
    items.forEach(function (s, i) {
      var b = el("button", "chip", s, function () {
        Kit.sfx.tap(); var at = on.indexOf(i);
        if (at >= 0) on.splice(at, 1); else { if (on.length >= p.n) Array.from(row.children)[on.shift()].classList.remove("on"); on.push(i); }
        b.classList.toggle("on", on.indexOf(i) >= 0); set(on.length === p.n ? on.slice() : null);
      });
      row.appendChild(b);
    });
    box.appendChild(row); set(null);
  },
  rank: function (box, p, set, ctx) {
    var order = [], items = p.from(ctx.doc, ctx.m, ctx.now), row = el("div", "chips");
    items.forEach(function (s, i) {
      var b = el("button", "chip", s, function () {
        Kit.sfx.tap(); var at = order.indexOf(i); if (at >= 0) order.splice(at, 1); else order.push(i);
        Array.from(row.children).forEach(function (x, n) { var w = order.indexOf(n); x.textContent = (w >= 0 ? w + 1 + ". " : "") + items[n]; x.classList.toggle("on", w >= 0); });
        set(order.length === items.length ? order.slice() : null);
      });
      row.appendChild(b);
    });
    box.appendChild(row); set(null);
  },
  // Up to five fingers at once; when nobody moved for three seconds one is chosen.
  touch: function (box, p, set) {
    var pad = el("div", "touchpad"), on = {}, timer = 0;
    function arm() {
      clearTimeout(timer); var ids = Object.keys(on); if (ids.length < 2) return;
      timer = setTimeout(function () { var a = new Uint32Array(1); window.crypto.getRandomValues(a); var who = on[ids[a[0] % ids.length]]; pad.textContent = ""; who.classList.add("win"); pad.appendChild(who); Kit.sfx.win(); Kit.haptic(60); setTimeout(function () { set(0); }, 900); }, 3000);
    }
    pad.addEventListener("pointerdown", function (e) {
      e.preventDefault(); if (Object.keys(on).length >= 5) return;
      var r = pad.getBoundingClientRect(), d = el("i", "touchdot"); d.style.left = e.clientX - r.left + "px"; d.style.top = e.clientY - r.top + "px"; on[e.pointerId] = d; pad.appendChild(d); Kit.sfx.tap(); arm();
    });
    function up(e) { if (on[e.pointerId]) { on[e.pointerId].remove(); delete on[e.pointerId]; arm(); } }
    pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", up);
    box.appendChild(pad); set(null);
  },
  explain: function (box, p, set, ctx) {
    var words = p.list(ctx.doc, Kit.lang), at = 0, hits = 0, w = el("p", "qtext", words[0]), left = el("p", "lbl", String(p.secs)), n = el("p", "lbl", "0"), t0 = Date.now(), row = el("div", "chips");
    var tick = setInterval(function () {
      var s = p.secs - Math.floor((Date.now() - t0) / 1000); left.textContent = String(Math.max(0, s));
      if (s <= 0 || !box.isConnected) { clearInterval(tick); if (box.isConnected) set(hits); }
    }, 250);
    function step(hit) { if (hit) { hits = Math.min(p.max, hits + 1); Kit.sfx.pop(); } at = (at + 1) % words.length; w.textContent = words[at]; n.textContent = String(hits); }
    row.appendChild(el("button", "chip", L().exp_hit, function () { step(true); })); row.appendChild(el("button", "chip", L().exp_skip, function () { step(false); }));
    box.appendChild(left); box.appendChild(w); box.appendChild(row); box.appendChild(n); set(null);
  },
  alloc: function (box, p, set, ctx) {
    var items = p.from(ctx.doc, ctx.m, ctx.now, Kit.lang), vals = p.vals(ctx.doc), bids = items.map(function () { return 0; }), left = el("p", "lbl", "");
    function sum() { return bids.reduce(function (a, b) { return a + b; }, 0); }
    function up() { left.textContent = say("left", { n: p.sum - sum() }); set(bids.slice()); }
    items.forEach(function (s, i) {
      box.appendChild(el("p", "lbl", s + " · " + vals[i]));
      var row = el("div", "chips"), n = el("b", "", "0");
      row.appendChild(el("button", "chip", "−", function () { if (bids[i] >= p.step) { bids[i] -= p.step; n.textContent = bids[i]; up(); Kit.sfx.tap(); } }));
      row.appendChild(n);
      row.appendChild(el("button", "chip", "+", function () { if (sum() + p.step <= p.sum) { bids[i] += p.step; n.textContent = bids[i]; up(); Kit.sfx.tap(); } }));
      box.appendChild(row);
    });
    box.appendChild(left); up();
  }
};
// The next move on the same phone: nobody sees the last one, the phone changes hands first.
function pass(box, ed) {
  var d = ed.next; ed.next = null; ed.doc = d; A.changed();
  if (Tn.state(d).over) { A.tab("Move"); return; }
  box.textContent = ""; box.appendChild(el("p", "qtext", L().hand));
  box.appendChild(el("button", "btn hot", L().hand_go, function () { Kit.sfx.tap(); walk(box, ed); }));
}
// Goes through the turn's prompts one by one; each screen shows only what that step may know.
function walk(box, ed) {
  var st = Tn.state(ed.doc), now = [], i = 0;
  function step() {
    box.textContent = "";
    if (i >= st.prompts.length) { ed.move = now; ed.next = Tn.play(ed.doc, now, Tn.today());
      if (Tn.GAMES[ed.doc.g].local) { pass(box, ed); return; }
      A.changed(); box.appendChild(el("p", "lbl", L().ready)); box.appendChild(el("button", "btn", L().hand_same, function () { pass(box, ed); })); return; }
    var p = st.prompts[i], cur = null, go = el("button", "btn hot", L().next, function () {
      if (cur === null) return; Kit.sfx.pop(); now.push(cur); i++; step();
    });
    if (p.peek) box.appendChild(el("p", "qtext", p.peek(ed.doc, st.moves, now, Kit.lang)));
    if (!p.top || p.w !== "pick" || !p.auto) box.appendChild(el("label", "lbl", L()[p.l].replace(": {q}", "")));
    draw[p.w](box, p, function (v) { cur = v; go.disabled = v === null; if (p.auto && v !== null) go.click(); }, { doc: ed.doc, m: st.moves, now: now });
    box.appendChild(go);
  }
  step();
}
A.TABS.turn = ["Move", "Text", "Color"];
A.PANEL.Move = function (p) {
  var ed = A.ed(), doc = ed.doc, st = Tn.state(doc), left = Tn.gate(doc, Tn.today()), res = Tn.result(doc, Kit.lang);
  if (res) {
    p.appendChild(el("p", "qtext", res.h)); res.lines.forEach(function (s) { p.appendChild(el("p", "note", s)); });
    if (res.copy) { p.appendChild(el("button", "btn hot", L().sor_copy, async function () { if (await Kit.copy(res.copy)) Kit.toast(t("copied")); })); p.appendChild(el("p", "note", res.note)); return; }
    p.appendChild(el("button", "btn hot", L().rematch, function () { var d = Tn.fresh(doc, seed()); A.openEditor(d, { idea: d.i ? D.byId(d.i) : null }); }));
    return;
  }
  if (left) { p.appendChild(el("p", "qtext", say("note_wait", { n: left }))); return; }
  var w = Tn.whole(doc, Kit.lang); if (w) p.appendChild(el("p", "qtext", w));
  walk(p, ed);
};
A.PANEL.Text = (function (old) {
  return function (p) {
    if (A.ed().doc.k !== "turn") { old(p); return; }
    var d = A.ed().doc;
    A.field(p, t("ideaT"), d.t, 40, function (v) { d.t = v; });
    A.field(p, t("ideaS"), d.s, 70, function (v) { d.s = v; });
    A.field(p, L().things, d.w, 14, function (v) { if (v) d.w = v; else delete d.w; });
    var box = el("div", "chips"); Tn.SHAPES.forEach(function (f) { box.appendChild(el("button", "chip" + (d.f === f ? " on" : ""), f, function () { d.f = f; A.changed(); A.tab("Text"); })); });
    p.appendChild(box);
  };
})(A.PANEL.Text);
X.turn = {
  // Every game on one shelf, each with what it is for.
  menu: function () {
    A.shelf(t("turn"), function (b) {
      b.appendChild(el("p", "note", t("turnH")));
      ["streit", "pause", "abend", "geschenk", "raum"].forEach(function (g) {
        b.appendChild(el("label", "lbl", L()["grip_" + g]));
        D.IDEAS.filter(function (i) { return i.kind === "turn" && i.turn.grip === g; }).forEach(function (i) {
        var T = i[Kit.lang] || i.de, m = el("button", "mech", null, function () { Kit.sfx.thud(); A.openEditor(D.docFromIdea(i, A.me(), Kit.lang), { idea: i }); });
        m.appendChild(el("span", "", T.t.replace("|", " ") + " · " + T.s)); b.appendChild(m);
        });
      });
    });
  },
  open: function (ed) { ed.next = null; if (!Tn.state(ed.doc).turn) { ed.doc.seed = seed(); ed.base.seed = ed.doc.seed; ed.doc.q = ""; ed.base.q = ""; } },
  areas: function (ed) { return ed.next ? ["regeln"] : []; },
  footer: function (b, ed) {
    var over = !!Tn.result(ed.doc, Kit.lang), ok = over || !!ed.next;
    b.hidden = ed.doc.g === "sorry" && over;
    b.classList.toggle("wait", !ok); b.textContent = over ? L().result_pic : ed.next ? L().send : L().need;
  },
  main: function (ed) {
    var over = !!Tn.result(ed.doc, Kit.lang);
    if (!over && !ed.next) { Kit.tone(200, 160, 0.1, "square", 0.06); return; }
    Kit.sfx.thud(); A.finish(over ? ed.doc : ed.next);
  },
  label: function (doc) {
    var st = Tn.state(doc), left = Tn.gate(doc, Tn.today());
    if (st.over) return { go: L().go_view, note: L().note_over };
    if (left) return { go: L().go_play, note: say("note_wait", { n: left }) };
    return st.turn ? { go: L().go_play, note: say("note_turn", { n: st.turn + 1, m: st.total }) } : null;
  }
};
})();
