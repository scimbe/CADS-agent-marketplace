// Kurzlinks, reine Teile (die Aufrufe selbst liegen in src/broker/api.js shortCreate/shortDelete/shortResolve; Server:
// CADS-DEMO-wrapper lib/shortlink.mjs). Portiert von alt:src/shortlink.js: nur nach einem Tipp auf Teilen, jeder Fehler
// laesst den langen Link stehen und sagt es (Status "lang"). Live-Einladungen (v2.live.) gehen nie an den Server.
export const SAFE = /^v2\.(card|challenge)\.[A-Za-z0-9_-]+$/;
export function fragmentOf(link) { const f = String(link || "").replace(/^[^#]*#/, ""); return SAFE.test(f) ? f : null; }
export function kindOf(f) { return f.startsWith("v2.card.") ? "card" : "game"; }
/** Adresse fuer Teilen/Story: der Kurzlink, solange er gilt, sonst der lange Link. */
export function shareUrl(base, inv, now) { return inv.s && now < inv.s.exp ? inv.s.url : String(base).split("#")[0] + "#" + inv.f; }
