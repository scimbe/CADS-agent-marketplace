// Abreisskalender: welche Karte an welchem Tag. Exakte Portierung von alt:src/daily.js (Tag pre-legacy-removal), Zeilen
// 11-37 (Runde, Arten), 62-132 (roundOrder, ideaOn), 139-167 (Suche). Golden-Test: test/home-rotation.test.js gegen
// test/fixtures/home-golden.json (vom alten Code erzeugt, test/golden/gen-home.cjs).
// Regeln (unveraendert): eine gemischte Runde ueber alle Karten ohne Datum, nichts wiederholt sich vor Rundenende, nie zweimal
// dieselbe Art (bei Zug-Karten: Situation) hintereinander, auch ueber die Rundengrenze; Kalenderkarten nur an ihren Tagen;
// jeder 6. Tag (Hash) darf eine Bonuskarte aus "gated" bringen; ein Geraet weicht nur ab, wo es muss (needs).
// Rein: keine Uhr, kein DOM. Der Tag kommt als Date oder Tagesnummer herein.
// Zufall: FNV-1a (SDK) und mulberry32 wie im Altcode. mulberry32 ist hier ganzzahlig formuliert: floor(u/2^32*n) ==
// floor(u*n/2^32), weil u*n < 2^53 exakt ist; so bleibt die Rechnung ohne Gleitkomma-Annahme gleich (Determinismus).
import CAT from "./catalog.json" with { type: "json" };
import { fnv1a } from "../../contract/sdk.js";

export const DAY = 86400000;
const BONUS_EVERY = 6, ORDER_TRIES = 200, TWO32 = 4294967296;
export const IDEAS = CAT.ideas, GATED = CAT.gated || [], RETIRED = CAT.retired || [], GONE = CAT.gone || [];

const ROUND = IDEAS.filter((i) => !i.on);
const PARKED = RETIRED.filter((i) => i.round >= 0).sort((a, b) => a.round - b.round);
for (const i of PARKED) ROUND.splice(Math.min(i.round, ROUND.length), 0, i);
const parked = (i) => PARKED.includes(i);
export function mech(i) { return i.mx || (i.kind === "turn" && i.grip ? "turn-" + i.grip : i.kind); }
const ROUND_KINDS = ROUND.map(mech).filter((k, i, a) => a.indexOf(k) === i).sort();
export const ROUND_SIZE = ROUND.length;

/** mulberry32 als Ganzzahlquelle: next() -> uint32 (Altcode teilte durch 2^32). */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}
const below = (u, n) => Math.floor((u * n) / TWO32); // == Math.floor(u/2^32 * n), exakt

export function dayNumber(date) { return Math.floor((date instanceof Date ? date : new Date(date)).getTime() / DAY); }
export function dayKey(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
export function byId(id) { return IDEAS.find((i) => i.id === id) || GATED.find((i) => i.id === id) || RETIRED.find((i) => i.id === id) || null; }

function firstKind(round) { return ROUND_KINDS[fnv1a("daily-first-" + round) % ROUND_KINDS.length]; }
function draftRound(round, attempt) {
  const r = mulberry(fnv1a("daily-round-" + round + "-" + attempt)), mixed = ROUND.slice(), left = {}, out = [];
  for (let i = mixed.length - 1; i > 0; i--) { const j = below(r(), i + 1); const t = mixed[i]; mixed[i] = mixed[j]; mixed[j] = t; }
  for (const x of mixed) (left[mech(x)] = left[mech(x)] || []).push(x);
  while (out.length < ROUND.length) {
    const rest = ROUND.length - out.length, last = out.length ? mech(out[out.length - 1]) : "";
    let open = (out.length ? ROUND_KINDS : [firstKind(round)]).filter((k) => k !== last && left[k] && left[k].length);
    if (!open.length) return null;
    const tight = open.filter((k) => left[k].length * 2 >= rest);
    if (tight.length) open = tight;
    // roll = r()*sum; roll -= len; roll < 0  <=>  u*sum - len*2^32 < 0 (ganzzahlig, exakt)
    let roll = r() * open.reduce((a, k) => a + left[k].length, 0), pick = open[open.length - 1];
    for (let i = 0; i < open.length; i++) { roll -= left[open[i]].length * TWO32; if (roll < 0) { pick = open[i]; break; } }
    out.push(left[pick].pop());
  }
  return mech(out[out.length - 1]) === firstKind(round + 1) ? null : out;
}
const orders = new Map();
export function roundOrder(round) {
  if (orders.has(round)) return orders.get(round);
  let o = null;
  for (let a = 0; a < ORDER_TRIES && !o; a++) o = draftRound(round, a);
  o = o || ROUND.slice();
  orders.set(round, o);
  return o;
}

/** Was das Geraet kann (needs). Im neuen Client ist WebCrypto Pflicht; channel/call melden die App-Huellen. */
export const WEB_CAPS = Object.freeze({ crypto: true, channel: false, call: false });
export function available(idea, caps) { return !!idea && (idea.needs || []).every((x) => caps[x] === true); }

function baseIdea(n) { const len = ROUND.length; return roundOrder(Math.floor(n / len))[((n % len) + len) % len]; }
export function calendarIdea(n) {
  const md = dayKey(n).slice(5);
  for (const i of IDEAS) if ([].concat(i.on || []).includes(md)) return i;
  return null;
}
/** Karte des Tages n (Tagesnummer seit 1970, UTC). Gleich fuer alle mit gleichen Faehigkeiten. */
export function ideaOn(n, caps = WEB_CAPS) {
  const cal = calendarIdea(n);
  if (cal && available(cal, caps)) return cal;
  const base = baseIdea(n), nextCal = calendarIdea(n + 1), prevCal = calendarIdea(n - 1), next = mech(nextCal || baseIdea(n + 1));
  const clash = (nextCal && mech(nextCal) === mech(base)) || (prevCal && mech(prevCal) === mech(base));
  const mustMove = !available(base, caps) || clash || parked(base);
  const extra = fnv1a("bonus-" + n) % BONUS_EVERY === 0 ? GATED.filter((x) => available(x, caps)) : [];
  if (!mustMove && !extra.length) return base;
  const prev = mech(ideaOn(n - 1, caps));
  const fits = (x) => mech(x) !== prev && mech(x) !== next;
  const bonus = extra.filter(fits);
  if (bonus.length) return bonus[fnv1a("pick-" + n) % bonus.length];
  if (!mustMove) return base;
  const runnable = ROUND.filter((x) => available(x, caps));
  let pool = runnable.filter(fits);
  if (!pool.length) pool = runnable;
  const at = fnv1a("swap-" + n) % (pool.length || 1);
  for (let k = 0; k < pool.length; k++) { const x = pool[(at + k) % pool.length]; if (!parked(x)) return x; }
  return null;
}
export function ideaForDay(date, caps = WEB_CAPS) { return ideaOn(dayNumber(date), caps); }
/** Die letzten n Tage vor date (ohne heute), neuester zuerst. */
export function lastDays(date, n, caps = WEB_CAPS) {
  const d0 = dayNumber(date), out = [];
  for (let i = 1; i <= n; i++) out.push({ n: d0 - i, key: dayKey(d0 - i), idea: ideaOn(d0 - i, caps) });
  return out;
}
/** Tuer-Nummer der Adventstuer (alt:daily.js:321): 1-24 im Dezember, sonst 1. */
export function doorNumber(date) { const d = date instanceof Date ? date : new Date(date); return d.getUTCMonth() === 11 && d.getUTCDate() <= 24 ? d.getUTCDate() : 1; }

// ---------- Suche (alt:daily.js:139-167) ----------
export function fold(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/-?\|/g, (m) => (m === "|" ? " " : "")).replace(/­/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
const SEARCH_DAYS = 365, MAX_HITS = 30, FILL = " fuer for mit with und and the der die das den dem ein eine einen a an zum zur im in am to of von ";
/** Treffer ueber Titel, Unterzeile, Art und Tags beider Sprachen; je Treffer der Tag, an dem die Karte zuletzt kam. */
/** @param tags Tags je Karten-ID (catalog-tags.json, Teil home-find); der Kern kennt sie nicht */
export function searchIdeas(query, date, names = null, caps = WEB_CAPS, tags = null) {
  let words = fold(query).split(" ").filter(Boolean);
  const real = words.filter((w) => !FILL.includes(" " + w + " "));
  if (real.length) words = real;
  if (!words.length) return [];
  const hits = IDEAS.concat(GATED).filter((i) => {
    if (!available(i, caps)) return false;
    let parts = [i.kind, i.x || ""].concat((tags && tags[i.id]) || i.tags || [], (names && names[i.kind]) || []);
    for (const l of ["de", "en"]) { const L = i[l] || {}; parts = parts.concat(L.t, L.s, L.tags || []); }
    const hay = fold(parts.join(" "));
    return words.every((w) => hay.includes(w));
  });
  if (!hits.length) return [];
  const last = {}, n0 = dayNumber(date);
  for (let b = 1; b <= SEARCH_DAYS; b++) { const x = ideaOn(n0 - b, caps); if (x && !last[x.id]) last[x.id] = n0 - b; }
  return hits.map((i) => ({ idea: i, date: last[i.id] ? new Date(last[i.id] * DAY) : null }))
    .sort((a, b) => (b.date ? b.date.getTime() : -1) - (a.date ? a.date.getTime() : -1)).slice(0, MAX_HITS);
}
