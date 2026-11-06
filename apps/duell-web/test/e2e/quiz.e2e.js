"use strict";
// Quiz engine on screen: a night pack in three taps (no AI action), a pack from the own text with the check list
// ("steht im Text", change, strike), charged only on "Übernehmen", discarded otherwise, the crisis help on the device,
// the duel over real links, Typen-Quiz with strengths only. The server is mocked (protocol as in ki.e2e.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.QUIZ_SHOTS || "";
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api, url) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (api && u.startsWith(API)) { const path0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: path0, body }); const a = api(path0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(url || page);
  return { p, errs, sent };
}
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "wb2-quiz-" + name + ".png") }); };
const openTurn = (p, g) => p.evaluate((gg) => { const D = window.Daily, i = D.IDEAS.find((x) => x.turn && x.turn.g === gg); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i, tab: "Move" }); }, g);
const doc = (p) => p.evaluate(() => window.DailyDebug.doc());
const link = (p) => p.evaluate(() => window.Daily.docUrl(window.DailyDebug.doc()).split("#")[1]);
const METER = { free: 7, remaining: 5, period: "week" };
// What the server's kind quiz sends for the own text (lib/duell-ai.mjs shape): quelle_im_text checked by the server.
const OPT = { modus: "lernen", titel: "Die Zelle", fragen: [
  { f: "Was steuert die Zelle?", a: "Der Zellkern", d: ["Die Vakuole", "Die Zellwand", "Das Ribosom"], quelle_im_text: true },
  { f: "Wo entsteht Energie in der Zelle?", a: "In den Mitochondrien", d: ["Im Zellkern", "In der Vakuole", "In der Zellwand"], quelle_im_text: true },
  { f: "Was hat nur die Pflanzenzelle?", a: "Eine Zellwand", d: ["Einen Zellkern", "Eine Membran", "Ribosomen"], quelle_im_text: false },
  { f: "Was umgibt jede Zelle?", a: "Die Zellmembran", d: ["Die Zellwand", "Der Zellkern", "Das Plasma"], quelle_im_text: true }] };
const TEXT = "Die Zelle ist die kleinste Einheit des Lebens. Der Zellkern steuert die Zelle. In den Mitochondrien entsteht Energie. Jede Zelle ist von der Zellmembran umgeben.";

test("Nachtpaket in drei Tipps: ohne KI-Aufruf, Pruefliste mit Streichen, Paket im Link, Duell bis zum Ergebnis", async () => {
  const { p, errs, sent } = await phone(() => null);
  await openTurn(p, "luecke");
  await shot(p, "1-karte");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();                     // 1
  await shot(p, "2-pakete");
  await p.getByRole("button", { name: /🌙 Unsere Planeten/ }).tap();                        // 2
  await p.getByText("Vor dem Senden prüfen").waitFor();
  assert.equal(await p.locator(".qzbadge.ki").textContent(), "🌙 Nachtpaket · mit KI gemacht, von Hand geprüft");
  await p.locator(".qzcard").nth(1).getByRole("button", { name: "✕ Streichen" }).tap();
  await p.locator(".qzcard").nth(0).locator("textarea").fill("Welcher Planet kreist am nächsten um die Sonne?");
  await shot(p, "3-pruefliste");
  await p.getByRole("button", { name: "Übernehmen" }).tap();                                // 3
  await p.getByRole("button", { name: "📦 Unsere Planeten · ändern" }).waitFor();
  let d = await doc(p);
  assert.equal(d.pk.t, "Unsere Planeten"); assert.equal(d.pk.q[0][0], "Welcher Planet kreist am nächsten um die Sonne?");
  assert.ok(!d.pk.q.some((r) => /Wie viele Planeten/.test(r[0])), "gestrichene Frage ist raus");
  assert.deepEqual(d.ki, { k: "quiz" }, "Nachtpaket: als KI gemacht markiert, ohne Server-Siegel");
  assert.equal(sent.length, 0, "kein Aufruf, keine Aktion");
  // play the first turn: every question as a choice of all answers
  const n = d.pk.q.length;
  await p.locator("#panel .qtext").first().waitFor();
  await shot(p, "4-frage");
  for (let i = 0; i < n; i++) await p.locator("#panel .chips .chip").first().tap();
  assert.equal((await doc(p)).pk.q.length, n);
  const h = await link(p);
  assert.ok(h.length <= 1200 + 2, "ein Link: " + h.length);
  // the card shows the pack, the link goes to the second phone, which answers and sees both scores
  await shot(p, "4b-gesendet");
  const two = await phone(() => null, page + "#" + (await p.evaluate(() => window.Daily.docUrl(window.DailyApp.ed().next).split("#")[1])));
  await two.p.getByRole("button", { name: "Dein Zug" }).tap();
  assert.equal((await doc(two.p)).pk.t, "Unsere Planeten", "das Paket kommt mit dem Link");
  for (let i = 0; i < n; i++) await two.p.locator("#panel .chips .chip").first().tap();
  await two.p.getByText(new RegExp("^Spieler 1: \\d von " + n + " richtig$")).waitFor();
  await two.p.getByText(new RegExp("^Spieler 2: \\d von " + n + " richtig$")).waitFor();
  await shot(two.p, "4c-ergebnis");
  assert.deepEqual(errs, []); assert.deepEqual(two.errs, []);
  await two.p.context().close(); await p.context().close();
});

test("Eigener Lernstoff: Text rein, Pruefliste zeigt 'steht im Text', erst Uebernehmen bucht ab; Verwerfen gibt zurueck", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") { n++; return [200, { kind: "quiz", options: [OPT], seals: ["s2.quiz.mh2x9k1a.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"], cost: 2, receipt: "rc-quiz-" + n, meter: METER }]; }
    if (path0 === "ai/accept" || path0 === "ai/discard") return [200, { meter: METER }];
    return null;
  });
  await openTurn(p, "quiz");
  assert.equal(await p.getByText("Erst ein Fragenpaket wählen.").count(), 1, "Quiz ohne Paket: kein Zug moeglich");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: "✨ Eigener Text" }).tap();
  await p.getByLabel("Dein Lernstoff (Text einfügen)").fill(TEXT);
  await shot(p, "5-eigener-text");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText("Vor dem Senden prüfen").waitFor();
  assert.equal(await p.locator(".qzbadge.ki").textContent(), "KI · bitte jede Frage prüfen");
  assert.deepEqual(await p.locator(".qzcard .qzbadge").allTextContents(), ["✓ steht im Text", "✓ steht im Text", "⚠ nicht im Text gefunden", "✓ steht im Text"]);
  const ask = sent.find((x) => x.path === "ai");
  assert.deepEqual([ask.body.kind, ask.body.input.modus, ask.body.input.text, ask.body.input.n], ["quiz", "lernen", TEXT, 6]);
  assert.equal(sent.filter((x) => x.path.startsWith("ai/")).length, 0, "noch nichts abgebucht, solange die Liste offen ist");
  await shot(p, "6-pruefliste-text");
  // discard: refunded; ask again, strike the question that is not in the text, take it
  await p.getByRole("button", { name: "Verwerfen" }).tap();
  while (!sent.some((x) => x.path === "ai/discard")) await p.waitForTimeout(30);
  assert.equal(sent.find((x) => x.path === "ai/discard").body.receipt, "rc-quiz-1");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText("Vor dem Senden prüfen").waitFor();
  await p.locator(".qzcard").nth(2).getByRole("button", { name: "✕ Streichen" }).tap();
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  while (!sent.some((x) => x.path === "ai/accept")) await p.waitForTimeout(30);
  assert.equal(sent.find((x) => x.path === "ai/accept").body.receipt, "rc-quiz-2");
  const d = await doc(p);
  assert.equal(d.pk.q.length, 3); assert.ok(!d.pk.q.some((r) => r[1] === "Eine Zellwand"));
  assert.equal(d.ki.k, "quiz"); assert.equal(d.ki.s, "s2.quiz.mh2x9k1a.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"); assert.match(d.ki.h, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(d.t, "Die Zelle"); assert.equal(d.s, "Fragenpaket mit 3 Fragen");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Thema: ein Aufruf mit modus lernen, Pruefliste ohne 'steht im Text' (es gibt keinen Text)", async () => {
  const topic = Object.assign({}, OPT, { titel: "Vulkane", fragen: OPT.fragen.map((x) => Object.assign({}, x, { quelle_im_text: false })) });
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? [200, { kind: "quiz", options: [topic], seals: ["s2.quiz.mh2x9k1a.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"], cost: 2, receipt: "rc-t", meter: METER }] : path0.startsWith("ai/") ? [200, { meter: METER }] : null));
  await openTurn(p, "abfragen");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: "✨ Thema" }).tap();
  await p.getByLabel("Thema").fill("Vulkane");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText("Vor dem Senden prüfen").waitFor();
  assert.deepEqual(sent[0].body.input, { modus: "lernen", thema: "Vulkane", n: 6 });
  assert.equal(await p.locator(".qzcard .qzbadge").count(), 0);
  assert.equal(await p.locator(".qzcard").first().getByLabel("Falsch").count(), 3, "Falschantworten pruefbar, auch wenn Frag mich ab sie nicht zeigt");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Krise im Text: die zentrale Hilfe aus ai.js sofort auf dem Geraet (116 111), nichts geht raus; 422 crisis zeigt dieselbe", async () => {
  const HELP = /Nummer gegen Kummer 116 111/;
  const { p, errs, sent } = await phone(() => [422, { error: "blocked", why: "crisis" }]);
  await openTurn(p, "abfragen");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: "✨ Thema" }).tap();
  // Review B2 #2: frequent words the old own list missed; the help is the one line aiCrisis, no second one of the quiz
  for (const s of ["ich will sterben", "ich ritze mich", "keinen Bock mehr zu leben", "ich hasse mein Leben"]) {
    await p.getByLabel("Thema").fill(s);
    await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
    await p.getByText(HELP).waitFor();
    assert.equal(await p.getByText(HELP).count(), 1, s);
    assert.equal(sent.length, 0, s);
  }
  await shot(p, "7-krise");
  // what only the server sees (selfCut): its 422 crisis brings the same help, never "lassen wir lieber weg"
  await p.getByLabel("Thema").fill("Vulkane");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  while (!sent.length) await p.waitForTimeout(30);
  await p.getByText(HELP).waitFor();
  assert.equal(await p.locator(".aistate").count(), 1);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Zweites Fragen schlaegt fehl: die alte Pruefliste geht zu, nichts laesst sich ohne Abbuchung uebernehmen", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") { n++; return n === 1 ? [200, { kind: "quiz", options: [OPT], seals: ["s2.quiz.mh2x9k1a.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"], cost: 2, receipt: "rc-" + n, meter: METER }] : n === 2 ? [503, {}] : [200, { kind: "quiz", options: [OPT], seals: ["s2.quiz.mh2x9k1a.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"], cost: 2, receipt: "rc-" + n, meter: METER }]; }
    if (path0 === "ai/accept" || path0 === "ai/discard") return [200, { meter: METER }];
    return null;
  });
  await openTurn(p, "luecke");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: "✨ Thema" }).tap();
  await p.getByLabel("Thema").fill("Die Zelle");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText("Vor dem Senden prüfen").waitFor();
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.locator(".aistate").waitFor();
  while (!sent.some((x) => x.path === "ai/discard")) await p.waitForTimeout(30);
  assert.equal(sent.find((x) => x.path === "ai/discard").body.receipt, "rc-1", "die alte Quittung ist erstattet");
  assert.equal(await p.getByText("Vor dem Senden prüfen").count(), 0, "die erstattete Pruefliste ist zu");
  assert.equal(await p.getByRole("button", { name: "Übernehmen" }).count(), 0);
  assert.equal((await doc(p)).pk, undefined);
  assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0);
  // the same with the crisis help: a list open before it goes back and closes, nothing is left to take
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText("Vor dem Senden prüfen").waitFor();
  await p.getByLabel("Thema").fill("ich ritze mich");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText(/Nummer gegen Kummer 116 111/).waitFor();
  while (!sent.some((x) => x.path === "ai/discard" && x.body.receipt === "rc-3")) await p.waitForTimeout(30);
  assert.equal(await p.getByRole("button", { name: "Übernehmen" }).count(), 0);
  assert.equal(sent.filter((x) => x.path === "ai").length, 3, "der Krisentext ging nicht raus");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Zurueck mit offener KI-Pruefliste: die Quittung geht sofort zurueck, nicht erst beim Verlassen des Blatts", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? [200, { kind: "quiz", options: [OPT], seals: ["s2.quiz.mh2x9k1a.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"], cost: 2, receipt: "rc-back", meter: METER }] : path0.startsWith("ai/") ? [200, { meter: METER }] : null));
  await openTurn(p, "luecke");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: "✨ Thema" }).tap();
  await p.getByLabel("Thema").fill("Die Zelle");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.getByText("Vor dem Senden prüfen").waitFor();
  await p.locator("#shback").tap();
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).waitFor();
  for (let i = 0; i < 100 && !sent.some((x) => x.path === "ai/discard"); i++) await p.waitForTimeout(30);
  assert.deepEqual(sent.filter((x) => x.path.startsWith("ai/")).map((x) => [x.path, x.body.receipt]), [["ai/discard", "rc-back"]]);
  assert.ok(await doc(p), "das Blatt ist noch offen");
  // a night pack taken afterwards charges nothing
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: /🌙 Unsere Planeten/ }).tap();
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  await p.getByRole("button", { name: "📦 Unsere Planeten · ändern" }).waitFor();
  assert.equal(sent.filter((x) => x.path === "ai/accept").length, 0);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Ohne Netz: ehrlicher Zustand, fertige Pakete bleiben; Schaetzen nimmt nur Pakete mit drei Zahlen", async () => {
  const { p, errs } = await phone(null);
  await openTurn(p, "schaetzen");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.locator(".qzpack").first().waitFor();
  const titles = await p.locator(".qzpack b").allTextContents();
  assert.ok(titles.includes("🌙 Unsere Planeten") && !titles.includes("🌙 Ritter und Burgen"), titles.join());
  await p.getByRole("button", { name: /🌙 Körper und Skelett/ }).tap();
  // Review B2 #4: Schätzen counts only its number questions, and all three fit
  assert.equal(await p.locator(".qzfoot .note").textContent(), "Alle 3 Fragen passen in den Link.");
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  const d = await doc(p);
  assert.deepEqual(d.pk.z, [206, 24, 7]);
  await p.locator("#panel input[type=range]").first().waitFor();
  await shot(p, "8-schaetzen");
  await p.getByRole("button", { name: "📦 Körper und Skelett · ändern" }).tap();
  await p.getByRole("button", { name: "✨ Thema" }).tap();
  await p.getByLabel("Thema").fill("Vulkane");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.locator(".aistate").waitFor();
  assert.equal(await p.locator(".aistate").textContent(), "KI gerade nicht erreichbar. Nichts verbraucht.");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Typen-Quiz: Gruppenpaket, wer es macht sendet nur, jede Person sieht nur ihre Staerke", async () => {
  const { p, errs } = await phone(null);
  await openTurn(p, "typen");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.getByRole("button", { name: /🌙 Klassenfahrt: Wer bist du\?/ }).tap();
  assert.equal(await p.locator(".lbl", { hasText: "Ergebnistypen (nur Stärken)" }).count(), 1);
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  await p.getByRole("button", { name: "Weiter" }).tap();
  const h = await p.evaluate(() => window.Daily.docUrl(window.DailyApp.ed().next).split("#")[1]);
  const two = await phone(null, page + "#" + h);
  await two.p.getByRole("button", { name: "Dein Zug" }).tap();
  const k = await two.p.evaluate(() => window.DailyDebug.doc().pk.q.length);
  for (let i = 0; i < k; i++) await two.p.locator("#panel .chips .chip").first().tap();
  await two.p.getByText(/^Du bist: (Organisationstalent|Stimmungskanone|Entdeckergeist)$/).waitFor();
  await shot(two.p, "9-typ");
  assert.equal(await two.p.getByText("Jede Stärke zählt. Niemand wird verglichen.").count(), 1);
  assert.deepEqual(errs, []); assert.deepEqual(two.errs, []);
  await two.p.context().close(); await p.context().close();
});

test("Team-Quiz im Business-Flavor: Modus firma, Firmenpakete, jede Person sieht nur das eigene Ergebnis, keine Rangliste", async () => {
  require("../../scripts/ensure-build.js").ensureBuilt("business");
  const biz = "file://" + path.resolve(__dirname, "../../dist/business/index.html");
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? [503, {}] : null), biz);
  await openTurn(p, "quiz");
  await p.getByRole("button", { name: "📦 Fragenpaket wählen" }).tap();
  await p.locator(".qzpack").first().waitFor();
  assert.deepEqual(await p.locator(".qzpack b").allTextContents(), ["🌙 Datenschutz im Büro", "🌙 Gefälschte E-Mails erkennen"]);
  await p.getByRole("button", { name: "✨ Thema" }).tap();
  await p.getByLabel("Thema").fill("Brandschutz im Büro");
  await p.getByRole("button", { name: "✨ Fragen machen" }).tap();
  await p.locator(".aistate").waitFor();
  assert.equal(sent.find((x) => x.path === "ai").body.input.modus, "firma");
  await p.getByRole("button", { name: "🌙 Fertige Pakete" }).tap();
  await p.getByRole("button", { name: /🌙 Datenschutz im Büro/ }).tap();
  await p.getByRole("button", { name: "Übernehmen" }).tap();
  await p.getByRole("button", { name: "Weiter" }).tap();
  const h = await p.evaluate(() => window.Daily.docUrl(window.DailyApp.ed().next).split("#")[1]);
  const two = await phone(null, biz + "#" + h);
  await two.p.getByRole("button", { name: "Eintragen" }).tap();          // the business words for "your move"
  const k = await two.p.evaluate(() => window.DailyDebug.doc().pk.q.length);
  for (let i = 0; i < k; i++) await two.p.locator("#panel .chips .chip").first().tap();
  await two.p.getByText(new RegExp("^Du: \\d von " + k + " richtig$")).waitFor();
  await two.p.getByText("Nur du siehst dein Ergebnis. Es gibt keine Rangliste.").waitFor();
  assert.equal(await two.p.getByText(/Spieler/).count(), 0, "keine Namen, kein Vergleich");
  await shot(two.p, "10-team");
  assert.deepEqual(errs, []); assert.deepEqual(two.errs, []);
  await two.p.context().close(); await p.context().close();
});
