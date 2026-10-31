// Signalisierungsnachrichten des Anrufs. Der Kanal transportiert sie als opake
// Objekte und bestimmt allein, wer der Absender ist; hier steht bewusst keine Identitaet.
export const PROTOCOL_VERSION = 1;
export const MAX_SDP_BYTES = 32 * 1024;
export const MAX_CANDIDATE_BYTES = 2 * 1024;

const TYPES = new Set([
  'call.invite', 'call.ringing', 'call.accept', 'call.decline', 'call.busy',
  'call.offer', 'call.answer', 'call.ice', 'call.restart', 'call.bye',
]);
const REASONS = new Set(['hangup', 'media-denied', 'no-answer', 'connection-lost', 'cancelled']);
const CALL_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Prueft eine empfangene Nachricht; Unbekanntes wird verworfen, nie weitergereicht. */
export function parseMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (m.v !== PROTOCOL_VERSION || !TYPES.has(m.type)) return null;
  if (typeof m.callId !== 'string' || !CALL_ID.test(m.callId)) return null;
  const base = { v: m.v, type: m.type, callId: m.callId };
  switch (m.type) {
    case 'call.invite':
      return { ...base, video: m.video === true };
    case 'call.accept':
      return { ...base, video: m.video === true };
    case 'call.offer':
    case 'call.answer':
      if (!Number.isInteger(m.epoch) || m.epoch < 0) return null;
      if (typeof m.sdp !== 'string' || !m.sdp || byteLength(m.sdp) > MAX_SDP_BYTES) return null;
      return { ...base, epoch: m.epoch, sdp: m.sdp, iceServers: parseIceServers(m.iceServers) };
    case 'call.ice': {
      if (!Number.isInteger(m.epoch) || m.epoch < 0) return null;
      const c = m.candidate;
      if (!c || typeof c.candidate !== 'string' || byteLength(c.candidate) > MAX_CANDIDATE_BYTES) return null;
      return {
        ...base,
        epoch: m.epoch,
        candidate: {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : null,
          sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null,
          usernameFragment: typeof c.usernameFragment === 'string' ? c.usernameFragment : null,
        },
      };
    }
    case 'call.restart':
      if (!Number.isInteger(m.epoch) || m.epoch < 0) return null;
      return { ...base, epoch: m.epoch };
    case 'call.bye':
      return { ...base, reason: REASONS.has(m.reason) ? m.reason : 'hangup' };
    default:
      return base;
  }
}

// Vom Anrufer mitgelieferte TURN-Daten fuer den kontolosen Angerufenen.
function parseIceServers(list) {
  if (!Array.isArray(list) || list.length > 4) return undefined;
  const out = [];
  for (const s of list) {
    const urls = [].concat(s?.urls);
    if (!urls.length || urls.length > 4) return undefined;
    if (!urls.every((u) => typeof u === 'string' && u.length < 256 && /^(stun|turn|turns):/.test(u))) return undefined;
    if (s.username !== undefined && typeof s.username !== 'string') return undefined;
    if (s.credential !== undefined && typeof s.credential !== 'string') return undefined;
    out.push({ urls, username: s.username, credential: s.credential });
  }
  return out;
}

/** Host einer stun:/turn:/turns:-URL, ohne Port und Parameter. */
export function iceUrlHost(url) {
  return url.replace(/^[a-z]+:/, '').split(/[:?]/)[0].toLowerCase();
}

export function byteLength(s) {
  return new TextEncoder().encode(s).length;
}

export function newCallId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
