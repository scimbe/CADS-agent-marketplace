// Datenschutz (Auftrag des Integrators, Befund A/L): Eine Foto-id (media.local, "local:<32 hex>") reist weder im Link noch
// im Live-Handshake. Im Browser geprueft fuer eine Arcade-, eine Flug- und eine Poster-Karte:
// (1) ein fremder Link mit Foto-id wird ehrlich abgelehnt (er zeigte sonst auf den Fotospeicher des Empfaengers);
// (2) Live (Fake-Live, echter Broker): im ganzen Netzverkehr steht kein "local:" (Arcade split, Poster show).
// Den Fall "selbst gewaehltes Foto" ergaenzen A, L und P, sobald die Fotoauswahl (H #292) in paritaet ist.
import test from "node:test";
import { NEEDS_FAKE } from "./lib/ziel.mjs";
import assert from "node:assert/strict";
import { browser, open, act, screen, waitScreen } from "./lib/grund.mjs";
import { liveInvite } from "./lib/scenarios.mjs";
import { encode } from "../../src/app/link.js";
import { cardOf } from "../../src/cards/index.js";
import { defaults } from "../../src/contract/fields.js";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });
const ID = "local:" + "ab".repeat(16);

for (const [id, k] of [["arcade-kick", "photo"], ["flug", "figur"], ["foto-alien", "photo"]]) {
  test(id + ": fremder Link mit Foto-id wird abgelehnt, derselbe ohne Foto angenommen", async () => {
    const c = cardOf(id), p = defaults(c.manifest.params);
    const bad = await open(b, { view: "phone390", hash: encode("card", { c: id, v: c.manifest.version, p: { ...p, [k]: ID } }) });
    await waitScreen(bad.p, "receive-reject");
    const good = await open(b, { view: "phone390", hash: encode("card", { c: id, v: c.manifest.version, p }) });
    await waitScreen(good.p, "receive-show");
    assert.deepEqual([...bad.errs, ...good.errs], []);
    await bad.ctx.close(); await good.ctx.close();
  });
}

for (const id of ["arcade-kick", "foto-alien"]) {
  test(id + " live: im Netzverkehr (Bruecke, Edge, Datenkanal) steht keine Foto-id", { skip: NEEDS_FAKE }, async () => {
    const { A, B, net } = await liveInvite(b, { view: "phone390", lang: "de" }, id);
    // bis der Datenkanal Nachrichten traegt (hello/join/start bzw. show)
    for (let i = 0; i < 150 && net.wire.dc.length < (id === "foto-alien" ? 1 : 2); i++) await A.p.waitForTimeout(100);
    await A.p.waitForTimeout(300);
    const all = JSON.stringify([net.wire.http, net.wire.edge, net.wire.dc]);
    assert.ok(net.wire.dc.length >= 1, "Datenkanal trug Nachrichten: " + net.wire.dc.length);
    assert.doesNotMatch(all, /local:/);
    await A.ctx.close(); await B.ctx.close();
  });
}
