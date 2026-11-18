// Freie Karte 2, P4: Service Worker der neuen App, NUR fuer Push und den Klick auf die Mitteilung. Kein fetch-Handler,
// kein Cache, keine Offline-Seite. Der Server schickt nur die Art (und bei einer Karte die Auftrags-id), Ende-zu-Ende
// verschluesselt (lib/duell-push.mjs): { r: "karte-fertig" | "karte-fast" | "karte-nicht", a: <id> }. Der Satz entsteht hier,
// in der Sprache des Geraets; ein Klick oeffnet ?go=fertig&auftrag=<id>.
// Er uebernimmt den Scope /duell des alten Service Workers (push-sw.js der alten Seite, entfernt in #237). Darum zeigt er
// dessen Arten ("reply", "live") und alles Unbekannte weiter mit denselben neutralen Saetzen wie bisher – jede Push-Nachricht
// bekommt eine Mitteilung, sonst zeigt der Browser seine allgemeine Meldung (Review S7) –, und ein Klick darauf holt die
// Seite nach vorn.
export const ARTEN = Object.freeze(["karte-fertig", "karte-fast", "karte-nicht"]);
export const TEXTE = Object.freeze({
  de: { "karte-fertig": ["Deine Karte ist fertig", "Alle Punkte sind erfüllt. Tippe zum Ansehen."], "karte-fast": ["Deine Karte ist fast fertig", "Ein Punkt fehlt noch – abgebucht ist nichts."], "karte-nicht": ["Deine Karte hat nicht geklappt", "Abgebucht ist nichts. Tippe für die Gründe."] },
  en: { "karte-fertig": ["Your card is ready", "All points are done. Tap to see it."], "karte-fast": ["Your card is almost ready", "One point is still missing – nothing is charged."], "karte-nicht": ["Your card did not work out", "Nothing is charged. Tap to see why."] }
});
/** die Arten und Saetze des alten Service Workers, unveraendert */
export const ALT = Object.freeze({
  de: { reply: "Jemand hat auf deine Karte geantwortet.", live: "Deine Live-Einladung wurde angenommen.", any: "Es gibt etwas Neues für dich." },
  en: { reply: "Someone answered your card.", live: "Your live invite was accepted.", any: "There is something new for you." }
});
const ID = /^[A-Za-z0-9_-]{22}$/;
const sprache = (lang) => (String(lang || "").toLowerCase().startsWith("de") ? "de" : "en");

/** Inhalt einer Push-Nachricht -> { titel, text, url, tag }; nie null: Unbekanntes bekommt den neutralen Satz */
export function mitteilung(data, lang, base) {
  const L = sprache(lang), r = data && typeof data === "object" ? data.r : "";
  if (ARTEN.includes(r) && ID.test(String(data.a))) {
    const [titel, text] = TEXTE[L][r];
    return { titel, text, url: new URL("?go=fertig&auftrag=" + data.a, base).href, tag: "mdi-" + data.a };
  }
  const k = r === "reply" || r === "live" ? r : "any";
  return { titel: "My Daily Idea", text: ALT[L][k], url: null, tag: "mdi-" + k };
}

/** Bindet die beiden Ereignisse an einen Service-Worker-Scope (im Test ein Double). */
export function installiere(sw) {
  // die App liegt neben dem Service Worker: /duell/mdi-push-sw.js -> /duell
  const base = () => sw.registration.scope.replace(/\/$/, "");
  // wie der alte: sofort uebernehmen, damit kein alter Stand Mitteilungen falsch zeigt
  sw.addEventListener("install", () => { sw.skipWaiting(); });
  sw.addEventListener("activate", (e) => { e.waitUntil(sw.clients.claim()); });
  sw.addEventListener("push", (e) => {
    let data = null;
    try { data = e.data ? e.data.json() : null; } catch (x) { data = null; }
    const m = mitteilung(data, sw.navigator && sw.navigator.language, base());
    e.waitUntil(sw.registration.showNotification(m.titel, { body: m.text, tag: m.tag, data: { url: m.url } }));
  });
  sw.addEventListener("notificationclick", (e) => {
    e.notification.close();
    const url = e.notification.data && typeof e.notification.data.url === "string" ? e.notification.data.url : null;
    if (url) { if (new URL(url).origin === sw.location.origin) e.waitUntil(sw.clients.openWindow(url)); return; }
    // alte Arten: die offene Seite nach vorn holen, sonst oeffnen (wie der alte Service Worker)
    const home = new URL(sw.registration.scope).pathname || "/duell";
    e.waitUntil(sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (new URL(c.url).pathname.indexOf(home) === 0 && "focus" in c) return c.focus();
      return sw.clients.openWindow(home);
    }));
  });
}

/* global self */
if (typeof self !== "undefined" && typeof self.registration === "object" && typeof self.clients === "object") installiere(self);
