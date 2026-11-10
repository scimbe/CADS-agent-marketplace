"use strict";
const { ensureBuilt } = require("../../scripts/ensure-build.js");
// G11 Schätzen der freien Karte (Bauplan A6) über einen echten Link: der Absender hat gesendet, die Empfängerin schätzt
// drei Zahlen am Regler (Frage und Einheit mit data-part für das Blasen-Muster), das Ende zeigt je Frage den Abstand mit
// Einheit und eine feste Gesamtzeile, nirgends ein Prozentzeichen. Der Teil quiz kommt vor dem ersten Schritt.
const test = require("node:test"), assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const D = require("../../src/daily.js"), Tn = require("../../src/turns.js"), P = require("../../src/quizpack.js");
ensureBuilt("");
const me = { emoji: "🐙", nick: "M", colors: ["#2b4bff", "#ffe600"], set: "tiere" };
const RAD = { t: "Meine Radtour", m: "l", q: [["Wie viele km bin ich geradelt?"], ["Wie viele Pausen habe ich gemacht?"], ["Wie viele Höhenmeter waren es?"]], z: [42, 3, 350], u: ["km", "", "m"] };
const hash = (u) => "#" + u.split("#")[1];
const main = (p) => p.locator("#edmain");

test("G11 Schätzen: Regler mit Frage und Einheit als Teile, Ende mit Abstand und Einheit, kein Prozent", async () => {
  let d = D.docFromIdea(D.IDEAS.find((i) => i.turn && i.turn.g === "schaetzen"), me, "de");
  d.pk = P.sanitize(RAD); d = Tn.play(Tn.fresh(d, 77), [0], 100);   // der Absender hat gesendet
  const b = await G.launch(); try {
    const [ana, ben] = await G.people(b, 2, { lang: ["de", "en"], view: "phone390", web: true });
    const p = await G.open(ana, hash(D.docUrl(d)));
    await p.locator("#go").click();
    for (const [i, x] of [[0, 39], [1, 3], [2, 400]]) {
      const frage = p.locator('#panel p.qtext[data-part="frage"]');
      await frage.waitFor();
      assert.equal(await frage.innerText(), RAD.q[i][0]);
      const unit = p.locator('#panel .slide b span[data-part="einheit"]');
      if (RAD.u[i]) assert.equal((await unit.innerText()).trim(), RAD.u[i]); else assert.equal(await unit.count(), 0);
      await p.locator("#panel input[type=range]").evaluate((r, v) => { r.value = v; r.dispatchEvent(new Event("input", { bubbles: true })); }, x);
      assert.equal(await p.locator("#panel .slide b").innerText(), x + (RAD.u[i] ? " " + RAD.u[i] : ""), "Wert und Einheit wie vorher in einer Zeile");
      await p.waitForTimeout(300); await main(p).click();
    }
    await p.locator("#panel").getByText("Ganz nah dran.").first().waitFor();
    const ende = await p.locator("#panel").innerText(), html = await p.locator("#panel").innerHTML();
    console.log("Ende-DOM (de):\n" + ende);
    for (const s of ["Meine Radtour", "Wie viele km bin ich geradelt? (42 km): 3 km daneben", "Wie viele Pausen habe ich gemacht? (3): genau getroffen", "Wie viele Höhenmeter waren es? (350 m): 50 m daneben"]) assert.ok(ende.includes(s), s);
    assert.ok(!ende.includes("%") && !html.includes("%") && !/Prozent/.test(ende), "kein Prozent im Ende-DOM");
    assert.equal(await p.evaluate(() => window.Parts.ready("quiz")), true);
    await main(p).click(); await p.locator("#share").waitFor();
    const done = await p.evaluate(() => window.DailyDebug.result().url);
    // zurück, auf Englisch: dieselben Abstände
    const q = await G.open(ben, hash(done));
    await q.locator("#go").click();
    await q.locator("#panel").getByText("Very close.").first().waitFor();
    const en = await q.locator("#panel").innerText();
    assert.ok(en.includes("Wie viele km bin ich geradelt? (42 km): 3 km off"), en); assert.ok(!en.includes("%") && !/percent/i.test(en));
    for (const x of [p, q]) assert.deepEqual(x.errs, []);
  } finally { await b.close(); }
});
