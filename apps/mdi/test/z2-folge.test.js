// (1) Regelsatz je Variante (variants[].rule): Kopfzeile im Spiel und Vorschau zeigen den Satz der gewaehlten Variante,
//     fuer jede Variante jeder Zug- und Duellkarte (Z1, Z2), z. B. raum-tuer nicht den Kreis-Satz.
// (2) Siegel der freien Karte (Strang K, #255) auf den Z2-Karten: ki/fr reisen ueber fromFree -> Link-Parameter ->
//     toFree; der Gate-Hash danach ist derselbe wie fuer das Doc des Servers; Abzeichen "Mit KI erstellt" nur mit
//     gueltigem Siegel; kaputte Siegel bringen weder Abzeichen noch Gate-Freigabe und machen Link-Parameter ungueltig.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { CARDS, ORDER, validParams } from "../src/cards/index.js";
import { rng } from "../src/contract/sdk.js";
import { defaults, paramsForLink } from "../src/contract/fields.js";
import { ruleOf } from "../src/engines/zug/zug.js";
import * as A from "../src/broker/ai.js";
import { gateView, gateChecksOf } from "../src/features/frei/doc.js";

const L = (o, l) => o[l] || o.de;
function texts(n, out = []) { if (n && typeof n === "object") { if (n.t === "text" && typeof n.text === "string") out.push(n.text); (n.children || []).forEach((c) => texts(c, out)); } return out; }
const ZUG = ORDER.filter((id) => /makeZug|makeDuell/.test(fs.readFileSync(new URL("../src/cards/" + id + "/card.js", import.meta.url), "utf8")));

test("jede Variante einer Zug- oder Duellkarte hat einen eigenen Regelsatz (de/en), verschieden vom Satz der Karte", () => {
  let n = 0;
  for (const id of ZUG) for (const v of CARDS[id].manifest.variants || []) {
    assert.ok(v.rule && v.rule.de && v.rule.en, id + "/" + v.id + ": rule fehlt");
    const base = CARDS[id].manifest.rule || CARDS[id].manifest.howto;
    assert.notEqual(v.rule.de, base.de, id + "/" + v.id + ": Satz der Grundkarte");
    n++;
  }
  assert.equal(n, 34, "Varianten geprueft (Z1: 19, Z2: 15)");
});

for (const lang of ["de", "en"]) {
  test(`Kopfzeile und Vorschau zeigen den Satz der Variante (${lang}); ohne Variante den der Karte`, () => {
    for (const id of ZUG) {
      const c = CARDS[id], P = defaults(c.manifest.params);
      for (const v of [null, ...(c.manifest.variants || [])]) {
        const params = { ...P, ...(v ? v.params : {}) }, want = v ? L(v.rule, lang) : L(c.manifest.rule || c.manifest.howto, lang);
        assert.equal(ruleOf(c.manifest, params, lang), want, id + "/" + (v ? v.id : "-"));
        const st = c.init({ rng: rng("r|" + id), params, players: c.manifest.players.max });
        const turn = c.status(st).turn, seat = turn >= 0 ? turn : 0;
        assert.equal(c.view(c.observe(st, seat), seat, { lang, today: 20400 }).head.rule, want, id + "/" + (v ? v.id : "-") + " Kopfzeile");
        assert.ok(texts(c.view(c.observe(st, 0), 0, { lang, preview: true })).includes(want), id + "/" + (v ? v.id : "-") + " Vorschau");
      }
    }
  });
}

test("raum-tuer zeigt den Tuersteher-Satz, nicht den Kreis-Satz", () => {
  const c = CARDS["zug-kreis"], params = { ...defaults(c.manifest.params), spiel: "tuer" };
  const st = c.init({ rng: rng("t"), params, players: 2 }), head = c.view(c.observe(st, 0), 0, { lang: "de", today: 20400 }).head.rule;
  assert.match(head, /Wer darf rein\?/); assert.doesNotMatch(head, /Kreis/);
});

// ---------- Siegel ----------
const REC = JSON.parse(fs.readFileSync(new URL("./fixtures/wrapper-frei.json", import.meta.url), "utf8"));
const KI = REC.exchanges.find((x) => x.name === "karte-ok-faehigkeit").res.body.options[0].ki;
const subtle = crypto.webcrypto.subtle;
const Z2 = ZUG.filter((id) => fs.readFileSync(new URL("../src/cards/" + id + "/card.js", import.meta.url), "utf8").includes("zug-z2") || id === "duell-liest");

test("zug-auktion (Variante zug-deal, mit Titel und Wort): Server-Doc -> fromFree -> Link -> toFree, Gate-Hash bleibt gleich, Siegel kommt an", async () => {
  const c = CARDS["zug-auktion"];
  const doc = { k: "turn", i: "zug-deal", t: "Pizza teilen", w: "Pizzastücke", s: "Untertitel reist nicht", col: ["#ff4fa3"], ki: KI, fr: "2IUb7YhYxs0ilALZr5tsMc" };
  const want = await A.optionHash(gateView(doc), subtle);
  const params = c.fromFree(doc);
  assert.equal(params.spiel, "deal"); assert.equal(params.title, "Pizza teilen"); assert.equal(params.w, "Pizzastücke");
  assert.ok(validParams("zug-auktion", params), "Parameter gueltig");
  const linked = paramsForLink(c.manifest.params, params);
  assert.deepEqual(linked.ki, KI, "ki reist im Link"); assert.equal(linked.fr, doc.fr, "fr reist im Link");
  const back = c.toFree(linked);
  assert.deepEqual(back, { k: "turn", i: "zug-deal", t: "Pizza teilen", w: "Pizzastücke", ki: KI, fr: doc.fr });
  assert.equal(await A.optionHash(gateView(back), subtle), want, "Gate-Hash nach dem Weg ueber die Karte = Hash des Server-Docs");
  assert.ok(gateChecksOf(back).length > 0, "Empfaenger fragt das Status-Gate");
});

test("alle Z2-Karten tragen ki/fr durch fromFree/toFree; Abzeichen nur mit gueltigem Siegel; kaputtes Siegel macht den Link ungueltig", async () => {
  for (const id of Z2) {
    const c = CARDS[id], k = id === "duell-liest" ? "duel" : "turn";
    const p = c.fromFree({ k, i: id, ki: KI });
    assert.ok(p && validParams(id, p), id + ": Parameter mit Siegel gueltig");
    assert.deepEqual(c.toFree(paramsForLink(c.manifest.params, p)).ki, KI, id + ": Siegel kommt an");
    const view = (q, preview) => JSON.stringify(c.view(c.observe(c.init({ rng: rng("s|" + id), params: q, players: c.manifest.players.max }), 0), 0, { lang: "de", today: 20400, preview }));
    for (const preview of [false, true]) {
      assert.match(view(p, preview), /Mit KI erstellt/, id + " Abzeichen" + (preview ? " (Vorschau)" : ""));
      assert.doesNotMatch(view({ ...p, ki: null }, preview), /Mit KI erstellt/, id + " ohne Siegel");
    }
    for (const bad of [{ k: "karte", s: "x", h: "kurz" }, { ...KI, boese: "<script>" }, { k: "andere", s: KI.s, h: KI.h }])
      assert.equal(validParams(id, { ...p, ki: bad }), false, id + ": fremdes ki im Link abgelehnt " + JSON.stringify(bad));
    // toFree bereinigt (wie seal.js: nur k/s/h/o eines gueltigen Siegels; Kaputtes faellt weg)
    for (const bad of [{ k: "karte", s: "x", h: "kurz" }, { k: "andere", s: KI.s, h: KI.h }, "text", 42]) {
      assert.equal(c.toFree({ ...p, ki: bad }).ki, undefined, id + ": toFree bereinigt " + JSON.stringify(bad));
      assert.doesNotMatch(view({ ...p, ki: bad }, false), /Mit KI erstellt/, id + ": kein Abzeichen fuer " + JSON.stringify(bad));
    }
  }
  assert.ok(Z2.length >= 33, "Z2-Karten: " + Z2.length);
});
