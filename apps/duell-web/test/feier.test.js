"use strict";
// biz-weihnachtsfeier (Katalog v2, V1): date poll, place poll and cost per head in one link, with sealed votes
// (src/feier.js, part turnzwei): only the organiser's device opens the answers, the end is signed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Tn = require("../src/turns.js");
const C = require("../src/core.js");
const D = require("../src/daily.js");
require("../src/office.js");
const F = require("../src/feier.js");
const TEXT = require("../src/feier.json");
const BIZ = require("../src/flavors/business/ideas.json");

const TODAY = Tn.today(new Date("2026-11-16T09:00:00Z"));   // Monday, the card's calendar day
const HIRSCH = ["Zum Hirsch", 1 | 2, 3950, 12000], BUERO = ["Bei uns im Büro", 7, 2500, 0];
const b64d = (s) => Buffer.from(s, "base64url");
let ORG = null;
const org = async () => ORG || (ORG = await F.keys());
const start = async (o) => Tn.play({ g: "feier", seed: 11, q: "", f: "star" }, F.blank(0, (o && o.dates) || F.suggest(TODAY), (o && o.places) || [HIRSCH, BUERO], (o && o.pub) || (await org()).pub), TODAY);
const vote = async (d, a, p, m) => { const r = await F.vote(Tn.moves(d), a, p, m || [0, 0, 0]); return Tn.play(d, r.move, TODAY); };
// The organiser's device: every box of every link seen, opened with the private key.
const tally = async (docs) => { const k = await org(), m = Tn.moves(docs[docs.length - 1]); let b = ""; for (const d of docs) b = F.merge(b, Tn.moves(d)[0][2][3]); return (await F.tally(k.priv.e, m[0][0], m[0][2], b)).totals; };
const end = async (d, t) => Tn.play(d, await F.close(d, Tn.moves(d), t, (await org()).priv.s), TODAY);
// Another device: a fresh copy of the module without this one's signature cache (what a receiver knows).
const fresh = () => { for (const k of Object.keys(require.cache)) if (/src\/(feier|turns|office|quest|core)\.js$/.test(k)) delete require.cache[k]; return { Tn: require("../src/turns.js"), F: (require("../src/office.js"), require("../src/feier.js")) }; };

test("Katalog: biz-weihnachtsfeier am 16.11. (Montag) als Zug-Karte, Spiel feier in der Tabelle, braucht WebCrypto, Titel de/en", () => {
  const i = BIZ.ideas.find((x) => x.id === "biz-weihnachtsfeier");
  assert.ok(i, "im Business-Katalog");
  assert.equal(i.kind, "turn"); assert.equal(i.on, "11-16"); assert.equal(i.turn.g, "feier"); assert.deepEqual(i.needs, ["crypto"]);
  assert.equal(new Date(Date.UTC(2026, 10, 16)).getUTCDay(), 1, "Montag");
  assert.equal(D.plainTitle(i.de.t), "Weihnachtsfeier planen"); assert.equal(D.plainTitle(i.en.t), "Plan the holiday party");
  assert.ok(Tn.GAMES.feier && Tn.IDS.includes("feier"), "Spiel in der Tabelle, also auch im Business-Build (scripts/build.js filtert nach GAMES)");
  for (const l of ["de", "en"]) assert.ok(i[l].s.split(/\s+/).length <= 25, "Kartentext <= 25 Woerter");
});

test("Vorschlag: drei Abende (Do/Fr, 18 Uhr) ab zwei Wochen, ohne Zufall; Anlage traegt nur die zwei oeffentlichen Schluessel", async () => {
  const s = F.suggest(TODAY);
  assert.deepEqual(s.map((x) => Tn.slotText(x, "de")), ["Do 3.12., 18 Uhr", "Fr 4.12., 18 Uhr", "Do 10.12., 18 Uhr"]);
  assert.deepEqual(F.suggest(TODAY), s, "immer dieselben");
  const k = await org();
  assert.equal(b64d(k.pub[0]).length, 32); assert.equal(b64d(k.pub[1]).length, 32);
  assert.ok(k.priv.e.d && k.priv.s.d, "private Haelften als JWK, nur fuers Geraet");
  const d = await start(); assert.ok(d, "Vorbelegung ist eine gueltige Anlage");
  assert.equal(Tn.state(d).turn, 1); assert.equal(Tn.state(d).over, false);
  const raw = JSON.stringify(Tn.unseal(d.q, d.seed));
  assert.ok(!raw.includes(k.priv.e.d) && !raw.includes(k.priv.s.d), "kein privater Schluessel im Link");
});

test("Versiegelt: im Link keine Einzelantwort, keine Summe; Diff zweier Links zeigt nur einen Block, nur die Orga oeffnet ihn", async () => {
  const k = await org(), other = await F.keys();
  const d0 = await start(), d1 = await vote(d0, [0, 1, 2], 0, [1, 0, 0]), d2 = await vote(d1, [2, 2, 0], 1, [0, 1, 1]);
  const m1 = Tn.moves(d1)[0], m2 = Tn.moves(d2)[0];
  assert.deepEqual(m2[0], m1[0]); assert.deepEqual(m2[1], m1[1], "Termine und Orte bleiben, keine Zaehler darin");
  assert.equal(m2[2][2], 2, "nur die Zahl der Antworten");
  assert.equal(m2[2][3].length, 2 * F.BOX); assert.equal(m2[2][3].slice(0, F.BOX), m1[2][3], "der neue Link haengt nur einen Block an");
  const box = m2[2][3].slice(F.BOX);
  assert.equal(b64d(box).length, 42, "32 Byte Einmal-Schluessel + 2 Byte + 8 Byte Tag");
  const kd = await crypto.subtle.importKey("jwk", k.priv.e, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const ko = await crypto.subtle.importKey("jwk", other.priv.e, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  assert.deepEqual(F.unpack(await F.open(kd, m2[2][0], box), 3), { ans: [2, 2, 0], place: 1, menu: [0, 1, 1] }, "die Orga liest die Antwort");
  assert.equal(await F.open(ko, m2[2][0], box), null, "ein anderer Schluessel nicht");
  // the same answer twice gives two different boxes (fresh ephemeral key each time)
  const a = await F.vote(Tn.moves(d1), [0, 0, 0], 0, [0, 0, 0]), b = await F.vote(Tn.moves(d1), [0, 0, 0], 0, [0, 0, 0]);
  assert.notEqual(a.box, b.box);
  for (const l of ["de", "en"]) assert.deepEqual(Tn.face(d2, l), l === "de" ? ["Antwort versiegelt – nur die Orga sieht die Summen", "2 versiegelte Antworten"] : ["Answer sealed – only the organiser sees the totals", "2 sealed answers"]);
  assert.ok(!/Zusage|Termin vorne|vegan/i.test(JSON.stringify(Tn.face(d2, "de"))));
});

test("k=5: Orga sieht unter fuenf Antworten keine Summe, ab fuenf Termine, Ort, Kosten pro Kopf und Essen; Beenden erst ab fuenf", async () => {
  let d = await start();
  for (let i = 0; i < 4; i++) d = await vote(d, [0, i % 2, 2], i === 3 ? 1 : 0, [i === 0 ? 1 : 0, 0, 1]);
  let t = await tally([d]);
  assert.deepEqual(F.lines(F.view(Tn.moves(d)[0][0], Tn.moves(d)[0][1], t), "de"), ["Noch zu wenig Stimmen: 4 von 5"]);
  assert.deepEqual(F.lines(F.view(Tn.moves(d)[0][0], Tn.moves(d)[0][1], t), "en"), ["Not enough votes yet: 4 of 5"]);
  await assert.rejects(F.close(d, Tn.moves(d), t, (await org()).priv.s), "unter K kein Ende");
  d = await vote(d, [0, 0, 0], 0, [0, 1, 0]);
  t = await tally([d]);
  assert.deepEqual(t, [5, [5, 3, 1], [0, 2, 0], [4, 1], [1, 1, 4]]);
  const l = F.lines(F.view(Tn.moves(d)[0][0], Tn.moves(d)[0][1], t), "de");
  // 3.12.: 5 yes -> leads; Zum Hirsch 4:1; 39,50 EUR + 120 EUR / 5 yes = 63,50 EUR
  assert.deepEqual(l.slice(0, 3), ["Termin vorne: Do 3.12., 18 Uhr", "Ort vorne: Zum Hirsch", "Zum Hirsch: ≈ 63,50 € pro Kopf bei 5 Zusagen, im Rahmen des Freibetrags von 110 €"]);
  assert.ok(l.includes("Essen: 1 vegetarisch, 1 vegan, 4 alkoholfrei"));
  assert.ok(F.lines(F.view(Tn.moves(d)[0][0], Tn.moves(d)[0][1], t), "en").includes("Food: 1 vegetarian, 1 vegan, 4 alcohol-free"));
});

test("Kosten pro Kopf: feste Kosten auf die Zusagen verteilt, auf ganze Cent aufgerundet; ueber dem Freibetrag wird der Betrag genannt", () => {
  assert.equal(F.perHead(["x", 0, 4500, 10000], 3), 4500 + 3334);
  assert.equal(F.perHead(["x", 0, 4500, 10000], 0), null);
  assert.equal(F.costLine(["Saal", 0, 9000, 6000], 2, "de"), "Saal: ≈ 120 € pro Kopf bei 2 Zusagen, 10 € über dem Freibetrag von 110 €");
  assert.equal(F.costLine(["Saal", 0, 11000, 0], 1, "de"), "Saal: ≈ 110 € pro Kopf bei 1 Zusage, im Rahmen des Freibetrags von 110 €");
  assert.equal(F.costLine(["Hall", 0, 9000, 6000], 2, "en"), "Hall: ≈ €120 per head with 2 yeses, €10 above the tax-free €110");
  assert.equal(F.costLine(["Saal", 0, 9000, 0], 0, "de"), "Saal: Kosten pro Kopf, sobald jemand zusagt");
});

test("Beenden: Ergebnis-Link mit Summen und Signatur, fuer jedes Geraet lesbar; danach keine Stimme mehr", async () => {
  let d = await start(); const seen = [];
  for (let i = 0; i < 6; i++) { d = await vote(d, [0, 1, 2], i % 3 ? 1 : 0, [0, 0, i % 2]); seen.push(d); }
  const c = await end(d, await tally(seen));
  assert.equal(Tn.state(c).over, true);
  const s = Tn.unseal(c.q, c.seed)[0];
  assert.equal(s[2][3], "", "keine Bloecke mehr im Ergebnis-Link"); assert.equal(s[2][4][0][0], 6);
  assert.equal(b64d(s[2][4][1]).length, 64, "ECDSA P-256 (r||s)");
  // a receiving device knows nothing yet: it checks the signature once, then reads the result
  const R = fresh(), rc = Object.assign({}, c);
  assert.equal(R.Tn.moves(rc).length, 0, "vor der Pruefung kein Ende");
  await R.F.prepare(rc);
  assert.equal(R.Tn.state(rc).over, true);
  const r = R.Tn.result(rc, "de");
  assert.equal(r.h, "Termin vorne: Do 3.12., 18 Uhr");
  assert.deepEqual(r.lines.slice(0, 3), ["Ort vorne: Bei uns im Büro", "Bei uns im Büro: ≈ 25 € pro Kopf bei 6 Zusagen, im Rahmen des Freibetrags von 110 €", "Bei uns im Büro: Stufenlos · Rollstuhl-WC · Hörschleife"]);
  assert.ok(r.lines.includes("Essen: 3 alkoholfrei") && r.lines.includes("6 Antworten"));
  assert.match(r.note, /§ 19 Abs\. 1 Nr\. 1a EStG/, "Freibetrag als Hinweis unter dem Ergebnis, nicht auf dem Bild");
  assert.equal(await vote(c, [0, 0, 0], 0), null, "nach dem Beenden keine Stimme mehr");
  assert.equal(Tn.GAMES.feier.ends({}, Tn.moves(await start()), TODAY + 30), true, "nach dem letzten Termin");
  assert.equal(Tn.GAMES.feier.ends({}, Tn.moves(await start()), F.lastDay(Tn.moves(await start()))), false, "am letzten Termin noch offen");
  assert.equal(F.daysLeft(Tn.moves(await start()), TODAY), 25, "Link verfaellt nach dem 10.12.");
  assert.equal(Tn.result(await start(), "de"), null);
});

test("Ein Ende von Hand wird abgelehnt: ohne Signatur, mit fremdem Schluessel, mit geaenderten Summen, unter K", async () => {
  let d = await start();
  for (let i = 0; i < 5; i++) d = await vote(d, [0, 0, 0], 0);
  const t = await tally([d]), good = await F.close(d, Tn.moves(d), t, (await org()).priv.s), other = await F.keys();
  const forge = async (fn) => { const R = fresh(), a = JSON.parse(JSON.stringify(good)); fn(a); const x = Object.assign({}, d, { q: Tn.seal([a], d.seed) }); await R.F.prepare(x); return R; };
  const cases = {
    "Summen geaendert": (a) => { a[2][4][0][3] = [0, 5]; },
    "ohne Signatur": (a) => { a[2][4][1] = ""; },
    "Signatur Unsinn": (a) => { a[2][4][1] = "A".repeat(86); },
    "Termine geaendert": (a) => { a[0][1] = a[0][1].slice(0, 2); a[2][4][0][1] = a[2][4][0][1].slice(0, 2); a[2][4][0][2] = a[2][4][0][2].slice(0, 2); },
  };
  for (const [name, fn] of Object.entries(cases)) {
    const R = await forge(fn), x = Object.assign({}, d, { q: Tn.seal([(() => { const a = JSON.parse(JSON.stringify(good)); fn(a); return a; })()], d.seed) });
    assert.equal(R.Tn.moves(x).length, 0, name); assert.equal(R.Tn.result(x, "de"), null, name);
  }
  // signed with a key of its own: the signature is good, but not for the key the link carries
  const own = await F.close(d, Tn.moves(d), t, other.priv.s), R = fresh(), x = Object.assign({}, d, { q: Tn.seal([own], d.seed) });
  await R.F.prepare(x); assert.equal(R.Tn.moves(x).length, 0, "fremder Schluessel");
  // as a move on top of the running poll, the same
  assert.equal(R.Tn.play(d, own, TODAY), null);
  // the genuine end opens everywhere
  const ok = fresh(), y = Object.assign({}, d, { q: Tn.seal([good], d.seed) }); await ok.F.prepare(y); assert.equal(ok.Tn.state(y).over, true);
});

test("Ein Link von Hand: zwei Bloecke auf einmal, Zaehler falsch, geaenderte Orte, Block doppelt, Barrierefreiheit offen werden abgelehnt", async () => {
  const d = await vote(await start(), [0, 1, 2], 0), m = Tn.moves(d);
  const r1 = await F.vote(m, [0, 0, 0], 0, [1, 1, 1]), r2 = await F.vote([r1.move], [0, 0, 0], 0, [1, 1, 1]);
  assert.ok(Tn.play(d, r1.move, TODAY), "ein Block: gut");
  assert.equal(Tn.play(d, r2.move, TODAY), null, "zwei Antworten in einem Zug");
  const count = JSON.parse(JSON.stringify(r1.move)); count[2][2] = 5; assert.equal(Tn.play(d, count, TODAY), null, "Zaehler springt");
  const twice = JSON.parse(JSON.stringify(r1.move)); twice[2][3] = m[0][2][3] + m[0][2][3]; assert.equal(Tn.play(d, twice, TODAY), null, "derselbe Block noch einmal");
  const moved = JSON.parse(JSON.stringify(r1.move)); moved[1] = [["Woanders", 1, 0, 0], BUERO]; assert.equal(Tn.play(d, moved, TODAY), null, "Orte bleiben, wie die Anlage sie gesetzt hat");
  const key = JSON.parse(JSON.stringify(r1.move)); key[2][0] = (await F.keys()).pub[0]; assert.equal(Tn.play(d, key, TODAY), null, "Schluessel bleibt");
  const pub = (await org()).pub, blank = { g: "feier", seed: 1, q: "", f: "star" };
  assert.equal(Tn.play(blank, F.blank(0, F.suggest(TODAY), [["A", null, 0, 0], BUERO], pub), TODAY), null, "Barrierefreiheit ist Pflicht");
  assert.equal(Tn.play(blank, F.blank(0, F.suggest(TODAY), [["Büro", 1, 0, 0], ["büro", 1, 0, 0]], pub), TODAY), null, "zwei verschiedene Orte");
  assert.equal(Tn.play(blank, F.blank(0, F.suggest(TODAY).slice(0, 1), [HIRSCH, BUERO], pub), TODAY), null, "mindestens zwei Termine");
  assert.equal(Tn.play(blank, F.blank(0, F.suggest(TODAY), [["Zum Hirsch", 1, F.MAX_PP + 1, 0], BUERO], pub), TODAY), null, "Betrag in Grenzen");
  assert.equal(Tn.play(blank, F.blank(0, F.suggest(TODAY), [HIRSCH, BUERO], [pub[0], pub[0]]), TODAY), null, "zwei verschiedene Schluessel");
  assert.equal(Tn.play(blank, F.blank(0, F.suggest(TODAY), [HIRSCH, BUERO], ["x", pub[1]]), TODAY), null, "Schluessel in Form");
  // the old plain tally (the version the review stopped) reads as no move at all
  const old = Object.assign({}, d, { q: Tn.seal([[[0, 1, 0, F.suggest(TODAY), [1, 0, 0], [0, 1, 0]], [[HIRSCH, BUERO], [1, 0]], [0, 0, 0, 0]]], d.seed) });
  assert.equal(Tn.moves(old).length, 0);
  // a box the organiser cannot open (random bytes) does not count
  const junk = JSON.parse(JSON.stringify(r1.move)); junk[2][3] = m[0][2][3] + Buffer.alloc(42, 9).toString("base64url");
  const j = Tn.play(d, junk, TODAY); assert.ok(j, "von aussen nicht zu unterscheiden");
  const k = await org(), got = await F.tally(k.priv.e, Tn.moves(j)[0][0], Tn.moves(j)[0][2], Tn.moves(j)[0][2][3]);
  assert.deepEqual([got.totals[0], got.bad], [1, 1]);
});

test("Gabelungen: zwei Personen antworten parallel auf denselben Link; die Orga fuehrt beide Links zusammen, ohne doppelt zu zaehlen", async () => {
  let d = await start();
  for (let i = 0; i < 3; i++) d = await vote(d, [0, 0, 0], 0);
  const a = await vote(d, [1, 1, 1], 1, [1, 0, 0]), b = await vote(d, [2, 2, 2], 1, [0, 1, 0]);   // the same link, two answers
  assert.equal(Tn.moves(a)[0][2][2], 4); assert.equal(Tn.moves(b)[0][2][2], 4, "jede Gabel zaehlt 4");
  const a2 = await vote(a, [0, 0, 0], 0);
  const t = await tally([a2, b, a, d]);
  assert.equal(t[0], 6, "3 + 2 auf der einen Gabel + 1 auf der anderen, ohne Doppelte");
  assert.deepEqual(t[3], [4, 2]);
  assert.equal(F.chunks(F.merge(Tn.moves(a)[0][2][3], Tn.moves(a)[0][2][3])).length, 4, "derselbe Link zweimal: nichts doppelt");
});

test("Linkgroesse: mit laengsten Namen und Firmenfarbe passt jeder Link; die aeltesten Bloecke weichen, der Zaehler laeuft weiter", async () => {
  const long = ["Ä".repeat(F.NAME), 7, F.MAX_PP, F.MAX_FIX], long2 = ["Ö".repeat(F.NAME), F.UNK, F.MAX_PP, F.MAX_FIX];
  let d = await start({ places: [long, long2] }), all = "";
  const me = { emoji: "🐙", nick: "Martina", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
  for (let i = 0; i < 12; i++) {
    d = await vote(d, [i % 3, (i + 1) % 3, 0], i % 2, [1, 1, 1]); assert.ok(d, "Antwort " + (i + 1));
    all = F.merge(all, Tn.moves(d)[0][2][3]);
    const doc = Object.assign(D.docFromIdea(D.IDEAS.find((x) => x.kind === "turn"), me, "de"), { g: "feier", q: d.q, seed: d.seed, t: "Jahresabschlussfeier planen" });
    const frag = D.docUrl(doc).split("#c=")[1];
    assert.ok(frag.length + 60 <= C.MAX_FRAGMENT, frag.length + " Zeichen");
    assert.equal(D.parseRoute("#c=" + frag).doc.q, d.q);
    assert.ok(D.parseRoute("#c=" + frag).doc.t, "der Titel bleibt im Link");
  }
  const m = Tn.moves(d)[0][2];
  assert.equal(m[2], 12); assert.ok(m[3].length / F.BOX >= 3, "mindestens drei Bloecke je Link: " + m[3].length / F.BOX);
  assert.equal((await F.tally((await org()).priv.e, Tn.moves(d)[0][0], m, all)).totals[0], 12, "die Orga hat alle, wenn sie jeden Link sieht");
});

test("Texte: de und en mit denselben Schluesseln, keine Sprachzweige und keine de|en-Paare in feier.js und feier-ui.js", () => {
  assert.deepEqual(Object.keys(TEXT.de).sort(), Object.keys(TEXT.en).sort());
  for (const l of ["de", "en"]) for (const [k, v] of Object.entries(TEXT[l])) assert.ok(String(v).trim(), l + " " + k);
  for (const f of ["feier.js", "feier-ui.js"]) {
    const s = fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
    assert.ok(!/lang\s*===?\s*["'](en|de)["']|["'](en|de)["']\s*===?\s*\w*lang/i.test(s), f + ": Sprachzweig");
    assert.ok(!/"[^"\n{}(),]*\|[^"\n{}(),]*"/.test(s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\/(?:\\.|[^/\n])+\/[gimsuy]*/g, "")), f + ": de|en-Paar");
    assert.ok(!/Math\.random|fetch\(|XMLHttpRequest|WebSocket/.test(s), f + ": kein Zufall ausser dem Seed, kein Netz");
  }
  // business wording: neutral, none of the words rule 24 rules out
  assert.ok(!/Lüge|Maulwurf|erwischt|schmuggel/i.test(JSON.stringify(TEXT.de)));
});

test("Kern: nur die Haken (Pruefung je Eingabe, Feldarten aus dem Teil, Start wartet auf den Teil); die Karte steckt im Teil turnzwei", () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  assert.match(src("src/turns.js"), /if \(p\.check\) return !!p\.check\(v, doc, m \|\| \[\], now \|\| \[\]\);/);
  assert.match(src("src/turn-ui.js"), /draw\[p\.w\] \|\| \(window\.Turn2 && window\.Turn2\.get\("widget", p\.w\)\)/);
  // the part comes from the manifest (turnzwei for these cards, malen for Mal & Rat): twoIdea() names it
  assert.match(src("src/app.js"), /window\.Parts\.need\(twoIdea\(idea\)\)/);
  assert.match(src("src/app.js"), /function twoGame\(g\) \{ var P = window\.DailyParts \|\| \{\}; for \(var n in P\) if \(P\[n\]\.g && P\[n\]\.g\.indexOf\(g\) >= 0/);
  assert.match(src("scripts/build.js"), /turnzwei: \{ d: \["katalog"\], src: \["SIEGEL", "GESCHENKE", "TURN2", "FEIERDATA", "FEIER", "FEIERUI"\] \}/);
});
