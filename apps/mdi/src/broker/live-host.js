// Live-Anbindung im App-Realm: oeffnet je Sitzung einen abgeschotteten Rahmen (Teil "live") und spricht mit ihm nur
// per postMessage. Absenderpruefung: nur genau dieser Rahmen; nur bekannte Ereignisse; Spielnachrichten prueft danach
// die Laufzeit gegen das Schema. Schliessen entfernt den Rahmen – damit enden auch Socket und PeerConnection.
/* global __PARTS__ */
const PARTS = typeof __PARTS__ !== "undefined" ? __PARTS__ : {};
const READY_MS = 15000;

function open(first, cb) {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts");
  f.setAttribute("aria-hidden", "true");
  f.setAttribute("tabindex", "-1");
  f.setAttribute("title", "live");
  f.className = "liveframe";
  f.src = PARTS.live.file;
  let ready = false, closed = false;
  const queue = [];
  const post = (o) => { if (closed) return; if (ready) f.contentWindow.postMessage(o, "*"); else queue.push(o); };
  const timer = setTimeout(() => { if (!ready && !closed) { cb.onFail("verbindung"); close(); } }, READY_MS);
  function onMsg(e) {
    if (closed || e.source !== f.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    switch (d.ev) {
      case "ready": ready = true; clearTimeout(timer); for (const o of queue.splice(0)) f.contentWindow.postMessage(o, "*"); break;
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
  document.body.appendChild(f);
  post(first);
  return { send: (msg) => post({ cmd: "send", msg }), close };
}

export function loadLive() {
  if (!PARTS.live) return Promise.reject(new Error("Teil live fehlt"));
  return Promise.resolve({ invite: (cb) => open({ cmd: "invite" }, cb), accept: (token, cb) => open({ cmd: "accept", token }, cb) });
}
