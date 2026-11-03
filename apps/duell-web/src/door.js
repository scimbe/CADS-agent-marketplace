/* Advent door from a link: first closed with its number, one tap opens it and shows the card behind it. Never locked:
   a door opened early only says which day it was meant for. */
(function () {
  "use strict";
  var A = window.DailyApp, D = window.Daily, R = window.Render, Kit = window.Kit, t = Kit.t, el = A.el;

  // Before its day in this Advent (November, or December before the number) the card says so; it opens anyway.
  function early(nr, now) {
    var m = now.getUTCMonth(), d = now.getUTCDate();
    return m === 10 || (m === 11 && d < nr);
  }
  function show(doc) {
    var old = document.getElementById("door"); if (old) old.remove();
    var a = doc.col[0], b = doc.col[1], from = doc.by.length ? doc.by[doc.by.length - 1].n : doc.n;
    var box = el("div"), stage = el("div", "dstage"), cv = el("canvas"), shut = el("button", "dshut"), hint = el("p", "dhint", t("doorTap"));
    box.id = "door"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", t("doorOpen", { n: doc.nr }));
    box.style.setProperty("--da", a); box.style.setProperty("--db", b); box.style.setProperty("--dink", R.ink(b));
    box.appendChild(el("h2", "dtitle", doc.t || t("doorTitle")));
    if (from) box.appendChild(el("p", "dfrom", t("doorFrom", { n: from })));
    cv.width = 540; cv.height = 675; cv.setAttribute("aria-hidden", "true"); cv.hidden = true;
    shut.setAttribute("aria-label", t("doorOpen", { n: doc.nr }));
    ["l", "r"].forEach(function (s) { shut.appendChild(el("span", "dleaf " + s)); });
    shut.appendChild(el("b", "dnr", String(doc.nr)));
    [[8, 6], [80, 10], [22, 84], [86, 78], [46, 4], [10, 46]].forEach(function (p) { var f = el("i", "dflake", "❄"); f.style.left = p[0] + "%"; f.style.top = p[1] + "%"; shut.appendChild(f); });
    stage.appendChild(cv); stage.appendChild(shut); box.appendChild(stage); box.appendChild(hint);
    var after = el("div", "dafter"); after.hidden = true;
    after.appendChild(el("p", "dmsg", doc.x));
    if (early(doc.nr, new Date())) after.appendChild(el("p", "note", t("doorFor", { n: doc.nr })));
    var idea = D.byId("advent-tuer");   // a flavor without the Advent card still opens the door, just without "make your own"
    if (idea) after.appendChild(el("button", "btn hot", t("doorOwn"), function () {
      Kit.sfx.thud(); box.remove(); A.openEditor(D.docFromIdea(idea, A.me(), Kit.lang), { idea: idea });
    }));
    after.appendChild(el("button", "btn", t("doorOn"), function () { Kit.sfx.tap(); box.remove(); }));
    box.appendChild(after);
    shut.addEventListener("click", function () {
      if (box.classList.contains("open")) return;
      cv.hidden = false; R.draw(cv, doc, { me: A.me(), photo: null, peaks: null, x: {} });
      box.classList.add("open"); hint.hidden = true; after.hidden = false; shut.setAttribute("aria-hidden", "true"); shut.tabIndex = -1;
      Kit.sfx.win(); Kit.haptic(20);
      after.querySelector("button").focus({ preventScroll: true });
    });
    document.body.appendChild(box); shut.focus({ preventScroll: true });
    return box;
  }
  window.Door = { show: show, early: early };
})();
