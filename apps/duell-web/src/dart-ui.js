/* Dart on screen (part "dart", rule in src/dart.js): the turn editor's step "dart", the board over the whole screen and the
   card picture with the board and its darts. Aiming takes a finger, a mouse, the arrow keys or the list "Aim at". The power
   is one of 9 steps: holding on the board (pointer) or the space bar / "Start power" lets it swing, letting go / space
   again throws; without any timing the slider sets it step by step and "Throw" throws. Where the dart lands never depends
   on the moment (src/dart.js): the wobbling crosshair only shows the hand, with reduced motion it stands still and a
   dashed ring shows the same spread. Every dart is said for the screen reader ("Triple 20, 60 points"). Look: the
   approved design canvas (ink #17140F, green #1E5631, red #B3321F, cream #FBF5DD). */
(function (root) {
  "use strict";
  var A = root.DailyApp, Tn = root.Turns, M = root.Dart, Kit = root.Kit, R = root.Render, D = root.Daily, Q = root.Quest, el = A.el;
  function L() { return Tn.T(Kit.lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function calm() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function press(b, on) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  var EXT = 1.32, TOUCH_UP = 52, KEEP = 12;
  var P = { ink: "#17140F", green: "#1E5631", red: "#B3321F", cream: "#FBF5DD", wire: "#9b937f" };
  // the two players' darts: the starter's a red flight, the other's (Bert's too) a cream flight with ink stripes
  var FLIGHT = [{ fill: P.red, stripes: false }, { fill: P.cream, stripes: true }];
  var SVG = "http://www.w3.org/2000/svg";
  function svg(paths, size, label) {
    var s = document.createElementNS(SVG, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size); s.setAttribute("height", size);
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round");
    if (label) { s.setAttribute("role", "img"); s.setAttribute("aria-label", label); } else s.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) { var p = document.createElementNS(SVG, "path"); p.setAttribute("d", d); s.appendChild(p); });
    return s;
  }
  var ICON = { close: ["M6 6l12 12M18 6L6 18"], bot: ["M8 4h8M12 4v3", "M5 7h14v11H5z", "M9 12h.01M15 12h.01", "M9 15h6", "M3 11v3M21 11v3"] };
  // a small flight as the players' sign on the score cards: the same shape as on the board, solid or striped
  function sign(p) {
    var s = document.createElementNS(SVG, "svg"); s.setAttribute("viewBox", "0 0 20 20"); s.setAttribute("width", "22"); s.setAttribute("height", "22"); s.setAttribute("aria-hidden", "true");
    var k = document.createElementNS(SVG, "path"); k.setAttribute("d", "M10 2L18 10L10 18L2 10Z"); k.setAttribute("fill", FLIGHT[p].fill); k.setAttribute("stroke", P.ink); k.setAttribute("stroke-width", "2"); s.appendChild(k);
    if (FLIGHT[p].stripes) { var l = document.createElementNS(SVG, "path"); l.setAttribute("d", "M6 10h8M8 7h4M8 13h4"); l.setAttribute("stroke", P.ink); l.setAttribute("stroke-width", "2"); s.appendChild(l); }
    return s;
  }

  var CSS = ".daov{justify-content:flex-start;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);overflow:hidden}" +
    ".dabar{display:flex;align-items:center;gap:8px;width:100%;min-height:48px;padding:2px 8px;flex:none}.dabar h2{margin:0;font:400 22px/1.1 var(--disp);text-transform:uppercase;flex:1;overflow-wrap:anywhere}" +
    ".dabar .ico{display:grid;place-items:center}" +
    ".damain{flex:1;min-height:0;width:100%;max-width:1000px;display:flex;flex-direction:column;gap:10px;padding:0 16px 12px;overflow-y:auto}" +
    ".dapad{flex:none;min-width:0;display:flex;align-items:center;justify-content:center}" +
    ".dacv{display:block;border-radius:50%;touch-action:none;cursor:crosshair}.dacv:focus-visible{outline:4px solid #17140F;outline-offset:4px}" +
    ".datools{flex:none;display:flex;flex-direction:column;gap:8px;text-align:left}.datools>*{flex:none}" +
    ".dascore{display:flex;flex-direction:column;gap:8px;margin:0}.dascore p{margin:0 6px 0 0;padding:6px 12px;min-height:44px;box-sizing:border-box;border:3px solid #17140F;border-radius:20px;background:#FBF5DD;color:#17140F;box-shadow:4px 4px 0 #17140F;font:700 1rem var(--ui);display:flex;align-items:center;gap:8px}" +
    ".dascore p.on{background:#17140F;color:#FBF5DD}" +
    ".dathrows{display:flex;gap:6px;margin:0;padding:0;list-style:none}.dathrows li{flex:1;min-height:44px;display:grid;place-items:center;border:3px dashed #17140F;border-radius:18px;font:800 1.05rem var(--ui);color:#17140F}.dathrows li.hit{border-style:solid;background:#FBF5DD}" +
    ".dasay{margin:0;min-height:1.4em;font:700 1rem var(--ui)}" +
    ".dapow{display:flex;flex-direction:column;gap:4px;margin:0;font-weight:700}.dapow input{width:100%;min-height:44px;margin:0;accent-color:#17140F}" +
    ".darow{display:flex;gap:8px}.darow .btn{flex:1 1 0;min-height:48px;margin:0;padding:4px 8px}" +
    ".daaim{display:flex;flex-direction:column;gap:4px;font-weight:700}.daaim select{min-height:48px;width:100%}" +
    ".dadone{font-size:20px}.dabot{display:flex;gap:8px;align-items:flex-start}.dabot svg{flex:none;margin-top:2px}" +
    ".dasteps{display:flex;flex-direction:column;gap:8px}.damodes{display:flex;flex-wrap:wrap;gap:6px}.damodes .chip{min-height:48px;text-align:left}.damodes .chip small{display:block;font-size:.72rem;font-weight:700}" +
    ".dathumb{width:120px;height:120px;flex:none}.dastate{display:flex;gap:10px;align-items:center;margin:6px 0}.dastate div{display:flex;flex-direction:column;gap:2px}.dastate p{margin:0}" +
    ".dawarn{border:3px solid #17140F;border-radius:18px;background:#FBF5DD;color:#17140F;padding:8px 12px;font-weight:700}" +
    "@media (min-aspect-ratio:1/1){.damain{flex-direction:row;overflow:hidden}.dapad{flex:1 1 0;min-height:0}.datools{width:260px;max-height:100%;overflow-y:auto;padding:0 6px 6px 0}}";
  function css() { if (document.getElementById("dacss")) return; var s = document.createElement("style"); s.id = "dacss"; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- drawing: the board, darts, the crosshair ----------
  function ring(c, cx, cy, r, a0, a1, r0, r1, col) { c.beginPath(); c.arc(cx, cy, r * r1, a0, a1); c.arc(cx, cy, r * r0, a1, a0, true); c.closePath(); c.fillStyle = col; c.fill(); }
  function board(c, cx, cy, r) {
    var D9 = Math.PI / 180, X = M.R;
    c.save();
    c.beginPath(); c.arc(cx, cy, r * EXT, 0, 6.2832); c.fillStyle = P.ink; c.fill();
    for (var i = 0; i < 20; i++) {
      var a0 = (18 * i - 9 - 90) * D9, a1 = (18 * i + 9 - 90) * D9, odd = i % 2;
      ring(c, cx, cy, r, a0, a1, X.D_IN, 1, odd ? P.green : P.red);
      ring(c, cx, cy, r, a0, a1, X.T_OUT, X.D_IN, odd ? P.cream : P.ink);
      ring(c, cx, cy, r, a0, a1, X.T_IN, X.T_OUT, odd ? P.green : P.red);
      ring(c, cx, cy, r, a0, a1, X.OUTER, X.T_IN, odd ? P.cream : P.ink);
    }
    c.beginPath(); c.arc(cx, cy, r * X.OUTER, 0, 6.2832); c.fillStyle = P.green; c.fill();
    c.beginPath(); c.arc(cx, cy, r * X.BULL, 0, 6.2832); c.fillStyle = P.red; c.fill();
    c.strokeStyle = P.wire; c.lineWidth = Math.max(0.6, r * 0.006);
    [1, X.D_IN, X.T_OUT, X.T_IN, X.OUTER, X.BULL].forEach(function (k) { c.beginPath(); c.arc(cx, cy, r * k, 0, 6.2832); c.stroke(); });
    for (var j = 0; j < 20; j++) { var a = (18 * j - 9 - 90) * D9; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * X.OUTER, cy + Math.sin(a) * r * X.OUTER); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    c.fillStyle = P.cream; c.textAlign = "center"; c.textBaseline = "middle"; c.font = "800 " + Math.round(r * 0.15) + "px system-ui, sans-serif";
    M.ORDER.forEach(function (n, k) { var a = (18 * k - 90) * D9; c.fillText(String(n), cx + Math.cos(a) * r * 1.16, cy + Math.sin(a) * r * 1.16); });
    c.restore();
  }
  // a dart stuck at (x, y): tip, barrel, shaft and the player's flight (solid red, or cream with ink stripes)
  function dart(c, x, y, r, p, s, alpha) {
    var Lh = r * 0.2 * s, dx = 0.5, dy = 0.66, f = FLIGHT[p];
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.lineCap = "round";
    c.strokeStyle = "rgba(23,20,15,.45)"; c.lineWidth = r * 0.03 * s; c.beginPath(); c.moveTo(x + r * 0.012, y + r * 0.02); c.lineTo(x + dx * Lh + r * 0.012, y + dy * Lh + r * 0.03); c.stroke();
    c.strokeStyle = "#cfcabb"; c.lineWidth = r * 0.034 * s; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * Lh * 0.5, y + dy * Lh * 0.5); c.stroke();
    c.strokeStyle = P.ink; c.lineWidth = r * 0.016 * s; c.beginPath(); c.moveTo(x + dx * Lh * 0.5, y + dy * Lh * 0.5); c.lineTo(x + dx * Lh, y + dy * Lh); c.stroke();
    var fx = x + dx * Lh, fy = y + dy * Lh, w = r * 0.075 * s;
    c.fillStyle = f.fill; c.strokeStyle = P.ink; c.lineWidth = Math.max(1, r * 0.01);
    c.beginPath(); c.moveTo(fx - dx * w * 0.6, fy - dy * w * 0.6); c.lineTo(fx + dy * w, fy - dx * w); c.lineTo(fx + dx * w * 1.2, fy + dy * w * 1.2); c.lineTo(fx - dy * w, fy + dx * w); c.closePath(); c.fill(); c.stroke();
    if (f.stripes) { c.beginPath(); c.moveTo(fx + dy * w * 0.6, fy - dx * w * 0.6); c.lineTo(fx - dy * w * 0.6, fy + dx * w * 0.6); c.moveTo(fx + dx * w * 0.5 + dy * w * 0.3, fy + dy * w * 0.5 - dx * w * 0.3); c.lineTo(fx + dx * w * 0.5 - dy * w * 0.3, fy + dy * w * 0.5 + dx * w * 0.3); c.stroke(); }
    c.fillStyle = P.ink; c.beginPath(); c.arc(x, y, Math.max(1.2, r * 0.012), 0, 6.2832); c.fill();
    c.restore();
  }
  // a hit as a mark on the picture: the starter's a red dot, the other's a cream square, both outlined in ink
  function mark(c, x, y, s, p) { c.fillStyle = FLIGHT[p].fill; c.strokeStyle = P.ink; c.lineWidth = Math.max(1.5, s * 0.35); c.beginPath(); if (p) c.rect(x - s, y - s, 2 * s, 2 * s); else c.arc(x, y, s, 0, 6.2832); c.fill(); c.stroke(); }
  function cross(c, x, y, r, still) {
    var k = r * 0.07;
    c.save();
    if (still) { c.setLineDash([r * 0.02, r * 0.02]); c.strokeStyle = P.cream; c.lineWidth = Math.max(1.5, r * 0.008); c.beginPath(); c.arc(x, y, r * M.WOB * 1.2, 0, 6.2832); c.stroke(); c.setLineDash([]); }
    [[P.ink, 0.03], [P.cream, 0.014]].forEach(function (s) {
      c.strokeStyle = s[0]; c.lineWidth = Math.max(1.5, r * s[1]);
      c.beginPath(); c.arc(x, y, k * 0.62, 0, 6.2832); c.moveTo(x - k, y); c.lineTo(x - k * 0.25, y); c.moveTo(x + k * 0.25, y); c.lineTo(x + k, y);
      c.moveTo(x, y - k); c.lineTo(x, y - k * 0.25); c.moveTo(x, y + k * 0.25); c.lineTo(x, y + k); c.stroke();
    });
    c.restore();
  }
  // Every dart of a game in order: { h, t (its turn), ti, j, bot, next (Around the Clock: the number after it) }
  function flat(g) {
    var out = [], nx = [1, 1];
    if (g) g.turns.forEach(function (t, ti) { t.d.forEach(function (h, j) { if (h.ok) nx[t.p]++; out.push({ h: h, t: t, ti: ti, j: j, bot: g.bot && t.p === 1, next: nx[t.p] }); }); });
    return out;
  }
  function px(v) { return Math.max(-EXT, Math.min(EXT, v)); }
  // the darts of the turn under way (and, faded, the one before), as on a real board until they are pulled
  function darts(c, cx, cy, r, list, upto) {
    var seen = list.slice(0, upto), cur = seen.length ? seen[seen.length - 1].ti : -1;
    seen.forEach(function (x) { if (x.ti >= cur - 1) dart(c, cx + px(x.h.x) * r, cy + px(x.h.y) * r, r, x.t.p, 1, x.ti === cur ? 1 : 0.4); });
  }

  // ---------- what this phone sent last, per game (seed): a link that comes back has to go on from it ----------
  function sent() { var s = Kit.store.dart; return s && typeof s === "object" && !Array.isArray(s) ? s : {}; }
  function keep(seed, str, names) {
    var s = sent(), k, now = s["s" + seed]; if (now && now.s === str) return;
    delete s["s" + seed]; s["s" + seed] = { s: str, n: names.slice() };
    for (k = Object.keys(s); k.length > KEEP; k.shift()) delete s[k[0]];
    Kit.store.dart = s; Kit.save();
  }
  function mineOf(seed) { var v = sent()["s" + seed]; return v && typeof v.s === "string" ? { s: v.s, n: Array.isArray(v.n) ? v.n : ["", ""] } : null; }
  // every count of a dart game on this phone (step, end, result, picture) goes through Dart.view, which asks this
  M.setOwn(mineOf);
  function myName(other) { return M.myName(A.me().nick, other); }

  // ---------- the layer over the whole screen (like Mal & Rat's) ----------
  var ov = null, hidden = [];
  function layer(title, onClose) {
    shut(); css();
    ov = el("div", "liveov daov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "dah");
    var bar = el("div", "dabar"), x = el("button", "ico", null, function () { Kit.sfx.tap(); shut(); });
    x.appendChild(svg(ICON.close, 24)); x.setAttribute("aria-label", L().da_close); bar.appendChild(x); var h = el("h2", "", title); h.id = "dah"; bar.appendChild(h);
    var main = el("div", "damain"), pad = el("div", "dapad"), tools = el("div", "datools");
    main.appendChild(pad); main.appendChild(tools); ov.appendChild(bar); ov.appendChild(main);
    hidden = Array.prototype.filter.call(document.body.children, function (n) { return !n.inert && n.tagName !== "SCRIPT" && n.id !== "toast"; });
    hidden.forEach(function (n) { n.inert = true; });
    document.body.appendChild(ov);
    document.addEventListener("keydown", esc, true);
    ov.done = onClose;
    return { ov: ov, pad: pad, tools: tools, x: x };
  }
  function esc(e) {
    if (!ov) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (ov.cancel && ov.cancel()) return; shut(); return; }
    if (e.key !== "Tab") return;
    var all = Array.prototype.filter.call(ov.querySelectorAll("button, input, select, canvas[tabindex]"), function (n) { return !n.disabled && n.tabIndex >= 0 && n.getClientRects().length; });
    if (!all.length) return;
    var a = document.activeElement, i = all.indexOf(a), inside = ov.contains(a);
    if (!inside || (e.shiftKey && i === 0) || (!e.shiftKey && i === all.length - 1)) { e.preventDefault(); (e.shiftKey ? all[all.length - 1] : all[0]).focus(); }
  }
  function shut() {
    if (!ov) return;
    var o = ov, f = o.done; ov = null; document.removeEventListener("keydown", esc, true); if (o.stop) o.stop(); o.remove();
    hidden.forEach(function (n) { n.inert = false; }); hidden = [];
    if (f) f();
  }
  window.addEventListener("hashchange", function () { if (ov) ov.done = null; shut(); });

  // ---------- the state of a turn: ed.dart ----------
  function sim(st, ctx) { return M.sim(ctx.doc.seed, st.s); }
  function base(ctx) { var w = M.view(ctx.doc, ctx.m); return w && w.g ? w.g.turns.length : 0; }
  // my turn is over (by link: one turn more than the link had; against Bert: the game is over) and every dart was shown
  function done(st, ctx, g) { g = g || sim(st, ctx); return !!g && !st.foreign && flat(g).length <= st.shown && (st.bot ? g.over : !g.partial && g.turns.length > base(ctx)); }
  function value(st, ctx) { var g = sim(st, ctx); if (!done(st, ctx, g)) return null; keep(ctx.doc.seed, st.s, st.names); return [st.s, M.claimed(g), st.names.slice()]; }
  function line(g, st, p, me) { return M.stand(g, p, Kit.lang, st.names, me); }

  // ---------- throwing ----------
  function throwLayer(st, ctx, back) {
    var X = L(), seed = ctx.doc.seed, mine = base(ctx) % 2, g0 = sim(st, ctx);
    var o = layer("Dart · " + M.modeName(st.mode, Kit.lang), back), cv = el("canvas", "dacv"), help = el("p", "note", X.da_board_help);
    help.id = "dahelp"; cv.tabIndex = 0; cv.setAttribute("role", "application"); cv.setAttribute("aria-label", X.da_board); cv.setAttribute("aria-describedby", "dahelp");
    o.pad.appendChild(cv);
    var score = el("div", "dascore"), throws = el("ol", "dathrows"), sayp = el("p", "dasay"), aimBox = el("label", "daaim"), sel = el("select", "field");
    var pow = el("label", "dapow"), lvl = el("input"), row = el("div", "darow"), pb = el("button", "btn", X.da_power_go), tb = el("button", "btn hot", X.da_throw), fin = el("button", "btn hot dadone", X.da_done, function () { Kit.sfx.pop(); shut(); });
    sayp.id = "dasay"; sayp.setAttribute("role", "status"); sayp.setAttribute("aria-live", "polite"); sel.id = "daaim"; pb.id = "dapw"; tb.id = "dathrow"; lvl.id = "dalv";
    lvl.type = "range"; lvl.min = 0; lvl.max = M.LEVELS - 1; lvl.step = 1;
    pow.appendChild(el("span", "", X.da_power + " · " + X.da_power_mid)); pow.appendChild(lvl);
    row.appendChild(pb); row.appendChild(tb);
    aimBox.appendChild(el("span", "", X.da_aim)); aimBox.appendChild(sel);
    var opts = [["", X.da_aim_free], ["50", X.da_s_50], ["25", X.da_s_25]];
    for (var n = 20; n >= 1; n--) opts.push(["t" + n, fmt(X.da_s_3, { n: n })], ["d" + n, fmt(X.da_s_2, { n: n })], ["s" + n, fmt(X.da_s_1, { n: n })]);
    opts.forEach(function (x) { var op = document.createElement("option"); op.value = x[0]; op.textContent = x[1]; sel.appendChild(op); });
    fin.hidden = true;
    // the power and its buttons first: in sight without scrolling, also at 200 %
    [sayp, pow, row, aimBox, score, throws, help, fin].forEach(function (x) { o.tools.appendChild(x); });
    var aim = st.aim || [0, -0.62], charge = null, fly = null, timer = 0, raf = 0, t0 = performance.now(), hand = null;
    var w0 = M.view(ctx.doc, ctx.m); st.shown = Math.max(st.shown || 0, flat(w0 && w0.g).length);
    var memo = { s: null, list: [] };
    function all() { if (memo.s !== st.s) { memo.s = st.s; memo.list = flat(sim(st, ctx)); } return memo.list; }
    function can() { return !fly && !timer && !done(st, ctx) && !st.foreign && !(st.bot && all().length > st.shown); }
    function say(s) { sayp.textContent = s; }
    function level(v) { lvl.value = String(v); lvl.setAttribute("aria-valuetext", v === M.MID ? X.da_lv_mid : fmt(X.da_lv, { n: v + 1 })); }
    function table() {
      var g = sim(st, ctx) || g0, list = all().slice(0, st.shown), last = list.length ? list[list.length - 1] : null, nx = all()[st.shown], cur = nx ? nx.t.p : g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2;
      score.textContent = "";
      // my side always first, with "(du)" (Dart.who); each side keeps its sign (solid red / striped cream)
      (mine === 1 ? [1, 0] : [0, 1]).forEach(function (p) { var r = el("p", p === cur && !g.over ? "on" : ""); r.appendChild(sign(p)); r.appendChild(document.createTextNode(line(g, st, p, mine))); score.appendChild(r); });
      throws.textContent = ""; throws.setAttribute("aria-label", X.da_last);
      var ti = last ? last.ti : -1, inTurn = list.filter(function (x) { return x.ti === ti; });
      for (var i = 0; i < 3; i++) { var x = inTurn[i], li = el("li", x ? "hit" : "", x ? M.short(x.h, Kit.lang) : String(i + 1)); li.setAttribute("aria-label", x ? M.field(x.h, Kit.lang) : fmt(X.da_dart_of, { n: i + 1 })); throws.appendChild(li); }
      var ok = can(); sel.disabled = pb.disabled = tb.disabled = lvl.disabled = !ok; fin.hidden = !done(st, ctx);
      pb.textContent = charge ? X.da_power_stop : X.da_power_go;
      o.ov.dataset.state = done(st, ctx) ? "done" : fly ? "fly" : timer ? "bot" : "aim"; cv.dataset.n = String(st.shown);
    }
    // a new dart: the power bar starts on this dart's own step (from the seed), never on the middle by itself
    function ready() { t0 = performance.now(); hand = M.hand(seed, (sim(st, ctx) || g0).k); level(hand.lv); }
    function tnow(now) { return (now - t0) / M.STEP_MS; }
    function swing(now) { return M.swing(charge.from, now - charge.at); }
    function start(hold, id) { charge = { hold: hold, id: id, at: performance.now(), from: +lvl.value }; Kit.sfx.tap(); table(); }
    function throwNow(p, slider) {
      if (!can()) return;
      charge = null; st.aim = aim.slice(); st.s += M.enc(M.dart(aim[0], aim[1], p, slider));
      advance();
    }
    function release() {
      if (!charge) return;
      var now = performance.now();
      if (now - charge.at < M.QUICK) { charge = null; level(+lvl.value); say(X.da_quick); table(); return; }   // a tap is no throw
      var p = swing(now); level(p); throwNow(p);
    }
    // the next dart to show: mine flies at once, Bert's after a short look; then my next dart, or the end of the turn
    function advance() {
      var g = sim(st, ctx), list = all();
      if (st.shown < list.length) {
        var x = list[st.shown];
        if (x.bot) { if (x.j === 0) say(X.da_bert_go + " " + M.quip(seed, x.ti, Kit.lang)); timer = setTimeout(function () { timer = 0; land(x, advance); }, calm() ? 350 : 750); table(); return; }
        land(x, advance); return;
      }
      table();
      if (done(st, ctx, g)) {
        var t = g.turns.filter(function (z) { return z.p === (st.bot ? 0 : mine); }).pop();
        if (t && !st.bot) say(fmt(X.da_turn_done, { s: M.turnLine(t, g, Kit.lang) }));
        else if (g.over) say(Tn.GAMES.dart.result(ctx.doc, [[[st.s, 0, st.names]]], Kit.lang).h);
        if (g.over) Kit.sfx.win();
        ctx.set(value(st, ctx)); fin.hidden = false; fin.focus();
      } else ready();
    }
    function land(x, then) {
      var dur = calm() ? 0 : 320; fly = { x: x, at: performance.now(), dur: dur }; table();
      setTimeout(function () {
        fly = null; st.shown++;
        var h = x.h, s = (x.bot ? "Bert: " : "") + M.spoken(h, Kit.lang), last = x.j === x.t.d.length - 1;
        if (x.t.bust && last) s += " " + fmt(X.da_bust, { n: x.t.from });
        else if (x.t.out && last) s += " " + X.da_out;
        else if (h.ok && x.next <= 20) s += " " + fmt(X.da_atc_hit, { n: x.next });
        say(s);
        if (h.n) { Kit.tone(1500, 380, 0.035, "square", 0.05); Kit.tone(170, 70, 0.1, "sine", 0.22); Kit.haptic(12); } else Kit.sfx.thud();
        then();
      }, dur);
    }
    // ---------- the frame ----------
    function frame(now) {
      raf = 0; if (!cv.isConnected) return;
      var c = cv.getContext("2d"), W = cv.width, r = W / 2 / EXT, cx = W / 2, cy = W / 2;
      c.clearRect(0, 0, W, W); board(c, cx, cy, r);
      darts(c, cx, cy, r, all(), st.shown);
      if (fly) {
        var f = fly.dur ? Math.min(1, (now - fly.at) / fly.dur) : 1, e = 1 - (1 - f) * (1 - f), x = fly.x.h, tx = cx + px(x.x) * r, ty = cy + px(x.y) * r;
        dart(c, cx + (tx - cx) * e, W * 1.05 + (ty - W * 1.05) * e, r, fly.x.t.p, 2.4 - 1.4 * e, 1);
      } else if (can()) {
        var still = calm(), w = hand && !still ? M.wobble(hand, tnow(now) % M.STEPS) : [0, 0];
        cross(c, cx + (aim[0] + w[0]) * r, cy + (aim[1] + w[1]) * r, r, still);
      }
      if (charge) { var p = swing(now); if (+lvl.value !== p) level(p); }
      raf = requestAnimationFrame(frame);
    }
    function fit() {
      if (!cv.isConnected) { window.removeEventListener("resize", fit); return; }
      // side by side (wide screens): as large as the space beside the tools; one above the other: the width, leaving a
      // strip of the tools in sight below (the rest scrolls)
      var wide = matchMedia("(min-aspect-ratio:1/1)").matches, s = Math.max(160, Math.floor(Math.min(o.pad.clientWidth, wide ? o.pad.clientHeight : window.innerHeight - 150))), k = Math.min(3, window.devicePixelRatio || 1);
      cv.style.width = cv.style.height = s + "px"; cv.width = cv.height = Math.round(s * k);
    }
    window.addEventListener("resize", fit); fit();
    // ---------- input ----------
    function pos(e) { var b = cv.getBoundingClientRect(), k = b.width / 2 / EXT, up = e.pointerType === "touch" ? TOUCH_UP : 0; return [px((e.clientX - b.left - b.width / 2) / k), px((e.clientY - up - b.top - b.height / 2) / k)]; }
    function setAim(a, keep) { aim = a; if (!keep) sel.value = ""; }
    cv.addEventListener("pointermove", function (e) { if (!can()) return; if (e.pointerType === "mouse" || (charge && charge.hold && charge.id === e.pointerId)) setAim(pos(e)); });
    cv.addEventListener("pointerdown", function (e) {
      if (!can() || charge || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      setAim(pos(e)); start(true, e.pointerId);
    });
    cv.addEventListener("pointerup", function (e) { if (charge && charge.hold && charge.id === e.pointerId) { setAim(pos(e)); release(); } });
    cv.addEventListener("pointercancel", function (e) { if (charge && charge.hold && charge.id === e.pointerId) { charge = null; table(); } });
    function toggle() { if (!can()) return; if (!charge) start(false); else if (!charge.hold) release(); }
    cv.addEventListener("keydown", function (e) {
      var k = e.key, step = e.shiftKey ? 0.1 : 0.02, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (mv) { e.preventDefault(); if (can()) setAim([px(aim[0] + mv[0]), px(aim[1] + mv[1])]); return; }
      if (k === " " || k === "Enter") { e.preventDefault(); if (!e.repeat) toggle(); }
    });
    pb.addEventListener("click", toggle);
    tb.addEventListener("click", function () { if (charge) { charge = null; } throwNow(+lvl.value, true); });   // no timing: the step on the slider, shaken by the seed (Dart.shake)
    lvl.addEventListener("input", function () { if (charge) charge = null; level(+lvl.value); table(); });
    sel.addEventListener("change", function () {
      var v = sel.value; if (!v) return;
      var c = v === "50" ? M.centre(25, "b") : v === "25" ? M.centre(25, "o") : M.centre(+v.slice(1), v[0]);
      setAim(c, true); Kit.sfx.tap();
    });
    o.ov.cancel = function () { if (!charge) return false; charge = null; level(+lvl.value); table(); return true; };   // Escape first drops a swinging power
    o.ov.stop = function () { if (raf) cancelAnimationFrame(raf); clearTimeout(timer); timer = 0; charge = null; };
    ready(); table();
    var pend = all().length > st.shown;
    if (pend) advance(); else if (done(st, ctx)) { fin.hidden = false; say(X.da_game_done); }
    else { var gs = sim(st, ctx) || g0; say(fmt(X.da_turn_of, { p: M.who(gs, gs.partial ? gs.turns[gs.turns.length - 1].p : gs.turns.length % 2, Kit.lang, st.names, mine) })); }
    raf = requestAnimationFrame(frame);
    (fin.hidden ? cv : fin).focus();
  }

  // ---------- the step in the turn editor ----------
  root.Turn2.add("widget", "dart", function (box, p, set, ctx) {
    css();
    var X = L(), ed = ctx.ed, seed = ed.doc.seed, w = M.view(ed.doc, ctx.m), key = seed + "|" + (w ? w.v[0] + (w.foreign ? "|f" : "") : "");
    // a link back has to go on from what this phone sent last; if not (Dart.view), my own last throw counts and nothing is thrown here
    var prev = w && !w.foreign ? w.v : null, st = ed.dart && ed.dart.key === key ? ed.dart : null;
    if (!st) {
      st = ed.dart = { key: key, mode: w ? w.v[0][0] : "a", bot: w ? w.v[0][1] === "b" : false, s: w ? w.v[0] : M.head("a", false), shown: 0, foreign: !!(w && w.foreign), names: w ? w.v[2].slice() : ["", ""] };
      if (!st.foreign) { var me0 = base(ctx) % 2; st.names[me0] = st.bot ? "" : myName(st.names[1 - me0]); }
    }
    ctx.set = set;
    function fresh() { return st.s.length <= 2; }
    function render(focus) {
      box.textContent = "";
      if (st.foreign) { var w = el("p", "dawarn", X.da_foreign); w.setAttribute("role", "alert"); box.appendChild(w); }
      if (!prev && fresh()) {
        var steps = el("div", "dasteps"), modes = el("div", "damodes"), opp = el("div", "damodes");
        modes.setAttribute("role", "group"); modes.setAttribute("aria-label", X.da_mode_h); opp.setAttribute("role", "group"); opp.setAttribute("aria-label", X.da_opp_h);
        M.MODES.forEach(function (m) {
          var b = el("button", "chip", null, function () { Kit.sfx.tap(); st.mode = m; st.s = M.head(st.mode, st.bot); render(); box.querySelector(".damodes .chip.on").focus(); });
          b.appendChild(document.createTextNode(M.modeName(m, Kit.lang))); b.appendChild(el("small", "", X["da_mi_" + m])); press(b, st.mode === m); modes.appendChild(b);
        });
        [[false, X.da_o_l], [true, X.da_o_b]].forEach(function (x) {
          var b = el("button", "chip", x[1], function () { Kit.sfx.tap(); st.bot = x[0]; st.s = M.head(st.mode, st.bot); st.names = ["", ""]; st.names[0] = st.bot ? "" : myName(""); render(); opp.querySelector(".chip.on").focus(); });
          press(b, st.bot === x[0]); opp.appendChild(b);
        });
        steps.appendChild(el("h4", "lbl", X.da_mode_h)); steps.appendChild(modes); steps.appendChild(el("h4", "lbl", X.da_opp_h)); steps.appendChild(opp);
        if (st.bot) { var bn = el("p", "note dabot"); bn.appendChild(svg(ICON.bot, 22)); bn.appendChild(el("span", "", X.da_bot_note)); steps.appendChild(bn); }
        box.appendChild(steps);
      }
      // me: the one who throws here; on a link that is not counted, the one who threw my own last turn
      var g = M.sim(seed, st.s), me = st.foreign && g && g.turns.length ? g.turns[g.turns.length - 1].p : base(ctx) % 2, seen = Math.max(st.shown, prev ? flat(M.sim(seed, prev[0])).length : flat(g).length), state = el("div", "dastate"), th = el("canvas", "dathumb"), info = el("div");
      th.width = th.height = 240; th.setAttribute("aria-hidden", "true");
      var c = th.getContext("2d"), r = 120 / EXT; board(c, 120, 120, r); darts(c, 120, 120, r, flat(g), seen);
      state.appendChild(th); state.appendChild(info);
      if (g && g.turns.length) {
        info.appendChild(el("p", "note", M.head1(g, Kit.lang)));
        (me === 1 ? [1, 0] : [0, 1]).forEach(function (q) { info.appendChild(el("p", "note", line(g, st, q, me))); });
        var list = flat(g).slice(0, seen), lt = list.length ? list[list.length - 1].t : null;
        if (lt) info.appendChild(el("p", "note", M.who(g, lt.p, Kit.lang, st.names, me) + ": " + M.turnLine(lt, g, Kit.lang)));
      } else info.appendChild(el("p", "note", X.da_you));
      box.appendChild(state);
      if (prev) { var pg = M.sim(seed, prev[0]), f = pg && M.fixed(prev, pg); if (f) { var fx = el("p", "note", fmt(X.da_fixed, f)); fx.setAttribute("role", "status"); box.appendChild(fx); } }
      if (st.foreign) { set(null); return; }
      var fin = done(st, ctx), go = el("button", fin ? "btn" : "btn hot", X[fin ? "da_view" : fresh() || (g && g.turns.length === base(ctx)) ? "da_open" : "da_open_more"], function () {
        Kit.sfx.thud(); throwLayer(st, ctx, function () { render(true); });
      });
      box.appendChild(go);
      if (fin) box.appendChild(el("p", "note", st.bot ? X.da_bot_done : X.da_send_note));
      if (focus) go.focus();
      set(value(st, ctx));
    }
    render(false);
  });
  // The main button against Bert shows the result picture, by link it sends the throw.
  Object.defineProperty(M.game.words, "send", { get: function () { var e = A.ed(); return e && e.dart && e.dart.bot ? "da_send_bot" : "da_send"; } });

  // ---------- the card picture: the board with the darts, the standing or the result ----------
  M.game.pic = function (c, W, H, doc) {
    var ed = A.ed(), d = ed && ed.doc === doc && ed.next ? ed.next : doc;   // in the editor: the turn as it will go out
    var a = doc.col[0], ink = R.ink(a), res = Tn.result(d, Kit.lang), w = M.view(d, Tn.moves(d)), v = w && w.v;   // what this phone counts (Dart.view)
    var g = w ? w.g : null, i0 = doc.i ? D.byId(doc.i) : null, title = doc.t || (i0 ? D.plainTitle((i0[Kit.lang] || i0.de).t) : "Dart");
    c.fillStyle = a; c.fillRect(0, 0, W, H); R.rays(c, W, H, "rgba(0,0,0,.05)", 0.2);
    R.block(c, res ? res.h : title, W * 0.07, H * 0.03, W * 0.86, H * 0.17, ink, null);
    // the board on a cream card with a hard ink shadow, like the design's cards
    var r = W * 0.27, cx = W / 2, cy = H * 0.51, k = r * EXT + W * 0.03, rr = W * 0.04;
    c.fillStyle = P.ink; c.beginPath(); c.roundRect ? c.roundRect(cx - k + W * 0.012, cy - k + W * 0.012, 2 * k, 2 * k, rr) : c.rect(cx - k + W * 0.012, cy - k + W * 0.012, 2 * k, 2 * k); c.fill();
    c.fillStyle = P.cream; c.strokeStyle = P.ink; c.lineWidth = W * 0.005; c.beginPath(); c.roundRect ? c.roundRect(cx - k, cy - k, 2 * k, 2 * k, rr) : c.rect(cx - k, cy - k, 2 * k, 2 * k); c.fill(); c.stroke();
    board(c, cx, cy, r);
    var list = flat(g);
    // every dart of the game as a mark (the starter's a red dot, the other's a cream square), the last turns as darts
    list.forEach(function (x) { mark(c, cx + px(x.h.x) * r, cy + px(x.h.y) * r, W * 0.0065, x.t.p); });
    darts(c, cx, cy, r, list, list.length);
    var lines = res ? res.lines : g ? Tn.face(d, Kit.lang) || [] : [doc.s || (i0 ? (i0[Kit.lang] || i0.de).s : ""), L().da_you];
    if (w && w.foreign) lines = [lines[0], lines[1], L().da_foreign];   // the note always in the picture
    c.font = "800 " + Math.round(W * 0.032) + "px system-ui, sans-serif"; c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "top";
    lines.slice(0, 3).forEach(function (s, i) { var t = String(s); while (t.length > 4 && c.measureText(t).width > W * 0.88) t = t.slice(0, -2) + "…"; c.fillText(t, W / 2, H * 0.84 + i * W * 0.041); });
    return ink;
  };
  root.DartUI = { board: board, dart: dart, flat: flat };
})(window);
