// Katalog v2, W0: the catalog as a part, the parts turn2/logik/daten, the font token in Mein Stil, the privacy line,
// "Daten fehlen" and the k=5 threshold, on the screens and in the languages of test/e2e/lib/grund.js.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs"), http = require("node:http");
const { execFileSync } = require("node:child_process");
const G = require("./lib/grund.js");
const root = path.join(__dirname, "../..");
execFileSync(process.execPath, [path.join(root, "scripts/build.js")]);
execFileSync(process.execPath, [path.join(root, "scripts/build.js"), "--flavor", "business"]);
const shot = process.env.W0_SHOTS;
const snap = (p, n) => (shot ? p.screenshot({ path: path.join(shot, "w0-grundlagen-nachher-" + n + ".png") }) : null);
const loaded = (p) => p.evaluate(() => [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src").replace(/^.*\/parts\//, "").split(".")[0]));

// The web route: /duell/ and its parts, one of them refused (404) to see what the page does without it.
function serve(missing) {
  const dist = G.DIST, srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), m = u.pathname.match(/^\/duell\/parts\/([a-z0-9]+)\.[0-9a-f]{12}\.js$/);
    if (u.pathname === "/duell/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return void res.end(fs.readFileSync(path.join(dist, "index.html"))); }
    if (m && m[1] !== missing) { res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }); return void res.end(fs.readFileSync(path.join(dist, u.pathname.slice(7)))); }
    res.writeHead(404).end();
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

test("Alle Bildschirme x de/en: erstes Blatt erst mit dem Katalog-Teil, Hauptknopf ohne Scrollen sichtbar, keine Fehler", async () => {
  const b = await G.launch(); try {
    for (const view of Object.keys(G.VIEWS)) for (const lang of G.LANGS) {
      const ctx = await G.person(b, { view, lang }), p = await G.open(ctx, "", {});
      assert.deepEqual((await loaded(p))[0], "katalog", "der Katalog kommt als erster Teil");
      assert.equal(await p.evaluate(() => window.Daily.full()), true, view + " " + lang);
      const go = (await p.locator("#go").innerText()).trim();
      assert.ok(go.length > 0, "Hauptknopf beschriftet");
      assert.ok(await G.inView(p, "#go"), "Hauptknopf sichtbar: " + view + " " + lang);
      assert.deepEqual(await G.covered(p), [], "nichts liegt auf den Knoepfen: " + view + " " + lang);
      assert.equal(await p.evaluate(() => window.Kit.lang), lang);
      await snap(p, "start-" + view + "-" + lang);
      assert.deepEqual(p.errs, [], view + " " + lang); await ctx.close();
    }
  } finally { await b.close(); }
});

// A card with a picture (the gallery server is played here with a generated JPEG): on a short screen the picture shrinks
// or steps aside, the main button stays visible without scrolling, nothing lies on it or on the buttons below, and the
// sheet's text stays on the sheet. Fixed cards, not the card of the day: lob (picture + dice), danke (name field too),
// lava (a game: drawn preview, no picture), and a received lob (drawn card with the picture above it).
test("Karte mit Bild auf allen Bildschirmen: Hauptknopf ohne Scrollen, Bild und Blatt decken keinen Knopf zu", async () => {
  const b = await G.launch(); try {
    const pic = await (async () => { const c = await b.newContext({ viewport: { width: 320, height: 180 } }), p = await c.newPage(); await p.setContent('<body style="margin:0;background:linear-gradient(90deg,#ffd400,#ff3b1d)">'); const j = await p.screenshot({ type: "jpeg", quality: 70 }); await c.close(); return j; })();
    for (const card of ["karte-lob", "warm-danke", "spiel-lava", "empfangen"]) for (const view of Object.keys(G.VIEWS)) {
      const ctx = await G.person(b, { view, lang: "de" });
      await ctx.route(/^https?:/, (r) => (/\/duell\/img\/[a-z0-9-]+\.jpg$/.test(r.request().url()) ? r.fulfill({ status: 200, headers: { "Content-Type": "image/jpeg", "Access-Control-Allow-Origin": "*" }, body: pic }) : r.abort()));
      const p = await G.open(ctx, card === "empfangen" ? "" : "#i=" + card), at = card + " " + view;
      if (card === "empfangen") {   // a card someone sent: its drawn card and the picture above it
        await p.evaluate(() => { const D = window.Daily, d = D.docFromIdea(D.byId("karte-lob"), D.sanitizeProfile({ nick: "Ben" }), "de"); location.hash = D.docUrl(D.withTrail(d, "Ben", ["text"])).split("#")[1]; });
        await p.locator("#leaf .pv.pic.with").waitFor({ state: "attached" });
      }
      if (card !== "spiel-lava") await p.waitForFunction(() => document.querySelector("#leaf .pvimg img").complete);
      await p.waitForTimeout(600);   // the sheet's entry animation
      if (view === "phone390" && card !== "spiel-lava") assert.ok(await p.locator("#leaf .pv.pic .pvimg").isVisible(), "das Bild steht auf dem Blatt: " + at);
      assert.ok(await G.inView(p, "#go"), "Hauptknopf sichtbar: " + at);
      assert.deepEqual(await G.covered(p), [], "nichts liegt auf den Knoepfen: " + at);
      const leaf = await p.evaluate(() => { const l = document.getElementById("leaf"); return [l.scrollHeight, l.clientHeight]; });
      assert.ok(leaf[0] <= leaf[1] + 1, "der Text bleibt auf dem Blatt: " + at + " " + leaf.join(">"));
      await snap(p, "bild-" + card + "-" + view);
      assert.deepEqual(p.errs, [], at); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Katalog-Teil: Kern traegt nur den Index; Suche findet ueber Titel und Schlagworte, nach dem Teil hat jede Karte ihre vollen Felder", async () => {
  const b = await G.launch(); try {
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await G.open(ctx, "");
    const html = fs.readFileSync(path.join(G.DIST, "index.html"), "utf8"), idx = JSON.parse(html.match(/window\.DuellIdeas=(\{.*?\});window\./)[1]);
    assert.equal(idx.index, true); assert.ok(!JSON.stringify(idx).includes('"lines"'), "Kartentexte nur im Teil");
    const n = await p.evaluate(() => window.Daily.IDEAS.length);
    assert.equal(n, idx.ideas.length);
    assert.ok(await p.evaluate(() => window.Daily.IDEAS.every((i) => i.de && i.de.s && i.en && i.en.s)), "nach dem Teil hat jede Karte ihre Unterzeile");
    const hits = await p.evaluate(() => window.Daily.searchIdeas("quiz", new Date()).map((h) => h.idea.id));
    assert.ok(hits.length >= 3, "Suche: " + hits.join(","));
    assert.deepEqual(p.errs, []); await ctx.close();
  } finally { await b.close(); }
});

test("Ohne Katalog-Teil (Web, Datei fehlt): das Blatt steht trotzdem, als Karte mit Titel, und die Seite sagt, dass ein Teil fehlt", async () => {
  const srv = await serve("katalog"), b = await G.launch(); try {
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto("http://127.0.0.1:" + srv.address().port + "/duell/");
    await p.locator("#toast.show").getByText("Dieser Teil fehlt gerade").waitFor();
    await p.locator("#go").waitFor();
    assert.equal(await p.evaluate(() => window.Daily.full()), false);
    assert.equal(await p.evaluate(() => window.DailyDebug.home().idea.id.length > 0), true);
    assert.ok((await p.locator("#leaf .hero").innerText()).trim().length > 0, "Titel aus dem Index");
    await snap(p, "ohne-katalog");
    assert.deepEqual(errs, []); await ctx.close();
  } finally { await b.close(); srv.close(); }
});

test("Mein Stil: Schriftgroesse normal / gross / sehr gross setzt --fs, bleibt nach dem Neuladen, de und en", async () => {
  const b = await G.launch(); try {
    for (const [lang, big, huge] of [["de", "Groß", "Sehr groß"], ["en", "Large", "Extra large"]]) {
      const ctx = await G.person(b, { view: "phone390", lang }), p = await G.open(ctx, "");
      await p.locator("#me").click();
      await p.locator("#shbody .chip.fs").first().waitFor();
      if (lang === "de") { await p.locator("#shbody .chip.fs").first().scrollIntoViewIfNeeded(); await snap(p, "stil-normal"); }
      const fs0 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#shbody .note")).fontSize));
      await p.locator("#shbody .chip.fs", { hasText: new RegExp("^" + big + "$") }).click();
      assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fs").trim()), "1.25");
      const fs1 = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#shbody .note")).fontSize));
      assert.equal(fs1, fs0 * 1.25, "Nebentext waechst mit");
      await p.locator("#shbody .chip.fs", { hasText: huge }).click();
      if (lang === "de") { await p.locator("#shbody .chip.fs").first().scrollIntoViewIfNeeded(); await snap(p, "stil-sehr-gross"); }
      assert.equal(await p.evaluate(() => document.documentElement.getAttribute("data-fs")), "sg");
      await p.reload(); await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
      assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fs").trim()), "1.5", "bleibt auf dem Geraet");
      assert.ok(await G.inView(p, "#go"), "Hauptknopf bei sehr grosser Schrift sichtbar");
      assert.deepEqual(p.errs, []); await ctx.close();
    }
  } finally { await b.close(); }
});

test("Bausteine: Datenschutz-Zeile aus Kartenfeldern (de/en, Plural), Daten-Teil mit Feiertagen, ohne Teil 'Daten fehlen'", async () => {
  const b = await G.launch(), srv = await serve("daten"); try {
    for (const lang of G.LANGS) {
      const ctx = await G.person(b, { view: "phone328", lang }), p = await G.open(ctx, "");
      const line = await p.evaluate(() => { const r = window.Bausteine.wswRow({ link: ["name", "stimme"], ki: false, server: false, tage: 1 }); document.querySelector("#home").prepend(r); return r.innerText; });
      assert.equal(line, lang === "de"
        ? "Wer sieht was? Im Link stehen Namen und Stimmen. Keine KI. Kein Server speichert etwas. Der Link verfällt nach 1 Tag. Wer den Link sieht, sieht das auch, zum Beispiel im Gruppenchat."
        : "Who sees what? The link carries names and votes. No AI. No server keeps anything. The link expires after 1 day. Anyone who sees the link sees this too, for example in a group chat.");
      assert.match(await p.evaluate(() => window.Bausteine.wsw({ tage: 30 })), lang === "de" ? /nach 30 Tagen\./ : /after 30 days\./);
      if (lang === "de") { await p.waitForTimeout(800); await snap(p, "wsw-zeile"); }
      const r = await p.evaluate(() => { const box = document.createElement("div"); document.body.appendChild(box); return window.Bausteine.daten(box, (K) => K.feiertage("BY", "2027", "de").map((h) => h.d + " " + h.name)); });
      assert.ok(r.includes("2027-01-06 Heilige Drei Könige") && r.includes("2027-03-26 Karfreitag"), r.join(" | "));
      assert.equal(await p.evaluate(() => window.Parts.ready("daten")), true);
      // a year the file does not have: the card says so instead of guessing
      const miss = await p.evaluate(async () => { const box = document.createElement("div"); document.body.appendChild(box); await window.Bausteine.daten(box, (K) => K.feiertage("BY", "2031", "de")); return box.innerText; });
      assert.equal(miss, lang === "de" ? "Daten fehlen" : "Data missing");
      for (const n of ["turnzwei", "logik"]) await p.evaluate((x) => window.Parts.need(x), n);
      assert.deepEqual(await p.evaluate(() => [window.Turn2.kinds(), window.Logik.kinds(), window.Logik.list("gen")]), [["rule", "widget"], ["gen"], []]);
      assert.ok(await p.evaluate(() => window.Turn2.list("rule").includes("feier") && window.Turn2.list("widget").every((w) => /^[a-z][a-z0-9-]*$/.test(w))), "Karten registrieren sich im Teil (biz-weihnachtsfeier: feier)");
      assert.deepEqual(p.errs, []); await ctx.close();
    }
    // the part file itself missing (web): "Daten fehlen" on the card, nothing else breaks
    const ctx = await G.person(b, { view: "phone390", lang: "de" }), p = await ctx.newPage(), errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto("http://127.0.0.1:" + srv.address().port + "/duell/"); await p.locator("#go").waitFor();
    const miss = await p.evaluate(async () => { const box = document.createElement("div"); box.id = "dbox"; document.querySelector("#home").prepend(box); const r = await window.Bausteine.daten(box, () => 1); return [r, box.innerText]; });
    assert.deepEqual(miss, [null, "Daten fehlen"]);
    await snap(p, "daten-fehlen");
    assert.deepEqual(errs, []); await ctx.close();
  } finally { await b.close(); srv.close(); }
});

test("k=5 ueber drei Geraete (Business, de/en/de): Feedback ohne Namen zeigt unter 5 Stimmen kein Ergebnis, ab 5 den Schnitt", async () => {
  const b = await G.launch(); try {
    const [ana, ben, cem] = await G.people(b, 3, { lang: ["de", "en", "de"], view: ["phone390", "quer", "zoom200"] });
    const a = await G.open(ana, "", { flavor: "business" });
    const link = (n) => a.evaluate((k) => {
      const D = window.Daily, Tn = window.Turns; let d = D.docFromIdea(D.byId("biz-feedback-workshop"), window.DailyApp.me(), "de"); d.seed = 77;
      d = Tn.play(d, ["Workshop Montag"], 0); for (let i = 0; i < k; i++) d = Tn.play(d, [1 + (i % 5), ["Notiz " + i]], 0);
      return "#" + D.docUrl(d).split("#")[1];
    }, n);
    const face = (p) => p.evaluate(() => window.Office.face(window.DailyDebug.home().doc, window.Kit.lang));
    const p4 = await G.open(ben, await link(4), { flavor: "business" });
    assert.deepEqual(await face(p4), ["Workshop Montag", "Not enough votes yet: 4 of 5. The result shows from 5.", "No names"]);
    await p4.locator("#go").waitFor(); await snap(p4, "k5-vier-en-quer");
    const p5 = await G.open(cem, await link(5), { flavor: "business" });
    assert.deepEqual(await face(p5), ["Workshop Montag", "Ø 3 von 5 · 5 Rückmeldungen", "Ohne Namen"]);
    assert.ok(await G.inView(p5, "#go"), "Hauptknopf bei 200 % Zoom sichtbar");
    await snap(p5, "k5-fuenf-de-zoom200");
    for (const p of [a, p4, p5]) assert.deepEqual(p.errs, []);
  } finally { await b.close(); }
});
