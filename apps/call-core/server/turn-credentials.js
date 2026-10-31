// Kurzlebige coturn-Zugangsdaten (use-auth-secret). Laeuft nur serverseitig.
// subject ist ein Pseudonym, keine E-Mail-Adresse: coturn schreibt es ins Log.
import { createHmac } from 'node:crypto';

export function mintTurnCredential({ secret, subject, ttlSeconds, nowMs = Date.now() }) {
  if (!secret) throw new Error('secret fehlt');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(subject)) throw new Error('subject muss ein Pseudonym sein');
  if (!(ttlSeconds > 0 && ttlSeconds <= 3600)) throw new Error('ttlSeconds ausserhalb 1..3600');
  const username = `${Math.floor(nowMs / 1000) + ttlSeconds}:${subject}`;
  return { username, credential: createHmac('sha1', secret).update(username).digest('base64') };
}
