// Portiert aus alt:src/doko.js (Tag pre-legacy-removal), Regeln unveraendert; nur der Modulrahmen ist neu (ES-Modul).
/* Doppelkopf: pure rules (no DOM, no network), after the tournament rules of the Deutscher Doppelkopf-Verband
   (DDV Turnierspielregeln, doko-verband.de; checked against the TSR text as rendered at rulespal.com/doppelkopf/rulebook:
   2.2-2.3 cards and trumps, 4.1-4.4 reservations and marriage, 5.2-5.3 following suit and equal cards, 6.2-6.4 calls,
   7.1-7.2 winning and scoring). Two house rules the table may switch on together (chips, the same on every device):
   "dulle" - the second Heart Ten beats the first; "nosp" - no Fuchs, Doppelkopf or Karlchen. No Schweinchen, no Armut.
   The state is plain JSON and public: hidden hands only come in at the end (result, audit) once every key is revealed.
   Cards: suit C S H D + rank A T K Q J 9, e.g. "CQ". */

var SEATS = 4, HAND = 12, SUITS = ["C", "S", "H", "D"], RANKS = ["A", "T", "K", "Q", "J", "9"];
var EYES = { A: 11, T: 10, K: 4, Q: 3, J: 2, 9: 0 };
var DECK = [];
SUITS.forEach(function (s) { RANKS.forEach(function (r) { DECK.push(s + r, s + r); }); });
var SOLOS = ["damen", "buben", "fleischlos", "kreuz", "pik", "herz", "karo"];
var SOLO_SUIT = { kreuz: "C", pik: "S", herz: "H", karo: "D" };
var CALLS = ["re", "k90", "k60", "k30", "schwarz"];    // level 0..4 of a party; "kontra" is level 0 of the other side
var NEED = [11, 10, 9, 8, 7];                           // cards still in hand a call needs (6.2.2, 6.3)
var QUEENS = ["CQ", "SQ", "HQ", "DQ"], JACKS = ["CJ", "SJ", "HJ", "DJ"];
var RULES = ["dulle", "nosp"];
// Only names this engine knows, each once, in a fixed order: the same list on every device whatever came in.
function rules(r) { r = Array.isArray(r) ? r : []; return RULES.filter(function (k) { return r.indexOf(k) >= 0; }); }
function has(s, k) { return !!s && Array.isArray(s.rules) && s.rules.indexOf(k) >= 0; }

function copy(o) { return JSON.parse(JSON.stringify(o)); }
function eyes(c) { return EYES[c[1]]; }
function next(seat, n) { return (seat + (n == null ? 1 : n)) % SEATS; }
// Trump order for a game kind, highest first; normal, marriage and Karo-Solo share it.
function trumps(kind) {
  if (kind === "damen") return QUEENS.slice();
  if (kind === "buben") return JACKS.slice();
  if (kind === "fleischlos") return [];
  var s = SOLO_SUIT[kind] || "D", t = ["HT"].concat(QUEENS, JACKS);
  ["A", "T", "K", "9"].forEach(function (r) { if (s + r !== "HT") t.push(s + r); });
  return t;
}
function plainOrder(kind) {
  if (kind === "damen") return ["A", "T", "K", "J", "9"];
  if (kind === "buben") return ["A", "T", "K", "Q", "9"];
  if (kind === "fleischlos") return ["A", "T", "K", "Q", "J", "9"];
  return ["A", "T", "K", "9"];
}
function isTrump(kind, c) { return trumps(kind).indexOf(c) >= 0; }
// What a card follows: "T" for trump, else its suit.
function follows(kind, c) { return isTrump(kind, c) ? "T" : c[0]; }
// Bigger is better; trumps above every plain card, plain cards only count in the led suit.
function power(kind, c, led) {
  var t = trumps(kind), i = t.indexOf(c);
  if (i >= 0) return 1000 - i;
  if (c[0] !== led) return -1;
  return 100 - plainOrder(kind).indexOf(c[1]);
}
// Winner of a full trick: on equal cards the one played first wins (5.3.3, also for the Heart Ten), unless the
// house rule "dulle" is on: then a second trump Heart Ten beats the first.
function bestIndex(kind, cards, rs) {
  var led = follows(kind, cards[0].card), best = 0, dulle = rules(rs).indexOf("dulle") >= 0 && isTrump(kind, "HT");
  for (var i = 1; i < cards.length; i++) {
    var p = power(kind, cards[i].card, led), q = power(kind, cards[best].card, led);
    if (p > q || (p === q && dulle && cards[i].card === "HT")) best = i;
  }
  return best;
}
function trickWinner(kind, cards, rs) { return cards[bestIndex(kind, cards, rs)].seat; }
// Why a trick goes where it goes, from the rules alone (no hand is needed): what was led, which card wins and why,
// and for every later card whether it followed, trumped or was thrown off. table-ui.js puts it into words.
function explain(kind, cards, rs) {
  if (!cards || !cards.length) return null;
  var led = follows(kind, cards[0].card), i = bestIndex(kind, cards, rs), w = cards[i].card, why = "high";
  var twin = cards.some(function (x, k) { return k !== i && x.card === w; });
  if (twin) why = cards.map(function (x) { return x.card; }).indexOf(w) === i ? "first" : "dulle";
  else if (led !== "T" && isTrump(kind, w)) why = "trump";
  return { led: led, win: i, seat: cards[i].seat, card: w, why: why,
    plays: cards.map(function (x, k) { return { seat: x.seat, card: x.card, how: k === 0 ? "lead" : follows(kind, x.card) === led ? "follow" : isTrump(kind, x.card) ? "trump" : "off" }; }),
    order: trumps(kind) };
}
function legalCards(kind, trick, hand) {
  if (!trick.cards.length) return hand.slice();
  var led = follows(kind, trick.cards[0].card), same = hand.filter(function (c) { return follows(kind, c) === led; });
  return same.length ? same : hand.slice();
}

function start(o) {
  var dealer = ((o && o.dealer) | 0) % SEATS;
  return { game: "doko", rules: rules(o && o.rules), dealer: dealer, phase: "vorbehalt", ask: next(dealer), say: [null, null, null, null], queue: [], wedding: -1,
    kind: "normal", soloist: -1, partner: -1, clar: 0, trick: { lead: next(dealer), cards: [] }, tricks: [], played: [0, 0, 0, 0],
    level: { re: -1, kontra: -1 }, claim: [null, null, null, null], calls: [] };
}
function turn(s) {
  if (s.phase === "vorbehalt" || s.phase === "abfrage") return s.ask;
  if (s.phase === "play") return next(s.trick.lead, s.trick.cards.length);
  return -1;
}
function done(s) { return s.phase === "done"; }
function begin(s, kind, soloist) {
  s.phase = "play"; s.kind = kind; s.soloist = soloist;
  s.trick = { lead: next(s.dealer), cards: [] };   // every solo here is voluntary (no compulsory-solo list): Vorhand leads (4.3.1)
}
// The party a seat publicly belongs to, as far as the table can know it; null in a normal game until it calls.
function knownParty(s, seat) {
  if (s.kind === "normal") return s.claim[seat];
  if (s.kind === "hochzeit" && s.partner < 0) return seat === s.soloist ? "re" : null;
  if (s.kind === "hochzeit") return seat === s.soloist || seat === s.partner ? "re" : "kontra";
  return seat === s.soloist ? "re" : "kontra";
}
// The party a seat belongs to from its own cards (used to offer calls).
function ownParty(s, seat, hand) {
  var k = knownParty(s, seat);
  if (k) return k;
  if (s.kind === "hochzeit") return null;                          // no calls before the clarification trick
  var had = hand.filter(function (c) { return c === "CQ"; }).length + s.tricks.concat([s.trick]).reduce(function (n, t) {
    return n + t.cards.filter(function (x) { return x.seat === seat && x.card === "CQ"; }).length; }, 0);
  return had ? "re" : "kontra";
}
function opp(p) { return p === "re" ? "kontra" : "re"; }
// May this seat make this call now? Public data only: own cards played, marriage state, the parties' levels.
function callOk(s, seat, p, lvl) {
  if (s.phase !== "play" || lvl < 0 || lvl > 4) return false;
  if (s.kind === "hochzeit" && s.partner < 0) return false;          // calls only after the clarification trick (4.4.4)
  if (lvl <= s.level[p]) return false;
  var held = HAND - s.played[seat], shift = s.clar > 1 ? s.clar - 1 : 0;
  var need = NEED[lvl] - shift;
  // A reply (only Re or Kontra) may come one card later than the call it answers needed (6.4.4).
  if (lvl === 0 && s.level[opp(p)] >= 0) need = Math.min(need, NEED[s.level[opp(p)]] - shift - 1);
  return held >= need;
}
function actions(s, seat, hand) {
  var out = [];
  hand = hand || [];
  if ((s.phase === "vorbehalt") && s.ask === seat) return [{ t: "vorbehalt", seat: seat, v: "gesund" }, { t: "vorbehalt", seat: seat, v: "vorbehalt" }];
  if (s.phase === "abfrage" && s.ask === seat) {
    out = SOLOS.map(function (v) { return { t: "vorbehalt", seat: seat, v: v }; });
    if (hand.filter(function (c) { return c === "CQ"; }).length === 2) out.push({ t: "vorbehalt", seat: seat, v: "hochzeit" });
    return out;
  }
  if (s.phase !== "play") return out;
  if (turn(s) === seat) legalCards(s.kind, s.trick, hand).filter(function (c, i, a) { return a.indexOf(c) === i; })
    .forEach(function (c) { out.push({ t: "play", seat: seat, card: c }); });
  var p = ownParty(s, seat, hand);
  if (p) {
    var lvl = s.level[p] + 1;
    if (lvl <= 4 && callOk(s, seat, p, lvl)) out.push({ t: "call", seat: seat, p: p, a: lvl === 0 ? p : CALLS[lvl] });
  }
  return out;
}
function fail(err) { return { ok: false, err: err }; }
function apply(s0, a) {
  if (!a || typeof a !== "object" || !(a.seat >= 0 && a.seat < SEATS) || (a.seat | 0) !== a.seat) return fail("format");
  var s = copy(s0), seat = a.seat;
  if (a.t === "vorbehalt") {
    if ((s.phase !== "vorbehalt" && s.phase !== "abfrage") || s.ask !== seat) return fail("turn");
    if (s.phase === "vorbehalt") {
      if (a.v !== "gesund" && a.v !== "vorbehalt") return fail("value");
      s.say[seat] = a.v;
      if (a.v === "vorbehalt") s.queue.push(seat);
      if (seat !== s.dealer) { s.ask = next(seat); return { ok: true, state: s }; }
      if (!s.queue.length) { begin(s, "normal", -1); return { ok: true, state: s }; }
      s.phase = "abfrage"; s.ask = s.queue[0];
      return { ok: true, state: s };
    }
    if (SOLOS.indexOf(a.v) < 0 && a.v !== "hochzeit") return fail("value");
    s.say[seat] = a.v;
    // Solos come before a marriage; among equals the seat further forward wins (4.1.5, 4.1.7): the first solo asked.
    if (a.v !== "hochzeit") { begin(s, a.v, seat); return { ok: true, state: s }; }
    // Two marriage claims cannot both be true (only one player holds both Club Queens); the first stands, audit judges.
    if (s.wedding < 0) s.wedding = seat;
    var i = s.queue.indexOf(seat);
    if (i + 1 < s.queue.length) { s.ask = s.queue[i + 1]; return { ok: true, state: s }; }
    begin(s, "hochzeit", s.wedding);
    return { ok: true, state: s };
  }
  if (a.t === "play") {
    if (s.phase !== "play") return fail("phase");
    if (turn(s) !== seat) return fail("turn");
    if (typeof a.card !== "string" || DECK.indexOf(a.card) < 0) return fail("card");
    var seen = s.tricks.concat([s.trick]).reduce(function (n, t) { return n + t.cards.filter(function (x) { return x.card === a.card; }).length; }, 0);
    if (seen >= 2) return fail("card");
    s.trick.cards.push({ seat: seat, card: a.card }); s.played[seat]++;
    if (s.trick.cards.length < SEATS) return { ok: true, state: s };
    var w = trickWinner(s.kind, s.trick.cards, s.rules), sum = s.trick.cards.reduce(function (n, x) { return n + eyes(x.card); }, 0);
    s.tricks.push({ lead: s.trick.lead, cards: s.trick.cards, winner: w, eyes: sum });
    var n = s.tricks.length;
    if (s.kind === "hochzeit" && s.partner < 0) {
      if (w !== s.soloist) { s.partner = w; s.clar = n; }                 // first trick won by someone else (4.4.3a)
      else if (n === 3) { s.kind = "karo"; s.clar = 3; s.wedding = s.soloist; }   // nobody found: Karo solo (4.4.3b)
    }
    s.trick = { lead: w, cards: [] };
    if (n === HAND) s.phase = "done";
    return { ok: true, state: s };
  }
  if (a.t === "call") {
    if (a.p !== "re" && a.p !== "kontra") return fail("format");
    var lvl = a.a === a.p ? 0 : CALLS.indexOf(a.a);
    if (lvl < 1 && a.a !== a.p) return fail("format");
    var known = knownParty(s, seat);
    if (known && known !== a.p) return fail("party");
    if (!callOk(s, seat, a.p, lvl)) return fail("late");
    // A call above Re/Kontra includes the party's first call (it may only come while that one could, too).
    s.level[a.p] = lvl; s.claim[seat] = a.p;
    s.calls.push({ seat: seat, p: a.p, a: a.a, n: s.played[seat] });
    return { ok: true, state: s };
  }
  return fail("type");
}

// ---------- after the game: parties, winner, points ----------
function parties(s, full) {
  var re = [], solo = false, kind = s.kind, why = kind;
  if (kind === "normal") {
    var both = full.hands.map(function (h) { return h.filter(function (c) { return c === "CQ"; }).length; });
    var silent = both.indexOf(2);
    if (silent >= 0) { re = [silent]; solo = true; why = "stille"; }      // silent marriage: scored like a solo (4.4.5)
    else both.forEach(function (n, i) { if (n) re.push(i); });
  } else if (kind === "hochzeit") { re = [s.soloist, s.partner]; }
  else { re = [s.soloist]; solo = true; }
  return { re: re, solo: solo, why: why };
}
function result(s, full) {
  var P = parties(s, full), side = function (seat) { return P.re.indexOf(seat) >= 0 ? "re" : "kontra"; };
  var e = { re: 0, kontra: 0 }, tr = { re: 0, kontra: 0 };
  s.tricks.forEach(function (t) { e[side(t.winner)] += t.eyes; tr[side(t.winner)]++; });
  var L = s.level, only = function (p) { return L[p] >= 0 && L[opp(p)] < 0; };
  // What a party needs to win (7.1): own counter-calls first, then the other side's, then plain Re/Kontra.
  function target(p) {
    if (L[p] >= 1) return L[p] === 4 ? { tricks: HAND } : { eyes: [0, 151, 181, 211][L[p]] };
    var o = L[opp(p)];
    if (o >= 1) return o === 4 ? { tricks: 1 } : { eyes: [0, 90, 60, 30][o] };
    if (p === "re") return { eyes: only("kontra") ? 120 : 121 };
    return { eyes: only("kontra") ? 121 : 120 };
  }
  function met(p) { var t = target(p); return t.tricks ? tr[p] >= t.tricks : e[p] >= t.eyes; }
  var winner = met("re") ? "re" : met("kontra") ? "kontra" : null;
  var lines = [], pts = { re: 0, kontra: 0 };
  function add(p, k, v) { if (v) { lines.push({ k: k, v: v, p: p }); pts[p] += v; } }
  ["re", "kontra"].forEach(function (p) {
    var o = opp(p);
    if (winner === p) add(p, "gewonnen", 1);
    if (winner === p || !winner) {          // 7.1.3: with no winner, only (a) without "won", (e), (f) and special points
      add(p, "unter90", e[o] < 90 ? 1 : 0); add(p, "unter60", e[o] < 60 ? 1 : 0); add(p, "unter30", e[o] < 30 ? 1 : 0);
      add(p, "schwarz", tr[o] === 0 ? 1 : 0);
    }
    if (winner === p) {
      add(p, "re", L.re >= 0 ? 2 : 0); add(p, "kontra", L.kontra >= 0 ? 2 : 0);
      ["re", "kontra"].forEach(function (q) { for (var l = 1; l <= L[q]; l++) add(p, "abgesagt_" + CALLS[l], 1); });
    }
    // Reaching a target against the other side's counter-call (7.2.2 e, f), for either party.
    var ol = L[o];
    add(p, "gegen_k90", ol >= 1 && e[p] >= 120 ? 1 : 0); add(p, "gegen_k60", ol >= 2 && e[p] >= 90 ? 1 : 0);
    add(p, "gegen_k30", ol >= 3 && e[p] >= 60 ? 1 : 0); add(p, "gegen_schwarz", ol >= 4 && e[p] >= 30 ? 1 : 0);
  });
  if (!P.solo && s.kind !== "karo") {       // special points: normal games only (7.2.3), an announced marriage is one
    if (winner === "kontra") add("kontra", "gegen_die_alten", 1);
    if (!has(s, "nosp")) s.tricks.forEach(function (t, i) {
      var w = side(t.winner);
      if (t.eyes >= 40) add(w, "doppelkopf", 1);
      t.cards.forEach(function (x) { if (x.card === "DA" && side(x.seat) !== w) add(w, "fuchs", 1); });
      if (i === HAND - 1 && t.cards.filter(function (x) { return x.seat === t.winner; })[0].card === "CJ") add(w, "karlchen", 1);
    });
  }
  var v = pts.re - pts.kontra, points = [0, 1, 2, 3].map(function (seat) {
    if (P.solo) return seat === P.re[0] ? 3 * v : -v;
    return side(seat) === "re" ? v : -v;
  });
  return { winner: winner, kind: P.why, solo: P.solo, re: P.re, value: Math.abs(v), points: points, eyes: e, tricks: tr, lines: lines };
}

// ---------- after the game: was everything as claimed? ----------
function audit(s, full) {
  var out = [], left = full.hands.map(function (h) { return h.slice(); }), P = parties(s, full);
  function bad(seat, why) { out.push({ seat: seat, why: why }); }
  full.hands.forEach(function (h, i) { if (h.length !== HAND) bad(i, "blatt"); });
  var all = [].concat.apply([], full.hands).sort(), deck = DECK.slice().sort();
  if (JSON.stringify(all) !== JSON.stringify(deck)) bad(-1, "deck");
  s.tricks.concat(s.trick.cards.length ? [s.trick] : []).forEach(function (t) {
    var lead = null;
    t.cards.forEach(function (x) {
      var h = left[x.seat], i = h.indexOf(x.card);
      if (i < 0) { bad(x.seat, "karte"); return; }
      if (!lead) lead = x.card;
      else if (follows(s.kind, x.card) !== follows(s.kind, lead) && h.some(function (c) { return follows(s.kind, c) === follows(s.kind, lead); })) bad(x.seat, "bedienen");
      h.splice(i, 1);
    });
  });
  s.say.forEach(function (v, seat) {
    if (v === "hochzeit" && full.hands[seat].filter(function (c) { return c === "CQ"; }).length !== 2) bad(seat, "hochzeit");
  });
  s.calls.forEach(function (c) {
    var real = P.re.indexOf(c.seat) >= 0 ? "re" : "kontra";
    if (c.p !== real) bad(c.seat, "ansage");
  });
  return out;
}

// ---------- Auto: one legal move for a seat whose player is away or too slow ----------
// Plain and fully determined by the public state and the seat's own cards, no dice: healthy, no calls, and always the
// weakest card that may be played (lowest in the trick's order, then fewest eyes, then the card's name). A reservation
// already made picks the marriage if possible, else the solo with the most trumps in hand.
function weakest(kind, cards, trick) {
  var led = trick.cards.length ? follows(kind, trick.cards[0].card) : null;
  function key(c) { return [power(kind, c, led || follows(kind, c)), eyes(c), c]; }
  return cards.slice().sort(function (a, b) {
    var x = key(a), y = key(b);
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
  })[0];
}
function auto(s, seat, hand) {
  if (turn(s) !== seat) return null;
  var acts = actions(s, seat, hand || []);
  if (s.phase === "vorbehalt") return acts[0];                          // gesund
  if (s.phase === "abfrage") {
    var wed = acts.filter(function (a) { return a.v === "hochzeit"; })[0];
    if (wed) return wed;
    var best = null, most = -1;
    SOLOS.forEach(function (v) { var n = hand.filter(function (c) { return isTrump(v, c); }).length; if (n > most) { most = n; best = v; } });
    return { t: "vorbehalt", seat: seat, v: best };
  }
  var cards = acts.filter(function (a) { return a.t === "play"; }).map(function (a) { return a.card; });
  return cards.length ? { t: "play", seat: seat, card: weakest(s.kind, cards, s.trick) } : null;
}

const api = { SEATS: SEATS, HAND: HAND, DECK: DECK, SOLOS: SOLOS, CALLS: CALLS, EYES: EYES, RULES: RULES, rules: rules, explain: explain, auto: auto,
    layout: function () { var hands = []; for (var s = 0; s < SEATS; s++) { hands.push([]); for (var i = 0; i < HAND; i++) hands[s].push(s * HAND + i); } return { hands: hands, skat: [] }; },
    start: start, turn: turn, actions: actions, apply: apply, done: done, result: result, audit: audit,
    trumps: trumps, isTrump: isTrump, trickWinner: trickWinner, legalCards: legalCards, eyes: eyes, knownParty: knownParty };
export default api;
