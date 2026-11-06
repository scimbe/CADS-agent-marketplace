/* Daily Business only: the season's two Secret Santa cards (Katalog v2, wave V1). They join the GAMES table of turns.js like
   office.js does, but only in this flavor's core (scripts/build.js puts this file before flavor.js); their words are in
   this flavor's turn.json. Pure logic (no DOM).
   - bwichteln (biz-wichteln): budget, kind and day; then each person signs up on their own phone (name + the public half of
     a key made there, part turnzwei src/siegel.js), and the phone that set it up draws: one closed circle from a secret
     that never enters the link, each recipient sealed to that person's key. The link carries names, keys and boxes,
     never who gives to whom; only the phone that signed up opens its slip (widget "bw", part turnzwei).
   - wichtelidee (biz-wichtel-ideen): the gift cards' questions (turns.js giftGame) for a colleague, smaller budgets. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("../../turns.js") : root.Turns, C = node ? require("../../core.js") : root.DuellCore, Q = node ? require("../../quest.js") : root.Quest;
  var EURO = [5, 10, 15, 20, 25, 30], KINDS = ["klassisch", "kreativ", "schrank", "dank"];
  function T(lang) { return Tn.T(lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k]; }); }
  // A shuffled order (Fisher-Yates), then each gives to the next and the last to the first: one cycle through everyone, so
  // to[i] !== i for every i (n >= 2), and each of the (n-1)! cycles is equally likely.
  function circle(seed, n) {
    var r = C.mulberry32(C.hash32("bwichtel|" + seed)), a = [], to = [], i, j, x;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); x = a[i]; a[i] = a[j]; a[j] = x; }
    a.forEach(function (v, at) { to[v] = a[(at + 1) % n]; });
    return to;
  }
  // After the setup the link holds one more move, replaced by every newer one: the sign-ups [[name, key], ...] or, once
  // drawn, [names, ephemeral key, boxes] (src/siegel.js). The draw drops the keys, so twelve names still fit a link.
  var KEY = /^[A-Za-z0-9_-]{87}$/, BOX = /^[A-Za-z0-9_-]{12}$/, MAX = 12;
  function nameOk(s) { return typeof s === "string" && !!Q.clean(s, 12) && Q.clean(s, 12) === s; }
  function apart(a) { return new Set(a.map(Q.fold)).size === a.length; }
  function roster(v) {
    return Array.isArray(v) && v.length >= 1 && v.length <= MAX && v.every(function (e) { return Array.isArray(e) && e.length === 2 && nameOk(e[0]) && typeof e[1] === "string" && KEY.test(e[1]); }) &&
      apart(v.map(function (e) { return e[0]; })) && new Set(v.map(function (e) { return e[1]; })).size === v.length;
  }
  function isDraw(v) {
    return Array.isArray(v) && v.length === 3 && Array.isArray(v[0]) && v[0].length >= 3 && v[0].length <= MAX && v[0].every(nameOk) && apart(v[0]) &&
      typeof v[1] === "string" && KEY.test(v[1]) && Array.isArray(v[2]) && v[2].length === v[0].length && v[2].every(function (x) { return typeof x === "string" && BOX.test(x); });
  }
  function later(m) { return m.length > 1 ? m[1][0] : null; }
  function drawn(m) { var x = later(m); return isDraw(x) ? x : null; }
  function people(m) { var x = later(m); return !x ? [] : isDraw(x) ? x[0] : x.map(function (e) { return e[0]; }); }
  // The slip of the person whose recipient is `to` (the index the sealed box gave back on her phone).
  function slip(doc, m, to, lang) {
    var X = T(lang), n = people(m), k = KINDS[m[0][1][0]];
    return [fmt(X.bw_you, { n: n[to] }), k === "dank" ? X.bw_k_dank_do : fmt(X.bw_cap, { n: Tn.upTo(EURO[m[0][0][0]], lang) }),
      fmt(X.bw_on, { d: Tn.dayText(m[0][2], lang) })].concat(k === "dank" ? [] : [X["bw_k_" + k + "_do"]]);
  }
  function either(v) { return roster(v) || isDraw(v); }
  var bwichteln = {
    snap: 1,   // the setup stays; the newer sign-ups, then the draw, replace the move after it (turns.js play)
    turns: [
      [{ w: "pick", l: "bw_budget", n: 1, auto: true, from: function (doc, m, now, lang) { return EURO.map(function (n) { return Tn.upTo(n, lang); }); } },
       { w: "pick", l: "bw_kind", n: 1, auto: true, from: function (doc, m, now, lang) { return KINDS.map(function (k) { return T(lang)["bw_k_" + k]; }); } },
       { w: "day", l: "bw_day", org: true }],
      [{ w: "bw", l: "bw_join", live: true, ok: either }],
      // after the draw nothing goes out any more: each phone only opens its own slip (end: no main button)
      [{ w: "bw", l: "bw_join", live: true, ok: either, end: function (doc, m) { return !!drawn(m); }, title: function (doc, lang) { return T(lang)[drawn(Tn.moves(doc)) ? "bw_me" : "bw_join"]; } }]
    ],
    words: { you_start: "bw_start", go_first: "bw_go_first", go_play: "bw_go_play", note_turn: "bw_note", note_over: "bw_note", ready: "bw_ready", send: "inv_send", rematch: "bw_again" },
    face: function (doc, m, lang) { if (!m.length) return null; var X = T(lang); return [fmt(X.bw_count, { n: people(m).length }), fmt(X.bw_on, { d: Tn.dayText(m[0][2], lang) }), drawn(m) ? X.bw_tap : X.bw_tap_in]; },
    result: function (doc, m, lang) { return { h: T(lang).bw_h, lines: [T(lang).bw_tap] }; },
    wsw: { link: ["name", "zahl", "termin"], tage: 0, plus: function (lang) { return T(lang).bw_wsw; } }, notes: ["biz_free", "bw_br"]
  };
  var wichtelidee = Tn.giftGame([5, 10, 15, 20], false, { notes: ["gf_lang", "biz_free", "wi_br"] });
  var CARDS = { bwichteln: bwichteln, wichtelidee: wichtelidee };
  Object.keys(CARDS).forEach(function (k) { if (!Tn.GAMES[k]) { Tn.GAMES[k] = CARDS[k]; Tn.IDS.push(k); } });
  var api = { circle: circle, slip: slip, people: people, drawn: drawn, roster: roster, isDraw: isDraw, EURO: EURO, KINDS: KINDS, MAX: MAX, CARDS: Object.keys(CARDS) };
  if (node) module.exports = api; else root.BizGames = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
