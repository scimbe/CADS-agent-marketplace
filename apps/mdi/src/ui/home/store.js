// Meins: Wand (gemachte Werke), Einladungen (Archiv versendeter Links) und gemerkte Karten. Reine Funktionen, kein DOM.
// Grenzen wie der Server (CADS-DEMO-wrapper lib/duell-profile.mjs cleanProfile, LIMITS): Wand 30, gemerkt 200, Bild als
// data:image/jpeg <= 30000 Zeichen, keine Fotos. Rueckgaengig 6 s wie alt:src/app.js:908-922.
export const LIMITS = { wall: 30, saved: 200, invites: 30, thumb: 30000, fragment: 3999, link: 4000 } // fragment: wie der Server (wrapper #132), ohne "#";
export const UNDO_MS = 6000;
const ID = /^[a-z0-9-]{1,40}$/, KIND = /^[a-z]{1,12}$/, THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const SHORT_ID = /^[2-9a-km-np-zA-HJ-NP-Z]{8}$/;
const FRAG = /^#?v2\.(card|challenge)\.[A-Za-z0-9_-]+$/;

function ts(x) { return Number.isSafeInteger(x) && x > 0; }
/** Wand-Eintrag: { id (Karte), ts, k (Art), th? (Bild fuer den Server), f? (Link), p? (Einstellungen), t? (Titel) }.
 *  Lokal genuegt p (die Wand zeichnet das Werk live); zum Server geht nur, was ein Bild hat (wallForServer). */
export function cleanWall(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((e) => e && typeof e === "object" && ID.test(String(e.id)) && ts(e.ts)
    && typeof e.k === "string" && KIND.test(e.k) && e.k !== "photo" && (e.th === undefined || (typeof e.th === "string" && e.th.length <= LIMITS.thumb && THUMB.test(e.th)))
    && (e.th !== undefined || (e.p && typeof e.p === "object"))
    && !seen.has(e.id + ":" + e.ts) && seen.add(e.id + ":" + e.ts)).slice(0, LIMITS.wall).map((e) => {
    const o = { id: e.id, ts: e.ts, k: e.k };
    if (e.th) o.th = e.th;
    if (typeof e.f === "string" && e.f.length <= LIMITS.fragment && FRAG.test(e.f)) o.f = e.f.replace(/^#/, "");
    if (e.p && typeof e.p === "object" && !Array.isArray(e.p)) o.p = e.p;
    if (typeof e.t === "string") o.t = e.t.slice(0, 60);
    return o;
  });
}
export function cleanSaved(list) {
  const ids = new Set();
  return (Array.isArray(list) ? list : []).filter((e) => e && typeof e === "object" && typeof e.id === "string" && ID.test(e.id) && ts(e.ts) && !ids.has(e.id) && ids.add(e.id))
    .slice(0, LIMITS.saved).map((e) => ({ id: e.id, ts: e.ts }));
}
/** Einladung: { f (Fragment ohne #), c (Karte), ts, t? (Titel), s? {id, token, exp} Kurzlink, st: offen|kurz|lang|weg } */
export function cleanInvites(list) {
  return (Array.isArray(list) ? list : []).filter((e) => e && typeof e === "object" && typeof e.f === "string" && FRAG.test(e.f) && e.f.length <= LIMITS.link
    && ID.test(String(e.c)) && ts(e.ts)).slice(0, LIMITS.invites).map((e) => {
    const o = { f: e.f.replace(/^#/, ""), c: e.c, ts: e.ts, st: ["offen", "kurz", "lang", "weg"].includes(e.st) ? e.st : "offen" };
    if (typeof e.t === "string") o.t = e.t.slice(0, 60);
    if (e.s && SHORT_ID.test(e.s.id) && typeof e.s.token === "string" && ts(e.s.exp) && typeof e.s.url === "string" && /^https?:\/\/[^\s#]+\/s\/[2-9a-km-np-zA-HJ-NP-Z]{8}$/.test(e.s.url)) o.s = { id: e.s.id, token: e.s.token, exp: e.s.exp, url: e.s.url };
    return o;
  });
}

export function addWall(wall, e) { return cleanWall([e, ...wall]); }
/** Abnehmen: sofort, mit Rueckgaengig-Marke { e, i, at }. */
export function takeOff(wall, i, at) { if (i < 0 || i >= wall.length) return { wall, undo: null }; const w = wall.slice(); const [e] = w.splice(i, 1); return { wall: w, undo: { e, i, at } }; }
export function undoOff(wall, undo, at) { if (!undo || at - undo.at >= UNDO_MS) return wall; const w = wall.slice(); w.splice(Math.min(undo.i, w.length), 0, undo.e); return cleanWall(w); }
export function toggleSaved(saved, id, at) { return saved.some((s) => s.id === id) ? saved.filter((s) => s.id !== id) : cleanSaved([{ id, ts: at }, ...saved]); }
export function isSaved(saved, id) { return saved.some((s) => s.id === id); }

/** Neuer Link im Archiv (gleicher Link wird nach vorn geholt, nicht doppelt). */
export function archive(invites, { f, c, t, at }) {
  const frag = String(f).replace(/^#/, "");
  const old = invites.find((x) => x.f === frag);
  return cleanInvites([{ ...(old || {}), f: frag, c, t, ts: at, st: old ? old.st : "offen" }, ...invites.filter((x) => x.f !== frag)]);
}
export function setShort(invites, f, s) { return invites.map((x) => (x.f === f ? (s ? { ...x, s, st: "kurz" } : { ...x, st: "lang" }) : x)); }
export function dropInvite(invites, f) { return invites.filter((x) => x.f !== f); }
/** Status zum Anzeigen: Kurzlink bis Datum, abgelaufen, langer Link (ohne Server), wird angelegt. */
export function inviteStatus(x, now) {
  if (x.s) return now >= x.s.exp ? { k: "abgelaufen" } : { k: "bis", exp: x.s.exp };
  return { k: x.st === "lang" ? "lang" : x.st === "weg" ? "weg" : "offen" };
}

/** Profil-Sync (P1): Wand und gemerkte Karten beider Seiten zusammenfuehren, neueste zuerst, ohne Doppelte. */
export function mergeRemote(local, remote) {
  const wall = cleanWall([...(local.wall || []), ...((remote && remote.wall) || [])].sort((a, b) => b.ts - a.ts));
  const saved = cleanSaved([...(local.saved || []), ...((remote && remote.saved) || [])].sort((a, b) => b.ts - a.ts));
  return { wall, saved };
}
/** Was auf dem Server landet: ohne lokale Felder (p, t); f (v2.card./v2.challenge.) nimmt der Server seit wrapper #132 an. */
export function wallForServer(wall) { return cleanWall(wall).filter((e) => e.th).map((e) => ({ id: e.id, ts: e.ts, k: e.k, th: e.th, ...(e.f ? { f: e.f } : {}) })); }
/** Bild nachtragen (Effekt wall.snap liefert es asynchron). */
export function setThumb(wall, id, at, th) { return cleanWall(wall.map((e) => (e.id === id && e.ts === at ? { ...e, th } : e))); }
