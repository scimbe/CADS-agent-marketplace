// Agent duel live (rock-paper-scissors to 5) end to end on two pages. Like live.e2e.js, live.js is replaced by a direct
// pipe between the pages; screens, commit-reveal, points, cheating and closing run for real.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const { chromium, devices } = require("playwright-core");
const page = "file://" + path.join(__dirname, "../../dist/index.html");
const TOKEN = "R".repeat(22), CH = "5eed".padEnd(64, "0");
const FAKE = (side) => `(() => {
  window.__liveOn = true; window.__closed = 0;
  const conn = { channel: "${CH}", caller: ${side === "a"}, send: (o) => window.__liveOut(JSON.stringify(o)), on: (h) => { window.__liveH = h; }, onClose: (h) => { window.__liveClose = h; }, close: () => { window.__closed++; window.__liveBye(); } };
  window.__liveIn = (s) => window.__liveH && window.__liveH(JSON.parse(s));
  window.__liveEnd = () => window.__liveClose && window.__liveClose();
  window.Live = {
    invite: async () => ({ token: "${TOKEN}", expires: Date.now() + 900000, ready: new Promise((ok) => { window.__liveReady = () => ok(conn); }) }),
    accept: async (t) => { if (t !== "${TOKEN}") throw new Error("gone"); window.__liveJoined(); return conn; }
  };
})();`;
const until = async (f, ms = 15000) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 50)); } };

// Two phones; `tamper` may change B's messages to A on the way.
async function setup(b, tamper) {
  const mk = async (side) => { const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(20000); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e))); await p.addInitScript(FAKE(side)); return { p, errs, out: [] }; };
  const A = await mk("a"), B = await mk("b");
  await A.p.exposeFunction("__liveOut", (s) => { A.out.push(JSON.parse(s)); return B.p.evaluate((m) => window.__liveIn(m), s).catch(() => {}); });
  await B.p.exposeFunction("__liveOut", (s) => { B.out.push(JSON.parse(s)); const m = tamper ? tamper(JSON.parse(s)) : JSON.parse(s); return A.p.evaluate((x) => window.__liveIn(x), JSON.stringify(m)).catch(() => {}); });
  await B.p.exposeFunction("__liveJoined", () => A.p.evaluate(() => window.__liveReady()).catch(() => {}));
  await A.p.exposeFunction("__liveBye", () => B.p.evaluate(() => window.__liveEnd()).catch(() => {}));
  await B.p.exposeFunction("__liveBye", () => A.p.evaluate(() => window.__liveEnd()).catch(() => {}));
  // A opens the agent duel, picks "live" instead of the bot and shares the invite; B opens the link
  await A.p.goto(page); await A.p.getByRole("button", { name: "🤖 Agent" }).click();
  await A.p.getByRole("button", { name: "Duell starten" }).waitFor(); await A.p.locator("#tabs button", { hasText: "Mein Agent" }).click();
  await A.p.getByRole("button", { name: /Live gegen Freund/ }).click();
  await A.p.getByText("Warte auf deinen Freund").waitFor();
  await B.p.goto(page + "#live=" + TOKEN + "&g=rps");
  await B.p.getByText("Du wirst herausgefordert!").first().waitFor();
  await B.p.getByText(/Keiner sieht die Hand des anderen vorher/).waitFor();
  await A.p.getByText("Dein Freund ist da!").waitFor();
  const badgeA = await A.p.locator(".livebadge").textContent(), badgeB = await B.p.locator(".livebadge").textContent();
  assert.equal(badgeA, badgeB); assert.equal(badgeA.split(" ").length, 3);
  await A.p.getByRole("button", { name: "Starten", exact: true }).click();
  for (const x of [A, B]) { await x.p.getByText("Wähl deine Hand.").waitFor(); assert.equal(await x.p.locator(".livemini").textContent(), badgeA, "die drei Bilder bleiben im Spiel"); }
  return { A, B };
}
const hand = (x, i) => x.p.locator(".chip.hand").nth(i).click();
const score = async (x) => (await x.p.locator(".livescore").textContent()).match(/(\d+) : (\d+)/).slice(1).map(Number);
const reveals = (x) => x.out.filter((m) => m.t === "r").length;

test("Agenten-Duell live: einladen, gleiche Bilder, versiegelte Haende, ein ganzes Spiel bis 5", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const { A, B } = await setup(b);
  // round 1: A picks first; B learns only that A picked, not which hand
  await hand(A, 0);
  await A.p.getByText(/Versiegelt/).waitFor(); await B.p.getByText(/hat gewählt/).waitFor();
  const sealed = A.out.filter((m) => m.t === "c");
  assert.equal(sealed.length, 1); assert.deepEqual(Object.keys(sealed[0]).sort(), ["h", "n", "t"]);
  assert.equal(reveals(A), 0, "A deckt nicht auf, bevor B versiegelt hat");
  await hand(B, 2);                                       // rock beats scissors: point for A
  await A.p.getByText(/Punkt für dich/).waitFor(); await B.p.getByText(/Punkt für/).waitFor();
  assert.deepEqual(await score(A), [1, 0]); assert.deepEqual(await score(B), [0, 1]);
  // B loses a point, one draw, then A wins four times with paper on rock
  const plan = [[0, 1], [2, 2], [1, 0], [1, 0], [1, 0], [1, 0]];
  for (let k = 0; k < plan.length; k++) {
    await hand(B, plan[k][1]); await hand(A, plan[k][0]);
    await until(() => reveals(A) === k + 2 && reveals(B) === k + 2);
    if (k < plan.length - 1) for (const x of [A, B]) await x.p.locator(".chip.hand:not([disabled])").first().waitFor();
  }
  await A.p.getByText("Gewonnen 5:1!").waitFor(); await B.p.getByText("Knapp! 1:5").waitFor();
  assert.deepEqual(await score(A), [5, 1]); assert.deepEqual(await score(B), [1, 5]);
  // in every round each side sent its seal before its reveal, and nobody revealed before the other's seal had arrived
  for (let n = 0; n < 7; n++) for (const [me, other] of [[A, B], [B, A]]) assert.ok(me.out.findIndex((m) => m.t === "r" && m.n === n) > me.out.findIndex((m) => m.t === "c" && m.n === n));
  // again: both tap "Nochmal", a fresh game starts at 0:0 and still works
  await A.p.getByRole("button", { name: "Nochmal" }).click(); await B.p.getByRole("button", { name: "Nochmal" }).click();
  for (const x of [A, B]) { await x.p.getByText("Wähl deine Hand.").waitFor(); assert.deepEqual(await score(x), [0, 0]); }
  await hand(A, 1); await hand(B, 0); await A.p.getByText(/Punkt für dich/).waitFor(); assert.deepEqual(await score(B), [0, 1]);
  // leaving with the X frees the channel and tells the other side
  await A.p.locator(".liveback").click();
  assert.equal(await A.p.evaluate(() => window.__closed), 1, "Kanal freigegeben");
  await B.p.getByText(/Verbindung weg/).waitFor();
  assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []); await b.close();
});

test("Agenten-Duell live: wer nach dem Siegel eine andere Hand aufdeckt, faellt auf", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const { A, B } = await setup(b, (m) => (m.t === "r" ? { ...m, h: (m.h + 1) % 3 } : m));   // B's reveal reaches A with another hand
  await hand(A, 0); await hand(B, 1);
  await A.p.getByText(/passt nicht zum Siegel/).waitFor();
  assert.equal(await A.p.evaluate(() => window.__closed), 1, "Kanal freigegeben");
  await B.p.getByText(/Verbindung weg/).waitFor();
  assert.deepEqual(A.errs, []); assert.deepEqual(B.errs, []); await b.close();
});

test("Agenten-Duell live: ohne Netzpfad kommt die ehrliche Meldung", async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
  const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "de-DE" }); ctx.setDefaultTimeout(15000); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.addInitScript(`window.__liveOn = true; window.Live = { accept: async () => { throw new Error("rtc"); }, invite: async () => { throw new Error("rtc"); } };`);
  await p.goto(page + "#live=" + TOKEN + "&g=rps");
  await p.getByText(/Eure Netze lassen gerade keine Verbindung zu/).waitFor();
  await p.getByRole("button", { name: "Neu einladen" }).click();
  await p.getByText(/Eure Netze lassen gerade keine Verbindung zu/).waitFor();
  assert.deepEqual(errs, []); await b.close();
});
