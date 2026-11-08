/* Dart on screen (part "dart", rule in src/dart.js): the turn editor's step "dart", the board over the whole screen and the
   card picture with the board and its darts. Aiming takes a finger, a mouse, the arrow keys or the list "Aim at"; the power
   comes from holding (pointer) or from the space bar / the power button, which start it and stop it again (keyboard and
   switch, no clock). Every dart is said for the screen reader ("Triple 20, 60 points"). With reduced motion the crosshair
   stands still (a dashed ring shows how far the hand drifts) and the darts land without flying. */
(function (root) {
  "use strict";
  var A = root.DailyApp, Tn = root.Turns, M = root.Dart, C = root.DuellCore, Kit = root.Kit, R = root.Render, D = root.Daily, el = A.el;
  function L() { return Tn.T(Kit.lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function calm() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function press(b, on) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  var EXT = 1.32, HOLD_MS = 1400, SWING_MS = 1800, TOUCH_UP = 52, COL = ["#ffd000", "#18b4ff"];
  var BOARD = { black: "#1d1a16", cream: "#f1e4c3", red: "#c8262c", green: "#16804a", rim: "#121212", wire: "#a7a29a", num: "#f7f0de" };

  var CSS = ".daov{justify-content:flex-start;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);overflow:hidden}" +
    ".dabar{display:flex;align-items:center;gap:8px;width:100%;min-height:52px;padding:4px 8px;flex:none}.dabar h2{margin:0;font:400 24px/1.1 var(--disp);text-transform:uppercase;flex:1;overflow-wrap:anywhere}" +
    ".damain{flex:1;min-height:0;width:100%;max-width:1000px;display:flex;flex-direction:column;gap:10px;padding:0 16px 12px;overflow-y:auto}" +
    ".dapad{flex:none;min-width:0;display:flex;align-items:center;justify-content:center}" +
    ".dacv{display:block;border-radius:50%;touch-action:none;cursor:crosshair}.dacv:focus-visible{outline:4px solid var(--ink);outline-offset:4px}" +
    ".datools{flex:none;display:flex;flex-direction:column;gap:8px;text-align:left}.datools>*{flex:none}" +
    ".dascore{display:flex;flex-direction:column;gap:4px;margin:0}.dascore p{margin:0;padding:6px 10px;border:3px solid var(--ink);border-radius:6px;font:800 1rem var(--ui);display:flex;align-items:center;gap:8px}" +
    ".dascore p i{width:16px;height:16px;border-radius:50%;border:2px solid #111;flex:none}.dascore p.on{background:var(--ink);color:var(--bg,#fff)}" +
    ".dathrows{display:flex;gap:6px;margin:0;padding:0;list-style:none}.dathrows li{flex:1;min-height:44px;display:grid;place-items:center;border:3px dashed var(--ink);border-radius:6px;font:900 1.05rem var(--ui)}.dathrows li.hit{border-style:solid}" +
    ".dasay{margin:0;min-height:1.4em;font:800 1rem var(--ui)}" +
    ".daaim{display:flex;flex-direction:column;gap:4px;font-weight:800}.daaim select{min-height:48px;width:100%}" +
    ".dameter{position:relative;height:22px;border:3px solid var(--ink);border-radius:6px;background:#fff;overflow:hidden}.dameter i{display:block;height:100%;width:0;background:var(--ink)}" +
    ".dameter b{position:absolute;top:0;bottom:0;left:44%;width:12%;border-left:2px solid #c8262c;border-right:2px solid #c8262c;background:rgba(22,128,74,.25)}" +
    ".dapow{font-weight:800;margin:0}.datools .btn{min-height:48px}.dadone{font-size:20px}" +
    ".dasteps{display:flex;flex-direction:column;gap:8px}.damodes{display:flex;flex-wrap:wrap;gap:6px}.damodes .chip{min-height:48px;text-align:left}.damodes .chip small{display:block;font-size:.72rem;font-weight:700}" +
    ".dathumb{width:120px;height:120px;flex:none}.dastate{display:flex;gap:10px;align-items:center;margin:6px 0}.dastate div{display:flex;flex-direction:column;gap:2px}.dastate p{margin:0}" +
    "@media (min-aspect-ratio:1/1){.damain{flex-direction:row;overflow:hidden}.dapad{flex:1 1 0;min-height:0}.datools{width:250px;max-height:100%;overflow-y:auto;padding-bottom:4px}}";
  function css() { if (document.getElementById("dacss")) return; var s = document.createElement("style"); s.id = "dacss"; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- drawing: the board, darts, the crosshair ----------
  // board units (1 = outer edge of the double ring) -> canvas: centre cx, cy, radius r
  function ring(c, cx, cy, r, a0, a1, r0, r1, col) { c.beginPath(); c.arc(cx, cy, r * r1, a0, a1); c.arc(cx, cy, r * r0, a1, a0, true); c.closePath(); c.fillStyle = col; c.fill(); }
  function board(c, cx, cy, r) {
    var P = Math.PI / 180, B = BOARD, X = M.R;
    c.save();
    c.beginPath(); c.arc(cx, cy, r * EXT, 0, 6.2832); c.fillStyle = B.rim; c.fill();
    c.lineWidth = Math.max(1, r * 0.012); c.strokeStyle = "#3a3632"; c.beginPath(); c.arc(cx, cy, r * (EXT - 0.012), 0, 6.2832); c.stroke();
    for (var i = 0; i < 20; i++) {
      var a0 = (18 * i - 9 - 90) * P, a1 = (18 * i + 9 - 90) * P, odd = i % 2;
      ring(c, cx, cy, r, a0, a1, X.D_IN, 1, odd ? B.green : B.red);
      ring(c, cx, cy, r, a0, a1, X.T_OUT, X.D_IN, odd ? B.cream : B.black);
      ring(c, cx, cy, r, a0, a1, X.T_IN, X.T_OUT, odd ? B.green : B.red);
      ring(c, cx, cy, r, a0, a1, X.OUTER, X.T_IN, odd ? B.cream : B.black);
    }
    c.beginPath(); c.arc(cx, cy, r * X.OUTER, 0, 6.2832); c.fillStyle = B.green; c.fill();
    c.beginPath(); c.arc(cx, cy, r * X.BULL, 0, 6.2832); c.fillStyle = B.red; c.fill();
    // the wires
    c.strokeStyle = B.wire; c.lineWidth = Math.max(0.6, r * 0.006);
    [1, X.D_IN, X.T_OUT, X.T_IN, X.OUTER, X.BULL].forEach(function (k) { c.beginPath(); c.arc(cx, cy, r * k, 0, 6.2832); c.stroke(); });
    for (var j = 0; j < 20; j++) { var a = (18 * j - 9 - 90) * P; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * X.OUTER, cy + Math.sin(a) * r * X.OUTER); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke(); }
    // the numbers on the ring outside
    c.fillStyle = B.num; c.textAlign = "center"; c.textBaseline = "middle"; c.font = "800 " + Math.round(r * 0.15) + "px system-ui, sans-serif";
    M.ORDER.forEach(function (n, k) { var a = (18 * k - 90) * P; c.fillText(String(n), cx + Math.cos(a) * r * 1.16, cy + Math.sin(a) * r * 1.16); });
    c.restore();
  }
  // a dart stuck in the board at (x, y): tip, barrel, shaft and flight in the player's colour; s is the size, 1 when stuck
  function dart(c, x, y, r, col, s, alpha) {
    var Lh = r * 0.2 * s, dx = 0.5, dy = 0.66;
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.lineCap = "round";
    c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = r * 0.03 * s; c.beginPath(); c.moveTo(x + r * 0.012, y + r * 0.02); c.lineTo(x + dx * Lh + r * 0.012, y + dy * Lh + r * 0.03); c.stroke();
    c.strokeStyle = "#cfd3d6"; c.lineWidth = r * 0.034 * s; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * Lh * 0.5, y + dy * Lh * 0.5); c.stroke();
    c.strokeStyle = "#111"; c.lineWidth = r * 0.016 * s; c.beginPath(); c.moveTo(x + dx * Lh * 0.5, y + dy * Lh * 0.5); c.lineTo(x + dx * Lh, y + dy * Lh); c.stroke();
    var fx = x + dx * Lh, fy = y + dy * Lh, w = r * 0.07 * s;
    c.fillStyle = col; c.strokeStyle = "#111"; c.lineWidth = Math.max(1, r * 0.008);
    c.beginPath(); c.moveTo(fx - dx * w * 0.6, fy - dy * w * 0.6); c.lineTo(fx + dy * w, fy - dx * w); c.lineTo(fx + dx * w * 1.2, fy + dy * w * 1.2); c.lineTo(fx - dy * w, fy + dx * w); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#111"; c.beginPath(); c.arc(x, y, Math.max(1.2, r * 0.012), 0, 6.2832); c.fill();
    c.restore();
  }
  function cross(c, x, y, r, still) {
    var k = r * 0.07;
    c.save();
    if (still) { c.setLineDash([r * 0.02, r * 0.02]); c.strokeStyle = "#fff"; c.lineWidth = Math.max(1.5, r * 0.008); c.beginPath(); c.arc(x, y, r * M.WOB * 1.1, 0, 6.2832); c.stroke(); c.setLineDash([]); }
    [["#111", 0.03], ["#fff", 0.014]].forEach(function (s) {
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
  // the darts of the turn under way (and, faded, the one before), as on a real board until they are pulled
  function darts(c, cx, cy, r, list, upto) {
    var seen = list.slice(0, upto), cur = seen.length ? seen[seen.length - 1].ti : -1;
    seen.forEach(function (x) { if (x.ti >= cur - 1) dart(c, cx + Math.max(-EXT, Math.min(EXT, x.h.x)) * r, cy + Math.max(-EXT, Math.min(EXT, x.h.y)) * r, r, COL[x.t.p], 1, x.ti === cur ? 1 : 0.35); });
  }

  // ---------- the layer over the whole screen (like Mal & Rat's) ----------
  var ov = null, hidden = [];
  function layer(title, onClose) {
    shut(); css();
    ov = el("div", "liveov daov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "dah");
    var bar = el("div", "dabar"), x = el("button", "ico", "✕", function () { Kit.sfx.tap(); shut(); });
    x.setAttribute("aria-label", L().da_close); bar.appendChild(x); var h = el("h2", "", title); h.id = "dah"; bar.appendChild(h);
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
  function base(ctx) { var g = M.gameOf(ctx.doc, ctx.m); return g ? g.turns.length : 0; }
  // my turn is over (by link: one turn more than the link had; against Bert: the game is over) and every dart was shown
  function done(st, ctx, g) { g = g || sim(st, ctx); return !!g && flat(g).length <= st.shown && (st.bot ? g.over : !g.partial && g.turns.length > base(ctx)); }
  function value(st, ctx) { var g = sim(st, ctx); return done(st, ctx, g) ? [st.s, M.claimed(g)] : null; }
  function names(g, p, mine) { var w = M.who(g, p, Kit.lang); return !g.bot && p === mine ? fmt(L().da_youare, { p: w }) : w; }

  // ---------- throwing ----------
  function throwLayer(st, ctx, back) {
    var X = L(), seed = ctx.doc.seed, mine = base(ctx) % 2, g0 = sim(st, ctx);
    var o = layer("Dart · " + M.modeName(st.mode, Kit.lang), back), cv = el("canvas", "dacv"), help = el("p", "note", X.da_board_help);
    help.id = "dahelp"; cv.tabIndex = 0; cv.setAttribute("role", "application"); cv.setAttribute("aria-label", X.da_board); cv.setAttribute("aria-describedby", "dahelp");
    o.pad.appendChild(cv);
    var score = el("div", "dascore"), throws = el("ol", "dathrows"), sayp = el("p", "dasay"), aimBox = el("label", "daaim"), sel = el("select", "field");
    var pw = el("p", "dapow", X.da_power), meter = el("div", "dameter"), fill = el("i"), mid = el("b"), pb = el("button", "btn", X.da_power_go), fin = el("button", "btn hot dadone", X.da_done, function () { Kit.sfx.pop(); shut(); });
    sayp.id = "dasay"; sayp.setAttribute("role", "status"); sayp.setAttribute("aria-live", "polite"); sel.id = "daaim"; pb.id = "dapw";
    meter.setAttribute("role", "meter"); meter.setAttribute("aria-label", X.da_power); meter.setAttribute("aria-valuemin", "0"); meter.setAttribute("aria-valuemax", "63"); meter.setAttribute("aria-valuenow", "0");
    meter.appendChild(fill); meter.appendChild(mid); mid.setAttribute("aria-hidden", "true"); pw.appendChild(el("span", "dmsg", " – " + X.da_power_mid));
    aimBox.appendChild(el("span", "", X.da_aim)); aimBox.appendChild(sel);
    var opts = [["", X.da_aim_free], ["50", X.da_s_50], ["25", X.da_s_25]];
    for (var n = 20; n >= 1; n--) opts.push(["t" + n, fmt(X.da_s_3, { n: n })], ["d" + n, fmt(X.da_s_2, { n: n })], ["s" + n, fmt(X.da_s_1, { n: n })]);
    opts.forEach(function (x) { var op = document.createElement("option"); op.value = x[0]; op.textContent = x[1]; sel.appendChild(op); });
    fin.hidden = true;
    [score, throws, sayp, aimBox, pw, meter, pb, help, fin].forEach(function (x) { o.tools.appendChild(x); });
    var aim = st.aim || [0, -0.62], charge = null, fly = null, timer = 0, raf = 0, t0 = performance.now(), hand = null, size = 0;
    st.shown = Math.max(st.shown || 0, flat(M.gameOf(ctx.doc, ctx.m)).length);
    var memo = { s: null, list: [] };
    function all() { if (memo.s !== st.s) { memo.s = st.s; memo.list = flat(sim(st, ctx)); } return memo.list; }
    function can() { return !fly && !timer && !done(st, ctx) && !(st.bot && all().length > st.shown); }
    function say(s) { sayp.textContent = s; }
    function table() {
      var g = sim(st, ctx) || g0, list = all().slice(0, st.shown), last = list.length ? list[list.length - 1] : null, nx = all()[st.shown], cur = nx ? nx.t.p : g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2;
      score.textContent = "";
      [0, 1].forEach(function (p) { var r = el("p", p === cur && !g.over ? "on" : ""), dot = el("i"); dot.style.background = COL[p]; dot.setAttribute("aria-hidden", "true"); r.appendChild(dot); r.appendChild(document.createTextNode(M.stand(g, p, Kit.lang).replace(M.who(g, p, Kit.lang), names(g, p, mine)))); score.appendChild(r); });
      throws.textContent = ""; throws.setAttribute("aria-label", X.da_last);
      var ti = last ? last.ti : -1, inTurn = list.filter(function (x) { return x.ti === ti; });
      for (var i = 0; i < 3; i++) { var x = inTurn[i], li = el("li", x ? "hit" : "", x ? M.short(x.h, Kit.lang) : String(i + 1)); li.setAttribute("aria-label", x ? M.field(x.h, Kit.lang) : fmt(X.da_dart_of, { n: i + 1 })); throws.appendChild(li); }
      var ok = can(); sel.disabled = pb.disabled = !ok; fin.hidden = !done(st, ctx);
      pb.textContent = charge ? X.da_power_stop : X.da_power_go;
      o.ov.dataset.state = done(st, ctx) ? "done" : fly ? "fly" : timer ? "bot" : "aim"; cv.dataset.n = String(st.shown);
    }
    function ready() { t0 = performance.now(); hand = M.hand(seed, (sim(st, ctx) || g0).k); }
    function tnow(now) { return (now - t0) / M.STEP_MS; }
    function power(now) {
      if (!charge) return 0;
      var f = charge.hold ? Math.min(1, (now - charge.at) / HOLD_MS) : (function (x) { return x < 1 ? x : 2 - x; })(((now - charge.at) / SWING_MS) % 2);
      return Math.round(f * 63);
    }
    function release() {
      if (!charge || !can()) { charge = null; table(); return; }
      var now = performance.now(), p = power(now), d = M.dart(aim[0], aim[1], p, tnow(now));
      charge = null; st.aim = aim.slice(); st.s += M.enc(d);
      advance();
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
        else if (g.over) say(Tn.GAMES.dart.result(ctx.doc, [[[st.s, 0]]], Kit.lang).h);
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
        var f = fly.dur ? Math.min(1, (now - fly.at) / fly.dur) : 1, e = 1 - (1 - f) * (1 - f), x = fly.x.h, tx = cx + Math.max(-EXT, Math.min(EXT, x.x)) * r, ty = cy + Math.max(-EXT, Math.min(EXT, x.y)) * r;
        dart(c, cx + (tx - cx) * e, W * 1.05 + (ty - W * 1.05) * e, r, COL[fly.x.t.p], 2.4 - 1.4 * e, 1);
      } else if (can()) {
        var still = calm(), w = hand ? (still ? [0, 0] : M.wobble(hand, tnow(now) % M.STEPS)) : [0, 0];
        cross(c, cx + (aim[0] + w[0]) * r, cy + (aim[1] + w[1]) * r, r, still);
      }
      var p = power(now); fill.style.width = (p / 63 * 100) + "%"; meter.setAttribute("aria-valuenow", String(p));
      raf = requestAnimationFrame(frame);
    }
    function fit() {
      if (!cv.isConnected) { window.removeEventListener("resize", fit); return; }
      // side by side (wide screens): as large as the space beside the tools; one above the other: the width, leaving a
      // strip of the tools in sight below (the rest scrolls)
      var wide = matchMedia("(min-aspect-ratio:1/1)").matches, s = Math.max(160, Math.floor(Math.min(o.pad.clientWidth, wide ? o.pad.clientHeight : window.innerHeight - 150))), k = Math.min(3, window.devicePixelRatio || 1);
      size = s; cv.style.width = cv.style.height = s + "px"; cv.width = cv.height = Math.round(s * k);
    }
    window.addEventListener("resize", fit); fit();
    // ---------- input ----------
    function pos(e) { var b = cv.getBoundingClientRect(), k = b.width / 2 / EXT, up = e.pointerType === "touch" ? TOUCH_UP : 0; return [Math.max(-EXT, Math.min(EXT, (e.clientX - b.left - b.width / 2) / k)), Math.max(-EXT, Math.min(EXT, (e.clientY - up - b.top - b.height / 2) / k))]; }
    function setAim(a, keep) { aim = a; if (!keep) sel.value = ""; }
    cv.addEventListener("pointermove", function (e) { if (!can()) return; if (e.pointerType === "mouse" || (charge && charge.hold && charge.id === e.pointerId)) setAim(pos(e)); });
    cv.addEventListener("pointerdown", function (e) {
      if (!can() || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      setAim(pos(e)); charge = { hold: true, at: performance.now(), id: e.pointerId }; table();
    });
    cv.addEventListener("pointerup", function (e) { if (charge && charge.hold && charge.id === e.pointerId) { setAim(pos(e)); release(); } });
    cv.addEventListener("pointercancel", function (e) { if (charge && charge.hold && charge.id === e.pointerId) { charge = null; table(); } });
    function toggle() { if (!can()) return; if (!charge) { charge = { hold: false, at: performance.now() }; Kit.sfx.tap(); table(); } else if (!charge.hold) release(); }
    cv.addEventListener("keydown", function (e) {
      var k = e.key, step = e.shiftKey ? 0.1 : 0.02, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
      if (mv) { e.preventDefault(); if (can()) setAim([Math.max(-EXT, Math.min(EXT, aim[0] + mv[0])), Math.max(-EXT, Math.min(EXT, aim[1] + mv[1]))]); return; }
      if (k === " " || k === "Enter") { e.preventDefault(); if (!e.repeat) toggle(); }
    });
    pb.addEventListener("click", toggle);
    sel.addEventListener("change", function () {
      var v = sel.value; if (!v) return;
      var c = v === "50" ? M.centre(25, "b") : v === "25" ? M.centre(25, "o") : M.centre(+v.slice(1), v[0]);
      setAim(c, true); Kit.sfx.tap();
    });
    o.ov.cancel = function () { if (!charge) return false; charge = null; table(); return true; };   // Escape first drops a power under way
    o.ov.stop = function () { if (raf) cancelAnimationFrame(raf); clearTimeout(timer); timer = 0; charge = null; };
    ready(); table();
    var pend = all().length > st.shown;
    if (pend) advance(); else if (done(st, ctx)) { fin.hidden = false; say(X.da_game_done); }
    else say(fmt(X.da_turn_of, { p: names(sim(st, ctx) || g0, (sim(st, ctx) || g0).turns.length % 2, mine) }));
    raf = requestAnimationFrame(frame);
    (fin.hidden ? cv : fin).focus();
  }

  // ---------- the step in the turn editor ----------
  root.Turn2.add("widget", "dart", function (box, p, set, ctx) {
    css();
    var X = L(), ed = ctx.ed, prev = M.last(ctx.m), key = ed.doc.seed + "|" + (prev ? prev[0] : "");
    var st = ed.dart && ed.dart.key === key ? ed.dart : (ed.dart = { key: key, mode: prev ? prev[0][0] : "a", bot: prev ? prev[0][1] === "b" : false, s: prev ? prev[0] : M.head("a", false), shown: 0 });
    ctx.set = set;
    function fresh() { return st.s.length <= 2; }
    function render(focus) {
      box.textContent = "";
      if (!prev && fresh()) {
        var steps = el("div", "dasteps"), modes = el("div", "damodes"), opp = el("div", "damodes");
        modes.setAttribute("role", "group"); modes.setAttribute("aria-label", X.da_mode_h); opp.setAttribute("role", "group"); opp.setAttribute("aria-label", X.da_opp_h);
        M.MODES.forEach(function (m) {
          var b = el("button", "chip", null, function () { Kit.sfx.tap(); st.mode = m; st.s = M.head(st.mode, st.bot); render(); box.querySelector('.damodes .chip.on').focus(); });
          b.appendChild(document.createTextNode(M.modeName(m, Kit.lang))); b.appendChild(el("small", "", X["da_mi_" + m])); press(b, st.mode === m); modes.appendChild(b);
        });
        [[false, X.da_o_l], [true, X.da_o_b]].forEach(function (x) {
          var b = el("button", "chip", x[1], function () { Kit.sfx.tap(); st.bot = x[0]; st.s = M.head(st.mode, st.bot); render(); opp.querySelector(".chip.on").focus(); });
          press(b, st.bot === x[0]); opp.appendChild(b);
        });
        steps.appendChild(el("h4", "lbl", X.da_mode_h)); steps.appendChild(modes); steps.appendChild(el("h4", "lbl", X.da_opp_h)); steps.appendChild(opp);
        if (st.bot) steps.appendChild(el("p", "note", "🤖 " + X.da_bot_note));
        box.appendChild(steps);
      }
      var g = M.sim(ed.doc.seed, st.s), list = flat(g).slice(0, Math.max(st.shown, prev ? flat(M.sim(ed.doc.seed, prev[0])).length : 0)), state = el("div", "dastate"), th = el("canvas", "dathumb"), info = el("div");
      th.width = th.height = 240; th.setAttribute("aria-hidden", "true");
      var c = th.getContext("2d"), r = 120 / EXT; board(c, 120, 120, r); darts(c, 120, 120, r, flat(g), list.length);
      state.appendChild(th); state.appendChild(info);
      if (g && g.turns.length) {
        info.appendChild(el("p", "note", M.head1(g, Kit.lang)));
        [0, 1].forEach(function (q) { info.appendChild(el("p", "note", M.stand(g, q, Kit.lang).replace(M.who(g, q, Kit.lang), names(g, q, base(ctx) % 2)))); });
        var lt = list.length ? list[list.length - 1].t : null;
        if (lt) info.appendChild(el("p", "note", M.who(g, lt.p, Kit.lang) + ": " + M.turnLine(lt, g, Kit.lang)));
      } else info.appendChild(el("p", "note", X.da_you));
      box.appendChild(state);
      if (prev) { var pg = M.sim(ed.doc.seed, prev[0]), f = pg && M.fixed(prev, pg); if (f) { var fx = el("p", "note", fmt(X.da_fixed, f)); fx.setAttribute("role", "status"); box.appendChild(fx); } }
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
    var a = doc.col[0], b = doc.col[1], ink = R.ink(a), res = Tn.result(doc, Kit.lang), v = M.last(Tn.moves(doc)), ed = A.ed();
    if (ed && ed.doc === doc && ed.next && Tn.GAMES.dart) { var nv = M.last(Tn.moves(ed.next)); if (nv) { v = nv; res = Tn.result(ed.next, Kit.lang); } }   // in the editor: the turn as it will go out
    var g = v ? M.sim(doc.seed, v[0]) : null, i0 = doc.i ? D.byId(doc.i) : null, title = doc.t || (i0 ? D.plainTitle((i0[Kit.lang] || i0.de).t) : "Dart");
    c.fillStyle = a; c.fillRect(0, 0, W, H); R.rays(c, W, H, "rgba(0,0,0,.05)", 0.2);
    R.block(c, res ? res.h : title, W * 0.07, H * 0.03, W * 0.86, H * 0.17, ink, null);
    var r = W * 0.27, cx = W / 2, cy = H * 0.52;
    c.save(); c.shadowColor = "rgba(0,0,0,.35)"; c.shadowBlur = W * 0.03; c.beginPath(); c.arc(cx, cy, r * EXT, 0, 6.2832); c.fillStyle = b; c.fill(); c.restore();
    board(c, cx, cy, r);
    var list = flat(g);
    // every dart of the game as a small dot in the player's colour, the last turn of each as darts
    list.forEach(function (x) { c.beginPath(); c.arc(cx + Math.max(-EXT, Math.min(EXT, x.h.x)) * r, cy + Math.max(-EXT, Math.min(EXT, x.h.y)) * r, W * 0.006, 0, 6.2832); c.fillStyle = COL[x.t.p]; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "#111"; c.stroke(); });
    darts(c, cx, cy, r, list, list.length);
    var lines = res ? res.lines : g ? Tn.GAMES.dart.face(doc, [[v]], Kit.lang) || [] : [doc.s || (i0 ? (i0[Kit.lang] || i0.de).s : ""), L().da_you];
    c.font = "800 " + Math.round(W * 0.032) + "px system-ui, sans-serif"; c.fillStyle = ink; c.textAlign = "center"; c.textBaseline = "top";
    lines.slice(0, 4).forEach(function (s, i) { var t = String(s); while (t.length > 4 && c.measureText(t).width > W * 0.88) t = t.slice(0, -2) + "…"; c.fillText(t, W / 2, H * 0.835 + i * W * 0.042); });
    return ink;
  };
  root.DartUI = { board: board, dart: dart, flat: flat };
})(window);
