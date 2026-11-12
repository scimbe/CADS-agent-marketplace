// Ein Satz -> Absicht, fuer wen, passende Karten. Exakte Portierung von alt:src/start.js (Tag pre-legacy-removal), nur auf
// dem Geraet (Stichwoerter aus intent.json = alt:start.json, Suche aus rotation.js). Keine KI, keine Anfrage. Ehrlich: eine
// Karte, die es nicht gibt, wird als fehlend genannt ("missing"); ohne Treffer bleibt die Liste leer.
// Unterschied zum Altcode nur in der Quelle von "vorhanden": avail() fragt den Katalog (needs), nicht das Kartenregister;
// ob eine Karte im neuen Code schon spielbar ist, entscheidet die Ansicht ("kommt").
import DATA from "./intent.json" with { type: "json" };
import { byId, available, fold, searchIdeas, WEB_CAPS } from "./rotation.js";

export const INTENTS = ["gruss", "planen", "spielen", "stimme"];
const STOP = " ich du er sie es wir ihr mein meine meinen meiner meinem dein deine deinen unser unsere euer will moechte mag mal bitte schick schicken senden machen mach heute morgen jetzt einen einer einem eines kein keine keinen nicht noch auch nur ganz sehr wer wie was wo wann kann koennen soll ueber gegen zeit leider einfach so schnell kurz the a an and to for my our your with want would like please send make some today something about ";
const SPECIFIC = 6, ARTICLE = " den die das dem der des ein eine einen einem einer the a an ";
const NOTNAME = " dich dir euch uns alle allen alles gestern heute morgen dein deine deinen deiner mich mir sie ihn ihm ihr jemand jemanden jeden jede jeder you me us all everyone today tomorrow yesterday him her them ";

export function hit(w, stem) { return stem.charAt(stem.length - 1) === "$" ? w === stem.slice(0, -1) : w.indexOf(stem) === 0 || (stem.length >= 5 && w.length > stem.length && w.slice(-stem.length) === stem); }
function hitW(w, stem) { return stem.charAt(stem.length - 1) !== "$" && w.indexOf(stem) !== 0 ? 0.5 : 1; }
function len(stem) { return stem.replace(/\$$/, "").length; }
function best(w, stems) { let b = ""; for (const s of stems) if (hit(w, s) && len(s) > len(b)) b = s; return b; }
function words(text) { return fold(text).split(" ").filter(Boolean); }
function avail(id, caps) { const i = byId(id); return i && available(i, caps) ? i : null; }

/** Absicht einer Karte: kuratierte Listen zuerst, dann die Art. */
export function intentOf(idea) {
  if (!idea) return "";
  for (const k of INTENTS) if (DATA.intents[k].ids.includes(idea.id)) return k;
  if (idea.kind === "sound") return "stimme";
  if (idea.kind === "card" || idea.kind === "photo") return "gruss";
  return "spielen";
}
export function cardsOf(intent, caps = WEB_CAPS) { return ((DATA.intents[intent] || {}).ids || []).map((id) => avail(id, caps)).filter((i, k, a) => i && a.indexOf(i) === k); }

function nameIn(text, known) {
  const s = String(text || ""), cand = [];
  let m;
  const re = /(?:^|\s)(?:[Aa]n|[Ff]ür|[Ff]uer|[Tt]o|[Ff]or)\s+(?:[Mm]eine[nmrs]?\s+|[Mm]y\s+|[Uu]nsere[nmrs]?\s+|[Oo]ur\s+)?(\p{Lu}[\p{L}'-]{1,13})(?=$|[\s.,!?])/gu;
  while ((m = re.exec(s))) cand.push(m[1]);
  const rel = /(?:^|\s)(\p{L}+)(?=\s+(\p{Lu}[\p{L}'-]{1,13})(?:$|[\s.,!?]))/gu;
  while ((m = rel.exec(s))) if (best(fold(m[1]), Object.keys(DATA.who))) cand.push(m[2]);
  for (const c of cand) { const f = fold(c); if (!known(f) && !STOP.includes(" " + f + " ") && !ARTICLE.includes(" " + f + " ") && !NOTNAME.includes(" " + f + " ")) return c; }
  return "";
}

/** -> { intent, who, name, top: [{ idea, exact }], missing, words } (wie alt:start.js understand) */
export function understand(text, o = {}) {
  const caps = o.caps || WEB_CAPS;
  const ws = words(text), score = { gruss: 0, planen: 0, spielen: 0, stimme: 0 }, pts = {}, order = [], rest = [];
  let who = null, missing = null;
  const cardStems = Object.keys(DATA.cards), whoStems = Object.keys(DATA.who), missStems = Object.keys(DATA.missing);
  const known = (f) => !!(best(f, cardStems) || best(f, whoStems) || INTENTS.some((n) => best(f, DATA.intents[n].keys)));
  for (const w of ws) {
    let top = "", n0 = "";
    for (const n of INTENTS) { const s = best(w, DATA.intents[n].keys); if (len(s) > len(top)) { top = s; n0 = n; } }
    if (n0) score[n0] += hitW(w, top);
    const c = best(w, cardStems), ids = c ? DATA.cards[c].map((id) => avail(id, caps)).filter(Boolean) : [];
    ids.forEach((i, k) => { if (!(i.id in pts)) { pts[i.id] = 0; order.push(i); } pts[i.id] += (k ? 2 : 3) * hitW(w, c); });
    const mm = best(w, missStems.filter((x) => w.indexOf(x.replace(/\$$/, "")) === 0)); if (mm && !ids.length && !missing) missing = DATA.missing[mm];
    const h = best(w, whoStems); if (h && !who) who = DATA.who[h];
    if (!n0 && !c && !h && w.length > 3 && !STOP.includes(" " + w + " ")) rest.push(w);
  }
  const name = nameIn(text, known), nf = fold(name);
  const rest2 = rest.filter((w) => w !== nf);
  const found = {};
  for (const w of rest2) {
    const hs = searchIdeas(w, o.date || new Date(), null, caps) || [];
    if (hs.length <= SPECIFIC) for (const h of hs) found[h.idea.id] = (found[h.idea.id] || 0) + 1;
  }
  for (const i of order) { const n = intentOf(i); if (n) score[n] += 2; }
  for (const id of Object.keys(found)) { const n = intentOf(byId(id)); if (n) score[n] += 1; }
  const intent = o.intent || INTENTS.reduce((a, n) => (score[n] > (a ? score[a] : 0) ? n : a), "");
  let list = order.slice().sort((a, b) => pts[b.id] - pts[a.id]).map((i) => ({ idea: i, exact: true }));
  Object.keys(found).sort((a, b) => found[b] - found[a]).forEach((id) => {
    const i = byId(id); if (!i || list.some((x) => x.idea.id === id)) return;
    if (!intent || intentOf(i) === intent) list.push({ idea: i, exact: found[id] > 1 && found[id] === rest2.length });
  });
  if (intent) list = list.filter((x) => intentOf(x.idea) === intent);
  if (intent && (list.length < 3 || o.intent)) for (const i of cardsOf(intent, caps)) if (!list.some((x) => x.idea.id === i.id)) list.push({ idea: i, exact: false });
  if (missing) for (const x of list) x.exact = false;
  if (missing && missing.sport) list.sort((a, b) => (b.idea.kind === "arcade") - (a.idea.kind === "arcade"));
  return { intent, who, name, top: list.slice(0, 4), missing, words: ws.length };
}
/** Name fuer die Karte: aus dem Satz oder eine Anrede (Oma, Papa), nie "Bruder". */
export function callName(r, lang) { if (r.name) return r.name; return r.who && r.who.call ? r.who[lang] || r.who.de : ""; }
