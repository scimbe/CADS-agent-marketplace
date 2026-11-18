// Spiel-API der Freien Karte 2 (P2): die einzige Schnittstelle, gegen die ein erzeugtes Arcade-Spiel geschrieben wird.
// Klein und eindeutig, damit ein kleines Modell sie zuverlaessig nutzt. Rein: kein DOM, keine Uhr, kein Netz, keine
// Globals. Der Browser-Teil (broker/spiel-frame.js, paint.js) und der Bot-Runner (pruefung.js) rufen nur createGame() auf.
//
// Wiederverwendet aus dem Baukasten: Seed-RNG xoshiro128** (contract/sdk.js rng), sinD/cosD (nur + - * /, auf jeder
// Engine bitgleich, 08-forschung/determinismus.md), Zustands-Hash stateHashF. Neu ist nur, dass das Spiel als fremder
// Code kommt (Bausatz-Karten sind Daten fuer einen festen Interpreter, Arcade-Karten sind handgeschrieben).
//
// ===== So sieht ein Spielmodul aus (genau eine Datei, keine Importe) =====
//
//   export default {
//     title: "Segel-Invaders",              // 1..40 Zeichen
//     controls: ["left", "right", "fire"],  // Teilmenge von left, right, up, down, fire
//     lives: 3,                             // Startleben 1..9
//     init(g) {                             // Startzustand: nur Daten (Zahlen, Texte, true/false, null, Listen, Objekte)
//       return { ship: { x: 160, y: 560, w: 40, h: 30 }, shots: [] };
//     },
//     update(s, input, g) {                 // 60-mal je Sekunde; aendert s direkt
//       if (input.left) s.ship.x -= 4;
//       if (input.firePressed) { s.shots.push({ x: s.ship.x + 20, y: s.ship.y, r: 6 }); g.sound("shoot"); }
//     },
//     draw(s, d, g) {                       // zeichnet den Zustand; aendert nichts
//       d.clear("cream");
//       d.emoji("⛵", s.ship.x + 20, s.ship.y + 15, 36);
//     }
//   };
//
// Spielfeld: g.W x g.H = 360 x 640 logische Pixel, (0,0) links oben, y nach unten. Oben liegt die Anzeigeleiste
// (Punkte, Leben, Level) mit g.TOP = 48 Pixel Hoehe; dort nichts Wichtiges hinlegen. Punkte, Leben, Level, Spielende,
// Neustart, Pause und Ton-Freigabe macht die Laufzeit, nicht das Spiel.
//
// input (je Frame, nur deklarierte controls koennen true sein):
//   left, right, up, down, fire   gedrueckt gehalten (Tastatur, Steuerkreuz, Wischen setzt die Richtung fuer 1 Frame)
//   firePressed                   true nur im Frame, in dem fire neu gedrueckt wurde (auch: Tippen aufs Spielfeld)
//
// g (in init und update; in draw nur lesen):
//   g.W, g.H, g.TOP               Spielfeldgroesse und Hoehe der Anzeigeleiste
//   g.frame                       Frames seit Rundenstart (0, 1, 2, ...)
//   g.random()                    Zufall in [0, 1) aus dem Seed (der Zufall von Math ist gesperrt)
//   g.randInt(a, b)               ganze Zufallszahl a..b (beide inklusive)
//   g.sin(grad), g.cos(grad)      Winkel in Grad, auf jedem Geraet gleich
//   g.hit(a, b)                   Kollision: Rechteck {x,y,w,h} (x,y = links oben) oder Kreis {x,y,r} (x,y = Mitte)
//   g.dist(a, b)                  Abstand der Punkte a.x/a.y und b.x/b.y
//   g.clamp(v, min, max)
//   g.score, g.lives, g.level     aktueller Stand (nur lesen)
//   g.addScore(n)                 Punkte dazu (ganze Zahl)
//   g.loseLife()                  ein Leben weg; bei 0 ist das Spiel vorbei
//   g.addLife()                   ein Leben dazu (hoechstens 9)
//   g.nextLevel()                 Level + 1
//   g.gameOver()                  Spiel sofort vorbei
//   g.win()                       Spiel gewonnen und vorbei
//   g.sound(name)                 kurzer Ton: shoot, hit, pop, coin, jump, hurt, level, win, lose
//
// d (nur in draw). Farben nur: "yellow", "cream", "ink", "red".
//   d.clear(farbe)
//   d.rect(x, y, w, h, farbe, { round, shadow, line })   round: Eckradius in px, shadow: harter Schatten, line: Rand
//   d.circle(x, y, r, farbe, { shadow, line })
//   d.emoji(zeichen, x, y, groesse)                      Mitte bei x,y; groesse 8..160 px
//   d.text(text, x, y, { size, color, align })           size 10..64, align "left" | "center" | "right"
//   d.line(x1, y1, x2, y2, farbe, breite)
//
// Fehler bei falscher Nutzung werfen SpielFehler mit Code und einem Satz, was erwartet war.

import { rng as seedRng, sinD, cosD, stateHashF } from "../contract/sdk.js";

export const API_VERSION = "mdi-spiel/1";
export const W = 360, H = 640, TOP = 48, HZ = 60;
export const CONTROLS = Object.freeze(["left", "right", "up", "down", "fire"]);
export const COLORS = Object.freeze({ yellow: "#F9D84A", cream: "#FBF5DD", ink: "#17140F", red: "#B3321F" });
export const SOUNDS = Object.freeze(["shoot", "hit", "pop", "coin", "jump", "hurt", "level", "win", "lose"]);
/** Grenzen je Spiel. stateBytes: geschaetzte Groesse des Zustands; ops: Zeichenbefehle je Frame. */
export const LIMITS = Object.freeze({ stateBytes: 262144, stateNodes: 20000, ops: 1500, soundsPerFrame: 8, scoreStep: 100000, maxLives: 9, codeBytes: 65536, textLen: 80 });

const DEG = 3.141592653589793 / 180;
const INPUT_KEYS = Object.freeze([...CONTROLS, "firePressed"]);

/** Fehler mit festem Code; message ist ein Satz fuer Mensch und Modell (Reparaturrunde in P3). */
export class SpielFehler extends Error {
  /** @param {"modul"|"zustand"|"api"|"zeichnen"|"eingabe"|"speicher"} code @param {string} message */
  constructor(code, message) {
    super(message);
    // defineProperty statt Zuweisung: im gehaerteten Worker ist Error.prototype eingefroren (name dort nicht beschreibbar)
    Object.defineProperty(this, "name", { value: "SpielFehler" });
    Object.defineProperty(this, "code", { value: code, enumerable: true });
  }
}
const fail = (code, msg) => { throw new SpielFehler(code, msg); };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v) => (typeof v === "string" ? JSON.stringify(v) : v === undefined ? "undefined" : Number.isNaN(v) ? "NaN" : typeof v === "function" ? "eine Funktion" : JSON.stringify(v));

/**
 * Prueft die Form eines Spielmoduls. Wirft SpielFehler("modul") mit dem ersten Befund.
 * @param {any} mod  default-Export des Spielmoduls
 * @returns {{title:string, controls:string[], lives:number}}
 */
export function checkModule(mod) {
  const shape = "erwartet: export default { title, controls, lives, init(g), update(s, input, g), draw(s, d, g) }";
  if (!mod || typeof mod !== "object") fail("modul", "Spielmodul: kein default-Export gefunden – " + shape);
  const known = ["title", "controls", "lives", "init", "update", "draw"];
  for (const k of Object.keys(mod)) if (!known.includes(k)) fail("modul", "Spielmodul: unbekanntes Feld " + JSON.stringify(k) + " – " + shape);
  for (const f of ["init", "update", "draw"]) if (typeof mod[f] !== "function") fail("modul", "Spielmodul: " + f + " fehlt oder ist keine Funktion – " + shape);
  if (typeof mod.title !== "string" || mod.title.trim().length < 1 || mod.title.length > 40) fail("modul", "Spielmodul: title muss ein Text mit 1 bis 40 Zeichen sein, ist " + fmt(mod.title));
  const c = mod.controls;
  if (!Array.isArray(c) || c.length < 1) fail("modul", "Spielmodul: controls muss eine Liste aus " + CONTROLS.join(", ") + " sein, ist " + fmt(c));
  for (const x of c) if (!CONTROLS.includes(x)) fail("modul", "Spielmodul: controls enthaelt " + fmt(x) + " – erlaubt sind nur " + CONTROLS.join(", "));
  if (new Set(c).size !== c.length) fail("modul", "Spielmodul: controls enthaelt einen Eintrag doppelt");
  if (!Number.isInteger(mod.lives) || mod.lives < 1 || mod.lives > LIMITS.maxLives) fail("modul", "Spielmodul: lives muss eine ganze Zahl von 1 bis " + LIMITS.maxLives + " sein, ist " + fmt(mod.lives));
  return { title: mod.title, controls: CONTROLS.filter((x) => c.includes(x)), lives: mod.lives };
}

/**
 * Prueft, dass der Zustand nur aus Daten besteht, und schaetzt seine Groesse. Wirft mit Pfad zum ersten Befund.
 * @returns {number} geschaetzte Bytes
 */
export function checkState(s, where) {
  if (!s || typeof s !== "object" || Array.isArray(s)) fail("zustand", where + " muss ein Objekt { ... } liefern, nicht " + fmt(s));
  let bytes = 0, nodes = 0;
  const seen = new Set();
  const visit = (v, path) => {
    if (++nodes > LIMITS.stateNodes) fail("speicher", "Zustand zu gross: mehr als " + LIMITS.stateNodes + " Werte – alte Objekte aus Listen entfernen (z. B. Schuesse ausserhalb des Felds)");
    if (v === null || typeof v === "boolean") { bytes += 4; return; }
    if (typeof v === "number") { if (!Number.isFinite(v)) fail("zustand", "Zustand: " + path + " ist " + fmt(v) + " – nur endliche Zahlen erlaubt"); bytes += 8; return; }
    if (typeof v === "string") { bytes += v.length * 2 + 4; return; }
    if (typeof v !== "object") fail("zustand", "Zustand: " + path + " ist " + (typeof v === "function" ? "eine Funktion" : typeof v) + " – nur Daten erlaubt (Zahl, Text, true/false, null, Liste, Objekt)");
    if (seen.has(v)) fail("zustand", "Zustand: " + path + " kommt doppelt vor (geteiltes Objekt) – jedes Objekt nur einmal einhaengen");
    seen.add(v);
    if (Array.isArray(v)) { bytes += 8; for (let i = 0; i < v.length; i++) visit(v[i], path + "[" + i + "]"); return; }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) fail("zustand", "Zustand: " + path + " ist kein einfaches Objekt – nur { ... } und [ ... ] erlaubt (keine Klassen, Map, Set)");
    for (const k of Object.keys(v)) { bytes += k.length * 2 + 8; visit(v[k], path + "." + k); }
  };
  visit(s, "s");
  if (bytes > LIMITS.stateBytes) fail("speicher", "Zustand zu gross: etwa " + bytes + " Bytes, erlaubt " + LIMITS.stateBytes + " – alte Objekte aus Listen entfernen");
  return bytes;
}

/** Eingabe aus beliebiger Quelle (Rahmen, Bot) auf die festen Schluessel bringen; nicht deklarierte Steuerung ist false. */
export function normInput(raw, controls) {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) fail("eingabe", "Eingabe muss ein Objekt sein");
  const o = {};
  for (const k of INPUT_KEYS) {
    const v = raw ? raw[k] : undefined;
    if (v !== undefined && typeof v !== "boolean") fail("eingabe", "Eingabe " + k + " muss true/false sein, ist " + fmt(v));
    const ctl = k === "firePressed" ? "fire" : k;
    o[k] = controls.includes(ctl) && v === true;
  }
  if (raw) for (const k of Object.keys(raw)) if (!INPUT_KEYS.includes(k)) fail("eingabe", "Eingabe: unbekannter Schluessel " + JSON.stringify(k));
  return Object.freeze(o);
}

function shapeOf(o, which) {
  if (!o || typeof o !== "object") fail("api", "g.hit: " + which + " Objekt fehlt (bekommen: " + fmt(o) + ")");
  const rect = o.w !== undefined || o.h !== undefined, circ = o.r !== undefined;
  if (rect && circ) fail("api", "g.hit: " + which + " Objekt hat w/h und r – Rechteck {x,y,w,h} oder Kreis {x,y,r}, nicht beides");
  if (!rect && !circ) fail("api", "g.hit: " + which + " Objekt braucht {x,y,w,h} (Rechteck) oder {x,y,r} (Kreis)");
  for (const k of rect ? ["x", "y", "w", "h"] : ["x", "y", "r"]) if (!isNum(o[k])) fail("api", "g.hit: " + which + " Objekt: " + k + " ist " + fmt(o[k]) + ", erwartet eine Zahl");
  return rect ? "rect" : "circle";
}
/** Kollision Rechteck/Kreis (Rechteck x,y links oben; Kreis x,y Mitte). Beruehren zaehlt nicht, Ueberlappen schon. */
export function hit(a, b) {
  const ta = shapeOf(a, "erstes"), tb = shapeOf(b, "zweites");
  if (ta === "rect" && tb === "rect") return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  if (ta === "circle" && tb === "circle") { const dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r; return dx * dx + dy * dy < r * r; }
  const c = ta === "circle" ? a : b, r = ta === "circle" ? b : a;
  const nx = Math.max(r.x, Math.min(c.x, r.x + r.w)), ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
  const dx = c.x - nx, dy = c.y - ny;
  return dx * dx + dy * dy < c.r * c.r;
}

// ---------- Zeichnen: Befehle als Daten (der Rahmen malt sie, der Runner zaehlt sie) ----------
function color(fn, c) { if (!Object.prototype.hasOwnProperty.call(COLORS, c)) fail("zeichnen", fn + ": Farbe " + fmt(c) + " unbekannt – erlaubt: " + Object.keys(COLORS).join(", ")); return c; }
function nums(fn, names, vals) { for (let i = 0; i < names.length; i++) if (!isNum(vals[i])) fail("zeichnen", fn + ": " + names[i] + " ist " + fmt(vals[i]) + ", erwartet eine Zahl"); }
function opts(fn, o, allowed) {
  if (o === undefined) return {};
  if (!o || typeof o !== "object" || Array.isArray(o)) fail("zeichnen", fn + ": Optionen muessen ein Objekt sein, z. B. { " + allowed.join(", ") + " }");
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail("zeichnen", fn + ": unbekannte Option " + JSON.stringify(k) + " – erlaubt: " + allowed.join(", "));
  return o;
}
const bool = (fn, k, v) => { if (v !== undefined && typeof v !== "boolean") fail("zeichnen", fn + ": " + k + " muss true/false sein"); return v === true; };

/**
 * Zeichenflaeche fuer einen Frame. Liefert { d, ops }: d ist das Objekt fuer draw(), ops die Befehlsliste.
 * Befehle: ["clear",c] ["rect",x,y,w,h,c,round,shadow,line] ["circle",x,y,r,c,shadow,line] ["emoji",ch,x,y,size]
 *          ["text",str,x,y,size,c,align] ["line",x1,y1,x2,y2,c,width]
 */
export function createDrawer() {
  const ops = [];
  const push = (op) => { if (ops.length >= LIMITS.ops) fail("zeichnen", "zu viele Zeichenbefehle in einem Frame (mehr als " + LIMITS.ops + ") – weniger Objekte zeichnen"); ops.push(op); };
  const d = Object.freeze({
    clear(c) { push(["clear", color("d.clear", c)]); },
    rect(x, y, w, h, c, o) {
      nums("d.rect", ["x", "y", "w", "h"], [x, y, w, h]); color("d.rect", c); o = opts("d.rect", o, ["round", "shadow", "line"]);
      if (o.round !== undefined && (!isNum(o.round) || o.round < 0 || o.round > 100)) fail("zeichnen", "d.rect: round muss eine Zahl 0..100 sein");
      push(["rect", x, y, w, h, c, o.round || 0, bool("d.rect", "shadow", o.shadow), bool("d.rect", "line", o.line)]);
    },
    circle(x, y, r, c, o) {
      nums("d.circle", ["x", "y", "r"], [x, y, r]); color("d.circle", c); o = opts("d.circle", o, ["shadow", "line"]);
      if (r < 0) fail("zeichnen", "d.circle: r ist negativ (" + r + ")");
      push(["circle", x, y, r, c, bool("d.circle", "shadow", o.shadow), bool("d.circle", "line", o.line)]);
    },
    emoji(ch, x, y, size) {
      if (typeof ch !== "string" || ch.length < 1 || ch.length > 16) fail("zeichnen", "d.emoji: erstes Argument muss ein Emoji-Text sein, z. B. \"⛵\" (bekommen: " + fmt(ch) + ")");
      nums("d.emoji", ["x", "y", "groesse"], [x, y, size]);
      if (size < 8 || size > 160) fail("zeichnen", "d.emoji: groesse muss 8..160 sein, ist " + size);
      push(["emoji", ch, x, y, size]);
    },
    text(str, x, y, o) {
      if (typeof str === "number" && Number.isFinite(str)) str = String(str);
      if (typeof str !== "string") fail("zeichnen", "d.text: erstes Argument muss ein Text oder eine Zahl sein (bekommen: " + fmt(str) + ")");
      if (str.length > LIMITS.textLen) fail("zeichnen", "d.text: Text laenger als " + LIMITS.textLen + " Zeichen");
      nums("d.text", ["x", "y"], [x, y]); o = opts("d.text", o, ["size", "color", "align"]);
      const size = o.size === undefined ? 20 : o.size;
      if (!isNum(size) || size < 10 || size > 64) fail("zeichnen", "d.text: size muss 10..64 sein");
      const align = o.align === undefined ? "left" : o.align;
      if (!["left", "center", "right"].includes(align)) fail("zeichnen", "d.text: align muss \"left\", \"center\" oder \"right\" sein");
      push(["text", str, x, y, size, color("d.text", o.color === undefined ? "ink" : o.color), align]);
    },
    line(x1, y1, x2, y2, c, width) {
      nums("d.line", ["x1", "y1", "x2", "y2"], [x1, y1, x2, y2]); color("d.line", c);
      const wd = width === undefined ? 2 : width;
      if (!isNum(wd) || wd <= 0 || wd > 40) fail("zeichnen", "d.line: breite muss eine Zahl 0..40 sein");
      push(["line", x1, y1, x2, y2, c, wd]);
    }
  });
  return { d, ops };
}

/**
 * Laufzeit eines Spiels. Alles, was den Ablauf bestimmt, steht in Daten (Zustand, RNG-Zustand, Stand), damit
 * snapshot/restore exakt sind (Bots spielen damit voraus) und gleicher Seed + gleiche Eingaben gleich enden.
 * @param {object} mod   Spielmodul (default-Export)
 * @param {{seed:string, round?:number}} o
 */
export function createGame(mod, o) {
  if (!o || typeof o.seed !== "string" || !o.seed) fail("api", "createGame: seed (Text) fehlt");
  const meta = Object.freeze(checkModule(mod));
  let phase = "aus";       // "init" | "update" | "draw" | "aus"
  let s = null, r = null, st = null, sounds = [];
  const roundSeed = (n) => o.seed + "#" + n;
  const need = (fn, ...ph) => { if (!ph.includes(phase)) fail("api", fn + " geht nur in " + ph.join(" oder ") + ", nicht in " + (phase === "aus" ? "keiner Spielphase" : phase)); };
  const live = (fn) => { need(fn, "init", "update"); };

  const g = Object.freeze({
    W, H, TOP,
    get frame() { return st.frame; },
    get score() { return st.score; },
    get lives() { return st.lives; },
    get level() { return st.level; },
    random() { live("g.random()"); return r.u32() / 4294967296; },
    randInt(a, b) {
      live("g.randInt()");
      if (!Number.isInteger(a) || !Number.isInteger(b) || b < a) fail("api", "g.randInt(a, b): a und b muessen ganze Zahlen mit a <= b sein, bekommen " + fmt(a) + ", " + fmt(b));
      return a + r.int(b - a + 1);
    },
    sin(deg) { if (!isNum(deg)) fail("api", "g.sin: Winkel in Grad muss eine Zahl sein, ist " + fmt(deg)); return sinD(deg * DEG); },
    cos(deg) { if (!isNum(deg)) fail("api", "g.cos: Winkel in Grad muss eine Zahl sein, ist " + fmt(deg)); return cosD(deg * DEG); },
    hit,
    dist(a, b) {
      if (!a || !b || !isNum(a.x) || !isNum(a.y) || !isNum(b.x) || !isNum(b.y)) fail("api", "g.dist(a, b): a und b brauchen Zahlen x und y");
      const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy);
    },
    clamp(v, lo, hi) { if (!isNum(v) || !isNum(lo) || !isNum(hi)) fail("api", "g.clamp(v, min, max): drei Zahlen erwartet"); return v < lo ? lo : v > hi ? hi : v; },
    addScore(n) {
      live("g.addScore()");
      if (!Number.isInteger(n) || Math.abs(n) > LIMITS.scoreStep) fail("api", "g.addScore(n): n muss eine ganze Zahl bis " + LIMITS.scoreStep + " sein, ist " + fmt(n));
      if (!st.over) st.score = Math.max(0, st.score + n);
    },
    loseLife() { live("g.loseLife()"); if (st.over) return; st.lives -= 1; if (st.lives <= 0) { st.lives = 0; st.over = true; } },
    addLife() { live("g.addLife()"); if (!st.over && st.lives < LIMITS.maxLives) st.lives += 1; },
    nextLevel() { live("g.nextLevel()"); if (!st.over) st.level += 1; },
    gameOver() { live("g.gameOver()"); st.over = true; },
    win() { live("g.win()"); if (!st.over) { st.over = true; st.won = true; } },
    sound(name) {
      live("g.sound()");
      if (!SOUNDS.includes(name)) fail("api", "g.sound: " + fmt(name) + " unbekannt – erlaubt: " + SOUNDS.join(", "));
      if (sounds.length < LIMITS.soundsPerFrame) sounds.push(name);
    }
  });

  function begin(round) {
    r = seedRng(roundSeed(round));
    st = { frame: 0, score: 0, lives: meta.lives, level: 1, over: false, won: false, round, ticks: st ? st.ticks : 0 };
    sounds = [];
    phase = "init";
    let s0;
    try { s0 = mod.init(g); } finally { phase = "aus"; }
    checkState(s0, "init(g)");
    s = s0;
  }
  begin(o.round || 0);

  return {
    meta,
    /** Ein Frame. Waehrend das Spiel vorbei ist, ruht update; der Zaehler ticks laeuft weiter. */
    step(input) {
      const inp = normInput(input, meta.controls);
      sounds = [];
      st.ticks += 1;
      if (st.over) return;
      phase = "update";
      let ret;
      try { ret = mod.update(s, inp, g); } finally { phase = "aus"; }
      if (ret !== undefined && ret !== s) fail("api", "update gibt ein anderes Objekt zurueck – aendere s direkt und gib nichts zurueck");
      checkState(s, "update");
      st.frame += 1;
      if (st.over) sounds.push(st.won ? "win" : "lose");
    },
    /** Zeichnet den aktuellen Zustand; liefert die Befehlsliste. */
    draw() {
      const { d, ops } = createDrawer();
      phase = "draw";
      try { mod.draw(s, d, g); } finally { phase = "aus"; }
      return ops;
    },
    /** Stand fuer Anzeige, Bots und Host (Kopie). */
    status() { return { frame: st.frame, ticks: st.ticks, score: st.score, lives: st.lives, level: st.level, over: st.over, won: st.won, round: st.round }; },
    /** Toene des letzten Frames. */
    sounds() { return sounds.slice(); },
    /** Neue Runde mit eigenem Seed-Strom (seed#runde); Zaehler ticks bleibt. */
    restart() { begin(st.round + 1); },
    /** Vollstaendiger Ablaufzustand als Daten (fuer Vorausspielen der Bots). */
    snapshot() { return structuredClone({ s, r: r.state(), st }); },
    restore(snap) { const c = structuredClone(snap); s = c.s; st = c.st; r = seedRng(c.r); sounds = []; },
    /** Hash ueber Zustand, RNG und Stand (ohne ticks), bitgenau ueber Engines (stateHashF). */
    hash() { const { ticks, ...rest } = st; void ticks; return stateHashF({ s, r: r.state(), st: rest }); }
  };
}
