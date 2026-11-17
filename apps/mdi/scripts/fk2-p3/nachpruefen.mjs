#!/usr/bin/env node
// Freie Karte 2, P3: alle ausgelieferten Spielversionen einer Messung erneut durch den aktuellen Bot-Runner schicken
// (z. B. nach einer Haertung der Sandbox) und das Ergebnis mit dem gespeicherten Bericht vergleichen.
//   node scripts/fk2-p3/nachpruefen.mjs <karten.jsonl> <ausgabe.jsonl>
import fs from "node:fs";
import { buildSpiel } from "../spiel/build.mjs";
import { runGame, launchBrowser } from "../spiel/runner.mjs";
import { checkPolicy } from "../../bau/policy.mjs";

const [IN, OUT] = process.argv.slice(2);
const karten = fs.readFileSync(IN, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const built = await buildSpiel(), browser = await launchBrowser();
const rows = [];
try {
  for (const k of karten) for (const v of k.versionen || []) {
    const r = await runGame(browser, built, { name: k.id + "-v" + v.runde, code: v.code, seed: "p3", seconds: 60 });
    const failed = Object.entries(r.checks).filter(([, c]) => !c.ok).map(([x]) => x);
    const row = { karte: k.id, runde: v.runde, vorher_ok: v.bots.ok, jetzt_ok: r.ok && checkPolicy(v.code).length === 0, failed, error: r.error || null, nutzt_date: /\bDate\b/.test(v.code) };
    rows.push(row);
    if (row.vorher_ok !== row.jetzt_ok) console.log("ANDERS " + row.karte + " v" + row.runde + " " + JSON.stringify(failed) + " " + (r.error ? r.error.code + " " + r.error.message.slice(0, 120) : ""));
  }
} finally { await browser.close(); }
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(rows.length + " Versionen, unveraendert " + rows.filter((r) => r.vorher_ok === r.jetzt_ok).length + ", jetzt durchgefallen " + rows.filter((r) => r.vorher_ok && !r.jetzt_ok).length + ", Date im Code " + rows.filter((r) => r.nutzt_date).length);
