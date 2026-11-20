# Determinismus über Geräte für Lockstep in JavaScript

Frage aus `KONZEPT.md` §10: Lockstep und Geist verlangen auf allen Geräten bitgleiche Zustände. Welche JS-Operationen
sind sicher, welche nicht, und was ist Best Practice? Stand: 2026-11-11.

## Quellen

| # | Quelle | Kern für uns |
|---|---|---|
| D1 | Ecma International / TC39, ECMAScript Language Specification (Living Standard, abgerufen 2026-11-11). https://tc39.es/ecma262/ | `Math.sin` u. a. liefern einen „implementation-approximated Number value“ (§21.3.2.31); Implementierungen dürfen innerhalb der Grenzen frei wählen. fdlibm wird **empfohlen, nicht vorgeschrieben**. `Math.sqrt` ist exakt als „𝔽(Quadratwurzel von ℝ(n))“ definiert (§21.3.2.33); `Math.fround` exakt (binary32, roundTiesToEven); `Number::exponentiate` (`**`, `Math.pow`) ist approximiert. Grundrechenarten +, −, ×, ÷ sind IEEE-754-binary64 mit Rundung zur nächsten. |
| D2 | G. Fiedler, „Floating Point Determinism“, Gaffer On Games, 2013. https://gafferongames.com/post/floating_point_determinism/ | Gleitkomma-Determinismus über Maschinen nur unter engen Bedingungen; keine Patentlösung. (Bezug C/C++; für JS greifen die Grundrechenarten-Garantien aus D1, nicht aber die Bibliotheksfunktionen.) |
| D3 | G. Fiedler, „Deterministic Lockstep“, Gaffer On Games. https://gafferongames.com/post/deterministic_lockstep/ | Nur Eingaben übertragen; jede Abweichung im Zustand wächst; Prüfsummen zur Erkennung. |
| D4 | P. Bettner, M. Terrano, „1500 Archers on a 28.8: Network Programming in Age of Empires and Beyond“, Gamasutra/GDC 2001. https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond *(Inhalt zu Desync-Erkennung nicht nachgeprüft)* | Klassisches Lockstep: Befehle statt Zustand synchronisieren. |
| D5 | Mozilla Bug 531915 und WebKit Bug 80851 (Unterschiede trigonometrischer Ergebnisse je Plattform/Build); Chromium `third_party/fdlibm/README.chromium` (V8-Mathebibliothek aus fdlibm „für Konsistenz über OS-Plattformen“). https://chromium.googlesource.com/chromium/src/+/refs/tags/113.0.5672.6/third_party/fdlibm/README.chromium *(Sekundärdarstellung)* | Belegt reale Abweichungen in der letzten Stelle zwischen Engines/Builds; V8 ist intern konsistent, aber JavaScriptCore (iOS-WebView) und SpiderMonkey sind andere Implementierungen. |

## Befund

1. **Sicher (spezifiziert bitgleich):** `+ − * /` auf Number, Vergleiche, `Math.sqrt`, `Math.abs`, `Math.floor/ceil/
   round/trunc`, `Math.min/max`, `Math.fround`, `Math.imul`, Bitoperationen (int32), BigInt, `Array.prototype.sort` mit
   eigener total ordnender Vergleichsfunktion (Sortierung ist seit ES2019 stabil). Voraussetzung: gleiche
   Operationsreihenfolge – JS kennt keine FMA-Kontraktion und keine erweiterte Zwischengenauigkeit.
2. **Unsicher (approximiert):** `Math.sin/cos/tan/asin/acos/atan/atan2`, `sinh…`, `exp/expm1/log/log1p/log2/log10`,
   `pow` und `**`, `cbrt`, `hypot` (D1). Auf iOS läuft JavaScriptCore, auf Android/Chrome V8 → Abweichungen in der
   letzten Stelle sind möglich (D5) und wachsen im Lockstep (D3).
3. **Verboten im Spielcode:** `Math.random`, `Date`, `performance.now`, Iteration über Objekte mit numerisch aussehenden
   und Text-Schlüsseln gemischt ohne feste Reihenfolge (die Reihenfolge ist zwar spezifiziert, aber leicht
   missverständlich), `Intl`/`toLocaleString`, `Number.prototype.toFixed/toString` als Spielzustand, `Map`/`Set` mit
   Objektschlüsseln, deren Einfügereihenfolge von Netzereignissen abhängt.
4. Altcode: `apps/duell-web/src/arcade.js` (17 Aufrufe), `arcade2.js` (8), `game.js` (4) u. a. nutzen approximierte
   `Math`-Funktionen (Zählung per `grep`, 2026-11-11); teils nur für Effekte. Für Lockstep-fähige Bausätze müssen
   diese in die Spiellogik-Pfade durch SDK-Funktionen ersetzt werden.

## Best Practice (empfohlen)

1. **Spielzustand in Ganzzahlen/Festkomma.** Positionen und Geschwindigkeiten als ganze Zahlen in Untereinheiten
   (z. B. 1/256 Pixel) oder Q16.16 in int32 mit `Math.imul`; Ticks statt Sekunden. Gleitkomma nur in `view`
   (Anzeige), nie zurück in den Zustand.
2. **SDK-Mathe statt `Math`:** `sinT/cosT` aus einer im Build erzeugten Tabelle (z. B. 4096 Einträge, Festkomma),
   `atan2` per Tabelle/CORDIC, `isqrt` ganzzahlig, Potenzen per Multiplikation. Die Tabelle ist Teil des signierten
   SDK, damit alle Geräte dieselben Werte haben.
3. **Ein Zufall:** Seed-RNG im SDK (z. B. xoshiro128** oder PCG32 auf int32/BigInt), Zustand im Spielzustand, je
   Zweck abgeleitete Ströme.
4. **Statische Durchsetzung:** Die AST-Allowlist des Harness verbietet in `init/step/status/moves` den Zugriff auf
   `Math.*` außer der sicheren Liste aus Befund 1, sowie `Date`, `performance`, `Intl`, `globalThis`.
5. **Laufzeitprüfung:** Zustandshash (z. B. FNV-1a/xxHash über kanonisch serialisierten Zustand) alle N Ticks im
   Lockstep austauschen; bei Abweichung Partie anhalten und ehrlich melden, Seed + Eingabelog für die Analyse sichern.
6. **Testvektoren über Engines:** Der Harness spielt jede Karte mit festen Seeds/Eingaben in V8 (Node/Chromium) **und**
   JavaScriptCore (WebKit/Safari, z. B. Playwright WebKit) und vergleicht die Hashes. Erst gleiche Hashes = lockstep-fähig.

## Ableitung für das Konzept

1. Bestätigt: „keine plattformabhängigen Gleitkomma-Funktionen im SDK“ ist nötig; D1 belegt, dass es genau die
   approximierten `Math`-Funktionen sind, nicht Gleitkomma an sich.
2. **Präzisierung:** Die Regel heißt „Spielzustand ganzzahlig/Festkomma; nur spezifiziert exakte Operationen; SDK liefert
   Tabellen-Trigonometrie und Seed-RNG“. Das gilt für alle drei Stufen, auch S-Regeln (Bausteine `kinematics`, `aim`
   rechnen intern Festkomma).
3. **Ergänzung des Harness:** Cross-Engine-Hashprüfung (V8 + JavaScriptCore) als Pflichtschritt vor „live-fähig“.
4. **Ergänzung Lockstep:** periodischer Hash-Abgleich mit ehrlicher Fehlermeldung statt stiller Divergenz.
5. Altcode-Engines als Spezifikation verwenden, aber Physik beim Neubau auf Festkomma umstellen; Testvektoren aus dem
   Altcode gelten dann nur noch mit Toleranz, die neuen Vektoren sind bitgenau.
