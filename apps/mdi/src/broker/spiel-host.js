// App-Seite der Sandbox: bettet den Spielrahmen ein (sandbox="allow-scripts", ohne allow-same-origin => opaker
// Ursprung), spricht nur das Schema aus spiel/protokoll.js und nimmt Nachrichten nur von genau diesem Rahmen an
// (e.source === iframe.contentWindow; der Ursprung ist bei opakem Rahmen "null" und taugt nicht zur Pruefung).
// Zweiter Watchdog auf Host-Seite: meldet sich der Rahmen zu lange nicht (Absturz, haengender Rahmen) oder ueberschreitet
// eine Pruefung die Gesamtfrist (spiel/fristen.js, waechst mit seconds, nicht mit Fortschritt), wird er entfernt.
// Fail closed: iframe.csp verlangt die CSP des Rahmens (spiel-csp.js). Liefert der Spiel-Ursprung sie nicht mindestens so
// streng aus, zeigt Chromium den Rahmen nicht an und es laeuft kein Spielcode; der Host meldet dann "watchdog".
// Grenze der Verantwortung: Was dieser Host meldet (auch ein "result"), ist Anzeige fuer die App. Ueber Abnahme oder
// Guthaben entscheidet nie der Browser-Host, sondern nur runGame (scripts/spiel/runner.mjs) auf dem Server.
import { V, checkToHost, checkToFrame } from "../spiel/protokoll.js";
import { FRISTEN, hostFristMs } from "../spiel/fristen.js";
import { frameCsp } from "./spiel-csp.js";

/** Stille, nach der der Host den Rahmen aufgibt; groesser als jedes Fenster des Rahmens (Test sichert das ab). */
export const HOST_SILENCE_MS = 6000;

/**
 * @param {{doc: Document, win: Window, mount: Element, frameUrl: string, onEvent: (m: object) => void, fristen?: typeof FRISTEN}} o
 * @returns {{ start(job: {mode:"play"|"test", code:string, seed:string, lang:"de"|"en", seconds?:number, szenarien?:object[]}): void, pause(): void, resume(): void, stop(): void, iframe: HTMLIFrameElement }}
 */
export function createSpielHost(o) {
  const { doc, win } = o, fristen = o.fristen || FRISTEN;
  const iframe = doc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("csp", frameCsp(new URL(o.frameUrl, win.location.href).origin, win.location.origin));
  iframe.setAttribute("allow", "autoplay");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", "Spiel");
  iframe.className = "spielrahmen";
  let ready = false, queued = null, last = 0, closed = false, timer = 0, deadline = 0, attached = false;

  function close(code, message) {
    if (closed) return;
    closed = true; win.clearInterval(timer); win.removeEventListener("message", onMsg);
    iframe.remove();
    if (code) o.onEvent({ v: V, t: "error", code, message });
  }
  function send(m) {
    const msg = { v: V, ...m }, bad = checkToFrame(msg);
    if (bad) throw new Error("Spiel-Host: Nachricht ungueltig: " + bad);
    if (!closed) iframe.contentWindow.postMessage(msg, "*"); // opaker Rahmen: kein Zielursprung moeglich, Inhalt ist nicht geheim
  }
  function onMsg(e) {
    if (closed || e.source !== iframe.contentWindow) return;
    const bad = checkToHost(e.data);
    if (bad) { close("protokoll", "Rahmen sendet ungueltige Nachricht: " + bad); return; }
    last = win.performance.now();
    const m = e.data;
    if (m.t === "ready") { ready = true; if (queued) { send(queued); queued = null; } return; }
    o.onEvent(m);
    if (m.t === "result" || m.t === "error") close(null);
  }
  win.addEventListener("message", onMsg);
  timer = win.setInterval(() => {
    if (closed) return;
    // die Ansicht hat den Rahmen entfernt (z. B. "Probe schliessen"): aufraeumen, ohne Fehler zu melden
    if (iframe.isConnected) attached = true; else if (attached) { close(null); return; }
    const t = win.performance.now();
    if (deadline && t > deadline) close("watchdog", "Gesamtfrist der Pruefung im Host ueberschritten");
    else if (last && t - last > HOST_SILENCE_MS) close("watchdog", "Spielrahmen meldet sich nicht seit " + HOST_SILENCE_MS + " ms");
  }, 250);
  iframe.src = o.frameUrl;
  o.mount.appendChild(iframe);

  return {
    iframe,
    start(job) {
      const m = { t: "start", mode: job.mode, code: job.code, seed: job.seed, lang: job.lang, ...(job.mode === "test" ? { seconds: job.seconds, szenarien: job.szenarien } : {}) };
      const bad = checkToFrame({ v: V, ...m });
      if (bad) throw new Error("Spiel-Host: Auftrag ungueltig: " + bad);
      last = win.performance.now();
      if (job.mode === "test") deadline = last + hostFristMs(job.seconds, fristen);
      if (ready) send(m); else queued = m;
    },
    pause() { if (ready) send({ t: "pause" }); },
    resume() { if (ready) send({ t: "resume" }); },
    stop() { if (ready) send({ t: "stop" }); close(null); }
  };
}
