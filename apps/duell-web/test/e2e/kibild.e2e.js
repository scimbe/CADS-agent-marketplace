"use strict";
// KI-Bilder auf Wunsch (src/kibild.js) on a phone (390x844): a card picture with honest steps (sentence, place in line,
// making, checking), "Nehmen" puts only the picture's id into the link and the sheet shows it; a logo in the corner; the
// account picture only with credit (and says why without); "Melden" hides the picture here at once. The server is a stub
// (its own tests: CADS-DEMO-wrapper test/duell-bild.test.mjs). KIBILD_SHOTS=<dir> saves screenshots.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const zlib = require("node:zlib");
const { chromium } = require("playwright");
const C = require("../../src/core.js");
const page = "file://" + path.resolve(__dirname, "../../dist/index.html");
const ORIGIN = new URL(C.DEFAULT_API).origin;
const REF = "AbCdEfGhIjKlMnOpQrStUv.png", LOGO = "LoGoLoGoLoGoLoGoLoGo01.png", AV = "AvAtArAvAtArAvAtArAv01.png";
const SHOTS = process.env.KIBILD_SHOTS || "";
const SEAL = "s2.bild.mw3abc.AnlRQb9jJYrLILMRBtJj7yR1qlhJF0ER";

// a small drawn PNG (no file in the repo): two colours in bands and a white circle
function png(w, h, a, b) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(t), d]); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3, inC = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 3.5) ** 2, c = inC ? [255, 255, 255] : Math.floor((x + y) / 20) % 2 ? a : b; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PICS = { [REF]: png(256, 384, [255, 120, 40], [40, 90, 220]), [LOGO]: png(128, 128, [20, 160, 80], [255, 212, 0]), [AV]: png(128, 128, [255, 79, 163], [10, 127, 85]) };

const STATUS = (o = {}) => ({ on: true, login: true, age16: true, free: { left: 3, size: 3, period: "month", resetAt: "2026-12-01T00:00:00.000Z" }, credit: 0, next: { card: "free", logo: "free", avatar: (o.credit || 0) > 0 ? "credit" : "none" }, rules: { freePerMonth: 3, price: 1, dailyCap: 10, avatarFree: false, capCountsFailed: true, tz: "UTC" }, perDay: { left: 10, size: 10 }, can: { card: true, logo: true, avatar: false }, why: { card: "", logo: "", avatar: "credit" }, avatar: null, estS: { card: 6, logo: 3, avatar: 3 }, deadlineS: 30, ...o });
let b;
test.before(async () => { b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }); });
test.after(async () => { await b.close(); });

/* api(path, body) -> [status, json] for POST <ORIGIN>/api/duell/<path>. Pictures under /duell/bild/ come from PICS. */
async function phone(api, seed) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE" });
  const errs = [], sent = [], pics = [];
  await ctx.route(/^https?:/, async (r) => {
    const u = new URL(r.request().url());
    if (u.origin === ORIGIN && u.pathname.startsWith("/duell/bild/")) { const f = PICS[u.pathname.slice("/duell/bild/".length)]; pics.push(u.pathname); return f ? r.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: f }) : r.fulfill({ status: 404, body: "" }); }
    if (u.origin === ORIGIN && u.pathname.startsWith("/api/duell/")) {
      const p0 = u.pathname.slice("/api/duell/".length), body = JSON.parse(r.request().postData() || "null"); sent.push({ path: p0, body });
      const a = api(p0, body) || (p0.startsWith("profile/") ? [503, {}] : null);
      if (a) return r.fulfill({ status: a[0], contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(a[1]) });
    }
    return r.abort();
  });
  if (seed) await ctx.addInitScript((s) => { if (!localStorage.getItem("daily.v1")) localStorage.setItem("daily.v1", JSON.stringify(s)); }, seed);
  const open = async (hash) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); await p.goto(page + (hash || "")); await p.waitForFunction(() => window.DailyApp && window.Parts); return p; };
  return { ctx, open, errs, sent, pics };
}
const shot = async (p, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, name + ".png") }); } };
/* a server that makes one picture: 202, then queued (place 2), making, checking, done */
function maker(ref, extra = {}) {
  let polls = 0;
  return (p0, body) => {
    if (p0 === "bild/status") return [200, STATUS(extra.status)];
    if (p0 === "bild") return extra.first ? extra.first(body) : [202, { job: "JoBJoBJoBJoBJoB1", state: "queued", position: 2, etaS: 12, paid: "free", deadlineS: 30 }];
    if (p0 === "bild/job") { polls++; return [200, polls === 1 ? { state: "queued", position: 2, etaS: 10 } : polls === 2 ? { state: "generating", etaS: 5 } : polls === 3 ? { state: "checking", etaS: 2 } : { state: "done", id: ref.split(".")[0], url: "/duell/bild/" + ref, seal: SEAL, w: 512, h: 768, use: "card" }]; }
    if (p0 === "bild/keep" || p0 === "bild/cancel") return [200, { kept: true }];
    if (p0 === "bild/avatar") return [200, { avatar: "/duell/bild/" + ref }];
    if (p0 === "report") return [202, { id: "r1" }];
    return null;
  };
}
const openDialog = (p, use) => p.evaluate((use) => { window.__picked = null; window.Parts.use("kibild", () => window.KiBild.open({ use, onPick: (u, r) => { window.__picked = [u, r]; } })); }, use);

test("Kartenbild: ein Satz, Stil, ehrliche Schritte, Nehmen -> nur die Id im Link, das Blatt zeigt das Bild", async () => {
  const s = await phone(maker(REF)), p = await s.open();
  await openDialog(p, "card");
  const ta = p.getByLabel("Was soll drauf sein? Ein Satz.");
  await ta.waitFor();
  await p.locator(".kbprice", { hasText: "Dieses Bild ist kostenlos: noch 3 von 3 kostenlosen Bildern diesen Monat." }).waitFor();
  assert.match(await p.locator(".kbprice").textContent(), /Abgebucht wird erst, wenn du ein geprüftes Bild bekommst/);
  assert.equal(await p.locator(".kbtop").isHidden(), true, "kein Aufladen, solange ein Bild geht");
  await ta.fill("ein Fuchs, der auf dem Mond Pizza liefert");
  await p.getByRole("radio", { name: "Aquarell" }).click();
  await shot(p, "1-dialog");
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.locator(".kbsteps li.on", { hasText: "In der Schlange: Platz 2" }).waitFor();
  await shot(p, "2-schlange");
  await p.locator(".kbsteps li.on", { hasText: "Bild wird geprüft" }).waitFor();
  await shot(p, "3-pruefung");
  const img = p.locator("img.kbpic");
  await img.waitFor();
  await p.waitForFunction(() => { const i = document.querySelector("img.kbpic"); return i && i.complete && i.naturalWidth > 0; });
  assert.equal(await p.getByRole("button", { name: "Nochmal" }).count(), 1);
  assert.equal(await p.getByRole("button", { name: "Melden" }).count(), 1);
  assert.match(await img.getAttribute("alt"), /^KI-Bild: ein Fuchs/);
  await shot(p, "4-ergebnis");
  // only the typed sentence, the use, the style and the language went out
  const ask = s.sent.find((x) => x.path === "bild");
  assert.deepEqual(ask.body, { use: "card", text: "ein Fuchs, der auf dem Mond Pizza liefert", style: "aquarell", lang: "de" });
  // "Nochmal" says that it costs again
  await p.getByRole("button", { name: "Nochmal" }).click();
  await p.locator(".kbmsg", { hasText: "Nochmal kostet wieder ein Bild." }).waitFor();
  await shot(p, "5-nochmal");
  await p.keyboard.press("Escape");
  // take it (second round, quick stub): onPick gets the URL and the reference, keep is sent
  const s2 = await phone(maker(REF)), p2 = await s2.open();
  await openDialog(p2, "card");
  await p2.getByLabel("Was soll drauf sein? Ein Satz.").fill("ein Fuchs als Pizzabote");
  await p2.getByRole("button", { name: "Bild machen" }).click();
  await p2.getByRole("button", { name: "Nehmen" }).click();
  const picked = await p2.evaluate(() => window.__picked);
  assert.deepEqual(picked, [ORIGIN + "/duell/bild/" + REF, REF]);
  assert.deepEqual(s2.sent.find((x) => x.path === "bild/keep").body, { id: REF.split(".")[0] });
  // into a card and its link: the link holds the id only, the sheet loads the picture from the gallery server
  const hash = await p2.evaluate((ref) => { const d = window.KiBild.apply({ k: "card", col: ["#ffd400", "#ff3b1d"], by: [], x: "Pizza vom Mond!", st: "druck", sk: [] }, "card", ref); return new URL(window.Daily.docUrl(d)).hash; }, REF);
  assert.ok(hash.length < 300, "kurzer Link: " + hash.length);
  const p3 = await s2.open(hash);
  await p3.waitForFunction(() => document.querySelector("#leaf .pv.pic"));
  assert.equal(await p3.locator("#leaf .pvimg img").getAttribute("src"), ORIGIN + "/duell/bild/" + REF);
  await shot(p3, "6-blatt-mit-bild");
  assert.deepEqual([...s.errs, ...s2.errs], []);
  await s.ctx.close(); await s2.ctx.close();
});

test("Logo: klein in der Ecke der Vorschau, nur ueber die Id", async () => {
  const s = await phone(maker(LOGO)), p = await s.open();
  const hash = await p.evaluate((ref) => new URL(window.Daily.docUrl(window.KiBild.apply({ k: "card", col: ["#2b4bff", "#ffe600"], by: [], x: "Sommerfest TSV", st: "druck", sk: [] }, "logo", ref))).hash, LOGO);
  const p2 = await s.open(hash);
  const logo = p2.locator("#leaf .kblogo");
  await logo.waitFor();
  assert.equal(await logo.getAttribute("src"), ORIGIN + "/duell/bild/" + LOGO);
  await p2.waitForFunction(() => { const i = document.querySelector("#leaf .kblogo"); return i && i.complete && i.naturalWidth > 0; });
  await shot(p2, "7-logo");
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});

const LINKED = { me: { nick: "Mira", emoji: "🦖", colors: ["#ffd400", "#ff3b1d"] }, profile: { via: "account", rev: 1, base: null, age16: true, t0: Date.now(), at: Date.now() } };
const style = async (p) => { await p.locator("#me").click(); await p.locator("#stdata summary").click(); };

test("Kontobild ohne Guthaben: der Knopf sagt warum, nichts geht an den Bilddienst", async () => {
  const s = await phone(maker(AV, { status: { credit: 0 } }), LINKED), p = await s.open();
  await style(p);
  const go = p.getByRole("button", { name: "Kontobild mit KI" });
  await go.waitFor();
  await p.locator(".kbavnote", { hasText: "Ein Kontobild braucht Guthaben" }).waitFor();
  await go.click();
  await p.locator(".kbavnote", { hasText: "Guthaben gibt es, wenn andere deine freien Karten nutzen" }).waitFor();
  assert.equal(await p.locator("dialog.kbdlg").count(), 0, "kein Dialog ohne Guthaben");
  assert.ok(!s.sent.some((x) => x.path === "bild"), "kein Auftrag");
  await p.locator(".kbrow").scrollIntoViewIfNeeded();
  await shot(p, "8-kontobild-ohne-guthaben");
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});

test("Kontobild mit Guthaben: kostet 1, wird gesetzt und gezeigt", async () => {
  const st = { credit: 2, can: { card: true, logo: true, avatar: true }, why: { card: "", logo: "", avatar: "" } };
  const s = await phone(maker(AV, { status: st }), LINKED), p = await s.open();
  await style(p);
  await p.locator(".kbavnote", { hasText: "Ein Kontobild kostet 1 Guthaben. Du hast 2." }).waitFor();
  await p.getByRole("button", { name: "Kontobild mit KI" }).click();
  await p.getByRole("heading", { name: "KI-Kontobild" }).waitFor();
  await p.getByLabel("Was soll drauf sein? Ein Satz.").fill("ein Dino mit Kopfhoerern");
  await p.getByRole("radio", { name: "Sticker" }).click();
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.getByRole("button", { name: "Nehmen" }).click();
  await p.waitForFunction((u) => { const i = document.querySelector(".kbav img"); return i && i.getAttribute("src") === u && i.complete && i.naturalWidth > 0; }, ORIGIN + "/duell/bild/" + AV);
  assert.deepEqual(s.sent.find((x) => x.path === "bild/avatar").body, { id: AV.split(".")[0] });
  assert.equal(s.sent.find((x) => x.path === "bild").body.use, "avatar");
  await p.locator(".kbrow").scrollIntoViewIfNeeded();
  await shot(p, "9-kontobild-gesetzt");
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});

test("Melden: Grund waehlen, kind bild mit Id und Siegel; hier sofort weg, auch im Link", async () => {
  const s = await phone(maker(REF)), p = await s.open();
  await openDialog(p, "card");
  await p.getByLabel("Was soll drauf sein? Ein Satz.").fill("ein Fuchs als Pizzabote");
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.locator("img.kbpic").waitFor();
  await p.getByRole("button", { name: "Melden" }).click();
  await p.getByRole("radio", { name: "Sexuell oder nackt" }).click();
  await shot(p, "10-melden");
  await p.locator(".kbrepdlg").getByRole("button", { name: "Melden" }).click();
  await p.locator(".kbmsg", { hasText: "Gemeldet. Du siehst das Bild nicht mehr" }).waitFor();
  assert.equal(await p.locator("img.kbpic").count(), 0);
  const rep = s.sent.find((x) => x.path === "report").body;
  assert.deepEqual(rep, { reason: "sex", kind: "bild", consent: true, content: { bild: REF.split(".")[0] }, option: { bild: REF.split(".")[0] }, seal: SEAL });
  await shot(p, "11-gemeldet");
  // a link with that picture: the card shows, the picture does not (on this device)
  const hash = await p.evaluate((ref) => new URL(window.Daily.docUrl(window.KiBild.apply({ k: "card", col: ["#ffd400", "#ff3b1d"], by: [], x: "Hallo", st: "druck", sk: [] }, "card", ref))).hash, REF);
  const n = s.pics.length, p2 = await s.open(hash);
  await p2.waitForFunction(() => document.querySelector("#leaf .pv.with"));   // the received card is on the sheet
  await p2.waitForTimeout(400);
  assert.equal(await p2.locator("#leaf .pv.pic").count(), 0, "kein Bild");
  assert.equal(s.pics.slice(n).filter((u) => u.includes(REF)).length, 0, "nicht einmal geladen");
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});

test("Ehrlich bei Andrang und Absage: busy sagt Platz und Wartezeit, eine Absage ist ein fester Text", async () => {
  const s = await phone(maker(REF, { first: (body) => (/Scholz/.test(body.text) ? [422, { error: "refused", reason: "real_person" }] : [429, { error: "busy", position: 4, etaS: 48, retryS: 25 }]) })), p = await s.open();
  await openDialog(p, "card");
  const ta = p.getByLabel("Was soll drauf sein? Ein Satz.");
  await ta.fill("ein Hund auf dem Skateboard");
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.locator(".kbmsg", { hasText: "Gerade ist viel los (Platz 4, etwa 48 s)" }).waitFor();
  assert.match(await p.locator(".kbmsg").textContent(), /in 25 s nochmal – es hat nichts gekostet/);
  await shot(p, "12-busy");
  await ta.fill("Foto von Olaf Scholz");
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.locator(".kbmsg", { hasText: "Echte Personen zeichnen wir nicht" }).waitFor();
  // a crisis never leaves the device
  const before = s.sent.filter((x) => x.path === "bild").length;
  await ta.fill("ich will nicht mehr leben");
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.locator(".kbmsg", { hasText: "Nummer gegen Kummer" }).waitFor();
  assert.equal(s.sent.filter((x) => x.path === "bild").length, before);
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});

test("Preis ehrlich: Topf leer und kein Guthaben -> Datum und Guthaben aufladen; danach kostet es 1 und sagt, was abgebucht wurde", async () => {
  let credit = 0;
  const RESET = "2026-12-01T00:00:00.000Z";
  const st = () => STATUS({ free: { left: 0, size: 3, period: "month", resetAt: RESET }, credit, next: { card: credit ? "credit" : "none", logo: credit ? "credit" : "none", avatar: credit ? "credit" : "none" }, voucher: true, can: { card: credit > 0, logo: credit > 0, avatar: credit > 0 }, why: { card: credit ? "" : "quota", logo: credit ? "" : "quota", avatar: credit ? "" : "credit" } });
  const base = maker(REF);
  const s = await phone((p0, body) => {
    if (p0 === "bild/status") return [200, st()];
    if (p0 === "credit/redeem") { if (body.code !== "TEST-CODE-1") return [404, { error: "unknown" }]; credit += 2; return [200, { ok: true, added: 2, credit }]; }
    if (p0 === "bild") return [202, { job: "JoBJoBJoBJoBJoB1", state: "queued", position: 1, etaS: 6, paid: "credit", deadlineS: 30 }];
    if (p0 === "bild/job") { const r = base(p0, body); if (r[1].state === "done") { credit -= 1; r[1].charged = "credit"; r[1].paid = "credit"; } return r; }
    return base(p0, body);
  });
  const p = await s.open();
  await openDialog(p, "card");
  await p.locator(".kbmsg", { hasText: "Deine kostenlosen Bilder für diesen Monat sind aufgebraucht, und du hast kein Guthaben. Neue kostenlose Bilder ab 1. Dezember." }).waitFor();
  assert.equal(await p.getByRole("button", { name: "Bild machen" }).isDisabled(), true);
  await shot(p, "13-topf-leer");
  await p.getByRole("button", { name: "Guthaben aufladen" }).click();
  const code = p.getByLabel("Gutschein-Code");
  await code.fill("FALSCH-1");
  await p.getByRole("button", { name: "Einlösen" }).click();
  await p.locator(".kbtopmsg", { hasText: "Diesen Code kennen wir nicht" }).waitFor();
  await code.fill("TEST-CODE-1");
  await p.getByRole("button", { name: "Einlösen" }).click();
  await p.locator(".kbmsg", { hasText: "2 Guthaben aufgeladen." }).waitFor();
  await p.locator(".kbprice", { hasText: "Deine 3 kostenlosen Bilder für diesen Monat sind aufgebraucht. Dieses Bild kostet 1 Guthaben – du hast 2. Neue kostenlose Bilder ab 1. Dezember." }).waitFor();
  assert.equal(await p.locator(".kbtop").isHidden(), true, "Aufladen weg, sobald es geht");
  await shot(p, "14-aufgeladen");
  await p.getByLabel("Was soll drauf sein? Ein Satz.").fill("ein Igel mit Regenschirm");
  await p.getByRole("button", { name: "Bild machen" }).click();
  await p.locator("img.kbpic").waitFor();
  await p.locator(".kbmsg", { hasText: "1 Guthaben abgebucht. Du hast noch 1." }).waitFor();
  await shot(p, "15-abgebucht");
  assert.deepEqual(s.sent.filter((x) => x.path === "credit/redeem").map((x) => x.body), [{ code: "FALSCH-1" }, { code: "TEST-CODE-1" }]);
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});

test("Kontobild aus den freien Bildern (rules.avatarFree, Vorgabe des Servers): kostenlos angesagt, ohne Guthaben machbar", async () => {
  const st = { rules: { freePerMonth: 3, price: 1, dailyCap: 10, avatarFree: true, capCountsFailed: true, tz: "UTC" }, next: { card: "free", logo: "free", avatar: "free" }, can: { card: true, logo: true, avatar: true }, why: { card: "", logo: "", avatar: "" } };
  const s = await phone(maker(AV, { status: st }), LINKED), p = await s.open();
  await style(p);
  await p.locator(".kbavnote", { hasText: "Dieses Bild ist kostenlos: noch 3 von 3 kostenlosen Bildern diesen Monat. Danach kostet jedes Bild 1 Guthaben." }).waitFor();
  assert.equal(await p.locator(".kbav .kbtop").isHidden(), true);
  await p.getByRole("button", { name: "Kontobild mit KI" }).click();
  await p.getByRole("heading", { name: "KI-Kontobild" }).waitFor();
  assert.equal(await p.getByRole("button", { name: "Bild machen" }).isDisabled(), false);
  assert.deepEqual(s.errs, []);
  await s.ctx.close();
});
