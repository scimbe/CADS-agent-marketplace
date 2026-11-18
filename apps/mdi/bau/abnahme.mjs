// Freie Karte 2, P3: Abnahme je Punkt des Bauauftrags und die Saetze dafuer in Kundensprache (Verbesserungen 3 und 4 aus
// fk2-p3-messung.md). Rein: keine Uhr, kein Netz, kein Modell.
//
// Regel je Punkt (streng, nichts wird still durchgewunken):
//   nicht machbar (Planer)           -> fehlt, Satz des Planers (gelesen)
//   Szenario vorhanden und gueltig   -> gespielt: scheitert das Szenario, fehlt der Punkt mit dem festen Satz zum Grund (kein
//                                       Modelltext). Besteht es:
//     Abnahme sagt erfuellt          -> erfuellt (gespielt)
//     Abnahme sagt fehlt mit Satz    -> fehlt mit diesem Satz (gelesen: das Gespielte wurde verworfen, die Abnahme entschied)
//     Abnahme sagt fehlt ohne Satz   -> STARKE Art (STARK: die Eingabe muss etwas bewirken, Kontrolle ohne Eingabe in
//                                       szenario.js): erfuellt, gezaehlt als ueberstimmt (A10: falsche "fehlt"). SCHWACHE Art
//                                       (eine Figur, ein Text, Punkte sind zu sehen): offen, ERSATZ.fehlt (gelesen)
//     kein gueltiges Urteil          -> offen, ERSATZ.fehlt (gelesen); nie automatisch erfuellt
//   kein Szenario                    -> gelesen ("nicht automatisch pruefbar"): Urteil der Abnahme aus Code, Bot-Bericht, Fotos;
//                                       ohne gueltigen Satz bleibt der Punkt offen, mit einem Satz, der nichts ueber das Spiel
//                                       behauptet (ERSATZ.fehlt), weil nichts gespielt wurde
//   kein Urteil der Abnahme          -> gelesen: offen
// Jede Notiz ist ein Satz fuer die Person: ohne Code, Zeilen, Funktionsnamen oder Bot-Werte. Ein Satz des Modells, der das
// nicht schafft, wird durch einen festen, ehrlichen Satz ersetzt und als ersetzt gezaehlt (ergebnis.ersetzt, Log im Worker).
import { checkSzenario, RICHTUNGEN } from "../src/spiel/szenario.js";
import { checkTexte } from "./policy.mjs";

/** Hoechstlaenge einer Notiz (= LEN.punkt des Vertrags features/frei/klaerung.js) */
export const NOTIZ_MAX = 160;
export const GEPRUEFT = Object.freeze(["gespielt", "gelesen"]);
/** Szenario-Arten, deren Bestehen ohne bestaetigendes Urteil reicht: die Eingabe muss etwas bewirken (Bewegung, Leben, Ende,
 *  Sieg, Level). Bei den anderen (punkte_steigen, figur_sichtbar, mehr_figuren, text_sichtbar) beweist das Bestehen wenig. */
export const STARK = Object.freeze(["figur_bewegt", "leben_sinken", "spiel_endet", "sieg", "level_steigt"]);

const RICHTUNG_TEXT = { de: { links: "nach links", rechts: "nach rechts", hoch: "nach oben", runter: "nach unten" }, en: { links: "left", rechts: "right", hoch: "up", runter: "down" } };
/** Feste Saetze zu einem nicht bestandenen Szenario (Art bzw. Grund). {e} Emoji, {r} Richtung, {t} Text */
const SZ_SATZ = {
  de: {
    steuerung_fehlt: "Dafür gibt es im Spiel keine passende Taste.", von_allein: "Beim Ausprobieren passierte das auch ohne Tastendruck, die Steuerung dafür haben wir nicht gesehen.", fehler: "Beim Ausprobieren ist das Spiel an dieser Stelle stehen geblieben.",
    figur_fehlt: "{e} war beim Ausprobieren nicht zu sehen.",
    punkte_steigen: "Beim Ausprobieren gab es dafür keine Punkte.", leben_sinken: "Beim Ausprobieren hat das kein Leben gekostet.",
    spiel_endet: "Beim Ausprobieren war das Spiel danach nicht vorbei.", sieg: "Beim Ausprobieren ließ sich so nicht gewinnen.",
    level_steigt: "Beim Ausprobieren ging es nicht ins nächste Level.", figur_bewegt: "Beim Ausprobieren hat sich {e} nicht {r} bewegt.",
    figur_sichtbar: "{e} war beim Ausprobieren nicht zu sehen.", mehr_figuren: "Beim Ausprobieren kamen keine weiteren {e} dazu.",
    text_sichtbar: "„{t}“ war beim Ausprobieren nicht zu lesen."
  },
  en: {
    steuerung_fehlt: "The game has no button for this.", von_allein: "Trying it, this happened without pressing anything; we did not see the controls for it.", fehler: "The game got stuck at this point when we tried it.",
    figur_fehlt: "{e} did not show up when we tried it.",
    punkte_steigen: "Trying it gave no points for this.", leben_sinken: "Trying it did not cost a life.",
    spiel_endet: "Trying it, the game did not end.", sieg: "Trying it, the game could not be won this way.",
    level_steigt: "Trying it, the next level did not come.", figur_bewegt: "Trying it, {e} did not move {r}.",
    figur_sichtbar: "{e} did not show up when we tried it.", mehr_figuren: "Trying it, no more {e} appeared.",
    text_sichtbar: "“{t}” could not be read when we tried it."
  }
};
/** Feste Ersatzsaetze, wenn ein Satz des Modells keine Kundensprache ist (gezaehlt, nie still) */
const ERSATZ = {
  de: { fehlt: "Ob das Spiel das so macht, konnten wir nicht sicher feststellen.", nicht_machbar: "Das kann diese Art Spiel leider nicht." },
  en: { fehlt: "We could not tell for sure whether the game does this.", nicht_machbar: "This kind of game cannot do that, sorry." }
};

// Merkmale von Technik statt Kundensprache: Code-Zeichen, Zeilen-/Funktionsangaben, Bot-Werte, Fachwoerter
const TECHNIK = /[{}();=<>[\]`_|\\]|\b(zeile|zeilen|line|code|frame|frames|bot|bots|update|draw|init|funktion|function|const|let|var|return|px|api|array|objekt|object|variable|null|undefined|nan|true|false|controls|score|lives|seed|p95|ms)\b|\b[sgd]\.[a-z]|\d{3,}/i;

/** Ist das ein Satz fuer die Person? (kurz, ohne Technik, besteht die Content-Policy) */
export function istKundensatz(t) {
  const s = typeof t === "string" ? t.trim() : "";
  return s.length >= 3 && [...s].length <= NOTIZ_MAX && !TECHNIK.test(s) && checkTexte([s]).length === 0;
}

const fill = (tpl, o) => tpl.replace("{e}", o.e || "").replace("{r}", o.r || "").replace("{t}", o.t || "");
/** Satz zu einem nicht bestandenen Szenario (fest, nie vom Modell) */
export function szenarioSatz(sz, res, lang = "de") {
  const L = SZ_SATZ[lang] ? lang : "de", e = sz.erwartung;
  const key = ["steuerung_fehlt", "fehler", "figur_fehlt", "von_allein"].includes(res.grund) ? res.grund : e.art;
  return fill(SZ_SATZ[L][key], { e: e.emoji, r: e.richtung ? RICHTUNG_TEXT[L][e.richtung] : "", t: e.text });
}

/**
 * Flaches Szenario des Planers -> mdi-szenario/1 oder null (nicht pruefbar bzw. ungueltig, mit Grund).
 * @returns {{szenario: object|null, ungueltig: string|null}}
 */
export function szenarioAusPlan(id, flach) {
  if (!flach || flach.pruefbar !== true || flach.art === "keins") return { szenario: null, ungueltig: null };
  const erwartung = { art: flach.art };
  if (flach.art === "figur_bewegt") { erwartung.emoji = flach.emoji; erwartung.richtung = flach.richtung; }
  if (flach.art === "figur_sichtbar" || flach.art === "mehr_figuren") erwartung.emoji = flach.emoji;
  if (flach.art === "text_sichtbar") erwartung.text = flach.text;
  const sz = { id, schritte: (flach.schritte || []).map((s) => ({ halte: s.halte, frames: s.frames })), erwartung };
  const bad = checkSzenario(sz);
  return bad ? { szenario: null, ungueltig: bad } : { szenario: sz, ungueltig: null };
}

/**
 * Ergebnis je Punkt fuer die Person.
 * @param {{punkte: Array<{id:string,text:string}>, lang:string}} auftrag
 * @param {{punkte: Array<{id:string, machbar:boolean, kunde:string, szenario:object|null}>}} plan  (szenario: mdi-szenario/1 oder null)
 * @param {Array<{id:string, ok:boolean, grund:string|null}>} gespielt  report.szenarien aus runGame
 * @param {{punkte: Array<{id:string, urteil:string, kunde:string}>}|null} urteil  Abnahme des Modells
 * @returns {{punkte: Array<{id:string, erfuellt:boolean, notiz:string, geprueft:string}>, ersetzt:number, ueberstimmt:number, fehlt:number}}
 */
export function bewerte(auftrag, plan, gespielt, urteil) {
  const L = auftrag.lang === "en" ? "en" : "de";
  let ersetzt = 0, ueberstimmt = 0;
  const kunde = (t, art) => { if (istKundensatz(t)) return t.trim(); ersetzt++; return ERSATZ[L][art]; };
  const punkte = auftrag.punkte.map((p) => {
    const pl = plan.punkte.find((x) => x.id === p.id);
    if (!pl || !pl.machbar) return { id: p.id, erfuellt: false, notiz: kunde(pl ? pl.kunde : "", "nicht_machbar"), geprueft: "gelesen" };
    const u = urteil ? urteil.punkte.find((x) => x.id === p.id) : null;
    const modellOk = !!u && u.urteil === "erfuellt";
    if (pl.szenario) {
      const s = gespielt.find((x) => x.id === p.id);
      if (!s || !s.ok) return { id: p.id, erfuellt: false, notiz: s ? szenarioSatz(pl.szenario, s, L) : SZ_SATZ[L].fehler, geprueft: "gespielt" };
      if (modellOk) return { id: p.id, erfuellt: true, notiz: "", geprueft: "gespielt" };
      if (u && istKundensatz(u.kunde)) return { id: p.id, erfuellt: false, notiz: u.kunde.trim(), geprueft: "gelesen" };
      if (u && STARK.includes(pl.szenario.erwartung.art)) { ueberstimmt++; return { id: p.id, erfuellt: true, notiz: "", geprueft: "gespielt" }; }
      return { id: p.id, erfuellt: false, notiz: kunde(u ? u.kunde : "", "fehlt"), geprueft: "gelesen" };
    }
    return { id: p.id, erfuellt: modellOk, notiz: modellOk ? "" : kunde(u ? u.kunde : "", "fehlt"), geprueft: "gelesen" };
  });
  return { punkte, ersetzt, ueberstimmt, fehlt: punkte.filter((x) => !x.erfuellt).length };
}
