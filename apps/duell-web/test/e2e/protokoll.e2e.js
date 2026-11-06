"use strict";
// Fast Easy Protokoll end to end: Chrome's fake microphone, whisper replaced by a scripted recogniser, the AI by a route.
// The page is served on a made-up https origin with the gallery's isolation headers, like /duell/protokoll in production.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const DIST = path.resolve(__dirname, "../../dist"), ORIGIN = "https://protokoll.test";
const ISOLATED = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" };
const SAID = ["Thema: Sommerfest der Abteilung.", "Wir haben beschlossen, am Freitag zu feiern.", "Anna kümmert sich um die Getränke bis Mittwoch, Mail an anna@firma.de."];
const CONSENT = "Alle Anwesenden wissen, dass mitgeschrieben wird, und sind einverstanden.";

async function open(o = {}) {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const ctx = await b.newContext({ locale: "de-DE", acceptDownloads: true, viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(["microphone"], { origin: ORIGIN });
  const p = await ctx.newPage();
  p.setDefaultTimeout(15000);
  const seen = { hosts: new Set(), ai: [], errors: [] };
  p.on("pageerror", (e) => seen.errors.push(e.message));
  p.on("request", (r) => seen.hosts.add(new URL(r.url()).host));
  await p.route(ORIGIN + "/duell/protokoll*", (r) => r.fulfill({ body: fs.readFileSync(path.join(DIST, "protokoll.html")), headers: { "Content-Type": "text/html; charset=utf-8", ...(o.isolated === false ? {} : ISOLATED) } }));
  await p.route(ORIGIN + "/api/duell/ai", async (r) => {
    seen.ai.push(JSON.parse(r.request().postData()));
    const a = o.ai || { status: 200, body: { kind: "protokoll", options: [{ title: "Sommerfest", participants: ["Anna", "Ben"], topics: ["Sommerfest"], decisions: ["Feier am Freitag"], tasks: [{ who: "Anna", what: "Getränke besorgen", due: "Mittwoch" }] }], meter: { remaining: 2, free: 3 } } };
    await r.fulfill({ status: a.status, contentType: "application/json", body: JSON.stringify(a.body) });
  });
  if (o.vendor) await p.route(ORIGIN + "/static/vendor/untertitel/*", o.vendor);
  await p.addInitScript(({ said, mock, mem }) => {
    if (mem) Object.defineProperty(navigator, "deviceMemory", { get: () => mem });
    if (!mock) return;
    const calls = [];
    window.ProtokollTest = {
      calls,
      tuning: { minSec: 1, maxSec: 2, pauseSec: 0.3, quiet: 0.00001 },
      recognizer: {
        load: async (progress) => { progress(0.5); progress(1); },
        transcribe: async (pcm) => { calls.push(pcm.length); return said[calls.length - 1] || ""; },
        close: () => { window.ProtokollTest.closed = true; }
      }
    };
  }, { said: SAID, mock: o.mock !== false, mem: o.mem || 0 });
  await p.goto(ORIGIN + "/duell/protokoll?lang=de");
  return { b, p, seen };
}

test("Protokoll: Zustimmung vor dem Start, sichtbare Aufnahme, Stopp, KI nur nach Ja, Export und Loeschen", async () => {
  const { b, p, seen } = await open();
  assert.match(await p.locator("#fit").textContent(), /Dieses Gerät schafft die Mitschrift/);
  await p.locator("#names").fill("Anna, Ben");
  await p.getByRole("button", { name: "Mitschrift starten" }).click();
  await p.getByText("Bitte erst bestätigen, dass alle Bescheid wissen.").waitFor();
  assert.equal(await p.locator("#rec").isHidden(), true, "ohne Zustimmung keine Aufnahme");

  await p.getByLabel(CONSENT).check();
  await p.getByRole("button", { name: "Mitschrift starten" }).click();
  await p.locator("#rec").waitFor();
  assert.match(await p.title(), /^● Aufnahme läuft/);
  assert.equal(await p.locator("#recnames").textContent(), "Dabei: Anna, Ben");
  await p.locator("#lines li").nth(2).waitFor({ timeout: 20000 });
  const calls = await p.evaluate(() => window.ProtokollTest.calls.slice());
  assert.ok(calls.every((n) => n >= 16000 && n <= 16000 * 2 + 4096), "Stuecke von 1 bis 2 s bei 16 kHz: " + calls.join(","));

  await p.getByRole("button", { name: "Pause" }).click();
  assert.equal(await p.locator("#recstate").textContent(), "Pausiert");
  await p.getByRole("button", { name: "Weiter" }).click();
  await p.getByRole("button", { name: "■ Stopp" }).click();
  await p.locator("#review").waitFor();
  await p.waitForFunction(() => !document.getElementById("transcript").disabled);
  assert.equal(await p.title(), "Fast Easy Protokoll", "nach dem Stopp kein Aufnahme-Zeichen mehr");
  assert.equal(await p.evaluate(() => window.ProtokollDebug.live()), false);
  assert.equal(await p.evaluate(() => window.ProtokollTest.closed), true, "Erkennung beendet");
  assert.match(await p.locator("#transcript").inputValue(), /^Thema: Sommerfest der Abteilung\.\nWir haben beschlossen/);
  assert.equal(seen.ai.length, 0, "vor dem Ja geht nichts an die KI");

  await p.getByRole("button", { name: "Mit KI zusammenfassen …" }).click();
  await p.locator("#aiask").waitFor();
  await p.getByText("Genau diesen Text ansehen").click();
  const preview = await p.locator("#aipreview").textContent();
  assert.match(preview, /\[E-Mail\]/); assert.doesNotMatch(preview, /anna@firma/);
  await p.getByRole("button", { name: "Senden und zusammenfassen" }).click();
  await p.getByText("Bitte erst zustimmen oder das Protokoll auf dem Gerät erstellen.").waitFor();
  assert.equal(seen.ai.length, 0);
  await p.getByLabel("Ja, diesen Text einmalig zur Zusammenfassung senden.").check();
  await p.getByRole("button", { name: "Senden und zusammenfassen" }).click();
  await p.locator("#result").waitFor();

  assert.equal(seen.ai.length, 1);
  const sent = seen.ai[0];
  assert.equal(sent.kind, "protokoll"); assert.equal(sent.lang, "de"); assert.match(sent.device, /^[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(sent.input).sort(), ["consent", "names", "text"], "nur Text, Namen, Zustimmung");
  assert.equal(sent.input.consent, true); assert.deepEqual(sent.input.names, ["Anna", "Ben"]);
  assert.doesNotMatch(JSON.stringify(sent), /anna@firma/);
  assert.deepEqual([...seen.hosts], ["protokoll.test"], "keine Anfrage an einen anderen Host");

  const box = p.locator("#protocol");
  assert.equal(await box.locator("h2").textContent(), "Sommerfest");
  for (const s of ["Teilnehmende", "Themen", "Entscheidungen", "Aufgaben", "Feier am Freitag", "Getränke besorgen"]) assert.match(await box.textContent(), new RegExp(s));
  assert.match(await box.locator(".src").textContent(), /eigener Server, ohne Speicherung/);

  await p.getByLabel("Mitschrift beim Exportieren anhängen").check();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Als Datei (.md)" }).click()]);
  assert.match(dl.suggestedFilename(), /^protokoll-\d{4}-\d{2}-\d{2}\.md$/);
  const md = fs.readFileSync(await dl.path(), "utf8");
  assert.match(md, /^# Sommerfest – /); assert.match(md, /- \[ \] Anna: Getränke besorgen \(bis Mittwoch\)/); assert.match(md, /## Mitschrift\n\[00:0\d\] Thema: Sommerfest/);

  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("protokoll.v1")));
  assert.equal(stored.length, 1); assert.equal(stored[0].protocol.source, "ai");
  assert.deepEqual(Object.keys(stored[0]).sort(), ["at", "id", "names", "protocol", "sec", "segs"], "nur Text in der Ablage, kein Ton");
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Löschen" }).click();
  await p.locator("#intro").waitFor();
  assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem("protokoll.v1"))), []);
  assert.equal(await p.locator("#savedbox").isHidden(), true);
  assert.deepEqual(seen.errors, []);
  await b.close();
});

test("Protokoll: KI-Kontingent leer -> ehrlicher Hinweis, Protokoll entsteht auf dem Geraet; Liste und Alle loeschen", async () => {
  const { b, p, seen } = await open({ ai: { status: 429, body: { error: "quota", meter: { remaining: 0, free: 3 } } } });
  await p.getByLabel(CONSENT).check();
  await p.locator("#names").fill("Anna");
  await p.getByRole("button", { name: "Mitschrift starten" }).click();
  await p.locator("#lines li").nth(2).waitFor({ timeout: 20000 });
  await p.getByRole("button", { name: "■ Stopp" }).click();
  await p.waitForFunction(() => !document.getElementById("transcript").disabled);
  await p.getByRole("button", { name: "Mit KI zusammenfassen …" }).click();
  await p.getByLabel("Ja, diesen Text einmalig zur Zusammenfassung senden.").check();
  await p.getByRole("button", { name: "Senden und zusammenfassen" }).click();
  await p.locator("#result").waitFor();
  assert.match(await p.locator("#note").textContent(), /freien KI-Zusammenfassungen sind aufgebraucht/);
  const box = await p.locator("#protocol").textContent();
  assert.match(box, /Sommerfest der Abteilung/); assert.match(box, /beschlossen, am Freitag/); assert.match(box, /Anna/);
  assert.match(await p.locator("#protocol .src").textContent(), /auf dem Gerät nach einfachen Regeln/);
  assert.equal(seen.ai.length, 1);
  await p.getByRole("button", { name: "Neues Meeting" }).click();
  await p.locator("#savedbox").waitFor();
  assert.equal(await p.locator("#saved li").count(), 1);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Alle Protokolle löschen" }).click();
  await p.locator("#savedbox").waitFor({ state: "hidden" });
  assert.equal(await p.evaluate(() => localStorage.getItem("protokoll.v1")), null);
  await b.close();
});

test("Protokoll: ehrliche Hinweise - ohne Isolation kein Start, schwaches Geraet, kleines Modell", async () => {
  let { b, p } = await open({ isolated: false, mock: false });
  assert.match(await p.locator("#fit").textContent(), /Dieser Browser kann die Mitschrift nicht/);
  assert.equal(await p.locator("#start").isDisabled(), true);
  await b.close();
  ({ b, p } = await open({ mock: false, mem: 1 }));
  assert.match(await p.locator("#fit").textContent(), /zu wenig Speicher/);
  assert.equal(await p.locator("#start").isDisabled(), true);
  await b.close();
  ({ b, p } = await open({ mock: false, mem: 3 }));
  assert.match(await p.locator("#fit").textContent(), /kleine Modell \(etwa 34 MB\)/);
  assert.equal(await p.locator("#model").inputValue(), "tiny");
  await b.close();
});

test("Protokoll: Modell nur von der eigenen Domain; Sperre im Firmennetz und kaputte Datei werden ehrlich gemeldet", async () => {
  const asked = [];
  let { b, p, seen } = await open({ mock: false, mem: 8, vendor: (r) => { asked.push(new URL(r.request().url()).pathname); return r.fulfill({ status: 403, body: "blocked" }); } });
  await p.getByLabel(CONSENT).check();
  await p.getByRole("button", { name: "Mitschrift starten" }).click();
  await p.getByText("Vielleicht sperrt das Firmennetz den Download.", { exact: false }).waitFor();
  assert.ok(asked.includes("/static/vendor/untertitel/shout.wasm.js"));
  assert.deepEqual([...seen.hosts], ["protokoll.test"]);
  assert.equal(await p.locator("#start").isDisabled(), false, "erneut versuchen geht");
  await b.close();
  ({ b, p } = await open({ mock: false, mem: 8, vendor: (r) => r.fulfill({ status: 200, body: "nicht das Modell" }) }));
  await p.getByLabel(CONSENT).check();
  await p.getByRole("button", { name: "Mitschrift starten" }).click();
  await p.getByText("Das Sprachmodell kam beschädigt an", { exact: false }).waitFor();
  assert.equal(await p.locator("#rec").isHidden(), true);
  await b.close();
});

test("Protokoll -> Aufgaben-Link: Namen nur wo im Meeting genannt, Frist als Tag, die App oeffnet die Liste", async () => {
  const ai = { status: 200, body: { kind: "protokoll", options: [{ title: "Sommerfest", participants: ["Anna", "Ben"], topics: ["Sommerfest"], decisions: [],
    tasks: [{ who: "Anna", what: "Getränke besorgen", due: "Mittwoch" }, { who: "Ben", what: "Raum buchen", due: "" }] }], meter: { remaining: 2, free: 3 } } };
  const { b, p, seen } = await open({ ai });
  await p.route(ORIGIN + "/duell", (r) => r.fulfill({ body: fs.readFileSync(path.join(DIST, "index.html")), headers: { "Content-Type": "text/html; charset=utf-8" } }));
  await p.getByLabel(CONSENT).check(); await p.getByRole("button", { name: "Mitschrift starten" }).click();
  await p.locator("#lines li").nth(2).waitFor({ timeout: 20000 });
  await p.getByRole("button", { name: "■ Stopp" }).click(); await p.waitForFunction(() => !document.getElementById("transcript").disabled);
  await p.getByRole("button", { name: "Mit KI zusammenfassen …" }).click();
  await p.getByLabel("Ja, diesen Text einmalig zur Zusammenfassung senden.").check();
  await p.getByRole("button", { name: "Senden und zusammenfassen" }).click(); await p.locator("#result").waitFor();
  const go = p.getByRole("button", { name: "✅ Aufgaben zum Abhaken teilen" });
  if (process.env.SHOT_DIR) await p.screenshot({ path: process.env.SHOT_DIR + "/wa-protokoll-aufgaben.png", fullPage: true });
  const nav = p.waitForURL(/\/duell#todo=|\/duell$/); await go.click(); await nav;
  await p.locator("#panel .shoprow").first().waitFor();
  const rows = await p.locator("#panel .shoprow").allInnerTexts();
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Getränke besorgen\nmacht: 🐸 Anna · bis Mi \d{1,2}\.\d{1,2}\./, "Anna fiel im Meeting: zustaendig, Frist Mittwoch");
  assert.match(rows[1], /Raum buchen\noffen/, "Ben fiel nie: offen");
  assert.equal(await p.evaluate(() => location.hash), "");
  if (process.env.SHOT_DIR) await p.screenshot({ path: process.env.SHOT_DIR + "/wa-protokoll-liste.png" });
  assert.deepEqual([...seen.hosts], ["protokoll.test"]); assert.deepEqual(seen.errors, []);
  await b.close();
});
