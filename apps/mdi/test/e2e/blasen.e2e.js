// Fix 17.11. (Meldung „das ist keine Farbauswahl, zeig sie doch an … Warum keine bubbles?“): Farbfelder statt Hex-Text,
// Auswahl mit Haekchen, Gegnerfarbe belegt; Blasen mit Faden an den Teilen einer Echtzeitkarte und einer Nicht-Spiel-Karte,
// Antippen oeffnet den passenden Dialog, Pinsel blendet aus, Ziehen merkt die Lage; axe ohne Verstoesse. Desktop und Handy.
import test from "node:test";
import assert from "node:assert/strict";
import { browser, open, act, axe } from "./lib/grund.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

const rgb = (hex) => "rgb(" + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ") + ")";
async function customize(p, id) {
  await act(p, "open-" + id); await p.locator("main.s-card-view").waitFor();
  await act(p, "customize"); await p.locator("main.s-card-customize-bubbles").waitFor(); await p.waitForTimeout(200);
}
/** Blasen sichtbar, innerhalb des Fensters, je Kartenteil ein gezeichneter Faden mit Punkt am Teil. */
async function bubblesOk(p, parts) {
  const r = await p.evaluate(() => {
    const vw = innerWidth, out = { bubbles: [], threads: {} };
    for (const b of document.querySelectorAll(".bubbles .bubble")) {
      const q = b.getBoundingClientRect(); out.bubbles.push({ id: b.dataset.for, kind: b.dataset.kind, w: q.width, h: q.height, inside: q.left >= 0 && q.right <= vw, label: b.getAttribute("aria-label") });
    }
    for (const g of document.querySelectorAll(".threads g")) out.threads[g.dataset.for] = (g.querySelector("path").getAttribute("d") || "") && g.querySelector("circle").getAttribute("visibility") !== "hidden";
    return out;
  });
  assert.deepEqual(r.bubbles.filter((x) => x.kind === "part").map((x) => x.id).sort(), [...parts].sort());
  assert.deepEqual(r.bubbles.filter((x) => x.kind !== "part").map((x) => x.id), ["magie", "signatur"]);
  for (const x of r.bubbles) { assert.ok(x.w >= 48 && x.h >= 48, x.id + " zu klein"); assert.ok(x.inside, x.id + " ausserhalb"); assert.ok(x.label, x.id + " ohne Namen"); }
  for (const id of parts) assert.equal(r.threads[id], true, "Faden an " + id);
}
/** Farbfelder einer Gruppe: Farbe als computed background, kein Hex-Text, Haekchen an der Auswahl, belegte Werte. */
async function swatches(p, groupIndex = 0) {
  return p.locator("#dialog [role=radiogroup]").nth(groupIndex).evaluate((g) => [...g.querySelectorAll(".sw-opt")].map((o) => {
    const d = o.querySelector(".sw-dot"), q = o.getBoundingClientRect();
    return { v: o.dataset.v, bg: getComputedStyle(d).backgroundColor, checked: o.getAttribute("aria-checked") === "true", mark: !!o.querySelector(".sw-mark"), disabled: o.disabled, name: o.getAttribute("aria-label"), title: o.title, text: o.textContent.trim(), w: q.width, h: q.height };
  }));
}

for (const view of ["desk1280", "phone390"]) {
  test("Echtzeitspiel Netz-Volley: Blasen an den Teilen, Farben als Felder, Gegnerfarbe belegt, axe 0 – " + view, async () => {
    const { p, errs } = await open(b, { view });
    await customize(p, "arcade-volley");
    await bubblesOk(p, ["farben", "figur", "texte", "regeln"]);
    assert.deepEqual(await axe(p, "blasen"), []);
    await p.locator('.bubble[data-for="farben"]').click(); await p.locator('#dialog[data-part="farben"]').waitFor(); await p.waitForTimeout(300);
    assert.doesNotMatch(await p.locator("#dialog").innerText(), /#[0-9a-f]{6}/i, "kein Hex-Text im Dialog");
    const a = await swatches(p, 0), bb = await swatches(p, 1);
    for (const s of [...a, ...bb]) {
      assert.equal(s.bg, rgb(s.v), "Farbfeld " + s.v + " in seiner Farbe");
      assert.ok(s.w >= 48 && s.h >= 48, "Farbfeld >= 48 px");
      assert.equal(s.text, "", "kein Text im Farbfeld"); assert.ok(s.name && s.name === s.title, "Name als aria-label und Tooltip");
      assert.equal(s.mark, s.checked, "Haekchen genau an der Auswahl");
    }
    assert.ok(a.length <= 12 && a.length >= 6, "kuratierte Palette: " + a.length);
    const mine = a.find((s) => s.checked), theirs = bb.find((s) => s.checked);
    assert.ok(mine && theirs && mine.v !== theirs.v);
    assert.equal(bb.find((s) => s.v === mine.v).disabled, true, "Spielerfarbe ist beim Gegner belegt");
    assert.match(bb.find((s) => s.v === mine.v).name, /belegt/);
    // andere eigene Farbe waehlen: sie wird beim Gegner belegt, die alte wieder frei
    const pick = a.find((s) => !s.checked && s.v !== theirs.v);
    await p.locator('#dialog [role=radiogroup] >> nth=0').locator('[data-v="' + pick.v + '"]').click();
    const bb2 = await swatches(p, 1);
    assert.equal(bb2.find((s) => s.v === pick.v).disabled, true); assert.equal(bb2.find((s) => s.v === mine.v).disabled, false);
    assert.equal((await swatches(p, 0)).find((s) => s.v === pick.v).mark, true);
    assert.deepEqual(await axe(p, "farben"), []);
    await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
    // Figur: Wahl ohne rohe IDs (Foto als …)
    await p.locator('.bubble[data-for="figur"]').click(); await p.locator('#dialog[data-part="figur"]').waitFor();
    assert.doesNotMatch(await p.locator("#dialog").innerText(), /\b(off|figure|bg)\b/);
    await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
    assert.deepEqual(errs, []);
  });

  test("Nicht-Spiel-Karte Gruss: Blasen an den Teilen, Antippen oeffnet den Dialog, Magie und Signatur, Pinsel blendet aus – " + view, async () => {
    const { p, errs } = await open(b, { view });
    await customize(p, "gruss");
    await bubblesOk(p, ["titel", "text", "farbe", "sticker"]);
    for (const part of ["titel", "farbe", "magie", "signatur"]) {
      await p.locator('.bubble[data-for="' + part + '"]').click(); await p.locator('#dialog[data-part="' + part + '"]').waitFor(); await p.waitForTimeout(250);
      assert.equal(await p.locator('.bubble[data-for="' + part + '"]').getAttribute("aria-expanded"), "true");
      if (part === "farbe") for (const s of await swatches(p, 0)) assert.equal(s.bg, rgb({ yellow: "#f9d84a", red: "#ff3b1d", ink: "#17140f", paper: "#fbf5dd" }[s.v]), s.v);
      if (part === "signatur") assert.ok((await swatches(p, 1)).length >= 8, "Hintergrund als Farbfelder");
      assert.deepEqual(await axe(p, part), []);
      await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
    }
    // Teil der Karte direkt antippen: dieselbe Einstellung
    await p.locator("#stage [data-part=titel]").first().click(); await p.locator('#dialog[data-part="titel"]').waitFor();
    await p.keyboard.press("Escape"); await p.locator("#dialog").waitFor({ state: "detached" });
    // Pinsel: aus (durchgestrichen) und wieder an
    const tog = p.locator('[data-act="blasen"]');
    assert.equal(await tog.getAttribute("aria-pressed"), "true");
    await tog.click();
    assert.equal(await p.locator(".bubbles").count(), 0, "Blasen ausgeblendet");
    assert.equal(await tog.getAttribute("aria-pressed"), "false"); assert.equal(await tog.locator(".bt-strike").count(), 1, "Pinsel durchgestrichen");
    assert.deepEqual(await axe(p, "aus"), []);
    await tog.click();
    assert.equal(await p.locator(".bubbles .bubble").count(), 6);
    assert.deepEqual(errs, []);
  });
}

test("Blase ziehen: Lage bleibt (auch nach Neuladen), Ziehen oeffnet keinen Dialog", async () => {
  const { p, errs } = await open(b, { view: "desk1280" });
  await customize(p, "arcade-volley");
  const bub = p.locator('.bubble[data-for="regeln"]'), q = await bub.boundingBox();
  await p.mouse.move(q.x + q.width / 2, q.y + q.height / 2); await p.mouse.down();
  await p.mouse.move(q.x + q.width / 2 - 60, q.y + q.height / 2 + 90, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(200);
  assert.equal(await p.locator("#dialog").count(), 0, "Ziehen ist kein Antippen");
  const pos = await bub.getAttribute("data-pos"), q2 = await bub.boundingBox();
  assert.ok(pos, "Lage gemerkt"); assert.ok(Math.abs(q2.x - (q.x - 60)) < 4 && Math.abs(q2.y - (q.y + 90)) < 4, "Blase bleibt, wo sie losgelassen wurde");
  await p.reload(); await p.locator("header.bar").waitFor();
  await customize(p, "arcade-volley");
  assert.equal(await p.locator('.bubble[data-for="regeln"]').getAttribute("data-pos"), pos, "Lage nach Neuladen");
  assert.deepEqual(errs, []);
});

test("Farbfelder per Tastatur: ein Tab-Stopp je Gruppe, Pfeiltasten waehlen und ueberspringen die belegte Farbe", async () => {
  const { p, errs } = await open(b, { view: "desk1280" });
  await customize(p, "arcade-volley");
  await p.locator('.bubble[data-for="farben"]').click(); await p.locator('#dialog[data-part="farben"]').waitFor(); await p.waitForTimeout(300);
  const g = p.locator("#dialog [role=radiogroup]").first();
  const stops = () => g.evaluate((x) => [...x.querySelectorAll(".sw-opt")].filter((o) => o.tabIndex === 0).map((o) => o.dataset.v));
  const state = () => g.evaluate((x) => ({ checked: x.querySelector('[aria-checked="true"]').dataset.v, focus: document.activeElement.dataset.v, order: [...x.querySelectorAll(".sw-opt")].map((o) => ({ v: o.dataset.v, dis: o.disabled })) }));
  const s0 = await state();
  assert.deepEqual(await stops(), [s0.checked], "genau ein Tab-Stopp: die Auswahl");
  await g.locator('[aria-checked="true"]').focus();
  const free = s0.order.filter((o) => !o.dis).map((o) => o.v), taken = s0.order.find((o) => o.dis);
  assert.ok(taken, "eine belegte Farbe (Gegner)");
  let at = free.indexOf(s0.checked);
  for (const [key, d] of [["ArrowRight", 1], ["ArrowRight", 1], ["ArrowDown", 1], ["ArrowLeft", -1], ["ArrowUp", -1], ["ArrowLeft", -1]]) {
    await p.keyboard.press(key); at = (at + d + free.length) % free.length;
    const s = await state();
    assert.equal(s.checked, free[at], key + " waehlt das naechste freie Feld"); assert.equal(s.focus, free[at], key + ": Fokus wandert mit");
    assert.notEqual(s.checked, taken.v); assert.deepEqual(await stops(), [s.checked]);
  }
  await p.keyboard.press("End"); assert.equal((await state()).checked, free[free.length - 1]);
  await p.keyboard.press("Home"); assert.equal((await state()).checked, free[0]);
  // Tab verlaesst die Gruppe in einem Schritt und landet in der Gegner-Gruppe
  await p.keyboard.press("Tab");
  assert.equal(await p.evaluate(() => document.activeElement.closest("[role=radiogroup]") === document.querySelectorAll("#dialog [role=radiogroup]")[1]), true);
  assert.deepEqual(await axe(p, "tastatur"), []);
  assert.deepEqual(errs, []);
});

for (const [fs, root] of [["n", 16], ["g", 19], ["sg", 22]]) {
  test("Blasen-Beschriftung bei Schriftgroesse " + fs + ": mindestens 12 px, mit der Einstellung gross, Blasen ueberlappen nicht", async () => {
    const init = [`try { localStorage.setItem("mdi.konto", JSON.stringify({ pref: { fs: "${fs}" } })); } catch (e) {}`];
    for (const [view, id] of [["phone360", "advent-tuer"], ["phone390", "arcade-volley"], ["desk1280", "gruss"]]) {
      const { p, errs } = await open(b, { view, init });
      await customize(p, id);
      const r = await p.evaluate(() => {
        const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize), bs = [...document.querySelectorAll(".bubbles .bubble")];
        return { rootPx, labels: bs.map((x) => { const l = x.querySelector(".b-label"); return { id: x.dataset.for, px: parseFloat(getComputedStyle(l).fontSize), hidden: l.getAttribute("aria-hidden"), name: x.getAttribute("aria-label"), text: l.textContent }; }),
          rects: bs.map((x) => { const q = x.getBoundingClientRect(); return [q.left, q.top, q.width]; }) };
      });
      assert.ok(Math.abs(r.rootPx - root * 1) < 1, fs + ": Wurzelschrift " + r.rootPx);
      for (const l of r.labels) {
        assert.ok(l.px >= 12 && l.px >= 0.75 * r.rootPx - 0.01, id + "/" + l.id + ": " + l.px + " px");
        assert.equal(l.hidden, null, "Beschriftung sichtbar fuer alle");
        assert.ok(l.name.includes(l.text), "sichtbarer Name steckt im zugaenglichen Namen (WCAG 2.5.3): " + l.name);
      }
      for (let i = 0; i < r.rects.length; i++) for (let j = i + 1; j < r.rects.length; j++) {
        const [a, c] = [r.rects[i], r.rects[j]];
        assert.ok(Math.abs(a[0] - c[0]) >= a[2] - 1 || Math.abs(a[1] - c[1]) >= a[2] - 1, id + " " + view + ": Blasen " + i + "/" + j + " ueberlappen");
      }
      assert.ok(r.rects[0][2] >= Math.max(48, 4.5 * r.rootPx) - 1, "Blase waechst mit der Schrift");
      assert.deepEqual(await axe(p, id + "-" + fs), []);
      assert.deepEqual(errs, []);
      await p.context().close();
    }
  });
}
