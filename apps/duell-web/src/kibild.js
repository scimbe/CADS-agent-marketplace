/* KI-Bilder auf Wunsch: a picture for a card, a logo or the account picture, made by the server in at most 30 seconds and
   checked there before anybody sees it (CADS-DEMO-wrapper lib/duell-bild.mjs). The part "kibild", only on demand.

   window.KiBild
     can(kind)                    -> bool, from the last status this device saw (kind: card | logo | avatar)
     why(kind)                    -> the text why not ("" when it can)
     open({ use, doc, onPick })   the dialog: one sentence, a style, honest steps (sentence check, place in line, making,
                                  checking), the picture with "Nehmen", "Nochmal" (costs again, said so) and "Melden".
                                  onPick(url, ref) after "Nehmen"; ref "<id>.<jpg|png>" is what goes into a link (apply)
     apply(doc, use, ref)         sets doc.gi.p (card picture) or doc.gi.l (logo): only the id travels in a link
     logo(box, doc)               shows doc.gi.l small in the corner of a preview box (the core calls it, app.js picture)
     report(ref, reason)          reports a picture (POST /api/duell/report, kind "bild"); hidden here at once
     hidden(ref)                  this device reported it
     avatarRow(node)              the account picture in the account card (profile.js), with the reason when it cannot
     refresh()                    asks the server for the status again
   Only the typed sentence leaves the device, never a photo. A picture is loaded from the gallery server without cookies. */
(function (root) {
  "use strict";
  var STYLES = ["foto", "comic", "aquarell", "pixel", "sticker"], USES = ["card", "logo", "avatar"], REASONS = ["harm", "sex", "hate", "private", "wrong", "other"];
  var REF_RE = /^[A-Za-z0-9_-]{22}\.(jpg|png)$/, POLL = 700, TIMEOUT = 15000;
  var NO = ["sexual", "minors", "hate", "gore", "violence", "weapons", "real_person", "brand", "drugs", "youth", "contact"];

  /* What a server answer means for the dialog -> { key, vars } of a fixed text, or null when it is no error. */
  function errorText(status, b) {
    b = b || {};
    if (status === 202 || status === 200 && !b.error) return null;
    var e = b.error;
    if (e === "busy") return { key: "kb_busy", vars: { n: b.position || 1, s: b.etaS || 30, r: b.retryS || 30 } };
    if (e === "refused" || e === "blocked") { if (b.why === "crisis") return { key: "aiCrisis" }; return { key: NO.indexOf(b.reason) >= 0 ? "kb_no_" + b.reason : e === "blocked" ? "kb_blocked" : "kb_no_other" }; }
    var map = { login: "kb_login", age16: "kb_age16", "age-check-off": "kb_off", off: "kb_off", "check-off": "kb_off", quota: "kb_quota", credit: "kb_credit", "daily-cap": "kb_daycap", throttled: "kb_throttled", "account-paused": "kb_paused", "account-banned": "kb_paused" };
    return { key: map[e] || "kb_offline" };
  }
  /* A job's state -> the step shown: 0 sentence, 1 line, 2 making, 3 checking, 4 done, -1 failed. */
  function step(j) { return !j ? 0 : j.state === "queued" ? 1 : j.state === "generating" ? 2 : j.state === "checking" ? 3 : j.state === "done" ? 4 : -1; }
  function failText(err) { return err === "timeout" ? "kb_timeout" : err === "unsafe" ? "kb_unsafe" : "kb_failed"; }
  function refOf(url) { var m = /\/duell\/bild\/([A-Za-z0-9_-]{22}\.(?:jpg|png))$/.exec(String(url || "")); return m ? m[1] : ""; }
  function apply(doc, use, ref) { if (!doc || !REF_RE.test(ref)) return doc; doc.gi = Object.assign({}, doc.gi); doc.gi[use === "logo" ? "l" : "p"] = ref; return doc; }
  /* The report: kind "bild" and the picture's id; the seal when this device has it. Never the sentence. */
  function reportBody(ref, reason, seal) {
    if (!REF_RE.test(ref) || REASONS.indexOf(reason) < 0) return null;
    var id = ref.split(".")[0], b = { reason: reason, kind: "bild", consent: true, content: { bild: id }, option: { bild: id } };
    if (typeof seal === "string" && /^s2\.bild\.[0-9a-z]{1,12}\.[A-Za-z0-9_-]{32}$/.test(seal)) b.seal = seal;
    return b;
  }
  var api = { errorText: errorText, step: step, failText: failText, refOf: refOf, apply: apply, reportBody: reportBody, STYLES: STYLES, USES: USES };
  if (typeof window === "undefined") { if (typeof module !== "undefined" && module.exports) module.exports = api; return; }

  var Kit = root.Kit, t = Kit.t, C = root.DuellCore;
  var CSS = ".kbdlg{max-width:min(94vw,440px);border:3px solid #111;border-radius:8px;box-shadow:8px 8px 0 #111;padding:16px;background:#fff6dc;color:#111}" +
    ".kbdlg h2{margin:0 0 8px;font:400 24px/1.05 var(--disp);text-transform:uppercase}.kbdlg textarea{width:100%;box-sizing:border-box;min-height:64px;font:600 16px/1.3 var(--ui);border:3px solid #111;border-radius:6px;padding:8px}" +
    ".kbdlg .chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.kbdlg .row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.kbdlg .row button{flex:1 1 auto;min-height:48px}" +
    ".kbsteps{list-style:none;margin:10px 0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.kbsteps li{border:3px solid #111;border-radius:6px;background:#fff;padding:6px 4px;font:800 12px/1.15 var(--ui);text-align:center;opacity:.5}" +
    ".kbsteps li.on{opacity:1;background:#ffd400;box-shadow:3px 3px 0 #111}.kbsteps li.ok{opacity:1;background:#1b9e3a;color:#fff}" +
    ".kbpic{display:block;width:100%;max-height:52vh;object-fit:contain;border:3px solid #111;border-radius:6px;background:#fff}.kbmsg{font:700 15px/1.3 var(--ui);margin:8px 0}.kbmsg:empty{display:none}" +
    ".kblogo{position:absolute;right:6px;bottom:6px;width:22%;max-width:72px;aspect-ratio:1;object-fit:cover;border:2px solid #111;border-radius:6px;background:#fff;z-index:3;pointer-events:none}" +
    ".kbav{display:flex;gap:10px;align-items:center;margin:8px 0}.kbav img{width:64px;height:64px;border:3px solid #111;border-radius:50%;object-fit:cover;background:#fff}" +
    "@media (prefers-reduced-motion:reduce){.kbdlg *{transition:none!important;animation:none!important}}";
  function style() { if (document.getElementById("kibildcss")) return; var s = document.createElement("style"); s.id = "kibildcss"; s.textContent = CSS; document.head.appendChild(s); }
  function el(tag, cls, txt, fn) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (fn) e.addEventListener("click", fn); if (tag === "button") e.type = "button"; return e; }
  function api0() { return String(root.DUELL_API || C.DEFAULT_API); }
  function base() { return api0().replace(/\/(config|ai)$/, "") + "/bild"; }
  function origin() { return new URL(api0()).origin; }
  function urlOf(ref) { return REF_RE.test(ref) ? origin() + "/duell/bild/" + ref : ""; }
  function hidden(ref) { return (Kit.store.kbHidden || []).indexOf(String(ref || "").split(".")[0]) >= 0; }
  async function call(path, body) {
    if (navigator.onLine === false) throw new Error("offline");
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, TIMEOUT);
    try {
      var r = await fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), credentials: "same-origin", referrerPolicy: "no-referrer", signal: ctl.signal });
      var j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, json: j || {} };
    } finally { clearTimeout(tm); }
  }
  var st = Kit.store.kbSt || null;
  async function refresh() {
    try { var r = await call("/status", {}); if (r.status === 200) { st = r.json; Kit.store.kbSt = st; Kit.save(); } } catch (e) { /* keeps the last status */ }
    return st;
  }
  function can(kind) { return !!(st && st.on && st.login && st.can && st.can[kind]); }
  function why(kind) {
    if (can(kind)) return "";
    if (!st || !st.login) return t("kb_login");
    if (!st.on) return t("kb_off");
    var w = st.why && st.why[kind];
    return t(w === "credit" ? "kb_credit" : w === "quota" ? "kb_quota" : w === "age16" ? "kb_age16" : w === "daily-cap" ? "kb_daycap" : "kb_off");
  }
  function price(use) {
    if (!st) return "";
    if (use === "avatar") return t("kb_price_avatar", { n: st.credit || 0 });
    return st.free && st.free.left > 0 ? t("kb_price_free", { n: st.free.left }) : t("kb_price_credit", { n: st.credit || 0 });
  }

  /* The dialog. Every step on screen is a real state of the server's job; no invented progress. */
  function open(o) {
    o = o || {};
    var use = USES.indexOf(o.use) >= 0 ? o.use : "card";
    style();
    var dlg = el("dialog", "kbdlg"), h = el("h2", "", t("kb_title_" + use)); h.id = "kbdlgh"; dlg.setAttribute("aria-labelledby", "kbdlgh");
    var form = el("div"), msg = el("p", "kbmsg"), pr = el("p", "note kbprice", ""), area = el("textarea"), styles = el("div", "chips"), go = el("button", "btn kbgo", t("kb_make"));
    msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
    area.id = "kbtext"; area.maxLength = 200; area.placeholder = t("kb_ph"); area.setAttribute("aria-label", t("kb_ask"));
    var lab = el("label", "lbl", t("kb_ask")); lab.htmlFor = "kbtext";
    var style0 = use === "logo" ? "sticker" : "comic";
    styles.setAttribute("role", "radiogroup"); styles.setAttribute("aria-label", t("kb_style"));
    STYLES.forEach(function (s) {
      var b = el("button", "chip", t("kb_st_" + s), function () { style0 = s; Array.from(styles.children).forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); x.classList.toggle("on", x === b); }); });
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(s === style0)); b.classList.toggle("on", s === style0); b.dataset.s = s; styles.appendChild(b);
    });
    var steps = el("ol", "kbsteps"); steps.hidden = true;
    ["kb_s_check", "kb_s_line", "kb_s_make", "kb_s_test"].forEach(function (k) { steps.appendChild(el("li", "", t(k))); });
    var res = el("div", "kbres"); res.hidden = true;
    var x = el("button", "chip kbx", t("kb_close"), function () { dlg.close(); });
    var job = null, alive = true, last = null, busy = false;
    function show(n, line) {
      steps.hidden = n === null; if (n === null) return;
      Array.from(steps.children).forEach(function (li, i) { li.className = i < n ? "ok" : i === n ? "on" : ""; });
      if (n === 1 && line) steps.children[1].textContent = t("kb_s_line_n", { n: line.position || 1 });
    }
    function say(k, vars) { msg.textContent = k ? t(k, vars) : ""; }
    function refreshPrice() { pr.textContent = price(use); }
    function canNow() {
      if (can(use)) { go.disabled = false; form.hidden = false; refreshPrice(); return true; }
      say(null); msg.textContent = why(use); form.hidden = !(st && st.login); go.disabled = true; return false;
    }
    async function make() {
      if (busy) return;
      var text = area.value.replace(/\s+/g, " ").trim();
      if (text.length < 3) { area.focus(); return; }
      if (root.Ai && root.Ai.crisis && root.Ai.crisis(text)) { say("aiCrisis"); return; }   // never leaves the device
      busy = true; go.disabled = true; res.hidden = true; res.textContent = ""; say(null); show(0);
      x.textContent = t("kb_cancel");
      var r;
      try { r = await call("", { use: use, text: text, style: style0, lang: Kit.lang }); } catch (e) { r = null; }
      if (!alive) return;
      var err = r ? errorText(r.status, r.json) : { key: "kb_offline" };
      if (err) { done(); msg.textContent = t(err.key, err.vars); refresh().then(function () { if (alive) refreshPrice(); }); return; }
      job = r.json.job; show(step(r.json), r.json);
      while (alive && job) {
        await new Promise(function (ok) { setTimeout(ok, POLL); });
        if (!alive) return;
        var p; try { p = await call("/job", { job: job }); } catch (e) { p = null; }
        if (!p || p.status !== 200) { job = null; done(); say("kb_offline"); return; }
        var n = step(p.json);
        if (n === 4) { job = null; done(); result(p.json, text); break; }
        if (n === -1) { job = null; done(); say(failText(p.json.error)); break; }
        show(n, p.json);
        if (p.json.etaS) steps.title = t("kb_eta", { n: p.json.etaS });
      }
      refresh().then(function () { if (alive) refreshPrice(); });
    }
    function done() { busy = false; go.disabled = false; show(null); x.textContent = t("kb_close"); }
    function result(j, text) {
      var ref = refOf(j.url); if (!ref) { say("kb_failed"); return; }
      last = { ref: ref, seal: j.seal, url: urlOf(ref) };
      form.hidden = true; res.hidden = false; res.textContent = "";
      var img = el("img", "kbpic"); img.alt = t("kb_alt", { x: text }); img.crossOrigin = "anonymous"; img.referrerPolicy = "no-referrer"; img.src = last.url;
      var row = el("div", "row");
      var take = el("button", "btn kbtake", t("kb_take"), async function () {
        Kit.sfx.tap();
        var id = last.ref.split(".")[0];
        if (use === "avatar") { try { await call("/avatar", { id: id }); } catch (e) { /* the status shows it */ } refresh(); }
        else call("/keep", { id: id }).catch(function () {});
        var pick = o.onPick, u = last.url, rf = last.ref; dlg.close();
        if (typeof pick === "function") pick(u, rf);
      });
      var again = el("button", "chip kbagain", t("kb_again"), function () { res.hidden = true; form.hidden = false; say("kb_again_cost"); go.focus(); });
      var rep = el("button", "chip kbrep", t("kb_report"), function () { reportDialog(last, function () { res.textContent = ""; res.appendChild(el("p", "kbmsg", t("kb_reported"))); form.hidden = false; }); });
      row.appendChild(take); row.appendChild(again); row.appendChild(rep);
      res.appendChild(img); res.appendChild(row);
      take.focus();
    }
    go.addEventListener("click", make);
    area.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); make(); } });
    dlg.addEventListener("close", function () {
      alive = false;
      if (job) call("/cancel", { job: job }).catch(function () {});   // still in line: the unit comes back
      dlg.remove();
    });
    [lab, area, el("p", "lbl", t("kb_style")), styles, pr, go].forEach(function (n) { form.appendChild(n); });
    [h, form, steps, msg, res, el("p", "note", t("kb_note")), x].forEach(function (n) { dlg.appendChild(n); });
    document.body.appendChild(dlg); dlg.showModal();
    canNow();
    refresh().then(function () { if (alive && !busy && !last) canNow(); });
    if (!form.hidden) area.focus();
    return dlg;
  }

  function reportDialog(pic, after) {
    style();
    var d = el("dialog", "kbdlg kbrepdlg"), why = null, h = el("h2", "", t("kb_why")); h.id = "kbreph"; d.setAttribute("aria-labelledby", "kbreph");
    var chips = el("div", "chips"), m = el("p", "kbmsg"); chips.setAttribute("role", "radiogroup"); chips.setAttribute("aria-label", t("kb_why")); m.setAttribute("role", "status");
    var send = el("button", "btn", t("kb_send"), async function () {
      if (!why) return;
      send.disabled = true;
      var ok = await report(pic.ref, why, pic.seal);
      if (!ok) { m.textContent = t("kb_offline"); send.disabled = false; return; }
      d.close(); if (after) after();
    });
    send.disabled = true;
    REASONS.forEach(function (r) {
      var b = el("button", "chip", t("kb_why_" + r), function () { why = r; send.disabled = false; Array.from(chips.children).forEach(function (c) { c.setAttribute("aria-checked", String(c === b)); c.classList.toggle("on", c === b); }); });
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false"); chips.appendChild(b);
    });
    var row = el("div", "row"); row.appendChild(send); row.appendChild(el("button", "chip", t("kb_close"), function () { d.close(); }));
    [h, chips, row, m].forEach(function (n) { d.appendChild(n); });
    d.addEventListener("close", function () { d.remove(); });
    document.body.appendChild(d); d.showModal();
  }
  /* Hidden here at once (also when the server cannot be reached: then the report is not sent and the answer is false). */
  async function report(ref, reason, seal) {
    var body = reportBody(ref, reason, seal);
    if (!body) return false;
    var ok = false;
    try { var r = await root.Ai.post("/report", body); ok = r.status >= 200 && r.status < 300; } catch (e) { ok = false; }
    if (ok) {
      var s = Kit.store; s.kbHidden = (Array.isArray(s.kbHidden) ? s.kbHidden : []).concat(body.content.bild).slice(-200); Kit.save();
      Array.from(document.querySelectorAll("img")).forEach(function (i) { if (i.src && i.src.indexOf(body.content.bild) >= 0) { i.removeAttribute("src"); var b = i.closest(".pic"); if (b) b.classList.remove("pic"); } });
    }
    return ok;
  }
  function logo(box, doc) {
    if (!box) return;
    var old = box.querySelector(".kblogo"), ref = doc && doc.gi && doc.gi.l;
    if (!ref || !REF_RE.test(ref) || hidden(ref)) { if (old) old.remove(); return; }
    style();
    var img = old || el("img", "kblogo");
    img.alt = ""; img.crossOrigin = "anonymous"; img.referrerPolicy = "no-referrer";
    if (img.getAttribute("src") !== urlOf(ref)) img.src = urlOf(ref);
    if (!old) { if (getComputedStyle(box).position === "static") box.style.position = "relative"; box.appendChild(img); }
  }
  /* The account picture in the account card: the picture, and a button that says why when it cannot make one. */
  function avatarRow(node) {
    if (!node) return;
    style();
    node.textContent = "";
    var row = el("div", "kbav"), pic = el("img"), info = el("div"), note = el("p", "note kbavnote"), none = el("p", "note kbavnone", t("kb_avatar_none"));
    pic.alt = t("kb_avatar_h"); pic.crossOrigin = "anonymous"; pic.referrerPolicy = "no-referrer";
    var b = el("button", "btn kbavgo", t("kb_avatar_make"), function () {
      if (!can("avatar")) { note.textContent = why("avatar"); return; }
      open({ use: "avatar", onPick: function (u) { pic.src = u; pic.hidden = false; none.hidden = true; note.textContent = t("kb_avatar_set"); } });
    });
    function paint() {
      var u = st && st.avatar ? origin() + st.avatar : "";
      pic.hidden = !u || hidden(refOf(u)); if (u && !pic.hidden) pic.src = u;
      note.textContent = can("avatar") ? price("avatar") : st && st.login ? why("avatar") : "";
      none.hidden = !!u;
    }
    info.appendChild(el("p", "lbl", t("kb_avatar_h"))); info.appendChild(none); info.appendChild(b); info.appendChild(note);
    row.appendChild(pic); row.appendChild(info); node.appendChild(row);
    paint(); refresh().then(function () { if (node.isConnected) paint(); });
  }
  root.KiBild = { can: can, why: why, open: open, apply: apply, logo: logo, report: report, hidden: hidden, avatarRow: avatarRow, refresh: refresh, urlOf: urlOf };
})(typeof globalThis !== "undefined" ? globalThis : this);
