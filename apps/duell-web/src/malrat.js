/* Mal & Rat (zug-malrat): one person draws a word, the others watch the drawing line by line and guess it; whoever
   guessed it draws back. Part "malen" (scripts/build.js); logic and WebCrypto, no DOM. The rule joins the turn table
   (Turns.GAMES) like feier.js, its screen is malrat-ui.js.
   A move is the picture, nothing else:  [check, hint, language, lines, seconds, round]
     check    PBKDF2-SHA-256 over the folded word (Quest.fold), salt "malrat|<seed>|<round>" from the doc, 30000 rounds as
              in Quest; 64 bits as 11 base64url characters. The word itself never stands in the link.
     hint     first letter and length, like Quest's hint of a riddle ("K5")
     language 0 German, 1 English: the language the word was chosen in (the guesser types in that one)
     lines    base64url, "." between two lines; each line one character for colour and width (colour * 3 + width), then
              its points, two characters each (x, y on a 64 x 64 grid), simplified (Douglas-Peucker) and rounded first
     seconds  how fast the last picture was guessed (0: not guessed, or the first picture)
     round    1 for the first picture, one more for every picture drawn back (the salt changes with it)
   snap: the link holds only the latest picture. The words on offer come from the doc's seed (the day's seed, daily) and
   the round, so everybody sees the same three; a word of one's own passes the word filter (Daily.cleanInput). */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("./turns.js") : root.Turns, C = node ? require("./core.js") : root.DuellCore;
  var Q = node ? require("./quest.js") : root.Quest, D = node ? require("./daily.js") : root.Daily;
  var DATA = node ? require("./malrat.json") : root.MalratData;
  var ITER = 30000, GRID = 64, MAXW = 16, MAX_LINES = 80, MAX_CHARS = 900, MAX_SECS = 3600, MAX_ROUND = 999;
  var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  // Colours and widths of the pens; widths as a share of the picture's side.
  var COLORS = ["#1a1a1a", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa", "#6d4c41"], WIDTHS = [0.014, 0.032, 0.07];
  // Douglas-Peucker tolerances in grid cells, finest first: a picture gets the finest one that still fits into the link.
  var EPS = [0.45, 0.8, 1.3, 2];
  var LINES = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/, CHECK = /^[A-Za-z0-9_-]{11}$/, HINT = /^(\p{L})(\d{1,2})$/u;
  var CATS = Object.keys(DATA.words);

  Object.keys(DATA.text).forEach(function (l) { Object.assign(Tn.T(l), DATA.text[l]); });
  function T(lang) { return Tn.T(lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function say(lang, k, n, o) { return fmt(C.form(T(lang), k, n, lang), Object.assign({ n: n }, o || {})); }
  function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
  function rnd(tag) { return C.mulberry32(C.hash32("malrat|" + tag)); }

  // ---------- words ----------
  // Every word once: { de, en, cat, lvl } (levels 0 easy, 1 medium, 2 hard).
  var ALL = [];
  CATS.forEach(function (c) { DATA.words[c].forEach(function (list, lvl) { list.forEach(function (p) { var x = p.split("|"); ALL.push({ de: x[0], en: x[1], cat: c, lvl: lvl }); }); }); });
  function langOf(i) { return i ? "en" : "de"; }
  // Three words to draw, one per level: the same on every phone for this seed and round.
  function suggest(seed, round, lang) {
    return [0, 1, 2].map(function (lvl) {
      var l = ALL.filter(function (e) { return e.lvl === lvl; }), e = l[Math.floor(rnd(seed + "|" + round + "|" + lvl)() * l.length)];
      return { w: e[lang] || e.de, cat: e.cat, lvl: lvl };
    });
  }
  // A word of one's own: one word, letters only, through the word filter; "" when it may not be drawn.
  function own(s) {
    var w = String(s == null ? "" : s).trim(), c = D.cleanInput(w, MAXW);
    return c && c === w && /^\p{L}+$/u.test(c) && letters(c).length >= 2 && Q.fold(c).length >= 2 ? c : "";
  }
  // A guess as it is compared: through the same filter; "" when the filter takes it out.
  function guess(s) { return D.cleanInput(s, 24); }
  function upper(ch) { var u = ch.toUpperCase(); return Array.from(u).length === 1 ? u : ch; }
  function letters(w) { return Array.from(String(w).trim()).map(upper); }
  function hintOf(w) { var a = letters(w); return a.length ? a[0] + a.length : ""; }
  function hintParts(h) { var m = HINT.exec(String(h)); return m ? { first: m[1], n: +m[2] } : null; }

  // ---------- the check value ----------
  function subtle() { var c = root.crypto; return c && c.subtle ? c.subtle : null; }
  function b64(bytes) { var s = ""; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  async function check(word, seed, round) {
    var raw = await subtle().importKey("raw", new TextEncoder().encode(Q.fold(word)), "PBKDF2", false, ["deriveBits"]);
    var bits = await subtle().deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode("malrat|" + seed + "|" + round), iterations: ITER, hash: "SHA-256" }, raw, 64);
    return b64(new Uint8Array(bits));
  }
  // Is this the word of the move? Only the check value decides.
  async function right(word, mv, seed) { var g = guess(word); return !!g && Q.fold(g).length >= 1 && (await check(g, seed, mv[5])) === mv[0]; }
  // The word behind a move, if it is one from the list: only words with the same hint are tried (one to three).
  async function find(mv, seed) {
    var h = hintParts(mv[1]), lang = langOf(mv[2]); if (!h) return null;
    var maybe = ALL.filter(function (e) { return hintOf(e[lang]) === mv[1]; });
    for (var i = 0; i < maybe.length; i++) if ((await check(maybe[i][lang], seed, mv[5])) === mv[0]) return { w: maybe[i][lang], cat: maybe[i].cat, lvl: maybe[i].lvl };
    return null;
  }

  // ---------- lines: simplify, round, pack ----------
  function off(p, a, b) {   // distance of p from the segment a-b
    var dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t));
    var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
    return Math.sqrt(x * x + y * y);
  }
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var keep = new Uint8Array(pts.length), todo = [[0, pts.length - 1]];
    keep[0] = keep[pts.length - 1] = 1;
    while (todo.length) {
      var r = todo.pop(), far = -1, at = -1;
      for (var i = r[0] + 1; i < r[1]; i++) { var d = off(pts[i], pts[r[0]], pts[r[1]]); if (d > far) { far = d; at = i; } }
      if (far > eps) { keep[at] = 1; todo.push([r[0], at], [at, r[1]]); }
    }
    return pts.filter(function (p, i) { return keep[i]; });
  }
  function cell(v) { return Math.max(0, Math.min(GRID - 1, Math.round(v * (GRID - 1)))); }
  // lines: [{ c: colour, w: width, p: [[x, y], ...] with x, y from 0 to 1 }] -> the string for the link
  function encode(lines, eps) {
    return lines.map(function (l) {
      var g = simplify(l.p.map(function (p) { return [p[0] * (GRID - 1), p[1] * (GRID - 1)]; }), eps), out = ABC[l.c * 3 + l.w], last = "";
      g.forEach(function (p) { var s = ABC[cell(p[0] / (GRID - 1))] + ABC[cell(p[1] / (GRID - 1))]; if (s !== last) out += s; last = s; });
      return out;
    }).join(".");
  }
  // The string from a link -> [{ c, w, p: [[x, y], ...] on the grid }], or null when it is no picture the screen could make.
  function decode(s) {
    if (typeof s !== "string" || !s || s.length > MAX_CHARS || !LINES.test(s)) return null;
    var parts = s.split("."), out = [];
    if (parts.length > MAX_LINES) return null;
    for (var i = 0; i < parts.length; i++) {
      var x = parts[i], h = ABC.indexOf(x[0]);
      if (x.length < 3 || x.length % 2 !== 1 || h >= COLORS.length * WIDTHS.length) return null;
      var p = [];
      for (var k = 1; k < x.length; k += 2) p.push([ABC.indexOf(x[k]), ABC.indexOf(x[k + 1])]);
      out.push({ c: Math.floor(h / 3), w: h % 3, p: p });
    }
    return out;
  }
  // The finest packing for which fits(string) holds; null when even the coarsest is too long.
  function pack(lines, fits) {
    for (var i = 0; i < EPS.length; i++) { var s = encode(lines, EPS[i]); if (fits(s)) return { s: s, eps: EPS[i] }; }
    return null;
  }
  function used(lines) { var u = []; lines.forEach(function (l) { if (u.indexOf(l.c) < 0) u.push(l.c); }); return u; }

  // ---------- the move and the link ----------
  function move(chk, word, lang, s, secs, round) { return [chk, hintOf(word), lang === "en" ? 1 : 0, s, secs, round]; }
  function round(m) { return m.length ? m[m.length - 1][0][5] + 1 : 1; }
  // A link can be built by hand: only what the screen could have sent.
  function ok(v, doc, m) {
    var h = Array.isArray(v) && v.length === 6 && hintParts(v[1]);
    if (!h || typeof v[0] !== "string" || !CHECK.test(v[0]) || !intIn(h.n, 2, MAXW) || !intIn(v[2], 0, 1) || !decode(v[3]) || !intIn(v[4], 0, MAX_SECS)) return false;
    return m && m.length ? v[5] === round(m) && v[5] <= MAX_ROUND : intIn(v[5], 1, MAX_ROUND);
  }
  // Characters after #c= for the doc with this move (without the trail, which Daily.docUrl drops first when it is long).
  function size(doc, v) {
    var n = Tn.play(doc, [v], Tn.today()); if (!n) return Infinity;
    var d = D.sanitizeDoc(Object.assign({}, n, { by: [] }));
    return Math.ceil(new TextEncoder().encode(JSON.stringify({ v: 1, d: d })).length * 4 / 3);
  }
  // Does this picture, with this word, fit into the link of doc? (the check value has a fixed length, a stand-in will do)
  function fits(doc, word, lang, s) { return size(doc, move("AAAAAAAAAAA", word, lang, s, MAX_SECS, round(Tn.moves(doc)))) <= C.MAX_FRAGMENT; }
  // The order in which the letters after the first are shown as hints, and the shuffled letters to tap: from the seed.
  function order(n, seed, r) { var a = [], g = rnd(seed + "|" + r + "|tipp"), i, j, t; for (i = 1; i < n; i++) a.push(i); for (i = a.length - 1; i > 0; i--) { j = Math.floor(g() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function bank(word, seed, r) { var l = letters(word), o = order(l.length + 1, seed, r + "|bank"); return o.map(function (i) { return l[i - 1]; }); }

  // ---------- the rule ----------
  var prompt = { w: "malrat", l: "mr_l_draw", live: true, check: ok, title: function (doc, lang) { return T(lang)[Tn.state(doc).turn ? "mr_l_guess" : "mr_l_draw"]; } };
  var game = {
    snap: true, daily: true, turns: [[prompt], [prompt]], part: "malen",
    wsw: { link: ["bild"], tage: 0, plus: function (lang) { return T(lang).mr_wsw; } }, notes: ["mr_n1"],
    words: { you_start: "mr_you", go_first: "mr_go_first", go_play: "mr_go", note_turn: "mr_note", ready: "mr_ready", send: "mr_send" },
    face: function (doc, m, lang) {
      if (!m.length) return null;
      var v = m[m.length - 1][0], X = T(lang), out = [X.mr_face_h, fmt(X.mr_face_len, { n: hintParts(v[1]).n, s: say(lang, "mr_strokes", decode(v[3]).length) })];
      if (v[5] > 1) out.push(v[4] ? say(lang, "mr_face_back", v[4]) : X.mr_face_miss);
      return out;
    },
    result: function () { return { h: "", lines: [] }; }
  };
  if (!Tn.GAMES.malrat) { Tn.GAMES.malrat = game; Tn.IDS.push("malrat"); }
  // The turn editor finds widgets in the registry of the new turn cards (src/turn2.js); this part adds to the same one.
  if (!node && root.Parts) { root.Turn2 = root.Turn2 || root.Parts.registry("turnzwei", ["rule", "widget"]); if (!root.Turn2.get("rule", "malrat")) root.Turn2.add("rule", "malrat", game); }
  var api = { game: game, ALL: ALL, CATS: CATS, COLORS: COLORS, WIDTHS: WIDTHS, EPS: EPS, GRID: GRID, MAXW: MAXW, ITER: ITER, MAX_LINES: MAX_LINES,
    suggest: suggest, own: own, guess: guess, letters: letters, hintOf: hintOf, hintParts: hintParts, check: check, right: right, find: find,
    simplify: simplify, encode: encode, decode: decode, pack: pack, used: used, move: move, round: round, ok: ok, size: size, fits: fits, order: order, bank: bank,
    supported: function () { return !!subtle(); }, langOf: langOf };
  if (node) module.exports = api; else root.Malrat = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
