"use strict";
// Mal & Rat (zug-malrat): device A draws a word with mouse or touch gestures and shares the link; device B opens it, watches
// the picture being drawn line by line, guesses wrong, then right, and draws one back, which A opens. Two runs that swap
// languages, screens and input: de 390x844 touch / en 512x384 (1024x768 at 200 %) mouse, the second guess by keyboard only
// and with reduced motion. axe on sheet, editor and the canvas layer when axe-core is there (AXE_CORE, see d1-axe.e2e.js).
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const G = require("./lib/grund.js");
const Tn = require("../../src/turns.js"), Q = require("../../src/quest.js"), C = require("../../src/core.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");
ensureBuilt("");
const shot = process.env.MR_SHOTS;
const snap = (p, n) => (shot ? p.screenshot({ path: path.join(shot, "malrat-" + n + ".png") }) : null);
let AXE = null;
try { AXE = fs.readFileSync(process.env.AXE_CORE || require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) {}
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
async function axe(p, sel, where, bad) {
  if (!AXE) return;
  if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
  const v = await p.evaluate(([s, o]) => window.axe.run(document.querySelector(s), o).then((r) => r.violations.map((x) => x.id + " (" + x.nodes.length + "): " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), [sel, RULES]);
  v.forEach((x) => bad.push(where + ": " + x));
}
const hash = (u) => "#" + u.split("#")[1];
const X = { de: require("../../src/malrat.json").text.de, en: require("../../src/malrat.json").text.en };
// What the link carries, read as anyone could: base64url JSON, the moves with the seal opened by the seed next to it.
function payload(u) { const raw = JSON.parse(Buffer.from(u.split("#c=")[1], "base64url").toString("utf8")); return JSON.stringify(raw) + JSON.stringify(Tn.unseal(raw.d.q, raw.d.seed)); }

// One line on the canvas, as a finger (touch events through the browser's input layer) or as a mouse.
async function stroke(p, pts, touch) {
  const b = await p.locator(".mrcv").boundingBox(), at = (q) => ({ x: b.x + q[0] * b.width, y: b.y + q[1] * b.height });
  if (touch) {
    const s = await p.context().newCDPSession(p);
    await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at(pts[0])] });
    for (const q of pts.slice(1)) await s.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at(q)] });
    await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await s.detach();
    return;
  }
  await p.mouse.move(at(pts[0]).x, at(pts[0]).y); await p.mouse.down();
  for (const q of pts.slice(1)) await p.mouse.move(at(q).x, at(q).y, { steps: 3 });
  await p.mouse.up();
}
const ring = (cx, cy, r) => Array.from({ length: 33 }, (x, i) => [cx + r * Math.cos(i / 32 * 6.283), cy + r * Math.sin(i / 32 * 6.283)]);
const lines = (p) => p.evaluate(() => window.DailyApp.ed().malrat.lines.length);

// A draws: picks a word, three lines in two colours, one more taken back again, done, sent. Returns link and word.
async function drawAndSend(p, o, bad) {
  const L = X[o.lang];
  await p.locator(".mrwords .chip").nth(o.pick).click();
  let word = o.own;
  if (o.own) { await p.locator("#panel input.field").fill(o.own); } else word = await p.locator(".mrwords .chip.on").evaluate((b) => b.lastChild.textContent);
  assert.equal(await p.locator("#edmain").getAttribute("aria-disabled"), "true", "ohne Bild geht nichts raus");
  await p.getByRole("button", { name: L.mr_open }).click();
  await p.locator(".mrov[role=dialog]").waitFor();
  assert.equal(await p.locator("#mrh").textContent(), L.mr_draw_h.replace("{w}", word));
  await stroke(p, ring(0.5, 0.5, 0.3), o.touch);
  await p.getByRole("button", { name: L.mr_c_4 }).click(); await p.getByRole("button", { name: L.mr_s_2 }).click();
  await stroke(p, [[0.3, 0.8], [0.5, 0.65], [0.7, 0.8]], o.touch);
  await stroke(p, [[0.45, 0.42], [0.46, 0.43]], o.touch);
  await stroke(p, [[0.1, 0.1], [0.9, 0.12]], o.touch);
  assert.equal(await lines(p), 4);
  await p.getByRole("button", { name: L.mr_undo }).click();
  assert.equal(await lines(p), 3, "Rueckgaengig nimmt genau den letzten Strich");
  // the keyboard stays in the layer: from the body (where drawing leaves the focus) and round past its last and first control
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  const stops = await p.evaluate(() => Array.from(document.querySelectorAll(".mrov button, .mrov input")).filter((n) => !n.disabled && n.getClientRects().length).length);
  for (const k of ["Tab", "Shift+Tab", "Shift+Tab"].concat(Array(stops + 2).fill("Tab"))) {
    await p.keyboard.press(k);
    assert.ok(await p.evaluate(() => { const a = document.activeElement; return !!a && a !== document.body && !!a.closest(".mrov"); }), k + ": Fokus bleibt im Malen-Dialog");
  }
  assert.match(await p.locator(".mrroom").textContent(), o.lang === "de" ? /^Platz im Link: \d+ % belegt$/ : /^Room in the link: \d+ % used$/);
  assert.deepEqual(await G.smallTargets(p, ".mrov"), [], "Ziele >= 44 px");
  if (o.shot) await snap(p, o.shot + "-malen");
  await axe(p, ".mrov", o.shot + " Malen", bad);
  await p.getByRole("button", { name: L.mr_done }).click();
  await p.locator(".mrov").waitFor({ state: "detached" });
  await p.locator("#panel").getByText(L.mr_drawn.replace("{s}", o.lang === "de" ? "3 Striche" : "3 lines").replace("{w}", word)).waitFor();
  await p.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
  await axe(p, "#editor", o.shot + " Editor", bad);
  assert.equal((await p.locator("#edmain").textContent()).trim(), L.mr_send);
  await p.locator("#edmain").click(); await p.locator("#share").waitFor();
  const url = await p.evaluate(() => window.DailyApp && window.DailyDebug.result().url);
  return { url, word };
}

// B guesses: watches, a hint, one wrong guess, the right one; keyboard only when o.keys.
async function guess(p, o, word, bad) {
  const L = X[o.lang];
  assert.equal((await p.locator("#go").textContent()).trim(), L.mr_go);
  await axe(p, "#home", o.shot + " Blatt", bad);
  await p.locator("#go").click();
  await p.locator("#panel").getByText(L.mr_guess_h + " " + L.mr_len.replace("{n}", Array.from(word).length)).waitFor();
  await p.getByRole("button", { name: L.mr_los }).click();
  const cv = p.locator(".mrov canvas.mrcv");
  if (!o.keys) {
    // line by line: the description comes only once the picture is whole
    assert.equal(await cv.getAttribute("aria-label"), L.mr_playing);
    await p.waitForTimeout(250); if (o.shot) await snap(p, o.shot + "-wiedergabe");
  } else assert.match(await cv.getAttribute("aria-label"), o.lang === "de" ? /^Zeichnung: 3 Striche in / : /^Drawing: 3 lines in /, "reduzierte Bewegung: sofort ganz");
  await G.poll(() => cv.getAttribute("aria-label"), (v) => v !== L.mr_playing, { what: "Wiedergabe" });
  assert.match(await cv.getAttribute("aria-label"), o.lang === "de" ? /^Zeichnung: 3 Striche in Schwarz und Grün$/ : /^Drawing: 3 lines in Black and Green$/);
  const input = p.getByRole("textbox", { name: L.mr_tip_ph });
  assert.ok(await input.evaluate((e) => e === document.activeElement), "der Fokus steht im Rate-Feld");
  if (o.keys) { await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.keyboard.press("Enter"); }
  else await p.getByRole("button", { name: L.mr_more }).click();
  await p.locator(".mrhints li").first().waitFor();
  assert.match(await p.locator(".mrhints li").first().textContent(), o.ownWord ? /^(Farben|Colours): / : /^(Tipp|Hint): /);
  if (o.keys) { await input.focus(); await p.keyboard.type(o.wrong); await p.keyboard.press("Enter"); }
  else { await input.fill(o.wrong); await p.getByRole("button", { name: L.mr_try, exact: true }).click(); }
  await p.locator(".mrov .mrok").getByText(L.mr_wrong.replace("{w}", o.wrong)).waitFor();
  if (o.keys) { await input.fill(""); await p.keyboard.type(word.toLowerCase()); await p.keyboard.press("Enter"); }
  else { await input.fill(word.toUpperCase()); await p.getByRole("button", { name: L.mr_try, exact: true }).click(); }
  await p.locator(".mrov .mrok", { hasText: o.lang === "de" ? "Richtig!" : "Right!" }).waitFor();
  const ok = await p.locator(".mrov .mrok").textContent();
  assert.match(ok, o.lang === "de" ? /^Richtig! .+ – in \d+ Sekunden? erraten\.$/ : /^Right! .+ – guessed in \d+ seconds?\.$/);
  assert.deepEqual(await G.smallTargets(p, ".mrov"), [], "Ziele >= 44 px");
  if (o.shot) await snap(p, o.shot + "-raten");
  await axe(p, ".mrov", o.shot + " Raten", bad);
  if (o.keys) await p.keyboard.press("Enter");   // the focus is on "draw back"
  else await p.getByRole("button", { name: L.mr_back }).click();
  await p.locator(".mrov").waitFor({ state: "detached" });
  return Number(ok.match(/(\d+) (Sekunde|second)/)[1]);
}

for (const run of [
  { a: { lang: "de", view: "phone390", touch: true, pick: 1 }, b: { lang: "en", view: "zoom200", wrong: "Banana" } },
  { a: { lang: "en", view: "zoom200", touch: false, pick: 3, own: "Wackelpudding" }, b: { lang: "de", view: "phone390", wrong: "Pudding", keys: true, ownWord: true } }
]) {
  test("Mal & Rat " + run.a.lang + " " + run.a.view + (run.a.touch ? " Touch" : " Maus") + " -> " + run.b.lang + " " + run.b.view + (run.b.keys ? " nur Tastatur" : "") + ": malen, teilen, Wiedergabe, falsch und richtig raten, zurueckmalen", async () => {
    const br = await G.launch(), bad = [];
    try {
      const [ana, ben] = await G.people(br, 2, { lang: [run.a.lang, run.b.lang], view: [run.a.view, run.b.view], web: true });
      const tag = run.a.lang + "-" + run.a.view;
      const a = await G.open(ana, "#i=zug-malrat");
      await axe(a, "#home", tag + " Blatt A", bad);
      await a.locator("#go").click();
      await a.locator(".mrwords .chip").first().waitFor();
      assert.equal(await a.locator(".mrwords .chip").count(), 4, "drei Vorschlaege und ein eigenes Wort");
      const sent = await drawAndSend(a, Object.assign({ shot: "a-" + tag }, run.a), bad);
      const frag = sent.url.split("#c=")[1];
      assert.ok(frag.length <= C.MAX_FRAGMENT, "Link " + frag.length);
      const seen = payload(sent.url).toLowerCase();
      assert.ok(!seen.includes(sent.word.toLowerCase()) && !seen.includes(Q.fold(sent.word)), "das Wort steht nicht im Link");

      const b = await G.open(ben, hash(sent.url));
      if (run.b.keys) await b.emulateMedia({ reducedMotion: "reduce" });
      const secs = await guess(b, Object.assign({ shot: "b-" + run.b.lang + "-" + run.b.view }, run.b), sent.word, bad);
      // B draws back: a word on offer this time, one line is enough
      const L = X[run.b.lang];
      await b.locator("#panel").getByText(L.mr_word).waitFor();
      await b.getByRole("button", { name: L.mr_open }).click();
      await stroke(b, ring(0.5, 0.5, 0.2), !run.b.keys && run.b.view === "phone390");
      if (run.b.keys) { await b.keyboard.press("Escape"); await b.locator(".mrov").waitFor({ state: "detached" }); assert.equal(await lines(b), 1, "Escape schliesst, der Strich bleibt"); }
      else await b.getByRole("button", { name: L.mr_done }).click();
      await b.waitForFunction(() => document.getElementById("edmain").getAttribute("aria-disabled") === "false");
      await b.locator("#edmain").click(); await b.locator("#share").waitFor();
      const back = await b.evaluate(() => window.DailyDebug.result().url);
      assert.ok(back.split("#c=")[1].length <= C.MAX_FRAGMENT);

      // A opens the answer: how fast the picture was guessed, and a new picture to guess
      const a2 = await G.open(ana, hash(back));
      const face = await a2.evaluate((l) => window.Turns.face(window.DailyDebug.home().doc, l), run.a.lang);
      assert.equal(face[2], C.form(X[run.a.lang], "mr_face_back", secs, run.a.lang).replace("{n}", secs));
      assert.equal((await a2.locator("#go").textContent()).trim(), X[run.a.lang].mr_go);
      for (const p of [a, b, a2]) assert.deepEqual(p.errs, []);
      assert.deepEqual(bad, [], "axe");
    } finally { await br.close(); }
  });
}
