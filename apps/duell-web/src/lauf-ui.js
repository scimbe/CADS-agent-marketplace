// My Daily Idea: the second game engine on screen (part "lauf", src/lauf-engine.js): the picture of a run, the game screen
// (touch, keys, pause, a line for screen readers), and the editor's tabs ("What do you want to run or jump?", rules,
// figure, world, text). The canvas always fills its box: a ResizeObserver on the box sizes it anew, never only once.
// prefers-reduced-motion: no shaking, no flashes, no sparks, the backdrop stands still.
(function (root) {
  "use strict";
  var A = root.DailyApp, Kit = root.Kit, t = Kit.t, C = root.DuellCore, D = root.Daily, L = root.Lauf, E = root.LaufEngine, R = root.Render, G = root.Game, X = root.DailyModes;
  var $ = function (id) { return document.getElementById(id); }, el = A.el;
  var EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  var reduce = false, VIEW = 400;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  // a world: sky top and bottom, ground, its edge, what lies below the gaps (water, lava or nothing), the backdrop
  var W = {
    bruecke: ["#8fd3ff", "#e6f7ff", "#9a6332", "#5a3a1a", "#2a7bd5", "hills"], stadt: ["#ffb88c", "#ffe0c2", "#5b5b66", "#2f2f38", "", "city"],
    wald: ["#a8e6a1", "#e9ffe0", "#6b4f2a", "#3f8f3a", "", "trees"], wueste: ["#ffd27f", "#fff1c9", "#e0b062", "#b07a32", "", "hills"],
    eis: ["#bfe9ff", "#f2fbff", "#e8f6ff", "#7fbfe9", "#3b7fb8", "hills"], nacht: ["#0b1030", "#26305e", "#2b2b3a", "#7ad1ff", "", "stars"],
    lava: ["#2b0a0a", "#7a1d0b", "#1b0f0f", "#ff5a1f", "#ff6a1f", "hills"], candy: ["#ff8fd0", "#ffd0ec", "#ffc0e6", "#d87fbf", "", "hills"]
  };
  var CSS = "#game.lf>:not(#lauf):not(.top){display:none!important}#lauf{position:absolute;inset:0}#lfcv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}" +
    ".lfhud{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top) + 56px);text-align:center;font:900 30px/1 var(--disp);text-shadow:0 3px 0 rgba(0,0,0,.45);pointer-events:none;font-variant-numeric:tabular-nums}" +
    ".lfhint{position:absolute;left:12px;right:12px;top:34%;text-align:center;font:900 22px/1.2 var(--disp);text-shadow:0 3px 0 rgba(0,0,0,.5);pointer-events:none}" +
    ".lfb{position:absolute;min-width:56px;min-height:56px;border:3px solid #111;border-radius:50%;background:#fffaf0;color:#111;font:900 22px var(--ui)}.lfpause{right:10px;top:calc(env(safe-area-inset-top) + 52px)}.lfduck{left:14px;bottom:calc(env(safe-area-inset-bottom) + 18px);width:76px;height:76px}" +
    ".lfres{position:absolute;left:0;right:0;bottom:0;background:var(--paper);color:#111;border-top:3px solid #111;padding:14px 18px calc(env(safe-area-inset-bottom) + 12px);display:flex;flex-direction:column;gap:8px}.lfres[hidden],.lfb[hidden]{display:none}.lfsc{text-align:center;font:900 54px/1 var(--disp)}.lfres p{text-align:center;margin:0;font-weight:800}";
  function style() { if ($("lfcss")) return; var s = el("style"); s.id = "lfcss"; s.textContent = CSS; document.head.appendChild(s); }
  // emoji as small pictures, drawn once per size (text drawing every frame is slow on mid-range phones)
  var SPR = {}, SKY = {};
  function spr(e, px) {
    px = Math.max(8, Math.round(px)); var k = e + px;
    if (SPR[k]) return SPR[k];
    var c = document.createElement("canvas"); c.width = c.height = Math.ceil(px * 1.25);
    var x = c.getContext("2d"); x.font = px + "px " + EMO; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(e, c.width / 2, c.height / 2 + px * 0.06);
    return (SPR[k] = c);
  }
  // one picture of the run. c: context, cw/ch: size in px of the canvas, o: { flip, clock, shake, dead }
  function oyOf(ch, k) { return Math.max(0, (ch - E.H * k) * 0.55); }
  function draw(c, s, cw, ch, o) {
    // at least VIEW px of the track in sight, also on a narrow phone; the band of the world sits in the lower part
    var w = W[s.l.w], k = Math.min(ch / E.H, cw / VIEW), oy = oyOf(ch, k), vw = cw / k, cam = s.me.x - vw * 0.28, H = E.H, i, x, sp, it, still = reduce || o.still, cl = o.clock || 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    var gk = w[0] + ch, g = SKY[gk];
    if (!g) { g = SKY[gk] = c.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, w[0]); g.addColorStop(1, w[1]); }
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    var sx = o.shake && !reduce ? (Math.sin(cl * 90) * o.shake) : 0, cs = Math.max(20, cw / 16);
    // clouds (or nothing at night) in the sky above the band
    c.fillStyle = "rgba(255,255,255,.55)";
    if (w[5] !== "stars") for (i = 0; i < 5; i++) { x = (((i * 211 - (still ? 0 : s.me.x * 0.08)) % (cw + 4 * cs)) + cw + 4 * cs) % (cw + 4 * cs) - 2 * cs; c.beginPath(); c.ellipse(x, oyOf(ch, k) * (0.2 + i * 0.17), cs * 1.6, cs * 0.55, 0, 0, 7); c.ellipse(x + cs, oyOf(ch, k) * (0.2 + i * 0.17) - cs * 0.3, cs, cs * 0.5, 0, 0, 7); c.fill(); }
    c.setTransform(k, 0, 0, k, sx * k, oy);
    // backdrop, slower than the track
    var par = still ? 0 : cam * 0.25;
    c.fillStyle = "rgba(255,255,255,.35)";
    if (w[5] === "stars") { c.fillStyle = "rgba(255,255,255,.8)"; for (i = 0; i < 40; i++) c.fillRect(((i * 97 - par * 0.3) % vw + vw) % vw, (i * 53) % 200, 2, 2); }
    else for (i = -1; i < vw / 120 + 2; i++) {
      x = i * 120 - (par % 120); var hgt = 40 + ((Math.floor((par / 120) + i) * 7919) % 50 + 50) % 50;
      if (w[5] === "city") c.fillRect(x, 230 - hgt * 1.6, 70, 200);
      else if (w[5] === "trees") { c.beginPath(); c.moveTo(x, 240); c.lineTo(x + 40, 150 - hgt * 0.6); c.lineTo(x + 80, 240); c.fill(); }
      else { c.beginPath(); c.ellipse(x + 60, 250, 90, hgt + 20, 0, Math.PI, 0); c.fill(); }
    }
    c.setTransform(k, 0, 0, k, (sx - cam) * k, oy);
    // what lies below the gaps
    c.fillStyle = w[4] || "rgba(0,0,0,.3)"; c.fillRect(cam - 20, H - 34, vw + 40, 4000);
    if (w[4]) { c.fillStyle = "rgba(255,255,255,.35)"; for (x = Math.floor(cam / 40) * 40; x < cam + vw + 40; x += 40) c.fillRect(x + (still ? 0 : (cl * 30) % 40), H - 30, 18, 3); }
    var bridge = s.l.w === "bruecke";
    for (i = 0; i < s.spans.length; i++) {
      sp = s.spans[i]; if (sp.x1 < cam - 10 || sp.x0 > cam + vw + 10) continue;
      var x0 = Math.max(sp.x0, cam - 10), x1 = Math.min(sp.x1, cam + vw + 10);
      if (bridge) {
        c.fillStyle = w[3]; for (x = Math.ceil(sp.x0 / 150) * 150 + 30; x < sp.x1 - 20; x += 150) if (x > cam - 30 && x < cam + vw + 30) c.fillRect(x, sp.y + 12, 16, 4000);
        c.fillStyle = w[2]; c.fillRect(x0, sp.y, x1 - x0, 14);
        c.fillStyle = w[3]; c.fillRect(x0, sp.y + 12, x1 - x0, 3); c.fillRect(x0, sp.y - 20, x1 - x0, 3);
        for (x = Math.ceil(sp.x0 / 36) * 36; x < sp.x1; x += 36) if (x > cam - 10 && x < cam + vw + 10) c.fillRect(x, sp.y - 20, 3, 20);
      } else {
        c.fillStyle = w[2]; c.fillRect(x0, sp.y, x1 - x0, 4000);
        c.fillStyle = w[3]; c.fillRect(x0, sp.y, x1 - x0, 6);
      }
    }
    for (i = 0; i < s.items.length; i++) {
      it = s.items[i]; if (it.live === false || it.x > cam + vw + 40 || it.x + (it.w || 0) < cam - 40) continue;
      if (it.t === "d") { c.fillStyle = w[3]; c.fillRect(it.x, it.y, it.w, it.h); c.fillStyle = "#ffd400"; for (x = 0; x < it.w; x += 20) c.fillRect(it.x + x, it.y + it.h - 12, 10, 12); continue; }
      if (it.t === "g") { c.fillStyle = "#111"; c.fillRect(it.x, it.y, 4, it.h); c.drawImage(spr("🏁", 40), it.x - 2, it.y - 6, 50, 50); continue; }
      var e = it.t === "c" ? s.l.c : it.t === "f" ? s.l.f : s.l.o, sz = Math.max(it.w, it.h) * 1.25;
      c.save(); c.translate(it.x + it.w / 2, it.y + it.h / 2); if (it.t === "f") c.scale(it.vx > 0 ? -1 : 1, 1);
      if (it.t === "c" && !still) c.scale(Math.abs(Math.cos(cl * 4 + it.x)), 1);
      c.drawImage(spr(e, 48), -sz / 2, -sz / 2, sz, sz); c.restore();
    }
    // the runner, mirrored so it faces the way it runs
    var m = s.me, hh = s.height(), bob = m.on && s.state === "run" && !still ? Math.abs(Math.sin(cl * 14)) * 3 : 0;
    c.save(); c.translate(m.x, m.y - bob); c.scale(-1, hh / E.PH);
    if (o.dead) c.rotate(1.2);
    var an = o.pose; if (an) { c.translate(an.x, an.y - 24); c.rotate(an.r); c.scale(an.sx, an.sy); c.translate(0, 24); c.globalAlpha = an.a; }   // the figure's animation (l.anim), about its middle
    c.drawImage(spr(s.l.e, 56), -30, -54, 60, 60); c.restore(); c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (o.flash && !reduce) { c.fillStyle = "rgba(255,60,80," + o.flash * 0.4 + ")"; c.fillRect(0, 0, cw, ch); }
  }
  // A simple player for the still picture: jumps when a gap, a step up or a block comes close; before a gap only at the
  // very edge (the farthest jump: earlier it falls short of a wide gap at high speed). Not perfect with blocks, never needed.
  function bot(s) {
    var m = s.me, v = s.speed(), near = m.x + v * 0.22, edge = m.x + v * 0.04 + 14, i, want = false;
    for (i = 0; i < s.spans.length; i++) { var sp = s.spans[i], nx = s.spans[i + 1], lim = nx && nx.x0 > sp.x1 ? edge : near + 20; if ((sp.x1 > m.x && sp.x1 < lim) || (sp.x0 > m.x && sp.x0 < near && sp.y < m.y - 2)) want = true; }
    for (i = 0; i < s.items.length; i++) { var it = s.items[i]; if (it.t !== "c" && it.t !== "d" && it.live !== false && it.x > m.x && it.x < near) want = true; }
    if (want && m.on) s.press(); else if (!want && m.vy > -100) s.release();
  }
  // the card's picture (home sheet, editor stage): the track a moment after the start
  function still(doc) {
    var s = E.createSim(doc.l); s.press();
    for (var i = 0; i < 300 && s.state === "run"; i++) { bot(s); s.step(); }
    s.state = "run"; return s;
  }
  R.extra.lauf = function (c, cw, ch, doc) {
    draw(c, still(doc), cw, ch, { still: true });
    var title = doc.t || t("lf_def"), f = Math.round(cw * 0.075);
    c.font = "900 " + f + "px " + R.FONT; c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = f * 0.25; c.strokeStyle = "#111"; c.strokeText(title.toUpperCase(), cw / 2, ch * 0.1); c.fillStyle = "#fff"; c.fillText(title.toUpperCase(), cw / 2, ch * 0.1);
    return "#fff";
  };

  // ---------- the game screen ----------
  var box, cv, ctx, hud, hint, pauseB, duckB, res, sr, ro = null, sim = null, cur = null, opts = {}, raf = 0, last = 0, acc = 0, clock = 0, paused = false, on = false, shake = 0, flash = 0, endT = 0, shown = "";
  function say(s) { sr.textContent = ""; setTimeout(function () { sr.textContent = s; }, 30); }
  function size() {
    if (!cv) return;
    var r = box.getBoundingClientRect(), d = Math.min(root.devicePixelRatio || 1, 1.5);
    cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d));
    if (sim) paint();
  }
  // the figure's animation (l.anim): fixed by the doc, played from the run's clock; bei: since the last jump, coin or goal
  var at = {};
  function pose() { var a = cur && cur.l.anim; return a && !reduce ? (root.Lauf.pose = C.animPose(a, clock, a.bei ? clock - (at[a.bei] == null ? -1e9 : at[a.bei]) : 0, cur.l.seed, 60)) : null; }
  function paint() { draw(ctx, sim, cv.width, cv.height, { clock: clock, shake: shake, flash: flash, dead: sim.state === "over", pose: pose() }); }
  function build() {
    if (box) return;
    style();
    box = el("div"); box.id = "lauf";
    cv = el("canvas"); cv.id = "lfcv"; cv.setAttribute("role", "img"); ctx = cv.getContext("2d");
    hud = el("div", "lfhud"); hud.setAttribute("aria-hidden", "true"); hint = el("p", "lfhint");
    pauseB = el("button", "lfb lfpause", "⏸", function (e) { e.stopPropagation(); pause(!paused); });
    duckB = el("button", "lfb lfduck", "⬇");
    res = el("div", "lfres"); res.hidden = true; sr = el("p", "dmsg"); sr.setAttribute("aria-live", "polite");
    [cv, hud, hint, pauseB, duckB, res, sr].forEach(function (x) { box.appendChild(x); });
    $("cv").after(box);
    if (root.ResizeObserver) { ro = new ResizeObserver(size); ro.observe(box); } else root.addEventListener("resize", size);
    var ptr = null;
    duckB.addEventListener("pointerdown", function (e) { e.stopPropagation(); e.preventDefault(); if (sim) sim.setDuck(true); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { duckB.addEventListener(n, function () { if (sim) sim.setDuck(false); }); });
    box.addEventListener("pointerdown", function (e) {
      if (!on || e.target.closest("button") || !res.hidden) return;
      e.preventDefault(); ptr = e.clientY;
      if (paused) { pause(false); return; }
      press();
    });
    // a swipe down ducks while the finger stays
    box.addEventListener("pointermove", function (e) { if (ptr != null && sim && e.clientY - ptr > 40) { sim.release(); sim.setDuck(true); } });
    ["pointerup", "pointercancel"].forEach(function (n) { box.addEventListener(n, function () { ptr = null; if (sim) { sim.release(); sim.setDuck(false); } }); });
    root.addEventListener("keydown", function (e) {
      if (!on || /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
      var k = e.code;
      if (k === "Space" || k === "ArrowUp" || k === "KeyW") { if (!res.hidden && e.target.closest && e.target.closest(".lfres")) return; e.preventDefault(); if (!e.repeat) { if (paused) pause(false); else press(); } }
      else if (k === "ArrowDown" || k === "KeyS") { e.preventDefault(); if (sim) sim.setDuck(true); }
      else if ((k === "KeyP" || k === "Escape") && res.hidden && sim && sim.state === "run") { e.preventDefault(); pause(!paused); }
    });
    root.addEventListener("keyup", function (e) {
      if (!on || !sim) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") sim.release();
      if (e.code === "ArrowDown" || e.code === "KeyS") sim.setDuck(false);
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && on && sim && sim.state === "run") pause(true); });
  }
  function press() {
    if (!sim || sim.state === "over" || sim.state === "goal") return;
    var ev = sim.press();
    if (ev.indexOf("start") >= 0) { hint.hidden = true; say(t("lf_start")); }
  }
  function pause(p) {
    if (!sim || sim.state !== "run") p = false;
    paused = p; pauseB.textContent = p ? "▶" : "⏸"; pauseB.setAttribute("aria-label", t(p ? "lf_go" : "lf_pause"));
    hint.hidden = !p; if (p) { hint.textContent = t("lf_paused"); say(t("lf_paused")); }
    if (!p) last = 0;
  }
  function key() { var l = Object.assign({}, cur.l); delete l.r; return "lf" + C.hash32(JSON.stringify(l)); }
  function best() { var b = Kit.store.lbest; if (!b || typeof b !== "object") b = Kit.store.lbest = {}; return b; }
  function newRun() {
    clearTimeout(endT); sim = E.createSim(cur.l); paused = false; at = {}; shake = flash = 0; res.hidden = true; shown = "";
    hint.hidden = false; hint.textContent = t("lf_hint"); duckB.hidden = !(sim.p.du > 0); pauseB.setAttribute("aria-label", t("lf_pause")); pauseB.textContent = "⏸";
    cv.setAttribute("aria-label", t("lf_area", { t: cur.t || t("lf_def") }));
    hud.textContent = cur.l.r ? t("lf_beat", { n: cur.l.r }) : "";
    size(); paint();
  }
  function frame(ts) {
    if (!on) { raf = 0; return; }
    var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    if (!paused) {
      clock += dt;
      if (sim.state === "run") {
        acc += dt;
        while (acc >= E.STEP) { acc -= E.STEP; var ev = sim.step(); if (ev.indexOf("jump") >= 0) at.sprung = clock; if (ev.indexOf("coin") >= 0 || ev.indexOf("stomp") >= 0) at.treffer = clock; if (ev.indexOf("goal") >= 0) at.sieg = clock; if (ev.indexOf("coin") >= 0) Kit.tone(880, 1320, 0.06, "triangle", 0.08); if (ev.indexOf("jump") >= 0) Kit.tone(320, 640, 0.07, "square", 0.04); if (ev.indexOf("stomp") >= 0) Kit.sfx.pop(); if (sim.state !== "run") { end(); break; } }
        var h = t("lf_hud", { p: sim.points(), m: sim.meters() });
        if (h !== shown) { hud.textContent = shown = h; }
      } else acc = 0;
      shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 2.5);
    }
    paint();
    raf = requestAnimationFrame(frame);
  }
  function end() {
    var won = sim.state === "goal", p = sim.points(), m = sim.meters(), b = best(), k = key(), before = b[k] || 0;
    if (won) Kit.sfx.win(); else { Kit.tone(260, 40, 0.4, "sawtooth", 0.14); Kit.haptic([60, 40, 120]); shake = 10; flash = 1; }
    if (p > before) { b[k] = p; Kit.save(); }
    var line = t(won ? "lf_goal" : "lf_over", { p: p, m: m });
    say(line);
    endT = setTimeout(function () {
      res.textContent = "";
      res.appendChild(el("b", "lfsc", String(p)));
      res.appendChild(el("p", "", line));
      var r = cur.l.r;
      res.appendChild(el("p", "", r ? t(p > r ? "lf_won" : "lf_short", { n: r, d: r - p + 1 }) : t("bestN", { n: Math.max(before, p) })));
      var again = el("button", "btn hot", t("lf_again"), function () { Kit.sfx.tap(); newRun(); });
      res.appendChild(again);
      res.appendChild(el("button", "btn", t("lf_share"), function () { Kit.sfx.tap(); share(p); }));
      res.appendChild(el("button", "btn", t("lf_build"), function () { Kit.sfx.tap(); $("gback").click(); }));
      res.hidden = false; try { again.focus(); } catch (e) {}
    }, reduce ? 0 : 600);
  }
  async function share(p) {
    var d = JSON.parse(JSON.stringify(cur)); d.l.r = p;
    var ed = A.ed(); if (ed && ed.doc === opts.doc && X.lauf.areas(ed).length) d = D.withTrail(d, A.me().nick, X.lauf.areas(ed));
    var link = await root.ShortLink.shorten(D.docUrl(d), { k: "game", n: p, l: Kit.lang }, Kit.store);
    Kit.save(); Kit.share({ url: link.url, text: t("lf_chText", { n: p, t: cur.t || t("lf_def") }) });
  }
  function stop() { on = false; clearTimeout(endT); if (box) { $("game").classList.remove("lf"); box.hidden = true; } }
  function play(doc, o) {
    build(); opts = o || {}; cur = D.sanitizeDoc(doc); opts.doc = doc;
    G.stop(); A.show("game", true); if (A.played && o && o.ed) A.played(o.ed);
    $("game").classList.add("lf"); box.hidden = false; on = true; $("title").textContent = cur.t || t("lf_def");
    var ks = $("gki"); if (ks) { ks.hidden = !cur.ki; ks.textContent = t("kiBadge"); ks.setAttribute("aria-label", t("kiBadgeL")); }
    newRun(); last = 0; if (!raf) raf = requestAnimationFrame(frame);
  }
  // every way off the game screen in the core goes through Game.stop
  var s0 = G.stop; G.stop = function () { stop(); return s0.apply(G, arguments); };

  // ---------- editor ----------
  function hand(d) { var k = d.ki; if (k && k.k === "karte" && k.h && !d.fr) d.fr = k.h.slice(0, 22); delete d.ki; }
  function areas(ed) {
    var a = ed.base.l || {}, b = ed.doc.l, w = [], ne = function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); };
    if (ne("p") || ne("m") || ne("seed") || ne("fp")) w.push("regeln");
    if (ne("e") || ne("f") || ne("anim")) w.push("figur");
    if (ne("w") || ne("o") || ne("c")) w.push("welt");
    return w;
  }
  X.lauf = {
    open: function () { $("tabs").hidden = false; },
    footer: function (b) { b.classList.remove("wait"); b.textContent = t("play"); },
    main: function (ed) { Kit.sfx.thud(); play(ed.doc, { own: true, ed: ed }); },
    areas: areas,
    label: function (doc) { return doc.l && doc.l.r ? { go: t("lf_take"), note: t("lf_beat", { n: doc.l.r }) } : null; }
  };
  A.TABS.lauf = ["LWish", "LRules", "LFigure", "LWorld", "LText"];
  function lf() { return A.ed().doc.l; }
  function mod(f) { return function (v) { var d = A.ed().doc; f(d.l, v); hand(d); A.changed(); }; }
  function slider(p, k, set) {
    var s = L.SPEC[k], l = lf(), row = el("label", "slide"), r = el("input"), v = el("b", "", l.p[k]);
    row.appendChild(el("span", "", t("lf_p_" + k))); r.type = "range"; r.min = s[0]; r.max = s[1]; r.value = l.p[k]; r.setAttribute("aria-label", t("lf_p_" + k));
    r.addEventListener("input", function () { v.textContent = r.value; (set || mod(function (x, n) { x.p[k] = n; }))(Number(r.value)); });
    row.appendChild(r); row.appendChild(v); p.appendChild(row);
  }
  function emo(p, label, list, now, set) { p.appendChild(el("label", "lbl", label)); A.chips(p, list.map(function (e) { return { v: e, l: e }; }), now, mod(set), "em"); }
  // The words of a wish, read by fixed rules on the device (no AI): world, mode, level, what is wanted, the figure.
  var WORDS = [["w", "bruecke", /br(ü|ue|u)ck|bridge/], ["w", "stadt", /stadt|city|d(ä|a)ch|roof|stra(ß|ss)e/], ["w", "wald", /wald|forest|dschungel|jungle|baum|b(ä|a)ume/],
    ["w", "wueste", /w(ü|ue)ste|desert|sand/], ["w", "eis", /eis\b|schnee|winter|ice|snow/], ["w", "nacht", /nacht|night|sterne|weltall|space/], ["w", "lava", /lava|vulkan|volcano/],
    ["w", "candy", /candy|s(ü|ue)(ß|ss)|bonbon|zucker|sweet/], ["m", "ziel", /ziel|level|goal|finish|plattform|platform|jump.?n.?run/],
    ["level", "easy", /leicht|easy|kind|ruhig|gem(ü|ue)tlich/], ["level", "hard", /schwer|hard|schnell|fast|krass/],
    ["h", "gegner", /gegner|monster|feind|enem|k(ä|a)fer|tier/], ["h", "ducken", /duck/], ["h", "von_oben", /von oben|f(ä|a)llt|fallen|regen|meteor|from above|falling|ausweich/],
    ["h", "luecken", /l(ü|ue)cke|gap|abgrund|br(ü|ue)ck|bridge/]];
  var FIGW = { "🐸": /frosch|frog/, "🦊": /fuchs|fox/, "🐱": /katze|cat/, "🐶": /hund|dog/, "🦖": /dino/, "🐧": /pinguin|penguin/, "🐰": /hase|bunny|rabbit/, "🤖": /robot/, "🦄": /einhorn|unicorn/, "🐢": /schildkr|turtle/, "🐼": /panda/, "🐵": /affe|monkey/ };
  // base: the game as it is; its figure and things stay unless the wish names others, the seed always stays
  function fromWords(text, base) {
    var s = String(text).toLowerCase(), o = { mode: "endlos", level: "normal", has: ["hindernisse", "muenzen"], foes: ["geh"], figure: base.e, obstacle: base.o, coin: base.c, foe: base.f };
    WORDS.forEach(function (w) { if (w[2].test(s)) { if (w[0] === "h") { if (o.has.indexOf(w[1]) < 0) o.has.push(w[1]); } else if (w[0] === "w") o.world = o.world || w[1]; else o[w[0] === "m" ? "mode" : w[0]] = w[1]; } });
    for (var e in FIGW) if (FIGW[e].test(s)) { o.figure = e; break; }
    if (o.has.indexOf("gegner") >= 0) o.foes = ["geh", "huepf"];
    if (o.has.indexOf("von_oben") >= 0 && /nur|only/.test(s)) o.has = ["von_oben", "muenzen"];
    var l = E.build(o, base.seed), an = C.animWords(text);
    if (an ? an.art !== "keine" : base.anim) l.anim = C.sanitizeAnim(an || base.anim);   // an animation named by the wish, else the one it had
    return l;
  }
  A.PANEL.LWish = function (p) {
    var ed = A.ed(), f = A.field(p, t("lf_ask"), "", 140, function () {}, true), res = el("div");
    function go(txt) {
      var d = ed.doc, was = JSON.stringify(d.l), v = D.cleanInput(txt, 140); if (!v) return;
      var nl = fromWords(v, d.l);
      d.l = nl; hand(d); A.changed(); Kit.sfx.pop();
      res.textContent = "";
      res.appendChild(el("p", "note aistate", t("lf_did", { x: [nl.e, t("lf_w_" + nl.w), t("lf_m_" + nl.m)].join(" · ") }) + " " + t("lf_local")));
      res.appendChild(el("button", "chip", "↶ " + t("lf_undo"), function () { d.l = JSON.parse(was); A.changed(); res.textContent = ""; }));
    }
    p.appendChild(el("button", "chip hot", "✨ " + t("lf_askGo"), function () { go(f.value); }));
    p.appendChild(res);
    p.appendChild(el("label", "lbl wishtips", t("wishOr")));
    var tips = el("div", "chips");
    t("lf_tips").split("|").forEach(function (x) { tips.appendChild(el("button", "chip", x, function () { f.value = x; go(x); })); });
    p.appendChild(tips);
    p.appendChild(el("p", "note", t("lf_wishH")));
  };
  A.PANEL.LRules = function (p) {
    var l = lf();
    A.chips(p, L.MODES.map(function (m) { return { v: m, l: t("lf_m_" + m) }; }), l.m, mod(function (x, v) { x.m = v; A.tab("LRules"); }));
    if (l.m === "ziel") slider(p, "len");
    ["v", "a", "g", "j", "lu", "lw", "hi", "du", "mu", "ge", "fa", "hv"].forEach(function (k) { slider(p, k); });
    p.appendChild(el("button", "chip", "🎲 " + t("lf_seed"), function () { Kit.sfx.pop(); mod(function (x) { x.seed = root.crypto.getRandomValues(new Uint32Array(1))[0]; })(); }));
  };
  A.PANEL.LFigure = function (p) {
    var l = lf();
    emo(p, t("lf_fig"), L.FIG, l.e, function (x, v) { x.e = v; });
    emo(p, t("lf_foe"), L.FOE, l.f, function (x, v) { x.f = v; });
    p.appendChild(el("label", "lbl", t("lf_fp")));
    var row = el("div", "chips");
    L.PATTERNS.forEach(function (k) {
      var b = el("button", "chip" + (l.fp.indexOf(k) >= 0 ? " on" : ""), t("lf_fp_" + k), function () {
        Kit.sfx.tap(); var i = l.fp.indexOf(k);
        if (i >= 0 && l.fp.length > 1) l.fp.splice(i, 1); else if (i < 0) l.fp.push(k);
        mod(function () {})(); A.tab("LFigure");
      });
      b.setAttribute("aria-pressed", String(l.fp.indexOf(k) >= 0)); row.appendChild(b);
    });
    p.appendChild(row);
    if (root.Blasen && root.Blasen.anim) root.Blasen.anim(p, function () { return lf().anim; }, function (a) { var d = A.ed().doc; if (a) d.l.anim = a; else delete d.l.anim; hand(d); A.changed(); });
  };
  A.PANEL.LWorld = function (p) {
    var l = lf(), b = A.chips(p, L.WORLDS.map(function (w) { return { v: w, l: t("lf_w_" + w) }; }), l.w, mod(function (x, v) { x.w = v; }));
    Array.from(b.children).forEach(function (c, i) { c.style.borderBottom = "8px solid " + W[L.WORLDS[i]][0]; });
    emo(p, t("lf_obj"), L.OBJ, l.o, function (x, v) { x.o = v; });
    emo(p, t("lf_coin"), L.COIN, l.c, function (x, v) { x.c = v; });
  };
  A.PANEL.LText = function (p) { A.field(p, t("lf_title"), A.ed().doc.t, 26, function (v) { var d = A.ed().doc; d.t = v; hand(d); }); };
  // test hook for browser checks: the state, and time without waiting for frames
  root.LaufDebug = { snap: function () { return sim && { state: sim.state, x: sim.me.x, y: sim.me.y, on: sim.me.on, points: sim.points(), meters: sim.meters(), paused: paused, cw: cv.width, ch: cv.height }; }, auto: function (sec) { for (var i = 0; i < sec * 120 && sim.state === "run"; i++) { bot(sim); sim.step(); } paint(); return this.snap(); }, tick: function (sec) { for (var i = 0; i < sec * 120 && sim.state === "run"; i++) if (sim.step().length && sim.state !== "run") end(); paint(); }, sim: function () { return sim; } };
  // Where things stand in the card's still picture (the editor's stage, cw x ch px), the same arithmetic as draw(): the runner,
  // the items in sight ({t, x, y, w, h}; t as in lauf-engine.js), the title band. The parts of the card (src/teile.js) read it.
  function view(doc, cw, ch) {
    cw = cw || 540; ch = ch || 675;
    var s = still(doc), k = Math.min(ch / E.H, cw / VIEW), oy = oyOf(ch, k), cam = s.me.x - cw / k * 0.28, q = s.height() / E.PH, out = [], ahead = [], got = {};
    function px(x, y, w, h) { return { x: (x - cam) * k, y: y * k + oy, w: w * k, h: h * k }; }
    function each(it) {   // ahead: the first one of each sort still to come (the still picture often shows none yet)
      if (it.live === false || it.t === "g" || got[it.t]) return;
      var z = Math.max(it.w, it.h) * 1.25, r = it.t === "d" ? px(it.x, it.y, it.w, it.h) : px(it.x + it.w / 2 - z / 2, it.y + it.h / 2 - z / 2, z, z);
      r.t = it.t;
      if (r.x + r.w > 0 && r.x < cw && r.y + r.h > 0 && r.y < ch) out.push(r); else if (r.x >= cw) { got[it.t] = 1; ahead.push(r); }
    }
    var me = px(s.me.x - 30, s.me.y - 54 * q, 60, 60 * q);   // before the bot below runs on
    s.items.forEach(each);
    out.forEach(function (r) { got[r.t] = 1; });
    // a sort the rules ask for but not yet on the built track: the bot runs on (same seed, same track) until it comes
    var want = { o: s.p.hi, d: s.p.du, x: s.p.fa, c: s.p.mu, f: s.p.ge }, i, need = function () { for (var q in want) if (want[q] > 0 && !got[q]) return true; return false; };
    for (i = 0; i < 3000 && s.state === "run" && need(); i++) { bot(s); s.step(); s.items.forEach(each); }
    var f = Math.round(cw * 0.075);
    return { me: me, items: out, ahead: ahead, w: cw, h: ch, title: doc.t || t("lf_def"), band: { x: cw * 0.08, y: ch * 0.1 - f * 0.7, w: cw * 0.84, h: f * 1.4 } };
  }
  root.LaufUI = { play: play, draw: draw, fromWords: fromWords, view: view };
})(window);
