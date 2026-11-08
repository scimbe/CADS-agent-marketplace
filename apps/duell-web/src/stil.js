/* My style (the shelf behind the figure button): dice, name, figure, colours, sticker set, "Anmelden / Registrieren",
   font size, my defaults, licences. A part of its own (scripts/build.js PARTS.stil; app.js asks for konto first); the core opens the shelf
   and calls StilUI.fill(body) once the part is there (app.js openStyle). Its words (texts) come with the part. */
(function (root) {
  "use strict";
  var C = root.DuellCore, D = root.Daily, Kit = root.Kit, t = Kit.t, A = root.DailyApp, S = A.style, el = A.el;
  var $ = function (id) { return document.getElementById(id); };
  // me() every time: a sync replaces the profile object while the shelf may stay open (app.js profileChanged).
  function me() { return A.me(); }
  function fill(b) {
    // The dice for my style: figure, colours and sticker set from a seed (name + roll), on the device, no AI.
    b.appendChild(el("button", "chip", "🎲 " + t("diceGo"), function () {
      var m = me(), r = S.seeded("me|" + m.nick + "|" + S.roll("me|" + m.nick)), pick = function (n) { return Math.floor(r() * n); }, sets = Object.keys(D.SETS);
      Kit.sfx.pop(); m.emoji = S.EMOJI[pick(S.EMOJI.length)]; m.colors = S.PAIRS[pick(S.PAIRS.length)].slice(); m.set = sets[pick(sets.length)];
      S.save(); $("me").textContent = m.emoji; S.ink(m.colors[0], m.colors[1]); S.open();
    }));
    b.appendChild(el("label", "lbl", t("nick")));
    var f = el("input", "field"); f.value = me().nick; f.maxLength = 16; f.setAttribute("aria-label", t("nick"));
    f.addEventListener("input", function () { var v = C.sanitizeName(f.value); if (f.value.trim() && !v) { Kit.toast(t("filter")); return; } me().nick = v; S.save(); });
    b.appendChild(f); b.appendChild(el("p", "note", t("nickNote")));
    b.appendChild(el("label", "lbl", t("emoji")));
    A.chips(b, S.EMOJI.map(function (e) { return { v: e, l: e }; }), me().emoji, function (v) { me().emoji = v; S.save(); $("me").textContent = v; }, "em");
    b.appendChild(el("label", "lbl", t("colors")));
    A.colors(b, function () { return me().colors; }, function (c) { me().colors = c; S.save(); S.ink(c[0], c[1]); });
    b.appendChild(el("label", "lbl", t("set")));
    A.chips(b, Object.keys(D.SETS).map(function (s) { return { v: s, l: D.SETS[s][0] + " " + t("set_" + s) }; }), me().set, function (v) { me().set = v; S.save(); });
    var acHold = el("div"); b.appendChild(acHold); S.konto(function () { root.Profile.section(acHold, el); });
    b.appendChild(el("label", "lbl", t("fs_title")));
    A.chips(b, ["n", "g", "sg"].map(function (v) { return { v: v, l: t("fs_" + v) }; }), Kit.fs, function (v) { Kit.setFs(v); S.fit(); }, "fs");
    // the plain-language switch comes with the part direkt (editor E1)
    var ez = el("div"); b.appendChild(ez); root.Parts.need("direkt").then(function () { root.Direkt.style(ez); }, function () {});
    // Card numbers (src/stat.js): the same switch as under "Wer sieht was?" (stimme-ui.js row); none in a flavor without them.
    if (!(root.DailyFlavor && root.DailyFlavor.stat === false)) {
      var so = el("button", "chip statoff", t("set_stat"), function () { Kit.sfx.tap(); if (Kit.store.statOff) delete Kit.store.statOff; else Kit.store.statOff = true; Kit.save(); so.setAttribute("aria-pressed", String(!!Kit.store.statOff)); });
      so.setAttribute("aria-pressed", String(!!Kit.store.statOff)); b.appendChild(so); b.appendChild(el("p", "note", t("set_statnote")));
    }
    b.appendChild(el("label", "lbl", t("pf_title")));
    var pf = el("div", "pfbox"); b.appendChild(pf); prefs(pf);
    b.appendChild(el("p", "note", t("aiPicNote")));
    // Legal pages: static pages of the gallery (scripts/build.js, /duell/<page>); offline a friendly line with the address
    var lg = el("a", "btn", t("legal"), function (e) { if (!navigator.onLine) { e.preventDefault(); root.Kit.toast(t("legal_off", { u: lg.href })); } });
    lg.href = "https://demos-34a13a96.bunsenbrenner.org/duell/" + (root.Kit.lang === "en" ? "en/" : "") + "impressum"; lg.target = "_blank"; lg.rel = "noopener";
    b.appendChild(lg);
    b.appendChild(el("button", "btn", t("licenses"), function () { root.Parts.use("licenses", function () { var l = el("pre", "note", root.DailyLicenses); l.style.whiteSpace = "pre-wrap"; b.textContent = ""; b.appendChild(l); }).catch(function () {}); }));
  }
  // My defaults (daily.js): the ones set stand on top as chips with ✕; below, what can be set. Only on this device.
  function prefs(box) {
    var f = me().pref || {}, P = D.PREF;
    function put(g) { var m = me(); m.pref = D.sanitizePref(g); if (!Object.keys(m.pref).length) delete m.pref; S.save(); prefs(box); }
    function edit(fn) { var g = JSON.parse(JSON.stringify(me().pref || {})); fn(g); put(g); }
    function group(label, items, isOn, pick) {
      box.appendChild(el("p", "lbl", label));
      var r = el("div", "chips");
      items.forEach(function (it) { var c = el("button", "chip" + (isOn(it.v) ? " on" : ""), it.l, function () { Kit.sfx.tap(); edit(function (g) { pick(g, it.v); }); }); c.setAttribute("aria-pressed", String(isOn(it.v))); r.appendChild(c); });
      box.appendChild(r);
    }
    box.textContent = "";
    var on = el("div", "chips"), list = D.prefChips(me(), Kit.lang);
    if (!list.length) on.appendChild(el("p", "note", t("pf_none")));
    list.forEach(function (c) { var x = el("button", "chip on", c.l + " ✕", function () { Kit.sfx.tap(); put(D.dropPref(me(), c.k, c.v)); }); on.appendChild(x); });
    box.appendChild(on); box.appendChild(el("p", "note", t("pf_note")));
    if (!(root.DailyFlavor && root.DailyFlavor.adult)) group(t("pf_age"), P.AGES.map(function (a) { return { v: a, l: t("pf_age_" + a) }; }), function (v) { return f.age === v; }, function (g, v) { if (g.age === v) delete g.age; else g.age = v; });
    group(t("pf_hh"), [1, 2, 3, 4, 5, 6].map(function (n) { return { v: n, l: n === 6 ? "6+" : String(n) }; }), function (v) { return f.hh === v; }, function (g, v) { if (g.hh === v) delete g.hh; else g.hh = v; });
    if (D.dietOk(me())) group(t("pf_diet"), P.DIETS.map(function (d) { return { v: d, l: t("pf_diet_" + d) }; }), function (v) { return f.diet === v; }, function (g, v) { if (g.diet === v) delete g.diet; else g.diet = v; });
    else box.appendChild(el("p", "note", t("pf_diet_later")));
    group(t("pf_no"), P.NOTIMES.map(function (k) { return { v: k, l: t("pf_no_" + k) }; }), function (v) { return (f.no || []).indexOf(v) >= 0; }, function (g, v) { var n = g.no || []; g.no = n.indexOf(v) >= 0 ? n.filter(function (x) { return x !== v; }) : n.concat([v]); });
    if (D.adult(me())) {
      box.appendChild(el("label", "lbl", t("pf_pp")));
      var pp = el("input", "field"); pp.value = f.pp || ""; pp.maxLength = 20; pp.autocomplete = "off"; pp.setAttribute("aria-label", t("pf_pp")); pp.placeholder = "paypal.me/…";
      pp.addEventListener("change", function () { var v = pp.value.trim().replace(/^(https?:\/\/)?(www\.)?paypal\.me\//i, ""); if (v && !/^[A-Za-z0-9]{1,20}$/.test(v)) { Kit.toast(t("filter")); return; } edit(function (g) { if (v) g.pp = v; else delete g.pp; }); });
      box.appendChild(pp);
    } else box.appendChild(el("p", "note", t("pf_pp_later")));
  }
  root.StilUI = { fill: fill };
})(window);
