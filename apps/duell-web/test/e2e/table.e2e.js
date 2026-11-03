// Doppelkopf with four browsers and Skat with three, end to end. Only the two-player links of live.js are replaced:
// a small broker here pipes each pair's messages between the pages, like the data channel does. The mesh, the
// invites from seat to seat, the joint shuffle, the rules, the screens and the score all run for real.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const page = "file://" + path.join(__dirname, "../../dist/index.html");

const FAKE = `(() => {
  window.__liveOn = true;
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
async function playHand(all, game) {
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    let ended = 0;
    for (const x of all) { if (await x.p.locator(".tbcheck").count()) ended++; else await step(x, game); }
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
const badgeOf = (x) => x.p.locator(".tbbadge").textContent();
const handOf = (x) => x.p.locator(".tbhand:not(.tbopen) .tbcard").evaluateAll((els) => els.map((e) => e.dataset.card));

test("Doppelkopf live mit vier Browsern: Platz fuer Platz eingeladen, gleiche Bilder, ein ganzes Spiel, Aufstehen und Nachruecken", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker();
  const [A, B, C, D, E] = [await setup(b, br, "Ada"), await setup(b, br, "Ben"), await setup(b, br, "Cem"), await setup(b, br, "Dia"), await setup(b, br, "Eli")];
  await openTable(A, /Doppelkopf live/);
  // A invites at once (a seat is held); after that the player who came last invites the next
  await A.p.locator(".tbseat", { hasText: "eingeladen" }).waitFor();
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-tisch.png" });
  await B.p.goto(page + "#tisch=doko." + await tokenOf(br, A.p)); await B.p.locator(".tbseat.me").waitFor();
  await seatBy(B, br, C, "doko"); await seatBy(C, br, D, "doko");
  const four = [A, B, C, D];
  await dealt(four);
  const badges = await Promise.all(four.map(badgeOf));
  assert.equal(new Set(badges).size, 1, badges.join(" | ")); assert.equal(badges[0].split(" ").length, 3);
  // everybody sees only their own twelve cards, and together they are the whole deck
  const hands = await Promise.all(four.map(handOf));
  hands.forEach((h) => assert.equal(h.length, 12));
  assert.equal(hands.flat().length, 48); assert.equal(new Set(hands.flat()).size, 24);
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-hand.png" });
  await playHand(four, "doko");
  if (process.env.TB_SHOTS) await A.p.screenshot({ path: process.env.TB_SHOTS + "/doko-ende.png" });
  const pts = await Promise.all(four.map(async (x) => (await x.p.locator(".tbresult b").allInnerTexts()).map(Number)));
  pts.forEach((p) => assert.deepEqual(p, pts[0])); assert.equal(pts[0].reduce((a, c) => a + c, 0), 0);
  // the next game, and D stands up in the middle of it: the seat is free again, C invites E, the table plays on
  for (const x of four) await x.p.getByRole("button", { name: "Nächstes Spiel" }).click();
  await dealt(four);
  await D.p.locator(".liveback").click();
  for (const x of [A, B, C]) await x.p.getByText(/ist aufgestanden/).waitFor();
  await seatBy(C, br, E, "doko");
  await dealt([A, B, C, E]);
  assert.equal(new Set(await Promise.all([A, B, C, E].map(badgeOf))).size, 1);
  for (const x of [A, B, C, D, E]) assert.deepEqual(x.errs, [], x.nick);
  await b.close();
});

test("Skat live mit drei Browsern: Reizen, Skat aufnehmen, druecken, Kreuz spielen, alle zaehlen gleich", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined }), br = broker();
  const [A, B, C] = [await setup(b, br, "Ada"), await setup(b, br, "Ben"), await setup(b, br, "Cem")];
  await openTable(A, /Skat live/);
  await A.p.locator(".tbseat", { hasText: "eingeladen" }).waitFor();
  await B.p.goto(page + "#tisch=skat." + await tokenOf(br, A.p)); await B.p.locator(".tbseat.me").waitFor();
  await seatBy(B, br, C, "skat");
  const three = [A, B, C];
  await dealt(three);
  assert.equal(new Set(await Promise.all(three.map(badgeOf))).size, 1);
  const hands = await Promise.all(three.map(handOf)); hands.forEach((h) => assert.equal(h.length, 10)); assert.equal(new Set(hands.flat()).size, 30);
  await playHand(three, "skat");
  if (process.env.TB_SHOTS) for (const x of three) await x.p.screenshot({ path: process.env.TB_SHOTS + "/skat-ende-" + x.nick + ".png" });
  const pts = await Promise.all(three.map(async (x) => (await x.p.locator(".tbresult b").allInnerTexts()).map(Number)));
  pts.forEach((p) => assert.deepEqual(p, pts[0]));
  for (const x of three) assert.deepEqual(x.errs, [], x.nick);
  await b.close();
});
