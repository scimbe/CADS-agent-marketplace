// Content-Policy der Freien Karte 2 (P3) als Server-Pruefung: deterministisch, ohne Modell. Laeuft auf dem fertigen
// Spielcode, bevor eine Karte ausgeliefert wird. Regeln (Entscheidung FK2): Schiessen ohne Gewalt ist erlaubt
// (Wasserbomben, Schneebaelle, Farbe, Lichtstrahlen auf Felsen, Boote, Ziegel); verboten sind Waffen-, Blut- und
// Todes-Symbole sowie Menschen als Ziel. Menschen-Emojis duerfen als Spielfigur vorkommen, aber nicht als Gegner/Ziel;
// weil der Code das nicht sicher unterscheiden laesst, sind sie hier ganz gesperrt (Tiere und Dinge statt Menschen).
//
// Rein: nur Text rein, Befunde raus. Jeder Befund ist ein Satz fuer die Reparaturrunde. checkPolicy prueft den Code (Emojis
// und Texte in Zeichenketten), checkTexte die Saetze, die die Person sieht (Titel, Notizen), mit denselben Listen.

/** Waffen, Blut, Tod, Explosionen gegen Lebewesen. */
export const EMOJI_VERBOTEN = Object.freeze(["🔫", "🔪", "🗡", "⚔", "💣", "🧨", "🪓", "🏹", "🩸", "💀", "☠", "⚰", "🪦", "🥷", "💉", "🪖"]);

// Menschen und Koerperteile als feste Liste von Codepunkten (Unicode-Emoji-Daten, Gruppe "People & Body" ohne die
// Untergruppen der Haende, dazu Hauttoene), nicht als grobe Bereiche: die Bereiche der Messung trafen 🏆 (Pokal), und
// 1F574–1F57A traf auch 🕶 🕷 🕸 🕹, 1F645–1F64F auch 🙈 🙉 🙊, 1F466–1F487 auch 👻 👽 👾 (Fehlalarme, fk2-p3-messung.md 4/6).
// Haende und Gesten (👍 ✋ 👋 …) sind keine Menschen als Ziel und bleiben erlaubt (z. B. als Zeiger).
const r = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const MENSCH_CODEPUNKTE = Object.freeze(new Set([
  // person, person-gesture, person-role, person-fantasy
  ...r(0x1f466, 0x1f469), 0x1f46a, 0x1f46b, 0x1f46c, 0x1f46d, 0x1f46e, 0x1f46f, ...r(0x1f470, 0x1f478), 0x1f47c, ...r(0x1f481, 0x1f483), 0x1f486, 0x1f487,
  0x1f48f, 0x1f491, 0x1f385, 0x1f464, 0x1f465, 0x1f5e3, 0x1fac2, ...r(0x1fac3, 0x1fac5),
  0x1f645, 0x1f646, 0x1f647, ...r(0x1f64b, 0x1f64f), 0x1f926, ...r(0x1f930, 0x1f931), ...r(0x1f933, 0x1f939), ...r(0x1f93c, 0x1f93e), 0x1f93a,
  ...r(0x1f9cd, 0x1f9cf), ...r(0x1f9d1, 0x1f9df), 0x1f9cc, 0x1f9b8, 0x1f9b9, 0x1f977,
  // person-activity, person-sport, person-resting
  0x1f574, 0x1f575, 0x1f57a, 0x1f6b4, 0x1f6b5, 0x1f6b6, 0x1f3c2, 0x1f3c3, 0x1f3c4, 0x1f3c7, 0x1f3ca, 0x1f3cb, 0x1f3cc, 0x1f6a3, 0x1f6c0, 0x1f6cc, 0x26f9,
  // body-parts (ohne Haende): Augen, Ohren, Nase, Mund, Zunge, Beine, Fuesse, Gehirn, Organe, Zahn, Knochen
  0x1f440, 0x1f441, 0x1f442, 0x1f443, 0x1f444, 0x1f445, 0x1f9b4, 0x1f9b5, 0x1f9b6, 0x1f9b7, 0x1f9bb, 0x1f9e0, 0x1fac0, 0x1fac1, 0x1fae6,
  // Hauttoene (zeigen immer einen Menschen an)
  ...r(0x1f3fb, 0x1f3ff)
]));
const isMensch = (cp) => MENSCH_CODEPUNKTE.has(cp);

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
    if (isMensch(cp) && !seen.has(ch)) { seen.add(ch); out.push("Policy: Menschen-Emoji " + ch + " nicht erlaubt (keine Menschen im Spiel, auch nicht als Ziel) – nimm ein Tier oder ein Ding, z. B. 🐸 🐱 🤖 ⛵"); }
  }
  const text = strings(code).join(" \n ").toLowerCase();
  for (const w of WOERTER_VERBOTEN) if (new RegExp("(^|[^a-zäöüß])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(text)) out.push("Policy: Wort \"" + w + "\" in einem Text des Spiels nicht erlaubt (keine Gewalt) – sprich von treffen, nass machen, einsammeln, platzen");
  return out;
}

/**
 * Saetze fuer die Person (Titel, Notizen, Hinweise) gegen dieselben Listen wie der Code.
 * @param {string[]} texte
 * @returns {string[]} Befunde
 */
export function checkTexte(texte) {
  return checkPolicy(texte.map((t) => JSON.stringify(String(t))).join(";\n"));
}
