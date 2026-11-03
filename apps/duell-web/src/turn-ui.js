/* Zug per Link on screen: one renderer for all games, driven by the prompts in turns.js. */
(function () {
"use strict";
var A = window.DailyApp, X = window.DailyModes, Tn = window.Turns, Q = window.Quest, C = window.DuellCore, D = window.Daily, R = window.Render, Kit = window.Kit, t = Kit.t, el = A.el;
function L() { return Tn.T(Kit.lang); }
function say(k, o) { return String(L()[k]).replace(/\{(\w+)\}/g, function (m, n) { return o[n]; }); }
function seed() { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0]; }

/* ---------- voices: only in this tab's memory, overwritten after use ---------- */
var VOICE = {};
function wipe(k) { if (VOICE[k]) VOICE[k].fill(0); delete VOICE[k]; }
function listen(ms) {
  return new Promise(function (done) {
    var over = false, fake = function () { if (over) return; over = true; Kit.toast(t("noMic")); done(Studio.dummyVoice()); }, wait = setTimeout(fake, 20000);   // a prompt nobody answers must not freeze the game
    var ac = Kit.audio(true);
    if (!navigator.mediaDevices || !ac || !ac.createScriptProcessor) { fake(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (st) {
      clearTimeout(wait); if (over) { st.getTracks().forEach(function (x) { x.stop(); }); return; }
      // Straight from the audio graph: no file, no codec, just samples in memory.
      var src = ac.createMediaStreamSource(st), sp = ac.createScriptProcessor(4096, 1, 1), mute = ac.createGain(), got = [], n = 0;
      mute.gain.value = 0; sp.onaudioprocess = function (e) { var c = e.inputBuffer.getChannelData(0); got.push(Float32Array.from(c)); n += c.length; };
      src.connect(sp); sp.connect(mute); mute.connect(ac.destination);
      setTimeout(function () {
        sp.disconnect(); src.disconnect(); mute.disconnect(); st.getTracks().forEach(function (x) { x.stop(); });
        var k = ac.sampleRate / Studio.SR, o = new Float32Array(Math.floor(n / k)), all = new Float32Array(n), at = 0;
        got.forEach(function (c) { all.set(c, at); at += c.length; c.fill(0); }); got.length = 0;
        for (var i = 0; i < o.length; i++) o[i] = all[Math.floor(i * k)];
        all.fill(0); over = true; done(o.length ? o : Studio.dummyVoice());
      }, ms);
    }).catch(fake);
  });
}
window.TurnVoice = { has: function (k) { return !!VOICE[k]; } };

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
  else if (!st.turn) { var i0 = doc.i ? D.byId(doc.i) : null; lines(c, [doc.s || (i0 ? (i0[Kit.lang] || i0.de).s : ""), L().you_start], W, H * 0.52, W * 0.05, ink); }   // the goal, not the machinery
  else lines(c, [say("picture_turn", { n: st.turn + 1, m: st.total })], W, H * 0.56, W * 0.05, ink);
};

/* ---------- one prompt ---------- */
var draw = {
  slide: function (box, p, set, ctx) {
    var v = p.def || p.min || 0, row = el("label", "slide"), r = el("input"), b = el("b", "", v);
    row.appendChild(el("span", "", "")); r.type = "range"; r.min = p.min || 0; r.max = p.maxOf ? p.maxOf(ctx.doc) : p.max; r.value = v; r.setAttribute("aria-label", L()[p.l]);
    r.addEventListener("input", function () { b.textContent = r.value; set(Number(r.value)); });
    row.appendChild(r); row.appendChild(b); box.appendChild(row); set(v);
  },
  show: function (box, p, set, ctx) {
    p.list(ctx.doc, ctx.m, ctx.now, Kit.lang).forEach(function (s) { box.appendChild(el("p", "qtext", s)); });
    if (p.later) box.appendChild(el("p", "note", L()[p.later]));
    set(0);
  },
  text: function (box, p, set, ctx) {
    if (p.top) box.appendChild(el("p", "qtext", p.top(ctx.doc, ctx.m, Kit.lang)));
    var f = el("input", "field"); f.maxLength = p.max; f.autocomplete = "off"; f.setAttribute("aria-label", L()[p.l]);
    f.addEventListener("input", function () { var v = f.value.trim(), ok = Tn.okAnswer(p, v, ctx.doc, Kit.lang, ctx.m, ctx.now); set(ok ? v : null); });
    box.appendChild(f); set(null);
  },
  list: function (box, p, set) {
    var fs = [];
    function up() { var v = fs.map(function (f) { return Q.clean(f.value, p.max); }), have = v.filter(Boolean); if (p.least && (have.length < p.least || new Set(have.map(Q.fold)).size < have.length)) { set(null); return; } set(p.loose ? fs.map(function (f, i) { return f.value.trim() ? v[i] : ""; }) : v.every(Boolean) && (p.same || new Set(v.map(Q.fold)).size === p.n) && (!p.bytes || new TextEncoder().encode(v.join("")).length <= p.bytes) ? v : null); }
    for (var i = 0; i < p.n; i++) { var f = el("input", "field"); f.maxLength = p.max; f.autocomplete = "off"; f.setAttribute("aria-label", L()[p.l] + " " + (i + 1)); if (p.hints) f.placeholder = p.hints(Kit.lang)[i]; f.addEventListener("input", up); box.appendChild(f); fs.push(f); }
    if (p.loose) up(); else set(null);
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
    var order = [], items = p.from(ctx.doc, ctx.m, ctx.now, Kit.lang), row = el("div", "chips");
    items.forEach(function (s, i) {
      var b = el("button", "chip", s, function () {
        Kit.sfx.tap(); var at = order.indexOf(i); if (at >= 0) order.splice(at, 1); else order.push(i);
        Array.from(row.children).forEach(function (x, n) { var w = order.indexOf(n); x.textContent = (w >= 0 ? w + 1 + ". " : "") + items[n]; x.classList.toggle("on", w >= 0); });
        if (order.length === items.length - 1) { order.push(items.findIndex(function (x, n) { return order.indexOf(n) < 0; })); Array.from(row.children).forEach(function (x, n) { x.textContent = order.indexOf(n) + 1 + ". " + items[n]; x.classList.add("on"); }); }
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
  clock: function (box, p, set, ctx) {
    var left = el("p", "lbl", String(p.secs)), t0 = Date.now(), tick = setInterval(function () {
      var s = p.secs - Math.floor((Date.now() - t0) / 1000); left.textContent = String(Math.max(0, s));
      if (s <= 0 || !box.isConnected) { clearInterval(tick); if (box.isConnected) set(0); }
    }, 250);
    box.appendChild(el("p", "qtext", p.text(ctx.doc, ctx.m, Kit.lang))); box.appendChild(left);
    box.appendChild(el("button", "chip", L().clk_done, function () { clearInterval(tick); set(0); })); set(null);
  },
  rec: function (box, p, set, ctx) {
    var b = el("button", "btn hot", "🎙 " + L().rec_go, function () {
      if (b.disabled) return; b.disabled = true; b.textContent = "● " + L().rec_on;
      listen(p.ms).then(function (pcm) { VOICE[p.slot] = pcm; b.textContent = "✓"; set(0); });
    });
    box.appendChild(b); set(null);
  },
  // One press, one playback, then the samples are overwritten and the slot is empty.
  once: function (box, p, set, ctx) {
    var pcm = VOICE[p.slot], b = el("button", "btn hot big", say("mau_from", { n: p.who(ctx.m) }), function () {
      if (!VOICE[p.slot]) return; var o = Studio.warp(VOICE[p.slot], p.fx(ctx.m)); Kit.playPcm(o, Studio.SR, false);
      wipe(p.slot); setTimeout(function () { o.fill(0); }, o.length / Studio.SR * 1000 + 200); b.disabled = true; b.textContent = L().mau_gone; set(0);
    });
    if (!pcm) { b.disabled = true; b.textContent = L().rec_lost; box.appendChild(b); set(0); return; }
    box.appendChild(b); set(null);
  },
  parrot: function (box, p, set) {
    var src = VOICE[p.from], row = el("div", "chips");
    row.appendChild(el("button", "chip", "▶ " + L().pap_back, function () { if (src) Kit.playPcm(Array.from(src).reverse(), Studio.SR, false); }));
    var r = el("button", "chip", "🎙 " + L().rec_go, function () {
      if (r.disabled) return; r.disabled = true; r.textContent = "● " + L().rec_on;
      listen(2500).then(function (pcm) { VOICE[p.slot] = pcm; Kit.playPcm(Float32Array.from(pcm).reverse(), Studio.SR, false); wipe(p.from); r.textContent = "✓"; setTimeout(function () { set(0); }, pcm.length / Studio.SR * 1000 + 300); });
    });
    row.appendChild(r); box.appendChild(row); set(null);
  },
  whose: function (box, p, set, ctx) {
    var s = p.slot(ctx.doc), row = el("div", "chips");
    box.appendChild(el("button", "chip", "▶ " + L().tie_play, function () { if (VOICE[s]) Kit.playPcm(Studio.warp(VOICE[s], p.fx(ctx.doc)), Studio.SR, false); }));
    p.from(ctx.doc, ctx.m).forEach(function (n, i) { row.appendChild(el("button", "chip", n, function () { Kit.sfx.tap(); if (i === 2 || ctx.now.length === 2) wipe(s); set(i); })); });
    box.appendChild(row); set(null);
  },
  // Five rounds: the target shows, the time runs by itself after a second, one tap stops it. Nothing is shown while it runs.
  inner: function (box, p, set, ctx) {
    var tg = p.targets(ctx.doc), r = 0, out = [], q = el("p", "qtext", ""), fake = el("p", "lbl fakeno", ""), b = el("button", "btn hot big", L().uhr_stop), t0 = 0, flick = 0;
    function round() {
      clearInterval(flick); fake.textContent = ""; b.disabled = true; t0 = 0;
      q.textContent = say("uhr_target", { n: tg[r] / 1000 }) + (r === 1 ? " " + L().uhr_warn : "");
      setTimeout(function () {
        if (!box.isConnected) return; t0 = performance.now(); b.disabled = false; q.textContent = L().uhr_count;
        if (r) flick = setInterval(function () { fake.textContent = String(1 + Math.floor(Math.random() * 9)); }, 700);   // a distraction, never a hint: it does not follow the time
      }, 1000);
    }
    b.addEventListener("click", function () {
      var d = performance.now() - t0; if (!t0 || d < 500) return;
      clearInterval(flick); out.push(Math.max(-20000, Math.min(20000, Math.round(d - tg[r])))); Kit.sfx.pop(); r++;
      if (r >= tg.length) { b.disabled = true; set(out); } else round();
    });
    box.appendChild(q); box.appendChild(fake); box.appendChild(b); round(); set(null);
  },
  // Stop at the goal without seeing a clock; the next try starts by itself, a stop under two seconds does not count.
  blind: function (box, p, set) {
    var n = 0, best = 0, q = el("p", "qtext", L().pok_ready), info = el("p", "lbl", ""), b = el("button", "btn hot big", L().pok_stop), t0 = 0;
    function go() { b.disabled = true; setTimeout(function () { if (!box.isConnected) return; t0 = performance.now(); b.disabled = false; q.textContent = say("pok_try", { n: n + 1, m: p.tries }); }, 1000); }
    b.addEventListener("click", function () {
      var d = Math.round(performance.now() - t0); if (!t0 || d < 2000) return; t0 = 0;
      n++; if (!best || Math.abs(d - p.goal) < Math.abs(best - p.goal)) best = Math.min(30000, d);
      info.textContent = say("pok_got", { n: (d / 1000).toFixed(2) }); Kit.sfx.pop();
      if (n >= p.tries) { b.disabled = true; set(best); } else go();
    });
    box.appendChild(q); box.appendChild(b); box.appendChild(info); go(); set(null);
  },
  // Tap a fry to mark it and all to its right, tap it again to take them; the bot answers after a short look.
  nim: function (box, p, set, ctx) {
    var h = p.heaps.slice(), good = ctx.now[0][0] === 1, mark = null, step = 0, wrap = el("div", "nim"), info = el("p", "lbl", L().pom_you);
    function draw() {
      wrap.textContent = "";
      h.forEach(function (n, i) {
        wrap.appendChild(el("p", "lbl", say("pom_pile", { i: i + 1 })));
        var row = el("div", "chips");
        for (var k = 0; k < n; k++) (function (k) {
          var on = mark && mark[0] === i && k >= mark[1];
          row.appendChild(el("button", "chip fry" + (on ? " on" : ""), "🍟", function () {
            if (info.dataset.busy) return;
            if (!on) { mark = [i, k]; Kit.sfx.tap(); draw(); return; }
            take(i, n - mark[1], false);
          }));
        })(k);
        wrap.appendChild(row);
      });
    }
    function left() { return h.reduce(function (a, b) { return a + b; }, 0); }
    function take(i, k, bot) {
      h[i] -= k; mark = null; step++; Kit.sfx[bot ? "tap" : "pop"](); draw();
      if (!left()) { info.textContent = bot ? L().pom_won : L().pom_lost; set(bot ? 1 : 0); return; }
      if (bot) { info.textContent = say("pom_botdid", { k: k, i: i + 1 }) + " " + L().pom_you; return; }
      info.dataset.busy = "1"; info.textContent = L().pom_think;
      setTimeout(function () { if (!box.isConnected) return; delete info.dataset.busy; var mv = p.bot(ctx.doc, h, step, good); take(mv[0], mv[1], true); }, 600);
    }
    box.appendChild(info); box.appendChild(wrap); draw(); set(null);
  },
  // Five rounds: shapes come one after the other, only the star counts. A wrong tap costs half a second.
  react: function (box, p, set, ctx) {
    var plan = p.plan(ctx.doc), r = 0, k = 0, sum = 0, t0 = 0, star = false, timer = 0, pad = el("button", "touchpad react", ""), info = el("p", "lbl", L().rea_rule), SH = ["●", "▲", "■"];
    function next() {
      clearTimeout(timer); pad.textContent = ""; star = false; t0 = 0;
      if (r >= plan.length) { set(Math.min(60000, Math.round(sum))); info.textContent = say("rea_done", { n: (sum / 1000).toFixed(2) }); return; }
      timer = setTimeout(function () {
        if (!box.isConnected) return;
        if (k < plan[r].decoys) { pad.textContent = SH[(r + k) % 3]; k++; timer = setTimeout(next, 650); return; }
        pad.textContent = "★"; star = true; t0 = performance.now();
        timer = setTimeout(function () { sum += 2000; r++; k = 0; next(); }, 2000);
      }, plan[r].pause);
    }
    pad.addEventListener("pointerdown", function (e) {
      e.preventDefault(); if (r >= plan.length) return;
      if (star) { clearTimeout(timer); sum += performance.now() - t0; r++; k = 0; Kit.sfx.pop(); next(); }
      else if (pad.textContent) { sum += 500; Kit.tone(200, 90, 0.08, "square", 0.05); info.textContent = L().rea_wrong; }
    });
    box.appendChild(info); box.appendChild(pad); next(); set(null);
  },
  // The bouncer: a being at the door, "out" left and "in" right; the being keeps its frame for a moment after each tap.
  door: function (box, p, set, ctx) {
    var doc = ctx.doc, order = Tn.doorOrder(doc), k = 0, i = 0, right = 0, total = 0, run = 0, prev = [], lock = false, t0 = Date.now(), cur;
    var ANI = ["🐱", "🐶", "🐸", "🐰"], COL = ["#e53935", "#1e63d6", "#f2c200"], PAT = ["", "repeating-linear-gradient(45deg,rgba(255,255,255,.35) 0 6px,transparent 6px 12px)", "radial-gradient(rgba(255,255,255,.45) 2px,transparent 3px) 0 0/12px 12px"];
    var clock = el("p", "lbl", ""), dots = el("p", "doordots", ""), news = el("p", "qtext", ""), being = el("div", "being"), row = el("div", "doorrow");
    function show() {
      cur = Tn.doorBeing(doc, order[k], i, prev);
      being.className = "being"; being.textContent = "";
      being.appendChild(el("div", "bhat", cur[1] ? "🎩" : ""));
      var face = el("div", "bface", ANI[cur[0]]); face.style.background = COL[cur[2]]; if (PAT[cur[2]]) face.style.backgroundImage = PAT[cur[2]]; being.appendChild(face);
      being.appendChild(el("div", "bsocks", cur[3] ? "🧦🧦" : ""));
      dots.textContent = "●".repeat(run) + "○".repeat(p.streak - run) + "   " + say("tue_found", { n: k });
    }
    function done() { lock = true; set([k, right, total]); }
    function tap(inside) {
      if (lock) return; lock = true; total++;
      var ok = Tn.doorIn(order[k], cur) === inside; prev.push(Tn.doorIn(order[k], cur));
      if (ok) { right++; run++; Kit.sfx.pop(); } else { run = 0; Kit.tone(200, 90, 0.08, "square", 0.05); }
      being.classList.add(ok ? "ok" : "no");
      setTimeout(function () {
        if (!box.isConnected) return;
        i++; news.textContent = "";
        if (run >= p.streak) { k++; run = 0; prev = []; i = 0; news.textContent = L().tue_new; Kit.haptic(30); }
        if (k >= order.length) { done(); return; }
        lock = false; show();
      }, 600);
    }
    row.appendChild(el("button", "btn doorout", L().tue_out, function () { tap(false); }));
    row.appendChild(el("button", "btn doorin", L().tue_in, function () { tap(true); }));
    box.appendChild(clock); box.appendChild(dots); box.appendChild(news); box.appendChild(being); box.appendChild(row);
    var tick = setInterval(function () {
      var left = p.secs - Math.floor((Date.now() - t0) / 1000); clock.textContent = String(Math.max(0, left));
      if (left <= 0 || !box.isConnected) { clearInterval(tick); if (box.isConnected && !lock) done(); else if (box.isConnected) setTimeout(function () { if (box.isConnected) set([k, right, total]); }, 650); }
    }, 250);
    show(); set(null);
  },
  // The beat plays and breaks off; the stop card names the statue. People judge the wobbling, the phone sees nothing.
  freeze: function (box, p, set, ctx) {
    var bpm = 124, pcm = Studio.renderBeat(p.beat(ctx.now[0][0]), bpm, 8), loop = null, timer = 0, r = 0, card = el("p", "qtext", L().dis_ready);
    function stop() { if (loop) { try { loop.stop(); } catch (e) {} loop = null; } clearTimeout(timer); }
    function go() {
      stop(); if (!box.isConnected) return; card.textContent = "♪ ♪ ♪"; loop = Kit.playPcm(pcm, Studio.SR, true);
      timer = setTimeout(function () { stop(); if (!box.isConnected) return; Kit.haptic(80); card.textContent = say("dis_stop", { s: p.statue(ctx.doc, r, Kit.lang) }); r++; }, p.pause(ctx.doc, r) * 1000);
    }
    box.appendChild(card);
    box.appendChild(el("button", "chip", L().dis_play, go));
    box.appendChild(el("button", "chip", L().dis_end, function () { stop(); set(Math.min(p.max, r)); }));
    set(null);
  },
  // Each phone in the call shows its own side from the same link: the figure to speak, or six cards to guess from.
  voices: function (box, p, set, ctx) {
    var speak = ctx.now[0][0] === 0, r = 0, hits = 0, q = el("p", "qtext", ""), row = el("div", "chips"), info = el("p", "lbl", "");
    function round() {
      row.textContent = ""; info.textContent = say("stm_round", { n: r + 1, m: p.rounds });
      if (r >= p.rounds) { q.textContent = speak ? L().stm_done : say("stm_h", { n: hits }); set(hits); return; }
      if (speak) { q.textContent = p.figure(ctx.doc, r, Kit.lang); row.appendChild(el("button", "chip", L().next, function () { r++; round(); })); return; }
      q.textContent = L().stm_which;
      p.cards(ctx.doc, r, Kit.lang).forEach(function (s, i) {
        row.appendChild(el("button", "chip", s, function () { var ok = i === p.right(ctx.doc, r); if (ok) { hits++; Kit.sfx.pop(); } else Kit.tone(200, 90, 0.08, "square", 0.05); Kit.toast(ok ? L().stm_yes : say("stm_no", { s: p.figure(ctx.doc, r, Kit.lang) })); r++; round(); }));
      });
    }
    box.appendChild(info); box.appendChild(q); box.appendChild(row); round(); if (r < p.rounds) set(null);
  },
  // A door opens on its day in December, on the phone's own date; after Christmas all of them stay open.
  doors: function (box, p, set, ctx) {
    var now = new Date(), open = now.getMonth() === 11 ? now.getDate() : now.getMonth() === 0 ? 24 : 0, g = el("div", "bgrid sgrid"), say1 = el("p", "qtext", open ? L().adv_tap : L().adv_wait);
    for (var i = 0; i < 24; i++) (function (i) {
      var c = el("button", "bcell", String(i + 1), function () { if (i < open) { say1.textContent = p.text(ctx.doc, ctx.m, i, Kit.lang); c.classList.add("on"); Kit.sfx.pop(); } else Kit.tone(200, 90, 0.08, "square", 0.05); });
      c.disabled = i >= open; g.appendChild(c);
    })(i);
    box.appendChild(say1); box.appendChild(g); set(null);
  },
  // The price falls in eight seconds; a tap buys at the price shown. Only the tap goes into the link.
  drop: function (box, p, set, ctx) {
    var n = el("p", "qtext", String(p.max)), t0 = 0, run = 0, done = false, b;
    box.appendChild(el("p", "lbl", say("aq_item", { o: p.item(ctx.doc, Kit.lang), v: p.worth(ctx.doc) })));
    box.appendChild(n);
    function price() { return Math.max(0, p.max - Math.floor((Date.now() - t0) / 80)); }
    b = el("button", "chip", L().aq_start, function () {
      if (done) return;
      if (!t0) { t0 = Date.now(); b.textContent = L().aq_now; run = setInterval(function () { var v = price(); n.textContent = String(v); if (!v || !box.isConnected) { clearInterval(run); if (!done && box.isConnected) { done = true; set(0); } } }, 50); return; }
      done = true; clearInterval(run); Kit.sfx.pop(); set(price());
    });
    box.appendChild(b); set(null);
  },
  grid: function (box, p, set) {
    var on = [], g = el("div", "bgrid sgrid");
    for (var i = 0; i < 25; i++) (function (i) {
      var c = el("button", "bcell", null, function () { var at = on.indexOf(i); if (at >= 0) on.splice(at, 1); else if (on.length < p.n) on.push(i); c.classList.toggle("on", on.indexOf(i) >= 0); Kit.sfx.tap(); set(on.length === p.n ? on.slice() : null); });
      c.setAttribute("aria-label", String(i + 1)); g.appendChild(c);
    })(i);
    box.appendChild(g); set(null);
  },
  // The answers come from the other side's hidden socks in the link: found, near or far.
  probe: function (box, p, set, ctx) {
    var socks = p.socks(ctx.doc, ctx.m), old = p.before(ctx.doc, ctx.m), taps = [], g = el("div", "bgrid sgrid"), mark = ["·", "~", "🧦"], info = el("p", "lbl", say("sok_left", { n: p.n }));
    function show(c, i) { var a = Tn.sockAnswer(socks, i); c.textContent = mark[a]; c.classList.add("a" + a); c.disabled = true; }
    for (var i = 0; i < 25; i++) (function (i) {
      var c = el("button", "bcell", null, function () {
        if (taps.length >= p.n) return; taps.push(i); show(c, i); Kit.sfx[Tn.sockAnswer(socks, i) === 2 ? "pop" : "tap"]();
        info.textContent = say("sok_left", { n: p.n - taps.length }); set(taps.slice());
      });
      c.setAttribute("aria-label", String(i + 1)); if (old.indexOf(i) >= 0) show(c, i); g.appendChild(c);
    })(i);
    box.appendChild(info); box.appendChild(g); box.appendChild(el("p", "note", L().sok_key)); set(null);
  },
  // A puff of air puts out a candle. The microphone only gives a loudness, nothing is kept; without it a tap does the same.
  blow: function (box, p, set) {
    var row = el("div", "chips"), left = p.n, st = null, ac = null, last = 0;
    function out(b) { if (b.disabled) return; b.disabled = true; b.textContent = "·"; Kit.sfx.pop(); left--; if (!left) { stop(); set(0); } }
    function stop() { if (st) st.getTracks().forEach(function (x) { x.stop(); }); if (ac) ac.close(); st = ac = null; }
    for (var i = 0; i < p.n; i++) (function () { var b = el("button", "chip", "🕯️", function () { out(b); }); row.appendChild(b); })();
    box.appendChild(row);
    box.appendChild(el("button", "chip", L().ker_mic, async function () {
      try {
        st = await navigator.mediaDevices.getUserMedia({ audio: true }); ac = new AudioContext();
        var an = ac.createAnalyser(), buf = new Uint8Array(an.fftSize); ac.createMediaStreamSource(st).connect(an);
        (function loop() {
          if (!st || !box.isConnected) { stop(); return; }
          an.getByteTimeDomainData(buf); var s = 0; buf.forEach(function (x) { s += (x - 128) * (x - 128); });
          if (Math.sqrt(s / buf.length) > 28 && Date.now() - last > 450) { last = Date.now(); var b = Array.from(row.children).find(function (x) { return !x.disabled; }); if (b) out(b); }
          requestAnimationFrame(loop);
        })();
      } catch (e) { Kit.toast(L().ker_nomic); }
    }));
    set(null);
  },
  // Each word on a paper in the room opens the next hint; the time is what stays.
  hunt: function (box, p, set, ctx) {
    var list = p.list(ctx.doc, ctx.m, Kit.lang), at = 0, t0 = Date.now(), hint = el("p", "qtext", list[0].hint), f = el("input", "field");
    f.maxLength = 30; f.autocomplete = "off"; f.setAttribute("aria-label", L()[p.l]);
    f.addEventListener("input", function () {
      if (Q.fold(f.value.trim()) !== Q.fold(list[at].w)) return;
      Kit.sfx.pop(); at++; f.value = "";
      if (at >= list.length) set(Math.min(p.max, Math.max(1, Math.round((Date.now() - t0) / 1000)))); else hint.textContent = list[at].hint;
    });
    box.appendChild(hint); box.appendChild(f); set(null);
  },
  // Every tap is kept, so the other phone can replay the game. Nothing here looks at the player: the stream of blocks is fixed by the seed.
  blocks: function (box, p, set, ctx) {
    var doc = ctx.doc, moves = [], st = { grid: new Array(64).fill(0), score: 0, lines: 0, i: 0 }, grid = el("div", "bgrid"), info = el("p", "lbl", ""), shapes = el("div", "bnext"), cells = [];
    function mini(b) { var m = el("div", "bmini"); b.forEach(function (c) { var i = el("i"); i.style.gridColumn = c[0] + 1; i.style.gridRow = c[1] + 1; m.appendChild(i); }); return m; }
    function show() {
      cells.forEach(function (c, i) { c.classList.toggle("on", !!st.grid[i]); });
      info.textContent = say("blk_score", { n: st.score }); shapes.textContent = "";
      shapes.appendChild(el("span", "", L().blk_now)); shapes.appendChild(mini(Tn.blockAt(doc, st.i))); shapes.appendChild(el("span", "", L().blk_next)); shapes.appendChild(mini(Tn.blockAt(doc, st.i + 1)));
    }
    function end() { set(moves.slice()); }
    for (var i = 0; i < 64; i++) (function (i) {
      var c = el("button", "bcell", null, function () {
        var b = Tn.blockAt(doc, st.i);
        if (!Tn.fits(st.grid, b, i)) { Kit.tone(200, 90, 0.08, "square", 0.05); return; }
        st = Tn.drop(st, b, i); moves.push(i); show(); Kit.sfx.tap();
        if (st.lines) { Kit.sfx.pop(); Kit.haptic(st.lines > 1 ? 50 : 20); if (st.lines > 1) Kit.toast(L().blk_combo + " x" + st.lines); }
        if (moves.length >= p.max || !Tn.canMove(st, doc)) end();
      });
      c.setAttribute("aria-label", String(i + 1)); cells.push(c); grid.appendChild(c);
    })(i);
    box.appendChild(info); box.appendChild(shapes); box.appendChild(grid); box.appendChild(el("button", "chip", L().blk_end, end));
    show(); set(null);
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
  var d = ed.next; if (!d) return; ed.next = null; ed.doc = d; A.changed();
  if (Tn.state(d).over) { A.tab("Move"); return; }
  box.textContent = ""; box.appendChild(el("p", "qtext", L().hand));
  box.appendChild(el("button", "btn hot", L().hand_go, function () { Kit.sfx.tap(); walk(box, ed); }));
}
// Goes through the turn's prompts one by one; each screen shows only what that step may know.
function walk(box, ed) {
  var st = Tn.state(ed.doc), now = [], i = 0;
  function step() {
    box.textContent = ""; box.style.pointerEvents = "none"; setTimeout(function () { box.style.pointerEvents = ""; }, 250);
    if (i >= st.prompts.length && Tn.GAMES[ed.doc.g].stay && st.turn) { ed.next = null; A.changed(); box.appendChild(el("p", "lbl", L().stay_note)); return; }   // the same link goes on to the next person
    if (i >= st.prompts.length) { ed.move = now; ed.next = Tn.play(ed.doc, now, Tn.today());
      if (Tn.GAMES[ed.doc.g].local || (ed.next && Tn.state(ed.next).over)) { pass(box, ed); return; }
      A.changed(); box.appendChild(el("p", "lbl", L().ready)); box.appendChild(el("button", "btn", L().hand_same, function () { pass(box, ed); })); return; }
    var p = st.prompts[i], cur = null, go = el("button", "btn hot", L().next, function () {
      if (cur === null || !go.isConnected) return; Kit.sfx.pop(); now.push(cur); cur = null; i++; step();
    });
    if (p.peek) box.appendChild(el("p", "qtext", p.peek(ed.doc, st.moves, now, Kit.lang)));
    if (!p.top || p.w !== "pick" || !p.auto) box.appendChild(el("label", "lbl", p.title ? p.title(ed.doc, Kit.lang) : L()[p.l].replace(": {q}", "")));
    var soon = 0;
    draw[p.w](box, p, function (v) {
      cur = v; go.disabled = v === null; clearTimeout(soon);
      if (v === null) return;
      if (!p.auto) try { go.scrollIntoView({ block: "nearest" }); } catch (e) {}
      if (p.auto) go.click(); else if (p.w === "rank" || (p.w === "pick" && p.n > 1)) soon = setTimeout(function () { if (box.isConnected && cur === v) go.click(); }, 450);   // a short look at the choice, then on
    }, { doc: ed.doc, m: st.moves, now: now });
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
    if (res.note) p.appendChild(el("p", "note", res.note));
    p.appendChild(el("button", "btn hot", L().rematch, function () { var d = Tn.fresh(doc, seed()); A.openEditor(d, { idea: d.i ? D.byId(d.i) : null }); }));
    return;
  }
  if (left) { p.appendChild(el("p", "qtext", say("note_wait", { n: left }))); return; }
  var w = Tn.whole(doc, Kit.lang); if (w) p.appendChild(el("p", "qtext", w));
  if (ed.next) { p.appendChild(el("p", "lbl", L().ready)); p.appendChild(el("button", "btn", L().redo, function () { ed.next = null; A.changed(); A.tab("Move"); })); return; }
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
  // Every game on one shelf as a tile with its own sign, grouped by when it fits, plus one button for a surprise.
  menu: function () {
    var all = D.IDEAS.filter(function (i) { return i.kind === "turn"; }), COL = { streit: "#ff3b1d", pause: "#1d7cff", abend: "#7a3bff", geschenk: "#ff5fa2", raum: "#12a150" };
    function start(i) { Kit.sfx.thud(); A.openEditor(D.docFromIdea(i, A.me(), Kit.lang), { idea: i }); }
    A.shelf(say("turn_all", { n: all.length }), function (b) {
      b.appendChild(el("p", "note", t("turnH")));
      if (window.LiveUI && window.LiveUI.on()) b.appendChild(el("button", "btn hot live", t("live_tile"), function () { Kit.sfx.thud(); window.LiveUI.invite(); }));
      if (window.TableUI && window.LiveUI && window.LiveUI.on()) [["doko", "tb_doko"], ["skat", "tb_skat"]].forEach(function (g) { b.appendChild(el("button", "btn hot live", t(g[1]), function () { Kit.sfx.thud(); window.TableUI.open(g[0]); })); });
      b.appendChild(el("button", "btn hot", "🎲 " + L().turn_any, function () { start(all[seed() % all.length]); }));
      ["streit", "pause", "abend", "geschenk", "raum"].forEach(function (g) {
        b.appendChild(el("label", "lbl", L()["grip_" + g]));
        var box = el("div", "tiles");
        all.filter(function (i) { return i.turn.grip === g; }).forEach(function (i) {
          var T = i[Kit.lang] || i.de, m = el("button", "mech tile", null, function () { start(i); }), c = document.createElement("canvas");
          c.width = c.height = 96; shape(c.getContext("2d"), i.turn.f, 48, 48, 30, COL[g]);
          m.appendChild(c); m.appendChild(el("b", "", T.t.replace("|", " "))); m.appendChild(el("small", "", T.s)); box.appendChild(m);
        });
        b.appendChild(box);
      });
    });
  },
  open: function (ed) { ed.next = null; if (!Tn.state(ed.doc).turn) { ed.doc.seed = Tn.GAMES[ed.doc.g].daily ? Tn.today() : seed(); ed.base.seed = ed.doc.seed; ed.doc.q = ""; ed.base.q = ""; } },
  areas: function (ed) { return ed.next ? ["regeln"] : []; },
  footer: function (b, ed) {
    var over = !!Tn.result(ed.doc, Kit.lang), ok = over || !!ed.next;
    b.hidden = ed.doc.g === "sorry" && over;
    b.classList.toggle("wait", !ok); b.textContent = over ? L().result_pic : ed.next ? L().send : L().need;
  },
  main: function (ed) {
    var over = !!Tn.result(ed.doc, Kit.lang);
    if (!over && !ed.next) { Kit.tone(200, 160, 0.1, "square", 0.06); var g = document.querySelector("#panel .btn.hot, #panel .chip, #panel .field"); if (g) { g.scrollIntoView({ block: "center" }); g.classList.add("nudge"); setTimeout(function () { g.classList.remove("nudge"); }, 700); } return; }
    Kit.sfx.thud(); A.finish(over ? ed.doc : ed.next);
  },
  label: function (doc) {
    var st = Tn.state(doc), left = Tn.gate(doc, Tn.today());
    if (st.over) return { go: L().go_view, note: L().note_over };
    if (left) return { go: L().go_play, note: say("note_wait", { n: left }) };
    return st.turn ? { go: L().go_play, note: say("note_turn", { n: st.turn + 1, m: st.total }) } : { go: L().go_first, note: "" };
  }
};
})();
