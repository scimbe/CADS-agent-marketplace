"use strict";
// Redesign wave 1, flows 1 and 2 (the part start, src/start-ui.js): the start page for a first visit (the day's card on
// top, the question, one sentence field, four intention tiles, the demo strip behind "Alle Karten") and the sheet "Deine
// Karte" (one sentence -> "So verstehe ich dich" -> "Daraus wird" -> the card). axe, no covered or small target and no
// sideways scrolling at 328, 390, 820 and 1280 px and at 200 % zoom; the card that comes out fits the sentence.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const G = require("./lib/grund.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");

const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const DAY = "2026-11-08T10:00:00Z";   // Sunday 8 Nov: the arcade card "Ziegel Duell" (its burst said "Arcade")
// Since the shelf clean-up (2026-11) no shelf card has a live row (the plan-* cards left), so these two days are ordinary
// days now (11 Nov was "Auktion der Agenten", 9 Nov "Gruppen-Konferenz"); the layout checks keep running on them.
const AUKTION = "2026-11-11T10:00:00Z";
const LIVE = "2026-11-09T10:00:00Z";
// Pixel 7 at 150 % (persona P6): 275x610 CSS px, the big-type order (intentions first); only here, not in every W0 screen,
// since that order puts the main button below the first screen on purpose.
G.VIEWS.zoom150 = Object.assign(G.zoom({ width: 412, height: 915 }, 1.5), { isMobile: true, hasTouch: true });
// phones at 200 % (review #185): 195x422 and 180x400 CSS px
G.VIEWS.p390z200 = Object.assign(G.zoom({ width: 390, height: 844 }, 2), { isMobile: true, hasTouch: true });
G.VIEWS.p360z200 = Object.assign(G.zoom({ width: 360, height: 800 }, 2), { isMobile: true, hasTouch: true });
G.VIEWS.p360 = { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };   // Galaxy A
const JARGON = /Arcade|Webconference|Web conference|Tunnel|Alle Demos|\d+ Spiele|Agent|Meme/;

async function axe(p, sel) {
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
  return p.evaluate(([s, o]) => window.axe.run(document.querySelector(s), o).then((r) => r.violations.map((x) => x.id + " (" + x.nodes.length + "): " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), [sel, RULES]);
}
// Every visible control inside root: scrolled into view, is its middle its own (nothing over it, nothing cut by the edge)?
async function blocked(p, root) {
  return p.evaluate(async (r) => {
    const out = [];
    for (const e of document.querySelectorAll(r + " button, " + r + " input, " + r + " textarea")) {
      if (!e.getClientRects().length || e.closest("[hidden]")) continue;
      e.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((ok) => requestAnimationFrame(ok));
      const b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!(hit && (hit === e || e.contains(hit)))) out.push((e.id || e.textContent.trim().slice(0, 24)) + ": " + (hit ? hit.id || hit.className || hit.tagName : "ausserhalb"));
      if (b.left < -0.5 || b.right > innerWidth + 0.5) out.push((e.id || e.textContent.trim().slice(0, 24)) + ": seitlich abgeschnitten");
    }
    return out;
  }, root);
}
// Two tiles never lie over each other (big type, 200 %).
const tileOverlap = (p) => p.evaluate(() => {
  const r = [...document.querySelectorAll("#startbox .sttile")].map((e) => e.getBoundingClientRect()), bad = [];
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (r[i].left < r[j].right - 1 && r[j].left < r[i].right - 1 && r[i].top < r[j].bottom - 1 && r[j].top < r[i].bottom - 1) bad.push(i + "/" + j);
  return bad;
});
const hscroll = (p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 0.5 || document.getElementById("home").scrollWidth > document.getElementById("home").clientWidth + 0.5);
// The gallery's own links (the old strip's Tunnel and Alle Demos): no element anywhere on the page says them.
const galleryLinks = (p) => p.evaluate(() => [...document.querySelectorAll("button, a")].map((e) => e.textContent.trim()).filter((x) => /^\W*(Tunnel|Alle Demos|All demos)$/.test(x)));
// The start begins on the first screen (its question visible), and each tile is reachable below it: scrolled to, it is
// fully in view and nothing lies over it (10 Nov: the tiles left the first screen for the day's picture or game).
async function startBegins(p) {
  const out = [];
  const q = await p.evaluate(() => { const r = document.getElementById("starth").getBoundingClientRect(); return { top: r.top, h: innerHeight }; });
  if (!(q.top < q.h - 24)) out.push("Start beginnt nicht im ersten Bild (Frage bei " + Math.round(q.top) + " von " + q.h + ")");
  for (const k of ["gruss", "planen", "spielen", "stimme"]) {
    const ok = await p.evaluate((k) => {
      const e = document.querySelector(".sttile[data-i=" + k + "]"); e.scrollIntoView({ block: "nearest" });
      const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.top >= 0 && r.bottom <= innerHeight + 0.5 && !!hit && (hit === e || e.contains(hit));
    }, k);
    if (!ok) out.push("Kachel " + k + " nicht erreichbar");
  }
  await p.evaluate(() => document.getElementById("home").scrollTo(0, 0));
  return out;
}
// The day's preview (game or picture) is there and drawn: its box has a real height on the first screen.
const preview = (p) => p.evaluate(() => {
  const e = document.getElementById("pv"), r = e.getClientRects().length ? e.getBoundingClientRect() : null;
  return { kind: e.classList.contains("pic") ? "Bild" : "Spiel", h: r ? Math.round(r.height) : 0, top: r ? Math.round(r.top) : -1, bottom: r ? Math.round(r.bottom) : -1, ih: innerHeight, disp: getComputedStyle(e).display };
});
// A stand-in for SpeechRecognition: state is what available() answers; it records what was asked and whether it listened.
function speech(state) {
  window.__sr = { asked: null, started: 0, local: null };
  class SR {
    static available(o) { window.__sr.asked = o; return Promise.resolve(state); }
    start() { window.__sr.started++; window.__sr.local = this.processLocally; setTimeout(() => { this.onresult({ results: [[{ transcript: "Gute Besserung Papa" }]] }); this.onend(); }, 20); }
  }
  window.SpeechRecognition = SR; window.webkitSpeechRecognition = SR;
}

test("Start fuer den Erstbesuch: Tageskarte oben, Frage, Satzfeld, vier Kacheln, keine Demo-Leiste; axe 0, nichts verdeckt, 328/390/820/1280/200 %", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  for (const view of ["phone328", "phone390", "tablet820", "desk1280", "zoom200", "zoom150"]) {
    const ctx = await G.person(b, { lang: "de", view, time: DAY, web: true });   // web route: the page is reloaded below
    await ctx.route(/^https?:/, (r) => (G.isLocal(r.request().url()) ? r.continue() : r.abort()));
    const p = await G.open(ctx, "");
    await p.locator("#startbox").waitFor();
    // the day's card stays the ritual on top: the sheet comes before the question
    const narrow = await p.evaluate(() => innerWidth <= 300);   // a phone at 150 % and more: the intentions come first
    if (!narrow && await p.evaluate(() => innerHeight <= 700)) assert.equal(await G.inView(p, "#go"), true, view + ": Hauptknopf ohne Scrollen (Regel A4)");
    const order = await p.evaluate(() => { const y = (s) => document.querySelector(s).getBoundingClientRect().top; return [y("#leaf"), y("#go"), y("#starth"), y("#satz"), y(".sttile")]; });
    if (narrow) assert.ok(order[2] < order[3] && order[3] < order[4] && order[4] < order[0], view + ": ab 150 % erst Frage, Feld, Kacheln, dann die Tageskarte " + order);
    else if (view !== "desk1280") assert.deepEqual(order.slice().sort((a, c) => a - c), order, view + ": Karte, Knopf, Frage, Feld, Kacheln von oben nach unten " + order);
    assert.equal(await p.locator("#starth").textContent(), "Wem willst du heute eine Freude machen?");
    assert.deepEqual(await p.locator(".sttile b").allTextContents(), ["Gruß schicken", "Zusammen planen", "Gegeneinander spielen", "Stimme"]);
    assert.equal(await p.locator("#satz").getAttribute("aria-label"), "Sag in einem Satz, was du vorhast");
    // a first visit sees no demo strip, no jargon, no English; "Alle Karten" opens no strip (11 Nov): the gallery of
    // bunsenbrenner waits quietly at the foot, closed, and never with its own links Tunnel or Alle Demos
    assert.equal(await p.locator("#feat").isVisible(), false, view);
    assert.equal(await p.locator("#allcards").getAttribute("aria-expanded"), null, view + ": Alle Karten klappt nichts auf");
    assert.deepEqual(await galleryLinks(p), [], view + ": Tunnel / Alle Demos im neuen Start");
    const seen = await p.evaluate(() => document.getElementById("home").innerText);
    assert.doesNotMatch(seen, JARGON, view + ": " + (seen.match(JARGON) || [""])[0]);
    assert.match(await p.locator("#leaf .dkind").textContent(), /^Spiel\n/, "der Stempel sagt Spiel, nicht Arcade");
    assert.equal(await p.locator("#mute svg").count(), 1, "Ton-Knopf als Strich-Symbol");
    assert.doesNotMatch(await p.locator("#mute").textContent(), /🔊|🔇/);
    (await axe(p, "#home")).forEach((v) => bad.push(view + " axe: " + v));
    (await blocked(p, "#startbox")).forEach((v) => bad.push(view + " verdeckt: " + v));
    (await G.smallTargets(p, "#startbox")).forEach((v) => bad.push(view + " zu klein: " + v));
    (await tileOverlap(p)).forEach((v) => bad.push(view + " Kacheln ueberlappen: " + v));
    if (await hscroll(p)) bad.push(view + ": seitlich scrollbar");
    // a short screen (small phone, 200 %) keeps sheet and main button on the first screen (rule A4)
    if (await p.evaluate(() => innerHeight <= 700)) { assert.deepEqual(p.errs, [], view); await ctx.close(); continue; }
    // the quiet foot "Mehr von bunsenbrenner" opens the strip, and this device remembers it
    await p.locator("#stmore").click();
    await p.locator("#feat .lane button:not([aria-hidden])").first().waitFor();
    assert.equal(await p.locator("#stmore").getAttribute("aria-expanded"), "true");
    assert.ok(await p.evaluate(() => document.getElementById("stmore").getBoundingClientRect().top > document.getElementById("startbox").getBoundingClientRect().bottom), view + ": im Fuss, unter dem Start");
    assert.deepEqual(await galleryLinks(p), [], view + ": auch offen kein Tunnel / Alle Demos");
    (await axe(p, "#home")).forEach((v) => bad.push(view + " axe offen: " + v));
    await p.reload(); await p.locator("#startbox").waitFor();
    assert.equal(await p.locator("#stmore").getAttribute("aria-expanded"), "true", view + ": bleibt offen");
    assert.equal(await p.locator("#feat").isVisible(), true);
    assert.deepEqual(p.errs, [], view); await ctx.close();
  }
  await b.close();
  assert.deepEqual(bad, []);
});

test("Deine Karte: Satz -> So verstehe ich dich -> Daraus wird -> die Karte passt zum Satz; ehrlich ohne passende Karte; nichts verlaesst das Geraet", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  for (const view of ["phone390", "phone328", "tablet820", "zoom200", "desk1280"]) {
    const ctx = await G.person(b, { lang: "de", view, time: DAY }), sent = [];
    await ctx.route(/^https?:/, (r) => { sent.push(r.request().url()); return r.abort(); });
    const p = await G.open(ctx, "");
    await p.locator("#satz").fill("Danke an Oma"); await p.locator("#satz").press("Enter");
    await p.locator("#shelf:not([hidden]) #wunsch").waitFor();
    await p.waitForFunction(() => document.activeElement && document.activeElement.id === "shtitle");   // WCAG 2.4.3
    assert.equal(await p.locator("#wunsch").inputValue(), "Danke an Oma");
    // since the shelf clean-up (2026-11) the feel-good cards are in "Schick wem ein Danke" (a card played by link)
    assert.deepEqual(await p.locator("#stres .stchip").allTextContents(), ["Gruß schicken", "Für: Oma", "Per Link"]);
    assert.match(await p.locator("#stres .stcard").first().textContent(), /Schick wem ein Danke.*Passt genau/);
    (await axe(p, "#shelf")).forEach((v) => bad.push(view + " axe: " + v));
    (await blocked(p, "#shbody")).forEach((v) => bad.push(view + " verdeckt: " + v));
    (await G.smallTargets(p, "#shbody")).forEach((v) => bad.push(view + " zu klein: " + v));
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 0.5 || document.getElementById("shbody").scrollWidth > document.getElementById("shbody").clientWidth + 0.5)) bad.push(view + ": Blatt seitlich scrollbar");
    // "Stimmt nicht? Ändern": the four intentions, one tap; planning shows the poll first
    await p.getByRole("button", { name: "Stimmt nicht? Ändern" }).click();
    assert.equal(await p.locator("#stpick").isVisible(), true);
    await p.locator("#stpick").getByRole("button", { name: "Zusammen planen" }).click();
    assert.match(await p.locator("#stres .stcard").first().textContent(), /Wann könnt ihr alle\?/);
    assert.equal(await p.locator("#stres .stchip").first().textContent(), "Zusammen planen");
    // honest: a card that does not exist is named, nothing pretends to fit exactly
    await p.locator("#wunsch").fill("Gruß zum Geburtstag für Lea");
    await p.locator(".sthonest").filter({ hasText: "Eine Geburtstagskarte habe ich noch nicht." }).waitFor();
    assert.equal(await p.locator("#stres .stcard i").first().textContent(), "Passt ungefähr");
    await p.locator("#wunsch").fill("xyz qwert");
    await p.locator(".sthonest").filter({ hasText: "Dazu habe ich noch keine passende Karte." }).waitFor();
    assert.equal(await p.locator("#stmake").getAttribute("aria-disabled"), "true");
    assert.equal(await p.locator("#stres .stcard").count(), 0);
    assert.deepEqual(sent, [], view + ": Tippen und Verstehen bleiben auf dem Geraet");
    // result, not status: the card that comes out is the one shown, open in its editor
    await p.locator("#wunsch").fill("Danke an Oma"); await p.locator("#stres .stchip", { hasText: "Für: Oma" }).waitFor();
    assert.equal(await p.locator(".stfree").textContent(), "Frei für dich");
    await p.locator("#stmake").click();
    await p.locator("#editor:not([hidden])").waitFor();
    assert.equal(await p.evaluate(() => window.DailyDebug.doc().i), "karte-danke");
    await p.waitForTimeout(300);
    assert.deepEqual(sent.filter((u) => /\/api\/s/.test(u)), [], view + ": vor Fertig kein Kurzlink");
    assert.deepEqual(p.errs, [], view); await ctx.close();
  }
  await b.close();
  assert.deepEqual(bad, []);
});

test("Kacheln: jede fuehrt zu ihren Karten, eine Karte oeffnet sich mit einem Tipp (Termin: der Editor der Abstimmung)", async () => {
  ensureBuilt("");
  const b = await G.launch(), ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY });
  await ctx.route(/^https?:/, (r) => r.abort());
  const p = await G.open(ctx, "");
  // shelf clean-up (2026-11): greetings lead to "Schick wem ein Danke", the voice card to "Tier-Aufstellung"
  const want = { gruss: /Schick wem ein Danke/, planen: /Wann könnt ihr alle\?/, spielen: /Dart im Wohnzimmer|Mal & Rat|Kennst du mich/, stimme: /Tier-Aufstellung/ };
  for (const [k, re] of Object.entries(want)) {
    await p.locator(".sttile[data-i=" + k + "]").click();
    await p.locator("#shelf:not([hidden]) #stres .stcard").first().waitFor();
    assert.match(await p.locator("#stres .stcard").first().textContent(), re, k);
    assert.equal(await p.locator("#stres .stcard i").first().textContent(), "Passt ungefähr", k + ": eine Kachel allein ist keine genaue Wahl");
    await p.locator("#shback").click(); await p.locator("#startbox").waitFor();
  }
  await p.locator(".sttile[data-i=planen]").click();
  await p.locator("#stres .stcard").first().click();
  await p.locator("#editor:not([hidden])").waitFor();
  assert.equal(await p.evaluate(() => window.DailyDebug.doc().i), "zug-termin");
  assert.deepEqual(p.errs, []); await b.close();
});

test("Mikrofon: nur, wenn Erkennung auf dem Geraet hier bekannt geht; vorher eine neutrale Pruefung im Blatt, das Ergebnis bleibt gemerkt", async () => {
  ensureBuilt("");
  const b = await G.launch();
  // no speech recognition at all: no microphone, no check
  const none = await G.person(b, { lang: "de", view: "phone390", time: DAY });
  await none.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  let p = await G.open(none, "");
  await p.locator("#startbox").waitFor();
  assert.equal(await p.locator("#satzmic").isVisible(), false);
  await p.locator(".sttile[data-i=gruss]").click(); await p.locator("#wunsch").waitFor();
  assert.equal(await p.locator("#micask").count(), 0);
  await none.close();
  // recognition on the device: not shown before it is known; the neutral check in the sheet, then the microphone, remembered
  const on = await G.person(b, { lang: "de", view: "phone390", time: DAY, web: true });
  await on.addInitScript(speech, "available");
  p = await G.open(on, "");
  assert.equal(await p.locator("#satzmic").isVisible(), false, "unbekannt: kein Knopf, der dann geht nicht sagt");
  assert.equal(await p.evaluate(() => window.__sr.asked), null, "beim Laden wird nichts gefragt");
  await p.locator(".sttile[data-i=gruss]").click();
  await p.locator("#micask").filter({ hasText: "Spracheingabe auf diesem Gerät prüfen" }).click();
  await p.locator("#shelf .stico.mic:not([hidden])").waitFor();
  await p.reload(); await p.locator("#startbox").waitFor();
  await p.locator("#satzmic").waitFor();
  assert.equal(await p.locator("#satzmic").getAttribute("aria-label"), "Spracheingabe");
  await p.locator("#satzmic").click();
  await p.locator("#shelf:not([hidden]) #wunsch").waitFor();
  assert.equal(await p.locator("#wunsch").inputValue(), "Gute Besserung Papa");
  assert.match(await p.locator("#stres .stcard").first().textContent(), /Schick wem ein Danke/, "Gute Besserung: seit 2026-11 im Traeger");
  const sr = await p.evaluate(() => window.__sr);
  assert.equal(sr.asked.processLocally, true); assert.match(sr.asked.langs[0], /^de/); assert.equal(sr.local, true); assert.equal(sr.started, 1);
  assert.deepEqual(p.errs, []); await on.close();
  // not on the device ("downloadable"): said once in plain words, no microphone, never offered again
  const srv = await G.person(b, { lang: "de", view: "phone390", time: DAY, web: true });
  await srv.addInitScript(speech, "downloadable");
  p = await G.open(srv, "");
  await p.locator(".sttile[data-i=gruss]").click(); await p.locator("#micask").click();
  await p.locator(".stnote").filter({ hasText: "gibt es hier nicht" }).waitFor();
  assert.equal(await p.locator("#shelf .stico.mic").isVisible(), false);
  assert.equal(await p.evaluate(() => window.__sr.started), 0, "kein Zuhoeren ohne Zusage des Geraets");
  await p.reload(); await p.locator("#startbox").waitFor();
  await p.locator(".sttile[data-i=gruss]").click(); await p.locator("#wunsch").waitFor();
  assert.equal(await p.locator("#micask").count(), 0, "einmal gesagt, nicht wieder angeboten");
  assert.equal(await p.locator("#satzmic").isVisible(), false);
  assert.deepEqual(p.errs, []); await b.close();
});

test("Review #185: Feld bei 200 % auf dem Handy breit genug, Tageskarte bei 150 %/200 % nicht gequetscht, Kacheln bei 390x844 im ersten Bild, Letzte Tage erreichbar, Fokus nach Kachel", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  for (const view of ["p390z200", "p360z200", "zoom150", "zoom200"]) {
    const ctx = await G.person(b, { lang: "de", view, time: DAY }); await ctx.route(/^https?:/, (r) => r.abort());
    const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor(); await p.waitForTimeout(300);
    const m = await p.evaluate(() => ({ field: document.getElementById("satz").getBoundingClientRect().width, leaf: document.getElementById("leaf").getBoundingClientRect().height, card: (() => { const c = document.querySelector("#leaf .pvcard, #leaf .pvgame"); const r = c && c.getClientRects().length ? c.getBoundingClientRect() : null; return r ? r.height : 0; })() }));
    if (m.field < 120) bad.push(view + ": Satzfeld " + Math.round(m.field) + " px");
    if (m.leaf < 200) bad.push(view + ": Tageskarte " + Math.round(m.leaf) + " px");
    (await G.smallTargets(p, "#startbox")).forEach((v) => bad.push(view + " zu klein: " + v));
    assert.deepEqual(p.errs, [], view); await ctx.close();
  }
  // 360x800 (Galaxy A, common) and 360x780 (Galaxy S24): the day's title (minimum content) and the day's main button on the
  // first screen, the start begins on it (its question visible) and its tiles are reachable below; never the title goes.
  // Since 10 Nov the day's card keeps its game or picture (the ritual): all four tiles on the first screen as well left the
  // sheet under 250 px, where @container hid the preview (Netz Volley at 375x812). The same on a day with a live card (9 Nov).
  for (const day of [DAY, LIVE, AUKTION]) for (const h of [780, 800]) {
    const tag = "360x" + h + " " + day.slice(5, 10) + ": ";
    G.VIEWS["p360h" + h] = { viewport: { width: 360, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const c3 = await G.person(b, { lang: "de", view: "p360h" + h, time: day }); await c3.route(/^https?:/, (r) => r.abort());
    const q = await G.open(c3, ""); await q.locator("#startbox").waitFor(); await q.waitForTimeout(300);
    assert.equal(await q.locator("#livego").isVisible(), false, tag + "keine Live-Zeile: keine Live-Karte mehr im Regal");
    for (const sel of ["#hero", "#go"]) if (!(await G.inView(q, sel))) bad.push(tag + "nicht im ersten Bild: " + sel);
    (await startBegins(q)).forEach((v) => bad.push(tag + v));
    const t = await q.evaluate(() => { const e = document.getElementById("hero"); const r = e.getBoundingClientRect(); return { h: r.height, txt: e.textContent.trim(), vis: getComputedStyle(e).visibility, disp: getComputedStyle(e).display }; });
    if (!t.txt || t.h < 16 || t.vis !== "visible" || t.disp === "none") bad.push(tag + "Titel der Tageskarte fehlt " + JSON.stringify(t));
    // readable, not only present: every title line at least 14 px (readers up to 85; it shrank to 10.2 px on 11 Nov)
    const fs = await q.evaluate(() => Math.min(...[...document.getElementById("hero").children].map((e) => parseFloat(getComputedStyle(e).fontSize))));
    if (!(fs >= 14)) bad.push(tag + "Titel nur " + fs + " px");
    const tile = await q.evaluate(() => Math.min(...[...document.querySelectorAll(".sttile")].map((e) => e.getBoundingClientRect().height)));
    if (tile < 44) bad.push(tag + "Kachel " + tile + " px");
    assert.deepEqual(q.errs, []); await c3.close();
  }
  // 390x844: the day's main button (and the live row) on the first screen, the start begins on it, its tiles reachable below
  for (const day of [LIVE, AUKTION]) {
    const c4 = await G.person(b, { lang: "de", view: "phone390", time: day }); await c4.route(/^https?:/, (r) => r.abort());
    const q = await G.open(c4, ""); await q.locator("#startbox").waitFor(); await q.waitForTimeout(300);
    const tag = "390x844 " + day.slice(5, 10) + ": ";
    assert.equal(await q.locator("#livego").isVisible(), false, tag + "keine Live-Zeile: keine Live-Karte mehr im Regal (2026-11)");
    for (const sel of ["#hero", "#go"]) if (!(await G.inView(q, sel))) bad.push(tag + "nicht im ersten Bild: " + sel);
    (await startBegins(q)).forEach((v) => bad.push(tag + v));
    const fs = await q.evaluate(() => Math.min(...[...document.getElementById("hero").children].map((e) => parseFloat(getComputedStyle(e).fontSize))));
    if (!(fs >= 14)) bad.push(tag + "Titel nur " + fs + " px");
    (await G.smallTargets(q, "#startbox")).forEach((v) => bad.push(tag + "zu klein: " + v));
    assert.deepEqual(q.errs, []); await c4.close();
  }
  const ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY }); await ctx.route(/^https?:/, (r) => r.abort());
  const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor(); await p.waitForTimeout(300);
  for (const sel of ["#go", "#satz"]) if (!(await G.inView(p, sel))) bad.push("390x844: nicht im ersten Bild: " + sel);
  (await startBegins(p)).forEach((v) => bad.push("390x844: " + v));
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("startbox")).backgroundColor), "rgb(251, 245, 221)", "Creme #FBF5DD");
  // below the first screen now: Nächster Tag, Selber bauen, Letzte Tage, Meine Wand (#tools) and "Alle Karten"; reachable:
  await p.locator("#past").click(); await p.locator("#shelf:not([hidden]) #pastq").waitFor();
  await p.locator("#shback").click(); await p.locator("#startbox").waitFor();
  // a tile: the focus goes along to the sheet
  await p.locator(".sttile[data-i=planen]").click(); await p.waitForFunction(() => document.activeElement && document.activeElement.id === "shtitle");
  assert.deepEqual(p.errs, []); await b.close();
  assert.deepEqual(bad, []);
});

test("Tageskarte auf dem Handy zeigt ihr Spiel oder Bild (10. Nov.: Netz Volley ohne Vorschau bei 375x812), Blatt und Start an jedem Tag an derselben Stelle; Spielen und Erschaffe deine Karte im ersten Bild, kein Querscrollen", async () => {
  ensureBuilt("");
  const b = await G.launch(), bad = [];
  try {
  // 10 Nov: a game (canvas), Netz Volley; 19 Nov: a picture ("Mein Bot sagt"), whose preview was gone at 360x780
  const SIZES = { p375: [375, 812], p360h780: [360, 780], p320: [320, 568], p414: [414, 896] }, at = {};
  // the day's picture comes from the image host: a local stand-in answers it (nothing else leaves)
  const q0 = await b.newPage(); await q0.setContent('<body style="margin:0;background:linear-gradient(90deg,#ffd400,#2b4bff)">'); await q0.setViewportSize({ width: 320, height: 180 });
  const jpg = await q0.screenshot({ type: "jpeg" }); await q0.close();
  for (const [day, kind] of [["2026-11-10T10:00:00Z", "Spiel"], ["2026-11-19T10:00:00Z", "Bild"]]) for (const [n, [w, h]] of Object.entries(SIZES)) {
    G.VIEWS[n] = { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const ctx = await G.person(b, { lang: "de", view: n, time: day });
    await ctx.route(/^https?:/, (r) => (/\/duell\/img\/[\w-]+\.jpg$/.test(r.request().url()) ? r.fulfill({ status: 200, headers: { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" }, body: jpg }) : r.abort()));
    const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
    // the picture is there once loaded (#pv.pic); a hidden preview may never ask for it, so wait at most 5 s and say so
    if (kind === "Bild") await p.locator("#pv.pic").waitFor({ timeout: 5000 }).catch(() => bad.push(w + "x" + h + " " + day.slice(5, 10) + ": Bild nicht geladen"));
    await p.waitForTimeout(300);
    const tag = w + "x" + h + " " + day.slice(5, 10) + ": ", v = await preview(p);
    if (v.kind !== kind) bad.push(tag + "erwartet " + kind + ", da ist " + v.kind);
    // the reported bug: > 0; and more than a strip, where the screen is tall enough for the ritual (>= 701 px: >= 100 px)
    if (!(v.h > 0) || (h > 700 && v.h < 100) || v.top < 0 || v.bottom > v.ih) bad.push(tag + "Vorschau " + JSON.stringify(v));
    if (kind === "Spiel" && !(await p.evaluate(() => { const c = document.getElementById("pvcard"); return !!c && !c.hidden && c.getBoundingClientRect().height > 0; }))) bad.push(tag + "Spielbild nicht gezeichnet");
    for (const sel of ["#hero", "#go"]) if (!(await G.inView(p, sel))) bad.push(tag + "nicht im ersten Bild: " + sel);
    if (await hscroll(p)) bad.push(tag + "Querscrollen");
    // where the screen allows, the sentence field follows on the first screen too (375x812, 414x896 on a game day)
    if (kind === "Spiel" && (n === "p375" || n === "p414") && !(await G.inView(p, "#satz"))) bad.push(tag + "Satzfeld nicht im ersten Bild");
    if (h > 700) (await startBegins(p)).forEach((x) => bad.push(tag + x));
    // one format every day (11 Nov, "Verschiebt Format"): the sheet's height (its layout height, not the tilted box) and where
    // the start begins do not depend on game or picture
    const m = await p.evaluate(() => ({ leaf: document.getElementById("leaf").offsetHeight, start: Math.round(document.getElementById("startbox").getBoundingClientRect().top + document.getElementById("home").scrollTop) }));
    if (at[n]) { if (Math.abs(at[n].leaf - m.leaf) > 1 || Math.abs(at[n].start - m.start) > 1) bad.push(tag + "Format springt: Spiel " + JSON.stringify(at[n]) + ", Bild " + JSON.stringify(m)); } else at[n] = m;
    // "Erschaffe deine Karte": the second main action, full width under the main button, type like the tiles, >= 52 px, on the first screen
    const c = await p.evaluate(() => { const r = document.getElementById("create").getBoundingClientRect(), g = document.getElementById("go").getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(document.getElementById("create")).fontSize), h: r.height, w: r.width, gw: g.width, below: r.top >= g.bottom - 1 }; });
    if (!(c.fs >= 16 && c.h >= 52 && c.w >= c.gw - 2 && c.below)) bad.push(tag + "Erschaffe deine Karte " + JSON.stringify(c));
    if (h > 700 && !(await G.inView(p, "#create"))) bad.push(tag + "Erschaffe deine Karte nicht im ersten Bild");
    // the card's own extras (19 Nov: Look würfeln, Live ansehen) sit on the card, nothing over them
    (await blocked(p, "#leaf")).forEach((x) => bad.push(tag + "verdeckt: " + x));
    assert.deepEqual(p.errs, [], tag); await ctx.close();
  }
  } finally { await b.close(); }
  assert.deepEqual(bad, []);
});

test("Alle Karten: das Regal mit Suche und der freien Karte oben, alle Karten des Katalogs; ein Tipp oeffnet die Karte; keine Leiste", async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
    const ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY }); await ctx.route(/^https?:/, (r) => r.abort());
    const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
    await p.locator("#allcards").click(); await p.locator("#shelf:not([hidden]) #allq").waitFor();
    assert.equal((await p.locator("#shtitle").textContent()).trim(), "Alle Karten");
    assert.equal(await p.locator("#feat").isVisible(), false, "keine Leiste");
    // the free card always on top, before the search
    const free = await p.evaluate(() => { const f = document.getElementById("allfree"), q = document.getElementById("allq"); return f ? { txt: f.textContent, first: !!(f.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; });
    assert.ok(free && /Erschaffe deine Karte/.test(free.txt) && free.first, "freie Karte oben: " + JSON.stringify(free));
    const n = await p.locator("#alllist button.day").count();
    assert.ok(n >= 50, "mindestens 50 Karten, da sind " + n);
    await p.locator("#allq").fill("quiz");
    const hits = await p.locator("#alllist button.day span").allTextContents();
    assert.ok(hits.length >= 1 && hits.length < n, "Suche grenzt ein: " + hits.length);
    const pick = hits[0];
    await p.locator("#alllist button.day").first().click(); await p.locator("#shelf").waitFor({ state: "hidden" });
    assert.equal((await p.locator("#hero").innerText()).replace(/\s+/g, " ").trim().toLowerCase(), pick.replace(/\s+/g, " ").trim().toLowerCase(), "die gewaehlte Karte auf dem Blatt");
    assert.deepEqual(await galleryLinks(p), []);
    (await G.smallTargets(p, "#shelf")).forEach((v) => assert.fail("zu klein: " + v));
    assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

test("Erschaffe deine Karte: ohne Konto erst 16+ und Anmelden, der Rueckweg fuehrt ins Erschaffen; mit Konto direkt ins Erschaffen", async () => {
  ensureBuilt("");
  const b = await G.launch();
  // the server's /status says whether there is an account (meter "create"), as it does live
  const status = (acc) => (r) => { const u = r.request().url(); if (/\/api\/duell\/ai\/status$/.test(u)) return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(acc ? { meter: {}, create: { size: 5, remaining: 5, pot: "create", period: "ever", refundsLeft: 2, age16: true } } : { meter: {} }) }); return null; };
  try {
    // without an account: the short step in plain words, no way past the 16+ tick, then the sign-in with the way back
    let ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY, web: true }), login = null;
    await ctx.route(/^https?:/, (r) => { const u = r.request().url(); if (/\/auth\/login\?/.test(u)) { login = u; return r.fulfill({ status: 200, contentType: "text/html", body: "<p>Login</p>" }); } return status(false)(r) || (G.isLocal(u) ? r.continue() : r.abort()); });
    let p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
    await p.locator("#create").click(); await p.locator("#shelf:not([hidden]) #createlogin").waitFor();
    assert.equal((await p.locator("#createlogin").textContent()).trim(), "Anmelden");
    assert.equal((await p.locator(".cr16").textContent()).trim(), "Ich bin 16 oder älter.");
    assert.doesNotMatch(await p.locator("#shelf").innerText(), /\b[a-z]+_[a-zA-Z0-9_]+\b/, "kein Textschluessel");
    await p.locator("#createlogin").click(); await p.locator(".crneed", { hasText: "Ich bin 16 oder älter" }).waitFor();
    assert.equal(login, null, "ohne Haken keine Anmeldung");
    assert.equal(await p.evaluate(() => document.activeElement.id), "create16", "der Fokus auf dem Haken");
    await p.locator("#create16").check();
    await Promise.all([p.waitForURL(/\/auth\/login\?/), p.locator("#createlogin").click()]);
    const ret = decodeURIComponent(new URL(login).searchParams.get("return"));
    assert.equal(ret, "/duell?go=erschaffen", "Rueckweg ins Erschaffen");
    const prof = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("daily.v1")).profile; } catch (e) { return null; } });
    assert.ok(prof && prof.via === "account" && prof.age16 === true && prof.t0 > 0, "Versuch mit der 16+-Aussage dieses Tipps: " + JSON.stringify(prof));
    await ctx.close();
    // back from the sign-in (?go=erschaffen) with the account: the making opens by itself with its form, the address is clean
    ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY }); await ctx.route(/^https?:/, (r) => status(true)(r) || r.abort());
    p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e)));
    await p.goto("file://" + require("node:path").join(G.DIST, "index.html") + "?go=erschaffen");
    await p.getByLabel("Deine Beschreibung").waitFor();
    assert.doesNotMatch(await p.evaluate(() => location.search), /go=/);
    assert.deepEqual(p.errs, []); await ctx.close();
    // with an account: the tap opens the making at once, no step before it
    ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY }); await ctx.route(/^https?:/, (r) => status(true)(r) || r.abort());
    p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
    await p.locator("#create").click(); await p.getByLabel("Deine Beschreibung").waitFor();
    assert.equal(await p.locator("#createlogin").count(), 0, "kein Zwischenschritt mit Konto");
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Review #185 Runde 2: eine empfangene Karte bei 195 px Breite (390 bei 200 %): die Daumen stehen unter der Karte, nie darauf", async () => {
  ensureBuilt("");
  const b = await G.launch();
  try {
  const s = await G.person(b, { lang: "de", view: "phone390", time: DAY }); await s.route(/^https?:/, (r) => r.abort());
  const sp = await G.open(s, "#i=warm-gruss"); await sp.locator("#go").click(); await sp.locator("#done:not([hidden])").waitFor();
  const url = await sp.evaluate(() => window.DailyDebug.result().url); await s.close();
  // the card's picture (KI-Bild) loads here as on a phone: the sheet then shows card and picture together (.pv.pic)
  const ctx = await G.person(b, { lang: "de", view: "p390z200", time: DAY });
  const p = await G.open(ctx, url.slice(url.indexOf("#"))); await p.locator("#votes:not([hidden])").waitFor(); await p.locator("#pv.pic").waitFor(); await p.waitForTimeout(600);
  const m = await p.evaluate(() => { const r = (e) => e.getBoundingClientRect(); const cr = r(document.getElementById("pv")), cv = r(document.getElementById("pvcard")), v = r(document.getElementById("votes")); return { w: innerWidth, h: innerHeight, cardH: Math.round(cv.height), card: [cr.top, cr.bottom, cr.left, cr.right], votes: [v.top, v.bottom, v.left, v.right] }; });
  assert.ok(m.cardH >= 140 && m.card[1] <= m.h, "Karte >= 140 px im ersten Bild: " + JSON.stringify(m));
  assert.ok(m.w <= 200, "195 px breit: " + m.w);
  const over = !(m.votes[0] >= m.card[1] - 1 || m.votes[1] <= m.card[0] + 1 || m.votes[2] >= m.card[3] - 1 || m.votes[3] <= m.card[2] + 1);
  assert.equal(over, false, "Daumen ueber der Karte: " + JSON.stringify(m));
  assert.ok(m.votes[0] >= m.card[1] - 1, "Daumen unter der Karte: " + JSON.stringify(m));
  // Runde 3: the AI picture's thumbnail (a button: swap large/small) sits in the card's top corner, over its frame only, never
  // over the card's text (which starts below the top quarter of the card)
  const th = await p.evaluate(() => { const i = document.querySelector("#pv .pvimg"), c = document.getElementById("pvcard").getBoundingClientRect(), r = i.getBoundingClientRect(); return { role: i.getAttribute("role"), h: Math.round(r.height), bottom: Math.round(r.bottom), into: Math.round(r.bottom - c.top), limit: Math.round(c.height * 0.25), right: Math.round(r.right), w: innerWidth }; });
  assert.ok(th.into <= th.limit, "Vorschaubild nur im oberen Rand der Karte: " + JSON.stringify(th));
  assert.ok(th.h >= 44 && th.right <= th.w, "Vorschaubild 44 px und ganz im Bild: " + JSON.stringify(th));
  assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});

// Since the shelf clean-up (2026-11) "Danke an Oma" makes "Schick wem ein Danke", which opens its editor at once (no
// feel-good sheet with "Karte fertig machen" in between): the editor's main button has to be in sight instead.
test("Review #185 Runde 3: nach „Karte machen“ ist der Hauptknopf des Editors bei 150 % und 200 % ganz im Bild", async () => {
  ensureBuilt("");
  G.VIEWS.p390z150 = Object.assign(G.zoom({ width: 390, height: 844 }, 1.5), { isMobile: true, hasTouch: true });
  const b = await G.launch(), bad = [];
  try {
    for (const view of ["p390z150", "p390z200"]) {
      const ctx = await G.person(b, { lang: "de", view, time: DAY }); await ctx.route(/^https?:/, (r) => r.abort());
      const p = await G.open(ctx, ""); await p.locator("#startbox").waitFor();
      await p.locator("#satz").fill("Danke an Oma"); await p.locator("#satz").press("Enter");
      await p.locator("#stmake").click(); await p.locator("#editor:not([hidden])").waitFor();
      await G.poll(() => G.inView(p, "#edmain"), (v) => v, { timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(400);
      const m = await p.evaluate(() => { const g = document.getElementById("edmain").getBoundingClientRect(); return { top: Math.round(g.top), bottom: Math.round(g.bottom), h: innerHeight, txt: document.getElementById("edmain").textContent.trim() }; });
      if (!(await G.inView(p, "#edmain"))) bad.push(view + ": " + JSON.stringify(m));
      if (!m.txt) bad.push(view + ": Hauptknopf ohne Text");
      assert.equal(await p.evaluate(() => window.DailyDebug.doc().i), "karte-danke", view);
      assert.deepEqual(p.errs, [], view); await ctx.close();
    }
  } finally { await b.close(); }
  assert.deepEqual(bad, []);
});

test("Daily Business bleibt wie es war: kein neuer Start, die Leiste steht offen", async () => {
  ensureBuilt("business");
  const b = await G.launch(), ctx = await G.person(b, { lang: "de", view: "phone390" });
  await ctx.route(/^https?:/, (r) => r.abort());
  const p = await G.open(ctx, "", { flavor: "business" });
  assert.equal(await p.locator("#startbox").count(), 0);
  assert.equal(await p.evaluate(() => !!window.StartUI), false);
  assert.equal(await p.locator("#feat").isVisible(), true);
  assert.deepEqual(p.errs, []); await b.close();
});

test("Teil start fehlt (offline nach einem Update, SRI verweigert): die bisherige Startseite bleibt ganz bedienbar", async () => {
  ensureBuilt("");
  const b = await G.launch();
  for (const how of ["fehlt", "veraendert"]) {
    const ctx = await G.person(b, { lang: "de", view: "phone390", time: DAY, web: true });
    await ctx.route(/^https?:/, async (r) => {
      const u = r.request().url();
      if (!G.isLocal(u)) return r.abort();
      if (!/\/parts\/start\.[0-9a-f]{12}\.js$/.test(u)) return r.continue();
      if (how === "fehlt") return r.abort();
      return r.fulfill({ status: 200, contentType: "text/javascript", body: "window.StartUI = { home: function () { throw new Error('fremd'); } };" });   // the SRI hash refuses it
    });
    const p = await G.open(ctx, "");
    assert.equal(await p.evaluate(() => !!window.StartUI), false, how + ": kein fremder oder halber Start");
    assert.equal(await p.locator("#startbox").count(), 0);
    assert.equal(await G.inView(p, "#go"), true, how + ": Tageskarte mit Hauptknopf");
    assert.equal(await p.locator("#feat").isVisible(), true, how + ": die Leiste wie bisher");
    await p.locator("#go").click(); await p.locator(".arcov, #editor:not([hidden])").first().waitFor();
    assert.deepEqual(p.errs, [], how); await ctx.close();
  }
  await b.close();
});
