/* Draws a creation to a canvas. Same code for the live preview and the final picture. */
(function () {
  "use strict";
  var C = window.DuellCore, S = window.Studio;
  var FONT = 'Anton,Impact,"Avenir Next Condensed","Roboto Condensed","Arial Black",system-ui,sans-serif';
  var EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function lum(h) { var r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
  function ink(h) { return lum(h) > 0.45 ? "#111111" : "#fffaf0"; }

  // Dots behind text stay loud only while the text still reads against them.
  function softDots(c, W, H, col, cell, ang, text) {
    var clash = Math.abs(lum(col) - lum(text)) < 0.45;
    c.save(); if (clash) c.globalAlpha = 0.28; dots(c, W, H, col, cell, ang); c.restore();
    return clash ? (lum(text) > 0.5 ? "#111111" : "#fffaf0") : col;
  }
  // Word block: every line stretches to the full width, like a gig poster.
  function breakLines(words, n) {
    var total = words.join(" ").length, tgt = total / n, lines = [], cur = "";
    words.forEach(function (w) {
      if (cur && (cur + " " + w).length > tgt * 1.15 && lines.length < n - 1) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function layout(c, text, w, h) {
    var words = String(text).toUpperCase().split(/\s+/).filter(Boolean), best = null;
    if (!words.length) return [];
    for (var n = 1; n <= Math.min(6, words.length); n++) {
      var lines = breakLines(words, n), L = [], H = 0;
      c.font = "900 100px " + FONT;
      lines.forEach(function (t) { var size = 100 * w / Math.max(1, c.measureText(t).width); L.push({ t: t, size: size }); H += size * 0.98; });
      var k = H > h ? h / H : 1, fill = H * k * k;     // k*k: a block that has to shrink no longer fills the width
      if (!best || fill > best.fill) best = { fill: fill, lines: L.map(function (l) { return { t: l.t, size: l.size * k }; }) };
    }
    return best.lines;
  }
  function block(c, text, x, y, w, h, col, shadow, off) {
    var lines = layout(c, text, w, h), total = lines.reduce(function (a, l) { return a + l.size * 0.98; }, 0), yy = y + (h - total) / 2;
    c.textAlign = "center"; c.textBaseline = "alphabetic";
    lines.forEach(function (l) {
      yy += l.size * 0.98; c.font = "900 " + l.size + "px " + FONT;
      if (shadow) { c.fillStyle = shadow; c.fillText(l.t, x + w / 2 + (off || 0), yy - l.size * 0.09 + (off || 0)); }
      c.fillStyle = col; c.fillText(l.t, x + w / 2, yy - l.size * 0.09);
    });
  }
  function dots(c, W, H, col, cell, seedAngle) {
    c.fillStyle = col;
    for (var y = 0; y < H; y += cell) for (var x = (Math.floor(y / cell) % 2) * cell / 2; x < W; x += cell) {
      var k = (x / W * Math.cos(seedAngle) + y / H * Math.sin(seedAngle) + 0.4) * 0.9;
      if (k <= 0.25) continue;
      c.beginPath(); c.arc(x, y, Math.min(cell * 0.46, cell * 0.5 * (k - 0.25)), 0, 6.3); c.fill();
    }
  }
  function rays(c, W, H, col, rot) {
    c.save(); c.translate(W / 2, H * 0.42); c.rotate(rot); c.fillStyle = col;
    for (var i = 0; i < 14; i++) { c.rotate(6.2832 / 14); c.beginPath(); c.moveTo(0, 0); c.lineTo(H * 1.2, -H * 0.13); c.lineTo(H * 1.2, H * 0.13); c.fill(); }
    c.restore();
  }
  function stickers(c, W, H, list) {
    (list || []).forEach(function (s) {
      var r = W * 0.1 * s.z;
      c.save(); c.translate(s.x * W, s.y * H); c.rotate(s.r);
      c.fillStyle = "#fff"; c.strokeStyle = "#111"; c.lineWidth = W * 0.006; c.beginPath(); c.arc(0, 0, r, 0, 6.3); c.fill(); c.stroke();
      c.font = r * 1.25 + "px " + EMO; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(s.e, 0, r * 0.06);
      c.restore();
    });
  }
  function credit(c, W, H, doc, me, col) {
    var who = [me.emoji, me.nick].filter(Boolean).join(" ");
    c.font = "800 " + W * 0.036 + "px system-ui,sans-serif," + EMO; c.textBaseline = "alphabetic";
    c.fillStyle = col; c.textAlign = "left"; c.fillText(who, W * 0.04, H - W * 0.032);
    c.textAlign = "right"; c.fillText("my daily idea", W * 0.96, H - W * 0.032);
  }
  function cover(c, img, w, h) {
    var iw = img.width, ih = img.height, k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
    c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  var cache = { key: "", cv: null };
  function photoLayer(doc, img, W, H) {
    var seed = C.hash32(doc.x + "|" + doc.y + "|" + doc.col.join()), key = [img._id, W, H, doc.st, doc.col.join(), doc.st === "glitch" ? seed : 0].join("/");
    if (cache.key === key) return cache.cv;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d", { willReadFrequently: true }); cover(c, img, W, H);
    var im = c.getImageData(0, 0, W, H), d = im.data;
    if (doc.st === "poster") S.duotone(d, "#16121f", doc.col[0]);
    else if (doc.st === "sticker") S.posterize(d, 4);
    else if (doc.st === "glitch") S.glitch(d, W, H, seed);
    c.putImageData(im, 0, 0);
    cache = { key: key, cv: cv };
    return cv;
  }
  function burstPath(c, cx, cy, r, n, inner) {
    c.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = i * Math.PI / n, q = i % 2 ? r * inner : r; c[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
    c.closePath();
  }

  function drawCard(c, W, H, doc) {
    var a = doc.col[0], b = doc.col[1], tx = doc.x || "…";
    if (doc.st === "zettel") {
      c.fillStyle = b; c.fillRect(0, 0, W, H); dots(c, W, H, a, W * 0.05, 0.9);
      c.save(); c.translate(W / 2, H * 0.47); c.rotate(-0.04);
      c.fillStyle = "#fff8e4"; c.fillRect(-W * 0.42, -H * 0.38, W * 0.84, H * 0.76);
      c.strokeStyle = "rgba(30,60,160,.28)"; c.lineWidth = W * 0.003;
      for (var y = -H * 0.32; y < H * 0.37; y += H * 0.062) { c.beginPath(); c.moveTo(-W * 0.42, y); c.lineTo(W * 0.42, y); c.stroke(); }
      c.fillStyle = a; c.globalAlpha = 0.85; c.fillRect(-W * 0.13, -H * 0.405, W * 0.26, H * 0.05); c.globalAlpha = 1;
      block(c, tx, -W * 0.37, -H * 0.31, W * 0.74, H * 0.62, "#141414", null);
      c.restore();
    } else if (doc.st === "stempel") {
      c.fillStyle = a; c.fillRect(0, 0, W, H); rays(c, W, H, "rgba(0,0,0,.05)", 0.2);
      c.save(); c.translate(W / 2, H * 0.47); c.rotate(-0.09);
      c.strokeStyle = b; c.lineWidth = W * 0.022; c.strokeRect(-W * 0.4, -H * 0.32, W * 0.8, H * 0.64); c.lineWidth = W * 0.006; c.strokeRect(-W * 0.375, -H * 0.3, W * 0.75, H * 0.6);
      block(c, tx, -W * 0.34, -H * 0.27, W * 0.68, H * 0.54, b, null);
      c.restore();
    } else if (doc.st === "neon") {
      c.fillStyle = "#0c0a14"; c.fillRect(0, 0, W, H); dots(c, W, H, "rgba(255,255,255,.07)", W * 0.03, 2);
      c.save(); c.shadowColor = a; c.shadowBlur = W * 0.04;
      block(c, tx, W * 0.08, H * 0.1, W * 0.84, H * 0.72, a, null); block(c, tx, W * 0.08, H * 0.1, W * 0.84, H * 0.72, "#fff", null, 0);
      c.restore(); c.globalCompositeOperation = "source-over";
    } else {
      c.fillStyle = a; c.fillRect(0, 0, W, H); rays(c, W, H, "rgba(0,0,0,.05)", 0.1);
      block(c, tx, W * 0.06, H * 0.07, W * 0.88, H * 0.8, ink(a), softDots(c, W, H, b, W * 0.032, 0.7, ink(a)), W * 0.012);
    }
  }
  function drawPhoto(c, W, H, doc, img) {
    var a = doc.col[0], b = doc.col[1];
    if (doc.st === "sticker") {
      c.fillStyle = a; c.fillRect(0, 0, W, H); rays(c, W, H, b, 0.2);
      var cx = W / 2, cy = H * 0.5, r = W * 0.46;
      burstPath(c, cx, cy, r * 1.08, 16, 0.86); c.fillStyle = "#fff"; c.fill();
      c.save(); burstPath(c, cx, cy, r, 16, 0.86); c.clip();
      if (img) c.drawImage(photoLayer(doc, img, W, H), 0, 0, W, H); else { c.fillStyle = b; c.fill(); }
      c.restore();
      block(c, doc.x, W * 0.08, H * 0.03, W * 0.84, H * 0.15, ink(a), null);
      block(c, doc.y, W * 0.08, H * 0.8, W * 0.84, H * 0.13, ink(a), null);
      return;
    }
    if (img) c.drawImage(photoLayer(doc, img, W, H), 0, 0, W, H); else { c.fillStyle = a; c.fillRect(0, 0, W, H); }
    if (doc.st === "poster") {
      c.save(); c.globalAlpha = 0.5; dots(c, W, H, b, W * 0.022, 1.2); c.restore();
      block(c, doc.x, W * 0.05, H * 0.03, W * 0.9, H * 0.24, lum(a) > 0.45 ? a : "#fffaf0", "#16121f", W * 0.009);
      block(c, doc.y, W * 0.05, H * 0.8, W * 0.9, H * 0.13, "#fffaf0", "#16121f", W * 0.006);
    } else if (doc.st === "meme") {
      [[doc.x, 0.02], [doc.y, 0.78]].forEach(function (p) {
        var ls = layout(c, p[0], W * 0.92, H * 0.17), yy = H * p[1];
        ls.forEach(function (l) { yy += l.size * 0.96; c.font = "900 " + l.size + "px " + FONT; c.textAlign = "center"; c.lineJoin = "round"; c.lineWidth = l.size * 0.13; c.strokeStyle = "#000"; c.strokeText(l.t, W / 2, yy); c.fillStyle = "#fff"; c.fillText(l.t, W / 2, yy); });
      });
    } else {
      c.fillStyle = b; c.fillRect(0, H * 0.04, W * 0.72, H * 0.1); block(c, doc.x, W * 0.03, H * 0.045, W * 0.66, H * 0.09, ink(b), null);
      c.fillStyle = "#000"; c.fillRect(W * 0.28, H * 0.82, W * 0.72, H * 0.09); block(c, doc.y, W * 0.31, H * 0.825, W * 0.66, H * 0.08, a, null);
    }
  }
  function drawSound(c, W, H, doc, pk) {
    var a = doc.col[0], b = doc.col[1], fg = ink(a);
    c.fillStyle = a; c.fillRect(0, 0, W, H);
    block(c, doc.x || "…", W * 0.06, H * 0.05, W * 0.88, H * 0.3, fg, softDots(c, W, H, b, W * 0.03, 0.4, fg), W * 0.01);
    var n = 40, bw = W * 0.88 / n, cy = H * 0.64, amp = H * 0.2;
    c.fillStyle = fg;
    for (var i = 0; i < n; i++) {
      var v = pk && pk.length ? pk[Math.floor(i * pk.length / n)] : 0.05, bh = Math.max(W * 0.008, v * amp);
      c.fillRect(W * 0.06 + i * bw, cy - bh, bw * 0.62, bh * 2);
    }
    if (doc.m === "beat") {
      c.font = "900 " + W * 0.05 + "px " + FONT; c.textAlign = "center"; c.fillText(doc.bpm + " BPM", W / 2, H * 0.9);
    }
  }

  // photo: {width,height,_id} image or canvas. pk: sound peaks. me: my style.
  function draw(cv, doc, opt) {
    var c = cv.getContext("2d"), W = cv.width, H = cv.height, me = opt.me;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.shadowBlur = 0;
    if (Render.extra[doc.k]) { Render.extra[doc.k](c, W, H, doc, opt); credit(c, W, H, doc, me, "#fff"); return; }
    if (doc.k === "card") drawCard(c, W, H, doc);
    else if (doc.k === "photo") drawPhoto(c, W, H, doc, opt.photo);
    else if (doc.k === "sound") drawSound(c, W, H, doc, opt.peaks);
    stickers(c, W, H, doc.sk);
    credit(c, W, H, doc, me, doc.k === "card" && doc.st === "neon" ? "#fff" : (doc.k === "photo" && doc.st !== "sticker" ? "#fff" : ink(doc.k === "card" && doc.st === "zettel" ? doc.col[1] : doc.col[0])));
  }
  // The bot face: a stand-in when there is no photo, drawn from the seed so it is never quite the same.
  function botFace(seed, col) {
    var cv = document.createElement("canvas"), r = C.mulberry32(seed); cv.width = 640; cv.height = 800;
    var c = cv.getContext("2d");
    c.fillStyle = "#d9d3c4"; c.fillRect(0, 0, 640, 800);
    c.fillStyle = "#3a3640"; c.fillRect(0, 620, 640, 180);
    c.fillStyle = "#8e8a93"; c.beginPath(); c.arc(320, 380, 225 + r() * 30, 0, 6.3); c.fill();
    c.fillStyle = col; c.fillRect(150, 290, 340, 90 + r() * 30);
    c.fillStyle = "#111"; [240, 400].forEach(function (x) { c.beginPath(); c.arc(x, 335, 26 + r() * 16, 0, 6.3); c.fill(); });
    c.fillRect(220, 480, 200, 18 + r() * 34);
    c.strokeStyle = "#111"; c.lineWidth = 14; c.beginPath(); c.moveTo(320, 150); c.lineTo(320 + (r() - 0.5) * 120, 50); c.stroke();
    cv._id = "bot" + seed;
    return cv;
  }
  var Render = window.Render = { extra: {}, stickers: stickers, draw: draw, lum: lum, block: block, ink: ink, botFace: botFace, dots: dots, rays: rays, FONT: FONT };
})();
