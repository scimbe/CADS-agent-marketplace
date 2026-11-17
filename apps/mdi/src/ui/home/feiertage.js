// Bundesweite Feiertage fuer das Kalenderblatt (Kern). Auszug aus kalender.json (test/golden/gen-home.cjs); Feiertage je Land
// und Ferien stehen vollstaendig in kalender.js/kalender.json (Teil home-kalender). Test: gleich kalender.bundesweit().
import B from "./feiertage.json" with { type: "json" };

/** Name des bundesweiten Feiertags an Tag d ("YYYY-MM-DD") oder "". */
export function bundesweit(d, lang = "de") { const k = B.days[d]; if (!k) return ""; const n = B.names[k]; return (n && (n[lang] || n.de)) || ""; }
