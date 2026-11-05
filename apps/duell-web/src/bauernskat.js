/* Bauernskat: Skat for two (pure rules, no DOM, no network). Also called Offiziersskat, Zweimann-Skat or Skat zu zweit
   (de.wikipedia.org/wiki/Offiziersskat, en.wikipedia.org/wiki/Officers%27_Skat). This app plays one fixed variant:
   - 32 cards, 16 each: 4 face down in a row, 4 face up on top of them (the stacks), 8 in the hand.
   - The dealer alternates. Forehand (the other player) is the declarer: after seeing his hand and both rows of face-up
     cards he names the game - a suit (Kreuz 12, Pik 11, Herz 10, Karo 9: jacks and that suit are trump) or Grand (24, only
     the jacks); Null (23, no trumps, the declarer must not take a trick) only with the house rule "null".
   - Forehand leads. A player plays from the hand or a face-up stack card. Suit and trump must be followed as in Skat;
     a face-up stack card counts as held. The face-down card under a played stack card is turned up after the trick.
   - Card points as in Skat (A 11, 10 10, K 4, D 3, B 2), 120 in all; the declarer needs 61 (60:60 is lost).
   - Game value as in Skat: base value x (tops + 1), tops counted from the declarer's 16 cards (with or without, jacks then
     the trump suit), +1 schneider (90 or 30 or fewer card points), +1 schwarz (all or no tricks). A won game scores its
     value, a lost one twice the value against the declarer; a Null always 23.
   - House rule "kontra": the defender may say Kontra before his first card, the declarer Re before his second; each
     doubles the value.
   Secrecy: the hands and the face-down cards are not in the state. A face-up card enters it through a "turn" action, which
   the table applies once every seat has published its key for that card (reveals() says which ones may be opened now);
   a hand card enters only when it is played. Following suit with a hand card can only be checked after the reveal (audit). */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Sk = node ? require("./skat.js") : root.Skat;
  var SEATS = 2, HAND = 8, STACKS = 4, TRICKS = 16, DECK = Sk.DECK, EYES = Sk.EYES, BASE = Sk.BASE, NULLV = 23;
  var RULES = ["null", "kontra"], GAMES = ["C", "S", "H", "D", "G"];
  var PLAIN = ["A", "T", "K", "Q", "9", "8", "7"], NULLRANK = ["A", "K", "Q", "J", "T", "9", "8", "7"];
  function rules(r) { r = Array.isArray(r) ? r : []; return RULES.filter(function (k) { return r.indexOf(k) >= 0; }); }
  function has(s, k) { return !!s && Array.isArray(s.rules) && s.rules.indexOf(k) >= 0; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function isCard(c) { return typeof c === "string" && DECK.indexOf(c) >= 0; }
  function forehand(dealer) { return (dealer + 1) % 2; }

  // Positions in the jointly shuffled deck: seat s holds 16*s .. 16*s+15 - hand first, then the face-up and face-down rows.
  function layout() {
    var hands = [], stacks = [];
    for (var s = 0; s < SEATS; s++) {
      var b = s * 16, h = [], st = [];
      for (var i = 0; i < HAND; i++) h.push(b + i);
      for (var j = 0; j < STACKS; j++) st.push({ up: b + HAND + j, down: b + HAND + STACKS + j });
      hands.push(h); stacks.push(st);
    }
    return { hands: hands, stacks: stacks };
  }

  // A stack: top = the card one sees on it (null: nothing showing), under = its face-down card still lies there.
  function start(o) {
    var dealer = o && typeof o.dealer === "number" ? ((o.dealer % 2) + 2) % 2 : 0, st = [];
    for (var s = 0; s < SEATS; s++) { var row = []; for (var i = 0; i < STACKS; i++) row.push({ top: null, under: true }); st.push(row); }
    return { game: "bauernskat", rules: rules(o && o.rules), kontra: 0, dealer: dealer, phase: "deal", declarer: forehand(dealer),
      contract: null, stacks: st, flip: [], trick: null, tricks: [], next: -1 };
  }

  // ---------- cards in a contract (the Skat order) ----------
  var trumpOrder = Sk.trumpOrder, isTrump = Sk.isTrump, suitOf = Sk.suitOf;
  function power(game, c, led) {
    if (isTrump(game, c)) return 100 - trumpOrder(game).indexOf(c);
    if (c[0] !== led) return -1;
    return 50 - (game === "N" ? NULLRANK : PLAIN).indexOf(c[1]);
  }
  function mayPlay(game, avail, card, trick) {
    if (avail.indexOf(card) < 0) return false;
    if (!trick || !trick.cards.length) return true;
    var led = suitOf(game, trick.cards[0].card);
    return suitOf(game, card) === led || !avail.some(function (c) { return suitOf(game, c) === led; });
  }
  function tops(s, seat) { return s.stacks[seat].map(function (x) { return x.top; }).filter(Boolean); }
  function played(s) {
    var out = [];
    s.tricks.concat(s.trick ? [s.trick] : []).forEach(function (t) { t.cards.forEach(function (x) { out.push(x.card); }); });
    return out;
  }
  function playedBy(s, seat) { return s.tricks.concat(s.trick ? [s.trick] : []).reduce(function (n, t) { return n + t.cards.filter(function (x) { return x.seat === seat; }).length; }, 0); }
  function visible(s) { return tops(s, 0).concat(tops(s, 1)); }

  // ---------- whose move ----------
  function turn(s) { return s.phase === "declare" ? s.declarer : s.phase === "play" ? s.next : -1; }
  function done(s) { return s.phase === "done"; }
  // The cards the table may open now: the face-up rows after the deal, a face-down card once its trick is over.
  function reveals(s) {
    var out = [];
    if (s.phase === "deal") s.stacks.forEach(function (row, seat) { row.forEach(function (x, i) { if (x.top == null) out.push({ seat: seat, i: i, kind: "up" }); }); });
    else if (s.phase === "play") s.flip.forEach(function (f) { out.push({ seat: f.seat, i: f.i, kind: "down" }); });
    return out;
  }
  function kontraOk(s, seat, t) {
    if (!has(s, "kontra") || s.phase !== "play" || !s.contract) return false;
    if (t === "kontra") return s.kontra === 0 && seat !== s.declarer && playedBy(s, seat) === 0;
    return t === "re" && s.kontra === 1 && seat === s.declarer && playedBy(s, seat) <= 1;
  }
  function games(s) { return GAMES.concat(has(s, "null") ? ["N"] : []); }
  // hand: the seat's own hand cards (secret); the face-up stack cards come from the state.
  function actions(s, seat, hand) {
    var out = [];
    if (s.phase === "declare" && seat === s.declarer) games(s).forEach(function (g) { out.push({ t: "declare", seat: seat, game: g, hand: false, schneider: false, schwarz: false, ouvert: false }); });
    else if (s.phase === "play") {
      if (seat === s.next && !s.flip.length) {
        var avail = (hand || []).concat(tops(s, seat));
        avail.forEach(function (c) { if (mayPlay(s.contract.game, avail, c, s.trick)) out.push({ t: "play", seat: seat, card: c }); });
      }
      ["kontra", "re"].forEach(function (t) { if (kontraOk(s, seat, t)) out.push({ t: t, seat: seat }); });
    }
    return out;
  }

  function fail(e) { return { ok: false, err: e }; }
  function ok(s) { return { ok: true, state: s }; }

  function apply(state, a) {
    if (!a || typeof a !== "object" || typeof a.seat !== "number" || !(a.seat >= 0 && a.seat < SEATS)) return fail("action");
    var s = copy(state);
    if (s.phase === "done") return fail("done");
    if (a.t === "turn") return turnUp(s, a);
    if (a.t === "kontra" || a.t === "re") { if (!kontraOk(s, a.seat, a.t)) return fail("kontra"); s.kontra++; return ok(s); }
    if (a.seat !== turn(s)) return fail("turn");
    if (s.phase === "declare" && a.t === "declare") {
      if (games(s).indexOf(a.game) < 0) return fail("game");
      s.contract = { game: a.game, hand: false, schneider: false, schwarz: false, ouvert: false };
      s.phase = "play"; s.next = s.declarer; s.trick = { lead: s.next, cards: [] };
      return ok(s);
    }
    if (s.phase === "play" && a.t === "play") return play(s, a);
    return fail("action");
  }
  // A card on a stack shows: one of the face-up row after the deal, or a face-down card whose turn has come.
  function turnUp(s, a) {
    var i = a.i, x = s.stacks[a.seat] && s.stacks[a.seat][i], c = a.card;
    if (!x || !isCard(c) || visible(s).indexOf(c) >= 0 || played(s).indexOf(c) >= 0) return fail("turn");
    if (s.phase === "deal") {
      if (x.top != null) return fail("turn");
      x.top = c;
      if (s.stacks.every(function (row) { return row.every(function (y) { return y.top != null; }); })) s.phase = "declare";
      return ok(s);
    }
    var k = -1; s.flip.forEach(function (f, j) { if (f.seat === a.seat && f.i === i) k = j; });
    if (s.phase !== "play" || k < 0) return fail("turn");
    s.flip.splice(k, 1); x.top = c; x.under = false;
    return ok(s);
  }
  function play(s, a) {
    var c = a.card, game = s.contract.game, seat = a.seat;
    if (s.flip.length) return fail("flip");                        // a face-down card still has to be turned up
    if (!isCard(c) || played(s).indexOf(c) >= 0) return fail("card");
    var mine = tops(s, seat), si = -1;
    s.stacks[seat].forEach(function (x, i) { if (x.top === c) si = i; });
    if (si < 0 && visible(s).indexOf(c) >= 0) return fail("card");  // lies open on the other player's stacks
    // following suit: what lies open is checked now, the hand only after the reveal (audit)
    if (s.trick.cards.length) {
      var led = suitOf(game, s.trick.cards[0].card);
      if (suitOf(game, c) !== led && mine.some(function (x) { return suitOf(game, x) === led; })) return fail("follow");
    }
    if (si >= 0) s.stacks[seat][si].top = null;
    s.trick.cards.push({ seat: seat, card: c });
    if (s.trick.cards.length < SEATS) { s.next = 1 - seat; return ok(s); }
    var w = Sk.trickWinner(game, s.trick.cards);
    s.tricks.push({ lead: s.trick.lead, cards: s.trick.cards, winner: w });
    if (s.tricks.length === TRICKS || (game === "N" && w === s.declarer)) { s.phase = "done"; s.trick = null; s.next = -1; return ok(s); }
    // after the trick: every stack whose face-up card went is turned
    s.stacks.forEach(function (row, st) { row.forEach(function (x, i) { if (x.top == null && x.under) s.flip.push({ seat: st, i: i }); }); });
    s.trick = { lead: w, cards: [] }; s.next = w;
    return ok(s);
  }

  // ---------- scoring ----------
  // full: { hands: [[8 cards] x2], stacks: [[{up, down} x4] x2] } from the reveal.
  function cardsOf(full, seat) { return full.hands[seat].concat(full.stacks[seat].reduce(function (a, x) { return a.concat([x.up, x.down]); }, [])); }
  function result(s, full) {
    var d = s.declarer, c = s.contract, lines = [], value, won;
    var mine = s.tricks.filter(function (t) { return t.winner === d; });
    var de = Sk.eyes(mine.reduce(function (a, t) { return a.concat(t.cards.map(function (x) { return x.card; })); }, []));
    var base = c.game === "N" ? NULLV : BASE[c.game];
    if (c.game === "N") { value = NULLV; won = mine.length === 0; lines.push({ k: "null", v: NULLV }); }
    else {
      var tp = Sk.tops(c.game, cardsOf(full, d)), m = tp.n + 1, n = mine.length;
      lines.push({ k: tp.with ? "with" : "without", v: tp.n }, { k: "game", v: 1 });
      if (de >= 90 || de <= 30) { m++; lines.push({ k: "schneider", v: 1 }); }
      if (n === TRICKS || n === 0) { m++; lines.push({ k: "schwarz", v: 1 }); }
      value = base * m; won = de >= 61;
      lines.push({ k: "base", v: base });
    }
    if (s.kontra) { var dbl = Math.pow(2, s.kontra); value *= dbl; lines.push({ k: s.kontra > 1 ? "re" : "kontra", v: dbl }); }
    var points = [0, 0];
    points[d] = won ? value : -2 * value;
    return { winner: won ? "declarer" : "defenders", declarer: d, game: c.game, value: value, won: won, points: points, list: points.slice(),
      eyes: { declarer: de, defenders: 120 - de }, tricks: mine.length, lines: lines };
  }

  // ---------- after the hand: was everything legal? Replays every card against the revealed deal. ----------
  function audit(s, full) {
    var out = [];
    function bad(seat, why) { out.push({ seat: seat, why: why }); }
    if (!s.contract) return out;
    var game = s.contract.game, all = [];
    for (var q = 0; q < SEATS; q++) all = all.concat(cardsOf(full, q));
    if (all.length !== 32 || new Set(all).size !== 32 || !all.every(isCard)) { bad(-1, "deck"); return out; }
    var hands = full.hands.map(function (h) { return h.slice(); });
    var st = full.stacks.map(function (row) { return row.map(function (x) { return { top: x.up, under: true, down: x.down }; }); });
    // what lay open must be what the deal says
    for (var z = 0; z < SEATS; z++) for (var i = 0; i < STACKS; i++) {
      var x = s.stacks[z][i];
      if (x.top != null && x.top !== (x.under ? full.stacks[z][i].up : full.stacks[z][i].down)) bad(z, "stack");
    }
    var tricks = s.tricks.concat(s.trick && s.trick.cards.length ? [s.trick] : []);
    tricks.forEach(function (t) {
      t.cards.forEach(function (y, k) {
        var open = st[y.seat].map(function (r) { return r.top; }).filter(Boolean), avail = hands[y.seat].concat(open);
        if (avail.indexOf(y.card) < 0) { bad(y.seat, "notInHand"); return; }
        if (!mayPlay(game, avail, y.card, { cards: t.cards.slice(0, k) })) bad(y.seat, "follow");
        var hi = hands[y.seat].indexOf(y.card);
        if (hi >= 0) hands[y.seat].splice(hi, 1);
        else st[y.seat].forEach(function (r) { if (r.top === y.card) r.top = null; });
      });
      if (t.cards.length === SEATS) st.forEach(function (row) { row.forEach(function (r) { if (r.top == null && r.under) { r.top = r.down; r.under = false; } }); });
    });
    return out;
  }

  // ---------- Auto: one legal move, fully determined by the public state and the seat's own cards ----------
  // Declaring: Grand with three or four jacks, else the suit it holds most trumps of (hand and face-up cards); playing:
  // always the weakest card it may (lowest in the trick's order, then fewest card points, then the card's name).
  function cmp(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }
  function auto(s, seat, hand) {
    if (turn(s) !== seat) return null;
    hand = hand || [];
    if (s.phase === "declare") {
      var mine = hand.concat(tops(s, seat)), g = "C", most = -1;
      if (mine.filter(function (c) { return c[1] === "J"; }).length >= 3) g = "G";
      else ["C", "S", "H", "D"].forEach(function (x) { var n = mine.filter(function (c) { return isTrump(x, c); }).length; if (n > most) { most = n; g = x; } });
      return { t: "declare", seat: seat, game: g, hand: false, schneider: false, schwarz: false, ouvert: false };
    }
    if (s.phase !== "play" || s.flip.length) return null;
    var game = s.contract.game, avail = hand.concat(tops(s, seat)), okc = avail.filter(function (c) { return mayPlay(game, avail, c, s.trick); });
    var led = s.trick && s.trick.cards.length ? suitOf(game, s.trick.cards[0].card) : null;
    okc.sort(function (a, b) { return cmp([power(game, a, led || suitOf(game, a)), EYES[a[1]], a], [power(game, b, led || suitOf(game, b)), EYES[b[1]], b]); });
    return okc.length ? { t: "play", seat: seat, card: okc[0] } : null;
  }

  var api = { SEATS: SEATS, HAND: HAND, STACKS: STACKS, TRICKS: TRICKS, DECK: DECK, EYES: EYES, BASE: BASE, NULLV: NULLV, RULES: RULES, rules: rules,
    layout: layout, start: start, turn: turn, actions: actions, apply: apply, done: done, result: result, audit: audit, auto: auto, reveals: reveals,
    explain: Sk.explain, trumpOrder: trumpOrder, trickWinner: Sk.trickWinner, isTrump: isTrump, suitOf: suitOf, eyes: Sk.eyes, forehand: forehand, mayPlay: mayPlay, tops: tops };
  if (node) module.exports = api; else root.Bauernskat = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
