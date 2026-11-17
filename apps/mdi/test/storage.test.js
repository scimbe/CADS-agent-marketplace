// Geraetespeicher (src/broker/storage.js) mit einem localStorage-Ersatz: pub (Snapshot-Karten) und memo bleiben erhalten.
import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../src/broker/storage.js";

function fakeLs() { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

test("saveGame/loadGame behalten pub und memo (Snapshot-Karten, Merkzettel); zu Grosses wird weggelassen, nicht gekuerzt", () => {
  const prev = globalThis.localStorage; globalThis.localStorage = fakeLs();
  try {
    const s = createStorage(), g = "0123456789abcdef";
    s.saveGame({ g, seat: 1, salt: null, n: 2, lh: "a", bh: "b", k: [null, null], pub: { list: [1, 2] }, memo: { own: true } });
    assert.deepEqual(s.loadGame(g).pub, { list: [1, 2] });
    assert.deepEqual(s.loadGame(g).memo, { own: true });
    s.saveGame({ g, seat: 1, salt: null, n: 3, lh: "a", bh: "b", k: [null, null], pub: { big: "x".repeat(20000) }, memo: { big: "y".repeat(600) } });
    assert.equal(s.loadGame(g).pub, undefined); assert.equal(s.loadGame(g).memo, undefined);
  } finally { globalThis.localStorage = prev; }
});

test("Teile-Basis ist das App-Verzeichnis (Staging L2): /duell, /duell/, /duell/index.html und file:// ergeben dieselbe Teile-URL", async () => {
  const { appBase, partUrl } = await import("../src/broker/parts.js");
  const at = (href) => { const u = new URL(href); return { protocol: u.protocol, host: u.host, origin: u.origin, pathname: u.pathname }; };
  for (const h of ["https://x.org/duell", "https://x.org/duell/", "https://x.org/duell/index.html", "https://x.org/duell?f=1"]) assert.equal(partUrl(at(h), "parts/card-a.1.js"), "https://x.org/duell/parts/card-a.1.js", h);
  assert.equal(appBase(at("https://x.org/")), "https://x.org/");
  assert.equal(partUrl(at("file:///tmp/dist/index.html"), "parts/p.js"), "file:///tmp/dist/parts/p.js");
  assert.equal(partUrl(at("https://appassets.androidplatform.net/assets/www/index.html"), "parts/p.js"), "https://appassets.androidplatform.net/assets/www/parts/p.js");
});

test("Feature-Speicher (store): je Feature ein Objekt, hoechstens 8 KiB, ungueltige ids/Werte abgelehnt; Laufzeit reicht saved.feat[id] an context", async () => {
  const { FEAT_MAX } = await import("../src/broker/storage.js");
  const { featureContext } = await import("../src/app/machine.js");
  const { createRuntime } = await import("../src/app/runtime.js");
  const prev = globalThis.localStorage; globalThis.localStorage = fakeLs();
  try {
    const s = createStorage();
    assert.equal(s.loadFeature("frei"), null);
    assert.equal(s.saveFeature("frei", { last: { art: "gedicht" }, text: "Satz vom Login-Umweg" }), true);
    assert.deepEqual(s.loadFeature("frei"), { last: { art: "gedicht" }, text: "Satz vom Login-Umweg" });
    assert.equal(s.saveFeature("Frei!", { a: 1 }), false, "id nur [a-z0-9-]");
    assert.equal(s.saveFeature("frei", [1]), false, "nur Objekte");
    assert.equal(s.saveFeature("frei", { t: "x".repeat(FEAT_MAX) }), false, "zu gross: nicht gespeichert");
    assert.deepEqual(s.loadFeature("frei"), { last: { art: "gedicht" }, text: "Satz vom Login-Umweg" }, "alter Stand bleibt");
    globalThis.localStorage.setItem("mdi.f.frei", "{kaputt"); assert.equal(s.loadFeature("frei"), null, "kaputt: null, kein Wurf");
    // context bekommt saved.feat[id]
    const ctx = featureContext([{ id: "fx", store: true, context: (saved) => ({ fxText: saved && saved.feat && saved.feat.fx ? saved.feat.fx.text : null }) }], { feat: { fx: { text: "hallo" } } });
    assert.equal(ctx.fxText, "hallo");
    // Laufzeit liest nur fuer Features mit store:true
    const asked = [];
    createRuntime({ lang: "de", entropy: () => "e", schedule: (f) => f(), onChange: () => {}, needFeatures: [{ id: "fx", store: true }, { id: "ohne" }],
      storage: { loadFeature: (id) => { asked.push(id); return { text: "x" }; } } });
    assert.deepEqual(asked, ["fx"]);
  } finally { globalThis.localStorage = prev; }
});
