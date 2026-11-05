#!/usr/bin/env node
// Standard texts for "Worte finden" and the card text (KI-Konzept: Standardanlässe vorproduziert, 0 KI-Aktionen).
// Two steps, so a person decides what goes in:
//
// 1. Pool: every occasion of the text kind (art worte and spruch) per language, several rounds through the server's own
//    path of the kind "text" (read, screenInput, runKind, shape from CADS-DEMO-wrapper lib/duell-ai.mjs) against the
//    real model. Only what passes the page's own check (src/texte.js check()) and was not cut short ("…") is kept.
//
//    DUELL_WRAPPER=../CADS-DEMO-wrapper LITELLM_BASE_URL=https://llm.example LITELLM_KEY_FILE=~/.config/cads/litellm-test.key \
//      node scripts/texte-gen.mjs --pool=/tmp/texte-pool.json [--rounds=3] [--art=worte,spruch]
//
// 2. Pick: a person reads the pool and names 3 variants per occasion (worte: one per tone) by their number; the texts
//    go into src/texte.json exactly as the model wrote them, nothing is rewritten by hand.
//
//    node scripts/texte-gen.mjs --pool=/tmp/texte-pool.json --pick=/tmp/texte-pick.json   (picks: {de: {worte: {trost: [0, 4, 7]}}})
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), app = path.join(here, '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const T = createRequire(import.meta.url)(path.join(app, 'src/texte.js'));
const poolFile = arg('pool', ''), pickFile = arg('pick', ''), out = path.join(app, 'src/texte.json');
if (!poolFile) { console.error('--pool=<file> fehlt'); process.exit(2); }

if (pickFile) {
  const pool = JSON.parse(readFileSync(poolFile, 'utf8')), picks = JSON.parse(readFileSync(pickFile, 'utf8')), file = JSON.parse(readFileSync(out, 'utf8'));
  file.vor = {};
  for (const lang of Object.keys(picks)) for (const art of Object.keys(picks[lang])) for (const anlass of T.ANLASS[art]) {
    const ids = picks[lang][art][anlass], cand = pool[lang][art][anlass];
    if (!Array.isArray(ids) || ids.length !== 3) throw new Error('3 Nummern noetig: ' + [lang, art, anlass].join('/'));
    const got = ids.map((i) => cand[i]);
    if (art === 'worte') got.sort((a, b) => T.TOENE.indexOf(a && a.ton) - T.TOENE.indexOf(b && b.ton));
    if (got.some((g) => !g || !T.check(art, g))) throw new Error('Nummer ausserhalb des Pools: ' + [lang, art, anlass].join('/'));
    if (art === 'worte' && new Set(got.map((g) => g.ton)).size !== 3) throw new Error('je Ton eine: ' + [lang, art, anlass].join('/'));
    ((file.vor[lang] = file.vor[lang] || {})[art] = file.vor[lang][art] || {})[anlass] = got;
  }
  writeFileSync(out, JSON.stringify(file, null, 1) + '\n');
  console.log('->', path.relative(app, out));
  process.exit(0);
}

const wrapper = path.resolve(process.env.DUELL_WRAPPER || '');
const base = String(process.env.LITELLM_BASE_URL || '').replace(/\/+$/, '').replace(/\/v1$/, '');
const keyFile = String(process.env.LITELLM_KEY_FILE || '').replace(/^~/, homedir());
if (!process.env.DUELL_WRAPPER || !base || !keyFile) { console.error('set DUELL_WRAPPER, LITELLM_BASE_URL and LITELLM_KEY_FILE'); process.exit(2); }
const { makeLlm } = await import(pathToFileURL(path.join(wrapper, 'lib/duell.mjs')));
const { KINDS, TEXT, runKind, screenInput } = await import(pathToFileURL(path.join(wrapper, 'lib/duell-ai.mjs')));
const call = makeLlm({ baseUrl: base, apiKey: readFileSync(keyFile, 'utf8').trim(), model: process.env.LITELLM_DEFAULT_MODEL || 'local-qwen36-35b-a3b-coding', timeoutMs: 60000, temperature: 0.8, maxTokens: 900, detail: true });
const rounds = Number(arg('rounds', '3')), arten = arg('art', 'worte,spruch').split(','), def = KINDS.text, pool = {};
let calls = 0, dropped = 0;
for (const lang of ['de', 'en']) for (const art of arten) {
  if (JSON.stringify(TEXT.anlass[art]) !== JSON.stringify(T.ANLASS[art])) throw new Error('Anlaesse von ' + art + ' weichen vom Server ab');
  for (const anlass of TEXT.anlass[art]) {
    const data = def.read({ art, anlass });
    if (screenInput(def, data)) throw new Error('refused: ' + art + '/' + anlass);
    const cand = [];
    for (let n = 0; n < rounds; n++) {
      calls++;
      const r = await runKind(def, data, lang, call, []);
      for (const o of r.options || []) {
        const k = T.check(art, o);
        if (!k || /…$/.test(k.x)) { dropped++; continue; }     // a text the server had to cut short is no standard text
        if (!cand.some((g) => g.x === k.x)) cand.push(k);
      }
    }
    ((pool[lang] = pool[lang] || {})[art] = pool[lang][art] || {})[anlass] = cand;
    console.log(lang, art, anlass, cand.length);
  }
}
writeFileSync(poolFile, JSON.stringify(pool, null, 1) + '\n');
console.log('calls', calls, 'dropped', dropped, '->', poolFile);
