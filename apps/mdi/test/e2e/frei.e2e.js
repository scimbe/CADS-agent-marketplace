// Strang K: freie Karte e2e gegen den falschen Wrapper (Konto: fakewrapper.mjs; freie Karte/Deck/Bild: fakefrei.mjs mit
// Aufnahmen des echten Servers). Alle Zustaende aus dem Auftrag: Erfolg, Absage, Warteschlange, Abbruch, kein Kontingent,
// unter 16, Deck nicht ok (und ok). Je Zustand: axe (WCAG 2.2 AA), kein waagerechter Ueberlauf, kein verdecktes
// Bedienelement (wie layout.e2e.js), keine CSP-Verstoesse, keine Anfrage an einen anderen Host.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, VIEWS, act, axe, noOverflow, shotsDir } from "./lib/grund.mjs";
import { fakeWrapper, APP } from "./lib/fakewrapper.mjs";
import { fakeFrei, rec } from "./lib/fakefrei.mjs";
import { encode } from "../../src/app/link.js";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openApp(fw, ff, { view = "phone390", lang = "de", scheme = "light", path = "/duell", origin = APP } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: lang === "de" ? "de-DE" : "en-GB", colorScheme: scheme });
  ctx.setDefaultTimeout(15000);
  await fw.attach(ctx); await ff.attach(ctx);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  p.on("console", (m) => { if (m.type() === "error" && !/^Failed to load resource: the server responded with a status of (401|403|404|409|410|422|429|503)/.test(m.text())) errs.push("console " + m.text()); });
  await p.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective + " " + e.blockedURI)); });
  await p.goto(origin + path);
  await p.locator("header.bar").waitFor();
  return { ctx, p, errs };
}
const screenIs = (p, s) => p.locator("main.s-" + s).waitFor();
const settle = (p) => p.evaluate(() => new Promise((res) => { let t; const done = () => { mo.disconnect(); res(); }; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 250); }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); t = setTimeout(done, 250); setTimeout(done, 3000); }));
// wie layout.e2e.js: nichts Bedienbares liegt unter etwas anderem
const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")].filter((e) => e.checkVisibility({ visibilityProperty: true }) && !e.closest(".liveframe"));
  for (const e of els) {
    e.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect();
    for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.2, r.top + r.height / 2], [r.right - r.width * 0.2, r.top + r.height / 2]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) { out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName)); break; }
    }
  }
  window.scrollTo(0, 0);
  return out;
});
async function checks(p, name, found, { layout = true } = {}) {
  await settle(p);
  found.push(...(await axe(p, name)));
  if (!(await noOverflow(p))) found.push(name + ": waagerechter Ueberlauf");
  if (layout) for (const c of await covered(p)) found.push(name + ": verdeckt " + c);
  const d = shotsDir(); if (d) await p.screenshot({ path: d + "/frei-" + name + ".png", fullPage: true });
}
/** Anmelden aus der freien Karte heraus: 16+-Haken, Gate, zurueck ueber ?go=erschaffen, Profil mit 16+ angelegt */
async function loginFromFrei(p, fw, found, view) {
  await act(p, "frei"); await screenIs(p, "frei-start");
  await p.getByText("Eigene Karten gibt es mit Konto").waitFor();
  if (found) await checks(p, view + "-01-ohne-konto", found);
  await act(p, "login");
  await p.getByText("Bitte zuerst bestätigen: Ich bin 16 oder älter.").waitFor();
  assert.ok(!fw.state.log.some((l) => l.startsWith("GATE")), "ohne 16+ geht niemand zum Gate");
  await p.locator("#frei-16").check();
  await act(p, "login");
  await p.waitForURL(/\/duell$/);
  await screenIs(p, "frei-start");
  await p.locator('[data-k="frei-left"]').filter({ hasText: /von \d+ frei|sind erstellt/ }).waitFor();
}
async function writeCard(p, art = "card", text = "Geburtstagskarte für meine Freundin") {
  await p.locator('[aria-labelledby="lbl-art"] [data-v="' + art + '"]').click();
  await p.locator("#frei-text").fill(text);
}

for (const view of ["phone360", "phone390", "phone412", "desk1280"]) {
  test("Erfolg: Anmelden mit 16+ aus der freien Karte, Kategorie, Satz, Warten, Vorschau mit KI-Badge, Uebernehmen -> eigene Karte; " + view, async () => {
    const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-card" }), found = [];
    const { p, errs, ctx } = await openApp(fw, ff, { view });
    await loginFromFrei(p, fw, found, view);
    assert.ok(fw.state.log.includes("GET /auth/login"), "ueber /auth/login");
    assert.equal(new URL(p.url()).search, "", "?go=erschaffen ist aus der Adresse entfernt");
    assert.equal(await p.locator('[aria-labelledby="lbl-art"] [aria-pressed="true"]').count(), 0, "keine Vorauswahl");
    await checks(p, view + "-02-formular", found);
    await writeCard(p);
    await act(p, "send");
    await screenIs(p, "frei-vorschau");
    assert.match(await p.locator("main").innerText(), /Mit KI erstellt/);
    await checks(p, view + "-03-vorschau", found);
    await act(p, "take");
    await screenIs(p, "card-view");
    assert.match(await p.locator(".frame").innerText(), /SONNENBLUMEN-TAG|Sonnenblumen-Tag/i);
    assert.ok(ff.state.log.includes("POST /api/duell/ai/accept"), "Uebernehmen rechnet ab: " + ff.state.log.join(", "));
    await checks(p, view + "-04-eigene-karte", found);
    assert.deepEqual(found, []); assert.deepEqual(errs, []);
    assert.deepEqual(ctx._blocked || [], [], "keine Anfrage an einen anderen Host");
  });
}

test("Verwerfen gibt zurueck; Absage mit Gegenvorschlag; Genre-Rueckfrage; Krise auf dem Geraet (nichts gesendet)", async () => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-meme" }), found = [];
  const { p, errs } = await openApp(fw, ff);
  await loginFromFrei(p, fw);
  await writeCard(p, "meme", "Mein Hund wartet auf Leckerli");
  await act(p, "send"); await screenIs(p, "frei-vorschau");
  await act(p, "drop"); await screenIs(p, "frei-start");
  assert.ok(ff.state.log.includes("POST /api/duell/ai/discard"));
  ff.state.karte = "karte-absage-tetris";
  await p.locator('[aria-labelledby="lbl-art"] [data-v="game"]').click();
  await p.locator('[aria-labelledby="lbl-genre"] [data-v="G1"]').click();
  await p.locator("#frei-text").fill("Tetris mit bunten Steinen");
  await act(p, "send");
  await p.getByText("Tetris kann die freie Karte noch nicht. Dafür wird nichts abgebucht.").waitFor();
  await checks(p, "05-absage", found);
  ff.state.karte = "karte-genre-frage";
  await p.locator("#frei-text").fill("Endless Runner über Brücken");
  await act(p, "send");
  await p.getByText("Dein Satz klingt nach Jump & Run, gewählt ist Fliegen.").waitFor();
  await checks(p, "06-genre-frage", found);
  const before = ff.state.log.length;
  await p.locator("#frei-text").fill("ich will nicht mehr leben");
  await act(p, "send");
  await p.getByText(/Nummer gegen Kummer 116 111/).waitFor();
  assert.equal(ff.state.log.slice(before).filter((l) => l.startsWith("POST /api/duell/ai ")).length, 0, "Krise: nichts gesendet");
  await checks(p, "07-krise", found);
  assert.deepEqual(found, []); assert.deepEqual(errs, []);
});

test("Warteschlange mit echten Zustaenden (Platz N, KI baut) bis zur Vorschau; Abbrechen beendet das Warten sofort", async () => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "queue" }), found = [];
  const { p, errs } = await openApp(fw, ff);
  await loginFromFrei(p, fw);
  await writeCard(p, "card", "Ein Frosch, der Astronaut werden will");
  await act(p, "send");
  await screenIs(p, "frei-warten");
  await p.getByText(/Warteschlange auf Platz \d/).waitFor();
  await checks(p, "08-warteschlange", found, { layout: false });
  await screenIs(p, "frei-vorschau");
  assert.ok(ff.state.log.filter((l) => l === "POST /api/duell/queue").length >= 3);
  await act(p, "drop"); await screenIs(p, "frei-start");
  ff.state.karte = "queue-forever";
  await act(p, "send"); await screenIs(p, "frei-warten");
  await p.getByText(/Platz \d/).first().waitFor();
  await act(p, "cancel");
  await screenIs(p, "frei-start");
  await p.getByText(/^Abgebrochen\./).waitFor();
  const n = ff.state.log.filter((l) => l === "POST /api/duell/queue").length;
  await p.waitForTimeout(900);
  assert.equal(ff.state.log.filter((l) => l === "POST /api/duell/queue").length, n, "nach Abbrechen fragt niemand mehr (Ticket verfaellt kostenlos)");
  await checks(p, "09-abgebrochen", found);
  assert.deepEqual(found, []); assert.deepEqual(errs, []);
});

test("Kein Kontingent: kein Erschaffen-Knopf, ehrlicher Zaehler; unter 16: Hinweis auf Mein Stil, kein Senden", async () => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { status: "status-leer" }), found = [];
  const { p, errs } = await openApp(fw, ff);
  await loginFromFrei(p, fw);
  await p.getByText("Alle 1 freien Karten sind erstellt.").waitFor();
  await writeCard(p);
  assert.equal(await p.locator('[data-act="send"]').count(), 0, "ohne Kontingent und ohne Guthaben kein Erschaffen-Knopf");
  assert.ok(!ff.state.log.some((l) => l === "POST /api/duell/ai karte"), "ohne Kontingent wird nichts gesendet");
  await screenIs(p, "frei-start");
  await checks(p, "10-kein-kontingent", found);
  // unter 16: angemeldet, aber der Server meldet keine 16+-Angabe im Profil (create.age16 false, wie lib/duell-ai.mjs status)
  const fw2 = fakeWrapper(), ff2 = fakeFrei(fw2, { status: "status-angemeldet-16" });
  const o2 = await openApp(fw2, ff2);
  await loginFromFrei(o2.p, fw2);
  ff2.state.age16 = false;
  await act(o2.p, "back"); await screenIs(o2.p, "shelf");
  await act(o2.p, "frei");
  await o2.p.getByText(/Eigene Karten gibt es ab 16/).waitFor();
  assert.equal(await o2.p.locator('[data-act="send"]').count(), 0);
  await checks(o2.p, "11-unter-16", found);
  assert.deepEqual(found, []); assert.deepEqual(errs, []); assert.deepEqual(o2.errs, []);
});

test("Deck: Status-Gate mit Inhalts-Hash beim Empfaenger (gesperrt, veraendert, ok); gepinnter Schluessel lehnt fremdes Deck ab", async () => {
  const ki = rec("deck-mit-karte").body.cards[0].doc.ki, card = rec("deck-mit-karte").body.cards[0].doc;
  const params = { kind: "card", title: card.t, text: card.x, top: "", bottom: "", style: card.st, palette: "gelb", stickers: card.sk.map((x) => x.e), seal: ki.s, hash: ki.h, owner: ki.o, root: "" };
  const hash = encode("card", { c: "frei", v: "1.0.0", p: params });
  const forged = encode("card", { c: "frei", v: "1.0.0", p: { ...params, text: "Fremder Text mit echter id" } });
  const found = [];
  const fw = fakeWrapper(), ff = fakeFrei(fw, { deckStatus: "blocked" });
  const A = await openApp(fw, ff, { path: "/duell" + hash });
  await screenIs(A.p, "receive-reject");
  await A.p.getByText("Diese Karte ist nicht mehr verfügbar.").waitFor();
  assert.ok(ff.state.log.includes("STATUS " + ki.h.slice(0, 22) + " d=ja"), "das Gate schickt den Inhalts-Hash: " + ff.state.log.join(", "));
  await checks(A.p, "12-deck-gesperrt", found);
  const fw2 = fakeWrapper(), ff2 = fakeFrei(fw2, { deckStatus: "ok" });
  const B = await openApp(fw2, ff2, { path: "/duell" + hash });
  await screenIs(B.p, "receive-show");
  await checks(B.p, "13-deck-ok", found);
  const fw3 = fakeWrapper(), ff3 = fakeFrei(fw3, { deckStatus: "ok" });
  const C = await openApp(fw3, ff3, { path: "/duell" + forged });
  await screenIs(C.p, "receive-reject");
  await C.p.getByText("Der Inhalt dieser Karte passt nicht zur freigegebenen Karte. Sie wird nicht gezeigt.").waitFor();
  await checks(C.p, "13b-deck-veraendert", found);
  // gepinnter Host (Produktion): das Test-Deck ist mit einem anderen Schluessel signiert und wird nicht gezeigt
  await act(B.p, "decline"); await screenIs(B.p, "shelf");
  await act(B.p, "frei"); await screenIs(B.p, "frei-start");
  await act(B.p, "deck"); await screenIs(B.p, "frei-deck");
  await B.p.getByText("Die Community-Karten ließen sich nicht prüfen und werden nicht gezeigt.").waitFor();
  assert.ok(!ff2.state.log.includes("GET /api/duell/deck/key"), "mit Pin wird der Schluessel nicht vom Server geholt");
  assert.deepEqual(found, []); assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []); assert.deepEqual(C.errs, []);
});

test("Deck auf einem Host ohne Pin: Signatur mit Server-Schluessel, Karte oeffnen, ohne Konto keine Nutzung, Melden", async () => {
  const ORIGIN = "https://mdi.test", found = [];
  const fw = fakeWrapper(), ff = fakeFrei(fw, { origin: ORIGIN });
  const B = await openApp(fw, ff, { origin: ORIGIN });
  await act(B.p, "frei"); await screenIs(B.p, "frei-start");
  await act(B.p, "deck"); await screenIs(B.p, "frei-deck");
  await B.p.locator('[data-act="deck-' + rec("deck-mit-karte").body.cards[0].cid + '"]').click();
  await screenIs(B.p, "frei-deckkarte");
  assert.ok(ff.state.log.includes("GET /api/duell/deck/key"), "ohne Pin: Schluessel vom selben Server");
  await B.p.getByText("Mit Konto siehst du hier, wie es deinen freien Karten geht.").waitFor();
  await checks(B.p, "14-deckkarte", found);
  await act(B.p, "melden"); await screenIs(B.p, "frei-melden");
  await B.p.locator('[data-v="wrong"]').click();
  await act(B.p, "report-send");
  await B.p.getByText(/^Danke/).first().waitFor();
  assert.ok(ff.state.log.some((l) => l.startsWith("POST /api/duell/report")), ff.state.log.join(", "));
  await checks(B.p, "15-gemeldet", found);
  assert.deepEqual(found, []); assert.deepEqual(B.errs, []);
});

test("Englisch, dunkel, 1280: Formular und Vorschau ohne axe-Verstoss", async () => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-quiz" }), found = [];
  const { p, errs } = await openApp(fw, ff, { view: "desk1280", lang: "en", scheme: "dark" });
  await act(p, "frei"); await screenIs(p, "frei-start");
  await act(p, "login");
  await p.locator("#frei-16").check(); await act(p, "login");
  await p.waitForURL(/\/duell$/); await screenIs(p, "frei-start");
  await p.locator('[data-k="frei-left"]').filter({ hasText: /\d/ }).waitFor();
  await checks(p, "16-en-formular", found);
  await writeCard(p, "quiz", "Quiz about the solar system");
  await act(p, "send"); await screenIs(p, "frei-vorschau");
  await checks(p, "17-en-vorschau", found);
  assert.deepEqual(found, []); assert.deepEqual(errs, []);
});
