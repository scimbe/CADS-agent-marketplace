/* Shared page helpers: language, storage, sound, haptics, sharing. */
(function () {
  "use strict";
  var T = window.DailyTexts, mem = {}, store = {};
  try { var j = JSON.parse(localStorage.getItem("daily.v1") || "{}"); if (j && typeof j === "object") store = j; } catch (e) { store = mem; }
  var Kit = {
    store: store, persisted: true,
    lang: store.lang === "en" || store.lang === "de" ? store.lang : ((navigator.language || "de").toLowerCase().indexOf("de") === 0 ? "de" : "en"),
    muted: !!store.muted,
    t: function (k, o) { var s = T[Kit.lang][k]; s = s == null ? k : s; return s.replace(/\{(\w+)\}/g, function (_, x) { return o && o[x] != null ? o[x] : ""; }); },
    save: function () { try { localStorage.setItem("daily.v1", JSON.stringify(store)); Kit.persisted = true; } catch (e) { Kit.persisted = false; } },
    toast: function (msg) { var el = document.getElementById("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(Kit._t); Kit._t = setTimeout(function () { el.classList.remove("show"); }, 2400); },
    haptic: function (p) {
      if (Kit.muted) return;
      try { if (window.DuellHost && window.DuellHost.haptic) { window.DuellHost.haptic(); return; } if (navigator.vibrate) navigator.vibrate(p || 8); } catch (e) {}
    }
  };
  var actx = null;
  Kit.audio = function (force) {
    if (Kit.muted && !force) return null;
    try {
      if (!actx) { var A = window.AudioContext || window.webkitAudioContext; if (A) actx = new A(); }
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) { actx = null; }
    return actx;
  };
  Kit.tone = function (f0, f1, dur, type, vol, delay) {
    var a = Kit.audio(); if (!a) return;
    try {
      var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + (delay || 0);
      o.type = type || "sine"; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(vol || 0.12, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  };
  Kit.rip = function () {       // paper tearing: a short band of noise
    var a = Kit.audio(); if (!a) return;
    try {
      var n = Math.floor(a.sampleRate * 0.22), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (0.4 + 0.6 * (i % 340 < 170 ? 1 : 0.3)) * (1 - i / n);
      var s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      f.type = "bandpass"; f.frequency.value = 2600; g.gain.value = 0.25; s.buffer = b; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
    } catch (e) {}
  };
  Kit.sfx = {
    tap: function () { Kit.tone(520, 680, 0.05, "square", 0.04); Kit.haptic(8); },
    thud: function () { Kit.tone(150, 50, 0.16, "sine", 0.22); Kit.haptic(14); },
    pop: function () { Kit.tone(380, 900, 0.09, "triangle", 0.12); Kit.haptic(10); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { Kit.tone(f, f, 0.15, "triangle", 0.12, i * 0.08); }); Kit.haptic([20, 30, 20, 30, 80]); }
  };
  Kit.playPcm = function (pcm, sr, loop) {     // stays in memory, goes to the speaker only
    var a = Kit.audio(true); if (!a) return null;
    var b = a.createBuffer(1, pcm.length, sr); b.getChannelData(0).set(pcm);
    var s = a.createBufferSource(); s.buffer = b; s.loop = !!loop; s.connect(a.destination); s.start();
    return s;
  };

  function legacyCopy(s) {
    try { var ta = document.createElement("textarea"); ta.value = s; ta.style.cssText = "position:fixed;opacity:0;top:0"; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); ta.remove(); return ok; } catch (e) { return false; }
  }
  function copyText(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return legacyCopy(s); });
    return Promise.resolve(legacyCopy(s));
  }
  function b64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1]); }; r.onerror = no; r.readAsDataURL(blob); }); }
  Kit.copy = copyText;
  // Best channel first: with the file if the device can, otherwise the link.
  Kit.share = async function (o) {
    var file = null;
    try { if (o.blob && typeof File === "function") file = new File([o.blob], o.name, { type: o.blob.type }); } catch (e) {}
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: o.text, url: o.url }); return "file"; }
    } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
    var H = window.DuellHost;
    try {
      if (H && file && typeof H.shareFile === "function") { H.shareFile(await b64(o.blob), o.blob.type, o.name, o.url, o.text); return "file"; }
      if (H && typeof H.share === "function") { H.share(o.url, o.text); return "link"; }
    } catch (e) { /* next channel */ }
    try { if (navigator.share) { await navigator.share({ text: o.text, url: o.url }); return "link"; } } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
    if (await copyText(o.text + " " + o.url)) { Kit.toast(Kit.t("copied")); return "copy"; }
    Kit.toast(Kit.t("shareFail")); try { window.prompt(Kit.t("shareFail"), o.url); } catch (e) {}
    return "none";
  };
  // A plain download works in browsers; inside the app shells it needs the shell's help.
  Kit.canSave = function () { return !window.DuellHost || typeof window.DuellHost.saveFile === "function"; };
  Kit.saveFile = async function (blob, name) {
    var H = window.DuellHost;
    if (H && typeof H.saveFile === "function") { H.saveFile(await b64(blob), blob.type, name); return; }
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    Kit.toast(Kit.t("saved"));
  };
  window.Kit = Kit;
})();
