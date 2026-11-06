"use strict";
// Katalog v2, wave V1, PR "wichteln": geschenk-finder and zug-wunschzettel (daily), biz-wichtel-ideen and biz-wichteln
// (Daily Business). Each card runs end to end over real links between 2-6 browser contexts (own storage, own language),
// pinned with #i=<id>, never through the day's sheet. The AI is mocked in the exact shape of CADS-DEMO-wrapper kind liste;
// every card also runs with no network at all. Screenshots go to SHOT_DIR when it is set.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const G = require("./lib/grund.js");
const shot = process.env.SHOT_DIR;
const API = "https://demos-34a13a96.bunsenbrenner.org/api/duell/";
const hash = (u) => "#" + u.split("#")[1];
// Every person here is one device with several pages open (each link opens a new page) that relies on what its other
// pages stored, so the pages come from G's local web origin, not file:// (see lib/grund.js, person({ web: true })).
const url = (p) => p.evaluate(() => window.DailyDebug.result().url);
const send = async (p) => { await p.locator("#edmain").click(); await p.locator("#share").waitFor(); return url(p); };
const panel = (p) => p.locator("#panel");
const tap = (p, name) => panel(p).getByRole("button", { name, exact: true }).click();
const next = (p) => p.locator("#edmain").click();
const snap = async (p, name) => { if (shot) { fs.mkdirSync(shot, { recursive: true }); await p.screenshot({ path: shot + "/" + name + ".png" }); } };
const decoded = (u) => Buffer.from(u.split("#c=")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
// The main button: fully on screen and nothing lies over its centre (rule A4, H4).
async function mainFree(p, sel) {
  return p.evaluate((s) => {
    const e = document.querySelector(s); if (!e || !e.offsetParent) return s + " fehlt";
    const r = e.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > innerHeight + 0.5 || r.right > innerWidth + 0.5) return s + " nicht im Bild " + JSON.stringify([r.top, r.bottom, innerHeight]);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit && (hit === e || e.contains(hit)) ? "" : s + " verdeckt von " + (hit ? hit.id || hit.className : "nichts");
  }, sel);
}
let b;
test.before(async () => { b = await G.launch(); });
test.after(async () => { await b.close(); });

test("Geschenk in drei Fragen: drei Fragen, fünf Ideen ohne KI, Einladung an eine zweite Person (en), Ergebnis zurück, weiter zu Geld einsammeln", async () => {
  const [ana, ben] = await G.people(b, 2, { lang: ["de", "en"], view: ["phone390", "phone328"], web: true });
  const a = await G.open(ana, "#i=geschenk-finder");
  await a.locator("#go").click();
  assert.equal(await a.locator("#edmain").getAttribute("aria-disabled"), "true", "Weiter gesperrt, bis gewählt ist");
  assert.match(await a.locator("#edwhy").textContent(), /Noch offen: Für wen\?/);
  await panel(a).getByText(/^Wer sieht was\?/).waitFor();
  await snap(a, "geschenk-1-fuer-wen");
  await tap(a, "Oma oder Opa");                          // one tap, on by itself
  await tap(a, "bis 30 €");
  await tap(a, "Lesen und Schreiben"); await tap(a, "Pflanzen");
  assert.equal(await panel(a).locator('.chip[aria-pressed="true"]').count(), 2);
  await snap(a, "geschenk-2-vorlieben");
  await next(a);
  await panel(a).getByText("Ohne KI, aus unserer Liste, im Budget.").waitFor();
  const ideas = await panel(a).locator(".gfrow .chip").allInnerTexts();
  assert.equal(ideas.length, 5, ideas.join());
  assert.ok(ideas.some((x) => /Buch|Lese|Pflanze|Notiz|Futterhaus|Wanderführer|Lupe|Rätsel/.test(x)), "passend zu Lesen/Pflanzen: " + ideas.join());
  assert.ok(await panel(a).getByRole("button", { name: /Ideen mit KI/ }).isVisible(), "KI nur als Angebot");
  await snap(a, "geschenk-3-ideen");
  await panel(a).locator(".gfrow .chip").nth(1).click();
  await next(a);
  await panel(a).getByText(/Idee steht/).waitFor();
  assert.equal(await a.locator("#edmain").textContent(), "Einladung schicken");
  const one = await send(a);
  await snap(a, "geschenk-4-teilen");
  assert.ok(!decoded(one).includes(ideas[1]), "die Idee steht verschleiert im Link, nicht lesbar");

  const c = await G.open(ben, hash(one));
  assert.equal(await c.locator("#go").textContent(), "Help choose");
  await c.locator("#go").click();
  await panel(c).getByText("Suggested: " + ideas[1] + ". Which idea is best?").waitFor();
  assert.deepEqual(await panel(c).locator(".chips .chip").allInnerTexts(), ideas, "dieselben fünf Ideen auf dem zweiten Gerät (Texte reisen in der Sprache der Absenderin)");
  await snap(c, "geschenk-5-zweite-person-en");
  await panel(c).getByRole("button", { name: ideas[3], exact: true }).click();
  const back = await send(c);

  const r = await G.open(ana, hash(back));
  await r.locator("#go").click();
  await panel(r).getByText("Zwei Favoriten").waitFor();
  await panel(r).getByText("Erste Wahl: " + ideas[1]).waitFor(); await panel(r).getByText("Zweite Stimme: " + ideas[3]).waitFor(); await panel(r).getByText("bis 30 €").waitFor();
  await snap(r, "geschenk-6-ergebnis");
  await panel(r).getByRole("button", { name: "Gemeinsam bezahlen: Geld einsammeln" }).click();
  await G.poll(() => r.evaluate(() => window.DailyDebug.doc().g), (g) => g === "sammeln", { what: "weiter zur Karte Geld einsammeln" });
  for (const p of [a, c, r]) assert.deepEqual(p.errs, []);
  await ana.close(); await ben.close();
});

test("Wunschzettel mit Geheimnis: Kind schreibt, Familie reserviert verdeckt über Links (3 Geräte, de/en), das Kind sieht nie, wer was schenkt", async () => {
  const [kid, mom, oma] = await G.people(b, 3, { lang: ["de", "en", "de"], view: ["phone390", "phone390", "phone328"], web: true });
  const k = await G.open(kid, "#i=zug-wunschzettel");
  await k.locator("#go").click();
  const add = async (p, s) => { const f = panel(p).locator("form.shopadd input"); await f.fill(s); await f.press("Enter"); };
  for (const w of ["Hörbuch", "Fahrradlicht", "Puzzle"]) await add(k, w);
  assert.deepEqual(await panel(k).locator(".shoprow b").allInnerTexts(), ["Hörbuch", "Fahrradlicht", "Puzzle"]);
  assert.equal(await panel(k).getByRole("button", { name: /Ich schenke das/ }).count(), 0, "die wünschende Person reserviert nicht");
  await panel(k).getByRole("button", { name: /Mein Link \(nur Wünsche\)/ }).click();
  const own = await k.evaluate(() => window.Turn2.ownLink);
  assert.match(own, /#c=/);
  await snap(k, "wunsch-1-kind");
  const B0 = await send(k);
  await snap(k, "wunsch-2-teilen");

  const m = await G.open(mom, hash(B0));
  await m.locator("#go").click();
  await panel(m).getByRole("button", { name: "I'm giving something → show reservations" }).click();   // a new phone asks first
  await panel(m).locator("input.field").last().fill("Mom");
  await panel(m).getByRole("button", { name: "I'll give this: Hörbuch" }).click();
  await panel(m).getByText("You're giving this").waitFor();
  await snap(m, "wunsch-3-mama-en");
  const B1 = await send(m);

  const o = await G.open(oma, hash(B1));
  await o.locator("#go").click();
  await panel(o).getByRole("button", { name: "Ich schenke etwas → Reservierungen zeigen" }).click();
  const taken = panel(o).getByRole("button", { name: "Ich schenke das: Hörbuch" });
  assert.equal(await taken.getAttribute("aria-disabled"), "true", "vergeben sieht gesperrt aus");
  await panel(o).getByText("Schon vergeben").waitFor();
  await o.waitForTimeout(300); await taken.click({ force: true });   // the step takes taps 250 ms after it is drawn
  assert.equal(await o.locator("#toast").textContent(), "Schon vergeben");
  assert.ok(!(await panel(o).innerText()).includes("Mom"), "kein Name, auch nicht für die Familie");
  await panel(o).locator("input.field").last().fill("Oma");
  await panel(o).getByRole("button", { name: "Ich schenke das: Puzzle" }).click();
  await snap(o, "wunsch-4-oma");
  const B2 = await send(o);

  // Mom again: her own reservation stays, Oma's shows as taken
  const m2 = await G.open(mom, hash(B2)); await m2.locator("#go").click();
  // the list is drawn after the tap: read it once all three rows and Mom's own mark are there
  const rows = await G.poll(() => panel(m2).locator(".shoprow").allInnerTexts(), (r) => r.length === 3 && /You're giving this/.test(r[0]), { what: "Mamas Liste" });
  assert.match(rows[0], /Hörbuch\s+You're giving this/); assert.match(rows[2], /Puzzle\s+Already taken/); assert.doesNotMatch(rows[1], /taken|giving/);

  // The kid's phone opens the family link: wishes only, no mark, no name, no gift button
  const k2 = await G.open(kid, hash(B2)); await k2.locator("#go").click();
  const seen = await panel(k2).innerText();
  assert.ok(!/vergeben|Du schenkst|Mom|Oma|🎁/.test(seen), seen);
  assert.deepEqual(await panel(k2).locator(".shoprow b").allInnerTexts(), ["Hörbuch", "Fahrradlicht", "Puzzle"]);
  await panel(k2).getByText("Was wünschst du dir? Eintippen, Enter setzt es auf den Zettel.").waitFor();
  await snap(k2, "wunsch-5-kind-sieht-nichts");
  // the picture that goes into the chat names nobody either (the card's sheet)
  const pic = await k2.evaluate(() => window.DailyDebug.doc() && JSON.stringify(window.Turns.face(window.DailyDebug.doc(), "de")));
  assert.equal(pic, '["3 Wünsche"]');
  // Her own link carries no mark and no name at all, and her phone shows it as hers
  assert.ok(!/Mom|Oma/.test(JSON.stringify(await k.evaluate((u) => { const r = window.Daily.parseRoute("#" + u.split("#")[1]); return window.Turns.unseal(r.doc.q, r.doc.seed); }, own))));
  const k3 = await G.open(kid, hash(own)); await k3.locator("#go").click();
  await panel(k3).getByText("Den Link an die Familie schicken. Wer was schenkt, siehst du nie.").waitFor();
  for (const p of [k, m, o, m2, k2, k3]) assert.deepEqual(p.errs, []);
  await kid.close(); await mom.close(); await oma.close();
});

// HOLD fix: reservations never end the list. Her phone looks the same with no wish and with every wish reserved (sheet,
// editor, card picture); only her own tap on "Wunschzettel schließen" ends it, and until then givers can still let go.
test("Wunschzettel: das Gerät des Kindes sieht mit keiner und mit allen Reservierungen gleich aus, nur das Kind schließt (3 Geräte, de/en)", async () => {
  const [kid, mom, opa] = await G.people(b, 3, { lang: ["de", "en", "de"], view: ["phone390", "phone390", "phone328"], web: true });
  const k = await G.open(kid, "#i=zug-wunschzettel");
  await k.locator("#go").click();
  for (const w of ["Lego", "Buch"]) { const f = panel(k).locator("form.shopadd input"); await f.fill(w); await f.press("Enter"); }
  const L0 = await send(k);
  // what the kid's phone shows of a family link: the sheet, its picture, the editor, its picture and the main button
  const look = async (link, name) => {
    const p = await G.open(kid, hash(link));
    // sheet and pictures once they have settled (drawn and no longer changing), not after a fixed pause
    const sheetPic = await G.settled(() => p.evaluate(() => document.querySelector("#leaf .pvcard").toDataURL()), { what: "Blatt-Bild" });
    const sheet = await p.locator("#leaf").innerText();
    await snap(p, name + "-blatt");
    await p.locator("#go").click(); await panel(p).locator(".shoprow").first().waitFor();
    const pic = await G.settled(() => p.evaluate(() => document.getElementById("stage").toDataURL()), { what: "Editor-Bild" });
    const out = { sheet, sheetPic, editor: await panel(p).innerText(), main: await p.locator("#edmain").textContent(),
      pic, face: await p.evaluate(() => JSON.stringify(window.Turns.face(window.DailyDebug.doc(), "de"))) };
    await snap(p, name + "-editor");
    assert.deepEqual(p.errs, []);
    return { p, out };
  };
  const none = await look(L0, "wunsch-gleich-0-reserviert");
  await none.p.close();

  const m = await G.open(mom, hash(L0)); await m.locator("#go").click();
  await panel(m).getByRole("button", { name: /→ (show reservations|Reservierungen zeigen)$/ }).click();   // a new phone asks first
  await panel(m).locator("input.field").last().fill("Mom");
  await panel(m).getByRole("button", { name: "I'll give this: Lego" }).click();
  const L1 = await send(m);
  const o = await G.open(opa, hash(L1)); await o.locator("#go").click();
  await panel(o).getByRole("button", { name: /→ (show reservations|Reservierungen zeigen)$/ }).click();
  await panel(o).locator("input.field").last().fill("Opa");
  await o.waitForTimeout(300);
  await panel(o).getByRole("button", { name: "Ich schenke das: Buch" }).click();
  const L2 = await send(o);
  assert.equal(await o.evaluate((u) => { const r = window.Daily.parseRoute("#" + u.split("#")[1]); return window.Turns.state(r.doc).over; }, L2), false, "alles vergeben, Zettel bleibt offen");

  const all = await look(L2, "wunsch-gleich-alle-reserviert");
  for (const k2 of Object.keys(none.out)) assert.deepEqual(all.out[k2], none.out[k2], "Kind sieht dasselbe: " + k2);
  assert.ok(!/vergeben|Ergebnis|Mom|Opa|🎁/.test(all.out.sheet + all.out.editor), all.out.sheet + " | " + all.out.editor);
  assert.equal(all.out.main, "Einladung schicken");

  // a giver can still let go and take the other wish (the list is not locked)
  const m2 = await G.open(mom, hash(L2)); await m2.locator("#go").click();
  await panel(m2).getByRole("button", { name: "I'll give this: Lego" }).click();
  await panel(m2).getByText("You're giving this").waitFor({ state: "detached" });
  await m2.close();

  // only the kid closes: one tap, then a second to be sure
  const kp = all.p;
  await kp.waitForTimeout(300);
  await panel(kp).getByRole("button", { name: "🔒 Wunschzettel schließen" }).click();
  await panel(kp).getByText("Schließen? Danach ändert niemand mehr etwas am Zettel, auch du nicht.").waitFor();
  await snap(kp, "wunsch-gleich-schliessen-frage");
  await panel(kp).getByRole("button", { name: "Ja, schließen" }).click();
  await panel(kp).getByText("Wunschzettel geschlossen").waitFor();
  assert.deepEqual((await panel(kp).locator(".note").allInnerTexts()).filter((x) => x === "Lego" || x === "Buch"), ["Lego", "Buch"]);
  await snap(kp, "wunsch-gleich-geschlossen");
  const L3 = await send(kp);
  // the family gets the closed list: no gift buttons any more, nobody named
  const m3 = await G.open(mom, hash(L3));
  assert.match(await m3.locator("#leaf").innerText(), /The wish list is closed\./);
  await m3.locator("#go").click();
  await panel(m3).getByText("Wish list closed").waitFor();
  assert.equal(await panel(m3).getByRole("button", { name: /I'll give this/ }).count(), 0);
  assert.ok(!/Mom|Opa/.test(await panel(m3).innerText()));
  await snap(m3, "wunsch-gleich-familie-geschlossen-en");
  for (const p of [k, m, o, kp, m3]) assert.deepEqual(p.errs, []);
  await kid.close(); await mom.close(); await opa.close();
});

test("Business Wichtelideen: ohne KI fünf Ideen im Budget, mit KI (gemockt) nur harmlose Ideen, Kollegin wählt per Link (en)", async () => {
  const [tanja, kemal] = await G.people(b, 2, { lang: ["de", "en"], view: ["quer", "phone390"], web: true });
  const sent = [];
  await tanja.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem("daily.v1") || "{}"); s.aiDev = "0123456789abcdef0123456789abcdef"; s.aiProof = "e2e"; s.muted = true; localStorage.setItem("daily.v1", JSON.stringify(s)); } catch (e) {} });
  await tanja.route(/^https?:/, async (r) => {
    const u = r.request().url();
    if (G.isLocal(u)) return r.fallback();   // the page itself
    if (!u.startsWith(API)) return r.abort();
    const path = u.slice(API.length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path, body });
    const meter = { free: 7, remaining: 6, period: "week" };
    if (path === "ai") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ kind: "liste", options: [{ art: "einkauf", titel: "Wichteln", personen: 0, vegetarisch: 0, aufgaben: [],
      posten: [{ n: "Teesorten-Set", kat: "getraenke", m: "fix", e: "packung", veg: true }, { n: "Rotwein", kat: "getraenke", m: "fix", e: "flasche", veg: true }, { n: "Sukkulente im Topf", kat: "sonstiges", m: "fix", e: "stueck", veg: true },
        { n: "Kräutertee", kat: "getraenke", m: "fix", e: "packung", veg: true }, { n: "Mini-Kaktus", kat: "sonstiges", m: "fix", e: "stueck", veg: true }] }], seals: ["s2.liste.e2e1.sigsigsig"], cost: 1, receipt: "rc-wi-1", meter }) });
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ meter }) });
  });
  const t = await G.open(tanja, "#i=biz-wichtel-ideen", { flavor: "business" });
  await t.locator("#go").click();
  await panel(t).getByText("Nicht-Teilnahme hat keine Folgen.").waitFor();
  await panel(t).getByText(/Betriebsrat/).waitFor();
  await tap(t, "bis 10 €");
  await tap(t, "Tee und Kaffee"); await tap(t, "Pflanzen"); await next(t);
  const std = await panel(t).locator(".gfrow .chip").allInnerTexts();
  assert.equal(std.length, 5);
  assert.equal(sent.filter((x) => x.path === "ai").length, 0, "ohne Tipp auf ✨ geht nichts raus");
  await snap(t, "wichtelideen-1-ohne-ki");
  await panel(t).getByRole("button", { name: /Ideen mit KI/ }).click();
  await panel(t).getByText("Ideen der KI: Preis bitte selbst prüfen.").waitFor();
  const ki = await panel(t).locator(".gfrow .chip").allInnerTexts();
  assert.deepEqual(ki, ["Teesorten-Set", "Sukkulente im Topf", "Kräutertee", "Mini-Kaktus"], "Rotwein fällt weg");
  const req = sent.find((x) => x.path === "ai").body;
  assert.equal(req.kind, "liste"); assert.deepEqual(req.input, { art: "einkauf", satz: "Kleine Geschenkideen für Kollegin oder Kollege, bis 10 €, mag: Tee und Kaffee, Pflanzen" });
  await snap(t, "wichtelideen-2-mit-ki");
  await panel(t).getByRole("button", { name: "Sukkulente im Topf", exact: true }).click();
  await t.waitForFunction(() => window.DailyDebug.doc().ki && window.DailyDebug.doc().ki.k === "liste");
  await G.poll(() => sent.some((x) => x.path === "ai/accept"), Boolean, { what: "erst die gewählte KI-Idee wird abgerechnet" });
  await next(t);
  const one = await send(t);
  assert.match(one, /^https:\/\/demos-34a13a96\.bunsenbrenner\.org\/duell\/business\/#c=/, "Langlink im Firmennetz");

  const k = await G.open(kemal, hash(one), { flavor: "business" });
  await k.locator("#go").click();
  await panel(k).getByText("Suggested: Sukkulente im Topf. Which idea is best?").waitFor();
  await panel(k).getByText("Not taking part has no consequences.").waitFor();
  await snap(k, "wichtelideen-3-kollegin-en");
  await panel(k).getByRole("button", { name: "Sukkulente im Topf", exact: true }).click();
  const back = await send(k);
  const r = await G.open(tanja, hash(back), { flavor: "business" }); await r.locator("#go").click();
  await panel(r).getByText("Einig: Sukkulente im Topf").waitFor();
  assert.equal(await panel(r).getByRole("button", { name: /Geld einsammeln/ }).count(), 0, "Business führt nicht zu PayPal");
  await snap(r, "wichtelideen-4-ergebnis");
  for (const p of [t, k, r]) assert.deepEqual(p.errs, []);
  await tanja.close(); await kemal.close();
});

test("Büro-Wichteln: fünf Personen tragen sich auf fünf Geräten selbst ein, die Organisatorin zieht, jedes Gerät öffnet nur den eigenen Zettel; ein sechstes Gerät öffnet keinen (de/en)", async () => {
  const time = "2026-11-23T09:00:00+01:00";
  const [org, ben, cem, dag, eva, fremd] = await G.people(b, 6, { lang: ["de", "en", "de", "en", "de", "de"], view: ["quer", "phone390", "phone328", "phone390", "zoom200", "phone390"], time, web: true });
  const biz = { flavor: "business" };
  const unsealed = (p, u) => p.evaluate((x) => { const r = window.Daily.parseRoute("#" + x.split("#")[1]); return { seed: r.doc.seed, m: window.Turns.unseal(r.doc.q, r.doc.seed) }; }, u);
  // 1. the organiser: budget, kind, day; the group link carries no names yet
  const o = await G.open(org, "#i=biz-wichteln", biz);
  await o.locator("#go").click();
  await tap(o, "bis 15 €");
  await tap(o, "Selbstgemacht");
  const day = await panel(o).locator('input[type="date"]').inputValue();
  assert.equal(day, "2026-12-11", "vorbelegt: ein Freitag gut zwei Wochen voraus");
  await panel(o).locator('input[type="date"]').fill("2026-12-18"); await panel(o).locator('input[type="date"]').dispatchEvent("change");
  await snap(o, "wichteln-1-tag");
  await next(o);
  await panel(o).getByText("Fertig. Den Link in die Teamgruppe schicken, damit sich alle eintragen.").waitFor();
  const L0 = await send(o);
  assert.match(L0, /^https:\/\/demos-34a13a96\.bunsenbrenner\.org\/duell\/business\/#c=/);
  // 2. the organiser signs up herself on her own phone (she opens the group link like everyone)
  const o1 = await G.open(org, hash(L0), biz);
  await o1.locator("#go").click();
  await panel(o1).getByText("Noch niemand eingetragen.").waitFor();
  await panel(o1).getByText(/Dieses Gerät hat das Wichteln angelegt und zieht/).waitFor();
  assert.equal(await panel(o1).getByRole("button", { name: "Jetzt ziehen (0 dabei)" }).getAttribute("aria-disabled"), "true");
  await panel(o1).locator("input.field").fill("Ana"); await panel(o1).getByRole("button", { name: "Mitmachen", exact: true }).click();
  await panel(o1).getByText("Auf diesem Gerät eingetragen: Ana.").waitFor();
  // 3. four more people, each on their own phone, each from the group link, each sends their own link back
  const back = [];
  for (const [ctx, me, lang] of [[ben, "Ben", "en"], [cem, "Cem", "de"], [dag, "Dag", "en"], [eva, "Eva", "de"]]) {
    const p = await G.open(ctx, hash(L0), biz);
    await p.locator("#go").click();
    await panel(p).getByText(lang === "en" ? "The draw happens on the device that set up the Secret Santa." : "Gezogen wird auf dem Gerät, das das Wichteln angelegt hat.").waitFor();
    assert.equal(await panel(p).getByRole("button", { name: /Jetzt ziehen|Draw now/ }).count(), 0, "nur das anlegende Gerät zieht");
    await panel(p).locator("input.field").fill(me);
    await panel(p).getByRole("button", { name: lang === "en" ? "Take part" : "Mitmachen", exact: true }).click();
    await panel(p).getByText(lang === "en" ? "Signed up as " + me + "." : "Eingetragen als " + me + ".", { exact: false }).waitFor();
    if (me === "Ben") await snap(p, "wichteln-2-eingetragen-en");
    if (me === "Cem") await snap(p, "wichteln-2-eingetragen-328");
    const u = await send(p); back.push(u);
    const x = await unsealed(p, u);
    assert.equal(x.m[1][0][0][0], me, "der eigene Eintrag steht vorn"); assert.match(x.m[1][0][0][1], /^[A-Za-z0-9_-]{87}$/, "mit dem öffentlichen Schlüssel dieses Geräts");
    const st = await p.evaluate((s) => JSON.parse(localStorage.getItem("daily.v1")).bwk["s" + s], x.seed);
    assert.ok(st.k && st.k.d && st.p === x.m[1][0][0][1], "der private Schlüssel bleibt auf dem Gerät");
    assert.deepEqual(p.errs, []);
  }
  // 4. the organiser opens every link sent back: the sign-ups come together, then she draws
  let last;
  for (const u of back) { last = await G.open(org, hash(u), biz); await last.locator("#go").click(); }
  await panel(last).getByText(/^Dabei \(5\): /).waitFor();
  const inList = await panel(last).getByText(/^Dabei \(5\): /).textContent();
  for (const n of ["Ana", "Ben", "Cem", "Dag", "Eva"]) assert.ok(inList.includes(n), inList);
  await snap(last, "wichteln-3-organisatorin-vor-ziehung");
  await panel(last).getByRole("button", { name: "Jetzt ziehen (5 dabei)" }).click();
  await panel(last).getByText(/Gezogen und versiegelt/).waitFor();
  await snap(last, "wichteln-4-gezogen");
  const D = await send(last);
  // 5. the draw link: names, one ephemeral key, five boxes of the same length; no keys of the people, no pairs
  const x = await unsealed(last, D), dr = x.m[1][0];
  assert.equal(x.m.length, 2); assert.equal(dr.length, 3);
  assert.deepEqual([...dr[0]].sort(), ["Ana", "Ben", "Cem", "Dag", "Eva"]);
  assert.match(dr[1], /^[A-Za-z0-9_-]{87}$/); assert.equal(dr[2].length, 5); assert.ok(dr[2].every((c) => /^[A-Za-z0-9_-]{12}$/.test(c)), "alle Zettel gleich lang");
  const raw = JSON.stringify(x.m);
  for (const n of ["Ana", "Ben", "Cem", "Dag", "Eva"]) assert.equal(raw.split(n).length - 1, 1, n + " nur einmal im Link, in der Namensliste");
  assert.ok(!/(Zu beschenken|Gift for)/.test(raw) && !/"[A-Za-z0-9_-]{87}"[^\]]*"[A-Za-z0-9_-]{87}"/.test(raw), "keine Zuordnung Name -> Empfänger im Link");
  // the drawing phone keeps no pairs: only what is in the link (names, sealed boxes) and its own key
  const orec = await last.evaluate((s) => JSON.parse(localStorage.getItem("daily.v1")).bwk["s" + s], x.seed);
  assert.deepEqual(Object.keys(orec).sort(), ["k", "n", "o", "p", "r", "z", "zd"]); assert.deepEqual(orec.zd, dr);
  // 6. each of the five opens the draw link and only their own slip; another name says it belongs to another device
  const got = {}, ctxOf = { Ana: org, Ben: ben, Cem: cem, Dag: dag, Eva: eva }, en = { Ben: 1, Dag: 1 };
  for (const [me, ctx] of Object.entries(ctxOf)) {
    const p = await G.open(ctx, hash(D), biz);
    await p.locator("#go").click();
    await panel(p).getByText(en[me] ? "Tap your own name" : "Eigenen Namen antippen").first().waitFor();
    assert.ok(await p.locator("#edmain").isHidden(), "nach der Ziehung geht nichts mehr raus");
    await panel(p).getByRole("button", { name: me, exact: true }).click();
    const line = panel(p).locator(".bwslip .qtext");
    await line.waitFor();
    const who = (await line.textContent()).match(en[me] ? /^Gift for: (\w+)$/ : /^Zu beschenken: (\w+)$/)[1];
    assert.notEqual(who, me, me + " zieht sich nicht selbst");
    const txt = await panel(p).innerText();
    assert.match(txt, en[me] ? /Budget: up to €15/ : /Budget: bis 15 €/); assert.match(txt, en[me] ? /Swap: Fri 12\/18/ : /Übergabe: Fr 18\.12\./);
    assert.match(txt, en[me] ? /Even someone who decodes the link sees no pairs/ : /Auch wer den Link ausliest, sieht keine Paare/);
    got[me] = who;
    await snap(p, "wichteln-5-zettel-" + me.toLowerCase());
    const other = Object.keys(ctxOf).find((n) => n !== me);
    await panel(p).getByRole("button", { name: other, exact: true }).click();
    await panel(p).getByText(en[me] ? "This slip belongs to another device." : "Dieser Zettel gehört zu einem anderen Gerät.").first().waitFor();
    assert.equal(await panel(p).locator(".bwslip .qtext").count(), 0, "kein fremder Zettel");
    if (me === "Ben") await snap(p, "wichteln-6-fremder-zettel-en");
    assert.deepEqual(p.errs, []);
  }
  const names = Object.keys(ctxOf), to = names.map((n) => names.indexOf(got[n]));
  assert.equal(new Set(to).size, 5, "jeder Name genau einmal zu beschenken: " + JSON.stringify(got));
  let at = 0, steps = 0; do { at = to[at]; steps++; } while (at !== 0 && steps <= 5); assert.equal(steps, 5, "ein Kreis durch alle: " + JSON.stringify(got));
  // 7. a sixth browser with the draw link opens no slip at all
  const f = await G.open(fremd, hash(D), biz);
  await f.locator("#go").click();
  for (const n of names) {
    await panel(f).getByRole("button", { name: n, exact: true }).click();
    await panel(f).getByText("Dieser Zettel gehört zu einem anderen Gerät.").first().waitFor();
    assert.ok(!/Zu beschenken/.test(await panel(f).innerText()), n);
  }
  await snap(f, "wichteln-7-sechstes-geraet");
  assert.deepEqual(f.errs, []);
  // 8. older sign-up links after the draw: no new sign-up, no second draw; the drawing phone can send the draw again
  const old = await G.open(org, hash(L0), biz); await old.locator("#go").click();
  await panel(old).getByText("Hier wurde schon gezogen. Der Ziehungslink lässt sich noch einmal in die Teamgruppe schicken.").waitFor();
  assert.equal(await panel(old).getByRole("button", { name: /Jetzt ziehen/ }).count(), 0);
  const again = await send(old);
  assert.deepEqual((await unsealed(old, again)).m, x.m, "derselbe Ziehungslink, keine neue Ziehung");
  const bOld = await G.open(ben, hash(back[0]), biz); await bOld.locator("#go").click();
  await panel(bOld).getByText("The draw already happened here. Please open the draw link from the team group.").waitFor();
  assert.equal(await panel(bOld).locator("input.field").count(), 0);
  for (const p of [o, o1, last, old, bOld]) assert.deepEqual(p.errs, []);
  for (const c of [org, ben, cem, dag, eva, fremd]) await c.close();
});

test("Wunschzettel auf einem zweiten Gerät der wünschenden Person: erst die Frage, dann ohne Reservierungen", async () => {
  const [kid, mom, kid2] = await G.people(b, 3, { lang: ["de", "en", "de"], view: ["phone390", "phone390", "phone328"], web: true });
  const k = await G.open(kid, "#i=zug-wunschzettel");
  await k.locator("#go").click();
  const add = async (p, s) => { const f = panel(p).locator("form.shopadd input"); await f.fill(s); await f.press("Enter"); };
  for (const w of ["Hörbuch", "Puzzle"]) await add(k, w);
  const B0 = await send(k);
  const m = await G.open(mom, hash(B0)); await m.locator("#go").click();
  await panel(m).getByRole("button", { name: "I'm giving something → show reservations" }).click();
  await panel(m).locator("input.field").last().fill("Mom");
  await panel(m).getByRole("button", { name: "I'll give this: Hörbuch" }).click();
  const B1 = await send(m);
  // the kid's second phone does not know the list: it asks before it shows anything about reservations
  const k2 = await G.open(kid2, hash(B1)); await k2.locator("#go").click();
  await panel(k2).getByText("Wer bist du?").waitFor();
  const first = await panel(k2).innerText();
  assert.ok(!/vergeben|Hörbuch|🎁/.test(first), "vor der Antwort keine Reservierung und kein Wunsch: " + first);
  await snap(k2, "wunsch-6-zweites-geraet-frage");
  await panel(k2).getByRole("button", { name: "Ich bin die Person mit dem Wunschzettel → Reservierungen ausblenden" }).click();
  await panel(k2).locator(".shoprow").first().waitFor();
  const seen = await panel(k2).innerText();
  assert.ok(!/vergeben|Du schenkst|Mom|🎁/.test(seen), seen);
  assert.deepEqual(await panel(k2).locator(".shoprow b").allInnerTexts(), ["Hörbuch", "Puzzle"]);
  await snap(k2, "wunsch-7-zweites-geraet-ohne-reservierungen");
  const own = await k2.evaluate(() => { const s = JSON.parse(localStorage.getItem("daily.v1")).wown; return s[Object.keys(s)[0]]; });
  assert.equal(own.o, 1); await k2.waitForFunction(() => { const s = JSON.parse(localStorage.getItem("daily.v1")).wown; return !!s[Object.keys(s)[0]].p; });
  // the same phone opens it again: no question any more
  const k3 = await G.open(kid2, hash(B1)); await k3.locator("#go").click();
  await panel(k3).locator(".shoprow").first().waitFor();
  assert.equal(await panel(k3).getByText("Wer bist du?").count(), 0);
  for (const p of [k, m, k2, k3]) assert.deepEqual(p.errs, []);
  await kid.close(); await mom.close(); await kid2.close();
});

// Rule A4 / hard rule: the main button is on screen and free at 328x700, 390x844, 640x400 and 512x384 (200 % zoom), on the
// sheet (#go) and in the editor (#edmain); the sheet's buttons are not covered (grund.js covered); tap targets >= 44 px.
test("Hauptknopf frei und sichtbar auf vier Bildschirmen, Tippflächen >= 44 px, de und en", async () => {
  const views = { p328x700: { viewport: { width: 328, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, phone390: G.VIEWS.phone390, zoom200quer: G.VIEWS.zoom200quer, zoom200: G.VIEWS.zoom200 };
  const cards = [["geschenk-finder", ""], ["zug-wunschzettel", ""], ["biz-wichtel-ideen", "business"], ["biz-wichteln", "business"]];
  const bad = [];
  for (const [vn, v] of Object.entries(views)) for (const lang of ["de", "en"]) {
    const o = Object.assign({}, v, { locale: G.LOCALE[lang] }); delete o.zoom;
    const ctx = await b.newContext(o);
    await ctx.addInitScript((l) => { try { localStorage.setItem("daily.v1", JSON.stringify({ lang: l, muted: true })); } catch (e) {} }, lang);
    for (const [id, flavor] of cards) {
      const p = await G.open(ctx, "#i=" + id, { flavor });
      const cov = await G.covered(p); if (cov.length) bad.push([vn, lang, id, "Blatt", cov.join()].join(" "));
      const s = await mainFree(p, "#go"); if (s) bad.push([vn, lang, id, s].join(" "));
      await p.locator("#go").click(); await p.locator("#edmain").waitFor();
      await p.waitForTimeout(150);
      const e = await mainFree(p, "#edmain"); if (e) bad.push([vn, lang, id, e].join(" "));
      const small = await G.smallTargets(p, "#panel"); if (small.length) bad.push([vn, lang, id, "klein", small.join()].join(" "));
      if (vn === "zoom200" && lang === "de") await snap(p, "groesse-512x384-" + id);
      if (vn === "p328x700" && lang === "en") await snap(p, "groesse-328x700-" + id);
      assert.deepEqual(p.errs, [], id);
      await p.close();
    }
    await ctx.close();
  }
  assert.deepEqual(bad, []);
});
