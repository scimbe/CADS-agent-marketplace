// Messung A10: der Wrapper-Teil im Wegwerf-Container (Wrapper-Code aus feat/fk2-p34 unter /wrapper, read-only).
// Echter Klaerungsdialog P1 (lib/duell-klaerung.mjs, Modell ueber lib/duell-llm.mjs) und echte Bau-Warteschlange
// (lib/duell-fk2-bau.mjs) mit dem internen Listener; gebaut wird von den echten Worker-Containern (bau/main.mjs, Rollen A).
// Antworten im Dialog: immer "Egal, ueberrasch mich" (persona-blind: die Erwartungen kennt nur das Urteil).
// Schreibt /out/karten.jsonl (je Auftrag: P1-Liste, Status, Ergebnis, Code, Zeiten). Kein Port nach aussen.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createDuell } from '/wrapper/lib/duell.mjs';
import { createKlaerung } from '/wrapper/lib/duell-klaerung.mjs';
import { createBau } from '/wrapper/lib/duell-fk2-bau.mjs';
import { createLlm } from '/wrapper/lib/duell-llm.mjs';

const OUT = '/out', LAEUFE = Number(process.env.A10_LAEUFE || 3), PAR = Number(process.env.A10_PARALLEL || 3);
const log = (o) => fs.appendFileSync(path.join(OUT, 'wrapper.log'), JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
let wuensche = fs.readFileSync('/eingabe/eingabe-wuensche-p3.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
if (process.env.A10_NUR) { const nur = new Set(process.env.A10_NUR.split(',')); wuensche = wuensche.filter((w) => nur.has(w.id)); }
if (wuensche.some((w) => w.erwartung)) throw new Error('Eingabe enthaelt Erwartungen');

const d = createDuell({ env: {}, salt: 'a10', log: () => {}, llm: async () => '{}' });
const kredit = [];
const credit = { available: () => 1e6, spend: (k, n) => { kredit.push(['spend', k, n]); return true; }, refund: (k, n) => { kredit.push(['refund', k, n]); return true; } };
Object.assign(d.shared, { age16: () => true, mod: { canCreate: () => ({ ok: true }) }, credit });
const llm = createLlm({ env: { DUELL_CARD_PROVIDER: 'anthropic', DUELL_CARD_MODEL: 'claude-haiku-5-5', DUELL_ANTHROPIC_KEY_FILE: '/run/secrets/anthropic.key',
  DUELL_CARD_BUDGET_USD: process.env.A10_P1_USD || '0.4', DUELL_CARD_BUDGET_MONTH_USD: '1', DUELL_CARD_BUDGET_FILE: path.join(OUT, 'p1-budget.json') }, log });
const k = createKlaerung({ env: { DUELL_KLAERUNG: 'on', DUELL_KLAERUNG_DIR: path.join(OUT, 'auftraege'), DUELL_KLAERUNG_PER_DAY: '1000', DUELL_KLAERUNG_GEN_MS: '60000', DUELL_KLAERUNG_CHECK_MS: '30000' },
  shared: d.shared, who: async () => null, llm, log });
const bau = createBau({ env: { DUELL_BAU: 'on', DUELL_BAU_TOKEN_FILE: '/run/secrets/a10.token', DUELL_SPIEL_ORIGIN: 'https://spiel.a10.invalid', DUELL_SPIEL_MODULE_DIR: path.join(OUT, 'spiele'),
  DUELL_APP_URL: 'https://app.a10.invalid/duell', DUELL_IP_HEADER: 'x-real-ip', DUELL_BAU_NETZ: process.env.A10_NETZ, DUELL_BAU_PORT: '8791' }, store: k.store, shared: d.shared, log });
if (!bau.on()) throw new Error('Bau aus');
k.useBau(bau);
http.createServer((q, r) => bau.route(q, r, new URL(q.url, 'http://intern')).then((ours) => { if (!ours) r.writeHead(404).end(); })).listen(8791, '0.0.0.0');

const jobs = [];
for (let l = 1; l <= LAEUFE; l++) for (const w of wuensche) jobs.push({ w, l });
const schreib = (row) => fs.appendFileSync(path.join(OUT, 'karten.jsonl'), JSON.stringify(row) + '\n');
async function eins({ w, l }, n) {
  const P = { account: true, acct: 'aA10' + String(n).padStart(4, '0') + 'x', mail: 'a10-' + n + '@example.invalid' };
  const row = { id: 'A-' + w.id + '-L' + l, wunsch_id: w.id, lauf: l, t0: Date.now() };
  const f = await k.fragen(P, { satz: w.wunsch, lang: 'de' });
  row.fragen = { status: f.status, body: f.status === 200 ? { verstehe: f.body.verstehe, fragen: f.body.fragen } : f.body };
  if (f.status !== 200) { row.ende = 'p1-fragen-' + f.status; row.ms = Date.now() - row.t0; return schreib(row); }
  const li = await k.liste(P, { id: f.body.id, antworten: f.body.fragen.map(() => ({ art: 'egal' })) });
  row.liste = { status: li.status, body: li.body };
  if (li.status !== 200) { row.ende = 'p1-liste-' + li.status; row.ms = Date.now() - row.t0; return schreib(row); }
  const a = k.auftrag(P, { id: f.body.id });
  if (a.status !== 202) { row.ende = 'p1-auftrag-' + a.status; row.ms = Date.now() - row.t0; return schreib(row); }
  row.auftrag = a.body.auftrag; row.t1 = Date.now();
  let st;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    st = k.status(P, { auftrag: a.body.auftrag });
    if (st.status === 200 && st.body.status !== 'baut') break;
    if (Date.now() - row.t1 > 25 * 60000) { row.ende = 'warte-zeit'; break; }
  }
  const o = k.store.get(a.body.auftrag);
  row.status = st.body; row.bau = o.bau; row.kosten = o.kosten; row.bauPlan = o.bauPlan || null;
  row.code = o.spiel ? fs.readFileSync(path.join(OUT, 'spiele', o.spiel.sha256 + '.js'), 'utf8') : null;
  row.ende = row.ende || (st.body.status === 'fertig' ? 'geliefert' : st.body.status);
  row.ms = Date.now() - row.t0; row.msBau = Date.now() - row.t1;
  schreib(row);
  log({ event: 'a10-karte', id: row.id, ende: row.ende, fehlt: st.body.ergebnis ? st.body.ergebnis.fehlt : null, ms: row.ms });
}
let next = 0;
log({ event: 'a10-start', jobs: jobs.length });
await Promise.all(Array.from({ length: PAR }, async () => { while (next < jobs.length) { const n = next++; try { await eins(jobs[n], n); } catch (e) { log({ event: 'a10-fehler', n, msg: String(e && e.stack || e).slice(0, 400) }); } } }));
fs.writeFileSync(path.join(OUT, 'kredit.json'), JSON.stringify(kredit));
log({ event: 'a10-ende' });
process.exit(0);
