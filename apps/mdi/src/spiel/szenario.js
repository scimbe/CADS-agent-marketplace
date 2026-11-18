// Szenario-Bots der Freien Karte 2 (P3, Verbesserung 4 aus fk2-p3-messung.md): ein Haekchen-Punkt wird gespielt statt nur
// gelesen. Ein Szenario ist eine feste Folge von Eingaben und GENAU EINE Erwartung aus einer geschlossenen Liste, die eine
// Person beim Ausprobieren beobachten kann (Punkte, Leben, Spielende, Sieg, Level, eine Figur bewegt sich, eine Figur oder
// ein Text ist zu sehen, es werden mehr Figuren). Rein: kein DOM, keine Uhr, kein Netz. Laeuft im Sandbox-Worker
// (spiel-worker.js) nach den generischen Bots; der Bericht entscheidet nur auf dem Server (runGame), nie im Browser.
//
// Was sich nicht als Szenario sagen laesst, bleibt "nicht automatisch pruefbar" (der Planer setzt dann szenario: null);
// das wird der Person so gesagt.
import { createGame, CONTROLS } from "./api.js";
import { press } from "./bots.js";

export const SZ_VERSION = "mdi-szenario/1";
/** Erwartungen (geschlossene Liste) */
export const ARTEN = Object.freeze(["punkte_steigen", "leben_sinken", "spiel_endet", "sieg", "level_steigt", "figur_bewegt", "figur_sichtbar", "mehr_figuren", "text_sichtbar"]);
export const RICHTUNGEN = Object.freeze({ links: [-1, 0], rechts: [1, 0], hoch: [0, -1], runter: [0, 1] });
/** Grenzen: je Pruefung hoechstens max Szenarien, je Szenario hoechstens schritte Schritte und frames Frames */
export const SZ = Object.freeze({ max: 8, schritte: 6, frames: 1200, bewegtPx: 8, textLen: 40 });
/** Ein nicht erreichtes Szenario bekommt einen zweiten Anlauf mit dieser Dauer je Schritt (A10: zu knappe Szenarien) */
export const SZ_ZWEITER = 2;
/** Obergrenze der Spielschritte aller Szenarien einer Pruefung inkl. zweitem Anlauf und Kontrollen (Grundlage der Fristen in spiel/fristen.js) */
export const SZ_MAX_STEPS = SZ.max * SZ.frames * 2 * (1 + SZ_ZWEITER);   // je Anlauf hoechstens eine Kontrolle gleicher Dauer
/** Gruende eines nicht bestandenen Szenarios (geschlossene Liste; die Kundensaetze dazu stehen in bau/kundensprache.mjs) */
export const GRUENDE = Object.freeze(["nicht_erreicht", "figur_fehlt", "steuerung_fehlt", "von_allein", "fehler"]);

/** Text, wie ihn eine Person liest: Gross/klein und Leerraum egal */
const norm = (t) => String(t).toLowerCase().replace(/\s+/g, " ").trim();
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (o, keys) => Object.keys(o).every((k) => keys.includes(k));

/**
 * Prueft ein Szenario (Form, Grenzen). @returns {string|null} Grund der Ablehnung oder null
 * @param {any} sz
 */
export function checkSzenario(sz) {
  if (!isObj(sz) || !exact(sz, ["id", "schritte", "erwartung"])) return "Szenario: Schluessel id, schritte, erwartung";
  if (typeof sz.id !== "string" || !/^[a-z0-9]{1,8}$/.test(sz.id)) return "Szenario: id";
  if (!Array.isArray(sz.schritte) || sz.schritte.length < 1 || sz.schritte.length > SZ.schritte) return "Szenario: 1.." + SZ.schritte + " schritte";
  let frames = 0;
  for (const s of sz.schritte) {
    if (!isObj(s) || !exact(s, ["halte", "frames"]) || !Array.isArray(s.halte) || !Number.isInteger(s.frames) || s.frames < 1) return "Szenario: schritt { halte: [...], frames }";
    if (s.halte.length > 2 || !s.halte.every((c) => CONTROLS.includes(c)) || new Set(s.halte).size !== s.halte.length) return "Szenario: halte nur " + CONTROLS.join(", ") + " (hoechstens zwei)";
    frames += s.frames;
  }
  if (frames > SZ.frames) return "Szenario: mehr als " + SZ.frames + " Frames";
  const e = sz.erwartung;
  if (!isObj(e) || !ARTEN.includes(e.art)) return "Szenario: erwartung.art aus " + ARTEN.join(", ");
  const want = e.art === "figur_bewegt" ? ["art", "emoji", "richtung"] : ["figur_sichtbar", "mehr_figuren"].includes(e.art) ? ["art", "emoji"] : e.art === "text_sichtbar" ? ["art", "text"] : ["art"];
  if (Object.keys(e).length !== want.length || !exact(e, want)) return "Szenario: erwartung " + e.art + " braucht genau " + want.join(", ");
  if ("emoji" in e && (typeof e.emoji !== "string" || e.emoji.length < 1 || e.emoji.length > 16)) return "Szenario: emoji";
  if ("richtung" in e && !Object.hasOwn(RICHTUNGEN, e.richtung)) return "Szenario: richtung aus " + Object.keys(RICHTUNGEN).join(", ");
  if ("text" in e && (typeof e.text !== "string" || !e.text.trim() || e.text.length > SZ.textLen)) return "Szenario: text 1.." + SZ.textLen + " Zeichen";
  return null;
}

/** Liste von Szenarien (Protokoll, Auftrag). @returns {string|null} */
export function checkSzenarien(list) {
  if (!Array.isArray(list) || list.length > SZ.max) return "szenarien: Liste mit hoechstens " + SZ.max;
  const ids = new Set();
  for (const sz of list) { const bad = checkSzenario(sz); if (bad) return bad; if (ids.has(sz.id)) return "szenarien: id doppelt"; ids.add(sz.id); }
  return null;
}

/** Was eine Person sieht: Positionen und Anzahl einer Figur, alle Texte. */
function sicht(ops) {
  const emojis = new Map(), texte = [];
  for (const op of ops) {
    if (op[0] === "emoji") { const l = emojis.get(op[1]) || []; l.push([op[2], op[3]]); emojis.set(op[1], l); }
    else if (op[0] === "text") texte.push(norm(op[1]));
  }
  return { emojis, texte };
}
const mitte = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

/**
 * Spielt ein Szenario auf einem frischen Spiel; nicht erreicht -> ein zweiter Anlauf mit doppelter Dauer (SZ_ZWEITER).
 * wert.anlauf sagt, welcher Anlauf entschieden hat (1|2); wert.kontrolle, dass es auch ohne Eingabe geschah.
 * @param {object} mod  Spielmodul
 * @param {object} sz   geprueftes Szenario (checkSzenario)
 * @param {{seed:string, tick?:() => void}} o
 * @returns {{id:string, ok:boolean, grund:string|null, wert:object}}
 */
export function runSzenario(mod, sz, o) {
  const r = mitKontrolle(mod, sz, o, 1, "");
  if (r.ok || !["nicht_erreicht", "figur_fehlt", "von_allein"].includes(r.grund)) return { ...r, wert: { ...r.wert, anlauf: 1 } };
  // zweiter Anlauf: jede Eingabe doppelt so lange, neue Zufallsfolge. Erst wenn auch er scheitert, fehlt der Punkt.
  const r2 = mitKontrolle(mod, sz, o, SZ_ZWEITER, "|2");
  return { ...r2, wert: { ...r2.wert, anlauf: 2 } };
}

/** Arten, bei denen das Spiel das Erwartete auch von allein tun kann (Figur faellt, Gegner kommt): dort zaehlt nur, was die
 *  Eingabe bewirkt. */
export const MIT_KONTROLLE = Object.freeze(["figur_bewegt", "leben_sinken"]);
/**
 * Ein Anlauf mit Kontrolle: Haelt das Szenario Tasten und ist die Art in MIT_KONTROLLE, laeuft dieselbe Dauer ohne Eingabe
 * mit (gleicher Seed). Besteht auch die Kontrolle, hat die Eingabe nichts bewirkt: nicht bestanden. Ein Szenario ganz ohne
 * Tasten prueft gerade das, was von allein geschieht (z. B. "ein Gegner kostet ein Leben"), und hat keine Kontrolle.
 */
function mitKontrolle(mod, sz, o, dauer, salz) {
  const r = anlauf(mod, sz, o, dauer, salz);
  if (!r.ok || !MIT_KONTROLLE.includes(sz.erwartung.art) || sz.schritte.every((s) => !s.halte.length)) return r;
  const leer = { ...sz, schritte: sz.schritte.map((s) => ({ halte: [], frames: s.frames })) };
  const k = anlauf(mod, leer, o, dauer, salz);
  return k.ok ? { id: sz.id, ok: false, grund: "von_allein", wert: { ...r.wert, kontrolle: true } } : r;
}

/** Ein Anlauf auf einem frischen Spiel; dauer streckt jeden Schritt. */
function anlauf(mod, sz, o, dauer, salz) {
  const tick = o.tick || (() => {});
  const e = sz.erwartung, out = (ok, grund, wert = {}) => ({ id: sz.id, ok, grund: ok ? null : grund, wert });
  try {
    const game = createGame(mod, { seed: o.seed + "|sz|" + sz.id + salz });
    for (const s of sz.schritte) for (const c of s.halte) if (!game.meta.controls.includes(c)) return out(false, "steuerung_fehlt", { steuerung: c });
    const s0 = game.status(), v0 = sicht(game.draw());
    let over = false, won = false, maxCount = 0, textSeen = false, last = v0, frame = 0;
    const want = e.text ? norm(e.text) : null;
    if (want && v0.texte.some((t) => t.includes(want))) textSeen = true;
    for (const s of sz.schritte) {
      const a = { dirs: s.halte.filter((c) => c !== "fire"), fire: s.halte.includes("fire") };
      // Feuer zaehlt ab dem ersten Frame des Schritts (press drueckt jeden zweiten Frame ab k = 0): ein kurzer Feuer-Schritt
      // drueckt sicher, egal wann er beginnt (A10: ein 1-Frame-Feuer auf ungeradem Frame drueckte nie)
      for (let k = 0; k < s.frames * dauer; k++) {
        game.step(press(a, k)); frame++; tick();
        const st = game.status();
        if (st.over) { over = true; won = st.won; break; }
        // jeder 10. Frame wird angeschaut (so oft schaut auch ein Mensch hin); die Anzahl fuer mehr_figuren zaehlt ueberall
        if (frame % 10 === 0) {
          last = sicht(game.draw());
          if (e.emoji) maxCount = Math.max(maxCount, (last.emojis.get(e.emoji) || []).length);
          if (want && last.texte.some((t) => t.includes(want))) textSeen = true;
        }
      }
      if (over) break;
    }
    const s1 = game.status();
    if (!over) last = sicht(game.draw());
    if (!over && want && last.texte.some((t) => t.includes(want))) textSeen = true;
    switch (e.art) {
      case "punkte_steigen": return out(s1.score > s0.score, "nicht_erreicht", { vorher: s0.score, nachher: s1.score });
      case "leben_sinken": return out(s1.lives < s0.lives || (over && !won), "nicht_erreicht", { vorher: s0.lives, nachher: s1.lives });
      case "spiel_endet": return out(over, "nicht_erreicht", { over });
      case "sieg": return out(over && won, "nicht_erreicht", { over, won });
      case "level_steigt": return out(s1.level > s0.level, "nicht_erreicht", { vorher: s0.level, nachher: s1.level });
      case "figur_sichtbar": {
        const n = Math.max(maxCount, (last.emojis.get(e.emoji) || []).length, (v0.emojis.get(e.emoji) || []).length);
        return out(n > 0, "figur_fehlt", { anzahl: n });
      }
      case "mehr_figuren": {
        const n0 = (v0.emojis.get(e.emoji) || []).length;
        return out(maxCount > n0, n0 === 0 && maxCount === 0 ? "figur_fehlt" : "nicht_erreicht", { vorher: n0, hoechstens: maxCount });
      }
      case "text_sichtbar": return out(textSeen, "nicht_erreicht", {});
      case "figur_bewegt": {
        const a = v0.emojis.get(e.emoji), b = last.emojis.get(e.emoji);
        if (!a || !b) return out(false, "figur_fehlt", { vorher: !!a, nachher: !!b });
        const [x0, y0] = mitte(a), [x1, y1] = mitte(b), [dx, dy] = RICHTUNGEN[e.richtung];
        const weg = (x1 - x0) * dx + (y1 - y0) * dy;
        return out(weg >= SZ.bewegtPx, "nicht_erreicht", { weg: Math.round(weg) });
      }
      default: return out(false, "fehler", {});
    }
  } catch (err) {
    return out(false, "fehler", { code: err && err.code ? String(err.code) : "exception", message: String(err && err.message ? err.message : err).slice(0, 200) });
  }
}

/** Alle Szenarien einer Pruefung. */
export function runSzenarien(mod, list, o) {
  return list.map((sz) => runSzenario(mod, sz, o));
}
