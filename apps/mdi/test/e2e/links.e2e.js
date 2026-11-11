// Link-Testvektoren im Browser: dieselben Faelle wie test/link.test.js (gemeinsame Fixture).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { browser, open, ROOT } from "./lib/grund.mjs";

const VEC = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/link-vectors.json"), "utf8"));
let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

test("Ablehnen mit Grund (21 Faelle), Fragment wird nach dem Lesen entfernt", async () => {
  for (const v of VEC.reject) {
    const { p, ctx, errs } = await open(b, { hash: v.hash });
    if (v.reason === "leer") { await p.locator("main.s-shelf").waitFor(); await ctx.close(); continue; }
    await p.locator("main.s-receive-reject").waitFor();
    assert.equal(await p.locator("[data-reason]").getAttribute("data-reason"), v.reason, v.name);
    assert.equal(await p.evaluate(() => location.hash), "", v.name + ": Fragment entfernt");
    assert.deepEqual(errs, [], v.name);
    await ctx.close();
  }
});
test("Annehmen: Karte, Zug-Duell, Live-Einladung", async () => {
  for (const v of VEC.accept) {
    const { p, ctx } = await open(b, { hash: v.hash });
    await p.locator(v.kind === "live" ? "main.s-receive-live" : "main.s-receive-show").waitFor();
    await ctx.close();
  }
});
