/* Live play without an account: two browsers meet through a one-time invite and then talk over a WebRTC data channel.
   The ct-agent browser agent (WASM from the webconference host) does the channel join and the Noise handshake; the
   bridge there turns the invite into short-lived grants. Media never flows, only game messages and, for the file tool
   (tools-ui.js), file bytes in pieces of 16 KB: directly between the devices or, where the networks allow no direct path,
   over the TURN relay. The data channel is DTLS between the two browsers, its fingerprints travel inside the Noise
   channel: the relay sees only ciphertext. fp() gives both fingerprints, so the two screens can show a code that only
   matches when no one sits in between (tools-ui.js). Nothing runs before someone taps "live". */
(function (root) {
  "use strict";
  var WC = "https://webconference.bunsenbrenner.org", API = WC + "/api/play", JOIN_MS = 30000, WAIT_MS = 15 * 60000;
  var wasm = null;
  async function load() {
    if (wasm) return wasm;
    var m = await import(WC + "/pkg/ct_agent_wasm.js");
    await m.default(WC + "/pkg/ct_agent_wasm_bg.wasm");
    wasm = m; return m;
  }
  async function call(path, body, head) {
    var r = await fetch(API + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: head || {} });
    var j = await r.json().catch(function () { return {}; }); j.http = r.status; return j;
  }
  function hex(b) { return Array.from(b, function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  function unhex(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function ids(w) { var h = w.generate_holder_identity(), n = w.generate_noise_identity(); return { hp: h.public_hex, hk: h.private_hex, np: n.public_hex, nk: n.private_hex }; }
  // The edge wants proof that this holder vouches for this Noise key in this channel.
  function attestation(w, ch, me) {
    var d = new TextEncoder().encode("ct-a2a-noise-attest-v1"), l = new Uint8Array(4); new DataView(l.buffer).setUint32(0, d.length, true);
    var pre = new Uint8Array(4 + d.length + 96); pre.set(l, 0); pre.set(d, 4); pre.set(unhex(ch), 4 + d.length); pre.set(unhex(me.hp), 36 + d.length); pre.set(unhex(me.np), 68 + d.length);
    return hex(w.holderSign(me.hk, pre));
  }
  function sleep(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  // A WebSocket as a byte stream: read exactly n bytes, or a line.
  function Bytes(ws) {
    var buf = new Uint8Array(0), waiters = [], closed = false;
    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", function (ev) { var c = new Uint8Array(ev.data), n = new Uint8Array(buf.length + c.length); n.set(buf); n.set(c, buf.length); buf = n; wake(); });
    ws.addEventListener("close", function () { closed = true; wake(); });
    function wake() { waiters.slice().forEach(function (w) { w(); }); }
    function wait(test, ms) {
      return new Promise(function (ok, bad) {
        var t = setTimeout(function () { done(); bad(new Error("timeout")); }, ms);
        function check() { var r = test(); if (r) { done(); ok(r); } else if (closed) { done(); bad(new Error("closed")); } }
        function done() { clearTimeout(t); waiters = waiters.filter(function (x) { return x !== check; }); }
        waiters.push(check); check();
      });
    }
    function take(n) { var o = buf.slice(0, n); buf = buf.slice(n); return o; }
    return {
      exact: function (n, ms) { return wait(function () { return buf.length >= n ? take(n) : null; }, ms); },
      line: function (ms) { return wait(function () { var i = buf.indexOf(10); return i >= 0 ? take(i + 1) : null; }, ms); },
      send: function (b) { ws.send(b); }, ws: ws
    };
  }
  async function framed(s, ms) { var l = await s.exact(2, ms); return s.exact((l[0] << 8) | l[1], ms); }
  async function joinEdge(w, url, grant, me) {
    var last;
    for (var a = 0; a < 3; a++) {
      if (a) await sleep(a * 800);
      var ws = new WebSocket(url);
      try {
        await new Promise(function (ok, bad) { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", function () { bad(new Error("ws")); }, { once: true }); });
        var s = Bytes(ws); s.send(w.frame_message(w.buildChannelJoinRequest(grant, "relay-only")));
        var head = await s.exact(2, JOIN_MS); if (head[0] === 0x4e && head[1] === 0x4f) throw new Error("refused");
        var rest = await s.exact(30, JOIN_MS), ch = new Uint8Array(32); ch.set(head, 0); ch.set(rest, 2);
        s.send(w.holderSign(me.hk, ch));
        var ack = new TextDecoder().decode(await s.line(JOIN_MS)).trim().split(" ");
        if (ack[0] !== "OK") throw new Error("ack");
        var peer = /^[0-9a-f]{64}$/i.test(ack[2] || "") ? ack[2] : null;
        if (!peer) throw new Error("no peer key");
        return { s: s, peer: peer };
      } catch (e) { last = e; try { ws.close(); } catch (x) {} }
    }
    throw last;
  }
  // Both sides attest, then wait until the bridge has the channel registered; only then does the edge let them in.
  async function registered(token, ms) {
    var until = Date.now() + ms;
    while (Date.now() < until) {
      var st = await call("/status?token=" + encodeURIComponent(token));
      var s = st.status && st.status.state;
      if (s === "accepted_and_registered") return;
      if (s === "pending_core_credential") throw new Error("server");
      if (st.http === 404) throw new Error("gone");
      await sleep(800);
    }
    throw new Error("timeout");
  }
  // Direct only (o.direct: the file tool for someone without the relay, tools.js relayFor): no TURN server is handed to
  // the browser and no relay candidate of this device goes out, so this device never sends through our relay. A relay
  // candidate of the other device (its own, paid relay) is still taken. Without any path the join ends with "rtc".
  function directServers(list) {
    return (list || []).map(function (s) {
      var u = [].concat(s && s.urls || []).filter(function (x) { return /^stuns?:/i.test(String(x)); });
      return u.length ? { urls: u } : null;
    }).filter(Boolean);
  }
  function relayCandidate(c) { return / typ relay( |$)/.test(String(c || "")); }
  async function connect(w, me, info, token, onState, o) {
    o = o || {};
    var caller = info.role === "caller";
    var at = await call("/attest", { channel: info.channel, role: info.role, token: token, holderPub: me.hp, noisePub: me.np, attestation: attestation(w, info.channel, me) });
    if (at.http !== 200) throw new Error("attest");
    onState("register"); await registered(token, 30000);
    onState("join"); var j = await joinEdge(w, info.ws, info.grant, me), s = j.s;
    var hs = caller ? w.NoiseHandshake.newInitiator(me.nk, j.peer) : w.NoiseHandshake.newResponder(me.nk);
    if (caller) { s.send(w.frame_message(hs.writeMessage(new Uint8Array(0)))); hs.readMessage(await framed(s, JOIN_MS)); }
    else { hs.readMessage(await framed(s, JOIN_MS)); s.send(w.frame_message(hs.writeMessage(new Uint8Array(0)))); }
    var nt = hs.intoTransport();
    function signal(bytes) { s.send(w.frame_message(nt.encrypt(bytes))); }   // no await inside: the nonce order stays intact
    onState("rtc");
    // The file tool's relay is the bridge's decision: TURN only against a grant for this channel (o.grant, paying accounts).
    var grant = o.grant ? await o.grant(info.channel).catch(function () { return null; }) : null;
    var ice = await call("/ice?channel=" + info.channel + "&role=" + info.role + "&token=" + encodeURIComponent(token), null, grant ? { "x-relay-grant": grant } : null);
    // The server sends STUN plus, as a fallback, a short-lived TURN login: the browser takes the relay only if no direct
    // pair connects. Both players may see each other's IP address; the invite screen says so.
    var pc = new RTCPeerConnection({ iceServers: o.direct ? directServers(ice.iceServers) : ice.iceServers || [] });
    var early = [], haveRemote = false;
    pc.onicecandidate = function (e) { if (e.candidate && !(o.direct && relayCandidate(e.candidate.candidate))) signal(w.encodeSignalIceCandidate(e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex)); };
    var dcReady = new Promise(function (ok) {
      function use(dc) { dc.onopen = function () { ok(dc); }; if (dc.readyState === "open") ok(dc); }
      if (caller) use(pc.createDataChannel("game", { ordered: true })); else pc.ondatachannel = function (e) { use(e.channel); };
    });
    (async function read() {
      try {
        for (;;) {
          var m = w.decodeSignalMessage(nt.decrypt(await framed(s, 15 * 60000)));
          if (m.kind === "offer") { await pc.setRemoteDescription({ type: "offer", sdp: m.sdp }); haveRemote = true; var an = await pc.createAnswer(); await pc.setLocalDescription(an); signal(w.encodeSignalAnswer(an.sdp)); }
          else if (m.kind === "answer") { await pc.setRemoteDescription({ type: "answer", sdp: m.sdp }); haveRemote = true; }
          else if (m.kind === "ice-candidate") { var c = { candidate: m.candidate, sdpMid: m.sdpMid, sdpMLineIndex: m.sdpMlineIndex }; if (haveRemote) pc.addIceCandidate(c).catch(function () {}); else early.push(c); }
          if (haveRemote && early.length) early.splice(0).forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); });
        }
      } catch (e) { /* the signalling stream ends once the game runs or the page leaves */ }
    })();
    if (caller) { var of = await pc.createOffer(); await pc.setLocalDescription(of); signal(w.encodeSignalOffer(of.sdp)); }
    var dc = await Promise.race([dcReady, sleep(JOIN_MS).then(function () { return null; })]);
    // No path between the two networks, not even over the relay: free the channel now instead of waiting for the sweep.
    if (!dc) { try { pc.close(); s.ws.close(); } catch (e) {} call("/done", { channel: info.channel, token: token }).catch(function () {}); throw new Error("rtc"); }
    // The game runs peer to peer now: the edge socket and the server-side channel are not needed any more.
    setTimeout(function () { try { s.ws.close(); } catch (e) {} call("/done", { channel: info.channel, token: token }).catch(function () {}); }, 3000);
    var handlers = [], closers = [], bins = [], lows = [];
    // Text is a game message (JSON); bytes are a file piece for the one who asked for them (onBin), nobody else.
    dc.binaryType = "arraybuffer"; dc.bufferedAmountLowThreshold = 262144;
    dc.onbufferedamountlow = function () { lows.forEach(function (h) { h(); }); };
    dc.onmessage = function (e) {
      if (typeof e.data !== "string") { bins.forEach(function (h) { h(e.data); }); return; }
      var o; try { o = JSON.parse(e.data); } catch (x) { return; } handlers.forEach(function (h) { h(o); });
    };
    function end() { closers.splice(0).forEach(function (h) { h(); }); }
    dc.onclose = end; pc.onconnectionstatechange = function () { if (pc.connectionState === "failed" || pc.connectionState === "closed") end(); };
    return {
      channel: info.channel, caller: caller,
      send: function (o) { if (dc.readyState === "open") dc.send(JSON.stringify(o)); },
      on: function (h) { handlers = [h]; }, onClose: function (h) { closers.push(h); },
      // Bytes (the file tool): send them as they are, read the send buffer for back pressure, hear when it ran low.
      bin: function (b) { if (dc.readyState === "open") dc.send(b); }, onBin: function (h) { bins = [h]; },
      buffered: function () { return dc.bufferedAmount; }, onLow: function (h) { lows = [h]; },
      fp: function () { function f(d) { var m = d && /a=fingerprint:\S+ ([0-9A-Fa-f:]+)/.exec(d.sdp || ""); return m ? m[1].toUpperCase() : ""; } return [f(pc.localDescription), f(pc.remoteDescription)]; },
      close: function () { try { dc.close(); pc.close(); s.ws.close(); } catch (e) {} call("/done", { channel: info.channel, token: token }).catch(function () {}); }
    };
  }
  // Inviter: returns the token at once; the connection follows when the friend opens the link.
  async function invite(onState, o) {
    o = o || {};
    var w = await load(), me = ids(w), op = await call("/open", { holderPub: me.hp, noisePub: me.np, purpose: o.purpose });
    if (op.http !== 200 || !op.token) throw new Error(op.code || "open");
    var token = op.token;
    var ready = (async function () {
      var until = Date.now() + WAIT_MS;
      while (Date.now() < until) {
        var st = await call("/status?token=" + encodeURIComponent(token));
        if (st.http === 404) throw new Error("gone");
        if (st.state === "joined") { onState("found", st.channel); return connect(w, me, st, token, onState, o); }
        await sleep(3000);
      }
      throw new Error("expired");
    })();
    return { token: token, expires: Date.now() + WAIT_MS, ready: ready };
  }
  async function accept(token, onState, o) {
    o = o || {};
    var w = await load(), me = ids(w), j = await call("/join", { token: token, holderPub: me.hp, noisePub: me.np, purpose: o.purpose });
    if (j.http !== 200) throw new Error(j.code || "join");
    onState("found", j.channel);
    return connect(w, me, j, token, onState, o);
  }
  if (!root.Live) root.Live = { invite: invite, accept: accept, load: load, WC: WC, directServers: directServers, relayCandidate: relayCandidate };   // a stand-in set before (browser tests) stays
})(typeof globalThis !== "undefined" ? globalThis : this);
