// Sticker im fertigen Bild: Die Emoji-Glyphen des Systems (Apple, Google) duerfen wir nicht veroeffentlichen. Das Bild
// zeichnet die Sticker deshalb aus Noto Emoji (googlefonts/noto-emoji, 2D/png/128, Apache-2.0, licenses/). Bogen
// noto-stickers.png und Kachelreihenfolge exakt aus alt:src/noto.js und alt:src/noto-stickers.png. Nur die Emoji, die die
// App als Sticker anbietet (doc.js SETS, EMOJI und das Ersatz-Emoji); jedes andere Emoji hat keine Kachel.
export const KEYS = ["1f438", "1f986", "1f419", "1f99d", "1f40c", "1f996", "1f355", "1f32e", "1f369", "1f968", "1f35f", "1f9c3",
  "1f680", "1f6f8", "1f47d", "1fa90", "1f31f", "2604", "1f4a5", "1f525", "1f480", "1f921", "1f300", "26a1",
  "1f383", "1f47b", "1f987", "1f577", "1f9db", "1f578", "1f49b", "1f33b", "2728", "1faf6", "1f308", "2600",
  "1f384", "2b50", "1f381", "2744", "26c4", "1f36a", "1f916", "1f984", "1f41d", "1fa81"];
export const TILE = 128, PAD = 2, COLS = 8, CELL = TILE + 2 * PAD;

// Hex ohne toString(radix) (Harness: keine gebietsschema- oder radixabhaengigen Ausgaben in Kartenmodulen)
function hex(n) { let s = ""; do { s = "0123456789abcdef"[n % 16] + s; n = Math.floor(n / 16); } while (n > 0); return s; }
export function key(e) {
  return Array.from(typeof e === "string" ? e : "").map((c) => hex(c.codePointAt(0))).filter((h) => h !== "fe0f").join("_");
}
/** Quellrechteck der Kachel im Bogen (Pixel) oder null. */
export function tile(e) {
  const i = KEYS.indexOf(key(e));
  return i < 0 ? null : { x: (i % COLS) * CELL + PAD, y: Math.floor(i / COLS) * CELL + PAD, s: TILE };
}
export function has(e) { return !!tile(e); }
/** Zeichnet Emoji e als Quadrat size um (x, y); false ohne Kachel oder ohne Bogen. */
export function draw(c, sheet, e, x, y, size) {
  const t = tile(e);
  if (!t || !sheet) return false;
  c.drawImage(sheet, t.x, t.y, t.s, t.s, x - size / 2, y - size / 2, size, size);
  return true;
}
