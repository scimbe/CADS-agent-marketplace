/* My Daily Idea: the wish and the dice. A wish (AI) is only offered where the model does real work: the flight game's world
   from one sentence, a beat, a duel, a channel. The server returns validated changes; this file applies them 1:1 to a
   creation and keeps the state before, so every wish can be undone. Colours, stickers and style are never worth an AI
   call: the dice rolls them on the device from a seed, the same seed always gives the same look. */
(function (root) {
  "use strict";
  var C = root.DuellCore || (typeof require === "function" ? require("./core.js") : null);
  var D = root.Daily || (typeof require === "function" ? require("./daily.js") : null);

  // The kinds with an AI wish. A secret channel's riddles and answers never leave the device, only its look can change.
  var KINDS = ["game", "sound", "duel", "quest"];
  // The kinds with the local dice (no AI, no network): every sheet that has a look to roll. card covers the warm card and the Advent door.
  var DICE = ["card", "photo", "sound", "duel", "quest", "turn"];
  // What goes to the server about the creation: its type and its texts, nothing else.
  function request(doc, wish, idea) {
    var now = doc.k === "game" ? { title: doc.g.title } : doc.k === "turn" ? { w: doc.w } : { x: doc.x, y: doc.y, st: doc.st, bpm: doc.bpm };
    if (doc.t) now.t = doc.t;
    return { type: doc.k, wish: wish, idea: idea || doc.t || "", now: now };
  }
  // doc + changes -> a new sanitized doc; only keys of its type can have any effect. Every sheet also takes a title and
  // a line below it (t, s), the one thing a wish changes beyond the editor's tabs.
  function apply(doc, ch, pairs, rand) {
    var d = JSON.parse(JSON.stringify(doc));
    if (typeof ch.palette === "number" && pairs[ch.palette]) d.col = pairs[ch.palette].slice();   // exactly the pair asked for
    if (Array.isArray(ch.colors)) d.col = ch.colors.slice();
    if (ch.t) d.t = ch.t; if (ch.s) d.s = ch.s;
    if (d.k === "turn") {
      if (ch.w) d.w = ch.w; if (ch.f) d.f = ch.f;
    } else if (d.k === "duel" || d.k === "quest") {
      if (d.k === "quest") { if (ch.e) d.e = ch.e; }
      else {
        if (ch.ae) d.a.e = ch.ae; if (ch.be) d.b.e = ch.be; if (ch.bn) d.b.n = ch.bn;
        if (ch.w && d.w) d.w = ch.w; if (ch.theme && d.g) d.g.theme = ch.theme;
      }
    } else if (d.k === "game") {
      ["gravity", "jump", "gap", "speed"].forEach(function (k) { if (ch[k] !== undefined) d.g.params[k] = ch[k]; });
      if (ch.look) d.g.look = Object.assign({}, d.g.look, ch.look);
      if (ch.theme) d.g.theme = ch.theme; if (ch.emoji) d.g.emoji = ch.emoji; if (ch.title) d.g.title = ch.title;
    } else {
      ["x", "y", "st", "bpm", "fx"].forEach(function (k) { if (ch[k] !== undefined && d[k] !== undefined && !(k === "st" && d.st === "herz")) d[k] = ch[k]; });   // a feel-good card keeps its warm look
      if (d.p) ["k", "s", "h", "b"].forEach(function (k) { if (ch[k]) d.p[k] = ch[k]; });
      // A wish sets the stickers anew, so a second wish does not pile up on the first; undo brings the old ones back.
      if (d.sk && ch.stickers) d.sk = ch.stickers.slice(0, D.MAX_STICKERS).map(function (e) {
        return { e: e, x: 0.15 + rand() * 0.7, y: 0.15 + rand() * 0.65, r: (rand() - 0.5) * 0.7, z: 0.8 + rand() * 0.7 };
      });
    }
    return D.sanitizeDoc(d);
  }
  // Fixed worlds for the case without a model, so a wish still changes sky, figure, obstacles and ground.
  var LOOKS = [
    [/welt|all\b|space|rakete|alien|stern/i, "🚀", { a: "#060a2a", b: "#2a1a5e", d: "stars", e: ["🪐", "🌟"], p: "#9aa7c7", q: "#4d5878", f: "block", g: "#1a1a33", h: "#7a6cff", m: "✨" }],
    [/wasser|meer|ocean|sea|fisch|fish/i, "🐠", { a: "#03466e", b: "#1fa8b8", d: "bubbles", e: ["🐟", "🪼"], p: "#ff7f6b", q: "#b74a3a", f: "round", g: "#e6d29a", h: "#b89c5e", m: "🫧" }],
    [/grusel|spook|halloween|horror|nacht|night|geist/i, "👻", { a: "#120a1f", b: "#3d1a4f", d: "stars", e: ["🦇", "🌙"], p: "#ff7a1a", q: "#7a2f00", o: "🎃", f: "emoji", g: "#1b1020", h: "#6b2fa0", m: "🦇" }],
    [/s(ü|ue)ß|suess|candy|sweet|keks|kuchen|bonbon/i, "🍩", { a: "#ff9ad5", b: "#ffe3f2", d: "clouds", e: ["🍬", "🍭"], p: "#7a5cff", q: "#4a2fb0", o: "🍫", f: "emoji", g: "#ffc0e6", h: "#e59ccf", m: "🍬" }],
    [/winter|schnee|snow|eis\b|ice/i, "⛄", { a: "#bfe3ff", b: "#f4fbff", d: "snow", e: ["❄️"], p: "#3f7fb5", q: "#1f4f7a", f: "block", g: "#ffffff", h: "#a8cfe8", m: "❄️" }],
    [/wald|forest|natur|baum|dschungel|jungle/i, "🦉", { a: "#2f7a4a", b: "#c4e6a8", d: "clouds", e: ["🍃", "🦋"], p: "#6b4226", q: "#3a2212", o: "🌲", f: "emoji", g: "#3f6b2a", h: "#2a4a1c", m: "🍃" }]
  ];
  function localLook(wish, pick) {
    var hit = LOOKS.filter(function (x) { return x[0].test(wish); })[0] || LOOKS[pick(LOOKS.length)];
    return { fig: hit[1], look: hit[2] };
  }
  // Without the model the flight game still understands a sentence: fixed rules for physics (core.js) and keywords for
  // the world. Shown as "without AI", never as an AI answer. Other kinds have no such rules: there the dice is the way without AI.
  function local(doc, wish, lang, pick) {
    if (doc.k !== "game") return null;
    var s = C.localConfig(wish, lang), P = s.params || {}, L = localLook(wish, pick);
    return { gravity: P.gravity, jump: P.jump, gap: P.gap, speed: P.speed, theme: s.theme, emoji: L.fig || s.emoji, look: L.look };
  }
  // The dice: seed -> changes for the look of a sheet, the same seed always the same roll. pairs: the app's colour pairs;
  // lines: the idea's own lines, so a card that still shows one of them rolls another (the title variant).
  var XMAS_PAIRS = [["#0f5132", "#ffd400"], ["#b3001b", "#ffffff"], ["#1b3a6b", "#ffd400"], ["#ffffff", "#b3001b"]];
  var TURN_F = ["cookie", "star", "heart", "bolt", "ring", "drop"];
  function dice(doc, seed, pairs, lines) {
    var r = C.mulberry32(C.hash32("dice|" + seed)), pick = function (n) { return Math.floor(r() * n); };
    var other = function (list, now) { var i = pick(list.length); return JSON.stringify(list[i]) === JSON.stringify(now) ? list[(i + 1) % list.length] : list[i]; };
    var three = function (set) { var a = set.slice(), out = []; while (a.length && out.length < 3) out.push(a.splice(pick(a.length), 1)[0]); return out; };
    var door = doc.k === "card" && doc.nr !== undefined, herz = doc.st === "herz";
    var ch = { colors: other(door ? XMAS_PAIRS : pairs, doc.col).slice() };
    if (doc.k === "card" || doc.k === "photo") {
      var names = Object.keys(D.SETS).filter(function (n) { return n !== "advent"; });
      ch.stickers = three(D.SETS[door ? "advent" : herz ? "herz" : names[pick(names.length)]]);
      // a feel-good card keeps its warm look, a door its Advent look
      if (!door && !herz) ch.st = other(D.STYLES[doc.k].filter(function (x) { return x !== "herz" && x !== "advent"; }), doc.st);
      if (doc.k === "card" && Array.isArray(lines) && lines.length > 1 && lines.indexOf(doc.x) >= 0) ch.x = other(lines, doc.x);
    } else if (doc.k === "sound") ch.fx = other(D.FX, doc.fx);
    else if (doc.k === "turn") ch.f = other(TURN_F, doc.f);
    else if (doc.k === "duel") { ch.ae = D.SETS.weltall[pick(D.SETS.weltall.length)]; ch.be = D.SETS.chaos[pick(D.SETS.chaos.length)]; }
    else if (doc.k === "quest") ch.e = other(D.SETS.chaos, doc.e);
    return ch;
  }
  var api = { KINDS: KINDS, DICE: DICE, request: request, apply: apply, local: local, dice: dice };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Wish = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
