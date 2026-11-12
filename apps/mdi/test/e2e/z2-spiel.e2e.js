// Z2-Karten Ende-zu-Ende ueber die sichtbare Oberflaeche: Link-Rundreise zwischen zwei Geraeten bzw. Raum-Ablauf auf
// einem Geraet bis zum Ergebnis. Jeder Zug-Bildschirm: keine Verdeckung, axe 0, kein waagerechter Ueberlauf.
// Zeit-, Mikrofon- und Steine-Karten laufen hier nur bis zum ersten Bildschirm (z2-ansicht.e2e.js), weil ihre Widgets
// echte Zeit bzw. ein Mikrofon brauchen.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open } from "./lib/grund.mjs";
import { openCard, playTurn, roundTrip, check } from "./lib/z2.mjs";

const LINK = ["zug-lob", "zug-kennst", "zug-luege", "zug-snack", "zug-auftrag", "karte-ausrede", "zug-wort", "zug-auktion", "zug-schmuggel",
  "zug-luecke", "zug-blitz", "zug-recht", "zug-kreis", "zug-hoeflich", "zug-woerter", "karte-regel", "zug-rap", "zug-socken", "duell-liest"];
const ROOM = ["raum-streichen", "raum-damals", "raum-maschine"];
const o = { view: "phone390", lang: "de", scheme: "light" };

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const id of LINK) {
  test(id + ": Link-Rundreise bis zum Ergebnis, jeder Zug ohne Verdeckung und axe-Befund", async () => {
    const A = await open(b, o), B = await open(b, o), bad = [];
    await openCard(A.p, id, "link"); await A.p.locator('[data-act="go"]').first().click();
    let k = 0;
    const r = await roundTrip(A, B, { onScreen: (p) => check(p, id + " Zug " + (++k), bad) });
    await check(r.end.p, id + " Ergebnis", bad);
    assert.ok((await r.end.p.locator("#stage").innerText()).trim().length > 0, "Ergebnis steht da");
    assert.deepEqual(bad, []);
    assert.deepEqual([...A.errs, ...B.errs], []);
    await A.ctx.close(); await B.ctx.close();
  });
}
test("zug-wette: nach dem Versprechen ist der Zug bis zur Frist verschlossen (Link)", async () => {
  const A = await open(b, o), B = await open(b, o), bad = [];
  await openCard(A.p, "zug-wette", "link"); await A.p.locator('[data-act="go"]').first().click();
  const r = await roundTrip(A, B, { stop: async () => true });
  assert.match(await r.end.p.locator("main").innerText(), /verschlossen/);
  await check(r.end.p, "zug-wette verschlossen", bad);
  assert.deepEqual(bad, []);
  await A.ctx.close(); await B.ctx.close();
});
for (const id of ROOM) {
  test(id + ": Raum-Ablauf auf einem Geraet bis zum Ergebnis", async () => {
    const A = await open(b, o), bad = [];
    await openCard(A.p, id, "alone"); await A.p.locator('[data-act="go"]').first().click();
    let k = 0;
    const s = await playTurn(A.p, (p) => check(p, id + " Schritt " + (++k), bad));
    for (let i = 0; i < 30 && s !== "card-play-over"; i++) { const t = await playTurn(A.p, (p) => check(p, id + " Schritt " + (++k), bad)); if (t === "card-play-over") break; }
    await check(A.p, id + " Ergebnis", bad);
    assert.ok((await A.p.locator("#stage").innerText()).trim().length > 0);
    assert.deepEqual(bad, []);
    assert.deepEqual(A.errs, []);
    await A.ctx.close();
  });
}
