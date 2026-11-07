/* Part regler: the flight game's sliders in named steps instead of raw physics numbers (pure, unit-tested in
   test/regeln.test.js). Five steps per slider, the middle one is the game's default; a step maps to one fixed value
   inside DuellCore.RANGES, so the same step always gives the same game. A sheet with an in-between value (an old link,
   a wish) keeps it until the slider is moved; the slider shows the nearest step. */
(function (root) {
  "use strict";
  var C = root.DuellCore || (typeof require === "function" ? require("./core.js") : null);
  var KEYS = ["gravity", "jump", "gap", "speed"], N = 5;
  function r5(v) { return Math.round(v / 5) * 5; }
  // lowest, halfway to the default, the default, halfway to the highest, highest
  function steps(k) { var g = C.RANGES[k]; return [g[0], r5((g[0] + g[2]) / 2), g[2], r5((g[2] + g[1]) / 2), g[1]]; }
  function level(k, v) {
    var s = steps(k), best = 0;
    for (var i = 1; i < N; i++) if (Math.abs(s[i] - v) < Math.abs(s[best] - v)) best = i;
    return best;
  }
  function value(k, i) { var s = steps(k); return s[Math.max(0, Math.min(N - 1, Math.round(Number(i) || 0)))]; }
  var api = { KEYS: KEYS, N: N, steps: steps, level: level, value: value };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Regeln = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
