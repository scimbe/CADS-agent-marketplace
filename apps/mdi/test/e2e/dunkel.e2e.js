// Dunkelmodus (Canvas v54 „Start dunkel“): axe 0 in den Heim-Zustaenden hell und dunkel, und Bedienflaechen heben sich
// von ihrer Umgebung ab (WCAG 1.4.11 Nicht-Text-Kontrast >= 3:1). axe prueft das nicht; „Hauptknopf dunkel auf dunkel“
// war genau so ein Fehler. Gemessen: Hauptknopf, „Neu erfinden“, Absichten und Blaetter-Pfeile gegen die Seite (Rand ab 2 px oder Fuellung).
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const contrast = (p, sels) => p.evaluate((sels) => {
  const rgb = (c) => (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const page = getComputedStyle(document.body).backgroundColor;
  // Grenze der Flaeche: ein Rand ab 2 px zaehlt (wie bei Absichten und „Neu erfinden“), sonst die Fuellung
  return sels.map((s) => { const e = document.querySelector(s); if (!e) return [s, -1]; const cs = getComputedStyle(e);
    const r = Math.max(ratio(cs.backgroundColor, page), parseFloat(cs.borderTopWidth) >= 2 ? ratio(cs.borderTopColor, page) : 0);
    return [s, Math.round(r * 10) / 10]; });
}, sels);

for (const scheme of ["light", "dark"]) {
  test("Heimseite " + scheme + ": axe 0 (Start, Regal, Mein Regal, Karte, Teilen, Spielkopf) und Bedienflaechen >= 3:1 gegen die Seite", async () => {
    const { p, errs } = await open(b, { view: "phone390", scheme, lang: scheme === "dark" ? "en" : "de" }); // Befund Staging: en/dunkel
    await p.locator(".h-leaf").waitFor(); await p.waitForTimeout(400);
    const bad = [...(await axe(p, scheme + "/start"))];
    for (const [s, r] of await contrast(p, [".h-go", ".h-erf", ".h-intent", ".h-arrow-i"])) if (r < 3) bad.push(scheme + ": " + s + " " + r + ":1");
    // Satzfeld (Suchen) mit Knopf .h-field-go: Text >= 4,5:1 (Befund Staging-Abnahme en/dunkel)
    await act(p, "intent-suchen"); await p.locator(".h-field-go").waitFor(); bad.push(...(await axe(p, scheme + "/satz")));
    const fg = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector(".h-field-go"));
      const rgb = (c) => (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const x = lum(cs.color), y = lum(cs.backgroundColor); return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 10) / 10; });
    if (fg < 4.5) bad.push(scheme + ": .h-field-go Text " + fg + ":1");
    await p.locator('[data-act="back"]').first().click();
    await act(p, "intent-alle"); await p.waitForTimeout(300); bad.push(...(await axe(p, scheme + "/regal")));
    await act(p, "open-gruss"); await p.locator("main.s-card-view").waitFor(); bad.push(...(await axe(p, scheme + "/karte")));
    await act(p, "go"); await p.locator("main.s-card-share").waitFor(); bad.push(...(await axe(p, scheme + "/teilen")));
    for (let i = 0; i < 4 && (await p.locator('[data-act="back"]').count()); i++) await p.locator('[data-act="back"]').first().click();
    await act(p, "meins"); await p.waitForTimeout(300); bad.push(...(await axe(p, scheme + "/mein-regal")));
    // Mein Regal mit offenem ⋯-Menue (Folge-PR 3)
    if (await p.locator('[data-act="wall-more-0"]').count()) { await act(p, "wall-more-0"); bad.push(...(await axe(p, scheme + "/mein-regal-menue"))); }
    // Spielweise als Segmentleiste im Spielkopf (Folge-PR 3)
    await p.locator('[data-act="back"]').first().click();
    await act(p, "open-zug-einkauf"); await p.locator("main.s-card-view").waitFor(); await act(p, "go");
    await p.locator(".pm-seg").waitFor(); bad.push(...(await axe(p, scheme + "/spielkopf")));
    for (const [s, r] of await contrast(p, [".pm-seg"])) if (r < 3) bad.push(scheme + ": " + s + " " + r + ":1");
    // Spielkopf in Familienfarbe: Schrift >= 4,5:1 gegen die Kopffarbe (Canvas v54)
    const head = await p.evaluate(() => { const e = document.querySelector("header.bar"), cs = getComputedStyle(e);
      const rgb = (c) => (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const x = lum(cs.color), y = lum(cs.backgroundColor); return { fam: e.classList.contains("bar-fam"), r: Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 10) / 10 }; });
    if (!head.fam || head.r < 4.5) bad.push(scheme + ": Spielkopf " + JSON.stringify(head));
    // Echtzeitkarte: dunkle Startansicht mit Doppelknopf (axe, Knoepfe >= 3:1 gegen die Seite)
    await p.locator('[data-act="back"]').first().click(); await p.locator('[data-act="back"]').first().click().catch(() => {});
    await act(p, "open-arcade-kick"); await p.locator("main.s-card-view.rt-dark").waitFor(); await p.locator(".rt-duo").waitFor();
    bad.push(...(await axe(p, scheme + "/rt-start")));
    const duo = await p.evaluate(() => { const m = getComputedStyle(document.querySelector("main")).backgroundColor, b = getComputedStyle(document.querySelector(".rt-duo-b")).backgroundColor; return [m, b]; });
    if (duo[0] === duo[1]) bad.push(scheme + ": Doppelknopf hebt sich nicht ab");
    assert.deepEqual(bad, []);
    assert.deepEqual(errs, []);
  });
}
