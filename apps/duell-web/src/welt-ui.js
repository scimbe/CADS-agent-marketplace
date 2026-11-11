/* Flight game: "What do you want to fly?" (AI kind welt). One sentence, one answer taken 1:1: rules, world, hero, title
   and a route of 3 sections. Nothing is mixed in, no look of the idea stays on top, no colour is rolled. The answer runs
   as a preview in the editor first and carries the AI mark; only "Fly" or "Keep" takes it (and books the action),
   "Discard" gives it back. Without AI: the sliders (Rules), and offline the sentence read by fixed word rules, said as such.
   A part of its own (scripts/build.js PARTS.welt); the core only calls WeltUI.panel from the Wish tab. */
(function (root) {
  "use strict";
  var C = root.DuellCore, D = root.Daily, Kit = root.Kit, t = Kit.t;
  // doc + world -> the new doc: the world replaces the old one whole. ki: the AI mark, null for the way without AI.
  function worldDoc(doc, st, ki) {
    var d = JSON.parse(JSON.stringify(doc));
    d.g = { seed: st.seed, params: st.params, theme: st.theme, title: st.title, emoji: st.emoji };
    if (st.route) d.g.route = st.route;
    var an = st.anim !== undefined ? st.anim : doc.g && doc.g.anim;   // an answer without an animation keeps the figure's; null takes it away
    if (an) d.g.anim = an;
    d.t = st.title; delete d.ki;
    if (ki) d.ki = ki;
    return D.sanitizeDoc(d);
  }
  // The route as one line of three steps: "🐳 schwebend → ⚡ Sturm → 🌊 schnell".
  function routeLine(route) { return route.map(function (x) { return x.e + " " + t("ph_" + x.p); }).join(" → "); }
  // p: the panel; A: the core's hooks { el, field, aiBlock, didLine, ed, tab, preview(state | null, fly), play() }.
  // preview gets fly too: the editor's big PLAY button flies the preview the same way "Fly" does.
  function panel(p, A) {
    var el = A.el, asked = "", shown = false, wait = null;
    var f = A.field(p, t("wishL_game"), "", 140, function () {}, true), tips = el("div", "chips");
    var want = function () { return D.cleanInput(f.value, 140); };
    // The editor shows the sheet again, and an open answer goes back (refund): asking again, Discard, the sliders.
    function off() { if (shown) { shown = false; A.preview(null); } var d = wait; wait = null; if (d) d(false); }
    var go = A.aiBlock(p, {
      kind: "welt", label: t("wishGo_game"), noteLast: true,
      input: function () { off(); asked = want(); return asked ? { satz: asked } : null; },
      local: function (input) { var s = C.localConfig(input.satz, Kit.lang); return s && !s.rejected ? { local: s } : null; },
      auto: function (o, ki, res) {
        var doc = A.ed().doc, before = JSON.stringify(doc);
        if (!ki) { A.didLine(res, before, worldDoc(doc, o.local, null), t("aiNoAi")); return; }
        var st = C.stateFromApi(o, asked);
        if (!st || !st.route) { res.appendChild(el("p", "note aistate", t("aiOff"))); return false; }
        return new Promise(function (done) {
          wait = done; shown = true; A.preview(st, function () { take(true); });
          var box = el("div", "weltpv"), head = el("p", "lbl"), seal = el("span", "kitag", t("kiBadge"));
          seal.setAttribute("role", "img"); seal.setAttribute("aria-label", t("kiBadgeL")); seal.title = t("kiBadgeL");
          head.appendChild(document.createTextNode(st.emoji + " " + st.title + " ")); head.appendChild(seal);
          box.appendChild(head); box.appendChild(el("p", "note welt-route", routeLine(st.route)));
          var row = el("div", "chips");
          function take(fly) {
            shown = false; wait = null; res.textContent = "";
            var did = A.didLine(res, before, worldDoc(A.ed().doc, st, { k: "welt", s: ki.s, h: ki.h }), t("kiBadgeL"));
            A.preview(null); done(did);
            if (fly) A.play();
          }
          row.appendChild(el("button", "chip hot", "▶ " + t("welt_fly"), function () { Kit.sfx.pop(); take(true); }));
          row.appendChild(el("button", "chip", "✓ " + t("welt_keep"), function () { Kit.sfx.pop(); take(false); }));
          row.appendChild(el("button", "chip", "✕ " + t("welt_drop"), function () {
            Kit.sfx.tap(); off(); res.textContent = ""; res.appendChild(el("p", "note", t("welt_dropped")));
          }));
          box.appendChild(row); box.appendChild(el("p", "note", t("welt_check")));
          res.appendChild(box);
          if (box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
        });
      }
    });
    p.appendChild(el("label", "lbl wishtips", t("welt_or")));
    t("wishTips_game").split("|").forEach(function (x) { tips.appendChild(el("button", "chip", x, function () { Kit.sfx.tap(); f.value = x; go(); })); });
    p.appendChild(tips);
    p.appendChild(el("button", "chip", "🎚 " + t("welt_rules"), function () { Kit.sfx.tap(); off(); A.tab("Rules"); }));
    p.appendChild(el("p", "note", t("wishH_game") + " " + t("aiNote")));
  }
  root.WeltUI = { panel: panel, worldDoc: worldDoc, routeLine: routeLine };
})(window);
