"use strict";
// The quiz cards with a fixed pack (src/quizspiele.js) over real links between devices, pinned to the cards (#i=), never to
// today: Echt oder Phishing? in the Business build with three colleagues (de/en/de, phone, laptop across, 200 % zoom), the
// team result from 5 on; Was kostet das? in the Daily build as a pair (invite, second phone answers, result back to the first).
// On every screen the main button is visible without scrolling and nothing lies on it. QUIZ_SHOTS=<dir> keeps screenshots.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { execFileSync } = require("node:child_process");
const G = require("./lib/grund.js");
const root = path.join(__dirname, "../..");
execFileSync(process.execPath, [path.join(root, "scripts/build.js")]);
execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);
const SHOTS = process.env.QUIZ_SHOTS || "";
const snap = (p, n) => (SHOTS ? p.screenshot({ path: path.join(SHOTS, "quizpack-" + n + ".png") }) : null);
// the screens of the task: 328x700 and 390x844 phones, 1280x800 at 200 % (640x400) and 1024x768 at 200 % (512x384)
const VIEWS = { phone328h: { viewport: { width: 328, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, phone390: G.VIEWS.phone390, zoom200quer: G.VIEWS.zoom200quer, zoom200: G.VIEWS.zoom200 };
Object.assign(G.VIEWS, { phone328h: VIEWS.phone328h });
const hash = (u) => "#" + u.split("#")[1];
const url = (p) => p.evaluate(() => window.DailyDebug.result().url);
const main = (p) => p.locator("#edmain");
// The main button of the editor (footer): fully on screen, and what lies at its centre is the button itself.
async function mainFree(p, at) {
  await p.waitForTimeout(300);   // after a step the button takes no tap for 250 ms (turn-ui.js walk: pointer-events none)
  const r = await p.evaluate(() => { const b = document.getElementById("edmain"); if (!b || b.hidden) return "versteckt"; const x = b.getBoundingClientRect(), h = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
    return x.top >= 0 && x.bottom <= innerHeight + 0.5 && x.left >= 0 && x.right <= innerWidth + 0.5 && (h === b || b.contains(h)) ? "" : "verdeckt oder ausserhalb: " + (h ? h.id || h.className : "-"); });
  assert.equal(r, "", "Hauptknopf frei: " + at);
}
async function homeFree(p, at) {
  assert.ok(await G.inView(p, "#go"), "Hauptknopf sichtbar: " + at);
  assert.deepEqual(await G.covered(p), [], "nichts liegt auf den Knoepfen: " + at);
}
// one colleague plays all ten: answers from `pick(i, isPhish)`, checks each answer screen (the detail marked, the reason)
async function playPhish(p, pick, at, shots) {
  await p.locator("#go").click();
  await p.locator("#panel .note", { hasText: /Wer sieht was\?|Who sees what\?/ }).waitFor();
  const intro = await p.locator("#panel").innerText();
  assert.match(intro, /Nicht-Teilnahme hat keine Folgen|Not taking part has no consequences/);
  assert.match(intro, /Pflichtschulung|mandatory training/); assert.match(intro, /Betriebsrat|works council/);
  assert.match(intro, /Keine KI|No AI/); assert.match(intro, /Kein Server|No server/);
  await mainFree(p, at + " Einstieg");
  if (shots) await snap(p, "phish-1-einstieg-" + at);
  await main(p).click();
  const facts = await p.evaluate(() => { const d = window.DailyDebug.doc(); return window.QuizSpiele.phishItems(d).map((k) => window.QuizSpiele.isPhish(k)); });
  let right = 0;
  for (let i = 0; i < 10; i++) {
    await p.locator("#panel .qmail").waitFor();
    assert.equal(await p.locator("#panel .qmail mark").count(), 0, "vor der Antwort nichts markiert");
    assert.equal(await main(p).getAttribute("aria-disabled"), "true", "Weiter gesperrt, bis geantwortet");
    if (i === 0) {
      await main(p).click({ force: true });   // a tap on the locked button says why
      assert.match(await p.locator("#edwhy").textContent(), /^(Noch offen|Still open): /);
      assert.deepEqual(await G.smallTargets(p, "#panel", 48), [], "Antworten mindestens 48 px: " + at);
      // the answers stay in view while the example is longer than the panel (sticky at its foot)
      await p.waitForTimeout(500);
      assert.equal(await p.evaluate(() => { const c = document.querySelector("#panel .qmail ~ .chips .chip:last-child"), pa = document.getElementById("panel"), r = c.getBoundingClientRect(), q = pa.getBoundingClientRect();
        return r.top >= q.top - 0.5 && r.bottom <= q.bottom + 0.5 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === c; }), true, "Antworten ohne Scrollen sichtbar: " + at);
      if (shots) await snap(p, "phish-2-mail-" + at);
    }
    const phish = pick(i, facts[i]);
    if (phish === facts[i]) right++;
    await p.locator("#panel .chips .chip").nth(phish ? 1 : 0).click();
    await p.locator("#panel .qmail mark").waitFor();
    assert.equal(await p.locator("#panel .qmwhy").count(), 1);
    assert.match(await p.locator("#panel .qtext").first().innerText(), phish === facts[i] ? /^(Richtig|Right)\./ : /^(Daneben|Not quite)\./);
    if (shots && i < 2) await snap(p, "phish-3-aufloesung-" + i + "-" + at);
    await mainFree(p, at + " Aufloesung " + i);
    await main(p).click();
  }
  await p.locator("#panel .qtext", { hasText: new RegExp("^" + right + " (von|of) 10 ") }).waitFor();
  return right;
}

test("Echt oder Phishing? (Business): drei Geraete reichen den Link weiter, jede Person sieht nur das eigene Ergebnis, das Team-Ergebnis ab 5", async () => {
  const b = await G.launch(); try {
    const [ana, ben, cem] = await G.people(b, 3, { lang: ["de", "en", "de"], view: ["phone328h", "zoom200quer", "zoom200"] });
    const a = await G.open(ana, "#i=biz-quiz-phishing", { flavor: "business" });
    assert.equal((await a.locator("#hero").textContent()).replace(/\s+/g, ""), "EchtoderPhishing?");
    await homeFree(a, "ana start"); await snap(a, "phish-0-karte-de-328x700");
    const ra = await playPhish(a, (i, f) => f, "ana-de-328x700", true);    // Ana gets all ten right
    assert.equal(ra, 10);
    assert.match(await a.locator("#panel").innerText(), /Das eigene Ergebnis steht nur auf diesem Gerät/);
    assert.match(await a.locator("#panel").innerText(), /Noch zu wenig Teilnahmen: 1 von 5/);
    await snap(a, "phish-4-eigenes-ergebnis-de");
    await main(a).click(); await a.getByText("Fertig. Den Link im Team weitergeben.").waitFor();
    assert.equal((await main(a).textContent()).trim(), "Im Team weitergeben");
    await main(a).click(); await a.locator("#share").waitFor();
    const one = await url(a);

    // Ben, English, on a laptop at 200 %: the same ten examples from the seed, the link has no name
    const pb = await G.open(ben, hash(one), { flavor: "business" });
    assert.match(await pb.locator("#from").innerText(), /No names/);
    assert.equal((await pb.locator("#go").textContent()).trim(), "Take part");
    await homeFree(pb, "ben en 640x400"); await snap(pb, "phish-5-empfangen-en-640x400");
    const same = await Promise.all([a, pb].map((p) => p.evaluate((h) => { const r = window.Daily.parseRoute(h); return window.QuizSpiele.phishItems(r.doc); }, hash(one))));
    assert.deepEqual(same[0], same[1]);
    const rb = await playPhish(pb, () => false, "ben-en-640x400", true);   // Ben calls everything real
    assert.match(await pb.locator("#panel").innerText(), /Not enough people yet: 2 of 5/);
    assert.match(await pb.locator("#panel").innerText(), new RegExp(rb + " of 10 right"));
    await main(pb).click(); await main(pb).click(); await pb.locator("#share").waitFor();
    const two = await url(pb);

    // Cem, German, 1024x768 at 200 %
    const pc = await G.open(cem, hash(two), { flavor: "business" });
    await homeFree(pc, "cem de 512x384");
    await playPhish(pc, (i, f) => (i < 5 ? f : !f), "cem-de-512x384", false);   // half right
    assert.match(await pc.locator("#panel").innerText(), /Noch zu wenig Teilnahmen: 3 von 5/);
    await main(pc).click(); await main(pc).click(); await pc.locator("#share").waitFor();
    const three = await url(pc);
    // nothing per person in the link: one number each, no name
    const moves = await pc.evaluate((h) => { const d = window.Daily.parseRoute(h).doc; return window.Turns.unseal(d.q, d.seed); }, hash(three));
    assert.equal(moves.length, 3); assert.ok(moves.every((x) => Number.isInteger(x)));
    assert.ok(!/Ana|Ben|Cem/.test(decodeURIComponent(three)));

    // two more colleagues (played here like the test of the engine does), then the link comes back to Ana: team result
    const five = await pc.evaluate((h) => { let d = window.Daily.parseRoute(h).doc; for (const m of [1023, 0]) d = window.Turns.play(d, window.QuizSpiele.full(m), 0); return "#" + window.Daily.docUrl(d).split("#")[1]; }, hash(three));
    const back = await G.open(ana, five, { flavor: "business" });
    const face = await back.evaluate(() => window.Turns.face(window.DailyDebug.home().doc, window.Kit.lang));
    assert.match(face[0], /^Team: im Schnitt \d+(,\d)? von 10 erkannt · 5 Teilnahmen$/); assert.equal(face[1], "Ohne Namen");
    await homeFree(back, "ana zurueck"); await back.waitForTimeout(500); await snap(back, "phish-6-team-zurueck-de");
    const fen = await pb.evaluate((h) => window.Turns.face(window.Daily.parseRoute(h).doc, "en"), five);
    assert.match(fen[0], /^Team: on average \d+(\.\d)? of 10 right · 5 people$/);
    for (const p of [a, pb, pc, back]) assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

test("Was kostet das? (Daily): Einladung, zweites Handy schaetzt dieselben 8 Preise, Ergebnis mit Quelle und Stand zurueck zum ersten, de/en", async () => {
  const b = await G.launch(); try {
    const [mia, jon] = await G.people(b, 2, { lang: ["de", "en"], view: ["phone390", "phone328h"] });
    const a = await G.open(mia, "#i=quiz-preis");
    assert.equal((await a.locator("#hero").textContent()).replace(/\s+/g, ""), "Waskostetdas?");
    await homeFree(a, "mia de 390"); await snap(a, "preis-0-karte-de-390x844");
    await a.locator("#go").click();
    await a.locator("#panel input[type=range]").waitFor();
    const facts = await a.evaluate(() => { const d = window.DailyDebug.doc(), Q = window.QuizSpiele; return Q.preisItems(d).map((k, i) => [Q.cents(k), Q.top(d, i)]); });
    for (let i = 0; i < 8; i++) {
      await a.locator("#panel .lbl", { hasText: "Preis " + (i + 1) + " von 8" }).waitFor();
      assert.match(await a.locator("#panel .qtext").first().innerText(), /: Was kostet das\?$/);
      assert.match(await a.locator("#panel .slide b").innerText(), /^\d+,\d\d €$/);
      assert.deepEqual(await G.smallTargets(a, "#panel"), [], "Tippflaechen 44 px");
      if (i === 0) {
        await a.getByRole("button", { name: "Größer" }).click(); await a.getByRole("button", { name: "Größer" }).click(); await a.getByRole("button", { name: "Kleiner" }).click();
        await snap(a, "preis-1-regler-de");
      }
      // Mia guesses 20 % too high (as far as the slider goes)
      const v = Math.min(facts[i][1], Math.round(facts[i][0] * 1.2 / 5) * 5);
      await a.locator("#panel input[type=range]").evaluate((r, x) => { r.value = x; r.dispatchEvent(new Event("input", { bubbles: true })); }, v);
      await mainFree(a, "mia Preis " + i);
      await main(a).click();
    }
    await a.getByText("Zug steht. Unten verschicken.").waitFor();
    await main(a).click(); await a.locator("#share").waitFor();
    const inv = await url(a);

    const pj = await G.open(jon, hash(inv));
    assert.equal((await pj.locator("#go").textContent()).trim(), "Your move");
    await homeFree(pj, "jon en 328x700"); await snap(pj, "preis-2-einladung-en-328x700");
    await pj.locator("#go").click();
    for (let i = 0; i < 8; i++) {
      await pj.locator("#panel .lbl", { hasText: "Price " + (i + 1) + " of 8" }).waitFor();
      assert.match(await pj.locator("#panel .qtext").first().innerText(), /: what does it cost\?$/);
      assert.match(await pj.locator("#panel .slide b").innerText(), /^€\d+\.\d\d$/);
      if (i === 0) await snap(pj, "preis-3-regler-en");
      // Jon is spot on
      await pj.locator("#panel input[type=range]").evaluate((r, x) => { r.value = x; r.dispatchEvent(new Event("input", { bubbles: true })); }, facts[i][0]);
      await mainFree(pj, "jon Preis " + i);
      await main(pj).click();
    }
    await pj.getByText("Player 2 was closer.").first().waitFor();
    const txt = await pj.locator("#panel").innerText();
    assert.match(txt, /Player 2: on average 0 percent off/); assert.match(txt, /Player 1: on average 1\d percent off|Player 1: on average 20 percent off/);
    assert.ok(!/\(guesses €[\d.]+ \/ (€[\d.]+)\)/.test(txt.replace(/€([\d.]+) \(guesses €[\d.]+ \/ €\1\)/g, "")), "Jon trifft jeden Preis genau (5-Cent-Schritte)");
    assert.match(txt, /November 2026/); assert.match(txt, /€\d+\.\d\d \(guesses €/);
    await snap(pj, "preis-4-ergebnis-en");
    await main(pj).click(); await pj.locator("#share").waitFor();
    const done = await url(pj);

    // the result goes back to Mia: the same result on her phone, in German
    const back = await G.open(mia, hash(done));
    await homeFree(back, "mia zurueck");
    await back.locator("#go").click();
    await back.getByText("Spieler 2 lag näher dran.").first().waitFor();
    const t2 = await back.locator("#panel").innerText();
    assert.match(t2, /Richtwerte: gerundete Schätzung für Deutschland, Stand November 2026, keine Marke/);
    assert.match(t2, /\d,\d\d € \(Tipps \d+,\d\d € \/ \d+,\d\d €\)/);
    await snap(back, "preis-5-ergebnis-zurueck-de");
    for (const p of [a, pj, back]) assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

test("Beide Karten auf allen vier Bildschirmen in de und en: Hauptknopf ohne Scrollen, nichts deckt ihn zu, im ersten Schritt auch der Weiter-Knopf", async () => {
  const b = await G.launch(); try {
    for (const [card, flavor] of [["biz-quiz-phishing", "business"], ["quiz-preis", ""]]) for (const view of Object.keys(VIEWS)) for (const lang of G.LANGS) {
      const ctx = await G.person(b, { view, lang }), p = await G.open(ctx, "#i=" + card, { flavor }), at = card + " " + view + " " + lang;
      await p.waitForTimeout(400);
      await homeFree(p, at);
      await p.locator("#go").click();
      await p.locator(card === "quiz-preis" ? "#panel input[type=range]" : "#panel .note").first().waitFor();
      await mainFree(p, at + " erster Schritt");
      if (card !== "quiz-preis") { await main(p).click(); await p.locator("#panel .qmail").waitFor(); await mainFree(p, at + " erste Mail"); }
      if (view === "zoom200quer" && lang === "en") await snap(p, "alle-" + card + "-" + view + "-" + lang);
      assert.deepEqual(p.errs, [], at); await ctx.close();
    }
  } finally { await b.close(); }
});

// The web route with the part quiz refused (404): the card does not hang on "one moment", it says that a part is missing.
test("Ohne Teil quiz (Web, Datei fehlt): die Karte sagt, dass ein Teil fehlt, statt zu warten", async () => {
  const fs = require("node:fs"), http = require("node:http"), dist = path.join(G.DIST, "business");
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), m = u.pathname.match(/^\/business\/parts\/([a-z]+)\.[0-9a-f]{12}\.js$/);
    if (u.pathname === "/business/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return void res.end(fs.readFileSync(path.join(dist, "index.html"))); }
    if (m && m[1] !== "quiz") { res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); return void res.end(fs.readFileSync(path.join(dist, u.pathname.slice(10)))); }
    res.writeHead(404).end();
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const b = await G.launch(); try {
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto("http://127.0.0.1:" + srv.address().port + "/business/#i=biz-quiz-phishing");
    await p.locator("#go").click();
    await p.locator("#panel").getByText("Dieser Teil fehlt gerade. Bitte die Seite neu laden.").waitFor();
    assert.equal(await p.locator("#panel .qmail").count(), 0);
    assert.deepEqual(errs, []); await ctx.close();
  } finally { await b.close(); srv.close(); }
});
