// Portierte Alt-Tests (alt test/quizpack.test.js, quizpack-abstand.test.js, quizspiele.test.js – regelrelevante Fälle)
// für die Quiz-Engine und die Karten zug-abfragen (+ zug-quiz), zug-typen und quiz-preis (+ raum-schaetzen). Statt der
// alten Doc-Links läuft jede Partie über den Vertrag (src/contract/session.js) und das Drahtformat toWire/fromWire.
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/contract/session.js";
import * as P from "../src/engines/quiz/pack.js";
import * as M from "../src/engines/quiz/make.js";
import * as R from "../src/engines/quiz/preis.js";
import * as AI from "../src/engines/quiz/ai.js";
import { isClean } from "../src/engines/quiz/clean.js";
import J from "../src/engines/quiz/quiz-packs.json" with { type: "json" };
import QJ from "../src/engines/quiz/quizspiele.json" with { type: "json" };
import abfragen from "../src/cards/zug-abfragen/card.js";
import typen from "../src/cards/zug-typen/card.js";
import preis from "../src/cards/quiz-preis/card.js";

// Was der Server für kind quiz schickt (CADS-DEMO-wrapper lib/duell-ai.mjs), Lernen und Gruppe – wie im Alt-Test.
const LEARN = { modus: "lernen", titel: "Planeten", fragen: [
  { f: "Wie viele Planeten hat das Sonnensystem?", a: "8", d: ["9", "7", "10"], quelle_im_text: true },
  { f: "Welcher Planet ist der größte?", a: "Jupiter", d: ["Saturn", "Erde"], quelle_im_text: false },
  { f: "Wie heißt der rote Planet?", a: "Mars", d: ["Venus", "Merkur", "Pluto"], quelle_im_text: true },
  { f: "Wie viele Monde hat der Mars?", a: "2", d: ["0", "1", "4"], quelle_im_text: true },
  { f: "Wie viele Tage hat ein Jahr?", a: "365", d: ["360", "366", "300"], quelle_im_text: false }] };
const GROUP = { modus: "gruppe", titel: "Wer von uns ist …?", typen: [{ name: "Planerin", staerke: "Du behältst den Überblick." }, { name: "Motor", staerke: "Du steckst alle an." }],
  fragen: [{ f: "Zeltlager: was zuerst?", antworten: [{ t: "Plan", typ: 0 }, { t: "Zelt", typ: 1 }] }, { f: "Regen?", antworten: [{ t: "Spiele", typ: 1 }, { t: "Liste", typ: 0 }] }, { f: "Abends?", antworten: [{ t: "Lagerfeuer", typ: 1 }, { t: "Morgen planen", typ: 0 }] }] };
const RAD = { t: "Meine Radtour", m: "l", q: [["Wie viele km bin ich geradelt?"], ["Wie viele Pausen habe ich gemacht?"], ["Wie viele Höhenmeter waren es?"]], z: [42, 3, 350], u: ["km", "", "m"] };

const SEED = (n) => n.toString(16).padStart(32, "0");
const base = (card, p) => ({ ...Object.fromEntries(Object.entries(card.manifest.params.properties).map(([k, v]) => [k, structuredClone(v.default)])), ...p });
function game(card, params, n = 77) { return S.newSession(card, { params: base(card, params), seed: SEED(n), mine: [0, 1] }); }

// Schieber und Freitext lassen sich nicht aufzählen. Die Karten exportieren accepts(obs, seat, input) – der Hook, den
// session.apply nach Absprache mit Strang F nutzen soll. Solange session.apply nur moves() kennt, wendet APPLY solche
// Eingaben mit derselben Prüfreihenfolge an (Status, Sitz, accepts, step, Zustandsgrenze, Log). Sobald der Vertrag den
// Hook hat, läuft alles über S.apply (Erkennung unten), ohne Änderung an diesem Test.
const HOOK = (() => { try { const s = game(preis, {}); S.apply(preis, s, { t: "guess", seat: 0, v: 5 }); return true; } catch (e) { return false; } })();
function APPLY(card, s, input) {
  if (HOOK || card.moves(card.observe(s.state, input.seat), input.seat).length) return S.apply(card, s, input);
  const st = card.status(s.state);
  if (st.over) throw new S.GameError("vorbei");
  if (input.seat !== st.turn) throw new S.GameError("nicht-am-zug", "Sitz " + input.seat);
  if (!card.accepts(card.observe(s.state, input.seat), input.seat, input)) throw new S.GameError("zug-ungueltig", JSON.stringify(input));
  const next = card.step(s.state, input);
  if (JSON.stringify(next).length > card.manifest.limits.stateBytes) throw new S.GameError("zustand-zu-gross");
  return { ...s, state: next, log: s.log.concat([input]) };
}
/** über das Drahtformat (JSON) und zurück: jede Eingabe wird erneut geprüft */
function through(card, s) {
  const w = JSON.parse(JSON.stringify(S.toWire(s)));
  if (HOOK) return S.fromWire(card, w, { mine: [0, 1] });
  let x = S.newSession(card, { params: w.p, seed: w.s, mine: [0, 1], commits: w.k });
  for (const input of w.m) x = APPLY(card, x, input);
  return x;
}
/** Eingabe wie der Bildschirm sie gibt: Zeigen bestätigen, erste Wahl, Schieber in der Mitte (alt test first) */
function firstInput(card, s) {
  const st = S.status(card, s), obs = S.observe(card, s, st.turn), mv = card.moves(obs, st.turn);
  if (mv.length) return mv[0];
  const v = card.view(obs, st.turn, { lang: "de" }).children.find((k) => k.t === "slide");
  return { t: "guess", seat: st.turn, v: Math.floor(v.max / 2) };
}
function playTurn(card, s, inputs) {
  const t = s.state.pub.m.length;
  for (const x of inputs) s = APPLY(card, s, x);
  assert.equal(s.state.pub.m.length, t + 1, "Zug vollständig");
  return through(card, s);
}
function turnWith(card, s, f) { const t = s.state.pub.m.length; while (s.state.pub.m.length === t) s = APPLY(card, s, f(card, s)); return through(card, s); }
const res = (card, s, lang = "de") => card.result(s.state.pub, lang);

test("Paket aus der KI-Antwort: Texte gefiltert, Zahlen nur als Ziffern-Antwort, Gruppen nur mit Stärken", () => {
  const pk = M.fromOption(LEARN);
  assert.equal(pk.m, "l"); assert.equal(pk.q.length, 5);
  assert.deepEqual(pk.z, [8, 0, 0, 2, 365], "Schätzen nimmt nur ganze Zahlen, die so in der Antwort stehen");
  assert.equal(P.whole("1.000"), 1000); assert.equal(P.whole("ca. 8"), 0); assert.equal(P.whole("8 km"), 0); assert.equal(P.whole("1"), 0);
  for (const x of ["007", "0 100", "01.000", "00"]) assert.equal(P.whole(x), 0, x);
  assert.equal(P.whole("10"), 10); assert.equal(P.whole("100.000"), 100000);
  const g = M.fromOption(GROUP);
  assert.equal(g.m, "g"); assert.deepEqual(g.y[0], ["Planerin", "Du behältst den Überblick."]);
  const bad = M.fromOption({ ...GROUP, fragen: GROUP.fragen.concat([{ f: "Extra?", antworten: [{ t: "A", typ: 9 }, { t: "B", typ: 0 }] }]) });
  assert.equal(bad.q.length, 3);
  assert.equal(M.fromOption({ modus: "lernen", titel: "x", fragen: LEARN.fragen.slice(0, 2) }), null, "unter 3 Fragen kein Paket");
  assert.equal(P.sanitize({ t: "Scheiße", m: "l", q: M.fromOption(LEARN).q }), null, "Titel durch die Wortliste");
  assert.equal(P.sanitize({ t: "Ok", m: "l", q: [["Was?", "<b>x</b>", "y", "z"], ["Wo?", "https://x.de", "a", "b"], ["Wer?", "Ana", "Ana", "Ben"]] }), null, "Link, Doppel, nichts mehr übrig");
});

test("Karten mit Paket: Frag mich ab (Karteikarte), Quiz (alle Antworten gemischt), Schätzen (nur Zahlenfragen); Ergebnis mit beiden Ständen", () => {
  const pk = M.fromOption(LEARN);
  const cases = [[abfragen, { variante: "abfragen", pk }, "abfragen"], [abfragen, { variante: "quiz", pk }, "quiz"], [preis, { variante: "schaetzen", pk }, "schaetzen"]];
  for (const [card, params, g] of cases) {
    let s = through(card, game(card, params));
    assert.deepEqual(s.state.pub.pk, pk, g + " behält das Paket im Link");
    const obs = S.observe(card, s, 0), v = card.view(obs, 0, { lang: "de" });
    if (g === "abfragen") { assert.deepEqual(card.moves(obs, 0), [{ t: "ok", seat: 0 }], "Karteikarte: erst die Frage"); assert.equal(v.children.find((k) => k.t === "choice").label, "Denk an die Antwort."); }
    if (g === "quiz") assert.deepEqual(v.children.find((k) => k.t === "choice").options.map((o) => o.label).sort(), pk.q[0].slice(1).sort(), "alle Antworten gemischt");
    if (g === "schaetzen") assert.equal(v.children.find((k) => k.t === "slide").label, "Schieb auf deine Schätzung.");
    s = turnWith(card, s, firstInput); s = turnWith(card, s, firstInput);
    assert.equal(S.status(card, s).over, true, g);
    const r = res(card, s), e = res(card, s, "en");
    assert.equal(r.h, "Planeten");
    assert.match(r.lines[0], g === "schaetzen" ? /^Spieler 1: (Alles genau getroffen!|Ganz nah dran\.|Gut geschätzt\.|Da war noch Luft\. Revanche\?)$/ : /^Spieler 1: \d von 5 richtig$/, g);
    if (g === "schaetzen") assert.ok(r.lines.length === 5 && !/%|Prozent|percent/.test(JSON.stringify([r, e])), JSON.stringify(r));
    assert.ok(!/undefined|\{\w+\}/.test(JSON.stringify([r, e])), g);
  }
});

test("Gleiche Reihenfolge auf beiden Handys, nur aus dem Seed; Schätzen-Regler verrät die Zahl nicht", () => {
  const pk = M.fromOption(LEARN), doc = (g, seed) => ({ seed, pk, g });
  const a = game(abfragen, { variante: "quiz", pk }, 5), b = through(abfragen, a);
  for (let i = 0; i < 5; i++) assert.deepEqual(P.choices(a.state.pub, i), P.choices(b.state.pub, i));
  assert.equal(P.choices(doc("quiz", 5), 0)[P.rightAt(doc("quiz", 5), 0)], "8");
  const seen = new Set();
  for (let s = 1; s < 60; s++) { const top = P.top(doc("schaetzen", s), 0); assert.ok(Number.isInteger(top) && top > 8 && top <= 45, "Ende: " + top); seen.add(top); }
  assert.ok(seen.size >= 2, "das Ende wechselt mit dem Seed");
  for (const z of [2, 7, 24, 206, 4000, 999999]) {
    const pz = { ...pk, z: [z, 0, 0, 2, 365] }, at = [];
    for (let s = 1; s < 400; s++) { const top = P.top({ seed: s, pk: pz }, 0); assert.ok(top > z, z + " " + top); at.push(z / top); }
    at.sort((x, y) => x - y);
    const below = at.filter((x) => x < 0.5).length / at.length;
    assert.ok(below > 0.3 && below < 0.7, z + ": unter der Mitte " + below.toFixed(2));
    assert.ok(at[0] > 0.15 && at[at.length - 1] < 0.85, z + ": " + at[0].toFixed(2) + ".." + at[at.length - 1].toFixed(2));
  }
  const d = doc("quiz", 9), right = [0, 1, 2, 3, 4].map((i) => [P.rightAt(d, i)]);
  const sc = P.score(d, "quiz", right); assert.equal(sc.ok, 5); assert.deepEqual(sc.open, []);
  const knew = []; for (let i = 0; i < 5; i++) knew.push(0, [i === 2 ? 1 : 0]);
  const sa = P.score(doc("abfragen", 9), "abfragen", knew); assert.equal(sa.ok, 4); assert.deepEqual(sa.open, [pk.q[2][0] + " → " + pk.q[2][1]]);
});

test("Team-Quiz und Typen: jede Person spielt allein, kein Ergebnis kommt zurück, keine Rangliste, Typen nur Stärken", () => {
  const firma = P.sanitize({ ...M.fromOption(LEARN), m: "f" });
  let s = game(abfragen, { variante: "quiz", pk: firma });
  assert.deepEqual(abfragen.moves(S.observe(abfragen, s, 0), 0), [{ t: "ok", seat: 0 }], "wer es macht, sendet nur");
  s = playTurn(abfragen, s, [{ t: "ok", seat: 0 }]);
  const d = s.state.pub;
  for (let i = 0; i < 5; i++) s = APPLY(abfragen, s, { t: "pick", seat: 1, v: i === 0 ? P.rightAt(d, 0) : 0 });
  const v = abfragen.view(S.observe(abfragen, s, 1), 1, { lang: "de" }), texts = v.children.filter((k) => k.t === "text").map((k) => k.text);
  assert.ok(texts.some((x) => /^Du: \d von 5 richtig$/.test(x)), JSON.stringify(texts));
  assert.ok(texts.includes("Nur du siehst dein Ergebnis. Es gibt keine Rangliste."));
  assert.ok(!texts.some((x) => /Spieler/.test(x)), "keine Namen, kein Vergleich");
  s = APPLY(abfragen, s, { t: "ok", seat: 1 });
  assert.equal(S.status(abfragen, s).over, true);
  assert.deepEqual(res(abfragen, s).lines, ["Nur du siehst dein Ergebnis. Es gibt keine Rangliste."]);

  let g = game(typen, { paket: "", pk: M.fromOption(GROUP) });
  g = playTurn(typen, g, [{ t: "ok", seat: 0 }]);
  const ans = [0, 1, 0];
  let g1 = g; for (const k of ans) g1 = APPLY(typen, g1, { t: "pick", seat: 1, v: k });
  const show = (x) => typen.view(S.observe(typen, x, 1), 1, { lang: "de" }).children.filter((k) => k.t === "text").map((k) => k.text);
  const t1 = show(g1), t2 = show(through(typen, g1));
  assert.deepEqual(t1, t2);
  assert.ok(t1.some((x) => /^Du bist: (Planerin|Motor)$/.test(x)), JSON.stringify(t1));
  assert.ok(t1.includes("Jede Stärke zählt. Niemand wird verglichen."));
  // ohne Paket haben Team- und Typen-Quiz keinen gültigen Zug
  const none = game(abfragen, { variante: "quiz" });
  assert.deepEqual(abfragen.moves(S.observe(abfragen, none, 0), 0), []);
  assert.throws(() => APPLY(abfragen, none, { t: "ok", seat: 0 }));
  assert.equal(abfragen.view(S.observe(abfragen, none, 0), 0, { lang: "de" }).children[0].text, "Erst ein Fragenpaket wählen.");
  const tnone = game(typen, { paket: "" });
  assert.throws(() => APPLY(typen, tnone, { t: "ok", seat: 0 }));
  // ein Gruppenpaket passt nie auf eine Lernkarte und umgekehrt: abgelehnt, nicht still verworfen
  assert.equal(P.fits("luecke", M.fromOption(GROUP)), false); assert.equal(P.fits("typen", M.fromOption(LEARN)), false);
  assert.throws(() => game(abfragen, { variante: "quiz", pk: M.fromOption(GROUP) }), /Fragepaket/);
  assert.throws(() => game(typen, { pk: M.fromOption(LEARN) }), /Fragepaket/);
});

test("Frag mich ab ohne Paket: vier eigene Lernkarten je Person, ehrlich 'gewusst', Lernstand mit Offenem", () => {
  let s = game(abfragen, {});
  const q0 = ["Hauptstadt von Peru?", "7 mal 8?", "Englisch: Baum", "Wer schrieb Faust?"], a0 = ["Lima", "56", "tree", "Goethe"];
  // Freitext: Wortfilter, Länge, keine Doppelten bei den Fragen (Antworten dürfen gleich sein)
  const L = (v) => ({ t: "list", seat: 0, v });
  assert.equal(abfragen.accepts(S.observe(abfragen, s, 0), 0, L(["a", "a", "b", "c"])), false, "doppelte Frage");
  assert.equal(abfragen.accepts(S.observe(abfragen, s, 0), 0, L(["Treffpunkt Bahnhof?", "b", "c", "d"])), false, "kein Treffpunkt");
  assert.equal(abfragen.accepts(S.observe(abfragen, s, 0), 0, L(["x".repeat(29), "b", "c", "d"])), false, "zu lang");
  assert.equal(abfragen.accepts(S.observe(abfragen, s, 0), 0, L(q0)), true);
  s = playTurn(abfragen, s, [L(q0), L(a0)]);
  const v = abfragen.view(S.observe(abfragen, s, 1), 1, { lang: "de" });
  assert.equal(v.children.find((k) => k.role === "body").text, "Hauptstadt von Peru?");
  const back = (seat, misses) => { const out = []; for (let i = 0; i < 4; i++) out.push({ t: "ok", seat }, { t: "pick", seat, v: misses.includes(i) ? 1 : 0 }); return out; };
  const q1 = ["Wurzel aus 81?", "Farbe Himmel?", "Französisch: Katze", "Größter Ozean?"], a1 = ["9", "blau", "chat", "Pazifik"];
  s = playTurn(abfragen, s, back(1, [1]).concat([{ t: "list", seat: 1, v: q1 }, { t: "list", seat: 1, v: a1 }]));
  // die Antwort steht beim Umdrehen da
  s = APPLY(abfragen, s, { t: "ok", seat: 0 });
  assert.equal(abfragen.view(S.observe(abfragen, s, 0), 0, { lang: "de" }).children.find((k) => k.role === "title").text, "9");
  s = APPLY(abfragen, s, { t: "pick", seat: 0, v: 0 });
  for (const x of back(0, [3]).slice(2)) s = APPLY(abfragen, s, x);
  s = through(abfragen, s);
  assert.equal(S.status(abfragen, s).over, true);
  assert.deepEqual(res(abfragen, s), { h: "Euer Lernstand", lines: ["Spieler 2: 3 von 4", "Spieler 1: 3 von 4", "Spieler 2 übt noch: 7 mal 8?", "Spieler 1 übt noch: Größter Ozean?"] });
  assert.deepEqual(res(abfragen, s, "en").lines[0], "Player 2: 3 of 4");
});

test("Paket kürzen (fit): weniger falsche Antworten, dann weniger Fragen; Falschantworten fallen weg, wo sie nie gezeigt werden", () => {
  const big = M.fromOption({ modus: "lernen", titel: "Langes Thema mit vielen Fragen", fragen: Array.from({ length: 8 }, (x, i) => ({ f: "Frage Nummer " + (i + 1) + " mit einem recht langen Fragetext über das Thema?", a: "Antwort " + (i + 1), d: ["Falsch eins " + i, "Falsch zwei " + i, "Falsch drei " + i] })) });
  const size = (p) => JSON.stringify(p).length;
  for (const g of ["abfragen", "woerter", "quiz", "luecke"]) {
    const pk = M.fit(g, big, size, 600);
    assert.ok(pk && pk.q.length >= 3 && pk.q.length < 8 && size(pk) <= 600, g + " " + (pk && pk.q.length));
    if (g === "abfragen" || g === "woerter") assert.ok(pk.q.every((r) => r.length === 2), g);
  }
  assert.equal(M.fit("quiz", big, size, 50), null, "passt nie: kein Paket statt halbem");
});

test("Nachtpakete: Format für 100, 20 geprüfte Pakete, jugendfrei, jedes passt auf seine Karten", () => {
  assert.equal(J.v, 1); assert.equal(J.max, 100); assert.ok(J.packs.length >= 20 && J.packs.length <= J.max);
  assert.match(J.checked, /^\d{4}-\d{2}-\d{2}$/);
  const ids = new Set();
  const UNSAFE = /(^|[^\p{L}])(alkohol\w*|bier|wein|schnaps|zigarett\w*|rauchen|droge\w*|tablette\w*|waffe\w*|messer|töten|tot|sex\w*|kuss|wette\w*|casino|drugs?|weapons?|kill\w*|dead|alcohol)(?![\p{L}])/iu;
  for (const x of J.packs) {
    assert.ok(/^[a-z]{3,20}$/.test(x.id) && !ids.has(x.id), x.id); ids.add(x.id);
    assert.ok(["de", "en"].includes(x.lang) && Number.isInteger(x.ab) && x.ab >= 8 && x.ab <= 18, x.id);
    const pk = P.sanitize(x.pk);
    assert.deepEqual(pk, x.pk, x.id + " geht unverändert durch den Filter");
    assert.ok(M.clean(pk, isClean), x.id);
    assert.ok(!M.texts(pk).some((s) => UNSAFE.test(s)), x.id + " Jugendschutz");
    assert.ok(["abfragen", "luecke", "woerter", "schaetzen", "quiz", "typen"].some((g) => P.fits(g, pk)), x.id);
  }
  const by = (m) => J.packs.filter((x) => x.pk.m === m).length;
  assert.ok(by("l") >= 14 && by("f") >= 2 && by("g") >= 2, "Lernen, Firma und Gruppe");
  assert.ok(J.packs.filter((x) => P.fits("schaetzen", x.pk)).length >= 3, "Pakete auch für Schätzen");
  // jedes Nachtpaket der Auswahl in den Manifesten spielt sich über den Vertrag
  for (const id of abfragen.manifest.params.properties.paket.enum.filter(Boolean)) for (const variante of ["abfragen", "quiz"]) {
    let s = game(abfragen, { variante, paket: id }); s = turnWith(abfragen, s, firstInput); s = turnWith(abfragen, s, firstInput);
    assert.equal(S.status(abfragen, s).over, true, id + " " + variante);
  }
  for (const id of typen.manifest.params.properties.paket.enum.filter(Boolean)) {
    let s = game(typen, { paket: id }); s = turnWith(typen, s, firstInput); s = turnWith(typen, s, firstInput);
    assert.equal(S.status(typen, s).over, true, id);
  }
});

test("Schätzen der freien Karte (u): z=42 und 39 ergeben '3 km daneben', feste Sätze, nie Prozent; Absender sendet nur", () => {
  function spiel(tipps) {
    let s = game(preis, { variante: "schaetzen", pk: P.sanitize(RAD) });
    assert.deepEqual(preis.moves(S.observe(preis, s, 0), 0), [{ t: "ok", seat: 0 }], "der Absender schätzt nicht, er sendet nur");
    s = playTurn(preis, s, [{ t: "ok", seat: 0 }]);
    return playTurn(preis, s, tipps.map((v) => ({ t: "guess", seat: 1, v })));
  }
  const s = spiel([39, 3, 400]), r = res(preis, s), e = res(preis, s, "en");
  assert.equal(r.h, "Meine Radtour");
  assert.deepEqual(r.lines, ["Ganz nah dran.", "Wie viele km bin ich geradelt? (42 km): 3 km daneben", "Wie viele Pausen habe ich gemacht? (3): genau getroffen", "Wie viele Höhenmeter waren es? (350 m): 50 m daneben"]);
  assert.equal(e.lines[1], "Wie viele km bin ich geradelt? (42 km): 3 km off");
  assert.equal(res(preis, spiel([42, 3, 350])).lines[0], "Alles genau getroffen!");
  assert.equal(res(preis, spiel([20, 3, 350])).lines[0], "Gut geschätzt.");
  assert.equal(res(preis, spiel([0, 0, 0])).lines[0], "Da war noch Luft. Revanche?");
  for (const x of [r, e]) assert.ok(!/%|Prozent|percent|undefined|\{\w+\}/.test(JSON.stringify(x)));
  // Einheit am Schieber
  let w = playTurn(preis, game(preis, { variante: "schaetzen", pk: P.sanitize(RAD) }), [{ t: "ok", seat: 0 }]);
  assert.deepEqual(preis.view(S.observe(preis, w, 1), 1, { lang: "de" }).children.filter((k) => k.t === "slide").map((k) => k.unit), ["km"]);
  void w;
  // Lernpakete (zwei Spieler) zeigen ebenfalls Abstände statt Prozent
  const LP = { t: "Zahlen", m: "l", q: [["Planeten?", "8"], ["Monde des Mars?", "2"], ["Tage im Jahr?", "365"]], z: [8, 2, 365] };
  let l = game(preis, { variante: "schaetzen", pk: P.sanitize(LP) });
  l = playTurn(preis, l, [7, 2, 300].map((v) => ({ t: "guess", seat: 0, v }))); l = playTurn(preis, l, [8, 3, 365].map((v) => ({ t: "guess", seat: 1, v })));
  assert.deepEqual(res(preis, l).lines, ["Spieler 1: Gut geschätzt.", "Spieler 2: Gut geschätzt.", "Planeten? (8): 1 daneben / genau getroffen", "Monde des Mars? (2): genau getroffen / 1 daneben", "Tage im Jahr? (365): 65 daneben / genau getroffen"]);
});

test("sanitize verwirft Fragen ohne z oder mit ungültigem z; Einheit ≤ 8, Frage ≤ 80; Paket mit Einheiten nur für Schätzen", () => {
  const q4 = RAD.q.concat([["Wie viele Brücken?"]]);
  for (const bad of [NaN, 1e10, 2e9, 4.5, "42", null, undefined, 0, 1, -3, Infinity]) {
    const pk = P.sanitize({ ...RAD, q: q4, z: [42, 3, 350, bad], u: ["km", "", "m", ""] });
    assert.equal(pk.q.length, 3, String(bad)); assert.deepEqual(pk.z, [42, 3, 350]); assert.deepEqual(pk.u, ["km", "", "m"]);
  }
  const mid = P.sanitize({ ...RAD, q: q4, z: [42, NaN, 350, 7], u: ["km", "x", "m", "Stück"] });
  assert.deepEqual(mid.q.map((r) => r[0]), [RAD.q[0][0], RAD.q[2][0], "Wie viele Brücken?"]); assert.deepEqual(mid.z, [42, 350, 7]); assert.deepEqual(mid.u, ["km", "m", "Stück"]);
  assert.equal(P.sanitize({ ...RAD, z: [42, 1e12, 350] }), null);
  const LP = { t: "Planeten", m: "l", q: [["Wie viele Planeten?", "8", "9", "7"], ["Größter Planet?", "Jupiter", "Saturn", "Erde"], ["Roter Planet?", "Mars", "Venus", "Pluto"], ["Monde des Mars?", "2", "0", "1"]] };
  assert.deepEqual(P.sanitize({ ...LP, z: [8, 0, 0, 2] }).z, [8, 0, 0, 2]);
  const lp = P.sanitize({ ...LP, z: [8, 0, 0, NaN] });
  assert.equal(lp.q.length, 3); assert.deepEqual(lp.z, [8, 0, 0]);
  assert.equal(P.sanitize({ ...LP, z: [8, 0, 0, 5] }).q.length, 3, "z passt nicht zur Antwort: Frage geht");
  const cut = P.sanitize({ ...RAD, q: [["x".repeat(200)], ["Wo? https://x.de"], RAD.q[1], RAD.q[2]], z: [42, 5, 3, 350], u: ["Kilometerchen", "km", "", "m"] });
  assert.equal(cut.q[0][0].length, 80); assert.equal(cut.u[0], "Kilomete"); assert.equal(cut.q.length, 3);
  const pk = P.sanitize(RAD);
  for (const g of ["abfragen", "luecke", "woerter", "quiz", "typen"]) assert.equal(P.fits(g, pk), false, g);
  assert.equal(P.fits("schaetzen", pk), true);
});

test("Was kostet das?: 8 von 12, Reglerende aus dem Seed (1/5..4/5, 5-Cent-Schritte), Paarvergleich mit Quelle und Stand", () => {
  const seed = "4", it = R.preisItems(seed);
  assert.equal(it.length, 8); assert.equal(new Set(it).size, 8);
  let lo = 0, hi = 0;
  for (let s = 1; s <= 200; s++) for (let i = 0; i < 8; i++) {
    const z = R.cents(R.preisItems(String(s))[i]), t = R.top(String(s), i);
    assert.ok(t % 5 === 0 && t > z && z / t >= 0.19 && z / t <= 0.8, s + " " + i + ": " + z + "/" + t);
    if (z / t < 0.5) lo++; else hi++;
  }
  assert.ok(Math.abs(lo - hi) < 200, "so oft unter der Mitte wie darüber: " + lo + "/" + hi);
  assert.equal(R.start(seed, 0) % 5, 0); assert.equal(R.money(95, "de"), "0,95 €"); assert.equal(R.money(95, "en"), "€0.95");
  let s = game(preis, {}, 4);
  const pub = s.state.pub, v = preis.view(S.observe(preis, s, 0), 0, { lang: "de" }), ve = preis.view(S.observe(preis, s, 0), 0, { lang: "en" });
  assert.match(v.children.find((k) => k.role === "title").text, /: Was kostet das\?$/); assert.match(ve.children.find((k) => k.role === "title").text, /: what does it cost\?$/);
  const sl = v.children.find((k) => k.t === "slide");
  assert.equal(sl.label, "Preis 1 von 8"); assert.equal(sl.step, 5); assert.equal(sl.format, "eur"); assert.equal(sl.max, R.top(pub.seed, 0)); assert.equal(sl.value % 5, 0);
  const items = R.preisItems(pub.seed), exact = items.map((k) => R.cents(k)), far = items.map((k, i) => Math.min(R.top(pub.seed, i), Math.round(R.cents(k) * 1.4 / 5) * 5));
  assert.equal(preis.accepts(S.observe(preis, s, 0), 0, { t: "guess", seat: 0, v: R.top(pub.seed, 0) + 5 }), false, "über dem Reglerende geht nicht");
  assert.throws(() => APPLY(preis, s, { t: "guess", seat: 0, v: R.top(pub.seed, 0) + 5 }));
  s = playTurn(preis, s, far.map((x) => ({ t: "guess", seat: 0, v: x })));
  s = playTurn(preis, s, exact.map((x) => ({ t: "guess", seat: 1, v: x })));
  assert.equal(S.status(preis, s).over, true);
  const r = res(preis, s), en = res(preis, s, "en");
  assert.equal(r.h, "Spieler 2 lag näher dran."); assert.equal(en.h, "Player 2 was closer.");
  assert.equal(r.lines[1], "Spieler 2: im Schnitt 0 Prozent daneben"); assert.match(r.lines[0], /^Spieler 1: im Schnitt ([1-9]\d?) Prozent daneben$/);
  assert.match(r.lines[2], /Schätzung.*Stand November 2026.*keine Marke/); assert.match(en.lines[2], /estimates.*November 2026.*no brand/);
  assert.equal(r.note.split(" · ").length, 8); assert.match(r.note, /\d,\d\d € \(Tipps \d+,\d\d € \/ \d+,\d\d €\)/); assert.match(en.note, /€\d+\.\d\d \(guesses €/);
  let t = game(preis, {}, 4); t = playTurn(preis, t, exact.map((x) => ({ t: "guess", seat: 0, v: x }))); t = playTurn(preis, t, exact.map((x) => ({ t: "guess", seat: 1, v: x })));
  assert.equal(res(preis, t).h, "Gleich nah dran.");
  // Paket: de und en gleich gebaut, Fakten passen zu den Texten
  for (const l of ["de", "en"]) assert.equal(QJ[l].preis.length, QJ.preis.c.length, l);
});

test("Fünf mal schätzen (Tageskarte): gleicher Tag = gleiche Fragen für alle, eine Person, Mittel in Prozent", () => {
  const a = game(preis, { variante: "schaetzen", tag: 20404 }, 1), b = game(preis, { variante: "schaetzen", tag: 20404 }, 999);
  assert.equal(a.state.pub.seed, "20404"); assert.equal(b.state.pub.seed, "20404", "der Tag, nicht der Partie-Seed");
  const peek = (s) => preis.view(S.observe(preis, s, 0), 0, { lang: "de" }).children.find((k) => k.role === "title").text;
  assert.equal(peek(a), peek(b));
  const g = R.guesses("20404");
  let s = playTurn(preis, a, g.map((q) => ({ t: "guess", seat: 0, v: q[2] })));
  assert.equal(S.status(preis, s).over, true, "eine Person, ein Zug");
  const r = res(preis, s);
  assert.equal(r.h, "Im Schnitt 0 Prozent daneben"); assert.equal(r.lines.length, 5); assert.equal(r.lines[0], "Frage 1: 0 Prozent daneben");
  assert.equal(r.note.split(" · ").length, 5);
  // ohne Tag: aus dem Partie-Seed
  assert.notEqual(game(preis, { variante: "schaetzen" }, 1).state.pub.seed, "0");
});

test("Hook: session.apply nutzt accepts() der Karte (" + (HOOK ? "aktiv" : "offen, Strang F") + ")", () => { assert.equal(typeof preis.accepts, "function"); });

test("Vertrag: Drahtformat-Rundreise, ungültige Eingaben werden abgelehnt, nicht am Zug, nach dem Ende nichts mehr", () => {
  let s = game(abfragen, { variante: "quiz", paket: "planeten" });
  assert.throws(() => APPLY(abfragen, s, { t: "pick", seat: 1, v: 0 }), /nicht-am-zug/);
  assert.throws(() => APPLY(abfragen, s, { t: "pick", seat: 0, v: 9 }));
  assert.throws(() => APPLY(abfragen, s, { t: "guess", seat: 0, v: 0 }));
  s = turnWith(abfragen, s, firstInput); s = turnWith(abfragen, s, firstInput);
  assert.equal(S.status(abfragen, s).over, true);
  assert.throws(() => APPLY(abfragen, s, { t: "pick", seat: 0, v: 0 }), /vorbei/);
  // manipuliertes Paket im Link: abgelehnt
  const w = JSON.parse(JSON.stringify(S.toWire(game(abfragen, { variante: "quiz", paket: "" , pk: M.fromOption(LEARN) }))));
  w.p.pk.t = "Scheiße"; assert.throws(() => S.fromWire(abfragen, w, { mine: [0, 1] }));
  // Zustand bleibt in der Grenze des Manifests
  for (const [card, p] of [[abfragen, { variante: "quiz", paket: "bundeslaender" }], [typen, {}], [preis, {}]]) {
    let x = game(card, p); x = turnWith(card, x, firstInput); x = turnWith(card, x, firstInput);
    assert.ok(JSON.stringify(x.state).length <= card.manifest.limits.stateBytes, card.manifest.id);
  }
});

test("KI-Art quiz: Eingabe wie der Altcode, Antwort wird zum geprüften Paket, 'steht im Text' je Frage", () => {
  assert.equal(AI.modus("typen"), "gruppe"); assert.equal(AI.modus("quiz"), "lernen"); assert.equal(AI.modus("quiz", true), "firma");
  assert.deepEqual(AI.topicInput("lernen", "  Vulkane "), { modus: "lernen", thema: "Vulkane", n: 6 });
  assert.equal(AI.topicInput("lernen", "ab"), null); assert.equal(AI.topicInput("lernen", "fuck"), null);
  assert.equal(AI.textInput("lernen", "zu kurz"), null); assert.equal(AI.textInput("gruppe", "x".repeat(100)), null);
  const t = AI.textInput("lernen", "<b>" + "Photosynthese ist ".repeat(300));
  assert.equal(t.text.length, 3000); assert.ok(!/[<>]/.test(t.text));
  assert.deepEqual(AI.requestBody({ modus: "lernen", thema: "Vulkane", n: 6 }, "en"), { kind: "quiz", input: { modus: "lernen", thema: "Vulkane", n: 6 }, lang: "en", queue: "ticket" });
  const got = AI.packsFrom({ options: [LEARN, { modus: "x" }] }, true);
  assert.equal(got.length, 1); assert.deepEqual(got[0].pk, M.fromOption(LEARN)); assert.deepEqual(got[0].inText, [true, false, true, true, false]);
  assert.equal(AI.packsFrom({ options: [GROUP] }, false)[0].inText, null);
  assert.deepEqual(AI.packsFrom({}, false), []);
});
