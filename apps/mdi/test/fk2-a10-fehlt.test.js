// Regression A10 (fk2-a10-messung.md, Abschnitt 3): falsche "fehlt" in fuenf gelieferten Karten (P01 L3, P03 L1, P04 L3,
// P12 L2, P16 L2). Gespielt wird der gespeicherte Code mit den gespeicherten Szenarien des Planers, kein Modellaufruf. Das
// Urteil der Abnahme ist ein Double wie in A10: wo A10 den Ersatzsatz zeigte, hatte das Modell "fehlt" ohne gueltigen Satz
// gesagt. Negativtest: dieselben Spiele ohne die Funktion fallen weiter durch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSzenarien, runSzenario } from "../src/spiel/szenario.js";
import { bewerte } from "../bau/abnahme.mjs";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fk2-a10");
const FAELLE = JSON.parse(fs.readFileSync(path.join(DIR, "faelle.json"), "utf8")).faelle;
const code = (karte) => fs.readFileSync(path.join(DIR, karte + ".js"), "utf8");
const modul = async (src) => (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;
const ALT_ERSATZ = "Das macht das Spiel noch nicht so, wie es hier steht.";
const NEU_ERSATZ = "Ob das Spiel das so macht, konnten wir nicht sicher feststellen.";
const SEED = "bau";   // wie die Pruefung im Bau (bau/pipeline.mjs)

/** Urteil der Abnahme wie in A10: erfuellt bleibt erfuellt; Ersatzsatz in A10 = "fehlt" mit Technik-Satz; sonst der A10-Satz. */
function urteilWieA10(fall) {
  return { punkte: fall.a10.map((p) => ({ id: p.id, urteil: p.erfuellt ? "erfuellt" : "fehlt", kunde: p.erfuellt ? "" : p.notiz === ALT_ERSATZ || p.geprueft === "gespielt" ? "In update() wird s.zuege nicht erhoeht (Zeile 56)" : p.notiz })) };
}
const planVon = (fall) => ({ punkte: fall.plan });

test("A10-Regression: die betroffenen Punkte der fuenf Karten werden nicht mehr faelschlich als fehlend gemeldet", async () => {
  assert.equal(FAELLE.length, 5);
  assert.equal(FAELLE.reduce((n, f) => n + f.betroffen.length, 0), 7, "sieben Punkte in fuenf Karten (der Bericht zaehlt 6 Faelle, P01 L3 mit zwei Punkten)");
  for (const fall of FAELLE) {
    const mod = await modul(code(fall.karte));
    const sz = fall.plan.filter((p) => p.szenario).map((p) => p.szenario);
    const gespielt = runSzenarien(mod, sz, { seed: SEED });
    const b = bewerte({ punkte: fall.punkte, lang: fall.lang }, planVon(fall), gespielt, urteilWieA10(fall));
    for (const id of fall.betroffen) {
      const p = b.punkte.find((x) => x.id === id), a10 = fall.a10.find((x) => x.id === id);
      assert.equal(p.geprueft, a10.geprueft, fall.karte + " " + id);
      if (p.geprueft === "gespielt") {
        assert.equal(gespielt.find((s) => s.id === id).ok, true, fall.karte + " " + id + ": Szenario besteht mit dem gespeicherten Code");
        assert.equal(p.erfuellt, true, fall.karte + " " + id + ": bestandenes Szenario ist erfuellt");
      } else {
        // gelesen, nichts gespielt: offen, aber ohne Behauptung ueber das Spiel
        assert.equal(p.notiz, NEU_ERSATZ, fall.karte + " " + id);
        assert.notEqual(p.notiz, a10.notiz, fall.karte + " " + id + ": der behauptende Satz ist weg");
      }
    }
    // nicht betroffene Punkte: Urteil wie in A10 (die Lockerung macht nichts anderes gruen)
    for (const a10 of fall.a10.filter((x) => !fall.betroffen.includes(x.id))) {
      const p = b.punkte.find((x) => x.id === a10.id);
      assert.equal(p.erfuellt, a10.erfuellt, fall.karte + " " + a10.id + " unveraendert");
      if (!a10.erfuellt) assert.equal(p.notiz, a10.notiz, fall.karte + " " + a10.id + " Satz unveraendert");
    }
  }
});

test("A10-Regression: P12 L2 \"Züge: 1 / 24\" scheiterte am Bot (Feuer auf ungeradem Frame), nicht am Spiel", async () => {
  const fall = FAELLE.find((f) => f.karte === "A-P12-L2"), sz = fall.plan.find((p) => p.id === "p4").szenario;
  assert.deepEqual(sz.schritte.map((s) => s.frames), [1, 20, 1, 5, 1, 60], "kurze Feuer-Schritte mitten in der Folge");
  const r = runSzenario(await modul(code(fall.karte)), sz, { seed: SEED });
  assert.equal(r.ok, true); assert.equal(r.wert.anlauf, undefined, "schon der erste Anlauf besteht");
});

test("Negativtest: ohne die Funktion findet der Bot die Luecke weiter (auch im zweiten Anlauf), Satz fest", async () => {
  const faelle = [
    // [Karte, Punkt, Ersetzung im gespeicherten Code, erwarteter Satz]
    ["A-P12-L2", "p4", ["s.zuege += 1;", ""], "„Züge: 1 / 24“ war beim Ausprobieren nicht zu lesen."],
    ["A-P03-L1", "p5", ["g.loseLife(); return;", "return;"], "Beim Ausprobieren war das Spiel danach nicht vorbei."],
    ["A-P04-L3", "p4", ["g.loseLife();", ";"], "Beim Ausprobieren hat das kein Leben gekostet."],
    ["A-P01-L3", "p2", ["d.emoji(\"💧\"", "d.emoji(\"🔵\""], "💧 war beim Ausprobieren nicht zu sehen."]
  ];
  for (const [karte, id, [alt, neu], satz] of faelle) {
    const src = code(karte);
    assert.ok(src.includes(alt), karte + ": Stelle im gespeicherten Code");
    const fall = FAELLE.find((f) => f.karte === karte);
    const mod = await modul(src.split(alt).join(neu));
    const sz = fall.plan.filter((p) => p.szenario).map((p) => p.szenario);
    const gespielt = runSzenarien(mod, sz, { seed: SEED });
    const s = gespielt.find((x) => x.id === id);
    assert.equal(s.ok, false, karte + " " + id + " ohne Funktion");
    assert.equal(s.wert.anlauf, 2, karte + " " + id + ": auch der zweite Anlauf mit doppelter Dauer scheitert");
    // auch wenn das Modell "erfuellt" sagt: das gescheiterte Szenario entscheidet
    const urteil = { punkte: fall.punkte.map((p) => ({ id: p.id, urteil: "erfuellt", kunde: "" })) };
    const p = bewerte({ punkte: fall.punkte, lang: "de" }, planVon(fall), gespielt, urteil).punkte.find((x) => x.id === id);
    assert.deepEqual([p.erfuellt, p.notiz, p.geprueft], [false, satz, "gespielt"], karte + " " + id);
  }
});
