// Doppelkopf with four browsers and Skat with three, end to end, seated through one group link, one seat on Auto. Only the two-player links of live.js are replaced:
// a small broker here pipes each pair's messages between the pages, like the data channel does. The mesh, the
// invites from seat to seat, the joint shuffle, the rules, the screens and the score all run for real.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const G = require("./lib/grund.js");
let page;
// Web route (lib/grund.js): pages here are reloaded or a device opens several pages; under file:// such a page now and then starts with an empty storage of its own.
test.before(async () => { page = await G.webUrl("index.html"); });

const FAKE = `(() => {
  window.__liveOn = true;
  // what the page would hand to the share sheet (the group chat): kept for the test
  window.__shared = [];
  Object.defineProperty(navigator, "share", { configurable: true, value: async (o) => { window.__shared.push(o.url); } });
  const conns = {}, pend = {};
  function mk(id, ch) {
    const c = { channel: ch, h: null, cl: [], dead: false,
      send: (o) => { if (!c.dead) window.__tbOut(id, JSON.stringify(o)); },
      on: (h) => { c.h = h; }, onClose: (h) => { c.cl.push(h); },
      close: () => { if (c.dead) return; c.dead = true; window.__tbClose(id); c.cl.forEach((f) => f()); } };
    return (conns[id] = c);
  }
  window.__tbIn = (id, s) => { const c = conns[id]; if (c && !c.dead && c.h) c.h(JSON.parse(s)); };
  window.__tbClosed = (id) => { const c = conns[id]; if (c && !c.dead) { c.dead = true; c.cl.forEach((f) => f()); } };
  window.__tbReady = (token, id, ch) => { if (pend[token]) pend[token](mk(id, ch)); };
  window.Live = {
    invite: async () => { const token = await window.__tbInvite(); return { token, expires: Date.now() + 900000, ready: new Promise((ok) => { pend[token] = ok; }) }; },
    accept: async (token) => { const r = await window.__tbAccept(token); if (!r) throw new Error("gone"); return mk(r.id, r.ch); }
  };
})();`;

function broker() {
  const tokens = new Map(), route = new Map(), chain = new Map(), made = []; let n = 0;
  // one queue per link end: messages arrive in the order sent, as on an ordered data channel
  const later = (id, f) => { const c = (chain.get(id) || Promise.resolve()).then(f).catch(() => {}); chain.set(id, c); };
  async function wire(p) {
    await p.exposeFunction("__tbInvite", () => { const tk = ("K" + (++n)).padEnd(22, "x"); tokens.set(tk, p); made.push({ tk, p }); return tk; });
    await p.exposeFunction("__tbAccept", (tk) => {
      const inv = tokens.get(tk); if (!inv) return null; tokens.delete(tk);
      const k = ++n, a = "c" + k + "a", b = "c" + k + "b", ch = k.toString(16).padStart(64, "c");
      route.set(a, { page: p, peer: b }); route.set(b, { page: inv, peer: a });
      later(a, () => inv.evaluate(([t, i, c]) => window.__tbReady(t, i, c), [tk, a, ch]));
      return { id: b, ch };
    });
    await p.exposeFunction("__tbOut", (id, s) => { const r = route.get(id); if (r) later(id, () => r.page.evaluate(([i, m]) => window.__tbIn(i, m), [r.peer, s])); });
    await p.exposeFunction("__tbClose", (id) => { const r = route.get(id); if (r) later(id, () => r.page.evaluate((i) => window.__tbClosed(i), r.peer)); });
  }
  return { wire, lastToken: (p) => [...made].reverse().find((x) => x.p === p).tk };
}

async function setup(b, br, nick) {
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(30000);
  const p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.addInitScript(FAKE); await br.wire(p);
  return { p, errs, nick };
}
async function openTable(x, label) {
  await x.p.goto(page);
  await x.p.getByRole("button", { name: /^\S+ \d+ Spiele$/ }).click();
  await x.p.getByRole("button", { name: label }).click();
  await x.p.locator(".tbseats").waitFor();
}
// One move on this page if it has one: the plainest way through a hand.
async function step(x, game) {
  const p = x.p, btn = (name) => p.locator(".tbacts .btn", { hasText: name }).first();
  try {
    for (const name of game === "doko" ? ["Gesund"] : ["18 reizen", "Passe", "Skat aufnehmen"]) {
      if (await btn(name).count()) { await btn(name).click({ timeout: 2000 }); return true; }
    }
    if (game === "skat" && await p.getByText("Tipp zwei Karten an").count()) {
      const cs = p.locator(".tbhand .tbcard.ok");
      while (await p.locator(".tbcard.sel").count() < 2) await cs.nth(await p.locator(".tbcard.sel").count() ? 5 : 0).click({ timeout: 2000 });
      await btn("Diese 2 drücken").click({ timeout: 2000 }); return true;
    }
    const kreuz = p.locator(".tbacts .btn", { hasText: /^Kreuz$/ });
    if (game === "skat" && await kreuz.count()) { await kreuz.first().click({ timeout: 2000 }); return true; }
    const mine = p.locator(".tbhand:not(.tbopen) .tbcard.ok");
    if (await p.locator(".tbturn.hot").count() && await mine.count()) { await mine.first().click({ timeout: 2000 }); return true; }
  } catch (e) { /* the screen was redrawn under the click: next round */ }
  return false;
}
// Pages with x.auto set never get a tap: their own device has to move for them.
async function playHand(all, game) {
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    let ended = 0;
    for (const x of all) { if (await x.p.locator(".tbcheck").count()) ended++; else if (!x.auto) await step(x, game); }
    if (ended === all.length) return;
    await all[0].p.waitForTimeout(60);
  }
  throw new Error("hand did not end: " + (await Promise.all(all.map((x) => x.p.locator(".tbbody").innerText()))).join("\n---\n"));
}
async function tokenOf(br, p) { for (let i = 0; i < 100; i++) { try { return br.lastToken(p); } catch (e) { await p.waitForTimeout(100); } } throw new Error("no invite"); }
async function seatBy(host, br, guest, game) {
  const before = (() => { try { return br.lastToken(host.p); } catch (e) { return null; } })();
  await host.p.locator(".tbseat .btn.hot").first().click();               // whoever sits invites, not only the creator
  let tk = before; for (let i = 0; i < 100 && tk === before; i++) { await host.p.waitForTimeout(100); tk = await tokenOf(br, host.p); }
  await guest.p.goto(page + "#tisch=" + game + "." + tk);
  await guest.p.locator(".tbseat.me").waitFor();
}
// Waits until every page shows its cards; on a timeout the screens tell what went wrong.
async function dealt(all) {
  try { for (const x of all) await x.p.locator(".tbhand .tbcard").first().waitFor({ timeout: 60000 }); }
  catch (e) { throw new Error("not dealt:\n" + (await Promise.all(all.map((x) => x.p.locator(".tbbody").innerText().catch(() => "-")))).join("\n---\n")); }
}
// The one link the page put into the share sheet for the group chat: one token for each of the n free seats.
async function groupLink(host, n) {
  await host.p.waitForFunction((k) => document.querySelectorAll(".tbseat").length && [...document.querySelectorAll(".tbseat")].filter((e) => /eingeladen/.test(e.textContent)).length === k && window.__shared.length, n);
  const shared = await host.p.evaluate(() => window.__shared.slice());
  assert.equal(shared.length, 1, "shared once: " + shared.join(" "));
  const hash = shared[0].slice(shared[0].indexOf("#"));
  assert.match(hash, new RegExp("^#tisch=(doko|skat)(\\.[A-Za-z0-9_-]{22}){" + n + "}$"));
  return page + hash;
}
async function autoOn(x) {
  await x.p.getByRole("button", { name: "🤖 Auto: aus" }).click();
  await x.p.getByRole("button", { name: "🤖 Auto: an" }).waitFor();
  x.auto = true;
}
const badgeOf = (x) => x.p.locator(".tbbadge").textContent();
const handOf = (x) => x.p.locator(".tbhand:not(.tbopen) .tbcard").evaluateAll((els) => els.map((e) => e.dataset.card));

test("Doppelkopf live mit vier Browsern: ein Gruppenlink fuer alle, der Fuenfte liest voll, ein Platz auf Auto, Aufstehen mitten im Spiel, Nachruecken", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker();
  const [A, B, C, D, E] = [await setup(b, br, "Ada"), await setup(b, br, "Ben"), await setup(b, br, "Cem"), await setup(b, br, "Dia"), await setup(b, br, "Eli")];
  await openTable(A, /Doppelkopf live/);
  // A invites everyone at once: three seats held, ONE link for the group chat
  const url = await groupLink(A, 3);
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-tisch.png" });
  // three friends open the same link at the same moment: three different seats
  await Promise.all([B, C, D].map(async (x) => { await x.p.goto(url); await x.p.locator(".tbseat.me").waitFor(); }));
  const four = [A, B, C, D];
  // a fourth friend from the chat is too late
  await E.p.goto(url); await E.p.getByText("Der Tisch ist schon voll").waitFor();
  await dealt(four);                                   // four different seats: four hands of twelve below
  const badges = await Promise.all(four.map(badgeOf));
  assert.equal(new Set(badges).size, 1, badges.join(" | ")); assert.equal(badges[0].split(" ").length, 3);
  // everybody sees only their own twelve cards, and together they are the whole deck
  const hands = await Promise.all(four.map(handOf));
  hands.forEach((h) => assert.equal(h.length, 12));
  assert.equal(hands.flat().length, 48); assert.equal(new Set(hands.flat()).size, 24);
  // D switches to Auto and never taps again: D's own device plays D's cards, the others see the robot
  await autoOn(D);
  for (const x of [A, B, C]) await x.p.locator(".tbscore", { hasText: "🤖" }).waitFor();
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-hand.png" });
  await playHand(four, "doko");
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-ende.png" });
  const pts = await Promise.all(four.map(async (x) => (await x.p.locator(".tbresult b").allInnerTexts()).map(Number)));
  pts.forEach((p) => assert.deepEqual(p, pts[0])); assert.equal(pts[0].reduce((a, c) => a + c, 0), 0);
  for (const x of four) assert.equal(await x.p.locator(".tbcheck").count(), 1, x.nick + ": all cards checked");
  // the next game, and D stands up in the middle of it: D's cards go open to the table, Auto plays them to the end on
  // every device, then the seat is free, C invites E, the table plays on
  for (const x of four) await x.p.getByRole("button", { name: "Nächstes Spiel" }).click();
  await dealt(four);
  await D.p.locator(".liveback").click();
  for (const x of [A, B, C]) await x.p.getByText(/spielt offen für/).waitFor();
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-auto-offen.png" });
  await playHand([A, B, C], "doko");
  const pts2 = await Promise.all([A, B, C].map(async (x) => (await x.p.locator(".tbresult b").allInnerTexts()).map(Number)));
  pts2.forEach((p) => assert.deepEqual(p, pts2[0])); assert.equal(pts2[0].length, 4);
  await E.p.goto("about:blank");
  await seatBy(C, br, E, "doko");
  for (const x of [A, B, C]) await x.p.getByRole("button", { name: "Nächstes Spiel" }).click();
  await dealt([A, B, C, E]);
  assert.equal(new Set(await Promise.all([A, B, C, E].map(badgeOf))).size, 1);
  for (const x of [A, B, C, D, E]) assert.deepEqual(x.errs, [], x.nick);
  await b.close();
});

test("Skat live mit drei Browsern: ein Gruppenlink, ein Platz auf Auto, Reizen, Skat aufnehmen, druecken, alle zaehlen gleich", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker();
  const [A, B, C] = [await setup(b, br, "Ada"), await setup(b, br, "Ben"), await setup(b, br, "Cem")];
  await openTable(A, /Skat live/);
  const url = await groupLink(A, 2);
  await Promise.all([B, C].map(async (x) => { await x.p.goto(url); await x.p.locator(".tbseat.me").waitFor(); }));
  const three = [A, B, C];
  await dealt(three);
  await autoOn(C);                                     // C bids, (maybe) declares and plays on Auto, untouched
  assert.equal(new Set(await Promise.all(three.map(badgeOf))).size, 1);
  const hands = await Promise.all(three.map(handOf)); hands.forEach((h) => assert.equal(h.length, 10)); assert.equal(new Set(hands.flat()).size, 30);
  await playHand(three, "skat");
  if (process.env.TB_SHOTS) for (const x of three) await x.p.screenshot({ path: process.env.TB_SHOTS + "/skat-ende-" + x.nick + ".png" });
  const pts = await Promise.all(three.map(async (x) => (await x.p.locator(".tbresult b").allInnerTexts()).map(Number)));
  pts.forEach((p) => assert.deepEqual(p, pts[0]));
  for (const x of three) assert.deepEqual(x.errs, [], x.nick);
  await b.close();
});

test("Hausregeln als Chips: im Gruppenlink geteilt, alle sehen dieselben; Warum? am Stich erklaert aus den Regeln", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker();
  const [A, B, C, D] = [await setup(b, br, "Ada"), await setup(b, br, "Ben"), await setup(b, br, "Cem"), await setup(b, br, "Dia")];
  await openTable(A, /Doppelkopf live/);
  await A.p.waitForFunction(() => window.__shared.length === 1);
  const chip = A.p.getByRole("button", { name: "2. Dulle sticht 1." });
  assert.equal(await chip.getAttribute("aria-pressed"), "false");
  await chip.click(); await A.p.getByRole("button", { name: "2. Dulle sticht 1.", pressed: true }).waitFor();
  await A.p.getByRole("button", { name: "Gruppenlink nochmal teilen" }).click();
  await A.p.waitForFunction(() => window.__shared.length === 2);
  const shared = await A.p.evaluate(() => window.__shared[1]), url = page + shared.slice(shared.indexOf("#"));
  assert.match(shared, /#tisch=doko(\.[A-Za-z0-9_-]{22}){3}&r=dulle$/);
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/wa-tisch-hausregeln.png" });
  await Promise.all([B, C, D].map(async (x) => { await x.p.goto(url); await x.p.locator(".tbseat.me").waitFor(); }));
  for (const x of [B, C, D]) await x.p.getByRole("button", { name: "2. Dulle sticht 1.", pressed: true }).waitFor();
  const four = [A, B, C, D];
  await dealt(four);
  for (const x of four) assert.equal(await x.p.locator(".tbhouse").textContent(), "⚖ 2. Dulle sticht 1.");
  // until the first card lies on the table, then A asks why
  for (let i = 0; i < 400 && !(await A.p.locator(".tbtrick .tbcard").count()); i++) { for (const x of four) await step(x, "doko"); }
  await A.p.getByRole("button", { name: "❓ Warum?" }).click();
  const ex = A.p.locator(".tbexplain");
  await ex.waitFor();
  const text = await ex.innerText();
  assert.match(text, /(Trumpf angespielt: wer Trumpf hat, muss Trumpf geben\.|\S+ angespielt: wer \S+ hat, muss \S+ bedienen\.)/);
  assert.match(text, /gewinnt: /); assert.match(text, /Trumpf von oben: Herz 10 > Kreuz D > Pik D/);
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/wa-tisch-warum.png" });
  for (const x of four) assert.deepEqual(x.errs, [], x.nick);
  await b.close();
});
