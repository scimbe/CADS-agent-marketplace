// Freie Karte 2, P3: Konfiguration des Bau-Workers aus der Umgebung. Unbekannte Modelle oder fehlende Pflichtwerte sind ein
// Startfehler (kein stilles Ausweichen auf einen Standard, der nicht gemeint war).
//
// Kostenbremse (Konstanten, bewusst nicht per Umgebung hochzudrehen):
//   KOSTEN.jeAuftragUsd  0,25 $  Reserve-basiert: jeder Aufruf reserviert vorher den schlimmsten Fall (Eingabe als Cache-Write
//                                + max_tokens Ausgabe). Ein Bau mit Rollen A reserviert hoechstens ~0,02 $ je Bauer-Aufruf (32k
//                                Ausgabe-Tokens Haiku), dazu Planer und Abnahme: 4 Bau-Runden + 2 Planer + Abnahme < 0,12 $.
//                                Gemessen kostet eine Karte im Mittel 0,0097 $ (fk2-p3-messung.md, Variante A). Die Grenze
//                                gilt je Lauf (erster Bau und jede Nachbesserung einzeln).
//   KOSTEN.jeTagUsd      5 $     ueber alle Auftraege eines UTC-Tages: ~500 Karten im Mittel, mindestens ~40 im schlimmsten
//                                Fall. Darueber holt der Worker keine Auftraege mehr (sie warten bis zum naechsten Tag).
// Umgebung:
//   MDI_BAU_QUEUE_URL        Basis des Wrappers im internen Netz, z. B. http://demos-wrapper:8790 (Pflicht)
//   MDI_BAU_TOKEN_FILE       Datei mit dem Token der internen Warteschlange (Pflicht, read-only gemountet)
//   MDI_ANTHROPIC_KEY_FILE   Datei mit dem API-Key (Pflicht ausser mit MDI_BAU_MODELL_DOUBLE=1)
//   MDI_BAU_STATE_DIR        Kostenbuch je Tag (Standard /var/lib/mdi-bau)
//   MDI_BAU_MODELL_PLANER | _BAUER | _ABNAHME   Modell je Rolle (Standard claude-haiku-5-5, Rollenverteilung A)
//   MDI_BAU_AUFWAND_PLANER | _BAUER | _ABNAHME  low | medium | high (Standard medium)
//   MDI_BAU_POLL_MS          Abstand der Abfragen bei leerer Warteschlange (Standard 5000)
//   MDI_BAU_MODELL_DOUBLE    1 = Modell-Double statt API (nur Staging/Tests: baut immer die Vorlage invaders)
import { PRICES } from "./llm.mjs";

export const KOSTEN = Object.freeze({ jeAuftragUsd: 0.25, jeTagUsd: 5 });
export const ROLLEN_STANDARD = Object.freeze({ planer: "claude-haiku-5-5", bauer: "claude-haiku-5-5", abnahme: "claude-haiku-5-5" });
const AUFWAND = ["low", "medium", "high"];

/** @returns {{queueUrl:string, tokenFile:string, keyFile:string, stateDir:string, rollen:object, effort:object, pollMs:number, double:boolean}} */
export function konfig(env = process.env) {
  const fehler = [];
  const rollen = {}, effort = {};
  for (const r of ["planer", "bauer", "abnahme"]) {
    const m = env["MDI_BAU_MODELL_" + r.toUpperCase()] || ROLLEN_STANDARD[r];
    if (!PRICES[m]) fehler.push("MDI_BAU_MODELL_" + r.toUpperCase() + ": unbekanntes Modell " + m + " (bekannt: " + Object.keys(PRICES).join(", ") + ")");
    rollen[r] = m;
    const e = env["MDI_BAU_AUFWAND_" + r.toUpperCase()] || "medium";
    if (!AUFWAND.includes(e)) fehler.push("MDI_BAU_AUFWAND_" + r.toUpperCase() + ": " + e + " (erlaubt: " + AUFWAND.join(", ") + ")");
    effort[r] = e;
  }
  const double = env.MDI_BAU_MODELL_DOUBLE === "1";
  const c = {
    queueUrl: String(env.MDI_BAU_QUEUE_URL || "").replace(/\/+$/, ""), tokenFile: env.MDI_BAU_TOKEN_FILE || "", keyFile: env.MDI_ANTHROPIC_KEY_FILE || "",
    stateDir: env.MDI_BAU_STATE_DIR || "/var/lib/mdi-bau", rollen, effort, pollMs: Number(env.MDI_BAU_POLL_MS || 5000), double
  };
  if (!/^https?:\/\/[^/]+$/.test(c.queueUrl)) fehler.push("MDI_BAU_QUEUE_URL fehlt oder ist keine Basis-URL");
  if (!c.tokenFile) fehler.push("MDI_BAU_TOKEN_FILE fehlt");
  if (!double && !c.keyFile) fehler.push("MDI_ANTHROPIC_KEY_FILE fehlt");
  if (!Number.isInteger(c.pollMs) || c.pollMs < 500) fehler.push("MDI_BAU_POLL_MS mindestens 500");
  if (fehler.length) throw new Error("Bau-Worker: Konfiguration ungueltig:\n- " + fehler.join("\n- "));
  return c;
}
