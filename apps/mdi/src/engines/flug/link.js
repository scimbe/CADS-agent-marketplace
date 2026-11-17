// Herausforderungs-Link des Flugspiels (Geist-Duell): Zustand als JSON in Base64url, die Spur als rohe Bytes nach einem
// 0-Byte im selben Base64 (alt:src/core.js encodeState/decodeState). Alte Links ohne ev/k/spur bleiben Byte fuer Byte.
import { sanitizeState } from "./params.js";
import { sanitize as spurOk } from "./spur.js";

export const MAX_FRAGMENT = 1200;
function toB64url(str, sp) {
  const bytes = new TextEncoder().encode(str); let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  if (sp) bin += "\0" + String.fromCharCode.apply(null, sp);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s, o) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad charset");
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s); let bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const z = bytes.indexOf(0);
  if (z >= 0) { o.s = bytes.slice(z + 1); bytes = bytes.slice(0, z); }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export function sanitize(o) { return sanitizeState(o, spurOk); }
export function encodeState(state) {
  const st = sanitize(state);
  if (!st) throw new Error("invalid state");
  const sp = st.spur; delete st.spur;
  const out = toB64url(JSON.stringify(st), sp);
  if (out.length > MAX_FRAGMENT) throw new RangeError("zu-lang");   // ehrlich statt eines Links, den niemand oeffnen kann
  return out;
}
/** -> Zustand oder null (nie eine Ausnahme). Eine Spur im JSON-Text zaehlt nie, nur die Bytes nach der 0. */
export function decodeState(str) {
  try {
    if (typeof str !== "string" || str.length === 0 || str.length > MAX_FRAGMENT) return null;
    const o = {}, j = JSON.parse(fromB64url(str, o));
    j.spur = o.s;
    return sanitize(j);
  } catch { return null; }
}
export function parseHash(hash) {
  if (typeof hash !== "string") return null;
  const m = hash.replace(/^#/, "").match(/(?:^|&)c=([^&]*)/);
  return m ? decodeState(m[1]) : null;
}
/** Herausforderung: kein Name im Link (alt daily.js challengeUrl), Punkte und optional die Spur. */
export function challengeFragment(state, score, spur, ev) {
  const st = { ...state }; delete st.name;
  st.score = score;
  if (spur) { st.spur = spur; st.ev = ev || 1; }
  return "c=" + encodeState(st);
}
