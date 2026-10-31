/* Calendar, remix editor, my style, wall. All text goes in as text nodes, never as markup. */
(function () {
"use strict";
var C = window.DuellCore, D = window.Daily, S = window.Studio, Kit = window.Kit, G = window.Game, R = window.Render, t = Kit.t;
var $ = function (id) { return document.getElementById(id); };
function el(tag, cls, text, on) {
  var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text;
  if (tag === "button") e.type = "button"; if (on) e.addEventListener("click", on);
  return e;
}
var store = Kit.store;
var me = D.sanitizeProfile(store.me);
var wall = D.sanitizeWall(store.wall);
var PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
var EMOJI = ["🐸", "🦝", "🐙", "🦖", "🍕", "👽", "🤖", "👻", "🔥", "🌈", "🦄", "🐝"];
var today = new Date(), home = null, screen = "home", ed = null, result = null;

function saveMe() { store.me = me; Kit.save(); }
function setInk(a, b) {
  var r = document.documentElement.style;
  r.setProperty("--a", a); r.setProperty("--b", b); r.setProperty("--on", R.ink(a)); r.setProperty("--onb", R.ink(b)); r.setProperty("--btn", R.lum(a) > 0.45 ? a : "#fffaf0");
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", a);
}
function show(name, push) {
  ["home", "editor", "done", "shelf", "game"].forEach(function (s) { $(s).hidden = s !== name; });
  screen = name; document.body.setAttribute("data-state", name === "game" ? "ready" : name);
  if (push) { try { history.pushState({ s: name }, "", location.href); } catch (e) {} }
}
function clearLink() { try { if (location.hash) history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }

/* ---------- calendar ---------- */
function ideaText(i) { return i[Kit.lang] || i.de; }
function monthLines(d) {
  var loc = Kit.lang === "de" ? "de-DE" : "en-GB";
  return d.toLocaleDateString(loc, { month: "short", timeZone: "UTC" }).replace(".", "") + "\n" + d.toLocaleDateString(loc, { weekday: "long", timeZone: "UTC" });
}
function fitHero() {
  var box = $("hero"), w = box.clientWidth, h = box.clientHeight, ls = Array.from(box.children), sum = 0;
  ls.forEach(function (s) { s.style.fontSize = "100px"; var size = Math.min(100 * w / Math.max(1, s.offsetWidth) * 0.97, h * 0.34); s.size = size; sum += size; });
  var k = sum > h ? h / sum : 1;
  ls.forEach(function (s) { s.style.fontSize = s.size * k + "px"; s.style.lineHeight = "1"; });
}
function setHome(h, animate) {
  home = h;
  var d = h.date || today, idea = h.idea, doc = h.doc;
  $("dnum").textContent = String(d.getUTCDate()).padStart(2, "0");
  $("dmon").textContent = monthLines(d);
  var title, sub, kind, min;
  if (idea) { var L = ideaText(idea); title = L.t.split("|"); sub = L.s; kind = idea.kind; min = idea.min; }
  else { title = (doc.t || doc.x || (doc.g && doc.g.title) || t("own")).split(/\s+/).reduce(function (a, w) { if (a.length && (a[a.length - 1] + " " + w).length < 13) a[a.length - 1] += " " + w; else a.push(w); return a; }, []).slice(0, 4); sub = doc.s || ""; kind = doc.k; min = 60; }
  $("dkind").textContent = t(kind) + "\n" + t("sec", { n: min });
  var hero = $("hero"); hero.textContent = "";
  title.filter(Boolean).forEach(function (l, i) { var s = el("span", "", l); s.style.setProperty("--i", i); hero.appendChild(s); });
  $("teaser").textContent = sub;
  var from = $("from");
  if (h.note) { from.textContent = h.note; from.hidden = false; } else from.hidden = true;
  $("go").textContent = t("go"); fitHero();
  var leaf = $("leaf"); leaf.className = ""; leaf.style.transform = "";
  if (animate) { void leaf.offsetWidth; leaf.classList.add("enter"); }
}
function dayHome() { return { date: today, idea: D.ideaForDay(today) }; }
function goHome() {
  stopSound(); G.stop(); ed = null; clearLink(); setInk(me.colors[0], me.colors[1]); show("home");
  if (!home) home = dayHome(); setHome(home, true);
}
function tear(dir) {
  var leaf = $("leaf"); Kit.rip(); Kit.haptic(18);
  leaf.className = "gone"; leaf.style.transform = "translate(" + dir * 130 + "%,-20%) rotate(" + dir * 26 + "deg)";
  setTimeout(function () {
    setHome({ date: today, idea: D.randomIdea(Math.random, home.idea ? home.idea.id : "") }, true); Kit.sfx.thud();
  }, 300);
}
(function drag() {
  var leaf = $("leaf"), sx = 0, sy = 0, on = false;
  leaf.addEventListener("pointerdown", function (e) { on = true; sx = e.clientX; sy = e.clientY; leaf.classList.add("drag"); try { leaf.setPointerCapture(e.pointerId); } catch (x) {} });
  leaf.addEventListener("pointermove", function (e) { if (!on) return; var dx = e.clientX - sx, dy = e.clientY - sy; leaf.style.transform = "translate(" + dx + "px," + dy * 0.4 + "px) rotate(" + dx / 16 + "deg)"; });
  function up(e) {
    if (!on) return; on = false; leaf.classList.remove("drag");
    var dx = e.clientX - sx;
    if (Math.abs(dx) > 90) tear(dx > 0 ? 1 : -1); else leaf.style.transform = "";
  }
  leaf.addEventListener("pointerup", up); leaf.addEventListener("pointercancel", up);
})();

/* ---------- editor ---------- */
var TABS = {
  card: ["Text", "Style", "Color", "Sticker"], photo: ["Photo", "Text", "Style", "Color", "Sticker"],
  sound: ["Sound", "Text", "Color"], game: ["Rules", "Figure", "World", "Text"]
};
var cv = $("stage"), timer = 0;
function paint() {
  timer = 0; if (!ed) return;
  ed.doc.col = ed.doc.col; setInk(ed.doc.col[0], ed.doc.col[1]);
  if (ed.doc.k === "game") G.update(ed.doc.g && gameState()); else { R.draw(cv, ed.doc, { me: me, photo: ed.photo, peaks: ed.peaks }); }
  footer();
}
function changed() {           // every control ends up here: redraw within the next moment
  if (!timer) timer = setTimeout(paint, 16);
}
function gameState() { return C.sanitizeState(Object.assign({ v: 1 }, ed.doc.g)); }
function areas() { var w = D.changedAreas(ed.base, ed.doc); if (ed.ownPhoto) w.push("foto"); if (ed.ownVoice) w.push("stimme"); return w; }
function touched() { var ok = areas().length > 0; return ed.own ? ok && !!ed.doc.t : ok; }
function footer() {
  var b = $("edmain"), ok = touched(), g = ed.doc.k === "game";
  b.classList.toggle("wait", !ok && !g);
  b.textContent = g ? t("play") : ok ? t("done") : t("needOwn");
}
function trailLine() {
  var box = $("trail"), by = ed.doc.by; box.textContent = ""; box.hidden = !by.length; if (!by.length) return;
  box.textContent = t("trail") + ": " + by.map(function (e) { return (e.n || t("anon")) + " (" + e.w.map(function (w) { return t("a_" + w); }).join(", ") + ")"; }).join(" → ");
}
function openEditor(doc, opt) {
  opt = opt || {};
  ed = { doc: D.sanitizeDoc(doc), base: D.sanitizeDoc(doc), own: !!opt.own, photo: null, peaks: null, pcm: null, tab: null, sel: -1, page: 0, line: 0, idea: opt.idea || null };
  if (opt.own) ed.doc.n = me.nick;
  if (ed.doc.k === "sound" && ed.doc.m === "beat") beatPeaks();
  if (ed.doc.k === "photo") { ed.photo = R.botFace(C.hash32(me.nick + Date.now()), ed.doc.col[1]); }
  var g = ed.doc.k === "game";
  cv.hidden = g; $("gamestage").hidden = !g;
  $("edtitle").textContent = ed.own ? t("own") : (ed.idea ? ideaText(ed.idea).t.replace("|", " ") : t(ed.doc.k));
  $("edstyle").textContent = me.emoji;
  stopSound(); show("editor", true); trailLine();
  var tabs = $("tabs"); tabs.textContent = "";
  var list = (ed.own ? ["Idea"] : []).concat(TABS[ed.doc.k]);
  list.forEach(function (k) {
    var b = el("button", "", t("tab" + (k === "Sound" ? (ed.doc.m === "beat" ? "Beat" : "Voice") : k === "Idea" ? "Idea" : k)), function () { Kit.sfx.tap(); tab(k); });
    b.setAttribute("role", "tab"); b.dataset.k = k; tabs.appendChild(b);
  });
  tab(list[0]);
  if (g) G.demo($("demo"), gameState());
  paint();
}
function tab(k) {
  ed.tab = k; Array.from($("tabs").children).forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.k === k)); });
  var p = $("panel"); p.textContent = ""; p.classList.toggle("tall", k === "Sound" && ed.doc.m === "beat"); PANEL[k](p); p.scrollTop = 0;
}
function field(p, label, value, max, on, area) {
  p.appendChild(el("label", "lbl", label));
  var f = el(area ? "textarea" : "input", "field"); f.value = value || ""; f.maxLength = max; if (area) f.rows = 2; f.autocomplete = "off"; f.setAttribute("aria-label", label);
  f.addEventListener("input", function () {
    var v = D.cleanInput(f.value, max);
    if (f.value.trim() && !v) { Kit.toast(t("filter")); return; }
    on(v); changed();
  });
  p.appendChild(f); return f;
}
function chips(p, items, cur, on, cls) {
  var box = el("div", "chips");
  items.forEach(function (it) {
    var b = el("button", "chip " + (cls || "") + (it.v === cur ? " on" : ""), it.l, function () {
      Kit.sfx.tap(); Array.from(box.children).forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); on(it.v); changed();
    });
    box.appendChild(b);
  });
  p.appendChild(box); return box;
}
function colors(p, get, set) {
  var box = el("div", "chips"), now = get();
  PAIRS.forEach(function (c) {
    var b = el("button", "sw" + (c.join() === now.join() ? " on" : ""), null, function () {
      Kit.sfx.tap(); Array.from(box.children).forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); set(c.slice()); a.value = c[0]; z.value = c[1]; changed();
    });
    b.style.background = c[1]; var i = el("i"); i.style.background = c[0]; b.appendChild(i); b.setAttribute("aria-label", c.join(" ")); box.appendChild(b);
  });
  p.appendChild(box);
  p.appendChild(el("label", "lbl", t("custom")));
  var row = el("div", "chips"), a = el("input"), z = el("input");
  [a, z].forEach(function (x, i) { x.type = "color"; x.value = now[i]; x.setAttribute("aria-label", t("custom")); x.addEventListener("input", function () { set([a.value, z.value]); changed(); }); row.appendChild(x); });
  p.appendChild(row);
}
var PANEL = {
  Idea: function (p) {
    p.appendChild(el("p", "note", t("ownH")));
    field(p, t("ideaT"), ed.doc.t, 40, function (v) { ed.doc.t = v; });
    field(p, t("ideaS"), ed.doc.s, 70, function (v) { ed.doc.s = v; });
  },
  Text: function (p) {
    var d = ed.doc;
    if (d.k === "card") {
      var f = field(p, t("line"), d.x, 90, function (v) { d.x = v; }, true), L = ed.idea ? ideaText(ed.idea).lines : null;
      if (L) p.appendChild(el("button", "chip", "🎲 " + t("dice"), function () { Kit.sfx.pop(); ed.line = (ed.line + 1) % L.length; d.x = L[ed.line]; f.value = d.x; ed.base.x = d.x; changed(); }));
    } else if (d.k === "photo") { field(p, t("top"), d.x, 28, function (v) { d.x = v; }); field(p, t("bottom"), d.y, 28, function (v) { d.y = v; }); }
    else if (d.k === "sound") field(p, t("titleL"), d.x, 28, function (v) { d.x = v; });
    else field(p, t("titleL"), d.g.title, 28, function (v) { d.g.title = v || "Duell"; });
  },
  Style: function (p) {
    var d = ed.doc;
    chips(p, D.STYLES[d.k].map(function (s) { return { v: s, l: t("st_" + s) }; }), d.st, function (v) { d.st = v; });
  },
  Color: function (p) { colors(p, function () { return ed.doc.col; }, function (c) { ed.doc.col = c; if (ed.doc.k === "photo") ed.photo._id += ""; }); },
  Sticker: function (p) {
    var d = ed.doc, own = D.byId(d.i), set = D.SETS[(own && own.set) || me.set].concat([me.emoji]);
    var box = el("div", "chips");
    set.forEach(function (e) {
      box.appendChild(el("button", "chip em", e, function () {
        if (d.sk.length >= D.MAX_STICKERS) return;
        Kit.sfx.pop(); var r = C.mulberry32(C.hash32(me.nick + d.sk.length + e + d.x));
        d.sk.push({ e: e, x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.65, r: (r() - 0.5) * 0.7, z: 0.8 + r() * 0.7 }); ed.sel = d.sk.length - 1; changed();
      }));
    });
    p.appendChild(box);
    var row = el("div", "chips");
    [["−", function (s) { s.z = Math.max(0.5, s.z - 0.2); }], ["+", function (s) { s.z = Math.min(2.5, s.z + 0.2); }], ["↻", function (s) { s.r = s.r > 0.8 ? -1 : s.r + 0.25; }], ["✕", null]].forEach(function (x) {
      row.appendChild(el("button", "chip em", x[0], function () {
        var s = d.sk[ed.sel]; if (!s) return; Kit.sfx.tap();
        if (x[1]) x[1](s); else { d.sk.splice(ed.sel, 1); ed.sel = d.sk.length - 1; } changed();
      }));
    });
    p.appendChild(row);
  },
  Photo: function (p) {
    p.appendChild(el("button", "chip", "📷 " + t("pick"), function () { Kit.sfx.tap(); $("file").click(); }));
    p.appendChild(el("button", "chip", "🤖 " + t("noPhoto"), function () { Kit.sfx.pop(); ed.photo = R.botFace(C.hash32(String(Math.random())), ed.doc.col[1]); changed(); }));
    p.appendChild(el("p", "note", t("photoNote") + " " + t("noPick")));
    chips(p, D.STYLES.photo.map(function (s) { return { v: s, l: t("st_" + s) }; }), ed.doc.st, function (v) { ed.doc.st = v; });
  },
  Sound: function (p) { if (ed.doc.m === "beat") beatPanel(p); else voicePanel(p); },
  Rules: function (p) {
    var g = ed.doc.g, ranges = C.RANGES;
    ["gravity", "jump", "gap", "speed"].forEach(function (k) {
      var row = el("label", "slide"), r = el("input"), v = el("b", "", g.params[k]);
      row.appendChild(el("span", "", t(k))); r.type = "range"; r.min = ranges[k][0]; r.max = ranges[k][1]; r.value = g.params[k]; r.setAttribute("aria-label", t(k));
      r.addEventListener("input", function () { g.params[k] = Number(r.value); v.textContent = r.value; changed(); });
      row.appendChild(r); row.appendChild(v); p.appendChild(row);
    });
    var f = field(p, t("describe"), "", 80, function () {});
    p.appendChild(el("button", "chip", "✨ " + t("describeGo"), async function (e) {
      var v = D.cleanInput(f.value, 80); if (!v) { Kit.toast(t("filter")); return; }
      var b = e.currentTarget; b.disabled = true;
      var st = await G.fromSentence(v, Kit.lang); b.disabled = false;
      if (!ed || !st || st.rejected) { Kit.toast(t("filter")); return; }
      ed.doc.g = { seed: st.seed, params: st.params, theme: st.theme, title: st.title, emoji: st.emoji }; tab("Rules"); changed();
    }));
    p.appendChild(el("p", "note", t("netNote")));
  },
  Figure: function (p) {
    var g = ed.doc.g, list = EMOJI.indexOf(me.emoji) < 0 ? [me.emoji].concat(EMOJI) : EMOJI;
    chips(p, list.map(function (e) { return { v: e, l: e }; }), g.emoji, function (v) { g.emoji = v; }, "em");
  },
  World: function (p) {
    var g = ed.doc.g;
    var b = chips(p, G.THEMES.map(function (n) { return { v: n, l: t("w_" + n) }; }), g.theme, function (v) { g.theme = v; });
    Array.from(b.children).forEach(function (c, i) { c.style.borderBottom = "8px solid " + G.themeColor(G.THEMES[i]); });
  }
};

/* sticker dragging on the preview */
(function () {
  var drag = -1;
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
  cv.addEventListener("pointerdown", function (e) {
    if (!ed || !ed.doc.sk) return; var p = pos(e), l = ed.doc.sk;
    for (var i = l.length - 1; i >= 0; i--) { if (Math.hypot(l[i].x - p.x, (l[i].y - p.y) * 1.25) < 0.1 * l[i].z) { drag = i; ed.sel = i; try { cv.setPointerCapture(e.pointerId); } catch (x) {} Kit.sfx.tap(); return; } }
  });
  cv.addEventListener("pointermove", function (e) { if (drag < 0 || !ed) return; var p = pos(e), s = ed.doc.sk[drag]; s.x = Math.min(1, Math.max(0, p.x)); s.y = Math.min(1, Math.max(0, p.y)); changed(); });
  function up() { drag = -1; }
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
})();

/* photo: read locally, drawn to a canvas; the file never leaves this function's memory */
$("file").addEventListener("change", async function () {
  var f = $("file").files && $("file").files[0]; $("file").value = "";
  if (!f || !ed) return;
  try {
    var bmp = typeof createImageBitmap === "function" ? await createImageBitmap(f) : await new Promise(function (ok, no) { var i = new Image(), u = URL.createObjectURL(f); i.onload = function () { URL.revokeObjectURL(u); ok(i); }; i.onerror = no; i.src = u; });
    var k = Math.min(1, 1350 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    c._id = "p" + Date.now(); ed.photo = c; ed.ownPhoto = true; Kit.sfx.pop(); changed();
  } catch (e) { Kit.toast(t("noPick")); }
});

/* sound */
var loop = null, playTimer = 0;
function stopSound() { clearInterval(playTimer); playTimer = 0; if (loop) { try { loop.stop(); } catch (e) {} loop = null; } clearNow(); }
function clearNow() { document.querySelectorAll(".step.now").forEach(function (x) { x.classList.remove("now"); }); }
function beatPcm(loops) { return S.renderBeat(ed.doc.p, ed.doc.bpm, loops || 2); }
function beatPeaks() { ed.peaks = S.peaks(beatPcm(1), 40); }
function playBeat() {
  stopSound(); var pcm = beatPcm(1); loop = Kit.playPcm(pcm, S.SR, true); if (!loop) return;
  var i = 0, ms = 60000 / ed.doc.bpm / 4;
  playTimer = setInterval(function () {
    clearNow();
    var page = Math.floor(i / 8); if (page === ed.page) document.querySelectorAll('.step[data-c="' + (i % 8) + '"]').forEach(function (x) { x.classList.add("now"); });
    i = (i + 1) % 16;
  }, ms);
}
function beatPanel(p) {
  var rows = [["k", "🥁"], ["s", "👏"], ["h", "✨"], ["b", "🎹"]], grid = el("div", "grid");
  function fill() {
    grid.textContent = "";
    rows.forEach(function (r) {
      grid.appendChild(el("span", "", r[1]));
      for (var c = 0; c < 8; c++) (function (c) {
        var i = ed.page * 8 + c, b = el("button", "step" + (c % 4 === 0 ? " q" : "") + (ed.doc.p[r[0]][i] === "x" ? " on" : ""), null, function () {
          var v = ed.doc.p[r[0]]; ed.doc.p[r[0]] = v.slice(0, i) + (v[i] === "x" ? "-" : "x") + v.slice(i + 1);
          b.classList.toggle("on"); Kit.sfx.tap(); beatPeaks(); changed(); if (loop) playBeat();
        });
        b.dataset.c = c; b.setAttribute("aria-label", r[0] + " " + (i + 1)); grid.appendChild(b);
      })(c);
    });
  }
  fill(); p.appendChild(grid);
  var row = el("label", "slide"), r = el("input"), v = el("b", "", ed.doc.bpm);
  row.appendChild(el("span", "", t("bpm"))); r.type = "range"; r.min = 70; r.max = 170; r.value = ed.doc.bpm; r.setAttribute("aria-label", t("bpm"));
  r.addEventListener("input", function () { ed.doc.bpm = Number(r.value); v.textContent = r.value; beatPeaks(); changed(); });
  r.addEventListener("change", function () { if (loop) playBeat(); });
  row.appendChild(r); row.appendChild(v); p.appendChild(row);
  var bar = el("div", "chips");
  bar.appendChild(el("button", "chip", "1–8 / 9–16", function () { ed.page = 1 - ed.page; fill(); }));
  var pl = el("button", "chip", "▶ " + t("listen"), function () { if (loop) { stopSound(); pl.textContent = "▶ " + t("listen"); } else { playBeat(); pl.textContent = "■ " + t("stop"); } });
  bar.appendChild(pl); p.appendChild(bar);
}
function setVoice(pcm, mine) { ed.raw = pcm; if (mine) ed.ownVoice = true; applyFx(); }
function applyFx() { if (!ed.raw) return; ed.pcm = S.warp(ed.raw, ed.doc.fx); ed.peaks = S.peaks(ed.pcm, 40); changed(); }
async function record(b) {
  var n = S.SR, ms = 4000;
  try {
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error("no mic");
    var st = await navigator.mediaDevices.getUserMedia({ audio: true }), rec = new MediaRecorder(st), parts = [];
    b.textContent = "● " + t("recing");
    rec.ondataavailable = function (e) { parts.push(e.data); };
    rec.onstop = async function () {
      st.getTracks().forEach(function (x) { x.stop(); });
      var buf = await Kit.audio(true).decodeAudioData(await new Blob(parts).arrayBuffer()), src = buf.getChannelData(0), k = buf.sampleRate / n, o = new Float32Array(Math.floor(src.length / k));
      for (var i = 0; i < o.length; i++) o[i] = src[Math.floor(i * k)];
      b.textContent = "🎙 " + t("rec"); if (ed) setVoice(o, true);
    };
    rec.start(); setTimeout(function () { if (rec.state === "recording") rec.stop(); }, ms);
  } catch (e) { Kit.toast(t("noMic")); }
}
function voicePanel(p) {
  var b = el("button", "chip", "🎙 " + t("rec"), function () { Kit.sfx.tap(); record(b); });
  var row = el("div", "chips"); row.appendChild(b);
  row.appendChild(el("button", "chip", "🤪 " + t("dummy"), function () { Kit.sfx.pop(); setVoice(S.dummyVoice(), false); }));
  row.appendChild(el("button", "chip", "▶ " + t("listen"), function () { if (!ed.pcm) setVoice(S.dummyVoice(), false); stopSound(); loop = Kit.playPcm(ed.pcm, S.SR, false); }));
  p.appendChild(row);
  chips(p, D.FX.map(function (f) { return { v: f, l: t("fx_" + f) }; }), ed.doc.fx, function (v) { ed.doc.fx = v; applyFx(); });
}

/* ---------- finish ---------- */
function makeBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(ok, type || "image/png", q); }); }
function thumb(c) { var s = document.createElement("canvas"); s.width = 270; s.height = 338; s.getContext("2d").drawImage(c, 0, 0, 270, 338); return s.toDataURL("image/jpeg", 0.6); }
async function finish(doc, idea, pictureDoc) {
  var c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  R.draw(c, pictureDoc || doc, { me: me, photo: ed && ed.photo, peaks: ed && ed.peaks });
  var png = await makeBlob(c), file = png, name = "my-daily-idea.png";
  if (doc.k === "sound") {
    var pcm = doc.m === "beat" ? beatPcm(2) : (ed.pcm || S.warp(S.dummyVoice(), doc.fx));
    file = new Blob([S.wav(pcm)], { type: "audio/wav" }); name = "my-daily-idea.wav";
  }
  var url = D.docUrl(doc);
  result = { url: url, file: file, name: name, png: png, keep: ed };
  wall = D.addToWall(wall, { id: idea || doc.i || "own", ts: Date.now(), th: thumb(c) }); store.wall = wall; Kit.save();
  if (!Kit.persisted) Kit.toast(t("wallFull"));
  var img = $("doneimg"); if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(png);
  stopSound(); G.stop(); labels(); show("done", true); Kit.sfx.win();
}
$("edmain").addEventListener("click", function () {
  if (!ed) return;
  if (ed.doc.k === "game") { Kit.sfx.thud(); G.stop(); show("game", true); G.play(gameState(), null, { own: touched() }); return; }
  if (!touched()) { Kit.tone(200, 160, 0.1, "square", 0.06); return; }
  Kit.sfx.thud();
  finish(D.withTrail(ed.doc, me.nick, areas()));
});
$("share").addEventListener("click", async function () {
  Kit.sfx.tap();
  var how = await Kit.share({ url: result.url, text: t("shareText"), blob: result.file, name: result.name });
  if (how === "link") Kit.toast(t("shot"));
});
$("save").addEventListener("click", function () { Kit.sfx.tap(); Kit.saveFile(result.file, result.name); });
$("keep").addEventListener("click", function () { Kit.sfx.tap(); backToEditor(); });
function backToEditor() {
  ed = result.keep; show("editor"); if (ed.doc.k === "game") G.demo($("demo"), gameState()); changed();
}
$("dhome").addEventListener("click", goHome);
$("edback").addEventListener("click", function () { Kit.sfx.tap(); goHome(); });
$("shback").addEventListener("click", function () { Kit.sfx.tap(); if (!backFromStyle()) goHome(); });
// My style opened from the editor returns there with the work intact; new colours apply unless they were chosen by hand.
function backFromStyle() {
  if (!ed || !ed.styling) return false;
  ed.styling = false;
  if (ed.doc.col.join() === ed.base.col.join()) { ed.doc.col = me.colors.slice(); ed.base.col = me.colors.slice(); }
  $("edstyle").textContent = me.emoji; show("editor");
  if (ed.doc.k === "game") G.demo($("demo"), gameState());
  changed(); return true;
}
$("gback").addEventListener("click", function () { Kit.sfx.tap(); goHome(); });
function gameToEditor() {
  var s = G.current(), d = { k: "game", col: me.colors, by: [], g: { seed: s.seed, params: s.params, theme: s.theme, title: s.title, emoji: s.emoji } };
  if (ed && ed.doc.k === "game") { var keep = ed; G.stop(); show("editor"); ed = keep; G.demo($("demo"), gameState()); changed(); return; }
  G.stop(); openEditor(d);
}
$("remixbtn").addEventListener("click", function () { Kit.sfx.tap(); gameToEditor(); });
$("toremix").addEventListener("click", function () { Kit.sfx.tap(); gameToEditor(); });
$("image").addEventListener("click", function () {
  var s = G.current(), sc = G.score(), base = ed && ed.doc.k === "game" ? ed.doc : { k: "game", col: me.colors, by: [], g: { seed: s.seed, params: s.params, theme: s.theme, title: s.title, emoji: s.emoji } };
  if (!ed) ed = { doc: D.sanitizeDoc(base), base: D.sanitizeDoc(base), photo: null, peaks: null };
  var pic = { k: "card", st: "druck", col: base.col, x: sc + " " + s.emoji + " " + s.title, sk: [] };
  finish(D.withTrail(base, me.nick, D.changedAreas(ed.base, ed.doc)), base.i, pic);
});

/* ---------- my style ---------- */
function openStyle() {
  shelf(t("style"), function (b) {
    b.appendChild(el("label", "lbl", t("nick")));
    var f = el("input", "field"); f.value = me.nick; f.maxLength = 16; f.setAttribute("aria-label", t("nick"));
    f.addEventListener("input", function () { var v = C.sanitizeName(f.value); if (f.value.trim() && !v) { Kit.toast(t("filter")); return; } me.nick = v; saveMe(); });
    b.appendChild(f); b.appendChild(el("p", "note", t("nickNote")));
    b.appendChild(el("label", "lbl", t("emoji")));
    chips(b, EMOJI.map(function (e) { return { v: e, l: e }; }), me.emoji, function (v) { me.emoji = v; saveMe(); $("me").textContent = v; }, "em");
    b.appendChild(el("label", "lbl", t("colors")));
    colors(b, function () { return me.colors; }, function (c) { me.colors = c; saveMe(); setInk(c[0], c[1]); });
    b.appendChild(el("label", "lbl", t("set")));
    chips(b, Object.keys(D.SETS).map(function (s) { return { v: s, l: D.SETS[s][0] + " " + t("set_" + s) }; }), me.set, function (v) { me.set = v; saveMe(); });
  });
}
function shelf(title, fill) { stopSound(); G.stop(); $("shtitle").textContent = title; var b = $("shbody"); b.textContent = ""; fill(b); show("shelf", true); }
function openPast() {
  shelf(t("past"), function (b) {
    D.lastDays(today, 7).forEach(function (e) {
      var made = wall.some(function (w) { return w.id === e.idea.id; }), row = el("button", "day", null, function () { Kit.sfx.tap(); home = { date: e.date, idea: e.idea }; goHome(); });
      row.appendChild(el("b", "", String(e.date.getUTCDate()).padStart(2, "0")));
      row.appendChild(el("span", "", ideaText(e.idea).t.replace("|", " ")));
      if (made) row.appendChild(el("i", "", "✓"));
      b.appendChild(row);
    });
  });
}
function openWall() {
  shelf(t("wall"), function (b) {
    if (!wall.length) { b.appendChild(el("div", "empty", t("wallEmpty"))); return; }
    var g = el("div", "wallgrid");
    wall.forEach(function (w, i) {
      var c = el("button", "", null, function () {
        Kit.sfx.tap(); b.textContent = ""; var im = el("img", "big"); im.src = w.th; im.alt = ""; b.appendChild(im);
        b.appendChild(el("button", "btn", t("gone"), function () { wall.splice(i, 1); store.wall = wall; Kit.save(); openWall(); }));
      });
      var im = el("img"); im.src = w.th; im.alt = ""; c.appendChild(im); g.appendChild(c);
    });
    b.appendChild(g);
  });
}
function openOwn() {
  shelf(t("own"), function (b) {
    b.appendChild(el("p", "note", t("ownH")));
    [["card", "🃏"], ["photo", "📷"], ["sound", "🥁"], ["game", "🕹"]].forEach(function (m) {
      b.appendChild(el("button", "mech", m[1] + " " + t(m[0]), function () { Kit.sfx.thud(); openEditor(D.blankDoc(m[0], me, Kit.lang), { own: true }); }));
    });
  });
}

/* ---------- chrome ---------- */
function labels() {
  document.documentElement.lang = Kit.lang;
  $("brand").textContent = t("brand"); $("lang").textContent = Kit.lang.toUpperCase(); $("me").textContent = me.emoji;
  $("mute").textContent = Kit.muted ? "🔇" : "🔊"; $("more").textContent = t("more"); $("own").textContent = t("own"); $("past").textContent = t("past"); $("wall").textContent = t("wall");
  $("share").textContent = t("share"); $("save").textContent = t("save"); $("keep").textContent = t("edit"); $("dhome").textContent = t("home");
  $("save").hidden = !Kit.canSave();
  // Inside the app shells (DuellHost.more) a quiet "more" opens the native extras; in a browser it stays hidden.
  var host = window.DuellHost && typeof window.DuellHost.more === "function";
  $("host").hidden = !host; $("host").setAttribute("aria-label", t("hostMore"));
}
$("lang").addEventListener("click", function () { Kit.lang = Kit.lang === "de" ? "en" : "de"; store.lang = Kit.lang; Kit.save(); labels(); if (home) setHome(home, false); });
$("host").addEventListener("click", function () { Kit.sfx.tap(); try { window.DuellHost.more(); } catch (e) {} });
$("mute").addEventListener("click", function () { Kit.muted = !Kit.muted; store.muted = Kit.muted; Kit.save(); labels(); Kit.sfx.tap(); });
$("me").addEventListener("click", function () { Kit.sfx.tap(); openStyle(); });
$("edstyle").addEventListener("click", function () { Kit.sfx.tap(); ed.styling = true; openStyle(); });
$("more").addEventListener("click", function () { tear(1); });
$("past").addEventListener("click", function () { Kit.sfx.tap(); openPast(); });
$("wall").addEventListener("click", function () { Kit.sfx.tap(); openWall(); });
$("own").addEventListener("click", function () { Kit.sfx.tap(); openOwn(); });
$("go").addEventListener("click", function () {
  Kit.sfx.thud();
  if (home.doc) openEditor(home.doc, { idea: home.doc.i ? D.byId(home.doc.i) : null });
  else openEditor(D.docFromIdea(home.idea, me, Kit.lang), { idea: home.idea });
});
window.addEventListener("resize", function () { if (screen === "home") fitHero(); });
window.addEventListener("popstate", function () { if (screen !== "home" && !location.hash && !backFromStyle()) goHome(); });   // with a hash, hashchange decides

function route() {
  var r = D.parseRoute(location.hash);
  if (r && r.type === "challenge") {
    var st = Object.assign({}, r.state), riv = typeof st.score === "number" ? { score: st.score, name: st.name || "" } : null;
    delete st.score; delete st.name; show("game"); G.play(st, riv, { own: true }); return true;
  }
  if (r && r.type === "idea") { home = { date: today, idea: D.byId(r.id), note: t("invite") }; goHomeKeep(); return true; }
  if (r && r.type === "doc") {
    var lastBy = r.doc.by.length ? r.doc.by[r.doc.by.length - 1].n : r.doc.n;
    home = { date: today, doc: r.doc, note: t("remixOf", { n: lastBy || t("someone") }) }; goHomeKeep(); return true;
  }
  return false;
}
function goHomeKeep() { stopSound(); G.stop(); ed = null; setInk(me.colors[0], me.colors[1]); show("home"); setHome(home, true); }
window.addEventListener("hashchange", route);

/* test hook, used by browser checks: read-only snapshot */
window.DailyDebug = { me: function () { return me; }, doc: function () { return ed && ed.doc; }, wall: function () { return wall; }, result: function () { return result; }, home: function () { return home; }, areas: function () { return ed ? areas() : []; }, tab: function (k) { tab(k); } };

labels();
if (!route()) goHome();
// The embedded display font loads after the first paint: fit the headline again once it is there.
if (document.fonts && document.fonts.load) document.fonts.load('900 40px Anton').then(function () { if (screen === "home") fitHero(); }, function () {});
})();
