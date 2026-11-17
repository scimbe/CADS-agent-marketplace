// App-Seite der Sandbox: bettet den Spielrahmen ein (sandbox="allow-scripts", ohne allow-same-origin => opaker
// Ursprung), spricht nur das Schema aus spiel/protokoll.js und nimmt Nachrichten nur von genau diesem Rahmen an
// (e.source === iframe.contentWindow; der Ursprung ist bei opakem Rahmen "null" und taugt nicht zur Pruefung).
// Zweiter Watchdog auf Host-Seite: meldet sich der Rahmen zu lange nicht (Absturz, haengender Rahmen), wird er entfernt.
import { V, checkToHost, checkToFrame } from "../spiel/protokoll.js";

export const HOST_SILENCE_MS = 6000;

/**
 * @param {{doc: Document, win: Window, mount: Element, frameUrl: string, onEvent: (m: object) => void}} o
 * @returns {{ start(job: {mode:"play"|"test", code:string, seed:string, lang:"de"|"en", seconds?:number}): void, pause(): void, resume(): void, stop(): void, iframe: HTMLIFrameElement }}
 */
export function createSpielHost(o) {
  const { doc, win } = o;
  const iframe = doc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("allow", "autoplay");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("title", "Spiel");
  iframe.className = "spielrahmen";
  let ready = false, queued = null, last = 0, closed = false, timer = 0;

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
    if (!closed && last && win.performance.now() - last > HOST_SILENCE_MS) close("watchdog", "Spielrahmen meldet sich nicht seit " + HOST_SILENCE_MS + " ms");
  }, 250);
  iframe.src = o.frameUrl;
  o.mount.appendChild(iframe);

  return {
    iframe,
    start(job) {
      const m = { t: "start", mode: job.mode, code: job.code, seed: job.seed, lang: job.lang, ...(job.mode === "test" ? { seconds: job.seconds } : {}) };
      const bad = checkToFrame({ v: V, ...m });
      if (bad) throw new Error("Spiel-Host: Auftrag ungueltig: " + bad);
      last = win.performance.now();
      if (ready) send(m); else queued = m;
    },
    pause() { if (ready) send({ t: "pause" }); },
    resume() { if (ready) send({ t: "resume" }); },
    stop() { if (ready) send({ t: "stop" }); close(null); }
  };
}
