// FK2-Nullmessung: jeder Wunsch durch den Pfad des Servers (lib/duell-ai.mjs act fuer kind karte: read -> need -> screenInput
// -> soft/hart -> runKarte), echtes Modell (lib/duell-llm.mjs), ohne HTTP, ohne Login/Konto, ohne Produktions-Volumes.
// Schreibt /work/ausgaben.jsonl. Gibt nie den Key aus.
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { KINDS, screenInput } from '/app/lib/duell-ai.mjs';
import { App } from '/app/lib/duell-karte.mjs';
import { createLlm } from '/app/lib/duell-llm.mjs';

const ABORT_USD = Number(process.env.FK2_ABORT_USD || 6);
// Preise laut Auftrag (USD/MTok); write1h laut Code 0.20, Auftrag 0.125 -> beide gerechnet
const P = { in: 0.10, out: 0.50, read: 0.01, write: 0.125, write1h: 0.20 };
const usdUser = (u) => (u.in * P.in + u.out * P.out + u.cacheRead * P.read + u.cacheWrite * P.write) / 1e6;
const usdHigh = (u) => (u.in * P.in + u.out * P.out + u.cacheRead * P.read + u.cacheWrite * P.write1h) / 1e6;

const K = KINDS.karte;
const base = createLlm({ env: process.env, log: () => {} });
if (!base.configured) { console.error('llm not configured'); process.exit(2); }
let calls = [], total = { usdUser: 0, usdHigh: 0 };
const llm = {
  ...base,
  async generate(req) {
    const t0 = Date.now();
    try {
      const r = await base.generate(req);
      const u = r.usage || { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
      const c = { name: req.name || '', stop: r.stop, ok: !!r.json, ms: Date.now() - t0, ...u, usdUser: usdUser(u), usdHigh: usdHigh(u), usdCode: r.usd };
      calls.push(c); total.usdUser += c.usdUser; total.usdHigh += c.usdHigh;
      return r;
    } catch (e) { calls.push({ name: req.name || '', error: e.code || e.message, ms: Date.now() - t0 }); throw e; }
  },
};
const title = (id) => { const i = App.D.byId(id); return i ? { id, t: (i.de && i.de.t) || '', s: (i.de && i.de.s) || '' } : { id }; };

const rows = readFileSync('/work/wuensche.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
writeFileSync('/work/ausgaben.jsonl', '');
for (const w of rows) {
  if (total.usdHigh >= ABORT_USD) { appendFileSync('/work/ausgaben.jsonl', JSON.stringify({ id: w.id, abgebrochen: 'budget', usdHigh: total.usdHigh }) + '\n'); continue; }
  calls = [];
  const t0 = Date.now();
  const input = { text: w.wunsch, art: w.art, ...(w.genre ? { genre: w.genre } : {}) };
  const data = K.read(input);
  data.age = w.persona.alter >= 18 ? 'a18' : 'u18';   // Annahme: wer 18+ ist, hat 18+ im Profil erklaert
  let r, stufe;
  try {
    if (!K.need(data)) { r = { http: 400, error: 'bad-request', why: K.why(data) }; stufe = 'need'; }
    else {
      const bad = screenInput(K, data);
      if (bad === 'crisis') { r = { http: 422, error: 'blocked', why: 'crisis' }; stufe = 's1'; }
      else if (bad && !K.soft(data)) { r = { http: 422, error: 'blocked' }; stufe = 's1-hart'; }
      else if (bad) { const a = K.absage(data, K.soft(data)); r = { http: 200, notyet: true, reason: a.reason, alt: a.alt, catalog: a.catalog }; stufe = 's1-weich'; }
      else {
        stufe = 'run';
        r = await K.run(data, 'de', { llm, secrets: [], onCall: () => {}, now: Date.now(), bauOff: false, bauStrategie: '', bauBeispiele: '', bauFakten: '' });
      }
    }
  } catch (e) { r = { fail: 'llm-error', why: e.code || e.message }; stufe = stufe || 'run'; }
  const ms = Date.now() - t0;
  const cat = [...new Set([...(r.catalog || []), ...(r.alt && r.alt.kind === 'katalog' ? [r.alt.id] : [])])].map(title);
  const sum = calls.reduce((a, c) => { for (const k of ['in', 'out', 'cacheRead', 'cacheWrite', 'usdUser', 'usdHigh']) a[k] += c[k] || 0; return a; }, { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, usdUser: 0, usdHigh: 0 });
  const row = { id: w.id, eingabe: { ...input, age: data.age }, stufe, ms, aufrufe: calls.length, usage: sum, calls, ergebnis: r, katalog_titel: cat };
  appendFileSync('/work/ausgaben.jsonl', JSON.stringify(row) + '\n');
  const o = r.options ? 'karte:' + r.options[0].doc.k : r.notyet ? 'notyet:' + (r.reason || (r.notyet && r.notyet.what) || '') : r.fail ? 'fail:' + r.fail + ':' + (r.why || '') : r.error ? 'err:' + r.error : '?';
  console.log(JSON.stringify({ id: w.id, o, ms, n: calls.length, usd: Math.round(sum.usdHigh * 1e5) / 1e5, tot: Math.round(total.usdHigh * 1e4) / 1e4 }));
}
console.log(JSON.stringify({ fertig: true, total, budget: base.budget() }));
