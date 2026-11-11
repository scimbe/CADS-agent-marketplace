// Laeuft im Live-Rahmen: einziger Ort, an dem das ct-agent-Modul der Webkonferenz geladen wird. Spricht mit der App nur
// per postMessage, nur mit dem Elternfenster, nur mit erlaubten Eltern-Ursprungen. Sieht nur Einladung,
// Signalisierung und oeffentliche Spielnachrichten – nie Haende oder Salze (Review M4).
// Zwei Varianten (Build): "remote" liegt auf dem Ursprung der Webkonferenz (gleicher Ursprung wie /api/play, kein CORS;
// Eltern laut Allowlist) – "local" ist der Rueckfall fuer file:// und Tests (opaker Ursprung).
/* global __FRAME_PARENTS__ */
import { createLive } from "./live.js";

const PARENTS = typeof __FRAME_PARENTS__ !== "undefined" ? __FRAME_PARENTS__ : ["null"];
const live = createLive();
let cur = null, parentOrigin = null;
const post = (o) => { if (parentOrigin) parent.postMessage(o, parentOrigin === "null" ? "*" : parentOrigin); };
const cb = {
  onToken: (token) => post({ ev: "token", token }), onStep: (step) => post({ ev: "step", step }),
  onUp: () => post({ ev: "up" }), onDown: () => post({ ev: "down" }),
  onFail: (reason) => post({ ev: "fail", reason }), onMessage: (msg) => post({ ev: "message", msg })
};
addEventListener("message", (e) => {
  if (e.source !== parent || !PARENTS.includes(e.origin)) return;
  if (parentOrigin && e.origin !== parentOrigin) return;
  const d = e.data;
  if (!d || typeof d !== "object") return;
  if (d.cmd === "hello") { parentOrigin = e.origin; post({ ev: "ready" }); return; }
  if (!parentOrigin) return;
  if (d.cmd === "invite" && !cur) cur = live.invite(cb);
  else if (d.cmd === "accept" && !cur && typeof d.token === "string" && /^[A-Za-z0-9_-]{22}$/.test(d.token)) cur = live.accept(d.token, cb);
  else if (d.cmd === "send" && cur) cur.send(d.msg);
  else if (d.cmd === "close" && cur) { cur.close(); cur = null; }
});
