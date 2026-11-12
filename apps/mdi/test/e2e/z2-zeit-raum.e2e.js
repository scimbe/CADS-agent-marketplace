// Z2-Karten mit Zeit-, Ton- und Steine-Widgets sowie die Varianten bis zum Ergebnis. Die Uhr ist steuerbar (page.clock),
// das Mikrofon eine Attrappe mit 440-Hz-Testsignal (lib/z2-zeit.mjs). Jeder Bildschirm: keine Verdeckung, axe 0, kein
// waagerechter Ueberlauf; am Ende steht ein Ergebnis da.
import test from "node:test";
import assert from "node:assert/strict";
import { browser } from "./lib/grund.mjs";
import { openCard, pickVariant, playTurn, roundTrip, check } from "./lib/z2.mjs";
import { openTimed, timedStep } from "./lib/z2-zeit.mjs";

const o = { view: "phone390", lang: "de", scheme: "light" };
// [Karte, Variante (params.spiel) oder null, Spielweise, Mikrofon noetig]
const CASES = [
  ["zug-pokal", "uhr", "alone"], ["zug-kreis", "tuer", "alone"], ["raum-erklaeren", null, "alone"], ["mut-werbung", null, "alone"], ["raum-suche", null, "alone"]
];

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const [id, variant, mode, mic] of CASES) {
  test(`${id}${variant ? " (" + variant + ")" : ""}: ${mode === "link" ? "Link-Rundreise" : "ein Geraet"} bis zum Ergebnis`, async () => {
    const A = await openTimed(b, o), bad = [], mem = new Map();
    const memOf = (pg) => { if (!mem.has(pg)) mem.set(pg, {}); return mem.get(pg); };
    await openCard(A.p, id, null);
    if (variant) await pickVariant(A.p, id, variant);
    await A.p.getByRole("radio", { name: mode === "link" ? "Abwechselnd per Link" : "Ein Gerät", exact: true }).click();
    await A.p.locator('[data-act="go"]').first().click();
    let k = 0;
    const onScreen = (p) => check(p, id + " Zug " + (++k), bad);
    let end;
    if (mode === "link") {
      const B = await openTimed(b, o);
      const r = await roundTrip(A, B, { onScreen, extra: (pg) => timedStep(pg, memOf(pg)) });
      end = r.end; assert.deepEqual(B.errs, []);
    } else {
      let s;
      for (let i = 0; i < 40; i++) { s = await playTurn(A.p, onScreen, (pg) => timedStep(pg, memOf(pg))); if (s === "card-play-over") break; }
      assert.equal(s, "card-play-over", id + " endet");
      end = A;
    }
    await check(end.p, id + " Ergebnis", bad);
    assert.ok((await end.p.locator("main .t-big").first().innerText()).trim().length > 0, "Ergebnis steht da");
    if (mic) assert.ok((await A.p.evaluate(() => window.__mic)) >= 1, "Aufnahme lief ueber das (Attrappen-)Mikrofon");
    assert.deepEqual(bad, []);
    assert.deepEqual(A.errs, []);
  });
}
