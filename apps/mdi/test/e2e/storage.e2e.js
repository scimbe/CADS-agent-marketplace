// Geraetespeicher im Browser (Befund Z1): pub (Snapshot-Karten) und memo (Merkzettel) ueberstehen das Neuladen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { browser } from "./lib/grund.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let b, server, base;
test.before(async () => {
  b = await browser();
  const r = await esbuild.build({ entryPoints: [path.join(ROOT, "test/e2e/lib/storage-page.js")], bundle: true, format: "iife", write: false, logLevel: "error" });
  const html = "<!doctype html><html><head><meta charset=utf-8><title>s</title></head><body><script>" + r.outputFiles[0].text + "</script></body></html>";
  // http (gleicher Ursprung je Neuladen; file:// trennt localStorage je nach Browser)
  server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  base = "http://127.0.0.1:" + server.address().port + "/";
});
test.after(async () => { await b.close(); server.close(); });

test("pub und memo einer Partie ueberstehen das Neuladen; zu Grosses wird weggelassen", async () => {
  const ctx = await b.newContext(), p = await ctx.newPage();
  await p.goto(base);
  const g = "0123456789abcdef";
  await p.evaluate((g) => window.__storage.save({ g, seat: 1, salt: null, n: 2, lh: "a", bh: "b", k: [null, null], pub: { list: [[["Ada", 0]], [["Milch", 0, 1, []]]] }, memo: { own: true } }), g);
  await p.reload();
  const v = await p.evaluate((g) => window.__storage.load(g), g);
  assert.deepEqual(v.pub, { list: [[["Ada", 0]], [["Milch", 0, 1, []]]] });
  assert.deepEqual(v.memo, { own: true });
  await p.evaluate((g) => window.__storage.save({ g, seat: 1, salt: null, n: 3, lh: "a", bh: "b", k: [null, null], pub: { big: "x".repeat(20000) }, memo: { own: false } }), g);
  await p.reload();
  const w = await p.evaluate((g) => window.__storage.load(g), g);
  assert.equal(w.pub, undefined, "zu gross: weggelassen, nicht gekuerzt");
  assert.deepEqual(w.memo, { own: false });
  await ctx.close();
});
