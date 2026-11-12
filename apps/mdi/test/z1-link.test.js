// Link-Rundreise der Z1-Karten ueber die echte Statechart und echte Fragmente (#v2.challenge…): Geraet A spielt seinen
// Zug, teilt, Geraet B oeffnet den Link, nimmt an und spielt weiter. Prueft Regeln, Geheimnis und Vereinigung beim
// Empfang – ohne DOM (die Bildschirme selbst prueft test/e2e/z1.e2e.js).
import test from "node:test";
import assert from "node:assert/strict";
import { testRuntime, counter, until } from "./helpers.js";
import { leaf } from "../src/ui/view.js";
import { cardOf } from "../src/cards/index.js";
import * as L from "../src/engines/zug/merge.js";

const DAY = 86400000, T0 = Date.UTC(2026, 10, 12, 12); // 2026-11-12
const at = (days = 0) => T0 + days * DAY;
const leafOf = (rt) => leaf(rt.state);
function dev(tag) { return testRuntime({ entropy: counter(tag), async: true }); }
function open(rt, id, params) {
  rt.dispatch({ type: "OPEN", id });
  if (params) for (const [key, value] of Object.entries(params)) rt.dispatch({ type: "PARAM", key, value });
  rt.dispatch({ type: "MODE", mode: "link" }); rt.dispatch("GO");
}
/** Einen ganzen Zug mit den Antworten spielen (je Prompt eine Eingabe, wie die Bildschirme sie schicken). */
function turn(rt, answers, days = 0) {
  const c = cardOf(rt.state.ctx.cardId);
  for (const a of answers) {
    assert.equal(leafOf(rt), "card.play.turn", "am Zug: " + rt.state.ctx.cardId);
    const s = rt.state.ctx.session, seat = c.status(s.state).turn;
    rt.dispatch({ type: "INPUT", input: c.answer(s.state.pub, seat, a), at: at(days) });
    assert.equal(rt.state.ctx.error, null, "Eingabe angenommen: " + JSON.stringify(a));
  }
}
async function share(rt) { const n = rt.shared.length; rt.dispatch("SHARE"); await until(() => rt.shared.length > n); const l = rt.shared[rt.shared.length - 1]; if (leafOf(rt) === "card.play.send") rt.dispatch("SENT"); return l; }
function receive(rt, link) { rt.link(link); assert.equal(leafOf(rt), "receive.show", "Link angenommen: " + rt.state.ctx.reason); rt.dispatch("ACCEPT"); }
const pubOf = (rt) => rt.state.ctx.session.state.pub;
function viewOf(rt, extra = {}) { const c = cardOf(rt.state.ctx.cardId), s = rt.state.ctx.session, seat = rt.state.ctx.viewer; return c.view(c.observe(s.state, seat), seat, { lang: "de", today: 20770, ...extra }); }
function texts(n) { const out = []; (function w(x) { if (!x || typeof x !== "object") return; if (x.t === "text") out.push(x.text); if (x.t === "choice") { out.push(x.label); for (const o of x.options) out.push(o.label); } (x.children || []).forEach(w); })(n); return out.join(" | "); }
function nodes(n, t) { const out = []; (function w(x) { if (!x || typeof x !== "object") return; if (x.t === t) out.push(x); (x.children || []).forEach(w); })(n); return out; }

test("Link: Worauf einigen wir uns? hin und zurueck, beide sehen dasselbe Ergebnis", async () => {
  const A = dev("a"), B = dev("b");
  open(A, "zug-einig");
  turn(A, [["Pizza", "Kino", "Sauna", "Zoo", "Bowling"], [0, 1, 2, 3, 4]]);
  receive(B, await share(A));
  assert.equal(B.state.ctx.session.mine[0], 1);
  turn(B, [[4, 3, 2, 1, 0]]);
  assert.equal(leafOf(B), "card.play.over");
  receive(A, await share(B));
  assert.equal(leafOf(A), "card.play.over");
  assert.deepEqual(pubOf(A), pubOf(B));
  assert.match(texts(viewOf(A)), /Einigung: Sauna/);
});

test("Link: Geld einsammeln – der Link geht unveraendert an alle, Zahlen bleibt beim Empfaenger (kein Ergebnis-Senden)", async () => {
  const A = dev("c"), B = dev("d"), C = dev("e");
  open(A, "zug-sammeln");
  turn(A, ["annaSammelt", "Pizza-Abend", 4, 3750]);
  const link = await share(A);
  for (const R of [B, C]) {
    receive(R, link);
    const v = viewOf(R, { age18: true });
    assert.deepEqual(nodes(v, "link").map((x) => x.href), ["https://paypal.me/annaSammelt/9.37EUR"]);
    assert.ok(texts(v).includes("37,50 € geteilt durch 4 · Rest 2 ct übernimmt, wer sammelt"));
    assert.equal(nodes(viewOf(R, { age18: false }), "link").length, 0, "unter 18 kein PayPal-Knopf");
    assert.equal(cardOf("zug-sammeln").status(R.state.ctx.session.state).local, true);
  }
});

test("Link: Wunschzettel – die Familie markiert, die Wuenschende bekommt die Antwort und sieht keine Marke", async () => {
  const A = dev("f"), B = dev("f1"), C = dev("f2");
  open(A, "zug-wunschzettel");
  const wish = L.shopApply(null, { name: "", adds: [{ text: "Hörbuch", qty: 1 }, { text: "Schal", qty: 1 }] }, L.WISH);
  turn(A, [wish]);
  const l1 = await share(A);
  receive(B, l1); receive(C, l1);
  const mine = (name, key) => L.shopApply(wish, { name, face: 1, marks: { [L.shopKey(key)]: 1 } }, L.WISH);
  turn(B, [mine("Ben", "Hörbuch")]); turn(C, [mine("Cem", "Schal")]);
  const lb = await share(B), lc = await share(C);
  // die Familie leitet untereinander weiter: B bekommt Cems Antwort und legt sie zusammen
  receive(B, lc);
  const rows = L.shopRows(pubOf(B).m[0][0], L.WISH).map((r) => r.label + ":" + r.bring.length);
  assert.deepEqual(rows, ["Hörbuch:1", "Schal:1"], "Vereinigung beim Empfang");
  // die Wuenschende oeffnet Bens Link auf ihrem Geraet
  receive(A, lb);
  const t = texts(viewOf(A, { memo: { own: true } }));
  for (const s of ["Ben", "Cem", "vergeben", "Du schenkst"]) assert.ok(!t.includes(s), "sieht nicht: " + s);
  assert.ok(t.includes("Hörbuch") && t.includes("Schal"));
});

test("Link: Einkauf – zwei Antworten auf denselben Link werden beim Absender vereinigt, egal in welcher Reihenfolge", async () => {
  const A = dev("a1"), B = dev("a2"), C = dev("a3");
  open(A, "zug-einkauf");
  const l0 = L.shopApply(null, { name: "", adds: [{ text: "Milch", qty: 2 }, { text: "Brot", qty: 1 }] });
  turn(A, [l0]);
  const link = await share(A);
  receive(B, link); receive(C, link);
  turn(B, [L.shopApply(l0, { name: "Ben", adds: [{ text: "Käse", qty: 1 }], marks: { milch: 2 } })]);
  turn(C, [L.shopApply(l0, { name: "Cem", adds: [{ text: "Äpfel", qty: 3 }], marks: { brot: 1 } })]);
  const lb = await share(B), lc = await share(C);
  receive(A, lc); receive(A, lb);
  const rows = Object.fromEntries(L.shopRows(pubOf(A).m[0][0]).map((r) => [r.label, [r.bought.map((p) => p[0]).join(), r.bring.map((p) => p[0]).join()]]));
  assert.deepEqual(rows, { "2× Milch": ["Ben", ""], Brot: ["", "Cem"], "Käse": ["", ""], "3× Äpfel": ["", ""] });
  assert.ok(lb.length <= 4000 && lc.length <= 4000, "Linklaenge " + lb.length);
});

test("Link: Terminumfrage ueber drei Geraete (Sitz = Zug), Kopf und .ics beim Absender", async () => {
  const A = dev("b1"), B = dev("b2"), C = dev("b3"), today = 20769; // 2026-11-12
  open(A, "zug-termin");
  const slots = [(today + 2) * 10 + 6, (today + 3) * 10 + 6];
  turn(A, [["Mia", slots]]);
  receive(B, await share(A)); turn(B, [["Ben", [0, 2]]]);
  receive(C, await share(B)); turn(C, [["Lea", [0, 1]]]);
  receive(A, await share(C));
  assert.equal(pubOf(A).m.length, 3);
  assert.equal(leafOf(A), "card.play.wait", "A ist nicht mehr dran, sieht aber den Stand");
  assert.match(texts(viewOf(A)), /Alle können: Sa 14\.11\., 18 Uhr/);
});

test("Link: Kapsel – Tor oeffnet erst am Tag (Tag stempelt der Host)", async () => {
  const A = dev("c1"), B = dev("c2");
  open(A, "zug-kapsel");
  turn(A, [[3], 5]);
  assert.equal(pubOf(A).o, 20769 + 5, "Tag des Absenders (2026-11-12) + 5");
  receive(B, await share(A));
  assert.match(texts(viewOf(B, { today: 20771 })), /Noch 3 Tage verschlossen/);
  assert.equal(nodes(viewOf(B, { today: 20774 }), "choice").length, 1);
});
