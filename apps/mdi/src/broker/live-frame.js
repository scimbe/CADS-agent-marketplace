// Laeuft im abgeschotteten Rahmen (iframe sandbox="allow-scripts", opaker Ursprung, eigene CSP): einziger Ort, an dem
// das ct-agent-Modul der Webkonferenz geladen wird. Spricht mit der App nur per postMessage, nur mit dem Elternfenster.
// Sieht nur Einladung, Signalisierung und oeffentliche Spielnachrichten – nie Haende oder Salze (Review M4).
import { createLive } from "./live.js";

const live = createLive();
let cur = null;
const post = (o) => parent.postMessage(o, "*"); // Elternfenster hat aus Sicht des opaken Rahmens keinen Ursprungsnamen
const cb = {
  onToken: (token) => post({ ev: "token", token }), onStep: (step) => post({ ev: "step", step }),
  onUp: () => post({ ev: "up" }), onDown: () => post({ ev: "down" }),
  onFail: (reason) => post({ ev: "fail", reason }), onMessage: (msg) => post({ ev: "message", msg })
};
addEventListener("message", (e) => {
  if (e.source !== parent) return;
  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.cmd === "invite" && !cur) cur = live.invite(cb);
  else if (d.cmd === "accept" && !cur && typeof d.token === "string" && /^[A-Za-z0-9_-]{22}$/.test(d.token)) cur = live.accept(d.token, cb);
  else if (d.cmd === "send" && cur) cur.send(d.msg);
  else if (d.cmd === "close" && cur) { cur.close(); cur = null; }
});
post({ ev: "ready" });
