/* Screens for the two newer mechanics, agent duels and secret channels, on top of the shared editor. */
(function () {
"use strict";
var A = window.DailyApp, X = window.DailyModes, Duel = window.Duel, Q = window.Quest, DD = window.DuelData;
var C = window.DuellCore, D = window.Daily, E = window.DuellEngine, R = window.Render, S = window.Studio, Kit = window.Kit, t = Kit.t, el = A.el;
var FONT = R.FONT, EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
var $ = function (id) { return document.getElementById(id); };
var reduce = false, timer = 0, raf = 0, beat = null;
try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
function title(ed) { return ed.idea ? (ed.idea[Kit.lang] || ed.idea.de).t.replace("|", " ") : ""; }
function nameOf(a, fb) { return a.n || fb || a.e; }
function stopAll() { clearTimeout(timer); clearInterval(timer); cancelAnimationFrame(raf); if (beat) { try { beat.stop(); } catch (e) {} beat = null; } }
function setTabs(on) { $("tabs").hidden = !on; }

/* ---------- drawing ---------- */
function text(c, s, x, y, size, col, align) { c.font = "900 " + size + "px " + FONT; c.fillStyle = col; c.textAlign = align || "center"; c.textBaseline = "middle"; c.fillText(s, x, y); }
function emoji(c, s, x, y, size) { c.font = size + "px " + EMO; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(s, x, y); }
function fit(c, s, w, size) { c.font = "900 " + size + "px " + FONT; var m = c.measureText(s).width; return m > w ? size * w / m : size; }
function wrap(c, s, w, size) {
  c.font = "800 " + size + "px system-ui,sans-serif"; var out = [], cur = "";
  String(s).split(" ").forEach(function (x) { var n = cur ? cur + " " + x : x; if (c.measureText(n).width > w && cur) { out.push(cur); cur = x; } else cur = n; });
  if (cur) out.push(cur); return out;
}
function para(c, s, x, y, w, size, col, align) {
  var l = wrap(c, s, w, size); c.fillStyle = col; c.textAlign = align || "center"; c.textBaseline = "top";
  l.forEach(function (line, i) { c.fillText(line, x, y + i * size * 1.22); }); return y + l.length * size * 1.22;
}
function backdrop(c, W, H, doc) {
  var a = doc.col[0], b = doc.col[1];
  c.fillStyle = a; c.fillRect(0, 0, W, H);
  c.fillStyle = b; c.beginPath(); c.moveTo(W, 0); c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();
  R.dots(c, W, H, "rgba(0,0,0,.14)", W / 22, 0.7);
}
function drawFly(c, W, H, doc, sa, sb) {
  var k = W / E.W, sky = H - 56 * k * (H / (E.H * k)), i, p, gap = sa.params.gap, kh = H / E.H;
  c.fillStyle = "#14233f"; c.fillRect(0, 0, W, H);
  c.fillStyle = doc.col[0];
  for (i = 0; i < sa.pipes.length; i++) { p = sa.pipes[i]; c.fillRect(p.x * k, 0, E.PIPE_W * k, p.top * kh); c.fillRect(p.x * k, (p.top + gap) * kh, E.PIPE_W * k, H - (p.top + gap) * kh); }
  c.fillStyle = doc.col[1]; c.fillRect(0, (E.H - E.GROUND) * kh, W, E.GROUND * kh);
  emoji(c, doc.a.e, E.BX * k, sa.bird.y * kh, 58 * k * 0.62);
  text(c, String(sa.score), W * 0.3, H * 0.1, W * 0.1, "#fff");
  if (sb) { emoji(c, doc.b.e, (E.BX - 34) * k, sb.bird.y * kh, 58 * k * 0.62); text(c, String(sb.score), W * 0.7, H * 0.1, W * 0.1, "#fff"); }
}
function handFace(doc, i) { return DD.sets[doc.set][i]; }
R.extra.duel = function (c, W, H, doc, opt) {
  var x = opt.x || doc._x;
  if (x && x.sa) { drawFly(c, W, H, doc, x.sa, x.sb); return; }
  backdrop(c, W, H, doc);
  var ink = "#fffaf0";
  c.fillStyle = "#111"; c.fillRect(0, H * 0.04, W, H * 0.13);
  var head = doc.t || (x && x.title) || t("duel");
  text(c, head.toUpperCase(), W / 2, H * 0.105, fit(c, head.toUpperCase(), W * 0.9, W * 0.075), "#fffaf0");
  var bob = x && x.running ? Math.sin(Date.now() / 90) * W * 0.012 : 0;
  emoji(c, doc.a.e, W * 0.27, H * 0.34 + bob, W * 0.26); emoji(c, doc.b.e, W * 0.73, H * 0.34 - bob, W * 0.26);
  var na = nameOf(doc.a, t("you")), nb = nameOf(doc.b, t("duel"));
  [[na, 0.27], [nb, 0.73]].forEach(function (e) {
    var sz = fit(c, e[0].toUpperCase(), W * 0.42, W * 0.06);
    c.fillStyle = "#111"; c.fillRect(W * e[1] - W * 0.22, H * 0.46, W * 0.44, H * 0.07);
    text(c, e[0].toUpperCase(), W * e[1], H * 0.497, sz, ink);
  });
  var round = x && x.res && x.res.rounds[x.i - 1], sa = x && x.res ? (round ? round.sa : x.done ? x.res.sa : 0) : null, sb = x && x.res ? (round ? round.sb : x.done ? x.res.sb : 0) : null;
  if (x && x.mind) { sa = x.mind.sa; sb = x.mind.sb; }
  if (x && x.deck) { text(c, String(x.deck.left), W / 2, H * 0.66, W * 0.3, ink); para(c, x.deck.text, W / 2, H * 0.78, W * 0.86, W * 0.05, ink); return; }
  if (sa == null) { text(c, "VS", W / 2, H * 0.34, W * 0.13, ink); [["r", 0.6], ["c", 0.66], ["p", 0.72]].forEach(function (s) { var la = doc.a[s[0]], lb = doc.b[s[0]]; c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(W * 0.08, H * s[1], W * 0.36, H * 0.03); c.fillRect(W * 0.56, H * s[1], W * 0.36, H * 0.03); c.fillStyle = "#fffaf0"; c.fillRect(W * 0.08, H * s[1], W * 0.36 * la / 100, H * 0.03); c.fillRect(W * 0.56, H * s[1], W * 0.36 * lb / 100, H * 0.03); }); return; }
  text(c, sa + " : " + sb, W / 2, H * 0.64, W * 0.2, ink);
  if (round && doc.m === "rps") { emoji(c, handFace(doc, round.x), W * 0.27, H * 0.8, W * 0.13); emoji(c, handFace(doc, round.y), W * 0.73, H * 0.8, W * 0.13); }
  if (round && doc.m === "rap") para(c, x.i % 2 ? round.x.text : round.y.text, W / 2, H * 0.74, W * 0.86, W * 0.048, ink);
  if (round && doc.m === "auction") { para(c, round.item, W / 2, H * 0.74, W * 0.86, W * 0.05, ink); text(c, round.ba + " / " + round.bb, W / 2, H * 0.85, W * 0.05, ink); }
  if (x && x.mind && x.mind.last) { emoji(c, handFace(doc, x.mind.last[0]), W * 0.27, H * 0.8, W * 0.13); emoji(c, handFace(doc, x.mind.last[1]), W * 0.73, H * 0.8, W * 0.13); }
  if (x && x.done) { var line = x.verdict; c.fillStyle = "#111"; c.fillRect(0, H * 0.88, W, H * 0.075); text(c, line.toUpperCase(), W / 2, H * 0.917, fit(c, line.toUpperCase(), W * 0.9, W * 0.055), "#fffaf0"); }
};
R.extra.quest = function (c, W, H, doc, opt) {
  backdrop(c, W, H, doc);
  var ink = "#111";
  c.fillStyle = "#111"; c.fillRect(0, H * 0.04, W, H * 0.13);
  var head = (doc.t || t("quest")).toUpperCase();
  text(c, head, W / 2, H * 0.105, fit(c, head, W * 0.82, W * 0.075), "#fffaf0");
  c.fillStyle = "#fff6dc"; c.fillRect(W * 0.07, H * 0.21, W * 0.86, H * 0.25); c.strokeStyle = ink; c.lineWidth = W * 0.008; c.strokeRect(W * 0.07, H * 0.21, W * 0.86, H * 0.25);
  para(c, t("questYou"), W * 0.11, H * 0.23, W * 0.78, W * 0.032, ink, "left");
  para(c, doc.q0 || "…", W * 0.11, H * 0.275, W * 0.78, W * 0.055, ink, "left");
  c.fillStyle = "#111"; c.fillRect(W * 0.07, H * 0.5, W * 0.86, H * 0.34);
  para(c, t("questSees"), W * 0.11, H * 0.52, W * 0.78, W * 0.032, "#7ee0ff", "left");
  var blob = (doc.c || []).join(" ").replace(/[-_]/g, "x");
  c.font = "700 " + W * 0.032 + 'px ui-monospace,Menlo,monospace'; c.fillStyle = "#14ff9c"; c.textAlign = "left"; c.textBaseline = "top";
  if (blob) { for (var i = 0; i < 9; i++) c.fillText(blob.slice(i * 40, i * 40 + 40), W * 0.11, H * 0.57 + i * W * 0.042); }
  else para(c, t("questWait"), W * 0.11, H * 0.58, W * 0.78, W * 0.04, "#fffaf0", "left");
  emoji(c, doc.e || "🗝️", W / 2, H * 0.915, W * 0.11);
};

/* ---------- agent panels ---------- */
function sliders(p, ag, keys) {
  keys.forEach(function (k) {
    var row = el("label", "slide"), r = el("input"), v = el("b", "", ag[k]);
    row.appendChild(el("span", "", t(k === "sharp" ? "ag_sharp" : "ag_" + k))); r.type = "range"; r.min = 0; r.max = 100; r.value = ag[k]; r.setAttribute("aria-label", t("ag_" + k)); r.dataset.k = k;
    r.addEventListener("input", function () { ag[k] = Number(r.value); v.textContent = r.value; A.changed(); });
    row.appendChild(r); row.appendChild(v); p.appendChild(row);
  });
}
function look(p, ag) { A.chips(p, DD.emoji.concat(DD.emoji.indexOf(ag.e) < 0 ? [ag.e] : []).map(function (e) { return { v: e, l: e }; }), ag.e, function (v) { ag.e = v; }, "em"); }
function nameField(p, ag) { A.field(p, t("agName"), ag.n, 16, function (v) { ag.n = C.sanitizeName(v); }); }
A.TABS.duel = ["Agent", "Rival", "Arena", "Color"];
A.TABS.quest = ["Riddle", "End", "Color"];
A.PANEL.Agent = function (p) {
  var d = A.ed().doc; nameField(p, d.a); sliders(p, d.a, Duel.SLIDERS[d.m].filter(function (k) { return d.m !== "mind"; })); look(p, d.a);
  p.appendChild(el("p", "note", t("agLocal")));
};
A.PANEL.Rival = function (p) {
  var d = A.ed().doc;
  p.appendChild(el("button", "chip", "🎲 " + t("agRandom"), function () {
    var r = Math.random, L = DD.rivals[Kit.lang]; Kit.sfx.pop();
    d.b = { n: L[Math.floor(r() * L.length)], e: DD.emoji[Math.floor(r() * DD.emoji.length)], r: Math.floor(r() * 101), c: Math.floor(r() * 101), p: Math.floor(r() * 101) };
    A.tab("Rival"); A.changed();
  }));
  nameField(p, d.b); sliders(p, d.b, Duel.SLIDERS[d.m]); look(p, d.b);
};
A.PANEL.Arena = function (p) {
  var d = A.ed().doc;
  if (d.m === "rap") A.field(p, t("wordRap"), d.w, 14, function (v) { d.w = v; });
  if (d.m === "auction") A.field(p, t("wordItem"), d.w, 14, function (v) { d.w = v; });
  if (d.m === "deck") A.field(p, t("deckOwn"), d.w, 14, function (v) { d.w = v; });
  if (d.m === "rps" || d.m === "mind") { p.appendChild(el("label", "lbl", t("pickSet"))); A.chips(p, DD.sets.map(function (s, i) { return { v: i, l: s.join(" ") }; }), d.set, function (v) { d.set = v; }); }
  if (d.m === "flappy") {
    p.appendChild(el("p", "note", t("trainH")));
    p.appendChild(el("button", "chip", "🐤 " + t("train"), function () { Kit.sfx.tap(); train(); }));
    p.appendChild(el("label", "lbl", t("worldL")));
    A.chips(p, A.game.THEMES.map(function (n) { return { v: n, l: t("w_" + n) }; }), d.g.theme, function (v) { d.g.theme = v; });
  }
};

/* ---------- flying ---------- */
var flap = null;
A.cv.addEventListener("pointerdown", function () { if (flap) flap(); });
function loop(frame) { (function go() { if (frame() !== false) raf = requestAnimationFrame(go); })(); }
function train() {
  var ed = A.ed(), d = ed.doc, sim = Duel.flySim(d), got = [];
  setTabs(false); ed.x = { sa: sim }; sim.flap();
  flap = function () {
    var next = sim.pipes.filter(function (p) { return p.x + E.PIPE_W > E.BX - E.R; })[0];
    if (next) got.push(sim.bird.y - (next.top + sim.params.gap / 2));
    sim.flap(); Kit.sfx.tap();
  };
  var last = performance.now();
  loop(function () {
    var now = performance.now(), n = Math.min(40, Math.round((now - last) * 0.12)); last = now;
    for (var i = 0; i < n; i++) sim.step();
    if (A.ed() !== ed) { flap = null; return false; }
    A.changed();
    if (sim.state === "over" || sim.ticks > 120 * 25) {
      flap = null; ed.x = null; setTabs(true);
      var l = Duel.learnFlap(got);
      if (l) { d.a.r = l.r; d.a.p = l.p; ed.taught = true; Kit.toast(t("trainDone", l)); } else Kit.toast(t("trainFew"));
      A.tab("Arena"); A.changed(); return false;
    }
  });
}
function flyMatch(ed) {
  var d = ed.doc, res = Duel.play(d, Kit.lang), sa = Duel.flySim(d), sb = Duel.flySim(d), ra = Duel.flyRnd(d.a), rb = Duel.flyRnd(d.b);
  ed.x = { res: res, sa: sa, sb: sb, running: true };
  if (reduce) { end(ed, res); return; }
  loop(function () {
    if (A.ed() !== ed) return false;
    for (var i = 0; i < 12; i++) { if (sa.state !== "over" && sa.score < Duel.FLY_CAP) Duel.flyStep(sa, d.a, ra); if (sb.state !== "over" && sb.score < Duel.FLY_CAP) Duel.flyStep(sb, d.b, rb); }
    A.changed();
    var doneA = sa.state === "over" || sa.score >= Duel.FLY_CAP, doneB = sb.state === "over" || sb.score >= Duel.FLY_CAP;
    if (doneA && doneB) { end(ed, res); return false; }
  });
}

/* ---------- running a match ---------- */
function verdict(d, res) {
  var w = Duel.winner(res);
  if (w === 0) return t("duelDraw");
  return w > 0 && !d.a.n ? t("duelWinYou") : t("duelWin", { n: nameOf(w > 0 ? d.a : d.b, t("duel")) });
}
function log(p, s, cls) { var l = el("p", cls || "duellog", s); p.appendChild(l); p.scrollTop = p.scrollHeight; }
function line(d, r, i) {
  var a = nameOf(d.a, t("you")), b = nameOf(d.b, t("duel"));
  if (d.m === "rps") return t("duelRps", { n: i + 1 }) + ": " + handFace(d, r.x) + " " + handFace(d, r.y) + "   " + r.sa + ":" + r.sb;
  if (d.m === "rap") return a + ": " + r.x.text + " (" + r.x.pts + ") / " + b + ": " + r.y.text + " (" + r.y.pts + ")";
  return r.item + ": " + t("duelBid", { a: r.ba, b: r.bb }) + ". " + (r.o === 0 ? t("duelNoSale") : t("duelSold", { n: r.o > 0 ? (d.a.n || t("youTo")) : b }));
}
function end(ed, res) {
  var d = ed.doc, x = ed.x || {};
  x.res = res; x.done = true; x.running = false; x.i = res.rounds.length; x.verdict = verdict(d, res); x.title = title(ed);
  if (x.mind) x.verdict = res.sa >= res.sb ? t("mindBeat") : t("mindRead");
  if (x.sa) { x.sa = null; x.sb = null; }
  ed.x = x; stopBeat(); Kit.sfx.win(); A.changed();
  var p = $("panel"); log(p, x.verdict, "duelres");
  var row = el("div", "chips");
  if (d.m === "flappy") row.appendChild(el("button", "chip", t("flyMe", { n: nameOf(d.b) }), function () { flyAgainst(ed); }));
  row.appendChild(el("button", "chip", "↩ " + t("duelAgain"), function () { reset(ed); }));
  p.appendChild(row); p.scrollTop = p.scrollHeight;
}
function stopBeat() { if (beat) { try { beat.stop(); } catch (e) {} beat = null; } }
function flyAgainst(ed) {
  var d = ed.doc, st = C.sanitizeState({ v: 1, seed: d.seed, params: d.g.params, theme: d.g.theme, title: nameOf(d.b), emoji: d.a.e });
  A.setGame(st, { score: ed.x.res.sb, name: nameOf(d.b) });
}
function reset(ed) { stopAll(); ed.x = null; setTabs(true); A.tab("Agent"); A.changed(); }
function start(ed) {
  var d = ed.doc, p = $("panel"), res; stopAll();
  Kit.store.agent = d.a; Kit.save(); setTabs(false); p.textContent = ""; p.classList.remove("tall");
  if (d.m === "flappy") { flyMatch(ed); return; }
  if (d.m === "mind") { mindStart(ed, p); return; }
  if (d.m === "deck") { deckStart(ed, p); return; }
  res = Duel.play(d, Kit.lang); ed.x = { res: res, i: 0, running: true, title: title(ed) };
  if (d.m === "rap" && !Kit.muted && S && S.renderBeat) { try { beat = Kit.playPcm(S.renderBeat({ k: "x---x-x-x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "----------------" }, 96, 1), S.SR, true); } catch (e) {} }
  (function step() {
    if (A.ed() !== ed || !ed.x) { stopBeat(); return; }
    var x = ed.x;
    if (x.i >= res.rounds.length) { end(ed, res); return; }
    log(p, line(d, res.rounds[x.i], x.i)); x.i++; A.changed(); Kit.sfx.tap();
    timer = setTimeout(step, reduce ? 0 : d.m === "rps" ? 520 : 1100);
  })();
}
function mindStart(ed, p) {
  var d = ed.doc, hist = [], m = { sa: 0, sb: 0, last: null };
  ed.x = { mind: m, res: { rounds: [], sa: 0, sb: 0 }, running: true, title: title(ed) };
  var left = el("p", "note", t("mindPick")), row = el("div", "chips");
  p.appendChild(left); p.appendChild(row);
  DD.sets[d.set].forEach(function (face, i) {
    row.appendChild(el("button", "chip em hand", face, function () {
      var y = Duel.mindHand(hist, d.b.c, Math.random()), o = Duel.outcome(i, y);
      hist.push(i); if (o > 0) m.sa++; else if (o < 0) m.sb++; m.last = [i, y]; Kit.sfx.tap();
      left.textContent = t("mindLeft", { n: Duel.ROUNDS.mind - hist.length }); A.changed();
      if (hist.length >= Duel.ROUNDS.mind) { row.remove(); end(ed, { rounds: [], sa: m.sa, sb: m.sb }); }
    }));
  });
}
function deckStart(ed, p) {
  var d = ed.doc, list = (d.w ? [d.w] : []).concat(DD.deck[Kit.lang]), i = 0, deck = { left: 60, text: list[0] };
  ed.x = { deck: deck, res: { rounds: [], sa: 0, sb: 0 }, running: true, title: title(ed) };
  p.appendChild(el("button", "chip", t("deckNext"), function () { i = (i + 1) % list.length; deck.text = list[i]; Kit.sfx.tap(); A.changed(); }));
  timer = setInterval(function () {
    if (A.ed() !== ed) { clearInterval(timer); return; }
    deck.left--; A.changed();
    if (deck.left <= 0) { clearInterval(timer); deck.text = t("deckEnd"); ed.x.verdict = t("deckEnd"); ed.x.done = true; ed.x.running = false; Kit.sfx.win(); p.textContent = ""; A.changed(); }
  }, 1000);
}
function share(ed) {
  var d = ed.doc; if (!d.t && ed.idea) { d.t = title(ed).slice(0, 40); ed.base.t = d.t; }
  d.ch = d.m === "deck" ? 0 : 1;
  var doc = D.withTrail(d, A.me().nick, D.changedAreas(ed.base, d)), pic = Object.assign({}, doc, { _x: ed.x });
  A.finish(doc, null, pic);
}
X.duel = {
  open: function (ed) { ed.x = null; setTabs(true); },
  footer: function (b, ed) {
    var x = ed.x; b.classList.remove("wait");
    b.textContent = !x ? t("duelGo") : x.done ? t("duelShare") : t("duelRun");
    b.classList.toggle("wait", !!x && !x.done);
  },
  main: function (ed) {
    if (!ed.x) { Kit.sfx.thud(); start(ed); return; }
    if (ed.x.done) { Kit.sfx.thud(); share(ed); }
  },
  label: function (doc) { return doc.ch ? { go: t("duelTake"), note: t("duelInvite", { n: nameOf(doc.a, t("someone")) }) } : null; },
  // A challenge link: the sender's agent becomes the rival, mine comes from my phone.
  incoming: function (doc) {
    if (!doc.ch) return false;
    var me = A.me(), d = D.sanitizeDoc(doc);
    d.b = doc.a; d.a = Duel.sanitizeAgent(Kit.store.agent, { n: me.nick, e: me.emoji }); d.ch = 0;
    A.openEditor(d, { idea: doc.i ? D.byId(doc.i) : null }); return true;
  }
};

/* ---------- secret channel ---------- */
function draftOf(ed) {
  var L = ed.idea ? (ed.idea[Kit.lang] || ed.idea.de) : null, qs = L ? L.riddles : [""];
  return { stops: qs.map(function (q) { return { q: q, a: "" }; }), end: L ? L.end : "" };
}
var sealTimer = 0;
function reseal(ed) {
  clearTimeout(sealTimer);
  sealTimer = setTimeout(async function () {
    if (A.ed() !== ed) return;
    var s = await Q.seal(ed.draft); ed.sealed = s;
    ed.doc.q0 = (ed.draft.stops[0] && ed.draft.stops[0].q) || ""; ed.doc.c = s ? s.c : []; ed.doc.h0 = s ? s.h0 : ""; A.changed();
  }, 180);
}
function safe(ed, set) { return function (v) { var c = Q.clean(v, Q.MAX_Q); if (v && !c) { Kit.toast(t("questBlocked")); return; } set(c); reseal(ed); }; }
A.PANEL.Riddle = function (p) {
  var ed = A.ed(), dr = ed.draft, i = Math.min(ed.stop || 0, dr.stops.length - 1), s = dr.stops[i];
  var row = el("div", "chips");
  dr.stops.forEach(function (_, n) { row.appendChild(el("button", "chip" + (n === i ? " on" : ""), String(n + 1), function () { ed.stop = n; A.tab("Riddle"); })); });
  if (dr.stops.length < Q.MAX_STOPS) row.appendChild(el("button", "chip", "＋ " + t("questAdd"), function () { dr.stops.push({ q: "", a: "" }); ed.stop = dr.stops.length - 1; reseal(ed); A.tab("Riddle"); }));
  if (dr.stops.length > 1) row.appendChild(el("button", "chip", "－", function () { dr.stops.splice(i, 1); ed.stop = 0; reseal(ed); A.tab("Riddle"); }));
  p.appendChild(row);
  A.field(p, t("questQ", { n: i + 1 }), s.q, Q.MAX_Q, safe(ed, function (v) { s.q = v; }));
  A.field(p, t("questA"), s.a, Q.MAX_A, safe(ed, function (v) { s.a = v; }));
  p.appendChild(el("p", "note", t("questNote")));
};
A.PANEL.End = function (p) {
  var ed = A.ed();
  A.field(p, t("questEnd"), ed.draft.end, Q.MAX_Q, safe(ed, function (v) { ed.draft.end = v; }), true);
  p.appendChild(el("label", "lbl", t("agLook")));
  A.chips(p, ["🗝️", "🔒", "💎", "🧭", "👑", "🍕", "🐙", "🛸"].map(function (e) { return { v: e, l: e }; }), ed.doc.e, function (v) { ed.doc.e = v; }, "em");
};
X.quest = {
  open: function (ed) { ed.draft = draftOf(ed); ed.stop = 0; ed.sealed = null; ed.x = null; ed.doc.c = []; setTabs(true); },
  areas: function (ed) { return ed.draft && ed.draft.stops.some(function (s) { return s.a; }) ? ["text"] : []; },
  footer: function (b, ed, ok) { var c = Q.complete(ed.draft) && ok; b.classList.toggle("wait", !c); b.textContent = c ? t("questLock") : t("questNeed"); },
  main: async function (ed) {
    if (!Q.complete(ed.draft)) { Kit.tone(200, 160, 0.1, "square", 0.06); return; }
    var s = await Q.seal(ed.draft); if (!s || A.ed() !== ed) return;
    Kit.sfx.thud(); ed.doc.q0 = s.q0; ed.doc.h0 = s.h0; ed.doc.c = s.c;
    if (!ed.doc.t && ed.idea) { ed.doc.t = title(ed).slice(0, 40); ed.base.t = ed.doc.t; }
    A.finish(D.withTrail(ed.doc, A.me().nick, A.areas()));
  },
  label: function (doc) { return doc.c.length ? { go: t("questTry"), note: t("questInvite") } : null; },
  incoming: function (doc) { if (!doc.c.length) return false; solve(doc); return true; }
};
function solve(doc) {
  var at = 0, q = doc.q0, h = doc.h0, wrong = 0, total = doc.c.length;
  A.shelf(doc.t || t("quest"), function render(b) {
    function draw() {
      b.textContent = "";
      b.appendChild(el("div", "qlock", doc.e));
      b.appendChild(el("p", "lbl", t("questStep", { n: at + 1, m: total })));
      b.appendChild(el("p", "qtext", q));
      var f = el("input", "field"); f.maxLength = 24; f.autocomplete = "off"; f.setAttribute("aria-label", t("questAns")); f.placeholder = t("questAns"); b.appendChild(f);
      var tip = el("p", "note", ""); b.appendChild(tip);
      if (wrong >= 2 && h) { var m = h.match(/^(.+?)(\d+)$/); if (m) tip.textContent = t("questTip", { l: m[1], n: m[2] }); }
      var go = el("button", "btn hot", t("questTry"), async function () {
        go.disabled = true; var r = await Q.open(doc.c[at], f.value); go.disabled = false;
        if (r && r.blocked) { done(t("questGone"), false); return; }
        if (!r) { wrong++; Kit.tone(200, 120, 0.2, "square", 0.08); Kit.haptic(40); tip.textContent = t("questWrong"); if (wrong >= 2) { draw(); } return; }
        wrong = 0; Kit.sfx.pop(); at++;
        if (r.e) done(r.e, true); else { q = r.q; h = r.h; draw(); }
      });
      b.appendChild(go);
    }
    function done(text, ok) {
      b.textContent = ""; if (ok) Kit.sfx.win();
      b.appendChild(el("div", "qlock", ok ? "🎉" : "🚫"));
      if (ok) b.appendChild(el("p", "lbl", t("questOpen")));
      b.appendChild(el("p", "qtext", text));
      b.appendChild(el("button", "btn hot", t("questOwn"), function () { A.openEditor(D.blankDoc("quest", A.me(), Kit.lang), { own: true }); }));
    }
    draw();
  });
}
})();
