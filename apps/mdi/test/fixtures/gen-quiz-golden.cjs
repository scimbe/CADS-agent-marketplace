// Erzeugt test/fixtures/quiz-golden.json mit dem Altcode als Orakel (Tag pre-legacy-removal, alter Client-Ordner unter apps/).
// Aufruf: node test/fixtures/gen-quiz-golden.cjs <pfad-zum-alten-client>
//   (den Ordner des alten Clients aus dem Tag pre-legacy-removal per git archive auspacken, dort npm ci)
// Der Wortfilter läuft wie im Browser der Jugend-App mit kontakt.js (alt core.js CHECKS).
"use strict";
const path = require("path"), fs = require("fs");
const ALT = path.resolve(process.argv[2] || "", "src");
if (!fs.existsSync(path.join(ALT, "quizpack.js"))) { console.error("Pfad zum Altcode fehlt: " + ALT); process.exit(1); }
const C = require(path.join(ALT, "core.js"));
require(path.join(ALT, "kontakt.js"));
const P = require(path.join(ALT, "quizpack.js")), M = require(path.join(ALT, "quizmake.js"));
const Tn = require(path.join(ALT, "turns.js")), QS = require(path.join(ALT, "quizspiele.js"));
const PACKS = require(path.join(ALT, "quiz-packs.json")).packs;

const r = C.mulberry32(C.hash32("golden-quiz"));
const int = (n) => Math.floor(r() * n);
const SEEDS = [];
for (let i = 0; i < 32; i++) SEEDS.push(i % 4 === 0 ? String(int(4294967295)) : (int(4294967295) >>> 0).toString(16).padStart(8, "0") + (int(4294967295) >>> 0).toString(16).padStart(8, "0"));
SEEDS.push("20404", "1");

const BAD = [
  null, 5, { t: "x", m: "q", q: [] }, { t: "", m: "l", q: [["a", "b"], ["c", "d"], ["e", "f"]] },
  { t: "Kurz", m: "l", q: [["a?", "b"], ["c?", "d"]] },
  { t: "Doppelt", m: "l", q: [["F1?", "A", "A", "B", "C"], ["F2?", "x"], ["F3?", "y"], ["F4?", "z"]] },
  { t: "Drei", m: "l", q: [["F1?", "A", "B"], ["F2?", "x"], ["F3?", "y"], ["F4?", "z"]] },
  { t: "Zahlen", m: "l", q: [["Wie viele?", "1.000"], ["Wie weit?", "4 000"], ["Wie alt?", "007"], ["Wie hoch?", "12"]], z: [1000, 4000, 7, 13] },
  { t: "Kontakt", m: "l", q: [["Ruf an: 0171 2345678?", "ja"], ["F2?", "x"], ["F3?", "y"], ["F4?", "www.x.de"]] },
  { t: "Gruppe", m: "g", y: [["Planer", "Du planst."], ["Motor", "Du treibst an."]], q: [["F1?", ["A", 0], ["B", 1]], ["F2?", ["A", 0], ["a", 1]], ["F3?", ["C", 0], ["D", 1], ["E", 5]], ["F4?", ["G", 1], ["H", 0]]] },
  { t: "Gruppe1", m: "g", y: [["Planer", "Du planst."]], q: [["F1?", ["A", 0], ["B", 0]]] },
  { t: "Frei", m: "l", q: [["Wie weit ist der Mond?"], ["Wie hoch ist der Turm?"], ["Wie alt bin ich?"]], z: [384400, 330, 1], u: ["km", "m", "Jahre"] },
  { t: "Frei2", m: "l", q: [["Wie weit ist der Mond?"], ["Wie hoch ist der Turm?"], ["Wie viele Beine?"]], z: [384400, 330, 8], u: ["km", "m", ""] },
  { t: "<b>Tag</b> www.x", m: "f", q: [["Was ist <i>X</i>?", "Y", "Z", "W"], ["F2?", "a", "b", "c"], ["F3?", "d", "e", "f"]] }
];
const out = { herkunft: "Alt-Orakel: Tag pre-legacy-removal (alter Client, src/quizpack.js, quizmake.js, quizspiele.js, turns.js, quiz-packs.json), erzeugt mit test/fixtures/gen-quiz-golden.cjs", seeds: SEEDS, sanitize: [], games: [], preis: [], schaetzen: [], fromOption: [], fit: [] };
for (const p of PACKS) out.sanitize.push({ in: p.pk, out: P.sanitize(p.pk) });
for (const b of BAD) out.sanitize.push({ in: b, out: P.sanitize(b) });

// zufällige, gültige Antworten für einen Zug einer Pack-Partie (alt Antwortformat)
function answersFor(doc, g) {
  const q = doc.pk.q;
  if (g === "schaetzen") return P.nums(doc).map((i) => int(P.top(doc, i) + 1));
  if (g === "abfragen") { const a = []; q.forEach(() => { a.push(0, [int(2)]); }); return a; }
  return q.map((row) => [int(g === "typen" ? row.length - 1 : row.length - 1)]);
}
const CASES = [["planeten", "abfragen"], ["planeten", "quiz"], ["koerper", "schaetzen"], ["solar", "quiz"], ["datenschutz", "quiz"], ["klassenfahrt", "typen"], ["teamtyp", "typen"]];
SEEDS.forEach((seed, si) => {
  CASES.forEach(([id, g], ci) => {
    if ((si + ci) % 2) return; // die Hälfte der Kombinationen genügt, hält die Datei klein
    const pk = P.sanitize(PACKS.find((x) => x.id === id).pk), doc = { seed, pk, g };
    const n = pk.q.length, e = { seed, pack: id, g };
    if (g === "typen") {
      e.mixT = pk.q.map((row, i) => mixOf(doc, "t" + i, row.length - 1));
    } else {
      e.choices = pk.q.map((row, i) => P.choices(doc, i));
      e.rightAt = pk.q.map((row, i) => P.rightAt(doc, i));
    }
    if (pk.z) e.top = P.nums(doc).map((i) => P.top(doc, i));
    const a = answersFor(doc, g), b = answersFor(doc, g);
    e.a = a; e.b = b;
    if (g === "typen") e.typeOf = [P.typeOf(doc, a), P.typeOf(doc, b)];
    else e.score = [P.score(doc, g, a), P.score(doc, g, b)];
    const game = P.game(doc);
    if (game) {
      const m = game.turns.length === 2 && game.turns[0].length === game.turns[1].length ? [a, b] : [[0], g === "abfragen" || g === "quiz" || g === "typen" || g === "schaetzen" ? a.concat([0]) : a];
      e.flowTurns = game.turns.map((t) => t.length);
      e.result = { de: game.result(doc, m, "de"), en: game.result(doc, m, "en") };
      e.m = m;
      if (!(game.turns.length === 2 && game.turns[0].length === game.turns[1].length) || game.stay) {
        const last = game.turns[1][game.turns[1].length - 1];
        e.last = { de: last.list(doc, m, a, "de"), en: last.list(doc, m, a, "en") };
      }
    }
    out.games.push(e);
  });
  // Preis
  const doc = { seed };
  const items = QS.preisItems(doc), tops = items.map((k, i) => QS.top(doc, i));
  const a = tops.map((t) => int(t / 5 + 1) * 5), b = tops.map((t) => int(t + 1));
  out.preis.push({ seed, items, top: tops, a, b, off: [QS.off(doc, a), QS.off(doc, b)], result: { de: Tn.GAMES.preis.result(doc, [a, b], "de"), en: Tn.GAMES.preis.result(doc, [a, b], "en") } });
  // Fünf mal schätzen (Tageskarte)
  const sch = Tn.GAMES.schaetzen, maxs = sch.turns[0].map((p) => p.maxOf(doc)), g5 = maxs.map((x) => int(x + 1));
  out.schaetzen.push({ seed, max: maxs, peek: sch.turns[0].map((p) => [p.peek(doc, [], [], "de"), p.peek(doc, [], [], "en")]), a: g5, result: { de: sch.result(doc, [g5], "de"), en: sch.result(doc, [g5], "en") } });
});
function mixOf(doc, tag, n) { const rr = C.mulberry32(C.hash32("pk|" + doc.seed + "|" + tag)), a = []; for (let i = 0; i < n; i++) a.push(i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

// Server-Optionen -> Paket
const OPTS = [
  { modus: "lernen", titel: "Photosynthese", fragen: [{ f: "Welches Gas geben Pflanzen ab?", a: "Sauerstoff", d: ["Stickstoff", "Helium", "Methan"] }, { f: "Wie viele Beine hat eine Spinne?", a: "8", d: ["6", "10", "4"] }, { f: "Wo findet sie statt?", a: "Im Blatt", d: ["Wurzel", "Blüte"] }] },
  { modus: "gruppe", titel: "Welcher Teamtyp bist du?", typen: [{ name: "Die Planerin", staerke: "Du behältst den Überblick." }, { name: "Der Motor", staerke: "Du steckst alle an." }], fragen: [{ f: "Was zuerst?", antworten: [{ t: "Plan", typ: 0 }, { t: "Zelt", typ: 1 }] }, { f: "Am Abend?", antworten: [{ t: "Liste", typ: 0 }, { t: "Feuer", typ: 1 }] }, { f: "Im Bus?", antworten: [{ t: "Karte", typ: 0 }, { t: "Singen", typ: 1 }] }] },
  { modus: "firma", titel: "Onboarding", fragen: [{ f: "F1?", a: "A", d: ["B", "C", "D"] }] },
  { modus: "x", titel: "y", fragen: [] }, null
];
for (const o of OPTS) out.fromOption.push({ in: o, out: M.fromOption(o) });
// fit: Größe = JSON-Länge des Pakets, verschiedene Grenzen
for (const id of ["planeten", "klassenfahrt", "koerper"]) {
  const pk = P.sanitize(PACKS.find((x) => x.id === id).pk), g = id === "klassenfahrt" ? "typen" : id === "koerper" ? "schaetzen" : "quiz";
  for (const room of [300, 500, 800, 2000]) {
    const res = M.fit({ g, seed: 1, q: "" }, pk, (d) => JSON.stringify(d.pk).length, room, () => "");
    out.fit.push({ pack: id, g, room, out: res });
  }
}
fs.writeFileSync(path.join(__dirname, "quiz-golden.json"), JSON.stringify(out) + "\n");
console.log("quiz-golden.json: " + out.games.length + " Pack-Partien, " + out.preis.length + " Preis, " + out.schaetzen.length + " Schätzen, " + out.sanitize.length + " Pakete");
