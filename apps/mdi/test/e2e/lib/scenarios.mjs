// Szenarien fuer alle Modi – ein Treiber, kartenunabhaengig (nur sichtbare UI + Vertrag ueber die Oberflaeche).
import assert from "node:assert/strict";
import { open, act, screen, waitScreen, playVisible } from "./grund.mjs";
import { fakeLive } from "./fakelive.mjs";
import { texts } from "../../../src/app/texts.js";

// Echtzeitkarten (Canvas v54): die Spielweisen-Auswahl liegt unter "Andere Spielweise" (Doppelknopf ist die Hauptaktion)
export async function moreModes(p) {
  // erst warten, bis die Spielweisen-Auswahl steht (sonst Wettlauf im langsamen Labor), dann ggf. aufklappen
  await p.locator('details.rt-more, [aria-labelledby="lbl-mode"]').first().waitFor({ state: "attached" });
  const s = p.locator("details.rt-more:not([open]) > summary"); if (await s.count()) await s.first().click();
}
export async function pickMode(p, lang, mode) { await moreModes(p); await p.getByRole("radio", { name: texts(lang).modes[mode], exact: true }).click(); }
export async function pickSeat(p, name) { await p.getByRole("radio", { name, exact: true }).click(); }
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));

export async function staticLink(b, o) {
  const A = await open(b, o); await act(A.p, "open-gruss"); await pickMode(A.p, o.lang, "link"); await act(A.p, "go");
  await waitScreen(A.p, "card-share"); const link = await linkOf(A.p);
  assert.match(link, /^#v2\.card\./);
  const B = await open(b, { ...o, hash: link }); await waitScreen(B.p, "receive-show"); await act(B.p, "accept"); await waitScreen(B.p, "card-view");
  assert.equal(await B.p.locator(".frame .t-title").textContent(), await A.p.locator(".frame .t-title").textContent());
  return [A, B];
}

export async function liveInvite(b, o, cardId, setup) {
  const net = fakeLive();
  const A = await open(b, { ...o, before: (ctx, p) => net.attach(ctx, p, "a") });
  await act(A.p, "open-" + cardId); await pickMode(A.p, o.lang, "live"); if (setup) await setup(A.p); await act(A.p, "go");
  await waitScreen(A.p, "card-lobby");
  await A.p.locator("#linkfield").waitFor({ state: "attached", timeout: 20000 });
  const link = await linkOf(A.p);
  assert.match(link, /^#v2\.live\./);
  const B = await open(b, { ...o, hash: link, before: (ctx, p) => net.attach(ctx, p, "b") });
  await waitScreen(B.p, "receive-live"); await act(B.p, "accept");
  return { A, B, net };
}

export async function turnLive(b, o) {
  const { A, B, net } = await liveInvite(b, o, "bluff");
  for (let i = 0; i < 60; i++) {
    const [sa, sb] = [await screen(A.p), await screen(B.p)];
    if (sa === "card-play-over" && sb === "card-play-over") break;
    await playVisible(A.p, 2); await playVisible(B.p, 2); await A.p.waitForTimeout(80);
  }
  await waitScreen(A.p, "card-play-over"); await waitScreen(B.p, "card-play-over");
  assert.equal(await A.p.locator(".t-big").textContent(), await B.p.locator(".t-big").textContent(), "beide sehen dasselbe Ergebnis");
  return { A, B, net };
}

export async function turnLink(b, o) {
  const A = await open(b, o); await act(A.p, "open-bluff"); await pickMode(A.p, o.lang, "link"); await act(A.p, "go");
  const B = await open(b, o);
  const hops = [];
  let cur = A, other = B;
  for (let hop = 0; hop < 6; hop++) {
    const s = await playVisible(cur.p);
    if (s !== "card-play-send" && s !== "card-play-over") throw new Error("unerwartet " + s);
    const pending = await cur.p.locator("#linkfield").count();
    if (!pending) break;
    const link = await linkOf(cur.p); hops.push(link);
    if (s === "card-play-send") { await act(cur.p, "sent"); await waitScreen(cur.p, "card-play-wait"); }
    await other.p.goto(other.p.url().split("#")[0] + link);
    await waitScreen(other.p, "receive-show"); await act(other.p, "accept");
    const os = await screen(other.p);
    if (os === "card-play-over" && s === "card-play-over") break;
    [cur, other] = [other, cur];
  }
  return { A, B, hops };
}
