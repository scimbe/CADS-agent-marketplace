/* Arcade duels on screen: shelf tiles, the menu (bot or friend), the match loop, and the drawing with light,
   particles and screen shake (damped under prefers-reduced-motion). Rules and engines are in arcade.js/arcade2.js;
   a live match gets its connection, invite and badge from live-ui.js. All pictures are drawn here, all sounds are
   synthesized by Kit.tone or short noise bursts: no outside assets. */
(function () {
"use strict";
var Kit = window.Kit, A = window.Arcade, t = Kit.t, W = A.W, H = A.H;
var calm = false;
try { var mq = matchMedia("(prefers-reduced-motion: reduce)"); calm = mq.matches; if (mq.addEventListener) mq.addEventListener("change", function (e) { calm = e.matches; }); } catch (e) {}
var META = {
  puck: { e: "🏒", a: "#00e5ff", b: "#ff3b1d" }, ziegel: { e: "🧱", a: "#ff7a1a", b: "#e8d6bf" }, volley: { e: "🏐", a: "#2bd9a0", b: "#ffd400" },
  panzer: { e: "💥", a: "#7cdb3c", b: "#ff3b1d" }, kick: { e: "⚽", a: "#39ff88", b: "#ff5fa2" }, flipper: { e: "🎯", a: "#00f0ff", b: "#b04bff" },
  snow: { e: "❄️", a: "#4fc3ff", b: "#ff7a59" }, elfer: { e: "🥅", a: "#39ff88", b: "#ff2bd6" }, stock: { e: "🥌", a: "#20c9c9", b: "#e0863a" },
  murmel: { e: "🔮", a: "#ffd400", b: "#ff3b1d" }
};
var GLASS = ["#ff5fa2", "#4fc3ff", "#7cdb3c", "#ffd400", "#b04bff", "#ff7a1a", "#20c9c9", "#ffffff", "#ff3b1d"];
function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }
function ideas() { return ((window.DuellIdeas && window.DuellIdeas.ideas) || []).filter(function (i) { return i.kind === "arcade" && A.GAMES[i.arcade.g]; }); }
function idea(g) { return ideas().filter(function (i) { return i.arcade.g === g; })[0]; }

// ---------- sound: own tones, nothing loaded ----------
function noise(dur, freq, vol) {
  var a = Kit.audio(); if (!a) return;
  try {
    var n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = "lowpass"; f.frequency.value = freq; g.gain.value = vol; s.buffer = b; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  } catch (e) {}
}
var SND = {
  hit: function (v) { Kit.tone(260 + (v || 600) * 0.25, 160, 0.07, "square", 0.05); Kit.haptic(8); },
  soft: function () { Kit.tone(180, 120, 0.05, "triangle", 0.04); },
  crunch: function () { noise(0.18, 1800, 0.22); Kit.tone(220, 80, 0.12, "square", 0.05); Kit.haptic(14); },
  boom: function () { noise(0.5, 500, 0.4); Kit.tone(90, 35, 0.4, "sine", 0.25); Kit.haptic(30); },
  splash: function () { noise(0.3, 2600, 0.12); },
  whoosh: function () { noise(0.14, 3200, 0.06); },
  up: function () { [523, 659, 784].forEach(function (f, i) { Kit.tone(f, f * 1.01, 0.12, "triangle", 0.1, i * 0.07); }); },
  down: function () { Kit.tone(330, 110, 0.35, "sawtooth", 0.06); Kit.haptic(60); },
  pulse: function () { Kit.tone(440, 660, 0.08, "sine", 0.05); }
};

// ---------- the drawing: light sprites, particles, shake, flash ----------
var glowCache = {};
function glow(color) {
  if (glowCache[color]) return glowCache[color];
  var c = document.createElement("canvas"); c.width = c.height = 64; var x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color); g.addColorStop(0.25, color + "aa"); g.addColorStop(1, color + "00"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (glowCache[color] = c);
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function Painter(cv, g, opt) {
  opt = opt || {};
  var P = { cv: cv, g: g, m: META[g], ctx: cv.getContext("2d"), parts: [], texts: [], shake: 0, flash: 0, flashC: "#fff", trail: [], bg: null, bgKey: "", k: 1, ox: 0, oy: 0, silent: !!opt.silent, clock: 0, ring: null };
  P.fit = function () {
    if (!opt.fixed) {
      var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(60, Math.round((r.width || 300) * dpr));
      if (cv.width !== w) { cv.width = w; cv.height = Math.round(w * H / W); }
    }
    P.k = Math.min(cv.width / W, cv.height / H); P.ox = (cv.width - W * P.k) / 2; P.oy = (cv.height - H * P.k) / 2;
  };
  P.add = function (n, x, y, o) {
    n = Math.round(n * (calm ? 0.35 : 1));
    for (var i = 0; i < n && P.parts.length < 420; i++) {
      var a = o.dir != null ? o.dir + rnd(-(o.spread || 3.2), o.spread || 3.2) / 2 : rnd(0, 6.283), v = rnd(o.v0 || 60, o.v1 || 400);
      P.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(o.l0 || 0.3, o.l1 || 0.8), s: rnd(o.s0 || 4, o.s1 || 10), c: o.c || "#fff", g: o.g || 0, drag: o.drag == null ? 2 : o.drag, glow: !!o.glow, sq: !!o.sq });
    }
  };
  P.text = function (s, x, y, c) { P.texts.push({ s: s, x: x, y: y, c: c || "#fff", life: 0 }); };
  P.bump = function (s) { if (!calm) P.shake = Math.max(P.shake, s); };
  P.flashIt = function (a, c) { if (!calm) { P.flash = Math.max(P.flash, a); P.flashC = c || "#fff"; } };
  P.sound = function (k, v) { if (!P.silent && SND[k]) SND[k](v); };
  P.events = function (S) {
    var m = P.m;
    S.ev.splice(0).forEach(function (e) {
      switch (e.k) {
        case "hit": case "ohit": case "kick": case "flip": case "bump": {
          var v = e.v || 600;
          P.add(6 + v / 140, e.x, e.y, { c: e.k === "ohit" ? m.b : m.a, v0: 80, v1: 220 + v * 0.35, l1: 0.45, s0: 3, s1: 7, glow: true });
          P.bump(Math.min(9, v / 260)); P.sound("hit", v); break;
        }
        case "wall": case "net": P.add(4, e.x, e.y, { c: g === "snow" ? "#ffffff" : "#cfd8ff", v1: 200, l1: 0.3, s1: 5 }); P.sound(g === "snow" ? "crunch" : "soft"); if (g === "snow") P.bump(4); break;
        case "brick": P.add(18, e.x, e.y, { c: e.mine ? m.a : m.b, v0: 120, v1: 520, g: 1600, drag: 0.5, l0: 0.6, l1: 1.2, s0: 8, s1: 18, sq: true }); P.add(10, e.x, e.y, { c: "#c9b8a6", v1: 160, l1: 0.9, s0: 10, s1: 26, drag: 3 }); P.bump(8); P.sound("crunch"); break;
        case "lose": case "tank": case "splat":
          P.add(e.k === "splat" ? 30 : 34, e.x, Math.min(H - 20, e.y), { c: e.k === "splat" ? "#ffffff" : m.b, v0: 150, v1: 760, l0: 0.5, l1: 1.2, s0: 5, s1: 14, glow: e.k !== "splat", g: e.k === "splat" ? 900 : 0 });
          if (e.k === "tank") { P.add(20, e.x, e.y, { c: "#ffb347", v1: 520, l1: 1, s0: 10, s1: 24, glow: true }); P.sound("boom"); }
          if (e.k === "lose" || e.mine) { P.flashIt(0.32, "#ff3b1d"); P.bump(16); P.sound("down"); }
          break;
        case "score": P.add(26, e.x, Math.max(60, e.y), { c: m.a, v0: 120, v1: 640, l1: 1.1, s0: 4, s1: 11, glow: true }); P.flashIt(0.16, m.a); P.sound("up"); P.text("+" + (e.n || 1), W / 2, H * 0.3, m.a); break;
        case "serve": case "give": case "draw": P.ring = { x: e.x, y: e.y, t: 0, c: m.a }; P.sound("pulse"); break;
        case "jump": P.add(6, e.x, e.y, { c: "#f3d9a0", dir: -1.57, spread: 2.4, v1: 160, l1: 0.4, s0: 6, s1: 12 }); break;
        case "land": P.add(10, e.x, e.y, { c: "#f3d9a0", dir: -1.57, spread: 3, v1: 220, l1: 0.5, s0: 6, s1: 14, g: 600 }); P.sound("soft"); break;
        case "fire": P.add(10, e.x, e.y, { c: "#ffd27a", v1: 260, l1: 0.3, glow: true }); P.add(8, e.x, e.y, { c: "#9aa0a8", v1: 90, l1: 1.1, s0: 10, s1: 22, drag: 1 }); if (e.mine) P.bump(5); P.sound("whoosh"); break;
        case "boom":
          P.add(26, e.x, e.y, { c: "#ffb347", v0: 80, v1: 520, l1: 0.7, s0: 6, s1: 18, glow: true }); P.add(16, e.x, e.y, { c: "#6b4a2a", dir: -1.57, spread: 2.6, v0: 200, v1: 700, g: 1500, drag: 0.4, l0: 0.6, l1: 1.3, s0: 5, s1: 11, sq: true });
          P.add(10, e.x, e.y, { c: "#7d7f86", v1: 120, l1: 1.6, s0: 16, s1: 36, drag: 1 }); P.bump(12); P.flashIt(0.18, "#ffd27a"); P.sound("boom"); break;
        case "splash": P.add(18, e.x, e.y, { c: "#9fd8ff", dir: -1.57, spread: 1.4, v0: 200, v1: 620, g: 1500, drag: 0.3, l1: 1, s0: 4, s1: 9 }); P.sound("splash"); break;
        case "throw": P.sound("whoosh"); break;
        case "save": P.text("✋", e.x, H * 0.22, m.b); P.add(14, e.x, e.y, { c: m.b, v1: 400, l1: 0.6, glow: true }); P.sound("hit", 900); break;
        case "saved": P.text("✋", e.x, H * 0.75, m.a); P.add(18, e.x, e.y, { c: m.a, v1: 500, l1: 0.7, glow: true }); P.bump(8); P.sound("up"); break;
        case "miss": P.text("✗", e.x, H * 0.5, "#ffffff"); P.sound("soft"); break;
        case "out": P.add(16, e.x, e.y, { c: GLASS[e.c % GLASS.length], v1: 420, l1: 0.8, s0: 3, s1: 7, glow: true }); P.sound("crunch"); P.bump(5); break;
        case "won": [m.a, m.b].forEach(function (c) { P.add(50, W / 2, H * 0.4, { c: c, v0: 200, v1: 900, g: 700, l0: 1, l1: 2, s0: 6, s1: 14, sq: true, drag: 0.6 }); }); P.sound("up"); break;
        case "lost": P.flashIt(0.25, "#000"); break;
      }
    });
  };
  P.frame = function (S, dt, extra) {
    // a frame's time may lie a moment before the last one (the first frame starts with performance.now(), the next rAF
    // with its frame's start): time never runs backwards here, else a ring or a spark gets a negative radius
    dt = Math.max(0, dt || 0);
    var c = P.ctx; extra = extra || {}; P.clock += dt; P.fit();
    var key = S.seed + "|" + cv.width + "|" + g; if (P.bgKey !== key) { P.bg = makeBg(P, S); P.bgKey = key; }
    P.events(S);
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = "#07070b"; c.fillRect(0, 0, cv.width, cv.height);
    var sx = 0, sy = 0; if (P.shake > 0.1) { sx = rnd(-P.shake, P.shake); sy = rnd(-P.shake, P.shake); } P.shake *= Math.exp(-dt * 9);
    c.drawImage(P.bg, P.ox + sx * P.k, P.oy + sy * P.k);
    c.setTransform(P.k, 0, 0, P.k, P.ox + sx * P.k, P.oy + sy * P.k);
    if (S.flip) c.transform(-1, 0, 0, -1, W, H);   // the invited phone sees the shared frame of the turn games turned around
    DRAW[g].fg(c, S, P, extra);
    for (var i = P.parts.length - 1; i >= 0; i--) {
      var p = P.parts[i]; p.life += dt; if (p.life >= p.max) { P.parts.splice(i, 1); continue; }
      var f = Math.exp(-p.drag * dt); p.vx *= f; p.vy = p.vy * f + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      var a = 1 - p.life / p.max;
      if (p.glow) { c.globalCompositeOperation = "lighter"; c.globalAlpha = a; var s = p.s * 3; c.drawImage(glow(p.c), p.x - s, p.y - s, s * 2, s * 2); c.globalCompositeOperation = "source-over"; }
      else { c.globalAlpha = a; c.fillStyle = p.c; if (p.sq) c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s * 0.7); else { c.beginPath(); c.arc(p.x, p.y, p.s / 2, 0, 6.283); c.fill(); } }
    }
    c.globalAlpha = 1;
    if (P.ring) { P.ring.t += dt; c.strokeStyle = P.ring.c; c.globalAlpha = Math.max(0, 1 - P.ring.t * 1.6); c.lineWidth = 6; c.beginPath(); c.arc(P.ring.x, P.ring.y, P.ring.t * 500, 0, 6.283); c.stroke(); c.globalAlpha = 1; if (P.ring.t > 0.7) P.ring = null; }
    c.setTransform(P.k, 0, 0, P.k, P.ox, P.oy);
    P.texts = P.texts.filter(function (x) { x.life += dt; return x.life < 1.1; });
    c.textAlign = "center"; c.font = "400 120px Anton, Impact, sans-serif";
    P.texts.forEach(function (x) { c.globalAlpha = Math.max(0, 1 - x.life / 1.1); c.fillStyle = x.c; c.fillText(x.s, x.x, x.y - x.life * (calm ? 0 : 90)); });
    c.globalAlpha = 1;
    if (P.flash > 0.01) { c.globalAlpha = P.flash; c.fillStyle = P.flashC; c.fillRect(0, 0, W, H); c.globalAlpha = 1; P.flash *= Math.exp(-dt * 7); }
    if (extra.count) { c.fillStyle = "#fff"; c.font = "400 260px Anton, Impact, sans-serif"; c.globalAlpha = 0.9; c.fillText(extra.count, W / 2, H / 2 + 90); c.globalAlpha = 1; }
  };
  return P;
}
function makeBg(P, S) {
  var b = document.createElement("canvas"); b.width = Math.max(1, Math.round(W * P.k)); b.height = Math.max(1, Math.round(H * P.k));
  var c = b.getContext("2d"); c.setTransform(P.k, 0, 0, P.k, 0, 0); DRAW[P.g].bg(c, S, P); return b;
}
function lin(c, y0, y1, stops) { var g = c.createLinearGradient(0, y0, 0, y1); stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); }); return g; }
function rad(c, x, y, r, a, b) { var g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function light(c, x, y, r, color, a) { c.globalCompositeOperation = "lighter"; c.globalAlpha = a == null ? 0.8 : a; c.drawImage(glow(color), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; }
function disc(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function vignette(c) { c.fillStyle = rad(c, W / 2, H / 2, H * 0.75, "rgba(0,0,0,0)", "rgba(0,0,0,0.55)"); c.fillRect(0, 0, W, H); }
function specks(c, n, col, seed, size) { var r = A.rng(seed); c.fillStyle = col; for (var i = 0; i < n; i++) c.fillRect(r() * W, r() * H, size || 3, size || 3); }
function trail(P, x, y, n) { P.trail.push([x, y]); if (P.trail.length > (calm ? 4 : n || 12)) P.trail.shift(); }
function drawTrail(c, P, r, color) { for (var i = 0; i < P.trail.length; i++) { var a = (i + 1) / P.trail.length; c.globalAlpha = a * 0.35; disc(c, P.trail[i][0], P.trail[i][1], r * (0.4 + 0.6 * a), color); } c.globalAlpha = 1; }

// ---------- one look per game ----------
var DRAW = {
  puck: {
    bg: function (c, S, P) {
      var m = P.m, U = A.PUCK, r = A.rng("ice");
      c.fillStyle = rad(c, W / 2, H / 2, H * 0.7, "#0e3342", "#03101a"); c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(180,240,255,0.06)"; c.lineWidth = 2;
      for (var i = 0; i < 70; i++) { var x = r() * W, y = r() * H; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 160, y + (r() - 0.5) * 60); c.stroke(); }
      c.strokeStyle = "rgba(0,229,255,0.35)"; c.lineWidth = 6; c.setLineDash([24, 18]); c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(W / 2, H / 2, 150, 0, 6.283); c.stroke();
      [[H, m.a], [0, m.b]].forEach(function (q) { c.fillStyle = "#000"; c.fillRect(W / 2 - U.GOAL / 2, q[0] - 16, U.GOAL, 32); c.shadowColor = q[1]; c.shadowBlur = 30; c.strokeStyle = q[1]; c.lineWidth = 8; c.strokeRect(W / 2 - U.GOAL / 2, q[0] - 16, U.GOAL, 32); c.shadowBlur = 0; });
      c.shadowColor = "#7fe9ff"; c.shadowBlur = 24; c.strokeStyle = "#bff6ff"; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10); c.shadowBlur = 0;
      vignette(c);
    },
    fg: function (c, S, P) {
      var st = S.st, m = P.m, U = A.PUCK, p = st.p;
      [[st.opp, m.b], [st.me, m.a]].forEach(function (q) {
        var x = q[0].x, y = q[0].y; light(c, x, y, U.MR * 2.4, q[1], 0.55);
        disc(c, x, y, U.MR, rad(c, x - 20, y - 20, U.MR * 1.4, "#ffffff", q[1])); disc(c, x, y, U.MR * 0.55, q[1]); disc(c, x - 8, y - 10, U.MR * 0.3, "rgba(255,255,255,0.65)");
      });
      if (p) { trail(P, p.x, p.y); drawTrail(c, P, U.PR, "#bff6ff"); light(c, p.x, p.y, U.PR * 3.5, "#7fe9ff", 0.7); disc(c, p.x, p.y, U.PR, "#f4fbff"); disc(c, p.x, p.y, U.PR * 0.7, "#1c2a33"); disc(c, p.x, p.y, U.PR * 0.45, "#e6f7ff"); }
      else P.trail.length = 0;
    }
  },
  ziegel: {
    bg: function (c) {
      c.fillStyle = lin(c, 0, H, ["#1e130c", "#2a1a10", "#1e130c"]); c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(255,180,120,0.05)"; c.lineWidth = 3;
      for (var y = 0; y < H; y += 60) for (var x = (y / 60) % 2 ? 0 : 60; x < W; x += 120) c.strokeRect(x, y, 120, 60);
      c.strokeStyle = "rgba(255,122,26,0.35)"; c.lineWidth = 5; c.setLineDash([20, 20]); c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); c.setLineDash([]);
      vignette(c);
    },
    fg: function (c, S, P) {
      var st = S.st, m = P.m, Z = A.ZIEGEL, bw = W / Z.NB, b = st.b;
      function wall(list, y, col) {
        list.forEach(function (on, i) {
          var x = i * bw;
          if (!on) { c.fillStyle = "rgba(120,90,70,0.5)"; for (var k = 0; k < 4; k++) c.fillRect(x + 14 + k * 26, y + Z.BH / 2 - 8 + (k % 2) * 6, 18, 10); return; }
          c.fillStyle = col; c.fillRect(x + 4, y - Z.BH / 2, bw - 8, Z.BH);
          c.fillStyle = "rgba(255,255,255,0.25)"; c.fillRect(x + 4, y - Z.BH / 2, bw - 8, 7);
          c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(x + 4, y + Z.BH / 2 - 7, bw - 8, 7);
        });
      }
      wall(st.mine, Z.WY, m.a); wall(st.theirs, H - Z.WY, m.b);
      [[st.me, Z.PY, m.a], [st.opp, H - Z.PY, m.b]].forEach(function (q) { light(c, q[0], q[1], 180, q[2], 0.35); c.fillStyle = q[2]; rrect(c, q[0] - Z.PW / 2, q[1] - 12, Z.PW, 24, 12); c.fill(); c.fillStyle = "rgba(255,255,255,0.5)"; c.fillRect(q[0] - Z.PW / 2 + 14, q[1] - 8, Z.PW - 28, 5); });
      if (b) { trail(P, b.x, b.y, 14); drawTrail(c, P, Z.R * 1.3, "#ff9a3c"); light(c, b.x, b.y, 90, "#ff7a1a", 0.9); disc(c, b.x, b.y, Z.R, "#fff3d6"); } else P.trail.length = 0;
    }
  },
  volley: {
    bg: function (c) {
      var V = A.VOLLEY;
      c.fillStyle = lin(c, 0, V.FY, ["#06222b", "#0b3d4a", "#1d7a85"]); c.fillRect(0, 0, W, V.FY);
      specks(c, 60, "rgba(255,255,255,0.5)", "stars", 3);
      light(c, 780, 260, 220, "#bfffe9", 0.35); disc(c, 780, 260, 60, "#e9fff6");
      c.fillStyle = "#0e5560"; c.beginPath(); c.moveTo(0, V.FY - 120); c.quadraticCurveTo(250, V.FY - 220, 520, V.FY - 110); c.quadraticCurveTo(780, V.FY - 30, W, V.FY - 140); c.lineTo(W, V.FY); c.lineTo(0, V.FY); c.fill();
      c.fillStyle = lin(c, V.FY, H, ["#f3d9a0", "#c99a5a"]); c.fillRect(0, V.FY, W, H - V.FY);
      specks(c, 220, "rgba(120,80,30,0.35)", "sand", 4);
      c.fillStyle = "#e9eef0"; c.fillRect(V.NX - 6, V.NT, 12, V.FY - V.NT);
      c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 2; for (var y = V.NT + 10; y < V.FY - 140; y += 22) { c.beginPath(); c.moveTo(V.NX - V.NW, y); c.lineTo(V.NX + V.NW, y); c.stroke(); }
      disc(c, V.NX, V.NT, V.NW + 4, "#ffffff");
    },
    fg: function (c, S, P) {
      var st = S.st, m = P.m, V = A.VOLLEY, b = st.b;
      if (b) { var h = Math.max(0, V.FY - b.y), sc = Math.max(0.3, 1 - h / 1100); c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(b.x, V.FY + 8, V.BR * 1.3 * sc, 12 * sc, 0, 0, 6.283); c.fill(); }
      function fig(f, col, face) {   // an angular figure with a visor that looks at the ball
        var sq = f.y >= V.FY - V.PRAD - 1 ? 1 : 1.08;
        c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(f.x, V.FY + 6, 70, 12, 0, 0, 6.283); c.fill();
        light(c, f.x, f.y, 150, col, 0.3);
        c.fillStyle = col; rrect(c, f.x - 62, f.y - V.PRAD * sq, 124, V.PRAD * 2 * sq - 18, 34); c.fill();
        c.fillStyle = "rgba(0,0,0,0.75)"; rrect(c, f.x - 44 + face * 10, f.y - V.PRAD * sq + 22, 88, 30, 14); c.fill();
        c.fillStyle = "#fff"; c.fillRect(f.x + face * 26 - 6, f.y - V.PRAD * sq + 30, 12, 14);
        c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(f.x - 40, f.y + V.PRAD - 26, 26, 22); c.fillRect(f.x + 14, f.y + V.PRAD - 26, 26, 22);
      }
      fig(st.me, m.a, b && b.x > st.me.x ? 1 : -1); fig(st.opp, m.b, b && b.x > st.opp.x ? 1 : -1);
      if (b) {
        trail(P, b.x, b.y, 8); drawTrail(c, P, V.BR, "#fff6c4"); light(c, b.x, b.y, V.BR * 3, "#ffe680", 0.6);
        disc(c, b.x, b.y, V.BR, "#fff8e1"); c.strokeStyle = "#e0b400"; c.lineWidth = 5; var spin = b.x / 40;
        for (var k = 0; k < 3; k++) { c.beginPath(); c.arc(b.x, b.y, V.BR * 0.8, spin + k * 2.09, spin + k * 2.09 + 1.2); c.stroke(); }
      } else P.trail.length = 0;
    }
  },
  panzer: {
    bg: function (c) {
      c.fillStyle = lin(c, 0, H, ["#141d45", "#3a3a7a", "#c86a5a", "#f6b26b"]); c.fillRect(0, 0, W, H);
      light(c, W * 0.5, H * 0.72, 320, "#ffd38a", 0.6); disc(c, W * 0.5, H * 0.72, 90, "#ffe2a8");
      specks(c, 50, "rgba(255,255,255,0.6)", "stars2", 3);
    },
    fg: function (c, S, P, x) {
      var st = S.st, m = P.m, Z = A.PANZER, T = st.T, cw = W / Z.N, now = P.clock, i;
      c.fillStyle = "rgba(255,255,255,0.18)";   // clouds drift with the wind
      for (var k = 0; k < 4; k++) { var cx = ((k * 330 + now * st.wind * 0.6) % (W + 300) + W + 300) % (W + 300) - 150, cy = 220 + k * 140; c.beginPath(); c.ellipse(cx, cy, 120, 34, 0, 0, 6.283); c.ellipse(cx + 60, cy - 20, 80, 30, 0, 0, 6.283); c.fill(); }
      c.beginPath(); c.moveTo(0, T[0]); for (i = 0; i < Z.N; i++) c.lineTo((i + 0.5) * cw, T[i]); c.lineTo(W, T[Z.N - 1]); c.lineTo(W, H); c.lineTo(0, H); c.closePath();
      c.fillStyle = lin(c, H - 760, Z.SEA + 40, ["#7cdb3c", "#4f8f2a", "#5a3b1e"]); c.fill(); c.strokeStyle = "#b6ff7a"; c.lineWidth = 6; c.stroke();
      c.globalAlpha = 0.88; c.fillStyle = lin(c, Z.SEA, H, ["#1c6fb8", "#0b2d55"]); c.fillRect(0, Z.SEA, W, H - Z.SEA); c.globalAlpha = 1;   // the sea in front of the shore
      c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 4; c.beginPath();
      for (var w = 0; w <= W; w += 20) { var y = Z.SEA + Math.sin(w / 60 + now * 2) * 6; if (w) c.lineTo(w, y); else c.moveTo(w, y); } c.stroke();
      [[true, st.aim, m.a], [false, st.oppAim, m.b]].forEach(function (q) {
        var p = A.tankPos(T, q[0]), a = Math.atan2(q[1].vy || -600, q[1].vx || (q[0] ? 500 : -500));
        light(c, p.x, p.y, 110, q[2], 0.3);
        c.strokeStyle = "#333"; c.lineWidth = 14; c.lineCap = "round"; c.beginPath(); c.moveTo(p.x, p.y - 22); c.lineTo(p.x + Math.cos(a) * 70, p.y - 22 + Math.sin(a) * 70); c.stroke(); c.lineCap = "butt";
        c.fillStyle = q[2]; rrect(c, p.x - 50, p.y - 18, 100, 34, 8); c.fill(); disc(c, p.x, p.y - 22, 26, q[2]);
        c.fillStyle = "#222"; rrect(c, p.x - 56, p.y + 10, 112, 20, 10); c.fill();
      });
      st.shells.forEach(function (s) { light(c, s.x, s.y, 50, s.mine ? m.a : m.b, 0.9); disc(c, s.x, s.y, 9, "#fff"); if (!calm && Math.random() < 0.5) P.add(1, s.x, s.y, { c: "#b9bcc4", v1: 30, l1: 0.8, s0: 8, s1: 14, drag: 1 }); });
      if (x.aim) {   // the first part of the own shot, dotted: aiming is fair, not free
        var mz = A.tankPos(T, true), p2 = { x: mz.x, y: mz.y - 22, vx: x.aim.vx, vy: x.aim.vy };
        for (var j = 0; j < 22; j++) { for (var q2 = 0; q2 < 3; q2++) { p2.vx += st.wind / 120; p2.vy += Z.G / 120; p2.x += p2.vx / 120; p2.y += p2.vy / 120; } disc(c, p2.x, p2.y, 5, "rgba(255,255,255," + (1 - j / 22).toFixed(2) + ")"); }
      }
      c.fillStyle = "#fff"; c.font = "900 44px system-ui, sans-serif"; c.textAlign = "center";
      var wa = st.wind / Z.WMAX; c.fillText("💨 " + (wa > 0 ? "→" : "←").repeat(1 + Math.round(Math.abs(wa) * 2)), W / 2, 90);
      var tp = A.tankPos(T, true); c.fillStyle = "rgba(0,0,0,0.4)"; c.fillRect(tp.x - 50, tp.y + 40, 100, 10); c.fillStyle = st.reload >= 1 ? m.a : "#ffffff"; c.fillRect(tp.x - 50, tp.y + 40, 100 * st.reload, 10);
    }
  },
  kick: {
    bg: function (c) {
      var K = A.KICK;
      c.fillStyle = "#3a2414"; c.fillRect(0, 0, W, H);
      for (var y = 0; y < H; y += 100) { c.fillStyle = (y / 100) % 2 ? "#1f7a3a" : "#238a42"; c.fillRect(20, y, W - 40, 100); }
      c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 6; c.strokeRect(30, 30, W - 60, H - 60);
      c.beginPath(); c.moveTo(30, H / 2); c.lineTo(W - 30, H / 2); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 130, 0, 6.283); c.stroke();
      c.strokeRect(W / 2 - 260, 30, 520, 200); c.strokeRect(W / 2 - 260, H - 230, 520, 200);
      c.fillStyle = "#111"; c.fillRect(W / 2 - K.GOAL / 2, 0, K.GOAL, 22); c.fillRect(W / 2 - K.GOAL / 2, H - 22, K.GOAL, 22);
      [K.KY, K.SY, H - K.KY, H - K.SY].forEach(function (y) { c.fillStyle = "rgba(0,0,0,0.25)"; c.fillRect(0, y + 6, W, 12); c.fillStyle = lin(c, y - 7, y + 7, ["#e8e8e8", "#8a8a8a"]); c.fillRect(0, y - 7, W, 14); });
      vignette(c);
    },
    fg: function (c, S, P) {
      var st = S.st, m = P.m, K = A.KICK, b = st.b;
      function man(x, y, col, dir, kick) {   // a figure seen from above: body, head, foot
        var dy = kick * 26 * dir; c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(x + 6, y + 10, 30, 22, 0, 0, 6.283); c.fill();
        c.fillStyle = col; rrect(c, x - 30, y - 20 + dy, 60, 40, 14); c.fill(); disc(c, x, y + dy, 17, "#f2c9a0"); c.fillStyle = "#222"; c.fillRect(x - 10, y + dy + 22 * dir, 20, 18 * dir);
        if (kick > 0) light(c, x, y + dy, 70, col, 0.6 * kick);
      }
      A.kickRods(st.opp).forEach(function (f) { man(f.x, H - f.y, m.b, 1, st.oppKick); });
      A.kickRods(st.c).forEach(function (f) { man(f.x, f.y, m.a, -1, st.kick); });
      if (b) { trail(P, b.x, b.y, 10); drawTrail(c, P, K.R, "#ffffff"); light(c, b.x, b.y, 70, "#ffffff", 0.5); disc(c, b.x, b.y, K.R, "#fafafa"); var s = b.x / 30 + b.y / 30; for (var k = 0; k < 3; k++) disc(c, b.x + Math.cos(s + k * 2.1) * 13, b.y + Math.sin(s + k * 2.1) * 13, 6, "#222"); }
      else P.trail.length = 0;
    }
  },
  flipper: {
    bg: function (c, S, P) {
      var F = A.FLIP, m = P.m;
      c.fillStyle = lin(c, 0, H, ["#140626", "#22093f", "#140626"]); c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(176,75,255,0.12)"; c.lineWidth = 2; for (var x = 0; x <= W; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } for (var y = 0; y <= H; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.shadowBlur = 22; c.lineWidth = 10; c.lineCap = "round";
      [[false, m.a], [true, m.b]].forEach(function (q) {
        function px(x) { return q[0] ? W - x : x; } function py(y) { return q[0] ? H - y : y; }
        c.shadowColor = q[1]; c.strokeStyle = q[1];
        c.beginPath(); c.moveTo(px(0), py(F.LANE)); c.lineTo(px(F.PX), py(F.PY)); c.stroke(); c.beginPath(); c.moveTo(px(W), py(F.LANE)); c.lineTo(px(W - F.PX), py(F.PY)); c.stroke();
      });
      c.shadowBlur = 0; c.lineCap = "butt";
      vignette(c);
    },
    fg: function (c, S, P) {
      var st = S.st, m = P.m, F = A.FLIP, b = st.b;
      st.bumps.forEach(function (bp, j) {
        [[bp.x, bp.y, m.a, st.lit[j]], [W - bp.x, H - bp.y, m.b, 0]].forEach(function (q) { light(c, q[0], q[1], F.BR * (2.4 + q[3] * 1.5), q[2], 0.4 + q[3] * 0.6); disc(c, q[0], q[1], F.BR, q[2]); disc(c, q[0], q[1], F.BR * 0.6, "#140626"); disc(c, q[0], q[1], F.BR * 0.35, q[3] > 0 ? "#fff" : q[2]); });
      });
      function flip(s, col) { c.strokeStyle = col; c.lineCap = "round"; c.lineWidth = F.T * 2.4; c.beginPath(); c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); c.stroke(); c.lineWidth = F.T; c.strokeStyle = "rgba(255,255,255,0.6)"; c.beginPath(); c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); c.stroke(); c.lineCap = "butt"; disc(c, s.ax, s.ay, 16, "#fff"); }
      for (var k = 0; k < 2; k++) {
        var s = A.flipSeg(k === 0, st.a[k]); light(c, (s.ax + s.bx) / 2, (s.ay + s.by) / 2, 170, m.a, 0.35); flip(s, m.a);
        var o = A.flipSeg(k === 0, st.opp[k]); flip({ ax: W - o.ax, ay: H - o.ay, bx: W - o.bx, by: H - o.by }, m.b);
      }
      if (b) { trail(P, b.x, b.y, 14); drawTrail(c, P, F.R, "#bff6ff"); light(c, b.x, b.y, 70, "#9ff3ff", 0.8); disc(c, b.x, b.y, F.R, rad(c, b.x - 6, b.y - 6, F.R * 1.6, "#ffffff", "#6b7c8a")); } else P.trail.length = 0;
    }
  },
  snow: {
    bg: function (c) {
      c.fillStyle = lin(c, 0, H, ["#cfe3f5", "#f4f9ff", "#cfe3f5"]); c.fillRect(0, 0, W, H);
      specks(c, 160, "rgba(120,160,200,0.18)", "prints", 8);
      c.fillStyle = "rgba(255,255,255,0.8)"; c.beginPath(); c.ellipse(W / 2, H / 2, W * 0.6, 26, 0, 0, 6.283); c.fill();
      c.strokeStyle = "rgba(80,130,180,0.25)"; c.lineWidth = 4; c.setLineDash([16, 16]); [A.SNOW.FY + 60, H - A.SNOW.FY - 60].forEach(function (y) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }); c.setLineDash([]);
    },
    fg: function (c, S, P) {
      var st = S.st, m = P.m, N = A.SNOW;
      function wall(w, col) {
        if (w.hp <= 0) { c.fillStyle = "rgba(255,255,255,0.7)"; c.beginPath(); c.ellipse(w.x, w.y + 10, N.WW / 2, 12, 0, 0, 6.283); c.fill(); return; }
        var h = N.WH * (0.5 + 0.5 * w.hp / N.HP);
        c.fillStyle = "rgba(60,100,140,0.2)"; c.fillRect(w.x - N.WW / 2 + 6, w.y - h / 2 + 10, N.WW, h);
        c.fillStyle = "#ffffff"; rrect(c, w.x - N.WW / 2, w.y - h / 2, N.WW, h, 16); c.fill(); c.strokeStyle = col; c.lineWidth = 4; c.stroke();
      }
      st.mine.forEach(function (w) { wall(w, m.a); }); st.theirs.forEach(function (w) { wall(w, m.b); });
      function guy(x, y, col, up) {   // a round figure in a thick jacket with a hood
        c.fillStyle = "rgba(60,100,140,0.25)"; c.beginPath(); c.ellipse(x + 8, y + 14, N.FR, N.FR * 0.6, 0, 0, 6.283); c.fill();
        disc(c, x, y, N.FR, col); disc(c, x, y + up * 6, N.FR * 0.62, "#ffe0c2"); c.fillStyle = col; c.fillRect(x - N.FR, y - up * 6 - 6, N.FR * 2, 12);
      }
      guy(st.opp, H - N.FY, m.b, -1); guy(st.me.x, N.FY, m.a, 1);
      st.balls.forEach(function (b) { c.fillStyle = "rgba(60,100,140,0.25)"; c.beginPath(); c.ellipse(b.x + 10, b.y + 16, N.R, N.R * 0.6, 0, 0, 6.283); c.fill(); disc(c, b.x, b.y, N.R + 2, "#ffffff"); disc(c, b.x - 4, b.y - 4, N.R * 0.5, "#e6f2ff"); });
      for (var k = 0; k < N.AMMO; k++) disc(c, st.me.x - 40 + k * 40, N.FY + 78, 12, k < st.ammo ? m.a : "rgba(0,0,0,0.15)");
      if (!calm && Math.random() < 0.4) P.add(1, Math.random() * W, -10, { c: "#ffffff", dir: 1.57, spread: 0.6, v0: 60, v1: 140, l0: 4, l1: 7, s0: 4, s1: 8, drag: 0 });
    }
  },
  elfer: {
    bg: function (c) {
      for (var y = 0; y < H; y += 110) { c.fillStyle = (y / 110) % 2 ? "#0f4a26" : "#12572d"; c.fillRect(0, y, W, 110); }
      [[0, 0], [W, 0], [0, H], [W, H]].forEach(function (p) { light(c, p[0], p[1], 520, "#e8ffe0", 0.35); });
      c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 6; c.strokeRect(W / 2 - 380, -10, 760, 520); c.strokeRect(W / 2 - 380, H - 510, 760, 520);
      vignette(c);
    },
    fg: function (c, S, P, x) {
      var st = S.st, m = P.m, E = A.ELF, top = st.shooting, gy = top ? E.GY : H - E.GY, ky = top ? E.KY : H - E.KY;
      c.fillStyle = "rgba(0,0,0,0.35)"; c.fillRect(W / 2 - E.GW / 2, top ? 0 : gy, E.GW, top ? gy : H - gy);
      c.strokeStyle = "rgba(255,255,255,0.25)"; c.lineWidth = 2; for (var nx = W / 2 - E.GW / 2; nx <= W / 2 + E.GW / 2; nx += 26) { c.beginPath(); c.moveTo(nx, top ? 0 : gy); c.lineTo(nx, top ? gy : H); c.stroke(); }
      c.strokeStyle = "#fff"; c.lineWidth = 12; c.beginPath(); c.moveTo(W / 2 - E.GW / 2, top ? 0 : H); c.lineTo(W / 2 - E.GW / 2, gy); c.lineTo(W / 2 + E.GW / 2, gy); c.lineTo(W / 2 + E.GW / 2, top ? 0 : H); c.stroke();
      var kx = top ? st.opp : st.k.x, kc = top ? m.b : m.a, kv = top ? (st.oppV || 0) : st.k.vx, wide = Math.abs(kv) > 700 ? E.KDIVE : E.KW;
      light(c, kx, ky, 170, kc, 0.4); c.fillStyle = kc; rrect(c, kx - wide, ky - 22, wide * 2, 44, 22); c.fill(); disc(c, kx, ky, 26, "#f2c9a0");
      var spot = top ? st.spot : { x: W - st.spot.x, y: H - st.spot.y };
      disc(c, spot.x, spot.y, 8, "rgba(255,255,255,0.8)");
      if (st.phase === "aim") disc(c, spot.x, spot.y + (top ? 80 : -80), 30, top ? m.a : m.b);
      var b = st.b || (st.phase === "aim" ? { x: spot.x, y: spot.y } : null);
      if (b) { if (st.phase === "fly") { trail(P, b.x, b.y, 10); drawTrail(c, P, E.R, "#ffffff"); } else P.trail.length = 0; light(c, b.x, b.y, 70, "#ffffff", 0.45); disc(c, b.x, b.y, E.R, "#fafafa"); disc(c, b.x + 6, b.y - 4, 7, "#222"); }
      if (x.swipe && x.swipe.length > 1) { c.strokeStyle = m.a; c.lineWidth = 10; c.lineCap = "round"; c.globalAlpha = 0.7; c.beginPath(); x.swipe.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.stroke(); c.globalAlpha = 1; c.lineCap = "butt"; }
    }
  },
  stock: {
    bg: function (c) {
      var D = A.STOCK, r = A.rng("rink");
      c.fillStyle = lin(c, 0, H, ["#bfeff0", "#e9fbfb", "#bfeff0"]); c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(60,140,150,0.10)"; c.lineWidth = 2; for (var i = 0; i < 90; i++) { var x = r() * W, y = r() * H; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 220, y + (r() - 0.5) * 40); c.stroke(); }
      [[D.RINGS[2], "#e0863a"], [D.RINGS[1], "#ffffff"], [D.RINGS[0], "#20c9c9"]].forEach(function (q) { disc(c, D.TX, D.TY, q[0], q[1]); });
      disc(c, D.TX, D.TY, 18, "#ffffff");
      c.strokeStyle = "rgba(30,60,80,0.4)"; c.lineWidth = 6; [D.FROM, H - D.FROM].forEach(function (y) { c.beginPath(); c.moveTo(80, y); c.lineTo(W - 80, y); c.stroke(); });
      c.fillStyle = "#8a5a32"; c.fillRect(0, 0, 18, H); c.fillRect(W - 18, 0, 18, H);
    },
    fg: function (c, S, P, x) {
      var st = S.st, m = P.m;
      st.list.forEach(function (s) {
        var col = s.p === S.me ? m.a : m.b, sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        c.fillStyle = "rgba(20,60,70,0.25)"; c.beginPath(); c.ellipse(s.x + 6, s.y + 10, s.r, s.r * 0.8, 0, 0, 6.283); c.fill();
        if (sp > 50) light(c, s.x, s.y, s.r * 2.6, col, Math.min(0.6, sp / 1500));
        disc(c, s.x, s.y, s.r, rad(c, s.x - 12, s.y - 12, s.r * 1.6, "#ffffff", "#6c7a80")); disc(c, s.x, s.y, s.r * 0.72, col);
        c.fillStyle = "#222"; rrect(c, s.x - 8, s.y - s.r * 0.55, 16, s.r * 1.1, 8); c.fill();
        if (s.hit) { P.add(6, s.x, s.y, { c: "#ffffff", v1: 260, l1: 0.35, s1: 6 }); P.sound("hit", s.hit); s.hit = 0; }
      });
      aimDots(c, S, x, m.a, A.STOCK);
    }
  },
  murmel: {
    bg: function (c) {
      c.fillStyle = rad(c, W / 2, H / 2, H * 0.7, "#4b2a76", "#1c0d30"); c.fillRect(0, 0, W, H);
      specks(c, 900, "rgba(255,255,255,0.04)", "felt", 3);
    },
    fg: function (c, S, P, x) {
      var st = S.st, m = P.m;
      c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 8; c.setLineDash([28, 14]); c.beginPath(); c.arc(W / 2, H / 2, st.r, 0, 6.283); c.stroke(); c.setLineDash([]);
      [[H / 2 + st.r + 80, 0], [H / 2 - st.r - 80, 1]].forEach(function (q) { c.strokeStyle = q[1] === S.me ? m.a : m.b; c.globalAlpha = 0.5; c.lineWidth = 4; c.beginPath(); c.moveTo(W / 2 - 260, q[0]); c.lineTo(W / 2 + 260, q[0]); c.stroke(); c.globalAlpha = 1; });
      st.list.forEach(function (s) {
        var col = s.shooter ? (s.p === S.me ? m.a : m.b) : GLASS[s.c % GLASS.length];
        c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.ellipse(s.x + 6, s.y + 8, s.r, s.r * 0.7, 0, 0, 6.283); c.fill();
        light(c, s.x, s.y, s.r * 2.2, col, 0.35); disc(c, s.x, s.y, s.r, rad(c, s.x - 8, s.y - 8, s.r * 1.5, "#ffffff", col)); disc(c, s.x - s.r * 0.35, s.y - s.r * 0.35, s.r * 0.25, "rgba(255,255,255,0.85)");
        if (s.hit) { P.add(5, s.x, s.y, { c: col, v1: 240, l1: 0.3, s1: 5, glow: true }); P.sound("hit", s.hit); s.hit = 0; }
      });
      aimDots(c, S, x, m.a, A.MURMEL);
    }
  }
};
// The dotted first part of the own throw in the turn games (drawn in the shared frame).
function aimDots(c, S, x, col, D) {
  if (!x.aim || !S.mineTurn()) return;
  var p = { x: x.aim.x, y: x.aim.y, vx: x.aim.vx, vy: x.aim.vy }, v = Math.hypot(p.vx, p.vy);
  disc(c, p.x, p.y, D.R, "rgba(255,255,255,0.35)");
  for (var i = 0; i < 18 && v > 1; i++) { var dt = 0.05, nv = Math.max(0, v - D.DECEL * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= nv / v; p.vy *= nv / v; v = nv; disc(c, p.x, p.y, 6, col); }
}

// ---------- input: one thumb per game, in the own frame ----------
function controls(cv, g, S, X) {
  var down = null, pts = {};
  function at(e) { var r = cv.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H), ox = (r.width - W * k) / 2, oy = (r.height - H * k) / 2; return { x: (e.clientX - r.left - ox) / k, y: (e.clientY - r.top - oy) / k }; }
  function flips() { var l = false, r = false; for (var id in pts) { if (pts[id] < W / 2) l = true; else r = true; } S.input({ flip: [l, r] }); }
  function turnShot(p) {   // slingshot for the turn games: pull back from where the finger went down
    var D = g === "stock" ? A.STOCK : A.MURMEL, vx = (down.x - p.x) * 2.4, vy = (down.y - p.y) * 2.4, from = g === "stock" ? W / 2 : down.from;
    var sy = g === "stock" ? H - D.FROM : H / 2 + S.st.r + 80;
    down.shot = { x: from, vx: vx, vy: vy };
    X.aim = S.flip ? { x: W - from, y: H - sy, vx: -vx, vy: -vy } : { x: from, y: sy, vx: vx, vy: vy };   // the dots live in the shared frame
  }
  cv.addEventListener("pointerdown", function (e) {
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    var p = at(e); down = { x: p.x, y: p.y, t: performance.now(), path: [[p.x, p.y]] };
    if (g === "puck") S.input({ x: p.x, y: p.y - 50 });
    else if (g === "ziegel") S.input({ x: p.x });
    else if (g === "volley") S.input({ x: p.x, jump: p.y < A.VOLLEY.FY - 60 });
    else if (g === "kick") S.input({ x: p.x, kick: true });
    else if (g === "snow") S.input({ x: p.x, fire: true });
    else if (g === "flipper") { pts[e.pointerId] = p.x; flips(); }
    else if (g === "elfer" && !S.st.shooting) S.input({ x: p.x });
    else if (g === "murmel") down.from = A.MURMEL.fromX(p.x);
  });
  cv.addEventListener("pointermove", function (e) {
    var p = at(e);
    if (!down) { if (e.pointerType === "mouse" && e.buttons === 0) return; if (!e.buttons) return; }
    if (g === "puck") S.input({ x: p.x, y: p.y - 50 });
    else if (g === "ziegel" || g === "volley" || g === "kick" || g === "snow") S.input({ x: p.x });
    else if (g === "elfer" && down) { if (S.st.shooting) { down.path.push([p.x, p.y]); X.swipe = down.path; } else S.input({ x: p.x }); }
    else if (g === "panzer" && down) { var aim = { vx: (down.x - p.x) * 3.4, vy: (down.y - p.y) * 3.4 }; S.input({ aim: aim }); X.aim = aim; }
    else if ((g === "stock" || g === "murmel") && down && S.mineTurn()) turnShot(p);
  });
  function up(e) {
    if (g === "flipper") { delete pts[e.pointerId]; flips(); }
    if (!down) return;
    if (g === "panzer") { S.input({ fire: true }); X.aim = null; }
    if (g === "elfer" && S.st.shooting && down.path.length > 2) {
      var a = down.path[0], b = down.path[down.path.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), dur = Math.max(0.08, (performance.now() - down.t) / 1000);
      if (l > 60 && dy < 0) {
        var mid = down.path[Math.floor(down.path.length / 2)], dev = ((mid[0] - a[0]) * dy - (mid[1] - a[1]) * dx) / l;   // how far the swipe bent sideways
        var v = Math.min(A.ELF.VMAX, l / dur * 1.6);
        S.input({ shot: { vx: dx / l * v, vy: dy / l * v, c: -dev * 7 } });
      }
      X.swipe = null;
    }
    if ((g === "stock" || g === "murmel") && down.shot) { S.input({ shot: down.shot }); X.aim = null; }
    down = null;
  }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });
}

// ---------- a match on a layer: bot or live ----------
var ov = null, demos = [];
// The chrome of every arcade layer, also the live one from live-ui.js: the home page's brand as a banner in the user's
// two colours and, top left, a labelled "‹ Zurück" (an ✕ alone was too easy to miss). The end screen repeats the way
// back as a plain button under "Nochmal". false: not an arcade game, the layer stays as it was.
function dress(o, close, g) {
  if (!A.GAMES[g]) return false;
  var bar = el("header", "bar tight arcbar"), x = el("button", "ico arcx", "‹ " + t("live_home"), function () { Kit.sfx.tap(); close(); });
  x.type = "button"; x.setAttribute("aria-label", t("live_home"));
  bar.appendChild(x); bar.appendChild(el("div", "arcbrand", t("brand")));
  var tag = el("span", "burst arcburst", META[g] ? META[g].e : "🎮"); tag.setAttribute("aria-hidden", "true"); bar.appendChild(Kit.langBtn("ico")); bar.appendChild(tag);
  o.classList.add("arcov"); o.insertBefore(bar, o.firstChild);
  return true;
}
function layer(g) {
  if (window.LiveUI) window.LiveUI.close();
  closeOwn();
  ov = el("div", "liveov"); ov.setAttribute("role", "dialog");
  var body = el("div", "livebody"); ov.appendChild(body); dress(ov, leave, g); document.body.appendChild(ov);
  // One history entry for the whole layer (menu, match, rematch): the phone's back closes the layer, not the site.
  if (!pushed) { pushed = true; try { history.pushState({ arc: g }, "", location.href); } catch (e) {} }
  return body;
}
function closeOwn() { if (ov) { ov.remove(); ov = null; } again = null; }
// The user leaves by a button: the layer goes, and the entry it put on the history goes with it (skip: that popstate is ours).
var pushed = false, skip = false;
function leave() { closeOwn(); if (pushed) { pushed = false; skip = true; try { history.back(); } catch (e) { skip = false; } } }
// app.js asks this first on popstate. true: the back was for the layer and is done.
function back() {
  if (skip) { skip = false; return true; }
  if (!pushed) return false;
  pushed = false; closeOwn(); return true;
}
// Another language: the start screen of a game draws itself again (a running match draws live).
var again = null;
window.addEventListener("daily:lang", function () { if (ov && again) again(); });
// o: { body, g, S, other(dt) runs the bot side in the page, startOther, them, badge, onEnd(won) }
function wall() { return performance.now() / 1000; }
function match(o) {
  var body = o.body, g = o.g, S = o.S, cv = el("canvas", "livecv arccv"), info = el("p", "livescore", ""), note = el("p", "note arcnote", t("arc_how_" + g)), X = {};
  if (o.badge) body.appendChild(el("p", "livemini", o.badge));   // the three pictures stay up the whole game
  body.appendChild(info); body.appendChild(cv); body.appendChild(note);
  var P = Painter(cv, g), start = performance.now() + 3000, last = performance.now(), ended = false, warned = false;
  // What the other phone moves is drawn through smooth.js (jitter buffer, capped carrying-on, no snaps); the rules
  // still see the plain state. Both phones stamp and play back on their own real clock (wall), which keeps running
  // when a frame hangs or the game pauses.
  var V = window.Smooth ? window.Smooth.view(A, g, S, wall) : null;
  controls(cv, g, S, X);
  (function frame(now) {
    if (!cv.isConnected) return;
    var dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = Math.max(last, now);
    X.count = now < start ? String(Math.ceil((start - now) / 1000)) : "";
    if (!X.count && !S.started) { S.start(); if (o.startOther) o.startOther(); }
    // Tests can fix the clock: window.__arcadeSpeed fixed steps of 1/60 s per frame, the same game on every machine.
    var fix = typeof window.__arcadeSpeed === "number" ? window.__arcadeSpeed : 0;
    if (S.started && !o.paused) { if (fix) for (var q = 0; q < fix; q++) { S.tick(1 / 60); if (o.other) o.other(1 / 60); } else { S.tick(dt); if (o.other) o.other(dt); } }
    P.frame(V ? V.frame(dt) : S, dt, X);
    info.textContent = t("arc_you") + " " + S.score[0] + " : " + S.score[1] + " " + o.them;
    if (S.started && !S.over) {
      if (S.mineTurn) note.textContent = S.mineTurn() ? t("arc_yourTurn") : t("arc_theirTurn");
      else if (g === "elfer") note.textContent = S.st.shooting ? t("arc_shoot") : t("arc_keep");
    }
    if (S.rejected && !warned) { warned = true; Kit.toast(t("arc_odd")); }
    if (S.over && !ended) { ended = true; setTimeout(function () { if (cv.isConnected) o.onEnd(S.score[0] > S.score[1], S.draw); }, 1400); }
    requestAnimationFrame(frame);
  })(performance.now());
  return P;
}
function endText(body, won, s, live, draw) {
  body.textContent = "";
  body.appendChild(el("p", "livebig", t(draw ? "arc_draw" : won ? (live ? "live_won" : "arc_won") : (live ? "live_lostGame" : "arc_lost"), { a: s[0], b: s[1] })));
  if (won) Kit.sfx.win();
}
// Against the bot: the bot's side runs in this page with the very same engine and messages as a live friend.
function playBot(g) {
  var seed = typeof window.__arcadeSeed === "string" ? window.__arcadeSeed : "bot|" + g + "|" + (Kit.store.arcN = (Kit.store.arcN || 0) + 1);   // tests fix the seed; else the n-th match on this device, never Math.random
  if (typeof window.__arcadeSeed !== "string") Kit.save();
  var body = layer(g), toMe = [], toBot = [];
  var S = A.side(g, { seed: seed, serving: true, clock: wall, send: function (m) { toBot.push(JSON.parse(JSON.stringify(m))); } });
  var B = A.side(g, { seed: seed, serving: false, clock: wall, send: function (m) { toMe.push(JSON.parse(JSON.stringify(m))); } });
  var bot = A.bot(g, B, seed);
  match({ body: body, g: g, S: S, them: t("arc_botName"), startOther: function () { B.start(); },
    other: function (dt) { while (toBot.length) B.receive(toBot.shift()); bot(dt); B.tick(dt); B.ev.length = 0; while (toMe.length) S.receive(toMe.shift()); },
    onEnd: function (won, draw) {
      endText(body, won, S.score, false, draw);
      body.appendChild(el("button", "btn hot", t("arc_again"), function () { Kit.sfx.thud(); playBot(g); }));
      if (window.LiveUI && window.LiveUI.on()) body.appendChild(el("button", "btn hot live", t("arc_live"), function () { Kit.sfx.thud(); leave(); window.LiveUI.invite({ g: g }); }));
      body.appendChild(el("button", "btn arcleave", t("live_home"), function () { Kit.sfx.tap(); leave(); }));
    } });
}
// Live: live-ui.js has made the connection and shows the badge; a rematch counts up the round so serves differ.
function playLive(g) {
  return function live(api, serving, round) {
    round = round || 0;
    var body = api.layer(), conn = api.conn, again = [false, false];
    var S = A.side(g, { seed: conn.channel + "|" + g + "|" + round, serving: serving, clock: wall, send: function (m) { conn.send(m); } });
    var o = { body: body, g: g, S: S, them: t("arc_friend"), badge: api.badge, onEnd: function (won, draw) {
      endText(body, won, S.score, true, draw);
      var more = el("button", "btn hot", t("live_more"), function () { more.disabled = true; more.textContent = t("live_moreWait"); again[0] = true; conn.send({ t: "again" }); restart(); });
      body.appendChild(more);
      body.appendChild(el("button", "btn arcleave", t("live_home"), function () { Kit.sfx.tap(); api.close(); }));
    } };
    function restart() { if (again[0] && again[1]) live(api, !serving, round + 1); }
    conn.on(function (m) {
      if (!m || typeof m !== "object") return;
      if (m.t === "again") { again[1] = true; restart(); return; }
      if (m.t === "pause") { o.paused = true; Kit.toast(t("live_pause")); return; }
      if (m.t === "resume") { o.paused = false; return; }
      S.receive(m);
    });
    document.addEventListener("visibilitychange", function vis() { if (!body.isConnected) return document.removeEventListener("visibilitychange", vis); conn.send({ t: document.hidden ? "pause" : "resume" }); });
    match(o);
  };
}
A.IDS.forEach(function (g) { (window.LiveGames = window.LiveGames || {})[g] = playLive(g); });

function menu(g) {
  var body = layer(g); again = function () { menu(g); };
  var i = idea(g), L = i ? (i[Kit.lang] || i.de) : { t: t("arc_" + g), s: "" };
  body.appendChild(el("p", "livebig", window.Daily.plainTitle(L.t)));
  var cv = el("canvas", "arcdemo"); cv.width = 300; cv.height = 480; body.appendChild(cv);
  body.appendChild(el("p", "note", L.s + " " + t("arc_how_" + g)));
  body.appendChild(el("button", "btn hot", t("arc_bot"), function () { Kit.sfx.thud(); playBot(g); }));
  if (window.LiveUI && window.LiveUI.on()) body.appendChild(el("button", "btn hot live", t("arc_live"), function () { Kit.sfx.thud(); leave(); window.LiveUI.invite({ g: g }); }));
  demo(cv, g, false);
}
// A preview that plays itself: two bots, no sound. still: one frame a few seconds in. g = null ends the preview.
function demo(cv, g, still) {
  demos = demos.filter(function (d) { if (d.cv === cv) d.stop = true; return !d.stop && d.cv.isConnected; });
  if (!g || !A.GAMES[g]) return;
  var d = { cv: cv, stop: false }; demos.push(d);
  var seed = "demo|" + g, round = 0, P = Painter(cv, g, { silent: true, fixed: true }), last = performance.now(), P2, ba, bb;
  function fresh(s) { P2 = A.pair(g, s, 0); ba = A.bot(g, P2.A, s + "a"); bb = A.bot(g, P2.B, s + "b"); P2.start(); }
  function run(dt) { ba(dt); bb(dt); P2.tick(dt); P2.B.ev.length = 0; if (P2.A.over) fresh(seed + "|" + ++round); }
  fresh(seed);
  if (still) { for (var k = 0; k < 240; k++) run(1 / 60); P2.A.ev.length = 0; P.frame(P2.A, 1 / 60, {}); return; }
  (function frame(now) {
    if (d.stop || !cv.isConnected) return;
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = Math.max(last, now);
    if (!document.hidden && cv.offsetParent !== null) { run(dt); P.frame(P2.A, dt, {}); }
    requestAnimationFrame(frame);
  })(performance.now());
}
// Shelf: one tile per duel, below the Ballduell.
function tiles(box) {
  box.appendChild(el("label", "lbl", t("arc_shelf")));
  var grid = el("div", "tiles");
  ideas().forEach(function (i) {
    var g = i.arcade.g, m = META[g], L = i[Kit.lang] || i.de, b = el("button", "mech tile arctile", null, function () { Kit.sfx.thud(); menu(g); }), c = document.createElement("canvas"), x = c.getContext("2d");
    c.width = c.height = 96;
    x.fillStyle = rad(x, 40, 40, 60, m.a, m.b); x.beginPath(); x.arc(48, 48, 44, 0, 6.283); x.fill();
    x.font = "48px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(m.e, 48, 52);
    b.appendChild(c); b.appendChild(el("b", "", window.Daily.plainTitle(L.t))); b.appendChild(el("small", "", L.s)); b.dataset.g = g;
    grid.appendChild(b);
  });
  box.appendChild(grid);
}
window.ArcadeUI = { back: back, menu: menu, dress: dress, demo: demo, tiles: tiles, count: function () { return ideas().length; }, playBot: playBot };
})();
