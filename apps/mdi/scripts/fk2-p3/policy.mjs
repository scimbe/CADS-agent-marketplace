// Content-Policy der Freien Karte 2 (P3) als Server-Pruefung: deterministisch, ohne Modell. Laeuft auf dem fertigen
// Spielcode, bevor eine Karte ausgeliefert wird. Regeln (Entscheidung FK2): Schiessen ohne Gewalt ist erlaubt
// (Wasserbomben, Schneebaelle, Farbe, Lichtstrahlen auf Felsen, Boote, Ziegel); verboten sind Waffen-, Blut- und
// Todes-Symbole sowie Menschen als Ziel. Menschen-Emojis duerfen als Spielfigur vorkommen, aber nicht als Gegner/Ziel;
// weil der Code das nicht sicher unterscheiden laesst, sind sie hier ganz gesperrt (Tiere und Dinge statt Menschen).
//
// Rein: nur Text rein, Befunde raus. Jeder Befund ist ein Satz fuer die Reparaturrunde.

/** Waffen, Blut, Tod, Explosionen gegen Lebewesen. */
export const EMOJI_VERBOTEN = Object.freeze(["🔫", "🔪", "🗡", "⚔", "💣", "🧨", "🪓", "🏹", "🩸", "💀", "☠", "⚰", "🪦", "🥷", "💉", "🪖"]);

// Menschen und Koerperteile: U+1F466–1F487 (Junge … Friseur), U+1F9D1–1F9DD (Person … Elf), 1F46A–1F46F,
// 1F574–1F57A, 1F645–1F64F, 1F6B4–1F6B6, 1F3C3–1F3CC (Laeufer, Schwimmer …), 1F930–1F93E, 1F9CD–1F9CF, Hauttoene 1F3FB–1F3FF.
const MENSCH_RANGES = [[0x1f466, 0x1f487], [0x1f9d1, 0x1f9dd], [0x1f574, 0x1f57a], [0x1f645, 0x1f64f], [0x1f6b4, 0x1f6b6], [0x1f3c3, 0x1f3cc], [0x1f930, 0x1f93e], [0x1f9cd, 0x1f9cf], [0x1f3fb, 0x1f3ff], [0x1f46a, 0x1f46f], [0x1f9b8, 0x1f9b9]];
const isMensch = (cp) => MENSCH_RANGES.some(([a, b]) => cp >= a && cp <= b);

/** Woerter in Texten (Titel, d.text, Kommentare zaehlen nicht): Gewalt gegen Lebewesen. Wortanfang, Umlaute beide Formen. */
export const WOERTER_VERBOTEN = Object.freeze(["töte", "toete", "töten", "toeten", "tötet", "getötet", "mord", "blut", "erschieß", "erschiess", "erstech", "waffe", "pistole", "gewehr", "messer", "granate", "leiche", "sterben", "stirbt", "kill", "gun", "blood", "murder", "dead body", "folter", "terror", "massaker"]);

/** Entfernt Kommentare grob (Zeichenketten bleiben), damit Erklaerungen im Code nicht als Inhalt zaehlen. */
function ohneKommentare(src) {
  let out = "", i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === "\\") { out += n || ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
    out += c; i++;
  }
  return out;
}

/** Alle Zeichenketten-Literale (grob, fuer Wortpruefung). */
function strings(src) {
  const out = [], re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/**
 * Prueft Spielcode gegen die Content-Policy.
 * @param {string} src  Spielmodul
 * @returns {string[]} Befunde (leer = bestanden), je ein Satz mit Abhilfe
 */
export function checkPolicy(src) {
  const code = ohneKommentare(String(src || ""));
  const out = [];
  for (const e of EMOJI_VERBOTEN) if (code.includes(e)) out.push("Policy: Emoji " + e + " nicht erlaubt (Waffe, Blut oder Tod) – nimm ein harmloses Ding, z. B. 💧 Wasserbombe, ❄️ Schneeball, 🎈 Ballon, ⭐ Stern");
  const seen = new Set();
  for (const ch of code) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff && isMensch(cp) && !seen.has(ch)) { seen.add(ch); out.push("Policy: Menschen-Emoji " + ch + " nicht erlaubt (keine Menschen im Spiel, auch nicht als Ziel) – nimm ein Tier oder ein Ding, z. B. 🐸 🐱 🤖 ⛵"); }
  }
  const text = strings(code).join(" \n ").toLowerCase();
  for (const w of WOERTER_VERBOTEN) if (new RegExp("(^|[^a-zäöüß])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text)) out.push("Policy: Wort \"" + w + "\" in einem Text des Spiels nicht erlaubt (keine Gewalt) – sprich von treffen, nass machen, einsammeln, platzen");
  return out;
}
