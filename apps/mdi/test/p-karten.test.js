// Strang P: Kartenvertrag, Rundreise ueber das Leitungsformat, Golden-Anzeigelisten und Alt-Orakel der Karten
// advent-tuer, zug-advent, foto-alien (+3), beat-pausenhof (+3), stimme-verzerren, zug-stimme, kanal-geheim (+6).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Ajv from "ajv";
import * as S from "../src/contract/session.js";
import { rng } from "../src/contract/sdk.js";
import { paramsForLink, defaults } from "../src/contract/fields.js";
import { checkCardSource } from "../scripts/harness.js";
import advent from "../src/cards/advent-tuer/card.js";
import zugAdvent, { doorText, openDoors } from "../src/cards/zug-advent/card.js";
import foto from "../src/cards/foto-alien/card.js";
import beat, { beatPeaks } from "../src/cards/beat-pausenhof/card.js";
import stimme from "../src/cards/stimme-verzerren/card.js";
import zugStimme, { figure, figureCards, right } from "../src/cards/zug-stimme/card.js";
import kanal, { glyphs } from "../src/cards/kanal-geheim/card.js";

const CARDS = { "advent-tuer": advent, "zug-advent": zugAdvent, "foto-alien": foto, "beat-pausenhof": beat, "stimme-verzerren": stimme, "zug-stimme": zugStimme, "kanal-geheim": kanal };
const fx = (f) => JSON.parse(fs.readFileSync(new URL("./fixtures/" + f, import.meta.url), "utf8"));
const day = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);
const J = (x) => JSON.parse(JSON.stringify(x));
const walk = (n, f) => { if (!n || typeof n !== "object") return; f(n); for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach((c) => walk(c, f)); else if (v && typeof v === "object") walk(v, f); };
const find = (n, t) => { const out = []; walk(n, (x) => { if (x.t === t) out.push(x); }); return out; };
const play = (card, params, inputs, seed = "s-p") => { let s = S.newSession(card, { params, seed, mine: [0, 1] }); for (const x of inputs) s = S.apply(card, s, x); return s; };
const rt = (card, s) => S.fromWire(card, J(S.toWire(s, card)), { mine: [1] }); // Rundreise wie im Link

test("Manifeste: Schema v0.2 (ohne Editor-Zusatzschluessel), Varianten mit gueltigen Parametern, Harness fuer Karte und Engines", () => {
  const ajv = new Ajv({ strict: false, allErrors: true }), schema = JSON.parse(fs.readFileSync(new URL("../src/schema/manifest.schema.json", import.meta.url), "utf8"));
  const v = ajv.compile(schema);
  for (const [id, c] of Object.entries(CARDS)) {
    assert.ok(v(c.manifest), id + ": " + JSON.stringify(v.errors));
    assert.equal(c.manifest.id, id);
    const pv = ajv.compile(c.manifest.params), d = defaults(c.manifest.params);
    assert.ok(pv(d), id + " Standardwerte: " + JSON.stringify(pv.errors));
    for (const va of c.manifest.variants || []) assert.ok(pv({ ...d, ...va.params }), id + "/" + va.id + ": " + JSON.stringify(pv.errors));
    const file = "src/cards/" + id + "/card.js";
    assert.deepEqual(checkCardSource(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), { file }), [], id + " Harness");
  }
  for (const f of ["poster/compile.js", "poster/doc.js", "poster/card.js", "poster/noto.js", "poster/door.js", "poster/trig.js", "quest/quest.js", "quest/sync.js", "text/filter.js"]) {
    const file = "src/engines/" + f;
    assert.deepEqual(checkCardSource(fs.readFileSync(new URL("../" + file, import.meta.url), "utf8"), { file }), [], file);
  }
  const ids = Object.values(CARDS).flatMap((c) => [c.manifest.id, ...(c.manifest.variants || []).map((x) => x.id), ...(c.manifest.legacy || [])]);
  for (const want of ["foto-tour", "foto-haustier", "foto-essen", "beat-boss", "plan-05", "plan-12", "kanal-link", "kanal-drei", "kanal-kennst", "kanal-staffel", "kanal-erfinder", "raum-tunnel", "anruf-quiz", "anruf-stimme", "plan-30", "stimme-monster", "stimme-maus", "stimme-robo"]) assert.ok(ids.includes(want), "Variante/Alias " + want);
  assert.equal(new Set(ids).size, ids.length, "keine id doppelt");
});

// ---------- advent-tuer ----------
const advP = defaults(advent.manifest.params);
test("advent-tuer: Nummer aus dem Datum (UTC) beim Absenden eingefroren, Name der Absenderin, 16:9", () => {
  assert.equal(advent.stamp(advP, { today: day(2026, 12, 5), nick: "Oma" }).nr, 5);
  assert.equal(advent.stamp(advP, { today: day(2026, 11, 11) }).nr, 1, "11.11. = Tuer 1 (Screenshot [61])");
  assert.equal(advent.stamp(advP, { today: day(2026, 12, 25) }).nr, 1);
  assert.equal(advent.stamp({ ...advP, nr: 9 }, { today: day(2026, 12, 5) }).nr, 9, "einmal gesetzt bleibt sie");
  assert.equal(advent.stamp(advP, { today: day(2026, 12, 1), nick: "<b>Lea" }).n, "bLea");
  const v = advent.view(advent.observe(advent.init({ params: advent.stamp(advP, { today: day(2026, 12, 5) }) }), 0), 0, { lang: "de" });
  assert.equal(v.ratio, "16:9"); assert.equal(find(v, "canvas")[0].w / find(v, "canvas")[0].h, 16 / 9);
  assert.equal(find(v, "door").length, 0, "Editor: offen");
});
test("advent-tuer: Empfaenger sieht die Tuer zu (Tippen zum Oeffnen), nie gesperrt; zu frueh sagt nur den Tag", () => {
  const p = advent.stamp({ ...advP, x: "Heute kein Stress. Nur Kekse." }, { today: day(2026, 12, 5), nick: "Oma" });
  const v = advent.view(advent.observe(advent.init({ params: p }), 0), 0, { lang: "de", receive: true, today: day(2026, 12, 3) });
  const door = find(v, "door")[0];
  assert.equal(door.closed, true); assert.equal(door.label, "Türchen 5 öffnen"); assert.equal(door.hint, "Tippen zum Öffnen");
  assert.equal(find(door, "canvas").length, 1, "dahinter das Bild");
  const texts = find(v, "text").map((x) => x.text);
  assert.ok(texts.includes("Von Oma")); assert.ok(texts.includes("Gedacht für den 5. Dezember."));
  const late = advent.view(advent.observe(advent.init({ params: p }), 0), 0, { lang: "en", receive: true, today: day(2026, 12, 7) });
  assert.ok(!find(late, "text").some((x) => /December/.test(x.text)), "am oder nach dem Tag kein Hinweis");
  assert.equal(find(late, "door")[0].label, "Open door 5");
});
test("advent-tuer: eigenes Foto bleibt lokal (nur mit ausdruecklicher Wahl im Link), KI-Bild reist als Referenz, Wetter als Zahlen", () => {
  const p = { ...advP, photo: "slot:photo", gi: { p: "A".repeat(22) + ".jpg" }, w: { p: "Hamburg", d: "2026-12-03", hi: 4, lo: -1, rn: 60, c: 61 } };
  const link = paramsForLink(advent.manifest.params, p);
  assert.ok(!("photo" in link), "Foto nicht im Link");
  assert.ok("photo" in paramsForLink(advent.manifest.params, p, { withLocalMedia: true }), "nur auf ausdrueckliche Wahl");
  assert.deepEqual(link.gi, p.gi); assert.deepEqual(link.w, p.w);
  const c = find(advent.view(advent.observe(advent.init({ params: { ...p, nr: 3 } }), 0), 0, {}), "canvas")[0];
  assert.deepEqual(c.src.photo, { kind: "local", slot: "photo" }); assert.deepEqual(c.src.gi, { kind: "server", ref: p.gi.p });
  assert.ok(c.ops2d.some((o) => o.op === "image" && o.a[0] === "photo"), "eigenes Foto vor KI-Bild im Feld");
  assert.ok(c.ops2d.some((o) => o.m === "fillText" && /open-meteo/.test(o.a[0])), "Quelle steht drauf");
});

// ---------- zug-advent ----------
const LINES = Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? "" : "Satz " + (i + 1)));
test("zug-advent: Sitz 0 schreibt 24 Saetze, leere bekommen den festen Satz; Link-Rundreise; Tueren nach UTC-Datum", () => {
  let s = play(zugAdvent, {}, []);
  assert.equal(S.status(zugAdvent, s).turn, 0);
  s = S.apply(zugAdvent, s, { t: "write", seat: 0, a: LINES });
  assert.equal(S.status(zugAdvent, s).over, true);
  const back = rt(zugAdvent, s);
  assert.deepEqual(back.state.pub, s.state.pub, "Rundreise ueber toWire/fromWire");
  const v = zugAdvent.view(zugAdvent.observe(back.state, 1), 1, { lang: "de", today: day(2026, 12, 5) });
  const doors = find(v, "doors")[0];
  assert.equal(doors.open, 5); assert.equal(doors.texts.length, 24);
  assert.equal(doors.texts[0], "Heute ist ein guter Tag."); assert.equal(doors.texts[1], "Satz 2"); assert.equal(doors.texts[3], "Noch ein paar Tage!", "fester Satz i % 5");
  assert.equal(doorText(null, 23, "en"), "Only a few days left!");
  assert.deepEqual([day(2026, 11, 30), day(2026, 12, 1), day(2026, 12, 24), day(2026, 12, 31), day(2027, 1, 15), day(2027, 2, 1)].map(openDoors), [0, 1, 24, 24, 24, 0]);
});
test("zug-advent: Filter, Laenge und Anzahl werden geprueft; nur Sitz 0 schreibt", () => {
  const s = play(zugAdvent, {}, []);
  assert.throws(() => S.apply(zugAdvent, s, { t: "write", seat: 0, a: LINES.slice(0, 23) }));
  assert.throws(() => S.apply(zugAdvent, s, { t: "write", seat: 0, a: LINES.map((l, i) => (i === 2 ? "ruf an 0171 2345678" : l)) }), /zug-ungueltig/);
  assert.throws(() => S.apply(zugAdvent, s, { t: "write", seat: 0, a: LINES.map((l, i) => (i === 2 ? "x".repeat(21) : l)) }));
  assert.throws(() => S.apply(zugAdvent, s, { t: "write", seat: 1, a: LINES }), /nicht-am-zug/);
  const w = zugAdvent.view(zugAdvent.observe(s.state, 0), 0, { lang: "de" });
  assert.equal(find(w, "list")[0].n, 24); assert.equal(find(w, "list")[0].max, 20);
});

// ---------- foto-alien ----------
test("foto-alien: Foto nie im Link und nie beim Empfaenger; Varianten tragen Text und Stil aus dem Katalog", () => {
  const p = { ...defaults(foto.manifest.params), photo: "slot:photo" };
  assert.ok(!("photo" in paramsForLink(foto.manifest.params, p)));
  const mine = find(foto.view(foto.observe(foto.init({ params: p }), 0), 0, {}), "canvas")[0];
  const theirs = find(foto.view(foto.observe(foto.init({ params: p }), 0), 0, { receive: true }), "canvas")[0];
  assert.ok(mine.ops2d.some((o) => o.op === "photo")); assert.ok(!theirs.ops2d.some((o) => o.op === "photo")); assert.equal(theirs.src.photo, undefined);
  const by = Object.fromEntries(foto.manifest.variants.map((v) => [v.id, v.params]));
  assert.deepEqual([by["foto-tour"].st, by["foto-haustier"].st, by["foto-essen"].st, defaults(foto.manifest.params).st], ["poster", "meme", "sticker", "glitch"]);
});

// ---------- Klang ----------
test("beat-pausenhof: Muster und Tempo im Link, Ton auf dem Geraet; Varianten mit eigenem Muster; Welle aus dem Takt", () => {
  const p = defaults(beat.manifest.params), v = beat.view(beat.observe(beat.init({ params: p }), 0), 0, { lang: "de" });
  assert.deepEqual(find(v, "audio")[0].src, { kind: "beat", p: p.p, bpm: 100, loops: 2 });
  assert.equal(beatPeaks(p.p, 100).length, 40);
  assert.ok(find(v, "canvas")[0].ops2d.some((o) => o.op === "wave" && o.peaks.length === 40));
  assert.ok(find(v, "canvas")[0].ops2d.some((o) => o.m === "fillText" && o.a[0] === "100 BPM"));
  const boss = beat.manifest.variants.find((x) => x.id === "beat-boss").params;
  assert.equal(boss.bpm, 150); assert.equal(boss.p.h, "xxxxxxxxxxxxxxxx");
  assert.deepEqual(Object.keys(paramsForLink(beat.manifest.params, p)).sort(), ["bpm", "p", "pair", "sk", "x"]);
});
test("stimme-verzerren: Link traegt nur Effekt, Tempo, Text und Farbe; Aufnahme bleibt im Slot; Antworten mit eigener Stimme", () => {
  const p = defaults(stimme.manifest.params);
  assert.deepEqual(Object.keys(paramsForLink(stimme.manifest.params, { ...p, pcm: [1, 2], audio: "data:" })).sort(), ["fx", "pair", "tp", "x"]);
  const v = stimme.view(stimme.observe(stimme.init({ params: { ...p, tp: "slow" } }), 0), 0, { lang: "de", receive: true });
  assert.deepEqual(find(v, "audio")[0].src, { kind: "local", slot: "voice", fx: "monster", tp: "slow", fallback: "dummy" });
  assert.equal(find(v, "record")[0].label, "Antworten"); assert.equal(find(v, "record")[0].ms, 10000);
  assert.deepEqual(stimme.manifest.variants.map((x) => [x.id, x.params.fx]), [["stimme-monster", "monster"], ["stimme-maus", "chip"], ["stimme-robo", "robot"]], "alt MOVED");
});
test("zug-stimme: Alt-Orakel Figuren und Karten aus dem Seed; Einladen, Rolle, fuenf Runden; Sprecher hat 0 Treffer", () => {
  for (const c of fx("turns-p-alt.json").stimme) c.rounds.forEach((r, i) => {
    assert.equal(figure(c.seed, i), r.figure); assert.deepEqual(figureCards(c.seed, i), r.cards); assert.equal(figureCards(c.seed, i)[right(c.seed, i)], r.figure);
  });
  let s = play(zugStimme, {}, [{ t: "call", seat: 0 }]);
  s = rt(zugStimme, s);
  const v = zugStimme.view(zugStimme.observe(s.state, 1), 1, { lang: "de", draft: { role: 1 } });
  const w = find(v, "voices")[0];
  assert.equal(w.rounds, 5); assert.equal(w.data.length, 5); assert.ok(w.data.every((r) => r.options.length === 6 && r.options[r.right] === r.figure));
  assert.throws(() => S.apply(zugStimme, s, { t: "play", seat: 1, r: 0, a: 3 }), /zug-ungueltig/, "wer spricht, hat keine Treffer");
  const end = S.apply(zugStimme, s, { t: "play", seat: 1, r: 1, a: 4 });
  assert.equal(find(zugStimme.view(zugStimme.observe(end.state, 1), 1, { lang: "de" }), "text")[0].text, "4 von 5 Stimmen erkannt");
});

// ---------- kanal-geheim ----------
const DRAFT = { n: 2, q0: "Was war unser bester Tag?", a0: "Ostsee", q1: "Welches Lied läuft dazu?", a1: "Atemlos", end: "Alle drei auf. Respekt." };
test("kanal-geheim: prepare versiegelt, die Antworten stehen nirgends im Log; Schloss fuer Schloss, Tipp nach zwei Fehlern", () => {
  const params = defaults(kanal.manifest.params);
  let s = S.newSession(kanal, { params, seed: "seed-128bit-xyz", mine: [0, 1] });
  const input = kanal.prepare(DRAFT, { seed: s.seed, seat: 0 });
  assert.deepEqual(kanal.prepare(DRAFT, { seed: s.seed, seat: 0 }), input, "deterministisch");
  s = S.apply(kanal, s, input);
  const wire = JSON.stringify(S.toWire(s, kanal));
  assert.ok(!/ostsee|atemlos/i.test(wire), "keine Antwort im Leitungsformat");
  s = rt(kanal, s);
  s = S.apply(kanal, s, { t: "answer", seat: 1, a: "Nordsee" });
  s = S.apply(kanal, s, { t: "answer", seat: 1, a: "Elbe" });
  const tipv = kanal.view(kanal.observe(s.state, 1), 1, { lang: "de" });
  assert.ok(find(tipv, "text").some((x) => x.text === "Tipp: fängt mit O an, 6 Zeichen"));
  s = S.apply(kanal, s, { t: "answer", seat: 1, a: " ostsee " });
  assert.equal(s.state.pub.q, "Welches Lied läuft dazu?"); assert.equal(s.state.pub.miss, 0);
  s = S.apply(kanal, s, { t: "answer", seat: 1, a: "ATEMLOS" });
  assert.deepEqual(s.state.pub.end, { ok: true, text: "Alle drei auf. Respekt." }); assert.equal(S.status(kanal, s).over, true); assert.equal(S.status(kanal, s).local, true);
});
test("kanal-geheim: ein mit dem Altcode versiegelter Link laesst sich im neuen Vertrag aufschliessen", () => {
  const A = fx("quest-alt.json");
  let s = S.newSession(kanal, { params: defaults(kanal.manifest.params), seed: "x", mine: [0, 1] });
  s = S.apply(kanal, s, { t: "seal", seat: 0, a: A.sealed });
  for (const a of A.draft.stops.map((x) => x.a)) s = S.apply(kanal, s, { t: "answer", seat: 1, a });
  assert.deepEqual(s.state.pub.end, { ok: true, text: A.draft.end });
});
test("kanal-geheim: unvollstaendiger Entwurf wird nicht versiegelt; Treffpunkte bleiben draussen; raum-tunnel = Alt-Geheimschrift", () => {
  assert.throws(() => kanal.prepare({ n: 1, q0: "Frage?", a0: "x", end: "Ende" }, { seed: "s", seat: 0 }), /unvollstaendig/);
  assert.throws(() => kanal.prepare({ n: 1, q0: "Treffpunkt am Bahnhof?", a0: "Gleis", end: "Ende" }, { seed: "s", seat: 0 }), /unvollstaendig/);
  for (const c of fx("turns-p-alt.json").tunnel) assert.deepEqual(glyphs(c.word), c.glyphs, c.word);
  const tp = { ...defaults(kanal.manifest.params), mode: "tunnel" };
  const s = play(kanal, tp, [{ t: "word", seat: 0, a: "Otter" }]);
  const lines = find(kanal.view(kanal.observe(s.state, 0), 0, { lang: "de" }), "text").map((x) => x.text);
  assert.equal(lines.filter((l) => /^[A-Z] /.test(l)).length, 13);
  assert.throws(() => play(kanal, tp, [{ t: "word", seat: 0, a: "zwei Worte" }]));
});

// ---------- Golden: Anzeigelisten ----------
test("Golden: Anzeigelisten aller Karten (Editor und Empfang) bleiben stabil", () => {
  const url = new URL("./fixtures/p-karten-golden.json", import.meta.url);
  const ctx = { lang: "de", today: day(2026, 12, 3), nick: "Ada" };
  const one = (c, params, extra = {}) => { const s = S.newSession(c, { params, seed: "golden", mine: [0, 1] }); return c.view(c.observe(s.state, 0), 0, { ...ctx, ...extra }); };
  const cases = {};
  cases["advent-tuer"] = one(advent, advent.stamp(advP, { today: day(2026, 12, 5), nick: "Oma" }));
  cases["advent-tuer-empfang"] = one(advent, advent.stamp(advP, { today: day(2026, 12, 5), nick: "Oma" }), { receive: true });
  for (const v of foto.manifest.variants) cases[v.id] = one(foto, { ...defaults(foto.manifest.params), ...v.params });
  cases["foto-alien"] = one(foto, defaults(foto.manifest.params));
  for (const v of beat.manifest.variants) cases[v.id] = one(beat, { ...defaults(beat.manifest.params), ...v.params });
  cases["beat-pausenhof"] = one(beat, defaults(beat.manifest.params));
  cases["stimme-verzerren"] = one(stimme, defaults(stimme.manifest.params));
  cases["zug-advent-schreiben"] = one(zugAdvent, {});
  cases["zug-stimme"] = one(zugStimme, {});
  cases["kanal-geheim"] = one(kanal, defaults(kanal.manifest.params));
  const herkunft = "Neu (Strang P): eingefrorene Anzeigelisten der Karten; neu erzeugen mit UPDATE_GOLDEN=1, Abweichung im PR begruenden.";
  if (process.env.UPDATE_GOLDEN || !fs.existsSync(url)) fs.writeFileSync(url, JSON.stringify({ herkunft, cases }) + "\n");
  const want = JSON.parse(fs.readFileSync(url, "utf8")).cases;
  for (const k of Object.keys(cases)) assert.deepEqual(J(cases[k]), want[k], k);
});
