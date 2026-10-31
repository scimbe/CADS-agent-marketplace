// 1:1-Anruf ueber eine bestehende Kanalverbindung.
//
// Grenzen dieses Moduls:
//  - Es kennt keine Konten. Der Kanal liefert send()/onMessage() und bindet die
//    Nachrichten an genau einen Gegenueber.
//  - Mikrofon und Kamera werden erst geoeffnet, wenn der Anruf angenommen ist:
//    beim Angerufenen in accept(), beim Anrufer beim Eintreffen von call.accept.
//  - Es wird nichts aufgezeichnet.
//  - Signalisierung darf verloren gehen: invite, offer und restart werden
//    wiederholt, bis eine Antwort kommt. Der Kanal muss nicht puffern.
//  - Nur der Anrufer erzeugt Offers. So kann es keine Offer-Kollision geben; der
//    Angerufene fordert einen Neustart mit call.restart an.
import { PROTOCOL_VERSION, iceUrlHost, newCallId, parseMessage } from './protocol.js';

export const State = Object.freeze({
  IDLE: 'idle',
  CALLING: 'calling',        // Anrufer: Einladung unterwegs
  RINGING_OUT: 'ringing-out',// Anrufer: es klingelt beim Gegenueber
  RINGING_IN: 'ringing-in',  // Angerufener: es klingelt hier
  CONNECTING: 'connecting',  // angenommen, Medienweg wird aufgebaut
  CONNECTED: 'connected',    // Medien fliessen
  RECONNECTING: 'reconnecting',
  ENDED: 'ended',
});

export const DEFAULT_TIMING = Object.freeze({
  signalRetryMs: 3000,       // Wiederholung unbeantworteter Signalisierung
  iceFetchTimeoutMs: 5000,   // ein haengender Abruf darf den Ablauf nicht blockieren
  minEpochGapMs: 15000,      // neue Epoche ohne Antwort: jede kostet TURN-Zuteilungen
  ringTimeoutMs: 45000,      // kein Abheben
  connectTimeoutMs: 12000,   // Erstaufbau, danach Neustart nur ueber TURN
  disconnectGraceMs: 1500,   // kurze Aussetzer nicht als Abbruch werten
  reconnectWindowMs: 60000,  // danach Abbruch, damit keine Relay-Zuteilung liegen bleibt
  restartBackoffMs: [0, 4000, 8000, 15000],
  statsIntervalMs: 1000,
  mediaStallMs: 4000,        // verbunden gemeldet, aber keine Pakete
});

const noop = () => {};

export class CallSession {
  /**
   * @param send         (msg) => void|Promise  sendet ueber den Kanal
   * @param getIceServers async () => RTCIceServer[]  liefert frische, kurzlebige Zugangsdaten
   * @param rtc          { RTCPeerConnection, getUserMedia } fuer Tests austauschbar
   * @param forceRelay   nur TURN, von Anfang an
   * @param getPeerIceServers async () => RTCIceServer[]  nur Anrufer: Zugang fuer den kontolosen
   *                     Angerufenen; wird Ende-zu-Ende verschluesselt im Offer mitgegeben
   * @param allowedRelayHosts nur Angerufener: Hosts, von denen mitgelieferte Server angenommen
   *                     werden. Sonst koennte ein Kontakt die Medien ueber sein eigenes Relay leiten.
   */
  constructor({ send, getIceServers, rtc, timing, forceRelay = false, onChange = noop, onRemoteStream = noop,
    onEnded = noop, log = noop, callId, role, video = false, getPeerIceServers, allowedRelayHosts = [] }) {
    this.send = (m) => Promise.resolve()
      .then(() => send({ v: PROTOCOL_VERSION, callId: this.callId, ...m }))
      .catch((e) => log(`senden fehlgeschlagen: ${e?.message || e}`));
    this.getIceServers = getIceServers;
    this.getPeerIceServers = getPeerIceServers;
    this.allowedRelayHosts = new Set(allowedRelayHosts.map((h) => h.toLowerCase()));
    this.rtc = rtc;
    this.t = { ...DEFAULT_TIMING, ...timing };
    this.forceRelay = forceRelay;
    this.relayOnly = forceRelay;
    this.onChange = onChange;
    this.onRemoteStream = onRemoteStream;
    this.onEnded = onEnded;
    this.log = log;
    this.callId = callId || newCallId();
    this.role = role;
    this.video = video;
    this.state = State.IDLE;
    this.endReason = null;
    this.error = null;
    this.pc = null;
    this.localStream = null;
    this.epoch = 0;
    this.answeredEpoch = -1;
    this.pendingCandidates = [];
    this.timers = new Map();
    this.queue = Promise.resolve();
    this.muted = false;
    this.restartAttempt = 0;
    this.reconnectStartedAt = null;
    this.lastPackets = 0;
    this.lastPacketsAt = 0;
    this.reconnects = 0;
    this.turnAvailable = null;
    this.lastOfferAt = 0;
    this.epochAtLoss = 0;
  }

  // ---- Ablauf -------------------------------------------------------------

  dial() {
    this.role = 'caller';
    this.setState(State.CALLING);
    const invite = () => this.send({ type: 'call.invite', video: this.video });
    invite();
    this.every('invite', this.t.signalRetryMs, invite);
    this.after('ring', this.t.ringTimeoutMs, () => this.finish('no-answer', true));
  }

  /** Nur aus einem Tap heraus aufrufen: oeffnet Mikrofon und ggf. Kamera. */
  accept() {
    if (this.state !== State.RINGING_IN) return Promise.resolve();
    this.clear('ring');
    this.setState(State.CONNECTING);
    return this.enqueue(async () => {
      await this.prepareConnection();
      if (this.isOver()) return;
      this.send({ type: 'call.accept', video: this.video });
      this.after('connect', this.t.connectTimeoutMs, () => this.onLinkLost('Erstaufbau dauert zu lange', true));
    });
  }

  decline() {
    if (this.state !== State.RINGING_IN) return;
    this.send({ type: 'call.decline' });
    this.finish('declined', false);
  }

  hangup() {
    if (this.isOver()) return;
    const ringingOut = this.state === State.CALLING || this.state === State.RINGING_OUT;
    this.finish(ringingOut ? 'cancelled' : 'hangup', true);
  }

  setMuted(muted) {
    this.muted = !!muted;
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !this.muted; });
    this.emit();
  }

  /** Vom Kanal aufrufen, sobald eine Nachricht dieses Anrufs eintrifft. */
  receive(raw) {
    const m = parseMessage(raw);
    if (!m || m.callId !== this.callId || this.isOver()) return;
    switch (m.type) {
      case 'call.ringing':
        if (this.state === State.CALLING) {
          this.clear('invite');
          this.setState(State.RINGING_OUT);
        }
        return;
      case 'call.accept': return this.onAccepted(m);
      case 'call.decline': return this.finish('declined', false);
      case 'call.busy': return this.finish('busy', false);
      case 'call.bye': return this.finish(m.reason === 'hangup' ? 'remote-hangup' : m.reason, false);
      case 'call.offer': return void this.enqueue(() => this.onOffer(m));
      case 'call.answer': return void this.enqueue(() => this.onAnswer(m));
      case 'call.ice': return void this.enqueue(() => this.onIce(m));
      case 'call.restart':
        // Verspaetete Anforderung: diese Epoche ist schon ersetzt, sonst doppelte Zuteilungen.
        if (this.role === 'caller' && m.epoch >= this.epoch) this.onLinkLost('Gegenstelle meldet Abbruch', true);
        return;
      default:
    }
  }

  /** Vom Betriebssystem/Browser gemeldeter Netzwechsel: nicht auf ICE-Timeouts warten. */
  networkChanged() {
    if (this.state === State.CONNECTED || this.state === State.RECONNECTING) {
      this.lastOfferAt = 0; // gesammelte Kandidaten gehoeren zum alten Netz
      this.onLinkLost('Netzwechsel', true);
    }
  }

  // ---- Aufbau -------------------------------------------------------------

  onAccepted(m) {
    if (this.role !== 'caller' || (this.state !== State.CALLING && this.state !== State.RINGING_OUT)) return;
    this.clear('invite');
    this.clear('ring');
    this.video = this.video && m.video;
    this.setState(State.CONNECTING);
    this.enqueue(async () => {
      await this.prepareConnection();
      if (this.isOver()) return;
      await this.sendOffer(false);
      this.after('connect', this.t.connectTimeoutMs, () => this.onLinkLost('Erstaufbau dauert zu lange', true));
    });
  }

  async prepareConnection() {
    try {
      this.localStream = await this.rtc.getUserMedia({ audio: true, video: this.video });
    } catch (e) {
      this.error = e?.name || 'media-error';
      this.finish('media-denied', true);
      return;
    }
    if (this.isOver()) {
      this.stopLocalMedia();
      return;
    }
    const iceServers = await this.fetchIceServers();
    if (this.isOver()) return;
    const pc = new this.rtc.RTCPeerConnection(this.pcConfig(iceServers));
    this.pc = pc;
    this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream));
    pc.ontrack = (ev) => this.onRemoteStream(ev.streams[0]);
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.send({ type: 'call.ice', epoch: this.epoch, candidate: ev.candidate.toJSON?.() ?? ev.candidate });
      }
    };
    pc.onconnectionstatechange = () => { this.log(`pc ${pc.connectionState}`); this.onPcState(); };
    this.every('stats', this.t.statsIntervalMs, () => this.watchMedia());
  }

  async fetchIceServers() {
    try {
      const servers = await this.withTimeout(this.getIceServers());
      this.turnAvailable = servers.some((s) => [].concat(s.urls).some((u) => /^turns?:/.test(u)));
      return servers;
    } catch (e) {
      // Ohne TURN weiter: im selben Netz oder bei offenem NAT geht es trotzdem. Sichtbar melden.
      this.log(`ICE-Zugang nicht abrufbar: ${e?.message || e}`);
      this.turnAvailable = false;
      return [];
    }
  }

  withTimeout(promise) {
    let id;
    const limit = new Promise((_, reject) => {
      id = setTimeout(() => reject(new Error('Zeitlimit')), this.t.iceFetchTimeoutMs);
    });
    return Promise.race([promise, limit]).finally(() => clearTimeout(id));
  }

  pcConfig(iceServers) {
    return { iceServers, iceTransportPolicy: this.relayOnly ? 'relay' : 'all' };
  }

  async sendOffer(iceRestart) {
    const pc = this.pc;
    if (!pc || this.isOver()) return;
    if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
    if (iceRestart) this.epoch += 1;
    this.lastOfferAt = this.now();
    this.pendingCandidates = [];
    const iceServers = await this.peerIceServers();
    if (this.isOver() || this.pc !== pc) return;
    await pc.setLocalDescription(await pc.createOffer({ iceRestart }));
    const epoch = this.epoch;
    const send = () => {
      if (this.pc?.localDescription?.type === 'offer' && this.epoch === epoch) {
        this.send({ type: 'call.offer', epoch, sdp: this.pc.localDescription.sdp, iceServers });
      }
    };
    send();
    // Die Wiederholung traegt die bis dahin gesammelten Kandidaten im SDP mit.
    this.every('offer', this.t.signalRetryMs, send);
  }

  async peerIceServers() {
    if (!this.getPeerIceServers) return undefined;
    try {
      return await this.withTimeout(this.getPeerIceServers());
    } catch (e) {
      this.log(`Zugang fuer Gegenstelle nicht abrufbar: ${e?.message || e}`);
      return undefined;
    }
  }

  allowedPeerServers(list) {
    return (list || []).filter((s) => s.urls.every((u) => this.allowedRelayHosts.has(iceUrlHost(u))));
  }

  async onOffer(m) {
    if (this.role !== 'callee' || !this.pc) return;
    if (m.epoch < this.answeredEpoch) return;
    if (m.epoch === this.answeredEpoch) {
      this.send({ type: 'call.answer', epoch: m.epoch, sdp: this.pc.localDescription.sdp });
      return;
    }
    // Vor jedem Neustart frische Zugangsdaten: die alten sind bei langen Gespraechen abgelaufen.
    const given = this.allowedPeerServers(m.iceServers);
    if (given.length) {
      this.turnAvailable = true;
      this.pc.setConfiguration(this.pcConfig(given));
    } else if (m.epoch > 0) {
      this.pc.setConfiguration(this.pcConfig(await this.fetchIceServers()));
      if (this.isOver()) return;
    }
    this.epoch = m.epoch;
    this.log(`Offer Epoche ${m.epoch}, ${given.length} Server aus dem Offer`);
    await this.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    await this.flushCandidates();
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    this.answeredEpoch = m.epoch;
    this.clear('restart'); // Anforderung erfuellt
    this.send({ type: 'call.answer', epoch: m.epoch, sdp: this.pc.localDescription.sdp });
  }

  async onAnswer(m) {
    if (this.role !== 'caller' || !this.pc || m.epoch !== this.epoch) return;
    if (this.pc.signalingState !== 'have-local-offer') return;
    this.clear('offer');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
    await this.flushCandidates();
  }

  async onIce(m) {
    if (!this.pc || m.epoch !== this.epoch) {
      if (m.epoch > this.epoch) this.pendingCandidates.push(m);
      return;
    }
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(m);
      return;
    }
    await this.pc.addIceCandidate(m.candidate).catch((e) => this.log(`Kandidat verworfen: ${e?.message}`));
  }

  async flushCandidates() {
    const list = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const m of list) await this.onIce(m);
  }

  // ---- Stabilitaet --------------------------------------------------------

  onPcState() {
    const s = this.pc?.connectionState;
    if (s === 'connected') {
      this.clear('connect');
      this.clear('grace');
      // Erst echte Pakete beenden den Neuaufbau, siehe watchMedia.
      if (this.state === State.CONNECTING) this.markConnected();
    } else if (s === 'failed') {
      this.onLinkLost('ICE fehlgeschlagen', true);
    } else if (s === 'disconnected') {
      this.after('grace', this.t.disconnectGraceMs, () => this.onLinkLost('Verbindung unterbrochen', true));
    }
  }

  markConnected() {
    this.clear('restart');
    this.clear('window');
    this.clear('offer');
    this.restartAttempt = 0;
    this.reconnectStartedAt = null;
    this.lastPacketsAt = this.now();
    this.setState(State.CONNECTED);
  }

  async watchMedia() {
    if (!this.pc || this.isOver()) return;
    const s = await this.sample();
    const moved = s.packetsReceived > this.lastPackets;
    this.lastPackets = s.packetsReceived;
    if (moved) {
      this.lastPacketsAt = this.now();
      if (this.state === State.RECONNECTING && this.renegotiated()) {
        this.reconnects += 1;
        this.markConnected();
      }
    } else if (this.state === State.CONNECTED && this.now() - this.lastPacketsAt > this.t.mediaStallMs) {
      this.onLinkLost('keine Medienpakete', true);
    }
  }

  /**
   * Neuaufbau zaehlt erst, wenn der Neustart ausgehandelt ist. Restpakete auf dem alten Weg
   * und ein noch nicht abgelaufenes ICE-"connected" sind kein Beleg.
   */
  renegotiated() {
    const pc = this.pc;
    if (pc.connectionState !== 'connected' || this.epoch <= this.epochAtLoss) return false;
    return pc.signalingState === 'stable' && (this.role === 'caller' || this.answeredEpoch === this.epoch);
  }

  /** Beginnt oder beschleunigt den Neuaufbau; beendet nach reconnectWindowMs. */
  onLinkLost(reason, immediate) {
    if (this.isOver() || !this.pc) return;
    this.log(`Neuaufbau: ${reason}`);
    if (this.state !== State.RECONNECTING) {
      this.clear('connect');
      this.setState(State.RECONNECTING);
      this.reconnectStartedAt = this.now();
      this.epochAtLoss = this.epoch;
      this.after('window', this.t.reconnectWindowMs, () => this.finish('connection-lost', true));
    }
    if (this.timers.has('restart')) return;
    if (this.role === 'callee') {
      if (this.answeredEpoch > this.epochAtLoss) return; // Neustart laeuft schon
      const ask = () => this.send({ type: 'call.restart', epoch: this.epoch });
      ask();
      this.every('restart', this.t.signalRetryMs, ask);
      return;
    }
    if (immediate) this.scheduleRestart();
  }

  scheduleRestart() {
    const b = this.t.restartBackoffMs;
    const delay = b[Math.min(this.restartAttempt, b.length - 1)];
    this.after('restart', delay, () => {
      this.timers.delete('restart');
      this.restartAttempt += 1;
      this.enqueue(() => this.restartIce());
      // Solange nichts ankommt, naechster Versuch. Ab dem zweiten nur noch ueber TURN.
      this.after('restart', Math.max(this.t.signalRetryMs * 2, b[Math.min(this.restartAttempt, b.length - 1)]), () => {
        this.timers.delete('restart');
        this.scheduleRestart();
      });
    });
  }

  async restartIce() {
    if (this.isOver() || !this.pc) return;
    // Offer noch unbeantwortet (Kanal weg): wiederholen statt neue Zuteilungen anzulegen.
    if (this.pc.signalingState === 'have-local-offer' && this.now() - this.lastOfferAt < this.t.minEpochGapMs) return;
    if (this.restartAttempt >= 2) this.relayOnly = true;
    this.pc.setConfiguration(this.pcConfig(await this.fetchIceServers()));
    if (this.isOver()) return;
    await this.sendOffer(true);
  }

  async sample() {
    const out = {
      bytesSent: 0, bytesReceived: 0, packetsReceived: 0, packetsLost: 0, framesDecoded: 0,
      audioEnergy: 0, pair: null,
    };
    if (!this.pc) return out;
    const report = await this.pc.getStats();
    const byId = new Map();
    report.forEach((r) => byId.set(r.id, r));
    let selected = null;
    report.forEach((r) => {
      if (r.type === 'inbound-rtp') {
        out.bytesReceived += r.bytesReceived || 0;
        out.packetsReceived += r.packetsReceived || 0;
        out.packetsLost += r.packetsLost || 0;
        out.framesDecoded += r.framesDecoded || 0;
        out.audioEnergy += r.totalAudioEnergy || 0;
      } else if (r.type === 'outbound-rtp') {
        out.bytesSent += r.bytesSent || 0;
      } else if (r.type === 'transport' && r.selectedCandidatePairId) {
        selected = byId.get(r.selectedCandidatePairId);
      }
    });
    if (selected) {
      const local = byId.get(selected.localCandidateId);
      const remote = byId.get(selected.remoteCandidateId);
      out.pair = {
        local: local?.candidateType,
        remote: remote?.candidateType,
        protocol: local?.protocol,
        relayProtocol: local?.relayProtocol,
        localIp: local?.address,
        rttMs: selected.currentRoundTripTime != null ? Math.round(selected.currentRoundTripTime * 1000) : null,
      };
    }
    return out;
  }

  // ---- Hilfen -------------------------------------------------------------

  now() { return Date.now(); }

  isOver() { return this.state === State.ENDED; }

  setState(s) {
    if (this.state === s) return;
    this.log(`Zustand ${s}`);
    this.state = s;
    this.emit();
  }

  emit() {
    this.onChange({
      state: this.state, endReason: this.endReason, error: this.error, muted: this.muted,
      turnAvailable: this.turnAvailable, video: this.video,
    });
  }

  enqueue(fn) {
    this.queue = this.queue.then(fn).catch((e) => this.log(`Fehler: ${e?.message || e}`));
    return this.queue;
  }

  after(name, ms, fn) {
    this.clear(name);
    this.timers.set(name, { id: setTimeout(fn, ms), kind: 't' });
  }

  every(name, ms, fn) {
    this.clear(name);
    this.timers.set(name, { id: setInterval(fn, ms), kind: 'i' });
  }

  clear(name) {
    const t = this.timers.get(name);
    if (!t) return;
    if (t.kind === 't') clearTimeout(t.id); else clearInterval(t.id);
    this.timers.delete(name);
  }

  stopLocalMedia() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
  }

  finish(reason, notifyPeer) {
    if (this.isOver()) return;
    this.endReason = reason;
    if (notifyPeer) this.send({ type: 'call.bye', reason });
    for (const name of [...this.timers.keys()]) this.clear(name);
    this.stopLocalMedia();
    // pc.close() gibt die TURN-Zuteilung sofort frei.
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.close();
      this.pc = null;
    }
    this.setState(State.ENDED);
    this.onEnded(reason);
  }
}

/**
 * Ein Anrufendpunkt pro Kanal: nimmt alle Nachrichten entgegen, haelt hoechstens einen
 * Anruf und antwortet bei einem zweiten mit call.busy.
 */
export class CallEndpoint {
  constructor({ transport, getIceServers, getPeerIceServers, allowedRelayHosts, rtc, timing, forceRelay, onChange = noop, onRemoteStream = noop, log = noop }) {
    this.transport = transport;
    this.options = { getIceServers, getPeerIceServers, allowedRelayHosts, rtc, timing, forceRelay, onRemoteStream, log };
    this.onChange = onChange;
    this.call = null;
    this.ended = new Set();
    this.unsubscribe = transport.onMessage((m) => this.handle(m));
  }

  session(extra) {
    return new CallSession({
      ...this.options,
      send: (m) => this.transport.send(m),
      onChange: (s) => this.onChange(s, this.call),
      onEnded: () => {
        this.ended.add(this.call.callId);
        if (this.ended.size > 64) this.ended.delete(this.ended.values().next().value);
      },
      ...extra,
    });
  }

  get active() {
    return this.call && !this.call.isOver() ? this.call : null;
  }

  dial({ video = false } = {}) {
    if (this.active) return this.active;
    this.call = this.session({ video, role: 'caller' });
    this.call.dial();
    return this.call;
  }

  handle(raw) {
    const m = parseMessage(raw);
    if (!m) return;
    if (m.type === 'call.invite') return this.onInvite(m);
    if (this.call?.callId === m.callId) this.call.receive(raw);
  }

  onInvite(m) {
    if (this.call?.callId === m.callId) {
      // Wiederholte Einladung: das Klingeln bestaetigen, nicht neu klingeln.
      if (!this.call.isOver()) this.transport.send({ v: m.v, type: 'call.ringing', callId: m.callId });
      return;
    }
    if (this.ended.has(m.callId)) return;
    if (this.active) {
      this.transport.send({ v: m.v, type: 'call.busy', callId: m.callId });
      return;
    }
    const call = this.session({ callId: m.callId, role: 'callee', video: m.video });
    this.call = call;
    call.setState(State.RINGING_IN);
    call.after('ring', call.t.ringTimeoutMs, () => call.finish('no-answer', false));
    this.transport.send({ v: m.v, type: 'call.ringing', callId: m.callId });
  }

  close() {
    this.active?.hangup();
    this.unsubscribe?.();
  }
}

/** Sichtbare Zustandstexte fuer die Anrufleiste. */
export function stateLabel(state, endReason) {
  if (state === State.ENDED) {
    return {
      declined: 'Abgelehnt', busy: 'Besetzt', 'no-answer': 'Keine Antwort', cancelled: 'Abgebrochen',
      'media-denied': 'Kein Zugriff auf das Mikrofon', 'connection-lost': 'Verbindung verloren',
      'remote-hangup': 'Aufgelegt', hangup: 'Aufgelegt',
    }[endReason] || 'Beendet';
  }
  return {
    [State.IDLE]: '', [State.CALLING]: 'Verbinde …', [State.RINGING_OUT]: 'Es klingelt …',
    [State.RINGING_IN]: 'Eingehender Anruf', [State.CONNECTING]: 'Verbindung wird aufgebaut …',
    [State.CONNECTED]: 'Verbunden', [State.RECONNECTING]: 'Verbindung wird wiederhergestellt …',
  }[state];
}

export function browserRtc(g = globalThis) {
  return {
    RTCPeerConnection: g.RTCPeerConnection,
    getUserMedia: (c) => g.navigator.mediaDevices.getUserMedia(c),
  };
}
