/* Part regler, the page side: the flight game's tab Rules with named steps ("Moon … Jupiter") instead of numbers.
   It replaces the core's panel once loaded; without the part the core's number sliders stay. */
(function (root) {
  "use strict";
  var A = root.DailyApp, R = root.Regeln, Kit = root.Kit, t = Kit.t, el = A.el;
  function name(k, i) { return t("rg_" + k + i); }
  A.PANEL.Rules = function (p) {
    var ed = A.ed(), g = ed.doc.g;
    R.KEYS.forEach(function (k) {
      var row = el("label", "slide"), r = el("input"), i = R.level(k, g.params[k]), v = el("b", "", name(k, i));
      row.appendChild(el("span", "", t(k))); r.type = "range"; r.min = 0; r.max = R.N - 1; r.step = 1; r.value = i;
      r.setAttribute("aria-label", t(k)); r.setAttribute("aria-valuetext", name(k, i)); r.dataset.k = k;
      r.addEventListener("input", function () {
        var n = Number(r.value); g.params[k] = R.value(k, n); v.textContent = name(k, n); r.setAttribute("aria-valuetext", name(k, n));
        delete ed.doc.ki; A.changed();   // a change by hand: the AI seal goes, as in the core
      });
      row.appendChild(r); row.appendChild(v); p.appendChild(row);
    });
    p.appendChild(el("button", "chip", "✨ " + t("wishL_game"), function () { Kit.sfx.tap(); A.tab("Wish"); }));
  };
  var ed = A.ed(); if (ed && ed.tab === "Rules") A.tab("Rules");
})(window);
