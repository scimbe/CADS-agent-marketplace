/* My Daily Idea: "Create your own card" (freie Karte, W2), the part "erschaffen". One sentence becomes a card: the server's
   AI kind "karte" (login account only, 16 and older, its own pot of free cards) checks the sentence, makes the card and
   checks it again (CADS-DEMO-wrapper lib/duell-karte.mjs). Here: the form, an honest count, a preview with the AI badge,
   then "Übernehmen" (the editor, own:true, the card is final and never made again) or "Verwerfen" (the unit comes back).
   The typed text is checked for a crisis on the device first (ai.js CRISIS_KINDS). Only the text leaves the device, never
   a photo: a meme gets its captions, the photo is added in the editor. No count of views, no streak, no countdown. */
(function (root) {
  "use strict";
  var ARTS = ["card", "meme", "game", "sound", "quiz", "faehigkeit"];
  // what a free card may come back as: every kind a link carries, never arcade (played only, never sent)
  var KINDS = ["card", "photo", "game", "sound", "turn", "duel", "quest", "table"];
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
    A = root.DailyApp; Kit = root.Kit; t = Kit.t; el = A.el; D = root.Daily;
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
    t(state.art === "card" ? "create_ex" : "create_ex_" + state.art).split("|").forEach(function (s) { ex.appendChild(el("button", "chip", s, function () { ta.value = s; ta.focus(); })); });
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
        if (!doc || KINDS.indexOf(doc.k) < 0 || !ki || !ki.s) return false;
        return new Promise(function (done) {
          res.textContent = "";
          res.appendChild(preview(doc));
          var row = el("div", "row");
          row.appendChild(el("button", "btn hot", t("create_take"), function () {
            Kit.sfx.pop();
            // with the deck (W4) the server seals the frozen card itself (ki with the creator tag o); else the page's own hash
            var sk = opt.ki && opt.ki.k === "karte" ? D.sanitizeKi(opt.ki) : null;
            var d = JSON.parse(JSON.stringify(doc)); d.ki = sk && sk.s ? sk : { k: "karte", s: ki.s, h: ki.h };
            // first the receipt is settled as taken (ai.js, in the promise's then), only then the editor: openEditor drops every
            // receipt still open, and this one would be given back instead of booked
            done(true); setTimeout(function () { A.openEditor(d, { own: true, idea: d.i ? D.byId(d.i) : null }); }, 0);
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
    return go;
  }

  // What a card that is no plain card shows in the preview: its game, beat, questions or the existing card it uses.
  function lines(doc) {
    if (doc.k === "game" && doc.g) return [doc.g.emoji + " " + doc.g.title, (doc.g.route || []).map(function (r) { return r.e; }).join(" → ")];
    if (doc.k === "sound") return [doc.x + " · " + doc.bpm + " BPM"].concat(doc.ly || []);
    if (doc.k === "turn" && doc.pk) return [t("create_questions", { n: doc.pk.q.length }), doc.pk.q[0][0]];
    var idea = doc.i ? D.byId(doc.i) : null, L = idea ? idea[Kit.lang] || idea.de : null;
    return [doc.s || "", L ? t("create_uses", { x: D.plainTitle(L.t) }) : ""].filter(Boolean);
  }
  // The card as a small sheet in its colours, with its stickers and the badge. A meme shows where the own photo will go.
  function preview(doc) {
    var plain = doc.k === "card" || doc.k === "photo";
    var box = el("figure", "createpv"), txt = doc.k === "photo" ? [doc.x, doc.y].filter(Boolean).join(" … ") : plain ? doc.x : lines(doc).join(". ");
    box.style.background = doc.col[0]; box.style.color = doc.col[1];
    box.setAttribute("role", "img"); box.setAttribute("aria-label", [doc.t, txt, t("kiBadgeL")].filter(Boolean).join(". "));
    if (doc.t) box.appendChild(el("b", "createpv-t", doc.t));
    if (doc.k === "photo") {
      box.appendChild(el("span", "createpv-x", doc.x || ""));
      box.appendChild(el("span", "createpv-photo", t("create_photo")));
      box.appendChild(el("span", "createpv-x", doc.y || ""));
    } else if (plain) box.appendChild(el("span", "createpv-x", doc.x));
    else lines(doc).forEach(function (l) { box.appendChild(el("span", "createpv-x", l)); });
    if (doc.sk && doc.sk.length) box.appendChild(el("span", "createpv-sk", doc.sk.map(function (s) { return s.e; }).join(" ")));
    box.appendChild(el("span", "createpv-ki", t("kiBadgeL")));
    return box;
  }

  root.CreateUI = { open: open, preview: preview };
})(typeof globalThis !== "undefined" ? globalThis : this);
