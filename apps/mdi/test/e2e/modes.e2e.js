// Gleiche Karte in allen Modi im echten Browser: Telefon (de) und Desktop (en). Ein Treiber fuer alle Karten.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, waitScreen, playVisible, noOverflow } from "./lib/grund.mjs";
import { staticLink, liveInvite, turnLive, turnLink, pickMode, pickSeat } from "./lib/scenarios.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

for (const [view, lang] of [["phone390", "de"], ["desk1280", "en"]]) {
  const o = { view, lang };
  test(view + "/" + lang + ": statische Karte per Link", async () => {
    const [A, B] = await staticLink(b, o);
    assert.deepEqual([...A.errs, ...B.errs], []);
    assert.deepEqual(A.ctx._blocked, [], "kein Netz ohne Live");
  });
  test(view + "/" + lang + ": statische Karte live", async () => {
    const { A, B } = await liveInvite(b, o, "gruss");
    await waitScreen(B.p, "receive-show", 20000); await act(B.p, "accept"); await waitScreen(B.p, "card-view");
    await waitScreen(A.p, "card-view");
    assert.deepEqual([...A.errs, ...B.errs], []);
  });
  test(view + "/" + lang + ": Bluff allein (ein Geraet, Weitergeben mit Sichtschutz)", async () => {
    const A = await open(b, o); await act(A.p, "open-bluff"); await pickMode(A.p, lang, "alone"); await act(A.p, "go");
    assert.equal(await playVisible(A.p), "card-play-over");
    assert.ok(await noOverflow(A.p));
    assert.deepEqual(A.errs, []);
  });
  test(view + "/" + lang + ": Bluff gegen Bot als Pruefer", async () => {
    const A = await open(b, o); await act(A.p, "open-bluff"); await pickMode(A.p, lang, "bot");
    await pickSeat(A.p, lang === "de" ? "Prüfer" : "Checker"); await act(A.p, "go");
    for (let i = 0; i < 20; i++) { const s = await playVisible(A.p); if (s === "card-play-over") break; await A.p.waitForTimeout(50); }
    await waitScreen(A.p, "card-play-over");
    assert.deepEqual(A.errs, []); assert.deepEqual(A.ctx._blocked, []);
  });
  test(view + "/" + lang + ": Bluff per Link (drei Wege: Ansagen, Pruefen, Aufloesung)", async () => {
    const { A, B, hops } = await turnLink(b, o);
    assert.equal(hops.length, 3, hops.join("\\n"));
    await waitScreen(A.p, "card-play-over"); await waitScreen(B.p, "card-play-over");
    assert.equal(await A.p.locator(".t-big").textContent(), await B.p.locator(".t-big").textContent());
    assert.deepEqual([...A.errs, ...B.errs], []);
  });
  test(view + "/" + lang + ": Bluff live ueber den Datenkanal (echter Broker, falsches Netz)", async () => {
    const { A, B, net } = await turnLive(b, o);
    assert.ok(net.wire.dc.length > 10, "Spielzuege liefen ueber den Datenkanal");
    assert.ok(net.wire.http.some((x) => x.startsWith("POST /api/play/open")) && net.wire.http.some((x) => x.startsWith("POST /api/play/join")));
    assert.deepEqual([...A.errs, ...B.errs], []);
  });
}
