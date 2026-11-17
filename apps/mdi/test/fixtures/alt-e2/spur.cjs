/* Spur: the sender's own run as bytes, so the recipient plays against a person, never a bot (Bauplan freie Karte A7a).
   Node and browser, no DOM. Built into the part 'bahn' with ende.js (A7b); core.js sanitizeState calls Spur.sanitize.

   Input word per tick: bit 0 tap (a pulse, this tick only), bit 1 hold, bit 2 duck (levels, they last until they change).
   A Spur is a list of varints (LEB128, 7 bits per byte, at most 4 bytes), one per tick on which the input word changes;
   gap = ticks since the previous entry, d = the bit delta at that tick (tap bit = a tap, hold/duck bits = level flips):
     v even:  a tap and nothing else, v = gap * 2            (a flight is only taps: 1 byte for gaps up to 63 ticks)
     v odd:   any other delta d,     v = gap * 16 + d * 2 + 1 (d = 0: the end of the run, only as the very last entry)
   The first entry may have gap 0 (a tap at tick 0), every later one except the end gap >= 1, and a lone tap always takes
   the short form: exactly one encoding per run, sanitize re-encodes it.
   Limits: ticks <= 90 s x 120, varint <= 4 bytes, the sum of the gaps <= TMAX, at most MAX_BYTES; anything else is dropped. */
(function (root) {
  "use strict";
  var TPS = 120, TMAX = 90 * TPS;
  // Byte cap of one Spur: the worst-case link (names CJK/ZWJ emoji/Devanagari/Arabic, k=0.5, free card mark) stays
  // <= 1200 characters of base64 (core.js MAX_FRAGMENT) with a Spur this long; test/link-budget.test.js names the bytes.
  var MAX_BYTES = 336;

  function val(gap, d) { return d === 1 ? gap * 2 : gap * 16 + d * 2 + 1; }
  function len(v) { return v < 128 ? 1 : v < 16384 ? 2 : 3; }
  function put(out, v) { while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); }
  function encode(ev, end) {        // ev: [[t, d], ...] ascending, d in 1..7; end: last tick or null
    var out = [], p = 0;
    for (var i = 0; i < ev.length; i++) { put(out, val(ev[i][0] - p, ev[i][1])); p = ev[i][0]; }
    if (end != null) put(out, val(end - p, 0));
    return new Uint8Array(out);
  }
  // -> { ev: [[t, d], ...], end: tick or null } or null. Never throws, never reads past the input, O(length).
  function parse(b) {
    if (!(b instanceof Uint8Array) || b.length > MAX_BYTES) return null;
    var ev = [], t = 0, i = 0, n = b.length, end = null;
    while (i < n) {
      var v = 0, mul = 1, k = 0, c, d, gap;
      do {
        if (i >= n || k === 4) return null;            // cut off inside a varint, or longer than 4 bytes
        c = b[i++]; v += (c & 127) * mul; mul *= 128; k++;
      } while (c & 128);
      if (end !== null) return null;                    // nothing after the end mark
      if (v % 2 === 0) { d = 1; gap = v / 2; }
      else { d = (v % 16 - 1) / 2; gap = (v - v % 16) / 16; if (d === 1) return null; }   // a lone tap has the short form
      if (d === 0) { end = t + gap; if (end > TMAX) return null; continue; }
      if (ev.length && gap === 0) return null;          // two entries on one tick: not the one encoding
      t += gap;
      if (t > TMAX) return null;                        // sum of the gaps beyond 90 s
      ev.push([t, d]);
    }
    return { ev: ev, end: end };
  }
  function sanitize(b) {
    var r = parse(b);
    return r && (r.ev.length || r.end !== null) ? encode(r.ev, r.end) : null;
  }

  // Recorder: put(t, w) with the full input word w at tick t (only when something happens), end(t) when the run is over.
  // A run that would outgrow MAX_BYTES ends there: the ghost stops where the bytes stop (3 bytes kept for the end mark).
  function recorder() {
    var ev = [], lvl = 0, before = 0, end = null, n = 0;
    function prev(i) { return i > 0 ? ev[i - 1][0] : 0; }
    return {
      put: function (t, w) {
        if (end !== null || t > TMAX) return;
        var i = ev.length - 1, last = ev[i], d, s;
        if (last && t < last[0]) return;                 // never back in time
        if (last && t === last[0]) {                     // one more input on the same tick: still one entry
          d = ((last[1] | w) & 1) | ((w ^ before) & 6);
          s = d ? len(val(t - prev(i), d)) : 0;
          if (n - len(val(t - prev(i), last[1])) + s > MAX_BYTES - 3) { end = t; return; }
          n += s - len(val(t - prev(i), last[1])); lvl = w & 6;
          if (d) last[1] = d; else ev.pop();
          return;
        }
        d = (w & 1) | ((w ^ lvl) & 6);
        if (!d) return;
        s = len(val(t - prev(i + 1), d));
        if (n + s > MAX_BYTES - 3) { end = t; return; }
        n += s; before = lvl; lvl = w & 6; ev.push([t, d]);
      },
      end: function (t) { if (end === null) end = Math.min(TMAX, t); },
      bytes: function () { return encode(ev, end); }
    };
  }
  // Player: at(t) -> the input word at tick t; t must not go back. end: the sender's last tick (or null).
  function player(b) {
    var r = parse(b) || { ev: [], end: null }, i = 0, lvl = 0;
    return {
      end: r.end,
      at: function (t) {
        var w = lvl;
        while (i < r.ev.length && r.ev[i][0] <= t) {
          var e = r.ev[i++];
          lvl ^= e[1] & 6;
          w = e[0] === t ? lvl | (e[1] & 1) : lvl;
        }
        return w;
      }
    };
  }

  // FNV-1a over the exact float64 bits: the same hash means the same run bit for bit, not just the same score.
  var dv = new DataView(new ArrayBuffer(8));
  function mix(h, x) { dv.setFloat64(0, x); for (var j = 0; j < 8; j++) h = Math.imul(h ^ dv.getUint8(j), 16777619) >>> 0; return h; }
  // Plays a flight Spur on the engine (E = engine.js, C = core.js, st = a sanitized state with st.spur): the ghost.
  function fly(E, C, st, bytes) {
    var p = player(bytes || st.spur), sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st), st.k), h = 0x811c9dc5;
    var stop = p.end === null ? TMAX : p.end;
    if (p.at(0) & 1) sim.flap();             // the first tap starts the run (engine: ready -> run)
    while (sim.state === "run" && sim.ticks < stop) {
      if (p.at(sim.ticks) & 1) sim.flap();
      sim.step();
      h = mix(mix(h, sim.bird.y), sim.bird.vy);
    }
    return { score: sim.score, ticks: sim.ticks, hash: h };
  }

  var api = { TPS: TPS, TMAX: TMAX, MAX_BYTES: MAX_BYTES, sanitize: sanitize, parse: parse, encode: encode, recorder: recorder, player: player, fly: fly };
  // Also global in Node: core.js sanitizeState finds it as root.DuellSpur wherever spur.js was loaded first.
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DuellSpur = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
