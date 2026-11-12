// Erzeugt test/fixtures/malrat-golden.json mit dem Altcode als Orakel (Tag pre-legacy-removal, apps/<alter-client>).
// Aufruf: node test/fixtures/gen-malrat-golden.cjs <pfad-zu-apps/<alter-client> des Altstands>
//   z. B. git archive pre-legacy-removal apps/<alter-client> | tar -x -C /tmp/alt && node ... /tmp/alt/apps/<alter-client>
// Eingefroren werden Strichsaetze (rohe Punkte), ihre Kodierung je Toleranz, pack-Ergebnisse, Dekodierung,
// Pruefwerte, Wortvorschlaege, Tipp-Reihenfolge und Buchstabenbank, Faltung und Wortfilter.
"use strict";
const path = require("node:path");
const fs = require("node:fs");
const ALT = process.argv[2];
if (!ALT || !fs.existsSync(path.join(ALT, "src/malrat.js"))) { console.error("Pfad zum Altstand apps/<alter-client> fehlt"); process.exit(2); }
const C = require(path.join(ALT, "src/core.js"));
const M = require(path.join(ALT, "src/malrat.js"));

// Strichsatz wie ein Mensch malt (alt test/malrat.test.js scribble), dazu Geraden, Punkte und Zickzack
function scribble(n, k, seed) {
  const r = C.mulberry32(seed || 1), out = [];
  for (let i = 0; i < n; i++) {
    const cx = r(), cy = r(), a = r() * 6, p = [];
    for (let j = 0; j < k; j++) p.push([Math.min(1, Math.max(0, cx + 0.3 * Math.cos(a + j / 9) + (r() - 0.5) * 0.004)), Math.min(1, Math.max(0, cy + 0.3 * Math.sin(a + j / 7) + (r() - 0.5) * 0.004))]);
    out.push({ c: i % 8, w: i % 3, p });
  }
  return out;
}
function zigzag(n, k, seed) {
  const r = C.mulberry32(seed), out = [];
  for (let i = 0; i < n; i++) { const p = []; for (let j = 0; j < k; j++) p.push([r(), r()]); out.push({ c: Math.floor(r() * 8), w: Math.floor(r() * 3), p }); }
  return out;
}
// Rezepte statt roher Punkte (der Test erzeugt dieselben Punkte mit dem bitgleichen mulberry32 aus seed32.js)
const recipes = [];
const g = C.mulberry32(4242);
for (let i = 0; i < 24; i++) recipes.push({ kind: "scribble", n: 1 + Math.floor(g() * 20), k: 2 + Math.floor(g() * 120), seed: 1 + Math.floor(g() * 1e6) });
for (let i = 0; i < 6; i++) recipes.push({ kind: "zigzag", n: 1 + Math.floor(g() * 10), k: 1 + Math.floor(g() * 30), seed: 7 + i });
recipes.push({ kind: "line" });
recipes.push({ kind: "scribble", n: 14, k: 80, seed: 7 });
function make(r) { return r.kind === "line" ? [{ c: 5, w: 2, p: Array.from({ length: 50 }, (x, i) => [i / 49, i / 49]) }, { c: 1, w: 0, p: [[0.5, 0.5]] }] : r.kind === "zigzag" ? zigzag(r.n, r.k, r.seed) : scribble(r.n, r.k, r.seed); }
const strokes = recipes.map((recipe) => ({ recipe, lines: make(recipe) })).map(({ recipe, lines }) => ({
  recipe,
  enc: Object.fromEntries(M.EPS.concat([-1]).map((e) => [String(e), M.encode(lines, e)])),
  pack600: M.pack(lines, (s) => s.length <= 600),
  pack300: M.pack(lines, (s) => s.length <= 300),
  pack120: M.pack(lines, (s) => s.length <= 120),
  dec: recipe.kind === "line" || recipe.n <= 3 ? M.decode(M.encode(lines, 0.45)) : undefined,
  used: M.used(M.decode(M.encode(lines, 0.45)) || [])
}));

(async () => {
  const checks = [];
  for (const [w, seed, r] of [["Hund", 20448, 1], ["Schildkröte", 20448, 1], ["Schildkröte", 1, 1], ["Hund", 2, 1], ["Hund", 1, 2], ["Regenbogen", "a1b2c3d4e5f60718", 3],
    ["Zwerg", "00000000ffffffff", 999], ["Wackelpudding", 20448, 7], ["Öl", 20448, 1], ["Bär", 1, 1], ["Fuß", 1, 1], ["Moon", "x", 2]]) checks.push({ w, seed, r, k: await M.check(w, seed, r) });
  const suggest = [];
  for (const seed of [20448, 1, 20500, "a1b2c3d4e5f60718", "ffff0000aaaa5555"]) for (let r = 1; r <= 6; r++) for (const l of ["de", "en"]) suggest.push({ seed, r, l, s: M.suggest(seed, r, l) });
  const order = [], bank = [];
  for (const [n, seed, r] of [[4, 20448, 1], [11, 20448, 2], [16, "abc", 9], [2, 1, 1]]) order.push({ n, seed, r, o: M.order(n, seed, r) });
  for (const [w, seed, r] of [["Schildkröte", 20448, 1], ["Hund", "abc", 3], ["Regenbogen", 1, 2]]) bank.push({ w, seed, r, b: M.bank(w, seed, r) });
  const words = ["Hund", "Schildkröte", "Schildkroete", "Bär", "Fuß", "Strauß", "Feuer", "Arschloch", "scheiße", "zwei Wörter", "R2D2", "x", "ß", "", "  ", "<b>", "a".repeat(17), "Wackelpudding", "Öl", "Éclair", "  Hund ", "Moon"];
  const text = words.map((w) => ({ w, fold: M.fold(w), own: M.own(w), guess: M.guess(w), hint: M.hintOf(w), letters: M.letters(w) }));
  const out = { herkunft: "Alt-Orakel: Tag pre-legacy-removal (alter Client, src/malrat.js), erzeugt mit test/fixtures/gen-malrat-golden.cjs", eps: M.EPS, all: M.ALL.length, strokes, checks, suggest, order, bank, text };
  fs.writeFileSync(path.join(__dirname, "malrat-golden.json"), JSON.stringify(out) + "\n");
  console.log("malrat-golden.json: " + strokes.length + " Strichsaetze, " + checks.length + " Pruefwerte, " + suggest.length + " Vorschlaege");
})();
