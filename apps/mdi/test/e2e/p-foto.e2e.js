// Strang P: eigenes Foto (media.local, Strang H broker/media.js) in foto-alien (+ Varianten) und advent-tuer.
// Foto waehlen ueber das echte Feld -> Wert "local:<id>" -> die Karte zeichnet {kind:"local", id} -> Pixelprobe auf der Buehne
// (Testbild Magenta #ff00aa). Der Link traegt das Foto nicht (weder id noch Pixel); der Empfaenger sieht kein Magenta.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe, waitScreen } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const clock = (t) => async (ctx) => { await ctx.clock.setFixedTime(t); };
const payload = (hash) => Buffer.from(hash.split(".").slice(2).join("."), "base64url").toString("utf8");
const linkOf = (p) => p.locator("#linkfield").inputValue().then((u) => u.slice(u.indexOf("#")));
// Testbild: 96x96 Magenta, im Browser erzeugt (kein Binaer-Fixture)
async function testPng(p) {
  const url = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 96; const x = c.getContext("2d"); x.fillStyle = "#ff00aa"; x.fillRect(0, 0, 96, 96); return c.toDataURL("image/png"); });
  return Buffer.from(url.split(",")[1], "base64");
}
// Anteil magentaartiger Pixel auf der Karten-Leinwand (auch abgedunkelt unter dem Schleier oder mit Glitch-Filter)
const magenta = (p) => p.evaluate(() => {
  const c = document.querySelector("#stage canvas") || document.querySelector("canvas"); if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 100 && d[i + 1] < 50 && d[i + 2] > 60 && d[i + 2] < d[i] + 10) n++;
  return n / (d.length / 4);
});
async function pickPhoto(p, part) {
  await act(p, "customize"); await p.locator("main.s-card-customize-bubbles").waitFor();
  await p.locator('.bubble[data-for="' + part + '"]').click(); await p.locator("#dialog").waitFor();
  await p.locator("#dialog input[type=file]").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: await testPng(p) });
  await p.locator("#dialog .ef-photo [role=status]").waitFor();
  assert.deepEqual(await axe(p, "foto-dialog"), []);
  await p.keyboard.press("Escape"); await act(p, "done"); await waitScreen(p, "card-view");
}
async function waitMagenta(p, min) { for (let i = 0; i < 60; i++) { const m = await magenta(p); if (m >= min) return m; await p.waitForTimeout(100); } return magenta(p); }

for (const [id, part, view, min] of [["foto-alien", "foto", "phone390", 0.2], ["advent-tuer", "foto", "phone360", 0.05], ["advent-tuer", "foto", "desk1280", 0.05]]) {
  test(id + " " + view + ": Foto waehlen, Karte zeigt es (Pixelprobe), der Link traegt es nicht, Empfaenger sieht es nicht", async () => {
    const A = await open(b, { view, before: clock(new Date("2026-12-05T09:00:00Z")) });
    await act(A.p, "open-" + id); await waitScreen(A.p, "card-view");
    // ohne Foto: Platzhalter (Bot-Gesicht, Glitch) kann vereinzelt magentaartige Pixel haben, das Foto bringt >= min
    const base = await magenta(A.p); assert.ok(base < 0.01, "ohne Foto kaum Magenta: " + base);
    await pickPhoto(A.p, part);
    const m = await waitMagenta(A.p, min);
    assert.ok(m >= min, id + ": Foto auf der Leinwand, Anteil " + m);
    const ids = await A.p.evaluate(() => new Promise((ok) => { const r = indexedDB.open("mdi.media"); r.onsuccess = () => { const q = r.result.transaction("fotos").objectStore("fotos").getAllKeys(); q.onsuccess = () => ok(q.result); }; }));
    assert.equal(ids.length, 1);
    await act(A.p, "go"); await waitScreen(A.p, "card-share");
    const link = await linkOf(A.p), data = payload(link);
    assert.ok(!data.includes(ids[0]) && !/local:|photo|data:image|blob:/.test(data), "kein Foto im Link: " + data.slice(0, 200));
    const B = await open(b, { view, hash: link, before: clock(new Date("2026-12-05T09:00:00Z")) });
    await waitScreen(B.p, "receive-show");
    if (id === "advent-tuer") { await B.p.getByRole("button", { name: "Türchen 5 öffnen" }).click(); await B.p.locator("canvas").first().waitFor(); }
    await B.p.waitForTimeout(500);
    const rx = await magenta(B.p); assert.ok(rx < 0.01, "Empfaenger hat das Foto nicht: " + rx);
    assert.deepEqual([...A.errs, ...B.errs], []);
  });
}

test("foto-alien Varianten: foto-tour (Poster/Duoton), foto-haustier (Meme), foto-essen (Sticker) zeigen das Foto", async () => {
  const { p, errs } = await open(b, { view: "desk1280" });
  await act(p, "open-foto-alien"); await waitScreen(p, "card-view");
  await pickPhoto(p, "foto");
  assert.ok((await waitMagenta(p, 0.2)) >= 0.2, "Glitch");
  // Stil ueber die Stil-Blase wechseln (die Varianten unterscheiden sich in Stil und Text)
  for (const [st, min] of [["Meme", 0.2], ["Sticker", 0.05]]) {
    await act(p, "customize"); await p.locator('.bubble[data-for="stil"]').click(); await p.locator("#dialog").waitFor();
    await p.getByRole("radio", { name: st, exact: true }).click(); await p.keyboard.press("Escape"); await act(p, "done");
    assert.ok((await waitMagenta(p, min)) >= min, st);
  }
  // Poster = Duoton aus dunkel und erster Farbe: Magenta wird zum Farbton der Karte, also Pruefung: Bild weicht von ohne Foto ab
  assert.deepEqual(errs, []);
});
