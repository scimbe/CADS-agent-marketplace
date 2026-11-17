// Freie Karte 2, P4: Push-Abo dieses Geraets fuer "Karte fertig". Nur auf ausdrueckliches Haekchen der Person:
//   1. Erlaubnis des Browsers (Notification.requestPermission) – ohne "granted" gibt es kein Abo
//   2. Service Worker mdi-push-sw.js (nur Push und Klick auf die Mitteilung, kein Offline-Cache; src/broker/push-sw.js)
//   3. Abo beim Push-Dienst mit dem VAPID-Schluessel des Servers (GET /api/duell/push/key)
//   4. Abo beim Server (POST /api/duell/push/subscribe) -> Marke; der Server weckt nur diese Marke (lib/duell-push.mjs notify)
// -> { how: "ok", mark } | { how: "verweigert" | "nicht-hier" | "fehler" }. Netz nur ueber api.raw (build.test).
// Der alte Service Worker (/duell/push-sw.js der alten Seite) bleibt unberuehrt: eigener Dateiname.
import { partUrl } from "./parts.js";

export const SW_FILE = "mdi-push-sw.js";
const fromB64u = (s) => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

/** @param {{win: Window, api: {raw: Function}}} o */
export function createPushAbo({ win, api }) {
  return {
    async abonnieren() {
      const nav = win.navigator;
      if (!win.Notification || !nav || !nav.serviceWorker || !win.PushManager || !/^https?:$/.test(win.location.protocol)) return { how: "nicht-hier" };
      let perm;
      try { perm = await win.Notification.requestPermission(); } catch (e) { return { how: "fehler" }; }
      if (perm !== "granted") return { how: "verweigert" };
      const key = await api.raw("GET", "/api/duell/push/key");
      if (key.status !== 200 || !key.body || key.body.on !== true || typeof key.body.key !== "string") return { how: "fehler" };
      try {
        const reg = await nav.serviceWorker.register(partUrl(win.location, SW_FILE), { scope: win.location.pathname });
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key.body.key) });
        const r = await api.raw("POST", "/api/duell/push/subscribe", { sub: sub.toJSON() });
        if (r.status !== 200 || !r.body || !/^[A-Za-z0-9_-]{22}$/.test(String(r.body.mark))) return { how: "fehler" };
        return { how: "ok", mark: r.body.mark };
      } catch (e) { return { how: "fehler" }; }
    }
  };
}
