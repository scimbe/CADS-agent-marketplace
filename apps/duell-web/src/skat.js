/* Skat: pure rules (no DOM, no network) after the International Skat Order (ISkO, DSkV/ISPA; English text at
   weddslist.com/skat/ordnung, sections 2-5). Three seats, 32 cards, 10 each plus a skat of two. The state is public:
   nobody's hand is in it, cards appear only when played or laid open. Following suit can only be checked once the hands
   are revealed, see audit(). Two house rules the table may switch on together (chips, the same on every device):
   "ramsch" - all pass: a Ramsch instead of a new deal (jacks only are trump, everyone for themselves, the skat goes to
   whoever takes the last trick, the most card points lose them; one player with every trick: Durchmarsch, +120);
   "kontra" - a defender may say Kontra before playing a card, the declarer Re before his second card; each doubles
   the game value. Left out: Bock, Jungfrau, Schieberamsch. */
(function (root) {
  "use strict";
  var SEATS = 3, HAND = 10, SUITS = ["C", "S", "H", "D"], RANKS = ["A", "T", "K", "Q", "J", "9", "8", "7"];
  var DECK = []; SUITS.forEach(function (s) { RANKS.forEach(function (r) { DECK.push(s + r); }); });
  var EYES = { A: 11, T: 10, K: 4, Q: 3, J: 2, "9": 0, "8": 0, "7": 0 };
  var BASE = { D: 9, H: 10, S: 11, C: 12, G: 24 };
  var NULL = { plain: 23, hand: 35, ouvert: 46, ouvertHand: 59 };
  var RULES = ["ramsch", "kontra"];
  function rules(r) { r = Array.isArray(r) ? r : []; return RULES.filter(function (k) { return r.indexOf(k) >= 0; }); }
  function has(s, k) { return !!s && Array.isArray(s.rules) && s.rules.indexOf(k) >= 0; }
  var JACKS = ["CJ", "SJ", "HJ", "DJ"], PLAIN = ["A", "T", "K", "Q", "9", "8", "7"], NULLRANK = ["A", "K", "Q", "J", "T", "9", "8", "7"];

  // Every value a game can have, ascending: the valid bids (ISkO 3.3.2). Suit games range from "with/without 1, game 2"
  // to 11 tops plus all six extra multipliers, grand up to 4 tops plus six.
  var BIDS = (function () {
    var v = {};
    ["D", "H", "S", "C"].forEach(function (g) { for (var m = 2; m <= 18; m++) v[BASE[g] * m] = 1; });
    for (var m = 2; m <= 11; m++) v[BASE.G * m] = 1;
    v[NULL.plain] = v[NULL.hand] = v[NULL.ouvert] = v[NULL.ouvertHand] = 1;
    return Object.keys(v).map(Number).sort(function (a, b) { return a - b; });
  })();

  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function forehand(dealer) { return (dealer + 1) % 3; }
  function middlehand(dealer) { return (dealer + 2) % 3; }
  function rearhand(dealer) { return dealer; }          // three at the table: the dealer is rearhand
  function eyes(cards) { return cards.reduce(function (a, c) { return a + EYES[c[1]]; }, 0); }
  function isCard(c) { return typeof c === "string" && DECK.indexOf(c) >= 0; }

  function layout() {
    var hands = [];
    for (var s = 0; s < SEATS; s++) { var h = []; for (var i = 0; i < HAND; i++) h.push(s * HAND + i); hands.push(h); }
    return { hands: hands, skat: [30, 31] };
  }

  function start(o) {
    var dealer = o && typeof o.dealer === "number" ? ((o.dealer % 3) + 3) % 3 : 0;
    return {
      game: "skat", rules: rules(o && o.rules), kontra: 0, dealer: dealer, phase: "bid",
      // stage: "mh" Middlehand bids to Forehand, "rh" Rearhand bids to the survivor, "fh" both passed and Forehand decides
      bid: { v: 0, bidder: middlehand(dealer), holder: forehand(dealer), ask: "bid", stage: "mh", passed: [], last: null },
      declarer: -1, pickedUp: false, pushed: false, contract: null, open: null,
      trick: null, tricks: [], next: -1, passedOut: false
    };
  }

  // ---------- cards in a contract ----------
  function trumpOrder(game) {
    if (game === "N") return [];
    if (game === "G") return JACKS.slice();
    return JACKS.concat(PLAIN.map(function (r) { return game + r; }));
  }
  function isTrump(game, c) { return game !== "N" && (c[1] === "J" || (game !== "G" && c[0] === game)); }
  function suitOf(game, c) { return isTrump(game, c) ? "T" : c[0]; }
  // Strength inside what is led: higher wins. Trump beats everything; otherwise only the led suit counts.
  function power(game, c, led) {
    if (isTrump(game, c)) return 100 - trumpOrder(game).indexOf(c);
    if (c[0] !== led) return -1;
    var order = game === "N" ? NULLRANK : PLAIN;
    return 50 - order.indexOf(c[1]);
  }
  function bestIndex(game, cards) {
    var led = suitOf(game, cards[0].card), best = 0;
    for (var i = 1; i < cards.length; i++) if (power(game, cards[i].card, led) > power(game, cards[best].card, led)) best = i;
    return best;
  }
  function trickWinner(game, cards) { return cards[bestIndex(game, cards)].seat; }
  // Why a trick goes where it goes (see doko.js explain): led suit, winning card and reason, how each card answered.
  function explain(game, cards) {
    if (!cards || !cards.length) return null;
    var led = suitOf(game, cards[0].card), i = bestIndex(game, cards), w = cards[i].card;
    return { led: led, win: i, seat: cards[i].seat, card: w, why: led !== "T" && isTrump(game, w) ? "trump" : "high",
      plays: cards.map(function (x, k) { return { seat: x.seat, card: x.card, how: k === 0 ? "lead" : suitOf(game, x.card) === led ? "follow" : isTrump(game, x.card) ? "trump" : "off" }; }),
      order: trumpOrder(game) };
  }
  function playedBy(s, seat) {
    return s.tricks.concat(s.trick ? [s.trick] : []).reduce(function (n, t) { return n + t.cards.filter(function (x) { return x.seat === seat; }).length; }, 0);
  }
  // Kontra/Re (house rule): the deadline only counts the caller's own cards, so every device judges it the same way
  // whatever order the other players' messages arrive in.
  function kontraOk(s, seat, t) {
    if (!has(s, "kontra") || s.phase !== "play" || !s.contract || s.contract.ramsch) return false;
    if (t === "kontra") return s.kontra === 0 && seat !== s.declarer && playedBy(s, seat) === 0;
    return t === "re" && s.kontra === 1 && seat === s.declarer && playedBy(s, seat) <= 1;
  }
  function mayPlay(game, hand, card, trick) {
    if (hand.indexOf(card) < 0) return false;
    if (!trick || !trick.cards.length) return true;
    var led = suitOf(game, trick.cards[0].card);
    if (suitOf(game, card) === led) return true;
    return !hand.some(function (c) { return suitOf(game, c) === led; });
  }
  function tops(game, cards) {
    var order = trumpOrder(game), has = cards.indexOf(order[0]) >= 0, n = 0;
    while (n < order.length && (cards.indexOf(order[n]) >= 0) === has) n++;
    return { with: has, n: n };
  }
  function nullValue(c) { return c.ouvert ? (c.hand ? NULL.ouvertHand : NULL.ouvert) : (c.hand ? NULL.hand : NULL.plain); }

  // ---------- whose move ----------
  function turn(s) {
    if (s.phase === "bid") return s.bid.ask === "bid" ? s.bid.bidder : s.bid.holder;
    if (s.phase === "skat" || s.phase === "push" || s.phase === "declare" || s.phase === "show") return s.declarer;
    if (s.phase === "play") return s.next;
    return -1;
  }
  function done(s) { return s.phase === "done"; }

  function bidSeat(s, seat) { var b = s.bid; return seat === (b.ask === "bid" ? b.bidder : b.holder); }

  function declareOptions(s) {
    var out = [], hand = !s.pickedUp;
    ["C", "S", "H", "D", "G"].forEach(function (g) {
      out.push({ game: g, hand: hand, schneider: false, schwarz: false, ouvert: false });
      if (hand) {
        out.push({ game: g, hand: true, schneider: true, schwarz: false, ouvert: false });
        out.push({ game: g, hand: true, schneider: true, schwarz: true, ouvert: false });
        out.push({ game: g, hand: true, schneider: true, schwarz: true, ouvert: true });
      }
    });
    [false, true].forEach(function (ouvert) {
      var c = { game: "N", hand: hand, schneider: false, schwarz: false, ouvert: ouvert };
      if (nullValue(c) >= s.bid.v) out.push(c);      // an invalid null cannot be announced (ISkO 3.4.4)
    });
    return out;
  }

  function actions(s, seat, hand) {
    var out = [], b = s.bid;
    if (s.phase === "bid" && bidSeat(s, seat)) {
      if (b.ask === "bid") {
        // Forehand alone may only open at 18 or pass (ISkO 3.3.6); the others name any higher valid value
        BIDS.filter(function (v) { return v > b.v && (b.stage !== "fh" || v === 18); }).forEach(function (v) { out.push({ t: "bid", seat: seat, v: v }); });
      } else out.push({ t: "hold", seat: seat });
      out.push({ t: "pass", seat: seat });
    } else if (s.phase === "skat" && seat === s.declarer) {
      out.push({ t: "pickup", seat: seat });
      declareOptions(s).forEach(function (c) { out.push(Object.assign({ t: "declare", seat: seat }, c)); });
    } else if (s.phase === "push" && seat === s.declarer) {
      out.push({ t: "push", seat: seat });
    } else if (s.phase === "declare" && seat === s.declarer) {
      declareOptions(s).forEach(function (c) { out.push(Object.assign({ t: "declare", seat: seat }, c)); });
    } else if (s.phase === "show" && seat === s.declarer) {
      out.push({ t: "show", seat: seat, cards: (hand || []).slice() });
    } else if (s.phase === "play") {
      if (seat === s.next) (hand || []).forEach(function (c) { if (mayPlay(s.contract.game, hand, c, s.trick)) out.push({ t: "play", seat: seat, card: c }); });
      ["kontra", "re"].forEach(function (t) { if (kontraOk(s, seat, t)) out.push({ t: t, seat: seat }); });
    }
    return out;
  }

  function fail(e) { return { ok: false, err: e }; }
  function ok(s) { return { ok: true, state: s }; }

  function toDeclarer(s, seat) {
    s.declarer = seat; s.phase = "skat"; s.bid.ask = null;
    if (!s.bid.v) s.bid.v = 18;
  }
  function applyBid(s, a) {
    var b = s.bid, d = s.dealer;
    if (!bidSeat(s, a.seat)) return fail("turn");
    if (a.t === "bid") {
      if (b.ask !== "bid") return fail("phase");
      if (BIDS.indexOf(a.v) < 0 || a.v <= b.v) return fail("value");
      if (b.stage === "fh") { if (a.v !== 18) return fail("value"); b.v = 18; toDeclarer(s, a.seat); return ok(s); }
      b.v = a.v; b.last = a.seat; b.ask = "answer"; return ok(s);
    }
    if (a.t === "hold") { if (b.ask !== "answer") return fail("phase"); b.ask = "bid"; return ok(s); }
    if (a.t !== "pass") return fail("action");
    b.passed.push(a.seat);
    if (b.stage === "fh") {
      b.ask = null;
      if (!has(s, "ramsch")) { s.phase = "done"; s.passedOut = true; return ok(s); }
      // everyone passed: Ramsch, Forehand leads, the skat stays down
      s.phase = "play"; s.contract = { game: "G", hand: true, schneider: false, schwarz: false, ouvert: false, ramsch: true };
      s.next = forehand(d); s.trick = { lead: s.next, cards: [] };
      return ok(s);
    }
    var survivor = a.seat === b.bidder ? b.holder : b.bidder;
    if (b.stage === "mh") {
      // Rearhand now bids to whoever is left, starting above the last value (ISkO 3.3.4)
      b.stage = "rh"; b.bidder = rearhand(d); b.holder = survivor; b.ask = "bid";
      return ok(s);
    }
    // stage "rh": one of the two passed. Nobody bid at all: Forehand may still play or throw in (ISkO 3.3.6).
    if (!b.v) { b.stage = "fh"; b.bidder = forehand(d); b.holder = -1; b.ask = "bid"; return ok(s); }
    toDeclarer(s, survivor);
    return ok(s);
  }

  function checkContract(s, a) {
    var g = a.game, hand = !!a.hand, sn = !!a.schneider, sw = !!a.schwarz, ov = !!a.ouvert;
    if (["C", "S", "H", "D", "G", "N"].indexOf(g) < 0) return "game";
    if (hand === s.pickedUp) return "hand";                    // hand means: the skat stayed down
    if (g === "N") {
      if (sn || sw) return "null";
      if (nullValue({ hand: hand, ouvert: ov }) < s.bid.v) return "overbid";
      return null;
    }
    if ((sn || sw || ov) && !hand) return "hand";               // predictions and ouvert only from the hand (5.2.5/5.2.6)
    if (sw && !sn) return "schwarz";
    if (ov && !sw) return "ouvert";
    return null;
  }

  function apply(state, a) {
    if (!a || typeof a !== "object" || typeof a.seat !== "number") return fail("action");
    var s = copy(state);
    if (s.phase === "done") return fail("done");
    if (s.phase === "bid") return applyBid(s, a);
    if (a.t === "kontra" || a.t === "re") {
      if (!kontraOk(s, a.seat, a.t)) return fail("kontra");
      s.kontra++; return ok(s);
    }
    if (a.seat !== turn(s)) return fail("turn");
    if (s.phase === "skat" && a.t === "pickup") { s.pickedUp = true; s.phase = "push"; return ok(s); }
    if (s.phase === "push" && a.t === "push") { s.pushed = true; s.phase = "declare"; return ok(s); }
    if ((s.phase === "skat" || s.phase === "declare") && a.t === "declare") {
      var e = checkContract(s, a); if (e) return fail(e);
      var g = a.game, c = { game: g, hand: !!a.hand, schneider: g !== "N" && !!a.schneider, schwarz: g !== "N" && !!a.schwarz, ouvert: !!a.ouvert };
      s.contract = c; s.phase = c.ouvert ? "show" : "play";
      s.next = forehand(s.dealer); s.trick = { lead: s.next, cards: [] };
      return ok(s);
    }
    if (s.phase === "show" && a.t === "show") {
      var cs = a.cards;
      if (!Array.isArray(cs) || cs.length !== HAND || !cs.every(isCard) || new Set(cs).size !== HAND) return fail("cards");
      s.open = cs.slice(); s.phase = "play"; return ok(s);
    }
    if (s.phase === "play" && a.t === "play") return play(s, a);
    return fail("action");
  }

  function played(s) {
    var out = []; s.tricks.forEach(function (t) { t.cards.forEach(function (x) { out.push(x.card); }); });
    if (s.trick) s.trick.cards.forEach(function (x) { out.push(x.card); });
    return out;
  }
  function play(s, a) {
    var c = a.card, game = s.contract.game;
    if (!isCard(c)) return fail("card");
    if (played(s).indexOf(c) >= 0) return fail("twice");
    if (s.open) {
      // the open hand is public: the declarer's cards and following suit can be checked right away
      var left = s.open.filter(function (x) { return played(s).indexOf(x) < 0; });
      if (a.seat === s.declarer ? !mayPlay(game, left, c, s.trick) : left.indexOf(c) >= 0) return fail("open");
    }
    s.trick.cards.push({ seat: a.seat, card: c });
    if (s.trick.cards.length < SEATS) { s.next = (a.seat + 1) % 3; return ok(s); }
    var w = trickWinner(game, s.trick.cards);
    s.tricks.push({ lead: s.trick.lead, cards: s.trick.cards, winner: w });
    // a null ends as soon as the soloist takes a trick (ISkO 5.2.7)
    if (s.tricks.length === HAND || (game === "N" && w === s.declarer)) { s.phase = "done"; s.trick = null; s.next = -1; return ok(s); }
    s.trick = { lead: w, cards: [] }; s.next = w;
    return ok(s);
  }

  // ---------- scoring ----------
  function result(s, full) {
    if (s.passedOut) return { winner: null, passedOut: true, points: [0, 0, 0], list: [0, 0, 0], eyes: null, lines: [] };
    if (s.contract && s.contract.ramsch) return ramschResult(s, full);
    var d = s.declarer, c = s.contract, base, value, won, lines = [], overbid = false;
    var mine = s.tricks.filter(function (t) { return t.winner === d; });
    var down = s.pickedUp ? (full.pushed || []) : (full.skat || []);
    var de = eyes(mine.reduce(function (a, t) { return a.concat(t.cards.map(function (x) { return x.card; })); }, [])) + eyes(down);
    if (c.game === "N") {
      base = value = nullValue(c); won = mine.length === 0;
      lines.push({ k: c.ouvert ? (c.hand ? "nullOuvertHand" : "nullOuvert") : (c.hand ? "nullHand" : "null"), v: value });
    } else {
      base = BASE[c.game];
      var tp = tops(c.game, full.hands[d].concat(full.skat || [])), m = tp.n + 1, n = mine.length;
      lines.push({ k: tp.with ? "with" : "without", v: tp.n }, { k: "game", v: 1 });
      if (c.hand) { m++; lines.push({ k: "hand", v: 1 }); }
      var failed = (c.schneider && de < 90) || (c.schwarz && n < HAND);
      // a failed prediction counts what winning it would have; the soloist then gets no extra for being schneider (5.2.5)
      var schneider = de >= 90 || c.schneider || (!failed && de <= 30), schwarz = n === HAND || c.schwarz || (!failed && n === 0);
      if (schneider) { m++; lines.push({ k: "schneider", v: 1 }); }
      if (c.schneider) { m++; lines.push({ k: "schneiderSaid", v: 1 }); }
      if (schwarz) { m++; lines.push({ k: "schwarz", v: 1 }); }
      if (c.schwarz) { m++; lines.push({ k: "schwarzSaid", v: 1 }); }
      if (c.ouvert) { m++; lines.push({ k: "ouvert", v: 1 }); }
      value = base * m; won = !failed && de >= 61;
      lines.push({ k: "base", v: base });
    }
    var dbl = s.kontra ? Math.pow(2, s.kontra) : 1;
    if (value < s.bid.v) {
      // overbid: lost, and raised by whole multiples of the base value until it covers the bid (5.4.1). An invalid null
      // cannot be announced at all, so for nulls this only guards against a broken state.
      overbid = true; won = false; value = Math.ceil(s.bid.v / base) * base; lines.push({ k: "overbid", v: value });
    }
    if (dbl > 1) { value *= dbl; lines.push({ k: s.kontra > 1 ? "re" : "kontra", v: dbl }); }
    var points = [0, 0, 0], list = [0, 0, 0];
    points[d] = won ? value : -2 * value;
    // tournament list (Seeger-Fabian, ISkO scoresheet): +50 for a won game, -50 for a lost one, and when the soloist
    // loses each defender at a table of three gets 40
    list[d] = points[d] + (won ? 50 : -50);
    if (!won) for (var i = 0; i < 3; i++) if (i !== d) list[i] = 40;
    return { winner: won ? "declarer" : "defenders", declarer: d, game: c.game, value: value, won: won, overbid: overbid,
      points: points, list: list, eyes: { declarer: de, defenders: 120 - de }, tricks: mine.length, lines: lines };
  }

  // Ramsch: every seat counts its own tricks, the skat goes with the last trick. The most card points lose them (ties:
  // all of them); one seat with all ten tricks wins 120 (Durchmarsch). The tournament list has no Ramsch: it equals the points.
  function ramschResult(s, full) {
    var e = [0, 0, 0], n = [0, 0, 0], last = s.tricks[s.tricks.length - 1];
    s.tricks.forEach(function (t) { e[t.winner] += eyes(t.cards.map(function (x) { return x.card; })); n[t.winner]++; });
    if (last) e[last.winner] += eyes(full.skat || []);
    var points = [0, 0, 0], march = n.indexOf(HAND), top = Math.max.apply(null, e), losers = [];
    if (march >= 0) points[march] = 120;
    else e.forEach(function (x, i) { if (x === top) { losers.push(i); points[i] = -x; } });
    return { winner: "ramsch", ramsch: true, durchmarsch: march, losers: losers, points: points, list: points.slice(), eyes: null, seatEyes: e, tricks: n, lines: [] };
  }

  // ---------- after the hand: was everything legal? ----------
  function audit(s, full) {
    var out = [];
    function bad(seat, why) { out.push({ seat: seat, why: why }); }
    if (s.passedOut || !s.contract) return out;
    var d = s.declarer, game = s.contract.game, hands = full.hands.map(function (h) { return h.slice(); });
    var all = hands.reduce(function (a, h) { return a.concat(h); }, []).concat(full.skat || []);
    if (all.length !== 32 || new Set(all).size !== 32 || !all.every(isCard)) bad(-1, "deck");
    if (s.pickedUp) {
      var twelve = hands[d].concat(full.skat || []), push = full.pushed || [];
      if (push.length !== 2 || new Set(push).size !== 2 || !push.every(function (c) { return twelve.indexOf(c) >= 0; })) bad(d, "pushed");
      hands[d] = twelve.filter(function (c) { return push.indexOf(c) < 0; });
    } else if (full.pushed && full.pushed.length) bad(d, "hand");
    if (s.open) {
      var h = hands[d].slice().sort(), o = s.open.slice().sort();
      if (h.join() !== o.join()) bad(d, "open");
    }
    var tricks = s.tricks.concat(s.trick && s.trick.cards.length ? [s.trick] : []);
    tricks.forEach(function (t) {
      t.cards.forEach(function (x, i) {
        var h = hands[x.seat];
        if (h.indexOf(x.card) < 0) { bad(x.seat, "notInHand"); return; }
        if (!mayPlay(game, h, x.card, { cards: t.cards.slice(0, i) })) bad(x.seat, "follow");
        h.splice(h.indexOf(x.card), 1);
      });
    });
    return out;
  }

  // ---------- Auto: one legal move for a seat whose player is away or too slow ----------
  // Plain and fully determined by the public state and the seat's own cards, no dice: it passes when bidding; a
  // declarer it stands in for plays a hand game (the skat stays down) in the suit it holds most of, discards its two
  // lowest non-jacks after a pick-up, lays an ouvert hand open, and always plays the weakest card it may (lowest in the
  // trick's order, then fewest eyes, then the card's name).
  function cmp(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }
  function longest(hand) {
    var best = "C", most = -1;
    ["C", "S", "H", "D"].forEach(function (g) { var n = hand.filter(function (c) { return isTrump(g, c); }).length; if (n > most) { most = n; best = g; } });
    return best;
  }
  function auto(s, seat, hand) {
    if (turn(s) !== seat) return null;
    hand = hand || [];
    if (s.phase === "bid") return { t: "pass", seat: seat };
    if (s.phase === "skat" || s.phase === "declare") {
      var c = { t: "declare", seat: seat, game: longest(hand), hand: !s.pickedUp, schneider: false, schwarz: false, ouvert: false };
      return checkContract(s, c) ? null : c;
    }
    if (s.phase === "push") {
      var low = hand.slice().sort(function (a, b) { return cmp([a[1] === "J" ? 1 : 0, EYES[a[1]], a], [b[1] === "J" ? 1 : 0, EYES[b[1]], b]); });
      return { t: "push", seat: seat, cards: low.slice(0, 2) };
    }
    if (s.phase === "show") return { t: "show", seat: seat, cards: hand.slice() };
    if (s.phase !== "play") return null;
    var game = s.contract.game, ok = hand.filter(function (c) { return mayPlay(game, hand, c, s.trick); });
    var led = s.trick && s.trick.cards.length ? suitOf(game, s.trick.cards[0].card) : null;
    ok.sort(function (a, b) { return cmp([power(game, a, led || suitOf(game, a)), EYES[a[1]], a], [power(game, b, led || suitOf(game, b)), EYES[b[1]], b]); });
    return ok.length ? { t: "play", seat: seat, card: ok[0] } : null;
  }

  var api = { SEATS: SEATS, HAND: HAND, DECK: DECK, EYES: EYES, BASE: BASE, NULL: NULL, BIDS: BIDS, RULES: RULES, rules: rules, explain: explain, trumpOrder: trumpOrder, auto: auto,
    layout: layout, start: start, turn: turn, actions: actions, apply: apply, done: done, result: result, audit: audit,
    trickWinner: trickWinner, isTrump: isTrump, suitOf: suitOf, tops: tops, eyes: eyes,
    forehand: forehand, middlehand: middlehand, rearhand: rearhand };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Skat = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
