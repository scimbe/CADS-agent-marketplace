// FK2-P3-Messung: Urteilsfaelle aus karten.jsonl bauen (wie fk2-nullmessung/skripte/prep.mjs, angepasst an P3).
// Je Karte ein Fall: Persona, Knoepfe, Wunsch, Erwartungen (aus fk2-nullmessung/wuensche.jsonl) und "anzeige" = was die
// App beim ersten Ausliefern zeigt (Titel, "Das kann dein Spiel", "Fehlt", Hinweise bzw. Meldung ohne Karte), dazu die
// Bildschirmfotos und der Spielcode als objektiver Beleg des Verhaltens. Fall-ID = sha256(karte+anzeige) 10 Hex; die
// Variante (Rollenverteilung) ist fuer die Gutachter nicht erkennbar. Verteilt auf N Gutachter-Dateien je Wunschgruppe.
//   node prep.mjs <rohdaten-dir> <urteil-dir> [gutachter=5]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [ROH, OUT, NJ = "5"] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const jl = (f) => fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const W = Object.fromEntries(jl(path.join(HERE, "../../fk2-nullmessung/wuensche.jsonl")).map((w) => [w.id, w]));
const karten = jl(path.join(ROH, "karten.jsonl")).filter((k) => k.ende !== "budget-abbruch" && !(k.ende === "fehler" && /usage limits/.test(k.fehler || "")));   // B-P16-L3: Kontolimit, nicht gemessen
fs.mkdirSync(path.join(OUT, "fotos"), { recursive: true });

const faelle = [], map = [];
for (const k of karten) {
  const w = W[k.wunsch_id], a = k.anzeige0 || k.anzeige;
  const anzeige = a.ergebnis === "karte"
    ? { ergebnis: "Karte erstellt", titel: a.titel, "das_kann_dein_spiel": a.kann.map((x) => x.punkt), fehlt: a.fehlt.map((x) => x.punkt + (x.grund ? " – " + x.grund : "")), hinweise: a.hinweise }
    : { ergebnis: "Keine Karte", meldung: [a.meldung, ...(a.hinweise || [])].filter(Boolean) };
  const fall = crypto.createHash("sha256").update(k.id + JSON.stringify(anzeige)).digest("hex").slice(0, 10);
  const v0 = (k.versionen || [])[0];
  const fotos = v0 ? v0.fotoDateien.map((f, i) => { const dst = path.join(OUT, "fotos", fall + "-" + i + ".png"); fs.copyFileSync(path.join(ROH, f), dst); return path.resolve(dst); }) : [];
  faelle.push({ fall, id: w.id, persona: w.persona, gewaehlt: { art: w.art, genre: w.genre, wer_spielt: w.wer_spielt }, wunsch: w.wunsch, erwartung: w.erwartung, anzeige, bildschirmfotos: fotos, spielcode: v0 ? v0.code : null });
  map.push({ fall, karte: k.id, variante: k.variante, lauf: k.lauf, wunsch_id: k.wunsch_id });
}
fs.writeFileSync(path.join(OUT, "faelle-map.jsonl"), map.map((m) => JSON.stringify(m)).join("\n") + "\n");
// Gutachter-Dateien: Wuensche reihum verteilen, innerhalb einer Datei Faelle gemischt (fester Seed), damit Varianten nicht blockweise stehen
const ids = [...new Set(faelle.map((f) => f.id))].sort(), n = Number(NJ);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let j = 0; j < n; j++) {
  const mine = faelle.filter((f) => ids.indexOf(f.id) % n === j).map((f) => [rnd(), f]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  fs.writeFileSync(path.join(OUT, "judge-" + (j + 1) + ".json"), JSON.stringify(mine, null, 1));
  console.log("judge-" + (j + 1) + ": " + mine.length + " Faelle, Wuensche " + [...new Set(mine.map((f) => f.id))].join(","));
}
