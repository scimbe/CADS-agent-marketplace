/* My Daily Idea: the card "Stimme verzerren" (part klang). The editor's voice tab (record up to 10 s after a tap, effect
   and tempo chips that play at once, record again, undo) and, on the finished sheet, sending the voice as a file: a short
   video (MP4 where the browser records it, else WebM) or the sound only (WAV), through the system's share menu or as a
   download. The recording never leaves the device any other way: no upload, no short link with sound; the link of the
   sheet carries only the effect and the text (src/daily.js), so whoever gets it answers with their own voice. */
(function (root) {
  "use strict";
  var K = root.KlangFx, Kit = root.Kit, SR = K.SR;
  function A() { return root.DailyApp; }
  function t(k, v) { return Kit.t(k, v); }
  function el(tag, cls, text, on) { return A().el(tag, cls, text, on); }
  var ICON = { chip: "🐹", monster: "👹", robot: "🤖", echo: "🏔️", rev: "⏪", alien: "👽", tel: "📞", chor: "🎶" }, TP = [["", "kl_tp_norm", "🚶"], ["slow", "kl_tp_slow", "🐢"], ["fast", "kl_tp_fast", "🐿️"]];
  var CSS = ".klmic{font-size:.875rem;font-weight:700;margin:0 0 8px}.klplay{display:block;width:100%;min-height:64px;margin:0 0 10px;border:3px solid var(--ink);border-radius:6px;background:var(--ink);color:var(--paper);font:900 1.375rem var(--ui)}" +
    ".klgrp{border:0;margin:0 0 6px;padding:0;min-width:0}.klgrp legend{font-weight:800;font-size:.875rem;margin:0 0 4px;padding:0}.klrec{font-size:1rem}.klmic.first{font-size:1rem;border:3px solid var(--ink);border-radius:6px;padding:8px;background:#fff;color:#111}" +
    // the file sheet: a bottom sheet over the finished screen (the picture keeps its room), the card's colours, no native blue
    ".klsheet{inset:auto 0 0 0;margin:0 auto;width:100%;max-width:520px;max-height:88vh;overflow:auto;border:3px solid var(--ink);border-bottom:0;border-radius:12px 12px 0 0;padding:12px 16px 16px;background:var(--paper);color:var(--ink);box-sizing:border-box}" +
    "#klopen{flex:1.6 1 0;min-width:0;line-height:1.1}.klsheet::backdrop{background:rgba(0,0,0,.5)}.klsheet h2{font:900 1.125rem var(--ui);margin:6px 52px 8px 0}.klsheet .note{font-size:.875rem}.klx{position:absolute;top:8px;right:8px;width:44px;height:44px;border:3px solid var(--ink);border-radius:4px;background:var(--paper);color:var(--ink);font:900 1.125rem var(--ui)}" +
    ".klsheet .row{flex-wrap:wrap;gap:8px;padding:0}.klsheet .btn{flex:1 1 9rem;min-height:48px}.klsub{display:flex;align-items:center;gap:10px;min-height:44px;font-weight:800;margin:4px 0 8px}" +
    ".klsub input{appearance:none;-webkit-appearance:none;flex:none;width:28px;height:28px;margin:0;border:3px solid var(--ink);border-radius:4px;background:var(--paper);display:grid;place-content:center}.klsub input:checked{background:var(--ink)}" +
    ".klsub input:checked::after{content:\"✓\";color:var(--paper);font:900 18px/1 var(--ui)}.klsub input:focus-visible{outline:3px solid var(--ink);outline-offset:2px}";
  function css() { if (document.getElementById("klcss")) return; var s = document.createElement("style"); s.id = "klcss"; s.textContent = CSS; document.head.appendChild(s); }
  function still() { try { return root.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  /* ---------- the voice and its effect ---------- */
  // ed.raw: the take as it was recorded (or the silly voice), ed.pcm: with effect and tempo, ed.undo: the states before.
  function process(ed) { ed.pcm = K.apply(ed.raw, ed.doc); ed.peaks = root.Studio.peaks(ed.pcm, 40); A().changed(); }
  function remember(ed) { if (ed.raw) ed.undo = (ed.undo || []).concat([{ raw: ed.raw, fx: ed.doc.fx, tp: ed.doc.tp, own: !!ed.ownVoice }]).slice(-8); }
  function take(ed, pcm, own) { remember(ed); ed.raw = pcm; ed.ownVoice = !!own; process(ed); }
  function undo(ed) {
    var u = ed.undo && ed.undo.pop(); if (!u) return false;
    ed.raw = u.raw; ed.doc.fx = u.fx; if (u.tp) ed.doc.tp = u.tp; else delete ed.doc.tp; ed.ownVoice = u.own; process(ed); return true;
  }
  function play(ed, btn) {
    if (!ed.raw) take(ed, root.Studio.dummyVoice(), false);
    var s = A().playPcm(ed.pcm); if (!s) return;
    if (btn) { btn.textContent = "■ " + t("stop"); s.onended = function () { if (btn.isConnected) btn.textContent = "▶ " + t("kl_play"); }; }
  }

  /* ---------- recording: only after a tap, 3-2-1 read out, up to 10 s with a ring, a tap stops ---------- */
  var rec = null;
  async function record(b, ed, after) {
    if (rec) { rec.stop(); return; }
    var ms = K.MAX_SEC * 1000, ring = 0, t0, st = null, off = false, label = b.textContent;
    function reset() { clearInterval(ring); b.classList.remove("ring"); b.style.setProperty("--p", 0); b.textContent = label; if (st) st.getTracks().forEach(function (x) { x.stop(); }); }
    rec = { stop: function () { off = true; } };       // a tap during 3-2-1 calls it off
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !root.MediaRecorder) throw new Error("no mic");
      A().stopSound();
      st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      var mr = new MediaRecorder(st), parts = [];
      for (var k = 3; k; k--) { b.textContent = k; Kit.speak(k); await wait(700); if (off || A().ed() !== ed) { rec = null; reset(); return; } }
      b.textContent = "■ " + t("stop"); Kit.speak(t("recing")); b.classList.add("ring");
      rec = { stop: function () { if (mr.state === "recording") mr.stop(); } };
      mr.ondataavailable = function (e) { if (e.data) parts.push(e.data); };
      mr.onstop = async function () {
        rec = null; reset();
        if (A().ed() !== ed) return;                     // the editor was left: the take is dropped
        var pcm = null;
        try { pcm = await decode(new Blob(parts)); } catch (e) { pcm = null; }   // stopped at once: nothing to keep
        if (pcm && pcm.length > SR / 10) { take(ed, pcm, true); if (after) after(); play(ed, null); }
      };
      mr.start(); t0 = Date.now();
      ring = setInterval(function () {
        var f = Math.min(1, (Date.now() - t0) / ms); b.style.setProperty("--p", f);
        if ((f >= 1 || A().ed() !== ed) && mr.state === "recording") mr.stop();
      }, 100);
    } catch (e) { rec = null; reset(); Kit.toast(t("noMic")); }
  }
  // The recorded file to samples at Studio.SR, mono, at most 10 s (linear in between).
  async function decode(blob) {
    var buf = await Kit.audio(true).decodeAudioData(await blob.arrayBuffer()), src = buf.getChannelData(0), k = buf.sampleRate / SR;
    var n = Math.min(Math.floor(src.length / k), K.MAX_SEC * SR), o = new Float32Array(n);
    for (var i = 0; i < n; i++) { var p = i * k, j = Math.floor(p), f = p - j; o[i] = src[j] * (1 - f) + (src[j + 1] || 0) * f; }
    return o;
  }

  // Allowed before (the system will not ask)? Unknown counts as no: then the page explains first.
  function micAllowed() {
    try { return navigator.permissions.query({ name: "microphone" }).then(function (s) { return s.state === "granted"; }, function () { return false; }); } catch (e) { return Promise.resolve(false); }
  }

  /* ---------- the voice tab ---------- */
  function group(p, label, items, cur, pick) {
    var g = el("fieldset", "klgrp"), box = el("div", "chips"); g.appendChild(el("legend", "", label)); g.appendChild(box);
    items.forEach(function (it) {
      var b = el("button", "chip" + (it.v === cur ? " on" : ""), it.l, function () {
        Kit.sfx.tap(); Array.from(box.children).forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }); pick(it.v);
      });
      b.setAttribute("aria-pressed", String(it.v === cur)); box.appendChild(b);
    });
    p.appendChild(g);
  }
  function panel(p) {
    css();
    var ed = A().ed(), D = root.Daily;
    var mic = el("p", "klmic", t("kl_mic") + " " + t("kl_others")); p.appendChild(mic);
    var row = el("div", "chips"), rb = el("button", "chip klrec", "🎙 " + t(ed.raw && ed.ownVoice ? "kl_again" : "rec"), function () { Kit.sfx.tap(); record(rb, ed, redo); });
    var ub = el("button", "chip", "↶ " + t("kl_undo"), function () { Kit.sfx.tap(); if (undo(ed)) redo(); });
    row.appendChild(rb);
    row.appendChild(el("button", "chip", "🤪 " + t("dummy"), function () { Kit.sfx.pop(); take(ed, root.Studio.dummyVoice(), false); redo(); play(ed, null); }));
    row.appendChild(ub); ub.disabled = !(ed.undo && ed.undo.length);
    p.appendChild(row);
    var pl = el("button", "klplay", "▶ " + t("kl_play"), function () { Kit.sfx.tap(); if (/^■/.test(pl.textContent)) { A().stopSound(); pl.textContent = "▶ " + t("kl_play"); } else play(ed, pl); });
    p.appendChild(pl);
    // effect and tempo: a tap applies it and plays it at once (with the silly voice until there is a take)
    function choose(fn) { return function (v) { remember(ed); fn(v); if (ed.raw) process(ed); else A().changed(); ub.disabled = false; play(ed, pl); }; }
    group(p, t("kl_fx"), D.FX.map(function (f) { return { v: f, l: ICON[f] + " " + t("fx_" + f) }; }), ed.doc.fx, choose(function (v) { ed.doc.fx = v; }));
    group(p, t("kl_tempo"), TP.map(function (x) { return { v: x[0], l: x[2] + " " + t(x[1]) }; }), ed.doc.tp || "", choose(function (v) { if (v) ed.doc.tp = v; else delete ed.doc.tp; }));
    p.appendChild(el("p", "note", t("kl_len")));
    function redo() { if (p.isConnected && A().ed() === ed) { p.textContent = ""; panel(p); } }
    // "Answer" on a received voice: with the microphone already allowed the take starts here (3-2-1, a tap stops it);
    // otherwise the explanation comes first, big, and the record button waits for its own tap (then the system asks).
    if (ed.rec) {
      ed.rec = false;
      micAllowed().then(function (yes) {
        if (!rb.isConnected || A().ed() !== ed) return;
        if (yes) record(rb, ed, redo); else { mic.classList.add("first"); mic.setAttribute("role", "note"); rb.focus(); Kit.speak(mic.textContent); }
      });
    }
  }

  /* ---------- the video: the sheet, the frog that speaks, the moving wave, "voice distorted" ---------- */
  function frog(c, x, y, r, open, col) {
    c.fillStyle = "#3fae49"; c.strokeStyle = "#1d5e25"; c.lineWidth = r * 0.06;
    c.beginPath(); c.ellipse(x, y, r, r * 0.8, 0, 0, 6.2832); c.fill(); c.stroke();
    [-1, 1].forEach(function (s) {
      c.fillStyle = "#3fae49"; c.beginPath(); c.arc(x + s * r * 0.45, y - r * 0.7, r * 0.3, 0, 6.2832); c.fill(); c.stroke();
      c.fillStyle = "#fff"; c.beginPath(); c.arc(x + s * r * 0.45, y - r * 0.72, r * 0.2, 0, 6.2832); c.fill();
      c.fillStyle = "#111"; c.beginPath(); c.arc(x + s * r * 0.45, y - r * 0.7, r * 0.1, 0, 6.2832); c.fill();
    });
    var h = r * (0.06 + 0.42 * open);   // the mouth opens with the loudness
    c.fillStyle = "#6b1020"; c.beginPath(); c.ellipse(x, y + r * 0.2, r * 0.55, h, 0, 0, 6.2832); c.fill();
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y + r * 0.2 + h * 0.5, r * 0.25, h * 0.4, 0, 0, 6.2832); c.fill();
  }
  function lines(c, s, maxW) {
    var out = [], cur = "";
    String(s || "").split(/\s+/).forEach(function (w) { var n = cur ? cur + " " + w : w; if (c.measureText(n).width > maxW && cur) { out.push(cur); cur = w; } else cur = n; });
    if (cur) out.push(cur); return out.slice(0, 2);
  }
  // One frame at time f (0..1 through the sound), loudness v (0..1) and the last loudness values for the wave.
  function frame(c, pic, doc, o) {
    var W = c.width, H = c.height, x = c.getContext("2d"), a = doc.col[0], b = doc.col[1], ink = root.Render.ink(a);
    x.fillStyle = a; x.fillRect(0, 0, W, H);
    var pw = W * 0.72, ph = pw * 1.25, px = (W - pw) / 2, py = H * 0.075;   // room above the picture for the mark
    x.drawImage(pic, px, py, pw, ph);
    // the mark, above the picture, white on black like the AI mark: what you hear is not the real voice
    x.font = "800 " + Math.round(W * 0.042) + "px system-ui, sans-serif"; x.textBaseline = "middle"; x.textAlign = "left";
    var m = t("kl_mark") + " · " + t("fx_" + doc.fx) + (doc.tp ? " · " + t("kl_tp_" + doc.tp) : ""), mw = x.measureText(m).width;
    x.fillStyle = "#111"; x.fillRect(px, H * 0.012, mw + 24, W * 0.075); x.fillStyle = "#fff"; x.fillText(m, px + 12, H * 0.012 + W * 0.0375);
    var top = py + ph + H * 0.02, bob = o.still ? 0 : Math.sin(o.f * 40) * 3 * o.v;
    if (o.sub) {   // the card's text as a caption, for whoever cannot hear it
      x.font = "800 " + Math.round(W * 0.045) + "px system-ui, sans-serif"; x.fillStyle = ink; x.textAlign = "center";
      lines(x, doc.x, W * 0.9).forEach(function (l, i) { x.fillText(l, W / 2, top + W * 0.03 + i * W * 0.055); });
      top += W * 0.12;
    }
    var fr = Math.min(W * 0.12, (H - top) * 0.36);
    frog(x, W * 0.2, top + fr * 1.15 + bob, fr, o.v, b);
    var n = o.wave.length, bw = W * 0.6 / n, cy = top + fr * 1.2, amp = fr * 1.1;
    x.fillStyle = ink;
    for (var i = 0; i < n; i++) { var h = Math.max(2, o.wave[i] * amp); x.fillRect(W * 0.35 + i * bw, cy - h, bw * 0.6, h * 2); }
    x.fillStyle = b; x.fillRect(W * 0.35, H - W * 0.03, W * 0.6 * o.f, W * 0.012);   // how far it has played
  }
  function canVideo() {
    var c = document.createElement("canvas"), AC = root.AudioContext || root.webkitAudioContext;
    if (!K.videoType(root.MediaRecorder) || typeof c.captureStream !== "function" || !AC || typeof AC.prototype.createMediaStreamDestination !== "function") return false;
    // in the app shells a video only goes out through the share menu of the web view (the shells take pictures and WAV)
    return !root.DuellHost || canShare(new File([new Blob([""], { type: "video/mp4" })], "x.mp4", { type: "video/mp4" }));
  }
  function canShare(file) { try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; } }
  // Recorded here in real time (MediaRecorder on the canvas and the sound), kept under 2 MB: too big once, half the bits.
  // An encoder that does not start (it stops at once with nothing, seen with AAC at a low rate) hands over to the next type.
  async function video(result, sub, onp) {
    var doc = result.doc, pcm = voice(result), ac = Kit.audio(true), types = K.videoTypes(root.MediaRecorder).slice(0, 3);
    if (!ac || !types.length) throw new Error("no video");
    var sec = pcm.length / SR, env = K.envelope(pcm, 30), pic = result.canvas, c = document.createElement("canvas");
    c.width = 480; c.height = 720;
    for (var i = 0; i < types.length; i++) {
      for (var tries = 0, br = K.bitrate(sec + 0.5); tries < 2; tries++, br = Math.floor(br / 2)) {
        var blob = await once(ac, c, pic, doc, pcm, env, types[i], br, sub, onp);   // a time-out throws: no further try
        if (!blob.size) break;
        if (blob.size < 2 * 1024 * 1024) return blob;
      }
    }
    throw new Error("no video");
  }
  var LIMIT = 5;   // seconds a video may take beyond its sound
  function once(ac, c, pic, doc, pcm, env, type, br, sub, onp) {
    return new Promise(function (ok, no) {
      var buf = ac.createBuffer(1, pcm.length, SR); buf.getChannelData(0).set(pcm);
      var dest = ac.createMediaStreamDestination(), src = ac.createBufferSource(); src.buffer = buf; src.connect(dest);
      var stream = c.captureStream(30); dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      var mr, chunks = [], t0 = 0, tick = 0, len = pcm.length / SR, ss = still();
      var ab = K.audioBits(type);
      try { mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.max(100000, br - ab), audioBitsPerSecond: ab }); } catch (e) { no(e); return; }
      mr.onerror = function () { if (mr.state !== "inactive") mr.stop(); };
      function draw() {
        var at = Math.max(0, ac.currentTime - t0), k = Math.min(env.length - 1, Math.floor(at * 30));
        frame(c, pic, doc, { f: Math.min(1, at / len), v: env[k] || 0, wave: env.slice(Math.max(0, k - 23), k + 1).concat(new Array(Math.max(0, 23 - k)).fill(0)).slice(-24), sub: sub, still: ss });
        if (onp) onp(Math.min(1, at / len));
      }
      // One end only: the recorder's stop, or the time limit (sound length + 5 s) when the audio clock stands still (iOS
      // interrupted it, a call came in) or the recorder never says it stopped. Then everything is stopped and dropped.
      var over = false, guard = 0;
      function end(fn, v) {
        if (over) return; over = true; clearInterval(tick); clearTimeout(guard);
        src.onended = null; try { src.stop(); } catch (e) { /* not started or already over */ }
        stream.getTracks().forEach(function (tr) { tr.stop(); }); fn(v);
      }
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.onstop = function () { end(ok, new Blob(chunks, { type: type.split(";")[0] })); };
      guard = setTimeout(function () { try { if (mr.state !== "inactive") mr.stop(); } catch (e) { /* gone */ } end(no, new Error("timeout")); }, (len + LIMIT) * 1000);
      draw(); mr.start(250); t0 = ac.currentTime; src.start(); tick = setInterval(draw, 33);
      src.onended = function () { draw(); setTimeout(function () { if (mr.state !== "inactive") mr.stop(); }, 300); };
    });
  }
  function voice(result) { var k = result.keep; return k && k.pcm ? k.pcm : K.apply(root.Studio.dummyVoice(), result.doc); }
  function b64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1]); }; r.onerror = no; r.readAsDataURL(blob); }); }
  // The system's share menu with the file (and the sheet's link in the text, for answering); else the app shell; else a download.
  async function send(blob, name, text) {
    var file = null; try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
    if (file && canShare(file)) {
      try { await navigator.share({ files: [file], text: text }); return "file"; } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
    }
    var H = root.DuellHost;
    try { if (H && typeof H.shareFile === "function" && /wav/.test(blob.type)) { H.shareFile(await b64(blob), blob.type, name, "", text); return "file"; } } catch (e) { /* download */ }
    await Kit.saveFile(blob, name); return "save";
  }

  /* ---------- the finished sheet: send as a file ---------- */
  // A button in the row of Save / Edit / Home, in Save's place (the sheet saves too), so the finished picture is as big
  // as with any other card; it opens a bottom sheet with the notes first, then the subtitle switch and the file buttons.
  function clear() {
    ["klopen", "klsheet"].forEach(function (id) { var x = document.getElementById(id); if (x) x.remove(); });
    var sv = document.getElementById("save"); if (sv) sv.hidden = !Kit.canSave();
  }
  function done(result) {
    clear();
    var doc = result && result.doc, sv = document.getElementById("save");
    if (!doc || doc.k !== "sound" || doc.m !== "voice" || !sv) return;
    css();
    var open = el("button", "btn", "🎙 " + t("kl_send"), function () { Kit.sfx.tap(); sheet(result, open); });
    open.id = "klopen"; open.setAttribute("aria-haspopup", "dialog"); sv.before(open); sv.hidden = true;
  }
  addEventListener("daily:lang", function () {   // labels() of the core shows Save again and the words change
    var o = document.getElementById("klopen"), sv = document.getElementById("save"); if (!o) return;
    o.textContent = "🎙 " + t("kl_send"); if (sv) sv.hidden = true; var d = document.getElementById("klsheet"); if (d) { d.close(); d.remove(); }
  });
  function sheet(result, opener) {
    var old = document.getElementById("klsheet"); if (old) old.remove();
    var d = el("dialog", "klsheet"), row = el("div", "row"), made = result.klVideo || null, busy = false, h = el("h2", "", "🎙 " + t("kl_send"));
    d.id = "klsheet"; h.id = "klsheeth"; d.setAttribute("aria-labelledby", "klsheeth");
    var x = el("button", "klx", "✕", function () { d.close(); }); x.setAttribute("aria-label", t("kl_close"));
    d.appendChild(h); d.appendChild(x);
    d.appendChild(el("p", "note", t("kl_note") + " " + t("kl_link"))); d.appendChild(el("p", "note", t("kl_warn")));
    var text = function () { return t("kl_shareText") + " " + (result.link ? result.link.url : result.url); };
    var name = function (ext) { return "my-daily-voice." + ext; };
    if (canVideo()) {
      var lab = el("label", "klsub"), cb = el("input"); cb.type = "checkbox"; cb.checked = true; lab.appendChild(cb); lab.appendChild(document.createTextNode(t("kl_sub")));
      var vb = el("button", "btn", "🎬 " + t("kl_video"), async function () {
        if (busy) return; Kit.sfx.tap();
        if (made) { await send(made, name(/mp4/.test(made.type) ? "mp4" : "webm"), text()); return; }
        busy = true; vb.setAttribute("aria-busy", "true"); cb.disabled = true;
        try {
          made = result.klVideo = await video(result, cb.checked, function (f) { vb.textContent = "● " + t("kl_making", { n: Math.round(f * 100) }); });
          vb.textContent = "📤 " + t("kl_videoShare"); Kit.speak(t("kl_ready"));
        } catch (e) { made = result.klVideo = null; vb.textContent = "🎬 " + t("kl_video"); Kit.toast(t("kl_fail")); }   // a new try is one tap away
        busy = false; vb.removeAttribute("aria-busy"); cb.disabled = false;
      });
      if (made) vb.textContent = "📤 " + t("kl_videoShare");
      cb.addEventListener("change", function () { if (made) { made = result.klVideo = null; vb.textContent = "🎬 " + t("kl_video"); } });
      row.appendChild(vb); d.appendChild(lab);
    }
    row.appendChild(el("button", "btn", "🔊 " + t("kl_audio"), function () { Kit.sfx.tap(); send(new Blob([root.Studio.wav(voice(result))], { type: "audio/wav" }), name("wav"), text()); }));
    if (Kit.canSave()) row.appendChild(el("button", "btn", "💾 " + t("kl_save"), function () { Kit.sfx.tap(); Kit.saveFile(result.file, result.name); }));
    d.appendChild(row);
    // Placed from the visible viewport, not from the layout viewport's bottom: in the Android web view the latter lies
    // below the screen (the sheet showed only its top edge there).
    var vv = root.visualViewport;
    function place() {
      var h = vv ? vv.height : innerHeight, top = vv ? vv.offsetTop : 0;
      d.style.maxHeight = Math.round(h * 0.88) + "px"; d.style.top = Math.max(top, Math.round(top + h - d.offsetHeight)) + "px"; d.style.bottom = "auto";
    }
    if (vv) vv.addEventListener("resize", place);
    d.addEventListener("close", function () { if (vv) vv.removeEventListener("resize", place); if (opener.isConnected) opener.focus(); });
    document.body.appendChild(d); d.showModal(); place();
  }
  root.Klang = { apply: K.apply, panel: panel, done: done, video: video, send: send, frame: frame };
})(typeof globalThis !== "undefined" ? globalThis : this);
