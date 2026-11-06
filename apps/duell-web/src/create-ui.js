/* My Daily Idea: "Create your own card" (freie Karte, W2), the part "erschaffen". One sentence becomes a card: the server's
   AI kind "karte" (login account only, 16 and older, its own pot of free cards) checks the sentence, makes the card and
   checks it again (CADS-DEMO-wrapper lib/duell-karte.mjs). Here: the form, an honest count, a preview with the AI badge,
   then "Übernehmen" (the editor, own:true, the card is final and never made again) or "Verwerfen" (the unit comes back).
   The typed text is checked for a crisis on the device first (ai.js CRISIS_KINDS). Only the text leaves the device, never
   a photo: a meme gets its captions, the photo is added in the editor. No count of views, no streak, no countdown. */
(function (root) {
  "use strict";
  var ARTS = ["card", "meme"];
  // the kind of doc each art comes back as: anything else is refused and given back, never shown or booked
  var KIND_OF = { card: "card", meme: "photo" };
  // the preview's own look, part of this part and not of the core (scripts/build.js budget)
  var CSS = ".createpv{position:relative;margin:10px 0;padding:18px 16px 30px;border:3px solid #111;border-radius:6px;display:flex;flex-direction:column;gap:8px;min-height:150px;box-shadow:0 5px 0 #111}.createpv-t{font:900 20px/1.1 var(--disp);text-transform:uppercase}.createpv-x{font:800 18px/1.25 var(--ui)}.createpv-sk{font-size:26px}.createpv-photo{border:2px dashed currentColor;padding:18px 8px;font:700 13px/1.3 var(--ui);text-align:center}.createpv-ki{position:absolute;right:8px;bottom:6px;background:#111;color:#fff;font:800 11px/1 var(--ui);padding:4px 6px;border-radius:4px}";
  function style() { if (document.getElementById("createcss")) return; var s = document.createElement("style"); s.id = "createcss"; s.textContent = CSS; document.head.appendChild(s); }
  var A, Kit, t, el, D;
  var state = { art: "card", age: "", meter: null, account: false, net: true };

  function line(m) {
    if (!m) return "";
    return m.remaining > 0 ? t("create_left", { n: m.remaining, m: m.size }) : t("create_none", { m: m.size });
  }
  // The pot of this account: /status answers it only with a login (meter "create"); without one, there is nothing to count.
  async function status() {
    try {
      var r = await root.Ai.post("/status", { device: Kit.store.aiDev || undefined });
      state.net = r.status > 0 && r.status < 500;
      state.account = !!(r.json && r.json.create);
      state.meter = state.account ? r.json.create : null;
    } catch (e) { state.net = false; state.account = false; state.meter = null; }   // offline: said as such, not "sign in"
  }
  function ageOf() {
    var a = (A.me().pref || {}).age;
    return a === "u18" || a === "a18" || a === "u16" ? a : state.age;
  }
  function chipRow(list, now, label, pick) {
    var row = el("div", "chips"); row.setAttribute("role", "group"); row.setAttribute("aria-label", label);
    list.forEach(function (c) {
      var b = el("button", "chip" + (c[0] === now ? " on" : ""), c[1], function () { Kit.sfx.tap(); pick(c[0]); });
      b.setAttribute("aria-pressed", String(c[0] === now)); row.appendChild(b);
    });
    return row;
  }

  function open() {
    A = root.DailyApp; Kit = root.Kit; t = Kit.t; el = A.el; D = root.Daily; style();
    A.shelf(t("create_title"), function (b) { b.appendChild(el("p", "note", "…")); status().then(function () { fill(b); }); });
  }

  function fill(b) {
    b.textContent = "";
    b.classList.add("create");
    if (!state.net) { b.appendChild(el("p", "note", t("aiNet"))); return; }
    // without an account: the way to sign in (the app shells send no cookie, so there it is the browser)
    if (!state.account) {
      b.appendChild(el("p", "note", t("create_login_h", { m: 5 })));
      if (root.DuellHost) { b.appendChild(el("p", "note", t("create_app"))); return; }
      var a = el("a", "btn hot", t("create_login")); a.href = "/auth/login?return=" + encodeURIComponent("/duell"); b.appendChild(a);
      return;
    }
    // 16 and older, as the profile says or as asked here (only for this request, nothing is stored)
    var age = ageOf();
    if (!age) {
      b.appendChild(el("p", "note", t("create_age")));
      b.appendChild(chipRow([["u16", t("create_age_u16")], ["u18", t("create_age_u18")], ["a18", t("create_age_a18")]], "", t("create_age"), function (v) { state.age = v; fill(b); }));
      return;
    }
    if (age === "u16") { b.appendChild(el("p", "note", t("create_young"))); return; }

    b.appendChild(el("p", "note", t("create_h")));
    b.appendChild(el("p", "note", t("create_art")));
    b.appendChild(chipRow(ARTS.map(function (k) { return [k, t("create_art_" + k)]; }), state.art, t("create_art"), function (v) { state.art = v; fill(b); }));
    var ta = el("textarea", "field");
    ta.id = "createtext"; ta.rows = 3; ta.maxLength = 200; ta.placeholder = t("create_ph"); ta.setAttribute("aria-label", t("create_label"));
    b.appendChild(ta);
    var ex = el("div", "chips");
    t(state.art === "meme" ? "create_ex_meme" : "create_ex").split("|").forEach(function (s) { ex.appendChild(el("button", "chip", s, function () { ta.value = s; ta.focus(); })); });
    b.appendChild(ex);
    var left = el("p", "aicount create-left", line(state.meter)); left.setAttribute("aria-live", "polite");
    b.appendChild(left);
    b.appendChild(el("p", "note", t("create_rules")));
    if (state.meter && state.meter.remaining <= 0) return;
    if (state.meter && state.meter.paused) { b.appendChild(el("p", "note", t("create_paused"))); return; }

    var go = root.Ai.block(b, {
      kind: "karte", label: t("create_go"), el: el, noteLast: true,
      raw: function () { return ta.value; },
      input: function () { var s = String(ta.value || "").trim(); return s.length >= 3 ? { text: s.slice(0, 200), art: state.art, age: age } : null; },
      wall: function () { left.textContent = line(state.meter); },
      show: function () { return ""; },
      apply: function () { return false; },
      // one card comes back: shown as a preview; the promise says whether it was taken (true) or thrown away (false)
      auto: function (opt, ki, res) {
        var doc = opt && opt.doc ? D.sanitizeDoc(opt.doc) : null;
        // what came back must be what was asked for (art and kind); otherwise said so, given back, nothing booked
        if (!doc || !opt || opt.art !== state.art || doc.k !== KIND_OF[state.art] || !ki || !ki.s) { res.textContent = ""; res.appendChild(el("p", "note aistate", t("create_bad"))); return false; }
        return new Promise(function (done) {
          res.textContent = "";
          var pv = preview(doc); pv.tabIndex = -1; res.appendChild(pv);
          try { pv.focus(); } catch (e) {}
          var row = el("div", "row");
          row.appendChild(el("button", "btn hot", t("create_take"), function () {
            Kit.sfx.pop();
            var d = JSON.parse(JSON.stringify(doc)); d.ki = { k: "karte", s: ki.s, h: ki.h };
            // first the receipt is settled as taken (ai.js, in the promise's then), only then the editor: openEditor drops every
            // receipt still open, and this one would be given back instead of booked
            done(true); setTimeout(function () { A.openEditor(d, { own: true }); }, 0);
          }));
          row.appendChild(el("button", "btn", t("create_drop"), function () {
            Kit.sfx.tap(); res.textContent = ""; var was = state.meter ? state.meter.remaining : 0;
            done(false);
            // the discard is sent in ai.js; the count is asked again after it. A discard past the limit gives nothing back: said so.
            setTimeout(function () { status().then(function () { left.textContent = line(state.meter); if (state.meter && state.meter.remaining <= was) res.appendChild(el("p", "note", t("create_norefund"))); }); }, 700);
          }));
          res.appendChild(row);
          status().then(function () { left.textContent = line(state.meter); });
        });
      },
    });
    // the count of ai.js is the weekly free pot of the other AI actions; this card has its own (create-left above)
    var other = b.querySelector(".aibox .aicount"); if (other) other.hidden = true;
    var region = b.querySelector(".aibox .chips:last-child"); if (region) region.setAttribute("aria-live", "polite");   // the preview is announced
    return go;
  }

  // The card as a small sheet in its colours, with its stickers and the badge. A meme shows where the own photo will go.
  // WCAG contrast of two #rrggbb colours
  function contrast(a, b) {
    var L = function (h) { var v = [1, 3, 5].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    var x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function preview(doc) {
    var box = el("figure", "createpv"), txt = doc.k === "photo" ? [doc.x, doc.y].filter(Boolean).join(" … ") : doc.x;
    // the model's colour pair as it is when the text stays readable (AA for large text), else the print look
    var ok = contrast(doc.col[0], doc.col[1]) >= 3;
    box.style.background = ok ? doc.col[0] : "#ffd400"; box.style.color = ok ? doc.col[1] : "#111111";
    box.setAttribute("role", "img"); box.setAttribute("aria-label", [doc.t, txt, t("kiBadgeL")].filter(Boolean).join(". "));
    if (doc.t) box.appendChild(el("b", "createpv-t", doc.t));
    if (doc.k === "photo") {
      box.appendChild(el("span", "createpv-x", doc.x || ""));
      box.appendChild(el("span", "createpv-photo", t("create_photo")));
      box.appendChild(el("span", "createpv-x", doc.y || ""));
    } else box.appendChild(el("span", "createpv-x", doc.x));
    if (doc.sk && doc.sk.length) box.appendChild(el("span", "createpv-sk", doc.sk.map(function (s) { return s.e; }).join(" ")));
    box.appendChild(el("span", "createpv-ki", t("kiBadgeL")));
    return box;
  }

  root.CreateUI = { open: open, preview: preview };
})(typeof globalThis !== "undefined" ? globalThis : this);
