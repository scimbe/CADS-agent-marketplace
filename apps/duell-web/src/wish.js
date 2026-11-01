/* My Daily Idea: the free wish. The server returns validated changes; this file applies them to a creation, says what
   changed and keeps the state before, so every wish can be undone. Without a server it uses plain local rules. */
(function (root) {
  "use strict";
  var C = root.DuellCore || (typeof require === "function" ? require("./core.js") : null);
  var D = root.Daily || (typeof require === "function" ? require("./daily.js") : null);

  // The kinds the server has a schema for. Duels are tuned with sliders; a secret channel's text never leaves the device.
  var KINDS = ["game", "photo", "sound", "card"];
  // What goes to the server about the creation: its type and its texts, nothing else.
  function request(doc, wish, idea) {
    var now = doc.k === "game" ? { title: doc.g.title } : { x: doc.x, y: doc.y, st: doc.st, bpm: doc.bpm };
    return { type: doc.k, wish: wish, idea: idea || doc.t || "", now: now };
  }
  // doc + changes -> a new sanitized doc; only keys of its type can have any effect.
  function apply(doc, ch, pairs, rand) {
    var d = JSON.parse(JSON.stringify(doc));
    if (typeof ch.palette === "number" && pairs[ch.palette]) d.col = pairs[ch.palette].slice();
    if (Array.isArray(ch.colors)) d.col = ch.colors.slice();
    if (d.k === "game") {
      ["gravity", "jump", "gap", "speed"].forEach(function (k) { if (ch[k] !== undefined) d.g.params[k] = ch[k]; });
      if (ch.look) d.g.look = Object.assign({}, d.g.look, ch.look);
      if (ch.theme) d.g.theme = ch.theme; if (ch.emoji) d.g.emoji = ch.emoji; if (ch.title) d.g.title = ch.title;
    } else {
      ["x", "y", "st", "bpm", "fx"].forEach(function (k) { if (ch[k] !== undefined && d[k] !== undefined) d[k] = ch[k]; });
      if (d.p) ["k", "s", "h", "b"].forEach(function (k) { if (ch[k]) d.p[k] = ch[k]; });
      if (d.sk && ch.stickers) ch.stickers.forEach(function (e) {
        if (d.sk.length < D.MAX_STICKERS) d.sk.push({ e: e, x: 0.15 + rand() * 0.7, y: 0.15 + rand() * 0.65, r: (rand() - 0.5) * 0.7, z: 0.8 + rand() * 0.7 });
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
  // No server, no model: still a visible answer from fixed rules. Costs nothing.
  function local(doc, wish, lang, pick) {
    if (doc.k === "game") {
      var s = C.localConfig(wish, lang), P = s.params || {}, L = localLook(wish, pick);
      return { gravity: P.gravity, jump: P.jump, gap: P.gap, speed: P.speed, theme: s.theme, emoji: L.fig || s.emoji, look: L.look };
    }
    if (doc.k === "sound") { var slow = /langsam|ruhig|slow|chill/i.test(wish); return { bpm: Math.max(70, Math.min(170, doc.bpm + (slow ? -20 : 20))) }; }
    var list = D.STYLES[doc.k], st = list[(list.indexOf(doc.st) + 1) % list.length];
    return { st: st, palette: pick(8) };
  }
  var api = { KINDS: KINDS, request: request, apply: apply, local: local };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Wish = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
