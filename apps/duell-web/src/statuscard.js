/* 9:16 picture for WhatsApp status and Instagram stories. Links in such pictures cannot be tapped, so it shows the
   short address in plain letters and a QR code, drawn here without any network. */
(function (root) {
  "use strict";
  var W = 1080, H = 1920, SAFE_TOP = 150, SAFE_BOTTOM = 260, SIDE = 300, MARGIN = 72;   // the apps lay their own controls over the top and bottom

  // Module matrix for a text. Level M: the code stays readable when it is shown on one screen and filmed by another.
  function qrMatrix(text, qrcode) {
    var q = (qrcode || root.qrcode)(0, "M"); q.addData(text); q.make();
    var n = q.getModuleCount(), m = [];
    for (var y = 0; y < n; y++) { m.push([]); for (var x = 0; x < n; x++) m[y].push(q.isDark(y, x)); }
    return m;
  }
  // Whole pixels per module and a quiet zone of four modules, otherwise scanners struggle.
  function drawQr(g, m, x, y, side) {
    var n = m.length, s = Math.floor(side / (n + 8)), full = s * (n + 8), off = 4 * s;
    g.fillStyle = "#fff"; g.fillRect(x, y, full, full);
    g.fillStyle = "#000";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (m[r][c]) g.fillRect(x + off + c * s, y + off + r * s, s, s);
    return full;
  }
  function splitUrl(url) {
    var s = url.replace(/^https:\/\//, ""), i = s.indexOf("/s/");
    return i < 0 ? { head: s, id: "" } : { head: s.slice(0, i + 3), id: s.slice(i + 3) };
  }
  // pic: finished picture (canvas). o: { url, bg, ink, cta, qr }
  function draw(pic, o) {
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var g = cv.getContext("2d");
    g.fillStyle = o.bg; g.fillRect(0, 0, W, H);
    var bandTop = H - SAFE_BOTTOM - SIDE, ph = bandTop - 40 - SAFE_TOP, pw = Math.round(ph * pic.width / pic.height);
    if (pw > W - 2 * MARGIN) { pw = W - 2 * MARGIN; ph = Math.round(pw * pic.height / pic.width); }
    var px = Math.round((W - pw) / 2), py = bandTop - 40 - ph;
    g.fillStyle = o.ink; g.fillRect(px - 6, py - 6, pw + 12, ph + 12);
    g.drawImage(pic, px, py, pw, ph);
    var full = drawQr(g, qrMatrix(o.url, o.qrcode), W - MARGIN - SIDE, bandTop, SIDE);
    var left = MARGIN, mid = bandTop + full / 2, parts = splitUrl(o.url);
    g.fillStyle = o.ink; g.textBaseline = "alphabetic"; g.textAlign = "left";
    g.font = "900 56px Anton, Impact, sans-serif"; g.fillText(o.cta, left, mid - 66, W - 2 * MARGIN - SIDE - 30);
    g.font = "700 38px ui-monospace, Menlo, Consolas, monospace"; g.fillText(parts.head, left, mid + 2, W - 2 * MARGIN - SIDE - 30);
    if (parts.id) { g.font = "700 76px ui-monospace, Menlo, Consolas, monospace"; g.fillText(parts.id, left, mid + 84, W - 2 * MARGIN - SIDE - 30); }
    return cv;
  }
  var api = { qrMatrix: qrMatrix, drawQr: drawQr, splitUrl: splitUrl, draw: draw, W: W, H: H, SAFE_TOP: SAFE_TOP, SAFE_BOTTOM: SAFE_BOTTOM };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.StatusCard = api;
})(typeof window !== "undefined" ? window : globalThis);
