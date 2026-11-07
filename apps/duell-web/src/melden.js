/* Report a shared sheet ("KI melden"): a dialog says what goes out (the sheet's texts, its seal if it has one), asks for
   the reason, and only "Melden" sends it. A sheet goes out once from this device; the server limits the rest.
   A part of its own (scripts/build.js PARTS.melden); the core keeps the button and whether a sheet was reported
   (app.js reported, reportKey) and calls Melden.open(doc, link) once the part is there. */
(function (root) {
  "use strict";
  var Kit = root.Kit, t = Kit.t, A = root.DailyApp, el = A.el;
  function open(doc, link) {
    var dlg = el("dialog", "kidlg"), h = el("h2", "", t("kiAsk")), msg = el("p", "note"), row = el("div", "chips"), why = null;
    h.id = "kidlgh"; dlg.setAttribute("aria-labelledby", "kidlgh"); msg.setAttribute("role", "status");
    var reasons = el("div", "chips"); reasons.setAttribute("role", "radiogroup"); reasons.setAttribute("aria-label", t("kiWhy"));
    root.Ai.REASONS.forEach(function (r) {
      var b = el("button", "chip", t("kiWhy_" + r), function () { Kit.sfx.tap(); why = r; Array.from(reasons.children).forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); x.classList.toggle("on", x === b); }); send.disabled = false; });
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false"); reasons.appendChild(b);
    });
    var send = el("button", "btn", t("kiSend"), async function () {
      if (!why) return;
      send.disabled = true; msg.textContent = "…";
      var ok = await root.Ai.report(doc, why, link);
      msg.textContent = t(ok ? "kiThanks" : "kiOffline");
      if (ok) {
        var s = Kit.store; s.reported = (Array.isArray(s.reported) ? s.reported : []).concat(A.reportKey(doc)).slice(-50); Kit.save();
        send.hidden = true; no.textContent = t("kiClose"); var kr = document.getElementById("kireport"); kr.textContent = t("kiReported"); kr.disabled = true;
      } else send.disabled = false;
    });
    send.disabled = true;
    var no = el("button", "chip", t("kiCancel"), function () { dlg.close(); });
    dlg.addEventListener("close", function () { dlg.remove(); });
    row.appendChild(send); row.appendChild(no);
    [h, el("p", "", t("kiConsent")), el("p", "lbl", t("kiWhy")), reasons, row, msg].forEach(function (x) { dlg.appendChild(x); });
    document.body.appendChild(dlg); dlg.showModal();
  }
  root.Melden = { open: open };
})(window);
