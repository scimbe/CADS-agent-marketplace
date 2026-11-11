// Broker-Aufraeumen (Review LOW): bei Fehler und Abbruch werden Edge-Socket und PeerConnection immer geschlossen und
// der Kanal per /done freigegeben – ohne auf Zeitgrenzen zu warten.
import test from "node:test";
import assert from "node:assert/strict";
import { createLive } from "../src/broker/live.js";

const enc = new TextEncoder();
const frame = (b) => { const o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; };
const WASM = {
  generate_holder_identity: () => ({ public_hex: "a".repeat(64), private_hex: "b".repeat(64) }),
  generate_noise_identity: () => ({ public_hex: "c".repeat(64), private_hex: "d".repeat(64) }),
  holderSign: () => new Uint8Array(64), frame_message: frame, buildChannelJoinRequest: () => enc.encode("join"),
  NoiseHandshake: { newInitiator: () => ({ writeMessage: () => enc.encode("HS1"), readMessage() {}, intoTransport: () => ({ encrypt: (b) => b, decrypt: (b) => b }) }), newResponder: () => ({}) },
  encodeSignalOffer: (s) => enc.encode(JSON.stringify({ kind: "offer", sdp: s })), encodeSignalAnswer: (s) => enc.encode(s), encodeSignalIceCandidate: () => enc.encode("{}"),
  decodeSignalMessage: (b) => JSON.parse(new TextDecoder().decode(b))
};
function world({ edge }) {
  const calls = [], sockets = [], pcs = [];
  const fetch = async (url, o) => {
    const u = new URL(url), p = u.pathname.replace("/api/play", "");
    calls.push((o && o.method === "POST" ? "POST " : "GET ") + p);
    const body = (s, j) => ({ status: s, json: async () => j });
    if (p === "/join") return body(200, { channel: "c".repeat(64), role: "caller", ws: "wss://x/edge", grant: "g" });
    if (p === "/attest") return body(200, {});
    if (p === "/status") return body(200, { status: { state: "accepted_and_registered" } });
    if (p === "/ice") return body(200, { iceServers: [] });
    return body(204, {});
  };
  class WS extends EventTarget {
    constructor() { super(); this.closed = false; this.stage = 0; sockets.push(this); setTimeout(() => this.dispatchEvent(new Event("open")), 0); }
    push(bytes) { setTimeout(() => { if (!this.closed) { const e = new Event("message"); e.data = bytes.buffer.slice(0); this.dispatchEvent(e); } }, 0); }
    send() {
      if (edge === "refuse") { this.push(enc.encode("NO")); return; }
      if (this.stage === 0) { this.stage = 1; this.push(new Uint8Array(32).fill(1)); }
      else if (this.stage === 1) { this.stage = 2; this.push(enc.encode("OK x " + "e".repeat(64) + "\n")); }
      else if (this.stage === 2) { this.stage = 3; this.push(frame(enc.encode("HS2"))); }
    }
    close() { if (this.closed) return; this.closed = true; this.dispatchEvent(new Event("close")); }
  }
  const openPc = () => { const pc = { closed: false, close() { this.closed = true; }, createDataChannel: () => ({ readyState: "connecting", close() {} }), createOffer: async () => ({ type: "offer", sdp: "x" }), setLocalDescription: async () => {}, setRemoteDescription: async () => {}, addIceCandidate: async () => {} }; pcs.push(pc); return pc; };
  const live = createLive({ wasm: async () => WASM, fetch, openWs: () => new WS(), openPc, timing: { join: 5000, edgeRetry: 1, handoff: 10 } });
  return { live, calls, sockets, pcs };
}
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error("Zeit"); await new Promise((r) => setTimeout(r, 2)); } };

test("Edge lehnt ab: alle drei Sockets zu, Kanal per /done freigegeben, Fehler gemeldet", async () => {
  const w = world({ edge: "refuse" }); let failed = null;
  w.live.accept("T".repeat(22), { onStep() {}, onToken() {}, onUp() {}, onDown() {}, onMessage() {}, onFail: (r) => { failed = r; } });
  await until(() => failed);
  assert.equal(failed, "verbindung");
  assert.equal(w.sockets.length, 3);
  assert.ok(w.sockets.every((s) => s.closed));
  await until(() => w.calls.includes("POST /done"));
});

test("Abbruch waehrend des Wartens auf den Datenkanal: PeerConnection und Socket sofort zu, /done gesendet", async () => {
  const w = world({ edge: "ok" }); const steps = [];
  const h = w.live.accept("T".repeat(22), { onStep: (s) => steps.push(s), onToken() {}, onUp() {}, onDown() {}, onMessage() {}, onFail() {} });
  await until(() => w.pcs.length === 1);
  const t0 = Date.now();
  h.close();
  await until(() => w.pcs[0].closed && w.sockets.every((s) => s.closed) && w.calls.includes("POST /done"), 1000);
  assert.ok(Date.now() - t0 < 1000, "nicht erst nach der Zeitgrenze");
});
