/* Weather card: place and day in, real figures out. No figures without the service. A part of its own (scripts/build.js
   PARTS.wetter, not in a flavor without cards); the core keeps a slot in the card's text tab (app.js weatherBlock) and
   calls Wetter.block(slot) once the part is there. Its words (wx*) come with the part. */
(function (root) {
  "use strict";
  var D = root.Daily, Kit = root.Kit, t = Kit.t, A = root.DailyApp, el = A.el;
  function block(p) {
    var box = el("div", "aibox"), place = el("input", "field"), days = el("div", "chips"), when = 0, row = el("div", "chips");
    place.maxLength = 40; place.autocomplete = "off"; place.setAttribute("aria-label", t("wxPlace")); place.placeholder = t("wxPlace");
    box.appendChild(el("label", "lbl", t("wxTitle"))); box.appendChild(place);
    [t("wxToday"), t("wxTomorrow"), t("wxAfter")].forEach(function (l, i) {
      var b = el("button", "chip" + (i ? "" : " on"), l, function () { when = i; Array.from(days.children).forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); });
      days.appendChild(b);
    });
    box.appendChild(days);
    var go = el("button", "chip", "🌦 " + t("wxGo"), async function () {
      var v = D.cleanInput(place.value, 40); if (!v) { Kit.toast(t("filter")); return; }
      go.disabled = true;
      var day = new Date(Date.now() + when * 86400000).toISOString().slice(0, 10), r = null;
      try { r = await root.Ai.post("/weather", { place: v, date: day }); } catch (e) { r = null; }
      go.disabled = false;
      if (!r || r.status !== 200 || !r.json) { Kit.toast(r && r.status === 404 ? t("wxNoPlace") : r && r.status === 422 ? t("filter") : t("wxFail")); return; }
      var j = r.json; A.ed().doc.w = D.sanitizeDoc({ k: "card", w: { p: j.place, d: j.date, hi: j.hi, lo: j.lo, rn: j.rain, c: j.code } }).w; Kit.sfx.pop(); A.changed(); A.tab("Text");
    });
    row.appendChild(go);
    if (A.ed().doc.w) row.appendChild(el("button", "chip", "✕ " + t("wxOff"), function () { delete A.ed().doc.w; A.changed(); A.tab("Text"); }));
    box.appendChild(row); box.appendChild(el("p", "note", t("wxNote"))); p.appendChild(box);
  }
  root.Wetter = { block: block };
})(window);
