/* Stickers in the finished picture: the system's emoji glyphs (Apple, Google) are not ours to publish, so the picture draws
   the app's sticker emoji from Noto Emoji instead: the images of googlefonts/noto-emoji (2D/png/128), Apache License 2.0
   (licenses/NotoEmoji-Apache-2.0.txt; the repo's root LICENSE names the OFL since 2024, licenses/NotoEmoji-OFL.txt).
   Part "noto" (scripts/build.js): this file plus the sheet src/noto-stickers.png (window.NotoData), made by
   scripts/noto-sprite.py from that repo at a fixed commit. Only the emoji the app offers as stickers
   (daily.js SETS, app.js EMOJI, core.js DEFAULT_EMOJI); any other emoji has no tile and stays out of the picture. */
(function (root) {
  "use strict";
  // Tile order in the sheet: code points in hex, joined by "_", without the variation selector FE0F (Noto's file names).
  var KEYS = ["1f438", "1f986", "1f419", "1f99d", "1f40c", "1f996", "1f355", "1f32e", "1f369", "1f968", "1f35f", "1f9c3",
    "1f680", "1f6f8", "1f47d", "1fa90", "1f31f", "2604", "1f4a5", "1f525", "1f480", "1f921", "1f300", "26a1",
    "1f383", "1f47b", "1f987", "1f577", "1f9db", "1f578", "1f49b", "1f33b", "2728", "1faf6", "1f308", "2600",
    "1f384", "2b50", "1f381", "2744", "26c4", "1f36a", "1f916", "1f984", "1f41d", "1fa81"];
  var TILE = 128, PAD = 2, COLS = 8, CELL = TILE + 2 * PAD;   // a transparent gutter, so scaling never bleeds a neighbour in

  function key(e) {
    return Array.from(typeof e === "string" ? e : "").map(function (c) { return c.codePointAt(0).toString(16); }).filter(function (h) { return h !== "fe0f"; }).join("_");
  }
  // The tile of an emoji in the sheet (source rectangle in pixels), or null when the sheet has none.
  function tile(e) {
    var i = KEYS.indexOf(key(e));
    return i < 0 ? null : { x: (i % COLS) * CELL + PAD, y: Math.floor(i / COLS) * CELL + PAD, s: TILE };
  }
  var img = null, wait = null;
  // The decoded sheet, once. Fails (and may be tried again) when the data is missing or the image does not decode.
  function ready() {
    if (wait) return wait;
    wait = new Promise(function (ok, no) {
      if (!root.NotoData || typeof Image === "undefined") { no(new Error("noto: no sheet")); return; }
      var i = new Image();
      i.onload = function () { img = i; ok(api); };
      i.onerror = function () { no(new Error("noto: sheet does not decode")); };
      i.src = "data:image/png;base64," + root.NotoData;
    });
    wait.catch(function () { wait = null; });
    return wait;
  }
  // Draws emoji e as a size x size square centred on (x, y) of context c; false when there is no tile or no sheet yet.
  function draw(c, e, x, y, size) {
    var t = tile(e);
    if (!t || !img) return false;
    c.drawImage(img, t.x, t.y, t.s, t.s, x - size / 2, y - size / 2, size, size);
    return true;
  }
  var api = { KEYS: KEYS, TILE: TILE, PAD: PAD, COLS: COLS, key: key, tile: tile, has: function (e) { return !!tile(e); }, ready: ready, draw: draw };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NotoStickers = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
