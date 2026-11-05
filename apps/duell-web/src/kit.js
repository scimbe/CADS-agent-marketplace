/* Shared page helpers: language, storage, sound, haptics, sharing. */
(function () {
  "use strict";
  var T = window.DailyTexts, C = window.DuellCore, mem = {}, store = {};
  try { var j = JSON.parse(localStorage.getItem("daily.v1") || "{}"); if (j && typeof j === "object") store = j; } catch (e) { store = mem; }
  var Kit = {
    store: store, persisted: true,
    // Every language with a block in texts.json is offered, in the order of the file; German is the fallback.
    langs: C.langsOf(T),
    lang: "de",
    muted: !!store.muted,
    t: function (k, o) {
      var b = T[Kit.lang] || T.de, s = C.form(b, k, o && o.n, Kit.lang);
      if (s == null) s = C.form(T.de, k, o && o.n, "de");
      s = s == null ? k : s; return s.replace(/\{(\w+)\}/g, function (_, x) { return o && o[x] != null ? o[x] : ""; });
    },
    loc: function () { return C.locale(Kit.lang); },
    num: function (x, d) { return C.num(x, d, Kit.lang); },
    // Switching the language redraws what is open: the app and every layer listen to "daily:lang".
    setLang: function (l) {
      if (Kit.langs.indexOf(l) < 0 || l === Kit.lang) return;
      Kit.lang = store.lang = l; Kit.save(); document.documentElement.lang = l;
      try { window.dispatchEvent(new CustomEvent("daily:lang")); } catch (e) {}
    },
    nextLang: function () { var L = Kit.langs; return L[(L.indexOf(Kit.lang) + 1) % L.length]; },
    langName: function (l) { try { var n = new Intl.DisplayNames([l], { type: "language" }).of(l); return n.charAt(0).toLocaleUpperCase(l) + n.slice(1); } catch (e) { return l.toUpperCase(); } },
    // The language switch for a layer of its own (table, live game, arcade), like the one on the home page: it shows the
    // language in use and says which one a tap switches to.
    langBtn: function (cls) {
      var b = document.createElement("button"); b.type = "button"; b.className = "langbtn " + (cls || "");
      function fill() { var n = Kit.nextLang(); b.textContent = Kit.lang.toUpperCase(); b.setAttribute("aria-label", Kit.t("lang_to", { l: Kit.langName(n) })); }
      b.addEventListener("click", function () { Kit.sfx.tap(); Kit.setLang(Kit.nextLang()); });
      function on() { if (b.isConnected) fill(); else window.removeEventListener("daily:lang", on); }
      window.addEventListener("daily:lang", on); fill();
      return b;
    },
    save: function () { try { localStorage.setItem("daily.v1", JSON.stringify(store)); Kit.persisted = true; } catch (e) { Kit.persisted = false; } },
    toast: function (msg) { var el = document.getElementById("toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(Kit._t); Kit._t = setTimeout(function () { el.classList.remove("show"); }, 2400); },
    haptic: function (p) {
      if (Kit.muted) return;
      try { if (window.DuellHost && window.DuellHost.haptic) { window.DuellHost.haptic(); return; } if (navigator.vibrate) navigator.vibrate(p || 8); } catch (e) {}
    }
  };
  // The saved choice first, then the device's languages in order, then English, then German.
  Kit.lang = [store.lang].concat(navigator.languages || [navigator.language || ""]).map(function (l) { return String(l || "").toLowerCase().split("-")[0]; })
    .filter(function (l) { return Kit.langs.indexOf(l) >= 0; })[0] || (Kit.langs.indexOf("en") >= 0 ? "en" : "de");
  // Numbers and plurals through Intl (Katalog v2, rule 27): t.plural("key", n) picks key_one, key_few, ... key_other
  // by the language's plural rules (Intl.PluralRules), with German as the fallback for a missing word; {n} is the number
  // written the way the language writes it ("1,5" in de, "1.5" in en). New texts never branch on the language.
  // Kit.num writes without grouping (scores, seconds); counts in a sentence group like the language does ("1,500").
  function fmtN(n) { try { return new Intl.NumberFormat(Kit.loc()).format(n); } catch (e) { return String(n); } }
  Kit.t.plural = function (k, n, o) {
    var cat = "other", L = T[Kit.lang] || {}, D = T.de || {};
    try { cat = new Intl.PluralRules(Kit.loc()).select(n); } catch (e) {}
    var key = [k + "_" + cat, k + "_other"].filter(function (x) { return L[x] != null || D[x] != null; })[0] || k;
    var s = L[key] != null ? L[key] : D[key] != null ? D[key] : key, v = Object.assign({}, o, { n: fmtN(n) });
    return s.replace(/\{(\w+)\}/g, function (_, x) { return v[x] != null ? v[x] : ""; });
  };
  // Font size token --fs (rule 2): normal / gross / sehr gross = 1 / 1.25 / 1.5 times the system's size (1rem follows
  // the system setting). Only on this device, chosen in Mein Stil; new cards size their text in rem through var(--fs).
  Kit.FS = { n: 1, g: 1.25, sg: 1.5 };
  Kit.fs = Object.prototype.hasOwnProperty.call(Kit.FS, store.fs) ? store.fs : "n";
  Kit.setFs = function (v) {
    if (!Object.prototype.hasOwnProperty.call(Kit.FS, v)) return;
    Kit.fs = v; if (v === "n") delete store.fs; else store.fs = v; Kit.save();
    var r = document.documentElement; r.style.setProperty("--fs", String(Kit.FS[v])); r.setAttribute("data-fs", v);
  };
  try { document.documentElement.style.setProperty("--fs", String(Kit.FS[Kit.fs])); document.documentElement.setAttribute("data-fs", Kit.fs); } catch (e) {}
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
