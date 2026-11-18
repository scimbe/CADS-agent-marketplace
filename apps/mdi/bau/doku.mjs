// Freie Karte 2, P3: gecachter Praefix (API-Doku kompakt + Regeln + Vorlagen) und die Rollen-Anweisungen des Bau-Workers.
// Der Praefix ist fuer alle Rollen byte-gleich (ein Cache-Eintrag je Modell). Er wird aus den Quellen erzeugt, damit
// Doku und API nicht auseinanderlaufen: Kopfkommentar von src/spiel/api.js, Grenzen aus LIMITS, Policy aus policy.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, SOUNDS, COLORS, CONTROLS } from "../src/spiel/api.js";
import { MATH_OK } from "../scripts/harness.js";
import { ARTEN, RICHTUNGEN, SZ } from "../src/spiel/szenario.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Vorlagen im Praefix: Schiessen, Raster, Springen und ein Rundenspiel mit Cursor (Verbesserung 2 der P3-Messung). */
export const VORLAGEN = Object.freeze(["invaders", "snake", "plattformer", "memory"]);

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

## Bot-Regeln fuer Runden- und Brettspiele (Memory, Wuerfeln, Karten, Schaetzen, Raten; Vorlage memory.js)

Die Bots druecken zufaellig oder planen 45 Frames voraus; sie warten nicht auf das Ende einer langen Partie. Darum:
- Zwischenpunkte je Zug: jeder Zug, der etwas bewirkt, gibt sofort Punkte (g.addScore), nicht erst am Ende.
- Zuglimit oder Zielpunktzahl: nach hoechstens 30 Zuegen bzw. bei Erreichen des Ziels endet die Partie (g.win() oder
  g.gameOver()), so dass Zufallszuege in 60 s ans Ende kommen.
- Cursor auf dem Brett: Richtung wirkt sofort beim Druecken und wiederholt sich beim Halten (alle 10–15 Frames); waehlen
  mit firePressed. Kein Warten auf ein Loslassen, das nie kommt.
- Computer-Gegner zieht von selbst nach einer kurzen Pause (Frame-Zaehler in s), nie erst auf eine Eingabe.
- Abwechselnd am selben Geraet (Zug fuer Zug) ist ein Zug-Zaehler in s; die Anzeige sagt, wer dran ist.

## Szenario-Bots (Abnahme je Haekchen-Punkt)

Jeder Punkt des Auftrags, der sich beim Ausprobieren beobachten laesst, wird nach dem Bau mit einem Szenario gespielt:
eine feste Folge von Eingaben (halte bis zu zwei von ${CONTROLS.join(", ")} fuer n Frames, insgesamt hoechstens
${SZ.frames} Frames, hoechstens ${SZ.schritte} Schritte) und genau eine Erwartung aus dieser Liste:
${ARTEN.join(", ")}. figur_bewegt braucht emoji und richtung (${Object.keys(RICHTUNGEN).join(", ")}), figur_sichtbar und
mehr_figuren ein emoji, text_sichtbar einen Text. Figuren erkennt der Bot nur als Emoji (d.emoji): die Spielfigur der Person
und alles, was ein Punkt nennt, als Emoji zeichnen, genau das Emoji aus dem Plan.
Szenarien mit Reserve (sonst meldet der Bot "fehlt", obwohl das Spiel es kann):
- jede Taste mindestens 10 Frames halten, danach eine Pause, die sicher reicht (Animation, Computerzug, Aufdecken);
- text_sichtbar nur mit dem festen Teil des Textes, der sicher erscheint (z. B. "Züge:" statt "Züge: 1 / 24"), keine Zahlen,
  die vom Spielverlauf abhaengen;
- Spielende, Leben, Level: lieber die doppelte Zeit, die man selbst schaetzt.
Ein Szenario, das nicht besteht, spielt der Bot ein zweites Mal mit doppelter Dauer, bevor der Punkt fehlt.

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

/** Rollen des Bau-Workers (Bauauftrag aus dem Klaerungsdialog P1: die Punkte sind Bauauftrag und Abnahmemassstab). */
export const ROLLEN = {
  planer: `Rolle: PLANER. Du bekommst einen bestaetigten Bauauftrag: den Satz der Person, ihre Antworten und die Liste
"So bauen wir es" mit Punkten (id, text, pruefung). Die Liste ist fest: du erfindest keine Punkte und laesst keine weg.
1. Fuer jeden Punkt (gleiche id): machbar mit dieser API (true/false). Was die Plattform nicht kann (siehe Grenzen), ist nicht
   machbar; ein Ersatz (Emoji statt Foto) ist nicht dasselbe. Ist ein Punkt nicht machbar: "kunde" = ein kurzer, ehrlicher Satz
   fuer die Person in einfachen Worten (kein Code, keine Fachwoerter, keine Zahlen aus dem Programm), sonst "".
2. Szenario je Punkt: Laesst sich "pruefung" beim Ausprobieren beobachten, beschreibe es als Szenario (siehe Szenario-Bots):
   pruefbar=true, schritte, art und nur die Felder, die die art braucht (die anderen "" lassen). Sonst pruefbar=false, schritte [],
   art "keins". Nimm Zahlen, die sicher reichen (z. B. 60 Frames halten fuer eine Bewegung, 600 Frames fuer "es wird schwerer").
3. typ: "echtzeit" (Arcade) oder "runden" (Runden-/Brettspiel, dann gelten die Bot-Regeln fuer Rundenspiele, Vorlage memory.js).
4. spielplan fuer den Bauer mit festen Zahlen und Bedingungen: Figuren als Emojis (genau die aus den Szenarien), controls,
   lives, Groessen, Startpositionen, Regeln je Frame, Punkte, was ein Leben kostet und ob ein Zusammenstoss sofort beendet,
   Level, Sieg bei X, Spielende. Der Plan muss die Bot-Abnahme bestehen.
5. Entscheidung: "bauen", wenn der Kern ein Spiel ist, das mit der API geht. "absagen" nur, wenn es kein Spiel ist
   (absage "kein_spiel") oder die Content-Policy den Kern verbietet (absage "policy"); sonst absage "".
Antworte nur mit dem JSON nach Schema.`,
  bauer: `Rolle: BAUER. Schreibe das Spielmodul nach Plan und Auftrag gegen die Spiel-API oben.
Halte dich an alle Regeln (statisch, Bots, Bot-Regeln fuer Rundenspiele, Policy). Setze jeden machbaren Punkt sichtbar um.
Die Szenarien werden nach dem Bau gespielt: sie muessen bestehen. Schreibe kompakt (keine langen Kommentare).
Antworte mit genau einem \`\`\`js-Block mit der vollstaendigen Datei, ohne weiteren Text.`,
  abnahme: `Rolle: ABNAHME. Du pruefst ein fertiges Spiel gegen die Punkte des Auftrags. Belege: der Code, der Bericht der Bots,
die Ergebnisse der Szenario-Bots (gespielt) und Bildschirmfotos aus dem echten Spiel.
Fuer jeden Punkt: "erfuellt" nur, wenn das Spiel es wirklich tut UND es fuer die Person sichtbar/spuerbar ist; sonst "fehlt".
Ein nicht bestandenes Szenario ist "fehlt". Kein Wohlwollen: ein Ersatz (Emoji statt Foto, anderes Spielprinzip) ist "fehlt".
"beleg": intern fuer das Team (Code-Stelle, Bot-Wert, Foto).
"kunde": wenn fehlt, EIN Satz fuer die Person in einfachen Worten, was im Spiel anders ist (keine Code-Zeilen, keine
Funktionsnamen, keine Werte aus dem Bot-Bericht, keine Fachwoerter); wenn erfuellt "".
"nachbessern": wenn ein Punkt fehlt, der mit der API machbar waere, eine knappe, konkrete Anweisung an den Bauer; sonst "".
Antworte nur mit dem JSON nach Schema.`
};

/** Szenario im Schema des Modells: flach, ohne Vereinigungstypen (strukturierte Ausgabe); bau/abnahme.mjs macht daraus mdi-szenario/1. */
const SZENARIO_FLACH = {
  type: "object", additionalProperties: false, required: ["pruefbar", "schritte", "art", "emoji", "richtung", "text"],
  properties: {
    pruefbar: { type: "boolean" },
    schritte: { type: "array", items: { type: "object", additionalProperties: false, required: ["halte", "frames"], properties: { halte: { type: "array", items: { type: "string", enum: [...CONTROLS] } }, frames: { type: "integer" } } } },
    art: { type: "string", enum: [...ARTEN, "keins"] },
    emoji: { type: "string" }, richtung: { type: "string", enum: ["", ...Object.keys(RICHTUNGEN)] }, text: { type: "string" }
  }
};
export const SCHEMA_PLAN = {
  type: "object", additionalProperties: false,
  required: ["entscheidung", "absage", "typ", "spielplan", "punkte"],
  properties: {
    entscheidung: { type: "string", enum: ["bauen", "absagen"] },
    absage: { type: "string", enum: ["", "kein_spiel", "policy"] },
    typ: { type: "string", enum: ["echtzeit", "runden"] },
    spielplan: { type: "string" },
    punkte: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "machbar", "kunde", "szenario"], properties: { id: { type: "string" }, machbar: { type: "boolean" }, kunde: { type: "string" }, szenario: SZENARIO_FLACH } } }
  }
};
export const SCHEMA_ABNAHME = {
  type: "object", additionalProperties: false,
  required: ["punkte", "nachbessern"],
  properties: {
    punkte: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "urteil", "beleg", "kunde"], properties: { id: { type: "string" }, urteil: { type: "string", enum: ["erfuellt", "fehlt"] }, beleg: { type: "string" }, kunde: { type: "string" } } } },
    nachbessern: { type: "string" }
  }
};
