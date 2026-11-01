/* Game screen: the Duell flyer as one idea among others. Also runs as a live, self-playing preview in the editor. */
(function () {
"use strict";
var C = window.DuellCore, E = window.DuellEngine, D = window.Daily, Kit = window.Kit, P = window.Playable, t = Kit.t;
var $ = function (id) { return document.getElementById(id); };
var TH = {
  day:   { skyTop: "#4ec0ca", skyBottom: "#b6e6e0", pipe: "#5cbf3a", pipeEdge: "#2f7d1b", ground: "#ded895", groundEdge: "#c5b96a", accent: "#f7d51d" },
  night: { skyTop: "#0b1030", skyBottom: "#26305e", pipe: "#3a6ea5", pipeEdge: "#20406a", ground: "#2b2b3a", groundEdge: "#4a4a63", accent: "#7ad1ff", stars: 1 },
  sunset:{ skyTop: "#ff9e57", skyBottom: "#ffd9a0", pipe: "#c0653a", pipeEdge: "#7d3b1b", ground: "#caa06a", groundEdge: "#a67c48", accent: "#ffef8f" },
  retro: { skyTop: "#9bbc0f", skyBottom: "#8bac0f", pipe: "#306230", pipeEdge: "#0f380f", ground: "#306230", groundEdge: "#0f380f", accent: "#e0f8d0" },
  candy: { skyTop: "#ff8fd0", skyBottom: "#ffd0ec", pipe: "#7a5cff", pipeEdge: "#4a2fb0", ground: "#ffc0e6", groundEdge: "#e59ccf", accent: "#fff2b0" },
  neon:  { skyTop: "#12002b", skyBottom: "#3a0a6b", pipe: "#00f5d4", pipeEdge: "#00a896", ground: "#1b0036", groundEdge: "#ff2bd6", accent: "#ff2bd6", glow: 1, stars: 1 },
  ocean: { skyTop: "#04476b", skyBottom: "#1aa6b7", pipe: "#ff7f6b", pipeEdge: "#b74a3a", ground: "#0b2f4a", groundEdge: "#1d5f86", accent: "#aef0ff", bubbles: 1 },
  lava:  { skyTop: "#2b0a0a", skyBottom: "#7a1d0b", pipe: "#3a3a3a", pipeEdge: "#1b1b1b", ground: "#1b0f0f", groundEdge: "#ff5a1f", accent: "#ffb347", glow: 1 }
};
var skinTh = null;   // a game made from a card has that card's colours instead of a named world
function look() {
  if (cur.skin) return skinTh || (skinTh = P.skinTheme(cur.skin));
  var l = cur.look, base = TH[cur.theme];
  if (!l) return base;
  if (cur.drawn) return cur.drawn;
  var th = Object.assign({}, base, { skyTop: l.a || base.skyTop, skyBottom: l.b || l.a || base.skyBottom, pipe: l.p || base.pipe, pipeEdge: l.q || base.pipeEdge, ground: l.g || base.ground, groundEdge: l.h || base.groundEdge });
  if (l.d) { th.stars = l.d === "stars"; th.bubbles = l.d === "bubbles"; th.snow = l.d === "snow"; th.rain = l.d === "rain"; th.bare = l.d === "none"; }
  return (cur.drawn = th);
}
function column(x, y, h, cap, th, form, emoji) {   // one half of an obstacle; the hitbox is always the same rectangle
  var w = E.PIPE_W;
  if (h <= 0) return;
  if (form === "emoji") {
    ctx.save(); ctx.beginPath(); ctx.rect(x - 5, y, w + 10, h); ctx.clip();
    ctx.fillStyle = th.pipe; ctx.globalAlpha = 0.25; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    ctx.font = "34px " + EMO; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var ey = y + h - 20; ey > y - 40; ey -= 40) ctx.fillText(emoji, x + w / 2, ey);
    ctx.restore(); return;
  }
  ctx.fillStyle = th.pipe; ctx.strokeStyle = th.pipeEdge; ctx.lineWidth = 2;
  if (form === "block") {
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    for (var by = y + (h % 26); by < y + h; by += 26) { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + w, by); ctx.stroke(); }
  } else if (form === "round") {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x + 1, y, w - 2, h);
    var cy = cap ? y + h - 14 : y;
    ctx.fillRect(x - 5, cy, w + 10, 14); ctx.strokeRect(x - 4, cy, w + 8, 14);
  }
  if (form !== "block") { ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(x + 6, y + (cap ? 0 : 14), 5, Math.max(0, h - 14)); }
}
function fmt(k, o) { return t(k, o); }
function tone(a, b, c, d, e, f) { Kit.tone(a, b, c, d, e, f); }
var SFX = {
  flap: function () { tone(420, 760, 0.09, "square", 0.05); Kit.haptic(6); },
  score: function () { tone(880, 880, 0.08, "triangle", 0.12); tone(1320, 1320, 0.14, "triangle", 0.12, 0.07); Kit.haptic(14); },
  dead: function () { tone(260, 40, 0.45, "sawtooth", 0.16); tone(120, 30, 0.35, "square", 0.1, 0.03); Kit.haptic([70, 40, 160]); },
  record: function () { Kit.sfx.win(); }
};
var cur, rival = null, sim, rng, prevBest = 0, isRecord = false, recordShown = false, resultTimer = 0, mode = "off", opts = {}, raf = 0;
var reduce = false;
try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
var best = function () { if (!Kit.store.best || typeof Kit.store.best !== "object") Kit.store.best = {}; return Kit.store.best; };
function bestFor(st) { var b = best()[C.configKey(st)]; return typeof b === "number" ? b : 0; }
var parts = [], trail = [], floaters = [], shake = 0, flash = 0, clock = 0;
function burst(x, y, n, colors, speed, grav) {
  if (reduce) n = Math.ceil(n / 4);
  for (var i = 0; i < n && parts.length < 260; i++) {
    var a = Math.random() * 6.283, v = (0.3 + Math.random()) * speed;
    parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, life: 0.6 + Math.random() * 0.7, max: 1.3, c: colors[i % colors.length], s: 2 + Math.random() * 4, g: grav == null ? 600 : grav });
  }
}
var CONF = ["#ff3d71", "#ffd93d", "#4ee1a0", "#4dabff", "#c77dff", "#fff"];
function doShake(a) { if (!reduce) shake = Math.max(shake, a); }
var cv = $("cv"), ctx = cv.getContext("2d"), scale = 1;
var EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
function fit() {
  var box = cv.parentElement.getBoundingClientRect(), vw = box.width || window.innerWidth, vh = box.height || window.innerHeight;
  scale = Math.min(vw / E.W, vh / E.H);
  var dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = E.W * scale + "px"; cv.style.height = E.H * scale + "px";
  cv.width = Math.round(E.W * scale * dpr); cv.height = Math.round(E.H * scale * dpr);
  cv.dpr = dpr;
}
window.addEventListener("resize", function () { if (mode !== "off") fit(); });
function draw() {
  var th = look(), p = sim, s = scale * cv.dpr, W = E.W, H = E.H, G = E.GROUND;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  var sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.setTransform(s, 0, 0, s, sx * s, sy * s);
  var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
  ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
  if (opts.bg) { ctx.globalAlpha = 0.45; ctx.drawImage(opts.bg, 0, 0, W, H - G); ctx.globalAlpha = 1; }
  // backdrop: stars / bubbles / soft clouds (visual only)
  var i, x, y;
  var lk = !cur.skin && cur.look || {};
  if (th.bare) { /* just the sky */ }
  else if (th.snow) { ctx.fillStyle = "rgba(255,255,255,.85)"; for (i = 0; i < 30; i++) { x = (i * 89 + Math.sin(clock + i) * 12 + W) % W; y = (clock * (18 + i % 9) + i * 61) % (H - G); ctx.beginPath(); ctx.arc(x, y, 1.5 + i % 3, 0, 7); ctx.fill(); } }
  else if (th.rain) { ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1; for (i = 0; i < 34; i++) { x = (i * 83) % W; y = (clock * (240 + i % 7 * 20) + i * 47) % (H - G); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 11); ctx.stroke(); } }
  else if (th.stars) { ctx.fillStyle = "rgba(255,255,255,.8)"; for (i = 0; i < 28; i++) { x = (i * 97 + 13) % W; y = (i * 53 + 7) % (H - G - 80); ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(clock * 1.5 + i)); ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1; }
  else if (th.bubbles) { ctx.strokeStyle = "rgba(255,255,255,.35)"; for (i = 0; i < 14; i++) { x = (i * 71 + 20) % W; y = H - G - ((clock * (14 + i * 3) + i * 80) % (H - G)); ctx.beginPath(); ctx.arc(x, y, 3 + (i % 4), 0, 7); ctx.stroke(); } }
  else { ctx.fillStyle = "rgba(255,255,255,.35)"; for (i = 0; i < 4; i++) { x = ((i * 130 - clock * (6 + i * 3)) % (W + 120) + (W + 120)) % (W + 120) - 60; y = 70 + i * 62; ctx.beginPath(); ctx.ellipse(x, y, 34, 11, 0, 0, 7); ctx.ellipse(x + 20, y - 8, 22, 10, 0, 0, 7); ctx.fill(); } }
  if (lk.e) { ctx.font = "22px " + EMO; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.globalAlpha = 0.75; for (i = 0; i < 6; i++) { x = ((i * 67 - clock * (9 + i * 4)) % (W + 40) + W + 40) % (W + 40) - 20; ctx.fillText(lk.e[i % lk.e.length], x, 44 + (i * 73) % (H - G - 90)); } ctx.globalAlpha = 1; }
  // pipes
  var P = E.PIPE_W, cap = 14, gap = p.params.gap;
  for (i = 0; i < p.pipes.length; i++) {
    var pp = p.pipes[i], by = pp.top + gap;
    if (lk.f && lk.f !== "tube" || lk.o) { var form = lk.o && !lk.f ? "emoji" : lk.f; column(pp.x, 0, pp.top, true, th, form, lk.o); column(pp.x, by, H - G - by, false, th, form, lk.o); continue; }
    if (th.glow) { ctx.shadowColor = th.pipe; ctx.shadowBlur = 12; }
    ctx.fillStyle = th.pipe; ctx.strokeStyle = th.pipeEdge; ctx.lineWidth = 2;
    ctx.fillRect(pp.x, 0, P, pp.top); ctx.strokeRect(pp.x + 1, 0, P - 2, pp.top);
    ctx.fillRect(pp.x - 5, pp.top - cap, P + 10, cap); ctx.strokeRect(pp.x - 4, pp.top - cap, P + 8, cap);
    ctx.fillRect(pp.x, by, P, H - G - by); ctx.strokeRect(pp.x + 1, by, P - 2, H - G - by);
    ctx.fillRect(pp.x - 5, by, P + 10, cap); ctx.strokeRect(pp.x - 4, by + 1, P + 8, cap - 1);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.22)"; ctx.fillRect(pp.x + 6, 0, 5, pp.top - cap); ctx.fillRect(pp.x + 6, by + cap, 5, H - G - by - cap);
  }
  // ground
  var off = p.state === "run" ? (p.ticks * p.params.speed * E.STEP) % 24 : 0;
  ctx.fillStyle = th.ground; ctx.fillRect(0, H - G, W, G + 40);
  ctx.fillStyle = th.groundEdge; ctx.fillRect(0, H - G, W, 4);
  for (x = -off; x < W; x += 24) ctx.fillRect(x, H - G + 14, 12, 4);
  // trail
  for (i = 0; i < trail.length; i++) {
    var tr = trail[i]; ctx.globalAlpha = tr.a * 0.5;
    if (lk.m) { ctx.font = Math.round(10 + 8 * tr.a) + "px " + EMO; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(lk.m, tr.x, tr.y); continue; }
    ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(tr.x, tr.y, 7 * tr.a, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // bird
  var by2 = p.state === "ready" ? p.bird.y + Math.sin(clock * 4) * 6 : p.bird.y;
  ctx.save(); ctx.translate(E.BX, by2); ctx.rotate(p.state === "over" ? 1.4 : p.bird.rot);
  ctx.font = Math.round(E.GROUND * 0.62) + "px " + EMO; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (opts.figure) ctx.drawImage(opts.figure, -18, -18, 36, 36); else ctx.fillText(cur.emoji, 0, 2);
  ctx.restore();
  // particles
  for (i = 0; i < parts.length; i++) { var q = parts[i]; ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.s, q.s); }
  ctx.globalAlpha = 1;
  // floating texts
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (i = 0; i < floaters.length; i++) { var f = floaters[i]; ctx.globalAlpha = Math.min(1, f.life * 1.5); ctx.font = "900 " + f.size + "px system-ui,sans-serif"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.strokeText(f.t, f.x, f.y); ctx.fillStyle = f.c; ctx.fillText(f.t, f.x, f.y); }
  ctx.globalAlpha = 1;
  if (flash > 0) { ctx.fillStyle = "rgba(255,60,80," + (flash * 0.5) + ")"; ctx.fillRect(-20, -20, W + 40, H + 40); }
}
function setScore(n, pop) {
  var s = $("score"); s.textContent = String(n); s.setAttribute("data-score", String(n));
  if (pop && !reduce) { s.classList.remove("pop"); void s.offsetWidth; s.classList.add("pop"); }
}
function updateBanner() {
  var b = $("banner");
  if (rival && typeof rival.score === "number") { b.textContent = t("banner", { name: rival.name || t("rival"), n: rival.score }); b.hidden = false; } else b.hidden = true;
}
function newRun() {
  clearTimeout(resultTimer);
  rng = C.mulberry32(cur.seed); sim = E.createSim(cur.params, rng);
  parts.length = 0; trail.length = 0; floaters.length = 0; shake = 0; flash = 0;
  if (mode === "demo") { sim.flap(); return; }
  prevBest = bestFor(cur); isRecord = false; recordShown = false;
  setScore(0, false);
  $("result").classList.remove("show");
  $("hint").hidden = false; $("dock").hidden = false; updateBanner();
  document.body.setAttribute("data-state", "ready");
  var b = bestFor(cur); $("bestchip").textContent = b ? t("bestN", { n: b }) : "";
}
var last = 0, acc = 0;
function handle(ev) {
  var b = sim.bird;
  for (var i = 0; i < ev.length; i++) {
    if (mode === "demo") continue;
    if (ev[i] === "score") {
      setScore(sim.score, true); SFX.score();
      burst(86, b.y, 10, CONF, 150, 300);
      floaters.push({ x: 86, y: b.y - 28, t: "+1", c: "#fff", size: 20, life: 0.8, vy: -50 });
      if (prevBest > 0 && sim.score > prevBest && !recordShown) { recordShown = true; burst(E.W / 2, 200, 40, CONF, 260, 260); SFX.record(); }
    } else if (ev[i] === "dead") onDead();
  }
}
function onDead() {
  document.body.setAttribute("data-state", "over"); SFX.dead(); doShake(18); flash = 1;
  burst(86, sim.bird.y, 46, [look().accent, "#fff", "#ff3d71", "#ffd93d"], 320, 700);
  isRecord = sim.score > prevBest && sim.score > 0;
  if (isRecord) { best()[C.configKey(cur)] = sim.score; Kit.save(); }
  $("hint").hidden = true; $("banner").hidden = true;
  resultTimer = setTimeout(showResult, 650);
}
function showResult() {
  var sc = sim.score, line;
  $("record").textContent = t("record"); $("record").classList.toggle("show", isRecord);
  if (isRecord) { burst(E.W / 2, 150, 90, CONF, 340, 280); SFX.record(); doShake(8); }
  if (rival && typeof rival.score === "number") {
    var nm = rival.name || t("rival");
    line = sc > rival.score ? t("win", { name: nm }) : sc === rival.score ? t("tie", { name: nm }) : t("lose", { name: nm, d: rival.score - sc });
  } else line = t("bestN", { n: Math.max(prevBest, sc) });
  $("res-line").textContent = !rival && cur.skin && cur.skin.l ? cur.skin.l : line; $("res-score").textContent = String(sc);
  // Own changes make sharing the main action; a game nobody touched asks for a remix first.
  $("image").hidden = !opts.own; $("challenge").classList.toggle("hot", !!opts.own); $("toremix").classList.toggle("hot", !opts.own);
  $("gamebtns").insertBefore(opts.own ? $("challenge") : $("toremix"), $("gamebtns").firstChild);
  $("result").classList.add("show");
}
function bot() {
  var nx = null;
  for (var i = 0; i < sim.pipes.length; i++) if (sim.pipes[i].x + E.PIPE_W >= E.BX - E.R) { nx = sim.pipes[i]; break; }
  var mid = nx ? nx.top + sim.params.gap * 0.62 : E.H * 0.45;
  if (sim.bird.y > mid && sim.bird.vy > 0) sim.flap();
}
function advance(dt) {
  clock += dt;
  if (sim.state === "run") {
    acc += dt;
    while (acc >= E.STEP) { acc -= E.STEP; if (mode === "demo") bot(); handle(sim.step()); if (sim.state !== "run") break; }
    if (sim.ticks % 3 === 0 && sim.state === "run") trail.push({ x: 86, y: sim.bird.y, a: 1 });
  } else { acc = 0; if (mode === "demo" && sim.state === "over") newRun(); }
  for (var i = trail.length - 1; i >= 0; i--) { trail[i].x -= sim.params.speed * dt; trail[i].a -= dt * 2.4; if (trail[i].a <= 0) trail.splice(i, 1); }
  for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; if (q.life <= 0) parts.splice(i, 1); }
  for (i = floaters.length - 1; i >= 0; i--) { floaters[i].y += floaters[i].vy * dt; floaters[i].life -= dt; if (floaters[i].life <= 0) floaters.splice(i, 1); }
  shake = Math.max(0, shake - dt * 60); flash = Math.max(0, flash - dt * 2.5);
}
function frame(ts) {
  if (mode === "off") { raf = 0; return; }
  var dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
  advance(dt); draw();
  raf = requestAnimationFrame(frame);
}
function run() { last = 0; if (!raf) raf = requestAnimationFrame(frame); }
function doFlap() {
  if (mode !== "play" || sim.state === "over") return;
  var ev = sim.flap();
  if (ev.indexOf("start") >= 0) { document.body.setAttribute("data-state", "run"); $("hint").hidden = true; $("dock").hidden = true; $("banner").hidden = true; }
  if (ev.indexOf("flap") >= 0) { SFX.flap(); burst(76, sim.bird.y + 8, 5, ["#fff", look().accent], 90, 200); }
}
$("game").addEventListener("pointerdown", function (e) { if (e.target.closest("button,input,.panel")) return; e.preventDefault(); doFlap(); });
window.addEventListener("keydown", function (e) {
  if (mode === "play" && (e.code === "Space" || e.key === "ArrowUp") && !(e.target && e.target.tagName === "INPUT")) { e.preventDefault(); doFlap(); }
});
$("again").addEventListener("click", function () { Kit.sfx.tap(); newRun(); });
$("challenge").addEventListener("click", async function () {
  Kit.sfx.tap();
  var link = await window.ShortLink.shorten(D.challengeUrl(cur, sim.score), { k: "game", n: sim.score, l: Kit.lang }, Kit.store);
  Kit.save();
  Kit.share({ url: link.url, text: t("chText", { n: sim.score, t: cur.title }) });
});
function attach(host) { cv = host; ctx = cv.getContext("2d"); fit(); }

/* The one network call of the game: a sentence typed for a game, only ever in this function, with a local fallback. */
async function fromSentence(prompt, lang) {
  var st = null;
  if (navigator.onLine !== false && typeof fetch === "function") {
    var ctl = typeof AbortController === "function" ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 4000);
    try {
      var res = await fetch(window.DUELL_API || C.DEFAULT_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt, lang: lang }), signal: ctl ? ctl.signal : undefined, credentials: "omit", referrerPolicy: "no-referrer" });
      if (res.ok) st = C.stateFromApi(await res.json(), prompt);
    } catch (e) { st = null; }
    clearTimeout(tm);
  }
  return st || C.localConfig(prompt, lang);
}

window.Game = {
  THEMES: Object.keys(TH), themeColor: function (n) { return TH[n].skyTop; }, fromSentence: fromSentence,
  play: function (st, riv, o) {
    opts = o || {}; rival = riv || null; cur = st; skinTh = null; mode = "play";
    attach($("cv")); $("game").style.background = look().skyTop; $("title").textContent = cur.title; $("hint").textContent = t("hint"); $("remixbtn").textContent = "✨ " + t("remix");
    $("challenge").textContent = t("challenge"); $("again").textContent = t("again"); $("image").textContent = t("image"); $("toremix").textContent = t("remix");
    newRun(); run();
  },
  demo: function (host, st) { cur = st; rival = null; mode = "demo"; attach(host); newRun(); run(); },
  update: function (st) { cur = st; if (mode === "demo") newRun(); },   // every change shows at once
  stop: function () { mode = "off"; clearTimeout(resultTimer); },
  stopDemo: function () { if (mode === "demo") mode = "off"; },
  current: function () { return cur; }, score: function () { return sim ? sim.score : 0; }
};
/* test hook, used by browser checks: reads the state; tick() advances without waiting for frames */
window.DuellDebug = {
  snap: function () {
    var nx = null; for (var i = 0; i < sim.pipes.length; i++) if (sim.pipes[i].x + E.PIPE_W >= 86 - 15) { nx = sim.pipes[i]; break; }
    return { mode: mode, state: sim.state, score: sim.score, y: sim.bird.y, vy: sim.bird.vy, next: nx ? { x: nx.x, top: nx.top, gap: sim.params.gap } : null, cfg: cur, rival: rival };
  },
  tick: function (sec) { for (var i = 0; i < sec * 60; i++) advance(1 / 60); draw(); }, flap: doFlap
};
})();
