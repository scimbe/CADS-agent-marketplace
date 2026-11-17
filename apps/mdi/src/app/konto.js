// Konto-Achse ohne Netz und ohne DOM: Mein Stil (Spitzname, Emoji, Farben, Sticker), Geraete-Code, Profil packen.
// Die Regeln fuer das, was reist, spiegeln den Server (CADS-DEMO-wrapper lib/duell-profile.mjs cleanProfile); der Server
// bleibt die Instanz, die entscheidet – hier wird nur nichts geschickt, was er ohnehin verwerfen wuerde.

export const PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
export const EMOJI = ["🐸", "🦝", "🐙", "🦖", "🍕", "👽", "🤖", "👻", "🔥", "🌈", "🦄", "🐝"];
export const SETS = {
  tiere: ["🐸", "🦆", "🐙"], essen: ["🍕", "🌮", "🍩"], weltall: ["🚀", "🛸", "👽"], chaos: ["💥", "🔥", "💀"],
  grusel: ["🎃", "👻", "🦇"], herz: ["💛", "🌻", "✨"], advent: ["🎄", "⭐", "🎁"]
};
export const FONT = ["n", "g", "sg"];
export const NICK_MAX = 16;
const HEX = /^#[0-9a-f]{6}$/, CODE = /^[a-f0-9]{32}$/;
// Kontaktangaben im Spitznamen nimmt der Server nicht an (hasContact); die Seite sagt es gleich, statt still zu kuerzen
const CONTACT = /@|https?:|www\.|\b\d[\d\s/-]{6,}\d\b/i;

export function defaultMe() { return { nick: "", emoji: EMOJI[0], colors: PAIRS[0].slice(), set: "tiere" }; }

/** Mein Stil, wie er gespeichert werden darf; Unbekanntes faellt auf den Standard zurueck (sichtbar, nicht still). */
export function cleanMe(m) {
  const d = defaultMe(), x = m && typeof m === "object" ? m : {};
  const nick = typeof x.nick === "string" ? [...x.nick.replace(/[\u0000-\u001f\u007f<>]/g, "")].slice(0, NICK_MAX).join("") : "";
  return {
    nick,
    emoji: typeof x.emoji === "string" && x.emoji.length > 0 && x.emoji.length <= 16 ? x.emoji : d.emoji,
    colors: Array.isArray(x.colors) && x.colors.length === 2 && x.colors.every((c) => typeof c === "string" && HEX.test(c.toLowerCase())) ? x.colors.map((c) => c.toLowerCase()) : d.colors,
    set: typeof x.set === "string" && SETS[x.set] ? x.set : d.set
  };
}
export function nickOk(s) { return !CONTACT.test(String(s || "")); }
export function cleanPref(p) { const x = p && typeof p === "object" ? p : {}; return { fs: FONT.includes(x.fs) ? x.fs : "n", easy: x.easy === true }; }

export function fmtCode(c) { return (String(c).match(/.{4}/g) || []).join("-"); }
/** Was jemand tippt: Gross/klein, Striche und Leerzeichen erlaubt. -> Code oder null */
export function parseCode(s) { const c = String(s || "").toLowerCase().replace(/[^0-9a-f]/g, ""); return CODE.test(c) ? c : null; }
export function isCode(c) { return typeof c === "string" && CODE.test(c); }

/** Profil fuer profile/put: Mein Stil neu, alles andere (Wand, gemerkte Karten, KI-Geraet) unveraendert vom Server. */
/** local.wall / local.saved (Wand-Sync, Strang H) haben Vorrang vor dem Stand des Servers (ADR 0001 g). */
export function pack(me, remote, local = null) {
  const r = remote && typeof remote === "object" ? remote : {};
  const l = local && typeof local === "object" ? local : {};
  const m = cleanMe(me);
  const wall = Array.isArray(l.wall) ? l.wall : Array.isArray(r.wall) ? r.wall : [];
  const saved = Array.isArray(l.saved) ? l.saved : Array.isArray(r.saved) ? r.saved : [];
  return { ...(r.ai ? { ai: r.ai } : {}), me: { nick: nickOk(m.nick) ? m.nick : "", emoji: m.emoji, colors: m.colors, set: m.set }, wall, saved };
}
/** Mein Stil aus einem Server-Profil (leere Felder dort lassen den eigenen Wert stehen). */
export function meFrom(remote, mine) {
  const r = remote && remote.me && typeof remote.me === "object" ? remote.me : {};
  const m = cleanMe(mine);
  return cleanMe({ nick: typeof r.nick === "string" ? r.nick : m.nick, emoji: r.emoji || m.emoji, colors: r.colors || m.colors, set: r.set || m.set });
}
export const ATTEMPT_MS = 30 * 60000;
/** Ein Anmeldeversuch (Tipp auf Anmelden mit 16+-Haken) gilt 30 Minuten; danach traegt kein spaeteres Anmelden die Aussage. */
export function attemptFresh(a, at) { return !!(a && a.age16 === true && Number.isFinite(a.t0) && at - a.t0 >= 0 && at - a.t0 < ATTEMPT_MS); }
