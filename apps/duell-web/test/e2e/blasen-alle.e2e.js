"use strict";
// Bubbles on every card (A8 of the plan "freie Karte"): a card drawn by render.js tells where its words, stickers and wave
// landed (cv._teile), turn, duel and quest cards add the parts their drawing always puts at the same place (Teile.FIX).
// Every idea of the shelf with an editor picture, on a 390x844 phone: at least 2 bubbles, none on a title's words or on
// the name and signet at the bottom, and a tap on each opens the sheet its part names.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./lib/grund.js");
const IDEAS = require("../../src/ideas.json").ideas;
const SHOT = process.env.BLASEN_SHOT || "";
// kinds without an editor picture: a card table is played live (TableUI), an arcade duel starts its game
const NO_STAGE = ["arcade", "table"];
let b, url;
test.before(async () => { b = await G.launch(); url = await G.webUrl("index.html"); });
test.after(async () => { await b.close(); });

async function phone() {
  const ctx = await G.person(b, { view: "phone390" }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => document.body.getAttribute("data-state") !== "boot");
  await p.waitForFunction(() => window.Daily.full(), null, { timeout: 10000 });
  return { p, errs, ctx };
}
const meets = (a, c) => a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
// open a doc (an idea id, or a blank kind with changes) and wait for its bubbles; -> what is on screen, or null without a picture
const open = (p, what) => p.evaluate(async (w) => {
  const D = window.Daily, A = window.DailyApp;
  let d;
  if (w.id) { const i = D.byId(w.id); d = D.docFromIdea(i, A.me(), "de"); A.openEditor(d, { idea: i }); }
  else { d = Object.assign(D.blankDoc(w.kind, A.me(), "de"), w.set || {}); A.openEditor(d, { own: true }); }
  for (let i = 0; i < 40 && !(window.Blasen && document.querySelector("#tabs [role=tab]")); i++) await new Promise((ok) => setTimeout(ok, 100));
  await new Promise((ok) => setTimeout(ok, 700));
  const ed = document.getElementById("editor"), wrap = document.getElementById("stagewrap");
  if (ed.hidden || getComputedStyle(wrap).display === "none" || !wrap.offsetHeight || !A.ed()) return null;
  const r = (e) => { const q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height }; };
  const doc = A.ed().doc, box = document.getElementById(doc.k === "game" ? "gamestage" : "stage"), br = box.getBoundingClientRect();
  const off = (t) => ({ id: t.id, x: t.x + br.left + box.clientLeft, y: t.y + br.top + box.clientTop, w: t.w, h: t.h });
  const T = window.Teile;
  return {
    k: doc.k, st: doc.st,
    bubbles: Array.from(document.querySelectorAll("#blasen .blase")).filter((e) => e.offsetParent).map((e) => Object.assign(r(e), { id: e.dataset.blase, panel: e.dataset.blatt })),
    free: T.frei(doc).map(off).concat(T.teile(doc).filter((t) => T.TEXT.includes(t.id) && doc.k !== "game").map(off)),
    tabs: Array.from(document.querySelectorAll("#tabs [role=tab]")).map((e) => e.dataset.k)
  };
}, what);
function check(m, name) {
  assert.ok(m.bubbles.length >= 2, name + ": mindestens 2 Blasen, hat " + m.bubbles.map((x) => x.id));
  m.bubbles.forEach((x) => {
    assert.ok(m.tabs.includes(x.panel), name + ": " + x.id + " -> " + x.panel + " ist ein Reiter");
    m.free.forEach((f) => assert.ok(!meets(x, f), name + ": " + x.id + " liegt auf " + f.id + " " + JSON.stringify(f)));
  });
}
async function tapAll(p, m, name) {
  for (const x of m.bubbles) {
    const e = p.locator(`#blasen .blase[data-blase="${x.id}"]`);
    const q = await e.boundingBox(); await p.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2);
    await p.waitForFunction((k) => { const t = document.getElementById("tab" + k); return t && t.getAttribute("aria-selected") === "true"; }, x.panel, { timeout: 4000 })
      .catch(() => { throw new Error(name + ": " + x.id + " oeffnet " + x.panel + " nicht"); });
  }
}

test("Jede Karte des Regals mit Editorbild: >= 2 Blasen, keine auf Titelschrift, Name oder Signet, jeder Tipp oeffnet sein Blatt (390x844)", async () => {
  const { p, errs, ctx } = await phone();
  const seen = {}, none = [];
  for (const i of IDEAS) {
    if (NO_STAGE.includes(i.kind)) { none.push(i.kind); continue; }
    const m = await open(p, { id: i.id });
    if (!m) { none.push(i.kind + ":" + i.id); continue; }
    check(m, i.id); seen[m.k] = (seen[m.k] || 0) + 1;
    if (seen[m.k] <= 2 || i.kind !== "turn") await tapAll(p, m, i.id);   // every bubble of each kind, of the many turn cards the first two
  }
  assert.deepEqual(Object.keys(seen).sort(), ["card", "game", "photo", "quest", "sound", "turn"]);
  // turn cards whose picture is hidden while they wait for "Los" (style.css .timed, until PR #215): listed, never silent
  assert.deepEqual([...new Set(none.filter((x) => !x.startsWith("turn:")))].sort(), NO_STAGE, "ohne Bild nur Tisch und Arcade");
  console.log("Blasen auf " + Object.entries(seen).map((e) => e.join(" x")).join(", ") + "; ohne Editorbild: " + none.filter((x) => x.startsWith("turn:")).join(", "));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("Karte, Meme, Foto-Poster, Sound/Beat, Duell, Geheimnachricht: Blasen fuer Text, Stil, Farbe, Sticker, Foto, Klang, Agent", async () => {
  const { p, errs, ctx } = await phone();
  const CASES = [
    ["karte", { kind: "card", set: { st: "druck", x: "Danke für alles", sk: [{ e: "🌟", x: 0.8, y: 0.2, r: 0, z: 1 }] } }, ["farbe", "sticker", "stil", "text"]],
    ["karte-zettel", { kind: "card", set: { st: "zettel", x: "Einkauf: Milch, Brot", sk: [] } }, ["farbe", "stil", "text"]],
    ["meme", { kind: "photo", set: { st: "meme", x: "Montag", y: "schon wieder" } }, ["farbe", "foto", "stil", "text", "text2"]],
    ["poster", { kind: "photo", set: { st: "poster", x: "Sommer", y: "kommt" } }, ["farbe", "foto", "stil", "text", "text2"]],
    ["sound", { kind: "sound" }, ["farbe", "klang", "text"]],
    ["duell", { kind: "duel" }, ["agent", "arena", "farbe", "rivale"]],
    ["geheim", { kind: "quest" }, ["ende", "farbe", "raetsel", "titel"]]
  ];
  for (const [name, what, ids] of CASES) {
    const m = await open(p, what);
    assert.ok(m, name + " hat ein Bild");
    check(m, name);
    assert.deepEqual(m.bubbles.map((x) => x.id).filter((x) => x !== "wunsch" && x !== "wuerfel").sort(), ids, name + ": " + m.bubbles.map((x) => x.id + ">" + x.panel));
    await tapAll(p, m, name);
    if (SHOT && ["karte", "meme", "sound", "duell"].includes(name)) await p.screenshot({ path: SHOT + "-" + name + ".png" });
  }
  // a quiz card and a turn card, each with its picture
  for (const [name, id] of [["quiz", IDEAS.find((i) => i.kind === "turn" && /quiz/.test(i.id + JSON.stringify(i.turn || {})))], ["zug", IDEAS.find((i) => i.id === "zug-einig") || IDEAS.find((i) => i.kind === "turn")]]) {
    if (!id) continue;
    const m = await open(p, { id: id.id });
    if (!m) continue;
    check(m, name);
    assert.ok(m.bubbles.some((x) => x.panel === "Move"), name + ": eine Blase fuer den Zug");
    if (SHOT) await p.screenshot({ path: SHOT + "-" + name + ".png" });
  }
  assert.deepEqual(errs, []);
  await ctx.close();
});
