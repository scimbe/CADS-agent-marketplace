// Live-Anbindung im App-Realm: oeffnet je Sitzung einen Rahmen fuer den Broker und spricht mit ihm nur per postMessage.
// Ueber https: Rahmen vom Ursprung der Webkonferenz (play-frame.html) – gleicher Ursprung wie /api/play, daher kein CORS,
// und fremder Ursprung zur App, daher getrennt (sandbox allow-same-origin gibt ihm SEINEN Ursprung, nicht den der App).
// Ueber file:// (Tests, Apps bis D1b): lokaler Rueckfall mit opakem Ursprung.
// Absenderpruefung: genau dieser Rahmen (e.source) UND erwarteter Ursprung (e.origin). Schliessen entfernt den Rahmen.
/* global __PARTS__, __LIVE_REMOTE__ */
const PARTS = typeof __PARTS__ !== "undefined" ? __PARTS__ : {};
const REMOTE = typeof __LIVE_REMOTE__ !== "undefined" ? __LIVE_REMOTE__ : null;
const READY_MS = 15000;

export function frameConfig(protocol) {
  if (REMOTE && protocol === "https:") return { src: REMOTE.src, origin: REMOTE.origin, sandbox: "allow-scripts allow-same-origin" };
  return { src: PARTS.live && PARTS.live.file, origin: "null", sandbox: "allow-scripts" };
}

function open(first, cb) {
  const cfg = frameConfig(location.protocol);
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", cfg.sandbox);
  f.setAttribute("aria-hidden", "true");
  f.setAttribute("tabindex", "-1");
  f.setAttribute("title", "live");
  f.className = "liveframe";
  f.src = cfg.src;
  const target = cfg.origin === "null" ? "*" : cfg.origin;
  let ready = false, closed = false;
  const queue = [];
  const post = (o) => { if (closed) return; if (ready) f.contentWindow.postMessage(o, target); else queue.push(o); };
  const timer = setTimeout(() => { if (!ready && !closed) { cb.onFail("verbindung"); close(); } }, READY_MS);
  function onMsg(e) {
    if (closed || e.source !== f.contentWindow || e.origin !== cfg.origin) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    switch (d.ev) {
      case "ready": ready = true; clearTimeout(timer); for (const o of queue.splice(0)) f.contentWindow.postMessage(o, target); break;
      case "token": if (typeof d.token === "string") cb.onToken(d.token); break;
      case "step": if (typeof d.step === "string") cb.onStep(d.step); break;
      case "up": cb.onUp(); break;
      case "down": cb.onDown(); break;
      case "fail": cb.onFail(typeof d.reason === "string" ? d.reason : "verbindung"); break;
      case "message": cb.onMessage(d.msg); break;
      default: break;
    }
  }
  function close() {
    if (closed) return;
    post({ cmd: "close" });
    closed = true; clearTimeout(timer);
    removeEventListener("message", onMsg);
    setTimeout(() => f.remove(), 300); // Zeit fuer "bye" und /done, dann endet der Rahmen samt Verbindungen
  }
  addEventListener("message", onMsg);
  // erst nach dem Laden begruessen: der Rahmen merkt sich dann genau diesen Eltern-Ursprung
  f.addEventListener("load", () => { if (!closed) f.contentWindow.postMessage({ cmd: "hello" }, target); });
  document.body.appendChild(f);
  post(first);
  return { send: (msg) => post({ cmd: "send", msg }), close };
}

export function loadLive() {
  if (!frameConfig(location.protocol).src) return Promise.reject(new Error("Teil live fehlt"));
  return Promise.resolve({ invite: (cb) => open({ cmd: "invite" }, cb), accept: (token, cb) => open({ cmd: "accept", token }, cb) });
}
