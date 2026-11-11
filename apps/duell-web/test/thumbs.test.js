"use strict";
// KI-Bilder der Tageskarten: das Verzeichnis (src/thumbs.json, src/flavors/business/thumbs.json) nennt je Karte Prompt und
// Seed. Nur Karten, die keine Spiele sind, bekommen ein Bild; die Bilder selbst liegen auf dem Galerie-Server.
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const rd = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const main = require("../src/thumbs.json"), biz = require("../src/flavors/business/thumbs.json");
const ideas = require("../src/ideas.json"), bizIdeas = require("../src/flavors/business/ideas.json");
const NO_GAME = ["card", "photo", "sound", "quest"];
// The business catalogue holds only turn cards; these are its working tools (poll, date, tasks ...), none is a game.
const TOOLS = ["termin", "umfrage", "feedback", "aufgaben", "agenda", "sammeln", "einkauf"];

test("KI-Bilder: jede Karte im Verzeichnis gibt es und sie ist kein Spiel", () => {
  // the shelf and the cards taken off it (retired, 2026-11), which links still open; struck cards lost their pictures
  const all = new Map(ideas.ideas.concat(ideas.gated, ideas.retired).map((i) => [i.id, i]));
  for (const id of Object.keys(main.items)) {
    assert.ok(all.has(id), "unbekannte Karte " + id);
    assert.ok(NO_GAME.includes(all.get(id).kind), id + " ist " + all.get(id).kind + ", Spiele behalten ihre Vorschau");
  }
  const b = new Map(bizIdeas.ideas.concat(bizIdeas.retired).map((i) => [i.id, i]));
  for (const id of Object.keys(biz.items)) {
    assert.ok(b.has(id), "unbekannte Business-Karte " + id);
    assert.ok(TOOLS.includes(b.get(id).turn.g), id + " ist kein Arbeitswerkzeug");
  }
  // Shelf clean-up (2026-11): the pictures of the cards that left went with them (35 -> 2 daily, 12 -> 4 business); the
  // rule above ("every listed card exists") is what keeps a picture from outliving its card.
  assert.ok(Object.keys(main.items).length >= 2 && Object.keys(biz.items).length >= 4);
});

test("KI-Bilder: Ids passen in den Pfad des Servers, Prompts ohne Personen-, Marken- oder Text-Wunsch, Modell mit Lizenz", () => {
  const seen = new Set();
  for (const m of [main, biz]) {
    assert.match(m.model, /FLUX\.1-schnell.*Apache-2\.0/);
    assert.match(m.style, /no text, no letters, no numbers, no logos/);
    for (const [id, x] of Object.entries(m.items)) {
      assert.match(id, /^[a-z0-9-]{1,40}$/);
      assert.ok(!seen.has(id), "doppelt: " + id); seen.add(id);
      assert.ok(Number.isInteger(x.seed) && x.seed >= 0, id);
      assert.ok(typeof x.prompt === "string" && x.prompt.length > 20 && x.prompt.length < 400, id);
      assert.ok(!/\b(logo|brand|celebrity|famous|weapon|gun|blood|sexy|nude|text|words?|letters?|diagonal)\b/i.test(x.prompt), id + ": " + x.prompt);
    }
  }
});

test("KI-Bilder: im Build nur die Ids, Bilder nur vom Galerie-Server, Hinweis 'KI-Bild' und Satz im Info-Text", () => {
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js")]);
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js"), "--flavor", "business"]);
  const ids = (f) => JSON.parse(rd(f).match(/window\.DailyThumbs=(\[[^\]]*\]);/)[1]);
  assert.deepEqual(ids("dist/index.html"), Object.keys(main.items));
  assert.deepEqual(ids("dist/business/index.html"), Object.keys(biz.items), "Business hat seinen eigenen Satz");
  const html = rd("dist/index.html");
  assert.ok(!/data:image\/jpeg|\/duell\/img\/[a-z]/.test(html), "kein Bild und keine feste Bild-Adresse im HTML");
  assert.match(html, /img-src data: blob: https:\/\/demos-34a13a96\.bunsenbrenner\.org;/);
  const app = rd("src/app.js");
  assert.match(app, /function thumbUrl\(id\) \{ return new URL\(C\.DEFAULT_API\)\.origin \+ "\/duell\/img\/" \+ id \+ "\.jpg"; \}/);
  // picUrl: the day's picture (thumbUrl) or one made on request (doc.gi, /duell/bild/<id>, same server). Definition, two in
  // loadPic (Blatt, Folgeblatt, Editor), one in withPic (nur Vergleich: schon geladenes Bild fuers Teilen)
  assert.equal((app.match(/thumbUrl\(/g) || []).length, 2, "thumbUrl nur ueber picUrl");
  assert.equal((app.match(/picUrl\(/g) || []).length, 4, "ein Weg zum Bild");
  assert.equal((app.match(/\.src = (thumbUrl|picUrl)\(/g) || []).length, 1, "nur eine Stelle laedt ein Bild");
  assert.match(app, /c\.saveData/);
  assert.match(app, /crossOrigin = "anonymous"/);
  const tx = require("../src/texts.json");
  assert.equal(tx.de.aiPic, "KI-Bild"); assert.equal(tx.en.aiPic, "AI image");
  assert.match(tx.de.aiPicNote, /KI-generiert/); assert.match(tx.en.aiPicNote, /AI-generated/);
});
