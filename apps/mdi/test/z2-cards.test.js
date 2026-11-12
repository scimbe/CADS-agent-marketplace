// Z2-Karten als Vertragskarten: dieselben Partien wie das Alt-Orakel, gespielt ueber init/accepts/step/status/view/result
// des Zug-Kerns. Erwartet: jede Altantwort wird angenommen, jede vom Altcode abgelehnte abgelehnt, Sitze wechseln wie alt
// (Raumkarten: ein Geraet), das Ergebnis ist wortgleich (de/en), jede Ansicht hat Kopf, Schritt und ein Bedienelement.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rng } from "../src/contract/sdk.js";
import { defaults } from "../src/contract/fields.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures/z2-golden.json"), "utf8"));
const TODAY = 20000; // wie das Orakel (play(doc, answers, 20000))
// GAMES-Schluessel -> [Karte, Variante]
const CARD = {
  lob: ["zug-lob"], kennst: ["zug-kennst"], luege: ["zug-luege"], snack: ["zug-snack"], auftrag: ["zug-auftrag", "auftrag"], ausrede: ["karte-ausrede"],
  wort: ["zug-wort"], auktion: ["zug-auktion", "auktion"], deal: ["zug-auktion", "deal"], teilen: ["zug-auktion", "teilen"], socke: ["zug-auktion", "socke"],
  fallpreis: ["zug-auktion", "fallpreis"], schmuggel: ["zug-schmuggel"], wette: ["zug-wette"], luecke: ["zug-luecke"], blitz: ["zug-blitz"], recht: ["zug-recht"],
  kreis: ["zug-kreis", "kreis"], tuer: ["zug-kreis", "tuer"], hoeflich: ["zug-hoeflich"], woerter: ["zug-woerter"], regel: ["karte-regel"], rap: ["zug-rap"],
  steine: ["zug-steine"], socken: ["zug-socken"], pokal: ["zug-pokal", "pokal"], uhr: ["zug-pokal", "uhr"], reaktion: ["zug-reaktion"],
  streichen: ["raum-streichen"], erklaeren: ["raum-erklaeren"], damals: ["raum-damals"], maschine: ["raum-maschine"], werbung: ["mut-werbung"],
  suche: ["raum-suche"], disco: ["beat-disco"], tier: ["mut-tierstory"], maus: ["raum-maus"], papagei: ["raum-papagei"]
};
const ROOM = new Set(["tuer", "uhr", "streichen", "erklaeren", "damals", "maschine", "werbung", "suche", "disco", "tier", "maus", "papagei"]);
// ein Bedienelement: Auswahl, Feld, Weiter-Knopf oder ein Widget von F
const CONTROL = new Set(["choice", "field", "go", "grid", "probe", "blocks", "hunt", "clock", "explain", "drop", "inner", "blind", "react", "tuer", "freeze", "touch", "rec", "once", "parrot", "whose"]);
function controls(n, out = []) { if (n && typeof n === "object") { if (CONTROL.has(n.t)) out.push(n.t); (n.children || []).forEach((c) => controls(c, out)); } return out; }

test("jede Golden-Spielart ist einer Karte zugeordnet (bluff hat einen eigenen Abgleich)", () => {
  assert.deepEqual(Object.keys(G.spiele).filter((g) => g !== "bluff" && !CARD[g]), []);
});

for (const [g, [id, variant]] of Object.entries(CARD)) {
  test(`${id}${variant ? " (" + variant + ")" : ""}: ${G.spiele[g].length} Altpartien über den Kartenvertrag`, async () => {
    const card = (await import(`../src/cards/${id}/card.js`)).default;
    const params = { ...defaults(card.manifest.params), ...(variant ? { spiel: variant } : {}) };
    for (const c of G.spiele[g]) {
      let st = card.init({ rng: rng("z2|" + c.seed), params, players: card.manifest.players.max });
      st = { ...st, pub: { ...st.pub, seed: c.seed } };
      const at = `${g} seed ${c.seed}`;
      c.turns.forEach((t, ti) => {
        const s0 = card.status(st);
        assert.equal(s0.over, false, at + " Zug " + ti);
        assert.equal(s0.turn, ROOM.has(g) ? 0 : ti % 2, at + " Sitz in Zug " + ti);
        assert.equal(s0.turnNo, ti + 1);
        // alt gate: nach Zug 1 einer gateFrom-Karte bleibt der naechste Zug bis zum genannten Tag zu
        const open = st.pub.o > TODAY ? st.pub.o : TODAY;
        if (open > TODAY) {
          const shut = card.view(card.observe(st, s0.turn), s0.turn, { lang: "de", today: open - 1 });
          assert.deepEqual(controls(shut), [], at + " vor dem Tag verschlossen");
          assert.equal(shut.gate, 1, at + " noch ein Tag");
        }
        t.answers.forEach((a, i) => {
          const obs = card.observe(st, s0.turn);
          for (const b of t.bad.filter((x) => x.i === i)) assert.equal(card.accepts(obs, s0.turn, card.answer(st.pub, s0.turn, b.v, TODAY)), false, `${at} Zug ${ti} Frage ${i}: ${JSON.stringify(b.v)} muss abgelehnt werden`);
          for (const lang of ["de", "en"]) {
            const v = card.view(obs, s0.turn, { lang, today: open });
            assert.ok(v.head && v.step && v.step.i === i + 1, at + " Kopf/Schritt");
            assert.ok(controls(v).length >= 1, `${at} Zug ${ti} Frage ${i} (${lang}): kein Bedienelement`);
            if (s0.turn === 0 && !ROOM.has(g)) assert.deepEqual(controls(card.view(card.observe(st, 1), 1, { lang, today: TODAY })), [], "wer nicht dran ist, bekommt kein Bedienelement");
          }
          const input = card.answer(st.pub, s0.turn, a, TODAY);
          assert.equal(card.accepts(obs, s0.turn, input), true, `${at} Zug ${ti} Frage ${i}: Altantwort ${JSON.stringify(a)} abgelehnt`);
          st = card.step(st, input);
        });
      });
      const s1 = card.status(st);
      assert.equal(s1.over, c.over, at + " Ende");
      if (c.over) for (const lang of ["de", "en"]) {
        assert.deepEqual(card.result(st.pub, lang), c.result[lang], `${at} Ergebnis ${lang}`);
        const v = card.view(card.observe(st, 0), 0, { lang, today: TODAY });
        assert.equal(v.children[0].text, c.result[lang].h, "Ergebnis steht oben");
      }
    }
  });
}
