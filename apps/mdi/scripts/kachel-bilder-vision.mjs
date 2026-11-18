#!/usr/bin/env node
// Bild-Text-Pruefung der Kachelbilder (Klaerungsdialog, Massnahme 6 / M9 in 08-forschung/usability-automatisiert.md).
// Jedes Bild aus src/features/frei/kachel-bilder.js wird wie in der Kachel gerendert (44 px, Geraeteskala 2, Systemschrift
// fuer Emoji) und einem Vision-Modell gezeigt, OHNE Text. Es waehlt aus 4 Labels (das Hauptwort und 3 andere); je Bild
// --versuche Durchlaeufe mit anderen Ablenkern und anderer Reihenfolge, die Haelfte davon aus derselben Gruppe (Tiere,
// Essen, Fahrzeuge, ...), damit die Wahl nicht schon an der Art haengt. Trefferquote je Bild < --schwelle heisst: Das Bild
// traegt die Bedeutung nicht. Obergrenzen-Test: Modelle erkennen mehr als Kinder (ISO 9186 mit Kindern bleibt noetig).
//
//   node scripts/kachel-bilder-vision.mjs --out /tmp/vision [--key datei] [--modell claude-haiku-5-5] [--versuche 4]
//        [--lang de] [--channel chrome] [--cap 2] [--parallel 4] [--nur 🐻,🐿️] [--bilder-nur]   (--bilder-nur: nur PNGs, kein Modell, 0 $)
//
// Kosten aus den usage-Zaehlern jeder Antwort zu den Listenpreisen (PREIS); bricht hart ab, bevor die Grenze --cap
// ueberschritten werden koennte. Schreibt bilder/*.png, aufrufe.jsonl (je Aufruf Bild, Optionen, Antwort, Tokens, $),
// ergebnis.json und bericht.md nach --out. Gibt nie den Key aus. Kein Teil der CI (kostet Geld); die kostenlose Pruefung
// der Paarung steht in test/kachel-bilder.test.js.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { BILDER, EMOJI } from "../src/features/frei/kachel-bilder.js";

const a = process.argv.slice(2), opt = { modell: "claude-haiku-5-5", versuche: "4", lang: "de", cap: "2", parallel: "4", schwelle: "0.9" };
for (let i = 0; i < a.length; i++) { const k = a[i].replace(/^--/, ""); if (a[i + 1] === undefined || a[i + 1].startsWith("--")) opt[k] = true; else opt[k] = a[++i]; }
if (!opt.out) { console.error("--out fehlt"); process.exit(2); }
const OUT = path.resolve(opt.out), T = Number(opt.versuche), CAP = Number(opt.cap), PAR = Number(opt.parallel), SCHWELLE = Number(opt.schwelle);
/** $ je Million Tokens (Listenpreis bis 100K Eingabe) */
const PREIS = { "claude-haiku-5-5": { in: 0.10, out: 0.50 } }[opt.modell];
if (!PREIS) { console.error("kein Preis fuer " + opt.modell); process.exit(2); }
fs.mkdirSync(path.join(OUT, "bilder"), { recursive: true });

// Gruppen fuer schwere Ablenker (nur fuer die Pruefung; die App kennt keine Gruppen)
const GRUPPEN = {
  tier: "🦆 🐸 🐙 🦝 🐌 🦖 🐶 🐱 🦄 🐝 🐧 🦉 🐳 🐠 🐉 🦋 🐞 🐢 🐇 🐻 🐿️ 🦊 🐼 🐨 🦁 🐯 🐘 🦒 🐴 🐮 🐷 🐔 🐭 🦔 🐺 🐒 🐑 🦀 🦈 🐬 🦜 🐊 🦓 🦘 🐦",
  essen: "🍕 🍩 🍪 🎂 🍉 🍓 🥨 🧁 🍎 🍌 🥕 🍦",
  fahrzeug: "⛵ 🚤 🛶 🚢 🚀 🛸 🚗 🚲 🚂 🚌 🚜 🚁 ✈️ 🛷 ⛷️ 🛹",
  himmel: "👽 🪐 🌟 ☄️ 🌈 ☀️ 🌙 ❄️ ⛄ 🌊 🌸 🌻 🍀 🌳 ⛰️ 💧 🫧 ⚡ 💥",
  person: "🙂 😄 😎 🤖 🧙 🧚 🦸 👵 👴 👪 👧 👦 👶",
  ding: "🏠 🎈 🎉 🎁 🎮 🎲 🧩 🏆 ⚽ 🏀 🎯 🎨 🎵 🎸 🥁 📚 ✏️ 🗺️ 🏰 🏝️ 🧭 🎃 💡 ⏱️ 🗳️ ❓",
};
const gruppeVon = Object.fromEntries(Object.entries(GRUPPEN).flatMap(([g, s]) => s.split(" ").map((e) => [e, g])));
const fehlt = EMOJI.filter((e) => !gruppeVon[e]);
if (fehlt.length) { console.error("Bild ohne Gruppe: " + fehlt.join(" ")); process.exit(2); }

// fester Zufall (mulberry32), damit ein Lauf wiederholbar ist
let seed = 0x5eed;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mische = (xs) => { const r = xs.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

const liste = opt.nur ? String(opt.nur).split(",") : EMOJI;
// 1) Bilder rendern wie in der Kachel
const browser = await chromium.launch(opt.channel ? { channel: String(opt.channel) } : {});   // --channel chrome: installiertes Chrome
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 200, height: 200 } });
const png = {};
for (const e of liste) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><div id="k" style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;padding:16px;background:#fff"><span style="font-size:44px;line-height:1">${e}</span></div>`);
  const buf = await page.locator("#k").screenshot({ type: "png" });
  const name = [...e].map((c) => c.codePointAt(0).toString(16)).join("-") + ".png";
  fs.writeFileSync(path.join(OUT, "bilder", name), buf);
  png[e] = { name, b64: buf.toString("base64") };
}
await browser.close();
console.log(`${liste.length} Bilder gerendert nach ${path.join(OUT, "bilder")}`);
if (opt["bilder-nur"]) process.exit(0);

// 2) Aufgaben: je Bild T Versuche; gerade Versuche mit Ablenkern aus derselben Gruppe, ungerade aus allen
const aufgaben = [];
for (const e of liste) for (let v = 0; v < T; v++) {
  const pool = (v % 2 === 0 ? GRUPPEN[gruppeVon[e]].split(" ") : EMOJI).filter((x) => x !== e);
  const ablenker = mische(pool).slice(0, 3);
  const optionen = mische([e, ...ablenker]);
  aufgaben.push({ e, v, optionen, labels: optionen.map((x) => BILDER[x][opt.lang]) });
}

// 3) Modell fragen, mit Kostengrenze aus den usage-Zaehlern
const key = opt.key ? fs.readFileSync(opt.key, "utf8").trim() : undefined;
const client = new Anthropic(key ? { apiKey: key } : {});
let usd = 0, tin = 0, tout = 0, offen = 0, abbruch = false;
const MAX_JE_AUFRUF = 0.001;   // Obergrenze je Aufruf fuer die Vorab-Pruefung (gemessen ~0,00003 $)
const zeilen = [];
const frage = (labels) => (opt.lang === "en" ? "Which label fits this picture best? Answer with the number only.\n" : "Welches Label passt am besten zu diesem Bild? Antworte nur mit der Zahl.\n") + labels.map((l, i) => `${i + 1}) ${l}`).join("\n");
async function eins(t) {
  if (usd + (offen + 1) * MAX_JE_AUFRUF > CAP) { abbruch = true; return; }
  offen++;
  try {
    const r = await client.messages.create({
      model: opt.modell, max_tokens: 16, thinking: { type: "disabled" }, output_config: { effort: "low" },
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: png[t.e].b64 } }, { type: "text", text: frage(t.labels) }] }],
    });
    const txt = r.content.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    const n = Number((txt.match(/[1-4]/) || [])[0]);
    const kosten = (r.usage.input_tokens * PREIS.in + r.usage.output_tokens * PREIS.out) / 1e6;
    usd += kosten; tin += r.usage.input_tokens; tout += r.usage.output_tokens;
    const row = { bild: t.e, versuch: t.v, optionen: t.labels, antwort: txt, gewaehlt: n ? t.optionen[n - 1] : null, richtig: n ? t.optionen[n - 1] === t.e : false, in: r.usage.input_tokens, out: r.usage.output_tokens, usd: kosten, stop: r.stop_reason };
    zeilen.push(row); fs.appendFileSync(path.join(OUT, "aufrufe.jsonl"), JSON.stringify(row) + "\n");
  } finally { offen--; }
}
const queue = aufgaben.slice();
await Promise.all(Array.from({ length: PAR }, async () => { while (queue.length && !abbruch) await eins(queue.shift()); }));

// 4) Auswertung
const jeBild = liste.map((e) => {
  const z = zeilen.filter((r) => r.bild === e);
  const ok = z.filter((r) => r.richtig).length;
  const falsch = z.filter((r) => !r.richtig).map((r) => r.gewaehlt ? BILDER[r.gewaehlt][opt.lang] : "keine Zahl: " + r.antwort);
  return { bild: e, label: BILDER[e][opt.lang], gruppe: gruppeVon[e], versuche: z.length, treffer: ok, quote: z.length ? ok / z.length : null, falsch };
});
const ges = zeilen.length ? zeilen.filter((r) => r.richtig).length / zeilen.length : null;
const schwach = jeBild.filter((b) => b.quote !== null && b.quote < SCHWELLE).sort((x, y) => x.quote - y.quote);
const ergebnis = { modell: opt.modell, lang: opt.lang, versuche: T, bilder: liste.length, aufrufe: zeilen.length, abbruch, treffer: ges, schwelle: SCHWELLE, tokens: { in: tin, out: tout }, usd, preis: PREIS, schwach: schwach.map((b) => b.bild), jeBild };
fs.writeFileSync(path.join(OUT, "ergebnis.json"), JSON.stringify(ergebnis, null, 2));
const pct = (x) => (x === null ? "–" : (100 * x).toFixed(1).replace(".", ",") + " %");
const md = [
  `# Bild-Text-Pruefung der Kachelbilder`, ``,
  `Modell ${opt.modell}, Sprache ${opt.lang}, ${liste.length} Bilder × ${T} Versuche = ${zeilen.length} Aufrufe${abbruch ? " (ABBRUCH an der Kostengrenze)" : ""}.`,
  `Gesamt-Trefferquote **${pct(ges)}** (Ziel ≥ ${pct(SCHWELLE)}). Kosten ${usd.toFixed(4).replace(".", ",")} $ (${tin} Eingabe-, ${tout} Ausgabe-Tokens).`, ``,
  `## Schwache Bilder (Quote < ${pct(SCHWELLE)})`, ``,
  schwach.length ? `| Bild | Hauptwort | Gruppe | Treffer | gewählt statt dessen |\n|---|---|---|---|---|\n` + schwach.map((b) => `| ${b.bild} | ${b.label} | ${b.gruppe} | ${b.treffer}/${b.versuche} | ${b.falsch.join(", ")} |`).join("\n") : "keine", ``,
  `## Alle Bilder`, ``,
  `| Bild | Hauptwort | Treffer |\n|---|---|---|\n` + jeBild.map((b) => `| ${b.bild} | ${b.label} | ${b.treffer}/${b.versuche} |`).join("\n"), ``,
].join("\n");
fs.writeFileSync(path.join(OUT, "bericht.md"), md);
console.log(`Treffer ${pct(ges)}, schwach: ${schwach.map((b) => b.bild + " " + b.treffer + "/" + b.versuche).join(", ") || "keine"}, Kosten ${usd.toFixed(4)} $`);
if (abbruch) process.exit(3);
