// Glaettung fremder Positionen im Live-Modus net:"split" – nur Anzeige, nie Regeln (ADR 0001 b).
// Port von alt:smooth.js track(): Verzoegerungsziel = late + 2,5·dev + gap, begrenzt auf [min, max]; Uhrversatz als
// Minimum (lokal − Sender) mit Drift; lineare Interpolation; Extrapolation hoechstens extrap Sekunden, dann halten;
// Schrittbegrenzung vmax·dt·1,4 je Dimension. Gleitkomma ist hier erlaubt (Anzeige).

export function createTrack(dim, { vmax, extrap = 0.15, min = 0.04, max = 0.3, lo = null, hi = null } = {}) {
  const buf = []; // [lokal s, sender s, v[]]
  let off = null, late = 0, dev = 0, gap = 0.05, delay = min, offV = null, lastSender = null, out = null;
  const A = 0.1;
  function push(local, sender, v) {
    if (lastSender !== null && sender <= lastSender) return; // alt oder doppelt
    if (lastSender !== null) { const g = Math.min(0.5, sender - lastSender); gap += A * (g - gap); }
    lastSender = sender;
    const o = local - sender;
    off = off === null ? o : Math.min(o, off + 0.002);
    const l = o - off; const e = l - late; late += A * e; dev += A * (Math.abs(e) - dev);
    buf.push([local, sender, v.slice(0, dim)]);
    if (buf.length > 64) buf.shift();
  }
  function sample(local, dtFrame) {
    if (!buf.length) return null;
    const target = Math.min(max, Math.max(min, late + 2.5 * dev + gap));
    delay += (target - delay) * Math.min(1, dtFrame * 2);
    const want = off + delay;
    offV = offV === null ? want : offV + Math.max(-0.1 * dtFrame, Math.min(0.1 * dtFrame, want - offV));
    const t = local - offV; // Senderzeit, die jetzt gezeigt wird
    let v;
    if (t <= buf[0][1]) v = buf[0][2].slice();
    else {
      let i = buf.length - 1;
      while (i > 0 && buf[i - 1][1] > t) i--;
      const b = buf[i];
      if (t >= buf[buf.length - 1][1]) {
        const n = buf.length - 1, cur = buf[n];
        if (n > 0) { const p = buf[n - 1], span = cur[1] - p[1] || 1e-6, ex = Math.min(extrap, t - cur[1]); v = cur[2].map((x, k) => x + (x - p[2][k]) / span * ex); }
        else v = cur[2].slice();
      } else {
        const a = buf[i - 1], f = (t - a[1]) / (b[1] - a[1] || 1e-6);
        v = a[2].map((x, k) => x + (b[2][k] - x) * f);
      }
    }
    if (lo) v = v.map((x, k) => (lo[k] !== undefined ? Math.max(lo[k], x) : x));
    if (hi) v = v.map((x, k) => (hi[k] !== undefined ? Math.min(hi[k], x) : x));
    if (out && vmax) { const lim = vmax * dtFrame * 1.4; v = v.map((x, k) => out[k] + Math.max(-lim, Math.min(lim, x - out[k]))); }
    out = v;
    return v;
  }
  return { push, sample, get delay() { return delay; } };
}
