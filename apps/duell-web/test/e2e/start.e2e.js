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
// Pixel 7 at 150 % (persona P6): 275x610 CSS px, the big-type order (intentions first); only here, not in every W0 screen,
// since that order puts the main button below the first screen on purpose.
G.VIEWS.zoom150 = Object.assign(G.zoom({ width: 412, height: 915 }, 1.5), { isMobile: true, hasTouch: true });
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
    // a first visit sees no demo strip, no jargon, no English: it waits behind "Alle Karten"
    assert.equal(await p.locator("#feat").isVisible(), false, view);
    assert.equal(await p.locator("#allcards").getAttribute("aria-expanded"), "false");
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
    // a short screen (small phone, 200 %) keeps sheet and main button on the first screen (rule A4) and, as before, no strip
    if (await p.evaluate(() => innerHeight <= 700)) {
      assert.equal(await p.locator("#allcards").isVisible(), false, view + ": kein Laufband auf kurzem Bildschirm");
      assert.deepEqual(p.errs, [], view); await ctx.close(); continue;
    }
    // "Alle Karten" opens the strip, and this device remembers it
    await p.locator("#allcards").click();
    await p.locator("#feat .lane button:not([aria-hidden])").first().waitFor();
    assert.equal(await p.locator("#allcards").getAttribute("aria-expanded"), "true");
    (await axe(p, "#startbox")).forEach((v) => bad.push(view + " axe offen: " + v));
    await p.reload(); await p.locator("#startbox").waitFor();
    assert.equal(await p.locator("#allcards").getAttribute("aria-expanded"), "true", view + ": bleibt offen");
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
    assert.equal(await p.locator("#wunsch").inputValue(), "Danke an Oma");
    assert.deepEqual(await p.locator("#stres .stchip").allTextContents(), ["Gruß schicken", "Für: Oma"]);
    assert.match(await p.locator("#stres .stcard").first().textContent(), /Danke, dass es dich gibt.*Passt genau/);
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
    // result, not status: the card that comes out carries the sentence's person in front
    await p.locator("#wunsch").fill("Danke an Oma"); await p.locator("#stres .stchip", { hasText: "Für: Oma" }).waitFor();
    await p.locator("#stmake").click();
    await p.locator("#done:not([hidden])").waitFor();
    assert.equal(await p.evaluate(() => window.DailyDebug.result().keep.doc.x), "Oma, danke, dass es dich gibt.");
    assert.equal(await p.evaluate(() => window.DailyDebug.result().keep.doc.i), "warm-danke");
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
  const want = { gruss: /Kleiner Gruß für deinen Tag/, planen: /Wann könnt ihr alle\?/, spielen: /Mal & Rat|Kennst du mich/, stimme: /Stimme: Monster|Stimme verzerren/ };
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

test("Mikrofon: ohne Spracherkennung ausgeblendet; hoert nur mit Erkennung auf dem Geraet zu; sonst ehrlich aus", async () => {
  ensureBuilt("");
  const b = await G.launch();
  // no speech recognition at all: no microphone
  const none = await G.person(b, { lang: "de", view: "phone390", time: DAY });
  await none.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
  let p = await G.open(none, "");
  await p.locator("#startbox").waitFor();
  assert.equal(await p.locator("#satzmic").isVisible(), false);
  await none.close();
  // a browser that recognises on the device: the sentence comes from the voice and leads on
  const on = await G.person(b, { lang: "de", view: "phone390", time: DAY });
  await on.addInitScript(speech, "available");
  p = await G.open(on, "");
  await p.locator("#satzmic").waitFor();
  assert.equal(await p.evaluate(() => window.__sr.asked), null, "beim Laden wird nichts gefragt");
  assert.equal(await p.locator("#satzmic").getAttribute("aria-label"), "Spracheingabe");
  await p.locator("#satzmic").click();
  await p.locator("#shelf:not([hidden]) #wunsch").waitFor();
  assert.equal(await p.locator("#wunsch").inputValue(), "Gute Besserung Papa");
  assert.match(await p.locator("#stres .stcard").first().textContent(), /Gute Besserung/);
  const sr = await p.evaluate(() => window.__sr);
  assert.equal(sr.asked.processLocally, true); assert.match(sr.asked.langs[0], /^de/); assert.equal(sr.local, true); assert.equal(sr.started, 1);
  assert.deepEqual(p.errs, []); await on.close();
  // not on the device ("downloadable"): it does not listen, says so and steps aside
  const srv = await G.person(b, { lang: "de", view: "phone390", time: DAY });
  await srv.addInitScript(speech, "downloadable");
  p = await G.open(srv, "");
  await p.locator("#satzmic").click();
  await p.locator("#toast").filter({ hasText: "Spracheingabe geht hier gerade nicht." }).waitFor();
  assert.equal(await p.locator("#satzmic").isVisible(), false);
  assert.equal(await p.evaluate(() => window.__sr.started), 0, "kein Zuhoeren ohne Zusage des Geraets");
  assert.deepEqual(p.errs, []); await b.close();
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
