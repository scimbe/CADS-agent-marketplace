// Alt-Orakel fuer Strang Z2: spielt die Zugkarten des Altcodes (Tag pre-legacy-removal, turns.js)
// mit festen Seeds und gueltigen Antworten durch und friert je Zug die angebotenen Optionen (de/en), die Antworten,
// abgelehnte Antworten und das Ergebnis (de/en) ein. Aufruf: node test/tools/z2-golden.mjs [spiel …]
// Schreibt test/fixtures/z2-golden.json. Der Altcode wird in ein Temp-Verzeichnis kopiert und nur dort geladen.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// ALT_DIR: Verzeichnis mit den ausgepackten Altdateien (turns.js, core.js, quest.js, quizpack.js, quizmake.js, turn.json,
// quiz-packs.json) aus dem Tag pre-legacy-removal. Der Pfad des Altbaums steht absichtlich in keiner Datei des neuen Baums.
const ALT = process.env.ALT_DIR;
if (!ALT || !fs.existsSync(path.join(ALT, "turns.js"))) { console.error("ALT_DIR fehlt oder enthaelt kein turns.js"); process.exit(2); }
const commit = execFileSync("git", ["rev-list", "-n1", "pre-legacy-removal"], { cwd: HERE }).toString().trim();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "z2-alt-"));
for (const f of fs.readdirSync(ALT)) if (/\.(js|json)$/.test(f)) fs.copyFileSync(path.join(ALT, f), path.join(tmp, f));
const T = createRequire(path.join(tmp, "x.js"))("./turns.js");

// Spiele dieses Strangs (GAMES-Schluessel) -> Karten-id
export const Z2 = {
  lob: "zug-lob", kennst: "zug-kennst", luege: "zug-luege", auktion: "zug-auktion", deal: "zug-auktion/deal", teilen: "zug-auktion/teilen",
  socke: "zug-auktion/socke", fallpreis: "zug-auktion/fallpreis", wort: "zug-wort", schmuggel: "zug-schmuggel", snack: "zug-snack",
  wette: "zug-wette", luecke: "zug-luecke", auftrag: "zug-auftrag", ausrede: "karte-ausrede", blitz: "zug-blitz", recht: "zug-recht",
  steine: "zug-steine", kreis: "zug-kreis", tuer: "zug-kreis/tuer", hoeflich: "zug-hoeflich", woerter: "zug-woerter", socken: "zug-socken",
  rap: "zug-rap", pokal: "zug-pokal", uhr: "zug-pokal/uhr", reaktion: "zug-reaktion", regel: "karte-regel", disco: "beat-disco",
  tier: "mut-tierstory", werbung: "mut-werbung", streichen: "raum-streichen", erklaeren: "raum-erklaeren", damals: "raum-damals",
  maschine: "raum-maschine", suche: "raum-suche", maus: "raum-maus", papagei: "raum-papagei", bluff: "zug-bluff"
};

// deterministischer Zufall nur fuer die Wahl der Testantworten
function lcg(s) { let x = s >>> 0 || 1; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const WORDS = ["Apfel", "Kuchen", "Bus", "Lampe", "Wolke", "Tisch", "Garten", "Banane", "Kerze", "Hose", "Dach", "Fisch", "Gabel", "Nudel", "Stern", "Brille", "Daumen", "Eimer", "Fahne", "Glocke"];
const SENT = ["Ich war schon mal in Rom", "Ich kann jonglieren", "Ich mag keine Oliven", "Mein Hund heisst Keks", "Ich habe Angst vor Tauben"];
function ints(n) { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; }
function shuf(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function between(r, a, b) { return a + Math.floor(r() * (b - a + 1)); }

function answer(p, doc, m, now, r, lang = "de") {
  const from = () => (typeof p.from === "function" ? p.from(doc, m, now, lang) : []);
  switch (p.w) {
    case "pick": return shuf(r, ints(from().length)).slice(0, p.n);
    case "rank": return shuf(r, ints(from().length));
    case "alloc": { const n = from().length, v = new Array(n).fill(0); let left = p.sum; for (let k = 0; k < 40 && left >= p.step; k++) { const i = Math.floor(r() * n); v[i] += p.step; left -= p.step; } return v; }
    case "slide": return between(r, p.min || 0, p.maxOf ? p.maxOf(doc) : p.max);
    case "text": { for (let k = 0; k < 50; k++) { const w = p.oneWord || p.max < 20 ? WORDS[Math.floor(r() * WORDS.length)] : SENT[Math.floor(r() * SENT.length)].slice(0, p.max); if (T.okAnswer(p, w, doc, lang, m, now)) return w; } return null; }
    case "list": {
      if (p.keep) { const L = p.title ? null : null; void L; }
      const pool = p.max < 20 ? WORDS : SENT, out = shuf(r, pool).slice(0, p.n).map((x) => x.slice(0, p.max));
      if (p.loose) return out.map((x, i) => (p.least && i < p.least) || r() < 0.7 ? x : "");
      return out;
    }
    case "show": case "clock": case "touch": case "doors": case "rec": case "once": case "parrot": case "blow": case "pay": return 0;
    case "hunt": return between(r, 1, Math.min(p.max, 900));
    case "drop": return between(r, 0, p.max);
    case "freeze": return between(r, 0, Math.min(p.max, 30));
    case "explain": return between(r, 0, Math.min(p.max, 30));
    case "whose": return between(r, 0, 2);
    case "inner": return ints(5).map(() => between(r, -3000, 3000));
    case "blind": return between(r, 2000, 30000);
    case "react": return between(r, 150, 4000);
    case "door": { const tot = between(r, 0, 40), right = between(r, 0, tot); return [between(r, 0, 10), right, tot]; }
    case "grid": return shuf(r, ints(25)).slice(0, p.n);
    case "probe": { const old = p.before(doc, m); return shuf(r, ints(25).filter((c) => !old.includes(c))).slice(0, Math.min(p.n, 25 - old.length)); }
    case "blocks": {
      const cells = []; let st = { grid: new Array(64).fill(0), score: 0, lines: 0, i: 0 };
      while (cells.length < p.max && T.canMove(st, doc)) { const b = T.blockAt(doc, st.i), ok = ints(64).filter((a) => T.fits(st.grid, b, a)); const a = ok[Math.floor(r() * ok.length)]; st = T.drop(st, b, a); cells.push(a); if (r() < 0.04) break; }
      return cells;
    }
    default: throw new Error("Antwortart fehlt im Orakel: " + p.w);
  }
}
// ungueltige Antworten je Art (Negativ-Orakel): je eine, die der Altcode ablehnen muss
function invalid(p, good) {
  switch (p.w) {
    case "pick": return [good.concat([good[0]]), [-1], [999]];
    case "rank": return [good.slice(1), good.map(() => 0)];
    case "alloc": return [good.map(() => p.sum), good.map((x) => x + 1)];
    case "slide": return [(p.min || 0) - 1, 1e9];
    case "text": return ["", "x".repeat(200), p.oneWord ? "zwei Wörter" : "<b>"];
    case "list": return [[], good.slice(1)];
    case "show": case "clock": case "touch": case "doors": case "rec": case "once": case "parrot": return [1];
    case "grid": return [[0, 0], [25, 1]];
    case "blocks": return [[64]];
    default: return ["kaputt"];
  }
}

function playCase(g, seed, rs) {
  const r = lcg(rs), doc = { g, seed, q: "", f: "star" }, turns = [];
  let d = doc;
  for (let t = 0; t < 40; t++) {
    const st = T.state(d); if (st.over) break;
    const now = [], opts = [], bad = [];
    for (const p of st.prompts) {
      const o = { w: p.w, l: p.l };
      for (const lang of ["de", "en"]) {
        if (typeof p.from === "function") o["from_" + lang] = p.from(d, st.moves, now, lang);
        if (typeof p.top === "function") o["top_" + lang] = p.top(d, st.moves, lang);
        if (typeof p.peek === "function") o["peek_" + lang] = p.peek(d, st.moves, now, lang);
        if (typeof p.list === "function") o["list_" + lang] = p.w === "explain" ? p.list(d, lang).slice(0, 30) : p.w === "hunt" ? p.list(d, st.moves, lang) : p.list(d, st.moves, now, lang);
        if (p.w === "drop") { o["item_" + lang] = p.item(d, lang); o.worth = p.worth(d); }
        if (p.w === "freeze") { o["statue_" + lang] = ints(8).map((k) => p.statue(d, k, lang)); o.pause = ints(8).map((k) => p.pause(d, k)); o.beats = ints(3).map((k) => p.beat(k)); }
        if (p.w === "whose") { o.slot = p.slot(d); o.fx = p.fx(d); }
        if (p.w === "once") { o.fx = p.fx(st.moves); o.who = p.who(st.moves); }
        if (p.w === "probe") { o.socks = p.socks(d, st.moves); o.before = p.before(d, st.moves); }
        if (typeof p.title === "function") o["title_" + lang] = p.title(d, lang);
        if (typeof p.plan === "function") o.plan = p.plan(d);
        if (typeof p.targets === "function") o.targets = p.targets(d);
        if (p.text && p.w === "clock") o["text_" + lang] = p.text(d, st.moves, lang);
      }
      const a = answer(p, d, st.moves, now, r);
      if (!T.okAnswer(p, a, d, "de", st.moves, now)) throw new Error(`Orakel-Antwort abgelehnt: ${g} t${t} ${p.w} ${JSON.stringify(a)}`);
      for (const x of invalid(p, a)) if (!T.okAnswer(p, x, d, "de", st.moves, now)) bad.push({ i: now.length, v: x });
      opts.push(o); now.push(a);
    }
    const next = T.play(d, now, 20000);
    if (!next) throw new Error(`play() lehnt ab: ${g} t${t}`);
    turns.push({ prompts: opts, answers: now, bad, o: next.o === undefined ? null : next.o, whole_de: T.whole(next, "de") });
    d = next;
  }
  const st = T.state(d);
  const extra = {};
  if (g === "tuer") { extra.order = T.doorOrder(d); extra.beings = ints(3).map((rr) => { const prev = [], out = []; for (let i = 0; i < 12; i++) { const b = T.doorBeing(d, rr, i, prev); out.push(b); prev.push(T.doorIn(rr, b)); } return out; }); }
  if (g === "steine") extra.blocks = ints(45).map((i) => T.blockAt(d, i));
  if (g === "socken") extra.answers = ints(25).map((c) => T.sockAnswer([3, 17], c));
  return { g, seed, extra, turns, over: st.over, total: T.GAMES[g].turns.length, n: st.moves.length, result: { de: T.result(d, "de"), en: T.result(d, "en") }, who: T.who(g), gate: T.gate(d, 20000) };
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(Z2);
const SEEDS = [1, 7, 42, 1234, 99991, 2654435761, 31337, 4000000000];
const out = { herkunft: `Altbaum @ pre-legacy-removal (${commit}), turns.js + turn.json; erzeugt mit test/tools/z2-golden.mjs`, spiele: {} };
const file = path.join(HERE, "../fixtures/z2-golden.json");
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
if (old) Object.assign(out.spiele, old.spiele);
for (const g of want) out.spiele[g] = SEEDS.map((s, i) => playCase(g, s, 1000 + i * 17));
fs.writeFileSync(file, JSON.stringify(out) + "\n");
fs.rmSync(tmp, { recursive: true, force: true });
console.log("z2-golden:", want.length, "Spiele,", want.length * SEEDS.length, "Partien ->", path.relative(process.cwd(), file));
