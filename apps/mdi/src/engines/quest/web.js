// Geheimer Kanal mit Web Crypto (async), exakt alt:src/quest.js seal/open. Nicht fuer Kartenmodule (Harness: crypto, globalThis);
// gebraucht von Tests als zweite, unabhaengige Implementierung desselben Formats.
import { ITER, NONCE, fold, clean, hintOf, cleanDraft, complete, b64, unb64, BLOB, MAX_Q } from "./quest.js";
const root = globalThis;
function subtle() { var c = root.crypto; return c && c.subtle ? c.subtle : null; }
async function keyFor(answer, nonce) {
  var raw = await subtle().importKey("raw", new TextEncoder().encode(fold(answer)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", salt: nonce, iterations: ITER, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function lock(obj, answer) {
  var nonce = root.crypto.getRandomValues(new Uint8Array(NONCE)), key = await keyFor(answer, nonce);
  var ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(JSON.stringify(obj)))), out = new Uint8Array(NONCE + ct.length);
  out.set(nonce); out.set(ct, NONCE);
  return b64(out);
}
// Built from the last riddle backwards: every answer opens exactly the next step and nothing beyond it.
async function seal(draft) {
  var d = cleanDraft(draft); if (!complete(d)) return null;
  var blobs = [], i;
  for (i = 0; i < d.stops.length; i++) {
    var next = d.stops[i + 1];
    blobs.push(await lock(next ? { q: next.q, h: hintOf(next.a) } : { e: d.end }, d.stops[i].a));
  }
  return { q0: d.stops[0].q, h0: hintOf(d.stops[0].a), c: blobs };
}
// A link can be built by hand, so what comes out of it passes the same filter as what goes in.
async function open(blob, answer) {
  if (typeof blob !== "string" || !BLOB.test(blob)) return null;
  var raw;
  try {
    raw = unb64(blob); var key = await keyFor(answer, raw.slice(0, NONCE));
    raw = JSON.parse(new TextDecoder().decode(await subtle().decrypt({ name: "AES-GCM", iv: raw.slice(0, NONCE) }, key, raw.slice(NONCE))));
  } catch (e) { return null; }
  if (raw && typeof raw.q === "string") { var q = clean(raw.q, MAX_Q); return q ? { q: q, h: typeof raw.h === "string" ? clean(raw.h, 6) : "" } : { blocked: true }; }
  if (raw && typeof raw.e === "string") { var e = clean(raw.e, MAX_Q); return e ? { e: e } : { blocked: true }; }
  return { blocked: true };
}
export { seal, open };
export const supported = () => !!subtle();
