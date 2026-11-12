// Erzeugt apps/mdi/test/fixtures/arcade-alt.json aus dem Altcode (Alt-Orakel, welle-1.md): alt:src/arcade.js + arcade2.js
// vom Tag pre-legacy-removal werden in ein temporaeres Verzeichnis geholt und mit festen Seeds und derselben
// Wuerfelfolge wie die neue Engine ausgefuehrt. Liegt bewusst ausserhalb von apps/mdi (Sperre no-legacy-refs).
// Aufruf: node tools/golden/arcade-alt-gen.mjs <Worktree mit apps/mdi, z. B. /Users/dev/Documents/git/mdi-w1-a>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const WT = path.resolve(process.argv[2] || ".");
const MDI = path.join(WT, "apps/mdi");
const { die } = await import(path.join(MDI, "src/engines/arcade/num.js"));
const HERE = WT;
const TAG = "pre-legacy-removal";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-alt-"));
for (const f of ["arcade.js", "arcade2.js"]) fs.writeFileSync(path.join(tmp, f), execFileSync("git", ["show", TAG + ":apps/duell-web/src/" + f], { cwd: HERE, maxBuffer: 1 << 24 }));
const L = createRequire(path.join(tmp, "x.js"))("./arcade2.js");
const sha = execFileSync("git", ["rev-list", "-n1", TAG], { cwd: HERE }).toString().trim();

// Eine Zufallsquelle fuer die Testfaelle selbst (mulberry32 wie alt:test/netsim.js), damit die Datei reproduzierbar ist.
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261112), U = (a, b) => a + R() * (b - a);
const IDS = ["puck", "ziegel", "volley", "panzer", "kick", "flipper", "snow", "elfer", "stock", "murmel"];
const out = { herkunft: "Altbaum duell-web, Tag " + TAG + " (" + sha.slice(0, 12) + "), src/arcade.js und src/arcade2.js. Erwartungen mit dem Altmodul berechnet (Generator mdi-greenfield/tools/golden/arcade-alt-gen.mjs, nicht im Baum); Bot-Wuerfel = num.js die(seed|sitz|bot, n), Spurpunkte auf 1e-4 gerundet; kein Import aus dem Altbaum.", fn: {}, traces: {}, stats: {} };

// ---------- reine Funktionen ----------
const seeds = Array.from({ length: 12 }, (_, i) => "s" + i + "|" + (i * 7919).toString(16));
out.fn.serves = seeds.flatMap((s) => [0, 1, 2, 5, 11].map((n) => ({ s, n, puck: L.puckServe(s, n), ziegel: L.ziegelServe(s, n), volley: L.volleyServe(s, n) })));
out.fn.island = seeds.map((s) => ({ s, T: L.island(s), wind: [0, 1, 2, 3, 4, 5].map((k) => L.wind(s, k)) }));
out.fn.layout = seeds.map((s) => ({ s, bumps: L.flipBumpers(s), walls: L.snowWalls(s), spots: [0, 1, 2, 3].map((n) => L.elfSpot(s, n)), murmel: L.side("murmel", { seed: s, serving: true }).st.list.map((m) => [m.x, m.y]) }));
out.fn.kickRods = [100, 320, 500, 777, 900].map((c) => ({ c, rods: L.kickRods(c) }));
out.fn.flipSeg = [0.52, 0.1, -0.2, -0.5].map((a) => ({ a, l: L.flipSeg(true, a), r: L.flipSeg(false, a) }));
out.fn.ziegelDefend = [];
for (let off = -118; off <= 118; off += 13) for (const vx of [-1250, -600, 0, 600, 1250]) for (const vy of [100, 400, 900, 1250]) out.fn.ziegelDefend.push({ b: { x: 500 + off, y: L.ZIEGEL.PY, vx, vy }, p: 500, r: L.ziegelDefend({ x: 500 + off, y: L.ZIEGEL.PY, vx, vy }, 500) });
out.fn.puckStrike = Array.from({ length: 80 }, () => { const p = { x: U(100, 900), y: U(900, 1500), vx: U(-900, 900), vy: U(-900, 900) }, m = { x: p.x + U(-110, 110), y: p.y + U(-110, 110), vx: U(-3000, 3000), vy: U(-3000, 3000) }, q = Object.assign({}, p); return { p, m, hit: L.puckStrike(q, m), out: q }; });
out.fn.volley = Array.from({ length: 60 }, () => { const b = { x: U(60, 940), y: U(200, 1400), vx: U(-1500, 1500), vy: U(-1500, 1500) }, f = { x: b.x + U(-130, 130), y: b.y + U(-130, 130), vx: U(-950, 950), vy: U(-1200, 1200) }, s = Object.assign({}, b), k = Object.assign({}, b); const steps = []; for (let i = 0; i < 90; i++) steps.push(L.volleyStep(s, 1 / 120)); return { b, f, steps: steps.join(","), after: s, bump: L.volleyBump(k, f), bumped: k }; });
out.fn.flight = seeds.slice(0, 6).flatMap((s) => { const T = L.island(s); return Array.from({ length: 10 }, () => { const sh = { x: 160, y: L.surface(T, 160) - 48, vx: U(200, 1200), vy: U(-1200, -100), w: Math.round(U(-140, 140)) }; return { s, sh, f: L.flight(T, sh, 1200) }; }); });
out.fn.crater = seeds.slice(0, 6).map((s) => { const T = L.island(s), hits = []; for (let k = 0; k < 6; k++) { const x = U(40, 960); const y = L.surface(T, x); L.crater(T, x, y, x < 500); hits.push([x, y]); } return { s, hits, T }; });
out.fn.disc = ["stock", "murmel"].flatMap((g) => seeds.slice(0, 5).map((s) => {
  const D = L.GAMES[g].rules, S = L.side(g, { seed: s, serving: true }), list = S.st.list.map((x) => Object.assign({}, x));
  const vx = U(-200, 200), vy = -U(450, 1100);
  D.launch(S, { list, r: S.st.r, thrown: 0 }, 0, g === "stock" ? 500 : 520, vx, vy);
  let n = 0; while (n < 2400 && L.discStep(D, list)) n++;
  return { g, s, vx, vy, n, list: list.map((x) => [x.x, x.y]) };
}));

// ---------- Partien Bot gegen Bot, mit der Wuerfelfolge der neuen Engine ----------
const BALL = { puck: "p", ziegel: "b", volley: "b", kick: "b", flipper: "b", elfer: "b", panzer: "shells", snow: "balls", stock: "list", murmel: "list" };
const r4 = (v) => Math.round(v * 1e4) / 1e4;
function pts(v) { if (!v) return []; return (Array.isArray(v) ? v : [v]).map((b) => [r4(b.x), r4(b.y)]); }
function game(g, seed, maxT) {
  const P = L.pair(g, seed, 0), mk = (s) => { let n = 0; const sd = seed + "|" + s + "|bot"; return () => die(sd, n++); };
  const ba = L.GAMES[g].bot(P.A, mk(0)), bb = L.GAMES[g].bot(P.B, mk(1)); P.start();
  const tr = []; let t = 0, at300 = null;
  for (; t < maxT && !(P.A.over && P.B.over); t++) {
    ba(1 / 120); bb(1 / 120); P.tick(1 / 120); P.A.ev.length = 0; P.B.ev.length = 0;
    if (t + 1 === 300 * 120) at300 = P.A.score.slice();   // Stand beim harten Partie-Limit der neuen Engine (300 s)
    if (t % 60 === 59) tr.push([t + 1, pts(P.A.st[BALL[g]]), pts(P.B.st[BALL[g]]), P.A.score.slice()]);
  }
  return { tr, end: { ticks: t, over: P.A.over && P.B.over, score: P.A.score.slice(), draw: !!P.A.draw, rejected: P.A.rejected + P.B.rejected }, at300 };
}
for (const g of IDS) out.traces[g] = [0, 1, 2].map((i) => Object.assign({ seed: "gold-" + g + "-" + i }, game(g, "gold-" + g + "-" + i, 120 * 180)));
for (const g of IDS) {
  const rr = Array.from({ length: 16 }, (_, i) => game(g, "stat-" + g + "-" + i, 120 * 600)), r = rr.map((x) => Object.assign({}, x.end, { at300: x.at300 }));
  out.stats[g] = { n: r.length, meanTicks: r.reduce((a, x) => a + x.ticks, 0) / r.length, meanMargin: r.reduce((a, x) => a + Math.abs(x.score[0] - x.score[1]), 0) / r.length, winsA: r.filter((x) => x.score[0] > x.score[1]).length, ends: r.map((x) => [x.ticks, x.score]), at300: r.map((x) => x.at300) };
}
fs.writeFileSync(path.join(MDI, "test/fixtures/arcade-alt.json"), JSON.stringify(out) + "\n");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("arcade-alt.json:", Object.keys(out.fn).length, "Funktionsgruppen,", IDS.length * 3, "Partien,", IDS.length * 16, "Statistikpartien");
