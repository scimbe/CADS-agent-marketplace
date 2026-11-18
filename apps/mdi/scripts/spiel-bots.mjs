#!/usr/bin/env node
// Bot-Runner als Kommando: node scripts/spiel-bots.mjs [--seconds 60] [--seed fk2] [--out dist/spiel-berichte] [datei.js ...]
// Ohne Dateien: alle Referenzspiele aus src/spiel/beispiele. Schreibt je Spiel <out>/<name>.json und eine Uebersicht.
// Exit 1, wenn ein Spiel die Abnahme nicht besteht.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpiel } from "./spiel/build.mjs";
import { runGame, launchBrowser } from "./spiel/runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), opt = { seconds: 60, seed: "fk2", out: path.join(ROOT, "dist/spiel-berichte") }, files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--seconds") opt.seconds = Number(args[++i]);
  else if (args[i] === "--seed") opt.seed = args[++i];
  else if (args[i] === "--out") opt.out = path.resolve(args[++i]);
  else files.push(path.resolve(args[i]));
}
if (!files.length) { const dir = path.join(ROOT, "src/spiel/beispiele"); for (const f of fs.readdirSync(dir).sort()) if (f.endsWith(".js")) files.push(path.join(dir, f)); }

fs.mkdirSync(opt.out, { recursive: true });
const built = await buildSpiel();
const browser = await launchBrowser();
const summary = [];
try {
  for (const f of files) {
    const name = path.basename(f, ".js");
    const r = await runGame(browser, built, { name, code: fs.readFileSync(f, "utf8"), seed: opt.seed, seconds: opt.seconds });
    fs.writeFileSync(path.join(opt.out, name + ".json"), JSON.stringify(r, null, 2) + "\n");
    const failed = Object.entries(r.checks).filter(([, c]) => !c.ok).map(([k]) => k);
    summary.push({ name, ok: r.ok, failed, error: r.error ? r.error.code : null, wallMs: r.sandbox.wallMs });
    console.log((r.ok ? "BESTANDEN " : "DURCHGEFALLEN ") + name.padEnd(14) + (failed.length ? " verletzt: " + failed.join(", ") : "") + (r.error ? " Fehler: " + r.error.code + " – " + r.error.message : ""));
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(opt.out, "uebersicht.json"), JSON.stringify({ seconds: opt.seconds, seed: opt.seed, games: summary }, null, 2) + "\n");
console.log(summary.filter((x) => x.ok).length + "/" + summary.length + " bestanden, Berichte in " + path.relative(process.cwd(), opt.out));
process.exitCode = summary.every((x) => x.ok) ? 0 : 1;
