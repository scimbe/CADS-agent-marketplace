/* Cards for working together: a poll, feedback, handing out tasks, an agenda. They join the GAMES table of turns.js,
   so the link carries the whole card exactly like every other turn, and both the daily app and the business build
   can offer them. Pure logic (no DOM). Each person adds one move and passes the new link on. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("./turns.js") : root.Turns;
  var Q = node ? require("./quest.js") : root.Quest;
  var TEXT = node ? require("./office.json") : root.OfficeData;
  // Up to this many people in one link: with the longest answers the whole card still fits the link (core.js MAX_FRAGMENT)
  // with room for an organisation's colours, see office.test.js.
  var VOTERS = 10, RATERS = 6, TAKERS = 5, HELPERS = 6;

  Object.keys(TEXT).forEach(function (l) { Object.assign(Tn.T(l), TEXT[l]); });
  function T(lang) { return Tn.T(lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k]; }); }
  function times(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
  function filled(list) { return (list || []).filter(Boolean); }
  function same(a, b) { return Q.fold(a) === Q.fold(b); }
  // A name comes up once per poll, so nobody votes twice under the same name by accident.
  function nameField(l, taken) { return { w: "text", l: l, max: 16, bad: function (v, doc, lang, m) { return !!taken && taken(m).some(function (n) { return same(n, v); }); } }; }

  // ---------- poll: one question, two to four answers, everyone picks one ----------
  function pollOpts(m, now) { return filled(m.length ? m[0][2] : now[2]); }
  function pollNames(m) { return m.map(function (t) { return t[0]; }); }
  function pollVotes(m) { return [m[0][3][0]].concat(m.slice(1).map(function (t) { return t[1][0]; })); }
  function pollCount(m) { var c = pollOpts(m).map(function () { return 0; }); pollVotes(m).forEach(function (v) { c[v]++; }); return c; }
  function pollHead(m, lang) {
    var o = pollOpts(m), c = pollCount(m), top = Math.max.apply(null, c), lead = o.filter(function (s, i) { return c[i] === top; });
    return lead.length > 1 ? fmt(T(lang).umf_tie, { s: lead.join(" · ") }) : fmt(T(lang).umf_lead, { s: lead[0] });
  }
  function pollLines(m, lang) {
    var c = pollCount(m);
    return pollOpts(m).map(function (s, i) { return { s: s, n: c[i], i: i }; }).sort(function (a, b) { return b.n - a.n || a.i - b.i; })
      .map(function (x) { return fmt(T(lang).umf_line, { s: x.s, n: x.n }); });
  }
  var umfrage = {
    turns: [[nameField("umf_name", null), { w: "text", l: "umf_q", max: 60 }, { w: "list", l: "umf_opts", n: 4, max: 24, loose: true, least: 2 },
      { w: "pick", l: "umf_mine", n: 1, from: function (doc, m, now) { return pollOpts(m, now); } }]]
      .concat(times(VOTERS - 1, function () {
        return [nameField("umf_name", pollNames), { w: "pick", l: "umf_pick", n: 1, top: function (doc, m) { return m[0][1]; }, from: function (doc, m) { return pollOpts(m); },
          peek: function (doc, m, now, lang) { return pollHead(m, lang); } }];
      })),
    face: function (doc, m, lang) { return m.length ? [m[0][1], pollHead(m, lang), fmt(T(lang).off_count, { n: m.length })] : null; },
    result: function (doc, m, lang) { return { h: pollHead(m, lang), lines: [m[0][1]].concat(pollLines(m, lang)) }; }
  };

  // ---------- feedback: a topic, then a score from 1 to 5 and an optional note, without names ----------
  function rates(m) { return m.slice(1).map(function (t) { return t[0]; }); }
  function notes(m) { return filled(m.slice(1).map(function (t) { return t[1][0]; })); }
  function mean(m, lang) { var r = rates(m), s = r.reduce(function (a, b) { return a + b; }, 0) / r.length; return s.toLocaleString(lang === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 1 }); }
  function fbHead(m, lang) { return m.length > 1 ? fmt(T(lang).fb_mean, { a: mean(m, lang), n: m.length - 1 }) : T(lang).fb_none; }
  var feedback = {
    turns: [[{ w: "text", l: "fb_topic", max: 60 }]].concat(times(RATERS, function () {
      return [{ w: "slide", l: "fb_rate", min: 1, max: 5, def: 3, peek: function (doc, m) { return m[0][0]; } }, { w: "list", l: "fb_note", n: 1, max: 30, loose: true }];
    })),
    face: function (doc, m, lang) { return m.length ? [m[0][0], fbHead(m, lang), T(lang).fb_anon] : null; },
    result: function (doc, m, lang) { return { h: fbHead(m, lang), lines: [m[0][0]].concat(notes(m).slice(-4).map(function (s) { return "„" + s + "“"; })) }; }
  };

  // ---------- tasks: a list of jobs, everyone takes one that is still open, until none is left ----------
  function jobs(m) { return filled(m[0][1]); }
  // Who took which job, in the order of the list. A pick counts among the jobs still open at that move.
  function owners(m) {
    var all = jobs(m), who = all.map(function () { return ""; });
    m.slice(1).forEach(function (t) { var open = all.map(function (s, i) { return i; }).filter(function (i) { return !who[i]; }); who[open[t[1][0]]] = t[0]; });
    return who;
  }
  function openJobs(m) { var w = owners(m); return jobs(m).filter(function (s, i) { return !w[i]; }); }
  function jobHead(m, lang) { var all = jobs(m), left = openJobs(m).length; return left ? fmt(T(lang).auf_left, { n: all.length - left, m: all.length }) : T(lang).auf_done; }
  function jobLines(m, lang) { var w = owners(m); return jobs(m).map(function (s, i) { return fmt(w[i] ? T(lang).auf_line : T(lang).auf_free, { s: s, n: w[i] }); }); }
  var aufgaben = {
    turns: [[{ w: "text", l: "auf_what", max: 40 }, { w: "list", l: "auf_jobs", n: TAKERS, max: 24, loose: true, least: 2 }]].concat(times(TAKERS, function () {
      return [{ w: "text", l: "auf_name", max: 16 }, { w: "pick", l: "auf_pick", n: 1, top: function (doc, m) { return m[0][0]; }, from: function (doc, m) { return openJobs(m); },
        peek: function (doc, m, now, lang) { return jobHead(m, lang); } }];
    })),
    ends: function (doc, m) { return m.length > 1 && !openJobs(m).length; },
    face: function (doc, m, lang) { return m.length ? [m[0][0], jobHead(m, lang)].concat(jobLines(m, lang).slice(0, 3)) : null; },
    result: function (doc, m, lang) { return { h: m[0][0], lines: jobLines(m, lang) }; }
  };

  // ---------- agenda: a meeting title and first points, everyone adds one point with their name ----------
  function points(m) { return filled(m[0][1]).map(function (s) { return { s: s, n: m[0][2] }; }).concat(m.slice(1).map(function (t) { return { s: t[1], n: t[0] }; })); }
  function agendaLines(m, lang) { return points(m).map(function (p, i) { return fmt(T(lang).age_line, { i: i + 1, s: p.s, n: p.n }); }); }
  var agenda = {
    turns: [[{ w: "text", l: "age_title", max: 40 }, { w: "list", l: "age_first", n: 3, max: 30, loose: true, least: 1 }, { w: "text", l: "age_name", max: 16 }]].concat(times(HELPERS, function () {
      return [{ w: "text", l: "age_name", max: 16 }, { w: "text", l: "age_add", max: 30, top: function (doc, m) { return m[0][0]; },
        peek: function (doc, m, now, lang) { return fmt(T(lang).age_count, { n: points(m).length }); },
        bad: function (v, doc, lang, m) { return points(m).some(function (p) { return same(p.s, v); }); } }];
    })),
    face: function (doc, m, lang) { return m.length ? [m[0][0]].concat(agendaLines(m, lang).slice(-4)) : null; },
    result: function (doc, m, lang) { return { h: m[0][0], lines: agendaLines(m, lang) }; },
    call: true   // the card offers to start the meeting in the webconference
  };

  var CARDS = { umfrage: umfrage, feedback: feedback, aufgaben: aufgaben, agenda: agenda };
  Object.keys(CARDS).forEach(function (k) { if (!Tn.GAMES[k]) { Tn.GAMES[k] = CARDS[k]; Tn.IDS.push(k); } });
  var api = { CARDS: Object.keys(CARDS), pollCount: pollCount, owners: owners, openJobs: openJobs, points: points, face: function (doc, lang) { var g = Tn.GAMES[doc.g]; return g && g.face ? g.face(doc, Tn.moves(doc), lang) : null; } };
  if (node) module.exports = api; else root.Office = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
