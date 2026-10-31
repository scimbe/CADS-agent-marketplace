/* My Daily Idea: the free wish. The server returns validated changes; this file applies them to a creation, says what
   changed and keeps the state before, so every wish can be undone. Without a server it uses plain local rules. */
(function (root) {
  "use strict";
  var C = root.DuellCore || (typeof require === "function" ? require("./core.js") : null);
  var D = root.Daily || (typeof require === "function" ? require("./daily.js") : null);

  // What goes to the server about the creation: its type and its texts, nothing else.
  function request(doc, wish, idea) {
    var now = doc.k === "game" ? { title: doc.g.title } : { x: doc.x, y: doc.y, st: doc.st, bpm: doc.bpm };
    return { type: doc.k, wish: wish, idea: idea || doc.t || "", now: now };
  }
  // doc + changes -> a new sanitized doc; only keys of its type can have any effect.
  function apply(doc, ch, pairs, rand) {
    var d = JSON.parse(JSON.stringify(doc));
    if (typeof ch.palette === "number" && pairs[ch.palette]) d.col = pairs[ch.palette].slice();
    if (d.k === "game") {
      ["gravity", "jump", "gap", "speed"].forEach(function (k) { if (ch[k] !== undefined) d.g.params[k] = ch[k]; });
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
  // No server, no model: still a visible answer from fixed rules. Costs nothing.
  function local(doc, wish, lang, pick) {
    if (doc.k === "game") {
      var s = C.localConfig(wish, lang), P = s.params || {};
      return { gravity: P.gravity, jump: P.jump, gap: P.gap, speed: P.speed, theme: s.theme, emoji: s.emoji };
    }
    if (doc.k === "sound") { var slow = /langsam|ruhig|slow|chill/i.test(wish); return { bpm: Math.max(70, Math.min(170, doc.bpm + (slow ? -20 : 20))) }; }
    var list = D.STYLES[doc.k], st = list[(list.indexOf(doc.st) + 1) % list.length];
    return { st: st, palette: pick(8) };
  }
  var api = { request: request, apply: apply, local: local };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Wish = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
