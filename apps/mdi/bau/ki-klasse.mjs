// Freie Karte 2, P3: Klasse eines Fehlers der Modell-API im Bau-Worker – dieselben Klassen wie der Wrapper (CADS-DEMO-wrapper
// lib/ki-ausfall.mjs: ki-limit, ki-key, ki-ueberlastet, ki-ausfall). Ein Bau, der daran scheitert, endet ehrlich mit dem Grund
// "ki_nicht_verfuegbar" (nichts abgebucht, die Vormerkung geht zurueck), und der Worker holt eine Weile keine Auftraege.
// Rein: nur der Fehler rein, die Klasse raus ('' = keine KI-Stoerung, z. B. ein Programmfehler).
export const KLASSEN = Object.freeze(["ki-limit", "ki-key", "ki-ueberlastet", "ki-ausfall"]);
/** Pause des Workers nach einer Stoerung (ms): Limit und Schluessel loesen sich nicht in Sekunden */
export const PAUSE_MS = Object.freeze({ "ki-limit": 15 * 60000, "ki-key": 15 * 60000, "ki-ueberlastet": 2 * 60000, "ki-ausfall": 2 * 60000 });
const LIMIT_RE = /usage limits?|spend(ing)? limits?|credit balance|billing|insufficient[ _-]?(credit|funds|quota|balance)|quota exceeded|exceeded your current quota/i;

export function kiKlasse(e) {
  if (!e || typeof e !== "object") return "";
  const status = Number(e.status) || 0;
  const typ = String((e.error && e.error.error && e.error.error.type) || (e.error && e.error.type) || ""), text = String(e.message || "");
  if (status) {
    if (status === 402 || typ === "billing_error" || (status < 500 && LIMIT_RE.test(text))) return "ki-limit";
    if (status === 401 || status === 403 || typ === "authentication_error" || typ === "permission_error") return "ki-key";
    if (status === 429 || status === 529 || typ === "rate_limit_error" || typ === "overloaded_error") return "ki-ueberlastet";
    if (status >= 500) return "ki-ausfall";
    return "";
  }
  // Verbindung (SDK: APIConnectionError, auch der abgelehnte Tunnel des Egress-Proxys)
  return e.name === "APIConnectionError" || e.name === "APIConnectionTimeoutError" || /^proxy-/.test(String(e.code || "")) ? "ki-ausfall" : "";
}
