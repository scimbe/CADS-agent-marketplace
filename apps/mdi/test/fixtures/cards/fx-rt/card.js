// Testkarte fuer den Echtzeit-Vertrag (ADR 0001 b), keine Produktkarte: Ball-Duell in Ganzzahlen.
// Sitz 0 unten, Sitz 1 oben. Steuerung: Achse x (Tasten) oder Zeiger (absolute x-Position), Aufschlag per Knopf.
import manifest from "./manifest.json" with { type: "json" };
import { rng as mkRng } from "../../../../src/contract/sdk.js";

const W = 400, H = 640, PW = 80, PH = 12, R = 8, PV = 8;
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function serveState(st, toward) {
  const r = mkRng(st.rng), dx = r.int(2) ? 1 : -1;
  return { ...st, rng: r.state(), ball: { x: W / 2, y: H / 2, vx: dx * (st.speed >> 1), vy: toward * st.speed }, live: false };
}
export default {
  manifest,
  init({ params, seed }) {
    const r = mkRng(seed + "|init");
    return serveState({ win: params.win, speed: params.speed, rng: r.state(), pad: [W / 2, W / 2], score: [0, 0], tick: 0, server: 0, over: false }, 1);
  },
  step(state, inputs, tick) {
    let st = { ...state, pad: state.pad.slice(), score: state.score.slice(), ball: { ...state.ball }, tick };
    const ev = [];
    if (st.over) return { state: st, ev };
    for (let s = 0; s < 2; s++) {
      const x = inputs[s] || { b: 0 };
      if (x.p && x.p.length && (x.p[0][3] & 1)) st.pad[s] = clamp(st.pad[s] + clamp(x.p[0][1] - st.pad[s], -PV * 2, PV * 2), PW / 2, W - PW / 2);
      else if (x.ax) st.pad[s] = clamp(st.pad[s] + Math.trunc(x.ax * PV / 1000), PW / 2, W - PW / 2);
      if (!st.live && (x.b & 1) && s === st.server) { st.live = true; ev.push({ k: "serve", seat: s }); }
    }
    if (!st.live) { st.ball.x = st.pad[st.server]; st.ball.y = st.server === 0 ? H - 40 : 40; return { state: st, ev }; }
    const b = st.ball;
    b.x += b.vx; b.y += b.vy;
    if (b.x < R) { b.x = 2 * R - b.x; b.vx = -b.vx; ev.push({ k: "wall" }); }
    if (b.x > W - R) { b.x = 2 * (W - R) - b.x; b.vx = -b.vx; ev.push({ k: "wall" }); }
    for (let s = 0; s < 2; s++) {
      const py = s === 0 ? H - 30 : 30, toward = s === 0 ? b.vy > 0 : b.vy < 0;
      if (toward && Math.abs(b.y - py) <= PH && Math.abs(b.x - st.pad[s]) <= PW / 2 + R) {
        b.vy = -b.vy; b.vx = clamp(b.vx + Math.trunc((b.x - st.pad[s]) / 8), -st.speed, st.speed);
        ev.push({ k: "hit", seat: s, x: b.x, y: b.y, v: Math.abs(b.vy) });
      }
    }
    const lost = b.y > H + R ? 0 : b.y < -R ? 1 : -1;
    if (lost >= 0) {
      st.score[1 - lost]++;
      ev.push({ k: "score", seat: 1 - lost });
      if (st.score[1 - lost] >= st.win) { st.over = true; ev.push({ k: "win", seat: 1 - lost }); }
      st.server = lost;
      st = serveState(st, lost === 0 ? -1 : 1);
    }
    return { state: st, ev };
  },
  status(st) {
    const winner = !st.over ? -1 : st.score[0] > st.score[1] ? 0 : 1;
    return { over: st.over, score: st.score.slice(), winner, say: st.score[0] + " : " + st.score[1] };
  },
  bot(st, seat, { level }) {
    const target = st.live ? st.ball.x : st.pad[seat], d = target - st.pad[seat], dead = 4 * (4 - level);
    return { b: !st.live && st.server === seat && st.tick % 30 === 29 ? 1 : 0, ax: d > dead ? 1000 : d < -dead ? -1000 : 0 };
  },
  view(st, ctx) {
    const p = ctx.prev && ctx.alpha ? ctx.prev : null, a = ctx.alpha || 0;
    const bx = p ? p.ball.x + (st.ball.x - p.ball.x) * a : st.ball.x, by = p ? p.ball.y + (st.ball.y - p.ball.y) * a : st.ball.y;
    const flip = ctx.seat === 1;
    return {
      t: "canvas", w: W, h: H, a11y: "Ball-Duell " + st.score[0] + " zu " + st.score[1],
      layers: [
        { id: "bg", key: "fx-rt", ops: [{ o: "rect", x: 0, y: 0, w: W, h: H, fill: "ink" }, { o: "line", x1: 0, y1: H / 2, x2: W, y2: H / 2, lw: 2, stroke: "muted", dash: [8, 8] }] },
        { id: "world", ops: [{ o: "group", sy: flip ? -1 : 1, ty: flip ? H : 0, ops: [
          { o: "rect", x: st.pad[0] - PW / 2, y: H - 30 - PH / 2, w: PW, h: PH, r: 6, fill: "yellow" },
          { o: "rect", x: st.pad[1] - PW / 2, y: 30 - PH / 2, w: PW, h: PH, r: 6, fill: "red" },
          { o: "circle", x: bx, y: by, r: R, fill: "paper" },
          ...(ctx.reduced ? [] : [{ o: "glow", x: bx, y: by, r: 30, color: "#ffffff", alpha: 0.3 }])
        ] }] },
        { id: "hud", ops: [{ o: "text", x: W / 2, y: H / 2 - 20, text: st.score[1] + " : " + st.score[0], size: 40, font: "brand", align: "center", fill: "paper" }] }
      ]
    };
  }
};
