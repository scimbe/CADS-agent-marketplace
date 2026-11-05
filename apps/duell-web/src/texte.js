/* Texte und Song (KI-Konzept, Stufe 2), the AI kind "text" (CADS-DEMO-wrapper lib/duell-ai.mjs):
     worte   "Worte finden" on a feel-good card (style herz): 3 tones, at most 80 characters
     spruch  a card's own text from an occasion and one personal detail, only kind words
     song    beat and hook in ONE call; the hook runs along with the beat, saved as a video on the device
   The receiver's name never leaves the device: it goes out as {name} and is put in here. A crisis word stays on the
   device too (Ai.crisis): the page shows help (Nummer gegen Kummer 116 111) instead of asking anybody. The standard
   occasions of worte and spruch are ready made (texte.json, scripts/texte-gen.mjs): a tap on one costs no AI action.
   The rules run in Node (tests); the panels only in the page, as the part "texte" (scripts/build.js). */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var D = node ? require("./daily.js") : root.Daily;
  var Wm = node ? require("./warm.js") : root.Warm;
  var DATA = node ? require("./texte.json") : root.TexteData;

  // The same lists as TEXT in lib/duell-ai.mjs (scripts/texte-gen.mjs refuses to run when they differ).
  var ANLASS = {
    worte: ["trost", "danke", "entschuldigung", "mut", "vermissen", "freude", "gute_besserung", "glueckwunsch", "freundschaft", "abschied"],
    spruch: ["geburtstag", "danke", "lob", "urkunde", "glueckwunsch", "gute_besserung", "freundschaft", "motivation", "willkommen", "abschied", "weihnachten", "neujahr", "pruefung", "einfach_so"],
    song: ["party", "chill", "freundschaft", "geburtstag", "sport", "schule", "sommer", "winter", "tiere", "essen", "einfach_so"]
  };
  var TOENE = ["warm", "locker", "kurz"], MAX = { worte: 80, spruch: 90 }, INSIDER = 80, HOOK = 44, TITLE = 26;
  var STEPS = /^[x-]{16}$/, FX = D.FX;

  function clean(s, max) { return typeof s === "string" ? D.cleanInput(s, max) : ""; }
  function hasPlaceholder(s) { return /\[[^\]]*\]|\{(?!name\})[^}]*\}/.test(s); }
  /* One option as the page takes it, or null. The server checked it already; this is the page's own word filter and
     length, and no placeholder other than {name} ("[Name]" never reaches anybody). */
  function check(art, o) {
    if (!o || typeof o !== "object") return null;
    var ok = function (s, max) { var v = clean(s, max); return v && v === String(s).trim() && !hasPlaceholder(v) ? v : ""; };
    if (art === "worte") { var w = ok(o.x, MAX.worte); return w && TOENE.indexOf(o.ton) >= 0 ? { ton: o.ton, x: w } : null; }
    if (art === "spruch") { var x = ok(o.x, MAX.spruch), t = o.t ? ok(o.t, 34) : ""; return x ? (t ? { t: t, x: x } : { x: x }) : null; }
    if (art !== "song") return null;
    var titel = ok(o.titel, TITLE), hook = (Array.isArray(o.hook) ? o.hook : []).map(function (l) { return ok(l, HOOK); }).filter(Boolean).slice(0, 4), b = o.beat || {};
    var beat = { bpm: Number.isInteger(b.bpm) && b.bpm >= 70 && b.bpm <= 170 ? b.bpm : 110, k: STEPS.test(b.k) ? b.k : "x---x---x---x---", s: STEPS.test(b.s) ? b.s : "----x-------x---", h: STEPS.test(b.h) ? b.h : "x-x-x-x-x-x-x-x-", b: STEPS.test(b.b) ? b.b : "----------------", fx: FX.indexOf(b.fx) >= 0 ? b.fx : "chip" };
    return titel && hook.length >= 2 ? { titel: titel, hook: hook, beat: beat } : null;
  }
  // The ready-made variants of an occasion (0 AI actions), checked like an answer of the server.
  function vor(lang, art, anlass) {
    var L = DATA && DATA.vor && (DATA.vor[lang] || DATA.vor.de), a = L && L[art] && L[art][anlass];
    return (Array.isArray(a) ? a : []).map(function (o) { return check(art, o); }).filter(Boolean);
  }
  /* The request of the kind "text". The typed name stands in the detail as {name}; with a name the server asks for
     {name} once in every variant. -> null without an occasion, or when name or detail are no good. */
  function request(art, anlass, insider, who) {
    if (ANLASS[art] === undefined || ANLASS[art].indexOf(anlass) < 0) return null;
    var n = Wm.name(who); if (n === null) return null;
    var raw = String(insider == null ? "" : insider).replace(/\s+/g, " ").trim(), r = { art: art, anlass: anlass };
    if (raw) {
      if (n) raw = raw.replace(new RegExp("(^|[^\\p{L}])" + n.replace(/[.'-]/g, "\\$&") + "(?![\\p{L}])", "giu"), "$1{name}");
      var v = clean(raw.replace(/\{name\}/g, "Qnameq"), INSIDER); if (!v) return null;
      r.insider = v.replace(/Qnameq/g, "{name}");
    }
    if (n) r.name = true;
    return r;
  }
  /* {name} -> the name, here on the device. Without a name the placeholder goes with the comma next to it
     ("{name}, du schaffst das" -> "Du schaffst das", "Danke, {name}!" -> "Danke!"). */
  function fill(s, who, max) {
    var n = Wm.name(who) || "", out;
    if (s.indexOf("{name}") < 0) return s;
    if (n) out = s.replace(/\{name\}/g, n);
    else { out = s.replace(/\s*,\s*\{name\}/g, "").replace(/\{name\}[,:]?\s*/g, "").replace(/\s+/g, " ").trim(); out = out.charAt(0).toUpperCase() + out.slice(1); }
    return D.cleanInput(out, max || 90) || "";
  }
  /* A ready-made text has no {name}: the name goes in front, like on every feel-good card ("Lea, du schaffst das").
     A German noun or "Ich"/"I" at the start keeps its capital ("Lea, Kopf hoch!", "Lea, Mut!"); the ready-made texts
     start with no other noun (test/texte.test.js). */
  var NOUN = /^(Ich|I|Mut|Kummer|Trost|Freude|Abschied|Glückwunsch|Kopf|Respekt|Freundschaft|Weihnachten)\b/;
  function named(s, who) {
    var n = Wm.name(who); if (!n) return s;
    return D.cleanInput(n + ", " + (NOUN.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)), 90) || s;
  }
  // A song taken: title, beat and hook on the sound sheet (doc.ly: the lines the sheet shows in time with the beat).
  function song(doc, o, who) {
    var d = JSON.parse(JSON.stringify(doc)), b = o.beat;
    d.x = clean(fill(o.titel, who, 28), 28) || d.x; d.m = "beat"; d.bpm = b.bpm; d.fx = b.fx;
    d.p = { k: b.k, s: b.s, h: b.h, b: b.b };
    d.ly = o.hook.map(function (l) { return clean(fill(l, who, HOOK + 14), HOOK + 14); }).filter(Boolean).slice(0, 4);
    return d;
  }
  // The line of the hook at the beat's bar (16 steps), -1 when nothing plays.
  function lineAt(ly, bar) { return Array.isArray(ly) && ly.length && bar >= 0 ? bar % ly.length : -1; }
  // Video: two times through the hook, at least 4 bars; seconds = bars * 4 beats * 60 / bpm.
  function videoBars(ly) { return Math.max(4, 2 * ((ly && ly.length) || 2)); }
  function videoSeconds(doc) { return videoBars(doc.ly) * 240 / doc.bpm; }
  // The type of video this browser records, or "" (then the button is not there).
  function videoType(MR) {
    if (!MR || typeof MR.isTypeSupported !== "function") return "";
    var list = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    for (var i = 0; i < list.length; i++) if (MR.isTypeSupported(list[i])) return list[i];
    return "";
  }

  var api = { NOUN: NOUN, ANLASS: ANLASS, TOENE: TOENE, MAX: MAX, check: check, vor: vor, request: request, fill: fill, named: named, song: song, lineAt: lineAt, videoBars: videoBars, videoSeconds: videoSeconds, videoType: videoType };
  if (node) { module.exports = api; return; }
  root.Texte = api;

  /* ---------- the panels (app.js calls TexteUI.card and TexteUI.song through the part) ---------- */
  var Kit = root.Kit, A = function () { return root.DailyApp; }, TX = DATA.t;
  function t(k, v) { var L = TX[Kit.lang] || TX.de, s = L[k] != null ? L[k] : TX.de[k] != null ? TX.de[k] : Kit.t(k, v); return String(s).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); }
  function input(p, label, ph, max, value) {
    var f = A().el("input", "field"); f.maxLength = max; f.autocomplete = "off"; f.placeholder = ph; f.value = value || ""; f.setAttribute("aria-label", label);
    p.appendChild(A().el("label", "lbl", label)); p.appendChild(f); return f;
  }
  // The occasion stays chosen while the page is open (a panel is rebuilt after a song is taken).
  var chosen = {};
  function chipRow(p, art, on) {
    var box = A().el("div", "chips txan");
    function mark(b) { Array.from(box.children).forEach(function (x) { var y = x === b; x.classList.toggle("on", y); x.setAttribute("aria-pressed", String(y)); }); }
    ANLASS[art].forEach(function (a) {
      var b = A().el("button", "chip", t("a_" + a), function () { Kit.sfx.tap(); mark(b); chosen[art] = a; on(a); });
      b.setAttribute("aria-pressed", "false"); b.dataset.a = a; box.appendChild(b);
    });
    p.appendChild(box);
    var was = chosen[art] && box.querySelector('[data-a="' + chosen[art] + '"]');
    if (was) { mark(was); on(chosen[art]); setTimeout(function () { try { was.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }, 0); }
    return box;
  }
  // The name typed on the feel-good sheet, when there was one: the card already starts with it.
  function warmName() { var f = document.getElementById("warmname"); var n = f && Wm.name(f.value); return n || ""; }

  /* Card text: worte on a feel-good card, spruch on every other card. o: { f: the text field, aiBlock, markKi }. */
  function card(slot, o) {
    var App = A(), ed = App.ed(), d = ed.doc, art = d.st === "herz" ? "worte" : "spruch", anlass = "", el = App.el;
    var box = el("div", "txbox"); slot.appendChild(box);
    box.appendChild(el("label", "lbl", (art === "worte" ? "💛 " : "✍️ ") + t(art)));
    var vorBox = el("div", "chips"), who, ins;
    chipRow(box, art, function (a) { anlass = a; if (who) showVor(); });
    box.appendChild(vorBox);
    who = input(box, t("name"), t("namePh"), Wm.MAX_NAME, warmName()); ins = input(box, t("insider"), t("insiderPh_" + art), INSIDER, "");
    who.addEventListener("input", function () { if (anlass) showVor(); });
    if (anlass) showVor();
    function put(x, ki) { d.x = x; o.f.value = x; if (ki) o.markKi(d, ki); else delete d.ki; App.changed(); }
    // The ready-made variants: KI-made in advance and checked, marked as such, no action and no network.
    function showVor() {
      vorBox.textContent = "";
      var v = vor(Kit.lang, art, anlass); if (!v.length) return;
      vorBox.appendChild(el("p", "note txvor", "✨ " + t("vor")));
      v.forEach(function (x) {
        vorBox.appendChild(el("button", "chip txopt", (x.ton ? t("ton_" + x.ton) + " · " : "") + named(x.x, who.value), function () { Kit.sfx.pop(); put(named(x.x, who.value), { k: "text" }); }));
      });
    }
    o.aiBlock(box, {
      kind: "text", label: t("go_" + art),
      input: function () {
        if (!anlass) { Kit.toast(t("pick")); return null; }
        var r = request(art, anlass, ins.value, who.value);
        if (!r) Kit.toast(Kit.t("filter"));
        return r;
      },
      raw: function () { return [ins.value, who.value].join(" "); },
      show: function (x) { var c = check(art, x); return c ? (c.ton ? t("ton_" + c.ton) + " · " : "") + fill(c.x, who.value, MAX[art]) : "–"; },
      apply: function (x, ki) { var c = check(art, x), v = c && fill(c.x, who.value, 90); if (!v) return false; put(v, ki); }
    });
  }

  /* Song: one AI action for beat and hook, three hooks to pick from; taking one plays it at once. Below it the hook
     plays along and can be saved as a video (only where the browser records one). o: { aiBlock, markKi, setDoc, play, stop } */
  function songPanel(slot, o) {
    var App = A(), el = App.el, anlass = "";
    var box = el("div", "txbox"); slot.appendChild(box);
    box.appendChild(el("label", "lbl", "🎤 " + t("song")));
    var row = el("div", "chips txplay"); box.appendChild(row);      // the video, right where a taken song is
    chipRow(box, "song", function (a) { anlass = a; });
    var who = input(box, t("name"), t("namePh"), Wm.MAX_NAME, ""), ins = input(box, t("insider"), t("insiderPh_song"), INSIDER, "");
    o.aiBlock(box, {
      kind: "text", label: t("go_song"),
      input: function () {
        if (!anlass) { Kit.toast(t("pick")); return null; }
        var r = request("song", anlass, ins.value, who.value);
        if (!r) Kit.toast(Kit.t("filter"));
        return r;
      },
      raw: function () { return [ins.value, who.value].join(" "); },
      show: function (x) { var c = check("song", x); return c ? fill(c.titel, who.value, 28) + " — " + c.hook.map(function (l) { return fill(l, who.value, 60); }).join(" / ") : "–"; },
      apply: function (x, ki) {
        var c = check("song", x); if (!c) return false;
        var ed = App.ed(), next = song(ed.doc, c, who.value); o.markKi(next, ki);
        if (ed.own && !next.t) next.t = next.x;      // an own sheet needs its title to be sent: the song's title
        o.setDoc(next); o.play();
      }
    });
    function bar() {
      row.textContent = "";
      var d = App.ed().doc; if (!d.ly || !d.ly.length) return;
      var type = videoType(root.MediaRecorder), cv = document.createElement("canvas");
      if (type && typeof cv.captureStream === "function" && Kit.canSave()) {
        var v = el("button", "chip", "🎬 " + t("video"), function () { Kit.sfx.tap(); o.stop(); record(v, type); });
        row.appendChild(v);
      }
    }
    bar();
  }

  /* The video: the sheet's picture with the running hook and the beat, recorded here (MediaRecorder), saved as a file.
     Nothing is sent anywhere. */
  async function record(btn, type) {
    var App = A(), d = App.ed().doc, S = root.Studio, R = root.Render, me = App.me();
    var ac = Kit.audio(true); if (!ac) { Kit.toast(t("videoFail")); return; }
    var bars = videoBars(d.ly), pcm = S.renderBeat(d.p, d.bpm, bars), buf = ac.createBuffer(1, pcm.length, S.SR);
    buf.getChannelData(0).set(pcm);
    var c = document.createElement("canvas"); c.width = 720; c.height = 900;
    var dest = ac.createMediaStreamDestination(), src = ac.createBufferSource(); src.buffer = buf; src.connect(dest); src.connect(ac.destination);
    var stream = c.captureStream(30); dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
    var rec, chunks = [], peaks = S.peaks(pcm, 40), barMs = 240000 / d.bpm, t0 = 0, raf = 0;
    try { rec = new MediaRecorder(stream, { mimeType: type }); } catch (e) { Kit.toast(t("videoFail")); return; }
    btn.disabled = true; btn.textContent = "● " + t("videoing");
    function frame() {
      var b = Math.floor((ac.currentTime * 1000 - t0) / barMs);
      R.draw(c, d, { me: me, photo: null, peaks: peaks, lyr: lineAt(d.ly, Math.max(0, b)) });
      raf = requestAnimationFrame(frame);
    }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async function () {
      cancelAnimationFrame(raf); stream.getTracks().forEach(function (tr) { tr.stop(); });
      btn.disabled = false; btn.textContent = "🎬 " + t("video");
      var blob = new Blob(chunks, { type: type.split(";")[0] });
      if (!blob.size) { Kit.toast(t("videoFail")); return; }
      await Kit.saveFile(blob, "my-daily-song." + (/mp4/.test(type) ? "mp4" : "webm"));
    };
    R.draw(c, d, { me: me, photo: null, peaks: peaks, lyr: 0 });
    rec.start(250); t0 = ac.currentTime * 1000; src.start(); frame();
    src.onended = function () { setTimeout(function () { if (rec.state !== "inactive") rec.stop(); }, 200); };
  }
  root.TexteUI = { card: card, song: songPanel };
})(typeof globalThis !== "undefined" ? globalThis : this);
