// Widget-Nachtraege aus Strang S ohne DOM (wie test/widgets.test.js): Kraft-Pendel im form (Startstufe, 160-ms-Takt,
// Wert erst beim Loslassen), Zitterbahn im aim-Widget (nur Daten am Knoten), Stoppuhr fuer die Malrat-Ratezeit.
import test from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render/render.js";
import { known } from "../src/render/widgets.js";
import { WIDGETS } from "../src/render/primitives.js";

function all(v, out = []) { if (v && typeof v === "object") { out.push(v); for (const c of v.children || []) all(c, out); } return out; }
const textOf = (v) => (typeof v === "string" ? v : (v.children || []).map(textOf).join(""));
function harness(node, extra = {}) {
  const sent = [];
  const H = { draft: null, lang: "de", onInput: (x) => sent.push(x), onDraft: (d) => { H.draft = d; }, ...extra };
  const tree = () => all(render(node, H));
  return { H, sent, tree };
}
const holdBtn = (t) => t.find((x) => x.tag === "button" && x.props["aria-label"] === "Halten für Kraft");

test("Inventar: stopwatch ist registriert", () => {
  assert.ok(WIDGETS.includes("stopwatch")); assert.ok(known().includes("stopwatch"));
});

test("power im form: Startstufe aus n.value ist der Wert ohne Halten; Halten pendelt im 160-ms-Takt, Loslassen setzt die Stufe", () => {
  let t = 1000;
  const f = harness({ t: "form", id: "wurf", fields: [{ t: "aim", id: "aim", grid: 2641, value: [1320, 1320] }, { t: "power", id: "power", levels: 9, mode: "pendel", value: 6, swing: 160 }], submit: { t: "dart", seat: 0 } }, { clock: () => t });
  // vor dem Halten: die Startstufe, kein Zeitstempel als Kraft
  assert.match(textOf(holdBtn(f.tree())), /Kraft 7 von 9/);
  holdBtn(f.tree()).props.on.pointerdown();
  t += 160 * 3; // drei Schritte: 6 -> 7 -> 8 -> 7 (Pingpong ohne Halt am Ende)
  holdBtn(f.tree()).props.on.pointerup();
  f.tree().find((x) => x.props && x.props.class === "btn primary w-go").props.on.click();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].a.power, 7);
  assert.deepEqual(f.sent[0].a.aim, [1320, 1320]);
});

test("power mit Leertaste: Taste halten und loslassen ergibt dieselbe Stufe wie der Zeiger", () => {
  let t = 0;
  const f = harness({ t: "form", id: "wurf", fields: [{ t: "power", id: "power", levels: 9, value: 0, swing: 160 }], submit: { t: "dart", seat: 0 } }, { clock: () => t });
  holdBtn(f.tree()).props.on.keydown({ key: " ", preventDefault() {} });
  t += 160 * 10; // 0..8 hoch (8 Schritte), dann 2 zurueck -> 6
  holdBtn(f.tree()).props.on.keyup({ key: " ", preventDefault() {} });
  f.tree().find((x) => x.props && x.props.class === "btn primary w-go").props.on.click();
  assert.equal(f.sent[0].a.power, 6);
});

test("power allein (ohne form) sendet die Stufe beim Loslassen direkt", () => {
  let t = 0;
  const p = harness({ t: "power", id: "kraft", levels: 9, value: 2, swing: 160, submit: { t: "dart", seat: 1 } }, { clock: () => t });
  holdBtn(p.tree()).props.on.pointerdown(); t += 320; holdBtn(p.tree()).props.on.pointerup();
  assert.deepEqual(p.sent, [{ t: "dart", seat: 1, a: 4 }]);
});

test("power im Modus schieber und bei reduzierter Bewegung: Regler ohne Zeit, ohne Seitenfehler", () => {
  const p = harness({ t: "power", id: "kraft", levels: 9, value: 3, mode: "schieber", submit: { t: "dart", seat: 0 } });
  const range = p.tree().find((x) => x.tag === "input" && x.props.type === "range");
  assert.ok(range); assert.equal(range.props.value, "3"); assert.equal(range.props.max, "8");
  const r = harness({ t: "power", id: "kraft", levels: 9, value: 3, submit: { t: "dart", seat: 0 } }, { reduced: true });
  assert.ok(r.tree().find((x) => x.tag === "input" && x.props.type === "range"));
});

test("aim: Zitterbahn wird nur aus gueltigen Stuetzpunkten gebildet; das Kreuz steht beim Ziel", () => {
  const a = harness({ t: "aim", id: "aim", grid: 2641, value: [1320, 1320], wobble: [[10, -5], ["x", 1], [3, 3]], wobbleMs: 70, submit: { t: "x", seat: 0 } });
  const cross = a.tree().find((x) => x.props && x.props.class === "w-cross");
  assert.ok(cross && typeof cross.props.ref === "function");
  assert.equal(cross.props.style.left, (1320 / 2641 * 100) + "%");
});

test("stopwatch: Startzeit beim ersten Anzeigen, Knopf schreibt Entwurf + Sekunden; kein Zug", () => {
  let t = 5000;
  const node = (d) => ({ t: "stopwatch", id: "rate", key: "sec", label: "Raten", draft: { ...d, tried: "katze" } });
  const H = { draft: null, lang: "de", clock: () => t, onInput: () => assert.fail("kein Zug"), onDraft: (d) => { H.draft = d; } };
  all(render(node({}), H));
  assert.equal(H.draft["w:rate:t0"], 5000);
  t += 7400;
  const btn = all(render(node(H.draft), H)).find((x) => x.tag === "button");
  assert.equal(textOf(btn), "Raten");
  btn.props.on.click();
  assert.equal(H.draft.sec, 7); assert.equal(H.draft.tried, "katze"); assert.equal(H.draft["w:rate:t0"], 5000);
  const timer = all(render(node(H.draft), H)).find((x) => x.props && x.props.role === "timer");
  assert.match(textOf(timer), /^7 s$/);
});
