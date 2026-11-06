"use strict";
const { ensureBuilt } = require("../../scripts/ensure-build.js");
// biz-weihnachtsfeier (Katalog v2, V1): Termin + Ort + Kosten pro Kopf in einem Link, mit versiegelten Stimmen, ueber
// vier Geraete (eigene Browser-Kontexte, de und en): nur das Geraet der Orga oeffnet die Antworten und zeigt Summen erst
// ab fuenf; das Ende ist signiert. Fest auf die Karte gepinnt (#i=biz-weihnachtsfeier) und auf den 16.11.2026.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const G = require("./lib/grund.js");
const Tn = require("../../src/turns.js");
ensureBuilt(""); ensureBuilt("business");   // dist as npm run test:e2e built it; a build only after an edit
const shot = process.env.FEI_SHOTS;
const snap = (p, n) => (shot ? p.screenshot({ path: path.join(shot, "fei-" + n + ".png") }) : null);
const TIME = "2026-11-16T09:00:00Z", BIZ = { flavor: "business" };
const hash = (u) => "#" + u.split("#")[1];
const url = (p) => p.evaluate(() => window.DailyDebug.result().url);
const main = (p) => p.locator("#edmain").click();
const send = async (p) => { await p.locator("#edmain").click(); await p.locator("#share").waitFor(); return url(p); };
const face = (p, l) => p.evaluate((x) => window.Turns.face(window.DailyDebug.home().doc, x), l);
const locked = (p) => p.locator("#edmain").getAttribute("aria-disabled");
// Screens of the task: 328x700 and 390x844 (phones), 640x400 (a 1280x800 laptop at 200 %), 512x384 (1024x768 at 200 %).
G.VIEWS.phone328h = { viewport: { width: 328, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SCREENS = ["phone328h", "phone390", "zoom200quer", "zoom200"];
// Only the page itself: every other host is refused and noted (company network, nothing goes out).
async function closed(ctx) { const asked = []; await ctx.route(/^(https?|wss?):/, (r) => { if (G.isLocal(r.request().url())) return r.fallback(); asked.push(r.request().url()); return r.abort("blockedbyclient"); }); return asked; }

// Organiser: two places, the first one renamed, accessibility tapped (required), costs typed. Neutral name on request.
async function setUp(p, o) {
  o = o || {};
  await p.locator("#go").click();
  await p.locator("#panel").getByText(o.en ? "Choose dates" : "Termine wählen").waitFor();
  assert.equal(await p.locator("#panel .chip.on", { hasText: "✕" }).count(), 3, "drei Abende vorbelegt");
  assert.equal(await locked(p), "false", "Weiter geht ohne Eingabe");
  if (o.neutral) await p.getByRole("button", { name: o.en ? "Year-end party" : "Jahresabschlussfeier", exact: true }).click();
  if (o.shot) await snap(p, o.shot + "-1-termine");
  await main(p);
  await p.locator("#panel").getByText(o.en ? "Enter two places" : "Zwei Orte eintragen").waitFor();
  const ort = p.locator("#panel .feiort");
  await ort.nth(0).locator("input.field").nth(0).fill("Zum Hirsch");
  await ort.nth(0).getByRole("button", { name: o.en ? "Step-free" : "Stufenlos" }).click();
  await ort.nth(0).getByRole("button", { name: o.en ? "Accessible toilet" : "Rollstuhl-WC" }).click();
  await ort.nth(0).locator("input.field").nth(1).fill(o.en ? "39.50" : "39,50");
  await ort.nth(0).locator("input.field").nth(2).fill("120");
  // the second place still lacks its accessibility: Weiter is locked and says why
  assert.equal(await locked(p), "true");
  assert.equal(await p.locator("#edwhy").textContent(), o.en ? "State the accessibility of At our office" : "Barrierefreiheit für Bei uns im Büro angeben");
  if (o.shot) await snap(p, o.shot + "-2-orte-gesperrt");
  for (const n of o.en ? ["Step-free", "Accessible toilet", "Hearing loop"] : ["Stufenlos", "Rollstuhl-WC", "Hörschleife"]) await ort.nth(1).getByRole("button", { name: n }).click();
  await ort.nth(1).locator("input.field").nth(1).fill("25");
  assert.equal(await locked(p), "false");
  await main(p);
  await p.locator("#panel").getByText(o.en ? "Done. Send it to the group below." : "Eingetragen. Unten in die Gruppe schicken.").waitFor({ timeout: 10000 });
  assert.equal((await p.locator("#edmain").textContent()).trim(), o.en ? "Send to the group" : "In die Gruppe schicken");
  if (o.shot) await snap(p, o.shot + "-3-fertig");
  return send(p);
}
// What a link really carries: the payload after #c= decoded as any reader could (base64url JSON, the seal opened with the
// seed that stands next to it, as Turns.unseal does).
function payload(u) {
  const raw = JSON.parse(Buffer.from(u.split("#c=")[1], "base64url").toString("utf8"));
  return { raw, text: JSON.stringify(raw), state: Tn.unseal(raw.d.q, raw.d.seed)[0] };
}
function link(doc) { return "#c=" + Buffer.from(JSON.stringify({ v: 1, d: doc })).toString("base64url"); }
// One answer: per date yes (0) / maybe (1) / no (2), one place, food wishes.
async function answer(p, o) {
  const X = o.en ? { yes: "Yes", maybe: "Maybe", no: "No" } : { yes: "Ja", maybe: "Vielleicht", no: "Nein" };
  await p.locator("#go").click();
  if (o.other) await p.getByRole("button", { name: o.en ? "Answer for another person" : "Für eine andere Person eintragen" }).click();
  const days = p.locator("#panel .feiday");
  await days.first().waitFor();
  assert.equal(await locked(p), "true", "keine Antwort vorbelegt");
  await p.locator("#panel").getByText(o.en ? "Always answer the latest link." : "Immer auf den neuesten Link antworten.").waitFor();
  assert.match((await p.locator("#panel .qtext").first().textContent()).replace(/\s+/g, " "), o.en ? /^\d+ sealed answers?$/ : /^\d+ versiegelte Antwort(en)?$/);
  await p.locator("#panel").getByText(o.en ? "Answer sealed – only the organiser sees the totals" : "Antwort versiegelt – nur die Orga sieht die Summen", { exact: true }).first().waitFor();
  for (let i = 0; i < o.dates.length; i++) await days.nth(i).locator(".chip").nth(o.dates[i]).click();
  if (o.shot) await snap(p, o.shot + "-1-wann");
  await main(p);
  await p.locator("#panel .feipick").first().waitFor();
  if (o.shot) await snap(p, o.shot + "-2-wo");
  await p.locator("#panel .feipick", { hasText: o.place }).click();   // one tap and on
  await p.locator("#panel").getByText(o.en ? "Food and drink (optional)" : "Essen und Trinken (freiwillig)").waitFor();
  await p.locator("#panel").getByText(o.en ? "Please tell the organiser about intolerances directly." : "Unverträglichkeiten bitte direkt an die Orga.").waitFor();
  assert.equal(await p.getByRole("button", { name: /Intoleran|Unverträglich/ }).count(), 0, "keine Unvertraeglichkeit im Link");
  for (const m of o.menu || []) await p.getByRole("button", { name: m }).click();
  await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");   // sealed
  if (o.shot) await snap(p, o.shot + "-3-essen");
  await main(p);
  return send(p);
}
// What a page shows of the poll, wherever it is: the sheet, the step, the picture's lines.
const shown = async (p) => (await p.locator("body").innerText()) + "\n" + JSON.stringify(await p.evaluate(() => { const d = window.DailyDebug.home() && window.DailyDebug.home().doc; return d ? window.Turns.face(d, "de") : null; }));
// Open a link on a device that just stored something in another tab (the organiser's keys, the own box): Chromium hands
// localStorage writes to other pages of the context asynchronously and the app reads its storage once at start, so wait
// until the key is there, then load again (in real use the link is opened much later).
async function openWith(ctx, h, key) {
  const p = await G.open(ctx, h, BIZ);
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem("daily.v1") || "{}")[k], key);
  await p.reload(); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  return p;
}
// A wait that, when it fails, says what the page shows instead (CI runs on Linux only).
async function see(p, loc, what) {
  try { await loc.waitFor(); } catch (e) {
    const st = await p.evaluate(() => ({ panel: (document.getElementById("panel") || {}).innerText, why: (document.getElementById("edwhy") || {}).textContent, store: Object.keys(JSON.parse(localStorage.getItem("daily.v1") || "{}")) })).catch((x) => String(x));
    throw new Error(what + ": " + JSON.stringify(st).slice(0, 2500) + " errs " + p.errs.join(" | ") + " " + e.message);
  }
}
const TOTALS = /Termin vorne|Leading date|Zusage|pro Kopf bei|per head with|\d+ Ja,|\d+ yes,|\d+ vegetari|\d+ alkoholfrei|\d+ alcohol-free|Ort vorne|Leading place|Gleichstand|\btie\b/i;

test("Vier Geraete, de und en: versiegelt abstimmen, Orga sieht erst ab fuenf Summen, fuehrt Gabelungen zusammen, beendet signiert; ein Ende von Hand gilt nicht", async () => {
  const b = await G.launch(); try {
    // web: each device keeps several pages open and relies on what another of its pages stored (see grund.js)
    const [ana, ben, cem, dana] = await G.people(b, 4, { lang: ["de", "en", "de", "de"], view: ["phone390", "phone328h", "quer", "phone390"], time: TIME, web: true });
    const out = [await closed(ben), await closed(cem), await closed(dana)];
    const a = await G.open(ana, "#i=biz-weihnachtsfeier", BIZ);
    assert.match(await a.locator("#hero").textContent(), /Weihnachtsfeier/);
    const one = await setUp(a, { shot: "ana" });
    assert.match(one, /^https:\/\/bunsenbrenner\.org\/business#c=/, "langer Link, laeuft ohne Kurzlink-Server");
    const keys = await a.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).feiorg);
    const ex = Object.keys(keys)[0], P1 = payload(one);
    assert.deepEqual(P1.state[2].slice(0, 2).map((x) => Buffer.from(x, "base64url").length), [32, 32], "zwei oeffentliche Schluessel im Link");
    assert.equal(P1.state[2][0], ex);
    assert.ok(!P1.text.includes(keys[ex].e.d) && !P1.text.includes(keys[ex].s.d), "kein privater Schluessel im Link");

    const p1 = await G.open(ben, hash(one), BIZ);
    assert.match(await p1.locator("#from").textContent(), /Poll running\. Answers are sealed\./);
    await snap(p1, "ben-0-empfangen");
    const two = await answer(p1, { en: true, dates: [0, 1, 2], place: "Zum Hirsch", menu: ["Vegetarian"], shot: "ben" });
    const p2 = await G.open(cem, hash(two), BIZ);
    assert.deepEqual(await face(p2, "de"), ["Antwort versiegelt – nur die Orga sieht die Summen", "1 versiegelte Antwort"]);
    const three = await answer(p2, { dates: [0, 0, 2], place: "Zum Hirsch", menu: ["Alkoholfreie Getränke"], shot: "cem" });
    const p3 = await G.open(dana, hash(three), BIZ);
    const four = await answer(p3, { dates: [2, 0, 0], place: "Bei uns im Büro" });

    // the link itself: dates, places, keys, a count and sealed boxes; no answer, no total, no name, no wish in the clear
    const P3 = payload(three), P4 = payload(four);
    assert.deepEqual(P4.state[0], P1.state[0]); assert.deepEqual(P4.state[1], P1.state[1], "Termine und Orte wie angelegt, ohne Zaehler");
    assert.deepEqual([P4.state[2][2], P4.state[2][3].length / 56, P4.state[2][4]], [3, 3, 0], "drei Antworten, drei Bloecke, kein Ende");
    assert.equal(P4.state[2][3].slice(0, 112), P3.state[2][3], "der naechste Link haengt nur einen versiegelten Block an");
    // Only what stands in the clear: keys, sealed boxes and the seal are base64url runs, and random base64 spells "ben" or
    // "ANA" now and then (about one link in ten), which is no name. A word in the clear never runs 16 such characters long.
    const clear = (x) => x.replace(/[A-Za-z0-9_-]{16,}/g, " ");
    assert.ok(!/Ana|Ben|Cem|Dana|Vegetari|Alkohol|alcohol/i.test(clear(P4.text + JSON.stringify(P4.state))), "keine Namen, keine Wuensche im Link");
    assert.ok(!(P4.raw.d.by || []).length, "keine Spur mit Namen");
    for (const u of [two, three, four]) {   // [neutral, dates], two places, [key, key, count, boxes, 0]: nothing else, no list of counts
      const st = payload(u).state;
      assert.deepEqual([st.length, st[0].length, st[1].map((x) => x.length), st[2].length, typeof st[2][2], typeof st[2][3], st[2][4]], [3, 2, [4, 4], 5, "number", "string", 0]);
    }

    // no browser but the organiser's sees a total: not on the sheet, not in the step, not in the picture
    for (const [ctx, en] of [[ben, true], [cem, false], [dana, false]]) {
      const q = await openWith(ctx, hash(four), "fei");
      assert.doesNotMatch(await shown(q), TOTALS, "Startblatt ohne Summen");
      await q.locator("#go").click();
      await q.locator("#panel").getByText(en ? "This device has already answered." : "Von diesem Gerät ist schon eine Antwort drin.").first().waitFor({ state: "attached" });   // the wide layout may scroll it out of view
      assert.doesNotMatch(await shown(q), TOTALS, "Schritt ohne Summen");
      assert.equal(await q.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).feiorg), undefined, "kein Schluessel auf diesem Geraet");
      if (en) await snap(q, "ben-4-schon-drin");
      assert.deepEqual(q.errs, []); await q.close();
    }

    // the organiser with three answers: below five no total, and no end
    const o4 = await openWith(ana, hash(four), "feiorg");
    await o4.locator("#go").click();
    const dash = o4.locator("#panel .feiorg");
    await see(o4, dash.getByText("Noch zu wenig Stimmen: 3 von 5", { exact: true }), "Orga mit drei Antworten");
    assert.doesNotMatch(await dash.innerText(), TOTALS);
    assert.equal(await dash.getByRole("button", { name: "Abstimmung beenden und Ergebnis teilen" }).getAttribute("aria-disabled"), "true");
    await dash.getByText("Beenden geht ab 5 Antworten").waitFor();
    await snap(o4, "ana-3-zu-wenig");

    // two answers on the same link at once (a fork): Ben and Cem answer for another person each
    const p5a = await openWith(ben, hash(four), "fei");
    const fiveA = await answer(p5a, { en: true, other: true, dates: [0, 2, 2], place: "Zum Hirsch" });
    const p5b = await openWith(cem, hash(four), "fei");
    const fiveB = await answer(p5b, { other: true, dates: [1, 1, 2], place: "Bei uns im Büro", menu: ["Vegan"] });
    assert.equal(payload(fiveA).state[2][2], 4); assert.equal(payload(fiveB).state[2][2], 4, "jede Gabel zaehlt vier");

    // Ana opens one fork, pastes the other: the device takes the missing box, no double, and from five shows the totals
    const o5 = await openWith(ana, hash(fiveA), "feiorg");
    await o5.locator("#go").click();
    const d5 = o5.locator("#panel .feiorg");
    await see(o5, d5.getByText("Noch zu wenig Stimmen: 4 von 5", { exact: true }), "Orga mit vier Antworten");
    await d5.locator("textarea").fill("Neu: " + fiveB + "\nund noch einmal " + fiveA + " " + four);
    await d5.getByRole("button", { name: "Antworten übernehmen" }).click();
    await o5.getByText("1 neue Antwort übernommen").waitFor();
    const want = ["Termin vorne: Do 3.12., 18 Uhr", "Ort vorne: Zum Hirsch", "Zum Hirsch: ≈ 79,50 € pro Kopf bei 3 Zusagen, im Rahmen des Freibetrags von 110 €", "Zum Hirsch: Stufenlos · Rollstuhl-WC",
      "Do 3.12., 18 Uhr: 3 Ja, 1 Vielleicht", "Fr 4.12., 18 Uhr: 2 Ja, 2 Vielleicht", "Do 10.12., 18 Uhr: 1 Ja, 0 Vielleicht", "Essen: 1 vegetarisch, 1 vegan, 1 alkoholfrei", "5 Antworten", "Auf diesem Gerät gesammelt: 5"];
    for (const s of want) await d5.getByText(s, { exact: true }).waitFor();
    await o5.waitForTimeout(300); await snap(o5, "ana-5-summen");

    // a hand-made end (totals and signature made up, the poll's own keys): a receiver does not take it as ended
    const fake = JSON.parse(JSON.stringify(payload(fiveA)));
    fake.state[2] = [fake.state[2][0], fake.state[2][1], 5, "", [[5, [5, 0, 0], [0, 0, 0], [0, 5], [0, 0, 0]], Buffer.alloc(64, 7).toString("base64url")]];
    fake.raw.d.q = Tn.seal([fake.state], fake.raw.d.seed);
    const forged = await G.open(dana, link(fake.raw.d), BIZ);
    assert.doesNotMatch(await forged.locator("body").innerText(), /Abstimmung beendet|Termin vorne/);
    assert.deepEqual(await forged.evaluate(() => { const d = window.DailyDebug.home().doc; return [window.Turns.moves(d).length, window.Turns.result(d, "de")]; }), [0, null], "ein Ende von Hand gilt nicht");
    assert.deepEqual(forged.errs, []);

    // the real end: signed on Ana's device, the result link carries totals only, and everyone sees them
    await d5.getByRole("button", { name: "Abstimmung beenden und Ergebnis teilen" }).click();
    await o5.locator("#panel").getByText(/^Beendet\./).waitFor();
    const six = await send(o5), P6 = payload(six);
    assert.equal(P6.state[2][3], "", "keine Bloecke im Ergebnis-Link");
    assert.deepEqual(P6.state[2][4][0], [5, [3, 2, 1], [1, 2, 0], [3, 2], [1, 1, 1]], "nur Summen");
    assert.equal(Buffer.from(P6.state[2][4][1], "base64url").length, 64, "mit Signatur");
    const res = await G.open(ben, hash(six), BIZ);
    assert.match(await res.locator("#from").textContent(), /Poll ended\./);
    await res.locator("#go").click();
    const panel = res.locator("#panel");
    await panel.getByText("Leading date: Thu 12/3, 6 pm").first().waitFor();
    for (const s of ["Leading place: Zum Hirsch", "Zum Hirsch: ≈ €79.50 per head with 3 yeses, within the tax-free €110", "Zum Hirsch: Step-free · Accessible toilet",
      "Thu 12/3, 6 pm: 3 yes, 1 maybe", "Food: 1 vegetarian, 1 vegan, 1 alcohol-free", "5 answers"]) await panel.getByText(s, { exact: true }).waitFor();
    await panel.getByText(/Section 19\(1\) No\. 1a EStG/).waitFor();
    await snap(res, "ben-5-ergebnis");
    // the same result link with one total changed: the signature no longer fits
    const bent = JSON.parse(JSON.stringify(P6)); bent.state[2][4][0][3] = [2, 3]; bent.raw.d.q = Tn.seal([bent.state], bent.raw.d.seed);
    const bad = await G.open(cem, link(bent.raw.d), BIZ);
    assert.deepEqual(await bad.evaluate(() => window.Turns.result(window.DailyDebug.home().doc, "de")), null, "geaenderte Summe: kein Ergebnis");
    assert.deepEqual(out.flat(), [], "nichts geht nach draussen");
    for (const p of [a, p1, p2, p3, o4, p5a, p5b, o5, res, bad]) assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

test("Neutral: Jahresabschlussfeier reist als Titel mit; die Jugend-App oeffnet den Link mit derselben Karte", async () => {
  const b = await G.launch(); try {
    const [ana, ben] = await G.people(b, 2, { lang: ["en", "de"], view: "phone390", time: TIME });
    const a = await G.open(ana, "#i=biz-weihnachtsfeier", BIZ);
    const one = await setUp(a, { en: true, neutral: true, shot: "neutral" });
    const p = await G.open(ben, hash(one), BIZ);
    assert.match((await p.locator("#hero").innerText()).replace(/\s+/g, " "), /Plan the year-end party/);
    await p.waitForTimeout(400); await snap(p, "neutral-empfangen");
    const y = await G.open(ben, hash(one));   // dist/index.html, the youth app: same part turnzwei, same card
    await y.locator("#go").click();
    await y.locator("#panel").getByText("Passende Termine antippen").waitFor();
    assert.equal(await y.locator("#panel .feiday").count(), 3);
    for (const x of [a, p, y]) assert.deepEqual(x.errs, []);
  } finally { await b.close(); }
});

test("Hauptknopf ohne Scrollen und unverdeckt auf 328x700, 390x844, 640x400, 512x384 (de/en): Blatt, empfangener Link, jeder Schritt; Tippflaechen", async () => {
  const b = await G.launch(); try {
    // one link to receive, made once
    const [maker] = await G.people(b, 1, { lang: "de", view: "phone390", time: TIME });
    const link = hash(await setUp(await G.open(maker, "#i=biz-weihnachtsfeier", BIZ)));
    const free = (p) => p.evaluate(() => { const e = document.getElementById("edmain"), r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); });
    for (const view of SCREENS) for (const lang of G.LANGS) {
      const at = view + " " + lang, ctx = await G.person(b, { view, lang, time: TIME });
      const home = await G.open(ctx, "#i=biz-weihnachtsfeier", BIZ);
      await home.waitForTimeout(500);
      assert.ok(await G.inView(home, "#go"), "Blatt: " + at); assert.deepEqual(await G.covered(home), [], "Blatt: " + at);
      await snap(home, "blatt-" + view + "-" + lang);
      await home.locator("#go").click();
      if (shot) await home.waitForTimeout(300).then(() => snap(home, "editor-" + view + "-" + lang));
      for (let step = 0; step < 2; step++) {
        await home.locator("#panel .fei").first().waitFor();
        await home.waitForTimeout(300);   // after a step the main button takes no tap for 250 ms (turn-ui.js), elementFromPoint looks through it
        assert.ok(await G.inView(home, "#edmain"), "Anlegen " + step + ": " + at); assert.ok(await free(home), "Anlegen " + step + " unverdeckt: " + at);
        assert.deepEqual(await G.smallTargets(home, "#panel", 44), [], "Tippflaechen " + at);
        assert.deepEqual(await G.smallTargets(home, "#panel .fei", 48), [], "Business 48 px " + at);
        if (step === 0) await main(home);
      }
      await snap(home, "orte-" + view + "-" + lang);
      const got = await G.open(ctx, link, BIZ);
      await got.waitForTimeout(500);
      assert.ok(await G.inView(got, "#go"), "Empfangen: " + at); assert.deepEqual(await G.covered(got), [], "Empfangen: " + at);
      await snap(got, "empfangen-" + view + "-" + lang);
      await got.locator("#go").click(); await got.locator("#panel .feiday").first().waitFor(); await got.waitForTimeout(300);
      assert.ok(await G.inView(got, "#edmain"), "Abstimmen: " + at); assert.ok(await free(got), "Abstimmen unverdeckt: " + at);
      assert.deepEqual(await G.smallTargets(got, "#panel .fei", 48), [], "Abstimmen 48 px " + at);
      await snap(got, "wann-" + view + "-" + lang);
      for (const p of [home, got]) assert.deepEqual(p.errs, [], at);
      await ctx.close();
    }
  } finally { await b.close(); }
});

test("Dunkel und Datenschutz-Zeile: Wer sieht was, Siegel, Freiwilligkeit, Betriebsrat (Tatsachen) und Freibetrag hinter So geht's", async () => {
  const b = await G.launch(); try {
    const ctx = await b.newContext(Object.assign({}, G.VIEWS.phone390, { locale: "de-DE", colorScheme: "dark" }));
    await ctx.addInitScript((t) => { const T = Date.parse(t), D = Date; window.Date = class extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } }; }, TIME);
    await ctx.addInitScript(() => { try { localStorage.setItem("daily.v1", JSON.stringify({ lang: "de" })); } catch (e) {} });
    const p = await G.open(ctx, "#i=biz-weihnachtsfeier", BIZ);
    await p.locator("#go").click();
    const wsw = await p.locator("#panel .wsw").textContent();
    assert.equal(wsw, "Wer sieht was? Im Link stehen Termine, eure Texte und Zahlen. Keine KI. Kein Server speichert etwas. Der Link verfällt nach 25 Tagen. Wer den Link sieht, sieht das auch, zum Beispiel im Gruppenchat.");
    await p.locator("#panel").getByText("Jede Antwort steht versiegelt im Link; lesen kann sie nur das Gerät der Orga.").waitFor();
    await p.locator("#panel").getByText("Freiwillig: Nicht-Teilnahme hat keine Folgen.").waitFor();
    await p.locator("#panel summary").click();
    const br = await p.locator("#panel details p").nth(1).textContent();
    assert.match(br, /^Für den Betriebsrat: Im Link stehen Termine, die zwei Orte mit Kosten und Barrierefreiheit, die Zahl der Antworten und je Antwort ein versiegelter Block ohne Namen\./);
    assert.match(br, /Summen erst ab 5 Antworten/);
    assert.doesNotMatch(br, /mitbestimmungsfrei|BetrVG|Einschätzung/, "Tatsachen, kein Rechtsurteil");
    await p.locator("#panel").getByText(/§ 19 Abs\. 1 Nr\. 1a EStG/).waitFor();
    await p.locator("#panel details").scrollIntoViewIfNeeded(); await snap(p, "dunkel-so-gehts");
    await main(p); await p.locator("#panel .feiort").first().waitFor(); await snap(p, "dunkel-orte");
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});
