"use strict";
// Word filter, P-D: a card carries no contact data (phone, mail, account names, web addresses, "schreib mir auf ...")
// and no common insult as an order or about someone else. What only looks like it stays: years, times, scores,
// dates, counts, names in every script, "@" between words. Contact data gets a kind note of its own ("contact").
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
require("../src/kontakt.js");   // in the page it follows core.js in the youth app's core (scripts/build.js)
globalThis.DuellCore = C;
const D = require("../src/daily.js");

const CONTACT = [
  "Ruf mich an: 0176 12345678",
  "0176/1234567",
  "0176-123 45 67",
  "(040) 123456",
  "+49 176 1234567",
  "+491761234567",
  "Meine Nummer ist 017612345678",
  "01 76 12 34 56",
  "123456",
  "Code 98765432",
  "schreib mir lisa.m@gmx.de",
  "LISA.M@GMX.DE",
  "lisa (at) gmx.de",
  "lisa at gmx dot de",
  "insta: @lisa_2011",
  "folgt @lisa.mueller",
  "@Ленa_99",
  "www.example.com",
  "https://example.org/x",
  "schau auf meineseite.de",
  "bit.ly/abc",
  "t.me/lisa",
  "Schreib mir auf Insta",
  "add me on snapchat",
  "Hast du WhatsApp?",
  "bin auf Discord",
  "meld dich per Telegram",
  "TikTok: lisa",
  "schreib mir auf Snap",
  "meine Handynummer kriegst du",
  "Handy-Nr. folgt",
  "my phone number is secret",
  "dm me",
  "adde mich",
  "folg mir auf Insta"
];
const MEAN = [
  "verpiss dich",
  "Verpiss dich, du Opfer",
  "Halt die Fresse",
  "halt doch die Klappe",
  "halt's Maul",
  "Fresse halten!",
  "leck mich",
  "stirb",
  "häng dich auf",
  "Du Opfer",
  "du Spacko",
  "du kleiner Versager",
  "du Vollidiot",
  "Lisa ist fett",
  "Lisa aus der 7b ist fett",
  "Tim ist so hässlich",
  "Mia ist voll eklig",
  "Ben ist ein Loser",
  "Мария ist dumm",
  "piss off",
  "go die",
  "drop dead",
  "screw you",
  "you idiot",
  "Tom is so ugly",
  "kys"
];
const FREE = [
  "Kaffee @ 15 Uhr",
  "Treffen um 17:30",
  "17.30 Uhr",
  "Es steht 12:7",
  "3:2 für uns!",
  "Endstand 21:19",
  "1989",
  "Seit 2025",
  "2025-2026",
  "Schuljahr 2026/2027",
  "1990 bis 2010",
  "08.11.2026",
  "8.11.26",
  "2026-11-08",
  "2026-11",
  "1.000.000 Dank!",
  "1 000 000 Küsse",
  "250000 Punkte",
  "123456 Schritte heute",
  "100000 Euro",
  "1 2 3 4 5 6 7 8 9 10",
  "Platz 12345",
  "PLZ 20095 Hamburg",
  "Lea, ich wollte dir nur mal sagen: Du bist toll.",
  "Lea",
  "Zoë",
  "Jean-Luc",
  "O'Brien",
  "Мария",
  "李雷",
  "محمد",
  "Ngũgĩ",
  "Şükrü",
  "Ich fresse Pizza",
  "Das ist so dumm gelaufen",
  "Das Leben ist schön",
  "Es ist so peinlich, ich hab's vergessen",
  "Sei ein Held!",
  "Hallo.Me too",
  "Gute Reise nach Graz",
  "Danke für alles, z.B. die Hilfe",
  "Look at you!",
  "Ruf mich an, wenn du Zeit hast",
  "Text me when you're home",
  "Follow me, I know the way",
  "Bring Snacks mit",
  "Oh snap!",
  "Signal grün",
  "Lisa ist toll",
  "Tom is so cool",
  "Du bist mein Held",
  "Shut up and dance",
  "Wir sehen uns am 24.12.",
  "Farbe #306230"
];

test("Kontaktdaten: Telefon ab 6 Ziffern auch mit Trennern, Mail, @-Handles, Links, Messenger-Hinweise werden blockiert, mit Grund contact", () => {
  for (const s of CONTACT) {
    assert.equal(C.isClean(s), false, "blockiert: " + s);
    assert.equal(C.whyNot(s), "contact", "Grund contact: " + s);
  }
});

test("Beleidigungen in Befehlsform und 3. Person (de/en) werden blockiert, mit Grund word", () => {
  for (const s of MEAN) {
    assert.equal(C.isClean(s), false, "blockiert: " + s);
    assert.equal(C.whyNot(s), "word", "Grund word: " + s);
  }
});

test("Fehlalarme: Jahreszahlen, Uhrzeiten, Punktestaende, Datum, Zaehlungen, Namen aller Schriften, @ ohne Handle bleiben", () => {
  for (const s of FREE) {
    assert.equal(C.isClean(s), true, "bleibt: " + s);
    assert.equal(C.whyNot(s), "", "kein Grund: " + s);
  }
});

test("Mindestumfang: >= 40 blockierte und >= 40 freie Faelle", () => {
  assert.ok(CONTACT.length + MEAN.length >= 40, String(CONTACT.length + MEAN.length));
  assert.ok(FREE.length >= 40, String(FREE.length));
});

test("Bisher Blockiertes bleibt blockiert (Schimpfwort, Leet, HURT)", () => {
  for (const s of ["Du Arschloch", "f u c k you", "du bist so dumm", "Ich bring dich um", "Hurensohn", "Lisa ist eine Schlampe", "du Missgeburt"]) assert.equal(C.isClean(s), false, s);
});

test("Wirkung: Editor-Text und empfangener Link verlieren Kontaktdaten (cleanInput, sanitizeDoc), Name ebenso", () => {
  assert.equal(D.cleanInput("Ruf mich an: 0176 12345678", 90), "");
  assert.equal(D.cleanInput("Treffen um 17:30, es steht 12:7", 90), "Treffen um 17:30, es steht 12:7");
  const d = D.sanitizeDoc({ k: "card", x: "schreib mir lisa.m@gmx.de", col: ["#ffd400", "#ff3b1d"], by: [], st: "druck", sk: [] });
  assert.ok(!d || !d.x || !/gmx/.test(d.x), "kein Kontakt im empfangenen Text: " + JSON.stringify(d && d.x));
  assert.equal(C.sanitizeName("0176 12345678"), "");
  assert.equal(C.sanitizeName("Lea"), "Lea");
  assert.equal(C.sanitizeTitle("www.x.de", "Duell"), "Duell");
});

test("Katalog: kein Text aus ideas.json und quiz-packs.json wird durch den Filter neu gesperrt", () => {
  const bad = [], seen = new Set();
  const walk = (v) => {
    if (typeof v === "string") { if (!seen.has(v) && v.length > 1) { seen.add(v); if (!C.isClean(v) && C.whyNot(v) === "contact") bad.push(v); } }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(require("../src/ideas.json")); walk(require("../src/quiz-packs.json"));
  assert.ok(seen.size > 1000, "Katalog gelesen: " + seen.size);
  assert.deepEqual(bad, []);
});

test("Hinweis fuer Kontaktdaten: freundlich, in de und en, ohne Vorwurf", () => {
  const T = require("../src/texts.json");
  for (const l of ["de", "en"]) {
    assert.ok(T[l].filter_contact, l);
    assert.doesNotMatch(T[l].filter_contact, /verboten|verstoß|strafe|gesperrt|forbidden|violation|banned|warn/i, l);
  }
});
