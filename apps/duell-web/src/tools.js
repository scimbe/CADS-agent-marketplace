/* Tools (kind "tool"): the sticky note and the file transfer for two. Only the rules here, no screen: SHA-256 piece by
   piece, the note as a link, the file protocol over any channel (live.js in the page, a fake one in test/tools.test.js)
   and the note two people write at once. The screen is src/tools-ui.js; both travel in the part tools (scripts/build.js).
   Nothing here talks to a server: the channel is the only way out, and file bytes go nowhere else. */
(function (root) {
  "use strict";
  var C = root.DuellCore || (typeof module !== "undefined" && module.exports ? require("./core.js") : {});
  var MAX_FRAGMENT = C.MAX_FRAGMENT || 1200;

  // ---------- SHA-256 in pieces ----------
  // WebCrypto only hashes a whole buffer at once; a file of 200 MB is hashed here while it passes, on both sides, so neither
  // has to read it twice or hold it twice. Checked against node:crypto in test/tools.test.js.
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256() {
    var H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    var W = new Uint32Array(64), buf = new Uint8Array(64), fill = 0, total = 0, done = null;
    function block(d, o) {
      var i, x, y;
      for (i = 0; i < 16; i++) W[i] = (d[o + 4 * i] << 24) | (d[o + 4 * i + 1] << 16) | (d[o + 4 * i + 2] << 8) | d[o + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        x = W[i - 15]; y = W[i - 2];
        W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
      }
      var a = H[0], b = H[1], c = H[2], e = H[4], f = H[5], g = H[6], h = H[7], dd = H[3];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        var t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += dd; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    var api = {
      update: function (data) {
        if (done) throw new Error("sha256: already finished");
        var d = data instanceof Uint8Array ? data : new Uint8Array(data), o = 0, n = d.length;
        total += n;
        if (fill) { var take = Math.min(64 - fill, n); buf.set(d.subarray(0, take), fill); fill += take; o = take; if (fill === 64) { block(buf, 0); fill = 0; } }
        for (; o + 64 <= n; o += 64) block(d, o);
        if (o < n) { buf.set(d.subarray(o), 0); fill = n - o; }
        return api;
      },
      hex: function () {
        if (done) return done;
        var bits = total * 8, hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
        buf[fill++] = 0x80;
        if (fill > 56) { buf.fill(0, fill); block(buf, 0); fill = 0; }
        buf.fill(0, fill, 56);
        buf[56] = hi >>> 24; buf[57] = hi >>> 16; buf[58] = hi >>> 8; buf[59] = hi; buf[60] = lo >>> 24; buf[61] = lo >>> 16; buf[62] = lo >>> 8; buf[63] = lo;
        block(buf, 0);
        done = Array.from(H, function (v) { return ("0000000" + v.toString(16)).slice(-8); }).join("");
        return done;
      }
    };
    return api;
  }

  // ---------- the sticky note ----------
  // Colour and sticker by number, so the link stays short and a link can only ever pick from these.
  var COLORS = ["#ffe45c", "#ff9ecf", "#9ed8ff", "#b6f09c", "#ffb35c", "#d3b8ff"];
  var STICKERS = ["", "📌", "⭐", "❤️", "✅", "⚠️", "🛒", "📞", "🎉", "💡"];
  var MAX_NOTE = 500;
  function int(v, n) { return typeof v === "number" && v === Math.floor(v) && v >= 0 && v < n ? v : 0; }
  // Line breaks stay, every other control character and every direction mark goes; at most MAX_NOTE characters (code points, an emoji is one).
  function cleanNote(n) {
    if (!n || typeof n !== "object") return null;
    var x = typeof n.x === "string" ? Array.from(n.x.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, " ")).slice(0, MAX_NOTE).join("") : "";
    return { x: x, c: int(n.c, COLORS.length), s: int(n.s, STICKERS.length) };
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
  // The note travels in the address after "#notiz=", like every card (daily.js docUrl): it never reaches a server, and a
  // link longer than MAX_FRAGMENT is neither written nor read.
  function noteCode(n) { var c = cleanNote(n); return c ? toB64(JSON.stringify({ v: 1, x: c.x, c: c.c, s: c.s })) : ""; }
  function noteFits(n) { return noteCode(n).length <= MAX_FRAGMENT; }
  function noteFrom(code) {
    if (typeof code !== "string" || !code || code.length > MAX_FRAGMENT || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
    try { var o = JSON.parse(fromB64(code)); return o && o.v === 1 && typeof o.x === "string" ? cleanNote(o) : null; } catch (e) { return null; }
  }
  // How full the link is (0..1+), for the meter under the note.
  function noteLoad(n) { return noteCode(n).length / MAX_FRAGMENT; }

  // Two people write one note at once (over live.js): the whole note goes over on each change, with a counter; the later
  // change wins, on a tie the inviter's ("a"). Both always end on the same note. Typing at the very same moment can lose a
  // few letters of one side, which a note for two can live with; there is no merging of words.
  function shared(o) {
    var clock = 0, me = o.side === "a" ? 1 : 0;
    return {
      local: function (n) { var c = cleanNote(n); clock++; o.send({ t: "n-set", v: clock, w: me, x: c.x, c: c.c, s: c.s }); },
      msg: function (m) {
        if (!m || m.t !== "n-set" || typeof m.v !== "number" || !(m.v >= 0) || m.v > 1e9) return false;
        var n = cleanNote(m), w = m.w === 1 ? 1 : 0;
        if (m.v > clock || (m.v === clock && w > me)) { clock = m.v; o.apply(n); } else clock = Math.max(clock, m.v);
        return true;
      },
      clock: function () { return clock; }
    };
  }

  // ---------- the file for two ----------
  // Over an ordered, reliable channel (the WebRTC data channel of live.js; DTLS between the two devices, its keys checked
  // over the Noise channel of the ct-agent): the receiver says yes to name and size before a single byte flows; the bytes go
  // in pieces of CHUNK as the channel's buffer allows (HIGH, LOW: bufferedAmount); the receiver reports what really
  // arrived (ACK) for the sender's bar; at the end both compare SHA-256 over the whole file. Either side can stop.
  var CHUNK = 16384, BLOCK = 262144, HIGH = 1048576, LOW = 262144, ACK = 262144, MAX_BYTES = 100000000;   // 100 MB as the phones count them: the receiver holds the file in memory until it is saved
  // A name as the other device may show and save it: no folders, no control or reserved characters, at most 120 characters.
  function cleanName(n) {
    var s = String(n == null ? "" : n).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "").replace(/^[.\s]+|\s+$/g, "");
    s = Array.from(s).slice(0, 120).join("");
    return s || "datei";
  }
  function isId(x) { return typeof x === "string" && /^[ab][0-9]{1,6}$/.test(x); }
  // ch: { send(obj), bin(ArrayBuffer), buffered(), onLow(fn) }; o: { side: "a"|"b", max, chunk, on(event) }.
  // Events: { e: "wait" } my offer is out; { e: "offer", n, s } theirs waits for accept()/reject(); { e: "big", n, s } theirs
  // was over my limit and refused; { e: "no", why } mine was refused ("no", "busy", "big"); { e: "progress", dir, b, s };
  // { e: "done", dir, ok, h, n, s, parts } (parts: what arrived, only "in" and ok); { e: "stop", dir, by: "me"|"them" };
  // { e: "error", dir, why } ("big", "size", "read").
  function transfer(ch, o) {
    o = o || {};
    var side = o.side === "b" ? "b" : "a", max = o.max > 0 ? o.max : MAX_BYTES, chunk = o.chunk > 0 ? o.chunk : CHUNK, emit = o.on || function () {};
    var out = null, inc = null, seq = 0, closed = false;
    function drained() {
      return new Promise(function (ok) {
        var fin = false, iv = setInterval(check, 25);
        function check() { if (!fin && (closed || ch.buffered() <= LOW)) { fin = true; clearInterval(iv); ok(); } }
        ch.onLow(check);
      });
    }
    async function pump(me) {
      var h = sha256(), off = 0, size = me.file.size;
      emit({ e: "progress", dir: "out", b: 0, s: size });
      while (off < size) {
        if (out !== me || closed) return;
        if (ch.buffered() > HIGH) { await drained(); continue; }
        var end = Math.min(size, off + BLOCK), data;
        try { data = new Uint8Array(await me.file.slice(off, end).arrayBuffer()); } catch (e) { data = null; }
        if (out !== me || closed) return;
        if (!data || data.length !== end - off) { out = null; ch.send({ t: "f-stop", id: me.id }); emit({ e: "error", dir: "out", why: "read" }); return; }
        for (var p = 0; p < data.length; p += chunk) { var piece = data.slice(p, Math.min(data.length, p + chunk)); h.update(piece); ch.bin(piece.buffer); }
        off = end;
      }
      me.h = h.hex(); me.state = "end";
      ch.send({ t: "f-end", id: me.id, h: me.h });
    }
    var api = {
      busy: function () { return !!(out || inc); },
      // Offer a file (a File or Blob with name, size, slice()). false when one runs already or it is too big.
      send: function (file) {
        if (closed || out || inc || !file || typeof file.size !== "number") return false;
        if (file.size > max) { emit({ e: "error", dir: "out", why: "big", s: file.size }); return false; }
        out = { id: side + (++seq), file: file, state: "ask", n: cleanName(file.name), s: file.size };
        ch.send({ t: "f-offer", id: out.id, n: out.n, s: out.s });
        emit({ e: "wait", n: out.n, s: out.s });
        return true;
      },
      accept: function () {
        if (!inc || inc.state !== "ask") return false;
        inc.state = "recv"; inc.parts = []; inc.got = 0; inc.acked = 0; inc.h = sha256();
        ch.send({ t: "f-yes", id: inc.id });
        emit({ e: "progress", dir: "in", b: 0, s: inc.s });
        return true;
      },
      reject: function () { if (!inc || inc.state !== "ask") return false; ch.send({ t: "f-no", id: inc.id, why: "no" }); inc = null; return true; },
      cancel: function () {
        var x = out || inc; if (!x) return false;
        var dir = x === out ? "out" : "in";
        if (x === out) out = null; else inc = null;
        ch.send({ t: "f-stop", id: x.id }); emit({ e: "stop", dir: dir, by: "me" });
        return true;
      },
      // A control message from the other side; true when it was one of ours (f-...).
      msg: function (m) {
        if (!m || typeof m.t !== "string" || m.t.slice(0, 2) !== "f-" || !isId(m.id) || closed) return false;
        if (m.t === "f-offer") {
          var s = m.s;
          if (typeof s !== "number" || !(s >= 0) || s !== Math.floor(s)) return true;
          if (out || inc) { ch.send({ t: "f-no", id: m.id, why: "busy" }); return true; }
          if (s > max) { ch.send({ t: "f-no", id: m.id, why: "big" }); emit({ e: "big", n: cleanName(m.n), s: s }); return true; }
          inc = { id: m.id, n: cleanName(m.n), s: s, state: "ask" };
          emit({ e: "offer", n: inc.n, s: s });
          return true;
        }
        if (out && m.id === out.id) {
          if (m.t === "f-yes" && out.state === "ask") { out.state = "send"; pump(out); }
          else if (m.t === "f-no" && out.state === "ask") { out = null; emit({ e: "no", why: ["busy", "big"].indexOf(m.why) >= 0 ? m.why : "no" }); }
          else if (m.t === "f-ack" && typeof m.b === "number" && m.b >= 0 && m.b <= out.s) emit({ e: "progress", dir: "out", b: m.b, s: out.s });
          else if ((m.t === "f-ok" || m.t === "f-bad") && out.state === "end") { var d = out; out = null; emit({ e: "done", dir: "out", ok: m.t === "f-ok", h: d.h, n: d.n, s: d.s }); }
          else if (m.t === "f-stop") { out = null; emit({ e: "stop", dir: "out", by: "them" }); }
          return true;
        }
        if (inc && m.id === inc.id) {
          if (m.t === "f-stop") { inc = null; emit({ e: "stop", dir: "in", by: "them" }); }
          else if (m.t === "f-end" && inc.state === "recv") {
            var r = inc, h = r.h.hex(), ok = r.got === r.s && typeof m.h === "string" && m.h === h;
            inc = null;
            ch.send({ t: ok ? "f-ok" : "f-bad", id: r.id });
            emit({ e: "done", dir: "in", ok: ok, h: h, n: r.n, s: r.s, parts: ok ? r.parts : null });
          }
          return true;
        }
        return true;   // an old id (a stopped transfer): nothing to do
      },
      // File bytes from the other side: only for an offer I accepted, never more than it announced.
      bin: function (data) {
        if (!inc || inc.state !== "recv" || closed) return false;
        var u = new Uint8Array(data);
        if (inc.got + u.length > inc.s) { var r = inc; inc = null; ch.send({ t: "f-stop", id: r.id }); emit({ e: "error", dir: "in", why: "size" }); return false; }
        inc.h.update(u); inc.parts.push(u); inc.got += u.length;
        if (inc.got - inc.acked >= ACK || inc.got === inc.s) { inc.acked = inc.got; ch.send({ t: "f-ack", id: inc.id, b: inc.got }); }
        emit({ e: "progress", dir: "in", b: inc.got, s: inc.s });
        return true;
      },
      // The channel is gone: whatever ran stops, nothing more is sent.
      close: function () {
        if (closed) return;
        closed = true;
        if (out) { out = null; emit({ e: "stop", dir: "out", by: "net" }); }
        if (inc) { inc = null; emit({ e: "stop", dir: "in", by: "net" }); }
      }
    };
    return api;
  }

  // Who may use the TURN relay in the file tool (the note for two and the live games are not affected). Decision 2026-11:
  // the relay is for paying customers, an account with credit (/ai/status create.credit > 0); everyone else goes direct
  // only, never over a server, not even as ciphertext. One switch on top, set at runtime before the part runs (a build,
  // the shells or the server): window.DailyFlags = { toolRelay: true } for everyone, false for no one. Today this is
  // decided on the device only; the bridge hands TURN to any channel (see the PR for the server side).
  function relayFor(credit, flags) {
    var f = flags === undefined ? root.DailyFlags : flags;
    if (f && typeof f.toolRelay === "boolean") return f.toolRelay;
    return typeof credit === "number" && credit > 0;
  }
  // The relay grant of the wrapper (POST /api/duell/relay-grant; {} asks whether this account may use the relay, {channel}
  // gets a grant bound to that channel for the bridge). In the app shells there is no login cookie: the shell asks with its
  // own Bearer login (DuellHost.relay(id, body), answer through DuellHostReply(id, status, body)); a browser sends the
  // login cookie through Ai.post (ai.js, the one fetch for the wrapper). Either way -> { status, json }; status 0 when
  // nothing came back (an older shell, offline): then no relay.
  var waits = {}, seq = 0;
  function hostReply(id, status, body) { var f = waits[id]; if (f) { delete waits[id]; f(status, body); } }
  function relayAsk(body, env) {
    var text = JSON.stringify(body || {}), H = env.host;
    if (H && typeof H.relay === "function") return new Promise(function (ok) {
      var id = "r" + (++seq), tm = setTimeout(function () { hostReply(id, 0, ""); }, env.timeout || 8000);
      waits[id] = function (st, b) { clearTimeout(tm); var j = null; try { j = JSON.parse(b); } catch (e) { j = null; } ok({ status: Number(st) || 0, json: j }); };
      try { H.relay(id, text); } catch (e) { hostReply(id, 0, ""); }
    });
    return Promise.resolve().then(function () { return env.post("/relay-grant", body || {}); })
      .then(function (r) { return { status: r && r.status || 0, json: r && r.json || null }; }, function () { return { status: 0, json: null }; });
  }
  // Sizes as people read them: "830 B", "12,3 MB" (de) / "12.3 MB" (en); decimal units like the phones show them.
  function size(b, lang) {
    var u = ["B", "KB", "MB", "GB"], i = 0, v = b;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    var s = i === 0 ? String(v) : v >= 100 ? String(Math.round(v)) : v.toFixed(1);
    return (lang === "de" ? s.replace(".", ",") : s) + " " + u[i];
  }

  var api = {
    sha256: sha256, COLORS: COLORS, STICKERS: STICKERS, MAX_NOTE: MAX_NOTE, cleanNote: cleanNote, noteCode: noteCode, noteFrom: noteFrom, noteFits: noteFits, noteLoad: noteLoad,
    shared: shared, transfer: transfer, relayFor: relayFor, relayAsk: relayAsk, hostReply: hostReply, cleanName: cleanName, size: size, CHUNK: CHUNK, HIGH: HIGH, LOW: LOW, ACK: ACK, MAX_BYTES: MAX_BYTES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Tools = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
