// Spur: der eigene Lauf als Bytes, damit der Empfaenger gegen einen Menschen spielt (Geist-Duell per Link).
// Bitgenau aus alt:src/spur.js. Eingabewort je Tick: Bit 0 Tap (Puls), Bit 1 Halten, Bit 2 Ducken (Pegel).
// Varints (LEB128, max. 4 Byte), ein Eintrag je Tick mit Aenderung: v gerade = nur Tap, v = gap*2; v ungerade:
// v = gap*16 + d*2 + 1 (d = 0: Ende, nur als letzter Eintrag). Genau eine Kodierung je Lauf; sanitize kodiert neu.
// Grenzen: Ticks <= 90 s x 120, Summe der Abstaende <= TMAX, hoechstens MAX_BYTES; alles andere faellt weg.
import { mixF64, FNV0, mulberry32 } from "./rng.js";
import { createSim } from "./engine.js";
import { routeParams } from "./params.js";

export const TPS = 120, TMAX = 90 * TPS, MAX_BYTES = 336;

function val(gap, d) { return d === 1 ? gap * 2 : gap * 16 + d * 2 + 1; }
function len(v) { return v < 128 ? 1 : v < 16384 ? 2 : 3; }
function put(out, v) { while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); }
export function encode(ev, end) {
  const out = []; let p = 0;
  for (const e of ev) { put(out, val(e[0] - p, e[1])); p = e[0]; }
  if (end != null) put(out, val(end - p, 0));
  return new Uint8Array(out);
}
/** -> { ev: [[t, d], ...], end } oder null. Wirft nie, liest nie ueber die Eingabe hinaus, O(Laenge). */
export function parse(b) {
  if (!(b instanceof Uint8Array) || b.length > MAX_BYTES) return null;
  const ev = []; let t = 0, i = 0, end = null; const n = b.length;
  while (i < n) {
    let v = 0, mul = 1, k = 0, c, d, gap;
    do {
      if (i >= n || k === 4) return null;
      c = b[i++]; v += (c & 127) * mul; mul *= 128; k++;
    } while (c & 128);
    if (end !== null) return null;
    if (v % 2 === 0) { d = 1; gap = v / 2; } else { d = (v % 16 - 1) / 2; gap = (v - v % 16) / 16; if (d === 1) return null; }
    if (d === 0) { end = t + gap; if (end > TMAX) return null; continue; }
    if (ev.length && gap === 0) return null;
    t += gap;
    if (t > TMAX) return null;
    ev.push([t, d]);
  }
  return { ev, end };
}
export function sanitize(b) { const r = parse(b); return r && (r.ev.length || r.end !== null) ? encode(r.ev, r.end) : null; }

/** Aufnahme: put(t, w) mit dem vollen Eingabewort am Tick t, end(t) am Ende. Endet ehrlich an MAX_BYTES. */
export function recorder() {
  const ev = []; let lvl = 0, before = 0, end = null, n = 0;
  const prev = (i) => (i > 0 ? ev[i - 1][0] : 0);
  return {
    put(t, w) {
      if (end !== null || t > TMAX) return;
      const i = ev.length - 1, last = ev[i]; let d, s;
      if (last && t < last[0]) return;
      if (last && t === last[0]) {
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
    end(t) { if (end === null) end = Math.min(TMAX, t); },
    bytes() { return encode(ev, end); }
  };
}
/** Wiedergabe: at(t) -> Eingabewort am Tick t (t laeuft nur vorwaerts). end: letzter Tick des Absenders oder null. */
export function player(b) {
  const r = parse(b) || { ev: [], end: null }; let i = 0, lvl = 0;
  return {
    end: r.end,
    at(t) {
      let w = lvl;
      while (i < r.ev.length && r.ev[i][0] <= t) {
        const e = r.ev[i++];
        lvl ^= e[1] & 6;
        w = e[0] === t ? lvl | (e[1] & 1) : lvl;
      }
      return w;
    }
  };
}
/** Spielt eine Flug-Spur auf der Engine (st: Zustand mit seed, params, route?, k?): der Geist. */
export function fly(st, bytes) {
  const p = player(bytes || st.spur), sim = createSim(st.params, mulberry32(st.seed), routeParams(st), st.k);
  let h = FNV0;
  const stop = p.end === null ? TMAX : p.end;
  if (p.at(0) & 1) sim.flap();
  while (sim.state === "run" && sim.ticks < stop) {
    if (p.at(sim.ticks) & 1) sim.flap();
    sim.step();
    h = mixF64(mixF64(h, sim.bird.y), sim.bird.vy);
  }
  return { score: sim.score, ticks: sim.ticks, hash: h };
}
