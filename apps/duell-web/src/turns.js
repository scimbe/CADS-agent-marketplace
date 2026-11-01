/* Zug per Link: games for two, one move at a time. Every link is the whole game, so no server holds anything, and every
   new game gets its own seed, so each share is a new pair. Pure logic (no DOM). The table GAMES is the only thing that
   differs between the games. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var C = node ? require("./core.js") : root.DuellCore;
  var Q = node ? require("./quest.js") : root.Quest;
  var DATA = node ? require("./turn.json") : root.TurnData;
  var BLOB = /^[A-Za-z0-9_-]{0,900}$/, SHAPES = ["cookie", "star", "heart", "bolt", "ring", "drop"], DAY = 86400000;

  function T(lang) { return DATA.text[lang === "en" ? "en" : "de"]; }
  function pair(list, i, lang) { return list[i].split("|")[lang === "en" ? 1 : 0]; }
  function mix(doc, tag, n) {          // the same order on both phones, from the seed in the link
    var r = C.mulberry32(C.hash32("turn|" + doc.seed + "|" + tag)), a = [], i, j, t;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function board(doc, lang) { return mix(doc, "wort", DATA.words.length).slice(0, 9).map(function (i) { return pair(DATA.words, i, lang); }); }
  function smuggle(doc) { return mix(doc, "schmuggel", DATA.smuggle.length).slice(0, 12); }
  function smugglePick(doc, who) { var s = smuggle(doc); return who ? s.slice(3, 6) : s.slice(0, 3); }
  function smuggleBoard(doc, lang) { var s = smuggle(doc); return mix(doc, "board", 12).map(function (i) { return pair(DATA.smuggle, s[i], lang); }); }
  function smuggleSpot(doc, who) { var s = smuggle(doc), o = mix(doc, "board", 12), mine = smugglePick(doc, who); return o.map(function (i, at) { return mine.indexOf(s[i]) >= 0 ? at : -1; }).filter(function (x) { return x >= 0; }); }
  function lots(doc, lang) { return mix(doc, "items", DATA.items.length).slice(0, 5).map(function (i) { return pair(DATA.items, i, lang); }); }
  function worth(doc, who) { return mix(doc, "wert" + who, 5).map(function (i) { return (i + 1) * 10; }); }
  function praise(doc, lang) { return DATA.praise.map(function (x, i) { return pair(DATA.praise, i, lang); }); }
  function hits(a, b) { return a.filter(function (x) { return b.indexOf(x) >= 0; }); }
  function places(order) { var p = []; order.forEach(function (o, at) { p[o] = at; }); return p; }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k]; }); }
  function things(doc, lang) { return doc.w || T(lang).things; }

  function splitLine(x, y, f) { return x >= f ? { a: 10 - x, b: x } : null; }
  var GAMES = {
    deal: {
      turns: [
        [{ w: "slide", l: "deal_offer", max: 10 }],
        [{ w: "slide", l: "deal_floor", max: 10 }, { w: "slide", l: "deal_offer2", max: 10, peek: function (doc, m, now, lang) { return dealLine(doc, m[0][0], now[0], 0, lang); } }],
        [{ w: "slide", l: "deal_floor", max: 10 }]
      ],
      result: function (doc, m, lang) {
        var X = T(lang), one = splitLine(m[0][0], 0, m[1][0]), two = splitLine(m[1][1], 0, m[2][0]);
        return {
          h: one && two ? X.deal_both : X.deal_broke,
          lines: [dealLine(doc, m[0][0], m[1][0], 0, lang), dealLine(doc, m[1][1], m[2][0], 1, lang)]
        };
      }
    },
    einig: {
      turns: [
        [{ w: "list", l: "einig_list", n: 5, max: 16 }, { w: "rank", l: "einig_rank", from: function (doc, m, now) { return now[0]; } }],
        [{ w: "rank", l: "einig_rank", from: function (doc, m) { return m[0][0]; } }]
      ],
      result: function (doc, m, lang) {
        var X = T(lang), opts = m[0][0], pa = places(m[0][1]), pb = places(m[1][0]), best = -1, score = null, tie = mix(doc, "einig", 5);
        opts.forEach(function (o, i) {
          var worst = Math.max(pa[i], pb[i]), sum = pa[i] + pb[i], s = worst * 100 + sum * 10 + tie.indexOf(i);
          if (score === null || s < score) { score = s; best = i; }
        });
        var fight = 0, far = -1;
        opts.forEach(function (o, i) { var d = Math.abs(pa[i] - pb[i]); if (d > far) { far = d; fight = i; } });
        return { h: fmt(X.einig_win, { o: opts[best] }), lines: far > 0 ? [fmt(X.einig_fight, { o: opts[fight] })] : [X.einig_same] };
      }
    },
    wort: {
      turns: [
        [{ w: "pick", l: "wort_pick", n: 3, from: function (doc, m, now, lang) { return board(doc, lang); } }, { w: "text", l: "wort_clue", max: 14, oneWord: true, bad: function (v, doc, lang) { return board(doc, lang).some(function (x) { return Q.fold(x) === Q.fold(v); }); } }],
        [{ w: "pick", l: "wort_guess", n: 3, top: function (doc, m) { return m[0][1]; }, from: function (doc, m, now, lang) { return board(doc, lang); } }]
      ],
      result: function (doc, m, lang) {
        var X = T(lang), n = hits(m[0][0], m[1][0]).length, b = board(doc, lang);
        return { h: fmt(X["wort_" + n], { n: n }), lines: [fmt(X.wort_was, { c: m[0][1], w: m[0][0].map(function (i) { return b[i]; }).join(", ") })] };
      }
    },
    schmuggel: {
      turns: [
        [{ w: "show", l: "smug_mine", list: function (doc, m, now, lang) { return smugglePick(doc, 0).map(function (i) { return pair(DATA.smuggle, i, lang); }); } }],
        [{ w: "show", l: "smug_mine", list: function (doc, m, now, lang) { return smugglePick(doc, 1).map(function (i) { return pair(DATA.smuggle, i, lang); }); }, later: "smug_later" }, { w: "pick", l: "smug_guess", n: 3, from: function (doc, m, now, lang) { return smuggleBoard(doc, lang); } }],
        [{ w: "pick", l: "smug_guess", n: 3, from: function (doc, m, now, lang) { return smuggleBoard(doc, lang); } }]
      ],
      result: function (doc, m, lang) {
        var X = T(lang), b = hits(m[1][1], smuggleSpot(doc, 0)).length, a = hits(m[2][0], smuggleSpot(doc, 1)).length;
        return { h: a === b ? X.smug_tie : X.smug_win, lines: [fmt(X.smug_score, { w: X.first, n: b }), fmt(X.smug_score, { w: X.second, n: a })] };
      }
    },
    lob: {
      turns: [
        [{ w: "pick", l: "lob_me", n: 3, from: function (doc, m, now, lang) { return praise(doc, lang); } }, { w: "pick", l: "lob_you", n: 3, from: function (doc, m, now, lang) { return praise(doc, lang); } }],
        [{ w: "pick", l: "lob_me", n: 3, from: function (doc, m, now, lang) { return praise(doc, lang); } }, { w: "pick", l: "lob_you", n: 3, from: function (doc, m, now, lang) { return praise(doc, lang); } }]
      ],
      result: function (doc, m, lang) {
        var X = T(lang), p = praise(doc, lang), names = function (l) { return l.map(function (i) { return p[i]; }).join(", "); };
        var a = hits(m[0][0], m[1][1]), b = hits(m[1][0], m[0][1]), sa = m[1][1].filter(function (i) { return a.indexOf(i) < 0; }), sb = m[0][1].filter(function (i) { return b.indexOf(i) < 0; }), out = [];
        if (a.length + b.length) out.push(fmt(X.lob_same, { w: names(a.concat(b)) }));
        if (sa.length) out.push(fmt(X.lob_sees, { n: X.first, w: names(sa) }));
        if (sb.length) out.push(fmt(X.lob_sees, { n: X.second, w: names(sb) }));
        return { h: X.lob_head, lines: out };
      }
    },
    auktion: {
      turns: [
        [{ w: "alloc", l: "auk_bid", sum: 100, step: 10, from: function (doc, m, now, lang) { return lots(doc, lang); }, vals: function (doc) { return worth(doc, 0); } }],
        [{ w: "alloc", l: "auk_bid", sum: 100, step: 10, from: function (doc, m, now, lang) { return lots(doc, lang); }, vals: function (doc) { return worth(doc, 1); } }]
      ],
      result: function (doc, m, lang) {
        var X = T(lang), l = lots(doc, lang), wa = worth(doc, 0), wb = worth(doc, 1), sa = 0, sb = 0, lines = [];
        l.forEach(function (x, i) {
          var a = m[0][0][i], b = m[1][0][i], who = a === b ? null : a > b ? 0 : 1;
          if (who === 0) sa += wa[i]; if (who === 1) sb += wb[i];
          lines.push(x + ": " + (who === null ? X.auk_none : who === 0 ? X.first : X.second));
        });
        return { h: fmt(sa === sb ? X.auk_tie : X.auk_win, { w: sa > sb ? X.first : X.second, a: sa, b: sb }), lines: lines };
      }
    },
    kapsel: {
      turns: [
        [{ w: "pick", l: "kap_pick", n: 1, from: function (doc, m, now, lang) { return DATA.fates.map(function (x, i) { return pair(DATA.fates, i, lang); }); } }, { w: "slide", l: "kap_days", min: 1, max: 30, def: 7 }],
        [{ w: "pick", l: "kap_true", n: 1, from: function (doc, m, now, lang) { return [T(lang).yes, T(lang).no]; } }]
      ],
      // Opens on the day it names, counted from the seal. A clock can be turned; this is a game, not a lock.
      gate: function (doc, m) { return m.length === 1 ? doc.o : 0; },
      peekWhole: function (doc, m, lang) { return m.length === 1 ? pair(DATA.fates, m[0][0][0], lang) : ""; },
      result: function (doc, m, lang) {
        var X = T(lang);
        return { h: m[1][0][0] === 0 ? X.kap_right : X.kap_wrong, lines: [pair(DATA.fates, m[0][0][0], lang)] };
      }
    }
  };
  var IDS = Object.keys(GAMES);
  function dealLine(doc, offer, floor, i, lang) {
    var X = T(lang), w = things(doc, lang);
    return fmt(offer >= floor ? X.deal_ok : X.deal_no, { w: w, o: 10 - offer, f: offer, m: floor, who: i ? X.second : X.first });
  }

  // ---------- the seal: moves in a link are not readable at a glance. Anyone who decodes it can still look; it is a game. ----------
  function stream(seed, n) { var r = C.mulberry32(C.hash32("seal|" + seed)), o = new Uint8Array(n); for (var i = 0; i < n; i++) o[i] = Math.floor(r() * 256); return o; }
  function seal(moves, seed) {
    var b = new TextEncoder().encode(JSON.stringify(moves)), k = stream(seed, b.length), s = "";
    b.forEach(function (x, i) { s += String.fromCharCode(x ^ k[i]); });
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unseal(blob, seed) {
    if (typeof blob !== "string" || !blob || !BLOB.test(blob)) return [];
    try {
      var bin = atob(blob.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - blob.length % 4) % 4)), k = stream(seed, bin.length);
      var raw = Uint8Array.from(bin, function (c, i) { return c.charCodeAt(0) ^ k[i]; });
      var m = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      return Array.isArray(m) ? m : [];
    } catch (e) { return []; }
  }
  // A link can be built by hand: every answer has to be one the screen could have given.
  function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
  function distinct(a) { return new Set(a).size === a.length; }
  function okAnswer(p, v, doc, lang, m, now) {
    if (p.w === "show") return v === 0;
    if (p.w === "slide") return intIn(v, p.min || 0, p.max);
    if (p.w === "text") return typeof v === "string" && !!Q.clean(v, p.max) && Q.clean(v, p.max) === v && !(p.oneWord && /\s/.test(v)) && !(p.bad && p.bad(v, doc, lang));
    if (p.w === "list") return Array.isArray(v) && v.length === p.n && v.every(function (x) { return typeof x === "string" && !!Q.clean(x, p.max) && Q.clean(x, p.max) === x; }) && distinct(v.map(Q.fold));
    var n = p.from ? p.from(doc, m, now, lang).length : 0;
    if (p.w === "pick") return Array.isArray(v) && v.length === p.n && distinct(v) && v.every(function (x) { return intIn(x, 0, n - 1); });
    if (p.w === "rank") return Array.isArray(v) && v.length === n && distinct(v) && v.every(function (x) { return intIn(x, 0, n - 1); });
    if (p.w === "alloc") return Array.isArray(v) && v.length === n && v.every(function (x) { return intIn(x, 0, p.sum) && x % p.step === 0; }) && v.reduce(function (a, b) { return a + b; }, 0) <= p.sum;
    return false;
  }
  function checked(doc, raw) {
    var g = GAMES[doc.g], out = [];
    for (var t = 0; t < raw.length && t < g.turns.length; t++) {
      var want = g.turns[t], got = raw[t];
      if (!Array.isArray(got) || got.length !== want.length) return out;
      for (var i = 0; i < want.length; i++) if (!okAnswer(want[i], got[i], doc, "de", out, got.slice(0, i))) return out;
      out.push(got);
    }
    return out;
  }
  function sanitize(o, d) {
    d.g = IDS.indexOf(o.g) >= 0 ? o.g : IDS[0];
    d.seed = Math.floor(C.clampNum(o.seed, 0, 4294967295, 1));
    d.q = typeof o.q === "string" && BLOB.test(o.q) ? o.q : "";
    d.f = SHAPES.indexOf(o.f) >= 0 ? o.f : SHAPES[0];
    var w = Q.clean(o.w, 14); if (w) d.w = w;
    if (typeof o.o === "number" && intIn(o.o, 0, 99999)) d.o = o.o;
    return d;
  }
  function fromIdea(idea, lang, base) { base.g = idea.turn.g; base.seed = C.hash32("turn-" + idea.id); base.q = ""; base.f = idea.turn.f; if (idea.turn.w) base.w = (idea.turn.w[lang] || idea.turn.w.de); return base; }
  function moves(doc) { return checked(doc, unseal(doc.q, doc.seed)); }
  function state(doc) {
    var g = GAMES[doc.g], m = moves(doc), over = m.length >= g.turns.length;
    return { moves: m, turn: m.length, total: g.turns.length, who: m.length % 2, over: over, prompts: over ? [] : g.turns[m.length] };
  }
  // The next doc, or null if the answers do not fit the turn.
  function play(doc, answers, today) {
    var st = state(doc); if (st.over || answers.length !== st.prompts.length) return null;
    for (var i = 0; i < answers.length; i++) if (!okAnswer(st.prompts[i], answers[i], doc, "de", st.moves, answers.slice(0, i))) return null;
    var d = JSON.parse(JSON.stringify(doc));
    d.q = seal(st.moves.concat([answers]), d.seed);
    if (d.g === "kapsel" && st.turn === 0) d.o = today + answers[1];
    return d;
  }
  function result(doc, lang) { var st = state(doc); return st.over ? GAMES[doc.g].result(doc, st.moves, lang) : null; }
  function gate(doc, today) {
    var g = GAMES[doc.g], at = g.gate ? g.gate(doc, moves(doc)) : 0, left = at ? at - today : 0;
    return left > 0 ? left : 0;
  }
  function whole(doc, lang) { var g = GAMES[doc.g]; return g.peekWhole ? g.peekWhole(doc, moves(doc), lang) : ""; }
  function fresh(doc, seed) { var d = JSON.parse(JSON.stringify(doc)); d.seed = seed >>> 0; d.q = ""; delete d.o; return d; }
  function today(date) { return Math.floor((date || new Date()).getTime() / DAY); }
  function strings() {
    var out = [];
    (function walk(v) { if (typeof v === "string") v.split("|").forEach(function (x) { out.push(x); }); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { walk(v[k]); }); })(DATA);
    return out;
  }
  var api = { IDS: IDS, SHAPES: SHAPES, GAMES: GAMES, T: T, sanitize: sanitize, fromIdea: fromIdea, seal: seal, unseal: unseal, moves: moves, state: state, play: play, result: result, gate: gate, whole: whole, fresh: fresh, today: today, okAnswer: okAnswer, strings: strings };
  if (node) module.exports = api; else root.Turns = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
