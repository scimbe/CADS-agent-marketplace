// Spielrahmen (eigener, opaker Ursprung; CSP ohne Netz). Nimmt vom Elternfenster genau das Schema aus spiel/protokoll.js an,
// startet den Spielcode in einem Worker (spiel-worker.js, als Text eingebaut) und meldet nur Status, Fortschritt, Bericht und
// Fehler zurueck. Watchdog: antwortet der Worker nicht rechtzeitig, wird er beendet (Endlosschleife, Ueberlast).
// Zwei Fristen (spiel/fristen.js): ein Fenster je Phase ohne Lebenszeichen und in der Pruefung eine Gesamtfrist ab Start,
// die Fortschritt nicht verlaengert. Im Spielmodus gilt nur das Tick-Fenster (die Spieldauer bestimmt der Mensch).
// Fail closed: Vor dem ersten Befehl prueft der Rahmen opaken Ursprung und aktive CSP (Bild-Probe gesperrt und gemeldet);
// sonst meldet er "sandbox" und startet nie einen Worker.
// Was der Rahmen meldet (auch der Bericht), ist Anzeige. Ueber Abnahme oder Guthaben entscheidet nur runGame auf dem Server.
// Der Rahmen nimmt Befehle nur vom eigenen Elternfenster (e.source === parent). Er haelt keine Geheimnisse; was er
// sendet, darf jeder Einbettende sehen. Wiederverwendet: Tick-Schleife (app/rt/loop.js), Eingabe-Abtastung und Letterbox
// (app/rt/input.js), Ton-Synthese (render/sound.js).
/* global __SPIEL_WORKER__, __SPIEL_FRISTEN__ */
import { createLoop } from "../app/rt/loop.js";
import { createSampler, fitView, toWorld } from "../app/rt/input.js";
import { createSound } from "../render/sound.js";
import { W, H, HZ } from "../spiel/api.js";
import { paint } from "../spiel/paint.js";
import { V, checkToFrame, checkToHost } from "../spiel/protokoll.js";
import { finish, PHASES } from "../spiel/pruefung.js";
import { FRISTEN, gesamtfristMs, mitFristen } from "../spiel/fristen.js";

/** Kurzform der Fenster (Laden, Spiel-Tick, Pruefschritt); massgeblich ist spiel/fristen.js. */
export const LIMIT_MS = Object.freeze({ load: FRISTEN.fenster.load, tick: FRISTEN.fenster.tick, test: FRISTEN.fenster.eingaben });
/** So lange wartet der Rahmen auf das Verstoss-Ereignis seiner Bild-Probe (img-src 'none'). */
export const PROBE_MS = 2000;
const TEXTS = {
  de: { score: "Punkte", level: "Level", over: "Spiel vorbei", won: "Geschafft!", again: "Nochmal: Feuer oder tippen", pause: "Pause", resume: "Weiter: tippen", left: "Links", right: "Rechts", up: "Hoch", down: "Runter", fire: "Feuer", sound: "Ton" },
  en: { score: "Score", level: "Level", over: "Game over", won: "Done!", again: "Again: fire or tap", pause: "Paused", resume: "Tap to resume", left: "Left", right: "Right", up: "Up", down: "Down", fire: "Fire", sound: "Sound" }
};
// Feste Tastenbelegung fuer alle Spiele (keine Sonderfaelle je Spiel). Wischen setzt die Richtung fuer einen Frame.
export const LAYOUT = {
  buttons: [
    { id: "left", kind: "hold", keys: ["ArrowLeft", "KeyA"], zone: "button" },
    { id: "right", kind: "hold", keys: ["ArrowRight", "KeyD"], zone: "button" },
    { id: "up", kind: "hold", keys: ["ArrowUp", "KeyW"], zone: "button" },
    { id: "down", kind: "hold", keys: ["ArrowDown", "KeyS"], zone: "button" },
    { id: "fire", kind: "hold", keys: ["Space", "Enter"], zone: "button" },
    { id: "fireP", kind: "pulse", keys: ["Space", "Enter"], zone: "any" },
    { id: "swl", kind: "pulse", keys: [], zone: "none", swipe: "left" },
    { id: "swr", kind: "pulse", keys: [], zone: "none", swipe: "right" },
    { id: "swu", kind: "pulse", keys: [], zone: "none", swipe: "up" },
    { id: "swd", kind: "pulse", keys: [], zone: "none", swipe: "down" }
  ],
  pointer: { max: 1 }
};
const BIT = Object.fromEntries(LAYOUT.buttons.map((b, i) => [b.id, 1 << i]));
/** Abtastwert -> Eingabe der Spiel-API. */
export function toInput(sample) {
  const b = sample.b, on = (id) => (b & BIT[id]) !== 0;
  return { left: on("left") || on("swl"), right: on("right") || on("swr"), up: on("up") || on("swu"), down: on("down") || on("swd"), fire: on("fire") || on("fireP"), firePressed: on("fireP") };
}
export const SOUND_TABLE = Object.freeze({
  shoot: { synth: "tone", f0: 880, f1: 440, dur: 0.08, vol: 0.12 }, hit: { synth: "tone", f0: 300, f1: 220, dur: 0.06, vol: 0.15 },
  pop: { synth: "noise", dur: 0.12, freq: 1800, vol: 0.2 }, coin: { synth: "tone", f0: 990, f1: 1480, dur: 0.1, vol: 0.12 },
  jump: { synth: "tone", f0: 330, f1: 660, dur: 0.12, vol: 0.12 }, hurt: { synth: "tone", f0: 220, f1: 90, dur: 0.25, vol: 0.18, type: "square" },
  level: { synth: "tone", f0: 520, f1: 1040, dur: 0.3, vol: 0.14 }, win: { synth: "tone", f0: 660, f1: 1320, dur: 0.5, vol: 0.14 },
  lose: { synth: "tone", f0: 330, f1: 110, dur: 0.6, vol: 0.16 }
});
const SVG = {
  left: "M15 5 L8 12 L15 19", right: "M9 5 L16 12 L9 19", up: "M5 15 L12 8 L19 15", down: "M5 9 L12 16 L19 9",
  fire: "M12 3 v4 M12 17 v4 M3 12 h4 M17 12 h4 M6 6 l3 3 M15 15 l3 3 M18 6 l-3 3 M9 15 l-3 3", sound: "M4 9 h4 l5 -4 v14 l-5 -4 h-4 z M16 9 q3 3 0 6"
};

function icon(doc, d) {
  const ns = "http://www.w3.org/2000/svg", s = doc.createElementNS(ns, "svg"), p = doc.createElementNS(ns, "path");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor"); p.setAttribute("stroke-width", "2.5"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
  s.appendChild(p); return s;
}

/**
 * Startet den Rahmen in einem Dokument. Alle Abhaengigkeiten kommen als Argument (testbar, keine Globals).
 * @param {{win: Window, doc: Document, workerSrc: string, fristen?: typeof FRISTEN}} env
 */
export function startFrame(env) {
  const { win, doc } = env, fristen = env.fristen || FRISTEN;
  const toHost = (m) => { const msg = { v: V, ...m }; const bad = checkToHost(msg); if (bad) throw new Error("Rahmen: eigene Nachricht ungueltig: " + bad); win.parent.postMessage(msg, "*"); };
  const frameNet = [];
  let worker = null, port = null, mode = null, pendingSince = 0, pendingLimit = 0, deadline = 0, dead = false, texts = TEXTS.de;
  let st = null, ops = [], paused = false, muted = false, loop = null, ctx2d = null, fit = null, canvas = null, sampler = null, snd = null;
  const queue = [];

  function kill(code, message) {
    if (dead) return;
    dead = true; pendingSince = 0;
    if (worker) worker.terminate();
    if (loop) loop.stop();
    toHost({ t: "error", code, message: String(message).slice(0, 500) });
  }
  const wait = (limit) => { pendingSince = win.performance.now(); pendingLimit = limit; };
  win.setInterval(() => {
    if (dead) return;
    const t = win.performance.now();
    if (deadline && t > deadline) kill("watchdog", "Gesamtfrist der Pruefung ueberschritten – das Spiel rechnet zu lange (Frist waechst mit der Pruefdauer, nicht mit Fortschritt)");
    else if (pendingSince && t - pendingSince > pendingLimit) kill("watchdog", "Spielcode antwortet nicht seit " + pendingLimit + " ms – Endlosschleife oder zu viel Rechenarbeit je Frame");
  }, 100);
  win.setInterval(() => { if (st && mode === "play" && !dead) toHost({ t: "status", status: pub() }); }, 500);

  const pub = () => ({ frame: st.frame, score: st.score, lives: st.lives, level: st.level, over: st.over, won: st.won, paused });
  function draw() { if (ctx2d && st) paint(ctx2d, ops, st, { paused, texts }); }

  function layout() {
    const box = canvas.parentElement.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
    fit = fitView({ w: W, h: H, fit: "contain" }, box.width, box.height);
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    ctx2d.setTransform(fit.k * dpr, 0, 0, fit.k * dpr, fit.ox * dpr, fit.oy * dpr);
    draw();
  }
  function gesture() { if (!snd) snd = createSound({ audioContext: () => new win.AudioContext(), muted: () => muted }); snd.play([], {}); if (paused) setPaused(false); }
  function setPaused(p) {
    if (p === paused || dead) return;
    paused = p;
    if (!loop) return;
    if (p) { loop.pause(); sampler.reset(); } else loop.resume();
    draw();
  }

  function buildUi(meta) {
    const root = doc.getElementById("spiel");
    const stage = doc.createElement("div"); stage.className = "buehne";
    canvas = doc.createElement("canvas"); canvas.setAttribute("role", "img"); canvas.setAttribute("aria-label", meta.title);
    stage.appendChild(canvas);
    const bar = doc.createElement("div"); bar.className = "leiste";
    const pad = doc.createElement("div"); pad.className = "kreuz";
    const btn = (id, cls, label) => {
      const b = doc.createElement("button"); b.type = "button"; b.className = cls; b.setAttribute("aria-label", label); b.appendChild(icon(doc, SVG[id]));
      const down = (e) => { e.preventDefault(); gesture(); sampler.button(id, true); if (id === "fire") sampler.button("fireP", true); b.setPointerCapture && b.setPointerCapture(e.pointerId); };
      const up = (e) => { e.preventDefault(); sampler.button(id, false); if (id === "fire") sampler.button("fireP", false); };
      b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
      return b;
    };
    for (const d of ["left", "up", "down", "right"]) if (meta.controls.includes(d)) pad.appendChild(btn(d, "knopf " + d, texts[d]));
    bar.appendChild(pad);
    const tone = doc.createElement("button"); tone.type = "button"; tone.className = "knopf ton"; tone.setAttribute("aria-label", texts.sound); tone.setAttribute("aria-pressed", "true");
    tone.appendChild(icon(doc, SVG.sound));
    tone.addEventListener("click", () => { gesture(); muted = !muted; tone.setAttribute("aria-pressed", String(!muted)); });
    bar.appendChild(tone);
    if (meta.controls.includes("fire")) bar.appendChild(btn("fire", "knopf feuer", texts.fire));
    root.replaceChildren(stage, bar);
    ctx2d = canvas.getContext("2d");
    sampler = createSampler(LAYOUT, { w: W, h: H });
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return toWorld(fit, e.clientX - r.left, e.clientY - r.top); };
    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); gesture(); const [x, y] = pt(e); sampler.pointer("down", e.pointerId, x, y); });
    canvas.addEventListener("pointermove", (e) => { const [x, y] = pt(e); sampler.pointer("move", e.pointerId, x, y); });
    for (const t of ["pointerup", "pointercancel"]) canvas.addEventListener(t, (e) => { const [x, y] = pt(e); sampler.pointer(t === "pointerup" ? "up" : "cancel", e.pointerId, x, y); });
    win.addEventListener("keydown", (e) => { gesture(); if (sampler.key(e.code, true)) e.preventDefault(); });
    win.addEventListener("keyup", (e) => { if (sampler.key(e.code, false)) e.preventDefault(); });
    win.addEventListener("blur", () => sampler.reset());
    win.addEventListener("resize", layout);
    layout();
  }

  function flush() {
    if (dead || pendingSince || !queue.length) return;
    const inputs = queue.splice(0, queue.length);
    if (st && st.over && inputs.some((i) => i.firePressed)) port.postMessage({ t: "restart" });
    else port.postMessage({ t: "ticks", inputs });
    wait(fristen.fenster.tick);
  }

  function onWorker(e) {
    const m = e.data;
    if (dead || !m || typeof m !== "object") return;
    if (m.t === "ready") return;
    if (m.t === "error") { kill(m.code, m.message); return; }
    if (m.t === "progress") {
      if (!PHASES.includes(m.phase)) { kill("protokoll", "Worker meldet unbekannte Phase " + JSON.stringify(m.phase)); return; }
      wait(fristen.fenster[m.phase]); toHost({ t: "progress", done: m.done, total: m.total }); return;
    }
    if (m.t === "report") {
      pendingSince = 0; deadline = 0;
      const r = m.report, attempts = [...m.net, ...frameNet];
      r.checks.noNetwork = { ok: attempts.length === 0, attempts };
      finish(r);
      dead = true; worker.terminate();
      toHost({ t: "result", report: r });
      return;
    }
    if (m.t === "started") {
      pendingSince = 0; st = m.status; ops = m.ops;
      toHost({ t: "started", meta: { title: m.meta.title, controls: m.meta.controls, lives: m.meta.lives } });
      buildUi(m.meta);
      loop = createLoop({
        tick: HZ, now: () => win.performance.now(), frame: (f) => win.requestAnimationFrame(f), cancel: (h) => win.cancelAnimationFrame(h),
        onTick: () => { if (queue.length >= 6) return false; queue.push(toInput(sampler.sample())); return true; },
        onFrame: flush
      });
      loop.start();
      if (doc.hidden) setPaused(true);
      return;
    }
    if (m.t === "frame") { pendingSince = 0; st = m.status; ops = m.ops; draw(); if (snd && m.sounds.length) snd.play(m.sounds.map((k) => ({ k })), SOUND_TABLE); }
  }

  function start(m) {
    mode = m.mode; texts = TEXTS[m.lang];
    const url = win.URL.createObjectURL(new win.Blob([env.workerSrc], { type: "text/javascript" }));
    // klassischer Worker: ein Modul-Worker aus blob:null (opaker Ursprung) laedt in Chromium nicht (gemessen 2026-11-17)
    worker = new win.Worker(url);
    worker.addEventListener("error", (e) => { e.preventDefault(); kill("exception", "Worker: " + (e.message || "Fehler beim Laden") + (e.lineno ? " (Zeile " + e.lineno + ")" : "")); });
    const ch = new win.MessageChannel();
    port = ch.port1;
    port.onmessage = onWorker;
    worker.postMessage({ t: "init" }, [ch.port2]);
    port.postMessage({ t: "load", code: m.code, seed: m.seed, mode: m.mode, seconds: m.mode === "test" ? m.seconds : 0 });
    wait(fristen.fenster.load);
    if (m.mode === "test") deadline = win.performance.now() + gesamtfristMs(m.seconds, fristen);
  }

  /**
   * Fail closed: opaker Ursprung und aktive, meldende CSP. Probe: ein data:-Bild (kein Netz, ohne CSP harmlos). Nur
   * wenn die CSP es mit img-src 'none' sperrt UND den Verstoss als Ereignis meldet, geht es weiter – genau auf diese
   * Meldungen stuetzt sich checks.noNetwork. Die Probe laeuft vor dem Zaehler, sie zaehlt nicht als Netzversuch.
   * @returns {Promise<string|null>} Grund der Verweigerung oder null
   */
  async function selfCheck() {
    if (win.origin !== "null") return "Rahmen hat keinen opaken Ursprung (sandbox fehlt)";
    let on = null;
    const reported = new Promise((res) => {
      on = (e) => { if (e.effectiveDirective === "img-src") res(true); };
      doc.addEventListener("securitypolicyviolation", on);
      win.setTimeout(() => res(false), PROBE_MS);
    });
    doc.createElement("img").src = "data:,";
    const ok = await reported;
    doc.removeEventListener("securitypolicyviolation", on);
    return ok ? null : "CSP des Rahmens fehlt oder meldet keine Verstoesse (Bild-Probe nicht gesperrt)";
  }

  function listen() {
    doc.addEventListener("securitypolicyviolation", (e) => frameNet.push(String(e.violatedDirective) + " " + String(e.blockedURI).slice(0, 120)));
    doc.addEventListener("visibilitychange", () => { if (doc.hidden) setPaused(true); });
    win.addEventListener("message", (e) => {
      if (e.source !== win.parent) return;
      const bad = checkToFrame(e.data);
      if (bad) { toHost({ t: "error", code: "protokoll", message: "abgelehnt: " + bad }); return; }
      const m = e.data;
      if (m.t === "start") { if (worker) { toHost({ t: "error", code: "protokoll", message: "abgelehnt: schon gestartet" }); return; } start(m); }
      else if (m.t === "pause") setPaused(true);
      else if (m.t === "resume") setPaused(false);
      else if (m.t === "stop") { if (!dead) { dead = true; if (worker) worker.terminate(); if (loop) loop.stop(); } }
    });
  }

  return selfCheck().then((why) => {
    if (why) { dead = true; toHost({ t: "error", code: "sandbox", message: why }); return; }
    listen();
    toHost({ t: "ready" });
  });
}

// Einstieg im echten Rahmen (der Build setzt __SPIEL_WORKER__). In Node-Tests wird nur importiert, nicht gestartet.
if (typeof __SPIEL_WORKER__ === "string") startFrame({ win: window, doc: document, workerSrc: __SPIEL_WORKER__, fristen: mitFristen(__SPIEL_FRISTEN__) });
