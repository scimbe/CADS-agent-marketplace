// Feste Tick-Schleife fuer Echtzeitkarten (ADR 0001 b): Akkumulator mit dt = 1/tick, hoechstens 0,25 s Nachholzeit je
// Bild (danach Zeitverlust statt Todesspirale), rueckwaerts laufende Uhr wird ignoriert, Interpolationsanteil alpha.
// Pause/Weiter halten die Simulationszeit an. Uhr und Bildtakt kommen als Abhaengigkeiten (testbar, keine Globals).

export const MAX_CATCHUP = 0.25;

/**
 * @param {object} o
 * @param {number} o.tick                 Hz (30 | 60 | 120)
 * @param {() => number} o.now            Millisekunden (performance.now im Browser)
 * @param {(f:Function) => any} o.frame   naechstes Bild anfordern (requestAnimationFrame)
 * @param {(f:any) => void} [o.cancel]
 * @param {(n:number) => boolean} o.onTick  einen Tick rechnen; false = nicht moeglich (z. B. Partnereingabe fehlt)
 * @param {(alpha:number) => void} o.onFrame zeichnen
 */
export function createLoop(o) {
  const dt = 1000 / o.tick;
  let acc = 0, last = null, running = false, paused = false, handle = null, ticks = 0, stalled = false, lost = 0;
  function step() {
    handle = null;
    if (!running) return;
    const t = o.now();
    if (last === null || paused) last = t;
    let d = Math.max(0, t - last); last = Math.max(last, t);
    if (d > MAX_CATCHUP * 1000) { lost += d - MAX_CATCHUP * 1000; d = MAX_CATCHUP * 1000; }
    if (!paused) {
      acc += d;
      stalled = false;
      while (acc >= dt) {
        if (o.onTick(ticks) === false) { stalled = true; acc = Math.min(acc, dt); break; }
        ticks++; acc -= dt;
      }
    }
    o.onFrame(paused || stalled ? 0 : acc / dt);
    handle = o.frame(step);
  }
  return {
    start() { if (running) return; running = true; last = null; handle = o.frame(step); },
    stop() { running = false; if (handle !== null && o.cancel) o.cancel(handle); handle = null; },
    pause() { paused = true; acc = 0; },
    resume() { paused = false; last = null; },
    get paused() { return paused; },
    get running() { return running; },
    get stalled() { return stalled; },
    get ticks() { return ticks; },
    /** verlorene Zeit in ms durch die Nachholgrenze (Diagnose) */
    get lost() { return lost; }
  };
}
