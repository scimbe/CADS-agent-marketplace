// Freie Karte 2: laedt ein fertiges Spielmodul fuer "Probe spielen" vom Spiel-Ursprung und prueft es gegen den sha256 aus
// dem Server-Stand (checkSpielRef im Vertrag). Nur dieser eine Ursprung (SPIEL_ORIGIN, beim Build gesetzt und in der CSP der
// App freigegeben); ein anderer Ursprung, eine Abweichung im Hash oder ein zu grosses Modul starten nie ein Spiel.
// -> { how: "ok", code } | { how: "ursprung" | "hash" | "netz" | "nicht-hier" }. Keine Globals: Fenster (fetch) und crypto kommen herein.
// Ohne Cookies und ohne Referrer; der einzige fetch ausserhalb von api.js, live.js und parts.js (test/build.test.js).
/* global __SPIEL_ORIGIN__ */
import { LIMITS } from "../spiel/api.js";

/** Spiel-Ursprung aus dem Build (scripts/build.js, MDI_SPIEL_ORIGIN); ohne ihn gibt es keinen (kein stiller Rueckfall) */
export const SPIEL_ORIGIN = typeof __SPIEL_ORIGIN__ === "string" ? __SPIEL_ORIGIN__ : null;

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** @param {{win: {fetch: typeof fetch}, subtle: SubtleCrypto|null, origin?: string}} o */
export function createSpielModul(o) {
  const origin = o.origin || SPIEL_ORIGIN;
  if (!origin || !/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error("spiel-modul: kein Spiel-Ursprung (Build setzt __SPIEL_ORIGIN__)");
  return {
    async laden(modul, sha256) {
      if (!o.subtle || !o.win || typeof o.win.fetch !== "function") return { how: "nicht-hier" };
      let u;
      try { u = new URL(modul); } catch (e) { return { how: "ursprung" }; }
      if (u.origin !== origin || u.pathname !== "/m/" + sha256 + ".js") return { how: "ursprung" };
      let text;
      try {
        const r = await o.win.fetch(u.href, { mode: "cors", credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer" });
        if (!r.ok) return { how: "netz" };
        text = await r.text();
      } catch (e) { return { how: "netz" }; }
      if (new TextEncoder().encode(text).length > LIMITS.codeBytes) return { how: "hash" };
      const got = hex(await o.subtle.digest("SHA-256", new TextEncoder().encode(text)));
      return got === sha256 ? { how: "ok", code: text } : { how: "hash" };
    }
  };
}
