/* My Daily Idea, "Robot": the free part of a card the deck card became (wrapper lib/duell-frei.mjs, the same rules and the
   same test vectors: test/fixtures/frei-vectors.json). Arcade duels and tools never travel as a sheet link, so their doc has
   its own strict shape here; every other kind is the app's own sanitizeDoc (a table keeps its house rules there, daily.js).
   Only values from fixed lists: the model never sets a number or a word the engine does not know. Pure, no DOM. */
(function (root) {
  "use strict";
  var PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
  var ARCADE_GAMES = ["puck", "ziegel", "volley", "panzer", "kick", "flipper", "snow", "elfer", "stock", "murmel"], ARCADE_WIN = [1, 9];
  var ARCADE_EMOJI = ["🏒", "🧱", "🏐", "💥", "⚽", "🎯", "❄️", "🥅", "🥌", "🔮", "🚀", "🛸", "🐸", "🦆", "🐙", "🦖", "🐉", "🦄", "🐝", "🍕", "🍩", "🎃", "👻", "⭐", "🌈", "🔥", "⚡", "🌙", "🎄", "⛄", "🎁", "🐱", "🐶", "🐧", "🦉", "🐌"];
  var TABLE_RULES = { skat: ["ramsch", "kontra"], doko: ["dulle", "nosp"], bauernskat: ["null", "kontra"] };
  var TOOL_IDS = { notizzettel: "notiz", "datei-rueber": "datei" }, TOOL_LOOKS = ["zettel", "karo", "neon", "kraft"];
  var MISSING = ["regeln", "tempo", "figur", "ablauf", "ton", "bild", "text", "spieler", "anderes"];
  var HEX = /^#[0-9a-f]{6}$/, KI = /^[A-Za-z0-9._~:-]{1,400}$/;

  // a text as both sides keep it: no control or format characters, no < >, one space, at most max code points
  function line(v, max) {
    if (typeof v !== "string") return "";
    return Array.from(v.normalize("NFKC").replace(/[\p{Cc}\p{Cf}<>]/gu, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
  }
  function cols(c) { return Array.isArray(c) && c.length === 2 && c.every(function (x) { return typeof x === "string" && HEX.test(x.toLowerCase()); }) ? c.map(function (x) { return x.toLowerCase(); }) : PAIRS[0].slice(); }
  function int(v, r) { return typeof v === "number" && v % 1 === 0 && v >= r[0] && v <= r[1] ? v : undefined; }
  function ki(o) {
    if (!o || typeof o !== "object" || o.k !== "karte") return undefined;
    var out = { k: "karte" };
    ["s", "h", "o"].forEach(function (f) { if (typeof o[f] === "string" && KI.test(o[f])) out[f] = o[f]; });
    return out.s ? out : undefined;
  }
  function tableFa(g, fa) {
    var ok = TABLE_RULES[g] || [], r = fa && Array.isArray(fa.r) ? ok.filter(function (k) { return fa.r.indexOf(k) >= 0; }) : [];
    return r.length ? { r: r } : {};
  }
  // The arcade's free part as both phones play it: what the live "go" message carries (live-ui.js), checked again there.
  function arcadeFa(f) {
    var fa = {}; f = f && typeof f === "object" ? f : {};
    if (ARCADE_EMOJI.indexOf(f.e) >= 0) fa.e = f.e;
    var w = int(f.w, ARCADE_WIN); if (w !== undefined) fa.w = w;
    return fa;
  }
  /** A doc of any kind as the free card keeps it, or null (wrapper lib/duell-frei.mjs freeDoc). */
  function sanitize(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    if (o.k === "arcade" || o.k === "tool") {
      var id = typeof o.i === "string" ? o.i : "", d = { k: o.k, i: id, col: cols(o.col), by: [] }, f = o.fa && typeof o.fa === "object" ? o.fa : {}, fa = {};
      if (o.k === "arcade") { if (ARCADE_GAMES.indexOf(o.a) < 0 || !/^arcade-[a-z]+$/.test(id)) return null; d.a = o.a; }
      else if (!Object.prototype.hasOwnProperty.call(TOOL_IDS, id)) return null;
      var t = line(o.t, 34), s = line(o.s, 60);
      if (t) d.t = t; if (s) d.s = s;
      if (o.k === "arcade") fa = arcadeFa(f);
      else { if (TOOL_LOOKS.indexOf(f.v) >= 0) fa.v = f.v; var x = line(f.x, 120); if (x) fa.x = x; }
      if (Object.keys(fa).length) d.fa = fa;
      var k = ki(o.ki); if (k) d.ki = k;
      return d;
    }
    var D = root.Daily, c = D && D.sanitizeDoc(o);
    if (!c) return null;
    if (c.k === "table") { var tf = tableFa(c.g, o.fa); if (tf.r) c.fa = tf; else delete c.fa; }
    return c;
  }
  /** The arcade look a free card asks for: META of arcade-ui.js with its figure and colours. */
  function arcadeLook(meta, doc) {
    var m = {}; for (var k in meta) m[k] = meta[k];
    if (!doc) return m;
    var fa = arcadeFa(doc.fa);
    if (fa.e) m.e = fa.e;
    if (Array.isArray(doc.col)) { var c = cols(doc.col); m.a = c[0]; m.b = c[1]; }
    return m;
  }
  var api = { sanitize: sanitize, arcadeFa: arcadeFa, arcadeLook: arcadeLook, tableFa: tableFa, line: line, PAIRS: PAIRS, ARCADE_GAMES: ARCADE_GAMES, ARCADE_WIN: ARCADE_WIN, ARCADE_EMOJI: ARCADE_EMOJI, TABLE_RULES: TABLE_RULES, TOOL_IDS: TOOL_IDS, TOOL_LOOKS: TOOL_LOOKS, MISSING: MISSING };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Frei = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
