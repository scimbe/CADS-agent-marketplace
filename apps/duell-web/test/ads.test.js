"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../src/ads.js");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const build = (env) => { execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js")], { env: { ...process.env, DAILY_ADS: "", ...env } }); return fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8"); };

test("Werbung: Schalter ist im Build aus, nur DAILY_ADS=1 schaltet ihn an; CSP der Datei bleibt streng", () => {
  const off = build({});
  assert.match(off, /window\.DailyFlags=\{"ads":false\}/);
  const csp = off.match(/Content-Security-Policy[^>]*>/)[0];
  assert.match(csp, /default-src 'none'; script-src 'unsafe-inline' https:\/\/webconference\.bunsenbrenner\.org 'wasm-unsafe-eval';/);
  assert.ok(!/googlesyndication|strict-dynamic|https: /.test(csp), "AdSense nie in der CSP der Datei");
  assert.match(build({ DAILY_ADS: "1" }), /window\.DailyFlags=\{"ads":true\}/);
  build({});
});

test("Werbung: ohne Schalter, mit Pro oder heute ausgeblendet fragt die Seite nicht", () => {
  assert.equal(A.allowed({ ads: false }, null, "", "2026-11-03"), false);
  assert.equal(A.allowed(null, null, "", "2026-11-03"), false);
  assert.equal(A.allowed({ ads: true }, { abo: true }, "", "2026-11-03"), false);
  assert.equal(A.allowed({ ads: true }, null, "2026-11-03", "2026-11-03"), false);
  assert.equal(A.allowed({ ads: true }, { abo: false }, "2026-11-02", "2026-11-03"), true);
});

test("Werbung: nur gepruefte Felder, nur https-Links, Bild nur als data:-URL", () => {
  const ok = A.sanitize({ id: "eis-1", by: "Eisdiele <b>Nord</b>", t: "Kugel gratis", s: "nur heute", img: "data:image/png;base64,iVBORw0KGgo=", url: "https://example.org/x", extra: "weg" });
  assert.deepEqual(ok, { id: "eis-1", by: "Eisdiele bNord/b", t: "Kugel gratis", s: "nur heute", img: "data:image/png;base64,iVBORw0KGgo=", url: "https://example.org/x" });
  assert.equal(A.sanitize({ id: "x", by: "A", t: "B", url: "javascript:alert(1)" }).url, "");
  assert.equal(A.sanitize({ id: "x", by: "A", t: "B", url: "http://example.org" }).url, "");
  assert.equal(A.sanitize({ id: "x", by: "A", t: "B", img: "https://tracker.example/p.gif" }).img, "");
  assert.equal(A.sanitize({ id: "x", by: "A", t: "B", img: "data:image/svg+xml;base64,PHN2Zz4=" }).img, "");
  assert.equal(A.sanitize({ id: "X Y", by: "A", t: "B" }), null);
  assert.equal(A.sanitize({ id: "x", by: "", t: "B" }), null, "ohne Absender keine Anzeige");
});

test("AdSense: nur im Web, nie in der App-Huelle, nur mit gueltiger Kennung", () => {
  const cfg = { client: "ca-pub-1234567890123456", slot: "1234567890" };
  assert.deepEqual(A.adsense(cfg, undefined), cfg);
  assert.equal(A.adsense(cfg, { share: function () {} }), null);
  assert.equal(A.adsense({ client: "pub-1", slot: "1" }, undefined), null);
  assert.equal(A.adsense(undefined, undefined), null);
});

test("Pro: Kauf nur im Web und nur wenn der Server ihn anbietet; die App zeigt keinen Preis und keinen Link", () => {
  assert.equal(A.offer(null, undefined), "none");
  assert.equal(A.offer({ shop: { buy: false } }, undefined), "none");
  assert.equal(A.offer({ shop: { buy: true } }, undefined), "shop");
  assert.equal(A.offer({ shop: { buy: true } }, {}), "app");
  const s = noComments(src("ads.js")), at = s.indexOf('if (how === "app")'), app = s.slice(at, s.indexOf("\n", at));
  assert.ok(/return; \}$/.test(app.trim()) && !/proPrice|href/.test(app), "App-Zweig endet ohne Preis und Link");
  assert.match(src("ai.js"), /meter\.shop\.buy && window\.Ads\) return window\.Ads\.pro/, "die KI-Wand zeigt Pro erst, wenn der Server es anbietet");
  assert.match(src("ads.js"), /Ai\.wall\(b, el, true\)/, "aus der Anzeige kein \"du hast deine Versuche genutzt\"");
});

test("Werbung: ein Weg nach draussen (Ai.post \"/ad\" mit Sprache und Art), kein Geraete-Kennzeichen; Skript nur von AdSense", () => {
  const s = noComments(src("ads.js"));
  assert.equal((s.match(/Ai\.post\(/g) || []).length, 1);
  const call = s.slice(s.indexOf("Ai.post("), s.indexOf("\n", s.indexOf("Ai.post(")));
  assert.match(call, /Ai\.post\("\/ad", \{ lang: Kit\.lang, kind: [^}]*\}\)/);
  assert.ok(!/device|aiDev|proof/.test(call), "kein Geraet in der Anfrage");
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon/.test(s));
  assert.deepEqual(s.match(/\.src = "[^"]*/g), ['.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=']);
  assert.match(s, /requestNonPersonalizedAds = 1/, "nur nicht personalisierte Anzeigen");
  for (const f of fs.readdirSync(path.join(__dirname, "../src")).filter((n) => n.endsWith(".js") && n !== "ads.js")) assert.ok(!/createElement\("script"\)/.test(noComments(src(f))), "Skript-Element in " + f);
});

test("Ohne Dark Patterns: Kennzeichnung, Wegklicken, keine Uhr, kein Druck, keine Kaufaufforderung an Kinder", () => {
  const T = JSON.parse(src("texts.json"));
  for (const L of ["de", "en"]) for (const k of ["adLbl", "adBy", "adHide", "adOpen", "adPro", "proTitle", "proOn", "proNoAds", "proAi", "proApp", "proPrice", "proAdult", "proAge", "proLogin", "proBuy", "proCancel", "aiCountPro"]) assert.ok(T[L][k], L + " " + k);
  assert.equal(T.de.adLbl, "Anzeige"); assert.equal(T.de.proCancel, "Verträge hier kündigen");
  const words = ["de", "en"].map((L) => Object.keys(T[L]).filter((k) => /^(ad|pro)[A-Z]/.test(k)).map((k) => T[L][k]).join(" ")).join(" ");
  assert.ok(!/Eltern|parents|Mama|Papa|nur noch|sofort|verpass|miss out|Sekunden|seconds|schade|enttäusch|disappoint/i.test(words), "kein Druck: " + words);
  const s = noComments(src("ads.js"));
  assert.ok(!/setTimeout|setInterval|countdown|reward|<video|createElement\("video"\)/i.test(s), "keine Uhr, keine Belohnung, kein Video");
  assert.match(s, /"adx", "✕"/); assert.match(s, /adHidden = day/);
  assert.match(src("style.css"), /#adslot\{[^}]*background:#ededed/, "grau, nicht in den App-Farben");
});
