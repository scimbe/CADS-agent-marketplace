// Testseite fuer die Baukasten-Karten im Browser (nur Tests, nie im Produkt). ?ex=<Beispiel>&mode=bot|alone
// Echtzeit: echte Sitzung + Buehne + Klang wie rt-page.js, aber mit der Karte "baukasten" und einer Beispielbeschreibung.
// Zug: Karte "baukasten-zug" ueber die Partie-Logik (session.js) und den echten Renderer; der Bot zieht fuer Sitz 1.
import card from "../../../src/cards/baukasten/card.js";
import zug from "../../../src/cards/baukasten-zug/card.js";
import { BEISPIELE } from "../../../src/engines/baukasten/beispiele.js";
import { compact, normalize } from "../../../src/engines/baukasten/spec.js";
import { createRtSession } from "../../../src/app/rt/session.js";
import { createStage } from "../../../src/render/rt-stage.js";
import { createSound } from "../../../src/render/sound.js";
import { render } from "../../../src/render/render.js";
import { newSession, apply } from "../../../src/contract/session.js";
import { patch } from "../../../src/ui/dom.js";

const q = new URLSearchParams(location.search), ex = q.get("ex") || "flappy", mode = q.get("mode") || "bot";
const desc = normalize(BEISPIELE[ex]).desc, params = { desc: compact(desc) };
const root = document.getElementById("app");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

if (desc.mode === "realtime") {
  let sess = null, phase = "ready";
  const rt = {
    get active() { return !!sess; }, get view() { return card.manifest.rt.view; },
    screenButtons: () => (sess ? sess.screenButtons() : []), get controls() { return card.manifest.rt.controls; },
    key: (c, d) => (sess ? sess.key(c, d) : false), pointer: (...a) => sess && sess.pointer(...a), button: (...a) => sess && sess.button(...a),
    blur: () => sess && sess.blur(), hidden: () => { if (sess && phase === "run") sess.pause(); }
  };
  const played = [];
  const sound = createSound({ audioContext: () => new AudioContext(), vibrate: (ms) => played.push("vib" + ms) });
  const stage = createStage({ win: window, doc: document, rt, reduced, onUnknown: (u) => console.error("unbekannte Ops " + u.join(",")) });
  const dispatch = (ev) => { if (ev.type === "PAUSE") sess.pause(); else if (ev.type === "RESUME") sess.resume(); };
  const draw = () => patch(root, [stage.stageNode("card.rt." + phase, dispatch, "de")]);
  sess = createRtSession(card, { mode, seat: 0, params, seed: "0".repeat(31) + "7", level: 3, lang: "de", reduced: reduced() }, {
    now: () => performance.now(), frame: (f) => requestAnimationFrame(f), cancel: (h) => cancelAnimationFrame(h),
    draw: (node, info) => stage.draw(node, info),
    onEvents: (ev) => played.push(...sound.play(ev, card.manifest.rt.sounds)),
    onChange: (c) => { phase = { go: "run", resume: "run", flow: "run", pause: "pause", stall: "wait", over: "over" }[c.type] || "error"; draw(); }
  });
  draw(); sess.start();
  window.__bau = { get phase() { return phase; }, get tick() { return sess.tick; }, status: () => sess.status(), played };
} else {
  let s = newSession(zug, { params, seed: "zug-e2e", mine: [0, 1], commits: [null, null] }), draft = null, err = "";
  const draw = () => {
    const obs = zug.observe(s.state, 0);
    patch(root, [render(zug.view(obs, 0, { lang: "de", draft }), { lang: "de", draft, idp: "b",
      onInput: (x) => { try { s = apply(zug, s, x); err = ""; botTurn(); } catch (e) { err = e.code || String(e.message); } draw(); },
      onDraft: (d) => { draft = d; draw(); }, onDraftPatch: (p) => { draft = { ...(draft || {}), ...p }; draw(); }, onAction: () => {}, random: () => 0, clock: () => performance.now(), age18: false })]);
  };
  const botTurn = () => { draft = null; let st = zug.status(s.state); for (let k = 0; k < 40 && !st.over && st.turn === 1; k++) { s = apply(zug, s, zug.bot(zug.observe(s.state, 1), 1, { level: 2, seed: "e2e" + k })); st = zug.status(s.state); } };
  draw();
  window.__bau = { status: () => zug.status(s.state), get err() { return err; }, moves: () => zug.moves(zug.observe(s.state, 0), 0) };
}
