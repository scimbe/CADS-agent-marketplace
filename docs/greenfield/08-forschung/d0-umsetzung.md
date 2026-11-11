# D0: Forschung zu Punkten, die 08-forschung noch nicht abdeckt

Stand: 2026-11-11. Anlass: Slice D0 (`07-protokoll/2026-11-11-d0.md`). Quellen ohne Abruf in dieser Sitzung sind als
*(nicht nachgeprüft)* markiert; die Angaben stammen aus dem Gedächtnis des Agenten und sind vor einem Zitat zu prüfen.

## 1. Commit-Reveal für verdeckte Information ohne Server

| # | Quelle | Kern |
|---|---|---|
| C1 | M. Blum, „Coin Flipping by Telephone: A Protocol for Solving Impossible Problems“, SIGACT News 15(1):23–27, 1983 (zuerst CRYPTO 1981). *(nicht nachgeprüft)* | Zwei Parteien ohne Vertrauen erzeugen gemeinsamen Zufall: A legt sich per Commitment fest, B antwortet, A deckt auf. Keiner kann das Ergebnis allein steuern. |
| C2 | NIST FIPS 180-4, Secure Hash Standard, 2015. https://csrc.nist.gov/pubs/fips/180-4/upd1/final *(nicht nachgeprüft)* | SHA-256; Urbild- und Kollisionsresistenz sind die Grundlage für „bindend“ und „verbergend“ eines Hash-Commitments mit 128-Bit-Salz. |
| C3 | C. Crépeau, „A zero-knowledge poker protocol that achieves confidentiality of the players' strategy“, CRYPTO 1986. *(nicht nachgeprüft)* | Mental Poker (Altcode `mpoker`) für gemischte Decks; für D0 nicht nötig, weil nur ein Sitz ein Geheimnis hat. |

**Befund:** Ein reines Hash-Commitment `H(salt)` verbirgt die Hand und bindet den Boten (Aufdeckung wird von allen
nachgerechnet). Fairness gegen „Auswürfeln“ der eigenen Hand verlangt zusätzlich einen Beitrag der Gegenseite, der
erst *nach* dem Commitment bekannt wird (C1).

**Umsetzung D0:** Hand = `deal(rng(SHA-256(salt | seed)))`.
- Bot und Live: drei Nachrichten `hello{H(seedA), Commitments}` → `join{Nonce, Commitments}` → `start{seedA}`,
  `seed = H(seedA | Nonce)`. Niemand kennt den endgültigen Seed, bevor er sich festgelegt hat → kein Auswürfeln.
- Link (asynchron): `seed` legt der Einladende fest; der Bote könnte durch wiederholtes Neuanlegen eine gute Hand
  suchen. Ein zusätzlicher Link-Hin-und-Rückweg (oder der Server-Geber aus KONZEPT §3.1) schließt das. **Offen**,
  siehe Protokoll.

## 2. Modaler Dialog, der aus der Blase wächst

| # | Quelle | Kern |
|---|---|---|
| M1 | W3C WAI, ARIA Authoring Practices Guide, „Dialog (Modal) Pattern“. https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ *(nicht nachgeprüft)* | `role=dialog`, `aria-modal=true`, `aria-labelledby`; Fokus beim Öffnen hinein, Tab bleibt im Dialog, Escape schließt, Fokus zurück zum auslösenden Element. |
| M2 | P. Lewis, „FLIP Your Animations“, 2015. https://aerotwist.com/blog/flip-your-animations/ *(nicht nachgeprüft)* | First/Last/Invert/Play: Endlage rendern, Differenz als Transform umkehren, zu `none` animieren – nur `transform`/`opacity`, daher flüssig. |
| M3 | W3C, Media Queries Level 5, `prefers-reduced-motion`. https://www.w3.org/TR/mediaqueries-5/ *(nicht nachgeprüft)* | Nutzerwunsch nach weniger Bewegung; Ersatz durch Blende ist üblich. |
| M4 | W3C, WCAG 2.2, SC 2.5.8 Target Size (Minimum) (24 × 24 CSS-px, AA) und SC 2.5.5 (44 × 44, AAA). https://www.w3.org/TR/WCAG22/ *(nicht nachgeprüft)* | Mindestgröße der Treffer; Persona P7 (Zittern) spricht für AAA-Größe. |

**Umsetzung D0:** Dialog nach M1 (E2E prüft Fokusfalle, Escape, Rückgabe), Wachsen/Schrumpfen nach M2 mit Web
Animations API, bei `reduce` nur Blende (E2E prüft Keyframes). Treffer 60 px mit 16 px Abstand in Spielentscheidungen
(über M4 AAA), sonst ≥ 44 px.

## 3. Strikte CSP für eine Offline-HTML-Datei

| # | Quelle | Kern |
|---|---|---|
| P1 | W3C, Content Security Policy Level 3, „hash-source“. https://www.w3.org/TR/CSP3/ *(nicht nachgeprüft)* | Inline-Skript/-Stil lassen sich per `'sha256-…'` statt `'unsafe-inline'` erlauben; Änderungen über CSSOM (`el.style.setProperty`) fallen nicht unter `style-src`, Stil-Attribute im Markup schon. |
| P2 | L. Weichselbaum, M. Spagnuolo, S. Lekies, A. Janc, „CSP Is Dead, Long Live CSP!“, ACM CCS 2016. *(nicht nachgeprüft)* | Allowlist-CSPs sind meist umgehbar; Nonce-/Hash-basierte „strict CSP“ ist die wirksame Form. |
| P3 | Ajv, „Standalone validation code“. https://ajv.js.org/standalone.html (bereits in `schema-grenzen.md`) | Validatoren ohne `new Function` zur Laufzeit. |

**Umsetzung D0:** `script-src 'sha256-…' 'self' <Webkonferenz> 'wasm-unsafe-eval'`, `style-src 'sha256-…'`; keine
Inline-Attribute; Stil nur über CSSOM. `build.test.js` prüft Hashes und das Fehlen von `unsafe-inline/unsafe-eval`.
Geklonte Elemente (FLIP-Geist) verlieren ihr `style`-Attribut vor dem Einfügen.

## 4. Statechart: Übergangsdomäne bei parallelen Regionen

| # | Quelle | Kern |
|---|---|---|
| S1 | W3C, SCXML, Appendix D „Algorithm for SCXML Interpretation“ (getTransitionDomain, findLCCA), 2015. https://www.w3.org/TR/scxml/ | Externe Transition verlässt alle aktiven Nachfahren des kleinsten gemeinsamen compound-Vorfahren; liegt der auf der Wurzel, werden auch Nachbarregionen verlassen und neu betreten. |
| S2 | Stately, XState v5 Docs, „Re-entering“ (`reenter: false` als Standard). https://stately.ai/docs/transitions *(nicht nachgeprüft)* | Ziele unterhalb des Ursprungs verlassen den Ursprung nicht. |

**Befund aus D0:** Die Pfad-Enumeration fand genau diesen Fall (Region `raum` fiel nach einem `LINK` in `inhalt`
heraus). **Umsetzung:** Ziele unterhalb eines compound-Ursprungs sind intern (S2); läge die Domäne auf der parallelen
Wurzel, bleibt sie auf die Region des Ursprungs beschränkt; Ziele in fremden Regionen lehnt der Aufbau ab (Regionen
sprechen nur über Ereignisse, KONZEPT §2). Abweichung von S1 bewusst, getestet in `test/statechart.test.js`.

## 5. Deterministischer Logarithmus für den Bot

`Math.log` ist laut ECMA-262 nur „implementation-approximated“ (siehe `determinismus.md`, D1). Der UCB-Term von MCTS
braucht `ln`. D0 nutzt `logD`: Zerlegung `x = m·2^k` und atanh-Reihe nur mit `+ − × ÷`, die in IEEE-754 exakt gerundet
sind → bitgleich über Engines. Goldwert in `test/fixtures/sdk-gold.json`, im Browser gegengeprüft.
