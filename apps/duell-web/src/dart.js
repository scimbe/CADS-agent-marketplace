/* Dart (spiel-dart): a real dartboard, by link or against the bot Bert. Part "dart" (scripts/build.js); logic only, no
   DOM, the screen is dart-ui.js. The rule joins the turn table (Turns.GAMES) like malrat.js.
   No score ever stands in the link: a move says what the hand did, and every phone that opens it counts the hits again.
   A move is  [darts, claim, names]
     darts  base64url, the whole game so far (snap: the link holds only the latest move, which carries every dart):
              2 characters header  mode (a 301 double out, b 301 for beginners without double out, c Around the Clock 1-20,
                                   d highest score in 3 rounds) and opponent (l by link, b against the bot Bert)
              5 characters a dart  aim x, aim y (2 each: 0..4095, thousandths of the board's radius around 2048),
                                   power (one of 9 steps, 0..8; 4 flies straight; 9..17: the same step set on the
                                   slider, without timing, which the seed shakes by one step as often as a swinging
                                   bar is missed: 1 in 5 one step less, 1 in 5 one step more)
            Against the bot only the person's darts stand there: Bert's come from the seed, like everything else.
     claim  the points the thrower's screen showed for the last turn (against the bot: all of the person's points). It is
            never counted; the phone that opens the link counts again and says when the two differ.
     names  the two nicknames ("" when none), each thrower fills in their own; the other one stays as it was. Never one of
            the screen's own words (Du, Bert, Spieler 1/2, You, Player 1/2), never the other's name in disguise (folded:
            NFKC, lower case, Cyrillic and Greek look-alikes as Latin), no bidi or zero-width characters.
   What a phone counts (view): the link's move, unless this phone sent a move of this game and the link does not go on
   from it; then its own, with the note "Dieser Link passt nicht zu deinem letzten Wurf". The step, the end, the result
   and the picture all go through view.
   Where a dart lands: aim + power (each step off the middle about 9 mm too high or too low) + the hand's scatter from the
   seed and the dart number (about 15 mm either way: a pub player, not a pro). The moment of the throw changes nothing:
   the wobbling crosshair only shows how far the hand drifts, so no timing helps, with or without motion. Only + - * / on
   literals and an integer sine table, no Math.sin: every phone gets the same numbers. There is no steered difficulty:
   the scatter and Bert's hand never change with the score. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("./turns.js") : root.Turns, C = node ? require("./core.js") : root.DuellCore, Q = node ? require("./quest.js") : root.Quest;
  var DATA = node ? require("./dart.json") : root.DartData;
  var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  // the numbers clockwise from the top
  var ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  // sin 0°, 9°, ... 90°: every angle the board needs (segment edges 9° + 18° k, centres 18° k) is a multiple of 9°
  var SIN9 = [0, 0.15643446504023087, 0.3090169943749474, 0.45399049973954675, 0.5877852522924731, 0.7071067811865476,
    0.8090169943749475, 0.8910065241883679, 0.9510565162951535, 0.9876883405951378, 1];
  // round(1000 sin(i 360° / 64)) for a quarter turn: the hand's wobble
  var W16 = [0, 98, 195, 290, 383, 471, 556, 634, 707, 773, 831, 882, 924, 957, 981, 995, 1000];
  // the rings of a tournament board in mm; the outer edge of the double ring (170 mm) is 1
  var MM = 170, BULL = 6.35 / MM, OUTER = 15.9 / MM, T_IN = 99 / MM, T_OUT = 107 / MM, D_IN = 162 / MM;
  var KIND = { a: "x01", b: "x01", c: "atc", d: "high" }, MODES = ["a", "b", "c", "d"], START = 301, ROUNDS = 12, HIGH = 3;
  // SCAT: the spread of one axis (Irwin-Hall of 4, scaled to that standard deviation), 0.09 = 15 mm; LEVELS power steps
  var WOB = 0.09, POWER = 0.055, SCAT = 0.09, LEVELS = 9, MID = 4, STEPS = 64, STEP_MS = 70, NAME = 12, MAXLEN = 2 + 5 * 3 * ROUNDS * 2;
  var RADIUS = { s: (T_OUT + D_IN) / 2, i: (OUTER + T_IN) / 2, t: (T_IN + T_OUT) / 2, d: (D_IN + 1) / 2 };

  Object.keys(DATA.text).forEach(function (l) { Object.assign(Tn.T(l), DATA.text[l]); });
  function T(lang) { return Tn.T(lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function say(lang, k, n, o) { return fmt(C.form(T(lang), k, n, lang), Object.assign({ n: n }, o || {})); }
  function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
  function rng(tag) { return C.mulberry32(C.hash32("dart|" + tag)); }

  // ---------- the board ----------
  // sin of 9j degrees, cos as sin of 9(j + 10); a direction clockwise from the top in screen coordinates (y down)
  function sd(j) { j = ((j % 40) + 40) % 40; var q = Math.floor(j / 10), r = j % 10; return q === 0 ? SIN9[r] : q === 1 ? SIN9[10 - r] : q === 2 ? -SIN9[r] : -SIN9[10 - r]; }
  function dir(j) { return [sd(j), -sd(j + 10)]; }
  var EDGE = []; for (var e = 0; e < 20; e++) EDGE.push(dir(1 + 2 * e));
  function cross(a, x, y) { return a[0] * y - a[1] * x; }
  // the number of the segment the point lies in: between edge k (9° + 18° k) and edge k + 1, clockwise
  function sector(x, y) {
    for (var k = 0; k < 20; k++) { var b = EDGE[(k + 1) % 20]; if (cross(EDGE[k], x, y) >= 0 && cross(b, x, y) < 0) return ORDER[(k + 1) % 20]; }
    return ORDER[0];
  }
  // n: number (25 for the bull, 0 beside the board), m: 1 single, 2 double (the bullseye counts as double), 3 triple
  function score(x, y) {
    var r2 = x * x + y * y;
    if (r2 > 1) return { n: 0, m: 0, p: 0 };
    if (r2 <= BULL * BULL) return { n: 25, m: 2, p: 50 };
    if (r2 <= OUTER * OUTER) return { n: 25, m: 1, p: 25 };
    var n = sector(x, y), m = r2 >= D_IN * D_IN ? 2 : r2 >= T_IN * T_IN && r2 < T_OUT * T_OUT ? 3 : 1;
    return { n: n, m: m, p: n * m };
  }
  // The middle of a field to aim at: { n, m, r } with r "s" outer single, "i" inner single, "t", "d"; the bull's middle.
  function centre(n, r) {
    if (n === 25) return r === "o" ? [0, -(BULL + OUTER) / 2] : [0, 0];
    var d = dir(2 * ORDER.indexOf(n)), k = RADIUS[r] || RADIUS.s;
    return [d[0] * k, d[1] * k];
  }

  // ---------- the hand ----------
  function w64(i) { i = ((i % 64) + 64) % 64; var q = i >> 4, r = i & 15; return (q === 0 ? W16[r] : q === 1 ? W16[16 - r] : q === 2 ? -W16[r] : -W16[16 - r]) / 1000; }
  // dart number k of the game (both players counted, Bert too): its scatter, the phase of the crosshair's wobble on screen
  // and the power step the power bar starts on (so it never stands on the middle by itself)
  var IH = SCAT / 0.5773502691896258;
  function hand(seed, k) {
    var r = rng(seed + "|" + k), ph = [0, 0, 0, 0].map(function () { return Math.floor(r() * STEPS); });
    return { ph: ph, sx: (r() + r() + r() + r() - 2) * IH, sy: (r() + r() + r() + r() - 2) * IH, lv: Math.floor(r() * LEVELS) };
  }
  // where the crosshair drifts on screen at moment t (0..63; between two steps the line between them): only a picture of
  // the hand, the throw does not depend on it
  function wobble(h, t) {
    if (t !== Math.floor(t)) { var a = wobble(h, Math.floor(t)), b = wobble(h, Math.floor(t) + 1), f = t - Math.floor(t); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
    return [WOB * (0.6 * w64(3 * t + h.ph[0]) + 0.4 * w64(7 * t + h.ph[1])), WOB * (0.6 * w64(2 * t + h.ph[2]) + 0.4 * w64(5 * t + h.ph[3]))];
  }
  // The power bar while held (pointer) or after the space bar (keyboard): the same pendulum for every input, one step every
  // SWING ms, up to the strongest step and back down without stopping at either end, from the step this dart starts on
  // (hand().lv, from the seed: a quick tap gives no fixed step). ms: how long it has swung.
  var SWING = 160, QUICK = 150;
  function swing(lv, ms) { var n = 2 * (LEVELS - 1), i = ((lv + Math.floor(Math.max(0, ms) / SWING)) % n + n) % n; return i < LEVELS ? i : n - i; }
  function aimOf(d) { return [(d.ax - 2048) / 1000, (d.ay - 2048) / 1000]; }
  function grid(v) { return Math.max(0, Math.min(4095, Math.round(v * 1000) + 2048)); }
  // a dart's landing: { x, y, n, m, p, d (the input) }
  // the slider's step, shaken by the seed like a swinging bar: one step less or more, each 1 in 5
  function shake(seed, k) { var u = rng("lv|" + seed + "|" + k)(); return u < 0.2 ? -1 : u < 0.4 ? 1 : 0; }
  function level(seed, k, d) { return d.f ? Math.max(0, Math.min(LEVELS - 1, d.p + shake(seed, k))) : d.p; }
  function land(seed, k, d) {
    var h = hand(seed, k), a = aimOf(d), x = a[0] + h.sx, y = a[1] - (level(seed, k, d) - MID) * POWER + h.sy, s = score(x, y);
    return { x: x, y: y, n: s.n, m: s.m, p: s.p, d: d };
  }

  // ---------- the link's characters ----------
  function enc(d) { return ABC[d.ax >> 6] + ABC[d.ax & 63] + ABC[d.ay >> 6] + ABC[d.ay & 63] + ABC[d.p + (d.f ? LEVELS : 0)]; }
  function dec(s) {
    if (typeof s !== "string" || s.length % 5) return null;
    var out = [];
    for (var i = 0; i < s.length; i += 5) {
      var c = []; for (var j = 0; j < 5; j++) { var v = ABC.indexOf(s[i + j]); if (v < 0) return null; c.push(v); }
      if (c[4] >= 2 * LEVELS) return null;
      var o = { ax: c[0] * 64 + c[1], ay: c[2] * 64 + c[3], p: c[4] % LEVELS }; if (c[4] >= LEVELS) o.f = 1;
      out.push(o);
    }
    return out;
  }
  // f: set on the slider (no timing), shaken by the seed
  function dart(ax, ay, p, f) { var d = { ax: grid(ax), ay: grid(ay), p: Math.max(0, Math.min(LEVELS - 1, Math.round(p))) }; if (f) d.f = 1; return d; }
  function head(mode, bot) { return mode + (bot ? "b" : "l"); }

  // ---------- Bert, the bot: a pub regular. The same scatter as everybody, aims like a regular, gets the power step wrong
  // now and then (2 in 5 darts one step off), and never adapts to the score ----------
  function aimFor(g, p) {
    if (g.kind === "atc") return { n: g.next[p], r: "s" };
    if (g.kind === "high") return { n: 20, r: "t" };
    var L = g.left[p];
    if (L === 50) return { n: 25, r: "b" };
    if (g.mode === "b") {
      if (L <= 20) return { n: L, r: "s" };
      if (L === 25) return { n: 25, r: "o" };
      if (L <= 40 && L % 2 === 0) return { n: L / 2, r: "d" };
      if (L <= 60 && L % 3 === 0) return { n: L / 3, r: "t" };
      return L >= 61 ? { n: 20, r: "t" } : { n: L - 20 <= 20 ? L - 20 : 20, r: "s" };
    }
    if (L >= 62) return { n: 20, r: "t" };
    if (L > 40) return L - 40 <= 20 ? { n: L - 40, r: "s" } : { n: 7, r: "t" };
    return L % 2 === 0 ? { n: L / 2, r: "d" } : { n: 1, r: "s" };
  }
  function botDart(seed, k, at) {
    var r = rng("bert|" + seed + "|" + k), c = centre(at.n, at.r), u = r();
    return dart(c[0], c[1], u < 0.2 ? MID - 1 : u < 0.4 ? MID + 1 : MID);
  }

  // ---------- the game: every turn worked out again from the darts ----------
  // -> { mode, kind, bot, left, next, total, turns: [{ p, d: [landing], pts, bust, out }], k (darts so far), over, win
  //    (-1 draw), capped, partial (a turn begun, not finished), extra (darts after the end) } or null for no game
  function sim(seed, s) {
    if (typeof s !== "string" || s.length < 2 || s.length > MAXLEN || !KIND[s[0]] || "lb".indexOf(s[1]) < 0) return null;
    var ds = dec(s.slice(2)); if (!ds) return null;
    var g = { mode: s[0], kind: KIND[s[0]], bot: s[1] === "b", left: [START, START], next: [1, 1], total: [0, 0], done: [0, 0], turns: [], k: 0, over: false, win: -1, capped: false, partial: false, extra: false }, i = 0;
    while (!g.over) {
      var p = g.turns.length % 2, bert = g.bot && p === 1;
      if (!bert && i >= ds.length) break;
      if (!turn(g, seed, p, bert ? function (k) { return botDart(seed, k, aimFor(g, 1)); } : function () { return i < ds.length ? ds[i++] : null; })) break;
    }
    g.extra = i < ds.length;
    return g;
  }
  function turn(g, seed, p, next) {
    var t = { p: p, d: [], pts: 0, bust: false, out: false, from: g.left[p] };
    g.turns.push(t);
    for (var j = 0; j < 3; j++) {
      var d = next(g.k); if (!d) { g.partial = true; return false; }
      var h = land(seed, g.k, d); g.k++; t.d.push(h);
      if (g.kind === "x01") {
        var L = g.left[p] - h.p;
        if (L < 0 || (g.mode === "a" && (L === 1 || (L === 0 && h.m !== 2)))) { t.bust = true; t.pts = 0; g.left[p] = t.from; break; }
        g.left[p] = L; t.pts += h.p;
        if (!L) { t.out = true; g.done[p] = g.k; break; }
      } else if (g.kind === "atc") {
        if (h.n === g.next[p]) { h.ok = true; g.next[p]++; t.pts++; }
        if (g.next[p] > 20) { t.out = true; g.done[p] = g.k; break; }
      } else { g.total[p] += h.p; t.pts += h.p; }
    }
    // Both always get as many turns (301 and Around the Clock): whoever starts and finishes first waits for the other's turn
    // of that round; if both finish in it, fewer darts win, the same number is a draw. Starting is no advantage.
    if (g.turns.length % 2 === 0 && (g.done[0] || g.done[1])) {
      var d0 = g.done[0] ? darts(g, 0) : 1e9, d1 = g.done[1] ? darts(g, 1) : 1e9;
      g.over = true; g.win = d0 < d1 ? 0 : d1 < d0 ? 1 : -1;
    }
    if (!g.over && g.turns.length >= 2 * (g.kind === "high" ? HIGH : ROUNDS)) {
      g.over = true; g.capped = g.kind !== "high";
      var a = g.kind === "x01" ? g.left[1] - g.left[0] : g.kind === "atc" ? g.next[0] - g.next[1] : g.total[0] - g.total[1];
      g.win = a > 0 ? 0 : a < 0 ? 1 : -1;
    }
    return true;
  }
  function darts(g, p) { return g.turns.reduce(function (a, t) { return a + (t.p === p ? t.d.length : 0); }, 0); }
  function rounds(g) { return g.kind === "high" ? HIGH : ROUNDS; }
  function last(m) { return m && m.length ? m[m.length - 1][0] : null; }
  function gameOf(doc, m) { var v = last(m); return v ? sim(doc.seed, v[0]) : null; }

  // A link can be built by hand: only what the screen could have sent. The claim is any number; it is never counted.
  // m: the moves before. Reading a link (Turns.moves) checks its one stored move without one before it (snap), so then any
  // whole game will do; a new move (Turns.play) adds exactly one turn to the one before, or is the first turn of a doc
  // without moves (doc.q empty). Against Bert the one move is the whole game.
  // ---------- nicknames ----------
  var HIDDEN = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g;
  var LOOK = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "к": "k", "м": "m", "н": "h", "т": "t", "в": "b",
    "ԁ": "d", "ӏ": "l", "ь": "b", "г": "r", "α": "a", "β": "b", "ε": "e", "η": "n", "ι": "i", "κ": "k", "μ": "m", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
    "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "ß": "ss" };
  // a name without bidi and zero-width characters (the screen never shows them)
  function plainName(n) { return String(n == null ? "" : n).replace(HIDDEN, ""); }
  // a name as two names are compared: NFKC, lower case, look-alikes as Latin, accents and everything but a-z dropped
  function foldName(n) {
    return Array.from(plainName(n).normalize("NFKC").toLowerCase()).map(function (c) { return LOOK[c] || c; }).join("")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  }
  // the screen's own words for the players, in every language: no nickname may be one of them
  var TAKEN = {}; ["de", "en"].concat(Object.keys(DATA.text)).forEach(function (l) { ["da_me", "da_bot", "da_p1", "da_p2"].forEach(function (k) { if (DATA.text[l] && DATA.text[l][k]) TAKEN[foldName(DATA.text[l][k])] = 1; }); });
  TAKEN.bert = TAKEN.bot = 1;
  function nameOk(n) { return n === "" || (typeof n === "string" && plainName(n) === n && Q.clean(n, NAME) === n && !!foldName(n) && !TAKEN[foldName(n)]); }
  function namesOk(a) { return Array.isArray(a) && a.length === 2 && nameOk(a[0]) && nameOk(a[1]) && !(a[0] && a[1] && foldName(a[0]) === foldName(a[1])); }
  // my nickname for the move: hidden characters dropped, through the filter; "" when it is taken or the other's in disguise
  function myName(nick, other) { var n = Q.clean(plainName(nick), NAME); return n && nameOk(n) && !(other && foldName(other) === foldName(n)) ? n : ""; }
  function ok(v, doc, m) {
    if (!Array.isArray(v) || v.length !== 3 || !intIn(v[1], 0, 999) || !namesOk(v[2])) return false;
    var g = sim(doc.seed, v[0]), prev = last(m);
    if (!g || g.partial || g.extra || !g.turns.length) return false;
    if (g.bot) return !prev && g.over;
    if (!prev) return !!doc.q || g.turns.length === 1;
    var pg = sim(doc.seed, prev[0]), me = pg ? pg.turns.length % 2 : 0;
    return !!pg && !pg.over && v[0].slice(0, prev[0].length) === prev[0] && g.turns.length === pg.turns.length + 1 && v[2][1 - me] === prev[2][1 - me];
  }
  // A link that comes back has to go on from the darts this phone sent last (mine): the other side may only add a turn.
  // An earlier link of the same game (a beginning of mine: this phone's own history, e.g. the link it answered) is fine
  // too. Anything else (my darts rewritten, a strange game with this seed) is not counted: the phone keeps its own standing.
  function trust(mine, v) {
    if (!mine) return true;
    var s = v && typeof v[0] === "string" ? v[0] : null;
    return !!s && (s.slice(0, mine.length) === mine || mine.slice(0, s.length) === s);
  }
  // What this phone counts for doc: { v, g, foreign } or null. own(seed) -> { s, n } is what this phone sent last for that
  // game (dart-ui.js sets it, from the phone's storage); a link that does not go on from it is not counted.
  var own = null;
  function view(doc, m) {
    var v = last(m), o = own && v ? own(doc.seed) : null;
    if (o && o.s && !trust(o.s, v)) { var og = sim(doc.seed, o.s); if (og && !og.partial) return { v: [o.s, claimed(og), namesOk(o.n) ? o.n : ["", ""]], g: og, foreign: true }; }
    return v ? { v: v, g: sim(doc.seed, v[0]), foreign: false } : null;
  }
  // What the link says the last turn brought, against what it brought: null when they agree.
  function claimed(g) { return g.bot ? g.turns.filter(function (t) { return t.p === 0; }).reduce(function (a, t) { return a + t.pts; }, 0) : g.turns[g.turns.length - 1].pts; }
  function fixed(v, g) { var n = claimed(g); return v[1] === n ? null : { c: v[1], n: n }; }

  // ---------- words ----------
  function short(h, lang) { return h.n === 0 ? T(lang).da_k_0 : h.n === 25 ? (h.m === 2 ? T(lang).da_k_50 : "25") : (h.m === 3 ? "T" : h.m === 2 ? "D" : "") + h.n; }
  function field(h, lang) { var X = T(lang); return h.n === 0 ? X.da_s_0 : h.n === 25 ? X[h.m === 2 ? "da_s_50" : "da_s_25"] : fmt(X["da_s_" + h.m], { n: h.n }); }
  // "Triple 20, 60 Punkte": what the screen reader says for a dart
  function spoken(h, lang) { return say(lang, "da_sp", h.p, { h: field(h, lang), p: h.p }); }
  // a player's name: against Bert "Du" and "Bert"; by link the nickname from the move, else "Spieler 1/2"; me: who throws here
  function who(g, p, lang, names, me) { var X = T(lang); return g.bot ? (p ? X.da_bot : X.da_me) : p === me ? X.da_me : (names && plainName(names[p])) || X["da_p" + (p + 1)]; }
  function modeName(m, lang) { return T(lang)["da_m_" + m]; }
  function stand(g, p, lang, names, me) {
    var w = who(g, p, lang, names, me);
    if (g.kind === "x01") return fmt(T(lang).da_left, { p: w, n: g.left[p] });
    if (g.kind === "atc") return g.next[p] > 20 ? fmt(T(lang).da_next_done, { p: w }) : fmt(T(lang).da_next, { p: w, n: g.next[p] });
    return say(lang, "da_total", g.total[p], { p: w });
  }
  function turnLine(t, g, lang) {
    var X = T(lang), d = t.d.map(function (h) { return short(h, lang); }).join(" · ");
    if (t.bust) return fmt(X.da_turn_bust, { d: d, n: t.from });
    return g.kind === "atc" ? say(lang, "da_turn_atc", t.pts, { d: d }) : say(lang, "da_turn", t.pts, { d: d });
  }
  function head1(g, lang) { return modeName(g.mode, lang) + " · " + fmt(T(lang).da_round, { r: Math.min(rounds(g), Math.floor(g.turns.length / 2) + 1), n: rounds(g) }); }

  function face(doc, m, lang) {
    var w = view(doc, m), v = w && w.v, g = w && w.g; if (!g) return null;
    var n = v[2], out = [head1(g, lang), stand(g, 0, lang, n) + " · " + stand(g, 1, lang, n), who(g, g.turns[g.turns.length - 1].p, lang, n) + ": " + turnLine(g.turns[g.turns.length - 1], g, lang)], f = fixed(v, g);
    if (f) out.push(fmt(T(lang).da_fixed, f));
    if (w.foreign) out.push(T(lang).da_foreign);
    return out;
  }
  function result(doc, m, lang) {
    var w = view(doc, m), v = w && w.v, g = w && w.g, X = T(lang); if (!g) return { h: "", lines: [] };
    var n = v[2], h = g.win < 0 ? X.da_draw : g.bot ? X[g.win ? "da_win_bot" : "da_win_you"] : fmt(X.da_win, { p: who(g, g.win, lang, n) }), lines = [modeName(g.mode, lang), stand(g, 0, lang, n) + " · " + stand(g, 1, lang, n)];
    var end = g.turns[g.turns.length - 1];
    if (end.out && g.kind === "x01") lines.push(fmt(X.da_out_with, { h: field(end.d[end.d.length - 1], lang) }));
    if (g.capped) lines.push(fmt(X.da_cap, { n: ROUNDS }));
    var f = fixed(v, g); if (f) lines.push(fmt(X.da_fixed, f));
    if (w.foreign) lines.push(X.da_foreign);
    return { h: h, lines: lines };
  }

  // ---------- the rule ----------
  var prompt = { w: "dart", l: "da_l", live: true, check: ok, title: function (doc, lang) { return T(lang)[Tn.state(doc).turn ? "da_l" : "da_l_first"]; } };
  var game = {
    snap: true, turns: [[prompt], [prompt]], part: "dart",
    ends: function (doc, m) { var w = view(doc, m); return !!(w && w.g && w.g.over); },
    wsw: { link: ["zahl", "name"], tage: 0, plus: function (lang) { return T(lang).da_wsw; } }, notes: ["da_n1", "da_n2"],
    words: { you_start: "da_you", go_first: "da_go_first", go_play: "da_go", note_turn: "da_note", note_over: "da_over", ready: "da_ready", send: "da_send", rematch: "da_again" },
    face: face, result: result
  };
  if (!Tn.GAMES.dart) { Tn.GAMES.dart = game; Tn.IDS.push("dart"); }
  if (!node && root.Parts) { root.Turn2 = root.Turn2 || root.Parts.registry("turnzwei", ["rule", "widget"]); if (!root.Turn2.get("rule", "dart")) root.Turn2.add("rule", "dart", game); }
  var api = { game: game, ORDER: ORDER, MODES: MODES, KIND: KIND, START: START, ROUNDS: ROUNDS, HIGH: HIGH, STEPS: STEPS, STEP_MS: STEP_MS, WOB: WOB, POWER: POWER, SCAT: SCAT, LEVELS: LEVELS, MID: MID, NAME: NAME, MAXLEN: MAXLEN, trust: trust, view: view, setOwn: function (f) { own = f; }, nameOk: nameOk, namesOk: namesOk, foldName: foldName, plainName: plainName, myName: myName, shake: shake, level: level, darts: darts, swing: swing, SWING: SWING, QUICK: QUICK,
    R: { BULL: BULL, OUTER: OUTER, T_IN: T_IN, T_OUT: T_OUT, D_IN: D_IN }, sd: sd, dir: dir, score: score, centre: centre, hand: hand, wobble: wobble, land: land,
    enc: enc, dec: dec, dart: dart, head: head, aimOf: aimOf, aimFor: aimFor, botDart: botDart, sim: sim, ok: ok, claimed: claimed, fixed: fixed, rounds: rounds,
    short: short, field: field, spoken: spoken, who: who, modeName: modeName, stand: stand, turnLine: turnLine, head1: head1, last: last, gameOf: gameOf,
    quip: function (seed, k, lang) { var q = DATA.quips[lang] || DATA.quips.de; return q[Math.floor(rng("quip|" + seed + "|" + k)() * q.length)]; } };
  if (node) module.exports = api; else root.Dart = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
