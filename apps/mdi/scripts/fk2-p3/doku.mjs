// Freie Karte 2, P3: gecachter Praefix (API-Doku kompakt + Regeln + Vorlagen) und die Rollen-Anweisungen.
// Der Praefix ist fuer alle Rollen byte-gleich (ein Cache-Eintrag je Modell). Er wird aus den Quellen erzeugt, damit
// Doku und API nicht auseinanderlaufen: Kopfkommentar von src/spiel/api.js, Grenzen aus LIMITS, Policy aus policy.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, SOUNDS, COLORS, CONTROLS } from "../../src/spiel/api.js";
import { MATH_OK } from "../harness.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Vorlagen im Praefix (bewusst nur drei: Schiessen, Raster, Springen; die anderen Referenzspiele bleiben draussen). */
export const VORLAGEN = Object.freeze(["invaders", "snake", "plattformer"]);

function apiKopf() {
  const src = fs.readFileSync(path.join(ROOT, "src/spiel/api.js"), "utf8").split("\n");
  const a = src.findIndex((l) => l.includes("So sieht ein Spielmodul aus")), b = src.findIndex((l) => l.includes("Fehler bei falscher Nutzung"));
  return src.slice(a, b + 1).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
}

export function praefix() {
  const vorlagen = VORLAGEN.map((n) => "### Vorlage " + n + ".js\n```js\n" + fs.readFileSync(path.join(ROOT, "src/spiel/beispiele", n + ".js"), "utf8").trim() + "\n```").join("\n\n");
  return `# Spiel-API mdi-spiel/1 (Freie Karte 2 von My Daily Idea)

Kundinnen und Kunden beschreiben ein Spiel in einem Satz. Daraus entsteht genau eine JavaScript-Datei gegen diese API.
Das Spiel laeuft im Handy-Browser in einer Sandbox (eigener Ursprung, kein Netz, Code im Worker) und wird vor der
Auslieferung von Bots automatisch gespielt und geprueft.

## API (aus src/spiel/api.js)

${apiKopf()}

## Feste Grenzen der Plattform (was es NICHT gibt)

- Eingabe nur ${CONTROLS.join(", ")} (gehalten) und firePressed. Keine Tipp-Koordinaten, keine Texteingabe, keine Maus-Position.
  Auswahl auf einem Brett: Cursor mit Richtungen bewegen, mit fire waehlen.
- Ein Geraet, eine Person am Steuer. Zwei Menschen gleichzeitig geht nicht; abwechselnd am selben Geraet (Zug fuer Zug) geht.
  Ein Computer-Gegner geht. Kein Online-Mehrspieler, kein Teilen von Spielstaenden.
- Keine Bilder, Fotos oder Dateien (auch keine eigenen Fotos), keine Schriften, kein Netz. Grafik nur: Formen in den Farben
  ${Object.keys(COLORS).join(", ")} und Emojis (beliebige Emojis als Figuren).
- Toene nur: ${SOUNDS.join(", ")}. Keine Musik, keine Sprache.
- Spielfeld fest ${360} x ${640}, hochkant. Oben ${48} px Anzeigeleiste (Punkte, Leben, Level malt die Laufzeit).
- Code hoechstens ${LIMITS.codeBytes} Bytes, Zustand hoechstens ${LIMITS.stateBytes} Bytes, hoechstens ${LIMITS.ops} Zeichenbefehle je Frame, Texte bis ${LIMITS.textLen} Zeichen.

## Regeln fuer den Code (statische Pruefung, harte Fehler)

- Genau eine Datei mit \`export default { title, controls, lives, init, update, draw }\` und sonst nichts exportiert. Keine Importe.
- Hilfsfunktionen und Konstanten auf Modulebene sind erlaubt (siehe Vorlagen). Variablen auf Modulebene NIE veraendern:
  alles Veraenderliche steckt in s (Neustart und Bots verlassen sich darauf).
- Erlaubt aus Math nur: ${[...MATH_OK].join(", ")}. Verboten: Math.sin/cos/tan/atan2/pow/hypot/random/log/exp und der Operator **.
  Winkel: g.sin(grad), g.cos(grad). Zufall: g.random(), g.randInt(a, b). Abstand: g.dist(a, b) oder Math.sqrt(dx * dx + dy * dy).
- Verboten: Date, performance, setTimeout, setInterval, requestAnimationFrame, window, document, self, globalThis, fetch,
  eval, Function, class, prototype, constructor, Proxy, Reflect, Map, Set im Zustand. Zeit zaehlt man in Frames.
- Zustand s nur aus Daten: Zahlen (endlich, kein NaN), Texte, true/false, null, Listen, einfache Objekte. Keine Funktionen,
  kein Objekt zweimal einhaengen (beim Kopieren { x: a.x, y: a.y } schreiben, nicht dasselbe Objekt in zwei Listen).
- update aendert s direkt und gibt nichts zurueck. draw aendert nichts. g.addScore/g.loseLife/g.sound nur in init/update.
- d.text: nur Text oder Zahl, size 10..64. d.emoji: groesse 8..160. Farben nur die vier Namen oben.
- Listen begrenzen: Schuesse/Partikel ausserhalb des Felds entfernen.

## Abnahme durch Bots (muss bestehen, sonst Reparatur)

Drei Bots spielen je 60 s (3600 Frames): Nichtstun, Zufall, Vorausplanung. Geprueft wird:
- keine Ausnahme; Frames laufen weiter; Neustart ergibt genau den Startzustand der neuen Runde;
- jede Steuerung in controls veraendert den Zustand innerhalb von 45 Frames (sonst aus controls entfernen);
- beim Spielen entstehen Punkte (g.addScore) und nicht weniger als beim Nichtstun;
- das Spielende ist erreichbar: mindestens ein Bot verliert alle Leben oder gewinnt in 60 s
  (also: Gefahr, die Leben kostet, oder ein Zeit-/Zuglimit, das g.gameOver()/g.win() ausloest);
- gleicher Seed + gleiche Eingaben = gleicher Zustand (nur g.random als Zufall);
- p95 je Frame <= 4 ms, kein Netzversuch.

## Content-Policy (Server-Pruefung, harter Fehler)

- Schiessen ohne Gewalt ist erlaubt: Wasserbomben, Schneebaelle, Farbkleckse, Lichtstrahlen auf Felsen, Boote, Ziegel, Ballons.
- Verboten: Waffen-, Blut-, Todes-Emojis (Pistole, Messer, Schwert, Bombe, Blut, Totenkopf, Sarg), Menschen-Emojis
  (keine Menschen im Spiel, auch nicht als Ziel; Tiere, Roboter, Dinge sind ok), Woerter wie toeten, Blut, Waffe, Mord, sterben.
- Marken und geschuetzte Figuren: Namen wie Pac-Man, Tetris, Lego, Flappy Bird, Space Invaders, Mario nicht im Titel und nicht
  im Spiel. Die Spielidee (Mechanik) ist frei; Figuren werden eigene (Emojis). Das wird der Person ehrlich gesagt.

## Ehrlichkeit

Nichts versprechen, was das Spiel nicht tut. Was nicht geht oder ersetzt wurde, wird der Person als "fehlt" bzw. Hinweis gezeigt.
Kein stilles Ausweichen auf ein anderes Spiel.

## Vorlagen (bestehen alle Pruefungen)

${vorlagen}
`;
}

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
