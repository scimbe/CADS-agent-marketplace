"use strict";
// Katalog v2, W0 point 6: Kit.t.plural (Intl.PluralRules), the font token, the privacy line (src/bausteine.js), the
// registry of the parts turn2 and logik, and the catalog index of the core (Daily.fill).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
const TEXTS = require("../src/texts.json");

// kit.js and bausteine.js in a small fake page: storage, one language, a root element for the token.
function page(lang, store) {
  const ls = { "daily.v1": JSON.stringify(Object.assign({ lang }, store || {})) }, rootStyle = {}, attrs = {};
  const w = {
    DailyTexts: JSON.parse(JSON.stringify(TEXTS)), navigator: { language: lang },
    localStorage: { getItem: (k) => ls[k] || null, setItem: (k, v) => { ls[k] = v; } },
    document: { documentElement: { style: { setProperty: (k, v) => { rootStyle[k] = v; } }, setAttribute: (k, v) => { attrs[k] = v; } } },
    Intl, Object, JSON, Promise, Array, String, Math, Error, setTimeout, clearTimeout
  };
  w.window = w;
  vm.runInNewContext(src("kit.js") + "\n" + src("bausteine.js"), w);
  return { w, ls, rootStyle, attrs };
}

test("t.plural: Kategorie aus Intl.PluralRules, Zahl nach Sprache, deutscher Rueckfall fuer fehlende Woerter", () => {
  const de = page("de").w.Kit, en = page("en").w.Kit;
  assert.equal(de.t.plural("wsw_exp", 1), "Der Link verfällt nach 1 Tag.");
  assert.equal(de.t.plural("wsw_exp", 2), "Der Link verfällt nach 2 Tagen.");
  assert.equal(de.t.plural("wsw_exp", 1.5), "Der Link verfällt nach 1,5 Tagen.", "Komma in de");
  assert.equal(en.t.plural("wsw_exp", 1), "The link expires after 1 day.");
  assert.equal(en.t.plural("wsw_exp", 1500), "The link expires after 1,500 days.");
  const p = page("en"); delete p.w.DailyTexts.en.wsw_exp_other;
  assert.equal(p.w.Kit.t.plural("wsw_exp", 3), "Der Link verfällt nach 3 Tagen.", "fehlt en, gilt de");
  assert.equal(de.t.plural("gibtsnicht", 2), "gibtsnicht");
  assert.equal(de.num(1234.5), "1.234,5"); assert.equal(en.num(1234.5), "1,234.5");
});
test("Schrift-Token --fs: normal/gross/sehr gross = 1/1,25/1,5, nur auf dem Geraet, Unbekanntes bleibt normal", () => {
  const p = page("de");
  assert.equal(p.rootStyle["--fs"], "1"); assert.equal(p.attrs["data-fs"], "n");
  p.w.Kit.setFs("g"); assert.equal(p.rootStyle["--fs"], "1.25"); assert.equal(JSON.parse(p.ls["daily.v1"]).fs, "g");
  p.w.Kit.setFs("sg"); assert.equal(p.rootStyle["--fs"], "1.5");
  p.w.Kit.setFs("riesig"); assert.equal(p.w.Kit.fs, "sg");
  p.w.Kit.setFs("n"); assert.equal(JSON.parse(p.ls["daily.v1"]).fs, undefined, "normal speichert nichts");
  assert.equal(page("de", { fs: "sg" }).rootStyle["--fs"], "1.5"); assert.equal(page("de", { fs: "<x>" }).rootStyle["--fs"], "1");
  assert.match(src("style.css"), /html\{font-size:calc\(100% \* var\(--fs\)\)\}/);
  for (const k of ["fs_title", "fs_n", "fs_g", "fs_sg"]) assert.ok(TEXTS.de[k] && TEXTS.en[k], k);
});
test("Wer sieht was?: ein Satz aus den Kartenfeldern, de und en, KI mit Anbieter und Ort, Server, Verfall", () => {
  const de = page("de").w.Bausteine, en = page("en").w.Bausteine;
  assert.equal(de.wsw({}), "Im Link steht nur die Karte. Keine KI. Kein Server speichert etwas. Der Link verfällt nicht.");
  assert.equal(de.wsw({ link: ["name", "text", "termin"], ki: { a: "Mistral", o: "Frankreich" }, server: ["text"], tage: 7 }),
    "Im Link stehen Namen, eure Texte und Termine. Text geht an die KI (Mistral, Server in Frankreich). Ein Server speichert eure Texte. Der Link verfällt nach 7 Tagen. Wer den Link sieht, sieht das auch, zum Beispiel im Gruppenchat.");
  assert.equal(en.wsw({ link: ["stimme"], tage: 1 }), "The link carries votes. No AI. No server keeps anything. The link expires after 1 day. Anyone who sees the link sees this too, for example in a group chat.");
  assert.equal(de.wsw({ link: ["passwort", "<b>"] }), de.wsw({}), "nur bekannte Felder");
  for (const k of Object.keys(TEXTS.de).filter((x) => /^(wsw_|data_missing|fs_)/.test(x))) assert.ok(TEXTS.en[k], "en fehlt: " + k);
  for (const k of Object.keys(TEXTS.en).filter((x) => /^(wsw_|data_missing|fs_)/.test(x))) assert.ok(TEXTS.de[k], "de fehlt: " + k);
});
test("Neue Texte nur ueber Schluessel: keine Sprachzweige und keine de|en-Paare in den W0-Dateien", () => {
  for (const f of ["bausteine.js", "kalender.js", "turn2.js", "logik.js"]) {
    const s = src(f);
    assert.ok(!/lang\s*===?\s*["'](en|de)["']|["'](en|de)["']\s*===?\s*\w*lang/i.test(s), f + ": Sprachzweig");
    assert.ok(!/"[^"\n{}(),]*\|[^"\n{}(),]*"/.test(s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\/(?:\\.|[^/\n])+\/[gimsuy]*/g, "")), f + ": de|en-Paar");
  }
});
test("Katalog im Kern nur als Index: Daily.fill fuellt dieselben Objekte, Reihenfolge der Tage bleibt", () => {
  const full = require("../src/ideas.json"), daily = src("daily.js"), idx = require("../src/daily.js").index(full);
  const run = (withFull) => {
    const g = { DuellIdeas: JSON.parse(JSON.stringify(idx)), DailyTexts: TEXTS, Intl, Object, JSON, Array, String, Math, Date, Error, TextEncoder, TextDecoder, btoa, atob, Uint8Array };
    g.globalThis = g;
    if (withFull) g.DuellIdeasFull = JSON.parse(JSON.stringify(full));
    for (const f of ["core.js", "duel.js", "quest.js", "turns.js", "daily.js"]) vm.runInNewContext(src(f).replace(/typeof module !== "undefined" && module\.exports/g, "false").replace(/\(typeof globalThis !== "undefined" \? globalThis : this\)/, "(globalThis)"), g);
    return g;
  };
  const g = run(false), D = g.Daily, day = new Date("2026-12-03T10:00:00Z");
  assert.equal(D.full(), false);
  const before = D.ideaForDay(day), order = D.roundOrder(3).map((i) => i.id);
  assert.equal(D.docFromIdea(before, D.sanitizeProfile({}), "de").k, "card", "ohne Teil: das Blatt als Karte mit Titel");
  assert.ok(D.searchIdeas("quiz", day).length > 0, "Suche geht schon mit dem Index");
  g.DuellIdeasFull = JSON.parse(JSON.stringify(full)); assert.equal(D.fill(), true);
  assert.equal(D.ideaForDay(day), before, "dasselbe Objekt, jetzt voll"); assert.ok(before.de.s);
  assert.deepEqual(D.roundOrder(3).map((i) => i.id), order);
  for (let r = 0; r < 12; r++) assert.equal(D.roundOrder(r).map((i) => i.id).join(), require("../src/daily.js").roundOrder(r).map((i) => i.id).join(), "Runde " + r + " wie mit dem vollen Katalog");
  assert.equal(run(true).Daily.full(), true, "Teil vor daily.js gelaufen");
  assert.match(daily, /fill\(\);   \/\/ the part may have run before this file/);
});
