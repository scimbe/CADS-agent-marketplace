/* Part "logik": generators for puzzle cards (Katalog v2, W0: the Sudoku generator of tag-sudoku comes first). Empty until
   then. A generator is a pure function of the seed, so every device builds the same puzzle and nothing travels but the seed:
     Logik.add("gen", "sudoku", function (seed, level) { return { grid: [...], solution: [...] }; })
   The core reaches it only through Parts.use("logik", fn) and Logik.get("gen", name). */
(function (root) {
  "use strict";
  root.Logik = root.Parts.registry("logik", ["gen"]);
})(window);
