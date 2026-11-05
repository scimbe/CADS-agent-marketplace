"use strict";
// Texte und Song: Worte finden (feel-good card), card text from an occasion and a personal detail, song with beat and
// hook in one call, the hook running with the beat, the video saved on the device; crisis help without the network.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, devices } = require("playwright");
// sha256 over canonical() of CADS-DEMO-wrapper lib/duell-seal.mjs, base64url (as the server sends in hashes[])
const H_MUT = "L--R_-8RGeXFiQcQQauJABrvXgrNiAtBCOhyeU-KLn0", H_KUCHEN = "N1vjEY1pFyFNgkoikVg8XiFJ3XDoVWKaRXeJQ_k7r74";
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.SHOTS || "";
const METER = { free: 7, remaining: 6, period: "week" };
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api, init) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE", acceptDownloads: true }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  if (init) await p.addInitScript(init);
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (u.startsWith(API)) { const path0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: path0, body }); const a = api && api(path0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(page);
  return { p, errs, sent };
}
const shot = (p, name) => (SHOTS ? p.screenshot({ path: path.join(SHOTS, "wb2-worte-" + name + ".png") }) : null);
const open = (p, pick, tab) => p.evaluate(([pk, tb]) => {
  const D = window.Daily, A = window.DailyApp;
  if (pk === "sound") { A.openEditor(D.blankDoc("sound", A.me(), "de"), { own: true, tab: tb }); return; }
  const i = D.IDEAS.find((x) => x.kind === "card" && (pk === "herz" ? x.warm === "herz" || x.style === "herz" : x.style !== "herz"));
  A.openEditor(D.docFromIdea(i, A.me(), "de"), { idea: i, tab: tb });
}, [pick, tab]);
const doc = (p) => p.evaluate(() => window.DailyDebug.doc());

test("Worte finden: Anlass tippen, 3 fertige Toene ohne KI-Aktion und ohne Netz, Name lokal vorn, als KI markiert", async () => {
  const { p, errs, sent } = await phone(null);
  await open(p, "herz", "Text");
  await p.locator(".txbox .lbl", { hasText: "Worte finden" }).waitFor();
  await p.locator(".txan button", { hasText: "Mut" }).tap();                                       // 1 tap
  const opts = p.locator(".txopt");
  assert.equal(await opts.count(), 3);
  assert.deepEqual((await opts.allTextContents()).map((x) => x.split(" · ")[0]), ["warm", "locker", "kurz"]);
  await p.getByLabel("Für wen? (Name bleibt auf dem Handy)").fill("Lea");
  assert.match(await opts.first().textContent(), /^warm · Lea, /);
  await shot(p, "worte");
  const want = (await opts.nth(2).textContent()).split(" · ")[1];
  await opts.nth(2).tap();                                                                          // 2 taps
  const d = await doc(p);
  assert.equal(d.x, want); assert.deepEqual(d.ki, { k: "text" }, "vorab mit KI erzeugt, so markiert");
  assert.equal(await p.locator("#panel textarea").inputValue(), want, "das Textfeld zeigt den neuen Text");
  assert.deepEqual(sent, [], "kein Aufruf, keine KI-Aktion");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Worte finden mit KI: Insider + Name; raus geht nur {name}, der Name wird lokal eingesetzt; Siegel und Hash; accept", async () => {
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") return [200, { kind: "text", options: [{ ton: "warm", x: "{name}, du schaffst das morgen!" }, { ton: "locker", x: "Hey {name}, rock die Prüfung!" }, { ton: "kurz", x: "{name}: Mut!" }], seals: ["s2.text.m1.sigM0001", "s2.text.m2.sigM0002", "s2.text.m3.sigM0003"], cost: 1, receipt: "rc-text-1", meter: METER }];
    if (path0 === "ai/accept") return [200, { meter: METER }];
    return null;
  });
  await open(p, "herz", "Text");
  await p.locator(".txan button", { hasText: "Mut" }).tap();
  await p.getByLabel("Für wen? (Name bleibt auf dem Handy)").fill("Lea");
  await p.getByLabel("Etwas Persönliches (optional, nur Nettes)").fill("Lea hat morgen die Mathe-Prüfung");
  await p.getByRole("button", { name: "✨ Eigene Worte" }).tap();
  await p.locator(".aiopt", { hasText: "Lea, du schaffst das morgen!" }).waitFor();
  assert.deepEqual(await p.locator(".aiopt").allTextContents(), ["warm · Lea, du schaffst das morgen!", "locker · Hey Lea, rock die Prüfung!", "kurz · Lea: Mut!"]);
  await shot(p, "worte-ki");
  await p.locator(".aiopt").first().tap();
  while (sent.length < 2) await p.waitForTimeout(50);
  assert.deepEqual(sent[0].body.kind, "text");
  assert.deepEqual(sent[0].body.input, { art: "worte", anlass: "mut", insider: "{name} hat morgen die Mathe-Prüfung", name: true });
  assert.ok(!JSON.stringify(sent[0].body).includes("Lea"), "der Name verlaesst das Geraet nicht");
  const d = await doc(p);
  assert.equal(d.x, "Lea, du schaffst das morgen!"); assert.deepEqual(d.ki, { k: "text", s: "s2.text.m1.sigM0001", h: H_MUT });
  assert.deepEqual(sent.map((x) => x.path), ["ai", "ai/accept"]);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Krise: das Wort bleibt auf dem Geraet, Hilfe mit 116 111 erscheint sofort; meldet der Server crisis, dieselbe Hilfe; kind_ok sagt es freundlich", async () => {
  let why = "crisis";
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? [422, { error: "blocked", why, help: "vom Server", meter: METER }] : null));
  await open(p, "herz", "Text");
  await p.locator(".txan button", { hasText: "Trost" }).tap();
  await p.getByLabel("Etwas Persönliches (optional, nur Nettes)").fill("ich will nicht mehr leben");
  await p.getByRole("button", { name: "✨ Eigene Worte" }).tap();
  const help = p.locator('.aistate[role="alert"]');
  await help.waitFor();
  assert.equal(await help.textContent(), await p.evaluate(() => window.Kit.t("aiCrisis")), "der zentrale Krisenhinweis aus ai.js");
  assert.match(await help.textContent(), /Nummer gegen Kummer 116 111.*TelefonSeelsorge 0800 111 0 111/);
  assert.deepEqual(sent, [], "nichts gesendet");
  // the whole hint, numbers included, is on screen and not under the sheet's buttons (FERTIG) once the scroll settled
  const seen = async () => { let last = ""; for (let i = 0; i < 40; i++) { const now = JSON.stringify(await help.boundingBox()); if (now === last) break; last = now; await p.waitForTimeout(50); }
    return help.evaluate((h) => { const r = h.getBoundingClientRect(), x = r.left + r.width / 2; return r.top >= 0 && r.bottom <= innerHeight && [r.top + 3, r.top + r.height / 2, r.bottom - 3].every((y) => h.contains(document.elementFromPoint(x, y))); }); };
  assert.equal(await seen(), true, "Krisenhinweis ganz sichtbar");
  await shot(p, "krise");
  // the server's own check (a word this page does not know): the same help, from the page's words, not the server's
  await p.getByLabel("Etwas Persönliches (optional, nur Nettes)").fill("ist traurig");
  await p.getByRole("button", { name: "✨ Eigene Worte" }).tap();
  while (!sent.length) await p.waitForTimeout(30);
  await help.waitFor();
  assert.doesNotMatch(await help.textContent(), /vom Server/);
  assert.equal(await seen(), true, "auch die Hilfe nach der Server-Antwort ist ganz sichtbar");
  why = "kind_ok";
  await p.getByRole("button", { name: "✨ Eigene Worte" }).tap();
  await p.locator(".aistate", { hasText: "Das baut die KI nicht. Probier einen freundlichen Wunsch. Nichts verbraucht." }).waitFor();
  assert.equal(await help.count(), 0);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Kartentext: Anlass-Chip + Insider -> 3 persoenliche Texte, sichtbar vor dem Uebernehmen; ohne Insider fertige Texte", async () => {
  const { p, errs, sent } = await phone((path0) => {
    if (path0 === "ai") return [200, { kind: "text", options: [{ t: "Kuchen-Urkunde", x: "Für den besten Kuchen der Stadt." }, { t: "Backprofi", x: "Dein Kuchen macht alle froh." }], seals: ["s2.text.k1.sigK0001", "s2.text.k2.sigK0002"], cost: 1, receipt: "rc-text-2", meter: METER }];
    if (path0 === "ai/accept") return [200, { meter: METER }];
    return null;
  });
  await open(p, "spruch", "Text");
  await p.locator(".txbox .lbl", { hasText: "Text für die Karte" }).waitFor();
  assert.equal(await p.getByRole("button", { name: /Spruch in deinem Stil/ }).count(), 0, "die alte Zeilen-KI ist ersetzt");
  await p.locator(".txan button", { hasText: "Urkunde" }).tap();
  assert.equal(await p.locator(".txopt").count(), 3, "fertige Urkunden-Texte, 0 Aktionen");
  await p.getByLabel("Etwas Persönliches (optional, nur Nettes)").fill("backt den besten Kuchen");
  await p.getByRole("button", { name: "✨ Persönlicher Text" }).tap();
  await p.locator(".aiopt", { hasText: "Für den besten Kuchen der Stadt." }).waitFor();
  await shot(p, "spruch");
  await p.locator(".aiopt").first().tap();
  while (sent.length < 2) await p.waitForTimeout(50);
  assert.deepEqual(sent[0].body.input, { art: "spruch", anlass: "urkunde", insider: "backt den besten Kuchen" });
  const d = await doc(p);
  assert.equal(d.x, "Für den besten Kuchen der Stadt."); assert.deepEqual(d.ki, { k: "text", s: "s2.text.k1.sigK0001", h: H_KUCHEN });
  assert.deepEqual(errs, []); await p.context().close();
});

const SONG = { kind: "text", options: [
  { titel: "{name} hat Geburtstag", hook: ["Heute feiern wir {name}", "Kuchen, Kerzen, Konfetti"], beat: { bpm: 170, k: "x---x---x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "x--x--x---x--x--", fx: "robot" } },
  { titel: "Party-Zeit", hook: ["Alle tanzen mit", "laut und bunt"], beat: { bpm: 170, k: "x---x---x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "x--x--x---x--x--", fx: "robot" } }],
  seals: ["s2.text.s1.sigS0001", "s2.text.s2.sigS0002"], cost: 1, receipt: "rc-song-1", meter: METER };

test("Song bauen: Anlass, ein Aufruf fuer Beat und Hook, Option tippen -> spielt sofort, Text laeuft im Takt mit; Video lokal", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? [200, SONG] : path0 === "ai/accept" ? [200, { meter: METER }] : null));
  await open(p, "sound", "Sound");
  await p.locator(".txbox .lbl", { hasText: "Song bauen" }).waitFor();
  await p.locator(".txan button", { hasText: "Geburtstag" }).tap();                                  // 1
  await p.getByLabel("Für wen? (Name bleibt auf dem Handy)").fill("Lea");
  await p.getByRole("button", { name: "✨ Song bauen" }).tap();                                      // 2
  const o = p.locator(".aiopt", { hasText: "Lea hat Geburtstag" });
  await o.waitFor();
  assert.equal(await o.textContent(), "Lea hat Geburtstag — Heute feiern wir Lea / Kuchen, Kerzen, Konfetti", "vor dem Uebernehmen lesbar");
  await o.tap();                                                                                      // 3: plays
  const d = await doc(p);
  assert.deepEqual(sent.filter((x) => x.path === "ai").length, 1, "Beat und Hook in einem Aufruf");
  assert.deepEqual(sent[0].body.input, { art: "song", anlass: "geburtstag", name: true });
  assert.equal(d.x, "Lea hat Geburtstag"); assert.equal(d.bpm, 170); assert.equal(d.fx, "robot");
  assert.deepEqual(d.ly, ["Heute feiern wir Lea", "Kuchen, Kerzen, Konfetti"]); assert.equal(d.p.b, "x--x--x---x--x--");
  assert.deepEqual(d.ki, { k: "text", s: "s2.text.s1.sigS0001", h: d.ki.h }); assert.match(d.ki.h, /^[A-Za-z0-9_-]{43}$/);
  // one line per bar (16 steps, 1.41 s at 170 BPM): 0, then 1
  const lyr = [];
  for (let i = 0; i < 40 && new Set(lyr).size < 2; i++) { const l = await p.evaluate(() => window.DailyApp.ed().lyr); if (l >= 0) lyr.push(l); await p.waitForTimeout(100); }
  assert.deepEqual([...new Set(lyr)].filter((x) => x >= 0), [0, 1], "der Text laeuft im Takt mit");
  await p.getByRole("button", { name: /^■ / }).first().waitFor();
  await shot(p, "song");
  // video: the sheet and the beat, recorded here, saved as a file
  const v = p.getByRole("button", { name: "🎬 Als Video sichern" });
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), v.tap()]);
  await p.getByRole("button", { name: "● Nimmt auf …" }).count();
  const file = await dl.path(), head = fs.readFileSync(file).subarray(0, 4).toString("hex");
  assert.match(dl.suggestedFilename(), /^my-daily-song\.(webm|mp4)$/);
  if (SHOTS) fs.copyFileSync(file, path.join(SHOTS, "wb2-worte-song." + dl.suggestedFilename().split(".").pop()));
  assert.ok(fs.statSync(file).size > 10000, "Video mit Inhalt: " + fs.statSync(file).size);
  if (/webm$/.test(dl.suggestedFilename())) assert.equal(head, "1a45dfa3", "WebM/EBML");
  assert.deepEqual(sent.map((x) => x.path), ["ai", "ai/accept"], "das Video geht nirgendwohin");
  // the shared sheet carries the hook
  const shared = await p.evaluate(() => { const D = window.Daily; return D.sanitizeDoc(JSON.parse(JSON.stringify(window.DailyDebug.doc()))).ly; });
  assert.deepEqual(shared, d.ly);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Song: ohne MediaRecorder kein Video-Knopf; ohne KI bleibt der Beat-Baukasten", async () => {
  const { p, errs } = await phone((path0) => (path0 === "ai" ? [200, SONG] : path0 === "ai/accept" ? [200, { meter: METER }] : null), () => { delete window.MediaRecorder; });
  await open(p, "sound", "Sound");
  await p.locator(".txan button", { hasText: "Party" }).tap();
  await p.getByRole("button", { name: "✨ Song bauen" }).tap();
  await p.locator(".aiopt").first().tap();
  await p.waitForTimeout(300);
  assert.equal(await p.getByRole("button", { name: /Video/ }).count(), 0);
  assert.ok((await p.locator("#panel .grid .step").count()) >= 32, "Beat-Raster bleibt");
  await p.getByRole("button", { name: /^■ / }).first().tap();
  assert.equal(await p.evaluate(() => window.DailyApp.ed().lyr), -1, "Stopp: keine Zeile mehr hervorgehoben");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Ohne Netz: Song-Knopf sagt ehrlich 'nicht erreichbar', nichts geaendert; Text-Tab zeigt den Hook und kann ihn entfernen", async () => {
  const { p, errs } = await phone(null);
  await open(p, "sound", "Sound");
  const before = JSON.stringify(await doc(p));
  await p.locator(".txan button", { hasText: "Party" }).tap();
  await p.getByRole("button", { name: "✨ Song bauen" }).tap();
  await p.locator(".aistate", { hasText: "KI gerade nicht erreichbar. Nichts verbraucht." }).waitFor();
  assert.equal(JSON.stringify(await doc(p)), before);
  await p.evaluate(() => { const A = window.DailyApp, d = A.ed().doc; d.ly = ["Eins zwei", "drei vier"]; });
  await p.getByRole("tab", { name: "Text" }).tap();
  await p.getByRole("button", { name: "✕ Songtext entfernen" }).tap();
  assert.equal((await doc(p)).ly, undefined);
  assert.deepEqual(errs, []); await p.context().close();
});
