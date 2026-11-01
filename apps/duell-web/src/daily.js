/* My Daily Idea: pure logic (no DOM). Runs in Node (tests) and is inlined into dist/index.html. */
(function (root) {
  "use strict";
  var C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.DuellCore;
  var DATA = typeof module !== "undefined" && module.exports ? require("./ideas.json") : root.DuellIdeas;
  var Duel = typeof module !== "undefined" && module.exports ? require("./duel.js") : root.Duel;
  var Quest = typeof module !== "undefined" && module.exports ? require("./quest.js") : root.Quest;
  var Turns = typeof module !== "undefined" && module.exports ? require("./turns.js") : root.Turns;
  var IDEAS = DATA.ideas, GATED = DATA.gated || [], BONUS_EVERY = 6, ORDER_TRIES = 200;
  var ROUND = IDEAS.filter(function (i) { return !i.on; });   // calendar ideas ("on": "MM-DD") only appear on their day
  var ROUND_KINDS = ROUND.map(function (i) { return i.kind; }).filter(function (k, i, a) { return a.indexOf(k) === i; }).sort();
  var ID_RE = /^[a-z0-9-]{1,32}$/, MAX_WALL = 30, MAX_THUMB = 60000, MAX_TEXT = 90;
  var DAY = 86400000;
  var KINDS = ["game", "photo", "sound", "card", "duel", "quest", "turn"];
  var STYLES = { card: ["druck", "zettel", "stempel", "neon"], photo: ["poster", "sticker", "meme", "glitch"] };
  var FX = ["chip", "monster", "robot", "echo"];
  var AREAS = ["text", "farbe", "stil", "sticker", "foto", "beat", "stimme", "regeln", "figur", "welt", "idee"];
  var HEX = /^#[0-9a-f]{6}$/;
  var MAX_STICKERS = 8, MAX_TRAIL = 5;

  function dayNumber(date) { return Math.floor((date instanceof Date ? date : new Date()).getTime() / DAY); }
  function byId(id) {
    var all = IDEAS.concat(GATED);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  // One shuffled round through all ideas, so nothing repeats before everything has come up once, and never the same kind
  // twice in a row, also across the seam of two rounds: each round's first kind is a pure function of its number, and a
  // round has to end on another kind than the next one starts with.
  function firstKind(round) { return ROUND_KINDS[C.hash32("daily-first-" + round) % ROUND_KINDS.length]; }
  function draftRound(round, attempt) {
    var r = C.mulberry32(C.hash32("daily-round-" + round + "-" + attempt)), mixed = ROUND.slice(), left = {}, out = [], i, j, t;
    for (i = mixed.length - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = mixed[i]; mixed[i] = mixed[j]; mixed[j] = t; }
    mixed.forEach(function (x) { (left[x.kind] = left[x.kind] || []).push(x); });
    while (out.length < ROUND.length) {
      var rest = ROUND.length - out.length, last = out.length ? out[out.length - 1].kind : "";
      var open = (out.length ? ROUND_KINDS : [firstKind(round)]).filter(function (k) { return k !== last && left[k] && left[k].length; });
      if (!open.length) return null;
      var tight = open.filter(function (k) { return left[k].length * 2 >= rest; });   // now or never: it would run out of gaps
      if (tight.length) open = tight;
      var roll = r() * open.reduce(function (a, k) { return a + left[k].length; }, 0), pick = open[open.length - 1];
      for (i = 0; i < open.length; i++) { roll -= left[open[i]].length; if (roll < 0) { pick = open[i]; break; } }
      out.push(left[pick].pop());
    }
    return out[out.length - 1].kind === firstKind(round + 1) ? null : out;
  }
  var orders = {};
  function roundOrder(round) {
    if (orders[round]) return orders[round];
    for (var a = 0; a < ORDER_TRIES && !orders[round]; a++) orders[round] = draftRound(round, a);
    return orders[round] || (orders[round] = ROUND.slice());   // only if the data itself cannot be spread, see daily.test.js
  }
  // What this device can really do right now. The shells set window.DailyCaps once a channel or a call truly works.
  function caps() {
    var w = root.DailyCaps && typeof root.DailyCaps === "object" ? root.DailyCaps : {};
    return { crypto: w.crypto !== false && Quest.supported(), channel: w.channel === true, call: w.call === true };
  }
  function available(idea, c) {
    c = c || caps();
    return !!idea && (idea.needs || []).every(function (x) { return c[x] === true; });
  }
  function docAvailable(doc, c) {
    c = c || caps();
    if (doc.k === "quest" && !c.crypto) return false;
    if (doc.k === "duel" && doc.m === "deck" && !c.call) return false;
    return !doc.i || available(byId(doc.i), c);
  }
  function baseIdea(n) { var len = ROUND.length; return roundOrder(Math.floor(n / len))[((n % len) + len) % len]; }
  function calendarIdea(n) {
    var md = C.dailyKey(new Date(n * DAY)).slice(5);
    for (var k = 0; k < IDEAS.length; k++) if (IDEAS[k].on === md) return IDEAS[k];
    return null;
  }
  // Everyone sees the same day; a device only departs from it where it must. The round already keeps kinds apart, so a
  // day needs a stand-in only if it cannot run here or sits next to a calendar idea of its kind. A stand-in and a bonus
  // from the gated list look at the day shown before and the day planned after, which keeps the rule on every device.
  function ideaOn(n, c) {
    var cal = calendarIdea(n);
    if (cal && available(cal, c)) return cal;
    var base = baseIdea(n), nextCal = calendarIdea(n + 1), prevCal = calendarIdea(n - 1), next = (nextCal || baseIdea(n + 1)).kind;
    var clash = (nextCal && nextCal.kind === base.kind) || (prevCal && prevCal.kind === base.kind);
    var mustMove = !available(base, c) || clash;
    var extra = C.hash32("bonus-" + n) % BONUS_EVERY === 0 ? GATED.filter(function (x) { return available(x, c); }) : [];
    if (!mustMove && !extra.length) return base;
    var prev = ideaOn(n - 1, c).kind;
    var fits = function (x) { return x.kind !== prev && x.kind !== next; };
    var bonus = extra.filter(fits);
    if (bonus.length) return bonus[C.hash32("pick-" + n) % bonus.length];
    if (!mustMove) return base;
    var runnable = ROUND.filter(function (x) { return available(x, c); }), pool = runnable.filter(fits);
    if (!pool.length) pool = runnable;
    return pool.length ? pool[C.hash32("swap-" + n) % pool.length] : null;
  }
  function ideaForDay(date, c) { return ideaOn(dayNumber(date), c || caps()); }
  function dayDate(date, back) { return new Date((dayNumber(date) - (back || 0)) * DAY); }
  function lastDays(date, n) {
    var out = [];
    for (var i = 1; i <= n; i++) { var d = dayDate(date, i); out.push({ date: d, key: C.dailyKey(d), idea: ideaForDay(d) }); }
    return out;
  }
  function randomIdea(rnd, notId) {
    var pool = ROUND.concat(GATED).filter(function (i) { return i.id !== notId && available(i); });
    return pool[Math.floor(rnd() * pool.length)];
  }
  function paperIndex(idea, count) { return C.hash32("paper-" + idea.id) % count; }

  // ---------- links ----------
  function sanitizeId(id) { return typeof id === "string" && ID_RE.test(id) && byId(id) ? id : null; }
  // #i=<id> is the plain invite. {v:1,i:id} or {v:1,d:doc} inside #c= pass through hosts that only forward c=.
  function parseRoute(hash) {
    if (typeof hash !== "string") return null;
    var s = hash.replace(/^#/, ""), m = s.match(/(?:^|&)i=([^&]*)/);
    if (m) { var id = sanitizeId(m[1]); return id ? { type: "idea", id: id } : null; }
    var sh = s.match(/^s=([2-9a-km-np-zA-HJ-NP-Z]{8})$/);        // short link opened in an app shell, see shortlink.js
    if (sh) return { type: "short", id: sh[1] };
    var c = s.match(/(?:^|&)c=([^&]*)/);
    if (!c) return null;
    try {
      if (c[1].length <= C.MAX_FRAGMENT && /^[A-Za-z0-9_-]+$/.test(c[1])) {
        var raw = JSON.parse(fromB64(c[1]));
        if (raw && raw.v === 1 && raw.d !== undefined) { var doc = sanitizeDoc(raw.d); return doc ? { type: "doc", doc: doc } : null; }
        if (raw && raw.v === 1 && raw.i !== undefined) { var cid = sanitizeId(raw.i); return cid ? { type: "idea", id: cid } : null; }
      }
    } catch (e) { return null; }
    var st = C.decodeState(c[1]);
    return st ? { type: "challenge", state: st } : null;
  }
  function toB64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64(s) {
    var b = s.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(b + "===".slice(0, (4 - b.length % 4) % 4));
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, function (x) { return x.charCodeAt(0); }));
  }
  function inviteUrl(id, viaHost) {
    if (!sanitizeId(id)) throw new Error("unknown idea");
    if (!viaHost) return C.SHARE_BASE + "#i=" + id;
    return C.SHARE_BASE + "#c=" + toB64(JSON.stringify({ v: 1, i: id }));
  }
  // Challenge links never carry a name any more; old links with one still open.
  function challengeUrl(state, score) {
    var st = Object.assign({}, state);
    delete st.name;
    st.score = score;
    return C.buildUrl(st);
  }

  // ---------- user text ----------
  function cleanInput(s, max) {
    var t = Array.from(String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max || MAX_TEXT).join("").trim();
    return t && C.isClean(t) ? t : "";
  }

  // ---------- my style (local only) ----------
  function sanitizeColors(c, def) {
    return Array.isArray(c) && c.length === 2 && HEX.test(c[0]) && HEX.test(c[1]) ? [c[0], c[1]] : def;
  }
  var SETS = {
    tiere: ["🐸", "🦆", "🐙", "🦝", "🐌", "🦖"], essen: ["🍕", "🌮", "🍩", "🥨", "🍟", "🧃"],
    weltall: ["🚀", "🛸", "👽", "🪐", "🌟", "☄️"], chaos: ["💥", "🔥", "💀", "🤡", "🌀", "⚡"],
    grusel: ["🎃", "👻", "🦇", "🕷️", "🧛", "🕸️"]
  };
  function sanitizeProfile(p) {
    p = p && typeof p === "object" ? p : {};
    return {
      nick: C.sanitizeName(p.nick) , emoji: typeof p.emoji === "string" ? C.sanitizeEmoji(p.emoji) : "🐸",
      colors: sanitizeColors(p.colors, ["#ffd400", "#ff3b1d"]), set: SETS[p.set] ? p.set : "tiere"
    };
  }

  // ---------- creation ("doc"): what the editor changes and what travels in a link ----------
  function num(v, r, d) { return Math.round(C.clampNum(v, r[0], r[1], d)); }
  function txt(v, max) { return cleanInput(v, max); }
  function steps(v) { return typeof v === "string" && /^[x-]{16}$/.test(v) ? v : "----------------"; }
  function sanitizeStickers(a) {
    return (Array.isArray(a) ? a : []).slice(0, MAX_STICKERS).map(function (s) {
      var f = function (v, a, b, d) { return Math.round(C.clampNum(v, a, b, d) * 1000) / 1000; };
      return s && typeof s === "object" ? { e: C.sanitizeEmoji(s.e), x: f(s.x, 0, 1, 0.5), y: f(s.y, 0, 1, 0.5), r: f(s.r, -3.14, 3.14, 0), z: f(s.z, 0.5, 2.5, 1) } : null;
    }).filter(Boolean);
  }
  // Weather strip: figures from the weather service only; no wish and no model can set it. The card always names the source.
  function sanitizeWeather(o) {
    if (!o || typeof o !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(o.d)) return null;
    var p = txt(o.p, 32), hi = C.clampNum(o.hi, -60, 60, NaN), lo = C.clampNum(o.lo, -60, 60, NaN);
    if (!p || isNaN(hi) || isNaN(lo)) return null;
    return { p: p, d: o.d, hi: Math.round(hi), lo: Math.round(lo), rn: Math.round(C.clampNum(o.rn, 0, 100, 0)), c: Math.round(C.clampNum(o.c, 0, 99, 0)) };
  }
  function sanitizeTrail(a) {
    return (Array.isArray(a) ? a : []).map(function (e) {
      if (!e || typeof e !== "object") return null;
      var w = (Array.isArray(e.w) ? e.w : []).filter(function (x) { return AREAS.indexOf(x) >= 0; }).slice(0, AREAS.length);
      return w.length ? { n: C.sanitizeName(e.n), w: w } : null;
    }).filter(Boolean).slice(-MAX_TRAIL);
  }
  function sanitizeDoc(o) {
    if (!o || typeof o !== "object" || KINDS.indexOf(o.k) < 0) return null;
    var d = { k: o.k, col: sanitizeColors(o.col, ["#ffd400", "#ff3b1d"]), by: sanitizeTrail(o.by) };
    var id = sanitizeId(o.i); if (id) d.i = id;
    var t = txt(o.t, 40), s = txt(o.s, 70), n = C.sanitizeName(o.n);
    if (t) d.t = t; if (s) d.s = s; if (n) d.n = n;    // t/s: an own idea of the day, n: who made it
    if (o.k === "card") {
      d.x = txt(o.x, MAX_TEXT); d.st = STYLES.card.indexOf(o.st) >= 0 ? o.st : "druck"; d.sk = sanitizeStickers(o.sk);
      var w = sanitizeWeather(o.w); if (w) d.w = w;
    } else if (o.k === "photo") {
      d.x = txt(o.x, 28); d.y = txt(o.y, 28); d.st = STYLES.photo.indexOf(o.st) >= 0 ? o.st : "poster"; d.sk = sanitizeStickers(o.sk);
    } else if (o.k === "sound") {
      d.m = o.m === "voice" ? "voice" : "beat"; d.x = txt(o.x, 28); d.fx = FX.indexOf(o.fx) >= 0 ? o.fx : "chip"; d.bpm = num(o.bpm, [70, 170], 110);
      d.p = { k: steps(o.p && o.p.k), s: steps(o.p && o.p.s), h: steps(o.p && o.p.h), b: steps(o.p && o.p.b) };
    } else if (o.k === "duel") {
      Duel.sanitize(o, d);
    } else if (o.k === "quest") {
      Quest.sanitize(o, d);
    } else if (o.k === "turn") {
      Turns.sanitize(o, d);
    } else {
      var g = C.sanitizeState({ v: 1, seed: o.g && o.g.seed, params: o.g && o.g.params, theme: o.g && o.g.theme, title: o.g && o.g.title, emoji: o.g && o.g.emoji, look: o.g && o.g.look });
      d.g = { seed: g.seed, params: g.params, theme: g.theme, title: g.title, emoji: g.emoji };
      if (g.look) d.g.look = g.look;
    }
    return d;
  }
  function docFromIdea(idea, profile, lang) {
    var L = idea[lang] || idea.de, plain = L.t.replace("|", " ").trim(), base = { k: idea.kind, i: idea.id, col: profile.colors, by: [] };
    if (idea.kind === "card") { base.x = L.lines[0]; base.st = idea.style || "druck"; base.sk = []; if (idea.col) base.col = idea.col; }
    if (idea.kind === "photo") { base.x = L.top; base.y = L.bottom; base.st = idea.photo.mode; base.sk = []; }
    if (idea.kind === "sound") { var s = idea.sound; base.m = s.mode; base.x = plain.slice(0, 28); base.fx = s.fx || "chip"; base.bpm = s.bpm || 110; base.p = { k: s.k || "x---x---x---x---", s: s.s || "----x-------x---", h: s.h || "x-x-x-x-x-x-x-x-", b: s.b || "----------------" }; }
    if (idea.kind === "game") { var g = idea.game; base.g = { seed: g.seed, params: g.params, theme: g.theme, title: plain, emoji: g.emoji, look: g.look }; }
    if (idea.kind === "duel") Duel.fromIdea(idea, profile, lang, base);
    if (idea.kind === "quest") Quest.fromIdea(idea, lang, base);
    if (idea.kind === "turn") Turns.fromIdea(idea, lang, base);
    return sanitizeDoc(base);
  }
  function blankDoc(kind, profile, lang) {
    var pool = IDEAS.filter(function (i) { return i.kind === kind; }), d = docFromIdea(pool[0], profile, lang);
    delete d.i; d.t = ""; return d;
  }
  // Which parts differ, in the words the trail shows. The picture itself is never in the doc, so "foto" comes from the editor.
  function changedAreas(a, b) {
    var w = [];
    function ne(x, y) { return JSON.stringify(x) !== JSON.stringify(y); }
    if (a.x !== b.x || a.y !== b.y || ne(a.w, b.w)) w.push("text");
    if (ne(a.col, b.col)) w.push("farbe");
    if (a.st !== b.st) w.push("stil");
    if (ne(a.sk, b.sk)) w.push("sticker");
    if (ne(a.p, b.p) || a.bpm !== b.bpm) w.push("beat");
    if (a.fx !== b.fx) w.push("stimme");
    if (a.t !== b.t || a.s !== b.s) w.push("idee");
    if (a.e !== b.e || a.f !== b.f) w.push("figur");
    if (ne(a.a, b.a) || ne(a.b, b.b) || a.w !== b.w || a.q !== b.q) w.push("regeln");
    if (a.g && b.g) {
      if (ne(a.g.params, b.g.params)) w.push("regeln");
      if (a.g.emoji !== b.g.emoji) w.push("figur");
      if (a.g.theme !== b.g.theme || ne(a.g.look, b.g.look)) w.push("welt");
      if (a.g.title !== b.g.title) w.push("text");
    }
    return w;
  }
  function withTrail(doc, nick, areas) {
    var d = sanitizeDoc(doc);
    if (areas.length) d.by = sanitizeTrail(d.by.concat([{ n: nick, w: areas }]));
    return d;
  }
  // Never over the size the page itself accepts: stickers, then the oldest trail, give way first.
  function docUrl(doc) {
    var d = sanitizeDoc(doc), enc = function () { return toB64(JSON.stringify({ v: 1, d: d })); };
    while (enc().length > C.MAX_FRAGMENT && d.sk && d.sk.length) d.sk.pop();
    while (enc().length > C.MAX_FRAGMENT && d.by.length) d.by.shift();
    if (enc().length > C.MAX_FRAGMENT) delete d.s;
    if (enc().length > C.MAX_FRAGMENT) delete d.t;
    return C.SHARE_BASE + "#c=" + enc();
  }

  // ---------- wall ----------
  function sanitizeWall(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (e) {
      return e && typeof e === "object" && (sanitizeId(e.id) || e.id === "own") && typeof e.ts === "number" &&
        typeof e.th === "string" && e.th.length <= MAX_THUMB && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(e.th);
    }).slice(0, MAX_WALL).map(function (e) { return { id: e.id, ts: e.ts, th: e.th }; });
  }
  function addToWall(list, entry) { return sanitizeWall([entry].concat(list)); }

  // Every text a person can read in an idea, for the content check.
  function ideaStrings(idea) {
    var out = [];
    (function walk(v, key) {
      if (typeof v === "string") { if (["id", "kind", "mode", "fx", "theme", "k", "s", "h", "b", "emoji"].indexOf(key) < 0 || /[A-Z ]/.test(v)) out.push(v); }
      else if (Array.isArray(v)) v.forEach(function (x) { walk(x, key); });
      else if (v && typeof v === "object") Object.keys(v).forEach(function (k) { walk(v[k], k); });
    })(idea, "");
    return out;
  }

  var api = {
    IDEAS: IDEAS, ROUND: ROUND, GATED: GATED, roundOrder: roundOrder, KINDS: KINDS, caps: caps, available: available, docAvailable: docAvailable, MAX_WALL: MAX_WALL, byId: byId, dayNumber: dayNumber, ideaForDay: ideaForDay, dayDate: dayDate, lastDays: lastDays,
    randomIdea: randomIdea, paperIndex: paperIndex, sanitizeId: sanitizeId, parseRoute: parseRoute, inviteUrl: inviteUrl, challengeUrl: challengeUrl,
    cleanInput: cleanInput, sanitizeProfile: sanitizeProfile, sanitizeDoc: sanitizeDoc, docFromIdea: docFromIdea, blankDoc: blankDoc,
    changedAreas: changedAreas, withTrail: withTrail, docUrl: docUrl, SETS: SETS, STYLES: STYLES, FX: FX, MAX_STICKERS: MAX_STICKERS, sanitizeWall: sanitizeWall, addToWall: addToWall, ideaStrings: ideaStrings
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Daily = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
