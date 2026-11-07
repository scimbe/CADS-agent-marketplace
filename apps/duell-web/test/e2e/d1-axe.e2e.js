"use strict";
// Wave D1, PLAN Durchsicht §2 Nr. 7: axe-core (a test tool only, never shipped) finds no violation on the sheet, in the
// editor and on the finished screen of 10 sample cards of every kind. axe-core comes with PR #164 (devDependency); until
// then the test runs where it is found (AXE_CORE=<path to axe.min.js>) and is skipped otherwise.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const G = require("./lib/grund.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");

let AXE = null;
try { AXE = fs.readFileSync(process.env.AXE_CORE || require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) {}
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };
const KINDS = ["card", "photo", "sound", "game", "duel", "quest", "turn"];

test("axe: 0 Verstoesse auf Blatt, Editor und Fertig-Bildschirm, 10 Stichproben je Art", { skip: !AXE && "axe-core fehlt (kommt mit #164 oder AXE_CORE)" }, async () => {
  ensureBuilt(""); ensureBuilt("business");
  const b = await G.launch(), ctx = await G.person(b, { lang: "de", view: "phone390" });
  await ctx.route(/^https?:/, (r) => r.abort());
  const h = await G.open(ctx, "");
  const ids = await h.evaluate((K) => K.map((k) => [k, window.Daily.IDEAS.filter((i) => i.kind === k)]).map(([k, l]) => l.filter((x, n) => n % Math.max(1, Math.floor(l.length / 10)) === 0).slice(0, 10).map((i) => i.id)).flat(), KINDS);
  await h.close();
  const bad = [];
  async function run(p, where, sel) {
    if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
    const v = await p.evaluate(([s, o]) => window.axe.run(document.querySelector(s), o).then((r) => r.violations.map((x) => x.id + " (" + x.nodes.length + "): " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), [sel, RULES]);
    v.forEach((x) => bad.push(where + ": " + x));
  }
  // and Daily Business: its 21 templates are all of the kind turn, 10 of them
  const biz = require("../../src/flavors/business/ideas.json").ideas.filter((i, n) => n % 2 === 0).slice(0, 10).map((i) => "biz:" + i.id);
  for (const id of ids.concat(biz)) {
    const f = id.startsWith("biz:"), p = await G.open(ctx, "#i=" + id.replace("biz:", ""), f ? { flavor: "business" } : {});
    await run(p, id + " Blatt", "#home");
    // the main button opens the editor; a feel-good card goes straight to the finished screen, "Weiter ändern" opens its editor
    await p.locator("#go").click(); await p.locator("#editor:not([hidden]), #done:not([hidden])").first().waitFor();
    if (await p.locator("#done").isVisible()) { await p.waitForTimeout(250); await run(p, id + " Fertig", "#done"); await p.locator("#keep").click(); await p.locator("#editor").waitFor(); }
    await p.waitForTimeout(250); await run(p, id + " Editor", "#editor");
    await p.evaluate(() => window.DailyApp.finish(window.DailyApp.ed().doc)); await p.locator("#share").waitFor(); await p.waitForTimeout(250);
    await run(p, id + " Fertig", "#done");
    assert.deepEqual(p.errs, [], id); await p.close();
  }
  assert.ok(ids.length >= 60, "Stichproben: " + ids.length);
  assert.deepEqual(bad, []);
  await b.close();
});
