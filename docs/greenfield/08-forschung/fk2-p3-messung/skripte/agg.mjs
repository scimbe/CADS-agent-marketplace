// FK2-P3-Messung: Kennzahlen je Rollen-Variante neben der Nullmessung.
//   node agg.mjs <rohdaten-dir> <urteil-dir> <ziel-dir>
// Liest karten.jsonl, aufrufe.jsonl, abweichungen.jsonl (Pipeline), faelle-map.jsonl + urteile-*.jsonl (Gutachter) und
// fk2-nullmessung/{wuensche,urteile}.jsonl. Schreibt <ziel>/kennzahlen.json, <ziel>/urteile.jsonl (je Karte) und
// <ziel>/abweichungen.jsonl (Format fk2-abweichung/1: quelle "abnahme" aus der Pipeline + quelle "erwartung" aus dem Urteil).
import fs from "node:fs";
import path from "node:path";

const [ROH, URT, ZIEL] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname), NULL = path.join(HERE, "../../fk2-nullmessung");
const jl = (f) => fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const W = Object.fromEntries(jl(path.join(NULL, "wuensche.jsonl")).map((w) => [w.id, w]));
const karten = jl(path.join(ROH, "karten.jsonl")).filter((k) => k.ende !== "budget-abbruch" && !(k.ende === "fehler" && /usage limits/.test(k.fehler || "")));   // B-P16-L3: Kontolimit, nicht gemessen
const calls = jl(path.join(ROH, "aufrufe.jsonl"));
const map = Object.fromEntries(jl(path.join(URT, "faelle-map.jsonl")).map((m) => [m.karte, m]));
const U = Object.fromEntries(fs.readdirSync(URT).filter((f) => /^urteile-\d+\.jsonl$/.test(f)).flatMap((f) => jl(path.join(URT, f))).map((u) => [u.fall, u]));
const NU = jl(path.join(NULL, "urteile.jsonl"));

const SC = { erfuellt: 1, teilweise: 0.5 };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r3 = (x) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const quant = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const cnt = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);
const quote = (punkte) => mean(punkte.map((p) => SC[p.urteil] || 0));

// Gruppen
const P3 = [...new Set(karten.map((k) => k.wunsch_id))].sort();
const ARCADE = Object.keys(W).filter((id) => W[id].kategorie === "arcade");
const ANDERE_P3 = P3.filter((id) => W[id].kategorie === "anderes_spiel");
const ANDERE_ALLE = Object.keys(W).filter((id) => W[id].kategorie === "anderes_spiel");
const NICHT_P3 = Object.keys(W).filter((id) => !P3.includes(id));

// Nullmessung je Wunsch (Mittel der Laeufe)
const nullQ = {};
for (const id of Object.keys(W)) nullQ[id] = mean(NU.filter((u) => u.id === id).map((u) => u.quote));
const nullOn = (ids) => r3(mean(ids.map((id) => nullQ[id])));

// Urteile je Karte
const rows = [];
for (const k of karten) {
  const m = map[k.id]; const u = m && U[m.fall];
  if (!u) { console.error("kein Urteil fuer " + k.id); continue; }
  rows.push({ karte: k.id, fall: m.fall, variante: k.variante, lauf: k.lauf, id: k.wunsch_id, kategorie: W[k.wunsch_id].kategorie, ende: k.ende, quote: quote(u.punkte), punkte: u.punkte, gesamt: u.gesamt, ueberblockt: u.ueberblockt, fehler_inhalt: u.fehler_inhalt, muster: u.muster, begruendung: u.begruendung });
}
fs.writeFileSync(path.join(ZIEL, "urteile.jsonl"), rows.map((r) => JSON.stringify({ ...r, quote: r3(r.quote) })).join("\n") + "\n");

// Abweichungen: Pipeline (abnahme) + Urteil (erwartung), ein Format
const abw = jl(path.join(ROH, "abweichungen.jsonl"));
for (const r of rows) r.punkte.forEach((p, i) => abw.push({ schema: "fk2-abweichung/1", karte: r.karte, wunsch_id: r.id, variante: r.variante, lauf: r.lauf, quelle: "erwartung", runde: 0, punkt_id: "e" + (i + 1), punkt: p.erwartung, status: p.urteil, grund: p.warum, fehlerarten: r.muster, kundentext: null }));
fs.writeFileSync(path.join(ZIEL, "abweichungen.jsonl"), abw.map((r) => JSON.stringify(r)).join("\n") + "\n");

function variante(v) {
  const R = rows.filter((r) => r.variante === v), K = karten.filter((k) => k.variante === v);
  if (!K.length) return null;
  const byWish = (ids) => r3(mean(ids.map((id) => mean(R.filter((r) => r.id === id).map((r) => r.quote))).filter((x) => x !== null)));
  const pts = R.flatMap((r) => r.punkte.map((p) => p.urteil)), nichtVoll = pts.filter((p) => p !== "erfuellt");
  // Pipeline: Abnahme der ersten Auslieferung
  const geliefert = K.filter((k) => k.ende === "geliefert");
  const hk = geliefert.flatMap((k) => k.plan.haekchen.map((h) => ({ machbar: h.machbar, ok: h.machbar && k.versionen[0].abnahme.punkte.some((x) => x.id === h.id && x.urteil === "erfuellt") })));
  // Nachbesserung: offene fehlt-Punkte nach 0..3 Runden (Werte werden fortgeschrieben, wenn nichts mehr zu tun war)
  const offen = [0, 1, 2, 3].map((n) => geliefert.map((k) => { const nb = k.nachbesserungen || []; if (n === 0) return k.anzeige0.fehlt.length; const x = nb.slice(0, n).filter((y) => y.offen_nachher !== undefined); return x.length ? x[x.length - 1].offen_nachher : k.anzeige0.fehlt.length; }));
  const offenAb = [0, 1, 2, 3].map((n) => geliefert.map((k) => { let cur = k.anzeige0.fehlt.filter((f) => f.quelle === "abnahme").length; for (const y of (k.nachbesserungen || []).slice(0, n)) if (y.offen_nachher_abnahme !== undefined) cur = y.offen_nachher_abnahme; return cur; }));
  const nbRunden = geliefert.flatMap((k) => (k.nachbesserungen || []).filter((n) => n.ergebnis !== "nichts-zu-tun"));
  // Kosten je Karte aus den Aufrufen (Tag-Praefix), getrennt nach erster Auslieferung und Nachbesserung
  const cost = (k, nb) => calls.filter((c) => String(c.tag).split(":")[0] === k.id && (nb ? /:nb\d/.test(c.tag) : !/:nb\d/.test(c.tag))).reduce((a, c) => a + (c.usd || 0), 0);
  const kostenErst = K.map((k) => cost(k, false)), kostenNb = K.map((k) => cost(k, true));
  const rollenKosten = {};
  for (const c of calls.filter((c) => String(c.tag).startsWith(v + "-"))) { const r = c.role + (/:nb\d/.test(c.tag) ? "/nachbesserung" : ""); rollenKosten[r] = r5((rollenKosten[r] || 0) + (c.usd || 0)); }
  const versuche = K.flatMap((k) => [...(k.versuche || []), ...(k.nachbesserungen || []).flatMap((n) => n.versuche || [])]);
  const erst = K.filter((k) => k.versuche && k.versuche.length);
  return {
    n_karten: K.length, n_geurteilt: R.length,
    quote: { p3_spiele: byWish(P3), arcade: byWish(ARCADE.filter((id) => P3.includes(id))), andere_spiele_p3: byWish(ANDERE_P3) },
    quote_gesamt_26_mit_null_fuer_nicht_p3: r3(mean([...P3.map((id) => mean(R.filter((r) => r.id === id).map((r) => r.quote))), ...NICHT_P3.map((id) => nullQ[id])])),
    quote_andere_spiele_6_mit_null_fuer_quiz: r3(mean([...ANDERE_P3.map((id) => mean(R.filter((r) => r.id === id).map((r) => r.quote))), ...ANDERE_ALLE.filter((id) => !P3.includes(id)).map((id) => nullQ[id])])),
    quote_je_wunsch: Object.fromEntries(P3.map((id) => [id, R.filter((r) => r.id === id).sort((a, b) => a.lauf - b.lauf).map((r) => r3(r.quote))])),
    punkte_anteil: Object.fromEntries(Object.entries(cnt(pts)).map(([k, n]) => [k, pct(n, pts.length)])), punkte_n: pts.length,
    gesamt_anteil: Object.fromEntries(Object.entries(cnt(R.map((r) => r.gesamt))).map(([k, n]) => [k, pct(n, R.length)])),
    ehrlich_fehlt_anteil_an_nicht_erfuellten_punkten: pct(nichtVoll.filter((p) => p === "ehrlich_abgesagt").length, nichtVoll.length),
    scheinangebot_anteil_punkte: pct(pts.filter((p) => p === "scheinangebot").length, pts.length),
    karten_mit_scheinangebot: pct(R.filter((r) => r.punkte.some((p) => p.urteil === "scheinangebot")).length, R.length),
    ueberblockt: R.filter((r) => r.ueberblockt).length, mit_inhaltsfehler: R.filter((r) => (r.fehler_inhalt || []).length).length,
    pipeline: {
      ende: cnt(K.map((k) => k.ende)),
      abnahme_quote_alle_haken: pct(hk.filter((h) => h.ok).length, hk.length), abnahme_quote_machbare_haken: pct(hk.filter((h) => h.ok).length, hk.filter((h) => h.machbar).length),
      haken_je_karte: r3(mean(geliefert.map((k) => k.plan.haekchen.length))), nicht_machbar_angesagt: hk.filter((h) => !h.machbar).length,
      erster_versuch_gruen: pct(erst.filter((k) => k.versuche[0].ok).length, erst.length),
      reparaturrunden_mittel: r3(mean(erst.map((k) => k.versuche.length - 1))), reparaturrunden_max: Math.max(0, ...erst.map((k) => k.versuche.length - 1)),
      latenz_s: { median: r3(quant(K.map((k) => k.ms / 1000), 0.5)), p90: r3(quant(K.map((k) => k.ms / 1000), 0.9)), max: r3(Math.max(...K.map((k) => k.ms / 1000))) },
      kosten_usd_je_karte_erste_auslieferung: { mittel: r5(mean(kostenErst)), max: r5(Math.max(...kostenErst)) },
      kosten_usd_je_karte_nachbesserungen: { mittel: r5(mean(kostenNb)), max: r5(Math.max(...kostenNb)) },
      kosten_usd_gesamt: r5([...kostenErst, ...kostenNb].reduce((a, b) => a + b, 0)), kosten_je_rolle: rollenKosten
    },
    nachbesserung: {
      karten: geliefert.length,
      offen_fehlt_summe_nach_0_1_2_3: offen.map((a) => a.reduce((x, y) => x + y, 0)),
      offen_fehlt_abnahme_summe_nach_0_1_2_3: offenAb.map((a) => a.reduce((x, y) => x + y, 0)),
      karten_ohne_offene_abnahme_fehlt_nach_0_1_2_3: offenAb.map((a) => a.filter((x) => x === 0).length),
      runden_mit_arbeit: nbRunden.length, ergebnis: cnt(geliefert.flatMap((k) => (k.nachbesserungen || []).map((n) => n.ergebnis))),
      latenz_s_median: r3(quant(nbRunden.filter((n) => n.ms).map((n) => n.ms / 1000), 0.5))
    },
    fehlerarten: Object.entries(cnt(versuche.flatMap((x) => x.fehlerarten || []))).sort((a, b) => b[1] - a[1]),
    bau_versuche: versuche.length, bau_versuche_gruen: versuche.filter((x) => x.ok).length,
    muster: Object.entries(cnt(R.flatMap((r) => (r.muster || []).map((m) => m.toLowerCase())))).sort((a, b) => b[1] - a[1]).slice(0, 15)
  };
}

const K = {
  null: { quote_gesamt_26: 0.412, arcade_11: 0.227, andere_spiele_6: 0.326, nicht_spiele_9: 0.694, p3_spiele: nullOn(P3), arcade_p3: nullOn(ARCADE.filter((id) => P3.includes(id))), andere_spiele_p3: nullOn(ANDERE_P3), quelle: "fk2-nullmessung/kennzahlen.json, urteile.jsonl" },
  p3_wuensche: P3, nicht_p3: NICHT_P3,
  varianten: Object.fromEntries(["A", "B", "C"].map((v) => [v, variante(v)]).filter(([, x]) => x)),
  api_kosten_usd_gesamt: r5(calls.reduce((a, c) => a + (c.usd || 0), 0)), aufrufe: calls.length, aufrufe_fehler: calls.filter((c) => c.error).length,
  tokens: calls.reduce((a, c) => { for (const k of ["in", "out", "cacheRead", "cacheWrite"]) a[k] += c[k] || 0; return a; }, { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 })
};
fs.writeFileSync(path.join(ZIEL, "kennzahlen.json"), JSON.stringify(K, null, 1));
console.log(JSON.stringify(K, null, 1));
