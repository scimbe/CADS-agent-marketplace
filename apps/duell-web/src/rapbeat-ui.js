/* Straßenrap-Beat on screen (part "rapbeat", sound and rule in src/rapbeat.js): the turn editor's step "rapbeat" and the
   card picture. Style, tempo, key, mood and a variation number make the beat; every change goes into the link at once
   (only those five numbers, the footer shares it). Play loops the hook, a verse or the whole song; the recording mode
   counts one bar in and plays the song once, without a click under the beat. "WAV speichern" renders the whole song on
   the device (no server) and saves it as a 16-bit WAV. */
(function (root) {
  "use strict";
  var A = root.DailyApp, Tn = root.Turns, M = root.RapBeat, Kit = root.Kit, R = root.Render, D = root.Daily, el = A.el;
  function L() { return Tn.T(Kit.lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function press(b, on) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
  var P = { ink: "#0E0E10", hot: "#F2C230", red: "#E0442B", grey: "#8A8A93", cream: "#F4F1EA" };
  var CSS = ".rb h4{margin:14px 0 6px}.rb .rbrow{display:flex;flex-wrap:wrap;gap:8px}.rb .chip small{display:block;font-weight:500;opacity:.75;font-size:12px}" +
    ".rb .rbplay{width:100%;min-height:56px;font-size:20px;margin:14px 0 4px}.rb .rbsave{margin-top:16px}.rb input[type=range]{width:100%;min-height:44px}.rb select{min-height:44px;font-size:16px;border-radius:12px;padding:0 10px}" +
    ".rb .rbtempo{display:flex;justify-content:space-between;align-items:baseline}.rb .rbrec{display:flex;gap:10px;align-items:center;min-height:44px;margin-top:10px}.rb .rbrec input{width:24px;height:24px}" +
    ".rb .rbstat{min-height:1.4em}.rb .rbvar{display:flex;gap:10px;align-items:center}";
  function css() { if (document.getElementById("rbcss")) return; var s = document.createElement("style"); s.id = "rbcss"; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- sound out: one source at a time ----------
  var cur = null, cache = { key: "", buf: null, res: null };
  function stop() { if (cur) { try { cur.onended = null; cur.stop(); } catch (e) {} cur = null; } }
  function buffer(ac, r) { var b = ac.createBuffer(2, r.L.length, r.sr); b.getChannelData(0).set(r.L); b.getChannelData(1).set(r.R); return b; }
  function start(r, loop, done) {
    var ac = Kit.audio(true); if (!ac) return false;
    stop(); var s = ac.createBufferSource(); s.buffer = buffer(ac, r); s.loop = loop; s.connect(ac.destination);
    s.onended = function () { if (cur === s) { cur = null; if (done) done(); } };
    s.start(); cur = s; return true;
  }

  // ---------- the step in the turn editor ----------
  root.Turn2.add("widget", "rapbeat", function (box, p, set, ctx) {
    css();
    var X = L(), ed = ctx.ed, got = M.last(ctx.m), st = ed.rb;
    if (!st || st.seed !== ed.doc.seed) st = ed.rb = { seed: ed.doc.seed, v: got && M.ok(got) ? got.slice() : M.fresh(0, ed.doc.seed), loop: "hook", rec: false, busy: false };
    var wrap = el("div", "rb"), stat = el("p", "note rbstat"), play = el("button", "btn hot rbplay"), save = el("button", "btn rbsave"), timer = 0, token = 0;
    stat.setAttribute("aria-live", "polite"); play.dataset.rb = "play"; save.dataset.rb = "wav";
    function v() { return st.v; }
    function changed(again) { set(v().slice()); A.changed(); if (cur && again !== false) { clearTimeout(timer); timer = setTimeout(go, 250); } draw(); }
    function chipRow(label, items, isOn, onPick) {
      var row = el("div", "rbrow"); row.setAttribute("role", "group"); row.setAttribute("aria-label", label);
      items.forEach(function (it, i) {
        var b = el("button", "chip", null, function () { Kit.sfx.tap(); onPick(i); });
        b.appendChild(document.createTextNode(it[0])); if (it[1]) b.appendChild(el("small", "", it[1])); b.dataset.i = String(i); press(b, isOn(i)); row.appendChild(b);
      });
      wrap.appendChild(el("h4", "lbl", label)); wrap.appendChild(row); return row;
    }
    var styles = chipRow(X.rb_style_h, M.STYLES.map(function (s) { return [X["rb_s_" + s.id], s.lo + "–" + s.hi + " BPM"]; }), function (i) { return v()[0] === i; }, function (i) {
      var r = M.range(i), b = v()[1]; st.v[0] = i; st.v[1] = b >= r[0] && b <= r[1] ? b : M.STYLES[i].bpm; tempo.min = r[0]; tempo.max = r[1]; tempo.value = st.v[1]; changed();
    });
    styles.dataset.rb = "styles";
    wrap.appendChild(play);
    var th = el("div", "rbtempo"), tl = el("h4", "lbl", X.rb_tempo_h), tv = el("strong", ""); th.appendChild(tl); th.appendChild(tv); wrap.appendChild(th);
    var tempo = el("input"); tempo.type = "range"; tempo.step = 1; tempo.setAttribute("aria-label", X.rb_tempo_h); tempo.dataset.rb = "bpm";
    tempo.min = M.range(v()[0])[0]; tempo.max = M.range(v()[0])[1]; tempo.value = v()[1];
    tempo.addEventListener("input", function () { st.v[1] = Number(tempo.value); changed(); });
    wrap.appendChild(tempo);
    wrap.appendChild(el("h4", "lbl", X.rb_key_h));
    var key = el("select"); key.setAttribute("aria-label", X.rb_key_h); key.dataset.rb = "key";
    M.KEYS.forEach(function (k, i) { var o = el("option", "", fmt(X.rb_minor, { k: M.keyName(i, Kit.lang) })); o.value = String(i); key.appendChild(o); });
    key.value = String(v()[2]); key.addEventListener("change", function () { st.v[2] = Number(key.value); changed(); });
    wrap.appendChild(key);
    var moods = chipRow(X.rb_mood_h, M.MOODS.map(function (m) { return [X["rb_m_" + m]]; }), function (i) { return v()[3] === i; }, function (i) { st.v[3] = i; changed(); });
    wrap.appendChild(el("h4", "lbl", X.rb_var_h));
    var vr = el("div", "rbvar"), vn = el("span", ""), dice = el("button", "btn", "🎲 " + X.rb_dice, function () {
      Kit.sfx.tap(); st.v[4] = (st.v[4] * 7919 + 4513) % M.SEEDS; changed();   // the next number in a fixed walk: no Math.random
    });
    dice.dataset.rb = "dice"; vr.appendChild(dice); vr.appendChild(vn); wrap.appendChild(vr);
    var loops = chipRow(X.rb_loop_h, [[X.rb_hook], [X.rb_verse], [X.rb_song]], function (i) { return ["hook", "verse", "song"][i] === st.loop; }, function (i) { st.loop = ["hook", "verse", "song"][i]; if (cur) go(); draw(); });
    var rec = el("label", "rbrec"), rc = el("input"); rc.type = "checkbox"; rc.checked = st.rec; rc.dataset.rb = "rec";
    rc.addEventListener("change", function () { st.rec = rc.checked; if (cur) go(); draw(); });
    rec.appendChild(rc); rec.appendChild(el("span", "", X.rb_rec)); wrap.appendChild(rec);
    wrap.appendChild(save); wrap.appendChild(stat);
    play.addEventListener("click", function () { Kit.sfx.tap(); if (cur) { stop(); draw(); } else go(); });
    save.addEventListener("click", function () { Kit.sfx.tap(); wavOut(); });
    box.appendChild(wrap);

    function opt() { var o = st.rec ? { from: 0, bars: M.SONG.length, countIn: true } : M.loop(st.loop); if (!st.rec && st.loop !== "song") o.wrap = true; return o; }
    function go() {
      var o = opt(), k = JSON.stringify([v(), o]), my = ++token;
      if (cache.key === k) { start(cache.res, !st.rec, draw); draw(); return; }
      stop(); stat.textContent = X.rb_wait; play.disabled = true;
      M.renderAsync(v().slice(), o, function (f) { if (my === token) stat.textContent = fmt(X.rb_wait_n, { n: Math.round(f * 100) }); }).then(function (r) {
        if (my !== token || !box.isConnected) return;
        cache = { key: k, res: r }; play.disabled = false;
        if (!start(r, !st.rec, draw)) stat.textContent = X.rb_nosound; else stat.textContent = st.rec ? X.rb_rec_go : M.label(v(), Kit.lang);
        draw();
      }, function () { play.disabled = false; stat.textContent = X.rb_fail; });
    }
    function wavOut() {
      if (st.busy) return; st.busy = true; save.disabled = true; var my = v().slice(), o = { from: 0, bars: M.SONG.length, countIn: st.rec };
      stat.textContent = X.rb_wait;
      M.renderAsync(my, o, function (f) { stat.textContent = fmt(X.rb_wav_n, { n: Math.round(f * 100) }); }).then(function (r) {
        var bytes = M.wav(r.L, r.R, r.sr), blob = new Blob([bytes], { type: "audio/wav" });
        st.busy = false; save.disabled = false; stat.textContent = fmt(X.rb_wav_done, { n: Math.round(r.L.length / r.sr) });
        return Kit.saveFile(blob, M.fileName(my, Kit.lang));
      }).catch(function () { st.busy = false; save.disabled = false; stat.textContent = X.rb_fail; });
    }
    function draw() {
      var r = M.range(v()[0]); tv.textContent = v()[1] + " BPM"; tempo.setAttribute("aria-valuetext", v()[1] + " BPM (" + r[0] + "–" + r[1] + ")");
      vn.textContent = "#" + v()[4];
      [[styles, v()[0]], [moods, v()[3]], [loops, ["hook", "verse", "song"].indexOf(st.loop)]].forEach(function (x) { Array.prototype.forEach.call(x[0].children, function (b, i) { press(b, i === x[1]); }); });
      play.textContent = cur ? "■ " + X.rb_stop : "▶ " + (st.rec ? X.rb_play_rec : X.rb_play);
      save.textContent = "⬇ " + X.rb_wav; loops.querySelectorAll("button").forEach(function (b) { b.disabled = st.rec; });
    }
    draw(); changed(false);
    // leaving the editor (another tab, another card) stops the sound
    var watch = setInterval(function () { if (!box.isConnected) { clearInterval(watch); token++; stop(); } }, 500);
  });

  // ---------- the card picture: the beat's name and its drum grid, two bars ----------
  M.game.pic = function (c, W, H, doc) {
    // in the editor the settings on screen (not yet in a link), else the link's beat, else a new one
    var e = A.ed && A.ed(), live = e && e.rb && e.doc && e.doc.seed === doc.seed && e.doc.g === doc.g ? e.rb.v : null;
    var v = live || M.last(Tn.moves(doc)) || M.fresh(0, doc.seed), X = L(), ph = M.phrase(M.params(v)), i0 = doc.i ? D.byId(doc.i) : null;
    var title = doc.t || (i0 ? D.plainTitle((i0[Kit.lang] || i0.de).t) : "Beat");
    c.fillStyle = P.ink; c.fillRect(0, 0, W, H);
    R.block(c, title, W * 0.07, H * 0.05, W * 0.86, H * 0.2, P.cream, null);
    var x0 = W * 0.08, w = W * 0.84, y0 = H * 0.36, rows = [["kick", P.red], ["snare", P.hot], ["hat", P.cream], ["bass", P.grey]], rh = H * 0.075;
    rows.forEach(function (row, k) {
      var y = y0 + k * rh * 1.25; c.fillStyle = "rgba(255,255,255,.06)"; c.fillRect(x0, y, w, rh);
      (ph[row[0]] || []).forEach(function (e) { var x = x0 + (e.b / 8) * w, bw = row[0] === "bass" ? Math.max(w / 64, (e.len || 0.25) / 8 * w - 2) : Math.max(2, w / 80); c.fillStyle = row[1]; c.globalAlpha = 0.45 + 0.55 * Math.min(1, e.v || 1); c.fillRect(x, y + rh * 0.15, bw, rh * 0.7); });
      c.globalAlpha = 1;
    });
    c.fillStyle = "rgba(255,255,255,.25)"; for (var b = 1; b < 8; b++) c.fillRect(x0 + b / 8 * w, y0 - 4, 1, rh * 5);
    c.font = "800 " + Math.round(W * 0.045) + "px system-ui, sans-serif"; c.fillStyle = P.hot; c.textAlign = "center"; c.textBaseline = "top";
    c.fillText(M.label(v, Kit.lang), W / 2, H * 0.84);
    return P.cream;
  };
  root.RapBeatUI = { stop: stop };
})(window);
