/* My Daily Idea: "Mach's spielbar". A card or photo becomes the Duell game. What travels in a link is plain game data:
   colours, emoji, title, one line. The picture and the photo are only ever drawn on this device. */
(function (root) {
  "use strict";
  var C = root.DuellCore || (typeof require === "function" ? require("./core.js") : null);
  var PACE = { neon: { gravity: 2000, speed: 190, gap: 125 }, glitch: { gravity: 2100, speed: 200, gap: 120 }, stempel: { gravity: 1700, speed: 140, gap: 150 }, zettel: { gravity: 1500, speed: 120, gap: 165 }, poster: { gravity: 1800, speed: 150, gap: 145 }, meme: { gravity: 1900, speed: 170, gap: 135 } };
  function shortTitle(s, fallback) {
    var out = "";
    String(s || "").split(/\s+/).some(function (w) { if (Array.from((out + " " + w).trim()).length > 26) return true; out = (out + " " + w).trim(); return false; });
    return C.sanitizeTitle(out, fallback);
  }
  // doc: a card or photo creation, me: my style -> a game state whose every field is safe to put in a link.
  function fromDoc(doc, me) {
    var line = doc.k === "photo" ? [doc.x, doc.y].filter(Boolean).join(" ") : doc.x, pace = PACE[doc.st] || {};
    return C.sanitizeState({
      v: 1, seed: C.hash32("spiel:" + line + doc.col.join("")), theme: "day",
      params: { gravity: pace.gravity, jump: 430, gap: pace.gap, speed: pace.speed },
      title: shortTitle(line, "Mein Spiel"), emoji: doc.sk && doc.sk.length ? doc.sk[0].e : me.emoji,
      skin: { c: doc.col, l: line }
    });
  }
  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function mix(a, b, k) { var x = rgb(a), y = rgb(b); return "#" + x.map(function (v, i) { return (Math.round(v + (y[i] - v) * k) + 256).toString(16).slice(1); }).join(""); }
  function far(a, b) { var x = rgb(a), y = rgb(b); return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) > 120; }
  // Colours of the game's theme table from the two colours of the card; obstacles always stand out from the sky.
  function skinTheme(skin) {
    var a = skin.c[0], b = skin.c[1], dark = rgb(a).reduce(function (s, v) { return s + v; }, 0) < 300, pipe = far(a, b) ? b : (dark ? "#ffffff" : "#111111");
    return { skyTop: a, skyBottom: mix(a, "#ffffff", 0.45), pipe: pipe, pipeEdge: mix(pipe, "#000000", 0.4), ground: mix(pipe, "#000000", 0.55), groundEdge: mix(pipe, "#000000", 0.3), accent: mix(pipe, "#ffffff", 0.5) };
  }
  // Pre-rendered once, so a frame only blits small canvases.
  function backdrop(render, doc, me) {
    var src = document.createElement("canvas"), out = document.createElement("canvas"), W = 432, H = 684; src.width = 540; src.height = 675; out.width = W; out.height = H;
    render(src, Object.assign({}, doc, { x: " ", y: " ", sk: [] }), me);
    var k = Math.max(W / src.width, H / src.height), w = W / k, h = H / k;
    out.getContext("2d").drawImage(src, (src.width - w) / 2, (src.height - h) / 2, w, h, 0, 0, W, H);
    return out;
  }
  function figure(photo) {
    var c = document.createElement("canvas"), n = 96, x = c.getContext("2d"), side = Math.min(photo.width, photo.height); c.width = c.height = n;
    x.beginPath(); x.arc(n / 2, n / 2, n / 2 - 3, 0, 6.3); x.closePath(); x.save(); x.clip();
    x.drawImage(photo, (photo.width - side) / 2, (photo.height - side) / 2, side, side, 0, 0, n, n); x.restore();
    x.lineWidth = 5; x.strokeStyle = "#111"; x.beginPath(); x.arc(n / 2, n / 2, n / 2 - 3, 0, 6.3); x.stroke();
    return c;
  }
  var api = { fromDoc: fromDoc, skinTheme: skinTheme, backdrop: backdrop, figure: figure, shortTitle: shortTitle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Playable = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
