"use strict";
// src/parts.js: the loader for the parts built next to the page, run against a minimal fake document.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const code = fs.readFileSync(path.join(__dirname, "../src/parts.js"), "utf8");
const MAN = { play: { f: "parts/play.aaaaaaaaaaaa.js", h: "sha384-P", d: [] }, table: { f: "parts/table.bbbbbbbbbbbb.js", h: "sha384-T", d: ["play"] }, qr: { f: "parts/qr.cccccccccccc.js", h: "sha384-Q", d: [] } };

function page(href, opt) {
  opt = opt || {};
  const u = new URL(href), added = [], listeners = {};
  const w = {
    DailyParts: MAN, DuellIdeas: { ideas: [{ kind: "arcade" }, { kind: "turn" }, { kind: "arcade" }] },
    location: { pathname: u.pathname, protocol: u.protocol, hostname: u.hostname },
    addEventListener: (e, f) => { listeners[e] = f; }, setTimeout: (f) => f(), requestIdleCallback: null,
    Kit: { toast: (m) => { w.toasts.push(m); }, t: (k) => k }, toasts: [],
    document: {
      createElement: () => ({ remove() { this.removed = true; } }),
      head: { appendChild: (s) => { added.push(s); if (opt.auto) setImmediate(() => opt.auto(s, w)); } }
    }
  };
  w.window = w;
  vm.runInNewContext(code, { window: w, location: w.location, document: w.document, setTimeout: w.setTimeout, Promise, Object, Error });
  return { w, added, listeners };
}
// The fake "network": a part runs (sets its module) and reports loaded, or fails.
const run = (mods) => (s, w) => { const name = s.src.match(/parts\/([a-z]+)\./)[1]; if (mods[name] === "fail") return s.onerror(); Object.assign(w, mods[name] || {}); s.onload(); };

const tick = () => new Promise((r) => setImmediate(r));
test("Teile: Pfad neben der Seite, fuer index.html, /duell/ und /duell", async () => {
  for (const [href, want] of [["file:///var/app/duell/index.html", "/var/app/duell/parts/qr.cccccccccccc.js"], ["https://h.example/duell/", "/duell/parts/qr.cccccccccccc.js"],
    ["https://h.example/duell", "/duell/parts/qr.cccccccccccc.js"], ["https://appassets.androidplatform.net/assets/duell/index.html", "/assets/duell/parts/qr.cccccccccccc.js"]]) {
    const { w, added } = page(href); w.Parts.need("qr").catch(() => {}); await tick();
    assert.equal(added[0].src, want, href);
  }
});
test("Teile: SRI-Hash nur ueber http(s); file:// (iOS, Tests) ohne", async () => {
  let p = page("https://h.example/duell/"); p.w.Parts.need("qr").catch(() => {}); await tick(); assert.equal(p.added[0].integrity, "sha384-Q");
  p = page("file:///x/duell/index.html"); p.w.Parts.need("qr").catch(() => {}); await tick(); assert.equal(p.added[0].integrity, undefined);
});
test("Teile: Abhaengigkeiten zuerst, jeder Teil nur einmal, nur Teile aus dem Manifest", async () => {
  const { w, added } = page("file:///x/index.html", { auto: run({}) });
  await Promise.all([w.Parts.need("table"), w.Parts.need("play"), w.Parts.need("table")]);
  assert.deepEqual(added.map((s) => s.src.match(/parts\/([a-z]+)/)[1]), ["play", "table"]);
  assert.ok(w.Parts.ready("play") && w.Parts.ready("table") && !w.Parts.ready("qr"));
  await assert.rejects(w.Parts.need("nichtda"));
  assert.equal(added.length, 2);
});
test("Teile: fehlt die Datei, sagt die Seite es, und der naechste Versuch laedt neu", async () => {
  const mods = { qr: "fail" };
  const { w, added } = page("file:///x/index.html", { auto: run(mods) });
  await assert.rejects(w.Parts.use("qr", () => {}));
  assert.deepEqual(w.toasts, ["part_fail"]); assert.ok(added[0].removed);
  mods.qr = {}; await w.Parts.need("qr"); assert.equal(added.length, 2);
});
test("Teile: scheitert eine Abhaengigkeit, laedt der naechste Versuch auch den abhaengigen Teil neu", async () => {
  const mods = { play: "fail" };
  const { w, added } = page("file:///x/index.html", { auto: run(mods) });
  await assert.rejects(w.Parts.need("table"), /part play/);
  assert.deepEqual(added.map((s) => s.src.match(/parts\/([a-z]+)/)[1]), ["play"]);
  mods.play = {}; mods.table = { TableUI: { open() {} } };
  await w.Parts.need("table");
  assert.deepEqual(added.map((s) => s.src.match(/parts\/([a-z]+)/)[1]), ["play", "play", "table"]);
  assert.ok(w.Parts.ready("table"));
});
test("Platzhalter: laedt der Teil, setzt sein Modul aber nicht (Fehler beim Ausfuehren), sagt die Seite es", async () => {
  const { w } = page("file:///x/index.html", { auto: run({ table: {} }) });
  await w.TableUI.open("doko");
  assert.deepEqual(w.toasts, ["part_fail"]);
});
test("Platzhalter: rufen den echten Teil, sobald er geladen ist; zaehlen Arcade ohne den Teil", async () => {
  const calls = [];
  const real = { LiveUI: { invite: (o) => calls.push(["invite", o]), accept: (a, b) => calls.push(["accept", a, b]), close() {}, on: () => true },
    ArcadeUI: { menu: (g) => calls.push(["menu", g]), demo: (c, a) => calls.push(["demo", a]), tiles() {}, count: () => 2 } };
  const { w } = page("file:///x/index.html", { auto: run({ play: real, table: { TableUI: { open: (g) => calls.push(["open", g]) } } }) });
  assert.equal(w.LiveUI.on(), true); assert.equal(w.ArcadeUI.count(), 2); assert.equal(w.ArcadeUI.dress(), false);
  w.ArcadeUI.demo("c", null);   // no arcade sheet: nothing is loaded for it
  assert.ok(!w.Parts.ready("play"));
  await w.LiveUI.accept("tok", "puck");
  assert.deepEqual(calls, [["accept", "tok", "puck"]]); assert.equal(w.LiveUI, real.LiveUI);
  await w.Parts.need("table"); calls.length = 0;
});
test("Platzhalter: demo gilt nur fuer das letzte Blatt (es kann wechseln, waehrend der Teil laedt)", async () => {
  const calls = [];
  const { w } = page("file:///x/index.html", { auto: run({ play: { ArcadeUI: { demo: (c, a) => calls.push(a) } } }) });
  w.ArcadeUI.demo("c", { g: "puck" }); w.ArcadeUI.demo("c", null);
  await w.Parts.need("play"); await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, []);
  const p = page("file:///x/index.html", { auto: run({ play: { ArcadeUI: { demo: (c, a) => calls.push(a) } } }) });
  p.w.ArcadeUI.demo("c", { g: "puck" }); await p.w.Parts.need("play"); await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, [{ g: "puck" }]);
});
test("Web: alle Teile vorab, sobald die Seite ruht (offline weiter nutzbar); in den Apps nicht", async () => {
  let p = page("https://demos.example/duell/", { auto: run({}) });
  p.listeners.load(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.deepEqual(p.added.map((s) => s.src.match(/parts\/([a-z]+)/)[1]).sort(), ["play", "qr", "table"]);
  for (const href of ["file:///x/duell/index.html", "https://appassets.androidplatform.net/assets/duell/index.html"]) {
    p = page(href); assert.equal(p.listeners.load, undefined, href);
  }
});
test("Platzhalter passen zu den echten Modulen: LiveUI-Schalter, Arcade-Zahl aus dem Katalog", () => {
  assert.match(fs.readFileSync(path.join(__dirname, "../src/live-ui.js"), "utf8"), /\nvar ON = true;/, "live-ui.js ON und parts.js on() gleich");
  const A = require("../src/arcade2.js");
  for (const f of ["../src/ideas.json", "../src/flavors/business/ideas.json"]) {
    for (const i of require(f).ideas.filter((x) => x.kind === "arcade")) assert.ok(A.GAMES[i.arcade.g], f + ": " + i.id);
  }
  // Every call the core makes on a stand-in exists there.
  const core = ["app.js", "turn-ui.js", "modes.js"].map((f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8")).join("\n");
  // The stand-ins are read from src/parts.js itself (run against the fake page), not listed here by hand.
  const { w } = page("file:///x/index.html"), seen = new Set();
  for (const m of core.matchAll(/window\.(LiveUI|ArcadeUI|TableUI)\.([a-zA-Z]+)\(/g)) {
    assert.equal(typeof w[m[1]][m[2]], "function", m[0] + " fehlt als Platzhalter in parts.js"); seen.add(m[1]);
  }
  assert.deepEqual([...seen].sort(), ["ArcadeUI", "LiveUI", "TableUI"], "der Kern ruft alle drei Platzhalter");
});
test("Teile: der Katalog wird sofort angefragt, sobald das Manifest ihn nennt; andere Teile erst bei Bedarf", async () => {
  const saved = Object.assign({}, MAN);
  MAN.katalog = { f: "parts/katalog.dddddddddddd.js", h: "sha384-K", d: [] };
  try {
    const { added } = page("file:///x/index.html"); await tick();
    assert.deepEqual(added.map((s) => s.src.match(/parts\/([a-z]+)/)[1]), ["katalog"]);
  } finally { delete MAN.katalog; Object.assign(MAN, saved); }
  const { added } = page("file:///x/index.html"); await tick();
  assert.deepEqual(added, [], "ohne Katalog im Manifest laedt der Start nichts");
});
test("Registrierungs-API (turnzwei, logik): je Art ein Name nur einmal, nur gueltige Namen, get/list/kinds; dieselbe Registry je Teil", () => {
  const { w } = page("file:///x/index.html"), R = w.Parts.registry("turnzwei", ["rule", "widget"]);
  assert.equal(w.Parts.registry("turnzwei", ["x"]), R, "ein Teil, eine Registry");
  const def = { turns: [] };
  assert.equal(R.add("rule", "checkin", def), def); R.add("widget", "board", () => 1); R.add("rule", "abc-2", {});
  assert.equal(R.get("rule", "checkin"), def); assert.equal(R.get("rule", "nichtda"), null); assert.equal(R.get("rule", "toString"), null);
  assert.deepEqual([...R.list("rule")], ["abc-2", "checkin"]); assert.deepEqual([...R.kinds()], ["rule", "widget"]);
  assert.throws(() => R.add("rule", "checkin", {}), /twice/); assert.throws(() => R.add("rule", "Gross", {}), /bad id/);
  assert.throws(() => R.add("gen", "x", {}), /unknown kind/); assert.throws(() => R.get("gen", "x"), /unknown kind/);
  const fs0 = require("node:fs"), rd = (f) => fs0.readFileSync(path.join(__dirname, "../src", f), "utf8");
  // the two empty parts: only their registry, nothing else yet
  for (const [f, name, kinds] of [["turn2.js", "Turn2", ["rule", "widget"]], ["logik.js", "Logik", ["gen"]]]) {
    const p = page("file:///x/index.html").w; vm.runInNewContext(rd(f), { window: p });
    assert.deepEqual([...p[name].kinds()], kinds); assert.deepEqual(kinds.map((k) => p[name].list(k).length), kinds.map(() => 0));
  }
});
