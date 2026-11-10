"use strict";
// The quiz cards with a fixed pack (src/quizspiele.js): Echt oder Phishing? (Business, biz-quiz-phishing) and Was kostet das?
// (Daily, quiz-preis). The pack itself (made up, no real brand or domain, prices as dated estimates), the order from the seed,
// the link that carries one number per person, the team result only from K = 5 on, the slider that gives nothing away, and
// both builds: the facts in the core, the texts in the part quiz.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const QS = require("../src/quizspiele.js");
const C = require("../src/core.js");
const J = require("../src/quizspiele.json");
const BIZ = require("../src/flavors/business/ideas.json");
const root = path.join(__dirname, "..");
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const through = (d) => { const r = D.parseRoute("#" + D.docUrl(d).split("#")[1]); assert.equal(r.type, "doc"); return r.doc; };
const phishDoc = (seed) => Tn.fresh(D.docFromIdea(BIZ.ideas.find((i) => i.id === "biz-quiz-phishing"), me, "de"), seed);
const preisDoc = (seed) => Tn.fresh(D.docFromIdea(D.byId("quiz-preis"), me, "de"), seed);
// answers as the screen gives them for one person who calls example i phishing when bit i of mask is set
const play = (d, mask) => { const n = Tn.play(d, QS.full(mask), 0); assert.ok(n, "Zug passt"); return through(n); };
// the mask of a person who gets exactly the examples in `right` right
const maskFor = (d, right) => QS.phishItems(d).reduce((m, k, i) => m | ((QS.isPhish(k) === right.includes(i) ? 1 : 0) << i), 0);

test("Paket: de und en gleich gebaut, ausgedacht (.example, keine Marke), Detail steht im Beispiel, Fakten passen zu den Texten", () => {
  for (const l of ["de", "en"]) {
    const X = J[l];
    assert.equal(X.phish.length, J.phish.ok.length, l); assert.equal(X.preis.length, J.preis.c.length, l);
    X.phish.forEach((e, k) => {
      const all = [e.from, e.sub, e.body, e.link].join(" ");
      assert.ok(all.includes(e.mark), l + " " + k + ": Detail " + e.mark);
      assert.ok(e.why.length > 20 && e.why.length <= 200, l + " " + k);
      assert.ok(["mail", "sms"].includes(e.k)); if (e.k === "mail") assert.ok(e.sub, "Mail mit Betreff");
      const hosts = all.replace(/[\w.+-]+@/g, "@").match(/(?:@|\/\/|^|\s)[a-z0-9-]+(\.[a-z0-9-]+)+(?=[/>\s]|$)/gi) || [];
      for (const h of hosts.filter((x) => /[a-z]\.[a-z]/i.test(x))) assert.match(h.trim().replace(/^[@/]+/, ""), /^[a-z0-9-]+\.example$/, l + " " + k + ": nur ausgedachte Domains, " + h);
      assert.ok((all.match(/@/g) || []).length <= hosts.filter((x) => x.startsWith("@")).length, "jede Adresse geprueft");
      assert.ok(!/https?:\/\/(?!\S+\.example\/)/.test(all), "Links nur auf .example");
      for (const s of [e.from, e.sub, e.body, e.why]) if (s) assert.ok(C.isClean(s), s);
    });
    assert.deepEqual(Object.keys(X.ui).sort(), Object.keys(J.de.ui).sort(), "dieselben Schluessel in " + l);
  }
  assert.deepEqual(J.de.phish.map((e) => e.k), J.en.phish.map((e) => e.k));
  assert.equal(J.phish.ok.filter((x) => x === 1).length, J.phish.ok.length / 2, "halb echt, halb Phishing");
  // brands and real services never appear (a short list of the usual ones in phishing mails)
  const brands = /paypal|amazon|dhl|hermes|\bups\b|sparkasse|microsoft|outlook|google|apple|netflix|telekom|vodafone|deutsche post|\bing-diba\b|\bING\b|commerzbank|aldi|lidl|rewe|edeka/i;
  assert.ok(!brands.test(JSON.stringify([J.de, J.en])), "keine Marke");
  assert.ok(J.preis.c.every((c) => Number.isInteger(c) && c >= 50 && c <= 2000 && c % QS.STEP === 0), "gerundet auf den 5-Cent-Schritt des Reglers: genau treffen geht"); assert.equal(J.preis.stand, "2026-11");
  assert.equal(QS.K, require("../src/office.js").K, "dasselbe k wie office.js");
});

test("Echt oder Phishing?: 10 von 14 aus dem Seed, gleich auf jedem Geraet, jede Partie anders", () => {
  const a = QS.phishItems(phishDoc(5)), b = QS.phishItems(through(phishDoc(5))), c = QS.phishItems(phishDoc(6));
  assert.equal(a.length, 10); assert.equal(new Set(a).size, 10); assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  const g = Tn.GAMES.phish;
  assert.equal(g.turns.length, QS.PEOPLE); assert.equal(g.turns[0].length, 22, "Einstieg, 10 x (Antwort, Aufloesung), eigenes Ergebnis");
  assert.equal(g.part, "quiz"); assert.equal(Tn.GAMES.preis.part, "quiz");
});

test("Link traegt je Person nur eine Zahl ohne Namen; kaputte oder fremde Zuege laufen nicht weiter", () => {
  let d = phishDoc(11);
  d = play(d, 5); d = play(d, 1023);
  assert.deepEqual(Tn.unseal(d.q, d.seed), [5, 1023], "eine Zahl je Person");
  assert.ok(!/"n"|nick|M"/.test(JSON.stringify(Tn.unseal(d.q, d.seed))));
  assert.equal(Tn.state(d).turn, 2);
  for (const bad of [[1024], [-1], [1.5], ["3"], [[0]], [QS.full(3)]]) assert.equal(Tn.state(Object.assign({}, d, { q: Tn.seal(bad, d.seed) })).turn, 0, JSON.stringify(bad));
  assert.equal(Tn.play(phishDoc(1), QS.full(3).slice(0, 21), 0), null, "ein Schritt fehlt");
  const wrong = QS.full(3); wrong[2] = [2]; assert.equal(Tn.play(phishDoc(1), wrong, 0), null, "nur echt (0) oder Phishing (1)");
  // a full round of 30 still fits easily into one link
  let e = phishDoc(3); for (let i = 0; i < QS.PEOPLE; i++) e = play(e, (i * 389) % 1024);
  assert.equal(Tn.state(e).over, true); assert.ok(D.docUrl(e).length < 700, "Linklaenge " + D.docUrl(e).length);
});

test("Team-Ergebnis erst ab 5 Personen (k=5), nie je Person; das eigene Ergebnis nur im eigenen Schritt", () => {
  let d = phishDoc(21);
  const right = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6]];
  for (let n = 0; n < 4; n++) {
    d = play(d, maskFor(d, right[n]));
    assert.deepEqual(Tn.face(d, "de"), ["Noch zu wenig Teilnahmen: " + (n + 1) + " von 5. Das Team-Ergebnis zeigt sich ab 5.", "Ohne Namen"]);
  }
  assert.deepEqual(Tn.face(d, "en"), ["Not enough people yet: 4 of 5. The team result shows from 5.", "No names"]);
  d = play(d, maskFor(d, right[4]));
  assert.deepEqual(Tn.face(d, "de"), ["Team: im Schnitt 8 von 10 erkannt · 5 Teilnahmen", "Ohne Namen"]);
  assert.deepEqual(Tn.face(d, "en"), ["Team: on average 8 of 10 right · 5 people", "No names"]);
  assert.deepEqual(QS.team(d, Tn.moves(d)).per, [5, 5, 5, 5, 5, 5, 4, 3, 2, 1]);
  // nothing per person: no single score on the sheet
  for (const s of Tn.face(d, "de")) assert.ok(!/\b(10|6|9|7) von 10\b/.test(s), s);
  // the own result is a step of one's own turn: it counts the answers on this phone (now), the team line includes them
  const last = Tn.GAMES.phish.turns[5][21], now = QS.full(maskFor(d, [0, 1]));
  assert.deepEqual(last.list(d, Tn.moves(d), now, "de"), ["2 von 10 richtig erkannt."]);
  const notes = last.notes(d, Tn.moves(d), now, "de");
  assert.equal(notes[0], "Das eigene Ergebnis steht nur auf diesem Gerät. Im Link stehen die Antworten ohne Namen.");
  assert.equal(notes[1], "Team: im Schnitt 7 von 10 erkannt · 6 Teilnahmen");
  assert.match(notes[2], /^Am häufigsten verwechselt: „.+“ \(\d+\u00a0% richtig\)$/);
  assert.match(last.notes(d, Tn.moves(d), now, "en")[2], /^Mixed up most: “.+” \(\d+% right\)$/);
});

test("Aufloesung je Beispiel: richtig/daneben, echt/Phishing, aus dem Paket; Einstieg mit Datenschutz-Zeile, Freiwilligkeit, BR, Pflichtschulung", () => {
  const d = phishDoc(8), g = Tn.GAMES.phish.turns[0], k0 = QS.phishItems(d)[0];
  const pickRight = [QS.isPhish(k0) ? 1 : 0], pickWrong = [QS.isPhish(k0) ? 0 : 1];
  assert.match(g[2].list(d, [], [0, pickRight], "de")[0], QS.isPhish(k0) ? /^Richtig\. Das ist Phishing\.$/ : /^Richtig\. Das ist echt\.$/);
  assert.match(g[2].list(d, [], [0, pickWrong], "en")[0], QS.isPhish(k0) ? /^Not quite\. This is phishing\.$/ : /^Not quite\. This is real\.$/);
  assert.deepEqual(g[1].from(d, [], [0], "de"), ["✓ Echt", "⚠ Phishing"]); assert.deepEqual(g[1].from(d, [], [0], "en"), ["✓ Real", "⚠ Phishing"]);
  assert.equal(g[1].top, undefined, "kleines Label statt grosser Ueberschrift: die Antworten bleiben im Bild");
  // the intro's notes, without the page's privacy line (Bausteine lives in the page)
  assert.deepEqual(g[0].notes(d, [], [], "de"), ["Freiwillig. Nicht-Teilnahme hat keine Folgen.", "Für den Betriebsrat: gedacht als mitbestimmungsfrei, weil freiwillig, ohne Namen und ohne Auswertung je Person. Keine Phishing-Simulation an Kolleginnen und Kollegen.", "Übung zum Mitreden, ersetzt keine Pflichtschulung."]);
  assert.ok(!/\b(du|dich|dein)\b/i.test(JSON.stringify(J.de.ui) + JSON.stringify(J.de.phish.map((e) => e.why))), "Business neutral, ohne Du");
});

test("Was kostet das?: 8 von 12, Reglerende aus dem Seed (Preis zwischen 1/5 und 4/5, 5-Cent-Schritte), Paarvergleich mit Quelle und Stand", () => {
  const d = preisDoc(4), it = QS.preisItems(d);
  assert.equal(it.length, 8); assert.equal(new Set(it).size, 8); assert.deepEqual(QS.preisItems(through(d)), it);
  let lo = 0, hi = 0;
  for (let s = 1; s <= 200; s++) {
    const x = preisDoc(s);
    for (let i = 0; i < 8; i++) {
      const z = QS.cents(QS.preisItems(x)[i]), t = QS.top(x, i);
      assert.ok(t % 5 === 0 && t > z && z / t >= 0.19 && z / t <= 0.8, s + " " + i + ": " + z + "/" + t);
      if (z / t < 0.5) lo++; else hi++;
    }
  }
  assert.ok(Math.abs(lo - hi) < 200, "so oft unter der Mitte wie darueber: " + lo + "/" + hi);
  const g = Tn.GAMES.preis.turns[0][0];
  assert.equal(g.defOf(d) % 5, 0); assert.equal(g.show(95, "de"), "0,95 €"); assert.equal(g.show(95, "en"), "€0.95");
  assert.match(g.peek(d, [], [], "de"), /: Was kostet das\?$/); assert.match(g.peek(d, [], [], "en"), /: what does it cost\?$/);
  assert.equal(g.title(d, "de"), "Preis 1 von 8");
  const exact = it.map((k) => QS.cents(k)), far = it.map((k, i) => Math.min(QS.top(d, i), Math.round(QS.cents(k) * 1.4 / 5) * 5));
  let e = through(Tn.play(d, far, 0)); e = through(Tn.play(e, exact, 0));
  assert.equal(Tn.state(e).over, true);
  const r = Tn.result(e, "de"), en = Tn.result(e, "en");
  assert.equal(r.h, "Spieler 2 lag näher dran."); assert.equal(en.h, "Player 2 was closer.");
  assert.equal(r.lines[1], "Spieler 2: im Schnitt 0 Prozent daneben"); assert.match(r.lines[0], /^Spieler 1: im Schnitt ([1-9]\d?) Prozent daneben$/);
  assert.match(r.lines[2], /Schätzung.*Stand November 2026.*keine Marke/); assert.match(en.lines[2], /estimates.*November 2026.*no brand/);
  assert.equal(r.note.split(" · ").length, 8); assert.match(r.note, /\d,\d\d € \(Tipps \d+,\d\d € \/ \d+,\d\d €\)/); assert.match(en.note, /€\d+\.\d\d \(guesses €/);
  assert.equal(Tn.result(through(Tn.play(through(Tn.play(preisDoc(4), exact, 0)), exact, 0)), "de").h, "Gleich nah dran.");
  assert.equal(Tn.play(d, exact.map((c, i) => QS.top(d, i) + 5), 0), null, "ueber dem Reglerende geht nicht");
});

test("Beide Builds: Karte im Business-Katalog (11-18), Fakten im Kern, Texte nur im Teil quiz; Kern im Budget", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build.js")]);
  execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);
  for (const f of ["", "business"]) {
    const dir = path.join(root, "dist", f), html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const man = JSON.parse(html.match(/window\.DailyParts=(\{.*?\});window\./)[1]), quiz = fs.readFileSync(path.join(dir, man.quiz.f), "utf8");
    assert.match(html, /window\.QuizFacts=\{"phish":\{"ok":\[1,0,1/); assert.match(html, /root\.QuizSpiele = api/);
    assert.ok(!html.includes("musterflrma") && !html.includes("Zollgebühr"), "Beispieltexte nicht im Kern");
    assert.match(quiz, /window\.QuizSpieleData=\{/); assert.match(quiz, /root\.QuizSpieleUI = \{/); assert.ok(quiz.includes("musterflrma"));
    // 700 KiB again since redesign wave R4 (PANEL/TABS in the part blasen; the raise to 724 992 B is over)
    console.log((f || "daily") + " Kern " + Buffer.byteLength(html) + " B (< 716800)");
    assert.ok(Buffer.byteLength(html) < 716800, f + " Kern " + Buffer.byteLength(html));
    const kat = fs.readFileSync(path.join(dir, man.katalog.f), "utf8");
    assert.equal(kat.includes('"biz-quiz-phishing"'), f === "business"); assert.equal(kat.includes('"quiz-preis"'), f === "");
  }
  assert.equal(BIZ.ideas.find((i) => i.id === "biz-quiz-phishing").on, "11-18");
  assert.equal(new Date(Date.UTC(2026, 10, 18)).getUTCDay(), 3, "18.11.2026 ist ein Mittwoch");
});
