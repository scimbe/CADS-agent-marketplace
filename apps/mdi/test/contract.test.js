import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "../src/gen/validators.js";
import { CARDS, ORDER, modesOf, validParams } from "../src/cards/index.js";
import { PRIMITIVES } from "../src/render/primitives.js";
import { checkCardSource } from "../scripts/harness.js";
import { travel, paramsForLink, defaults } from "../src/contract/fields.js";
import { FILLS, SHAPES } from "../src/contract/tokens.js";
import { rng } from "../src/contract/sdk.js";
import * as S from "../src/contract/session.js";
import { chooseMove } from "../src/bot/ismcts.js";
import { counter } from "./helpers.js";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(DIR, "../src");
const GOLD = JSON.parse(fs.readFileSync(path.join(DIR, "fixtures/determinism.json"), "utf8"));

test("Manifeste erfuellen das Manifest-Schema; Pflichtfunktionen des Vertrags vorhanden", () => {
  for (const id of ORDER) {
    const c = CARDS[id];
    assert.equal(V.manifest(c.manifest), true, id + " " + JSON.stringify(V.manifest.errors));
    // Pflichtfunktionen je Modus (ADR 0001 b/f): Echtzeit init/step/status/view, sonst der Zugvertrag
    const need = c.manifest.mode === "realtime" ? ["init", "step", "view", "status"] : ["init", "step", "observe", "view", "status", "moves"];
    for (const f of need) assert.equal(typeof c[f], "function", id + "." + f);
    if (c.manifest.mode === "realtime" && c.manifest.rt.net === "split") assert.equal(typeof (c.side && c.side.step), "function", id + ".side");
    if (c.manifest.hidden === "commit-reveal") { assert.equal(typeof c.deal, "function"); assert.equal(typeof c.sample, "function"); assert.ok(c.manifest.secretSeats.length > 0); }
    for (const p of c.manifest.parts) for (const k of p.params) assert.ok(k in c.manifest.params.properties, id + ": Teil " + p.id + " -> " + k);
    assert.equal(validParams(id, defaults(c.manifest.params)), true, id + ": Standardwerte gueltig");
  }
});

test("Harness: Kartenquellen nutzen nur exakte Mathe, keine Uhr/Netz/DOM", () => {
  for (const id of ORDER) assert.deepEqual(checkCardSource(fs.readFileSync(path.join(SRC, "cards", id, "card.js"), "utf8"), { file: "src/cards/" + id + "/card.js" }), [], id);
});
test("Harness: verbotene Muster werden gefunden", () => {
  const bad = {
    "Math.sin(1)": /Math.sin/, "Math.atan2(1,2)": /Math.atan2/, "Math.cos(1)": /Math.cos/, "Math.exp(1)": /Math.exp/, "Math.log(2)": /Math.log/,
    "Math.pow(2,3)": /Math.pow/, "Math.hypot(1,2)": /Math.hypot/, "Math.random()": /Math.random/, "2 ** 3": /\*\*/, "Math['sin'](1)": /berechneter/,
    "const m = Math; m.sin(1)": /Math als Wert/, "Date.now()": /Date/, "performance.now()": /performance/, "fetch('x')": /fetch/,
    "new Function('return 1')": /Function/, "import('x')": /dynamischer Import/, "import x from '../../app/machine.js'": /Import nicht erlaubt/
  };
  for (const [src, re] of Object.entries(bad)) { const r = checkCardSource(src); assert.ok(r.some((x) => re.test(x)), src + " -> " + JSON.stringify(r)); }
  assert.deepEqual(checkCardSource("const a = Math.floor(Math.sqrt(9)) + Math.imul(2,3) + Math.min(1,2); export default { x: { Date: 1 } }"), []);
});

test("Feldtypen und Reiseregeln (KONZEPT §3.2)", () => {
  const f = (t, extra = {}) => travel({ "x-field": t, ...extra }, {});
  assert.deepEqual(f("text", { "x-model": true }), { link: "yes", model: true, server: false });
  assert.deepEqual(travel({ "x-field": "text" }, { share: "short" }), { link: "yes", model: false, server: true });
  assert.deepEqual(f("media.local"), { link: "no", model: false, server: false });
  assert.deepEqual(travel({ "x-field": "media.local" }, { withLocalMedia: true }).link, "yes");
  assert.deepEqual(f("media.server"), { link: "ref", model: false, server: true });
  assert.deepEqual(f("secret"), { link: "sealed", model: false, server: false });
  const schema = { properties: { a: { "x-field": "text" }, foto: { "x-field": "media.local" }, geheim: { "x-field": "secret" } } };
  assert.deepEqual(paramsForLink(schema, { a: "x", foto: "blob", geheim: "s" }), { a: "x" });
  assert.throws(() => travel({ "x-field": "unbekannt" }));
});

function walk(n, f) { if (!n || typeof n !== "object") return; f(n); for (const c of n.children || []) walk(c, f); }
const PRIMS = new Set(PRIMITIVES);
test("Anzeigelisten: nur bekannte Primitive und Token-Namen, keine Funktionen, keine Farbwerte", () => {
  const ent = counter("1");
  for (const id of ORDER.filter((x) => CARDS[x].manifest.mode !== "realtime")) {
    const c = CARDS[id], n = c.manifest.players.max, all = [...Array(n).keys()];
    let s = S.newSession(c, { params: defaults(c.manifest.params), seed: ent(), mine: all, ...S.makeSecrets(c, all, ent) });
    for (let k = 0; k < 40; k++) {
      for (const seat of all) for (const lang of ["de", "en"]) {
        const node = c.view(c.observe(s.state, seat), seat, { lang });
        const json = JSON.stringify(node);
        // Farbwerte nur in der Canvas-Liste (Nutzerfarben sind Inhalt, ADR 0001 b); sonst Token
        const jsonNoCanvas = JSON.stringify(node, (k, v) => (v && v.t === "canvas" ? undefined : v));
        assert.ok(!/#[0-9a-fA-F]{3,6}\b|rgb\(|<[a-z]/.test(jsonNoCanvas), id + ": Farbwert/HTML in Anzeigeliste");
        walk(node, (x) => {
          assert.ok(PRIMS.has(x.t), id + ": Primitiv " + x.t);
          for (const k2 of ["fill", "ink"]) if (x[k2] !== undefined) assert.ok(FILLS.includes(x[k2]), id + ": Token " + x[k2]);
          if (x.t === "shape") assert.ok(SHAPES.includes(x.kind));
          for (const v of Object.values(x)) assert.notEqual(typeof v, "function");
        });
      }
      const st = S.status(c, s); if (st.over) break;
      const r = S.dueReveal(c, s); if (r) { s = S.apply(c, s, r); continue; }
      const mv = c.moves(c.observe(s.state, st.turn), st.turn); s = S.apply(c, s, mv[k % mv.length]);
    }
  }
});

// Zufallspartien je Karte mit Zeitbudget (Tischkarten mit Mental Poker brauchen Sekunden je Partie): mindestens 3,
// hoechstens 500 Partien oder 4 s je Karte.
test("observe: kein Sitz sieht fremde private Teile; Drahtformat ohne Salz vor der Aufloesung (bis 500 Zufallspartien)", () => {
  const ent = counter("2");
  for (const id of ORDER) {
    const c = CARDS[id]; if (c.manifest.hidden !== "commit-reveal") continue;
    const all = [...Array(c.manifest.players.max).keys()], t0 = Date.now();
    for (let g = 0; g < 500 && (g < 3 || Date.now() - t0 < 4000); g++) {
      const sec = S.makeSecrets(c, all, ent);
      let s = S.newSession(c, { params: defaults(c.manifest.params), seed: ent(), mine: all, ...sec });
      const r = rng("partie" + g);
      for (;;) {
        const st = S.status(c, s);
        for (const seat of all) {
          const o = c.observe(s.state, seat);
          // eigener Teil: genau der eigene priv-Teil (oder null, wenn der Sitz kein Geheimnis hat)
          if (!c.manifest.secretSeats.includes(seat)) assert.equal(o.mine, null, id + ": Sitz " + seat + " ohne Geheimnis hat mine");
          for (const other of c.manifest.secretSeats) if (other !== seat && !st.over) {
            const secretJson = JSON.stringify(s.state.priv[other]);
            if (secretJson === "null" || secretJson === JSON.stringify(s.state.priv[seat])) continue;
            assert.ok(!JSON.stringify(o).includes(secretJson.slice(1, -1)) || o.pub.truth, id + ": Sitz " + seat + " sieht Teil von " + other);
          }
        }
        const wire = JSON.stringify(S.toWire(s));
        if (!s.log.some((x) => x.t === "reveal")) for (const salt of Object.values(sec.secrets)) assert.ok(!wire.includes(salt), "Salz im Drahtformat");
        if (st.over) break;
        const due = S.dueReveal(c, s); if (due) { s = S.apply(c, s, due); continue; }
        const mv = c.moves(c.observe(s.state, st.turn), st.turn); s = S.apply(c, s, mv[r.int(mv.length)]);
      }
    }
  }
});

test("Modi kommen nur aus dem Manifest (keine Kartensonderlogik)", () => {
  assert.deepEqual(modesOf(CARDS.gruss), ["link", "live"]);
  assert.deepEqual(modesOf(CARDS.bluff), ["alone", "bot", "link", "live"]);
});

function botGame(seed, level) {
  const c = CARDS.bluff, ent = counter("3");
  const sec = S.makeSecrets(c, [0], () => "00000000000000000000000000000abc");
  let a = S.newSession(c, { params: defaults(c.manifest.params), seed, mine: [0], ...sec });
  let b = S.newSession(c, { params: a.params, seed, mine: [1], commits: a.commits });
  const it = { 1: 60, 2: 400, 3: 2000 }[level];
  while (!S.status(c, a).over) {
    const due = S.dueReveal(c, a), st = S.status(c, a);
    const mv = due || chooseMove(c, S.observe(c, st.turn === 0 ? a : b, st.turn), st.turn, { iterations: it, seed: seed + "|" + a.log.length });
    a = S.apply(c, a, mv); b = S.apply(c, b, mv);
    assert.equal(S.pubHash(a), S.pubHash(b));
  }
  void ent;
  return { log: a.log, hash: S.pubHash(a), full: S.pubHash(b) };
}
test("Determinismus: zwei Laeufe und Bot-Wiederholung ergeben denselben Zustandshash (Goldwert, auch im Browser geprueft)", () => {
  const r1 = botGame(GOLD.seed, GOLD.level), r2 = botGame(GOLD.seed, GOLD.level);
  assert.deepEqual(r1.log, r2.log);
  assert.equal(r1.hash, r2.hash);
  assert.equal(r1.hash, GOLD.hash, "Goldwert (test/fixtures/determinism.json)");
  assert.deepEqual(r1.log.map((x) => x.t === "say" ? x.v : x.t === "call" ? (x.open ? "O" : "B") : "R"), GOLD.moves);
});
