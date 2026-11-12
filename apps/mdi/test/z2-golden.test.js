// Alt-Orakel Strang Z2: jede portierte Spielregel muss fuer dieselben Seeds und Antworten dieselben Optionen (de/en),
// Fragen und Ergebnisse liefern wie der Altcode (Fixture aus test/tools/z2-golden.mjs, Tag pre-legacy-removal).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures/z2-golden.json"), "utf8"));
// GAMES-Schluessel -> Spielmodul (Datei, Export)
export const MOD = {
  lob: ["zug-lob/game.js"], kennst: ["zug-kennst/game.js"], luege: ["zug-luege/game.js"], snack: ["zug-snack/game.js"],
  auftrag: ["zug-auftrag/game.js"], ausrede: ["karte-ausrede/game.js"], wort: ["zug-wort/game.js"],
  auktion: ["zug-auktion/game.js", "auktion"], deal: ["zug-auktion/game.js", "deal"], teilen: ["zug-auktion/game.js", "teilen"],
  socke: ["zug-auktion/game.js", "socke"], fallpreis: ["zug-auktion/game.js", "fallpreis"], schmuggel: ["zug-schmuggel/game.js"],
  wette: ["zug-wette/game.js"], luecke: ["zug-luecke/game.js"], blitz: ["zug-blitz/game.js"], recht: ["zug-recht/game.js"],
  kreis: ["zug-kreis/game.js", "kreis"], tuer: ["zug-kreis/game.js", "tuer"], hoeflich: ["zug-hoeflich/game.js"], woerter: ["zug-woerter/game.js"],
  regel: ["karte-regel/game.js"], rap: ["zug-rap/game.js"], steine: ["zug-steine/game.js"], socken: ["zug-socken/game.js"],
  pokal: ["zug-pokal/game.js", "pokal"], uhr: ["zug-pokal/game.js", "uhr"], reaktion: ["zug-reaktion/game.js"], streichen: ["raum-streichen/game.js"],
  erklaeren: ["raum-erklaeren/game.js"], damals: ["raum-damals/game.js"], maschine: ["raum-maschine/game.js"], werbung: ["mut-werbung/game.js"],
  suche: ["raum-suche/game.js"], disco: ["beat-disco/game.js"], tier: ["mut-tierstory/game.js"], maus: ["raum-maus/game.js"], papagei: ["raum-papagei/game.js"]
};
async function load(g) { const [f, k = "default"] = MOD[g]; return (await import("../src/cards/" + f))[k]; }

test("Fixture stammt aus dem Altbaum", () => { assert.match(G.herkunft, /^Altbaum duell-web @ pre-legacy-removal/); });

for (const g of Object.keys(G.spiele)) {
  if (g === "bluff") continue; // eigener Abgleich unten
  if (!MOD[g]) { test.todo(`Alt-Orakel ${g}: noch nicht portiert`); continue; }
  test(`Alt-Orakel ${g}: ${G.spiele[g].length} Partien, Optionen und Ergebnis de/en wie Altcode`, async () => {
    const game = await load(g);
    for (const c of G.spiele[g]) {
      const doc = { seed: c.seed, f: "star" }, m = [];
      assert.equal(game.turns.length, c.total, "Zahl der Zuege");
      c.turns.forEach((t, ti) => {
        const now = [], prompts = game.turns[ti];
        assert.equal(prompts.length, t.prompts.length, `${g} seed ${c.seed} Zug ${ti}: Zahl der Fragen`);
        t.prompts.forEach((o, i) => {
          const p = prompts[i], at = `${g} seed ${c.seed} Zug ${ti} Frage ${i}`;
          assert.equal(p.w, o.w, at + " Art"); assert.equal(p.l, o.l, at + " Text");
          for (const lang of ["de", "en"]) {
            if (o["from_" + lang]) assert.deepEqual(p.from(doc, m, now, lang), o["from_" + lang], at + " Optionen " + lang);
            if (o["top_" + lang] !== undefined) assert.equal(p.top(doc, m, lang), o["top_" + lang], at + " Frage " + lang);
            if (o["peek_" + lang] !== undefined) assert.equal(p.peek(doc, m, now, lang), o["peek_" + lang], at + " Zwischenstand " + lang);
            if (o["list_" + lang]) assert.deepEqual(p.w === "explain" ? p.list(doc, lang).slice(0, 30) : p.w === "hunt" ? p.list(doc, m, lang) : p.list(doc, m, now, lang), o["list_" + lang], at + " Liste " + lang);
            if (o["item_" + lang] !== undefined) assert.equal(p.item(doc, lang), o["item_" + lang], at + " Ding " + lang);
            if (o["statue_" + lang]) assert.deepEqual(o["statue_" + lang].map((x, k) => p.statue(doc, k, lang)), o["statue_" + lang], at + " Statuen " + lang);
            if (o["title_" + lang] !== undefined) assert.equal(p.title(doc, lang), o["title_" + lang], at + " Titel " + lang);
          }
          if (o.worth) assert.deepEqual(p.worth(doc), o.worth, at + " Wert");
          if (o.pause) assert.deepEqual(o.pause.map((x, k) => p.pause(doc, k)), o.pause, at + " Pausen");
          if (o.beats) assert.deepEqual(o.beats.map((x, k) => p.beat(k)), o.beats, at + " Beats");
          if (o.plan) assert.deepEqual(p.plan(doc), o.plan, at + " Plan");
          if (o.targets) assert.deepEqual(p.targets(doc), o.targets, at + " Zielzeiten");
          if (o.slot !== undefined) { assert.equal(p.slot(doc), o.slot, at + " Aufnahme"); assert.equal(p.fx(doc), o.fx, at + " Effekt"); }
          if (o.who !== undefined) { assert.equal(p.fx(m), o.fx, at + " Effekt"); assert.equal(p.who(m), o.who, at + " fuer"); }
          if (o.socks) { assert.deepEqual(p.socks(doc, m), o.socks, at + " Socken"); assert.deepEqual(p.before(doc, m), o.before, at + " schon getippt"); }
          now.push(t.answers[i]);
        });
        m.push(now);
        if (game.ends && ti < c.turns.length - 1) assert.equal(!!game.ends(doc, m), false, "endet nicht zu frueh");
      });
      if (c.extra && c.extra.order) {
        const K = await import("../src/cards/zug-kreis/game.js");
        assert.deepEqual(K.doorOrder(doc), c.extra.order, "Regelfolge");
        c.extra.beings.forEach((row, rr) => { const prev = []; row.forEach((b, i) => { const x = K.doorBeing(doc, rr, i, prev); assert.deepEqual(x, b, `Wesen r${rr} i${i}`); prev.push(K.doorIn(rr, x)); }); });
      }
      if (c.extra && c.extra.blocks) { const S = await import("../src/cards/zug-steine/game.js"); c.extra.blocks.forEach((b, i) => assert.deepEqual(S.blockAt(doc, i), b, "Stein " + i)); }
      if (c.extra && c.extra.answers) { const S = await import("../src/cards/zug-socken/game.js"); assert.deepEqual(c.extra.answers.map((x, k) => S.sockAnswer([3, 17], k)), c.extra.answers); }
      if (c.over) for (const lang of ["de", "en"]) assert.deepEqual(game.result(doc, m, lang), c.result[lang], `${g} seed ${c.seed} Ergebnis ${lang}`);
    }
  });
}

// zug-bluff ist eine eigene Karte (Commit-Reveal statt Werten im Link). Abgleich: dieselben Karten wie alt (cards(doc) =
// mix "karten" 12 → i%6+1, turns.js:202), dieselben Ansagen (alt: Index ab dem eigenen Wert) und Entscheidungen → derselbe Stand.
test("Alt-Orakel bluff: 8 Partien, Spielstand der Karte = Altergebnis", async () => {
  const bluff = (await import("../src/cards/bluff/card.js")).default;
  const { mix } = await import("../src/engines/zug-z2/lib.js");
  for (const c of G.spiele.bluff) {
    const cards = mix({ seed: c.seed }, "karten", 12).slice(0, 5).map((i) => i % 6 + 1);
    const say = c.turns[0].answers.map((a, i) => cards[i] + a[0]), open = c.turns[1].answers.map((a) => a[0] === 1);
    let st = bluff.init({ params: { cards: 5, bonus: 2, accent: "red" } });
    st = { pub: st.pub, priv: [{ cards }, null] };
    for (const v of say) st = bluff.step(st, { t: "say", seat: 0, v });
    for (const o of open) st = bluff.step(st, { t: "call", seat: 1, open: o });
    st = bluff.step(st, { t: "reveal", seat: 0 });
    const want = /^(\d+) zu (\d+)$/.exec(c.result.de.h);
    assert.deepEqual(st.pub.score, [+want[1], +want[2]], "seed " + c.seed);
    assert.deepEqual(c.turns[0].prompts.map((p) => p.from_de.map(Number)), cards.map((v) => { const o = []; for (let x = v; x <= 6; x++) o.push(x); return o; }), "Optionen ab dem eigenen Wert");
  }
});
