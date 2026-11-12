// Karte "lauf": Engine E3 (Runner und Plattformer, src/engines/lauf/), die zweite Spiel-Engine der freien Karte (Genre G2).
// Echtzeit-Vertrag ADR 0001 (b). Eingabe je Sitz {b}: Bit 0 Tippen (Puls), Bit 1 Halten, Bit 2 Ducken = Spur-Wort des Altcodes.
// Allein; mit 2 Sitzen ist Sitz 1 der Geist aus dem Link. Herausforderung ohne Geist: l.r = Punkte zum Schlagen (alt).
import manifest from "./manifest.json" with { type: "json" };
import { initState, stepState, copyState, press, release, setDuck, points, meters, bot as pageBot, withApi, STEP } from "../../engines/lauf/engine.js";
import { laufOf, fromServerDoc, toServerDoc, txt } from "../../engines/lauf/params.js";
import { fromWords } from "../../engines/lauf/words.js";
import { runOps, poseOf, VIEW } from "../../engines/lauf/view.js";
import { mixF64, FNV0, hex32 } from "../../engines/flug/rng.js";
import { fmt } from "../../engines/flug/text.js";
import TX from "../../engines/lauf/texts.json" with { type: "json" };

const TPS = 120, TMAX = 180 * TPS;
function say(key, o) { return { de: fmt(TX.de[key], o), en: fmt(TX.en[key], o) }; }

function init({ params: input, players }) {
  const params = input || {}, l = laufOf(params), n = Math.max(1, Math.min(2, players || 1)), sims = [];
  for (let i = 0; i < n; i++) sims.push(initState(l));
  return { t: 0, sims, fx: { flash: 0, shake: 0, since: {} }, r: l.r || 0, title: txt(params.t, 40) };
}
function copy(st) { return { ...st, fx: { ...st.fx, since: { ...st.fx.since } }, sims: st.sims.map(copyState) }; }
const DONE = ["ready", "run", "over", "goal"];
const done = (s) => s.state === "over" || s.state === "goal";

function step(state, inputs) {
  const st = copy(state), ev = [];
  st.fx.flash = Math.max(0, st.fx.flash - 2.5 / TPS); st.fx.shake = Math.max(0, st.fx.shake - 40 / TPS);
  st.sims.forEach((s, i) => {
    if (done(s) || st.t >= TMAX) return;
    const b = (inputs && inputs[i] && inputs[i].b) | 0;
    // Der Lauf beginnt bei Tick 0 (alt: der erste Tipp startet); danach wirken Eingaben am naechsten Tick
    if (st.t === 0 && s.state === "ready") { press(s); ev.push({ k: "start", seat: i }); }
    else if (b & 1) press(s);
    if (!(b & 2)) release(s);
    setDuck(s, (b & 4) !== 0);
    for (const k of stepState(s)) ev.push({ k, seat: i });
  });
  for (const e of ev) {
    if (e.seat !== 0) continue;
    if (e.k === "jump") st.fx.since.sprung = st.t;
    if (e.k === "coin" || e.k === "stomp") st.fx.since.treffer = st.t;
    if (e.k === "goal") st.fx.since.sieg = st.t;
    if (e.k === "dead") { st.fx.shake = 10; st.fx.flash = 1; }
  }
  st.t++;
  return { state: st, ev };
}

function status(st) {
  const sc = st.sims.map(points), over = st.sims.every(done) || st.t >= TMAX, me = st.sims[0];
  const out = { over, score: sc, winner: null, meters: me ? meters(me) : 0, goal: me.state === "goal" };
  if (over && sc.length === 2) out.winner = sc[0] > sc[1] ? 0 : sc[1] > sc[0] ? 1 : -1;
  else if (over && st.r) out.winner = sc[0] > st.r ? 0 : -1;
  out.say = over ? say(me.state === "goal" ? "lf_goal" : "lf_over", { p: sc[0], m: meters(me) }) : null;
  if (over && st.r) out.beat = say(sc[0] > st.r ? "lf_won" : "lf_short", { n: st.r, d: st.r - sc[0] + 1 });
  return out;
}

function view(st, ctx) {
  const c = ctx || {}, lang = c.lang === "en" ? "en" : "de", me = st.sims[0], t = c.t != null ? c.t : st.t / TPS;
  const since = {}; for (const k of Object.keys(st.fx.since)) since[k] = (st.t - st.fx.since[k]) / TPS;
  const layers = runOps(st.sims, { t, reduced: !!c.reduced, assets: c.assets, flash: st.fx.flash, shake: st.fx.shake, pose: poseOf(me.l, t, since, !!c.reduced) });
  const hud = fmt(TX[lang].lf_hud, { p: points(me), m: meters(me) });
  layers.push({ id: "hud", ops: [{ o: "text", x: VIEW / 2, y: 30, text: hud, size: 26, font: "brand", align: "center", base: "middle", fill: "#ffffff", stroke: "#00000073", lw: 4 }]
    .concat(st.r ? [{ o: "text", x: VIEW / 2, y: 58, text: fmt(TX[lang].lf_beat, { n: st.r }), size: 16, font: "body", align: "center", base: "middle", fill: "#ffffff", stroke: "#00000073", lw: 3 }] : []) });
  return { t: "canvas", w: VIEW, h: 360, layers, a11y: fmt(TX[lang].lf_area, { t: st.title || TX[lang].lf_def }) + ". " + hud };
}

// Bot (Standbild, Vorschau): der einfache Spieler der Seite (alt lauf-ui.js bot) als Eingabewort
function bot(st, seat) {
  const s = st.sims[seat]; if (!s || done(s)) return { b: 0 };
  // die Wirkung des Seiten-Bots auf die Eingabewarteschlange wird zum Eingabewort: Druecken = Tippen + Halten, Loslassen = 0
  const probe = withApi(copyState(s));
  probe.inq.jump = false;
  pageBot(probe);
  return { b: (probe.inq.jump ? 1 : 0) | (probe.inq.held ? 2 : 0) };
}
function hash(st) {
  let h = FNV0;
  for (const s of st.sims) {
    h = mixF64(mixF64(mixF64(h, s.me.x), s.me.y), s.me.vy); h = mixF64(mixF64(h, s.coins), s.stomps); h = mixF64(h, s.ticks);
    h = mixF64(mixF64(mixF64(h, s.r), DONE.indexOf(s.state)), s.gen.x);
    let live = 0, n = 0;
    for (const it of s.items) { if (it.t === "f" && it.live) h = mixF64(mixF64(h, it.x), it.y); if (it.live !== undefined) { live = (live * 2 + (it.live ? 1 : 0)) % 4294967296; n++; } }
    h = mixF64(mixF64(h, live), n);
  }
  return hex32(mixF64(h, st.t));
}

export default {
  manifest, init, step, status, view, bot, hash,
  fromFree: fromServerDoc, toFree: (params) => toServerDoc(params, null),
  fromWords, STEP
};
