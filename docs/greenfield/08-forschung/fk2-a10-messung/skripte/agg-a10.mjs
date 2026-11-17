// Messung A10: Kennzahlen neben Nullmessung (0,20) und Prototyp Variante A (0,85), gleiche Definitionen wie
// fk2-p3-messung/skripte/agg.mjs: Erfuellung je Erwartungspunkt (erfuellt 1, teilweise 0,5), Mittel je Lauf, dann ueber Wuensche.
//   node agg-a10.mjs <roh-dir> <urteil-dir> <ziel-dir>
import fs from "node:fs";
import path from "node:path";

const [ROH, URT, ZIEL] = process.argv.slice(2);
const F = "/Users/dev/claude-workspace/mdi-greenfield/docs/greenfield/08-forschung";
const jl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const W = Object.fromEntries(jl(path.join(F, "fk2-nullmessung/wuensche.jsonl")).map((w) => [w.id, w]));
const karten = jl(path.join(ROH, "karten.jsonl"));
const map = Object.fromEntries(jl(path.join(URT, "faelle-map.jsonl")).map((m) => [m.karte, m]));
const U = Object.fromEntries(fs.readdirSync(URT).filter((f) => /^urteile-\d+\.jsonl$/.test(f)).flatMap((f) => jl(path.join(URT, f))).map((u) => [u.fall, u]));
const NU = jl(path.join(F, "fk2-nullmessung/urteile.jsonl"));
const P3K = JSON.parse(fs.readFileSync(path.join(F, "fk2-p3-messung/kennzahlen.json"), "utf8"));
// Aufrufe: Worker (fk2-llm, Tag = Auftrag) und P1 (duell-llm im Wrapper-Teil, ohne Tag)
const calls = fs.readdirSync(ROH).filter((f) => /^log-a10-bau-\d\.txt$/.test(f)).flatMap((f) => fs.readFileSync(path.join(ROH, f), "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).filter((o) => o.event === "fk2-llm"));
const p1 = jl(path.join(ROH, "wrapper.log")).filter((o) => o.event === "duell-llm");

const SC = { erfuellt: 1, teilweise: 0.5 };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r3 = (x) => (x === null ? null : Math.round(x * 1000) / 1000);
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const quant = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const cnt = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);
const quote = (punkte) => mean(punkte.map((p) => SC[p.urteil] || 0));

const rows = [];
for (const k of karten) {
  const m = map[k.id], u = m && U[m.fall];
  if (!u) { console.error("kein Urteil fuer " + k.id); continue; }
  rows.push({ karte: k.id, fall: m.fall, lauf: k.lauf, id: k.wunsch_id, kategorie: W[k.wunsch_id].kategorie, ende: k.ende, quote: quote(u.punkte), punkte: u.punkte, gesamt: u.gesamt, ueberblockt: u.ueberblockt, fehler_inhalt: u.fehler_inhalt, muster: u.muster, begruendung: u.begruendung });
}
fs.writeFileSync(path.join(ZIEL, "urteile.jsonl"), rows.map((r) => JSON.stringify({ ...r, quote: r3(r.quote) })).join("\n") + "\n");

const P3 = [...new Set(karten.map((k) => k.wunsch_id))].sort();
const byWish = (ids) => r3(mean(ids.map((id) => mean(rows.filter((r) => r.id === id).map((r) => r.quote))).filter((x) => x !== null)));
const nullQ = (id) => mean(NU.filter((u) => u.id === id).map((u) => u.quote));
const pts = rows.flatMap((r) => r.punkte.map((p) => p.urteil)), nichtVoll = pts.filter((p) => p !== "erfuellt");
const geliefert = karten.filter((k) => k.ende === "geliefert");
// Abnahme der Pipeline: Anteil erfuellter Punkte der P1-Liste (laut Server-Lauf) gegen Anteil erfuellter Erwartungen (Urteil)
const abnahmePunkte = geliefert.flatMap((k) => k.status.ergebnis.punkte);
const urteilGeliefert = rows.filter((r) => r.ende === "geliefert").flatMap((r) => r.punkte);
const kostenKarte = (k) => calls.filter((c) => String(c.tag || "").split(":")[0] === k.auftrag).reduce((a, c) => a + (c.usd || 0), 0);
const p1Usd = p1.reduce((a, c) => a + (c.usd || 0), 0), workerUsd = calls.reduce((a, c) => a + (c.usd || 0), 0);
const bauer = calls.filter((c) => c.role === "bauer");
const K = {
  n_karten: karten.length, n_geurteilt: rows.length, ende: cnt(karten.map((k) => k.ende)),
  quote_p3_spiele: byWish(P3), quote_arcade: byWish(P3.filter((id) => W[id].kategorie === "arcade")), quote_andere_spiele: byWish(P3.filter((id) => W[id].kategorie !== "arcade")),
  vergleich: { null_auf_denselben_15: r3(mean(P3.map(nullQ))), prototyp_A: P3K.varianten && P3K.varianten.A ? P3K.varianten.A.quote.p3_spiele : 0.85 },
  // nur Auftraege, die den Bau erreicht haben (P1 hat eine Liste geliefert): vergleichbar mit dem Prototyp ohne P1
  quote_nur_bau: r3(mean([...new Set(rows.filter((r) => r.ende === "geliefert" || r.ende === "gescheitert").map((r) => r.id))].map((id) => mean(rows.filter((r) => r.id === id && (r.ende === "geliefert" || r.ende === "gescheitert")).map((r) => r.quote))))),
  quote_nur_gelieferte_karten: r3(mean(rows.filter((r) => r.ende === "geliefert").map((r) => r.quote))),
  p1_abgelehnt: { karten: rows.filter((r) => /^p1-/.test(r.ende)).length, wuensche: [...new Set(rows.filter((r) => /^p1-/.test(r.ende)).map((r) => r.id))].sort(), ueberblockt: rows.filter((r) => /^p1-/.test(r.ende) && r.ueberblockt).length,
    urteile: cnt(rows.filter((r) => /^p1-/.test(r.ende)).flatMap((r) => r.punkte.map((p) => p.urteil))) },
  quote_je_wunsch: Object.fromEntries(P3.map((id) => [id, rows.filter((r) => r.id === id).sort((a, b) => a.lauf - b.lauf).map((r) => r3(r.quote))])),
  punkte_anteil: Object.fromEntries(Object.entries(cnt(pts)).map(([k, n]) => [k, pct(n, pts.length)])), punkte_n: pts.length,
  ehrlich_an_nicht_vollen: pct(nichtVoll.filter((p) => p === "ehrlich_abgesagt").length, nichtVoll.length),
  scheinangebot_punkte: pct(pts.filter((p) => p === "scheinangebot").length, pts.length),
  scheinangebot_karten: pct(rows.filter((r) => r.punkte.some((p) => p.urteil === "scheinangebot")).length, rows.length),
  gesamt_anteil: Object.fromEntries(Object.entries(cnt(rows.map((r) => r.gesamt))).map(([k, n]) => [k, pct(n, rows.length)])),
  ueberblockt: rows.filter((r) => r.ueberblockt).length, mit_inhaltsfehler: rows.filter((r) => (r.fehler_inhalt || []).length).length,
  abnahme_vs_urteil: { abnahme_erfuellt_anteil: pct(abnahmePunkte.filter((p) => p.erfuellt).length, abnahmePunkte.length), urteil_erfuellt_anteil_geliefert: pct(urteilGeliefert.filter((p) => p.urteil === "erfuellt").length, urteilGeliefert.length),
    gespielt_anteil: pct(abnahmePunkte.filter((p) => p.geprueft === "gespielt").length, abnahmePunkte.length) },
  kosten: { gesamt_usd: r5(p1Usd + workerUsd), p1_usd: r5(p1Usd), worker_usd: r5(workerUsd), je_karte_worker_mittel: r5(mean(karten.filter((k) => k.auftrag).map(kostenKarte))), je_karte_worker_max: r5(Math.max(...karten.filter((k) => k.auftrag).map(kostenKarte))),
    je_karte_p1_mittel: r5(p1Usd / karten.length), je_rolle: Object.fromEntries(["planer", "bauer", "abnahme"].map((r) => [r, r5(calls.filter((c) => c.role === r).reduce((a, c) => a + c.usd, 0))])) },
  latenz_s: { gesamt: { median: Math.round(quant(karten.map((k) => k.ms), 0.5) / 1000), p90: Math.round(quant(karten.map((k) => k.ms), 0.9) / 1000), max: Math.round(Math.max(...karten.map((k) => k.ms)) / 1000) },
    bau: { median: Math.round(quant(karten.filter((k) => k.msBau).map((k) => k.msBau), 0.5) / 1000), p90: Math.round(quant(karten.filter((k) => k.msBau).map((k) => k.msBau), 0.9) / 1000), max: Math.round(Math.max(...karten.filter((k) => k.msBau).map((k) => k.msBau)) / 1000) } },
  abgeschnitten: { bauer_aufrufe: bauer.length, max_tokens: bauer.filter((c) => c.stop === "max_tokens").length, alle_max_tokens: calls.filter((c) => c.stop === "max_tokens").length, bauer_out_max: Math.max(0, ...bauer.map((c) => c.out)), bauer_out_median: quant(bauer.map((c) => c.out), 0.5) },
  aufrufe: { worker: calls.length, p1: p1.length, fehler: calls.filter((c) => c.error).length }
};
fs.writeFileSync(path.join(ZIEL, "kennzahlen.json"), JSON.stringify(K, null, 1) + "\n");
console.log(JSON.stringify(K, null, 1));
