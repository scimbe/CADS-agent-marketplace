// Testseite: alle Widgets mit Beispieldaten (nur Tests). Fuer axe, Ueberlauf, Tastatur und grosse Schrift.
import { render } from "../../../src/render/render.js";
import { patch } from "../../../src/ui/dom.js";

const sub = { t: "answer", seat: 0 };
const N = [
  { t: "pick", id: "p", label: "Wähle zwei", n: 2, options: [{ label: "Pizza" }, { label: "Pommes" }, { label: "Salat" }], submit: sub },
  { t: "rank", id: "r", label: "Ordne", options: [{ label: "A" }, { label: "B" }, { label: "C" }], submit: sub },
  { t: "slide", id: "s", label: "Personen", min: 1, max: 20, step: 1, def: 3, unit: "👤", submit: sub },
  { t: "input", id: "i", label: "Dein Wort", max: 14, oneWord: true, submit: sub },
  { t: "list", id: "l", label: "Fünf Dinge", n: 3, max: 16, hints: ["Erstens", "Zweitens", "Drittens"], submit: sub },
  { t: "money", id: "m", label: "Betrag", people: 3, min: 100, max: 15000, submit: sub },
  { t: "alloc", id: "a", label: "Verteile 100", sum: 100, step: 10, options: [{ label: "Uhr" }, { label: "Ring" }], submit: sub },
  { t: "grid", id: "g", label: "Verstecke zwei Socken", n: 2, submit: sub },
  { t: "slots", id: "sl", label: "Termine", from: 20769, days: 14, submit: sub },
  { t: "vote", id: "v", label: "Abstimmen", dates: [207696, 207716], submit: sub },
  { t: "shop", id: "sh", label: "Einkauf", cfg: { items: 20, text: 24, people: 8 }, list: [[["Ada", 0]], [["Milch", 0, 2, [[0, 1]]]]], submit: sub },
  { t: "steps", id: "st", label: "Beat", rows: [{ id: "k", label: "Kick", cells: "x---x---x---x---" }], submit: sub },
  { t: "door", id: "d", nr: 5, closed: true, label: "Türchen 5 öffnen", children: [{ t: "text", role: "body", text: "Hallo" }], submit: sub },
  { t: "choice", label: "Termin", wrap: true, options: [{ label: "Mo", draft: { d: 1 }, on: true }, { label: "Di", draft: { d: 2 } }] },
  { t: "go", label: "Weiter", input: sub, disabled: true, why: "Name fehlt" },
  { t: "canvas", w: 400, h: 225, ratio: "16:9", a11y: "Testbild", ops: [{ o: "rect", x: 0, y: 0, w: 400, h: 225, fill: "yellow" }, { o: "circle", x: 200, y: 112, r: 60, fill: "red" }] }
];
const root = document.getElementById("app");
let draft = null;
function draw() { patch(root, [render({ t: "stack", children: N }, { lang: "de", draft, onInput: (x) => { window.__sent.push(x); }, onDraft: (d) => { draft = d; draw(); }, onDraftPatch: (p) => { draft = { ...(draft || {}), ...p }; draw(); }, onAction: () => {}, idp: "w", random: () => 0, clock: () => performance.now(), age18: true })]); }
window.__sent = [];
draw();
