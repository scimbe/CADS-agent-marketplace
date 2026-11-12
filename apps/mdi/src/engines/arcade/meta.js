// Texte, Farben und Figuren der zehn Duelle (Port von alt:src/arcade.json, alt:src/arcade-ui.js:10-16 META/GLASS,
// alt:src/frei.js PAIRS/ARCADE_EMOJI/ARCADE_WIN und der Katalogeintraege alt:src/ideas.json arcade-*).
export const META = {
  puck: { e: "🏒", a: "#00e5ff", b: "#ff3b1d" }, ziegel: { e: "🧱", a: "#ff7a1a", b: "#e8d6bf" }, volley: { e: "🏐", a: "#2bd9a0", b: "#ffd400" },
  panzer: { e: "💥", a: "#7cdb3c", b: "#ff3b1d" }, kick: { e: "⚽", a: "#39ff88", b: "#ff5fa2" }, flipper: { e: "🎯", a: "#00f0ff", b: "#b04bff" },
  snow: { e: "❄️", a: "#4fc3ff", b: "#ff7a59" }, elfer: { e: "🥅", a: "#39ff88", b: "#ff2bd6" }, stock: { e: "🥌", a: "#20c9c9", b: "#e0863a" },
  murmel: { e: "🔮", a: "#ffd400", b: "#ff3b1d" }
};
export const GLASS = ["#ff5fa2", "#4fc3ff", "#7cdb3c", "#ffd400", "#b04bff", "#ff7a1a", "#20c9c9", "#ffffff", "#ff3b1d"];
export const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
export const EMOJI = ["🏒", "🧱", "🏐", "💥", "⚽", "🎯", "❄️", "🥅", "🥌", "🔮", "🚀", "🛸", "🐸", "🦆", "🐙", "🦖", "🐉", "🦄", "🐝", "🍕", "🍩", "🎃", "👻", "⭐", "🌈", "🔥", "⚡", "🌙", "🎄", "⛄", "🎁", "🐱", "🐶", "🐧", "🦉", "🐌"];
/** Alle Farben, die eine Arcade-Karte annehmen kann: die Spielfarben und die Paare der freien Karte. */
export const COLORS = [...new Set([...Object.values(META).flatMap((m) => [m.a, m.b]), ...PAIRS.flat()])];

export const T = {
  de: {
    you: "Du", bot: "Bot", friend: "Freund", win: "Wer zuerst {n} Punkte hat, gewinnt.",
    won: "Gewonnen {a}:{b}!", lost: "Knapp! {a}:{b}", draw: "Unentschieden {a}:{b}!", odd: "Unmögliche Züge vom Gegner wurden ignoriert.",
    yourTurn: "Du bist dran.", theirTurn: "Gegner ist dran …", shoot: "Du schießt – wischen!", keep: "Du hältst – ziehen!",
    score: "{you} {a} : {b} {them}",
    how: {
      puck: "Zieh deinen Schläger in deiner Hälfte und schieß den Puck ins obere Tor.",
      ziegel: "Schieb den Schläger unten. Deine Mauer dahinter fängt Fehler auf, bis sie Löcher hat.",
      volley: "Unten ziehen: laufen. Oben tippen: springen. Der Ball darf nicht in deinen Sand.",
      panzer: "Zieh wie eine Schleuder vom Ziel weg und lass los. Achte auf den Wind.",
      kick: "Zieh: beide Stangen fahren mit. Tippen: kicken. Wer zuerst 3 Tore hat, gewinnt.",
      flipper: "Tipp links oder rechts: die Klappe schlägt. Lass den Ball nicht durch die Lücke.",
      snow: "Zieh zum Ausweichen, tipp zum Werfen. Drei Schneebälle, dann kurz nachladen.",
      elfer: "Als Schütze: wischen, mit Bogen für Kurve. Als Torwart: ziehen, schnell ziehen ist ein Hechtsprung.",
      stock: "Zieh wie eine Schleuder zurück und lass los. Der Stein am nächsten zur Mitte gewinnt die Runde.",
      murmel: "Tipp unten auf die Linie, zieh zurück und lass los. Jede Murmel aus dem Ring ist ein Punkt."
    },
    keys: {
      puck: "Tastatur: Pfeiltasten bewegen den Schläger.", ziegel: "Tastatur: Pfeil links/rechts.", volley: "Tastatur: Pfeil links/rechts laufen, Leertaste springt.",
      panzer: "Tastatur: Pfeil hoch/runter Winkel, links/rechts Kraft, Leertaste feuert.", kick: "Tastatur: Pfeil links/rechts, Leertaste kickt.",
      flipper: "Tastatur: Pfeil links und Pfeil rechts schlagen die Klappen.", snow: "Tastatur: Pfeil links/rechts, Leertaste wirft.",
      elfer: "Tastatur: Pfeil links/rechts zielen, hoch/runter Kurve, Leertaste schießt; als Torwart Pfeil links/rechts.",
      stock: "Tastatur: Pfeil links/rechts Richtung, hoch/runter Kraft, Leertaste wirft.", murmel: "Tastatur: A/D Startpunkt, Pfeile Richtung und Kraft, Leertaste schießt."
    }
  },
  en: {
    you: "You", bot: "Bot", friend: "Friend", win: "First to {n} points wins.",
    won: "You won {a}:{b}!", lost: "Close! {a}:{b}", draw: "A draw {a}:{b}!", odd: "Impossible moves from the other side were ignored.",
    yourTurn: "Your turn.", theirTurn: "Their turn …", shoot: "You shoot – swipe!", keep: "You keep – drag!",
    score: "{you} {a} : {b} {them}",
    how: {
      puck: "Drag your mallet in your half and shoot the puck into the top goal.",
      ziegel: "Slide the paddle at the bottom. Your wall behind it catches mistakes until it has holes.",
      volley: "Drag at the bottom: run. Tap higher up: jump. The ball must not land in your sand.",
      panzer: "Pull back like a slingshot and let go. Mind the wind.",
      kick: "Drag: both rods follow. Tap: kick. First to 3 goals wins.",
      flipper: "Tap left or right: that flipper swings. Don't let the ball through the gap.",
      snow: "Drag to dodge, tap to throw. Three snowballs, then a short reload.",
      elfer: "Shooting: swipe, bend it for a curve. Keeping: drag, a fast drag is a dive.",
      stock: "Pull back like a slingshot and let go. The stone closest to the middle wins the round.",
      murmel: "Tap the line at the bottom, pull back and let go. Every marble out of the ring is a point."
    },
    keys: {
      puck: "Keyboard: arrow keys move the mallet.", ziegel: "Keyboard: left/right arrows.", volley: "Keyboard: left/right to run, space to jump.",
      panzer: "Keyboard: up/down angle, left/right power, space fires.", kick: "Keyboard: left/right, space kicks.",
      flipper: "Keyboard: left and right arrows swing the flippers.", snow: "Keyboard: left/right, space throws.",
      elfer: "Keyboard: left/right to aim, up/down to curve, space shoots; keeping: left/right.",
      stock: "Keyboard: left/right direction, up/down power, space throws.", murmel: "Keyboard: A/D start point, arrows direction and power, space shoots."
    }
  }
};
export function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m)); }
export function tx(lang) { return T[lang === "en" ? "en" : "de"]; }
