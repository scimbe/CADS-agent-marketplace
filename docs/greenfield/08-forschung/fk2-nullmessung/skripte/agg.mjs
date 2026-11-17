// Aggregiert faelle.jsonl + urteile-{a,b}.jsonl -> urteile.jsonl (je Lauf) und Kennzahlen (stdout, kennzahlen.json)
import { readFileSync, writeFileSync } from 'node:fs';
const D = new URL('.', import.meta.url).pathname;
const jl = (f) => readFileSync(D + f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const F = jl('faelle.jsonl'), U = Object.fromEntries([...jl('urteile-a.jsonl'), ...jl('urteile-b.jsonl')].map((u) => [u.fall, u]));
const W = Object.fromEntries(jl('wuensche.jsonl').map((w) => [w.id, w]));
const SC = { erfuellt: 1, teilweise: 0.5 };
const rows = F.map((f) => {
  const u = U[f.anzeige_hash]; if (!u) throw new Error('kein Urteil ' + f.anzeige_hash);
  const pts = u.punkte.map((p) => p.urteil), q = pts.reduce((a, p) => a + (SC[p] || 0), 0) / pts.length;
  return { ...f, kategorie: W[f.id].kategorie, punkte: u.punkte, quote: q, gesamt: u.gesamt, ueberblockt: u.ueberblockt, fehler_inhalt: u.fehler_inhalt, muster: u.muster, begruendung: u.begruendung };
});
writeFileSync(D + 'urteile.jsonl', rows.map((r) => JSON.stringify({ id: r.id, lauf: r.lauf, klasse: r.klasse, strike: r.strike, quote: Math.round(r.quote * 1000) / 1000, gesamt: r.gesamt, ueberblockt: r.ueberblockt, fehler_inhalt: r.fehler_inhalt, muster: r.muster, punkte: r.punkte, begruendung: r.begruendung })).join('\n') + '\n');
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (n, d) => Math.round((1000 * n) / d) / 10;
const quant = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const allPts = rows.flatMap((r) => r.punkte.map((p) => p.urteil));
const cnt = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
const P = { in: 0.10, out: 0.50, read: 0.01, write: 0.125, write1h: 0.20 };
const K = {
  n_wuensche: new Set(rows.map((r) => r.id)).size, n_laeufe: rows.length,
  quote_gesamt_mittel: Math.round(mean(rows.map((r) => r.quote)) * 1000) / 1000,
  quote_je_kategorie: Object.fromEntries(['arcade', 'anderes_spiel', 'nicht_spiel'].map((k) => [k, Math.round(mean(rows.filter((r) => r.kategorie === k).map((r) => r.quote)) * 1000) / 1000])),
  quote_je_wunsch: Object.fromEntries([...new Set(rows.map((r) => r.id))].map((id) => [id, rows.filter((r) => r.id === id).map((r) => Math.round(r.quote * 100) / 100)])),
  punkte: cnt(allPts), punkte_n: allPts.length,
  punkte_anteil: Object.fromEntries(Object.entries(cnt(allPts)).map(([k, v]) => [k, pct(v, allPts.length)])),
  gesamt: cnt(rows.map((r) => r.gesamt)), gesamt_anteil: Object.fromEntries(Object.entries(cnt(rows.map((r) => r.gesamt))).map(([k, v]) => [k, pct(v, rows.length)])),
  klasse: cnt(rows.map((r) => r.klasse)), strikes: rows.filter((r) => r.strike).length, ueberblockt: rows.filter((r) => r.ueberblockt).length,
  mit_inhaltsfehler: rows.filter((r) => r.fehler_inhalt && r.fehler_inhalt.length).length,
  stabil: Object.fromEntries([...new Set(rows.map((r) => r.id))].map((id) => [id, [...new Set(rows.filter((r) => r.id === id).map((r) => r.klasse))].join('/')])),
  latenz_ms_mit_modell: (() => { const a = rows.filter((r) => r.aufrufe > 0).map((r) => r.ms); return { n: a.length, median: quant(a, 0.5), p90: quant(a, 0.9), max: Math.max(...a) }; })(),
  latenz_ms_je_klasse: Object.fromEntries(['karte', 'absage', 'block_s1', 'block_modell'].map((k) => { const a = rows.filter((r) => r.klasse === k).map((r) => r.ms); return [k, a.length ? { n: a.length, median: quant(a, 0.5), max: Math.max(...a) } : null]; })),
  aufrufe_summe: rows.reduce((a, r) => a + r.aufrufe, 0),
  tokens: rows.reduce((a, r) => { for (const k of ['in', 'out', 'cacheRead', 'cacheWrite']) a[k] += r.usage[k] || 0; return a; }, { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }),
};
K.usd_haiku_auftragspreise = Math.round(((K.tokens.in * P.in + K.tokens.out * P.out + K.tokens.cacheRead * P.read + K.tokens.cacheWrite * P.write) / 1e6) * 1e5) / 1e5;
K.usd_haiku_mit_1h_write = Math.round(((K.tokens.in * P.in + K.tokens.out * P.out + K.tokens.cacheRead * P.read + K.tokens.cacheWrite * P.write1h) / 1e6) * 1e5) / 1e5;
const karten = rows.filter((r) => r.klasse === 'karte');
K.usd_je_karte_mittel = Math.round((mean(karten.map((r) => r.usage.usdHigh)) * 1e5)) / 1e5;
K.usd_je_karte_max = Math.round(Math.max(...karten.map((r) => r.usage.usdHigh)) * 1e5) / 1e5;
K.usd_je_art = Object.fromEntries(['card', 'photo', 'game', 'lauf', 'bau', 'turn'].map((k) => { const a = karten.filter((r) => r.anzeige.karte && (k === 'bau' ? /Baukasten/.test(r.anzeige.karte.typ) : k === 'game' ? /Flugspiel/.test(r.anzeige.karte.typ) : k === 'lauf' ? /Jump/.test(r.anzeige.karte.typ) : k === 'card' ? /Grußkarte/.test(r.anzeige.karte.typ) : k === 'photo' ? /Meme/.test(r.anzeige.karte.typ) : /Quiz|Funktionskarte/.test(r.anzeige.karte.typ))); return [k, a.length ? { n: a.length, usd_mittel: Math.round(mean(a.map((r) => r.usage.usdHigh)) * 1e5) / 1e5, ms_median: quant(a.map((r) => r.ms), 0.5) } : null]; }));
K.muster = Object.entries(cnt(rows.flatMap((r) => r.muster.map((m) => m.toLowerCase())))).sort((a, b) => b[1] - a[1]).slice(0, 20);
writeFileSync(D + 'kennzahlen.json', JSON.stringify(K, null, 1));
console.log(JSON.stringify(K, null, 1));
