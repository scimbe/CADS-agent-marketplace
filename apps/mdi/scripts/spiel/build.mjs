// Baut Spielrahmen und lokale Host-Seite im Speicher (esbuild, wie scripts/build.js). Kein Schreiben nach dist/: der
// Bot-Runner liefert die Dateien per Playwright-Route aus. Die CSP des Rahmens kommt aus src/broker/spiel-csp.js;
// ein echter Spiel-Ursprung (spiel-…bunsenbrenner.org, spaeter) setzt dieselben Kopfzeilen.
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const common = { bundle: true, write: false, target: "es2022", legalComments: "none", logLevel: "silent" };

// CSP liegt in src/broker/spiel-csp.js (der Host braucht sie fuer iframe.csp); hier nur weitergereicht.
export { frameCsp, hostCsp } from "../../src/broker/spiel-csp.js";

const FRAME_HTML = "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">" +
  "<link rel=\"stylesheet\" href=\"frame.css\"><title>Spiel</title></head><body><main id=\"spiel\"></main><script src=\"frame.js\"></script></body></html>";
const FRAME_CSS = `:root { --gelb: #F9D84A; --creme: #FBF5DD; --tinte: #17140F; --rot: #B3321F; }
html, body { margin: 0; height: 100%; background: var(--creme); color: var(--tinte); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; }
#spiel { display: flex; flex-direction: column; height: 100%; }
.buehne { flex: 1; min-height: 0; }
canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.leiste { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--gelb); border-top: 3px solid var(--tinte);
  padding: 10px max(16px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
.kreuz { display: flex; gap: 8px; }
.knopf { min-width: 56px; min-height: 56px; padding: 0; display: grid; place-items: center; border: 3px solid var(--tinte); border-radius: 18px;
  background: var(--creme); color: var(--tinte); box-shadow: 4px 4px 0 var(--tinte); touch-action: none; }
.knopf:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--tinte); }
.knopf:focus-visible { outline: 3px solid #0b57d0; outline-offset: 2px; }
.knopf svg { width: 28px; height: 28px; }
.ton { min-width: 44px; min-height: 44px; border-radius: 16px; }
.feuer { min-width: 76px; min-height: 76px; border-radius: 22px; background: var(--rot); color: var(--creme); }
`;
const HOST_HTML = "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><link rel=\"stylesheet\" href=\"host.css\"><title>Spiel-Host (lokal)</title></head><body>" +
  "<div id=\"buehne\"></div><p><button id=\"pause\" type=\"button\">Pause</button> <button id=\"weiter\" type=\"button\">Weiter</button></p>" +
  "<output id=\"meta\"></output><output id=\"status\"></output><output id=\"fortschritt\"></output><output id=\"bericht\"></output>" +
  "<script type=\"module\" src=\"host.js\"></script></body></html>";
const HOST_CSS = "body { margin: 0; font-family: system-ui, sans-serif; } .spielrahmen { display: block; width: 390px; height: 700px; border: 0; } output { display: block; font: 12px monospace; }";

/**
 * @param {{fristen?: object}} [opt] fristen: Abweichungen von spiel/fristen.js, nur fuer Tests (mitFristen prueft die Schluessel)
 * @returns {Promise<{workerJs:string, files: Record<string, {body:string, type:string}>}>}
 */
export async function buildSpiel(opt = {}) {
  const worker = await esbuild.build({ ...common, format: "iife", entryPoints: [path.join(ROOT, "src/broker/spiel-worker.js")] });
  const workerJs = worker.outputFiles[0].text;
  const frame = await esbuild.build({ ...common, format: "iife", entryPoints: [path.join(ROOT, "src/broker/spiel-frame.js")], define: { __SPIEL_WORKER__: JSON.stringify(workerJs), __SPIEL_FRISTEN__: JSON.stringify(opt.fristen || {}) } });
  const host = await esbuild.build({ ...common, format: "esm", entryPoints: [path.join(ROOT, "scripts/spiel/host-seite.js")] });
  return {
    workerJs,
    frame: { "frame.html": { body: FRAME_HTML, type: "text/html" }, "frame.js": { body: frame.outputFiles[0].text, type: "text/javascript" }, "frame.css": { body: FRAME_CSS, type: "text/css" } },
    host: { "host.html": { body: HOST_HTML, type: "text/html" }, "host.js": { body: host.outputFiles[0].text, type: "text/javascript" }, "host.css": { body: HOST_CSS, type: "text/css" } }
  };
}
