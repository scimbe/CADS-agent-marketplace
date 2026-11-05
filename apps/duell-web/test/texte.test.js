"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Tx = require("../src/texte.js");
const A = require("../src/ai.js");
const D = require("../src/daily.js");
const data = require("../src/texte.json");

test("Fertige Texte: jeder Anlass von Worte finden und Kartentext in beiden Sprachen, je 3 Varianten, Worte je Ton eine, alle ungekuerzt und sauber", () => {
  for (const lang of ["de", "en"]) {
    for (const art of ["worte", "spruch"]) {
      assert.deepEqual(Object.keys(data.vor[lang][art]).sort(), Tx.ANLASS[art].slice().sort(), lang + "/" + art);
      for (const a of Tx.ANLASS[art]) {
        const v = Tx.vor(lang, art, a);
        assert.equal(v.length, 3, [lang, art, a].join("/"));
        assert.deepEqual(v, data.vor[lang][art][a], "nichts faellt durch die eigene Pruefung: " + a);
        if (art === "worte") assert.deepEqual(v.map((x) => x.ton).sort(), ["kurz", "locker", "warm"], a);
        assert.equal(new Set(v.map((x) => x.x)).size, 3, "drei verschiedene: " + a);
        for (const x of v) {
          assert.ok([...x.x].length <= Tx.MAX[art], x.x);
          assert.doesNotMatch(x.x, /…$|\{|\[|https?:|@/, x.x);
          assert.equal(A.crisis(x.x), false, x.x);
        }
      }
    }
  }
  assert.deepEqual(Tx.vor("de", "worte", "gibtsnicht"), []);
});

test("Antwort pruefen: Laenge, Ton, kein Platzhalter ausser {name}; Song braucht Titel und 2 Zeilen, Beat faellt auf sichere Werte", () => {
  assert.deepEqual(Tx.check("worte", { ton: "warm", x: "Ich bin für dich da." }), { ton: "warm", x: "Ich bin für dich da." });
  assert.equal(Tx.check("worte", { ton: "laut", x: "Hallo" }), null);
  assert.equal(Tx.check("worte", { ton: "warm", x: "x".repeat(81) }), null, "über 80 Zeichen");
  assert.equal(Tx.check("worte", { ton: "warm", x: "Hallo [Name], schön" }), null);
  assert.deepEqual(Tx.check("worte", { ton: "kurz", x: "{name}, du schaffst das!" }), { ton: "kurz", x: "{name}, du schaffst das!" });
  assert.deepEqual(Tx.check("spruch", { t: "Urkunde", x: "Für den besten Kuchen der Welt." }), { t: "Urkunde", x: "Für den besten Kuchen der Welt." });
  assert.equal(Tx.check("spruch", { x: "" }), null);
  const s = Tx.check("song", { titel: "Pizza Party", hook: ["Heute gibt es Pizza", "alle singen mit", "x".repeat(50)], beat: { bpm: 300, k: "x---x---x---x---", s: "bad", h: "x-x-x-x-x-x-x-x-", b: "x--x--x---x--x--", fx: "laser" } });
  assert.deepEqual(s, { titel: "Pizza Party", hook: ["Heute gibt es Pizza", "alle singen mit"], beat: { bpm: 110, k: "x---x---x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "x--x--x---x--x--", fx: "chip" } });
  assert.equal(Tx.check("song", { titel: "A", hook: ["nur eine Zeile"] }), null);
  assert.equal(Tx.check("anders", { x: "a" }), null);
});

test("Anfrage: Anlass aus der Liste, getippter Name wird {name} und bleibt auf dem Geraet, Insider durch den Wortfilter", () => {
  assert.deepEqual(Tx.request("worte", "mut", "Lea hat morgen die Prüfung", "Lea"), { art: "worte", anlass: "mut", insider: "{name} hat morgen die Prüfung", name: true });
  assert.ok(!JSON.stringify(Tx.request("spruch", "lob", "lea backt mit Leander", "Lea")).includes("\"Lea"), "der Name geht nie raus");
  assert.equal(Tx.request("spruch", "lob", "lea backt mit Leander", "Lea").insider, "{name} backt mit Leander", "nur das ganze Wort");
  assert.deepEqual(Tx.request("song", "party", "", ""), { art: "song", anlass: "party" });
  assert.equal(Tx.request("song", "trost", "", ""), null, "trost ist kein Song-Anlass");
  assert.equal(Tx.request("worte", "", "", ""), null);
  assert.equal(Tx.request("worte", "mut", "", "@lea123"), null, "kein Handle als Name");
  assert.equal(Tx.request("worte", "mut", "du hure", ""), null, "Wortfilter");
});

test("Name lokal einsetzen: {name} wird der Name; ohne Namen faellt der Platzhalter samt Komma weg; ein fertiger Text bekommt den Namen vorn", () => {
  assert.equal(Tx.fill("{name}, du schaffst das!", "Lea", 80), "Lea, du schaffst das!");
  assert.equal(Tx.fill("Heute feiern wir {name}!", "Lea", 80), "Heute feiern wir Lea!");
  assert.equal(Tx.fill("{name}, du schaffst das!", "", 80), "Du schaffst das!");
  assert.equal(Tx.fill("Danke, {name}!", "", 80), "Danke!");
  assert.equal(Tx.fill("Du schaffst das.", "Lea", 80), "Du schaffst das.", "eine KI-Zeile ohne {name} bleibt, wie sie ist");
  assert.equal(Tx.named("Du schaffst das.", "Lea"), "Lea, du schaffst das.");
  assert.equal(Tx.named("Du schaffst das.", ""), "Du schaffst das.");
  assert.equal(Tx.named("Kopf hoch! Du packst das.", "Lea"), "Lea, Kopf hoch! Du packst das.", "ein Nomen bleibt gross");
  assert.equal(Tx.named("Gute Besserung!", "Lea"), "Lea, gute Besserung!");
  assert.equal(Tx.named("You rock.", "Sam"), "Sam, you rock."); assert.equal(Tx.named("I miss you.", "Sam"), "Sam, I miss you.");
  // every German ready-made text starts with a word that is either listed as a noun or right in small letters after "Lea, "
  const first = new Set();
  for (const art of ["worte", "spruch"]) for (const a of Tx.ANLASS[art]) for (const v of data.vor.de[art][a]) first.add(v.x.split(/[^\p{L}]/u)[0]);
  const LOWER_OK = ["Alles", "Atme", "Boah", "Danke", "Dein", "Deine", "Du", "Ein", "Frohe", "Fühl", "Gib", "Gute", "Herzlich", "Herzlichen", "Hey", "Hurra", "Jeder", "Keine", "Mach", "Sei", "Sorry", "Stark", "Starte", "Toll", "Trau", "Tschüss", "Tut", "Vermiss", "Was", "Wow", "Zum"];
  for (const w of first) assert.ok(LOWER_OK.includes(w) !== Tx.NOUN.test(w), "erstes Wort pruefen (klein nach dem Namen oder Nomen?): " + w);
});

test("Song uebernehmen: Titel, Beat und Hook auf dem Sound-Blatt; der Link traegt den Hook; Zeile je Takt; Video-Laenge aus dem Tempo", () => {
  const me = D.sanitizeProfile({ nick: "Ana" }), base = D.blankDoc("sound", me, "de");
  const o = Tx.check("song", { titel: "{name} rockt", hook: ["Hey {name}, heute ist dein Tag", "alle tanzen mit", "Kuchen auf dem Tisch"], beat: { bpm: 120, k: "x---x---x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "x--x--x---x--x--", fx: "robot" } });
  const d = Tx.song(base, o, "Lea");
  assert.equal(d.x, "Lea rockt"); assert.equal(d.bpm, 120); assert.equal(d.fx, "robot"); assert.equal(d.m, "beat");
  assert.deepEqual(d.p, { k: "x---x---x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "x--x--x---x--x--" });
  assert.deepEqual(d.ly, ["Hey Lea, heute ist dein Tag", "alle tanzen mit", "Kuchen auf dem Tisch"]);
  assert.deepEqual(D.sanitizeDoc(d).ly, d.ly, "sanitizeDoc behaelt den Hook");
  assert.equal(D.sanitizeDoc(Object.assign({}, d, { ly: [5, "", "ok", { x: 1 }] })).ly.length, 1, "nur saubere Zeilen");
  assert.equal(D.sanitizeDoc(Object.assign({}, d, { ly: [] })).ly, undefined);
  assert.deepEqual(D.changedAreas(base, d).sort(), ["beat", "stimme", "text"]);
  assert.deepEqual([0, 1, 2, 3, 4].map((b) => Tx.lineAt(d.ly, b)), [0, 1, 2, 0, 1]); assert.equal(Tx.lineAt(d.ly, -1), -1); assert.equal(Tx.lineAt(undefined, 0), -1);
  assert.equal(Tx.videoBars(d.ly), 6); assert.equal(Tx.videoSeconds(d), 12);
  assert.equal(A.reportBody(d, "wrong", "").content.ly, "Hey Lea, heute ist dein Tag / alle tanzen mit / Kuchen auf dem Tisch", "eine Meldung zeigt den Hook");
});

test("Video nur, wo der Browser es aufnimmt: erster unterstuetzter Typ, sonst nichts", () => {
  assert.equal(Tx.videoType(undefined), "");
  assert.equal(Tx.videoType({}), "");
  assert.equal(Tx.videoType({ isTypeSupported: (x) => x === "video/webm" }), "video/webm");
  assert.equal(Tx.videoType({ isTypeSupported: (x) => /mp4/.test(x) }), "video/mp4");
  assert.equal(Tx.videoType({ isTypeSupported: () => false }), "");
});

test("Krise bleibt auf dem Geraet: dieselben Woerter wie der Server, Redewendungen und Basteln nicht", () => {
  for (const s of ["Ich will nicht mehr leben", "ich ritze mich", "Selbstmord", "s3lbstm0rd", "Ich will sterben", "i want to die", "kill myself", "ich tu mir was an", "Lebensmüde"]) assert.equal(A.crisis(s), true, s);
  for (const s of ["Ich lach mich tot", "Kürbis ritzen", "Trost für Oma", "das ist geritzt", "in die Ritze", "Totenkopf-Party an Halloween"]) assert.equal(A.crisis(s), false, s);
  assert.equal(A.crisis(A.texts({ art: "worte", insider: "will nicht mehr leben" })), true);
  assert.deepEqual(A.CRISIS_KINDS, ["plan", "liste", "quiz", "welt", "text"]);
});

test("Server-Antwort 422 mit why: der Grund kommt bei der Seite an (crisis zeigt Hilfe, kind_ok sagt es freundlich)", async () => {
  const answers = [{ status: 422, json: { error: "blocked", why: "crisis", help: "x" } }, { status: 422, json: { error: "blocked", why: "kind_ok" } }, { status: 422, json: { error: "blocked" } }];
  const c = A.client({ send: async () => answers.shift(), sleep: async () => {} });
  assert.equal((await c.ask({})).why, "crisis");
  assert.equal((await c.ask({})).why, "kind_ok");
  const r = await c.ask({}); assert.equal(r.how, "blocked"); assert.equal(r.why, "");
});
