/* Weihnachtsfeier planen (biz-weihnachtsfeier, Katalog v2 V1): date poll, place poll and cost per head in one link.
   Part "turnzwei" (src/turn2.js); logic and WebCrypto, no DOM. The rule joins the turn table (Turns.GAMES), like office.js.
   Sealed votes: setting up, the organiser's device makes two P-256 key pairs (ECDH to open the answers, ECDSA to sign the
   end). Their private halves stay in that device's storage (feier-ui.js); the link carries the two public keys (x only,
   the point with the even y). Each answer is a sealed box: an ephemeral ECDH key, HKDF-SHA-256 and AES-GCM over two
   bytes, so only the organiser's device can read it. The link holds no answer in the clear and no running totals, only
   the number of answers and the latest boxes (the oldest give way when the link would get too long; the organiser's
   device keeps every box it has seen). Ending: the organiser's device publishes the totals (only from K answers on),
   signed with the poll's ECDSA key; an end without a valid signature is no move at all.
     state = [A, B, C]
       A = [neutral 0|1, dates]        dates: 2-3, day * 10 + hour slot as in turns.js, ascending
       B = [[name, access, cents per person, fixed cents], [...]]   access: bits 1 step-free, 2 accessible WC, 4 hearing
           loop; 0 none of them; 8 not known yet. The organiser has to answer it (rule: Barrierefreiheit Pflicht).
       C = [ecdh x, ecdsa x, n answers, boxes, end]   boxes: base64url, BOX characters each; end: 0, or [totals, signature]
           totals = [n, yes per date, maybe per date, votes per place, food: vegetarian, vegan, alcohol-free]
   The organiser's setup is the first move; every answer is the same three prompts again (snap: the link holds only the
   state as it is now). A hand-made link can only hold what the screen could have produced: one more box, or a signed end. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("./turns.js") : root.Turns, C = node ? require("./core.js") : root.DuellCore;
  var Q = node ? require("./quest.js") : root.Quest, O = node ? require("./office.js") : root.Office;
  var TEXT = node ? require("./feier.json") : root.FeierData;
  var K = (O && O.K) || 5, FREE = 11000, MAX_PP = 50000, MAX_FIX = 1000000, NAME = 30, DATES = [2, 3], MENU = 3, ACC = [1, 2, 4], UNK = 8;
  // A box: 32 bytes ephemeral x, 2 bytes answer, 8 bytes tag = 42 bytes, 56 base64url characters. LIMIT: bytes of the
  // sealed state, so that the whole link stays under core.js MAX_FRAGMENT with the longest names and title.
  var BOX = 56, LIMIT = 520, MAXN = 999, KEY = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/, B64 = /^[A-Za-z0-9_-]*$/, DAY = 86400000;
  var INFO = "feier-v1", END = "feier-end-v1:";

  Object.keys(TEXT).forEach(function (l) { Object.assign(Tn.T(l), TEXT[l]); });
  function T(lang) { return Tn.T(lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function say(lang, k, n, o) { return fmt(C.form(T(lang), k, n, lang), Object.assign({ n: n }, o || {})); }
  function intIn(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }
  function ints(a, n, lo, hi) { return Array.isArray(a) && a.length === n && a.every(function (x) { return intIn(x, lo, hi); }); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function money(c, lang) { return C.money(c, lang); }
  function bytes(s) { return new TextEncoder().encode(JSON.stringify(s)).length; }

  // ---------- WebCrypto: keys, boxes, the signed end ----------
  function S() { var c = root.crypto || (typeof globalThis !== "undefined" && globalThis.crypto); return c && c.subtle; }
  function b64(u) { var s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64(s) { var b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice(0, (4 - s.length % 4) % 4)); return Uint8Array.from(b, function (c) { return c.charCodeAt(0); }); }
  function cat() { var a = Array.prototype.slice.call(arguments), o = new Uint8Array(sum(a.map(function (x) { return x.length; }))), at = 0; a.forEach(function (x) { o.set(x, at); at += x.length; }); return o; }
  // The point to an x on P-256, with the even y (every key here is made with an even y, so x alone names it).
  var PP = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"), PB = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");
  function pow(b, e, m) { var r = BigInt(1); b %= m; while (e > BigInt(0)) { if (e & BigInt(1)) r = r * b % m; b = b * b % m; e >>= BigInt(1); } return r; }
  function point(x32) {
    var hex = Array.prototype.map.call(x32, function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join(""), x = BigInt("0x" + hex);
    var r = ((x * x % PP * x - BigInt(3) * x + PB) % PP + PP) % PP, y = pow(r, (PP + BigInt(1)) / BigInt(4), PP);
    if (y * y % PP !== r) return null;
    if (y & BigInt(1)) y = PP - y;
    var yh = y.toString(16).padStart(64, "0"), out = new Uint8Array(65); out[0] = 4; out.set(x32, 1);
    for (var i = 0; i < 32; i++) out[33 + i] = parseInt(yh.substr(i * 2, 2), 16);
    return out;
  }
  function pub(alg, x, use) { var p = point(unb64(x)); return p ? S().importKey("raw", p, { name: alg, namedCurve: "P-256" }, false, use) : Promise.reject(new Error("no point")); }
  function pair(alg, use) {
    return S().generateKey({ name: alg, namedCurve: "P-256" }, true, use).then(function (k) {
      return S().exportKey("raw", k.publicKey).then(function (raw) { raw = new Uint8Array(raw); return raw[64] & 1 ? pair(alg, use) : { k: k, x: raw.slice(1, 33) }; });
    });
  }
  // The organiser's keys: { pub: [ecdh x, ecdsa x], priv: { e: jwk, s: jwk } }. priv never goes into a link.
  function keys() {
    return Promise.all([pair("ECDH", ["deriveBits"]), pair("ECDSA", ["sign", "verify"])]).then(function (p) {
      return Promise.all([S().exportKey("jwk", p[0].k.privateKey), S().exportKey("jwk", p[1].k.privateKey)]).then(function (j) {
        return { pub: [b64(p[0].x), b64(p[1].x)], priv: { e: j[0], s: j[1] } };
      });
    });
  }
  function aes(shared, ex, ox, use) {
    return S().importKey("raw", shared, "HKDF", false, ["deriveKey"]).then(function (h) {
      return S().deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: cat(new TextEncoder().encode(INFO), ex, ox) }, h, { name: "AES-GCM", length: 128 }, false, [use]);
    });
  }
  // A fresh ephemeral key per box, so one AES key per box and the fixed zero IV never repeats under a key.
  var GCM = { name: "AES-GCM", iv: new Uint8Array(12), tagLength: 64 };
  function seal(ex, plain) {
    return Promise.all([pub("ECDH", ex, []), pair("ECDH", ["deriveBits"])]).then(function (r) {
      return S().deriveBits({ name: "ECDH", public: r[0] }, r[1].k.privateKey, 256).then(function (sh) { return aes(sh, r[1].x, unb64(ex), "encrypt"); })
        .then(function (k) { return S().encrypt(GCM, k, plain); }).then(function (ct) { return b64(cat(r[1].x, new Uint8Array(ct))); });
    });
  }
  // One box opened with the organiser's private ECDH key (a CryptoKey), or null if it is not one of this poll's.
  function open(priv, ex, box) {
    var u = unb64(box), x = u.slice(0, 32);
    return pub("ECDH", b64(x), []).then(function (e) { return S().deriveBits({ name: "ECDH", public: e }, priv, 256); })
      .then(function (sh) { return aes(sh, x, unb64(ex), "decrypt"); }).then(function (k) { return S().decrypt(GCM, k, u.slice(32)); })
      .then(function (p) { return new Uint8Array(p); }, function () { return null; });
  }
  function privKey(jwk, alg, use) { return S().importKey("jwk", jwk, { name: alg, namedCurve: "P-256" }, false, use); }

  // ---------- one answer in two bytes: per date yes 0 / maybe 1 / no 2 (base 3), place, three food bits ----------
  function pack(ans, place, menu) {
    var v = 0; for (var i = ans.length - 1; i >= 0; i--) v = v * 3 + ans[i];
    v |= place << 5; menu.forEach(function (x, j) { if (x) v |= 1 << (6 + j); });
    return Uint8Array.of(v & 255, v >> 8);
  }
  function unpack(u, nd) {
    if (!u || u.length !== 2) return null;
    var v = u[0] | (u[1] << 8), d = v & 31, ans = [];
    if (v >> 9 || d >= Math.pow(3, nd)) return null;
    for (var i = 0; i < nd; i++) { ans.push(d % 3); d = Math.floor(d / 3); }
    return { ans: ans, place: (v >> 5) & 1, menu: [0, 1, 2].map(function (j) { return (v >> (6 + j)) & 1; }) };
  }
  function chunks(s) { var o = []; for (var i = 0; i + BOX <= s.length; i += BOX) o.push(s.substr(i, BOX)); return o; }
  // Boxes from several links (forks of the same poll) as one list without repeats.
  function merge(a, b) { var o = chunks(a); chunks(b).forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o.join(""); }
  // The organiser's device: all boxes it has, opened; totals over the ones that are answers to this poll.
  function tally(jwk, A, C3, boxes) {
    return privKey(jwk, "ECDH", ["deriveBits"]).then(function (k) {
      return Promise.all(chunks(boxes).map(function (b) { return open(k, C3[0], b); }));
    }).then(function (all) {
      var nd = A[1].length, t = [0, A[1].map(function () { return 0; }), A[1].map(function () { return 0; }), [0, 0], [0, 0, 0]], bad = 0;
      all.forEach(function (p) {
        var a = unpack(p, nd); if (!a) { bad++; return; }
        t[0]++; a.ans.forEach(function (x, i) { if (x === 0) t[1][i]++; else if (x === 1) t[2][i]++; }); t[3][a.place]++; a.menu.forEach(function (x, i) { t[4][i] += x; });
      });
      return { totals: t, bad: bad };
    });
  }

  // ---------- the signed end: only the organiser's device can make it; a link is read only after prepare() ----------
  var SEEN = {};   // "message signature" -> true or false, filled by prepare() and by the organiser's own end
  function endMsg(seed, A, B, c, totals) { return END + JSON.stringify([seed, A, B, c[0], c[1], totals]); }
  function endKey(doc, s) { var c = s[2]; return endMsg(doc.seed, s[0], s[1], c, c[4][0]) + " " + c[4][1]; }
  function signed(doc, A, B, c) { return SEEN[endMsg(doc.seed, A, B, c, c[4][0]) + " " + c[4][1]] === true; }
  // Before a link with an end is read: check the signature once (async). true when there is nothing (more) to check.
  function prepare(doc) {
    var raw = Tn.unseal(doc && doc.q, doc && doc.seed), s = raw[0];
    if (!Array.isArray(s) || s.length !== 3 || !Array.isArray(s[2]) || !Array.isArray(s[2][4]) || typeof s[2][4][1] !== "string" || !KEY.test(String(s[2][1]))) return true;
    var key = endKey(doc, s);
    if (key in SEEN) return true;
    if (!S() || !B64.test(s[2][4][1])) { SEEN[key] = false; return true; }
    return pub("ECDSA", s[2][1], ["verify"]).then(function (k) { return S().verify({ name: "ECDSA", hash: "SHA-256" }, k, unb64(s[2][4][1]), new TextEncoder().encode(key.slice(0, key.lastIndexOf(" ")))); })
      .then(function (ok) { SEEN[key] = !!ok; }, function () { SEEN[key] = false; });
  }

  // ---------- the three parts of the state ----------
  function aOk(v) {
    if (!Array.isArray(v) || v.length !== 2 || !intIn(v[0], 0, 1)) return false;
    var d = v[1];
    return Array.isArray(d) && d.length >= DATES[0] && d.length <= DATES[1] && d.every(function (x, i) { return intIn(x, 0, 9999999) && x % 10 < Tn.HOURS.length && (!i || x > d[i - 1]); });
  }
  function placeOk(p) {
    return Array.isArray(p) && p.length === 4 && typeof p[0] === "string" && !!Q.clean(p[0], NAME) && Q.clean(p[0], NAME) === p[0] &&
      (intIn(p[1], 0, 7) || p[1] === UNK) && intIn(p[2], 0, MAX_PP) && intIn(p[3], 0, MAX_FIX);
  }
  function bOk(v) { return Array.isArray(v) && v.length === 2 && v.every(placeOk) && Q.fold(v[0][0]) !== Q.fold(v[1][0]); }
  function totalsOk(t, nd) {
    if (!Array.isArray(t) || t.length !== 5 || !intIn(t[0], K, MAXN)) return false;
    var n = t[0];
    return ints(t[1], nd, 0, n) && ints(t[2], nd, 0, n) && t[1].every(function (y, i) { return y + t[2][i] <= n; }) && ints(t[3], 2, 0, n) && sum(t[3]) === n && ints(t[4], MENU, 0, n);
  }
  function cOk(v, doc, A, B) {
    if (!Array.isArray(v) || v.length !== 5 || !KEY.test(String(v[0])) || !KEY.test(String(v[1])) || v[0] === v[1] || !intIn(v[2], 0, MAXN)) return false;
    if (typeof v[3] !== "string" || !B64.test(v[3]) || v[3].length % BOX || v[3].length / BOX > v[2]) return false;
    if (v[4] === 0) return true;
    var e = v[4];
    return Array.isArray(e) && e.length === 2 && v[3] === "" && aOk(A) && totalsOk(e[0], A[1].length) && e[0][0] === v[2] && typeof e[1] === "string" && signed(doc, A, B, v);
  }
  function ended(m) { return m.length > 0 && m[0][2][4] !== 0; }

  // check(v, doc, m, now): m is the state before this move ([] while a link is read or the organiser sets up), now the
  // answers given earlier in this move. Turns.okAnswer calls it for the prompts below.
  function checkA(v, doc, m) { return aOk(v) && (!m.length || same(v, m[0][0])); }
  function checkB(v, doc, m) { return bOk(v) && (!m.length || same(v, m[0][1])); }
  function checkC(v, doc, m, now) {
    if (!cOk(v, doc, now[0], now[1]) || bytes([[now[0], now[1], v]]) > LIMIT) return false;
    if (!m.length) return true;
    var p = m[0][2];
    if (p[4] !== 0 || v[0] !== p[0] || v[1] !== p[1]) return false;
    if (v[4] !== 0) return true;   // the end: signed by the poll's key (cOk)
    var last = v[3].slice(-BOX);   // one more box at the end; the oldest may give way
    return v[2] === p[2] + 1 && v[3].length >= BOX && chunks(p[3]).indexOf(last) < 0 && (p[3] + last).slice(-v[3].length) === v[3];
  }

  // ---------- what the totals mean (the result for everyone, the organiser's own screen) ----------
  // view: { n, dates, yes, maybe, places, votes, menu } from the setup and the totals.
  function view(A, B, t) { return { n: t[0], dates: A[1], yes: t[1], maybe: t[2], places: B, votes: t[3], menu: t[4] }; }
  function lastDay(m) { var d = m[0][0][1]; return Math.floor(d[d.length - 1] / 10); }
  // Dates by points (yes 2, maybe 1), earlier first on a tie.
  function ranked(s) {
    return s.dates.map(function (x, i) { return { s: x, i: i, yes: s.yes[i], maybe: s.maybe[i], pts: s.yes[i] * 2 + s.maybe[i] }; })
      .sort(function (a, b) { return b.pts - a.pts || a.s - b.s; });
  }
  function bestDates(s) { var r = ranked(s); return r.filter(function (x) { return x.pts === r[0].pts; }); }
  function leadPlaces(s) { var v = s.votes, top = Math.max(v[0], v[1]); return [0, 1].filter(function (i) { return v[i] === top; }); }
  // Cost per head: the price per person plus the fixed costs shared by everybody who said yes to the leading date, in whole
  // cents rounded up so the share covers the bill. Null until someone said yes.
  function perHead(place, k) { return k > 0 ? place[2] + Math.ceil(place[3] / k) : null; }
  function accText(a, lang) {
    var X = T(lang);
    if (a === UNK) return X.fei_acc_unk_l;
    if (!a) return X.fei_acc_no;
    return ACC.filter(function (b) { return a & b; }).map(function (b) { return X["fei_acc_" + ACC.indexOf(b)]; }).join(" · ");
  }
  function headLine(s, lang) {
    var X = T(lang), b = bestDates(s);
    return b.length > 1 ? fmt(X.fei_best_tie, { s: b.map(function (x) { return Tn.slotText(x.s, lang); }).join(" · ") }) : fmt(X.fei_best, { s: Tn.slotText(b[0].s, lang) });
  }
  function placeLine(s, lang) {
    var X = T(lang), l = leadPlaces(s);
    return l.length > 1 ? fmt(X.fei_place_tie, { s: s.places.map(function (p) { return p[0]; }).join(" · ") }) : fmt(X.fei_place, { s: s.places[l[0]][0], v: s.votes[l[0]] });
  }
  // The money line for one place: per head against the tax-free 110 EUR per person and party (§ 19 Abs. 1 Nr. 1a EStG).
  function costLine(place, k, lang) {
    var X = T(lang), e = perHead(place, k);
    if (e === null) return fmt(X.fei_nohead, { o: place[0] });
    var vs = e <= FREE ? fmt(X.fei_under, { f: money(FREE, lang) }) : fmt(X.fei_over, { d: money(e - FREE, lang), f: money(FREE, lang) });
    return say(lang, "fei_head", k, { o: place[0], e: money(e, lang), x: vs });
  }
  function costLines(s, lang) { var k = bestDates(s)[0].yes; return leadPlaces(s).map(function (i) { return costLine(s.places[i], k, lang); }); }
  function menuLine(s, lang) {
    var X = T(lang), w = s.menu.map(function (c, i) { return c ? fmt(X.fei_menu_item, { n: c, w: X["fei_mw_" + i] }) : ""; }).filter(Boolean);
    return w.length ? fmt(X.fei_menu, { s: w.join(", ") }) : X.fei_menu_none;
  }
  function dateLines(s, lang) { var X = T(lang); return ranked(s).map(function (x) { return fmt(X.fei_date_line, { s: Tn.slotText(x.s, lang), y: x.yes, v: x.maybe }); }); }
  function accLines(s, lang) { return leadPlaces(s).map(function (i) { return fmt(T(lang).fei_acc_line, { o: s.places[i][0], s: accText(s.places[i][1], lang) }); }); }
  // Every line of the totals, the same on the organiser's screen and in the published result. Below K: none of them.
  function lines(s, lang) {
    if (s.n < K) return [fmt(T(lang).fei_few, { n: s.n, k: K })];
    return [headLine(s, lang), placeLine(s, lang)].concat(costLines(s, lang), accLines(s, lang), dateLines(s, lang), [menuLine(s, lang), say(lang, "fei_count", s.n)]);
  }
  function endView(m) { var s = m[0]; return view(s[0], s[1], s[2][4][0]); }
  function sealedLine(m, lang) { return say(lang, "fei_sealed_n", m[0][2][2]); }

  // ---------- the prompts: the same three slots for setting up and for every answer ----------
  function prompt(w, l, check, more) { return Object.assign({ w: w, l: l, check: check }, more || {}); }
  var setup = [prompt("fei-tage", "fei_tage", checkA), prompt("fei-orte", "fei_orte", checkB), prompt("fei-start", "fei_start_l", checkC, { auto: true })];
  var answer = [
    prompt("fei-wann", "fei_wann", checkA, { peek: function (doc, m, now, lang) { return sealedLine(m, lang); } }),
    prompt("fei-wo", "fei_wo", checkB, { auto: true }),
    prompt("fei-essen", "fei_essen", checkC)
  ];
  var game = {
    snap: true, turns: [setup, answer], K: K, FREE: FREE, prepare: prepare,
    ends: function (doc, m, today) { return m.length > 0 && (ended(m) || lastDay(m) < (today == null ? Tn.today() : today)); },   // after the last date the poll is over
    words: { you_start: "fei_you", go_first: "fei_go_first", go_play: "fei_go", note_turn: "fei_note", note_over: "fei_ended", ready: "fei_ready", send: "fei_send", rematch: "fei_again" },
    face: function (doc, m, lang) {
      if (!m.length) return null;
      if (!ended(m)) return [T(lang).fei_sealed, sealedLine(m, lang)];
      var s = endView(m); return [headLine(s, lang), placeLine(s, lang)].concat(costLines(s, lang).slice(0, 1), [say(lang, "fei_count", s.n)]);
    },
    result: function (doc, m, lang) {
      var X = T(lang);
      if (!ended(m)) return { h: X.fei_lapsed, lines: [sealedLine(m, lang)] };   // the last date passed without an end
      var s = endView(m), l = lines(s, lang);
      return { h: l[0], lines: l.slice(1), note: X.fei_tax };
    }
  };

  // ---------- moves for the screen (feier-ui.js) and the tests ----------
  // Three evenings the organiser can take as they are: the first Thursdays and Fridays from two weeks on, 18:00.
  function suggest(today) {
    var out = [], six = Tn.HOURS.indexOf(18);
    for (var d = today + 14; out.length < DATES[1]; d++) { var w = new Date(d * DAY).getUTCDay(); if (w === 4 || w === 5) out.push(d * 10 + six); }
    return out;
  }
  function blank(neutral, dates, places, pubs) { return [[neutral ? 1 : 0, dates.slice()], places, [pubs[0], pubs[1], 0, "", 0]]; }
  // One answer on top of the state m (per date 0 yes, 1 maybe, 2 no; place 0 or 1; food as three 0/1): the sealed box at the
  // end, the oldest boxes dropped while the link would be too long. Resolves to the move and the new box.
  function vote(m, ans, place, menu) {
    var s = m[0];
    return seal(s[2][0], pack(ans, place, menu)).then(function (box) {
      var c = s[2].slice(); c[2] = s[2][2] + 1; c[3] = s[2][3] + box;
      while (c[3].length > BOX && bytes([[s[0], s[1], c]]) > LIMIT) c[3] = c[3].slice(BOX);
      return { move: [s[0], s[1], c], box: box };
    });
  }
  // The end: totals (from K answers on) signed with the poll's ECDSA key; this device knows its own signature is good.
  function close(doc, m, totals, jwk) {
    var s = m[0], c = s[2].slice(); c[2] = totals[0]; c[3] = ""; c[4] = [totals, ""];
    if (totals[0] < K) return Promise.reject(new Error("below K"));
    var msg = endMsg(doc.seed, s[0], s[1], c, totals);
    return privKey(jwk, "ECDSA", ["sign"]).then(function (k) { return S().sign({ name: "ECDSA", hash: "SHA-256" }, k, new TextEncoder().encode(msg)); }).then(function (sig) {
      c[4] = [totals, b64(new Uint8Array(sig))]; SEEN[msg + " " + c[4][1]] = true;
      return [s[0], s[1], c];
    });
  }
  // Days the link is still worth something: up to and including the last date (the privacy line says when it lapses).
  function daysLeft(m, today) { return m.length ? Math.max(0, lastDay(m) - today + 1) : 0; }

  if (!Tn.GAMES.feier) { Tn.GAMES.feier = game; Tn.IDS.push("feier"); }
  if (root.Turn2 && !root.Turn2.get("rule", "feier")) root.Turn2.add("rule", "feier", game);
  var api = { game: game, K: K, FREE: FREE, ACC: ACC, UNK: UNK, MENU: MENU, NAME: NAME, MAX_PP: MAX_PP, MAX_FIX: MAX_FIX, DATES: DATES, BOX: BOX, LIMIT: LIMIT,
    supported: function () { return !!S(); }, keys: keys, seal: seal, open: open, pack: pack, unpack: unpack, chunks: chunks, merge: merge, tally: tally, prepare: prepare,
    suggest: suggest, blank: blank, vote: vote, close: close, view: view, lines: lines, ranked: ranked, bestDates: bestDates, leadPlaces: leadPlaces, perHead: perHead,
    accText: accText, costLine: costLine, headLine: headLine, placeLine: placeLine, daysLeft: daysLeft, lastDay: lastDay, ended: ended };
  if (node) module.exports = api; else root.Feier = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
