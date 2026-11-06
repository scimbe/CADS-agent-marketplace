/* Daily Business only: the season's two Secret Santa cards (Katalog v2, wave V1). They join the GAMES table of turns.js like
   office.js does, but only in this flavor's core (scripts/build.js puts this file before flavor.js); their words are in
   this flavor's turn.json. Pure logic (no DOM).
   - bwichteln (biz-wichteln): names, budget, kind and day; each person taps their own name and sees only their own slip.
     The draw is one closed circle from the seed in the link, so nobody draws themselves. The phone that opened a slip
     keeps that name (widget "me", part turnzwei); the honest note on the slip says what a link reader could still do.
   - wichtelidee (biz-wichtel-ideen): the gift cards' questions (turns.js giftGame) for a colleague, smaller budgets. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("../../turns.js") : root.Turns, C = node ? require("../../core.js") : root.DuellCore;
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
  function people(m) { return m[0][0].filter(Boolean); }
  function slip(doc, m, me, lang) {
    var X = T(lang), n = people(m), k = KINDS[m[0][2][0]];
    return [fmt(X.bw_you, { n: n[circle(doc.seed, n.length)[me]] }), k === "dank" ? X.bw_k_dank_do : fmt(X.bw_cap, { n: Tn.upTo(EURO[m[0][1][0]], lang) }),
      fmt(X.bw_on, { d: Tn.dayText(m[0][3], lang) })].concat(k === "dank" ? [] : [X["bw_k_" + k + "_do"]]);
  }
  var bwichteln = {
    stay: true,
    turns: [
      [{ w: "list", l: "bw_names", n: 12, max: 12, loose: true, least: 3 },
       { w: "pick", l: "bw_budget", n: 1, auto: true, from: function (doc, m, now, lang) { return EURO.map(function (n) { return Tn.upTo(n, lang); }); } },
       { w: "pick", l: "bw_kind", n: 1, auto: true, from: function (doc, m, now, lang) { return KINDS.map(function (k) { return T(lang)["bw_k_" + k]; }); } },
       { w: "day", l: "bw_day" }],
      [{ w: "me", l: "bw_me", n: 1, auto: true, from: function (doc, m) { return people(m); } },
       { w: "show", l: "bw_slip", list: function (doc, m, now, lang) { return slip(doc, m, now[0][0], lang); }, later: "bw_honest" }]
    ],
    words: { you_start: "bw_start", go_first: "bw_go_first", go_play: "bw_go_play", note_turn: "bw_note", note_over: "bw_note", ready: "bw_ready", send: "inv_send", rematch: "bw_again" },
    face: function (doc, m, lang) { if (!m.length) return null; var X = T(lang); return [fmt(X.bw_count, { n: people(m).length }), fmt(X.bw_on, { d: Tn.dayText(m[0][3], lang) }), X.bw_tap]; },
    result: function (doc, m, lang) { return { h: T(lang).bw_h, lines: [T(lang).bw_tap] }; },
    wsw: { link: ["name", "zahl", "termin"], tage: 0 }, notes: ["biz_free", "bw_br"]
  };
  var wichtelidee = Tn.giftGame([5, 10, 15, 20], false, { notes: ["gf_lang", "biz_free", "wi_br"] });
  var CARDS = { bwichteln: bwichteln, wichtelidee: wichtelidee };
  Object.keys(CARDS).forEach(function (k) { if (!Tn.GAMES[k]) { Tn.GAMES[k] = CARDS[k]; Tn.IDS.push(k); } });
  var api = { circle: circle, slip: slip, EURO: EURO, KINDS: KINDS, CARDS: Object.keys(CARDS) };
  if (node) module.exports = api; else root.BizGames = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
