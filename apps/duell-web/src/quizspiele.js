// Two quiz cards with a fixed, hand-checked pack (src/quizspiele.json), as games of the turn table (turns.js GAMES, like
// office.js). Pure logic (no DOM). The core keeps only the facts (which example is phishing, the estimated prices: build.js
// window.QuizFacts) and the words of the sheet; the examples and the words of the steps come with the part "quiz"
// (window.QuizSpieleData, merged into Turns.T by quizspiele-ui.js) and are read only while someone plays (GAMES[g].part:
// turn-ui.js loads it first), so a link opens and its sheet draws without the part. Every order comes from the seed.
// - phish (biz-quiz-phishing, Business): "Echt oder Phishing?", 10 of 14 made-up mails and texts. Mode f of the quiz engine
//   (quizpack.js): everyone plays alone and sees their own result only on their own phone; the link goes on through the team
//   and carries each person's answers without a name (one number per person). The team result shows from K = 5 people on
//   (rule 18, like office.js), never per person.
// - preis (quiz-preis, Daily): "Was kostet das?", 8 of 12 everyday prices, a slider per price, then the second person; the
//   pair sees who was closer (rule 14: a pair, no table). Prices are rounded, dated estimates, never a brand's price.
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("./turns.js") : root.Turns, C = node ? require("./core.js") : root.DuellCore;
  // k-anonymity (rule 18): the same K as office.js (test/quizspiele.test.js keeps both equal); not required here, so the
  // daily build's turn table stays without the office cards in Node tests.
  var K = 5;
  function anon(n) { return n >= K; }
  var FACTS = node ? (function (d) { return { phish: d.phish, preis: d.preis }; })(require("./quizspiele.json")) : root.QuizFacts;
  var PHISH_N = 10, PEOPLE = 30, PREIS_N = 8, STEP = 5;
  function T(lang) { return Tn.T(lang); }
  // In Node the words of the steps join the turn texts at once; in the page the part does it when it loads.
  if (node) (function (d) { C.langsOf(d).forEach(function (l) { if (d[l].ui) Object.assign(T(l), d[l].ui); }); })(require("./quizspiele.json"));
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function say(lang, k, o) { return fmt(C.form(T(lang), k, o && o.n, lang), o || {}); }
  // The texts of the examples (part "quiz"); null until the part is there. A language reads German where it has nothing.
  function texts(lang) { var d = node ? require("./quizspiele.json") : root.QuizSpieleData; return d ? C.textsFor(d, lang) : null; }
  function mix(doc, tag, n) {
    var r = C.mulberry32(C.hash32("qs|" + doc.seed + "|" + tag)), a = [], i, j, x;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function times(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }
  function num(x, lang, d) { return C.num(x, d == null ? 1 : d, lang).replace(/[.,]0$/, ""); }

  // ---------- phish ----------
  function phishItems(doc) { return mix(doc, "phish", FACTS.phish.ok.length).slice(0, PHISH_N); }
  function isPhish(k) { return FACTS.phish.ok[k] === 1; }
  // One person's move as the screen gives it: the intro (0), per example the pick ([0] real, [1] phishing) and the
  // resolution (0), then the own result (0). In the link it is one number, bit i set when example i was called phishing.
  function full(mask) { var a = [0]; for (var i = 0; i < PHISH_N; i++) a.push([(mask >> i) & 1], 0); a.push(0); return a; }
  function maskOf(answers) { var m = 0; for (var i = 0; i < PHISH_N; i++) m |= (answers[1 + i * 2][0] & 1) << i; return m; }
  function picks(answers) { var o = []; for (var i = 0; i < PHISH_N; i++) { var a = answers[1 + i * 2]; if (!a) break; o.push(a[0]); } return o; }
  function hits(doc, p) { var it = phishItems(doc); return p.filter(function (x, i) { return (x === 1) === isPhish(it[i]); }).length; }
  // The team: how many took part, the mean of right answers and per example how many got it right. Never one person.
  function team(doc, all) {
    var it = phishItems(doc), per = it.map(function () { return 0; }), sum = 0;
    all.forEach(function (a) { var p = picks(a); sum += hits(doc, p); p.forEach(function (x, i) { if ((x === 1) === isPhish(it[i])) per[i]++; }); });
    return { n: all.length, mean: all.length ? sum / all.length : 0, per: per };
  }
  function teamLine(doc, all, lang) {
    var s = team(doc, all);
    if (!s.n) return T(lang).phi_none;
    return anon(s.n) ? say(lang, "phi_team", { a: num(s.mean, lang), m: PHISH_N, n: s.n }) : fmt(T(lang).phi_few, { n: s.n, k: K });
  }
  // The example the team mixed up most (from K people on), with its subject or sender: needs the texts (part "quiz").
  function hardest(doc, all, lang) {
    var s = team(doc, all), X = texts(lang); if (!anon(s.n) || !X) return "";
    var low = 0; s.per.forEach(function (v, i) { if (v < s.per[low]) low = i; });
    if (s.per[low] === s.n) return T(lang).phi_allright;
    var e = X.phish[phishItems(doc)[low]];
    return fmt(T(lang).phi_hard, { s: e.sub || e.from, p: Math.round(s.per[low] / s.n * 100) });
  }
  function phishCard(doc, i, show, lang) {
    var X = texts(lang), k = phishItems(doc)[i];
    return X ? { k: k, e: X.phish[k], phish: isPhish(k), show: show, tag: say(lang, "phi_nr", { i: i + 1, m: PHISH_N }) } : null;
  }
  function draw(card) { return function (box, doc, m, now, lang) { if (root.QuizSpieleUI && card(doc, now, lang)) root.QuizSpieleUI.mail(box, card(doc, now, lang), lang); }; }
  function intro() {
    return { w: "show", l: "phi_intro_h", list: function (doc, m, now, lang) { return [T(lang).phi_intro]; },
      notes: function (doc, m, now, lang) { var L = T(lang); return [root.Bausteine ? root.Kit.t("wsw_h") + " " + root.Bausteine.wsw({ link: ["antwort"], ki: false, server: false, tage: 0 }) : "", L.phi_free, L.phi_br, L.phi_school].filter(Boolean); } };
  }
  function ask(i) {
    return { w: "pick", l: "phi_q", n: 1, auto: true,
      card: draw(function (doc, now, lang) { return phishCard(doc, i, false, lang); }),
      from: function (doc, m, now, lang) { return [T(lang).phi_real, T(lang).phi_fake]; } };
  }
  function why(i) {
    return { w: "show", l: "phi_why_h", list: function (doc, m, now, lang) {
      var k = phishItems(doc)[i], p = now[now.length - 1][0] === 1, ok = p === isPhish(k), L = T(lang);
      return [(ok ? L.phi_right : L.phi_wrong) + " " + (isPhish(k) ? L.phi_is_fake : L.phi_is_real)];
    }, card: draw(function (doc, now, lang) { return phishCard(doc, i, true, lang); }) };
  }
  function mine() {
    return { w: "show", l: "pk_you", list: function (doc, m, now, lang) { return [say(lang, "phi_mine", { n: hits(doc, picks(now)), m: PHISH_N })]; },
      notes: function (doc, m, now, lang) { var all = m.concat([now]); return [T(lang).phi_only_me, teamLine(doc, all, lang), hardest(doc, all, lang)].filter(Boolean); } };
  }
  var phishTurn = [intro()].concat(times(PHISH_N, function (i) { return [ask(i), why(i)]; }).reduce(function (a, b) { return a.concat(b); }, [])).concat([mine()]);
  var phish = {
    part: "quiz",
    turns: times(PEOPLE, function () { return phishTurn; }),
    store: function (t, x) { return maskOf(x); },
    legacy: function (t, raw) { return Number.isInteger(raw) && raw >= 0 && raw < 1 << PHISH_N ? full(raw) : null; },
    words: { you_start: "phi_start", go_first: "phi_go_first", go_play: "phi_go_play", note_turn: "phi_note", note_over: "phi_over", ready: "phi_ready", send: "phi_send", rematch: "phi_again" },
    face: function (doc, m, lang) { return m.length ? [teamLine(doc, m, lang), T(lang).phi_anon] : null; },
    result: function (doc, m, lang) { return { h: teamLine(doc, m, lang), lines: [hardest(doc, m, lang), T(lang).phi_anon].filter(Boolean) }; }
  };

  // ---------- preis ----------
  function preisItems(doc) { return mix(doc, "preis", FACTS.preis.c.length).slice(0, PREIS_N); }
  function cents(k) { return FACTS.preis.c[k]; }
  // The slider's end from the seed: the price sits evenly between 1/5 and 4/5 of it (as often below the middle as above),
  // rounded up to two digits and to the step, so neither the middle nor a round end gives it away (like quizpack.js top).
  function top(doc, i) {
    var z = cents(preisItems(doc)[i]), v = z / (0.2 + 0.6 * C.mulberry32(C.hash32("qs|" + doc.seed + "|top" + i))());
    var p = Math.max(STEP, Math.pow(10, Math.floor(Math.log10(v)) - 1));
    return Math.max(z + STEP, Math.ceil(v / p) * p);
  }
  function off(doc, a) { return Math.round(preisItems(doc).reduce(function (s, k, i) { return s + Math.min(100, Math.abs(a[i] - cents(k)) / cents(k) * 100); }, 0) / PREIS_N); }
  // always with cents (a price slider: "6,00 €" / "€6.00"), as the language writes it
  function money(c, lang) { try { return new Intl.NumberFormat(C.locale(lang), { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(c / 100).replace(/[\u00a0\u202f]/g, " "); } catch (e) { return C.money(c, lang); } }
  function guess(i) {
    return { w: "slide", l: "pre_go", min: 0, max: 999999, step: STEP, maxOf: function (doc) { return top(doc, i); },
      defOf: function (doc) { return Math.round(top(doc, i) / 2 / STEP) * STEP; }, show: money,
      title: function (doc, lang) { return say(lang, "pre_nr", { i: i + 1, m: PREIS_N }); },
      peek: function (doc, m, now, lang) { var X = texts(lang); return X ? fmt(T(lang).pre_q, { s: X.preis[preisItems(doc)[i]].t }) : ""; } };
  }
  var preisTurn = times(PREIS_N, guess);
  var preis = {
    part: "quiz",
    turns: [preisTurn, preisTurn],
    result: function (doc, m, lang) {
      var L = T(lang), a = off(doc, m[0]), b = off(doc, m[1]), X = texts(lang);
      var h = a === b ? L.pre_tie : fmt(L.pre_win, { w: a < b ? L.first : L.second });
      var note = X ? preisItems(doc).map(function (k, i) { return fmt(L.pre_line, { s: X.preis[k].s, p: money(cents(k), lang), a: money(m[0][i], lang), b: money(m[1][i], lang) }); }).join(" · ") : "";
      return { h: h, lines: [fmt(L.pk_off, { w: L.first, n: a }), fmt(L.pk_off, { w: L.second, n: b }), L.pre_src], note: note };
    }
  };

  var CARDS = { phish: phish, preis: preis };
  Object.keys(CARDS).forEach(function (k) { if (!Tn.GAMES[k]) { Tn.GAMES[k] = CARDS[k]; Tn.IDS.push(k); } });
  var api = { K: K, PHISH_N: PHISH_N, PEOPLE: PEOPLE, PREIS_N: PREIS_N, STEP: STEP, phishItems: phishItems, isPhish: isPhish, full: full, maskOf: maskOf, team: team, hits: hits,
    preisItems: preisItems, cents: cents, top: top, off: off, texts: texts };
  if (node) module.exports = api; else root.QuizSpiele = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
