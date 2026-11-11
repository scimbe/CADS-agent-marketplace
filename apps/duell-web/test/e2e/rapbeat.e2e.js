"use strict";
// Straßenrap-Beat (strassenrap-beat) at 390 x 844: open the card, play the hook (a real AudioBufferSourceNode starts),
// change the style (the link changes with it, the tempo jumps into the new range), save as WAV: a download of a valid
// 16-bit stereo WAV as long as the song; the link opened on another phone shows the same settings. Then axe on the step.
// RAPBEAT_SHOTS=<dir> keeps screenshots.
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const G = require("./lib/grund.js");
const D = require("../../src/daily.js"), Tn = require("../../src/turns.js"), RB = require("../../src/rapbeat.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");
ensureBuilt("");
const shot = process.env.RAPBEAT_SHOTS;
const snap = (p, n) => (shot ? p.screenshot({ path: path.join(shot, "rapbeat-" + n + ".png"), fullPage: false }) : null);
const X = require("../../src/rapbeat.json").text;
let AXE = null;
try { AXE = fs.readFileSync(process.env.AXE_CORE || require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) {}
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const moveOf = (u) => { const d = D.parseRoute("#" + u.split("#")[1]).doc; return RB.last(Tn.moves(d)); };
// every source the page starts, so the test can see that sound really plays
const SPY = () => {
  window.__rb = { started: 0, loop: null, ch: 0, len: 0 };
  const s = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function () { if (this.buffer && this.buffer.numberOfChannels === 2) { window.__rb.started++; window.__rb.loop = this.loop; window.__rb.ch = this.buffer.numberOfChannels; window.__rb.len = this.buffer.duration; } return s.apply(this, arguments); };
};

test("Straßenrap-Beat: Karte oeffnen, abspielen, Stil wechseln, als WAV speichern (390 x 844)", async () => {
  const br = await G.launch();
  try {
    const [ana, ben] = await G.people(br, 2, { lang: "de", view: "phone390", web: true });
    await ana.addInitScript(SPY);
    const p = await G.open(ana, "#i=strassenrap-beat");
    await p.locator("#go").click();
    const panel = p.locator("#panel");
    await panel.locator("[data-rb=play]").waitFor();
    await snap(p, "1-start");
    // the default: boom bap, 90 BPM, a minor; the link already holds it
    assert.equal(await panel.locator("[data-rb=styles] .chip.on").getAttribute("data-i"), "0");
    assert.equal(await panel.locator("[data-rb=bpm]").inputValue(), "90");
    // play: a stereo buffer starts, looping, 8 bars of the hook at 90 BPM
    await panel.locator("[data-rb=play]").click();
    await G.poll(() => p.evaluate(() => window.__rb.started), (n) => n >= 1, { what: "Beat spielt", timeout: 60000 });
    const s1 = await p.evaluate(() => window.__rb);
    assert.equal(s1.loop, true); assert.equal(s1.ch, 2); assert.ok(Math.abs(s1.len - 8 * 4 * 60 / 90) < 0.01, "8 Takte: " + s1.len);
    assert.equal((await panel.locator("[data-rb=play]").textContent()).trim(), "■ " + X.de.rb_stop);
    await snap(p, "2-spielt");
    // style: trap; the tempo jumps into 130-150, the playing loop is rebuilt
    await panel.locator("[data-rb=styles] .chip[data-i='1']").click();
    assert.equal(await panel.locator("[data-rb=bpm]").inputValue(), "140");
    assert.deepEqual([await panel.locator("[data-rb=bpm]").getAttribute("min"), await panel.locator("[data-rb=bpm]").getAttribute("max")], ["130", "150"]);
    await G.poll(() => p.evaluate(() => window.__rb), (r) => r.started >= 2 && Math.abs(r.len - 8 * 4 * 60 / 140) < 0.01, { what: "Trap-Loop spielt", timeout: 60000 });
    await panel.locator("[data-rb=play]").click();   // stop
    assert.equal((await panel.locator("[data-rb=play]").textContent()).trim(), "▶ " + X.de.rb_play);
    // tempo and mood: what the screen shows goes into the link
    await panel.locator("[data-rb=bpm]").fill("146");
    await panel.getByRole("button", { name: X.de.rb_m_hype, exact: true }).click();
    const v = await p.evaluate(() => window.Turns.moves(window.DailyApp.ed().next)[0][0]);
    assert.deepEqual(v.slice(0, 4), [1, 146, 9, 2]);
    // save as WAV: a download, a valid WAV as long as the whole song
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), panel.locator("[data-rb=wav]").click()]);
    assert.match(dl.suggestedFilename(), /^strassenrap-trap-146bpm-a-minor-hype-\d+\.wav$/);
    const file = await dl.path(), buf = fs.readFileSync(file);
    assert.equal(buf.toString("ascii", 0, 4), "RIFF"); assert.equal(buf.toString("ascii", 8, 12), "WAVE");
    assert.deepEqual([buf.readUInt16LE(22), buf.readUInt32LE(24), buf.readUInt16LE(34)], [2, 44100, 16]);
    const secs = buf.readUInt32LE(40) / 4 / 44100, want = 64 * 4 * 60 / 146 + 2.5;
    assert.ok(Math.abs(secs - want) < 0.05, "Laenge " + secs + " statt " + want);
    // the same samples as the engine gives here (the page and Node render the same beat)
    const r = RB.render(v), ref = RB.wav(r.L, r.R, r.sr);
    assert.equal(buf.length, ref.length);
    assert.ok(Buffer.from(ref).subarray(44, 44 + 400000).equals(buf.subarray(44, 44 + 400000)), "dieselben Samples wie im Test");
    await p.locator("#panel .rbstat").getByText(/WAV fertig/).waitFor();
    if (shot) fs.copyFileSync(file, path.join(shot, dl.suggestedFilename()));
    await snap(p, "3-wav");
    // the link: on another phone the same beat (only the five numbers travel)
    const url = await p.evaluate(() => window.Daily.docUrl(window.DailyApp.ed().next));
    assert.deepEqual(moveOf(url), v);
    assert.ok(!/RIFF|data:/.test(url) && url.length < 400, url);
    const q = await G.open(ben, "#" + url.split("#")[1]);
    await q.locator("#go").click();
    await q.locator("#panel [data-rb=play]").waitFor();
    assert.equal(await q.locator("#panel [data-rb=bpm]").inputValue(), "146");
    assert.equal(await q.locator("#panel [data-rb=styles] .chip.on").getAttribute("data-i"), "1");
    // recording mode: count-in, the song once (no loop)
    await q.locator("#panel [data-rb=rec]").check();
    await ben.addInitScript(SPY); await q.evaluate(SPY);
    await q.locator("#panel [data-rb=play]").click();
    await G.poll(() => q.evaluate(() => window.__rb.started), (n) => n >= 1, { what: "Aufnahme spielt", timeout: 120000 });
    const s2 = await q.evaluate(() => window.__rb);
    assert.equal(s2.loop, false); assert.ok(Math.abs(s2.len - (65 * 4 * 60 / 146 + 2.5)) < 0.05, "Einzaehler + Song: " + s2.len);
    await q.locator("#panel [data-rb=play]").click();
    // a11y on the step
    if (AXE) {
      await p.addScriptTag({ content: AXE });
      const bad = await p.evaluate((o) => window.axe.run(document.querySelector("#panel"), o).then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), RULES);
      assert.deepEqual(bad, []);
    }
    const small = await G.smallTargets(p, "#panel .rb", 44); assert.deepEqual(small, [], "Ziele ab 44 px");
    assert.deepEqual(p.errs.concat(q.errs), []);
  } finally { await br.close(); }
});
