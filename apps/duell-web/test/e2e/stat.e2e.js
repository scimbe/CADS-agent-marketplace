"use strict";
// Card numbers and thumbs (src/stat.js, app.js votes): what goes to /api/duell/stat on share, open and vote, and that no
// run reaches the live short-link service (test/e2e/lib/nolive.js, also loaded by `npm run test:e2e` for every file).
const test = require("node:test");
const assert = require("node:assert/strict");
const NL = require("./lib/nolive.js");   // standalone too: the hook patches once
const G = require("./lib/grund.js");
const C = require("../../src/core.js");

const STAT = NL.ORIGIN + "/api/duell/stat";
// plan-09 as a friend sends it (home.e2e.js): a card of the catalog, received.
const GOT = "#c=eyJ2IjoxLCJkIjp7ImsiOiJjYXJkIiwiY29sIjpbIiNmZmQ0MDAiLCIjZmYzYjFkIl0sImJ5IjpbXSwiaSI6InBsYW4tMDkiLCJ4IjoiSGV1dGUgMjAgVWhyLiBWaWRlbyBhbi4gS2VpbmUgQXVzcmVkZW4uIiwic3QiOiJzdGVtcGVsIiwic2siOltdfX0";
const TIME = "2026-11-05T10:00:00Z";
// Every stat request of a context, as sent (the test's own route wins over the hook's). CORS as the server's corsFor: no
// credentials, no echoed origin. 204 without X-Stat: what the server answers for a signed-in account.
// x: the X-Stat the server sets on the n-th stat request (null: counted).
async function stats(ctx, x) {
  const got = []; Object.defineProperty(got, "cred", { value: [] });   // the cookie header of each, kept apart from the bodies
  await ctx.route(STAT, (r) => { got.push(JSON.parse(r.request().postData()));
    got.cred.push(r.request().headers().cookie || "");
    const h = x && x(got.length - 1);
    return r.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", ...(h ? { "Access-Control-Expose-Headers": "X-Stat", "X-Stat": h } : {}) } }); });
  return got;
}
const until = async (fn, ms) => { const end = Date.now() + (ms || 5000); while (!fn()) { if (Date.now() > end) return false; await new Promise((r) => setTimeout(r, 50)); } return true; };
const decode = (f) => JSON.parse(Buffer.from(f.replace(/^c=/, ""), "base64url").toString("utf8")).d;

test("Kein Live-Dienst: jeder Request an /api/s bekommt die Antwort des Hooks, eigene Routen eines Tests gehen vor", async () => {
  assert.equal(globalThis.__nolive, true);
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), seen = [];
  ctx.on("response", (r) => { if (r.url().startsWith(NL.ORIGIN + "/api/")) seen.push([r.request().method(), new URL(r.url()).pathname, r.headers()["x-nolive"]]); });
  const p = await G.open(ctx, "#i=quiz-chaos");
  await p.locator("#go").click(); await p.locator("#edmain").click(); await p.locator("#share").click();
  await p.waitForFunction(() => { const r = window.DailyDebug.result(); return r && r.link; });
  const link = await p.evaluate(() => window.DailyDebug.result().link);
  assert.equal(link.short, true); assert.match(link.url, new RegExp("^" + C.SHORT_BASE + "[2-9a-km-np-zA-HJ-NP-Z]{8}$"), "der Fake ist ein gueltiger Kurzlink");
  assert.ok(await until(() => seen.some((s) => s[1] === "/api/s")), "POST /api/s: " + JSON.stringify(seen));
  for (const s of seen) assert.equal(s[2], "1", "nicht vom Live-Host: " + s.join(" "));
  // A page route of the test (like home.e2e.js:156) comes first: the hook does not answer it.
  let mine = 0; await p.route("**/api/s", (r) => { mine++; return r.fulfill({ status: 201, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ id: "aB3dE5gH", url: C.SHORT_BASE + "aB3dE5gH", token: "t", exp: Date.now() + 864e6 }) }); });
  const q = await p.evaluate(async () => window.ShortLink.shorten(window.DuellCore.SHARE_BASE + "#i=karte-spruch", { k: "card", l: "de" }, {}));
  assert.equal(mine, 1); assert.equal(q.id, "aB3dE5gH");
  assert.deepEqual(p.errs, []); await b.close();
});

test("Teilen schickt share mit den geaenderten Bereichen des letzten Trail-Eintrags, einmal je Link", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), got = await stats(ctx);
  let sent = null; await ctx.route(NL.ORIGIN + "/api/s", (r) => { sent = JSON.parse(r.request().postData()); return r.fallback(); });
  const p = await G.open(ctx, GOT);
  await p.locator("#leaf.got").waitFor(); await until(() => got.length);
  got.length = 0;
  await p.locator("#wishgo").tap(); await p.getByRole("button", { name: "🎲 Würfeln" }).tap(); await p.locator(".aicount", { hasText: "Geändert" }).waitFor();
  await p.locator("#edmain").click(); await p.locator("#share").click();
  await p.waitForFunction(() => { const r = window.DailyDebug.result(); return r && r.link; });
  assert.ok(await until(() => got.length), "share kam an");
  const doc = decode(sent.f), w = doc.by[doc.by.length - 1].w;
  assert.ok(w.length > 0, "der Wurf hat etwas geaendert");
  assert.deepEqual(got, [{ i: "plan-09", e: "share", w }]);
  await p.locator("#share").click(); await p.waitForTimeout(300);
  assert.equal(got.length, 1, "der zweite Tipp teilt denselben Link, kein neues share");
  assert.deepEqual(p.errs, []); await b.close();
});

// Reload and a second page of one device: over the web route (grund.js), since under file:// a reload or a new page now
// and then starts with an empty storage of its own and would rightly count the link again (seen 1 of 48 under load).
test("Eine empfangene Karte meldet open einmal je Link und Geraet; ein anderes Geraet zaehlt", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME, web: true }), got = await stats(ctx);
  const p = await G.open(ctx, GOT); await p.locator("#leaf.got").waitFor();
  assert.ok(await until(() => got.length)); assert.deepEqual(got, [{ i: "plan-09", e: "open" }]);
  await p.locator("#lang").click(); await p.locator("#lang").click();   // the sheet is drawn again: still one
  await p.reload(); await p.locator("#leaf.got").waitFor();
  const p2 = await G.open(ctx, GOT); await p2.locator("#leaf.got").waitFor(); await p2.waitForTimeout(400);
  assert.equal(got.length, 1, "derselbe Link auf demselben Geraet: " + JSON.stringify(got));
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).seen.length === 1));
  const day = await G.open(ctx, ""); await day.waitForTimeout(400);
  assert.equal(got.length, 1, "die Tageskarte ist nichts Empfangenes");
  const ctx2 = await G.person(b, { time: TIME, web: true }), got2 = await stats(ctx2);
  const q = await G.open(ctx2, GOT); await q.locator("#leaf.got").waitFor();
  assert.ok(await until(() => got2.length)); assert.deepEqual(got2, [{ i: "plan-09", e: "open" }]);
  assert.deepEqual([...p.errs, ...p2.errs, ...q.errs], []); await b.close();
});

// Web route: the reload below must find the vote it stored (under file:// a reload now and then starts with empty storage).
test("Daumen (angemeldet): setzen, wechseln, zuruecknehmen schickt v (ohne p), zeigt die Stimme erst nach der Antwort, ohne Zahlen", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME, web: true }), got = await stats(ctx);
  const p = await G.open(ctx, "");
  const id = await p.evaluate(() => window.DailyDebug.home().idea.id);
  const up = p.locator("#voteup"), down = p.locator("#votedown");
  await up.waitFor();
  assert.equal(await up.getAttribute("aria-label"), "Gefällt mir"); assert.equal(await down.getAttribute("aria-label"), "Gefällt mir nicht");
  assert.equal(await p.locator("#votes").getAttribute("aria-label"), "Wie findest du diese Karte?");
  const pressed = (a, c) => p.waitForFunction(([x, y]) => document.getElementById("voteup").getAttribute("aria-pressed") === x && document.getElementById("votedown").getAttribute("aria-pressed") === y, [a, c]);
  await pressed("false", "false");
  await up.tap(); await pressed("true", "false");
  await down.tap(); await pressed("false", "true");
  await down.tap(); await pressed("false", "false");
  await up.tap(); await pressed("true", "false");
  assert.deepEqual(got, [{ i: id, e: "vote", v: 1 }, { i: id, e: "vote", v: -1 }, { i: id, e: "vote", v: 0 }, { i: id, e: "vote", v: 1 }]);
  assert.equal(await p.evaluate(() => document.body.getAttribute("data-state")), "home", "ein Daumen oeffnet die Karte nicht");
  assert.equal(await p.locator("#votelogin").isVisible(), false, "angemeldet kein Hinweis");
  assert.deepEqual(await p.evaluate((k) => JSON.parse(localStorage.getItem("daily.v1")).votes[k], id), 1);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll("#votes button")].map((x) => x.textContent)), ["👍", "👎"], "keine Zaehler");
  await p.reload(); await up.waitFor(); await pressed("true", "false");
  assert.equal(await p.locator("#pad .ghost .votes").count(), 0, "das graue Blatt darunter hat keine Daumen");
  // A received card: its own vote, under its catalog id; English labels.
  const ctx2 = await G.person(b, { time: TIME, lang: "en" }), got2 = await stats(ctx2), q = await G.open(ctx2, GOT);
  await q.locator("#leaf.got").waitFor(); await until(() => got2.length); got2.length = 0;
  assert.equal(await q.locator("#votedown").getAttribute("aria-label"), "Not for me");
  await q.locator("#votedown").tap(); await q.waitForFunction(() => document.getElementById("votedown").getAttribute("aria-pressed") === "true");
  assert.deepEqual(got2, [{ i: "plan-09", e: "vote", v: -1 }]);
  assert.deepEqual([...p.errs, ...q.errs], []); await b.close();
});

test("Daumen ohne Anmeldung: kurzer Hinweis mit Link zur Anmeldung, nichts als gezaehlt markiert, nichts gemerkt", async () => {
  const b = await G.launch();
  for (const lang of G.LANGS) {
    // no route of its own: the hook answers as the server does without the gate cookie (X-Stat: login)
    const ctx = await G.person(b, { time: TIME, lang, web: true }), got = [], p = await G.open(ctx, "");   // reloaded below: web route
    Object.defineProperty(got, "cred", { value: [] });
    ctx.on("request", (r) => { if (r.url() === STAT) { got.push(JSON.parse(r.postData())); got.cred.push(r.headers().cookie || ""); } });
    const id = await p.evaluate(() => window.DailyDebug.home().idea.id), hint = p.locator("#votelogin");
    await p.locator("#voteup").tap(); await hint.waitFor();
    assert.equal(await hint.textContent(), lang === "de" ? "Zum Abstimmen anmelden" : "Sign in to vote");
    assert.equal(await hint.getAttribute("href"), NL.ORIGIN + "/auth/login?return=%2Fduell", "dieselbe Anmeldung wie ai.js, auf dem API-Host");
    assert.deepEqual(await G.covered(p), [], "der Hinweis verdeckt keinen Knopf");
    for (const s of ["#voteup", "#votedown"]) assert.equal(await p.locator(s).getAttribute("aria-pressed"), "false", s + " nicht als abgegeben");
    await p.locator("#votedown").tap(); await until(() => got.length === 2);
    assert.deepEqual(got, [{ i: id, e: "vote", v: 1 }, { i: id, e: "vote", v: -1 }], "nichts gezaehlt: der zweite Tipp ist wieder eine neue Stimme, kein Zuruecknehmen");
    assert.deepEqual(got.cred, ["", ""], "keine Cookies von fremden Seiten");
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1") || "{}").votes), undefined, "nichts gemerkt");
    await p.reload(); await p.locator("#voteup").waitFor();
    assert.equal(await hint.isVisible(), false, "der Hinweis ist kurz, kein Druck");
    assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll("#votes button")].map((x) => x.getAttribute("aria-pressed"))), ["false", "false"]);
    assert.deepEqual(p.errs, []); await ctx.close();
  }
  await b.close();
});

// Signed in; the server counts the first vote, then answers with the given X-Stat: the shown vote stays the counted one.
async function refused(x) {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), got = await stats(ctx, (n) => (n === 0 ? null : x)), p = await G.open(ctx, "");
  const id = await p.evaluate(() => window.DailyDebug.home().idea.id), hint = p.locator("#votelogin");
  const pressed = () => p.evaluate(() => [...document.querySelectorAll("#votes button")].map((e) => e.getAttribute("aria-pressed")));
  await p.locator("#voteup").tap(); await p.waitForFunction(() => document.getElementById("voteup").getAttribute("aria-pressed") === "true");
  await p.locator("#votedown").tap(); await until(() => got.length === 2); await p.waitForTimeout(200);
  assert.deepEqual(got, [{ i: id, e: "vote", v: 1 }, { i: id, e: "vote", v: -1 }]);
  assert.deepEqual(await pressed(), ["true", "false"], x + ": der alte Stand bleibt");
  assert.deepEqual(await p.evaluate((k) => JSON.parse(localStorage.getItem("daily.v1")).votes[k], id), 1);
  return { b, p, hint };
}
test("Daumen, Server sagt dup: alter Stand bleibt, kurzer Hinweis 'Heute schon oft geändert' ohne Link", async () => {
  const { b, p, hint } = await refused("dup");
  await hint.waitFor(); assert.equal(await hint.textContent(), "Heute schon oft geändert"); assert.equal(await hint.getAttribute("href"), null);
  assert.deepEqual(await G.covered(p), []);
  assert.deepEqual(p.errs, []); await b.close();
});
test("Daumen, Server sagt unavailable: alter Stand bleibt, kein Login-Hinweis", async () => {
  const { b, p, hint } = await refused("unavailable");
  assert.equal(await hint.isVisible(), false);
  assert.deepEqual(p.errs, []); await b.close();
});

// file:// on purpose: the app shell (origin null, no cookie); one page, never reloaded (lib/grund.js).
test("Daumen in der App-Huelle (Origin null, kein Cookie): immer der Hinweis, ohne Link, keine Stimme geht raus", async () => {
  const b = await G.launch(), ctx = await G.person(b, { time: TIME }), votes = [];
  await ctx.addInitScript(() => { window.DuellHost = {}; });
  ctx.on("request", (r) => { if (r.url() === STAT && /"e":"vote"/.test(r.postData() || "")) votes.push(r.postData()); });
  const p = await G.open(ctx, "");
  await p.locator("#voteup").tap(); await p.locator("#votelogin").waitFor();
  assert.equal(await p.locator("#votelogin").getAttribute("href"), null, "die Huelle kann sich nicht anmelden");
  assert.equal(await p.locator("#voteup").getAttribute("aria-pressed"), "false");
  await p.waitForTimeout(300); assert.deepEqual(votes, []);
  assert.deepEqual(p.errs, []); await b.close();
});

test("Layout: die Daumen liegen frei auf dem Blatt und verdecken bei 390x844 und 512x384 nichts", async () => {
  const b = await G.launch(), bad = [];
  for (const view of ["phone390", "zoom200"]) for (const lang of G.LANGS) for (const hash of ["", GOT]) {
    const ctx = await G.person(b, { view, lang, time: TIME }), p = await G.open(ctx, hash), at = [view, lang, hash ? "empfangen" : "Tag"].join(" ");
    await p.locator("#voteup").waitFor(); await p.waitForTimeout(700);   // the sheet's entry animation
    if (!(await G.inView(p, "#go"))) bad.push(at + ": #go nicht sichtbar");
    for (const c of await G.covered(p)) bad.push(at + ": " + c);
    const free = await p.evaluate(() => {
      const leaf = document.getElementById("leaf").getBoundingClientRect(), go = document.getElementById("go").getBoundingClientRect();
      return ["voteup", "votedown"].map((id) => {
        const e = document.getElementById(id), r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const inLeaf = r.top >= leaf.top - 1 && r.bottom <= leaf.bottom + 1 && r.left >= leaf.left - 1 && r.right <= leaf.right + 1;
        const overGo = r.bottom > go.top && r.top < go.bottom && r.right > go.left && r.left < go.right;
        return [id, hit === e, inLeaf, !overGo, Math.round(r.width) >= 44 && Math.round(r.height) >= 44];
      });
    });
    for (const f of free) if (f.slice(1).some((x) => !x)) bad.push(at + ": " + f.join(" "));
    assert.deepEqual(p.errs, [], at);
    await ctx.close();
  }
  assert.deepEqual(bad, []);
  await b.close();
});

// M7: the switch "Karten-Statistik aus" under "Wer sieht was?" (Bausteine.wswRow, stimme-ui.js row, store.statOff). Off: no
// share and no open leaves this device; a thumb is a deliberate tap and still goes out. Web route: several pages of one device.
test("Karten-Statistik aus: Schalter unter Wer sieht was? (de/en, Tastatur, 44 px); aus: kein share, kein open, Daumen weiter; wieder an: open zaehlt", async () => {
  const b = await G.launch();
  for (const lang of G.LANGS) {
    const ctx = await G.person(b, { time: TIME, lang, web: true }), got = await stats(ctx), all = [];
    ctx.on("request", (r) => { if (r.url().startsWith(STAT)) all.push(r.method() + " " + r.resourceType()); });   // a beacon too
    const p = await G.open(ctx, "#i=zug-wunschzettel");
    await p.locator("#go").click(); await p.locator("#panel details.more summary").first().click();
    const row = p.locator("#panel .wsw"), sw = row.locator("button.statoff");
    await sw.waitFor();
    assert.equal(await sw.textContent(), lang === "de" ? "Karten-Statistik aus" : "Card statistics off");
    assert.equal(await sw.getAttribute("aria-pressed"), "false");
    const box = await sw.boundingBox(); assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box));
    const text = await row.textContent();
    assert.match(text, lang === "de" ? /Inhalte speichert ein Server nur im Kurzlink, 90 Tage\. Gezählt wird nur, welche Karte .* geteilt und geöffnet wird, ohne Namen und ohne gespeicherte IP-Adresse\. Ein Daumen ist eine Abstimmung: Der Server merkt ihn pseudonym zu deinem Konto, auch bei Statistik aus\./
      : /A server keeps content only in a short link, 90 days\. Counted is only which card .* without storing the IP address\. A thumb is a vote: the server keeps it under a pseudonym of your account, also with statistics off\./);
    assert.doesNotMatch(await p.locator("body").innerText(), /Kein Server speichert etwas|speichert kein Server etwas|No server keeps anything/i);
    // keyboard: Space switches it off, the choice stays on this device
    await sw.focus(); await p.keyboard.press("Space");
    await p.waitForFunction(() => document.querySelector("#panel .wsw .statoff").getAttribute("aria-pressed") === "true");
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).statOff), true);
    await p.waitForTimeout(300); got.length = 0; all.length = 0;
    // off: a received card sends no open, sharing no share; a thumb still goes out
    const q = await G.open(ctx, GOT); await q.locator("#leaf.got").waitFor(); await q.waitForTimeout(500);
    const r = await G.open(ctx, "#i=quiz-chaos");
    await r.locator("#go").click(); await r.locator("#edmain").click(); await r.locator("#share").click();
    await r.waitForFunction(() => { const x = window.DailyDebug.result(); return x && x.link; }); await r.waitForTimeout(500);
    assert.deepEqual(got, [], "aus: nichts an die Statistik");
    await q.locator("#voteup").tap(); await until(() => got.length);
    assert.deepEqual(got, [{ i: "plan-09", e: "vote", v: 1 }], "die Stimme geht weiter raus");
    assert.deepEqual(all, ["POST fetch"], "genau ein Request, kein Beacon: " + all.join(", "));
    assert.equal(await q.evaluate(() => (JSON.parse(localStorage.getItem("daily.v1")).seen || []).length), 0, "nicht als gesehen gemerkt");
    // on again (Enter on the switch of a fresh row): the same received link now counts once
    await p.reload(); await p.locator("#go").click(); await p.locator("#panel details.more summary").first().click();
    await sw.waitFor(); assert.equal(await sw.getAttribute("aria-pressed"), "true", "nach dem Neuladen noch aus");
    await sw.focus(); await p.keyboard.press("Enter");
    await p.waitForFunction(() => document.querySelector("#panel .wsw .statoff").getAttribute("aria-pressed") === "false");
    assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("daily.v1")).statOff), undefined);
    got.length = 0;
    const q2 = await G.open(ctx, GOT); await q2.locator("#leaf.got").waitFor();
    assert.ok(await until(() => got.length)); assert.deepEqual(got, [{ i: "plan-09", e: "open" }]);
    assert.deepEqual([...p.errs, ...q.errs, ...r.errs, ...q2.errs], [], lang); await ctx.close();
  }
  await b.close();
});
