// Eingabespuren fuer den Geist (ADR 0001 b). Zwei Formate, beide kanonisch (der Leser lehnt jede zweite Schreibweise ab):
//  1) Allgemein: je Tick mit geaenderter Eingabe  varint(gap) · varint(mask) · Werte; Ende = varint(gap) · 0.
//     mask: bit0 b (varint), bit1 ax (zigzag), bit2 ay (zigzag), bit3 p (varint Anzahl, je Zeiger zigzag id,x,y,f).
//     Der erste Eintrag darf gap 0 haben, jeder weitere gap >= 1. Ausgangseingabe ist {b:0}.
//  2) Spur (Altcode spur.js, bytegleich): nur b mit bit0 Tippen (Impuls), bit1 Halten, bit2 Ducken. Fuer Karten mit
//     hoechstens diesen drei Knoepfen, damit die alten Golden-Spuren gelten (Port spur.js:16-95).
// Rein, ohne DOM/Uhr. Ganzzahlen bis 2^28 (varint <= 4 Byte).

// ---------- varint ----------
function put(out, v) { if (!Number.isInteger(v) || v < 0 || v >= 268435456) throw new RangeError("trace: varint"); while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); }
function zig(v) { return v >= 0 ? v * 2 : -v * 2 - 1; }
function unzig(u) { return u % 2 === 0 ? u / 2 : -(u + 1) / 2; }
function reader(b) {
  let i = 0;
  return {
    get done() { return i >= b.length; },
    v() { let v = 0, mul = 1, k = 0, c; do { if (i >= b.length || k === 4) throw new RangeError("trace: varint"); c = b[i++]; v += (c & 127) * mul; mul *= 128; k++; } while (c & 128); return v; }
  };
}

// ---------- b64url ----------
export function toB64url(bytes) { let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function fromB64url(str) {
  if (typeof str !== "string" || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) return null;
  let bin; try { bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4)); } catch (e) { return null; }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ---------- allgemeine Spur ----------
export const EMPTY = Object.freeze({ b: 0 });
function norm(x) { const o = { b: x && Number.isInteger(x.b) ? x.b : 0 }; if (x && x.ax) o.ax = x.ax; if (x && x.ay) o.ay = x.ay; if (x && Array.isArray(x.p) && x.p.length) o.p = x.p.map((q) => q.slice(0, 4)); return o; }
function sameP(a, b) { a = a || []; b = b || []; if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) for (let j = 0; j < 4; j++) if (a[i][j] !== b[i][j]) return false; return true; }
function diffMask(a, b) { return (a.b !== b.b ? 1 : 0) | ((a.ax || 0) !== (b.ax || 0) ? 2 : 0) | ((a.ay || 0) !== (b.ay || 0) ? 4 : 0) | (sameP(a.p, b.p) ? 0 : 8); }

/** Aufnahme: put(tick, input) je Tick (oder nur bei Aenderung), end(tick). maxBytes begrenzt (die Spur endet dort). */
export function recorder(maxBytes = 600) {
  const out = []; let last = norm(EMPTY), lastT = 0, first = true, end = null;
  return {
    put(t, x) {
      if (end !== null) return;
      if (!first && t <= lastT) { if (t === lastT) throw new RangeError("trace: zwei Eintraege auf einem Tick"); throw new RangeError("trace: zurueck in der Zeit"); }
      const n = norm(x), m = diffMask(last, n);
      if (!m) return;
      const rec = [];
      put(rec, first ? t : t - lastT); put(rec, m);
      if (m & 1) put(rec, n.b);
      if (m & 2) put(rec, zig(n.ax || 0));
      if (m & 4) put(rec, zig(n.ay || 0));
      if (m & 8) { const p = n.p || []; put(rec, p.length); for (const q of p) for (const v of q) put(rec, zig(v)); }
      if (out.length + rec.length + 5 > maxBytes) { end = t; return; }
      out.push(...rec); last = n; lastT = t; first = false;
    },
    end(t) { if (end === null) end = t; },
    get full() { return end !== null && out.length + 5 > maxBytes; },
    bytes() {
      const e = end === null ? lastT : end, o = out.slice();
      put(o, first ? e : Math.max(0, e - lastT)); put(o, 0);
      return Uint8Array.from(o);
    }
  };
}

/** Liest eine allgemeine Spur. Rueckgabe { at(tick) -> Input, end } oder null (ungueltig/nichtkanonisch). */
export function parse(bytes, maxBytes = 2400) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes || !bytes.length) return null;
  const ev = []; let t = 0, cur = norm(EMPTY), end = null;
  try {
    const r = reader(bytes);
    while (!r.done) {
      if (end !== null) return null;
      const gap = r.v(), m = r.v();
      if (m === 0) { end = (ev.length ? t : 0) + gap; continue; }
      if (m > 15 || (ev.length && gap === 0)) return null;
      t = ev.length ? t + gap : gap;
      const n = { ...cur };
      if (m & 1) n.b = r.v();
      if (m & 2) { n.ax = unzig(r.v()); if (!n.ax) delete n.ax; }
      if (m & 4) { n.ay = unzig(r.v()); if (!n.ay) delete n.ay; }
      if (m & 8) { const k = r.v(); if (k > 5) return null; const p = []; for (let i = 0; i < k; i++) p.push([unzig(r.v()), unzig(r.v()), unzig(r.v()), unzig(r.v())]); if (p.length) n.p = p; else delete n.p; }
      if (diffMask(cur, n) !== m) return null;      // Felder ohne Aenderung im mask: nicht kanonisch
      ev.push([t, n]); cur = n;
    }
  } catch (e) { return null; }
  if (end === null || end < t) return null;
  // Gegenprobe: dieselbe Spur neu geschrieben muss bytegleich sein
  const rec = recorder(maxBytes + 8); for (const [tt, x] of ev) rec.put(tt, x); rec.end(end);
  const again = rec.bytes();
  if (again.length !== bytes.length || again.some((v, i) => v !== bytes[i])) return null;
  let i = 0, at = norm(EMPTY), lastAsk = -1;
  return {
    end,
    at(tick) {
      if (tick < lastAsk) throw new RangeError("trace: zurueck in der Zeit");
      lastAsk = tick;
      while (i < ev.length && ev[i][0] <= tick) at = ev[i++][1];
      return at;
    }
  };
}

// ---------- Spur (Altcode spur.js, bytegleich) ----------
export const SPUR_TPS = 120, SPUR_TMAX = 90 * SPUR_TPS, SPUR_MAX_BYTES = 336;
function sval(gap, d) { return d === 1 ? gap * 2 : gap * 16 + d * 2 + 1; }
function slen(v) { return v < 128 ? 1 : v < 16384 ? 2 : 3; }
export function encodeSpur(ev, end) {
  const out = []; let p = 0;
  for (const [t, d] of ev) { put(out, sval(t - p, d)); p = t; }
  if (end !== null && end !== undefined) put(out, sval(end - p, 0));
  return Uint8Array.from(out);
}
export function parseSpur(b, maxBytes = SPUR_MAX_BYTES) {
  if (!(b instanceof Uint8Array) || b.length > maxBytes) return null;
  const ev = []; let t = 0, i = 0, end = null;
  const n = b.length;
  while (i < n) {
    let v = 0, mul = 1, k = 0, c, d, gap;
    do { if (i >= n || k === 4) return null; c = b[i++]; v += (c & 127) * mul; mul *= 128; k++; } while (c & 128);
    if (end !== null) return null;
    if (v % 2 === 0) { d = 1; gap = v / 2; }
    else { d = (v % 16 - 1) / 2; gap = (v - v % 16) / 16; if (d === 1) return null; }
    if (d === 0) { end = t + gap; if (end > SPUR_TMAX) return null; continue; }
    if (ev.length && gap === 0) return null;
    t += gap;
    if (t > SPUR_TMAX) return null;
    ev.push([t, d]);
  }
  return { ev, end };
}
export function sanitizeSpur(b) { const r = parseSpur(b); return r && (r.ev.length || r.end !== null) ? encodeSpur(r.ev, r.end) : null; }
export function spurRecorder(maxBytes = SPUR_MAX_BYTES) {
  const ev = []; let lvl = 0, before = 0, end = null, n = 0;
  const prev = (i) => (i > 0 ? ev[i - 1][0] : 0);
  return {
    put(t, w) {
      if (end !== null || t > SPUR_TMAX) return;
      const i = ev.length - 1, last = ev[i];
      if (last && t < last[0]) return;
      if (last && t === last[0]) {
        const d = ((last[1] | w) & 1) | ((w ^ before) & 6);
        const s = d ? slen(sval(t - prev(i), d)) : 0;
        if (n - slen(sval(t - prev(i), last[1])) + s > maxBytes - 3) { end = t; return; }
        n += s - slen(sval(t - prev(i), last[1])); lvl = w & 6;
        if (d) last[1] = d; else ev.pop();
        return;
      }
      const d = (w & 1) | ((w ^ lvl) & 6);
      if (!d) return;
      const s = slen(sval(t - prev(i + 1), d));
      if (n + s > maxBytes - 3) { end = t; return; }
      n += s; before = lvl; lvl = w & 6; ev.push([t, d]);
    },
    end(t) { if (end === null) end = Math.min(SPUR_TMAX, t); },
    bytes() { return encodeSpur(ev, end); }
  };
}
export function spurPlayer(b) {
  const r = parseSpur(b) || { ev: [], end: null }; let i = 0, lvl = 0;
  return {
    end: r.end,
    at(t) {
      let w = lvl;
      while (i < r.ev.length && r.ev[i][0] <= t) { const e = r.ev[i++]; lvl ^= e[1] & 6; w = e[0] === t ? lvl | (e[1] & 1) : lvl; }
      return w;
    }
  };
}
