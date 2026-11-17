// Aufzeichnende Leinwand fuer Tests: protokolliert jeden Aufruf und jede gesetzte Eigenschaft; Textbreite fest
// (Schriftgroesse * 0.55 * Zeichen), also auf jeder Maschine gleich. Dieselbe Leinwand diente beim einmaligen Erzeugen
// der Alt-Erwartungen (test/fixtures/poster-alt.json).
const round = (v) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v && typeof v === "object" ? (v.__img || "[obj]") : v);
export function recCanvas(w, h, id = "x") {
  const log = [];
  let font = "10px x";
  const c = new Proxy({}, {
    get(t, k) {
      if (k === "log") return log;
      if (k === "canvas") return cv;
      if (k === "measureText") return (s) => { const m = /(\d+(?:\.\d+)?)px/.exec(font); return { width: (m ? Number(m[1]) : 10) * 0.55 * String(s).length }; };
      if (k === "createRadialGradient") return (...a) => { const g = { stops: [], addColorStop: (o, col) => g.stops.push([o, col]), __img: "grad" }; log.push(["createRadialGradient", ...a.map(round)]); return g; };
      if (k === "getImageData") return (x, y, W, H) => ({ data: new Uint8ClampedArray(W * H * 4) });
      if (k === "putImageData") return () => {};
      if (k === "getTransform") return undefined;
      return (...a) => { log.push([k, ...a.map(round)]); };
    },
    set(t, k, v) { if (k === "font") font = v; log.push(["=" + String(k), round(v)]); return true; }
  });
  const cv = { width: w, height: h, id, getContext: () => c, __img: "canvas" };
  return { cv, c, log };
}
