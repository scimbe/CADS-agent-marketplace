/* Bubbles (Blasen, redesign wave R4): the editor's tab bar and its panels, a part of their own (scripts/build.js PARTS.blasen,
   only on demand: src/parts.js ONDEMAND). app.js openEditor asks for it at the first opening and shows "…" until it is
   there; a tab asked for meanwhile is only remembered (app.js tab). Behaviour as before: role=tab, the arrows, Home, End.
   A.TABS and A.PANEL are the core's objects: modes.js and turn-ui.js add their kinds in the core, direkt-ui.js and
   regler-ui.js in their parts, before or after this one. So this part fills in only what is still missing, and a panel
   that wraps one of these (turn-ui.js Text, direkt-ui.js Color) calls it through window.Blasen.PANEL. */
(function (root) {
"use strict";
var A = root.DailyApp, Kit = root.Kit, t = Kit.t, C = root.DuellCore, D = root.Daily, W = root.Wish, R = root.Render, G = root.Game;
var $ = function (id) { return document.getElementById(id); };
var el = A.el, field = A.field, chips = A.chips, colors = A.colors, changed = A.changed, aiBlock = A.aiBlock, setDoc = A.setDoc, SK = A.SK;
var ed = A.ed, gameState = A.gameState, playGame = A.playGame, markKi = A.markKi, ideaText = A.ideaText, beatPeaks = A.beatPeaks, playBeat = A.playBeat, stopSound = A.stopSound;
var PAIRS = A.style.PAIRS, EMOJI = A.style.EMOJI, seeded = A.style.seeded, roll = A.style.roll, allow = function (a, b) { return A.allow(a, b); };

var TABS = {
  card: ["Text", "Style", "Color", "Sticker"], photo: ["Photo", "Text", "Style", "Color", "Sticker"],
  sound: ["Sound", "Text", "Color"], game: ["Rules", "Figure", "World", "Text"]
};
// The tab bar of the sheet just opened (app.js openEditor), then its first tab.
function open(opt) {
  var g = ed().doc.k === "game";
  var tabs = $("tabs"); tabs.textContent = "";
  var list = (ed().own ? ["Idea"] : []).concat(W.KINDS.indexOf(ed().doc.k) >= 0 ? ["Wish"] : [], W.DICE.indexOf(ed().doc.k) >= 0 ? ["Dice"] : [], ed().doc.nr ? ["Door"] : [], A.TABS[ed().doc.k]), mine = list.filter(function (k) { return allow("tabs", k); });
  if (mine.length) list = mine;   // a flavor's list never leaves a kind it does not know (a duel link in Business) without tabs
  list.forEach(function (k) {
    var b = el("button", k === "Wish" ? "hot" : "", tabText(k), function () { Kit.sfx.tap(); tab(k); });
    b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "panel"); b.id = "tab" + k; b.dataset.k = k; tabs.appendChild(b);
  });
  tab(list.indexOf(opt.tab) >= 0 ? opt.tab : g ? "Wish" : list.filter(function (k) { return k !== "Wish" && k !== "Dice"; })[0]);
}
function tabText(k) { return t("tab" + (k === "Sound" ? (ed().doc.m === "beat" ? "Beat" : "Voice") : k)); }
// The tabs are one stop for Tab; the arrows (Home, End) move along and open the tab they land on.
$("tabs").addEventListener("keydown", function (e) {
  var l = Array.from($("tabs").children), i = l.indexOf(document.activeElement), n = l.length, j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
  if (i < 0 || j == null) return; e.preventDefault(); l = l[(j + n) % n]; l.focus(); l.click();
});
function tab(k) {
  if (ed().pv) { ed().pv = false; ed().fly = null; window.Ai.drop(); G.update(gameState()); }
  ed().tab = k; Array.from($("tabs").children).forEach(function (b) { var on = b.dataset.k === k; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
  var p = $("panel"); p.textContent = ""; p.setAttribute("aria-labelledby", "tab" + k); p.removeAttribute("data-size"); p.classList.toggle("tall", k === "Sound" || (k === "Text" && ed().doc.k !== "game") || k === "Wish" || k === "Dice"); A.PANEL[k](p); p.scrollTop = 0;
}

// A change by hand to a game the AI made: the sheet is no longer what the seal was made for, so the AI mark goes.
// a remix keeps the free card's id (doc.fr)
function byHand() { var k = ed().doc.ki; if (k && k.k === "karte" && k.h && !ed().doc.fr) ed().doc.fr = k.h.slice(0, 22); delete ed().doc.ki; }

// Weather card (src/wetter.js, the part wetter): a slot in the text tab now, the block follows with the part. A flavor
// without cards does not build the part (scripts/build.js), so there is nothing to load. When it does not come the card
// works without the weather; a short word on screen once per session, not on every tab switch.
var wxSaid = false;
function weatherBlock(p) {
  var slot = el("div"); p.appendChild(slot);
  if (window.Parts.names().indexOf("wetter") >= 0) window.Parts.need("wetter").then(function () { if (slot.isConnected && ed()) window.Wetter.block(slot); }).catch(function () { if (!wxSaid) { wxSaid = true; Kit.toast(t("part_fail")); } });
}

// Texte und Song (texte.js) are a part of their own: the slot stands in the panel now, its content follows with the part.
function textePart(p, what, f) {
  var slot = el("div"); p.appendChild(slot);
  window.Parts.use("texte", function () {
    if (slot.isConnected && ed()) window.TexteUI[what](slot, { f: f, aiBlock: aiBlock, markKi: markKi, setDoc: setDoc, play: function () { beatPeaks(); playBeat(); tab(ed().tab); }, stop: stopSound });
  }).catch(function () {});
}

// "Geändert: …" and the undo, after a wish or a roll. before: the doc as JSON before the change. -> false when nothing changed.
function didLine(res, before, next, lead) {
  var was = JSON.parse(before), what = D.changedAreas(was, next);
  if (next.k === "sound" && next.fx !== was.fx && what.indexOf("stimme") < 0) what.push("stimme");
  if (!what.length) { res.appendChild(el("p", "note", t("wishSame"))); return false; }
  setDoc(next); (ed().wishes = ed().wishes || []).push(before);
  res.appendChild(el("p", "aicount", (lead ? lead + " · " : "") + t("wishDid") + ": " + what.map(function (w) { return t("a_" + w); }).join(", ")));
  res.appendChild(el("button", "chip", "↶ " + t("skUndo"), function () { setDoc(JSON.parse(ed().wishes.pop())); Kit.sfx.pop(); res.textContent = ""; }));
  return true;
}

var PANEL = {
  // Type a wish and apply it right below, or tap a suggestion: that applies it at once. The AI's answer is applied as it
  // came, nothing mixed in. The flight game's one way in, "What do you want to fly?", is the part welt-ui.js.
  Wish: function (p) {
    if (ed().doc.k === "game") {   // the flight game's one way in lives in a part (welt-ui.js)
      var mine = ed(), hooks = { el: el, field: field, aiBlock: aiBlock, didLine: didLine, tab: tab, play: playGame, ed: A.ed,
        preview: function (st, fly) { ed().pv = !!st; ed().fly = st && fly || null; G.update(st || gameState()); } };
      window.Parts.use("welt", function () { if (ed() === mine && ed().tab === "Wish") window.WeltUI.panel(p, hooks); }).catch(function () {
        if (ed() !== mine || ed().tab !== "Wish") return;      // the part did not load (offline without a cache, SRI): the way without AI stays
        p.appendChild(el("p", "note aistate", t("welt_noPart")));
        p.appendChild(el("button", "chip", "🎚 " + t("welt_rules"), function () { Kit.sfx.tap(); tab("Rules"); }));
      });
      return;
    }
    var f = field(p, t("wishL"), "", 100, function () {}, true), box = el("div", "chips");
    var want = function () { return D.cleanInput(f.value, 100); };
    var go = aiBlock(p, {
      kind: "wish", label: t("wishGo"), noteLast: true, input: function () { var v = want(); return v ? W.request(ed().doc, v, ed().idea ? D.plainTitle(ideaText(ed().idea).t) : "") : null; },
      auto: function (o, ki, res) {
        var before = JSON.stringify(ed().doc), next = W.apply(ed().doc, o.changes || {}, PAIRS, seeded(want() + "|sk"));
        if (ki) markKi(next, ki);
        return didLine(res, before, next, ki ? (o.note || "") : t("aiNoAi"));
      }
    });
    p.appendChild(el("label", "lbl wishtips", t("wishOr")));
    t("wishTips_" + ed().doc.k).split("|").forEach(function (x) { box.appendChild(el("button", "chip", x, function () { Kit.sfx.tap(); f.value = x; go(); })); });
    p.appendChild(box);
    p.appendChild(el("p", "note", t("wishH_" + ed().doc.k) + " " + t("aiNote")));
  },
  // The dice: style, colours, stickers (and a card's line from its idea) rolled on the device. No AI, no network, no count.
  Dice: function (p) {
    var res = el("div", "chips");
    p.appendChild(el("button", "chip hot", "🎲 " + t("diceGo"), function () {
      Kit.sfx.pop();
      var d = ed().doc, key = d.seed != null ? d.seed : d.i || d.k, n = roll(key), seed = key + "|" + n;
      var before = JSON.stringify(d), lines = ed().idea && d.k === "card" ? ideaText(ed().idea).lines : null;
      res.textContent = ""; didLine(res, before, W.apply(d, W.dice(d, seed, PAIRS, lines), PAIRS, seeded(seed + "|sk")));
    }));
    p.appendChild(res);
    p.appendChild(el("p", "note", t("diceNote")));
  },
  // Advent door: only its number; 1-24 as plain buttons, no typing.
  Door: function (p) {
    p.appendChild(el("label", "lbl", t("doorPick")));
    chips(p, Array.from({ length: 24 }, function (x, i) { return { v: i + 1, l: String(i + 1) }; }), ed().doc.nr, function (v) { ed().doc.nr = v; }, "em");
    p.appendChild(el("p", "note", t("doorNote")));
  },
  Idea: function (p) {
    // the title field first (it is what "Fertig" waits for), the hint below it
    field(p, t("ideaT"), ed().doc.t, 40, function (v) { ed().doc.t = v; });
    field(p, t("ideaS"), ed().doc.s, 70, function (v) { ed().doc.s = v; });
    p.appendChild(el("p", "note", t("ownH")));
  },
  Text: function (p) {
    var d = ed().doc;
    if (d.k === "card") {
      var f = field(p, t("line"), d.x, 90, function (v) { d.x = v; }, true), L = ed().idea ? ideaText(ed().idea).lines : null;
      if (L) p.appendChild(el("button", "chip", "↻ " + t("nextLine"), function () { Kit.sfx.pop(); ed().line = (ed().line + 1) % L.length; d.x = L[ed().line]; f.value = d.x; changed(); }));
      textePart(p, "card", f);
      if (!d.nr) weatherBlock(p);
    } else if (d.k === "photo") {
      var top = field(p, t("top"), d.x, 28, function (v) { d.x = v; }), low = field(p, t("bottom"), d.y, 28, function (v) { d.y = v; });
      var what = field(p, t("aiDesc"), "", 100, function () {});
      aiBlock(p, { kind: "meme", label: t("aiMeme"), input: function () { var v = D.cleanInput(what.value, 100); return v ? { desc: v } : null; }, show: function (o) { return o.top + " / " + o.bottom; }, apply: function (o, ki) { d.x = D.cleanInput(o.top, 28); d.y = D.cleanInput(o.bottom, 28); top.value = d.x; low.value = d.y; markKi(d, ki); changed(); } });
    } else if (d.k === "sound") {
      field(p, t("titleL"), d.x, 28, function (v) { d.x = v; });
      if (d.ly) p.appendChild(el("button", "chip", "✕ " + t("lyOff"), function () { delete d.ly; changed(); tab("Text"); }));
    }
    else field(p, t("titleL"), d.g.title, 28, function (v) { d.g.title = v || "Duell"; byHand(); });
  },
  Style: function (p) {
    var d = ed().doc;
    chips(p, D.STYLES[d.k].map(function (s) { return { v: s, l: t("st_" + s) }; }), d.st, function (v) { d.st = v; });
  },
  Color: function (p) { colors(p, function () { return ed().doc.col; }, function (c) { ed().doc.col = c; if (ed().doc.k === "photo") ed().photo._id += ""; }); },
  Sticker: function (p) {
    var d = ed().doc, me = A.me(), own = D.byId(d.i), set = D.SETS[(own && own.set) || me.set], set = set.concat(set.indexOf(me.emoji) < 0 ? [me.emoji] : []);
    var box = el("div", "chips");
    set.forEach(function (e) {
      box.appendChild(el("button", "chip em", e, function () {
        if (d.sk.length >= D.MAX_STICKERS) { Kit.toast(t("skFull")); return; }
        Kit.sfx.pop(); var r = C.mulberry32(C.hash32(A.me().nick + d.sk.length + e + d.x));
        SK.step(function (l) { l.push({ e: e, x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.65, r: (r() - 0.5) * 0.7, z: 0.8 + r() * 0.7 }); ed().sel = l.length - 1; });
      }));
    });
    p.appendChild(box);
    if (!d.sk.length) return;
    p.appendChild(el("p", "note", t("skHint")));
    var mine = el("div", "chips");   // also the way to reach a sticker that is hard to tap, and the keyboard's way
    d.sk.forEach(function (s, i) {
      var b = el("button", "chip em" + (i === ed().sel ? " on" : ""), s.e, function () { Kit.sfx.tap(); SK.select(i); });
      b.setAttribute("aria-pressed", String(i === ed().sel)); mine.appendChild(b);
    });
    p.appendChild(mine);
    var row = el("div", "chips");
    [["−", function (s) { s.z = Math.max(0.5, s.z - 0.2); }, "a_skSmall"], ["+", function (s) { s.z = Math.min(2.5, s.z + 0.2); }, "a_skBig"], ["↻", function (s) { s.r = s.r > 2.9 ? -3 : s.r + 0.25; }, "a_skTurn"], ["✕", null, "skDelete"]].forEach(function (x) {
      var b = el("button", "chip em", x[0], function () {
        if (!d.sk[ed().sel]) return; Kit.sfx.tap();
        if (x[1]) SK.step(function (l) { x[1](l[ed().sel]); }); else SK.remove(ed().sel);
      });
      b.setAttribute("aria-label", t(x[2]));
      b.disabled = !d.sk[ed().sel]; row.appendChild(b);
    });
    p.appendChild(row);
  },
  Photo: function (p) {
    p.appendChild(el("button", "chip", "📷 " + t("pick"), function () { Kit.sfx.tap(); $("file").click(); }));
    p.appendChild(el("button", "chip", "🤖 " + t("noPhoto"), function () { Kit.sfx.pop(); ed().bots = (ed().bots || 0) + 1; ed().photo = R.botFace(D.botSeed(A.me().nick, ed().doc, ed().bots), ed().doc.col[1]); changed(); }));
    p.appendChild(el("p", "note", t("photoNote") + " " + t("noPick")));
    chips(p, D.STYLES.photo.map(function (s) { return { v: s, l: t("st_" + s) }; }), ed().doc.st, function (v) { ed().doc.st = v; });
  },
  // the grid first (the tool of the tab), the song below it
  Sound: function (p) { if (ed().doc.m === "beat") { beatPanel(p); textePart(p, "song"); } else voicePanel(p); },
  Rules: function (p) {
    var g = ed().doc.g, ranges = C.RANGES;
    ["gravity", "jump", "gap", "speed"].forEach(function (k) {
      var row = el("label", "slide"), r = el("input"), v = el("b", "", g.params[k]);
      row.appendChild(el("span", "", t(k))); r.type = "range"; r.min = ranges[k][0]; r.max = ranges[k][1]; r.value = g.params[k]; r.setAttribute("aria-label", t(k));
      r.addEventListener("input", function () { g.params[k] = Number(r.value); v.textContent = r.value; byHand(); changed(); });
      row.appendChild(r); row.appendChild(v); p.appendChild(row);
    });
    p.appendChild(el("button", "chip", "✨ " + t("wishL_game"), function () { Kit.sfx.tap(); tab("Wish"); }));   // the one way in, not a second one
  },
  Figure: function (p) {
    var g = ed().doc.g, me = A.me(), list = EMOJI.indexOf(me.emoji) < 0 ? [me.emoji].concat(EMOJI) : EMOJI;
    chips(p, list.map(function (e) { return { v: e, l: e }; }), g.emoji, function (v) { g.emoji = v; byHand(); }, "em");
  },
  // A world chosen here replaces a world built by a wish or the idea (its look), which would otherwise cover every theme.
  World: function (p) {
    var g = ed().doc.g;
    var b = chips(p, G.THEMES.map(function (n) { return { v: n, l: t("w_" + n) }; }), g.look || g.route ? null : g.theme, function (v) { g.theme = v; delete g.look; delete g.route; byHand(); });
    Array.from(b.children).forEach(function (c, i) { c.style.borderBottom = "8px solid " + G.themeColor(G.THEMES[i]); });
  }
};

function beatPanel(p) {
  // 4 steps a row (44 px on the smallest phone), 4 pages of one beat each; every step says its sound, its beat and its state.
  var rows = [["k", "🥁"], ["s", "👏"], ["h", "✨"], ["b", "🎹"]], grid = el("div", "grid"), pages = el("div", "chips");
  function fill() {
    grid.textContent = ""; pages.textContent = "";
    rows.forEach(function (r) {
      grid.appendChild(el("span", "", r[1]));
      for (var c = 0; c < 4; c++) (function (c) {
        var i = ed().page * 4 + c, on = ed().doc.p[r[0]][i] === "x", b = el("button", "step" + (c ? "" : " q") + (on ? " on" : ""), null, function () {
          var v = ed().doc.p[r[0]]; ed().doc.p[r[0]] = v.slice(0, i) + (v[i] === "x" ? "-" : "x") + v.slice(i + 1);
          on = !on; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); Kit.sfx.tap(); beatPeaks(); changed(); if (A.playing()) playBeat();
        });
        b.dataset.c = c; b.setAttribute("aria-label", t("bt_" + r[0]) + ", " + t("btN", { n: i + 1 })); b.setAttribute("aria-pressed", String(on)); grid.appendChild(b);
      })(c);
    });
    [0, 1, 2, 3].forEach(function (n) { var b = el("button", "chip" + (n === ed().page ? " on" : ""), n * 4 + 1 + "–" + (n * 4 + 4), function () { ed().page = n; fill(); }); b.setAttribute("aria-label", t("btN", { n: n * 4 + 1 + "–" + (n * 4 + 4) })); b.setAttribute("aria-pressed", String(n === ed().page)); pages.appendChild(b); });
  }
  // the grid first (the tab's tool), page choice and listening right below it (E1.5)
  var bar = el("div", "chips");
  fill(); p.appendChild(grid); p.appendChild(pages); p.appendChild(bar);
  var row = el("label", "slide"), r = el("input"), v = el("b", "", ed().doc.bpm);
  row.appendChild(el("span", "", t("bpm"))); r.type = "range"; r.min = 70; r.max = 170; r.value = ed().doc.bpm; r.setAttribute("aria-label", t("bpm"));
  r.addEventListener("input", function () { ed().doc.bpm = Number(r.value); v.textContent = r.value; beatPeaks(); changed(); });
  r.addEventListener("change", function () { if (A.playing()) playBeat(); });
  row.appendChild(r); row.appendChild(v); p.appendChild(row);
  var pl = el("button", "chip", A.playing() ? "■ " + t("stop") : "▶ " + t("listen"), function () { if (A.playing()) { stopSound(); pl.textContent = "▶ " + t("listen"); } else { playBeat(); pl.textContent = "■ " + t("stop"); } });
  bar.appendChild(pl);
}

// Recording, the effects and sending the voice as a file: the part klang (src/klang.js, src/klang-ui.js).
function voicePanel(p) { window.Parts.use("klang", function () { if (ed() && p.isConnected) window.Klang.panel(p); }).catch(function () {}); }

Object.keys(TABS).forEach(function (k) { if (!A.TABS[k]) A.TABS[k] = TABS[k]; });
Object.keys(PANEL).forEach(function (k) { if (!A.PANEL[k]) A.PANEL[k] = PANEL[k]; });
root.Blasen = { open: open, tab: tab, PANEL: PANEL, relabel: function () { Array.from($("tabs").children).forEach(function (b) { b.textContent = tabText(b.dataset.k); }); } };
})(window);
