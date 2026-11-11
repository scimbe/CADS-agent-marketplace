/* My style (the shelf behind the figure button). From the top: a live preview of my cards with "Surprise me", the account
   card (part konto), name, emoji, colours, stickers, reading (font size, plain language), then two closed sections: my
   defaults, and "Konto & Daten" (the account's details, card statistics, AI picture note, licences). Choices are radio
   groups (arrow keys, one tab stop), the preview follows every change at once. Wide screens: the preview and the account
   on the left, the choices on the right. A part of its own (scripts/build.js PARTS.stil; app.js asks for konto first); the
   core opens the shelf and calls StilUI.fill(body) once the part is there (app.js openStyle). Its words and styles come with it. */
(function (root) {
  "use strict";
  var C = root.DuellCore, D = root.Daily, Kit = root.Kit, t = Kit.t, A = root.DailyApp, S = A.style, el = A.el, R = root.Render;
  var $ = function (id) { return document.getElementById(id); };
  // me() every time: a sync replaces the profile object while the shelf may stay open (app.js profileChanged).
  function me() { return A.me(); }
  var css = document.createElement("style");
  // The look of the approved design (Mein Stil neu): cream page, ink #17140F, yellow #F9D84A, red #B3321F for links, hard
  // shadows, radii 16-22 px, Anton for headings, Inter where the device has it (not embedded: the core stays as it is).
  // The page body is always light (also in a flavor's dark tokens, e.g. Business): its own background, color-scheme light.
  css.textContent = "#shelf:has(.stil),#shelf #shbody:has(.stil){background:#fbf5dd;color:#17140f}#shbody .stil{--sk:#17140f;--sy:#f9d84a;--sr:#b3321f;--sm:#4a4436;max-width:720px;margin:0 auto;color:var(--sk);font-family:Inter,var(--ui);color-scheme:light}" +
    ".stil .lbl{margin:18px 0 8px;font-weight:700;font-size:1rem;color:var(--sk)}.stil .note{font-size:.875rem;line-height:1.45;font-weight:500;color:var(--sm)}.stil h3.lbl{font:400 1.375rem/1.05 var(--disp);text-transform:uppercase;letter-spacing:.3px}.stil .accard>.lbl{margin-top:0}" +
    ".stpvw{margin:0 0 18px}.stpvw .lbl{margin-top:4px}.stpv{position:relative;height:160px;border:3px solid var(--sk);border-radius:22px;overflow:hidden;box-shadow:5px 5px 0 var(--sk);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}" +
    ".stpv .stem{font-size:52px;line-height:1}.stpv .stnm{font:400 1.6rem/1.1 var(--disp);text-transform:uppercase;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".stpv .stbar{position:absolute;left:0;right:0;bottom:0;height:16px}.stpv .stsk{position:absolute;font-size:26px;line-height:1}.stpv .k0{left:14px;top:12px;transform:rotate(-12deg)}.stpv .k1{right:16px;top:14px;transform:rotate(10deg)}.stpv .k2{left:18px;bottom:24px;transform:rotate(8deg)}.stpv .k3{right:18px;bottom:26px;transform:rotate(-8deg)}" +
    ".stdice{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;margin-top:12px;border:2px solid var(--sk);border-radius:16px;background:#fff;color:var(--sk);font:700 1rem Inter,var(--ui)}.stdice svg{flex:none}" +
    ".strg{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 4px;padding:3px}.strg [role=radio]{position:relative;min-width:48px;min-height:48px;border:2px solid var(--sk);border-radius:16px;background:#fff;color:var(--sk);font:600 .94rem Inter,var(--ui);padding:0 14px}" +
    ".strg [aria-checked=true],.stread .chip.on{background:var(--sy);color:var(--sk);border-color:var(--sk);box-shadow:6px 6px 0 var(--sk)}.strg{padding:3px 9px 9px 3px}.strg .stemo{width:50px;height:50px;padding:0;font-size:28px}" +
    ".strg .stsw{width:48px;height:48px;padding:0;border-radius:50%;overflow:hidden}.strg .stsw i{position:absolute;inset:0 0 50% 0}.strg .stsw[aria-checked=true]{box-shadow:0 0 0 3px #fbf5dd,0 0 0 6px var(--sk)}.strg .stsw[aria-checked=true]::after{content:'✓';position:absolute;inset:0;display:grid;place-items:center;color:#17140f;font:900 20px var(--ui);text-shadow:0 0 3px #fff,0 0 3px #fff}" +
    ".strg .stset{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;padding:6px 14px;text-align:left}.strg .stset small{font-size:1rem;letter-spacing:2px}" +
    ".stread{margin-top:22px;padding:14px 16px 6px;border:2px solid var(--sk);border-radius:20px;background:#fff}.stread h3.lbl{margin:0 0 4px;font-size:1.125rem}.stread .lbl{margin:10px 0 6px;font-size:.94rem}.stread .chips,.stread .strg{margin-bottom:6px}.stread .chip{min-height:44px;min-width:56px;border:2px solid var(--sk);border-radius:16px;background:#fff;color:var(--sk);font:600 .94rem Inter,var(--ui);outline:0}.stread .chips{gap:10px;padding:0 6px 6px 0}.stread .note{font-size:.8125rem}" +
    "" +
    ".stfs{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;margin:0 0 18px}.stfs .lbl{margin:0;display:flex;align-items:center;gap:6px}.stfs .staa{font:400 1.375rem/1 var(--disp)}.stfs .strg{margin:0;padding-bottom:6px}.stfs .chip{min-height:44px}" +
    ".stemrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.stemrow .strg{margin:0;flex:0 1 auto;min-width:0}.stmore{min-height:52px;padding:0 16px;border:2px solid var(--sk);border-radius:16px;background:transparent;color:var(--sk);font:600 .94rem Inter,var(--ui)}" +
    ".stil details{margin:10px 0}.stil summary{min-height:48px;display:flex;align-items:center;gap:10px;font-weight:700;cursor:pointer;list-style:none}.stil summary::-webkit-details-marker{display:none}.stil summary svg{flex:none;transition:transform .15s}.stil details[open]>summary svg{transform:rotate(90deg)}" +
    ".stil .stsec{border-top:2px dashed #c9c0a3;margin-top:20px;padding-top:4px}.stil .stsec>summary{font-size:1.06rem;flex-wrap:wrap;row-gap:0;padding:6px 0}.stil .stsec>summary small{flex-basis:100%;padding-left:30px;font-weight:500;font-size:.875rem;color:var(--sm)}" +
    ".stcol{display:flex;flex-wrap:wrap;gap:16px;margin:4px 0}.stcol label{display:flex;align-items:center;gap:8px;font-weight:600;min-height:48px}.stcol input{width:56px;height:44px;padding:0;border:2px solid var(--sk);border-radius:12px;background:#fff}" +
    ".stil .field{background:#fff;color:var(--sk);font:500 1.06rem Inter,var(--ui);border:2px solid var(--sk);border-radius:16px;min-height:52px;padding:10px 14px}.stil .field::placeholder{color:#6b6352}.stil .chip{border-radius:16px;border-width:2px}" +
    "@media (min-width:600px){#shelf:has(.stil){left:0;right:0;width:auto;margin-left:0}#shbody .stil{padding:0 8px}}" +
    "@media (min-width:900px){#shbody .stil{max-width:1040px;display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);column-gap:36px;align-items:start}.stleft{position:sticky;top:0}.stpv{height:210px}.stpv .stem{font-size:68px}}" +
    "@media (prefers-reduced-motion:no-preference){.stpv.pop .stem{animation:stpop .3s ease-out}@keyframes stpop{40%{transform:scale(1.25)}}}@media (prefers-reduced-motion:reduce){.stil summary svg{transition:none}}";
  document.head.appendChild(css);

  // Colour names from the part direkt (src/editmodel.js colorName, its words dk_) when it is there, else "Farbpaar n".
  function pairName(c) { var M = root.EditModel, i = S.PAIRS.map(String).indexOf(String(c)); var n = function (x) { return t("dk_c_" + M.colorName(x)); }; return M ? t("dk_cols", { a: n(c[0]), b: n(c[1]) }) : i >= 0 ? t("ms_pair", { n: i + 1 }) : c.join(" "); }
  function setName(s) { return t("set_" + s); }
  // Stroke icons (as in the design), always aria-hidden: the words carry the meaning.
  function icon(d, n) {
    var NS = "http://www.w3.org/2000/svg", g = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    g.setAttribute("width", n || 22); g.setAttribute("height", n || 22); g.setAttribute("viewBox", "0 0 24 24"); g.setAttribute("fill", "none"); g.setAttribute("stroke", "currentColor");
    g.setAttribute("stroke-width", "2.2"); g.setAttribute("stroke-linecap", "round"); g.setAttribute("stroke-linejoin", "round"); g.setAttribute("aria-hidden", "true"); p.setAttribute("d", d); g.appendChild(p); return g;
  }
  var DICE = "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01", CHEV = "M9 6l6 6-6 6";
  // Open sections stay open while My style is open: a sync redraws My style (app.js profileChanged), the place stays.
  // A new opening starts closed again: the shelf going away forgets them.
  var opened = {};
  new MutationObserver(function () { if ($("shelf").hidden) opened = {}; }).observe($("shelf"), { attributes: true, attributeFilter: ["hidden"] });
  function keep(d, id) { d.id = id; d.open = !!opened[id]; d.addEventListener("toggle", function () { opened[id] = d.open; }); return d; }
  function summary(text) { var s = el("summary"); s.appendChild(icon(CHEV, 20)); s.appendChild(el("span", "", text)); return s; }

  // A radio group: one tab stop, arrows move and choose (as native radio buttons do), Space/Enter choose too.
  // items: [{ v, l (text), a (accessible name, optional), c (class), paint(button) }]. -> { box, set(v), items }
  var gid = 0;
  function radios(label, items, cur, pick, cls) {
    var id = "strg" + (++gid), lab = el("p", "lbl", label), box = el("div", "strg" + (cls ? " " + cls : ""));
    lab.id = id; box.setAttribute("role", "radiogroup"); box.setAttribute("aria-labelledby", id);
    var api = { label: lab, box: box, set: set };
    function btns() { return Array.from(box.querySelectorAll("[role=radio]")).filter(function (b) { return !b.hidden; }); }
    function set(v) {
      var all = Array.from(box.querySelectorAll("[role=radio]")), hit = all.some(function (b) { return b.dataset.v === String(v); });
      all.forEach(function (b, i) { var on = hit ? b.dataset.v === String(v) : i === 0; b.setAttribute("aria-checked", String(hit && on)); b.tabIndex = on ? 0 : -1; });
    }
    function choose(b) { Kit.sfx.tap(); var it = items[+b.dataset.i]; set(it.v); pick(it.v); }
    items.forEach(function (it, i) {
      var b = el("button", it.c || "", it.l, function () { choose(b); });
      b.setAttribute("role", "radio"); b.dataset.v = String(it.v); b.dataset.i = i;
      if (it.a) b.setAttribute("aria-label", it.a);
      if (it.paint) it.paint(b);
      b.addEventListener("keydown", function (e) {
        var k = e.key, list = btns(), n = list.indexOf(b), to = null;
        if (k === "ArrowRight" || k === "ArrowDown") to = list[(n + 1) % list.length];
        else if (k === "ArrowLeft" || k === "ArrowUp") to = list[(n - 1 + list.length) % list.length];
        else if (k === "Home") to = list[0]; else if (k === "End") to = list[list.length - 1];
        if (!to) return;
        e.preventDefault(); to.focus(); choose(to);
      });
      box.appendChild(b);
    });
    set(cur);
    return api;
  }

  function fill(b) {
    var wrap = el("div", "stil"), left = el("div", "stleft"), right = el("div", "stright");
    wrap.appendChild(left); wrap.appendChild(right); b.appendChild(wrap);

    // ---------- the preview: one small card in my look, redrawn on every change ----------
    var pw = el("section", "stpvw"), ph = el("h3", "lbl", t("ms_pv")), pv = el("div", "stpv"), live = el("p", "note");
    ph.id = "stpvh"; pw.setAttribute("aria-labelledby", "stpvh"); pv.setAttribute("role", "img"); live.setAttribute("role", "status"); live.id = "stlive";
    pw.appendChild(ph); pw.appendChild(pv);
    function paint(pop) {
      var m = me(), set = D.SETS[m.set] || D.SETS.tiere, ink = R.ink(m.colors[0]);
      pv.textContent = ""; pv.style.background = m.colors[0]; pv.style.color = ink;
      for (var i = 0; i < 4; i++) { var k = el("span", "stsk k" + i, set[i]); k.setAttribute("aria-hidden", "true"); pv.appendChild(k); }
      pv.appendChild(el("span", "stem", m.emoji));
      pv.appendChild(el("span", "stnm", m.nick || t("ms_noName")));
      var bar = el("i", "stbar"); bar.style.background = m.colors[1]; pv.appendChild(bar);
      pv.setAttribute("aria-label", t("ms_pvLabel", { n: m.nick || t("ms_noName"), e: m.emoji, c: pairName(m.colors), s: setName(m.set) }));
      if (pop) { pv.classList.remove("pop"); void pv.offsetWidth; pv.classList.add("pop"); }
    }
    // The dice: figure, colours and sticker set from a seed (name + roll), on the device, no AI.
    var dice = el("button", "stdice", null, function () {
      var m = me(), r = S.seeded("me|" + m.nick + "|" + S.roll("me|" + m.nick)), pick = function (n) { return Math.floor(r() * n); }, sets = Object.keys(D.SETS);
      Kit.sfx.pop(); m.emoji = S.EMOJI[pick(S.EMOJI.length)]; m.colors = S.PAIRS[pick(S.PAIRS.length)].slice(); m.set = sets[pick(sets.length)];
      changed(true); emo.show(m.emoji); col.set(m.colors.join()); stk.set(m.set);
      live.textContent = t("ms_diced", { e: m.emoji, c: pairName(m.colors), s: setName(m.set) });
    });
    dice.appendChild(icon(DICE, 26)); dice.appendChild(el("span", "", t("ms_dice"))); dice.id = "stdice"; pw.appendChild(dice); pw.appendChild(live); left.appendChild(pw);
    function changed(pop) { var m = me(); S.save(); $("me").textContent = m.emoji; S.ink(m.colors[0], m.colors[1]); paint(pop); }

    // ---------- the account card (part konto); its details go under "Konto & Daten" below ----------
    // ---------- font size right under the preview, before the account: whoever sees badly finds it at once ----------
    var fs = radios(t("fs_title"), ["n", "g", "sg"].map(function (v) { return { v: v, l: t("fs_" + v), c: "chip fs" }; }), Kit.fs, function (v) { Kit.setFs(v); S.fit(); });
    var fsr = el("div", "stfs"); fs.label.insertBefore(el("span", "staa", "Aa"), fs.label.firstChild); fs.label.lastChild.textContent = " " + t("fs_title");
    fs.label.firstChild.setAttribute("aria-hidden", "true"); fsr.appendChild(fs.label); fsr.appendChild(fs.box); left.appendChild(fsr);

    var acHold = el("div"), data = el("details", "stsec"), dataBody = el("div");
    left.appendChild(acHold);

    // ---------- name ----------
    var nl = el("label", "lbl", t("nick")), f = el("input", "field"), nn = el("p", "note", t("nickNote"));
    f.id = "stnick"; nl.htmlFor = "stnick"; nn.id = "stnicknote"; nl.style.marginTop = "0";
    f.value = me().nick; f.maxLength = 16; f.placeholder = t("ms_nickPh"); f.autocomplete = "nickname"; f.enterKeyHint = "done"; f.setAttribute("aria-describedby", "stnicknote");
    f.addEventListener("input", function () { var v = C.sanitizeName(f.value); if (f.value.trim() && !v) { Kit.toast(t(C.filterNote(f.value))); return; } me().nick = v; S.save(); paint(); });
    right.appendChild(nl); right.appendChild(f); right.appendChild(nn);

    // ---------- emoji: six at first, the rest behind "Mehr" (the chosen one is always among the six) ----------
    var first = S.EMOJI.slice(0, 6); if (first.indexOf(me().emoji) < 0) first[5] = me().emoji;
    var list = first.concat(S.EMOJI.filter(function (e) { return first.indexOf(e) < 0; }));
    if (S.EMOJI.indexOf(me().emoji) < 0 && list.indexOf(me().emoji) < 0) list.unshift(me().emoji);
    var emo = radios(t("emoji"), list.map(function (e) { return { v: e, l: e, c: "stemo" }; }), me().emoji, function (v) { me().emoji = v; changed(true); }, "stemos");
    var more = el("button", "stmore", t("ms_more"), function () { Kit.sfx.tap(); open(!emo.open); });
    more.setAttribute("aria-expanded", "false"); more.setAttribute("aria-controls", emo.box.id = "stemos");
    function open(o) {
      emo.open = o; more.textContent = t(o ? "ms_less" : "ms_more"); more.setAttribute("aria-expanded", String(o));
      Array.from(emo.box.children).forEach(function (x, i) { x.hidden = !o && i >= 6 && x.getAttribute("aria-checked") !== "true"; });
    }
    emo.show = function (v) { emo.set(v); open(emo.open); };
    open(false);
    var er = el("div", "stemrow"); er.appendChild(emo.box); er.appendChild(more); right.appendChild(emo.label); right.appendChild(er);

    // ---------- colours: the eight pairs, own colours behind "Eigene Farbe …" ----------
    var col = radios(t("colors"), S.PAIRS.map(function (c, i) {
      return { v: c.join(), l: null, c: "stsw", a: pairName(c), paint: function (b) { b.style.background = c[1]; var x = el("i"); x.style.background = c[0]; b.appendChild(x); } };
    }), me().colors.join(), function (v) { me().colors = v.split(","); bg.value = me().colors[0]; ac.value = me().colors[1]; changed(true); });
    right.appendChild(col.label); right.appendChild(col.box);
    // The colour names come with the part direkt (already loaded for the plain-language switch below); then the labels get them.
    root.Parts.need("direkt").then(function () { Array.from(col.box.children).forEach(function (x, i) { x.setAttribute("aria-label", pairName(S.PAIRS[i])); }); paint(); }, function () {});
    var own = el("details"), os = summary(t("ms_custom")), row = el("div", "stcol"), bg = el("input"), ac = el("input");
    own.appendChild(os); keep(own, "stown");
    [[bg, "ms_bg", 0], [ac, "ms_acc", 1]].forEach(function (x) {
      var l = el("label", "", t(x[1])); x[0].type = "color"; x[0].value = me().colors[x[2]];
      x[0].addEventListener("input", function () { me().colors = [bg.value, ac.value]; col.set(me().colors.join()); changed(); });
      l.appendChild(x[0]); row.appendChild(l);
    });
    own.appendChild(row); right.appendChild(own);

    // ---------- sticker sets, each with three of its stickers ----------
    var stk = radios(t("set"), Object.keys(D.SETS).map(function (s) {
      return { v: s, l: null, c: "stset", a: setName(s), paint: function (b) { b.appendChild(el("span", "", setName(s))); var k = el("small", "", D.SETS[s].slice(0, 3).join("")); k.setAttribute("aria-hidden", "true"); b.appendChild(k); } };
    }), me().set, function (v) { me().set = v; changed(true); });
    right.appendChild(stk.label); right.appendChild(stk.box);

    // ---------- "Lesen & Bedienen": plain language (the font size sits under the preview) ----------
    var rd = el("section", "stread"), rh = el("h3", "lbl", t("ms_read")), ez = el("div");
    rh.id = "streadh"; rd.setAttribute("aria-labelledby", "streadh"); rd.appendChild(rh);
    rd.appendChild(ez); right.appendChild(rd);
    // the plain-language switch comes with the part direkt (editor E1)
    root.Parts.need("direkt").then(function () { root.Direkt.style(ez); }, function () {});

    // ---------- my defaults (closed) ----------
    var pfd = el("details", "stsec"), pfs = summary(t("pf_title")), pf = el("div", "pfbox");
    pfd.appendChild(pfs); keep(pfd, "stpf"); pfd.appendChild(pf); right.appendChild(pfd); prefs(pf);

    // ---------- "Konto & Daten" (closed): account details, card statistics, AI pictures, licences ----------
    var ds = summary(t("ms_data")); ds.appendChild(el("small", "", t(root.DailyFlavor && root.DailyFlavor.stat === false ? "ms_dataSubB" : "ms_dataSub")));
    keep(data, "stdata"); data.appendChild(ds); data.appendChild(dataBody); right.appendChild(data);
    var acMore = el("div"); dataBody.appendChild(acMore);
    S.konto(function () { root.Profile.section(acHold, el, acMore, function () { data.open = true; }); });
    // Card numbers (src/stat.js): the same switch as under "Wer sieht was?" (stimme-ui.js row); none in a flavor without them.
    if (!(root.DailyFlavor && root.DailyFlavor.stat === false)) {
      var so = el("button", "chip statoff", t("set_stat"), function () { Kit.sfx.tap(); if (Kit.store.statOff) delete Kit.store.statOff; else Kit.store.statOff = true; Kit.save(); so.setAttribute("aria-pressed", String(!!Kit.store.statOff)); });
      so.setAttribute("aria-pressed", String(!!Kit.store.statOff)); dataBody.appendChild(so); dataBody.appendChild(el("p", "note", t("set_statnote")));
    }
    // "Bescheid geben" (src/push.js, part push): state and one switch; the dialog asks before the system does.
    var pu = el("div", "stpush"); dataBody.appendChild(pu); root.Parts.need("push").then(function () { root.DuellPush.section(pu); }, function () { pu.remove(); });
    dataBody.appendChild(el("p", "note", t("aiPicNote")));
    dataBody.appendChild(el("button", "btn", t("licenses"), function () { root.Parts.use("licenses", function () { var l = el("pre", "note", root.DailyLicenses); l.style.whiteSpace = "pre-wrap"; b.textContent = ""; b.appendChild(l); }).catch(function () {}); }));
    paint();
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
