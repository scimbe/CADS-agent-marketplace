// Alle Knotentypen der Anzeigeliste (ADR 0001 b/c): eine Liste fuer Renderer, Tests und Generator.
export const LAYOUT = ["frame", "stack", "row", "text", "shape", "tile", "choice", "more", "image"];
// Grundschicht mit Entwurf (Z1)
export const DRAFT = ["field", "go", "link", "copy", "file", "action", "ai", "open"];
// Widgets der Zugkarten (Altcode turn-ui.js/turn2.js + Anfragen P/S/T)
export const WIDGETS = [
  "pick", "rank", "slide", "input", "list", "money", "pay", "show", "alloc", "grid", "probe", "touch", "rec", "once",
  "parrot", "whose", "nim", "freeze", "voices", "doors", "door", "drop", "hunt", "blocks", "shop", "wish", "slots", "vote",
  "blow", "ideas", "day", "bw", "explain", "clock", "inner", "blind", "react", "tuer", "aim", "power", "draw", "strokes",
  "steps", "audio", "record", "pcard", "pickn", "form"
];
export const CANVAS = ["canvas"];
export const PRIMITIVES = [...LAYOUT, ...DRAFT, ...WIDGETS, ...CANVAS];
