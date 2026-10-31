/* "Ruf mich an, wenn du mich wirklich kennst": the rules, without DOM. The quiz is a game and proves nothing:
   whoever holds the link can work the answers out, so answers exist only as short salted tags, and passing only
   lets someone ask. What opens a channel to a call is the creator's own tap, and no other path leads there. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var C = node ? require("./core.js") : root.DuellCore;
  var D = node ? require("./daily.js") : root.Daily;

  var V = 1, QUESTIONS = 3, MAX_Q = 60, MAX_A = 30, TRIES = 3, TTL_MS = 10 * 60 * 1000, ASK_MS = 60 * 1000, MAX_LINK = 1500, MAX_SEEN = 30;
  var HEX = /^#[0-9a-fA-F]{6}$/, ID = /^[a-z0-9]{8}$/;
  var PHONE = /\+?\d[\d\s\/().-]{5,}\d/, PLACE = /https?:|www\.|@|\b\d{5}\b/i;

  // Numbers, addresses and handles have no place on a card that many people could forward.
  function clean(s, max) {
    var t = D.cleanInput(s, max);
    return t && !PHONE.test(t) && !PLACE.test(t) ? t : "";
  }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  // 16 bits on purpose: enough for a game, too little to read an answer back with certainty.
  function tag(salt, i, answer) { return C.hash32(salt + "|" + i + "|" + norm(answer)) & 0xffff; }
  function rid(rand) { var s = ""; while (s.length < 8) s += Math.floor(rand() * 36).toString(36); return s; }

  function create(o, now, rand) {
    var r = rand || Math.random, list = Array.isArray(o.qs) ? o.qs : [];
    if (list.length !== QUESTIONS) return null;
    var id = rid(r), salt = rid(r), q = [];
    for (var i = 0; i < QUESTIONS; i++) {
      var t = clean(list[i] && list[i].q, MAX_Q), a = clean(list[i] && list[i].a, MAX_A);
      if (!t || !a || !norm(a)) return null;
      q.push({ t: t, h: tag(salt, i, a) });
    }
    var c = { v: V, id: id, s: salt, x: now + TTL_MS, n: C.sanitizeName(o.nick), e: C.sanitizeEmoji(o.emoji), col: Array.isArray(o.col) && HEX.test(o.col[0]) && HEX.test(o.col[1]) ? [o.col[0], o.col[1]] : ["#ffd400", "#ff3b1d"], q: q };
    return c;
  }
  function b64(s) { return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64(s) { var b = s.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(b + "===".slice(0, (4 - b.length % 4) % 4)); return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, function (x) { return x.charCodeAt(0); })); }
  function encode(c) { var e = b64(JSON.stringify(c)); return e.length <= MAX_LINK ? e : null; }
  // Everything is checked again: a link can say anything.
  function decode(s) {
    try {
      if (typeof s !== "string" || s.length > MAX_LINK || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
      var o = JSON.parse(unb64(s));
      if (!o || o.v !== V || !ID.test(o.id) || !ID.test(o.s) || !Number.isInteger(o.x) || !Array.isArray(o.q) || o.q.length !== QUESTIONS) return null;
      if (!Array.isArray(o.col) || !HEX.test(o.col[0]) || !HEX.test(o.col[1]) || o.col.length !== 2) return null;
      var q = o.q.map(function (e) { var t = e && clean(e.t, MAX_Q); return t && t === e.t && Number.isInteger(e.h) && e.h >= 0 && e.h <= 0xffff ? { t: t, h: e.h } : null; });
      if (q.some(function (e) { return !e; })) return null;
      return { v: V, id: o.id, s: o.s, x: o.x, n: C.sanitizeName(o.n), e: C.sanitizeEmoji(o.e), col: [o.col[0], o.col[1]], q: q };
    } catch (e) { return null; }
  }
  function score(c, answers) {
    var n = 0;
    c.q.forEach(function (e, i) { if (norm(answers[i]) && tag(c.s, i, answers[i]) === e.h) n += 1; });
    return n;
  }
  // Tries are kept on this device. Clearing them is possible, which is one more reason this is only a game.
  function tries(book, id) { var e = book && book[id]; return e && typeof e.n === "number" ? e.n : 0; }
  function answer(card, answers, book, now) {
    if (now >= card.x) return { state: "expired" };
    var e = book[card.id] || { n: 0, x: card.x };
    if (e.done) return { state: "used" };
    if (e.n >= TRIES) return { state: "locked", left: 0 };
    var hit = score(card, answers);
    e.n += 1; book[card.id] = e;
    Object.keys(book).sort(function (a, b) { return book[a].x - book[b].x; }).slice(0, Math.max(0, Object.keys(book).length - MAX_SEEN)).forEach(function (k) { delete book[k]; });
    if (hit === QUESTIONS) { e.done = true; return { state: "passed", hit: hit }; }
    return { state: e.n >= TRIES ? "locked" : "wrong", hit: hit, left: TRIES - e.n };
  }

  // The creator's side. Only `tap` can reach "accepted": a request, a repeat, a timeout or a peer's word cannot.
  function gate() {
    var s = { state: "wait", askedAt: 0, who: "" };
    return {
      state: function () { return s.state; },
      who: function () { return s.who; },
      request: function (nick, now) {
        if (s.state !== "wait") return false;
        s.state = "asked"; s.askedAt = now; s.who = C.sanitizeName(nick); return true;
      },
      tap: function (choice) {
        if (s.state !== "asked" && !(choice === "block" && s.state !== "blocked")) return false;
        s.state = choice === "accept" ? "accepted" : choice === "block" ? "blocked" : "declined"; return true;
      },
      tick: function (now) { if (s.state === "asked" && now - s.askedAt >= ASK_MS) { s.state = "declined"; return true; } return false; },
      expire: function () { if (s.state === "wait") { s.state = "expired"; return true; } return false; }
    };
  }
  function frame(a, nick) { var f = { v: V, t: "cc", a: a }; if (a === "req") f.n = C.sanitizeName(nick); return JSON.stringify(f); }
  function parseFrame(str) {
    try {
      if (typeof str !== "string" || str.length > 200) return null;
      var f = JSON.parse(str);
      if (!f || f.v !== V || f.t !== "cc" || ["req", "ok", "no"].indexOf(f.a) < 0) return null;
      return { a: f.a, n: f.a === "req" ? C.sanitizeName(f.n) : "" };
    } catch (e) { return null; }
  }

  var api = { QUESTIONS: QUESTIONS, MAX_Q: MAX_Q, MAX_A: MAX_A, TRIES: TRIES, TTL_MS: TTL_MS, ASK_MS: ASK_MS, clean: clean, create: create, encode: encode, decode: decode, score: score, tries: tries, answer: answer, gate: gate, frame: frame, parseFrame: parseFrame };
  if (node) module.exports = api;
  else root.CallCard = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
