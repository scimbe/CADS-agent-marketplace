# Statechart

- D. Harel, „Statecharts: A visual formalism for complex systems“, Science of Computer Programming 8(3):231-274, 1987.
  Hierarchie, Parallelität, Broadcast gegen Zustandsexplosion. *(nicht nachgeprüft)*
- W3C, „State Chart XML (SCXML)“, Recommendation 2015, https://www.w3.org/TR/scxml/ – formale Ausführungssemantik.
- XState v5 (MIT), https://stately.ai/docs – 5.33.4: 46 824 B min, 14 547 B gzip (bundlephobia, 2026-11-11).
  @xstate/store ohne Hierarchie/Parallelität → kein Ersatz.

Ableitung: A1/A2 sind das Problem, das Harel adressiert. Eigenbau als SCXML-Teilmenge mit Konformitätstests; XState als
Rückfall (Gate S1). Unsicherheit: Fehlerrate des Eigenbaus erst im Spike messbar.
