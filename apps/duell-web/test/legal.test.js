"use strict";
// Legal pages: complete in both languages, linked from every screen, and nothing with a placeholder goes live.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Legal = require("../src/legal.js");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const L = JSON.parse(read("src/legal.json")), OP = JSON.parse(read("legal/operator.json"));
// Synthetic operator, only for the tests.
const FILLED = { name: "Testbetrieb Muster", street: "Teststraße 1", city: "00000 Testort", country: "Testland", email: "test@example.invalid", phone: "+00 0", vatId: "", register: "", mstv: "Testperson, Teststraße 1", dpo: "", hosting: "Testhoster", proxyLogDays: "7", anthropicTransfer: "Testgrundlage", anthropicTransferEn: "test basis",
  bestaetigt: Object.fromEntries(Legal.CONFIRM.map((k) => [k, true])) };

test("Rechtsseiten: alle Seiten auf Deutsch und Englisch, gleich gebaut, nur bekannte Felder", () => {
  for (const lang of ["de", "en"]) {
    for (const p of Legal.PAGES) { assert.ok(Array.isArray(L[lang][p]) && L[lang][p].length, lang + "/" + p); assert.ok(L[lang].nav[p], "Titel " + lang + "/" + p); }
  }
  for (const p of Legal.PAGES) assert.deepEqual(L.de[p].map((b) => b[0]), L.en[p].map((b) => b[0]), "gleiche Gliederung " + p);
  for (const m of JSON.stringify(L).matchAll(/\{([a-zA-Z]+)\}/g)) assert.ok(m[1] in OP, "unbekanntes Feld {" + m[1] + "}");
});

test("Rechtsseiten: Pflichtinhalte stehen drin (Impressum, Art. 13, Mindestalter, Melden, IP im Live-Spiel)", () => {
  const de = (p) => JSON.stringify(L.de[p]), en = (p) => JSON.stringify(L.en[p]);
  assert.match(de("impressum"), /§ 5 DDG/); assert.match(de("impressum"), /§ 18 Abs\. 2 MStV/);
  for (const k of ["{name}", "{street}", "{city}", "{email}", "{mstv}", "{vatId}"]) assert.ok(de("impressum").includes(k), k);
  for (const s of ["Rechtsgrundlage", "Speicherdauer", "Art. 15", "Art. 77", "Art. 8", "90 Tage", "Open-Meteo", "IP-Adresse", "TURN", "Kurzlink", "KI"]) assert.ok(de("datenschutz").includes(s), "Datenschutz: " + s);
  for (const s of ["ab 13", "Melden", "IP-Adresse"]) assert.ok(de("agb").includes(s), "AGB: " + s);
  assert.match(en("agb"), /IP address/); assert.match(en("agb"), /13/);
  const texts = JSON.parse(read("src/texts.json"));
  assert.ok(texts.de.live_ipNote && texts.en.live_ipNote, "Hinweis vor dem Live-Spiel bleibt");
});

test("Rechtsseiten: freie Karte – Anthropic USA, ab 16, Guthaben, Melden, Sperre, Beschwerde (de und en)", () => {
  const de = (p) => JSON.stringify(L.de[p]), en = (p) => JSON.stringify(L.en[p]);
  for (const s of ["Anthropic", "USA", "ab 16", "{anthropicTransfer}", "Auftragsverarbeiter", "Guthaben", "Meldest du eine Karte", "183 Tage"]) assert.ok(de("datenschutz").includes(s), "Datenschutz: " + s);
  for (const s of ["Anthropic", "USA", "16 and over", "{anthropicTransferEn}", "processor", "credit", "report a card", "183-day"]) assert.ok(en("datenschutz").includes(s), "privacy: " + s);
  for (const s of ["ab 16", "Guthaben", "keinen Geldwert", "„Melden“", "pausiert", "Sperre", "Art. 17 DSA", "Art. 20 DSA", "183 Tagen"]) assert.ok(de("agb").includes(s), "AGB: " + s);
  for (const s of ["from 16", "credit", "no monetary value", "“Report”", "paused", "block", "Art. 17 DSA", "Art. 20 DSA", "183 days"]) assert.ok(en("agb").includes(s), "terms: " + s);
  // the old sentences that the free card would make wrong are narrowed, not left as they were
  assert.ok(!de("datenschutz").includes("Daten gehen nicht in Länder außerhalb der EU bzw. des EWR, außer wenn du selbst über einen Messenger teilst.\""), "Drittland-Satz eingeschraenkt");
  assert.ok(de("datenschutz").includes("Außerhalb der freien Karte gibt es keine automatisierte Entscheidung"));
  // the transfer basis is the operator's: a placeholder until filled, and its own confirmation
  assert.ok(Legal.missing(OP).includes("anthropicTransfer") && Legal.missing(OP).includes("bestaetigt.anthropic"));
  const filled = Legal.html(L, FILLED, "datenschutz", "de", []);
  assert.ok(filled.includes("Testgrundlage") && Legal.html(L, FILLED, "datenschutz", "en", []).includes("test basis"));
});

test("Platzhalter: missing() meldet offene Felder und Bestaetigungen, ausgefuellt ist nichts offen", () => {
  const open = Legal.missing(OP);
  for (const k of ["name", "street", "city", "email", "mstv", "bestaetigt.aiModelOwnHardware"]) assert.ok(open.includes(k), k);
  assert.ok(!open.includes("_hinweis"));
  assert.deepEqual(Legal.missing(FILLED), []);
  assert.deepEqual(Legal.missing({ ...FILLED, bestaetigt: { ...FILLED.bestaetigt, avvHosting: false } }), ["bestaetigt.avvHosting"]);
});

test("Platzhalter: leere optionale Felder lassen ihre Zeile weg, ausgefuellte Seiten haben keinen Platzhalter", () => {
  const imp = Legal.blocks(L, FILLED, "impressum", "de").map((b) => b.s || "").join("\n");
  assert.ok(!/Umsatzsteuer|Registereintrag/.test(imp), "vatId und register leer -> Zeile fehlt");
  assert.ok(imp.includes("Testbetrieb Muster") && imp.includes("test@example.invalid"));
  for (const lang of ["de", "en"]) for (const p of Legal.PAGES) assert.ok(!Legal.html(L, FILLED, p, lang, []).includes(Legal.MARK), lang + "/" + p);
  assert.ok(!Legal.blocks(L, FILLED, "datenschutz", "de").some((b) => /Datenschutzbeauftragte/.test(b.s || "")), "dpo leer");
});

test("Release-Gate: check:release scheitert mit Platzhaltern und laeuft mit vollstaendigen Daten durch", () => {
  const gate = path.join(root, "scripts/check-legal.js");
  const bad = spawnSync(process.execPath, [gate], { encoding: "utf8" });
  assert.equal(bad.status, 1, "solange operator.json Platzhalter hat");
  assert.match(bad.stderr, /Nicht live-faehig.*name/);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "legal-")), "op.json");
  fs.writeFileSync(f, JSON.stringify(FILLED));
  const good = spawnSync(process.execPath, [gate, f], { encoding: "utf8" });
  assert.equal(good.status, 0, good.stderr);
});

test("Statische Seiten: jede verlinkt alle anderen, die andere Sprache und zurueck zur App, ohne Skript", () => {
  execFileSync(process.execPath, [path.join(root, "scripts/build.js")]);
  for (const lang of ["de", "en"]) for (const p of Legal.PAGES) {
    const h = read("dist/legal/" + (lang === "en" ? "en/" : "") + p + ".html");
    for (const q of Legal.PAGES) assert.ok(h.includes('href="' + q + '"'), lang + "/" + p + " -> " + q);
    assert.ok(h.includes(lang === "en" ? 'href="../../duell"' : 'href="../duell"'), "zurueck zur App");
    assert.ok(h.includes(lang === "en" ? 'href="../' + p + '"' : 'href="en/' + p + '"'), "Sprachwechsel");
    assert.ok(!/<script/i.test(h));
    assert.match(h, new RegExp('<html lang="' + lang + '">'));
  }
  assert.match(read("dist/legal/lizenzen.html"), /qrcode-generator[\s\S]*MIT/);
});

test("Erreichbarkeit: Impressum und Datenschutz in hoechstens zwei Tipps von jedem Bildschirm", () => {
  const tpl = read("src/index.template.html"), app = read("src/app.js");
  const sec = (id) => { const a = tpl.indexOf('<section id="' + id + '"'); return tpl.slice(a, tpl.indexOf("</section>", a)); };
  // one tap: the link row on home and on the finished picture
  for (const id of ["home", "done"]) for (const p of ["impressum", "datenschutz"]) assert.ok(sec(id).includes('class="legalrow"') && sec(id).includes('data-legal="' + p + '"'), id + ": " + p);
  // two taps: every shelf has § in its header, which opens the list of pages
  assert.match(sec("shelf"), /id="shlegal"[^>]*data-legal=""/);
  // two taps: editor and game go back home with one tap (home has the row); my style lists the pages
  assert.match(sec("editor"), /id="edback"/); assert.match(sec("game"), /id="gback"/);
  assert.match(app, /\$\("edback"\)\.addEventListener\("click", function \(\) \{ Kit\.sfx\.tap\(\); goHome\(\); \}\)/);
  assert.match(app, /function openStyle\(\)[\s\S]*?legalChips\(b, ""\)/);
  assert.match(app, /closest\("\.legalrow \[data-legal\], #shlegal"\)/);
});

test("Lizenzen: jede Datei aus node_modules im Build steht in der Liste, jede Lizenzdatei existiert", () => {
  const build = read("scripts/build.js");
  const used = new Set([...build.matchAll(/node_modules\/((?:@[^/"]+\/)?[^/"]+)/g)].map((m) => m[1]));
  const listed = [...build.matchAll(/from: "node_modules\/((?:@[^/"]+\/)?[^/"]+)"/g)].map((m) => m[1]);
  for (const u of used) assert.ok(listed.includes(u), "fehlt in THIRD_PARTY: " + u);
  for (const m of build.matchAll(/file: "([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, "licenses", m[1])), m[1]);
});
