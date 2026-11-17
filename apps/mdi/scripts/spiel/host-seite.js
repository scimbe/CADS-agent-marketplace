// Lokale Host-Seite fuer Bot-Runner und E2E (nur Test, nie ausgeliefert): holt den Auftrag von ./job.json, bettet den
// Spielrahmen ueber src/broker/spiel-host.js ein und schreibt Ereignisse sichtbar ins DOM (#status, #bericht), wo der Runner
// sie liest. Keine Globals.
import { createSpielHost } from "../../src/broker/spiel-host.js";

const out = (id, v) => { document.getElementById(id).textContent = JSON.stringify(v); };
const job = await (await fetch("./job.json")).json();
const host = createSpielHost({
  doc: document, win: window, mount: document.getElementById("buehne"), frameUrl: job.frameUrl,
  onEvent(m) {
    if (m.t === "status") out("status", m.status);
    else if (m.t === "started") out("meta", m.meta);
    else if (m.t === "progress") out("fortschritt", { done: m.done, total: m.total });
    else if (m.t === "result") out("bericht", m.report);
    else if (m.t === "error") out("bericht", { ok: false, error: { code: m.code, message: m.message } });
  }
});
host.start({ mode: job.mode, code: job.code, seed: job.seed, lang: job.lang, seconds: job.seconds });
for (const [id, f] of [["pause", () => host.pause()], ["weiter", () => host.resume()]]) document.getElementById(id).addEventListener("click", f);
