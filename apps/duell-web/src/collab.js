/* Zusammen bauen: the sync protocol, without DOM and without a transport. Runs in Node (tests) and in the page.
   One frame is one JSON object. Everything inbound is untrusted: shape, size and rate are checked here, text goes
   through the same filter as typing, and the result is plain data. Nothing here produces markup.
   Convergence: last writer wins per field by (lamport, actor), stickers by id with permanent tombstones, and a digest
   that repairs whatever got lost. Sending the full state is safe at any time because every op is idempotent. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var C = node ? require("./core.js") : root.DuellCore;
  var D = node ? require("./daily.js") : root.Daily;

  var V = 1;
  var MAX_FRAME = 16 * 1024;       // bytes; half of the channel's 32 KiB envelope, the wrapper must fit too
  var MAX_OPS = 512;               // ops in one frame
  var MAX_IDS = 400;               // sticker ids a session may hold, live and deleted
  var LOCAL_IDS = 340;             // this side stops adding here, so two honest peers never reach MAX_IDS
  var MAX_IN_PER_MIN = 120;        // same as the channel's inbound limit (policy.rs)
  var BUCKET = 10, REFILL_PER_S = 1.6;   // at most 106 frames in any minute, so the channel never drops one for rate
  var FLUSH_MS = 250, DIGEST_MS = 3000, FULL_MIN_MS = 2000, GONE_MS = 11000;
  var MAX_JUMP = 1000000, MAX_CLOCK = 1099511627776;   // a peer cannot jump the clock out of reach
  var ACTOR = /^[a-z0-9]{4,12}$/, STICKER = /^[0-9]{1,13}\.[a-z0-9]{4,12}$/;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var TRACKS = ["k", "s", "h", "b"];

  function text(max) { return function (v) { return typeof v === "string" && (v === "" || D.cleanInput(v, max) === v); }; }
  function oneOf(list) { return function (v) { return list.indexOf(v) >= 0; }; }
  function range(a, b) { return function (v) { return typeof v === "number" && isFinite(v) && v >= a && v <= b; }; }
  function pair(v) { return Array.isArray(v) && v.length === 2 && HEX.test(v[0]) && HEX.test(v[1]); }
  function step(v) { return v === "x" || v === "-"; }
  function trail(v) { return Array.isArray(v) && JSON.stringify(D.sanitizeDoc({ k: "card", by: v }).by) === JSON.stringify(v); }
  function name(v) { return typeof v === "string" && (v === "" || C.sanitizeName(v) === v); }

  // The fields of one kind. A key that is not listed here cannot enter the state.
  function rules(kind) {
    var r = { t: text(40), s: text(70), n: name, col: pair, by: trail };
    if (kind === "card") { r.x = text(90); r.st = oneOf(D.STYLES.card); }
    else if (kind === "photo") { r.x = text(28); r.y = text(28); r.st = oneOf(D.STYLES.photo); }
    else if (kind === "sound") {
      r.x = text(28); r.fx = oneOf(D.FX); r.bpm = range(70, 170);
      TRACKS.forEach(function (t) { for (var i = 0; i < 16; i++) r["p." + t + "." + i] = step; });
    } else {
      r["g.seed"] = function (v) { return C.sanitizeSeed(v) === v; };
      r["g.theme"] = oneOf(C.THEME_NAMES);
      r["g.title"] = function (v) { return typeof v === "string" && C.sanitizeTitle(v) === v; };
      r["g.emoji"] = function (v) { return typeof v === "string" && C.sanitizeEmoji(v) === v; };
      Object.keys(C.RANGES).forEach(function (k) { r["g.params." + k] = range(C.RANGES[k][0], C.RANGES[k][1]); });
    }
    return r;
  }
  function flatten(raw) {
    var d = D.sanitizeDoc(raw), f = { t: d.t || "", s: d.s || "", n: d.n || "", col: d.col, by: d.by };
    if (d.k === "card" || d.k === "photo") { f.x = d.x; f.st = d.st; if (d.k === "photo") f.y = d.y; }
    else if (d.k === "sound") {
      f.x = d.x; f.fx = d.fx; f.bpm = d.bpm;
      TRACKS.forEach(function (t) { for (var i = 0; i < 16; i++) f["p." + t + "." + i] = d.p[t][i]; });
    } else {
      f["g.seed"] = d.g.seed; f["g.theme"] = d.g.theme; f["g.title"] = d.g.title; f["g.emoji"] = d.g.emoji;
      Object.keys(d.g.params).forEach(function (k) { f["g.params." + k] = d.g.params[k]; });
    }
    return f;
  }
  function assign(doc, key, val) {
    var p = key.split(".");
    if (p[0] === "p") { var s = doc.p[p[1]], i = Number(p[2]); doc.p[p[1]] = s.slice(0, i) + val + s.slice(i + 1); }
    else if (p[0] === "g" && p[1] === "params") doc.g.params[p[2]] = val;
    else if (p[0] === "g") doc.g[p[1]] = val;
    else doc[key] = Array.isArray(val) ? val.slice() : val;
  }
  function same(a, b) { return a === b || JSON.stringify(a) === JSON.stringify(b); }
  function wins(l, a, cur) { return !cur || l > cur.l || (l === cur.l && a > cur.a); }
  function shape(s) { var o = D.sanitizeDoc({ k: "card", sk: [s] }).sk[0]; return o ? { e: o.e, x: o.x, y: o.y, r: o.r, z: o.z } : null; }
  function bytes(s) { return new TextEncoder().encode(s).length; }
  function birth(id) { return Number(id.split(".")[0]); }
  function byBirth(a, b) { return birth(a) - birth(b) || (a < b ? -1 : a > b ? 1 : 0); }

  // o: { actor, send(string), onPeer(), nick, emoji }. All time comes in through `now`, so tests control it.
  function create(o) {
    var s = {
      meta: null, fields: {}, stickers: {}, dead: {}, clock: 0, known: {}, view: {}, shown: [], outbox: {}, order: [],
      peer: null, peerSeen: -1, up: false, tokens: BUCKET, refilled: 0, lastFlush: -Infinity, lastDigest: -Infinity, lastFull: -Infinity,
      arrivals: [], dirty: false, rejected: 0, helloDue: false
    };
    var actor = o.actor, ids = new WeakMap();

    function queue(k, op) { if (!(k in s.outbox)) s.order.push(k); s.outbox[k] = op; }
    function idCount() { return Object.keys(s.stickers).length + Object.keys(s.dead).length; }
    function tick() { if (s.clock < MAX_CLOCK) s.clock += 1; return s.clock; }
    function visible() { return Object.keys(s.stickers).sort(byBirth).slice(0, D.MAX_STICKERS); }

    function setLocal(key, val) {
      var e = { v: val, l: tick(), a: actor }; s.fields[key] = e;
      queue("f" + key, ["f", key, val, e.l, e.a]);
    }
    function putSticker(id, g) {
      var e = { g: g, l: tick(), a: actor }; s.stickers[id] = e;
      queue("s" + id, ["s", id, g, e.l, e.a]);
    }
    function kill(id) {
      var l = tick(); delete s.stickers[id]; s.dead[id] = l;
      delete s.outbox["s" + id];
      queue("d" + id, ["d", id, l]);
    }
    function fullOps() {
      var out = [];
      Object.keys(s.fields).forEach(function (k) { var e = s.fields[k]; out.push(["f" + k, ["f", k, e.v, e.l, e.a]]); });
      Object.keys(s.stickers).forEach(function (k) { var e = s.stickers[k]; out.push(["s" + k, ["s", k, e.g, e.l, e.a]]); });
      Object.keys(s.dead).forEach(function (k) { out.push(["d" + k, ["d", k, s.dead[k]]]); });
      return out;
    }
    function hash() {
      var p = [];
      Object.keys(s.fields).sort().forEach(function (k) { var e = s.fields[k]; p.push("f", k, JSON.stringify(e.v), e.l, e.a); });
      Object.keys(s.stickers).sort().forEach(function (k) { var e = s.stickers[k]; p.push("s", k, JSON.stringify(e.g), e.l, e.a); });
      Object.keys(s.dead).sort().forEach(function (k) { p.push("d", k); });
      return C.hash32(p.join("\u0001")) >>> 0;
    }
    function frame(t, extra) {
      var f = { v: V, t: t, d: s.meta };
      Object.keys(extra || {}).forEach(function (k) { f[k] = extra[k]; });
      return f;
    }
    function who() { return { h: hash(), n: C.sanitizeName(o.nick()), e: C.sanitizeEmoji(o.emoji()), id: actor }; }

    function apply(op, rule) {
      var kind = op[0], id = op[1];
      if (kind === "f") {
        var l = op[3], a = op[4];
        if (op.length !== 5 || !Object.prototype.hasOwnProperty.call(rule, id) || !rule[id](op[2]) || !okStamp(l, a)) return false;
        s.clock = Math.max(s.clock, l);
        if (wins(l, a, s.fields[id])) { s.fields[id] = { v: op[2], l: l, a: a }; s.dirty = true; }
        return true;
      }
      if (typeof id !== "string" || !STICKER.test(id)) return false;
      if (kind === "s") {
        var g = op[2], lg = op[3], ag = op[4];
        if (op.length !== 5 || !g || typeof g !== "object" || !okStamp(lg, ag)) return false;
        var clean = shape(g);
        if (!clean || !same(clean, { e: g.e, x: g.x, y: g.y, r: g.r, z: g.z })) return false;
        if (s.dead[id]) return true;                                 // deleted stays deleted, whatever arrives later
        if (!s.stickers[id] && idCount() >= MAX_IDS) return false;
        s.clock = Math.max(s.clock, lg);
        if (wins(lg, ag, s.stickers[id])) { s.stickers[id] = { g: clean, l: lg, a: ag }; s.dirty = true; }
        return true;
      }
      if (kind === "d") {
        if (op.length !== 3 || !okClock(op[2])) return false;
        if (!s.stickers[id] && !s.dead[id] && idCount() >= MAX_IDS) return false;
        s.clock = Math.max(s.clock, op[2]);
        if (s.stickers[id]) { delete s.stickers[id]; s.dirty = true; }
        s.dead[id] = Math.max(s.dead[id] || 0, op[2]);
        return true;
      }
      return false;
    }
    function okClock(l) { return Number.isInteger(l) && l >= 1 && l <= MAX_CLOCK && l <= s.clock + MAX_JUMP; }
    function okStamp(l, a) { return okClock(l) && typeof a === "string" && ACTOR.test(a); }
    function okMeta(m) {
      if (!m || typeof m !== "object" || D.KINDS.indexOf(m.k) < 0) return false;
      if (m.k === "sound" ? m.m !== "beat" && m.m !== "voice" : m.m !== undefined) return false;
      if (m.i !== undefined && D.sanitizeId(m.i) !== m.i) return false;
      return !s.meta || (s.meta.k === m.k && s.meta.m === m.m && s.meta.i === m.i);
    }
    function asksFull(now, theirs) {
      if (theirs === hash() || now - s.lastFull < FULL_MIN_MS) return;
      s.lastFull = now;
      fullOps().forEach(function (e) { queue(e[0], e[1]); });
    }

    var api = {
      actor: actor, MAX_FRAME: MAX_FRAME,
      // The inviter's starting point. The same doc object is the one `local` and `applyTo` work on.
      seed: function (doc) {
        s.meta = { k: doc.k }; if (doc.m) s.meta.m = doc.m; if (doc.i) s.meta.i = doc.i;
        var f = flatten(doc);
        Object.keys(f).forEach(function (k) { setLocal(k, f[k]); s.view[k] = f[k]; });
        s.shown = [];
        (doc.sk || []).forEach(function (g) { var id = tick() + "." + actor; ids.set(g, id); putSticker(id, shape(g)); s.shown.push(id); });
      },
      // After every local edit: what differs from the last view becomes ops.
      local: function (doc) {
        var f = flatten(doc), changed = false;
        Object.keys(f).forEach(function (k) { if (!same(f[k], s.view[k])) { setLocal(k, f[k]); s.view[k] = f[k]; changed = true; } });
        if (doc.sk) {
          var seen = {};
          doc.sk.forEach(function (g) {
            var id = ids.get(g), now = shape(g);
            // Undo rebuilds the list from a copy: same sticker, new object.
            if (!id) { id = s.shown.filter(function (k) { return !seen[k] && s.stickers[k] && same(s.stickers[k].g, now); })[0]; if (id) ids.set(g, id); }
            if (!id) {
              if (idCount() >= LOCAL_IDS) { s.dirty = true; return; }
              id = tick() + "." + actor; ids.set(g, id); putSticker(id, now); s.shown.push(id); changed = true;
            } else if (s.stickers[id] && !same(s.stickers[id].g, now)) { putSticker(id, now); changed = true; }
            seen[id] = 1;
          });
          s.shown.slice().forEach(function (id) { if (!seen[id] && s.stickers[id]) { kill(id); changed = true; } });
          s.shown = s.shown.filter(function (id) { return seen[id]; });
          // A sticker that came back through undo has a new id and so a new place; applyTo puts the list in order.
          var order = doc.sk.map(function (g) { return ids.get(g); });
          if (order.join() !== visible().join()) s.dirty = true;
        }
        return changed;
      },
      // Writes the merged state into doc, in place. Stickers keep their objects, so a selection can follow them.
      applyTo: function (doc) {
        if (!s.dirty) return null;
        s.dirty = false;
        var keys = [], rule = rules(s.meta.k);
        Object.keys(s.fields).forEach(function (k) {
          if (!rule[k] || same(s.fields[k].v, s.view[k])) return;
          assign(doc, k, s.fields[k].v); s.view[k] = s.fields[k].v; keys.push(k);
        });
        if (doc.sk) {
          var byId = {}; doc.sk.forEach(function (g) { var id = ids.get(g); if (id) byId[id] = g; });
          var next = visible().map(function (id) {
            var g = byId[id] || {}, v = s.stickers[id].g;
            ["e", "x", "y", "r", "z"].forEach(function (k) { g[k] = v[k]; });
            ids.set(g, id); return g;
          });
          var was = JSON.stringify(doc.sk.map(shape)), now = JSON.stringify(next.map(shape));
          doc.sk.length = 0; next.forEach(function (g) { doc.sk.push(g); });
          s.shown = visible();
          if (was !== now) keys.push("sk");
        }
        return keys;
      },
      // The doc as the merged state has it, for the side that joined with nothing.
      doc: function () {
        if (!s.meta) return null;
        var raw = { k: s.meta.k, by: [] }; if (s.meta.i) raw.i = s.meta.i; if (s.meta.m) raw.m = s.meta.m;
        var base = D.sanitizeDoc(raw); if (base.sk) base.sk = [];
        s.view = flatten(base); s.shown = []; s.dirty = true;
        return base;
      },
      connected: function (now) { s.up = true; s.lastDigest = -Infinity; s.helloDue = true; s.tokens = Math.max(s.tokens, 2); api.tick(now); },
      disconnected: function () { s.up = false; },
      // Drives sending. Call it often; it keeps to the rate on its own.
      tick: function (now) {
        s.tokens = Math.min(BUCKET, s.tokens + Math.max(0, now - s.refilled) / 1000 * REFILL_PER_S); s.refilled = now;
        if (!s.up || s.tokens < 1 || now - s.lastFlush < FLUSH_MS) return;
        var f = null;
        if (s.helloDue) { f = frame("hello", who()); s.helloDue = false; s.lastDigest = now; }
        else if (s.order.length && s.meta) f = frame("ops", { o: takeOps() });
        else if (now - s.lastDigest >= DIGEST_MS) { f = frame("dig", who()); s.lastDigest = now; }
        if (!f) return;
        s.tokens -= 1; s.lastFlush = now;
        o.send(JSON.stringify(f));
      },
      // str: the frame as text. Returns what happened, never throws on bad input.
      receive: function (str, now) {
        s.arrivals = s.arrivals.filter(function (t) { return now - t < 60000; });
        if (typeof str !== "string" || str.length > MAX_FRAME || s.arrivals.length >= MAX_IN_PER_MIN) return "dropped";
        s.arrivals.push(now);
        var f;
        try { f = JSON.parse(str); } catch (e) { return "dropped"; }
        if (!f || typeof f !== "object" || f.v !== V) return "dropped";
        if (f.t === "hello" || f.t === "dig") {
          if (typeof f.h !== "number" || (f.d !== null && !okMeta(f.d)) || (typeof f.id !== "string" || !ACTOR.test(f.id))) return "dropped";
          var seen = { id: f.id, nick: C.sanitizeName(f.n), emoji: C.sanitizeEmoji(f.e) };
          var fresh = !s.peer || s.peer.nick !== seen.nick || s.peer.emoji !== seen.emoji;
          s.peer = seen; s.peerSeen = now;
          if (f.d && !s.meta) s.meta = pick(f.d);
          if (s.meta && !s.order.length) asksFull(now, f.h);
          if (fresh) o.onPeer();
          return "ok";
        }
        if (f.t === "ops") {
          if (!okMeta(f.d) || !Array.isArray(f.o) || f.o.length > MAX_OPS) return "dropped";
          if (!s.meta) s.meta = pick(f.d);
          var rule = rules(s.meta.k), bad = 0;
          f.o.forEach(function (op) { if (!Array.isArray(op) || !apply(op, rule)) bad += 1; });
          s.rejected += bad; s.peerSeen = now;
          return bad ? "partly" : "ok";
        }
        return "dropped";
      },
      meta: function () { return s.meta; },
      // Whether there is a work to show yet: the kind alone is not one.
      hasWork: function () { return !!s.meta && Object.keys(s.fields).length > 0; },
      peer: function () { return s.peer; },
      peerHere: function (now) { return !!s.peer && s.up && now - s.peerSeen < GONE_MS; },
      hash: hash,
      pending: function () { return s.order.length; },
      rejected: function () { return s.rejected; },
      snapshot: function () {
        return { fields: Object.keys(s.fields).sort().map(function (k) { return [k, s.fields[k].v]; }), stickers: visible().map(function (id) { return [id, s.stickers[id].g]; }), dead: Object.keys(s.dead).sort() };
      }
    };
    function pick(m) { var c = { k: m.k }; if (m.m) c.m = m.m; if (m.i) c.i = m.i; return c; }
    // Ops until the frame is full. What does not fit stays queued for the next tick.
    function takeOps() {
      var ops = [], size = 80;
      while (s.order.length && ops.length < MAX_OPS) {
        var k = s.order[0], op = s.outbox[k], n = op ? bytes(JSON.stringify(op)) + 1 : 0;
        if (op && size + n > MAX_FRAME - 120) break;
        s.order.shift(); delete s.outbox[k];
        if (op) { ops.push(op); size += n; }
      }
      return ops;
    }
    return api;
  }
  function newActor(rand) {
    var r = rand || Math.random, a = "";
    while (a.length < 8) a += Math.floor(r() * 36).toString(36);
    return a;
  }

  var api = { create: create, newActor: newActor, flatten: flatten, rules: rules, V: V, MAX_FRAME: MAX_FRAME, MAX_OPS: MAX_OPS, MAX_IDS: MAX_IDS, LOCAL_IDS: LOCAL_IDS, MAX_IN_PER_MIN: MAX_IN_PER_MIN, FLUSH_MS: FLUSH_MS, DIGEST_MS: DIGEST_MS, NS: "mdi.collab.v1" };
  if (node) module.exports = api;
  else root.Collab = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
