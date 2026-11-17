// Freie Karte 2, P3: Pruefstand fuer erzeugte Spiele. Ein Browser fuer alle Karten; Bot-Laeufe hintereinander (Mutex),
// damit parallele Karten die Zeitmessung der Invariante "performance" nicht verfaelschen. Dazu Bildschirmfotos aus dem
// echten Spielmodus (Sandbox, play) fuer Abnahme und Urteil.
import { buildSpiel } from "../spiel/build.mjs";
import { runGame, openSandbox, launchBrowser, FRAME } from "../spiel/runner.mjs";
import { checkPolicy } from "./policy.mjs";
import { rng } from "../../src/contract/sdk.js";

const KEYS = { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", fire: "Space" };
const SHOT_VIEW = { viewport: { width: 390, height: 760 }, deviceScaleFactor: 1, hasTouch: true };

export async function createPruefstand() {
  const built = await buildSpiel();
  const browser = await launchBrowser();   // gleiche Heap-Grenze wie der Bot-Runner
  let chain = Promise.resolve();
  const exclusive = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  return {
    /** Statik + Policy + Bots in der Sandbox. @returns {Promise<{report:object, policy:string[], ok:boolean}>} */
    async pruefe(code, { name = "karte", seed = "p3", seconds = 60 } = {}) {
      const policy = checkPolicy(code);
      const report = await exclusive(() => runGame(browser, built, { name, code, seed, seconds }));
      return { report, policy, ok: report.ok && policy.length === 0 };
    },
    /**
     * Spielt das Spiel im echten Spielmodus kurz mit zufaelliger Eingabe der deklarierten Steuerung und macht Fotos.
     * @returns {Promise<{shots:Buffer[], status:object|null, errs:string[]}>}
     */
    async fotos(code, { seed = "p3foto", at = [1200, 4000] } = {}) {
      return exclusive(async () => {
        const { ctx, page, errs } = await openSandbox(browser, built, { mode: "play", code, seed }, { view: SHOT_VIEW });
        const shots = [];
        let status = null;
        try {
          await page.waitForFunction(() => document.getElementById("meta").textContent.length > 0 || document.getElementById("bericht").textContent.length > 0, null, { timeout: 8000 });
          const meta = JSON.parse((await page.locator("#meta").textContent()) || "null");
          const fr = page.frames().find((f) => f.url().startsWith(FRAME));
          if (meta && fr) {
            await fr.locator("canvas").click({ position: { x: 20, y: 300 } });
            const r = rng(seed + "|foto"), ctl = meta.controls;
            let t = 0;
            for (const until of at) {
              while (t < until) {
                const k = KEYS[ctl[r.int(ctl.length)]];
                await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k);
                t += 140;
              }
              shots.push(await page.locator("iframe").screenshot({ type: "png" }));
            }
            const raw = await page.locator("#status").textContent();
            status = raw ? JSON.parse(raw) : null;
          }
        } catch (e) { errs.push("fotos: " + String(e.message).split("\n")[0]); }
        await ctx.close();
        return { shots, status, errs };
      });
    },
    async close() { await browser.close(); }
  };
}
