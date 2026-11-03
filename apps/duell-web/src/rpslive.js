/* Rock-paper-scissors live: pure rules (no DOM, no network). Nobody may see the other hand first, so every round runs
   commit-reveal: each side first sends only SHA-256(channel|game|round|hand|salt), and reveals hand and salt once it
   holds the other side's seal. The other side recomputes the hash; a hand that does not match its seal ends the game.
   The salt (128 bit, fresh per round) keeps the three possible hands from being guessed out of the seal. */
(function (root) {
  "use strict";
  var WIN = 5, HANDS = 3, TAG = "rps-live-v1";
  var HEX64 = /^[0-9a-f]{64}$/, HEX32 = /^[0-9a-f]{32}$/;
  function hex(b) { return Array.from(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  function salt() { var b = new Uint8Array(16); root.crypto.getRandomValues(b); return hex(b); }
  async function seal(channel, game, round, hand, s) {
    var msg = [TAG, channel, game, round, hand, s].join("|");
    return hex(await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg)));
  }
  function isHand(h) { return h === 0 || h === 1 || h === 2; }
  function outcome(x, y) { return x === y ? 0 : (x + 2) % HANDS === y ? 1 : -1; }   // same rule as Duel.outcome
  function over(score) { return score[0] >= WIN || score[1] >= WIN; }

  // One game between two phones on one channel. pick() and receive() return what to send; calls run one after the other.
  function match(channel, game) {
    var st = { round: 0, score: [0, 0], mine: null, theirs: null, sent: false, done: false, cheat: false }, chain = Promise.resolve();
    function queue(fn) { var p = chain.then(fn); chain = p.catch(function () {}); return p; }
    function reveal(out) {
      if (st.mine && st.theirs && !st.sent) { st.sent = true; out.push({ t: "r", n: st.round, h: st.mine.hand, s: st.mine.salt }); }
    }
    function result(out, y) {
      var x = st.mine.hand, o = outcome(x, y);
      if (o > 0) st.score[0]++; else if (o < 0) st.score[1]++;
      var r = { x: x, y: y, o: o, round: st.round, score: st.score.slice(), over: over(st.score) };
      st.round++; st.mine = null; st.theirs = null; st.sent = false; st.done = r.over;
      return { send: out, result: r };
    }
    return {
      state: function () { return { round: st.round, score: st.score.slice(), picked: !!st.mine, theyPicked: !!st.theirs, done: st.done, cheat: st.cheat }; },
      pick: function (hand) {
        return queue(async function () {
          if (st.done || st.mine || !isHand(hand)) return { send: [] };
          var s = salt(); st.mine = { hand: hand, salt: s, seal: await seal(channel, game, st.round, hand, s) };
          var out = [{ t: "c", n: st.round, h: st.mine.seal }]; reveal(out); return { send: out };
        });
      },
      receive: function (m) {
        return queue(async function () {
          if (st.done || !m || m.n !== st.round) return { send: [] };
          if (m.t === "c") {
            if (st.theirs || typeof m.h !== "string" || !HEX64.test(m.h)) return { send: [] };
            st.theirs = { seal: m.h }; var out = []; reveal(out); return { send: out, theyPicked: true };
          }
          if (m.t === "r") {
            // A reveal only counts after both seals are out: before that it could follow the other hand.
            if (!st.theirs || !st.sent) return { send: [] };
            var ok = isHand(m.h) && typeof m.s === "string" && HEX32.test(m.s) && await seal(channel, game, st.round, m.h, m.s) === st.theirs.seal;
            if (!ok) { st.done = true; st.cheat = true; return { send: [], cheat: true }; }
            return result([], m.h);
          }
          return { send: [] };
        });
      }
    };
  }

  var api = { WIN: WIN, TAG: TAG, salt: salt, seal: seal, outcome: outcome, over: over, match: match };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RpsLive = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
