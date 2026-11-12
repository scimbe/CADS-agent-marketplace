// Golden-Erzeuger fuer Strang H (Heim): fuehrt den ALTEN Code (Tag pre-legacy-removal, Ordner des Altclients) aus und friert ein,
// was der neue Code exakt nachbilden muss. Aufruf: node test/golden/gen-home.cjs <Pfad zum Altclient, Export des Tags>
// Schreibt: src/ui/home/catalog.json (Katalog-Index wie ideas.json, Reihenfolge unveraendert), src/ui/home/kalender.json
// (Kopie), src/ui/home/intent.json (start.json ohne Texte) und test/fixtures/home-golden.json (Rotation, Suche, Absicht).
"use strict";
const fs = require("node:fs"), path = require("node:path");
const ALT = path.resolve(process.argv[2] || "");
const SRC = path.join(ALT, "src");
if (!fs.existsSync(path.join(SRC, "daily.js"))) { console.error("Altcode fehlt: " + SRC); process.exit(2); }
const OUT = path.resolve(__dirname, "../..");
const D = require(path.join(SRC, "daily.js"));
const Turns = require(path.join(SRC, "turns.js"));
const S = require(path.join(SRC, "start.js"));
const DATA = require(path.join(SRC, "ideas.json"));
const START = require(path.join(SRC, "start.json"));
const TX = require(path.join(SRC, "texts.json"));

// ---- Katalog: alles, was Rotation, Suche, Regal und Plakette brauchen, in der Originalreihenfolge ----
function how(i) { return i.kind === "turn" && i.turn && i.turn.g ? Turns.who(i.turn.g) : null; }
function lang(L) { if (!L) return undefined; const o = { t: L.t, s: L.s }; if (L.tags && L.tags.length) o.tags = L.tags; return o; }
function full(i) {
  const o = { id: i.id, kind: i.kind };
  const m = D.mech(i); if (m !== i.kind) o.mx = m;
  if (i.turn && i.turn.grip) o.grip = i.turn.grip;
  for (const k of ["on", "needs", "min", "round", "door", "style", "set"]) if (i[k] != null) o[k] = i[k];
  const w = how(i); if (w) o.how = w;
  if (i.tags && i.tags.length) o.tags = i.tags;
  o.de = lang(i.de); o.en = lang(i.en);
  return o;
}
function slimRetired(i) { const o = { id: i.id, kind: i.kind }; const m = D.mech(i); if (m !== i.kind) o.mx = m; if (i.round != null) o.round = i.round; if (i.to) o.to = i.to; o.de = { t: i.de && i.de.t }; o.en = { t: i.en && i.en.t }; return o; }
const catalog = { v: 1, herkunft: "Altclient, Tag pre-legacy-removal, src/ideas.json", ideas: DATA.ideas.map(full), gated: (DATA.gated || []).map(full), retired: (DATA.retired || []).map(slimRetired), gone: DATA.gone || [] };
fs.writeFileSync(path.join(OUT, "src/ui/home/catalog.json"), JSON.stringify(catalog) + "\n");
fs.copyFileSync(path.join(SRC, "kalender.json"), path.join(OUT, "src/ui/home/kalender.json"));
fs.writeFileSync(path.join(OUT, "src/ui/home/intent.json"), JSON.stringify({ herkunft: "Altclient, Tag pre-legacy-removal, src/start.json", intents: START.intents, cards: START.cards, missing: START.missing, who: START.who }) + "\n");
// Alte Texte, die der Heimbereich woertlich weiterfuehrt (start.json texts + texts.json Auszug)
const keep = /^(bdg_|sec$|mins$|sh_|invites$|invEmpty$|invShare$|invDelete$|wall$|wallEmpty$|wallGone$|gone$|skUndo$|saved$|share$|save$|shareText$|shareCard$|pastNone$|past$|next$|nextDay$|own$|ownH$|search|go$|go_)/;
const tx = {};
for (const l of ["de", "en"]) { tx[l] = { ...START.texts[l] }; for (const k of Object.keys(TX[l])) if (keep.test(k)) tx[l][k] = TX[l][k]; }
fs.writeFileSync(path.join(OUT, "test/fixtures/home-alt-texts.json"), JSON.stringify({ herkunft: "Altclient, Tag pre-legacy-removal, src/start.json texts + src/texts.json (Auszug)", ...tx }, null, 1) + "\n");

// ---- Golden: Rotation fuer 800 Tage je Geraeteprofil ----
const DAY = 86400000, START_DAY = Date.UTC(2026, 0, 1), N = 800;
const profiles = { web: { crypto: true, channel: false, call: false }, ohneKrypto: { crypto: false, channel: false, call: false } };
const rotation = {};
for (const [name, caps] of Object.entries(profiles)) {
  rotation[name] = { caps, ids: [] };
  for (let n = 0; n < N; n++) { const d = new Date(START_DAY + n * DAY); const i = D.ideaForDay(d, caps); rotation[name].ids.push(i ? i.id : null); }
}
// zweites Fenster weit weg (andere Runden), damit nicht nur die ersten Runden geprueft sind
const far = { start: "2031-06-01", ids: [] };
for (let n = 0; n < 200; n++) far.ids.push(D.ideaForDay(new Date(Date.UTC(2031, 5, 1) + n * DAY), profiles.web).id);
// Rundenreihenfolgen 0..3 roh (roundOrder) und erste Arten
const rounds = [0, 1, 2, 3, 300, 301].map((r) => ({ r, ids: D.roundOrder(r).map((i) => i.id) }));
// Suche (beide Sprachen, Umlaute) am 2026-11-11
const at = new Date(Date.UTC(2026, 10, 11));
const queries = ["quiz", "Rätsel", "RAETSEL", "geschenk für oma", "skat", "advent", "wichteln", "party", "x-unbekannt", "game for the class", "Bluff"];
const search = queries.map((q) => ({ q, hits: D.searchIdeas(q, at, null, profiles.web).map((h) => ({ id: h.idea.id, d: h.date ? h.date.toISOString().slice(0, 10) : null })) }));
const lastDays = D.lastDays(at, 7).map((x) => ({ key: x.key, id: x.idea.id }));
// Absicht aus einem Satz (start.js understand), Ergebnis ohne Funktionen
const sentences = ["Danke an Oma", "Termin für den Spieleabend", "Quiz über unsere Familie", "Gute Besserung Lea", "Ich will meiner Schwester Anna zum Geburtstag gratulieren", "Wichteln mit Kollegen", "Fussball gegen Papa", "Stimme wie ein Monster", "Halloween Party", "Kindergeburtstag planen", "asdf qwer"];
const intents = sentences.map((s) => { const r = S.understand(s, { date: at }); return { s, intent: r.intent, name: r.name, who: r.who, top: r.top.map((x) => ({ id: x.idea.id, exact: x.exact })), missing: r.missing }; });
const doors = ["2026-12-01", "2026-12-24", "2026-12-25", "2026-11-11"].map((d) => ({ d, n: D.doorNumber(new Date(d + "T12:00:00Z")) }));
fs.writeFileSync(path.join(OUT, "test/fixtures/home-golden.json"), JSON.stringify({ v: 1, herkunft: "Altclient, Tag pre-legacy-removal, src/daily.js + src/start.js ausgefuehrt (test/golden/gen-home.cjs)", start: "2026-01-01", days: N, rotation, far, rounds, search, lastDays, intents, doors }) + "\n");
console.log("ok: Katalog " + catalog.ideas.length + "+" + catalog.retired.length + ", Rotation " + N + " Tage x " + Object.keys(profiles).length);
