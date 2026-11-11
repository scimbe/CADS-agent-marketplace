// Live-Broker: einziger Ort mit WebSocket und RTCPeerConnection im ganzen Bundle (Pruefung in test/build.test.js).
// Laeuft NUR im abgeschotteten Rahmen (live-frame.js, sandbox ohne same-origin, eigene CSP): das nachgeladene,
// nicht gepinnte ct-agent-Modul der Webkonferenz liegt damit nie in dem Realm, der Haende und Salze haelt (Review M4).
// Protokoll wie im Altcode (02-spec/05-spielen.md): /api/play/*, Holder-/Noise-Identitaet, Attestation
// "ct-a2a-noise-attest-v1", Edge-Join per WebSocket (3 Versuche), Noise_IK, darueber nur WebRTC-Signalisierung;
// Spieldaten im WebRTC-Datenkanal "game". ICE-Server nur vom Server, kein stun:/turn:-Literal.
// Aufraeumen (Review LOW): jede Sitzung fuehrt ihre Ressourcen (Edge-Socket, PeerConnection, Kanal) und gibt sie bei
// Fehler, Abbruch und Ende immer frei – inkl. /done an die Bruecke.

export const WC = "https://webconference.bunsenbrenner.org";
const API = WC + "/api/play";
const DEFAULT_TIMING = { join: 30000, wait: 15 * 60000, poll: 3000, reg: 30000, edgeRetry: 800, handoff: 3000 };
const MAX_MSG = 4096;

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };

/**
 * @param {object} [deps] fuer Tests: { wasm(), fetch, openWs(url), openPc(cfg), timing }
 */
export function createLive(deps = {}) {
  const T = { ...DEFAULT_TIMING, ...(deps.timing || {}) };
  const doFetch = deps.fetch || ((u, o) => fetch(u, o));
  const openWs = deps.openWs || ((url) => new WebSocket(url));
  const openPc = deps.openPc || ((cfg) => new RTCPeerConnection(cfg));
  let wasmP = null;
  const wasm = deps.wasm || (() => {
    if (!wasmP) wasmP = import(WC + "/pkg/ct_agent_wasm.js").then(async (m) => { await m.default(WC + "/pkg/ct_agent_wasm_bg.wasm"); return m; });
    return wasmP;
  });

  const sleep = (ms, signal) => new Promise((ok, bad) => {
    if (signal && signal.aborted) { bad(new Error("abbruch")); return; }
    const t = setTimeout(ok, ms);
    if (signal) signal.addEventListener("abort", () => { clearTimeout(t); bad(new Error("abbruch")); }, { once: true });
  });
  async function api(path, body, signal) {
    const r = await doFetch(API + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal } : { signal });
    let j = {}; try { j = await r.json(); } catch (e) { j = {}; }
    return { ...j, http: r.status };
  }
  function identity(w) {
    const hld = w.generate_holder_identity(), noi = w.generate_noise_identity();
    return { hp: hld.public_hex, hk: hld.private_hex, np: noi.public_hex, nk: noi.private_hex };
  }
  function attestation(w, channel, me) {
    const dom = new TextEncoder().encode("ct-a2a-noise-attest-v1"), len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, dom.length, true);
    const pre = new Uint8Array(4 + dom.length + 96);
    pre.set(len, 0); pre.set(dom, 4); pre.set(unhex(channel), 4 + dom.length); pre.set(unhex(me.hp), 36 + dom.length); pre.set(unhex(me.np), 68 + dom.length);
    return hex(w.holderSign(me.hk, pre));
  }
  function byteStream(ws) {
    let buf = new Uint8Array(0), closed = false;
    const waiters = new Set();
    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", (ev) => { const c = new Uint8Array(ev.data), n = new Uint8Array(buf.length + c.length); n.set(buf); n.set(c, buf.length); buf = n; for (const w of [...waiters]) w(); });
    const onClose = () => { closed = true; for (const w of [...waiters]) w(); };
    ws.addEventListener("close", onClose);
    function wait(take, ms) {
      return new Promise((ok, bad) => {
        const t = setTimeout(() => { waiters.delete(check); bad(new Error("zeit")); }, ms);
        function check() { const r = take(); if (r) { clearTimeout(t); waiters.delete(check); ok(r); } else if (closed) { clearTimeout(t); waiters.delete(check); bad(new Error("zu")); } }
        waiters.add(check); check();
      });
    }
    const cut = (n) => { const o = buf.slice(0, n); buf = buf.slice(n); return o; };
    return {
      exact: (n, ms) => wait(() => (buf.length >= n ? cut(n) : null), ms),
      line: (ms) => wait(() => { const i = buf.indexOf(10); return i >= 0 ? cut(i + 1) : null; }, ms),
      send: (b) => ws.send(b),
      close: () => { try { ws.close(); } catch (e) { /* schon zu */ } onClose(); }
    };
  }
  const framed = async (s, ms) => { const l = await s.exact(2, ms); return s.exact((l[0] << 8) | l[1], ms); };

  async function edgeJoin(w, url, grant, me, res, signal) {
    let last = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await sleep(attempt * T.edgeRetry, signal);
      const ws = openWs(url);
      const s = byteStream(ws);
      res.ws = s;
      try {
        await new Promise((ok, bad) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", () => bad(new Error("ws")), { once: true }); ws.addEventListener("close", () => bad(new Error("zu")), { once: true }); });
        s.send(w.frame_message(w.buildChannelJoinRequest(grant, "relay-only")));
        const head = await s.exact(2, T.join);
        if (head[0] === 0x4e && head[1] === 0x4f) throw new Error("abgelehnt"); // "NO"
        const rest = await s.exact(30, T.join), challenge = new Uint8Array(32);
        challenge.set(head, 0); challenge.set(rest, 2);
        s.send(w.holderSign(me.hk, challenge));
        const ack = new TextDecoder().decode(await s.line(T.join)).trim().split(" ");
        if (ack[0] !== "OK" || !/^[0-9a-f]{64}$/i.test(ack[2] || "")) throw new Error("quittung");
        return { s, peer: ack[2] };
      } catch (e) { last = e; s.close(); res.ws = null; if (signal.aborted) throw e; }
    }
    throw last;
  }
  async function registered(token, signal) {
    const until = Date.now() + T.reg;
    while (Date.now() < until) {
      const st = await api("/status?token=" + encodeURIComponent(token), null, signal);
      const state = st.status && st.status.state;
      if (state === "accepted_and_registered") return;
      if (state === "pending_core_credential") throw new Error("server");
      if (st.http === 404) throw new Error("gone");
      await sleep(800, signal);
    }
    throw new Error("expired");
  }

  // Kanal aufbauen; alle Ressourcen landen in res, damit Fehler/Abbruch sie freigeben koennen.
  async function connect(w, me, info, token, cb, signal, res) {
    const caller = info.role === "caller";
    res.channel = info.channel; res.token = token;
    const at = await api("/attest", { channel: info.channel, role: info.role, token, holderPub: me.hp, noisePub: me.np, attestation: attestation(w, info.channel, me) }, signal);
    if (at.http !== 200) throw new Error("attest");
    cb.onStep("register"); await registered(token, signal);
    cb.onStep("join");
    const { s, peer } = await edgeJoin(w, info.ws, info.grant, me, res, signal);
    const hs = caller ? w.NoiseHandshake.newInitiator(me.nk, peer) : w.NoiseHandshake.newResponder(me.nk);
    if (caller) { s.send(w.frame_message(hs.writeMessage(new Uint8Array(0)))); hs.readMessage(await framed(s, T.join)); }
    else { hs.readMessage(await framed(s, T.join)); s.send(w.frame_message(hs.writeMessage(new Uint8Array(0)))); }
    const nt = hs.intoTransport();
    const signal1 = (bytes) => s.send(w.frame_message(nt.encrypt(bytes))); // synchron: Nonce-Reihenfolge bleibt
    cb.onStep("rtc");
    const ice = await api("/ice?channel=" + info.channel + "&role=" + info.role + "&token=" + encodeURIComponent(token), null, signal);
    if (signal.aborted) throw new Error("abbruch");
    const pc = openPc({ iceServers: Array.isArray(ice.iceServers) ? ice.iceServers : [] });
    res.pc = pc;
    const early = []; let haveRemote = false;
    pc.onicecandidate = (e) => { if (e.candidate) signal1(w.encodeSignalIceCandidate(e.candidate.candidate, e.candidate.sdpMid, e.candidate.sdpMLineIndex)); };
    const dcReady = new Promise((ok) => {
      const use = (dc) => { res.dc = dc; dc.onopen = () => ok(dc); if (dc.readyState === "open") ok(dc); };
      if (caller) use(pc.createDataChannel("game", { ordered: true })); else pc.ondatachannel = (e) => use(e.channel);
    });
    (async () => {
      try {
        for (;;) {
          const m = w.decodeSignalMessage(nt.decrypt(await framed(s, T.wait)));
          if (m.kind === "offer") { await pc.setRemoteDescription({ type: "offer", sdp: m.sdp }); haveRemote = true; const an = await pc.createAnswer(); await pc.setLocalDescription(an); signal1(w.encodeSignalAnswer(an.sdp)); }
          else if (m.kind === "answer") { await pc.setRemoteDescription({ type: "answer", sdp: m.sdp }); haveRemote = true; }
          else if (m.kind === "ice-candidate") { const c = { candidate: m.candidate, sdpMid: m.sdpMid, sdpMLineIndex: m.sdpMlineIndex }; if (haveRemote) pc.addIceCandidate(c).catch(() => {}); else early.push(c); }
          if (haveRemote && early.length) for (const c of early.splice(0)) pc.addIceCandidate(c).catch(() => {});
        }
      } catch (e) { /* Signalisierung endet, sobald der Kanal steht, die Sitzung schliesst oder die Seite geht */ }
    })();
    if (caller) { const of = await pc.createOffer(); await pc.setLocalDescription(of); signal1(w.encodeSignalOffer(of.sdp)); }
    // Warten auf den Kanal endet auch beim Abbruch sofort (vorher: bis zu 30 s weiter offen)
    const dc = await Promise.race([dcReady, sleep(T.join, signal).then(() => null)]);
    if (!dc) throw new Error("rtc");
    // Das Spiel laeuft jetzt direkt: Edge-Socket und serverseitiger Kanal werden nicht mehr gebraucht.
    setTimeout(() => { if (res.ws) { res.ws.close(); res.ws = null; } releaseChannel(res); }, T.handoff);
    return dc;
  }

  function releaseChannel(res) {
    if (res.channel && !res.released) { res.released = true; api("/done", { channel: res.channel, token: res.token }).catch(() => {}); }
  }
  function releaseAll(res) {
    try { if (res.dc) res.dc.close(); } catch (e) { /* zu */ }
    try { if (res.pc) res.pc.close(); } catch (e) { /* zu */ }
    if (res.ws) { res.ws.close(); res.ws = null; }
    releaseChannel(res);
  }

  function session(cb, run) {
    const ctl = new AbortController(), res = {};
    let dc = null, ended = false;
    const end = (why) => {
      if (ended) return; ended = true; ctl.abort(); releaseAll(res);
      if (why) cb.onFail(why); else cb.onDown();
    };
    run(ctl.signal, res).then((d) => {
      if (ended) { releaseAll(res); return; }
      dc = d;
      dc.onmessage = (e) => {
        if (typeof e.data !== "string" || e.data.length > MAX_MSG) return;
        let o; try { o = JSON.parse(e.data); } catch (x) { return; }
        cb.onMessage(o);
      };
      dc.onclose = () => end(null);
      res.pc.onconnectionstatechange = () => { if (res.pc.connectionState === "failed" || res.pc.connectionState === "closed") end(null); };
      cb.onUp();
    }).catch((e) => { if (!ended) end(e && /^(gone|expired)$/.test(e.message) ? e.message : "verbindung"); else releaseAll(res); });
    return {
      send: (o) => { if (dc && dc.readyState === "open") { const s = JSON.stringify(o); if (s.length <= MAX_MSG) dc.send(s); } },
      close: () => {
        if (dc && dc.readyState === "open") { try { dc.send(JSON.stringify({ t: "bye" })); } catch (e) { /* zu */ } }
        ended = true; ctl.abort(); releaseAll(res);
      }
    };
  }

  /** Einladen: liefert den Einladungs-Token ueber onToken; die Verbindung folgt, wenn der Partner beitritt. */
  function invite(cb) {
    return session(cb, async (signal, res) => {
      cb.onStep("open");
      const w = await wasm(), me = identity(w);
      const o = await api("/open", { holderPub: me.hp, noisePub: me.np }, signal);
      if (o.http !== 200 || typeof o.token !== "string") throw new Error("open");
      cb.onToken(o.token);
      const until = Date.now() + T.wait;
      while (Date.now() < until) {
        const st = await api("/status?token=" + encodeURIComponent(o.token), null, signal);
        if (st.http === 404) throw new Error("gone");
        if (st.state === "joined") { cb.onStep("found"); return connect(w, me, st, o.token, cb, signal, res); }
        await sleep(T.poll, signal);
      }
      throw new Error("expired");
    });
  }
  /** Beitreten mit einem Einladungs-Token (einmalig, 22 Zeichen). */
  function accept(token, cb) {
    return session(cb, async (signal, res) => {
      const w = await wasm(), me = identity(w);
      const j = await api("/join", { token, holderPub: me.hp, noisePub: me.np }, signal);
      if (j.http === 404 || j.http === 410) throw new Error("gone");
      if (j.http !== 200) throw new Error("join");
      cb.onStep("found");
      return connect(w, me, j, token, cb, signal, res);
    });
  }
  return { invite, accept };
}
