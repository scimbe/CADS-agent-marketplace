import { createHmac } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CallEndpoint, CallSession, State, stateLabel } from '../src/call-core.js';
import { MAX_SDP_BYTES, iceUrlHost, parseMessage } from '../src/protocol.js';
import { mintTurnCredential } from '../server/turn-credentials.js';

const FAST = { minEpochGapMs: 0, iceFetchTimeoutMs: 20, signalRetryMs: 5, ringTimeoutMs: 40, connectTimeoutMs: 30, disconnectGraceMs: 1,
  reconnectWindowMs: 60, restartBackoffMs: [0, 2], statsIntervalMs: 2, mediaStallMs: 10 };
// Echte Neuaufbau-Reihenfolge: eine Epoche, keine Schleife im Millisekundentakt, kein Fensterablauf.
const STEADY = { ...FAST, minEpochGapMs: 60000, reconnectWindowMs: 5000, mediaStallMs: 60000 };
// Echte Medien laufen weiter: Pakete steigen, bis die Bedingung erreicht ist.
const whileFlowing = async (e, f) => { const id = setInterval(() => { e.packets += 1; }, 1); try { await until(f); } finally { clearInterval(id); } };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (f) => { for (let i = 0; i < 300 && !f(); i++) await tick(2); assert.ok(f(), 'Bedingung nicht erreicht'); };

class FakePc {
  constructor(cfg, env) { Object.assign(this, { cfg, env, signalingState: 'stable', connectionState: 'new', configs: [cfg], closed: false, offers: [] }); env.pcs.push(this); }
  addTrack() {}
  setConfiguration(c) { this.cfg = c; this.configs.push(c); }
  async createOffer(o) { this.offers.push(o); return { type: 'offer', sdp: `offer-${this.offers.length}` }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
  async setLocalDescription(d) {
    if (d.type === 'rollback') { this.signalingState = 'stable'; return; }
    this.localDescription = d; this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d) { this.remoteDescription = d; this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable'; }
  async addIceCandidate() {}
  async getStats() { return new Map([['i', { id: 'i', type: 'inbound-rtp', packetsReceived: this.env.packets, bytesReceived: this.env.packets * 100 }]]); }
  set(s) { this.connectionState = s; this.onconnectionstatechange?.(); }
  close() { this.closed = true; }
}

function env() {
  const e = { pcs: [], gum: 0, tracks: [], packets: 0, ice: 0, deny: false };
  e.rtc = {
    RTCPeerConnection: class extends FakePc { constructor(c) { super(c, e); } },
    getUserMedia: async () => {
      e.gum += 1;
      if (e.deny) throw Object.assign(new Error('x'), { name: 'NotAllowedError' });
      const t = { stop() { t.stopped = true; }, enabled: true };
      e.tracks.push(t);
      return { getTracks: () => [t], getAudioTracks: () => [t] };
    },
  };
  e.getIceServers = async () => { e.ice += 1; return [{ urls: 'turn:t.example:3478', username: `u${e.ice}`, credential: 'c' }]; };
  return e;
}

function pair({ a: aOpt = {}, b: bOpt = {}, drop = () => false } = {}) {
  const ea = env(); const eb = env();
  const link = () => { const l = new Set(); return { l, sub: (f) => { l.add(f); return () => l.delete(f); } }; };
  const la = link(); const lb = link();
  const wire = (to) => (m) => { if (!drop(m)) queueMicrotask(() => to.l.forEach((f) => f(structuredClone(m)))); };
  const a = new CallEndpoint({ transport: { send: wire(lb), onMessage: la.sub }, rtc: ea.rtc, getIceServers: ea.getIceServers, timing: FAST, ...aOpt });
  const b = new CallEndpoint({ transport: { send: wire(la), onMessage: lb.sub }, rtc: eb.rtc, getIceServers: eb.getIceServers, timing: FAST, ...bOpt });
  return { a, b, ea, eb };
}

async function connected(p) {
  const c = p.a.dial();
  await until(() => p.b.call?.state === State.RINGING_IN);
  await p.b.call.accept();
  await until(() => p.ea.pcs[0]?.remoteDescription);
  p.ea.pcs[0].set('connected'); p.eb.pcs[0].set('connected');
  assert.equal(c.state, State.CONNECTED);
  return c;
}

test('Mikrofon bleibt beim Klingeln zu und oeffnet erst nach Annahme', async () => {
  const p = pair();
  p.a.dial();
  await until(() => p.b.call?.state === State.RINGING_IN);
  await until(() => p.a.call.state === State.RINGING_OUT);
  assert.equal(p.ea.gum, 0); assert.equal(p.eb.gum, 0);
  await p.b.call.accept();
  assert.equal(p.eb.gum, 1);
  await until(() => p.ea.gum === 1);
  p.a.close(); p.b.close();
});

test('verlorene Einladung und verlorenes Offer werden wiederholt', async () => {
  let dropped = { 'call.invite': 2, 'call.offer': 2 };
  const p = pair({ drop: (m) => dropped[m.type] > 0 && dropped[m.type]-- > 0 });
  await connected(p);
  p.a.close(); p.b.close();
});

test('Ablehnen, Besetzt und Klingel-Timeout beenden sauber ohne Medien', async () => {
  const p = pair();
  const c = p.a.dial();
  await until(() => p.b.call?.state === State.RINGING_IN);
  p.b.call.decline();
  await until(() => c.state === State.ENDED);
  assert.equal(c.endReason, 'declined');
  const q = pair();
  const c2 = q.a.dial();
  await until(() => c2.state === State.RINGING_OUT);
  await until(() => c2.state === State.ENDED);
  assert.equal(c2.endReason, 'no-answer'); assert.equal(q.ea.gum + q.eb.gum, 0);
});

test('zweiter Anruf waehrend eines Gespraechs bekommt call.busy', async () => {
  const p = pair();
  await connected(p);
  const seen = [];
  const orig = p.b.transport.send;
  p.b.transport.send = (m) => { seen.push(m.type); orig(m); };
  p.b.handle({ v: 1, type: 'call.invite', callId: 'ZZZZZZZZZZ' });
  assert.deepEqual(seen, ['call.busy']);
  p.a.close(); p.b.close();
});

test('verweigertes Mikrofon beendet den Anruf bei beiden sichtbar', async () => {
  const p = pair();
  p.eb.deny = true;
  const c = p.a.dial();
  await until(() => p.b.call?.state === State.RINGING_IN);
  await p.b.call.accept();
  assert.equal(p.b.call.endReason, 'media-denied');
  await until(() => c.state === State.ENDED);
  assert.equal(c.endReason, 'media-denied');
});

test('Abbruch: frische Zugangsdaten, neue Epoche, Medien beenden den Neuaufbau', async () => {
  const p = pair({ a: { timing: STEADY }, b: { timing: STEADY } });
  const c = await connected(p);
  const before = p.ea.ice;
  p.ea.packets = 1;
  await tick(6);
  p.ea.pcs[0].set('failed');
  assert.equal(c.state, State.RECONNECTING);
  await until(() => c.epoch >= 1 && p.b.call.answeredEpoch >= 1);
  assert.ok(p.ea.ice > before, 'keine frischen ICE-Daten');
  assert.ok(p.ea.pcs[0].offers.some((o) => o.iceRestart));
  p.ea.pcs[0].set('connected');
  assert.equal(c.state, State.RECONNECTING, 'connected ohne Pakete zaehlt nicht');
  await whileFlowing(p.ea, () => c.state === State.CONNECTED);
  assert.equal(c.reconnects, 1);
  p.a.close(); p.b.close();
});

test('Restpakete vor dem ausgehandelten Neustart zaehlen nicht als Erholung', async () => {
  let block = false;
  const p = pair({ a: { timing: STEADY }, b: { timing: STEADY }, drop: (m) => block && (m.type === 'call.offer' || m.type === 'call.answer') });
  const c = await connected(p);
  p.ea.packets = 1; await tick(6);
  block = true;
  p.ea.pcs[0].set('failed');
  await until(() => c.epoch === 1);
  p.ea.pcs[0].set('connected');
  for (let i = 0; i < 5; i++) { p.ea.packets += 10; await tick(4); }
  assert.equal(c.state, State.RECONNECTING, 'Restpakete beendeten den Neuaufbau');
  block = false;
  await until(() => p.b.call.answeredEpoch >= 1 && p.ea.pcs[0].signalingState === 'stable');
  await whileFlowing(p.ea, () => c.state === State.CONNECTED);
  p.a.close(); p.b.close();
});

test('verspaetetes call.restart oeffnet keine neue Epoche', async () => {
  const p = pair({ a: { timing: STEADY }, b: { timing: STEADY } });
  const c = await connected(p);
  p.ea.packets = 1; await tick(6);
  p.ea.pcs[0].set('failed');
  await until(() => c.epoch === 1);
  p.ea.pcs[0].set('connected');
  await whileFlowing(p.ea, () => c.state === State.CONNECTED);
  c.receive({ v: 1, type: 'call.restart', callId: c.callId, epoch: 0 });
  assert.equal(c.state, State.CONNECTED);
  p.a.close(); p.b.close();
});

test('Angerufener fordert Neustart an, Anrufer bleibt alleiniger Offerer', async () => {
  const p = pair();
  const c = await connected(p);
  p.eb.pcs[0].set('failed');
  await until(() => c.epoch >= 1);
  assert.equal(p.eb.pcs[0].offers.length, 0);
  p.a.close(); p.b.close();
});

test('Medienstillstand trotz connected loest Neuaufbau aus', async () => {
  const p = pair();
  const c = await connected(p);
  await until(() => c.state === State.RECONNECTING);
  p.a.close(); p.b.close();
});

test('Zeitfenster abgelaufen: Ende, Tracks gestoppt, Relay freigegeben', async () => {
  const p = pair();
  const c = await connected(p);
  p.ea.pcs[0].set('failed');
  await until(() => c.state === State.ENDED);
  assert.equal(c.endReason, 'connection-lost');
  assert.ok(p.ea.tracks.every((t) => t.stopped)); assert.ok(p.ea.pcs[0].closed);
  assert.equal(c.timers.size, 0);
});

test('ab dem zweiten Versuch nur noch TURN', async () => {
  const p = pair();
  const c = await connected(p);
  p.ea.pcs[0].set('failed');
  await until(() => p.ea.pcs[0].configs.some((x) => x.iceTransportPolicy === 'relay'));
  c.hangup(); p.b.close();
});

test('kontoloser Angerufener: Daten aus dem Offer, nur von erlaubten Hosts', async () => {
  const grant = (host) => async () => [{ urls: `turn:${host}:3478`, username: 'p', credential: 'c' }];
  const p = pair({ a: { getPeerIceServers: grant('t.example') }, b: { allowedRelayHosts: ['t.example'], getIceServers: async () => [] } });
  await connected(p);
  assert.equal(p.eb.pcs[0].cfg.iceServers[0].username, 'p');
  p.a.close(); p.b.close();
  const q = pair({ a: { getPeerIceServers: grant('evil.example') }, b: { allowedRelayHosts: ['t.example'], getIceServers: async () => [] } });
  await connected(q);
  assert.deepEqual(q.eb.pcs[0].cfg.iceServers, []);
  q.a.close(); q.b.close();
});

test('unbeantwortetes Offer erzeugt keine neue Epoche, Netzwechsel schon', async () => {
  const p = pair({ a: { timing: { ...FAST, minEpochGapMs: 10000 } }, drop: (m) => m.type === 'call.answer' && m.sdp && dropAnswers });
  let dropAnswers = false;
  const c = await connected(p);
  dropAnswers = true;
  p.ea.packets = 1; await tick(6);
  p.ea.pcs[0].set('failed');
  await until(() => c.epoch === 1);
  await tick(30);
  assert.equal(c.epoch, 1);
  c.networkChanged();
  await until(() => c.epoch === 2);
  p.a.close(); p.b.close();
});

test('haengender ICE-Abruf blockiert den Ablauf nicht', async () => {
  const p = pair({ b: { getIceServers: () => new Promise(() => {}) } });
  await connected(p);
  assert.equal(p.b.call.turnAvailable, false);
  p.a.close(); p.b.close();
});

test('fremde callId, Muell und Uebergroesse werden verworfen', () => {
  const e = env();
  const s = new CallSession({ send() {}, rtc: e.rtc, getIceServers: e.getIceServers, callId: 'AAAAAAAAAA', role: 'callee' });
  s.state = State.RINGING_IN;
  s.receive({ v: 1, type: 'call.bye', callId: 'BBBBBBBBBB' });
  s.receive('x'); s.receive(null);
  assert.equal(s.state, State.RINGING_IN);
  assert.equal(parseMessage({ v: 1, type: 'call.nope', callId: 'AAAAAAAAAA' }), null);
  assert.equal(parseMessage({ v: 2, type: 'call.bye', callId: 'AAAAAAAAAA' }), null);
  assert.equal(parseMessage({ v: 1, type: 'call.offer', callId: 'AAAAAAAAAA', epoch: 0, sdp: 'x'.repeat(MAX_SDP_BYTES + 1) }), null);
  assert.equal(parseMessage({ v: 1, type: 'call.offer', callId: 'AAAAAAAAAA', epoch: 0, sdp: 'v', iceServers: [{ urls: 'http://x' }] }).iceServers, undefined);
  assert.equal(iceUrlHost('turn:t.example:3478?transport=tcp'), 't.example');
});

test('Zugangsdaten: coturn-Format, nur Pseudonym, begrenzte Laufzeit', () => {
  const c = mintTurnCredential({ secret: 's', subject: 'abc', ttlSeconds: 60, nowMs: 1000000 });
  assert.equal(c.username, '1060:abc');
  assert.equal(c.credential, createHmac('sha1', 's').update('1060:abc').digest('base64'));
  assert.throws(() => mintTurnCredential({ secret: 's', subject: 'a@b.de', ttlSeconds: 60 }));
  assert.throws(() => mintTurnCredential({ secret: 's', subject: 'a', ttlSeconds: 86400 }));
});

test('keine Aufzeichnung im Kern', () => {
  for (const f of readdirSync(new URL('../src/', import.meta.url))) {
    const code = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /MediaRecorder|captureStream|AudioWorklet|ScriptProcessor/);
  }
});

test('Zustandstexte sind vollstaendig', () => {
  for (const s of Object.values(State)) if (s !== State.IDLE) assert.ok(stateLabel(s, 'declined'));
});
