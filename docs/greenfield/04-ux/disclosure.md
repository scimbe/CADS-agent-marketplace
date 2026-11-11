# Benutzerführung: Progressive Disclosure

Regel: je Zustand **genau eine Hauptaktion, höchstens drei Nebenaktionen**. Einstiege hängen an Zuständen, nicht an Komponenten.

| Zustand | Hauptaktion | Sichtbar | Nicht sichtbar |
|---|---|---|---|
| Regal | Tageskarte öffnen | Tageskarte, „Erschaffe deine Karte“ (prominent), Alle Karten | Bubbles der Karten |
| Ansehen | Los | Karte, Modus Allein · Bot · Duell | Einstellungen |
| Spielen | (Spiel) | nur das Spiel, ✕ | alles andere |
| Anpassen | Weiter (unten) | Bubbles; Dialog wächst aus der Bubble | Tab-Leisten, Einschieben von unten |
| Erschaffen | Erschaffen | Prompt, Kategorie (Pflicht), Robot/Magie | Wunsch-Bubble neben Robot |
| Teilen | Link senden | Link/QR, Prüfbilder bei Live | — |
| Empfangen | Annehmen | Absender-Inhalt erst nach Ansicht | — |

Kontextsignale: erster Besuch, Link empfangen, Guthaben vorhanden, offline, App vs. Web.
