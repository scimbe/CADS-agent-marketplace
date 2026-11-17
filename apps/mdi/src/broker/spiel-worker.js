// Spiel-Worker im Spielrahmen: der einzige Ort, an dem fremder Spielcode laeuft. Getrennt vom Rahmen, damit der Rahmen
// eine Endlosschleife per Watchdog beenden kann (worker.terminate), ohne selbst zu haengen.
// Abschottung hier (zusaetzlich zu Ursprung + CSP des Rahmens, die der Worker erbt):
//  1. Ein privater MessagePort (vom Rahmen uebergeben) ist der einzige Rueckkanal; der Spielcode sieht ihn nie. Was ueber
//     das globale postMessage kommt, ignoriert der Rahmen nach dem Handshake.
//  2. Bevor das Spiel geladen wird, werden die Bausteine eingefroren, die Laufzeit und Bots benutzen (Prototypen,
//     Math, JSON, structuredClone ...), damit Spielcode Pruefung und Bericht nicht umbiegen kann. Der Math-Zufall wirft.
//  3. Netzversuche (CSP-Verletzung, abgewiesenes fetch) werden gezaehlt und gemeldet.
// Grenzen: Teil-Haertung im selben Realm, kein vollstaendiges "lockdown" (SES). Siehe offene Punkte im PR.
import { createGame } from "../spiel/api.js";
import { playtest } from "../spiel/pruefung.js";

const scope = globalThis;
const now = performance.now.bind(performance);
const net = [];
let port = null, game = null;

function harden() {
  // Netz: die CSP (connect-src none) blockt ohnehin; hier wird jeder Versuch zusaetzlich sichtbar gezaehlt, auch wenn das
  // Spiel den Fehler verschluckt (Chromium meldet CSP-Verletzungen aus Workern nicht verlaesslich als Ereignis).
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts"]) {
    if (!(name in scope)) continue;
    Object.defineProperty(scope, name, { value: function blocked() { net.push(name); throw new TypeError(name + " ist im Spiel gesperrt (kein Netz)"); }, writable: false, configurable: false });
  }
  // Zufall nur aus dem Seed: der Math-Zufall wirft mit Hinweis auf g.random()
  Object.defineProperty(Math, "random", { value: () => { throw new Error("Zufall von Math ist gesperrt – nutze g.random()"); }, writable: false, configurable: false });
  const freeze = [Object, Object.prototype, Function.prototype, Array, Array.prototype, JSON, Math, Number, Number.prototype, String, String.prototype,
    Boolean.prototype, Symbol, Symbol.prototype, Promise, Promise.prototype, Error, Error.prototype, TypeError, TypeError.prototype, RangeError, RangeError.prototype,
    Map.prototype, Set.prototype, WeakMap.prototype, Reflect, MessagePort.prototype, EventTarget.prototype, Performance.prototype,
    Object.getPrototypeOf(Uint8Array), Object.getPrototypeOf(Uint8Array.prototype), Uint8Array.prototype, TextEncoder.prototype, DataView.prototype, ArrayBuffer.prototype,
    Blob.prototype, URL, typeof Iterator === "function" ? Iterator.prototype : null, Object.getPrototypeOf([][Symbol.iterator]())];
  for (const o of freeze) if (o) Object.freeze(o);
  for (const name of ["Object", "Array", "JSON", "Math", "Number", "String", "Boolean", "Symbol", "Promise", "Error", "TypeError", "RangeError", "Map", "Set", "WeakMap",
    "Reflect", "MessagePort", "EventTarget", "performance", "structuredClone", "TextEncoder", "DataView", "ArrayBuffer", "Uint8Array", "URL", "Blob", "Function"]) {
    const d = Object.getOwnPropertyDescriptor(scope, name);
    if (d && d.configurable) Object.defineProperty(scope, name, { value: scope[name], writable: false, configurable: false, enumerable: d.enumerable });
  }
}

const send = (m) => port.postMessage(m);
const errOf = (e, fallback) => ({ t: "error", code: e && typeof e.code === "string" ? e.code : fallback, message: String(e && e.message ? e.message : e).slice(0, 500) });

function status() { const s = game.status(); return { frame: s.frame, score: s.score, lives: s.lives, level: s.level, over: s.over, won: s.won }; }

async function load(m) {
  const url = URL.createObjectURL(new Blob([m.code], { type: "text/javascript" }));
  let mod;
  try { mod = (await import(url)).default; } catch (e) { send(errOf(e, e instanceof SyntaxError ? "syntax" : "exception")); return; } finally { URL.revokeObjectURL(url); }
  if (m.mode === "test") {
    let last = now();
    const report = playtest(mod, { seed: m.seed, seconds: m.seconds, now, onProgress(done, total) { const t = now(); if (t - last > 150) { last = t; send({ t: "progress", done, total }); } } });
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
  try { harden(); } catch (x) { send(errOf(x, "exception")); return; }
  port.onmessage = onCmd;
  send({ t: "ready" });
});
