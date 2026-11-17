// Spiel-Worker im Spielrahmen: der einzige Ort, an dem fremder Spielcode laeuft. Getrennt vom Rahmen, damit der Rahmen
// eine Endlosschleife per Watchdog beenden kann (worker.terminate), ohne selbst zu haengen.
// Abschottung hier (zusaetzlich zu Ursprung + CSP des Rahmens, die der Worker erbt):
//  1. Ein privater MessagePort (vom Rahmen uebergeben) ist der einzige Rueckkanal; der Spielcode sieht ihn nie. Was ueber
//     das globale postMessage kommt, ignoriert der Rahmen nach dem Handshake.
//  2. Bevor das Spiel geladen wird, werden die Bausteine eingefroren, die Laufzeit und Bots benutzen (Prototypen,
//     Math, JSON, structuredClone ...), damit Spielcode Pruefung und Bericht nicht umbiegen kann. Der Math-Zufall wirft.
//  3. Netz- und Ausbruchsversuche (CSP-Verletzung, gesperrtes fetch/Worker/BroadcastChannel ...) werden gezaehlt und gemeldet.
// Grenzen: Teil-Haertung im selben Realm, kein vollstaendiges "lockdown" (SES). Die Haertung selbst steht in
// spiel-haerten.js und ist fail closed: ist eine Forderung nicht erfuellt, laeuft kein Spielcode (Fehler "sandbox").
// Der Bericht dieses Workers entscheidet nie ueber Abnahme oder Guthaben; das tut nur runGame auf dem Server.
import { createGame } from "../spiel/api.js";
import { playtest } from "../spiel/pruefung.js";
import { harden } from "./spiel-haerten.js";

const scope = globalThis;
const now = performance.now.bind(performance);
const later = setTimeout.bind(scope); // vor dem Spielcode gegriffen: das Spiel kann setTimeout nicht umbiegen
const net = [];
/** Nach dem Pruefen kurz warten, damit CSP-Verstoesse (z. B. import("https://…")) als Ereignis ankommen und zaehlen. */
const SETTLE_MS = 100;
const PROGRESS_EVERY_MS = 150;
let port = null, game = null;

const send = (m) => port.postMessage(m);
const errOf = (e, fallback) => ({ t: "error", code: e && typeof e.code === "string" ? e.code : fallback, message: String(e && e.message ? e.message : e).slice(0, 500) });

function status() { const s = game.status(); return { frame: s.frame, score: s.score, lives: s.lives, level: s.level, over: s.over, won: s.won }; }

async function load(m) {
  const url = URL.createObjectURL(new Blob([m.code], { type: "text/javascript" }));
  let mod;
  try { mod = (await import(url)).default; } catch (e) { send(errOf(e, e instanceof SyntaxError ? "syntax" : "exception")); return; } finally { URL.revokeObjectURL(url); }
  if (m.mode === "test") {
    let last = now(), phase = "bots";
    const report = playtest(mod, { seed: m.seed, seconds: m.seconds, now, onProgress(done, total, ph) {
      const t = now();
      // Phasenwechsel sofort melden: der Rahmen schaltet auf das Fenster der neuen Phase
      if (t - last > PROGRESS_EVERY_MS || ph !== phase) { last = t; phase = ph; send({ t: "progress", done, total, phase: ph }); }
    } });
    await new Promise((r) => later(r, SETTLE_MS));
    send({ t: "report", report, net: net.slice(0, 20) });
    return;
  }
  try { game = createGame(mod, { seed: m.seed }); } catch (e) { send(errOf(e, "exception")); return; }
  send({ t: "started", meta: game.meta, status: status(), ops: game.draw() });
}

function onCmd(e) {
  const m = e.data;
  try {
    if (m.t === "load") { load(m).catch((x) => send(errOf(x, "exception"))); return; }
    if (!game) return;
    if (m.t === "ticks") {
      const sounds = [];
      for (const inp of m.inputs) { game.step(inp); for (const s of game.sounds()) if (sounds.length < 8) sounds.push(s); }
      send({ t: "frame", status: status(), ops: game.draw(), sounds, net: net.length });
    } else if (m.t === "restart") { game.restart(); send({ t: "frame", status: status(), ops: game.draw(), sounds: [], net: net.length }); }
  } catch (x) { send(errOf(x, "exception")); game = null; }
}

scope.addEventListener("securitypolicyviolation", (e) => { net.push(String(e.violatedDirective) + " " + String(e.blockedURI).slice(0, 120)); });
scope.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason && e.reason.message ? e.reason.message : e.reason);
  if (/fetch|network|Content Security Policy|connect/i.test(msg)) net.push("rejection " + msg.slice(0, 120));
  else if (port) send({ t: "error", code: "exception", message: ("unbehandelte Ablehnung: " + msg).slice(0, 500) });
});
scope.addEventListener("message", (e) => {
  if (port || !e.data || e.data.t !== "init" || !e.ports || !e.ports[0]) return;
  port = e.ports[0];
  try { harden(scope, (name) => net.push(name)); } catch (x) { send(errOf(x, "sandbox")); return; }
  port.onmessage = onCmd;
  send({ t: "ready" });
});
