// Freie Karte 2, P4: Service Worker der neuen App, NUR fuer Push und den Klick auf die Mitteilung. Kein fetch-Handler,
// kein Cache, keine Offline-Seite. Der Server schickt nur die Art und die Auftrags-id (Ende-zu-Ende verschluesselt,
// lib/duell-push.mjs notify): { r: "karte-fertig" | "karte-fast" | "karte-nicht", a: <id> }. Der Satz entsteht hier, in der
// Sprache des Geraets. Ein Klick oeffnet ?go=fertig&auftrag=<id> neben diesem Service Worker. Andere Arten zeigen nichts.
export const ARTEN = Object.freeze(["karte-fertig", "karte-fast", "karte-nicht"]);
export const TEXTE = Object.freeze({
  de: { "karte-fertig": ["Deine Karte ist fertig", "Alle Punkte sind erfüllt. Tippe zum Ansehen."], "karte-fast": ["Deine Karte ist fast fertig", "Ein Punkt fehlt noch – abgebucht ist nichts."], "karte-nicht": ["Deine Karte hat nicht geklappt", "Abgebucht ist nichts. Tippe für die Gründe."] },
  en: { "karte-fertig": ["Your card is ready", "All points are done. Tap to see it."], "karte-fast": ["Your card is almost ready", "One point is still missing – nothing is charged."], "karte-nicht": ["Your card did not work out", "Nothing is charged. Tap to see why."] }
});
const ID = /^[A-Za-z0-9_-]{22}$/;

/** Inhalt einer Push-Nachricht -> { titel, text, url } | null */
export function mitteilung(data, lang, base) {
  if (!data || typeof data !== "object" || !ARTEN.includes(data.r) || !ID.test(String(data.a))) return null;
  const [titel, text] = TEXTE[String(lang || "").toLowerCase().startsWith("de") ? "de" : "en"][data.r];
  return { titel, text, url: new URL("?go=fertig&auftrag=" + data.a, base).href, tag: "mdi-" + data.a };
}

/** Bindet die beiden Ereignisse an einen Service-Worker-Scope (im Test ein Double). */
export function installiere(sw) {
  // die App liegt neben dem Service Worker: /duell/mdi-push-sw.js -> /duell
  const base = () => sw.registration.scope.replace(/\/$/, "");
  sw.addEventListener("push", (e) => {
    let data = null;
    try { data = e.data ? e.data.json() : null; } catch (x) { data = null; }
    const m = mitteilung(data, sw.navigator && sw.navigator.language, base());
    if (!m) return;
    e.waitUntil(sw.registration.showNotification(m.titel, { body: m.text, tag: m.tag, data: { url: m.url } }));
  });
  sw.addEventListener("notificationclick", (e) => {
    e.notification.close();
    const url = e.notification.data && typeof e.notification.data.url === "string" ? e.notification.data.url : null;
    if (!url || new URL(url).origin !== sw.location.origin) return;
    e.waitUntil(sw.clients.openWindow(url));
  });
}

/* global self */
if (typeof self !== "undefined" && typeof self.registration === "object" && typeof self.clients === "object") installiere(self);
