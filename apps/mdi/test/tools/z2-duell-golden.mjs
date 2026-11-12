// Alt-Orakel der Agenten-Duelle (Strang Z2): spielt duel.js des Altcodes (Tag pre-legacy-removal) mit festen Seeds,
// Agenten, Woertern und Haenden durch und friert Duell, Erklaerung, mind-Haende und Gegnerwuerfe ein.
// Aufruf: ALT_DIR=<ausgepackte Altdateien> node test/tools/z2-duell-golden.mjs -> test/fixtures/z2-duell-golden.json
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALT = process.env.ALT_DIR;
if (!ALT || !fs.existsSync(path.join(ALT, "duel.js"))) { console.error("ALT_DIR fehlt oder enthaelt kein duel.js"); process.exit(2); }
const commit = execFileSync("git", ["rev-list", "-n1", "pre-legacy-removal"], { cwd: HERE }).toString().trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "z2-duel-"));
for (const f of fs.readdirSync(ALT)) if (/\.(js|json)$/.test(f)) fs.copyFileSync(path.join(ALT, f), path.join(tmp, f));
const req = createRequire(path.join(tmp, "x.js"));
const Duel = req("./duel.js"), I = req("./ideas.json"), DD = req("./duel.json");

function lcg(s) { let x = s >>> 0 || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const NAMES = ["", "Oma Gisela", "Kai", "Toastomat"];
function randAgent(r) { return { n: NAMES[Math.floor(r() * NAMES.length)], e: DD.emoji[Math.floor(r() * DD.emoji.length)], r: Math.floor(r() * 101), c: Math.floor(r() * 101), p: Math.floor(r() * 101) }; }
const out = { herkunft: `Altbaum @ pre-legacy-removal (${commit}), duel.js + duel.json + ideas.json; erzeugt mit test/tools/z2-duell-golden.mjs`, duelle: [], mind: [], rival: [], ideen: [] };
const r = lcg(4242);
const WORD = { rps: [""], rap: ["", "Danke", "Wecker"], auction: ["", "Halber Keks"] };
for (const m of ["rps", "rap", "auction"]) for (let k = 0; k < 40; k++) {
  const d = Duel.sanitize({ m, seed: Math.floor(r() * 4294967295), set: Math.floor(r() * 4), w: WORD[m][k % WORD[m].length], a: randAgent(r), b: randAgent(r) }, {});
  const doc = { m: d.m, seed: d.seed, set: d.set, w: d.w, a: d.a, b: d.b };
  out.duelle.push({ doc, de: Duel.play(d, "de"), en: Duel.play(d, "en"), why: Duel.explain(d, Duel.play(d, "de")) });
}
for (let k = 0; k < 40; k++) {
  // mind: die Regler des eigenen Agenten sind ausgeblendet (alt modes.js:110) und stehen in der Karte auf 50
  const d = Duel.sanitize({ m: "mind", seed: Math.floor(r() * 4294967295), set: Math.floor(r() * 4), a: { ...randAgent(r), r: 50, c: 50, p: 50 }, b: randAgent(r) }, {});
  const hands = Array.from({ length: 10 }, () => Math.floor(r() * 3)), rnd = Duel.rng(d), hist = [], ys = [];
  let sa = 0, sb = 0;
  for (const i of hands) { const y = Duel.mindHand(hist, d.b.c, rnd()), o = Duel.outcome(i, y); hist.push(i); ys.push(y); if (o > 0) sa++; else if (o < 0) sb++; }
  out.mind.push({ doc: { m: d.m, seed: d.seed, set: d.set, w: d.w, a: d.a, b: d.b }, hands, ys, sa, sb });
}
for (let k = 0; k < 30; k++) { const seed = Math.floor(r() * 4294967295), n = 1 + (k % 5); for (const l of ["de", "en"]) out.rival.push({ seed, n, lang: l, b: Duel.rival(seed, n, DD.rivals[l], DD.emoji) }); }
// die Duell-Karten des Katalogs, so wie fromIdea sie anlegt (Profil ohne Spitzname, Emoji 🤖)
for (const x of [...I.ideas, ...I.retired, ...I.gone].filter((y) => y.kind === "duel" && y.duel.mode !== "flappy")) for (const l of ["de", "en"]) {
  const d = Duel.sanitize(Duel.fromIdea(x, { nick: "", emoji: "🤖" }, l, {}), {});
  out.ideen.push({ id: x.id, lang: l, doc: { m: d.m, seed: d.seed, set: d.set, w: d.w, a: d.a, b: d.b }, res: d.m === "mind" || d.m === "deck" ? null : Duel.play(d, l), why: d.m === "mind" || d.m === "deck" ? null : Duel.explain(d, Duel.play(d, l)) });
}
fs.writeFileSync(path.join(HERE, "../fixtures/z2-duell-golden.json"), JSON.stringify(out) + "\n");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("z2-duell-golden:", out.duelle.length, "Duelle,", out.mind.length, "mind,", out.rival.length, "Wuerfe,", out.ideen.length, "Katalogkarten");
