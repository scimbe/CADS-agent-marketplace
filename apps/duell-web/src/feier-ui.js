/* Weihnachtsfeier planen on screen (part "turnzwei"): the field kinds of src/feier.js for the turn editor (turn-ui.js
   draws them through Turn2.get("widget", ...)). Every step has an answer ready where one can be given in advance (three
   evenings, two place names), so "Weiter" works at once; only the accessibility of each place has to be tapped.
   Device storage (Kit.store, never in a link): feiorg[ecdh x] = { e, s: the poll's private keys as JWK, b: every sealed
   box this device has seen } on the organiser's device; fei[ecdh x] = the own box on a device that answered.
   All words come from feier.json through Turns.T (no language branches here). */
(function () {
  "use strict";
  var A = window.DailyApp, Tn = window.Turns, F = window.Feier, Kit = window.Kit, B = window.Bausteine, W = window.Turn2, D = window.Daily;
  if (!A || !Tn || !F || !W) return;
  var el = A.el, DAY = 86400000, KEEP = 12;
  function L() { return Tn.T(Kit.lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function plural(k, n, o) { return fmt(window.DuellCore.form(L(), k, n, Kit.lang), Object.assign({ n: n }, o || {})); }
  function localDay() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY); }
  var CSS = ".fei .chips{gap:8px}.fei .chip{min-height:48px;min-width:48px;font-size:1rem}.fei .note,.fei .why{font-size:.9375rem;line-height:1.3}" +
    ".fei .lbl{font-size:1rem;margin-top:10px}.fei .why{color:var(--muted,#4b5563);min-height:1.3em;margin:4px 0}.fei .field{min-height:48px;font-size:1.125rem}" +
    ".fei .feiort{border:1px solid var(--line,#d5d9e0);border-radius:8px;padding:8px 10px;margin:0 0 10px}" +
    ".fei .feipick{display:block;width:100%;text-align:left;min-height:56px;padding:10px 12px;margin:0 0 8px;border:1px solid var(--line,#d5d9e0);border-radius:8px;background:var(--card,#fff);color:inherit;font:600 1.125rem/1.25 inherit}" +
    ".fei .feipick small{display:block;font-weight:500;font-size:.9375rem;margin-top:4px}.fei .feiday{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0}" +
    ".fei .feiday b{flex:1 1 100%;font-size:1.0625rem}.fei details{margin:8px 0}.fei summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:600}" +
    ".fei details p{font-size:.9375rem;line-height:1.35;margin:4px 0}.fei .feiorg{border:2px solid var(--line,#d5d9e0);border-radius:8px;padding:8px 10px;margin:0 0 10px}" +
    ".fei .feiorg p{margin:4px 0;font-size:1rem;line-height:1.3}.fei textarea.field{width:100%;min-height:72px;box-sizing:border-box;font-size:1rem}";
  // Each step draws into its own block (class fei) inside the step's box; host is that box (app.js ed.step.box).
  function wrap(host) { css(); var w = el("div", "fei"); host.appendChild(w); return w; }
  function css() { if (document.getElementById("feicss")) return; var s = document.createElement("style"); s.id = "feicss"; s.textContent = CSS; document.head.appendChild(s); }
  function chip(text, on, fn) { var b = el("button", "chip" + (on ? " on" : ""), text, fn); b.setAttribute("aria-pressed", String(!!on)); return b; }
  // The reason the step is still locked: in the footer's line (app.js reads ed.step.why) and next to the fields.
  function reason(ctx, host, line, text) {
    line.textContent = text || "";
    setTimeout(function () { var s = ctx.ed.step; if (s && s.box === host) { s.why = text || s.why; A.footer(); } }, 0);
  }
  // What the link carries, who keeps it and when it lapses, from the card's own fields (rule 16), plus the business lines.
  function rules(box, dates) {
    var last = dates.length ? Math.floor(dates[dates.length - 1] / 10) : localDay();
    box.appendChild(B.wswRow({ link: ["termin", "text", "zahl"], ki: false, server: false, tage: Math.max(1, last - localDay() + 1) }));
    box.appendChild(el("p", "note", L().fei_wsw_seal));
    box.appendChild(el("p", "note", L().fei_free));
    var d = el("details"), s = el("summary", "", L().fei_info);
    d.appendChild(s); [L().fei_how, fmt(L().fei_br, { k: F.K }), L().fei_tax].forEach(function (x) { d.appendChild(el("p", "", x)); });
    box.appendChild(d);
  }

  /* ---------- setting up 1/3: the name of the party and 2 to 3 dates (taps, never typed) ---------- */
  function tage(box, p, set, ctx) {
    var host = box; box = wrap(host);
    var ed = ctx.ed, k = ed.fei || (ed.fei = {}), today = localDay(), six = Tn.HOURS.indexOf(18);
    if (!k.dates) k.dates = F.suggest(today);
    if (k.kind == null) k.kind = 0;
    if (k.week == null) k.week = monday(Math.floor(k.dates[0] / 10));
    var h = k.dates.length ? k.dates[0] % 10 : six, kinds = el("div", "chips"), times = el("div", "chips"), nav = el("div", "chips"), days = el("div", "chips"), mine = el("div", "chips"), why = el("p", "why");
    why.setAttribute("aria-live", "polite");
    function monday(d) { var w = new Date(d * DAY).getUTCDay(); return d - ((w + 6) % 7); }
    function title() {   // the neutral variant travels as the sheet's own title
      var D = window.FeierData || {}, all = Object.keys(D).map(function (l) { return D[l].fei_t_1; });
      if (k.kind) ed.doc.t = L().fei_t_1; else if (ed.doc.t && all.indexOf(ed.doc.t) >= 0) delete ed.doc.t;
    }
    function up() {
      k.dates.sort(function (a, b) { return a - b; });
      kinds.textContent = ""; [0, 1].forEach(function (i) { kinds.appendChild(chip(L()["fei_kind_" + i], k.kind === i, function () { k.kind = i; title(); Kit.sfx.tap(); up(); A.changed(); })); });
      Array.from(times.children).forEach(function (b, i) { b.classList.toggle("on", i === h); b.setAttribute("aria-pressed", String(i === h)); });
      nav.textContent = "";
      var pv = el("button", "chip", "‹", function () { if (k.week - 7 + 6 > today) { k.week -= 7; Kit.sfx.tap(); up(); } }), nx = el("button", "chip", "›", function () { if (k.week < today + 7 * 16) { k.week += 7; Kit.sfx.tap(); up(); } });
      pv.setAttribute("aria-label", L().fei_wprev); nx.setAttribute("aria-label", L().fei_wnext);
      nav.appendChild(pv); nav.appendChild(el("span", "lbl", fmt(L().fei_week, { d: Tn.dayText(k.week, Kit.lang) }))); nav.appendChild(nx);
      days.textContent = "";
      for (var i = 0; i < 6; i++) (function (d) {
        if (d <= today) return;
        var s = d * 10 + h, on = k.dates.indexOf(s) >= 0;
        days.appendChild(chip(Tn.dayText(d, Kit.lang), on, function () {
          var at = k.dates.indexOf(s);
          if (at >= 0) k.dates.splice(at, 1); else if (k.dates.length >= F.DATES[1]) { Kit.toast(L().fei_max); return; } else k.dates.push(s);
          Kit.sfx.tap(); up();
        }));
      })(k.week + i);
      mine.textContent = "";
      k.dates.forEach(function (s) {
        var b = el("button", "chip on", Tn.slotText(s, Kit.lang) + " ✕", function () { k.dates.splice(k.dates.indexOf(s), 1); Kit.sfx.tap(); up(); });
        b.setAttribute("aria-label", L().fei_drop + ": " + Tn.slotText(s, Kit.lang)); mine.appendChild(b);
      });
      var v = [k.kind, k.dates.slice()], ok = p.check(v, ctx.doc, [], []);
      reason(ctx, host, why, ok ? "" : plural("fei_need_dates", Math.max(1, F.DATES[0] - k.dates.length)));
      set(ok ? v : null);
    }
    Tn.HOURS.forEach(function (x, i) {
      times.appendChild(chip(Tn.hourText(i, Kit.lang), i === h, function () { h = i; k.dates = k.dates.map(function (s) { return Math.floor(s / 10) * 10 + i; }).filter(function (s, j, a) { return a.indexOf(s) === j; }); Kit.sfx.tap(); up(); }));
    });
    box.appendChild(el("label", "lbl", L().fei_kind_l)); box.appendChild(kinds);
    box.appendChild(el("label", "lbl", L().fei_chosen)); box.appendChild(mine); box.appendChild(why);
    box.appendChild(el("label", "lbl", L().fei_time)); box.appendChild(times);
    box.appendChild(nav); box.appendChild(days);
    rules(box, k.dates);
    title(); up();
  }

  /* ---------- setting up 2/3: two places, each with its accessibility (required) and its costs ---------- */
  function orte(box, p, set, ctx) {
    var host = box; box = wrap(host);
    var ed = ctx.ed, k = ed.fei || (ed.fei = {}), why = el("p", "why");
    why.setAttribute("aria-live", "polite");
    if (!k.places) k.places = [0, 1].map(function (i) { return { name: L()["fei_ort_def_" + i], acc: null, pp: "", fix: "" }; });
    function cents(s) { var t = String(s || "").trim(); return t ? Tn.parseCents(t) : 0; }
    function up() {
      var miss = "", list = k.places.map(function (x) { return [window.Quest.clean(x.name, F.NAME), x.acc, cents(x.pp), cents(x.fix)]; });
      list.forEach(function (x, i) {
        var o = x[0] || fmt(L().fei_ort, { n: i + 1 });
        if (!miss && x[1] === null) miss = fmt(L().fei_need_acc, { o: o });
        if (!miss && (x[2] === null || x[3] === null || x[2] > F.MAX_PP || x[3] > F.MAX_FIX)) miss = fmt(L().fei_need_cost, { o: o });
      });
      var v = list, ok = !miss && p.check(v, ctx.doc, [], ctx.now);
      if (!miss && !ok) miss = L().fei_need_name;
      reason(ctx, host, why, miss); set(ok ? v : null);
    }
    k.places.forEach(function (x, i) {
      var w = el("div", "feiort"), name = el("input", "field"), acc = el("div", "chips"), pp = el("input", "field"), fix = el("input", "field");
      w.appendChild(el("label", "lbl", fmt(L().fei_ort, { n: i + 1 })));
      name.maxLength = F.NAME; name.autocomplete = "off"; name.value = x.name; name.setAttribute("aria-label", fmt(L().fei_ort, { n: i + 1 }) + ": " + L().fei_ort_name);
      name.addEventListener("input", function () { x.name = name.value; up(); });
      function paint() {
        acc.textContent = "";
        F.ACC.forEach(function (bit, j) {
          var on = x.acc !== null && x.acc !== F.UNK && (x.acc & bit) > 0;
          acc.appendChild(chip(L()["fei_acc_" + j], on, function () { var a = x.acc === null || x.acc === F.UNK ? 0 : x.acc; a ^= bit; x.acc = a || null; Kit.sfx.tap(); paint(); up(); }));
        });
        acc.appendChild(chip(L().fei_acc_none, x.acc === 0, function () { x.acc = 0; Kit.sfx.tap(); paint(); up(); }));
        acc.appendChild(chip(L().fei_acc_unk, x.acc === F.UNK, function () { x.acc = F.UNK; Kit.sfx.tap(); paint(); up(); }));
      }
      [[pp, "fei_pp", "pp"], [fix, "fei_fix", "fix"]].forEach(function (f) {
        f[0].inputMode = "decimal"; f[0].maxLength = 9; f[0].autocomplete = "off"; f[0].placeholder = "0"; f[0].value = x[f[2]];
        f[0].setAttribute("aria-label", fmt(L().fei_ort, { n: i + 1 }) + ": " + L()[f[1]]);
        f[0].addEventListener("input", function () { x[f[2]] = f[0].value; up(); });
      });
      w.appendChild(name); w.appendChild(el("label", "lbl", L().fei_acc)); w.appendChild(acc);
      w.appendChild(el("label", "lbl", L().fei_pp)); w.appendChild(pp); w.appendChild(el("label", "lbl", L().fei_fix)); w.appendChild(fix);
      box.appendChild(w); paint();
    });
    box.appendChild(why); up();
  }

  /* ---------- setting up 3/3: the poll's two key pairs; the private halves stay on this device ---------- */
  function store(k) { var s = Kit.store[k]; return s && typeof s === "object" && !Array.isArray(s) ? s : {}; }
  function remember(k, id, v) { var s = store(k); delete s[id]; s[id] = v; for (var o = Object.keys(s); o.length > KEEP; o.shift()) delete s[o[0]]; Kit.store[k] = s; Kit.save(); }
  function nocrypto(box, set) { box.appendChild(el("p", "note", L().fei_nocrypto)); set(null); }
  function start(box, p, set, ctx) {
    var k = ctx.ed.fei || (ctx.ed.fei = {});
    if (!F.supported()) { nocrypto(box, set); return; }
    (k.keys ? Promise.resolve(k.keys) : F.keys()).then(function (x) {
      if (!k.keys) remember("feiorg", x.pub[0], { e: x.priv.e, s: x.priv.s, b: "" });
      k.keys = x;
      var v = [x.pub[0], x.pub[1], 0, "", 0]; set(p.check(v, ctx.doc, [], ctx.now) ? v : null);
    }, function () { nocrypto(box, set); });
  }

  /* ---------- the organiser's device: totals from K answers on, more links pasted in, the signed end ---------- */
  function linkBoxes(text, ex) {   // every link of this poll in a pasted text (several forks at once): their boxes
    var out = "";
    (String(text).match(/#c=[A-Za-z0-9_-]+/g) || []).forEach(function (h) {
      var r = D.parseRoute(h), m = r && r.type === "doc" && r.doc.k === "turn" && r.doc.g === "feier" ? Tn.moves(r.doc) : [];
      if (m.length && m[0][2][0] === ex) out = F.merge(out, m[0][2][3]);
    });
    return out;
  }
  function dash(box, ctx, ex) {
    var s = ctx.m[0], ed = ctx.ed, org = store("feiorg")[ex], w = el("div", "feiorg"), res = el("div"), info = el("div"), shut = el("div");
    org.b = F.merge(org.b || "", s[2][3]); remember("feiorg", ex, org);   // this link's boxes join the ones seen before
    w.setAttribute("aria-live", "polite");
    w.appendChild(el("p", "lbl", L().fei_org_h)); w.appendChild(res); w.appendChild(info); w.appendChild(shut);
    function draw() {
      return F.tally(org.e, s[0], s[2], org.b).then(function (r) {
        if (!box.isConnected) return;
        var n = r.totals[0];
        res.textContent = ""; info.textContent = ""; shut.textContent = "";
        F.lines(F.view(s[0], s[1], r.totals), Kit.lang).forEach(function (l) { res.appendChild(el("p", "", l)); });
        info.appendChild(el("p", "note", fmt(L().fei_org_has, { n: n })));
        if (s[2][2] > n + r.bad) info.appendChild(el("p", "note", fmt(L().fei_org_miss, { n: s[2][2] })));
        if (r.bad) info.appendChild(el("p", "note", fmt(L().fei_org_bad, { n: r.bad })));
        var b = el("button", "btn", L().fei_close, function () {
          if (n < F.K) return;
          Kit.sfx.tap(); b.disabled = true;
          F.close(ctx.doc, ctx.m, r.totals, org.s).then(function (ans) {
            var d = Tn.play(ctx.doc, ans, Tn.today()); if (!d) { b.disabled = false; return; }
            ed.next = d; ed.step = null; box.textContent = ""; box.appendChild(el("p", "lbl", L().fei_closed_ok)); A.changed(); A.footer();
          }, function () { b.disabled = false; });
        });
        if (n < F.K) { b.setAttribute("aria-disabled", "true"); b.classList.add("wait"); shut.appendChild(b); shut.appendChild(el("p", "why", fmt(L().fei_close_why, { k: F.K }))); }
        else shut.appendChild(b);
      });
    }
    var t = el("textarea", "field"), go = el("button", "btn", L().fei_paste_go, function () {
      Kit.sfx.tap();
      var before = F.chunks(org.b).length; org.b = F.merge(org.b, linkBoxes(t.value, ex)); remember("feiorg", ex, org);
      var got = F.chunks(org.b).length - before; t.value = "";
      Kit.toast(got ? plural("fei_paste_got", got) : L().fei_paste_none); draw();
    });
    t.setAttribute("aria-label", L().fei_paste_l); t.autocomplete = "off"; t.spellcheck = false;
    w.appendChild(el("label", "lbl", L().fei_paste_l)); w.appendChild(t); w.appendChild(go);
    w.appendChild(el("button", "btn", L().fei_self, function () { ed.feiother = true; Kit.sfx.tap(); A.tab("Move"); }));
    box.appendChild(w); draw();
  }

  /* ---------- answering 1/3: yes / maybe / no per date (nothing set in advance: a silent no would look like a real one) ---------- */
  function wann(box, p, set, ctx) {
    var host = box; box = wrap(host);
    var ed = ctx.ed, m = ctx.m, s = m[0], ex = s[2][0], k = ed.fei || (ed.fei = {}), why = el("p", "why"), rows = el("div");
    var v = k.ex === ex && k.ans ? k.ans.slice() : s[0][1].map(function () { return -1; });
    k.ex = ex; why.setAttribute("aria-live", "polite");
    if (!F.supported()) { nocrypto(box, set); return; }
    if (store("feiorg")[ex] && !ed.feiother) { dash(box, ctx, ex); reason(ctx, host, why, L().fei_org_why); set(null); rules(box, s[0][1]); return; }
    if (store("fei")[ex] && !ed.feiother) {
      box.appendChild(el("p", "qtext", L().fei_done_dev));
      box.appendChild(el("button", "btn", L().fei_other, function () { ed.feiother = true; Kit.sfx.tap(); A.tab("Move"); }));
      reason(ctx, host, why, L().fei_done_dev); set(null); rules(box, s[0][1]); return;   // the footer's line says it once more
    }
    function up() {
      Array.from(rows.querySelectorAll(".feiday")).forEach(function (r, i) { Array.from(r.querySelectorAll(".chip")).forEach(function (b, j) { b.classList.toggle("on", v[i] === j); b.setAttribute("aria-pressed", String(v[i] === j)); }); });
      var open = v.filter(function (x) { return x < 0; }).length;
      reason(ctx, host, why, open ? plural("fei_need_vote", open) : "");
      k.ans = open ? null : v.slice();
      set(!open && p.check(s[0], ctx.doc, m, []) ? s[0] : null);
    }
    box.appendChild(el("p", "note", L().fei_sealed)); box.appendChild(el("p", "note", L().fei_latest));
    box.appendChild(el("button", "chip", L().fei_all_yes, function () { for (var i = 0; i < v.length; i++) v[i] = 0; Kit.sfx.tap(); up(); }));
    s[0][1].forEach(function (d, i) {
      var r = el("div", "feiday"), lab = Tn.slotText(d, Kit.lang);
      r.appendChild(el("b", "", lab));
      ["fei_yes", "fei_maybe", "fei_no"].forEach(function (w, j) { var b = chip(L()[w], false, function () { v[i] = j; Kit.sfx.tap(); up(); }); b.setAttribute("aria-label", lab + ": " + L()[w]); r.appendChild(b); });
      rows.appendChild(r);
    });
    box.appendChild(rows); box.appendChild(why); rules(box, s[0][1]); up();
  }

  /* ---------- answering 2/3: one of the two places, with what it offers and costs ---------- */
  function wo(box, p, set, ctx) {
    var host = box; box = wrap(host);
    var s = ctx.m[0], k = ctx.ed.fei || (ctx.ed.fei = {});
    s[1].forEach(function (x, i) {
      var b = el("button", "feipick", null, function () { Kit.sfx.tap(); k.place = i; if (p.check(s[1], ctx.doc, ctx.m, ctx.now)) set(s[1]); });
      b.appendChild(document.createTextNode(x[0]));
      b.appendChild(el("small", "", F.accText(x[1], Kit.lang)));
      var cost = [x[2] ? fmt(L().fei_pp_line, { p: window.DuellCore.money(x[2], Kit.lang) }) : "", x[3] ? fmt(L().fei_fix_line, { f: window.DuellCore.money(x[3], Kit.lang) }) : ""].filter(Boolean).join(" · ");
      if (cost) b.appendChild(el("small", "", cost));
      box.appendChild(b);
    });
    set(null);
  }

  /* ---------- answering 3/3: food wishes, all optional; the whole answer is sealed here, on this device ---------- */
  function essen(box, p, set, ctx) {
    var host = box; box = wrap(host);
    var k = ctx.ed.fei || (ctx.ed.fei = {}), on = [0, 0, 0], row = el("div", "chips"), why = el("p", "why"), seq = 0;
    why.setAttribute("aria-live", "polite");
    function up() {
      Array.from(row.children).forEach(function (b, i) { b.classList.toggle("on", !!on[i]); b.setAttribute("aria-pressed", String(!!on[i])); });
      var my = ++seq; set(null); reason(ctx, host, why, L().fei_sealing);
      F.vote(ctx.m, k.ans, k.place, on.slice()).then(function (r) {
        if (my !== seq || !box.isConnected) return;
        var ok = p.check(r.move[2], ctx.doc, ctx.m, ctx.now);
        k.box = ok ? r.box : null; reason(ctx, host, why, ok ? "" : L().fei_nocrypto); set(ok ? r.move[2] : null);
      }, function () { if (my === seq) { reason(ctx, host, why, L().fei_nocrypto); set(null); } });
    }
    on.forEach(function (x, i) { row.appendChild(chip(L()["fei_m_" + i], false, function () { on[i] = on[i] ? 0 : 1; Kit.sfx.tap(); up(); })); });
    box.appendChild(row); box.appendChild(el("p", "note", L().fei_intol)); box.appendChild(why); box.appendChild(el("p", "note", L().fei_sealed));
    box.appendChild(el("p", "note", fmt(L().fei_anon, { k: F.K }))); up();
  }

  W.add("widget", "fei-tage", tage); W.add("widget", "fei-orte", orte); W.add("widget", "fei-start", start);
  W.add("widget", "fei-wann", wann); W.add("widget", "fei-wo", wo); W.add("widget", "fei-essen", essen);

  // On sending an answer: this device remembers its own box, so the same phone does not answer twice by accident (the
  // organiser's keys were kept when they were made). Nothing of it leaves the device.
  var TM = window.DailyModes.turn, main = TM.main;
  TM.main = function (ed) {
    if (ed && ed.doc.g === "feier" && ed.next && ed.fei && ed.fei.box && !Tn.result(ed.next, Kit.lang)) {
      var b = Tn.moves(ed.next);
      if (b.length && b[0][2][3].indexOf(ed.fei.box) >= 0) remember("fei", b[0][2][0], ed.fei.box);
    }
    return main.apply(TM, arguments);
  };
  window.FeierUI = { css: css };
})();
