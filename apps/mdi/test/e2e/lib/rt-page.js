// Testseite fuer den Echtzeit-Host im Browser (nur Tests, nie im Produkt): Testkarte fx-rt + Sitzung + Buehne + Klang.
// Ersetzt die Laufzeit durch die kleinste Klebeschicht, damit Canvas, Eingaben, Pause und a11y echt laufen.
import card from "../../fixtures/cards/fx-rt/card.js";
import { createRtSession } from "../../../src/app/rt/session.js";
import { createStage } from "../../../src/render/rt-stage.js";
import { createSound } from "../../../src/render/sound.js";
import { patch } from "../../../src/ui/dom.js";

const q = new URLSearchParams(location.search), mode = q.get("mode") || "bot";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let sess = null, phase = "ready";
const rt = {
  get active() { return !!sess; }, get view() { return card.manifest.rt.view; },
  screenButtons: () => (sess ? sess.screenButtons() : []), get controls() { return card.manifest.rt.controls; },
  key: (c, d) => (sess ? sess.key(c, d) : false), pointer: (...a) => sess && sess.pointer(...a), button: (...a) => sess && sess.button(...a),
  blur: () => sess && sess.blur(), hidden: () => { if (sess && phase === "run") dispatch({ type: "PAUSE" }); }
};
const played = [];
const sound = createSound({ audioContext: () => new AudioContext(), vibrate: (ms) => played.push("vib" + ms) });
const stage = createStage({ win: window, doc: document, rt, reduced, onUnknown: (u) => console.error("unbekannte Ops " + u.join(",")) });
const root = document.getElementById("app");
function dispatch(ev) {
  if (ev.type === "PAUSE") sess.pause(); else if (ev.type === "RESUME") sess.resume();
}
function draw() { patch(root, [stage.stageNode("card.rt." + phase, dispatch, "de")]); }
sess = createRtSession(card, { mode, seat: 0, params: { win: 2, speed: 8 }, seed: "0".repeat(31) + "1", level: 2, lang: "de", reduced: reduced() }, {
  now: () => performance.now(), frame: (f) => requestAnimationFrame(f), cancel: (h) => cancelAnimationFrame(h),
  draw: (node, info) => stage.draw(node, info),
  onEvents: (ev) => played.push(...sound.play(ev, card.manifest.rt.sounds)),
  onChange: (c) => { phase = { go: "run", resume: "run", flow: "run", pause: "pause", stall: "wait", over: "over" }[c.type] || "error"; draw(); }
});
draw();
sess.start();
window.__rt = { get phase() { return phase; }, get tick() { return sess.tick; }, status: () => sess.status(), pad: () => sess._state ? null : null, played, sess };
