"use strict";
// Flight game MVP 1 (KI-Konzept 7): one way in "What do you want to fly?", the welt answer taken 1:1 after a visible
// preview with its AI mark, a route of 3 sections in the game and in the challenge link, the way without AI.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, devices } = require("playwright");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const SHOTS = process.env.WELT_SHOTS || "";      // a folder: screenshots of the flow (412x915)
// The live answer for "Unter Wasser mit Haien, dann ein Sturm" (kind welt, 2026-11-05) and the hash the server sent with it.
const OPT = { params: { gravity: 1800, flapPower: 430, pipeGap: 140, pipeSpeed: 130 }, theme: "day", title: "Hai-Abenteuer", emoji: "🐳", abschnitte: [{ physik: "schwebend", delta: { gravity: -400, flapPower: -40 }, thema: "day", emoji: "🐳" }, { physik: "sturm", delta: { pipeSpeed: 30, pipeGap: -15 }, thema: "night", emoji: "⚡" }, { physik: "schnell", delta: { pipeSpeed: 40 }, thema: "day", emoji: "🌊" }] };
const SEAL = "s2.welt.mw2y455c.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER", HASH = "3tcKq21IwdMq89hVw0ASV5MnYO6RX-JkYugqLugtlsA";
const METER = { free: 7, remaining: 6, period: "week" };
const OK = (rc) => [200, { kind: "welt", options: [OPT], seals: [SEAL], hashes: [HASH], cost: 1, receipt: rc || "rc-welt-1", meter: METER }];
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

async function phone(api) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], viewport: { width: 412, height: 915 }, locale: "de-DE" }), p = await ctx.newPage(), errs = [], sent = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await ctx.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (api && u.startsWith(API)) { const path0 = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: path0, body }); const a = api(path0, body); if (a) return r.fulfill({ status: a[0], contentType: "application/json", body: JSON.stringify(a[1]) }); }
    return r.abort();
  });
  await p.goto(page);
  return { p, errs, sent };
}
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, "wb2-flug-" + name + ".png") }); };
const settled = async (sent, n) => { for (let i = 0; i < 100 && sent.filter((x) => x.path.startsWith("ai/")).length < n; i++) await new Promise((ok) => setTimeout(ok, 50)); return sent.filter((x) => x.path.startsWith("ai/")).map((x) => x.path + ":" + x.body.receipt); };
// A bot in the page: flap below the middle of the next gap until the run reaches `score` or ends.
const fly = (p, score) => p.evaluate((n) => { const G = window.DuellDebug; for (let i = 0; i < 40000; i++) { const s = G.snap(); if (s.state === "over" || s.score >= n) return s; if (s.next && s.y > s.next.top + s.next.gap * 0.6 && s.vy > 0) G.flap(); else if (s.state === "ready") G.flap(); G.tick(1 / 60); } return G.snap(); }, score);
const contrast = (p, sel) => p.evaluate((q) => { const L = (c) => { const v = c.match(/\d+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const s = getComputedStyle(document.querySelector(q)), a = L(s.color), z = L(s.backgroundColor); return (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05); }, sel);

test("3 Klicks: Flugspiel -> Vorschlag antippen -> Fliegen; Antwort 1:1 mit KI-Zeichen vor dem Uebernehmen; Strecke im Spiel; Freund fliegt ueber den Link exakt dasselbe", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? OK() : path0 === "ai/accept" ? [200, { final: true, meter: METER }] : null));
  const colors = await p.evaluate(() => window.DailyApp.me().colors);
  // click 1: the flight game from the start screen opens on its one way in
  await p.getByRole("button", { name: /^🕹/ }).first().dispatchEvent("click");
  await p.getByRole("tab", { name: "✨ Wunsch" }).and(p.locator("[aria-selected=true]")).waitFor();
  await p.getByLabel("Was willst du fliegen?").waitFor();
  await shot(p, "1-einstieg");
  // click 2: a suggestion builds at once
  await p.getByRole("button", { name: "Unter Wasser mit Fischen" }).tap();
  const pv = p.locator(".weltpv");
  await pv.waitFor();
  assert.equal(await pv.locator(".kitag").textContent(), "KI"); assert.equal(await pv.locator(".kitag").getAttribute("aria-label"), "Mit KI erstellt");
  assert.equal(await pv.locator(".welt-route").textContent(), "🐳 schwebend → ⚡ Sturm → 🌊 schnell");
  assert.match(await pv.textContent(), /🐳 Hai-Abenteuer/);
  assert.ok(await contrast(p, ".weltpv .kitag") >= 4.5, "KI-Zeichen AA");
  assert.equal(sent[0].body.kind, "welt"); assert.deepEqual(sent[0].body.input, { satz: "Unter Wasser mit Fischen" }, "nur der Satz geht raus");
  assert.equal((await p.evaluate(() => window.DailyDebug.doc())).ki, undefined, "vor dem Uebernehmen ist nichts uebernommen");
  assert.deepEqual(await settled(sent, 0), [], "noch nicht abgebucht");
  await shot(p, "2-vorschau");
  // click 3: fly. Taken 1:1, booked once, the game carries the AI mark
  await p.getByRole("button", { name: "▶ Fliegen" }).tap();
  await p.locator("#game:not([hidden])").waitFor();
  assert.deepEqual(await settled(sent, 1), ["ai/accept:rc-welt-1"]);
  const doc = await p.evaluate(() => window.DailyApp.ed().doc);
  assert.deepEqual(doc.g.params, { gravity: 1800, jump: 430, gap: 140, speed: 130 }); assert.equal(doc.g.theme, "day"); assert.equal(doc.g.emoji, "🐳"); assert.equal(doc.g.title, "Hai-Abenteuer");
  assert.equal(doc.g.look, undefined); assert.deepEqual(doc.col, colors, "nichts gewuerfelt, keine Farbe erzwungen");
  assert.deepEqual(doc.ki, { k: "welt", s: SEAL, h: HASH });
  assert.equal(await p.locator("#gki").textContent(), "KI"); assert.equal(await p.locator("#gki").isVisible(), true);
  assert.equal(await p.locator("#title").textContent(), "Hai-Abenteuer");
  await shot(p, "3-spiel");
  // the route in the game: section 2 from the 5th point on, with its own physics and world
  const s = await fly(p, 6);
  assert.ok(s.score >= 6, "Bot kommt in Abschnitt 2, hat " + s.score);
  assert.equal(s.section, 1); assert.deepEqual(s.params, { gravity: 1800, jump: 430, gap: 125, speed: 160 });
  await p.evaluate(() => window.DuellDebug.tick(0.2));
  await shot(p, "4-abschnitt2");
  // the challenge link: a friend gets exactly the same world, route, seed and AI mark
  const mine = await p.evaluate(() => window.DuellDebug.snap().cfg), url = await p.evaluate(() => window.Daily.challengeUrl(window.Game.current(), 9));
  assert.deepEqual(mine.route.map((x) => x.e), ["🐳", "⚡", "🌊"]);
  const f = await phone(null);
  await f.p.evaluate((h) => { location.hash = h; }, url.slice(url.indexOf("#")));
  await f.p.locator("#game:not([hidden])").waitFor();
  const theirs = await f.p.evaluate(() => window.DuellDebug.snap());
  assert.deepEqual(theirs.cfg, mine, "dieselbe Welt und Strecke"); assert.equal(theirs.rival.score, 9);
  assert.equal(await f.p.locator("#gki").isVisible(), true, "der Freund sieht das KI-Zeichen");
  assert.equal((await fly(f.p, 6)).section, 1, "auch beim Freund Abschnitt 2");
  await shot(f.p, "5-freund");
  // the same run on both devices: same pipes for the same flaps
  const tops = (q) => q.evaluate(() => { const C = window.DuellCore, E = window.DuellEngine, st = window.Game.current(), sim = E.createSim(st.params, C.mulberry32(st.seed), C.routeParams(st)), out = []; sim.flap(); for (let i = 0; i < 9000 && out.length < 12; i++) { const n = sim.pipes.find((x) => x.x + 52 >= 71); if (n) { sim.bird.y = n.top + n.gap / 2; sim.bird.vy = 0; } sim.step(); sim.pipes.forEach((x) => { if (!x.k) { x.k = 1; out.push([Math.round(x.top), x.gap]); } }); } return out; });
  assert.deepEqual(await tops(f.p), await tops(p));
  assert.deepEqual(errs, []); assert.deepEqual(f.errs, []);
  await f.p.context().close(); await p.context().close();
});

test("Verwerfen gibt zurueck (/ai/discard), das Blatt bleibt; Tab-Wechsel mit offener Vorschau ebenso", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? OK("rc-d-" + ++n) : path0.startsWith("ai/") ? [200, { refunded: 1, meter: METER }] : null));
  await p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "game"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  const before = JSON.stringify(await p.evaluate(() => window.DailyDebug.doc()));
  await p.getByLabel("Was willst du fliegen?").fill("Haie im Sturm"); await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.locator(".weltpv").waitFor();
  assert.deepEqual((await p.evaluate(() => window.DuellDebug.snap())).cfg.route.length, 3, "die Vorschau laeuft im Editor");
  await p.getByRole("button", { name: "✕ Verwerfen" }).tap();
  await p.getByText("Verworfen. Nichts verbraucht.").waitFor();
  assert.deepEqual(await settled(sent, 1), ["ai/discard:rc-d-1"]);
  assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before);
  assert.equal((await p.evaluate(() => window.DuellDebug.snap())).cfg.route, undefined, "die Vorschau ist weg");
  await p.getByRole("button", { name: "✨ Bauen" }).tap(); await p.locator(".weltpv").waitFor();
  await p.getByRole("tab", { name: "Regeln" }).tap();
  assert.deepEqual(await settled(sent, 2), ["ai/discard:rc-d-1", "ai/discard:rc-d-2"]);
  assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before);
  assert.equal((await p.evaluate(() => window.DuellDebug.snap())).cfg.route, undefined);
  assert.deepEqual(errs, []); await p.context().close();
});

test("422 crisis: eigene Hilfe-Zeile mit 116 111, nichts gebaut, kein Ersatz; kind_ok: freundlich, kostenlos", async () => {
  let why = "crisis";
  const { p, errs } = await phone((path0) => (path0 === "ai" ? [422, { error: "blocked", why, help: "SERVERTEXT", meter: METER }] : null));
  await p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "game"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  const before = JSON.stringify(await p.evaluate(() => window.DailyDebug.doc()));
  await p.getByLabel("Was willst du fliegen?").fill("ich will nicht mehr"); await p.getByRole("button", { name: "✨ Bauen" }).tap();
  const st = p.locator(".aistate");
  await st.waitFor();
  assert.match(await st.textContent(), /Nummer gegen Kummer 116 111/); assert.doesNotMatch(await st.textContent(), /SERVERTEXT/);
  await shot(p, "6-krise");
  assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before);
  why = "kind_ok";
  await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.locator(".aistate", { hasText: "Das baut die KI nicht." }).waitFor();
  assert.deepEqual(errs, []); await p.context().close();
});

test("Kontingent leer: ehrlich gesagt, der Satz wird ohne KI nach festen Regeln gelesen, die Regler bleiben", async () => {
  const { p, errs } = await phone((path0) => (path0 === "ai" ? [429, { error: "quota", meter: { free: 7, remaining: 0, period: "week" } }] : null));
  await p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "game"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
  await p.getByLabel("Was willst du fliegen?").fill("Nachts schnell und schwer"); await p.getByRole("button", { name: "✨ Bauen" }).tap();
  await p.locator(".aistate", { hasText: "aufgebraucht" }).waitFor();
  assert.match(await p.locator(".aicount", { hasText: "Geändert" }).textContent(), /^Ohne KI erkannt · /);
  const doc = await p.evaluate(() => window.DailyDebug.doc());
  assert.equal(doc.g.theme, "night"); assert.equal(doc.ki, undefined); assert.equal(doc.g.route, undefined);
  await shot(p, "7-ohne-ki");
  await p.getByRole("button", { name: "🎚 Ohne KI: Regler" }).tap();
  await p.getByRole("tab", { name: "Regeln" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.equal(await p.locator("#panel input[type=range]").count(), 4);
  assert.deepEqual(errs, []); await p.context().close();
});

const openGame = (p) => p.evaluate(() => { const D = window.Daily, i = D.IDEAS.find((x) => x.kind === "game"); window.DailyApp.openEditor(D.docFromIdea(i, window.DailyApp.me(), "de"), { idea: i }); });
const build = async (p) => { await p.getByLabel("Was willst du fliegen?").fill("Haie im Sturm"); await p.getByRole("button", { name: "✨ Bauen" }).tap(); await p.locator(".weltpv").waitFor(); };

test("Befund 1: 'Ohne KI: Regler' bei offener Vorschau gibt die Aktion sofort zurueck (/ai/discard)", async () => {
  let n = 0;
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? OK("rc-r-" + ++n) : path0.startsWith("ai/") ? [200, { refunded: 1, meter: METER }] : null));
  await openGame(p);
  const before = JSON.stringify(await p.evaluate(() => window.DailyDebug.doc()));
  await build(p);
  await p.getByRole("button", { name: "🎚 Ohne KI: Regler" }).tap();
  await p.getByRole("tab", { name: "Regeln" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.deepEqual(await settled(sent, 1), ["ai/discard:rc-r-1"], "sofort zurueck, nicht erst beim Gang nach Hause");
  assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before);
  assert.equal((await p.evaluate(() => window.DuellDebug.snap())).cfg.route, undefined, "die Vorschau ist weg");
  assert.deepEqual(errs, []); await p.context().close();
});

test("Befund 3: SPIELEN bei offener Vorschau fliegt die Vorschau (wie '▶ Fliegen'), nicht die alte Welt", async () => {
  const { p, errs, sent } = await phone((path0) => (path0 === "ai" ? OK("rc-s-1") : path0 === "ai/accept" ? [200, { final: true, meter: METER }] : null));
  await openGame(p);
  await build(p);
  await p.locator("#edmain").tap();
  await p.locator("#game:not([hidden])").waitFor();
  assert.deepEqual(await settled(sent, 1), ["ai/accept:rc-s-1"]);
  const s = await p.evaluate(() => window.DuellDebug.snap());
  assert.equal(s.cfg.route.length, 3, "die Strecke der Vorschau"); assert.equal(s.cfg.title, "Hai-Abenteuer");
  assert.deepEqual((await p.evaluate(() => window.DailyApp.ed().doc)).ki, { k: "welt", s: SEAL, h: HASH });
  assert.equal(await p.locator("#gki").isVisible(), true);
  assert.deepEqual(errs, []); await p.context().close();
});

test("Befund 2: eigene Aenderungen (Regler, Figur, Welt, Name) nehmen das KI-Zeichen und das Siegel weg", async () => {
  let n = 0;
  const { p, errs } = await phone((path0) => (path0 === "ai" ? OK("rc-h-" + ++n) : path0.startsWith("ai/") ? [200, { final: true, meter: METER }] : null));
  await openGame(p);
  const doc = () => p.evaluate(() => window.DailyDebug.doc());
  const keep = async () => { await p.getByRole("tab", { name: "✨ Wunsch" }).tap(); await build(p); await p.getByRole("button", { name: "✓ Übernehmen" }).tap(); assert.deepEqual((await doc()).ki, { k: "welt", s: SEAL, h: HASH }); };
  await keep();
  await p.getByRole("tab", { name: "Regeln" }).tap();
  // the lowest step: 0 on the named slider (part regler), 900 on the core's number slider; both mean gravity 900
  await p.locator("#panel input[type=range]").first().evaluate((r) => { r.value = r.max === "4" ? "0" : "900"; r.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.equal((await doc()).g.params.gravity, 900); assert.equal((await doc()).ki, undefined, "Regler");
  assert.ok((await doc()).g.route, "die Strecke bleibt, nur das Zeichen geht");
  await keep();
  await p.getByRole("tab", { name: "Figur" }).tap(); await p.locator("#panel .chip.em").nth(2).tap();
  assert.equal((await doc()).ki, undefined, "Figur");
  await keep();
  await p.getByRole("tab", { name: "Welt" }).tap(); await p.getByRole("button", { name: "Lava" }).tap();
  const d = await doc(); assert.equal(d.ki, undefined, "Welt"); assert.equal(d.g.route, undefined);
  await keep();
  await p.getByRole("tab", { name: "Text" }).tap(); await p.getByLabel("Titel auf der Karte").fill("Mein Flug");
  assert.equal((await doc()).ki, undefined, "Name");
  await p.locator("#edmain").tap(); await p.locator("#game:not([hidden])").waitFor();
  assert.equal(await p.locator("#gki").isVisible(), false, "das Spiel zeigt kein KI mehr");
  const url = await p.evaluate(() => window.Daily.challengeUrl(window.Game.current(), 3));
  const f = await phone(null);
  await f.p.evaluate((h) => { location.hash = h; }, url.slice(url.indexOf("#")));
  await f.p.locator("#game:not([hidden])").waitFor();
  assert.equal((await f.p.evaluate(() => window.Game.current())).ki, undefined, "der Link traegt kein Siegel");
  assert.deepEqual(errs, []); assert.deepEqual(f.errs, []); await f.p.context().close(); await p.context().close();
});

test("Befund 6: Krise ohne Netz: Hilfe auf dem Geraet (116 111 und 0800 111 0 111), nichts geht raus, keine Welt gebaut", async () => {
  for (const api of [null, () => [500, {}]]) {
    const { p, errs, sent } = await phone(api);
    await openGame(p);
    const before = JSON.stringify(await p.evaluate(() => window.DailyDebug.doc()));
    await p.getByLabel("Was willst du fliegen?").fill("ich will nicht mehr leben"); await p.getByRole("button", { name: "✨ Bauen" }).tap();
    const h = p.locator(".aistate", { hasText: "116 111" });
    await h.waitFor();
    assert.match(await h.textContent(), /0800 111 0 111, rund um die Uhr/);
    assert.equal(sent.length, 0, "nichts geht raus");
    assert.equal(JSON.stringify(await p.evaluate(() => window.DailyDebug.doc())), before, "kein Titel 'Ich will nicht mehr leben'");
    assert.equal(await p.locator(".aicount", { hasText: "Ohne KI erkannt" }).count(), 0);
    assert.deepEqual(errs, []); await p.context().close();
  }
});

test("Befund 9: laedt der Teil welt nicht, sagt der Wunsch-Tab das und bietet die Regler an", async () => {
  const { p, errs } = await phone(null);
  await p.evaluate(() => { window.Parts.use = () => Promise.reject(new Error("sri")); });
  await openGame(p);
  await p.getByText("Das Flugspiel lädt gerade nicht.", { exact: false }).waitFor();
  await p.getByRole("button", { name: "🎚 Ohne KI: Regler" }).tap();
  await p.getByRole("tab", { name: "Regeln" }).and(p.locator("[aria-selected=true]")).waitFor();
  assert.deepEqual(errs, []); await p.context().close();
});
