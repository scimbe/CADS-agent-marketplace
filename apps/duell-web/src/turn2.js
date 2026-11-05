/* Part "turnzwei" ("turn2" in the card plan; part names are letters only, the gallery serves /duell/parts/[a-z]+.<hash>.js): rules and widgets of the new turn cards (Katalog v2, W0). Empty until the first card brings one; a card
   registers here instead of growing turns.js or turn-ui.js in the core (test/build.test.js holds the core budget).
     Turn2.add("rule", "checkin", { turns: [...], face: fn, result: fn })   a game for the turn table (like turns.js GAMES)
     Turn2.add("widget", "board", function (box, field, doc, lang) { ... }) a field kind for the turn editor
   The core reaches it only through Parts.use("turnzwei", fn) and Turn2.get(kind, name). */
(function (root) {
  "use strict";
  root.Turn2 = root.Parts.registry("turnzwei", ["rule", "widget"]);
})(window);
