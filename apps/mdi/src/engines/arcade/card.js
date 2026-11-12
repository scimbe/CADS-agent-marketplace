// Kartenvertrag der Arcade-Duelle (ADR 0001 b, mode "realtime", net "split"): eine Fabrik fuer alle zehn Karten.
// init/step = die Partie (zwei Seiten + Warteschlangen, Bot im Zustand), side = ein Handy im Live-Spiel.
// Bot: players[seat] === "bot" bei init; der Bot rechnet in step mit Gedaechtnis und Wuerfeln im Zustand (alt
// arcade-ui.js playBot: "the bot's side runs in this page with the very same engine and messages as a live friend").
import { W, H, TICK, matchInit, matchStart, matchStep, matchStatus, matchHash, liveInit, liveStep, hashSide, mineTurn } from "./index.js";
import { drawSide, lookOf, thumbOf } from "./view.js";
import { CONTROLS } from "./controls.js";
import { META, COLORS, EMOJI, tx, fmt } from "./meta.js";

const FX_KEEP = 2.5, FX_MAX = 64;
function log(fx, ev, at, nextId) {
  let id = nextId;
  for (const e of ev) fx.push(Object.assign({}, e, { at, id: id++ }));
  while (fx.length && (fx.length > FX_MAX || at - fx[0].at > FX_KEEP)) fx.shift();
  return id;
}
// ---------- Kennzahlen fuer den Endbildschirm (Design Phase C: drei Zahlen unter dem Spielstand) ----------
const BALL = ["hit", "kick", "flip", "bump"];
function statsNew() { return { hits: 0, rally: 0, best: 0, shots: 0, points: 0, saves: 0 }; }
/** Zaehlt die Ereignisse einer Seite (eigenes Bild). me: Spieler-Index in Rundenspielen (Wurf-Ereignis traegt p). */
function count(z, ev, me) {
  for (const e of ev) {
    if (BALL.includes(e.k)) { z.hits++; z.rally++; z.best = Math.max(z.best, z.rally); }
    else if (e.k === "ohit") { z.rally++; z.best = Math.max(z.best, z.rally); }
    else if (e.k === "score" || e.k === "lose") { if (e.k === "score") z.points += e.n || 1; z.rally = 0; }
    if ((e.k === "fire" || e.k === "throw") && (e.mine === true || (e.mine === undefined && e.p === me))) z.shots++;
    if (e.k === "saved") z.saves++;
  }
}
const SL = {
  hits: { de: "Ballkontakte", en: "Touches" }, best: { de: "Längster Ballwechsel", en: "Longest rally" }, time: { de: "Spielzeit", en: "Time played" },
  shots: { de: "Schüsse und Würfe", en: "Shots and throws" }, points: { de: "Punkte", en: "Points" }, saves: { de: "Paraden", en: "Saves" }
};
/** Ein Satz zu jeder Kennzahl (Design Phase C, auch fuer 85-Jaehrige verstaendlich). */
const SH = {
  hits: { de: "So oft hast du den Ball berührt.", en: "How often you touched the ball." },
  best: { de: "Die meisten Ballberührungen am Stück, bevor ein Punkt fiel.", en: "Most touches in a row before a point was scored." },
  time: { de: "So lange hat die Partie gedauert.", en: "How long the game lasted." },
  shots: { de: "So oft hast du geschossen oder geworfen.", en: "How often you shot or threw." },
  points: { de: "So viele Punkte hast du geholt.", en: "How many points you scored." },
  goals: { de: "So viele deiner Schüsse gingen ins Tor.", en: "How many of your shots went in." },
  saves: { de: "Paraden: So oft hast du als Torwart den Ball gehalten.", en: "Saves: how often you stopped the ball as goalkeeper." }
};
/** Drei Kennzahlen je Spiel: Ballspiele Kontakte/Ballwechsel, Schuss- und Wurfspiele Schuesse/Punkte, Elfer Tore/Paraden. */
function statsOf(g, z, t) {
  const time = { id: "time", label: SL.time, hint: SH.time, value: Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0") };
  if (g === "elfer") return [{ id: "points", label: { de: "Tore", en: "Goals" }, hint: SH.goals, value: z.points }, { id: "saves", label: SL.saves, hint: SH.saves, value: z.saves }, time];
  if (g === "panzer" || g === "snow" || g === "stock" || g === "murmel") return [{ id: "shots", label: SL.shots, hint: SH.shots, value: z.shots }, { id: "points", label: SL.points, hint: SH.points, value: z.points }, time];
  return [{ id: "hits", label: SL.hits, hint: SH.hits, value: z.hits }, { id: "best", label: SL.best, hint: SH.best, value: z.best }, time];
}
const comfortOf = (params) => !!params && params.comfort === "an";
function winOf(g, params) { return params && Number.isInteger(params.win) && params.win >= 1 && params.win <= 9 ? params.win : undefined; }
function textOf(S, lang, them) {
  const T = tx(lang), say = fmt(T.score, { you: T.you, a: S.score[0], b: S.score[1], them });
  let note = "";
  if (S.started && !S.over) {
    if (S.g === "stock" || S.g === "murmel") note = mineTurn(S) ? T.yourTurn : T.theirTurn;
    else if (S.g === "elfer") note = S.st.shooting ? T.shoot : T.keep;
  }
  if (S.over) note = fmt(S.draw ? T.draw : S.score[0] > S.score[1] ? T.won : T.lost, { a: S.score[0], b: S.score[1] });
  return { say, note };
}

/** Echtzeit-Modul einer Arcade-Karte. g: Spiel-id der Engine. */
export function makeCard(g, manifest) {
  const card = {
    manifest,
    init({ params, seed, players }) {
      const st = matchInit({ g, seed: String(seed), players: players || ["human", "bot"], win: winOf(g, params), comfort: comfortOf(params) });
      st.look = lookOf(g, params); st.title = params && typeof params.title === "string" ? params.title : "";
      st.fx = [[], []]; st.fxn = 0; st.stats = [statsNew(), statsNew()];
      return matchStart(st);
    },
    step(state, inputs) {
      const r = matchStep(state, inputs), st = r.state, at = st.now / TICK;
      for (let s = 0; s < 2; s++) { const ev = r.ev.filter((e) => e.seat === s); st.fxn = log(st.fx[s], ev, at, st.fxn); count(st.stats[s], ev, st.sides[s].me); }
      return { state: st, ev: r.ev };
    },
    status(state) {
      const s = matchStatus(state), A = state.sides[0], t = textOf(A, "de", state.players[1] === "bot" ? tx("de").bot : tx("de").friend);
      return { over: s.over, score: s.score, winner: s.winner, draw: s.draw, rejected: s.rejected, timeUp: s.timeUp, comfort: !!state.comfort, stats: statsOf(g, state.stats[0], A.t), say: t.say + (t.note ? ". " + t.note : "") };
    },
    view(state, ctx = {}) {
      const seat = ctx.seat === 1 ? 1 : 0, S = state.sides[seat], T = tx(ctx.lang), c = state.ctl[seat];
      const them = state.players[1 - seat] === "bot" ? T.bot : T.friend, t = textOf(S, ctx.lang, them);
      const node = drawSide(S, state.look, { now: (state.now + (ctx.alpha || 0)) / TICK, fx: state.fx[seat], aim: c.aim, swipe: c.swipe, reduced: ctx.reduced, count: ctx.countdown, hud: (state.title ? state.title + "  ·  " : "") + t.say, note: t.note, a11y: (manifest.title[ctx.lang === "en" ? "en" : "de"] || "") + ": " + t.say });
      return ctx.thumb ? thumbOf(node, g) : node;
    },
    /** Bot-Sitz: rechnet in step (Gedaechtnis im Zustand); hier nur die leere Eingabe, damit modesOf "bot" anbietet. */
    bot() { return { b: 0, ax: 0, ay: 0, p: [] }; },
    hash(state) { return state && state.S ? hashSide(state.S) : matchHash(state); },
    side: {
      init({ params, seed, seat, serving }) {
        const st = liveInit(g, { seed: String(seed), seat, serving, win: winOf(g, params), comfort: comfortOf(params) });
        st.look = lookOf(g, params); st.title = params && typeof params.title === "string" ? params.title : ""; st.fx = []; st.fxn = 0; st.stats = statsNew();
        return st;
      },
      step(st, { input, inbox, wall }) {
        const r = liveStep(st, { input, inbox, wall }), n = r.st;
        n.fxn = log(n.fx, r.ev, n.S.t, n.fxn); count(n.stats, r.ev, n.S.me);
        return { st: n, out: r.out, ev: r.ev };
      },
      view(st, ctx = {}) {
        const S = st.S, T = tx(ctx.lang), t = textOf(S, ctx.lang, T.friend);
        const shown = ctx.tracked ? trackedSide(S, ctx.tracked) : S;
        return drawSide(shown, st.look, { now: S.t + (ctx.alpha || 0) / TICK, fx: st.fx, aim: st.ctl.aim, swipe: st.ctl.swipe, reduced: ctx.reduced, count: ctx.countdown, hud: (st.title ? st.title + "  ·  " : "") + t.say, note: t.note, a11y: t.say });
      },
      status(st) { const S = st.S, t = textOf(S, "de", tx("de").friend); return { over: S.over, score: S.score.slice(), winner: S.over ? (S.draw ? -1 : S.score[0] > S.score[1] ? 0 : 1) : null, draw: !!S.draw, rejected: S.rejected, say: t.say, comfort: !!st.comfort, stats: statsOf(S.g, st.stats, S.t) }; },
      hash(st) { return hashSide(st.S); }
    }
  };
  return card;
}

// Glaettung (nur Anzeige, alt smooth.js figure()): der Host fuehrt den Tracker je rt.smooth-Eintrag, ctx.tracked.p ist
// die geglaettete Meldung der Gegenseite in ihren eigenen Feldern; hier wird sie in die Gegnerfigur dieser Seite gesetzt.
function trackedSide(S, tracked) {
  const p = tracked.p; if (!p) return S;
  const st = Object.assign({}, S.st), n = (v) => typeof v === "number" && Number.isFinite(v);
  switch (S.g) {
    case "puck": case "volley": if (n(p.x) && n(p.y)) st.opp = { x: p.x, y: p.y }; break;
    case "ziegel": case "snow": if (n(p.x)) st.opp = p.x; break;
    case "kick": if (n(p.c)) st.opp = p.c; break;
    case "elfer": if (n(p.x)) { st.opp = p.x; if (n(p.v)) st.oppV = p.v; } break;
    case "panzer": if (n(p.vx) && n(p.vy)) st.oppAim = { vx: p.vx, vy: p.vy }; break;
    default: return S;
  }
  return Object.assign({}, S, { st });
}

// ---------- Manifest-Bausteine (gemeinsam fuer alle zehn Karten) ----------
const L = (de, en) => ({ de, en });
/** Klaenge je Ereignis (alt arcade-ui.js:31-41 SND und P.events :73-105). */
export const SOUNDS = {
  hit: { synth: "tone", f0: 410, f1: 160, dur: 0.07, type: "square", vol: 0.05, haptic: 8 }, ohit: { synth: "tone", f0: 410, f1: 160, dur: 0.07, type: "square", vol: 0.05 },
  kick: { synth: "tone", f0: 410, f1: 160, dur: 0.07, type: "square", vol: 0.05, haptic: 8 }, flip: { synth: "tone", f0: 410, f1: 160, dur: 0.07, type: "square", vol: 0.05, haptic: 8 },
  bump: { synth: "tone", f0: 410, f1: 160, dur: 0.07, type: "square", vol: 0.05 }, clack: { synth: "tone", f0: 330, f1: 160, dur: 0.07, type: "square", vol: 0.04 },
  wall: { synth: "tone", f0: 180, f1: 120, dur: 0.05, type: "triangle", vol: 0.04 }, net: { synth: "tone", f0: 180, f1: 120, dur: 0.05, type: "triangle", vol: 0.04 },
  land: { synth: "tone", f0: 180, f1: 120, dur: 0.05, type: "triangle", vol: 0.04 }, miss: { synth: "tone", f0: 180, f1: 120, dur: 0.05, type: "triangle", vol: 0.04 },
  brick: { synth: "noise", freq: 1800, dur: 0.18, vol: 0.22, haptic: 14 }, out: { synth: "noise", freq: 1800, dur: 0.18, vol: 0.22, haptic: 14 },
  boom: { synth: "noise", freq: 500, dur: 0.5, vol: 0.4, haptic: 30 }, tank: { synth: "noise", freq: 500, dur: 0.5, vol: 0.4, haptic: 30 },
  splash: { synth: "noise", freq: 2600, dur: 0.3, vol: 0.12 }, fire: { synth: "noise", freq: 3200, dur: 0.14, vol: 0.06 }, throw: { synth: "noise", freq: 3200, dur: 0.14, vol: 0.06 },
  score: { synth: "tone", f0: 523, f1: 784, dur: 0.24, type: "triangle", vol: 0.1 }, saved: { synth: "tone", f0: 523, f1: 784, dur: 0.24, type: "triangle", vol: 0.1 },
  won: { synth: "tone", f0: 523, f1: 1046, dur: 0.4, type: "triangle", vol: 0.12 }, save: { synth: "tone", f0: 485, f1: 160, dur: 0.07, type: "square", vol: 0.05 },
  lose: { synth: "tone", f0: 330, f1: 110, dur: 0.35, type: "sawtooth", vol: 0.06, haptic: 60 }, splat: { synth: "tone", f0: 330, f1: 110, dur: 0.35, type: "sawtooth", vol: 0.06, haptic: 60 },
  serve: { synth: "tone", f0: 440, f1: 660, dur: 0.08, type: "sine", vol: 0.05 }, give: { synth: "tone", f0: 440, f1: 660, dur: 0.08, type: "sine", vol: 0.05 }
};
/** Glaettung der gemeldeten Gegnerfigur je Spiel (alt smooth.js figure(), vmax/lo/hi unveraendert). */
export const SMOOTH = {
  puck: [{ msg: "p", fields: ["x", "y"], vmax: 3200, lo: [72, 72], hi: [W - 72, H / 2 - 72] }],
  ziegel: [{ msg: "p", fields: ["x"], vmax: 2600, lo: [100], hi: [W - 100] }],
  volley: [{ msg: "p", fields: ["x", "y"], vmax: 1280, lo: [590, 1032], hi: [W - 78, 1372] }],
  kick: [{ msg: "p", fields: ["c", "k"], vmax: 2400, lo: [320, 0], hi: [W - 320, 1] }],
  snow: [{ msg: "p", fields: ["x"], vmax: 760, lo: [46], hi: [W - 46] }],
  elfer: [{ msg: "p", fields: ["x", "v"], vmax: 950, lo: [240], hi: [760] }],
  panzer: [{ msg: "p", fields: ["vx", "vy"], vmax: 1000000, lo: [-1350, -1350], hi: [1350, 1350] }]
};
/** Parameter jeder Arcade-Karte: Farben, Figur, Texte, Punkte zum Sieg (wie alt frei.js) und eigenes Foto. */
export function paramsOf(g, rules) {
  const m = META[g], props = {
    colA: { type: "string", enum: COLORS, default: m.a, "x-field": "color", "x-label": L("Deine Farbe", "Your colour") },
    colB: { type: "string", enum: COLORS, default: m.b, "x-field": "color", "x-label": L("Farbe des Gegners", "Opponent's colour") },
    emoji: { type: "string", enum: ["", ...EMOJI], default: "", "x-field": "choice", "x-label": L("Figur", "Figure") },
    title: { type: "string", maxLength: 34, pattern: "^[^\\u0000-\\u001f\\u007f<>]*$", default: "", "x-field": "text", "x-model": true, "x-label": L("Titel", "Title") },
    sub: { type: "string", maxLength: 60, pattern: "^[^\\u0000-\\u001f\\u007f<>]*$", default: "", "x-field": "text", "x-model": true, "x-label": L("Untertitel", "Subtitle") },
    photo: { type: ["string", "null"], pattern: "^local:[0-9a-f]{32}$", default: null, "x-field": "media.local", "x-label": L("Eigenes Foto (bleibt auf dem Gerät)", "Your photo (stays on this device)") },
    photoUse: { type: "string", enum: ["off", "figure", "bg"], default: "off", "x-field": "choice", "x-label": L("Foto als", "Use photo as"),
      "x-names": { off: L("Kein Foto", "No photo"), figure: L("Als Figur", "As figure"), bg: L("Als Hintergrund", "As background") } },
    // Design Phase C: Zeitlupe 50 %, Doppeltippen zaehlt einmal, grosse Tasten (Host), Flipper bleibt oben solange gedrueckt
    comfort: { type: "string", enum: ["aus", "an"], default: "aus", "x-field": "choice", "x-label": L("Gemütlich spielen", "Play at ease"),
      "x-names": { aus: L("Aus", "Off"), an: L("An: halbes Tempo, große Tasten", "On: half speed, big buttons") } }
  };
  if (g !== "elfer") props.win = { type: "integer", minimum: 1, maximum: 9, default: rules.WIN, "x-field": "number", "x-model": true, "x-label": L("Punkte zum Sieg", "Points to win") };
  const req = Object.keys(props);
  return {
    params: { type: "object", additionalProperties: false, required: req, properties: props },
    parts: [
      { id: "farben", params: ["colA", "colB"], label: L("Farben", "Colours") },
      { id: "figur", params: ["emoji", "photo", "photoUse"], label: L("Figur und Foto", "Figure and photo") },
      { id: "texte", params: ["title", "sub"], label: L("Texte", "Texts") },
      { id: "gemuetlich", params: ["comfort"], label: L("Gemütlich spielen", "Play at ease") },
      ...(g !== "elfer" ? [{ id: "regeln", params: ["win"], label: L("Regeln", "Rules") }] : [])
    ]
  };
}
/** Startansicht fuer Vorschau und Thumbnail (Bot gegen Bot, Seed "preview"): ein Moment mit Handlung. */
export const PREVIEW = { puck: 40, stock: 1100, murmel: 700, elfer: 260, panzer: 360 };
export function rtOf(g) {
  return { tick: 120, view: { w: W, h: H, fit: "contain" }, numeric: "f64", net: "split", maxTicks: 216000, controls: CONTROLS[g], sounds: SOUNDS, ...(SMOOTH[g] ? { smooth: SMOOTH[g] } : {}), ...(PREVIEW[g] ? { preview: { ticks: PREVIEW[g] } } : {}) };
}
