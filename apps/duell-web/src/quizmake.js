// Making a question pack (part "quiz" with quiz-ui.js, and scripts/quiz-packs.js): the server's answer as a pack, the
// biggest moves a pack can get, and the most of a pack that still fits into one link. Pure logic (no DOM). The pack
// itself, its check and its games stay in the core (quizpack.js), because whoever opens a link plays it at once.
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var P = node ? require("./quizpack.js") : root.QuizPack;
  var MODES = P.MODES, MAX_Q = P.MAX_Q, MIN_Q = P.MIN_Q, CHOICE = P.CHOICE, sanitize = P.sanitize, whole = P.whole, game = P.game;
  // The server's option (kind quiz) as a pack: {modus, titel, fragen, typen?}. Text the server did not say stays out.
  function fromOption(opt) {
    if (!opt || typeof opt !== "object" || !MODES[opt.modus] || !Array.isArray(opt.fragen)) return null;
    var m = MODES[opt.modus], o = { t: opt.titel, m: m, q: [] };
    if (m === "g") {
      o.y = (Array.isArray(opt.typen) ? opt.typen : []).map(function (y) { return [y && y.name, y && y.staerke]; });
      o.q = opt.fragen.map(function (q) { return [q && q.f].concat((q && Array.isArray(q.antworten) ? q.antworten : []).map(function (a) { return [a && a.t, a && a.typ]; })); });
    } else {
      o.q = opt.fragen.map(function (q) { return [q && q.f, q && q.a].concat(q && Array.isArray(q.d) ? q.d.slice(0, 3) : []); });
      o.z = opt.fragen.map(function (q) { return q ? whole(q.a) : 0; });
    }
    return sanitize(o);
  }
  // Every text of a pack, e.g. for one more check against a word list.
  function texts(p) { var out = [p.t]; (p.y || []).forEach(function (y) { out.push(y[0], y[1]); }); p.q.forEach(function (q) { q.forEach(function (x) { out.push(Array.isArray(x) ? x[0] : x); }); }); return out; }
  function clean(p, ok) { return texts(p).every(function (s) { return ok(s); }); }
  // The biggest answers each turn can carry, so a pack is only taken when the link still fits after every move.
  function worst(doc) {
    var g = game(doc); if (!g) return [];
    return g.turns.map(function (ps) { return ps.map(function (p) { return p.w === "slide" ? p.maxOf(doc) : p.w === "pick" ? [p.from(doc, [], [], "de").length - 1] : 0; }); });
  }
  // The most of the pack that still fits into one link after every move (the biggest answers each turn can carry):
  // fewer wrong answers first (two instead of three), then fewer questions from the end. Schätzen keeps only its number
  // questions. size(doc) -> the encoded length of the sheet's link part, room: the most it may be. -> pack or null.
  function fit(doc, pk, size, room, seal) {
    var base = JSON.parse(JSON.stringify(pk));
    if (base.m !== "g" && !CHOICE[doc.g]) base.q = base.q.map(function (r) { return r.slice(0, 2); });   // the wrong answers are never shown there
    if (doc.g === "schaetzen" && base.z) { var keep = base.q.map(function (x, i) { return base.z[i] > 0; }); base.q = base.q.filter(function (x, i) { return keep[i]; }); base.z = base.z.filter(function (x, i) { return keep[i]; }); }
    for (var n = Math.min(base.q.length, MAX_Q); n >= MIN_Q; n--) {
      for (var short = 0; short < 2; short++) {
        var p = JSON.parse(JSON.stringify(base)); p.q = p.q.slice(0, n); if (p.z) p.z = p.z.slice(0, n);
        // shorter: two wrong answers; a group pack keeps three types and only the answers that point to them
        if (short && p.m !== "g") p.q = p.q.map(function (r) { return r.slice(0, Math.min(r.length, 4)); });
        if (short && p.m === "g") { p.y = p.y.slice(0, 3); p.q = p.q.map(function (r) { return [r[0]].concat(r.slice(1).filter(function (a) { return a[1] < 3; }).slice(0, 3)); }).filter(function (r) { return r.length >= 3; }); if (p.q.length < MIN_Q) continue; }
        var d = JSON.parse(JSON.stringify(doc)); d.pk = p; d.q = "";
        if (!game(d)) continue;
        d.q = seal(worst(d), d.seed);
        if (size(d) <= room) return p;
      }
    }
    return null;
  }
  // Schätzen at the end (quizpack.js ende): one fixed sentence per person from the mean distance relative to each number
  // (all spot on, near, good, room left; never shown as a percentage), then per question the distance with its unit,
  // "Frage (42 km): 3 km daneben", for two people "… 3 km daneben / genau getroffen". ds: distances per person, who: names.
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k]; }); }
  function ende(doc, ds, L, who) {
    var pk = doc.pk, u = pk.u || [], n = P.nums(doc);
    if (!L.pk_ql) return [];
    return ds.map(function (d, k) {
      var r = d.reduce(function (s, x, j) { return s + Math.min(1, x / pk.z[n[j]]); }, 0) / d.length, t = L["pk_t" + (r ? r <= 0.1 ? 1 : r <= 0.3 ? 2 : 3 : 0)];
      return who[k] ? fmt(L.pk_near, { w: who[k], s: t }) : t;
    }).concat(n.map(function (i, j) {
      var U = u[i] ? " " + u[i] : "";
      return fmt(L.pk_ql, { q: pk.q[i][0], z: pk.z[i] + U, a: ds.map(function (d) { return d[j] ? fmt(L.pk_dn, { n: d[j] + U }) : L.pk_d0; }).join(" / ") });
    }));
  }
  var api = { fromOption: fromOption, texts: texts, clean: clean, worst: worst, fit: fit, ende: ende };
  if (node) module.exports = api; else root.QuizMake = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
