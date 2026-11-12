// Alt-Orakel fuer die Z1-Zugkarten: fuehrt den ALTCODE (Tag pre-legacy-removal, Altbaum src/turns.js mit
// kontakt.js-Filter und geschenke.js) mit festen Seeds und Antworten aus und friert ein, was er sagt:
//   Optionen je Prompt (de/en), angenommene und abgelehnte Antworten, Ergebnis (de/en), face, peekWhole, Tor.
// Ausgabe: test/fixtures/zug-golden-z1.json. Der Test (test/zug-golden.test.js) spielt dieselben Antworten in der neuen
// Engine und vergleicht. Aufruf (einmalig, Ergebnis wird eingecheckt):
//   ALT_DIR=<Quellordner src des Altbaums, z. B. per `git show pre-legacy-removal:<altpfad>/src/<datei>` exportiert> \
//     node test/tools/zug-golden.mjs
// Der Altbaum wird nie importiert: Tests lesen nur die eingefrorene Fixture (Sperre no-legacy-refs).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAG = "pre-legacy-removal";
function altDir() {
  if (!process.env.ALT_DIR) throw new Error("ALT_DIR fehlt: Quellordner des Altbaums (Tag " + TAG + ") angeben");
  return process.env.ALT_DIR;
}
const DIR = altDir();
const req = createRequire(path.join(DIR, "x.js"));
req("./kontakt.js");
const Tn = req("./turns.js");
const Gs = req("./geschenke.js");
const C = req("./core.js");

// ---------- deterministische Antworten (eigener Zufall, unabhaengig vom Spielseed) ----------
function rnd(seed) { const r = C.mulberry32(seed); return { f: r, int: (n) => Math.floor(r() * n), pick: (a) => a[Math.floor(r() * a.length)] }; }
const WORDS = ["Pizza", "Kino", "Sonne", "Äpfel", "Grillen", "Bücher", "Fußball", "Tee", "Spaziergang", "Brettspiel", "Musik", "Kuchen", "Schwimmen", "Wandern", "Müsli", "Kakao"];
const NAMES = ["Ana", "Ben", "Cem", "Dana", "Emil", "Fee", "Gül", "Hans", "Ida", "Jonas", "Kim", "Lea"];
const LINES = ["immer für mich da bist", "Danke für den Kuchen", "du so gut zuhören kannst", "wir zusammen lachen", "der Abend schön war"];
function distinctN(r, n, max) { const s = []; while (s.length < n) { const x = r.int(max); if (!s.includes(x)) s.push(x); } return s; }

function gen(p, doc, m, now, r, lang = "de") {
  switch (p.w) {
    case "pick": return distinctN(r, p.n, p.from(doc, m, now, lang).length);
    case "rank": { const n = p.from(doc, m, now, lang).length, a = []; for (let i = 0; i < n; i++) a.push(i); for (let i = n - 1; i > 0; i--) { const j = r.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    case "text":
      if (p.oneWord) return r.pick(["annaSammelt", "Ben2024", "kasse", "LeaPay"]);
      if (p.max <= 12) return r.pick(NAMES);
      return r.pick(LINES).slice(0, p.max);
    case "list":
      if (p.loose) { const k = Math.max(p.least || 0, 3 + r.int(p.n - 3)); const pool = (p.l === "wic_names" ? NAMES : WORDS).slice(); const out = []; for (let i = 0; i < p.n; i++) out.push(i < k ? pool.splice(r.int(pool.length), 1)[0].slice(0, p.max) : ""); return out; }
      { const pool = WORDS.slice(); return Array.from({ length: p.n }, () => pool.splice(r.int(pool.length), 1)[0].slice(0, p.max)); }
    case "slide": { const lo = p.min || 0, hi = p.maxOf ? p.maxOf(doc) : p.max; return lo + r.int(hi - lo + 1); }
    case "show": case "blow": return 0;
    case "money": { const k = now[2]; return 100 + r.int(5000 * k - 100); }
    case "slots": { const day = 20770 + r.int(30), n = 2 + r.int(4), s = new Set(); while (s.size < n) s.add((day + r.int(14)) * 10 + r.int(9)); return [r.pick(NAMES), [...s].sort((a, b) => a - b)]; }
    case "vote": { const used = m.map((t) => t[0][0]); const free = NAMES.filter((x) => !used.includes(x)); return [free[r.int(free.length)], Tn.termDates(m).map(() => r.int(3))]; }
    case "opts": return distinctN(r, p.n, p.keys.length);
    case "ideas": { const ask = p.ask(now); const l = Gs.ideas(doc.seed, ask, lang); return [l, r.int(l.length)]; }
    case "shop": case "wish": {
      const base = m.length ? m[0][0] : null, cf = p.cfg || Tn.GAMES.einkauf.list;
      const adds = []; const k = base ? r.int(3) : 2 + r.int(4);
      const pool = WORDS.slice(); for (let i = 0; i < k; i++) adds.push({ text: pool.splice(r.int(pool.length), 1)[0], qty: cf.qty > 1 ? 1 + r.int(3) : 1 });
      const marks = {};
      if (base) for (const it of base[1]) if (r.int(2)) marks[Tn.shopKey(it[0])] = cf.wish ? 1 : 1 + r.int(2);
      return Tn.shopApply(base, { name: base ? r.pick(NAMES) : "", face: r.int(12), adds, marks }, cf);
    }
    default: throw new Error("gen: " + p.w);
  }
}
// absichtlich falsche Antworten je Art (der Link kann von Hand gebaut sein)
function bad(p, doc, m, now, lang = "de") {
  const out = [null, "x", -1, [], [99]];
  if (p.w === "text") out.push("", "du idiot", "ruf an 0171 2345678", "a".repeat(p.max + 1), p.oneWord ? "zwei worte" : "<b>");
  if (p.w === "list") out.push(Array(p.n).fill("gleich"), Array(p.n).fill(""));
  if (p.w === "slide") out.push((p.min || 0) - 1, (p.maxOf ? p.maxOf(doc) : p.max) + 1, 1.5);
  if (p.w === "pick") out.push(Array(p.n).fill(0).map((x, i) => i + 1000), Array(p.n + 1).fill(0).map((x, i) => i));
  if (p.w === "money") out.push(99, 0, 5000 * (now[2] || 1) * 100 + 1, 1.5);
  if (p.w === "slots") out.push(["Ana", [1]], ["Ana", [20, 10]], ["", [20770 * 10, 20771 * 10]]);
  if (p.w === "vote") out.push([m.length ? m[0][0][0] : "Ana", Tn.termDates(m).map(() => 0)], ["Neu", [3]]);
  if (p.w === "shop" || p.w === "wish") out.push([[], []], [[], [["", 0, 1, []]]]);
  return out;
}

const SPIELE = { einig: 6, rangliste: 6, kapsel: 6, post: 6, gutschein: 6, rubbellos: 6, urkunde: 6, morgen: 6, umschlag: 6, wichteln: 6, reihum: 6, kerzen: 6, termin: 6, danke: 6, sorry: 6, sammeln: 6, einkauf: 8, wunsch: 6, geschenk: 6 };
const TODAY = 20770; // 2026-11-12
const out = { herkunft: "Altbaum, Tag " + TAG + ": turns.js, turn.json, kontakt.js, geschenke.js(.json). Erzeugt mit test/tools/zug-golden.mjs; kein Import aus dem Altbaum im Test.", heute: TODAY, faelle: [] };
for (const [g, n] of Object.entries(SPIELE)) {
  for (let s = 0; s < n; s++) {
    const seed = C.hash32("z1|" + g + "|" + s) >>> 0, r = rnd(seed ^ 0x5bd1e995);
    let doc = Tn.sanitize({ g, seed, q: "" }, {});
    doc.g = g;
    const f = { g, seed, turns: [], rejects: [], options: [], results: {}, faces: [], wholes: [], gates: [], closed: false };
    let guard = 0;
    while (!Tn.state(doc).over && guard++ < 12) {
      const st = Tn.state(doc), now = [];
      if (st.prompts.some((p) => p.end)) { f.endAt = st.turn; break; } // pay: der Zug bleibt stehen (turn-ui.js:663 ends)
      for (let i = 0; i < st.prompts.length; i++) {
        const p = st.prompts[i];
        const opts = p.from && p.w !== "ideas" ? { de: p.from(doc, st.moves, now, "de"), en: p.from(doc, st.moves, now, "en") } : null;
        if (opts) f.options.push({ t: st.turn, i, ...opts });
        for (const b of bad(p, doc, st.moves, now)) f.rejects.push({ t: st.turn, i, v: b, ok: Tn.okAnswer(p, b, doc, "de", st.moves, now) });
        const v = gen(p, doc, st.moves, now, r);
        if (!Tn.okAnswer(p, v, doc, "de", st.moves, now)) throw new Error("Generator lieferte ungueltige Antwort: " + g + " " + JSON.stringify(v));
        now.push(v);
      }
      const day = TODAY + st.turn;
      const next = Tn.play(doc, now, day);
      if (!next) throw new Error("play null " + g);
      f.turns.push({ a: now, d: day });
      doc = next;
      f.faces.push({ de: Tn.face(doc, "de"), en: Tn.face(doc, "en") });
      f.wholes.push(Tn.whole(doc, "de"));
      f.gates.push({ o: doc.o === undefined ? 0 : doc.o, left: Tn.gate(doc, day) });
      if (g === "wunsch" && f.turns.length >= 3 + (s % 3) && !Tn.state(doc).over) { const c = Tn.close(doc); if (c) { doc = c; f.closed = true; } }
      if (g === "termin" && s < 4 && st.turn >= 3 + s) break; // unterschiedlich viele Stimmen
      if (g === "reihum" && st.turn >= 1 + (s % 3) && s % 2) break;
    }
    const stf = Tn.state(doc);
    f.over = stf.over; f.m = stf.moves;
    f.results = { de: Tn.result(doc, "de"), en: Tn.result(doc, "en") };
    out.faelle.push(f);
  }
}
const target = path.join(HERE, "..", "fixtures", "zug-golden-z1.json");
fs.writeFileSync(target, JSON.stringify(out) + "\n");
console.log("geschrieben:", target, out.faelle.length, "Faelle,", out.faelle.reduce((a, f) => a + f.rejects.length, 0), "Ablehnungen");
