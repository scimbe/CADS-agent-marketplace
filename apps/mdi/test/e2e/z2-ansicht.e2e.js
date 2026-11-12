// Z2-Karten auf den Pflichtansichten 360 und 390 (412/1280: z2-ansicht-gross.e2e.js): Kartenansicht und erster Spielbildschirm (nach dem Abdecken) ohne verdecktes
// Bedienelement, axe 0, kein waagerechter Ueberlauf. Deckt auch die Zeit-, Mikrofon- und Steine-Karten ab.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, screen, waitScreen } from "./lib/grund.mjs";
import { openCard, check } from "./lib/z2.mjs";
import { cardOf } from "../../src/cards/index.js";

const IDS = ["zug-lob", "zug-kennst", "zug-luege", "zug-snack", "zug-auftrag", "karte-ausrede", "zug-wort", "zug-auktion", "zug-schmuggel", "zug-wette",
  "zug-luecke", "zug-blitz", "zug-recht", "zug-steine", "zug-kreis", "zug-hoeflich", "zug-woerter", "zug-socken", "zug-rap", "zug-pokal", "zug-reaktion",
  "karte-regel", "beat-disco", "mut-tierstory", "mut-werbung", "raum-streichen", "raum-erklaeren", "raum-damals", "raum-maschine", "raum-suche",
  "raum-maus", "raum-papagei", "duell-liest", "bluff"];

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const view of ["phone360", "phone390"]) {
  test("Z2-Karten, Ansicht und erster Zug: " + view, async () => {
    const bad = [], errs = [];
    for (const id of IDS) {
      const A = await open(b, { view, lang: "de", scheme: "light" });
      const mode = cardOf(id).manifest.players.max === 1 ? "alone" : "alone";
      await openCard(A.p, id, mode);
      await check(A.p, view + " " + id + " Karte", bad);
      await act(A.p, "go");
      for (let i = 0; i < 40 && (await screen(A.p)) !== "card-play-turn"; i++) { if ((await screen(A.p)) === "card-play-cover") await act(A.p, "cover-ok"); else await A.p.waitForTimeout(25); }
      await waitScreen(A.p, "card-play-turn");
      await check(A.p, view + " " + id + " Zug 1", bad);
      errs.push(...A.errs.map((e) => id + ": " + e));
      await A.ctx.close();
    }
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, []);
  });
}
