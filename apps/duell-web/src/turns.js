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
  function side(s, lang) { var a = s.split("||"); return a[lang === "en" ? 1 : 0].split("|"); }
  function asks(doc) { return mix(doc, "frag", DATA.ask.length).slice(0, 5); }
  function askText(doc, i, lang) { return side(DATA.ask[asks(doc)[i]], lang); }
  function fives(key, l) {
    return [0, 1, 2, 3, 4].map(function (i) {
      return { w: "pick", n: 1, auto: true, l: key, top: function (doc, m, lang) { return fmt(T(lang)[key], { q: askText(doc, i, lang)[0] }); }, from: function (doc, m, now, lang) { return askText(doc, i, lang).slice(1); } };
    });
  }
  function eithers(doc) { return mix(doc, "either", DATA.either.length).slice(0, 10); }
  function tens() {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) {
      return { w: "pick", n: 1, auto: true, l: "snack_q", from: function (doc, m, now, lang) { return pair(DATA.either, eithers(doc)[i], lang).split(lang === "en" ? " or " : " oder "); } };
    });
  }
  function score(a, b) { var n = 0; a.forEach(function (x, i) { if (x[0] === b[i][0]) n++; }); return n; }
  GAMES.kennst = {
    turns: [fives("ken_self"), fives("ken_guess").concat(fives("ken_self")), fives("ken_guess")],
    result: function (doc, m, lang) {
      var X = T(lang), a = score(m[0], m[1].slice(0, 5)), b = score(m[1].slice(5), m[2]);
      return { h: a + b >= 7 ? X.ken_top : fmt(X.ken_head, { a: a, b: b }), lines: [fmt(X.ken_head, { a: a, b: b })] };
    }
  };
  GAMES.snack = {
    turns: [tens(), tens()],
    result: function (doc, m, lang) {
      var X = T(lang), n = score(m[0], m[1]), e = eithers(doc), diff = e.filter(function (x, i) { return m[0][i][0] !== m[1][i][0]; }).slice(0, 2);
      return { h: fmt(X.snack_h, { n: n }), lines: [n >= 7 ? X.snack_top : X.snack_low].concat(diff.map(function (i) { return fmt(X.snack_fight, { o: pair(DATA.either, i, lang) }); })) };
    }
  };
  function tasks(doc, m, now, lang) { return DATA.tasks.map(function (x, i) { return pair(DATA.tasks, i, lang); }); }
  GAMES.teilen = {
    turns: [[{ w: "alloc", l: "teil_bid", sum: 10, step: 1, from: tasks }], [{ w: "alloc", l: "teil_bid", sum: 10, step: 1, from: tasks }]],
    result: function (doc, m, lang) {
      var X = T(lang), a = [], b = [], l = tasks(doc, m, [], lang), tie = mix(doc, "teil", 4), want = function (s, i) { return s[0][i]; };
      l.forEach(function (x, i) {
        var d = m[0][0][i] - m[1][0][i], first = d > 0 || (d === 0 && tie[i] % 2 === 0);
        (first ? a : b).push(x);
      });
      return { h: X.teil_h, lines: [fmt(X.teil_a, { w: a.join(", ") || "-" }), fmt(X.teil_b, { w: b.join(", ") || "-" })] };
    }
  };
  GAMES.wette = {
    gateFrom: 1,
    turns: [
      [{ w: "pick", l: "wet_pick", n: 1, from: function (doc, m, now, lang) { return DATA.vows.map(function (x, i) { return pair(DATA.vows, i, lang); }); } }, { w: "slide", l: "wet_days", min: 1, max: 7, def: 3 }],
      [{ w: "pick", l: "wet_judge", n: 1, from: function (doc, m, now, lang) { return [T(lang).wet_yes, T(lang).wet_no]; } }]
    ],
    gate: function (doc, m) { return m.length === 1 ? doc.o : 0; },
    peekWhole: function (doc, m, lang) { return m.length === 1 ? pair(DATA.vows, m[0][0][0], lang) : ""; },
    result: function (doc, m, lang) { var X = T(lang); return { h: m[1][0][0] === 0 ? X.wet_done : X.wet_fail, lines: [pair(DATA.vows, m[0][0][0], lang)].concat(m[1][0][0] === 0 ? [] : [DATA.forfeit[0].split("|")[lang === "en" ? 1 : 0]]) }; }
  };
  GAMES.luecke = {
    turns: [
      [{ w: "pick", l: "luck_pick", n: 1, from: function (doc, m, now, lang) { return DATA.stories.map(function (s, i) { return s.split("||")[lang === "en" ? 1 : 0].split(" ").slice(0, 3).join(" ") + " ..."; }); } }],
      [{ w: "list", l: "luck_fill", n: 6, max: 18, hints: function (lang) { return side(DATA.hints[0], lang); } }]
    ],
    result: function (doc, m, lang) {
      var s = DATA.stories[m[0][0][0]].split("||")[lang === "en" ? 1 : 0], w = m[1][0];
      return { h: T(lang).luck_h, lines: [s.replace(/\{(\d)\}/g, function (x, i) { return w[i]; })] };
    }
  };
  GAMES.socke = {
    turns: [[{ w: "slide", l: "soc_limit", min: 10, max: 200, def: 50 }], [{ w: "slide", l: "soc_bid", min: 10, max: 200, def: 50 }]],
    result: function (doc, m, lang) {
      var X = T(lang), a = m[0][0], b = m[1][0];
      return { h: fmt(X.soc_h, { n: a + b }), lines: [a === b ? X.soc_tie : fmt(X.soc_win, { w: a > b ? X.first : X.second })] };
    }
  };
  function cards(doc) { return mix(doc, "karten", 12).slice(0, 5).map(function (i) { return i % 6 + 1; }); }
  function says() {
    return [0, 1, 2, 3, 4].map(function (i) {
      return { w: "pick", n: 1, auto: true, l: "blf_say", top: function (doc, m, lang) { return fmt(T(lang).blf_say, { n: i + 1, v: cards(doc)[i] }); }, from: function (doc) { var o = []; for (var v = cards(doc)[i]; v <= 6; v++) o.push(String(v)); return o; } };
    });
  }
  function checks() {
    return [0, 1, 2, 3, 4].map(function (i) {
      return { w: "pick", n: 1, auto: true, l: "blf_see", top: function (doc, m, lang) { return fmt(T(lang).blf_see, { n: i + 1, v: cards(doc)[i] + m[0][i][0] }); }, from: function (doc, m, now, lang) { return [T(lang).blf_yes, T(lang).blf_no]; } };
    });
  }
  GAMES.bluff = {
    turns: [says(), checks()],
    result: function (doc, m, lang) {
      var X = T(lang), c = cards(doc), a = 0, b = 0, lines = [];
      c.forEach(function (t, i) {
        var said = t + m[0][i][0], open = m[1][i][0] === 1;
        if (!open) a += said; else if (said === t) a += t + 2; else b += said;
        lines.push(fmt(X.blf_line, { c: said, t: t }));
      });
      return { h: fmt(X.blf_h, { a: a, b: b }), lines: lines };
    }
  };
  function jobs(doc, m, now, lang) { return DATA.jobs.map(function (x, i) { return pair(DATA.jobs, i, lang); }); }
  GAMES.auftrag = {
    turns: [[{ w: "pick", l: "job_pick", n: 1, from: jobs }], [{ w: "pick", l: "job_pick", n: 1, from: jobs }]],
    result: function (doc, m, lang) { var X = T(lang), l = jobs(doc, m, [], lang); return { h: X.job_h, lines: [fmt(X.job_a, { w: l[m[1][0][0]] }), fmt(X.job_b, { w: l[m[0][0][0]] })] }; }
  };
  function listOf(k) { return function (doc, m, now, lang) { return DATA[k].map(function (x, i) { return pair(DATA[k], i, lang); }); }; }
  function wheel(k, l) { return { w: "pick", n: 1, auto: true, l: l, from: function (doc, m, now, lang) { return mix(doc, k, DATA[k].length).slice(0, 4).map(function (i) { return pair(DATA[k], i, lang); }); } }; }
  function excuse(doc, m, lang) { var w = ["who", "what", "why"].map(function (k, i) { return pair(DATA[k], mix(doc, k, DATA[k].length)[m[0][i][0]], lang); }); return w.join(" "); }
  GAMES.ausrede = {
    turns: [[wheel("who", "aus_who"), wheel("what", "aus_what"), wheel("why", "aus_why")],
      [{ w: "pick", n: 1, auto: true, l: "aus_stamp", top: function (doc, m, lang) { return excuse(doc, m, lang); }, from: function (doc, m, now, lang) { var X = T(lang); return [X.aus_s0, X.aus_s1, X.aus_s2]; } }]],
    result: function (doc, m, lang) { var X = T(lang); return { h: [X.aus_s0, X.aus_s1, X.aus_s2][m[1][0][0]], lines: [excuse(doc, m, lang)] }; }
  };
  GAMES.gutschein = {
    turns: [[{ w: "pick", n: 3, l: "gut_pick", from: listOf("vouchers") }],
      [{ w: "pick", n: 1, l: "gut_take", from: function (doc, m, now, lang) { return m[0][0].map(function (i) { return pair(DATA.vouchers, i, lang); }); } }]],
    result: function (doc, m, lang) { var X = T(lang), l = m[0][0].map(function (i) { return pair(DATA.vouchers, i, lang); }); return { h: X.gut_h, lines: [fmt(X.gut_used, { w: l[m[1][0][0]] })] }; }
  };
  function fields(doc, m, now, lang) { return [1, 2, 3, 4, 5, 6].map(function (n) { return fmt(T(lang).rub_field, { n: n }); }); }
  GAMES.rubbellos = {
    turns: [[{ w: "pick", n: 1, l: "rub_prize", from: listOf("prizes") }, { w: "pick", n: 1, l: "rub_hide", from: fields }], [{ w: "pick", n: 3, l: "rub_try", from: fields }]],
    result: function (doc, m, lang) {
      var X = T(lang), at = m[0][1][0];
      return m[1][0].indexOf(at) >= 0 ? { h: fmt(X.rub_win, { w: pair(DATA.prizes, m[0][0][0], lang) }), lines: [fmt(X.rub_was, { n: at + 1 })] } : { h: X.rub_lose, lines: [fmt(X.rub_was, { n: at + 1 })] };
    }
  };
  GAMES.urkunde = {
    local: true, turns: [[{ w: "pick", n: 1, l: "urk_what", from: listOf("awards") }, { w: "slide", l: "urk_a", min: 0, max: 10, def: 5 }, { w: "slide", l: "urk_b", min: 0, max: 10, def: 5 }, { w: "slide", l: "urk_c", min: 0, max: 10, def: 5 }]],
    result: function (doc, m, lang) { var X = T(lang), sum = m[0][1] + m[0][2] + m[0][3]; return { h: fmt(X.urk_h, { r: X["urk_" + (sum >= 24 ? 3 : sum >= 16 ? 2 : sum >= 8 ? 1 : 0)] }), lines: [pair(DATA.awards, m[0][0][0], lang)] }; }
  };
  function three(m) { return m[0][0]; }
  GAMES.luege = {
    turns: [[{ w: "list", l: "lie_write", n: 3, max: 44 }, { w: "pick", n: 1, l: "lie_which", from: function (doc, m, now) { return now[0]; } }],
      [{ w: "pick", n: 1, l: "lie_guess", from: function (doc, m) { return three(m); } }]],
    result: function (doc, m, lang) { var X = T(lang), at = m[0][1][0]; return { h: m[1][0][0] === at ? X.lie_ok : X.lie_no, lines: [fmt(X.lie_was, { s: three(m)[at] })] }; }
  };
  function letter(doc) { return DATA.letters[doc.seed % DATA.letters.length]; }
  function blitzHint(lang) { return side(DATA.cats[0], lang); }
  function blitzBox() { return { w: "list", l: "blz_go", n: 6, max: 16, loose: true, title: function (doc, lang) { return fmt(T(lang).blz_go, { l: letter(doc) }); }, hints: blitzHint, keep: function (x, doc) { return Q.fold(x).charAt(0) === letter(doc).toLowerCase(); } }; }
  GAMES.blitz = {
    turns: [[blitzBox()], [blitzBox()]],
    result: function (doc, m, lang) {
      var X = T(lang), a = m[0][0].map(Q.fold), b = m[1][0].map(Q.fold), good = function (l, o) { return l.filter(function (x) { return x && o.indexOf(x) < 0 && x.charAt(0) === letter(doc).toLowerCase(); }).length; };
      var same = m[0][0].filter(function (x) { return x && b.indexOf(Q.fold(x)) >= 0; });
      return { h: fmt(X.blz_h, { a: good(a, b), b: good(b, a) }), lines: [fmt(X.blz_go, { l: letter(doc) })].concat(same.length ? [fmt(X.blz_same, { w: same.join(", ") })] : []) };
    }
  };
  function fight(doc, lang) { return pair(DATA.fights, doc.seed % DATA.fights.length, lang); }
  GAMES.recht = {
    turns: [[{ w: "text", l: "rec_a", max: 44 }], [{ w: "text", l: "rec_b", max: 44 }],
      [{ w: "pick", n: 1, l: "rec_who", top: function (doc, m, lang) { return fight(doc, lang) + " A: " + m[0][0] + " B: " + m[1][0]; }, from: function (doc, m, now, lang) { return [T(lang).first, T(lang).second]; } }, { w: "pick", n: 1, l: "rec_why", from: listOf("verdicts") }]],
    result: function (doc, m, lang) { var X = T(lang); return { h: fmt(X.rec_h, { w: m[2][0][0] ? X.second : X.first }), lines: [fmt(X.rec_case, { f: fight(doc, lang) }), m[0][0], m[1][0], pair(DATA.verdicts, m[2][1][0], lang)] }; }
  };
  GAMES.morgen = {
    gateFrom: 1,
    turns: [[{ w: "pick", n: 1, l: "mor_pick", from: listOf("lifts") }, { w: "slide", l: "mor_days", min: 1, max: 7, def: 1 }], [{ w: "show", l: "mor_open", list: function (doc, m, now, lang) { return [pair(DATA.lifts, m[0][0][0], lang)]; } }]],
    gate: function (doc, m) { return m.length === 1 ? doc.o : 0; },
    result: function (doc, m, lang) { return { h: T(lang).mor_h, lines: [pair(DATA.lifts, m[0][0][0], lang)] }; }
  };
  function envs(lang) { return side(DATA.envs[0], lang); }
  GAMES.umschlag = {
    turns: [[{ w: "text", l: "env_a", max: 44 }, { w: "text", l: "env_b", max: 44 }, { w: "text", l: "env_c", max: 44 }],
      [{ w: "pick", n: 1, l: "env_pick", from: function (doc, m, now, lang) { return envs(lang); } }]],
    result: function (doc, m, lang) { var i = m[1][0][0]; return { h: envs(lang)[i], lines: [m[0][i]] }; }
  };
  function numbers(doc, m, now, lang) { return [1, 2, 3].map(function (n) { return fmt(T(lang).rad_n, { n: n }); }); }
  GAMES.rad = {
    turns: [[{ w: "pick", n: 3, l: "rad_pick", from: listOf("fates2") }], [{ w: "pick", n: 1, auto: true, l: "rad_spin", from: numbers }]],
    result: function (doc, m, lang) { var o = mix(doc, "rad", 3); return { h: T(lang).rad_h, lines: [pair(DATA.fates2, m[0][0][o[m[1][0][0]]], lang)] }; }
  };
  // Same seed, same blocks: both sides play the identical stream, and the receiver replays the moves instead of trusting a score.
  var SIZE = 8, MAX_BLOCKS = 40;
  var BLOCKS = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [1, 1]]];
  function blockAt(doc, i) { var r = C.mulberry32(C.hash32("steine|" + doc.seed)), v = 0; for (var k = 0; k <= i; k++) v = r(); return BLOCKS[Math.floor(v * BLOCKS.length)]; }
  function fits(grid, block, at) {
    var x = at % SIZE, y = Math.floor(at / SIZE);
    return block.every(function (c) { var cx = x + c[0], cy = y + c[1]; return cx < SIZE && cy < SIZE && !grid[cy * SIZE + cx]; });
  }
  function drop(st, block, at) {
    var x = at % SIZE, y = Math.floor(at / SIZE), g = st.grid.slice(), rows = [], cols = [], i, j;
    block.forEach(function (c) { g[(y + c[1]) * SIZE + x + c[0]] = 1; });
    for (i = 0; i < SIZE; i++) {
      var r = true, k = true;
      for (j = 0; j < SIZE; j++) { if (!g[i * SIZE + j]) r = false; if (!g[j * SIZE + i]) k = false; }
      if (r) rows.push(i); if (k) cols.push(i);
    }
    rows.forEach(function (r) { for (j = 0; j < SIZE; j++) g[r * SIZE + j] = 0; });
    cols.forEach(function (c) { for (j = 0; j < SIZE; j++) g[j * SIZE + c] = 0; });
    var n = rows.length + cols.length;
    return { grid: g, score: st.score + block.length + n * n * 10, lines: n, i: st.i + 1 };
  }
  function replay(doc, cells) {
    var st = { grid: new Array(SIZE * SIZE).fill(0), score: 0, lines: 0, i: 0 };
    for (var n = 0; n < cells.length; n++) { var b = blockAt(doc, st.i); if (!fits(st.grid, b, cells[n])) return null; st = drop(st, b, cells[n]); }
    return st;
  }
  function canMove(st, doc) { var b = blockAt(doc, st.i); for (var a = 0; a < SIZE * SIZE; a++) if (fits(st.grid, b, a)) return true; return false; }
  function blocksPrompt() { return { w: "blocks", l: "blk_go", max: MAX_BLOCKS, auto: true }; }
  GAMES.steine = {
    turns: [[blocksPrompt()], [blocksPrompt()]],
    result: function (doc, m, lang) {
      var X = T(lang), a = replay(doc, m[0][0]).score, b = replay(doc, m[1][0]).score;
      return { h: a === b ? X.blk_tie : fmt(X.blk_h, { a: a, b: b }), lines: [X.blk_fair] };
    }
  };
  // ---------- one phone in the room: nothing leaves the device, the moves only pass from hand to hand ----------
  function offers(doc, lang) { return side(DATA.sets[doc.seed % DATA.sets.length], lang); }
  function struck(doc, m, lang) {
    var left = offers(doc, lang).map(function (x, i) { return i; });
    m.forEach(function (t) { left.splice(t[0][0], 1); });
    return left;
  }
  function strike() { return [{ w: "pick", l: "str_pick", n: 1, auto: true, from: function (doc, m, now, lang) { var o = offers(doc, lang); return struck(doc, m, lang).map(function (i) { return o[i]; }); } }]; }
  GAMES.streichen = {
    local: true, turns: [strike(), strike(), strike(), strike(), strike(), strike()],
    result: function (doc, m, lang) { var X = T(lang); return { h: fmt(X.str_h, { o: offers(doc, lang)[struck(doc, m, lang)[0]] }), lines: [X.str_note] }; }
  };
  GAMES.finger = {
    local: true, turns: [[{ w: "touch", l: "fin_pick", auto: true }]],
    result: function (doc, m, lang) { return { h: T(lang).fin_h, lines: [T(lang).fin_note] }; }
  };
  GAMES.erklaeren = {
    local: true, turns: [[{ w: "explain", l: "exp_go", auto: true, secs: 60, max: 99, list: function (doc, lang) { return mix(doc, "erkl", DATA.words.length).map(function (i) { return pair(DATA.words, i, lang); }); } }]],
    result: function (doc, m, lang) { return { h: fmt(T(lang).exp_h, { n: m[0][0] }), lines: [T(lang).exp_note] }; }
  };
  function sorryAsk(i) { return { w: "pick", l: "sor_" + (i + 1), n: 1, auto: true, from: function (doc, m, now, lang) { return DATA.sorry[i][lang === "en" ? 1 : 0].split("|"); } }; }
  GAMES.sorry = {
    local: true, turns: [[sorryAsk(0), sorryAsk(1), sorryAsk(2)]],
    result: function (doc, m, lang) {
      var text = m[0].map(function (a, i) { return DATA.sorry[i][lang === "en" ? 1 : 0].split("|")[a[0]]; }).join(" ");
      return { h: T(lang).sor_h, lines: [text], copy: text, note: T(lang).sor_note };
    }
  };
  GAMES.kapsel.gateFrom = 1;
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
    if (p.w === "show" || p.w === "touch") return v === 0;
    if (p.w === "explain") return intIn(v, 0, p.max);
    if (p.w === "blocks") return Array.isArray(v) && v.length <= p.max && v.every(function (x) { return intIn(x, 0, 63); }) && !!replay(doc, v);
    if (p.w === "slide") return intIn(v, p.min || 0, p.max);
    if (p.w === "text") return typeof v === "string" && !!Q.clean(v, p.max) && Q.clean(v, p.max) === v && !(p.oneWord && /\s/.test(v)) && !(p.bad && p.bad(v, doc, lang));
    if (p.w === "list" && p.loose) return Array.isArray(v) && v.length === p.n && v.every(function (x) { return x === "" || (typeof x === "string" && Q.clean(x, p.max) === x); });
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
    if (GAMES[d.g].gateFrom && st.turn === 0) d.o = today + answers[1];
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
  var api = { IDS: IDS, SHAPES: SHAPES, GAMES: GAMES, T: T, sanitize: sanitize, fromIdea: fromIdea, seal: seal, unseal: unseal, moves: moves, state: state, play: play, result: result, gate: gate, whole: whole, fresh: fresh, today: today, SIZE: SIZE, blockAt: blockAt, fits: fits, drop: drop, replay: replay, canMove: canMove, okAnswer: okAnswer, strings: strings };
  if (node) module.exports = api; else root.Turns = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
