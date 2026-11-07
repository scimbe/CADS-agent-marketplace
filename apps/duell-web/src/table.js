/* A card table for two, three or four players, live, without a game server. No DOM: table-ui.js draws it.
   Network: a full mesh of the two-player links from live.js (one WebRTC data channel per pair, set up through the
   bridge, TURN only as fallback). Whoever already sits at the table invites the next player with a link; the newcomer
   then opens links to everyone else, the invite tokens for those travel inside the existing channels. A closed link
   frees the seat; a running hand is dropped, because its cards stay locked without that player's keys.
   Cards: mpoker.js. Every seat shuffles and locks, each player only ever gets the keys of their own positions, a played
   card publishes all keys of its position, and after the hand all secrets are revealed and the deal is replayed.
   Bauernskat (bauernskat.js, two seats, one pair link, no hands): a stack card is opened by everyone publishing their
   key for that position when the rules list it in reveals() - the face-up row after the deal, a face-down card only once
   the trick that took the card above it is over. No device ever sends a key for a face-down card before that; every
   device then applies the same "turn" action. Standing up during such a hand does not hand the face-down keys over at
   once: the device stays at the table on Auto (only the screen closes) and keeps releasing each key when reveals() names
   it; when the hand is over it leaves. A key that does not open its card is the other seat's fault (my own key is the one
   I made): the hand stops there, and view().hand.flags says who.
   Rules: doko.js / skat.js / bauernskat.js, run identically on every device. Messages from one sender are handled strictly in the
   order sent (calls in Doppelkopf depend on how many cards the caller had played); a message that arrives before what
   it builds on (another player's card on a different link) waits until it fits.
   Group invite: one link with a one-time token for every free seat (the bridge burns a token on first use, so two
   people can never get the same one); whoever opens it tries the tokens in order and takes the first one still unused,
   the inviter seats the newcomers in the order they connect, and once all are used the link says the table is full.
   Auto: when it is my turn and I do not move within AUTO_MS (or at once when I switched to Auto), my own device plays
   the rules' auto move (doko.js / skat.js auto) - nobody else can move for a player who is still there. Who stands up
   during a hand hands over: their secrets and the keys of their own cards go to everyone, so their hand becomes public
   and every device plays the very same auto moves for that seat until the hand is over. A handover is only accepted if
   its keys are the ones that player gave out, so nobody can hand over someone else's seat. A device that just drops
   off (no handover) still ends the hand: its cards stay locked without its keys. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var MP = node ? require("./mpoker.js") : root.MPoker;
  var B = node ? require("./ballduell.js") : root.Ballduell;
  function rules(game) {
    if (game === "bauernskat") return node ? require("./bauernskat.js") : root.Bauernskat;
    return game === "skat" ? (node ? require("./skat.js") : root.Skat) : (node ? require("./doko.js") : root.Doko);
  }
  var BLOCK_MS = 30000, AUTO_MS = 20000, AUTO_FAST = 1500, HANDOVER_MS = 2000, WAIT = {}, ID_RE = /^[0-9a-f]{16}$/;
  var TABLE_TYPES = ["me", "seat", "join", "hold", "unhold", "gone", "peers", "ready", "fwd", "link", "full", "auto", "rules"];

  function rid() { var b = new Uint8Array(8); root.crypto.getRandomValues(b); return Array.from(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
  function clean(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, n); }
  function sleep(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  // live.js answers "busy"/"rate" when the bridge's game budget is used up for the moment: try again a little later.
  async function retry(f) {
    for (var a = 0; ; a++) {
      try { return await f(); }
      catch (e) { if (a < 5 && (e.message === "busy" || e.message === "rate")) { await sleep(1500 * (a + 1)); continue; } throw e; }
    }
  }

  function Table(o) {
    var R = rules(o.game), SEATS = R.SEATS, N = R.DECK.length, live = o.live;
    var me = { id: o.id || rid(), name: clean(o.name, 20) || "?", emoji: clean(o.emoji, 8) || "🙂", seat: o.create ? 0 : -1, auto: false };
    var autoMs = o.autoMs || AUTO_MS, autoFast = o.autoFast || AUTO_FAST, autoT = 0, autoKey = "", deadline = 0, groups = 0;
    var members = {}, links = {}, holds = {}, readies = {}, queues = {}, scores = {}, invites = [];
    // House rules: the same list on every device. Set between hands by anyone seated; the higher version wins, on a tie
    // the smaller player id, so two taps at once still end in one list. A hand only starts once every ready names it.
    var house = R.rules(o.rules), rulesV = 0, rulesBy = "";
    var leaving = false;   // Bauernskat: stood up, plays the hand to its end on Auto, then leaves
    var no = 0, hand = null, last = null, want = true, lost = false, closed = false, joinVia = null, pumping = false, timer = 0, subs = [], note = "", meReady = null;

    // ---------- small helpers ----------
    function emit() { arm(); var v = view(); subs.forEach(function (f) { try { f(v); } catch (e) {} }); }
    function roster() { var r = []; for (var s = 0; s < SEATS; s++) r.push(null); if (me.seat >= 0) r[me.seat] = me.id; Object.keys(members).forEach(function (id) { var x = members[id]; if (x.seat >= 0 && !r[x.seat]) r[x.seat] = id; }); return r; }
    function others() { return Object.keys(members); }
    function send(id, m) { var c = links[id]; if (c) c.send(m); }
    function all(m) { Object.keys(links).forEach(function (id) { send(id, m); }); }
    function meMsg() { return { t: "me", id: me.id, name: me.name, emoji: me.emoji, seat: me.seat, game: o.game, auto: me.auto }; }
    function free() {
      var r = roster();
      for (var s = 0; s < SEATS; s++) if (!r[s] && !holds[s]) return s;
      return -1;
    }
    function peersMsg() { return { t: "peers", ids: Object.keys(links), ch: Object.keys(links).map(function (id) { return links[id].channel; }) }; }
    function complete() {
      var r = roster(); if (r.some(function (x) { return !x; })) return false;
      return others().every(function (id) {
        var x = members[id]; if (!links[id] || !x.peers) return false;
        return r.every(function (y) { return y === id || x.peers.indexOf(y) >= 0; });
      });
    }
    // The three pictures: from every link of the table, as each player reports them. Equal on all screens only if
    // everybody is connected to the same people.
    function badge() {
      var ch = {}; Object.keys(links).forEach(function (id) { ch[links[id].channel] = 1; });
      others().forEach(function (id) { (members[id].ch || []).forEach(function (c) { if (/^[0-9a-f]{64}$/.test(c)) ch[c] = 1; }); });
      var list = Object.keys(ch).sort();
      return list.length ? B.badge(list.join("")) : "";
    }

    // ---------- links ----------
    // how: the invite record when the link came from my invite, so the newcomer gets the seat I held.
    function attach(conn, how) {
      var peer = null;
      conn.on(function (m) {
        if (!m || typeof m !== "object") return;
        if (!peer) { if (m.t === "me" && ID_RE.test(m.id || "") && m.game === o.game && m.id !== me.id) { peer = m.id; if (how === "via") joinVia = peer; welcome(peer, conn, m, how); } return; }
        inbox(peer, m);
      });
      // after leave() my own closing links must not report the others as gone
      conn.onClose(function () { if (closed) return; if (peer && links[peer] === conn) dropped(peer); else if (!peer && how === "via") { lost = true; emit(); } });
      conn.send(meMsg());
    }
    function welcome(id, conn, m, how) {
      if (links[id]) { try { links[id].close(); } catch (e) {} }
      links[id] = conn;
      var x = members[id] || (members[id] = { id: id, seat: -1 });
      x.name = clean(m.name, 20) || "?"; x.emoji = clean(m.emoji, 8) || "🙂"; x.auto = m.auto === true;
      if (how && how.seat != null && m.seat === -1) {
        // a group link: whoever connects first gets the lowest seat the link still holds
        if (how.group) invites.forEach(function (i) { if (i.group === how.group && i.seat < how.seat && holds[i.seat] === me.id) { var t = i.seat; i.seat = how.seat; how.seat = t; } });
        if (holds[how.seat] === me.id) { delete holds[how.seat]; all({ t: "unhold", seat: how.seat }); }
        var s = roster()[how.seat] || (holds[how.seat] && holds[how.seat] !== me.id) ? free() : how.seat;
        if (s < 0 || hand) { conn.send({ t: "full" }); delete links[id]; delete members[id]; setTimeout(function () { try { conn.close(); } catch (e) {} }, 500); emit(); return; }
        x.seat = s;
        conn.send({ t: "seat", seat: s, no: no, scores: scores, rules: house, rv: rulesV, rby: rulesBy,
          members: others().filter(function (y) { return y !== id; }).map(function (y) { var z = members[y]; return { id: y, name: z.name, emoji: z.emoji, seat: z.seat }; }) });
        Object.keys(links).forEach(function (y) { if (y !== id) send(y, { t: "join", id: id, name: x.name, emoji: x.emoji, seat: s }); });
      } else if (m.seat >= 0 && m.seat < SEATS) x.seat = m.seat;
      all(peersMsg()); emit();
    }
    function dropped(id) { delete links[id]; all({ t: "gone", id: id }); remove(id); }
    function remove(id) {
      if (!members[id]) return;
      // handed over (or the handover still waits in the queue): the seat plays on Auto until the hand is over
      var hs = hand ? hand.roster.indexOf(id) : -1;
      if (hs >= 0 && (hand.ghost[hs] || (queues[id] || []).some(function (q) { return q.m.t === "handover" && (q.m.no | 0) === hand.no; }))) {
        members[id].gone = true;
        if (links[id]) { var l = links[id]; delete links[id]; try { l.close(); } catch (e) {} }
        emit(); return;
      }
      var name = members[id].name;
      delete members[id]; delete readies[id]; delete queues[id]; delete scores[id];
      if (links[id]) { var c = links[id]; delete links[id]; try { c.close(); } catch (e) {} }
      if (hand) { hand = null; no++; last = { aborted: true, who: name }; want = true; if (leaving) setTimeout(function () { leaving = false; leave(true); }, 0); }
      all(peersMsg()); emit(); maybeReady();
    }

    // ---------- inbound ----------
    function inbox(from, m) { if (closed) return; (queues[from] = queues[from] || []).push({ m: m, at: Date.now() }); pump(); }
    function pump() {
      if (pumping) return; pumping = true;
      try {
        for (var moved = true; moved;) {
          moved = false;
          Object.keys(queues).forEach(function (id) {
            var q = queues[id];
            while (q && q.length) {
              var r;
              try { r = handle(id, q[0].m); } catch (e) { r = null; }
              if (r === WAIT) { if (Date.now() - q[0].at < BLOCK_MS) break; note = "stuck"; }
              q.shift(); moved = true;
            }
          });
        }
      } finally { pumping = false; }
      var waiting = Object.keys(queues).some(function (id) { return queues[id].length; });
      clearTimeout(timer); if (waiting && !closed) timer = setTimeout(pump, 1000);
      emit();
    }
    function handle(from, m) {
      if (TABLE_TYPES.indexOf(m.t) >= 0) { table(from, m); return null; }
      return game(from, m);
    }
    function table(from, m) {
      var x = members[from];
      if (m.t === "seat" && me.seat < 0 && from === joinVia && m.seat >= 0 && m.seat < SEATS) {
        me.seat = m.seat; no = Math.max(no, m.no | 0);
        (Array.isArray(m.members) ? m.members : []).slice(0, SEATS).forEach(function (y) {
          if (!ID_RE.test(y.id || "") || y.id === me.id || !(y.seat >= 0 && y.seat < SEATS)) return;
          var z = members[y.id] || (members[y.id] = { id: y.id }); z.seat = y.seat; z.name = z.name || clean(y.name, 20); z.emoji = z.emoji || clean(y.emoji, 8);
        });
        if (m.scores && typeof m.scores === "object") Object.keys(m.scores).forEach(function (k) { if (ID_RE.test(k)) scores[k] = Number(m.scores[k]) || 0; });
        takeRules(m.rules, m.rv, m.rby, true);
        // a link to everybody else; the tokens travel through the player who invited me
        others().forEach(function (id) { if (!links[id]) linkTo(id); });
        all(meMsg());
      } else if (m.t === "full" && me.seat < 0) { lost = true; note = "full"; }
      else if (m.t === "join" && ID_RE.test(m.id || "") && m.id !== me.id && m.seat >= 0 && m.seat < SEATS) {
        var z = members[m.id] || (members[m.id] = { id: m.id, seat: -1 }); if (z.seat < 0) z.seat = m.seat;
        z.name = z.name || clean(m.name, 20); z.emoji = z.emoji || clean(m.emoji, 8);
      } else if (m.t === "me" && x && m.seat >= 0 && m.seat < SEATS) x.seat = m.seat;
      else if (m.t === "auto" && x) x.auto = m.on === true;
      else if (m.t === "rules" && x) { if (takeRules(m.r, m.v, from)) { meReady = null; maybeReady(); } }
      else if (m.t === "hold" && x && m.seat >= 0 && m.seat < SEATS) {
        var mine = holds[m.seat] === me.id;
        if (!mine || x.seat < me.seat) holds[m.seat] = from;           // two holds on one seat: the lower seat keeps it
        if (mine && x.seat < me.seat) { var s = free(); invites.forEach(function (i) { if (i.seat === m.seat) i.seat = s; }); if (s >= 0) { holds[s] = me.id; all({ t: "hold", seat: s }); } }
      } else if (m.t === "unhold" && holds[m.seat] === from) delete holds[m.seat];
      else if (m.t === "gone" && ID_RE.test(m.id || "")) { if (m.id === me.id) { lost = true; leave(true); } else remove(m.id); }
      else if (m.t === "peers" && x) {
        x.peers = (Array.isArray(m.ids) ? m.ids : []).filter(function (y) { return ID_RE.test(y); }).slice(0, SEATS);
        x.ch = (Array.isArray(m.ch) ? m.ch : []).slice(0, SEATS); maybeReady();
      } else if (m.t === "ready" && x && Array.isArray(m.roster)) { readies[from] = { no: m.no | 0, roster: m.roster.join() + "|" + R.rules(m.rules).join(".") }; if ((m.no | 0) > no && !hand) no = m.no | 0; maybeReady(); }
      else if (m.t === "fwd" && x && m.m && m.m.t === "link" && links[m.to]) send(m.to, { t: "link", token: m.m.token, from: from });
      else if (m.t === "link" && /^[A-Za-z0-9_-]{22}$/.test(m.token || "") && members[m.from] && !links[m.from]) {
        retry(function () { return live.accept(m.token, function () {}); }).then(function (c) { attach(c, null); }).catch(function () { note = "mesh"; emit(); });
      }
    }
    async function linkTo(id) {
      try {
        var inv = await retry(function () { return live.invite(function () {}); });
        send(joinVia, { t: "fwd", to: id, m: { t: "link", token: inv.token } });
        attach(await inv.ready, null);
      } catch (e) { note = "mesh"; emit(); }
    }

    // ---------- house rules ----------
    function takeRules(r, v, by, force) {
      if (!Array.isArray(r) || !Number.isInteger(v) || v < 0) return false;
      by = ID_RE.test(by || "") ? by : "";
      if (!force && (v < rulesV || (v === rulesV && !(by && (!rulesBy || by < rulesBy))))) return false;
      house = R.rules(r); rulesV = v; rulesBy = by; return true;
    }
    // Fixed for me once I said "ready" at a full table: the others may already start with the rules they have.
    function rulesOpen() { return !hand && !closed && me.seat >= 0 && !(meReady && complete()); }
    function setRules(list) {
      if (!rulesOpen()) return false;
      house = R.rules(list); rulesV++; rulesBy = me.id;
      all({ t: "rules", r: house, v: rulesV }); meReady = null; maybeReady(); emit(); return true;
    }

    // ---------- starting a hand ----------
    function maybeReady() {
      if (closed || hand || me.seat < 0) return;
      var r = roster().join() + "|" + house.join("."), ok = complete();
      if (want && ok && (!meReady || meReady.no !== no || meReady.roster !== r)) { meReady = { no: no, roster: r }; all({ t: "ready", no: no, roster: roster(), rules: house }); }
      if (!ok || !meReady || meReady.no !== no || meReady.roster !== r) return;
      if (others().every(function (id) { var x = readies[id]; return x && x.no === no && x.roster === r; })) begin();
    }
    function begin() {
      var lay = R.layout();
      hand = { no: no, roster: roster(), lay: lay, d1: [], d2: [], sec: MP.secrets(N), keys: {}, own: lay.hands[me.seat].slice(), open: {}, played: {}, pushed: [],
        rev: {}, state: R.start({ dealer: no % SEATS, rules: house }), flags: [], ghost: {}, moves: 0, pub: {}, sent: {}, bad: {} };
      want = false; meReady = null; readies = {}; last = null;
      step(); emit();
    }
    // Shuffle or lock when it is my turn in the chain; once the deck is locked, hand out my keys of everyone's cards.
    function step() {
      var h = hand, n = SEATS;
      if (h.d1.length === me.seat) { h.d1.push(MP.shuffle(me.seat ? h.d1[me.seat - 1] : MP.cards(N), h.sec)); all({ t: "s1", no: h.no, d: h.d1[me.seat] }); }
      if (h.d1.length === n && h.d2.length === me.seat) { h.d2.push(MP.lock(me.seat ? h.d2[me.seat - 1] : h.d1[n - 1], h.sec)); all({ t: "s2", no: h.no, d: h.d2[me.seat] }); }
      if (h.d2.length === n && !h.dealt) {
        h.dealt = true;
        for (var s = 0; s < n; s++) if (s !== me.seat) send(h.roster[s], { t: "keys", no: h.no, pos: h.lay.hands[s], k: h.lay.hands[s].map(function (p) { return h.sec.ki[p]; }) });
        openOwn(); bare();
      }
    }
    function final() { return hand.d2.length === SEATS ? hand.d2[SEATS - 1] : null; }
    function keysFor(p) {
      var out = [];
      for (var s = 0; s < SEATS; s++) {
        var k = s === me.seat ? hand.sec.ki[p] : hand.ghost[s] ? hand.ghost[s].sec.ki[p] : hand.keys[p] && hand.keys[p][s];
        if (!k) return null; out.push(k);
      }
      return out;
    }
    function openOwn() {
      var f = final(); if (!f) return;
      hand.own.forEach(function (p) { if (hand.open[p] == null) { var k = keysFor(p); if (k) hand.open[p] = MP.open(f[p], k, N); } });
    }
    // ---------- Bauernskat: the stack cards everyone may see ----------
    // My key for every position the rules let open now goes to everyone (once); a position whose keys are all in is
    // opened and turned up in the state on every device alike.
    function bare() {
      var h = hand, f = final(); if (!h || !f || !R.reveals) return;
      for (var moved = true; moved && hand === h;) {
        moved = false;
        var list = R.reveals(h.state).map(function (r) { r.p = h.lay.stacks[r.seat][r.i][r.kind]; return r; });
        list.forEach(function (r) { if (!h.sent[r.p]) { h.sent[r.p] = 1; all({ t: "keys", no: h.no, pos: [r.p], k: [h.sec.ki[r.p]] }); } });
        list.forEach(function (r) {
          var k = keysFor(r.p); if (!k || h.bad[r.p]) return;
          var id = MP.open(f[r.p], k, N), x = id >= 0 ? R.apply(h.state, { t: "turn", seat: r.seat, i: r.i, card: R.DECK[id] }) : null;
          // my key is the one I made, so with two seats a key that does not fit is the other one's
          if (!x || !x.ok) { h.bad[r.p] = 1; flag(SEATS === 2 ? 1 - me.seat : r.seat, "key"); note = "badkey"; return; }
          h.state = x.state; h.pub[r.p] = id; moved = true;
        });
      }
    }
    // the position of the card showing on a stack, or -1
    function topPos(seat, i) { var x = hand.state.stacks && hand.state.stacks[seat][i]; return !x || x.top == null ? -1 : hand.lay.stacks[seat][i][x.under ? "up" : "down"]; }
    function stackPos(seat, card) {
      if (!hand.lay.stacks) return -1;
      for (var i = 0; i < hand.lay.stacks[seat].length; i++) { var p = topPos(seat, i); if (p >= 0 && hand.state.stacks[seat][i].top === card) return p; }
      return -1;
    }
    function live_(p) { return hand.open[p] != null && hand.open[p] >= 0 && hand.played[p] == null && hand.pushed.indexOf(p) < 0; }
    function myCards() { return hand ? hand.own.filter(live_).map(function (p) { return R.DECK[hand.open[p]]; }) : []; }
    function cardPos(card) { for (var i = 0; i < hand.own.length; i++) { var p = hand.own[i]; if (live_(p) && R.DECK[hand.open[p]] === card) return p; } return stackPos(me.seat, card); }
    function allowed(seat, p) {
      if (hand.played[p] != null) return false;
      if (hand.lay.hands[seat].indexOf(p) >= 0) return true;
      if (hand.lay.stacks) return hand.lay.stacks[seat].some(function (x, i) { return topPos(seat, i) === p; });
      var st = hand.state;
      return !!hand.lay.skat && hand.lay.skat.indexOf(p) >= 0 && st.declarer === seat && !!st.pickedUp;
    }
    function reveal(p, keys, seat) {
      var f = final(); if (!f || !Array.isArray(keys) || keys.length !== SEATS || !keys.every(MP.isPoint)) return -1;
      if (seat !== me.seat && keys[me.seat] !== hand.sec.ki[p]) return -1;    // my own key must be the one I gave out
      return MP.open(f[p], keys, N);
    }

    // ---------- the game messages ----------
    function game(from, m) {
      if (!hand || (m.no | 0) > hand.no) return (m.no | 0) >= no ? WAIT : null;
      if ((m.no | 0) < hand.no) return null;
      var seat = hand.roster.indexOf(from), h = hand, f = final();
      if (seat < 0) return null;
      if (m.t === "s1") {
        if (h.d1.length !== seat) return h.d1.length < seat ? WAIT : null;
        if (!Array.isArray(m.d) || m.d.length !== N || !m.d.every(MP.isPoint)) { flag(seat, "deal"); return null; }
        h.d1.push(m.d); step(); return null;
      }
      if (m.t === "s2") {
        if (h.d1.length < SEATS || h.d2.length < seat) return WAIT;
        if (h.d2.length !== seat) return null;
        if (!Array.isArray(m.d) || m.d.length !== N || !m.d.every(MP.isPoint)) { flag(seat, "deal"); return null; }
        h.d2.push(m.d); step(); return null;
      }
      if (m.t === "keys") {
        if (!Array.isArray(m.pos) || !Array.isArray(m.k) || m.pos.length !== m.k.length) return null;
        m.pos.forEach(function (p, i) { if (p >= 0 && p < N && MP.isPoint(m.k[i])) (h.keys[p] = h.keys[p] || {})[seat] = m.k[i]; });
        openOwn(); settle(); return null;
      }
      if (m.t === "rev") {
        if (!R.done(h.state)) return WAIT;
        if (!MP.validSecrets(m.sec, N)) { flag(seat, "deal"); return null; }
        h.rev[seat] = { sec: m.sec, pushed: Array.isArray(m.pushed) ? m.pushed.slice(0, 2) : [] };
        finish(); return null;
      }
      if (m.t === "handover") {
        if (!f) return WAIT;
        if (seat !== me.seat && !h.ghost[seat] && !h.rev[seat]) takeOver(seat, m);   // also right at the end: then it stands in for the reveal
        return null;
      }
      if (m.t !== "act" || !m.a || typeof m.a.t !== "string") return null;
      if (!f) return WAIT;
      var a = { t: m.a.t, seat: seat }, r;
      if (a.t === "play") {
        if (!(m.pos >= 0 && m.pos < N) || !allowed(seat, m.pos)) { if (R.turn(h.state) !== seat) return WAIT; flag(seat, "card"); return null; }
        var id = reveal(m.pos, m.keys, seat); if (id < 0) { flag(seat, "card"); return null; }
        a.card = R.DECK[id];
        if (h.pub[m.pos] != null && h.pub[m.pos] !== id) { flag(seat, "card"); return null; }   // a stack card is what lies open
        r = R.apply(h.state, a); if (!r.ok) return WAIT;
        h.played[m.pos] = seat; h.state = r.state;
      } else if (a.t === "show") {
        if (!Array.isArray(m.pos) || !Array.isArray(m.keys) || m.pos.length !== m.keys.length) return null;
        var cards = [];
        for (var i = 0; i < m.pos.length; i++) {
          if (!allowed(seat, m.pos[i])) { flag(seat, "card"); return null; }
          var c = reveal(m.pos[i], m.keys[i], seat); if (c < 0) { flag(seat, "card"); return null; }
          cards.push(R.DECK[c]);
        }
        a.cards = cards;
        r = R.apply(h.state, a); if (!r.ok) return WAIT; h.state = r.state;
      } else {
        ["v", "p", "a", "game", "hand", "schneider", "schwarz", "ouvert"].forEach(function (k) { if (m.a[k] !== undefined) a[k] = m.a[k]; });
        if (R.kontraLate && R.kontraLate(h.state, a)) return null;      // said already by the other defender: nothing to wait for
        r = R.apply(h.state, a); if (!r.ok) return WAIT; h.state = r.state;
        // Skat: the declarer picks up, so everyone else hands over their keys of the two skat cards
        if (a.t === "pickup" && seat !== me.seat) send(from, { t: "keys", no: h.no, pos: h.lay.skat, k: h.lay.skat.map(function (p) { return h.sec.ki[p]; }) });
        if (a.t === "pickup" && seat === me.seat) { h.own = h.own.concat(h.lay.skat); openOwn(); }
      }
      h.moves++; settle();
      return null;
    }
    // ---------- a seat handed over: every device plays it the same way ----------
    // m: { sec, open: [[pos, keys of every seat]], pushed }. Every key I gave that player must be in it, and every
    // card of that player must open with it - else it is not that player's handover.
    function takeOver(seat, m) {
      var h = hand, f = final(), open = {};
      if (!MP.validSecrets(m.sec, N)) { flag(seat, "deal"); return; }
      if (h.lay.hands[me.seat].some(function (p) { return h.keys[p] && h.keys[p][seat] && h.keys[p][seat] !== m.sec.ki[p]; })) { flag(seat, "deal"); return; }
      var may = h.lay.hands[seat].concat(h.lay.skat && h.state.declarer === seat && h.state.pickedUp ? h.lay.skat : []);
      (Array.isArray(m.open) ? m.open : []).slice(0, may.length).forEach(function (x) {
        var p = Array.isArray(x) ? x[0] : -1, k = Array.isArray(x) ? x[1] : null;
        if (may.indexOf(p) < 0 || !Array.isArray(k) || k.length !== SEATS || !k.every(MP.isPoint) || k[seat] !== m.sec.ki[p] || k[me.seat] !== h.sec.ki[p]) return;
        var id = MP.open(f[p], k, N); if (id >= 0) open[p] = id;
      });
      if (may.some(function (p) { return open[p] == null; })) { flag(seat, "deal"); return; }
      var pushed = (Array.isArray(m.pushed) ? m.pushed : []).filter(function (p) { return open[p] != null; }).slice(0, 2);
      h.ghost[seat] = { sec: m.sec, open: open, pushed: pushed };
      var x = members[h.roster[seat]]; if (x) x.auto = true;
      openOwn(); settle();
    }
    function ghostCards(seat) {
      var h = hand, g = h.ghost[seat];
      return Object.keys(g.open).map(Number).filter(function (p) { return h.played[p] == null && g.pushed.indexOf(p) < 0; })
        .sort(function (a, b) { return a - b; }).map(function (p) { return { p: p, card: R.DECK[g.open[p]] }; });
    }
    // After every move: handed-over seats move at once, the same on every device; at the end all secrets go round.
    function settle() {
      var h = hand;
      bare();
      while (hand === h && !R.done(h.state)) {
        var s = R.turn(h.state), g = h.ghost[s]; if (!g || s === me.seat) break;
        var cs = ghostCards(s), a = R.auto(h.state, s, cs.map(function (x) { return x.card; }));
        if (!a) break;
        var at = function (c) { var x = cs.filter(function (y) { return y.card === c; })[0]; return x ? x.p : stackPos(s, c); };
        if (a.t === "play") h.played[at(a.card)] = s;
        if (a.t === "push") g.pushed = a.cards.map(at);
        var r = R.apply(h.state, a); if (!r.ok) { flag(s, "auto"); break; }
        h.state = r.state; h.moves++; bare();
      }
      if (hand === h && R.done(h.state)) {
        Object.keys(h.ghost).forEach(function (s) { h.rev[s] = { sec: h.ghost[s].sec, pushed: h.ghost[s].pushed }; });
        if (!h.revealed) { h.revealed = true; all({ t: "rev", no: h.no, sec: h.sec, pushed: h.pushed }); h.rev[me.seat] = { sec: h.sec, pushed: h.pushed }; }
        finish();
      }
    }
    function flag(seat, why) { if (hand) hand.flags.push({ seat: seat, why: why }); }
    // All secrets are in: replay the deal, score the hand, check every card played against the real hands.
    function finish() {
      var h = hand; if (!h || Object.keys(h.rev).length < SEATS) return;
      var v = MP.verify({ n: N, d1: h.d1, d2: h.d2, sec: h.roster.map(function (id, s) { return h.rev[s].sec; }) });
      var out = { no: h.no, roster: h.roster, state: h.state, flags: h.flags.slice() };
      if (!v.ok) out.cheat = v.seat;
      else {
        var full = { hands: h.lay.hands.map(function (ps) { return ps.map(function (p) { return R.DECK[v.deck[p]]; }); }) };
        if (h.lay.stacks) full.stacks = h.lay.stacks.map(function (row) { return row.map(function (x) { return { up: R.DECK[v.deck[x.up]], down: R.DECK[v.deck[x.down]] }; }); });
        if (h.lay.skat) {
          full.skat = h.lay.skat.map(function (p) { return R.DECK[v.deck[p]]; });
          var d = h.state.declarer;
          if (d >= 0 && h.state.pickedUp) full.pushed = h.rev[d].pushed.filter(function (p) { return p >= 0 && p < N; }).map(function (p) { return R.DECK[v.deck[p]]; });
        }
        out.full = full; out.audit = R.audit(h.state, full).concat(h.flags);
        if (!out.audit.length) {
          out.result = R.result(h.state, full);
          var pts = o.game === "skat" ? out.result.list : out.result.points;
          (pts || []).forEach(function (x, s) { scores[h.roster[s]] = (scores[h.roster[s]] || 0) + x; });
        }
      }
      out.names = h.roster.map(function (id) { var x = id === me.id ? me : members[id]; return x ? x.emoji + " " + x.name : "?"; });
      last = out; hand = null; no++;
      if (leaving) setTimeout(function () { leaving = false; leave(true); }, 0);   // stood up during the hand: now it is over
      Object.keys(members).forEach(function (id) { if (members[id].gone) remove(id); });   // a handed-over seat is free now
      emit();
    }

    // ---------- what the player does ----------
    function act(a) {
      if (!hand || closed || !final() || (queues[me.id] || []).length) return false;   // my last move is not through yet
      var h = hand, m = { t: "act", no: h.no, a: { t: a.t } };
      ["v", "p", "a", "game", "hand", "schneider", "schwarz", "ouvert"].forEach(function (k) { if (a[k] !== undefined) m.a[k] = a[k]; });
      if (a.t === "play") { var p = cardPos(a.card); if (p < 0) return false; m.pos = p; m.keys = keysFor(p); if (!m.keys) return false; }
      if (a.t === "push") {
        var ps = (a.cards || []).map(cardPos); if (ps.length !== 2 || ps[0] < 0 || ps[1] < 0 || ps[0] === ps[1]) return false;
        h.pushed = ps;      // which two stay secret until the reveal
      }
      if (R.actions(h.state, me.seat, myCards()).every(function (x) { return x.t !== a.t; })) return false;
      if (a.t === "show") {
        var mine = h.own.filter(live_);
        m.pos = mine; m.keys = mine.map(keysFor); if (m.keys.some(function (k) { return !k; })) return false;
      }
      all(m); inbox(me.id, m);
      return true;
    }
    // ---------- Auto: only my own device moves for me ----------
    // A new turn of mine starts the clock; when it runs out (at once on Auto) the rules pick the move.
    function arm() {
      var h = hand, mine = !!h && !closed && R.turn(h.state) === me.seat && actions().length > 0;
      var key = mine ? h.no + ":" + h.moves + ":" + me.auto : "";
      if (key === autoKey) return;
      autoKey = key; clearTimeout(autoT); deadline = 0;
      if (!mine) return;
      var ms = me.auto ? autoFast : autoMs; if (ms < 0) return;   // autoMs -1: no clock for me (a game against the bot)
      deadline = Date.now() + ms;
      autoT = setTimeout(fire, ms);
    }
    function fire() {
      if (!hand || closed || R.turn(hand.state) !== me.seat) return;
      var a = R.auto(hand.state, me.seat, myCards());
      if (!a || !act(a)) autoT = setTimeout(fire, 1000);        // my last move is not through yet: a moment later
    }
    function setAuto(on) { me.auto = !!on; all({ t: "auto", on: me.auto }); emit(); }
    // Only once my whole hand is open (and the skat, after picking it up).
    function actions() {
      if (!hand || !final() || me.seat < 0) return [];
      if (hand.own.some(function (p) { return hand.open[p] == null; })) return [];
      return R.actions(hand.state, me.seat, myCards());
    }

    // ---------- seats and invites ----------
    async function inviteSeat(group) {
      var s = free(); if (s < 0 || me.seat < 0 || closed) throw new Error("full");
      holds[s] = me.id; all({ t: "hold", seat: s }); emit();
      var inv;
      try { inv = await retry(function () { return live.invite(function () {}); }); }
      catch (e) { if (holds[s] === me.id) { delete holds[s]; all({ t: "unhold", seat: s }); } emit(); throw e; }
      var rec = { token: inv.token, expires: inv.expires, seat: s, group: group || 0 }; invites.push(rec);
      inv.ready.then(function (c) { attach(c, rec); }, function () { if (holds[rec.seat] === me.id) { delete holds[rec.seat]; all({ t: "unhold", seat: rec.seat }); } })
        .then(function () { invites = invites.filter(function (x) { return x !== rec; }); emit(); });
      emit();
      return rec;
    }
    // One link for every free seat: a one-time token per seat, all in the same link (see the top).
    async function inviteAll() {
      var r = roster(), n = 0;
      for (var s = 0; s < SEATS; s++) if (!r[s] && !holds[s]) n++;
      if (!n || me.seat < 0 || closed) throw new Error("full");
      var g = ++groups, tries = [];
      for (var i = 0; i < n; i++) tries.push(inviteSeat(g));
      tries.forEach(function (x) { x.catch(function () {}); });   // handled below, one by one; no unhandled rejection meanwhile
      var got = [], err = null;
      for (var j = 0; j < tries.length; j++) { try { got.push(await tries[j]); } catch (e) { err = err || e; } }
      if (!got.length) throw err;
      got.sort(function (a, b) { return a.seat - b.seat; });
      return { group: g, tokens: got.map(function (x) { return x.token; }), expires: got[0].expires };
    }
    // Standing up during a hand hands the seat over (see the top); before the cards are open the hand just ends.
    function handover() {
      var h = hand;
      if (!h || !final() || me.seat < 0 || R.done(h.state) || h.own.some(function (p) { return h.open[p] == null; })) return null;
      return { t: "handover", no: h.no, sec: h.sec, pushed: h.pushed, open: h.own.map(function (p) { return [p, keysFor(p)]; }) };
    }
    // now: leave at once (Bauernskat against the bot on this device: both go together)
    function leave(now) {
      if (closed) return;
      if (now !== true && R.reveals && hand && final() && me.seat >= 0 && !R.done(hand.state)) {
        if (!leaving) { leaving = true; setAuto(true); }
        return;
      }
      var ho = handover(), ls = links;
      closed = true; clearTimeout(timer); clearTimeout(autoT); links = {};
      function shut() { Object.keys(ls).forEach(function (id) { try { ls[id].close(); } catch (e) {} }); }
      if (ho) { Object.keys(ls).forEach(function (id) { ls[id].send(ho); }); setTimeout(shut, HANDOVER_MS); } else shut();
      emit();
    }
    function next() { if (hand || closed) return; want = true; maybeReady(); emit(); }
    // a newcomer: one link to whoever invited them, the rest follows once the seat is known
    // A group link carries several tokens: the first one nobody has used yet is mine; all used means the table is full.
    async function join(tokens) {
      tokens = [].concat(tokens); var last = null;
      for (var i = 0; i < tokens.length; i++) {
        try { attach(await retry(function () { return live.accept(tokens[i], function () {}); }), "via"); return; }
        catch (e) { last = e; if (e.message !== "gone" && e.message !== "self") throw e; }
      }
      throw new Error(last && last.message === "self" ? "self" : tokens.length > 1 ? "full" : (last && last.message) || "gone");
    }

    function view() {
      var r = roster(), st = hand && hand.state;
      return {
        game: o.game, rules: house.slice(), rulesOpen: rulesOpen(), me: me.id, mySeat: me.seat, no: no, badge: badge(), complete: complete(), lost: lost, closed: closed, note: note, auto: me.auto, deadline: deadline,
        seats: r.map(function (id, s) {
          if (!id) return { free: true, held: !!holds[s] };
          var x = id === me.id ? me : members[id];
          return { id: id, name: x.name, emoji: x.emoji, me: id === me.id, linked: id === me.id || !!links[id], score: scores[id] || 0, auto: !!x.auto, gone: !!x.gone };
        }),
        invites: invites.map(function (i) { return { token: i.token, expires: i.expires, seat: i.seat, group: i.group }; }),
        hand: hand ? { no: hand.no, dealt: !!final() && !hand.own.some(function (p) { return hand.open[p] == null; }) && st.phase !== "deal", state: st, turn: R.turn(st), cards: myCards(), actions: actions(), roster: hand.roster,
          flags: hand.flags.slice(), ghosts: Object.keys(hand.ghost).map(function (s) { return { seat: +s, cards: ghostCards(+s).map(function (x) { return x.card; }) }; }) } : null,
        want: want, last: last
      };
    }
    return {
      id: me.id, view: view, on: function (f) { subs.push(f); }, invite: function () { return inviteSeat(0); }, inviteAll: inviteAll, auto: setAuto, rules: setRules,
      act: act, next: next, leave: leave, join: join,
      _crash: function () { closed = true; Object.keys(links).forEach(function (id) { try { links[id].close(); } catch (e) {} }); },   // tests: a device that just drops off
      _debug: function () { return { hand: hand, members: members, links: Object.keys(links), holds: holds, readies: readies, no: no, inbox: inbox }; }
    };
  }
  var api = {
    create: function (o) { return Table(Object.assign({}, o, { create: true })); },
    join: function (token, o) { var t = Table(Object.assign({}, o, { create: false })); return t.join(token).then(function () { return t; }); },
    BLOCK_MS: BLOCK_MS, AUTO_MS: AUTO_MS
  };
  if (node) module.exports = api; else root.Table = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
