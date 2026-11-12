// Laeuft durch alle D0-Zustaende und ruft cb(name, page) je Zustand (fuer axe, Ueberlauf, Screenshots).
import fs from "node:fs";
import path from "node:path";
import { open, act, waitScreen, screen } from "./grund.mjs";
import { pickMode, pickSeat, liveInvite } from "./scenarios.mjs";
import { ROOT } from "./grund.mjs";

const VEC = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/link-vectors.json"), "utf8"));

export async function visitAll(b, o, cb) {
  const errs = [];
  const A = await open(b, o); errs.push(A.errs);
  const p = A.p;
  await cb("01-regal", p);
  await act(p, "open-gruss"); await waitScreen(p, "card-view"); await cb("02-gruss-ansehen", p);
  await act(p, "customize"); await waitScreen(p, "card-customize-bubbles"); await cb("03-gruss-blasen", p);
  await p.locator('.bubble[data-for="titel"]').click(); await p.locator("#dialog").waitFor(); await p.waitForTimeout(350); await cb("04-gruss-dialog-text", p);
  await p.keyboard.press("Escape"); await p.locator('.bubble[data-for="sticker"]').click(); await p.locator("#dialog").waitFor(); await p.waitForTimeout(350); await cb("05-gruss-dialog-sticker", p);
  await p.keyboard.press("Escape"); await act(p, "done"); await act(p, "go"); await waitScreen(p, "card-share"); await cb("06-gruss-teilen", p);
  await act(p, "back"); await act(p, "back"); await act(p, "open-bluff"); await waitScreen(p, "card-view"); await cb("07-bluff-ansehen", p);
  await pickMode(p, o.lang, "bot"); await cb("08-bluff-bot-auswahl", p);
  await pickSeat(p, o.lang === "de" ? "Prüfer" : "Checker"); await act(p, "go");
  for (let i = 0; i < 40 && (await screen(p)) !== "card-play-turn"; i++) await p.waitForTimeout(25);
  await cb("09-bluff-pruefer-am-zug", p);
  for (let i = 0; i < 40 && (await screen(p)) !== "card-play-over"; i++) { if ((await screen(p)) === "card-play-turn") await p.locator(".choice .opt").first().click(); else await p.waitForTimeout(25); }
  await waitScreen(p, "card-play-over"); await cb("10-bluff-ende", p);
  await act(p, "again"); await pickMode(p, o.lang, "alone"); await act(p, "go"); await waitScreen(p, "card-play-cover"); await cb("11a-bluff-abdecken-vor-zug-1", p); await act(p, "cover-ok"); await waitScreen(p, "card-play-turn"); await cb("11-bluff-bote-am-zug", p);
  for (let i = 0; i < 10 && (await screen(p)) === "card-play-turn"; i++) await p.locator(".choice .opt").last().click();
  await waitScreen(p, "card-play-cover"); await cb("12-bluff-weitergeben", p);
  await act(p, "back"); await pickMode(p, o.lang, "link"); await act(p, "go");
  for (let i = 0; i < 10 && (await screen(p)) === "card-play-turn"; i++) await p.locator(".choice .opt").last().click();
  await waitScreen(p, "card-play-send"); await cb("13-bluff-link-senden", p);
  const R = await open(b, { ...o, hash: VEC.accept[1].hash }); errs.push(R.errs);
  await waitScreen(R.p, "receive-show"); await cb("14-empfangen-zug", R.p);
  const G = await open(b, { ...o, hash: VEC.accept[0].hash }); errs.push(G.errs);
  await waitScreen(G.p, "receive-show"); await cb("15-empfangen-karte", G.p);
  const X = await open(b, { ...o, hash: VEC.reject.find((v) => v.reason === "params").hash }); errs.push(X.errs);
  await waitScreen(X.p, "receive-reject"); await cb("16-link-abgelehnt", X.p);
  const { A: L, B: M } = await liveInvite(b, o, "bluff"); errs.push(L.errs, M.errs);
  await cb("17-live-einladung", L.p);
  for (let i = 0; i < 100 && (await screen(M.p)) !== "card-play-wait" && (await screen(M.p)) !== "card-play-turn"; i++) await M.p.waitForTimeout(50);
  await cb("18-live-pruefer-wartet", M.p);
  return errs.flat();
}
