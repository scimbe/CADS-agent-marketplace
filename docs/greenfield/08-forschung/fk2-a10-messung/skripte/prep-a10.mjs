// Messung A10: Urteilsfaelle aus karten.jsonl (wie fk2-p3-messung/skripte/prep.mjs). Je Karte: Persona, Knoepfe, Wunsch,
// Erwartungen (fk2-nullmessung/wuensche.jsonl) und "anzeige" = was die App zeigt (Titel, "Das kann dein Spiel" = erfuellte
// Punkte, "Fehlt" = nicht erfuellte Punkte mit dem Satz fuer die Person, Hinweise = "Ehrlich gesagt" der Liste aus P1; ohne
// Karte der Text der App zum Grund). Dazu zwei Bildschirmfotos aus dem echten Spielmodus (Sandbox, wie im Prototyp) und der
// Spielcode. Fall-ID = sha256(karte+anzeige) 10 Hex.   node prep-a10.mjs <roh-dir> <urteil-dir> <app-dir> [gutachter=5]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [ROH, OUT, APP, NJ = "5"] = process.argv.slice(2);
const jl = (f) => fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const W = Object.fromEntries(jl("/Users/dev/claude-workspace/mdi-greenfield/docs/greenfield/08-forschung/fk2-nullmessung/wuensche.jsonl").map((w) => [w.id, w]));
const { KLAEREN_TEXTS } = await import(path.join(APP, "src/features/frei/klaeren-texts.js"));
const T = KLAEREN_TEXTS.de;
const { createPruefstand } = await import(path.join(APP, "bau/pruefen.mjs"));
const karten = jl(path.join(ROH, "karten.jsonl"));
fs.mkdirSync(path.join(OUT, "fotos"), { recursive: true });
const pruef = await createPruefstand();
const faelle = [], map = [];
for (const k of karten) {
  const w = W[k.wunsch_id];
  let anzeige;
  if (k.ende === "geliefert") {
    const e = k.status.ergebnis, lab = (p) => (p.geprueft === "gelesen" ? " (nicht automatisch prüfbar)" : "");
    anzeige = { ergebnis: "Karte erstellt", titel: e.titel, das_kann_dein_spiel: e.punkte.filter((p) => p.erfuellt).map((p) => p.text + lab(p)),
      fehlt: e.punkte.filter((p) => !p.erfuellt).map((p) => p.text + (p.notiz ? " – " + p.notiz : "") + lab(p)), hinweise: (k.liste && k.liste.body.nicht) || [] };
  } else if (k.ende === "gescheitert") {
    anzeige = { ergebnis: "Keine Karte", meldung: [T["k_gescheitert_" + k.status.grund]] };
  } else {
    // P1 hat abgelehnt oder ist gescheitert: der Text der App (klaeren-view.js errLine/noText) zur Antwort des Servers
    const r = (k.liste && k.liste.status !== 200 ? k.liste : k.fragen) || { status: 0, body: {} };
    const b = r.body || {};
    let text;
    if (r.status === 422 && b.why === "crisis") text = b.help || T.k_e_off;
    else if (r.status === 422) { const t = T["k_no_" + b.reason]; text = T.k_no_h + " " + (t || T.k_no_other); }
    else { const how = r.status === 502 ? "bad" : r.status === 429 ? (b.error === "daily-cap" ? "daily" : "throttled") : r.status === 503 ? (b.error === "llm-off" || b.error === "check-off" ? "llm_off" : "off") : "server"; text = T["k_e_" + how] || T.k_e_server; }
    anzeige = { ergebnis: "Keine Karte", meldung: [text] };
  }
  const fall = crypto.createHash("sha256").update(k.id + JSON.stringify(anzeige)).digest("hex").slice(0, 10);
  let fotos = [];
  if (k.code) {
    const f = await pruef.fotos(k.code, { seed: "foto" });
    fotos = f.shots.map((buf, i) => { const dst = path.join(OUT, "fotos", fall + "-" + i + ".png"); fs.writeFileSync(dst, buf); return path.resolve(dst); });
  }
  faelle.push({ fall, id: w.id, persona: w.persona, gewaehlt: { art: w.art, genre: w.genre, wer_spielt: w.wer_spielt }, wunsch: w.wunsch, erwartung: w.erwartung, anzeige, bildschirmfotos: fotos, spielcode: k.code });
  map.push({ fall, karte: k.id, lauf: k.lauf, wunsch_id: k.wunsch_id });
}
await pruef.close();
fs.writeFileSync(path.join(OUT, "faelle-map.jsonl"), map.map((m) => JSON.stringify(m)).join("\n") + "\n");
const ids = [...new Set(faelle.map((f) => f.id))].sort(), n = Number(NJ);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let j = 0; j < n; j++) {
  const mine = faelle.filter((f) => ids.indexOf(f.id) % n === j).map((f) => [rnd(), f]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  fs.writeFileSync(path.join(OUT, "judge-" + (j + 1) + ".json"), JSON.stringify(mine, null, 1));
  console.log("judge-" + (j + 1) + ": " + mine.length + " Faelle, Wuensche " + [...new Set(mine.map((f) => f.id))].join(","));
}
