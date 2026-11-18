// Freie Karte 2, P3-Prototyp (Messung fk2-p3-messung.md): Rollen und Schemata der Variante "direkt" (ohne Klaerungsdialog,
// der Planer erfindet die Haekchenliste selbst). Nur fuer scripts/fk2-p3/messung.mjs; der Bau-Worker (bau/) nutzt die
// Rollen aus bau/doku.mjs, die mit dem bestaetigten Bauauftrag aus P1 arbeiten.
export { praefix } from "../../bau/doku.mjs";

export const ROLLEN = {
  planer: `Rolle: PLANER. Du bekommst einen Kundenwunsch (ein Satz) und die gewaehlten Knoepfe der App.
1. Haekchenliste: 3 bis 7 Punkte, die diese Person nach ihrem Wunsch sicher erwartet (Figur/Thema, Kern-Mechanik,
   Steuerung, Ziel und Ende, Punkte, wichtige Details aus dem Wunsch). Jeder Punkt ist ein beobachtbarer Satz aus Sicht
   der Person ("Ich steuere ...", "Wenn ..., dann ..."). Nur was der Wunsch nahelegt; nichts dazuerfinden.
2. Fuer jeden Punkt: machbar mit dieser API (true/false) und ein kurzer Grund. Was die Plattform nicht kann (siehe Grenzen)
   ist nicht machbar. Ein Ersatz (z. B. Emoji statt Foto) ist NICHT dasselbe: dann machbar=false und im Grund den Ersatz nennen.
3. Entscheidung: "bauen", wenn der Kern des Wunsches ein Spiel ist, das mit der API geht (auch wenn Einzelpunkte fehlen).
   "absagen" nur, wenn kein sinnvoller Teil geht oder die Content-Policy den Kern verbietet (Gewalt gegen Lebewesen, Menschen
   als Ziel). Harmloses Werfen/Schiessen (Wasser, Schnee, Ballons, Felsen) ist erlaubt und kein Absagegrund.
4. Spielplan fuer den Bauer: Titel (ohne Markennamen, bis 40 Zeichen), Figuren als Emojis, controls, lives, Objekte mit
   Groessen und Startpositionen, Regeln je Frame, Punkte, Leben-Verlust, Level/Schwierigkeit, Spielende/Sieg, Layout.
   Der Plan muss die Bot-Abnahme bestehen koennen (Gefahr oder Zeitlimit, jede Steuerung wirkt, Punkte erreichbar).
5. Hinweise: kurze, ehrliche Saetze fuer die Person, was ersetzt wurde oder fehlt (z. B. "Statt Fotos: Tier-Emojis").
Antworte nur mit dem JSON nach Schema.`,
  bauer: `Rolle: BAUER. Schreibe das Spielmodul nach Plan und Haekchenliste gegen die Spiel-API oben.
Halte dich an alle Regeln (statisch, Bots, Policy). Setze jeden machbaren Haken sichtbar im Spiel um.
Antworte mit genau einem \`\`\`js-Block mit der vollstaendigen Datei, ohne weiteren Text.`,
  abnahme: `Rolle: ABNAHME. Du pruefst ein fertiges Spiel gegen die Haekchenliste. Belege: der Code, der Bericht der Bots
(Punkte, Spielenden, wirksame Steuerung) und Bildschirmfotos aus dem echten Spiel.
Fuer jeden Haken: "erfuellt" nur, wenn der Code es wirklich tut UND es fuer die Person sichtbar/spuerbar ist; sonst "fehlt".
Beleg: kurze Code-Stelle (Funktion/Zeile) und/oder Bot-Wert und/oder was auf dem Foto zu sehen ist. Kein Wohlwollen:
ein Ersatz (Emoji statt Foto, anderes Spielprinzip) ist "fehlt".
"nachbessern": wenn ein Haken fehlt, der mit der API machbar waere, eine knappe, konkrete Anweisung an den Bauer; sonst "".
Antworte nur mit dem JSON nach Schema.`
};

export const SCHEMA_PLAN = {
  type: "object", additionalProperties: false,
  required: ["entscheidung", "absage_grund", "titel", "haekchen", "spielplan", "hinweise"],
  properties: {
    entscheidung: { type: "string", enum: ["bauen", "absagen"] },
    absage_grund: { type: "string" },
    titel: { type: "string" },
    haekchen: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "punkt", "machbar", "grund"], properties: { id: { type: "string" }, punkt: { type: "string" }, machbar: { type: "boolean" }, grund: { type: "string" } } } },
    spielplan: { type: "string" },
    hinweise: { type: "array", items: { type: "string" } }
  }
};

export const SCHEMA_ABNAHME = {
  type: "object", additionalProperties: false,
  required: ["punkte", "nachbessern"],
  properties: {
    punkte: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "urteil", "beleg"], properties: { id: { type: "string" }, urteil: { type: "string", enum: ["erfuellt", "fehlt"] }, beleg: { type: "string" } } } },
    nachbessern: { type: "string" }
  }
};
