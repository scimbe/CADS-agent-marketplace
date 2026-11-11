// Editor aus dem Manifest: Blasen je Teil, Dialog aendert die Karte sofort, Regeln des Schemas (max. 3 Sticker),
// angepasste Karte reist im Link (nur Felder mit Reiseregel "Link").
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, waitScreen } from "./lib/grund.mjs";
import { pickMode } from "./lib/scenarios.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

test("Gruss anpassen: Text live, Farbe, Sticker bis 3, dann per Link beim Empfaenger gleich", async () => {
  const { p, errs } = await open(b, { view: "desk1280", lang: "de" });
  await act(p, "open-gruss"); await act(p, "customize");
  assert.equal(await p.locator(".bubble").count(), 4, "eine Blase je Teil aus dem Manifest");
  await p.locator('.bubble[data-for="titel"]').click();
  await p.locator("#dialog input").fill("Mutig sein");
  assert.equal(await p.locator(".frame .t-title").textContent(), "Mutig sein", "Karte aendert sich, waehrend der Dialog offen ist");
  await act(p, "close");
  await p.locator('.bubble[data-for="farbe"]').click(); await p.getByRole("radio", { name: "Schwarz" }).click();
  assert.match(await p.locator(".frame").getAttribute("class"), /fill-ink/);
  assert.match(await p.locator(".frame .t-title").getAttribute("class"), /ink-paper/, "Schrift wechselt auf Kontrastfarbe");
  await act(p, "close");
  await p.locator('.bubble[data-for="sticker"]').click();
  for (const n of ["Herz", "Blitz"]) await p.getByRole("button", { name: n }).click();
  assert.equal(await p.getByRole("button", { name: "Tropfen" }).isDisabled(), true, "viertes Sticker gesperrt (maxItems 3)");
  await act(p, "close"); await act(p, "done");
  assert.equal(await p.locator(".frame svg.shape").count(), 3);
  await pickMode(p, "de", "link"); await act(p, "go");
  const url = await p.locator("#linkfield").inputValue();
  const R = await open(b, { view: "phone390", lang: "de", hash: url.slice(url.indexOf("#")) });
  await waitScreen(R.p, "receive-show");
  assert.equal(await R.p.locator(".frame .t-title").textContent(), "Mutig sein");
  assert.match(await R.p.locator(".frame").getAttribute("class"), /fill-ink/);
  assert.equal(await R.p.locator(".frame svg.shape").count(), 3);
  assert.deepEqual([...errs, ...R.errs], []);
});

test("Bluff anpassen: Regeln-Blase aendert Kartenzahl, Partie nutzt sie", async () => {
  const { p } = await open(b, { view: "phone390", lang: "en" });
  await act(p, "open-bluff"); await act(p, "customize");
  await p.locator('.bubble[data-for="regeln"]').click();
  await p.getByRole("radio", { name: "3", exact: true }).first().click();
  await act(p, "close"); await act(p, "done"); await act(p, "go");
  await waitScreen(p, "card-play-turn");
  assert.equal(await p.locator(".stage .tile").count(), 3);
});
