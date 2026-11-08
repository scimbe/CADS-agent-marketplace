"use strict";
// Start (redesign wave 1): one sentence -> intention, for whom, the cards that fit (src/start.js); only on the device,
// and honest when a card is missing. The screen itself: test/e2e/start.e2e.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("../src/start.js");
const D = require("../src/daily.js");
const Wm = require("../src/warm.js");
const DATA = require("../src/start.json");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
const ids = (r) => r.top.map((x) => x.idea.id);

test("Ein Satz -> Absicht, Empfaenger und die passende Karte zuerst", () => {
  const cases = [
    ["Danke an Oma", "gruss", "warm-danke", "Oma"],
    ["Gute Besserung Papa", "gruss", "warm-besserung", "Papa"],
    ["Termin für den Spieleabend", "planen", "zug-termin", null],
    ["Wer kann wann grillen", "planen", "zug-termin", null],
    ["Mitbringliste für den Kindergeburtstag", "planen", "zug-einkauf", null],
    ["Quiz über unsere Familie", "spielen", "zug-kennst", "Familie"],
    ["Kartenspiel mit Opa", "spielen", "tisch-skat", "Opa"],
    ["Stimme wie ein Monster", "stimme", "stimme-verzerren", null],   // one voice card since #181 (stimme-monster leads there)
    ["Thank you to Grandma", "gruss", "warm-danke", "Oma"]
  ];
  for (const [text, intent, first, who] of cases) {
    const r = S.understand(text);
    assert.equal(r.intent, intent, text);
    assert.equal(ids(r)[0], first, text + ": " + ids(r));
    assert.equal(r.top[0].exact, true, text + ": genannt, also passt genau");
    assert.equal(r.who ? r.who.de : null, who, text);
    assert.ok(r.top.every((x) => S.intentOf(x.idea) === intent), text + ": nur Karten dieser Absicht");
  }
});

test("Ehrlich: fehlende Karte wird genannt, nichts passt genau; Unsinn ergibt keine Karte", () => {
  const g = S.understand("Gruß zum Geburtstag für Lea");
  assert.equal(g.intent, "gruss"); assert.equal(g.missing.de, "Eine Geburtstagskarte"); assert.equal(g.name, "Lea");
  assert.ok(g.top.length > 0 && g.top.every((x) => !x.exact), "Aehnliches, aber nie als genau");
  if (!D.byId("spiel-dart")) {   // until the dart card is there (PR #183): named as missing, never pretended
    const d = S.understand("Ein Dartspiel gegen meinen Bruder");
    assert.equal(d.intent, "spielen"); assert.equal(d.missing.de, "Dart"); assert.ok(d.top.every((x) => !x.exact));
  }
  for (const nonsense of ["xyz qwert", "leider keine Zeit", ""]) {
    const r = S.understand(nonsense);
    assert.equal(r.intent, "", nonsense); assert.deepEqual(r.top, [], nonsense);
  }
  assert.ok(!ids(S.understand("Superkraft")).includes("warm-super"), "super$ nur als ganzes Wort");
});

test("Stimmt nicht? Aendern: eine erzwungene Absicht zeigt nur deren Karten, die kuratierten zuerst", () => {
  const r = S.understand("Danke an Oma", { intent: "planen" });
  assert.equal(r.intent, "planen");
  assert.ok(r.top.length >= 3 && r.top.every((x) => S.intentOf(x.idea) === "planen"));
  assert.deepEqual(ids(S.understand("", { intent: "stimme" })), S.cardsOf("stimme").slice(0, 4).map((i) => i.id));
  for (const n of ["gruss", "planen", "spielen"]) assert.ok(S.cardsOf(n).length >= 3, n + ": genug Karten fuer die Kachel");
  assert.ok(S.cardsOf("stimme").map((i) => i.id).includes("stimme-verzerren"), "Stimme: die (seit #181 eine) Stimmkarte");
  for (const n of S.INTENTS) { const l = S.cardsOf(n).map((i) => i.id); assert.equal(new Set(l).size, l.length, n + ": keine Karte doppelt"); }
});

test("Name auf der Karte: nur ein Vorname oder eine Anrede (Oma, Papa), nie Bruder oder Kollegen", () => {
  assert.equal(S.callName(S.understand("Danke an Oma"), "de"), "Oma");
  assert.equal(S.callName(S.understand("Danke an Lea"), "de"), "Lea");
  assert.equal(S.callName(S.understand("Danke an meinen Bruder"), "de"), "");
  assert.equal(S.callName(S.understand("Gruß an die Kollegen"), "de"), "");
  assert.equal(S.understand("Gruß für Geburtstag").name, "", "ein bekanntes Wort ist kein Name");
  assert.equal(Wm.named("Danke, dass es dich gibt.", S.callName(S.understand("Danke an Oma"), "de")), "Oma, danke, dass es dich gibt.");
});

test("Jede Karte in start.json gibt es (oder sie kommt mit einem offenen PR); Texte in beiden Sprachen", () => {
  const later = ["spiel-dart", "stimme-verzerren"];   // PR #183, PR #181
  const all = new Set(Object.values(DATA.intents).flatMap((i) => i.ids).concat(Object.values(DATA.cards).flat()));
  for (const id of all) assert.ok(D.byId(id) || later.includes(id), id);
  assert.deepEqual(Object.keys(DATA.texts.de).sort(), Object.keys(DATA.texts.en).sort());
  for (const l of ["de", "en"]) for (const [k, v] of Object.entries(DATA.texts[l])) assert.ok(v && v.length < 200, l + " " + k);
  // plain German on the start page: no Arcade, Webconference, Tunnel, Demo, Agent, Meme
  for (const k of ["st_ask", "st_hint", "st_gruss", "st_gruss_s", "st_planen", "st_planen_s", "st_spielen", "st_spielen_s", "st_stimme", "st_stimme_s", "st_all"]) assert.doesNotMatch(DATA.texts.de[k], /arcade|webconf|tunnel|demo|agent|meme|share/i, k);
});

test("Nur auf dem Geraet: kein fetch, keine KI; Mikrofon nur mit Erkennung auf dem Geraet und erst nach dem Tipp", () => {
  for (const f of ["start.js", "start-ui.js"]) assert.doesNotMatch(src(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|\.Ai\.|Math\.random/, f);
  const ui = src("start-ui.js");
  assert.match(ui, /SR\.available\(\{ langs: \[Kit\.loc\(\)\], processLocally: true \}\)/);
  assert.match(ui, /return ask\.then\(function \(s\) \{ Kit\.store\.mic = s === "available" \? "ok" : "no";/, "das Ergebnis bleibt auf dem Geraet gemerkt");
  assert.match(ui, /if \(ok\) try \{ r = new SR\(\); r\.lang = Kit\.loc\(\); r\.processLocally = true;/);
  assert.match(ui, /function micCheck\(b\) \{ b\.hidden = !\(micOk\(\) && Kit\.store\.mic === "ok"\); \}/, "Mikrofon nur, wenn es hier bekannt geht");
  assert.match(ui, /if \(!r \|\| r\.processLocally !== true\) return off\(b\);/, "ohne Zusage des Geraets wird nicht zugehoert");
  assert.match(ui, /!root\.DuellHost && location\.hostname !== "appassets\.androidplatform\.net"/, "die App-Huellen behalten das Diktat der Tastatur");
});

test("Kern: nur die Haken; ohne Teil bleibt die Startseite wie sie war", () => {
  const app = src("app.js");
  assert.match(app, /if \(window\.StartUI\) window\.StartUI\.home\(h\);/);
  assert.match(app, /if \(window\.StartUI\) window\.StartUI\.labels\(\);/);
  // asked for right after the catalog, the first sheet does not wait for it; its place is kept (#startslot), so nothing moves
  assert.match(app, /window\.Parts\.need\("katalog"\)\.then\(function \(\) \{ var s = got \|\| startPart\(\),/);
  assert.match(app, /var got = \/\^#\(\?:\.\*&\)\?\[cis\]=\/\.test\(location\.hash\) && startPart\(\);/, "ein Link wartet auf den Teil, der Tagesstart nicht");
  assert.match(app, /else \$\("home"\)\.classList\.toggle\("neu", !!\(window\.DailyParts \|\| \{\}\)\.start && !h\.note && !h\.doc\);/);
  assert.match(src("index.template.html"), /<div id="startslot" aria-hidden="true"><\/div>/);
  assert.match(src("style.css"), /#home\.neu #startslot\{display:block;min-height:30rem;background:#FBF5DD\}/);
  assert.match(src("style.css"), /#home\.neu:has\(\.pv\.pic,#warmto:not\(\[hidden\]\)\) #pad\{height:clamp\(15rem,58svh,34rem\)\}/, "Tage mit Bild oder Namensfeld behalten ein grosses Blatt");
  assert.match(src("start-ui.js"), /@media \(max-width:899px\) and \(min-height:701px\) and \(max-height:819px\)\{\.sttile\{min-height:72px\}\.sttile small\{display:none\}\}/, "unter 820 px Hoehe flachere Kacheln statt eines gestauchten Blatts");
  assert.match(src("start-ui.js"), /var slot = \$\("startslot"\); if \(slot\) slot\.replaceWith\(box\);/);
  assert.match(src("../scripts/build.js"), /if \(!flavor\) PARTS\.start = \{ d: \[\], src: \["STARTDATA", "START", "STARTUI"\] \};/, "Daily Business ohne den Teil");
});

test("Review #185: Wochenende ist planen, Enkelin bleibt Enkelin, Komposita, Namen klein geschrieben, Sport zuerst Duelle, ehrliche Texte", () => {
  assert.equal(S.understand("Ein schönes Wochenende planen").intent, "planen");
  assert.equal(S.understand("Gruß an meine Enkelin").who.de, "Enkelin");
  assert.equal(S.understand("Gruß an meinen Enkel").who.de, "Enkel");
  assert.equal(ids(S.understand("Kindergeburtstag Mitbringliste"))[0], "zug-einkauf", "Teilwort ab 5 Zeichen");
  assert.equal(S.understand("Mitbringliste Kindergeburtstag").missing, null, "kein Geburtstag-fehlt im Kompositum");
  assert.equal(S.understand("danke an lea").name, "", "klein geschrieben: im Zweifel kein Name");
  assert.equal(S.understand("Termin für den Spieleabend").name, "", "ein Artikel ist kein Name");
  const bowl = S.understand("Bowling mit Kollegen");
  assert.equal(bowl.missing.de, "Bowling"); assert.deepEqual(ids(bowl).slice(0, 2), ["arcade-puck", "arcade-elfer"], "Sport: zuerst die Duelle");
  assert.match(DATA.texts.de.st_missing, /Stattdessen:$/); assert.match(DATA.texts.de.st_none, /tippe auf „Ändern“/);
  assert.equal(DATA.texts.de.st_local, "Dein Satz bleibt auf dem Gerät. Erst bei „Fertig“ legen wir einen kurzen Link zu deiner Karte an.");
  assert.equal(DATA.texts.de.st_free, "Frei für dich");
  const ui = src("start-ui.js");
  const oc = ui.slice(ui.indexOf("function openCard("), ui.indexOf("function lineOf("));
  assert.match(oc, /if \(!W\.is\(idea\)\) return \$\("go"\)\.click\(\);/, "nur eine andere Karte als die Wohlfuehlkarte oeffnet ihren Editor per Klick");
  assert.equal((oc.match(/\.click\(\)/g) || []).length, 1, "Karte machen fertigt nichts und legt keinen Link an");
  assert.match(oc, /g\.focus\(\{ preventScroll: true \}\);\s*requestAnimationFrame\(function \(\) \{ first\(\); requestAnimationFrame\(function \(\) \{ g\.scrollIntoView\(\{ block: "nearest" \}\); \}\); \}\);/, "Fertig machen kommt ins Bild, erst nach dem Layout (first)");
  assert.match(ui, /tt\.tabIndex = -1; tt\.focus\(\);/, "Fokus geht mit ins Blatt");
  assert.match(src("app.js"), /got \? Promise\.race\(\[s, new Promise\(function \(ok\) \{ setTimeout\(ok, 2500\); \}\)\]\) : 0/, "Link-Seiten warten hoechstens 2,5 s");
});

test("Review #185 Runde 2: Namen nur grossgeschrieben und nie ein Pronomen, Name nach der Beziehung; Kompositum nach seinem Kopf", () => {
  for (const t of ["Danke an dich", "Gruß an alles", "Grüße an Euch", "Danke an Gestern", "Gruß an Alle", "Danke an Mich", "Gruß an Heute", "Thanks to You"]) assert.equal(S.understand(t).name, "", t);
  assert.equal(S.callName(S.understand("Danke an dich"), "de"), "", "kein „Dich, danke …“");
  assert.equal(S.understand("Gruß an meine Enkelin Lena").name, "Lena"); assert.equal(S.understand("Enkelin Lena").name, "Lena");
  assert.equal(S.understand("Danke an Lea").name, "Lea");
  assert.equal(S.understand("Danke an Mama").name, "", "Mama nur als Anrede"); assert.equal(S.callName(S.understand("Danke an Mama"), "de"), "Mama");
  const daniel = S.understand("Kindergeburtstag Samstag wer bringt was mit");
  assert.equal(daniel.intent, "planen"); assert.equal(ids(daniel)[0], "zug-einkauf"); assert.equal(daniel.missing, null);
  assert.equal(ids(S.understand("Adventsrätsel"))[0], "zug-advent");
  assert.equal(S.understand("Termin für den Spieleabend").intent, "planen");
  assert.equal(DATA.texts.de.st_hint.length <= 14, true, "Platzhalter passt bei 200 %");
});

test("Teilen mit 1 Tipp: Kurzlink bei Fertig, der Tipp wartet nie auf den Server (sonst langer Link), Statistik erst beim echten Teilen, nie ein Foto im Vorschaubild", () => {
  const app = src("app.js");
  assert.match(app, /var r = result; shortLink\(r\)\.then\(function \(\) \{ if \(result === r && screen === "done" && window\.StartUI\) window\.StartUI\.labels\(\); \}/, "bei Fertig angelegt");
  const click = app.slice(app.indexOf('$("share").addEventListener("click"'), app.indexOf('$("playit").addEventListener'));
  assert.doesNotMatch(click, /await|shortLink\(|disabled|sh_ready/, "der Tipp teilt sofort, ohne zweiten Schritt");
  assert.match(click, /var r = result, link = r\.link \|\| \{ url: r\.url, short: false \};/, "ohne Kurzlink der lange");
  assert.match(click, /counted\(r\);/);
  assert.match(app, /function counted\(r\) \{ if \(r\.counted\) return; r\.counted = true;/, "einmal je Ergebnis");
  assert.doesNotMatch(app.slice(app.indexOf("function shortLink(r)"), app.indexOf("function chatPicture")), /S\.share\(/, "Anlegen zaehlt nicht als Teilen");
  assert.match(app, /if \(link\.short && r\.kind !== "photo" && r\.canvas && !\(r\.keep && r\.keep\.photo\)\)/, "ein eigenes Foto bleibt auf dem Geraet");
  assert.match(src("warm.js"), /A\.quick\(doc, h\.idea\)\.then\(function \(\) \{ var s = document\.getElementById\("share"\); if \(s\) s\.focus\(\); \}\);/, "kein Klick ohne Nutzer-Tipp");
  const T = require("../src/texts.json");
  assert.doesNotMatch(T.de.sh_note, /Teilen legt/); assert.match(T.de.sh_note, /bis zu 90 Tage/);
  for (const l of ["de", "en"]) for (const k of ["st_shortOk", "st_shortDay", "st_shortWait", "st_shortNo", "st_shortLong"]) assert.ok(DATA.texts[l][k], l + k);
  assert.match(DATA.texts.de.st_shortDay, /Fertig.*24 Stunden.*90 Tage/); assert.match(DATA.texts.de.st_shortOk, /Fertig/);
});
