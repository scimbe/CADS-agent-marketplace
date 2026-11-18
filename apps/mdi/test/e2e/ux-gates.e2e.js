// Feste UX-Pruefungen (Bericht usability-automatisiert.md, Massnahme 2): Startseite und Klaerungsdialog der freien Karte im
// Tester-Modus (Klaerung an) gegen den falschen Wrapper und eine Attrappe von /api/duell/klaerung/*. Je Bildschirm:
// Entscheidungen, Woerter ohne Kacheltexte, LIX, Vorlesen je Kachel und Frage, kleinste Tippflaeche, axe-core; dazu die
// Pflicht-Taps vom getippten Satz bis "Ja, so bauen" mit Standardwerten und "Zurueck" ohne Datenverlust.
// Definitionen und Ziele: lib/ux-mass.mjs. UX_GATE=bericht (Standard) blockiert nichts, UX_GATE=streng prueft die Ziele.
//
// Fahrer des Standardpfads: nimmt je Frage den vorausgewaehlten Wert, sonst "Egal, überrasch mich", dann den Hauptknopf.
// Bietet ein Bildschirm eine Abkuerzung an (Knopf mit data-ux="abkuerzung", z. B. "Fertig bauen" ab Frage 1), nimmt er sie.
import nodeTest from "node:test";
import { fakeOnly } from "./lib/ziel.mjs";
const test = fakeOnly(nodeTest); // Gegenstelle ist eine Attrappe: im URL-Modus uebersprungen
import assert from "node:assert/strict";
import fs from "node:fs";
import { browser, VIEWS, act, axe, istSpielSonde } from "./lib/grund.mjs";
import { fakeWrapper, APP } from "./lib/fakewrapper.mjs";
import { fakeFrei } from "./lib/fakefrei.mjs";
import { ZIELE, gateModus, messeBildschirm, verstoesse, tabelle } from "./lib/ux-mass.mjs";

const MODUS = gateModus();
let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openApp(fw, ff, view = "phone390") {
  const ctx = await b.newContext({ ...VIEWS[view], locale: "de-DE", colorScheme: "light" });
  ctx.setDefaultTimeout(15000);
  await fw.attach(ctx); await ff.attach(ctx);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  p.on("console", (m) => { if (m.type() === "error" && !istSpielSonde(m.text()) && !/^Failed to load resource: the server responded with a status of (401|403|404|409|410|422|429|503)/.test(m.text())) errs.push("console " + m.text()); });
  await p.goto(APP + "/duell");
  await p.locator("header.bar").waitFor();
  return { ctx, p, errs };
}
const screenIs = (p, s) => p.locator("main.s-" + s).waitFor();
const settle = (p) => p.evaluate(() => new Promise((res) => { let t; const done = () => { mo.disconnect(); res(); }; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 200); }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); t = setTimeout(done, 200); setTimeout(done, 3000); }));

async function loginFromFrei(p) {
  await act(p, "frei"); await screenIs(p, "frei-start");
  await act(p, "login");
  await p.locator("#frei-16").check();
  await act(p, "login");
  await p.waitForURL(/\/duell$/);
  await screenIs(p, "frei-start");
  await p.locator('[data-k="frei-left"]').filter({ hasText: /von \d+ frei|sind erstellt/ }).waitFor();
}

// Antworten wie lib/duell-klaerung.mjs (dieselben Inhalte wie klaeren.e2e.js)
const ID = "A".repeat(22), AUF = "B".repeat(22);
const FRAGEN = { id: ID, verstehe: "ein Spiel. Von oben kommt etwas angesegelt, du wehrst es ab.", fragen: [
  { frage: "Wer bist du im Spiel?", hinweis: "Tipp ein Bild an.", kacheln: [{ label: "Ein Segelboot", sub: "", emoji: "⛵" }, { label: "Ein Piratenschiff", sub: "", emoji: "🚢" }, { label: "Eine Badeente", sub: "", emoji: "🦆" }] },
  { frage: "Womit wirfst du?", hinweis: "Es soll nass oder lustig werden, nicht brutal.", kacheln: [{ label: "Wasserbomben", sub: "Platsch – das Boot kentert.", emoji: "💧" }, { label: "Seifenblasen", sub: "Die Boote schweben davon.", emoji: "🫧" }, { label: "Kanonenkugeln", sub: "Sie treffen nur Holz und Segel.", emoji: "🎯" }] },
  { frage: "Wie schwer soll es sein?", hinweis: "Später kannst du es noch ändern.", kacheln: [{ label: "Gemütlich", sub: "langsam, viele Leben", emoji: "🐢" }, { label: "Normal", sub: "wird schneller", emoji: "🌊" }, { label: "Knifflig", sub: "schnell, 1 Leben", emoji: "⚡" }] }] };
const LISTE = { titel: "Segelboot gegen Piraten", verstehe: "Ein Spiel mit Wasserbomben.", punkte: [
  { id: "p1", text: "Du steuerst ein Segelboot unten am Rand – wischen oder Pfeiltasten.", pruefung: "Wischen nach links bewegt das Boot nach links." },
  { id: "p2", text: "Ein großer Knopf wirft Wasserbomben nach oben.", pruefung: "Antippen wirft eine Wasserbombe nach oben." },
  { id: "p3", text: "Von oben segeln Reihen von Piratenbooten heran und kommen näher.", pruefung: "Nach 10 Sekunden sind die Boote tiefer." },
  { id: "p4", text: "Normal schwer: 3 Leben, mit jeder Runde etwas schneller.", pruefung: "Runde 2 ist messbar schneller." }],
  nicht: ["Gleichzeitig online gegeneinander spielen ist nicht dabei. Wer deinen Link öffnet, spielt allein und versucht deinen Rekord."], dauerMaxMin: 15, kosten: { guthaben: 1, nurBeiErfolg: true } };
async function fakeKlaerung(ctx) {
  const S = { log: [] };
  const json = (status, body) => ({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
  await ctx.route(APP + "/api/duell/klaerung/**", async (r) => {
    const op = new URL(r.request().url()).pathname.split("/").pop(); let body = {}; try { body = r.request().postDataJSON() || {}; } catch (e) { body = {}; }
    S.log.push(op);
    if (op === "an") return r.fulfill(json(200, { on: true }));
    if (op === "fragen") return r.fulfill(json(200, FRAGEN));
    if (op === "antwort") return r.fulfill(json(200, { ok: true, text: body.text }));
    if (op === "liste") return r.fulfill(json(200, LISTE));
    if (op === "auftrag") return r.fulfill(json(202, { auftrag: AUF, status: "bestaetigt", bau: "wartet", kanaele: { push: false, mail: true } }));
    if (op === "optin") return r.fulfill(json(200, { optin: { push: false, mail: !!body.mail }, kanaele: { push: false, mail: true } }));
    return r.fulfill(json(404, {}));
  });
  return S;
}

const SATZ = "Space Invaders mit Segelbooten";
const HOME = { kacheln: ".h-tile, .h-intent", gruppen: [".h-grid", ".h-go-row"] };
const DIALOG = { kacheln: ".k-tile" };

async function zeile(p, name, cfg, extra = {}) {
  await settle(p);
  const m = await messeBildschirm(p, cfg);
  return { name, ...m, axe: await axe(p, name), ...extra };
}
function bericht(t, titel, zeilen, rest = []) {
  t.diagnostic("UX-Messung (" + MODUS + "): " + titel);
  if (zeilen.length) for (const l of tabelle(zeilen).split("\n")) t.diagnostic(l);
  for (const z of zeilen) { t.diagnostic(z.name + " – Entscheidungen: " + (z.gruppen.map((g) => g.name + " (" + g.optionen + ")").join(" · ") || "keine")); const v = verstoesse(z); if (v.length) t.diagnostic(z.name + " – Verstoesse: " + v.join(" | ")); }
  for (const l of rest) t.diagnostic(l);
  if (process.env.UX_BERICHT) {
    const f = process.env.UX_BERICHT, alt = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
    alt[titel] = { modus: MODUS, ziele: ZIELE, zeilen, rest };
    fs.writeFileSync(f, JSON.stringify(alt, null, 2));
  }
}
const vollstaendig = (z) => Number.isInteger(z.woerter) && Number.isInteger(z.entscheidungen) && Number.isFinite(z.tippflaeche) && Array.isArray(z.axe) && (z.lix === null || Number.isFinite(z.lix));

test("UX-Messung: Startseite und Klaerungsdialog, Standardpfad Satz -> Ja, so bauen (phone390)", async (t) => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-card" });
  const { p, errs, ctx } = await openApp(fw, ff);
  const S = await fakeKlaerung(ctx);
  const zeilen = [];
  await p.locator(".h-leaf").waitFor();
  zeilen.push(await zeile(p, "Startseite", HOME));

  await loginFromFrei(p);
  await act(p, "klaeren"); await screenIs(p, "frei-klaeren");
  await p.locator("#k-satz").fill(SATZ);
  let taps = 0;
  const tap = async (sel) => { await p.locator(sel).first().click(); taps++; };
  const abk = async () => (await p.locator('[data-ux="abkuerzung"]:not([disabled])').count()) > 0;

  const satz = await zeile(p, "Satz", DIALOG);
  const vor = taps; await tap('[data-act="k-go"]'); satz.taps = taps - vor;
  zeilen.push(satz);
  await screenIs(p, "frei-kfrage");
  for (let n = 1; n <= 10 && (await p.locator("main.s-frei-kfrage").count()); n++) {
    const step = await p.locator(".k-step").innerText();
    const z = await zeile(p, "Frage " + n, DIALOG, { frage: true });
    const v = taps;
    if (await abk()) await tap('[data-ux="abkuerzung"]');
    else {
      if (!(await p.locator('.k-tiles [aria-pressed="true"]').count())) await tap('[data-act="k-egal"]');
      await tap('[data-act="k-weiter"]');
    }
    z.taps = taps - v; zeilen.push(z);
    await p.waitForFunction((s) => !document.querySelector("main.s-frei-kfrage") || (document.querySelector(".k-step") || {}).innerText !== s, step);
  }
  await screenIs(p, "frei-kliste");
  const liste = await zeile(p, "Liste (So bauen wir es)", DIALOG);
  const vl = taps; await tap('[data-act="k-ja"]'); liste.taps = taps - vl;
  zeilen.push(liste);
  await screenIs(p, "frei-kbauen");
  zeilen.push(await zeile(p, "Bauen", DIALOG));

  bericht(t, "Standardpfad", zeilen, ["Pflicht-Taps vom getippten Satz bis einschliesslich \"Ja, so bauen\": " + taps + " (Ziel <= " + ZIELE.taps + ")"]);
  // Bericht: die Messung selbst muss vollstaendig sein (jeder Bildschirm erreicht und gemessen), sonst ist sie wertlos
  assert.deepEqual(zeilen.map((z) => z.name), ["Startseite", "Satz", "Frage 1", "Frage 2", "Frage 3", "Liste (So bauen wir es)", "Bauen"]);
  assert.ok(zeilen.every(vollstaendig), JSON.stringify(zeilen.map((z) => [z.name, z.woerter, z.lix, z.tippflaeche])));
  assert.ok(S.log.includes("auftrag"), "Standardpfad endet mit dem Auftrag: " + S.log.join(" "));
  assert.deepEqual(errs, []);
  if (MODUS === "streng") {
    assert.ok(taps <= ZIELE.taps, "Pflicht-Taps " + taps + " > " + ZIELE.taps);
    assert.deepEqual(zeilen.flatMap((z) => verstoesse(z).map((v) => z.name + ": " + v)), []);
  }
});

test("UX-Messung: Zurueck ohne Datenverlust im Klaerungsdialog (phone390)", async (t) => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-card" });
  const { p, errs, ctx } = await openApp(fw, ff);
  const S = await fakeKlaerung(ctx);
  await loginFromFrei(p);
  await act(p, "klaeren"); await screenIs(p, "frei-klaeren");
  await p.locator("#k-satz").fill(SATZ);
  await act(p, "k-go"); await screenIs(p, "frei-kfrage");
  const step = () => p.locator(".k-step").innerText();
  const gewaehlt = async () => p.evaluate(() => { const x = document.querySelector('.k-tiles [aria-pressed="true"]'); return x ? x.dataset.act : null; });
  const naechste = async (s0) => p.waitForFunction((s) => !document.querySelector("main.s-frei-kfrage") || (document.querySelector(".k-step") || {}).innerText !== s, s0);
  // vorwaerts: Frage 1 Kachel 0, Frage 2 Kachel 1, Frage 3 Kachel 2
  for (const j of [0, 1, 2]) { const s0 = await step(); await p.locator('[data-act="k-kachel-' + j + '"]').click(); await act(p, "k-weiter"); await naechste(s0); }
  await screenIs(p, "frei-kliste");
  const fragenVorher = S.log.filter((x) => x === "fragen").length;
  const schritte = [];
  const zurueck = async (wie) => { if (wie === "system") await p.goBack(); else await act(p, "back"); await settle(p); };
  const pruef = (schritt, ok, info = "") => schritte.push({ schritt, erhalten: ok, info });

  await zurueck("kopf"); await screenIs(p, "frei-kfrage");
  pruef("Liste -> Frage 3 (Kopfzeile)", (await gewaehlt()) === "k-kachel-2", await step());
  await zurueck("kopf");
  pruef("Frage 3 -> Frage 2 (Kopfzeile)", (await gewaehlt()) === "k-kachel-1", await step());
  await zurueck("system");
  const imDialog = (await p.locator("main.s-frei-kfrage").count()) > 0;
  pruef("Frage 2 -> Frage 1 (Browser-Zurück)", imDialog && (await gewaehlt()) === "k-kachel-0", imDialog ? await step() : "Bildschirm " + (await p.locator("main").getAttribute("class")));
  if (!imDialog) { await act(p, "klaeren"); await p.locator("#k-satz").fill(SATZ); await act(p, "k-go"); await screenIs(p, "frei-kfrage"); await p.locator('[data-act="k-kachel-0"]').click(); }
  await zurueck("kopf"); await screenIs(p, "frei-klaeren");
  pruef("Frage 1 -> Satz (Kopfzeile): Satz bleibt", (await p.locator("#k-satz").inputValue()) === SATZ);
  await act(p, "k-go"); await screenIs(p, "frei-kfrage");
  const neu = S.log.filter((x) => x === "fragen").length > fragenVorher;
  pruef("Satz -> Frage 1 erneut: Antworten bleiben", (await gewaehlt()) === "k-kachel-0", neu ? "Fragen neu bei der KI angefragt" : "");
  await zurueck("kopf"); await screenIs(p, "frei-klaeren");
  await zurueck("kopf"); await screenIs(p, "frei-start");
  await act(p, "klaeren"); await screenIs(p, "frei-klaeren");
  pruef("Satz -> Start -> Satz (Kopfzeile): Satz bleibt", (await p.locator("#k-satz").inputValue()) === SATZ);

  const z = schritte.filter((s) => s.erhalten).length;
  bericht(t, "Zurueck", [], ["| Schritt | erhalten | Hinweis |", "|---|---|---|", ...schritte.map((s) => `| ${s.schritt} | ${s.erhalten ? "ja" : "nein"} | ${s.info} |`), "Zurueck ohne Verlust: " + z + " von " + schritte.length]);
  assert.equal(schritte.length, 6);
  assert.deepEqual(errs, []);
  if (MODUS === "streng") assert.deepEqual(schritte.filter((s) => !s.erhalten).map((s) => s.schritt), []);
});
