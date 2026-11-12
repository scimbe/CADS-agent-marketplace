// Golden-Fixture fuer spiel-dart aus dem Altcode (Alt-Orakel): fuehrt alt:src/dart.js mit festen Seeds und Wurffolgen
// aus und friert jeden Treffer ein. Aufruf:
//   node test/fixtures/gen-dart-golden.cjs <Pfad zu apps/<alter-client> des Tags pre-legacy-removal>
// (z. B. git archive pre-legacy-removal apps/<alter-client> | tar -x -C /tmp/alt). Schreibt test/fixtures/dart-golden.json.
"use strict";
const fs = require("fs"), path = require("path");
const ALT = process.argv[2];
if (!ALT) { console.error("Pfad zum Altcode fehlt"); process.exit(2); }
const M = require(path.join(path.resolve(ALT), "src/dart.js"));
const C = require(path.join(path.resolve(ALT), "src/core.js"));

function onto(seed, k, x, y) { const h = M.hand(seed, k); return M.dart(x - h.sx, y - h.sy, M.MID); }
function spot(f) {
  if (f === "B") return [0, 0]; if (f === "25") return M.centre(25, "o"); if (f === "0") return [1.2, 0.4];
  return M.centre(+f.slice(1), { T: "t", D: "d", S: "s" }[f[0]]);
}
function throws(seed, k0, fields) { return fields.map((f, i) => { const p = spot(f); return M.enc(onto(seed, k0 + i, p[0], p[1])); }).join(""); }
const r9 = (v) => Math.round(v * 1e9) / 1e9;
const hex = (i) => (C.hash32("g" + i) >>> 0).toString(16).padStart(8, "0") + (C.hash32("h" + i) >>> 0).toString(16).padStart(8, "0");

// Ein Spieler mit Berts Zieltabelle (wie alt test person): richtige Stufe mit Wahrscheinlichkeit pr, sonst eine daneben;
// slider: Regler ohne Timing.
function person(seed, mode, pr, bot, slider) {
  let s = M.head(mode, bot);
  for (let i = 0; i < 400; i++) {
    const g = M.sim(seed, s); if (g.over) return s;
    const p = g.partial ? g.turns[g.turns.length - 1].p : g.turns.length % 2, at = M.aimFor(g, p), c = M.centre(at.n, at.r), u = C.mulberry32(C.hash32(seed) * 131 + g.k)();
    s += M.enc(M.dart(c[0], c[1], u < pr ? M.MID : u < (1 + pr) / 2 ? M.MID - 1 : M.MID + 1, slider && p === 0));
  }
  throw new Error("kein Ende");
}
function randomGame(seed, mode, n, rs) {
  const r = C.mulberry32(rs); let s = mode + "l";
  for (let i = 0; i < n; i++) { const g = M.sim(seed, s); if (g.over) break; s += M.enc(M.dart((r() - 0.5) * 2.2, (r() - 0.5) * 2.2, r() * 8, r() < 0.3)); }
  // auf ganze Aufnahmen kuerzen
  while (s.length > 2) { const g = M.sim(seed, s); if (g && !g.partial && !g.extra) break; s = s.slice(0, -5); }
  return s;
}

const cases = [];
function add(name, seed, s) {
  const g = M.sim(seed, s);
  if (!g || g.partial || g.extra) throw new Error("kein ganzer Spielstand: " + name);
  const cuts = g.turns.filter((t) => !(g.bot && t.p === 1)).map((t) => t.d.length);
  cases.push({ name, seed, s, cuts, claim: M.claimed(g), turns: g.turns.map((t) => ({ p: t.p, pts: t.pts, bust: t.bust, out: t.out, d: t.d.map((h) => [h.n, h.m, h.p, r9(h.x), r9(h.y)]) })),
    k: g.k, over: g.over, win: g.win, capped: g.capped, left: g.left, next: g.next, total: g.total });
}

// feste Folgen aus den alten Tests (301, Bust, Double-Out, Bull, Einsteiger, beide checken aus)
let sd = hex(1), s = "al" + throws(sd, 0, ["T20", "T20", "T20"]) + throws(sd, 3, ["S20", "S20", "S20"]) + throws(sd, 6, ["T20", "T19", "S2"]) + throws(sd, 9, ["0", "0", "0"]) + throws(sd, 12, ["S2"]);
add("301 Bust auf 0 ohne Double", sd, s);
s += throws(sd, 13, ["S1", "S1", "S1"]) + throws(sd, 16, ["S1"]); add("301 Rest 1 ist Bust", sd, s);
s += throws(sd, 17, ["S1", "S1", "S1"]) + throws(sd, 20, ["S5"]); add("301 unter null", sd, s);
s += throws(sd, 21, ["S1", "S1", "S1"]) + throws(sd, 24, ["0", "D1"]); add("301 D1 checkt aus, B wirft noch", sd, s);
s += throws(sd, 26, ["S1", "S1", "S1"]); add("301 Ende gleich viele Aufnahmen", sd, s);
sd = hex(2); add("Bullseye checkt aus", sd, "al" + throws(sd, 0, ["T20", "T20", "T20"]) + throws(sd, 3, ["0", "0", "0"]) + throws(sd, 6, ["T20", "T19", "S4"]) + throws(sd, 9, ["0", "0", "0"]) + throws(sd, 12, ["T20", "S11", "B"]) + throws(sd, 15, ["0", "0", "0"]));
sd = hex(3); add("beide checken aus, weniger Pfeile", sd, "al" + throws(sd, 0, ["T20", "T20", "T20"]) + throws(sd, 3, ["T20", "T20", "T20"]) + throws(sd, 6, ["T20", "T19", "S2"]) + throws(sd, 9, ["T20", "T19", "S2"]) + throws(sd, 12, ["0", "0", "D1"]) + throws(sd, 15, ["D1"]));
sd = hex(4); add("Einsteiger S1 auf 1", sd, "bl" + throws(sd, 0, ["T20", "T20", "T20"]) + throws(sd, 3, ["0", "0", "0"]) + throws(sd, 6, ["T20", "T20", "S5"]) + throws(sd, 9, ["0", "0", "0"]) + throws(sd, 12, ["T20", "T20", "S1"]) + throws(sd, 15, ["0", "0", "0"]));
sd = hex(5); { let c = "al", k = 0; for (let r = 0; r < 24; r++) { c += throws(sd, k, r % 2 ? ["S1", "S1", "S1"] : ["S5", "S5", "S5"]); k += 3; } add("Cap nach 12 Runden", sd, c); }
sd = hex(6); { let c = "dl", k = 0; for (let r = 0; r < 6; r++) { c += throws(sd, k, r % 2 ? ["T19", "T19", "T19"] : ["T20", "T20", "T20"]); k += 3; } add("Hoechste Punktzahl", sd, c); }
sd = hex(7); { let c = "dl", k = 0; for (let r = 0; r < 6; r++) { c += throws(sd, k, ["T20", "T20", "T20"]); k += 3; } add("Unentschieden", sd, c); }
sd = hex(8); add("Rund um die Uhr Anfang", sd, "cl" + throws(sd, 0, ["S1", "S3", "D2"]) + throws(sd, 3, ["S1", "S2", "S3"]));
sd = hex(9); { let c = "cl", kk = 0; for (let n = 1; n <= 20; n += 3) { const f = [n, n + 1, n + 2].filter((x) => x <= 20).map((x) => "S" + x); c += throws(sd, kk, f); kk += 3; if (n + 2 >= 20) break; c += throws(sd, kk, ["0", "0", "0"]); kk += 3; } c += throws(sd, kk, ["0", "0", "0"]); add("Rund um die Uhr rundum", sd, c); }
// Bert-Partien in allen Spielarten, Menschen mit Pendel und mit Regler, Partien per Link
for (let i = 0; i < 12; i++) { const m = "abcd"[i % 4]; sd = hex(100 + i); add("Bert " + m + " " + i, sd, person(sd, m, 0.6, true, i % 3 === 0)); }
for (let i = 0; i < 12; i++) { const m = "abcd"[i % 4]; sd = hex(200 + i); add("Link " + m + " " + i, sd, person(sd, m, 0.5, false, i % 2 === 0)); }
// zufaellige Wuerfe ueber das ganze Brett (auch daneben, alle Kraftstufen, Regler)
for (let i = 0; i < 12; i++) { const m = "abcd"[i % 4]; sd = hex(300 + i); add("Zufall " + m + " " + i, sd, randomGame(sd, m, 30 + i * 3, 1000 + i)); }

fs.writeFileSync(path.join(__dirname, "dart-golden.json"), JSON.stringify({ herkunft: "Alt-Orakel: Tag pre-legacy-removal (alter Client, src/dart.js), erzeugt mit test/fixtures/gen-dart-golden.cjs", cases }, null, 0) + "\n");
console.log("dart-golden.json: " + cases.length + " Faelle");
