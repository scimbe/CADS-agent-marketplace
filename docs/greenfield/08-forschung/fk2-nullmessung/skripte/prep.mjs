// Baut aus wuensche.jsonl + ausgaben-l{1,2,3}.jsonl die Sicht der Person ("anzeige"): was die App zeigt, nach den Regeln von
// apps/mdi/src/features/frei/view.js (refusalText, refusalBlock, noteLines) und den Texten texts.js. Schreibt faelle.jsonl.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const S = new URL('..', import.meta.url).pathname;
const { FREI_TEXTS } = await import(S + 'texts.mjs');
const de = FREI_TEXTS.de;
const ft = (k, v = {}) => (de[k] || '[' + k + ']').replace(/\{(\w+)\}/g, (_, x) => (v[x] !== undefined ? v[x] : '{' + x + '}'));
const MP = '/Users/dev/Documents/git/CADS-agent-marketplace';
const man = (id) => { try { return JSON.parse(execFileSync('git', ['-C', MP, 'show', `origin/main:apps/mdi/src/cards/${id}/manifest.json`], { encoding: 'utf8' })); } catch { return null; } };
const cardTitle = (id) => { const m = man(id); return m ? `${m.title.de} (${m.teaser && m.teaser.de})` : null; };
const jl = (f) => readFileSync(S + 'work/' + f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const W = Object.fromEntries(jl('wuensche.jsonl').map((w) => [w.id, w]));

function refusal(r) {
  if (r.error === 'blocked') return [ft(r.why === 'crisis' ? 'aiCrisis' : 'aiBlocked')];
  if (r.fail === 'unkind') return [ft('aiKind')];
  if (r.fail === 'crisis') return [ft('aiCrisis')];
  if (r.fail) return [ft('aiOff') + ' (Server antwortet 503 llm-unavailable; Annahme: die App zeigt diesen Text)'];
  if (!r.notyet) return null;
  const nt = typeof r.notyet === 'object' ? r.notyet : {};
  const n = typeof nt.name === 'string' ? nt.name.slice(0, 30) : '';
  let head;
  if (nt.what === 'game' && !n && !r.reason) head = ft('create_notyet_spiel');
  else {
    const k = r.reason ? 'create_absage_' + r.reason : '', why = k && de[k] ? de[k] : '';
    head = why ? (/\.$/.test(why) ? why : ft('create_absage_n', { x: why })) + ' ' + ft('create_absage_0')
      : n ? ft(nt.what === 'feature' ? 'create_notyet_feature' : 'create_notyet_game', { name: n }) : ft('create_notyet');
  }
  const out = [head];
  const alt = r.alt || null;
  if (alt && alt.kind === 'katalog') out.push(ft('create_alt') + ' Knopf „→ ' + (cardTitle(alt.id) || alt.id) + '“');
  if (alt && alt.kind === 'genre') out.push(ft('create_alt') + (alt.id === 'G3' ? ' ' + ft('create_alt_G3') : '') + ' Textfeld mit Vorschlag: „' + alt.satz + '“ und Knopf „' + ft('create_alt_send') + '“');
  const cat = (r.catalog || []).filter((id) => !(alt && alt.id === id));
  if (cat.length) out.push(ft(nt.what === 'feature' ? 'create_notyet_similar' : 'create_notyet_catalog') + ' ' + cat.map((id) => '„→ ' + (cardTitle(id) || id) + '“').join(', '));
  else if (!alt) out.push(ft('create_notyet_none'));
  return out;
}
function notes(ns) {
  const out = [];
  for (const c of ns || []) {
    const m = /^(days|people|chars):(\d{1,3})$/.exec(c), fe = /^bau:fakten-entfernt:(\d{1,3})$/.exec(c);
    if (c === 'drinks') out.push(ft('create_drinks'));
    else if (c === 'bau:fakten-unkalibriert') out.push(ft('create_fakten_unkalibriert'));
    else if (fe && Number(fe[1]) > 0) out.push(ft(Number(fe[1]) === 1 ? 'create_fakten_entfernt_1' : 'create_fakten_entfernt', { n: fe[1] }));
    else if (m) out.push(ft('create_lim_' + m[1], { n: m[2] }));
    else if (['money18', 'nosend', 'async', 'duel'].includes(c)) out.push(ft('create_lim_' + c));
    else if (c === 'engine:flug' || c === 'engine:lauf') out.push(ft(c === 'engine:flug' ? 'create_engine_flug' : 'create_engine_lauf') + ' Knopf „' + ft('create_engine_to', { b: ft('create_genre_' + (c === 'engine:flug' ? 'G2' : 'G1')) }) + '“');
  }
  return out;
}
function describe(doc) {
  const k = doc.k;
  if (k === 'card') return { typ: 'Grußkarte (statisch, nur Bild und Text, keine Funktion)', titel: doc.t, text: doc.x, stil: doc.st, sticker: (doc.sk || []).map((s) => s.e), farben: doc.col };
  if (k === 'photo') return { typ: 'Meme (eigenes Foto wird auf dem Gerät eingesetzt, Text oben und unten)', titel: doc.t, oben: doc.x, unten: doc.y, stil: doc.st };
  if (k === 'game') return { typ: 'Flugspiel-Engine: Die Figur fliegt automatisch nach rechts; Tippen lässt sie hochflattern (Schwerkraft zieht nach unten); sie muss durch Lücken zwischen Hindernis-Säulen fliegen; Berührung beendet den Lauf; Punkte = durchflogene Lücken. Es gibt keine Gegner, kein Schießen, kein freies Lenken, keine Strecke mit anderen Fahrzeugen. Allein oder Duell gegen die Aufnahme (Geist) per Link.', titel: doc.g.title, figur: doc.g.emoji, abschnitte: doc.g.route.map((r) => ({ welt: r.t, figur: r.e, tempo: r.p })) };
  if (k === 'lauf') return { typ: 'Jump-&-Run-Engine: Die Figur läuft automatisch; Tippen = springen, halten = höher; Hindernisse überspringen, Dinge einsammeln, fliegenden Gegnern ausweichen. Allein oder Duell per Link (Punkte schlagen).', titel: doc.t, modus: doc.l.m === 'ziel' ? 'mit Ziel' : 'endlos', welt: doc.l.w, figur: doc.l.e, hindernis: doc.l.o, sammeln: doc.l.c, flieger: doc.l.f };
  if (k === 'bau') return { typ: 'Baukasten-Spiel (neu gebaut aus der Beschreibung unten, vorab von Bots durchgespielt). Echtzeit: Dinge bewegen sich auf einem Feld; control steer = Richtung wischen, drag = ziehen; rules = was bei Berührung passiert. Zug (turn): flip = Memory mit Emoji-Paaren, answer = Fragen mit Auswahl.', titel: doc.t, beschreibung: doc.b };
  if (k === 'turn' && doc.pk) return { typ: 'Quiz (Fragepaket, per Link spielbar; jede Frage hat 4 Antworten, die erste ist die richtige, angezeigt gemischt)', titel: doc.pk.t, fragen: doc.pk.q };
  if (doc.i) return { typ: 'Funktionskarte aus dem Katalog: ' + (cardTitle(doc.i) || doc.i), titel: doc.t || '', untertitel: doc.s || '', wort: doc.w || '' };
  return { typ: k, doc };
}
const out = [];
for (const L of [1, 2, 3]) for (const row of jl(`ausgaben-l${L}.jsonl`)) {
  const w = W[row.id], r = row.ergebnis;
  const anzeige = r.options ? { ergebnis: 'Karte erstellt. ' + ft('create_wait_ready'), karte: describe(r.options[0].doc), hinweise: notes(r.note) } : { ergebnis: 'Keine Karte', meldung: refusal(r) };
  const klasse = r.options ? 'karte' : r.notyet ? 'absage' : r.error === 'blocked' ? 'block_s1' : r.fail === 'unkind' ? 'block_modell' : 'fehler';
  const strike = klasse === 'block_s1' || klasse === 'block_modell';
  const h = createHash('sha256').update(row.id + JSON.stringify(anzeige)).digest('hex').slice(0, 10);
  out.push({ id: row.id, lauf: L, klasse, strike, anzeige_hash: h, ms: row.ms, aufrufe: row.aufrufe, usage: row.usage, stufe: row.stufe, wunsch: w.wunsch, art: w.art, genre: w.genre, anzeige });
}
writeFileSync(S + 'work/faelle.jsonl', out.map((o) => JSON.stringify(o)).join('\n') + '\n');
const uniq = new Map(); for (const o of out) if (!uniq.has(o.anzeige_hash)) uniq.set(o.anzeige_hash, o);
writeFileSync(S + 'work/judge-input.json', JSON.stringify([...uniq.values()].map((o) => ({ fall: o.anzeige_hash, id: o.id, persona: W[o.id].persona, gewaehlt: { art: o.art, genre: o.genre, wer_spielt: W[o.id].wer_spielt }, wunsch: o.wunsch, erwartung: W[o.id].erwartung, anzeige: o.anzeige })), null, 1));
console.log('faelle', out.length, 'eindeutig', uniq.size);
