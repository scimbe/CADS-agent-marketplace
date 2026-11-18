// Generische Bots fuer Spiele der Spiel-API (08-forschung/generische-bots.md, Echtzeit: "Rollout-Greedy").
// Sie kennen kein Spiel, nur meta.controls und die Laufzeit (step/status/snapshot/restore). Budget in Frames, nicht in
// Millisekunden: gleicher Seed => gleicher Zug auf jedem Geraet (Reproduzierbarkeit der Berichte).
import { rng } from "../contract/sdk.js";

export const BOTS = Object.freeze(["idle", "random", "greedy"]);
/** Greedy: alle DECIDE Frames je Aktion HORIZON Frames vorausspielen. */
export const GREEDY = Object.freeze({ decide: 10, horizon: 45, lifeCost: 500, overCost: 5000, levelGain: 1000 });

/** Aktionsraum aus den deklarierten Steuerungen: nichts, jede Richtung, Feuer, jede Richtung mit Feuer. */
export function actions(controls) {
  const dirs = controls.filter((c) => c !== "fire"), fire = controls.includes("fire");
  const out = [{ dirs: [], fire: false }];
  for (const d of dirs) out.push({ dirs: [d], fire: false });
  if (fire) { out.push({ dirs: [], fire: true }); for (const d of dirs) out.push({ dirs: [d], fire: true }); }
  return out;
}
/** Eingabe einer Aktion im Frame t. Feuer wird gehaemmert (jeder zweite Frame), damit firePressed vorkommt. */
export function press(a, t) {
  const o = {};
  for (const d of a.dirs) o[d] = true;
  if (a.fire && t % 2 === 0) { o.fire = true; o.firePressed = true; }
  return o;
}

function value(before, after) {
  return (after.score - before.score) - GREEDY.lifeCost * Math.max(0, before.lives - after.lives) + GREEDY.levelGain * (after.level - before.level) +
    (after.over && !before.over ? (after.won ? GREEDY.overCost : -GREEDY.overCost) : 0);
}

/**
 * @param {"idle"|"random"|"greedy"} kind
 * @param {object} game  Laufzeit aus createGame (api.js)
 * @param {string} seed
 * @returns {{ next(t:number): object }}
 */
export function makeBot(kind, game, seed) {
  const acts = actions(game.meta.controls);
  if (kind === "idle") return { next: () => ({}) };
  if (kind === "random") {
    const r = rng(seed + "|zufall");
    let cur = acts[0], left = 0;
    return { next(t) { if (left <= 0) { cur = r.pick(acts); left = 6 + r.int(15); } left--; return press(cur, t); } };
  }
  if (kind === "greedy") {
    let cur = 0;
    return {
      next(t) {
        if (t % GREEDY.decide === 0 && !game.status().over) {
          const snap = game.snapshot(), before = game.status();
          let best = -Infinity, pick = cur;
          for (let i = 0; i < acts.length; i++) {
            for (let k = 0; k < GREEDY.horizon; k++) { game.step(press(acts[i], t + k)); if (game.status().over) break; }
            const v = value(before, game.status());
            game.restore(snap);
            if (v > best || (v === best && i === cur)) { best = v; pick = i; }
          }
          cur = pick;
        }
        return press(acts[cur], t);
      }
    };
  }
  throw new RangeError("makeBot: unbekannter Bot " + kind);
}
