/* Editor model of the part direkt: pure rules, no DOM (unit-tested in test/editmodel.test.js). One history of the whole
   sheet for undo and redo, the steps of the sticker keys and buttons, colour names instead of hex codes, and the
   description of a sheet that a screen reader reads for the preview. */
(function (root) {
  "use strict";
  var LIMIT = 50, MERGE = 600, MIN_Z = 0.5, MAX_Z = 2.5, MAX_R = 3.14;

  // ---------- history ----------
  // h.list: JSON snapshots of the doc, h.pos: the one shown. A change with the same key as the last one (one text field,
  // one slider) within 600 ms joins that step, so typing a word is one undo, not one per letter. A key starting with "p"
  // is one finger gesture on the preview (a drag, a pinch): it stays one step however long it lasts.
  function history(first) { return { list: [first], pos: 0, key: null, at: 0 }; }
  function record(h, snap, now, key) {
    if (snap === h.list[h.pos]) return false;
    if (key && key === h.key && (key.charAt(0) === "p" || now - h.at < MERGE) && h.pos > 0) {
      h.list[h.pos] = snap;
      if (snap === h.list[h.pos - 1]) { h.list.length = h.pos; h.pos--; }   // typed and taken back again: no empty step
    }
    else {
      h.list.length = h.pos + 1; h.list.push(snap);
      if (h.list.length > LIMIT) h.list.splice(0, h.list.length - LIMIT);
      h.pos = h.list.length - 1;
    }
    h.key = key || null; h.at = now; return true;
  }
  function canUndo(h) { return !!h && h.pos > 0; }
  function canRedo(h) { return !!h && h.pos < h.list.length - 1; }
  // -> the snapshot to show now, or null; the next change starts a step of its own.
  function undo(h) { if (!canUndo(h)) return null; h.pos--; h.key = null; return h.list[h.pos]; }
  function redo(h) { if (!canRedo(h)) return null; h.pos++; h.key = null; return h.list[h.pos]; }

  // ---------- sticker steps ----------
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  // One step on a sticker: dx/dy move (canvas units, 0..1), dz scales, dr turns. Never off the sheet, never past the limits.
  function nudge(s, o) {
    var r = s.r + (o.dr || 0);
    if (r > MAX_R) r -= Math.PI * 2; if (r < -MAX_R) r += Math.PI * 2;
    return { e: s.e, x: r3(clamp(s.x + (o.dx || 0), 0, 1)), y: r3(clamp(s.y + (o.dy || 0), 0, 1)), r: r3(clamp(r, -MAX_R, MAX_R)), z: r3(clamp(s.z + (o.dz || 0), MIN_Z, MAX_Z)) };
  }
  // A key on the sticker tools -> the step, or null. Arrows 2 %, with Shift 10 %; + and - size; R turns (Shift: back).
  function keyStep(key, shift) {
    var m = shift ? 0.1 : 0.02;
    return { ArrowLeft: { dx: -m }, ArrowRight: { dx: m }, ArrowUp: { dy: -m }, ArrowDown: { dy: m }, "+": { dz: 0.2 }, "=": { dz: 0.2 }, "-": { dz: -0.2 },
      r: { dr: 0.25 }, R: { dr: shift ? -0.25 : 0.25 } }[key] || null;
  }
  // Where on the sheet, in thirds: "00" top left ... "11" middle ... "22" bottom right (row, then column).
  function where(x, y) { var c = function (v) { return v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2; }; return "" + c(y) + c(x); }

  // ---------- colour names ----------
  function rgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim()); if (!m) return null;
    var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // "rgb(255, 212, 0)" (as the browser writes a style back) or "#ffd400" -> "#ffd400"
  function hexOf(s) {
    var m = String(s || "").match(/\d+/g);
    if (/^rgb/.test(String(s)) && m && m.length >= 3) return "#" + m.slice(0, 3).map(function (x) { return ("0" + (+x).toString(16)).slice(-2); }).join("");
    return rgb(s) ? "#" + String(s).replace("#", "").toLowerCase() : null;
  }
  // A word for any colour (hue, lightness, saturation), so a custom colour has a name too: the key of the word, never the code.
  function colorName(hex) {
    var c = rgb(hex); if (!c) return "grau";
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = 0;
    if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    if (l > 0.93) return "weiss"; if (l < 0.12) return "schwarz"; if (s < 0.15) return "grau";
    if (h < 15 || h >= 345) return l < 0.3 ? "braun" : "rot";
    if (h < 40) return l < 0.3 ? "braun" : "orange";
    if (h < 65) return "gelb"; if (h < 90) return "limette"; if (h < 165) return "gruen"; if (h < 190) return "tuerkis";
    if (h < 250) return l > 0.65 ? "hellblau" : "blau"; if (h < 290) return "lila"; return "pink";
  }

  // ---------- description ----------
  // What the preview shows, in words, for the screen reader and the layer list. t(key, vars): the page's texts.
  function quote(t, s) { return t("dk_q", { s: s }); }
  function colors(t, col) { return t("dk_cols", { a: t("dk_c_" + colorName(col[0])), b: t("dk_c_" + colorName(col[1])) }); }
  function stickerLine(t, s) { return t("dk_sk", { e: s.e, at: t("dk_at" + where(s.x, s.y)) }); }
  function layers(doc, t) {
    var out = [];
    if (doc.k === "card") { out.push({ k: "text", l: t("dk_text") + ": " + (doc.x ? quote(t, doc.x) : t("dk_empty")) }); }
    if (doc.k === "photo") { out.push({ k: "text", l: t("top") + ": " + (doc.x ? quote(t, doc.x) : t("dk_empty")) + ", " + t("bottom") + ": " + (doc.y ? quote(t, doc.y) : t("dk_empty")) }); }
    (doc.sk || []).forEach(function (s, i) { out.push({ k: "sk", i: i, l: stickerLine(t, s) }); });
    out.push({ k: "bg", l: t("dk_bg") + ": " + colors(t, doc.col) + (doc.st ? ", " + t("dk_style") + " " + t("st_" + doc.st) : "") });
    return out;
  }
  function describe(doc, t) {
    if (!doc) return "";
    var p = [], g = doc.g || {};
    if (doc.k === "card" || doc.k === "photo") {
      p.push(t(doc.k === "card" ? (doc.nr ? "dk_door" : "dk_card") : "dk_photo", { n: doc.nr }));
      layers(doc, t).forEach(function (x) { if (x.k !== "sk") p.push(x.l); });
      if (doc.w) p.push(t("dk_wx", { p: doc.w.p, lo: doc.w.lo, hi: doc.w.hi }));
      p.push(doc.sk && doc.sk.length ? t("dk_sks", { n: doc.sk.length }) + ": " + doc.sk.map(function (s) { return stickerLine(t, s); }).join(", ") : t("dk_nosk"));
    } else if (doc.k === "sound") {
      p.push(doc.m === "beat" ? t("dk_beat", { n: doc.bpm }) : t("dk_voice", { fx: t("fx_" + doc.fx) }));
      if (doc.x) p.push(t("dk_name") + ": " + quote(t, doc.x));
      p.push(colors(t, doc.col));
    } else if (doc.k === "game") {
      p.push(t("dk_game", { s: g.title || "" }), t("dk_hero") + " " + (g.emoji || ""), t("dk_world") + " " + t("w_" + g.theme));
    } else if (doc.k === "duel" && doc.a && doc.b) {
      p.push(t("dk_duel", { a: (doc.a.e + " " + (doc.a.n || t("you"))).trim(), b: (doc.b.e + " " + (doc.b.n || "")).trim() }), colors(t, doc.col));
    } else {
      // quest and turn: only what the sheet shows anyway (title, colours), never an answer or a hidden end
      if (doc.t) p.push(quote(t, doc.t));
      p.push(colors(t, doc.col));
    }
    return p.filter(Boolean).join(". ").replace(/\.\./g, ".") + ".";
  }

  var api = { LIMIT: LIMIT, MERGE: MERGE, history: history, record: record, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
    nudge: nudge, keyStep: keyStep, where: where, rgb: rgb, hexOf: hexOf, colorName: colorName, layers: layers, describe: describe };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.EditModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
