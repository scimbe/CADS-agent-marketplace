// Falsche Webkonferenz fuer E2E: Bruecke (/api/play/*), ct-agent-Modul, Edge (WebSocket) und WebRTC-Datenkanal.
// Ersetzt NUR die Netzschicht unter dem echten Broker (src/broker/live.js): Einladung, Polling, Attestation,
// Edge-Join, Noise-Rahmen, Signalisierung und Datenkanal laufen durch den Produktionscode. Jede Nachricht wird
// mitgeschnitten, damit Tests pruefen koennen, was das Netz zu sehen bekommt.
const WC = "https://webconference.bunsenbrenner.org";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

const WASM = `
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => x.toString(16).padStart(2, "0")).join("");
export default async function init() {}
export function generate_holder_identity() { return { public_hex: hex(32), private_hex: hex(32) }; }
export function generate_noise_identity() { return { public_hex: hex(32), private_hex: hex(32) }; }
export function holderSign() { return new Uint8Array(64).fill(7); }
export function frame_message(b) { const o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
export function buildChannelJoinRequest(grant, mode) { return enc.encode(JSON.stringify({ grant, mode })); }
class T { encrypt(b) { return b; } decrypt(b) { return b; } }
class HS { constructor(i) { this.i = i; } writeMessage() { return enc.encode(this.i ? "HS1" : "HS2"); } readMessage() {} intoTransport() { return new T(); } }
export const NoiseHandshake = { newInitiator: () => new HS(true), newResponder: () => new HS(false) };
export function encodeSignalOffer(sdp) { return enc.encode(JSON.stringify({ kind: "offer", sdp })); }
export function encodeSignalAnswer(sdp) { return enc.encode(JSON.stringify({ kind: "answer", sdp })); }
export function encodeSignalIceCandidate(candidate, sdpMid, i) { return enc.encode(JSON.stringify({ kind: "ice-candidate", candidate, sdpMid, sdpMlineIndex: i })); }
export function decodeSignalMessage(b) { return JSON.parse(dec.decode(b)); }
`;

const PAGE_FAKES = () => {
  class FakeWS extends EventTarget {
    constructor(url) { super(); this.url = url; this.readyState = 0; this.binaryType = "blob"; globalThis.__fakeWs = this; setTimeout(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }, 0); }
    send(b) { window.__edgeSend(Array.from(b instanceof Uint8Array ? b : new Uint8Array(b))); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.dispatchEvent(new Event("close")); }
  }
  window.__wsIn = (arr) => { const ws = globalThis.__fakeWs; if (ws && ws.readyState === 1) ws.dispatchEvent(new MessageEvent("message", { data: new Uint8Array(arr).buffer })); };
  class FakeDC { constructor(l) { this.label = l; this.readyState = "connecting"; } send(s) { window.__dcSend(String(s)); } close() { if (this.readyState === "closed") return; this.readyState = "closed"; window.__dcClose(); if (this.onclose) this.onclose(); } }
  class FakePC {
    constructor() { globalThis.__fakePc = this; this.connectionState = "new"; this.dc = null; this.local = null; this.remote = null; }
    createDataChannel(l) { this.dc = new FakeDC(l); return this.dc; }
    async createOffer() { return { type: "offer", sdp: "v=0 fake-offer" }; }
    async createAnswer() { return { type: "answer", sdp: "v=0 fake-answer" }; }
    async setLocalDescription(d) { this.local = d; setTimeout(() => { if (this.onicecandidate) { this.onicecandidate({ candidate: { candidate: "candidate:1 1 udp 1 192.0.2.1 9 typ host", sdpMid: "0", sdpMLineIndex: 0 } }); this.onicecandidate({ candidate: null }); } this.check(); }, 0); }
    async setRemoteDescription(d) { this.remote = d; this.check(); }
    async addIceCandidate() {}
    check() { if (this.local && this.remote && !this.ready) { this.ready = true; window.__rtcReady(); } }
    close() { this.connectionState = "closed"; if (this.dc) this.dc.close(); }
  }
  window.__rtcOpen = () => { const pc = globalThis.__fakePc; if (!pc.dc) { pc.dc = new FakeDC("game"); if (pc.ondatachannel) pc.ondatachannel({ channel: pc.dc }); } pc.dc.readyState = "open"; pc.connectionState = "connected"; if (pc.dc.onopen) pc.dc.onopen(); };
  window.__dcIn = (s) => { const pc = globalThis.__fakePc; if (pc && pc.dc && pc.dc.readyState === "open" && pc.dc.onmessage) pc.dc.onmessage({ data: s }); };
  window.__dcDown = () => { const pc = globalThis.__fakePc; if (pc && pc.dc && pc.dc.readyState !== "closed") { pc.dc.readyState = "closed"; if (pc.dc.onclose) pc.dc.onclose(); } };
  window.WebSocket = FakeWS;
  window.RTCPeerConnection = FakePC;
};

export function fakeLive() {
  const invites = new Map(), wire = { dc: [], edge: [], http: [] };
  const sides = {};
  let n = 0;
  const chain = (side, f) => { sides[side].q = sides[side].q.then(f).catch(() => {}); };
  // Der Broker laeuft im abgeschotteten Rahmen: Antworten gehen an den Rahmen, aus dem der Aufruf kam
  const push = (side, fn, arg) => chain(side, () => (sides[side].frame || sides[side].page.mainFrame()).evaluate(([f, a]) => window[f](a), [fn, arg]));

  async function bridge(route) {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname === "/pkg/ct_agent_wasm.js") return route.fulfill({ status: 200, headers: CORS, contentType: "text/javascript", body: WASM });
    if (url.pathname === "/pkg/ct_agent_wasm_bg.wasm") return route.fulfill({ status: 200, headers: CORS, contentType: "application/wasm", body: "" });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    wire.http.push(m + " " + url.pathname + url.search + " " + (req.postData() || ""));
    const json = (status, o) => route.fulfill({ status, headers: CORS, contentType: "application/json", body: JSON.stringify(o) });
    const tok = url.searchParams.get("token") || body.token;
    const inv = tok ? invites.get(tok) : null;
    const info = (role) => ({ channel: "c0ffee".padEnd(64, "0"), role, ws: "wss://webconference.bunsenbrenner.org/edge", grant: "fake-grant" });
    switch (url.pathname) {
      case "/api/play/open": { const t = ("Inv" + (++n)).padEnd(22, "_"); invites.set(t, { joined: false, attested: 0 }); return json(200, { token: t }); }
      case "/api/play/status":
        if (!inv) return json(404, {});
        return json(200, inv.joined ? { state: "joined", ...info("caller"), status: { state: inv.attested >= 2 ? "accepted_and_registered" : "pending" } } : { state: "open" });
      case "/api/play/join":
        if (!inv || inv.joined) return json(404, { code: "gone" });
        inv.joined = true; return json(200, info("callee"));
      case "/api/play/attest": if (inv) inv.attested++; return json(200, {});
      case "/api/play/ice": return json(200, { iceServers: [] });
      case "/api/play/done": return route.fulfill({ status: 204, headers: CORS });
      default: return json(404, {});
    }
  }

  /** Seite anbinden; side = "a" oder "b". Vor goto aufrufen. */
  async function attach(ctx, page, side) {
    sides[side] = { page, stage: 0, pending: [], rtc: false, q: Promise.resolve() };
    const other = side === "a" ? "b" : "a";
    await ctx.route(WC + "/**", bridge);
    await page.addInitScript(PAGE_FAKES);
    await page.exposeBinding("__edgeSend", (src, arr) => {
      const s = sides[side]; s.frame = src.frame;
      if (s.stage === 0) { s.stage = 1; const ch = new Array(32).fill(0).map((_, i) => (i * 7 + 3) & 255); push(side, "__wsIn", ch); return; }
      if (s.stage === 1) { s.stage = 2; push(side, "__wsIn", Array.from(Buffer.from("OK chan " + "ab".repeat(32) + "\n"))); for (const p of s.pending.splice(0)) push(side, "__wsIn", p); return; }
      wire.edge.push(Buffer.from(arr).toString("latin1"));
      const o = sides[other];
      if (o && o.stage === 2) push(other, "__wsIn", arr); else if (o) o.pending.push(arr);
    });
    await page.exposeBinding("__rtcReady", (src) => { sides[side].frame = src.frame; sides[side].rtc = true; if (sides[other] && sides[other].rtc) { push("a", "__rtcOpen", null); push("b", "__rtcOpen", null); } });
    await page.exposeBinding("__dcSend", (src, s) => { wire.dc.push({ from: side, s }); if (sides[other]) push(other, "__dcIn", s); });
    await page.exposeBinding("__dcClose", () => { if (sides[other]) push(other, "__dcDown", null); });
  }
  return { attach, wire };
}
