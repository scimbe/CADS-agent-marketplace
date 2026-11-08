"use strict";
// Dart (spiel-dart): A throws three darts with the mouse and sends the link, B opens it on another device, throws, sends it
// back, and so on until 301 is over (a checkout or the tenth round); then the result picture. The hits on screen are the
// ones the link's darts give when counted again here (src/dart.js). Then the keyboard alone, against Bert, with reduced
// motion; and axe on the step and the board at 328 x 568, 390 x 844 and 200 % zoom.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const G = require("./lib/grund.js");
const Tn = require("../../src/turns.js"), C = require("../../src/core.js"), D = require("../../src/daily.js"), M = require("../../src/dart.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");
ensureBuilt("");
const shot = process.env.DART_SHOTS;
const snap = (p, n) => (shot ? p.screenshot({ path: path.join(shot, "dart-" + n + ".png") }) : null);
let AXE = null;
try { AXE = fs.readFileSync(process.env.AXE_CORE || require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) {}
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
async function axe(p, sel, where, bad) {
  if (!AXE) return;
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(([s, o]) => window.axe.run(document.querySelector(s), o).then((r) => r.violations.map((x) => x.id + " (" + x.nodes.length + "): " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), [sel, RULES]);
  v.forEach((x) => bad.push(where + ": " + x));
}
const X = { de: require("../../src/dart.json").text.de, en: require("../../src/dart.json").text.en };
const hash = (u) => "#" + u.split("#")[1];
const docOf = (u) => D.parseRoute(hash(u)).doc;
const gameOf = (u) => { const d = docOf(u); return M.gameOf(d, Tn.moves(d)); };
const state = (p) => p.locator(".daov").getAttribute("data-state");
const shown = (p) => p.locator(".dacv").evaluate((c) => Number(c.dataset.n));

// One dart with the mouse: over the field (board units, 1 = edge of the double ring), hold for about the straight power, let go.
async function mouseDart(p, x, y, o) {
  const b = await p.locator(".dacv").boundingBox(), k = b.width / 2 / 1.32, n = await shown(p);
  await p.mouse.move(b.x + b.width / 2 + x * k, b.y + b.height / 2 + y * k, { steps: 4 });
  await p.mouse.down(); await p.waitForTimeout(o && o.hold ? o.hold : 700);
  if (o && o.during) await o.during();
  await p.mouse.up();
  if (o && o.after) await o.after();
  await G.poll(() => shown(p), (v) => v > n, { what: "Pfeil steckt" });
}
// A whole turn on the open board with the mouse, aimed at T20 (or at what is left); returns what the screen said per dart.
async function mouseTurn(p, o) {
  const said = [];
  for (let i = 0; i < 3 && (await state(p)) !== "done"; i++) {
    await G.poll(() => state(p), (s) => s === "aim" || s === "done", { what: "bereit" });
    if ((await state(p)) === "done") break;
    await mouseDart(p, 0, -0.606, i === 1 && o && o.shots ? { during: () => snap(p, o.shots + "-zielen"), after: () => snap(p, o.shots + "-flug") } : null);
    said.push(await p.locator("#dasay").textContent());
  }
  await G.poll(() => state(p), (s) => s === "done", { what: "Aufnahme fertig" });
  return said;
}
// Open the link (or the card), go to the board, throw, send; returns the new link.
async function turn(ctx, where, o, bad) {
  const L = X[ctx.lang], p = await G.open(ctx, where);
  if (o.calm) await p.emulateMedia({ reducedMotion: "reduce" });
  if (!o.first) assert.equal((await p.locator("#go").textContent()).trim(), L.da_go, "ein Link: Werfen");
  await p.locator("#go").click();
  await p.getByRole("button", { name: L.da_open, exact: true }).waitFor();
  if (o.first) {
    // the starter picks the game: 301 double out by link is preset
    assert.equal(await p.getByRole("button", { name: new RegExp("^" + L.da_m_a) }).getAttribute("aria-pressed"), "true");
    assert.equal(await p.getByRole("button", { name: L.da_o_l }).getAttribute("aria-pressed"), "true");
    assert.deepEqual(await G.smallTargets(p, "#panel"), [], "Ziele >= 44 px im Schritt");
    if (o.shots) await snap(p, o.shots + "-schritt");
  }
  await p.getByRole("button", { name: L.da_open, exact: true }).click();
  await p.locator(".daov[role=dialog]").waitFor();
  if (o.shots) { await p.waitForTimeout(150); await snap(p, o.shots + "-scheibe"); }
  const said = await mouseTurn(p, o);
  said.forEach((s, i) => assert.match(s, i === said.length - 1 ? (ctx.lang === "de" ? /^Deine Aufnahme: .+ (= \d+ Punkte?|überworfen, zurück auf \d+)$|gewinnt!$/ : /^Your turn: .+ (= \d+ points?|bust, back to \d+)$|wins!$/)
    : (ctx.lang === "de" ? /^(Single|Double|Triple) \d+, \d+ Punkte?|^(Bull 25|Bullseye|Daneben), \d+ Punkte?/ : /^(Single|Double|Triple) \d+, \d+ points?|^(Bull 25|Bullseye|Missed), \d+ points?/), "Ansage " + s));
  if (o.axe) { await axe(p, ".daov", o.axe + " Scheibe", bad); assert.deepEqual(await G.smallTargets(p, ".daov"), [], "Ziele >= 44 px"); }
  await p.getByRole("button", { name: L.da_done }).click();
  await p.locator(".daov").waitFor({ state: "detached" });
  await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
  if (o.axe) await axe(p, "#editor", o.axe + " Editor", bad);
  const over = (await p.locator("#edmain").textContent()).trim();
  await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  const url = await p.evaluate(() => window.DailyDebug.result().url);
  const frag = url.split("#c=")[1]; assert.ok(frag.length <= C.MAX_FRAGMENT, "Link " + frag.length);
  // what the screen showed for this turn is what the link's darts give, counted here again
  const g = gameOf(url), t = g.turns[g.turns.length - 1], v = M.last(Tn.moves(docOf(url)));
  assert.equal(v[1], t.pts, "die Behauptung im Link ist, was der Bildschirm zeigte");
  assert.equal(said[said.length - 1], fmt(X[ctx.lang].da_turn_done, { s: M.turnLine(t, g, ctx.lang) }), "die Ansage der Aufnahme ist die nachgerechnete");
  assert.deepEqual(p.errs, []);
  return { url, p, g, over, said };
}
// The picture as the app made it (1080 x 1350 PNG), not as the screen shows it scaled down.
async function savePng(p, name) {
  if (!shot) return;
  const b64 = await p.evaluate(() => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(window.DailyDebug.result().png); }));
  fs.writeFileSync(path.join(shot, "dart-" + name + ".png"), Buffer.from(b64, "base64"));
}
function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : "")); }

test("Dart 301 per Link: A wirft per Maus und schickt, B wirft und schickt zurueck, bis zum Ende; Ergebnisbild mit Scheibe", async () => {
  const br = await G.launch(), bad = [];
  try {
    const [ana, ben] = await G.people(br, 2, { lang: ["de", "en"], view: ["phone390", "zoom200"], web: true });
    let r = await turn(ana, "#i=spiel-dart", { first: true, shots: "a-de-390", axe: "A de 390" }, bad);
    assert.equal(r.g.mode, "a"); assert.equal(r.g.turns.length, 1);
    assert.equal(r.over, X.de.da_send, "per Link: Wurf schicken");
    // B opens the link: the sheet and the step show the standing counted from the darts
    const b = await G.open(ben, hash(r.url));
    const face = await b.evaluate(() => window.Turns.face(window.DailyDebug.home().doc, "en"));
    assert.deepEqual(face, Tn.face(docOf(r.url), "en"), "dieselbe Rechnung auf beiden Seiten");
    assert.equal(face[1], M.stand(r.g, 0, "en") + " · " + M.stand(r.g, 1, "en"));
    await b.close();
    let who = [ben, ana], n = 1, last = r;
    while (!last.g.over) {
      assert.ok(n < 20, "spaetestens nach zehn Runden ist Schluss");
      const ctx = who[(n + 1) % 2];
      last = await turn(ctx, hash(last.url), { calm: n > 1, shots: n === 1 ? "b-en-zoom200" : null, axe: n === 1 ? "B en 200%" : null }, bad);
      if (n === 1) assert.equal(last.g.turns.length, 2);
      if (!last.g.over) await last.p.close();
      n++;
    }
    // the last thrower's main button made the result picture: the board with the darts, the result as headline
    const g = last.g, res = Tn.result(docOf(last.url), last.p.context().lang);
    assert.ok(g.over && (g.capped || g.turns[g.turns.length - 1].out), "301 vorbei: ausgecheckt oder zehn Runden");
    assert.equal(last.over, X[last.p.context().lang].da_send, "auch der letzte Wurf geht als Link");
    assert.ok(await last.p.locator("#doneimg").evaluate((i) => i.complete && i.naturalWidth === 1080 && i.naturalHeight === 1350));
    assert.equal(await last.p.evaluate(() => !!window.DailyDebug.result().doc.ki), false, "nicht per KI erstellt: kein KI-Hinweis");
    await savePng(last.p, "ergebnisbild");
    // the other device opens the finished game: the result, and the result picture
    const other = who[n % 2], o = await G.open(other, hash(last.url)), L = X[other.lang];
    await o.locator("#go").click();
    await o.locator("#panel").getByText(Tn.result(docOf(last.url), other.lang).h).waitFor();
    for (const line of Tn.result(docOf(last.url), other.lang).lines) await o.locator("#panel").getByText(line, { exact: true }).first().waitFor();
    await o.locator("#edmain").click(); await o.locator("#doneimg").waitFor();
    await G.poll(() => o.locator("#doneimg").evaluate((i) => i.complete && i.naturalWidth), (w) => w === 1080, { what: "Ergebnisbild" });
    await savePng(o, "ergebnisbild-" + other.lang);
    assert.ok(res.h && L.da_again);
    for (const p of [last.p, o]) assert.deepEqual(p.errs, []);
    assert.deepEqual(bad, [], "axe");
  } finally { await br.close(); }
});

test("Dart nur mit Tastatur gegen Bert (reduzierte Bewegung): Pfeiltasten, Leertaste, Zielen-auf-Liste, Kraftknopf, Escape", async () => {
  const br = await G.launch(), bad = [];
  try {
    const [ana] = await G.people(br, 1, { lang: "de", view: "phone390", web: true });
    const p = await G.open(ana, "#i=spiel-dart"), L = X.de;
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.locator("#go").focus(); await p.keyboard.press("Enter");
    const hs = p.getByRole("button", { name: new RegExp("^" + L.da_m_d) });
    await hs.focus(); await p.keyboard.press("Enter");
    await p.getByRole("button", { name: L.da_o_b }).focus(); await p.keyboard.press("Enter");
    assert.equal(await p.getByRole("button", { name: L.da_o_b }).getAttribute("aria-pressed"), "true");
    await p.getByText(L.da_bot_note, { exact: false }).waitFor();
    await p.getByRole("button", { name: L.da_open, exact: true }).focus(); await p.keyboard.press("Enter");
    await p.locator(".daov[role=dialog]").waitFor();
    // the focus is on the board; the arrow keys move the aim, the space bar starts the power and stops it
    assert.ok(await p.locator(".dacv").evaluate((c) => c === document.activeElement), "Fokus auf der Scheibe");
    assert.equal(await p.locator(".dacv").getAttribute("aria-describedby"), "dahelp");
    const darts = async (k) => G.poll(() => shown(p), (v) => v >= k, { what: k + " Pfeile" });
    for (let i = 0; i < 3; i++) await p.keyboard.press("ArrowUp");
    await p.keyboard.press("Space");
    assert.equal((await p.locator("#dapw").textContent()).trim(), L.da_power_stop);
    // Escape first drops a power under way, the layer stays
    await p.keyboard.press("Escape"); assert.equal(await p.locator(".daov").count(), 1); assert.equal((await p.locator("#dapw").textContent()).trim(), L.da_power_go);
    await p.keyboard.press("Space"); await p.waitForTimeout(900); await p.keyboard.press("Space");
    await darts(1);
    assert.match(await p.locator("#dasay").textContent(), /^((Single|Double|Triple) \d+|Bull 25|Bullseye|Daneben), \d+ Punkte?$/);
    // the list "Aim at" and the power button, as a switch would use them
    await p.locator("#daaim").focus(); await p.locator("#daaim").selectOption("t20");
    await p.locator("#dapw").focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(900); await p.keyboard.press("Enter");
    await darts(2);
    await p.locator(".dacv").focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(900); await p.keyboard.press("Enter");
    await darts(3);
    // Bert throws his three after a short look, each one said
    await G.poll(() => shown(p), (v) => v >= 6, { what: "Bert" });
    assert.match(await p.locator("#dasay").textContent(), /^Bert: /);
    // the keyboard stays in the layer
    for (const k of ["Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab"]) { await p.keyboard.press(k); assert.ok(await p.evaluate(() => !!document.activeElement.closest(".daov")), k); }
    // two more rounds: three darts each by keyboard on the board
    for (let r = 1; r < 3; r++) {
      for (let i = 0; i < 3; i++) {
        await G.poll(() => state(p), (s) => s === "aim", { what: "bereit" });
        await p.locator(".dacv").focus(); await p.keyboard.press("Space"); await p.waitForTimeout(880); await p.keyboard.press("Space");
        await darts(6 * r + i + 1);
      }
      await G.poll(() => shown(p), (v) => v >= 6 * r + 6, { what: "Bert" });
    }
    await G.poll(() => state(p), (s) => s === "done", { what: "Spiel aus" });
    assert.match(await p.locator("#dasay").textContent(), /^(Du schlägst Bert!|Bert gewinnt\. Revanche\?|Unentschieden!)$/);
    assert.ok(await p.getByRole("button", { name: L.da_done }).evaluate((b) => b === document.activeElement), "Fokus auf Fertig");
    await axe(p, ".daov", "Tastatur Bert", bad);
    await p.keyboard.press("Enter");
    await p.locator(".daov").waitFor({ state: "detached" });
    await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
    assert.equal((await p.locator("#edmain").textContent()).trim(), L.da_send_bot, "gegen Bert: Ergebnisbild");
    await p.locator("#edmain").click(); await p.locator("#share").waitFor();
    const url = await p.evaluate(() => window.DailyDebug.result().url), g = gameOf(url);
    assert.ok(g.bot && g.over && g.turns.length === 6, "ein Zug mit dem ganzen Spiel gegen Bert");
    assert.equal((url.split("#c=")[1].length <= C.MAX_FRAGMENT), true);
    await savePng(p, "ergebnisbild-bert");
    assert.deepEqual(p.errs, []);
    assert.deepEqual(bad, [], "axe");
  } finally { await br.close(); }
});

for (const view of ["phone328", "phone390", "zoom200"]) {
  test("Dart axe und 44 px bei " + view + ": Blatt, Schritt mit Spielwahl, Scheibe beim Zielen", async () => {
    const br = await G.launch(), bad = [];
    try {
      const [ana] = await G.people(br, 1, { lang: view === "zoom200" ? "en" : "de", view, web: true });
      const p = await G.open(ana, "#i=spiel-dart"), L = X[ana.lang];
      await axe(p, "#home", view + " Blatt", bad);
      await p.locator("#go").click();
      await p.getByRole("button", { name: L.da_o_b }).click();
      await p.getByRole("button", { name: L.da_open, exact: true }).waitFor();
      await axe(p, "#editor", view + " Schritt", bad);
      assert.deepEqual(await G.smallTargets(p, "#panel"), [], "Ziele >= 44 px");
      await p.getByRole("button", { name: L.da_open, exact: true }).click();
      await p.locator(".daov[role=dialog]").waitFor();
      // no horizontal scrolling, the board fully in the layer's width
      assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const b = await p.locator(".dacv").boundingBox(); assert.ok(b.x >= 0 && b.x + b.width <= (await p.evaluate(() => innerWidth)) + 1);
      await axe(p, ".daov", view + " Scheibe", bad);
      assert.deepEqual(await G.smallTargets(p, ".daov"), [], "Ziele >= 44 px");
      if (view === "phone328") await snap(p, "328-scheibe");
      assert.deepEqual(p.errs, []);
      assert.deepEqual(bad, [], "axe");
    } finally { await br.close(); }
  });
}
