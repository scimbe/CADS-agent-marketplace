/* Part "turnzwei" ("turn2" in the card plan; part names are letters only, the gallery serves /duell/parts/[a-z]+.<hash>.js): rules and widgets of the new turn cards (Katalog v2, W0). A card
   registers here instead of growing turns.js or turn-ui.js in the core (test/build.test.js holds the core budget).
     Turn2.add("rule", "checkin", { turns: [...], face: fn, result: fn })   a game for the turn table (like turns.js GAMES)
     Turn2.add("widget", "board", function (box, field, doc, lang) { ... }) a field kind for the turn editor
   The core reaches it only through Parts.use("turnzwei", fn) and Turn2.get(kind, name); turn-ui.js walk() loads the part
   when a step's widget is not in the core. */
(function (root) {
  "use strict";
  root.Turn2 = root.Parts.registry("turnzwei", ["rule", "widget"]);
  var DAY = 86400000;
  function A() { return root.DailyApp; }
  function el(t, c, x, f) { return A().el(t, c, x, f); }
  function L() { return root.Turns.T(root.Kit.lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }
  function today() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY); }
  function iso(day) { return new Date(day * DAY).toISOString().slice(0, 10); }

  // ---------- ideas: five gift ideas from the list (Geschenke), optionally from the AI (kind liste); one is tapped ----------
  // The answer is [the five texts shown, the one tapped]. Ideas of the AI mark the card (doc.ki) only once one is taken.
  root.Turn2.add("widget", "ideas", function (box, p, set, ctx) {
    var K = root.Kit, G = root.Geschenke, X = L(), ask = p.ask(ctx.now), std = G.ideas(ctx.doc.seed, ask, K.lang), list = std, seal = null, on = -1, wait = null;
    var note = el("p", "note", X.gf_std), row = el("div", "gfrow");
    note.setAttribute("aria-live", "polite");
    function draw() {
      row.textContent = "";
      list.forEach(function (s, i) {
        var b = el("button", "chip" + (i === on ? " on" : ""), s, function () {
          K.sfx.tap(); on = i; draw();
          if (seal) { ctx.ed.doc.ki = root.Daily.sanitizeKi(seal) || undefined; if (wait) { wait(true); wait = null; } }
          set([list.slice(), i]);
        });
        b.setAttribute("aria-pressed", String(i === on)); row.appendChild(b);
      });
    }
    function back() { if (wait) { wait(false); wait = null; } seal = null; delete ctx.ed.doc.ki; list = std; on = -1; note.textContent = X.gf_std; draw(); set(null); }
    box.appendChild(note); box.appendChild(row); draw(); set(null);
    var who = X["gfw_" + ask.who], likes = ask.likes.map(function (k) { return X["gfl_" + k]; }).join(", ");
    A().aiBlock(box, {
      kind: "liste", label: X.gf_ki,
      input: function () { return { art: "einkauf", satz: fmt(X.gf_satz, { w: who, b: root.Turns.upTo(ask.euro, K.lang), l: likes }) }; },
      auto: function (opt, ki, res) {
        var got = G.fromAi(opt, K.lang);
        if (!got.length) { res.appendChild(el("p", "note aistate", X.gf_none)); return false; }
        if (wait) wait(false);
        list = got; seal = ki || { k: "liste" }; on = -1; note.textContent = X.gf_kinote; draw(); set(null);
        res.appendChild(el("button", "chip", X.gf_back, function () { K.sfx.tap(); res.textContent = ""; back(); }));
        return new Promise(function (ok) { wait = ok; });     // charged once an idea of the AI is taken, given back otherwise
      }
    });
  });

  // ---------- opts: chips whose words come with this part (keys pre + key); like pick, n of them ----------
  root.Turn2.add("widget", "opts", function (box, p, set) {
    var K = root.Kit, X = L(), on = [], row = el("div", "chips"), bs = [];
    function sync() { bs.forEach(function (b, i) { var x = on.indexOf(i) >= 0; b.classList.toggle("on", x); b.setAttribute("aria-pressed", String(x)); }); set(on.length === p.n ? on.slice() : null); }
    p.keys.forEach(function (k, i) {
      var b = el("button", "chip", X[p.pre + k], function () { K.sfx.tap(); var at = on.indexOf(i); if (at >= 0) on.splice(at, 1); else { if (on.length >= p.n) on.shift(); on.push(i); } sync(); });
      bs.push(b); row.appendChild(b);
    });
    box.appendChild(row); sync();
  });

  // ---------- wish: the wish list (turns.js WISH), merged like the shopping list. The wisher's phone shows the wishes only;
  // the family sees one gift button per wish and others' marks only as "taken", never by whom. Whose phone is it: the
  // wisher's phone keeps a device key for the list (made like Büro-Wichteln's, src/siegel.js; it stays on the phone, the
  // link has no key) from writing it, opening her own link (o: 1) or saying so. A phone with neither key nor answer asks
  // first, before it shows any reservation: a wisher on a second phone hides them with one tap. A request, not a lock. ----------
  function wishWho(doc, m) {
    var K = root.Kit, s = K.store.wown && typeof K.store.wown === "object" ? K.store.wown : (K.store.wown = {}), v = s["s" + doc.seed];
    if (v === 1 || (v && v.o === 1)) return 1;
    if (!m.length || doc.o === 1) { wishMark(doc, 1); return 1; }
    return v && v.o === 0 ? 0 : -1;
  }
  function wishMark(doc, own) {
    var K = root.Kit, S = root.Siegel, s = K.store.wown, key = "s" + doc.seed, k;
    delete s[key]; s[key] = { o: own }; k = Object.keys(s); while (k.length > 12) delete s[k.shift()]; K.save();
    if (own && S.ok()) S.keys().then(function (kp) { if (s[key] && s[key].o === 1) { s[key].k = kp.k; s[key].p = kp.p; K.save(); } }).catch(function () {});
  }
  root.Turn2.add("widget", "wish", function (box, p, set, ctx) {
    var K = root.Kit, Tn = root.Turns, Q = root.Quest, X = L(), cf = p.cfg, who0 = wishWho(ctx.doc, ctx.m), own = who0 === 1, base = ctx.m.length ? ctx.m[0][0] : null;
    if (who0 < 0) {   // a new phone: who is this, before any reservation shows
      var q = box.querySelector(".lbl"); if (q) q.textContent = X.wun_who; else box.appendChild(el("p", "lbl", X.wun_who));
      [[X.wun_iam, 1], [X.wun_igive, 0]].forEach(function (c) { box.appendChild(el("button", "btn", c[0], function () { K.sfx.tap(); wishMark(ctx.doc, c[1]); A().tab("Move"); })); });
      box.appendChild(el("p", "note", X.wun_who_why)); set(null); return;
    }
    var e = ctx.ed.shop || (ctx.ed.shop = { name: "", face: Math.max(0, Tn.FACES.indexOf(A().me().emoji)), adds: [], marks: {} });
    var form = el("form", "shopadd"), f = el("input", "field"), plus = el("button", "chip", "+"), rows = el("div", "shoplist"), who = el("input", "field"), pn = document.getElementById("panel");
    if (pn) pn.dataset.size = "big";
    var lb = box.querySelector(".lbl"); if (lb && own) lb.textContent = X.wun_make;   // the step's label is the family's on a received link
    f.maxLength = cf.text; f.autocomplete = "off"; f.enterKeyHint = "enter"; f.placeholder = X.wun_ph; f.setAttribute("aria-label", X.wun_field);
    plus.type = "submit"; plus.setAttribute("aria-label", X.wun_add);
    who.maxLength = 12; who.autocomplete = "off"; who.setAttribute("aria-label", X.wun_name); who.placeholder = X.ter_name;
    // the name this phone gave for this list before (kept per list on the phone), else the profile's
    var names = K.store.wname && typeof K.store.wname === "object" ? K.store.wname : {}, key = "s" + ctx.doc.seed, nick = A().me().nick;
    if (own) e.name = ""; else if (!e.name) e.name = Tn.nameOk(names[key]) ? names[key] : nick && Tn.nameOk(nick) ? nick : "";
    who.value = e.name;
    function now() { return Tn.shopApply(base, e, cf); }
    function named() { return Tn.nameOk(e.name); }
    function sent(k) { return !!base && base[1].some(function (it) { return Tn.shopKey(it[0]) === k; }); }
    function row(r, v) {
      var d = el("div", "shoprow"), txt = el("div", "shoptext"), me = !own && named() && Tn.shopMark(v, e.name, r.key) % 3 === 1;
      var others = r.bring.filter(function (x) { return !named() || Q.fold(x[0]) !== Q.fold(e.name); }).length, line = own ? "" : me ? (others ? X.wun_both : X.wun_yours) : others ? X.wun_taken : "";
      txt.appendChild(el("b", "", r.label)); if (line) txt.appendChild(el("small", "", line)); d.appendChild(txt);
      if (!own) {
        var shut = others > 0 && !me, b = el("button", "chip" + (me ? " on" : ""), "🎁", function () {
          if (shut) { K.toast(X.wun_taken); return; }
          if (!named()) { K.toast(X.ein_need_name); who.focus(); return; }
          e.marks[r.key] = me ? 0 : 1; K.sfx.tap(); up();
        });
        b.setAttribute("aria-label", X.wun_bring + ": " + r.label); b.setAttribute("aria-pressed", String(me));
        if (shut) { b.setAttribute("aria-disabled", "true"); b.title = X.wun_taken; }
        d.appendChild(b);
      } else if (!sent(r.key)) {
        var x = el("button", "chip", "✕", function () { e.adds = e.adds.filter(function (a) { return Tn.shopKey(a.text) !== r.key; }); K.sfx.tap(); up(); });
        x.setAttribute("aria-label", X.wun_drop + ": " + r.label); d.appendChild(x);
      }
      return d;
    }
    function up() {
      var v = now(); rows.textContent = "";
      if (!v[1].length) rows.appendChild(el("p", "note", X.wun_empty));
      Tn.shopRows(v, cf).forEach(function (r) { rows.appendChild(row(r, v)); });
      set(Tn.shopOk(v, cf) ? v : null);
    }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var w = Q.clean(f.value, cf.text), k = w && Tn.shopKey(w);
      if (!k) { if (f.value.trim()) K.toast(K.t("filter")); return; }
      f.value = ""; f.focus();
      if (now()[1].some(function (it) { return Tn.shopKey(it[0]) === k; })) { K.toast(X.wun_have); return; }
      e.adds.push({ text: w, qty: 1 });
      if (!now()[1].some(function (it) { return Tn.shopKey(it[0]) === k; })) { e.adds.pop(); f.value = w; K.toast(X.wun_full); return; }
      K.sfx.pop(); up();
    });
    who.addEventListener("input", function () {
      e.name = who.value.trim(); up();
      if (Tn.nameOk(e.name)) { names[key] = e.name; var k = Object.keys(names); while (k.length > 12) delete names[k.shift()]; K.store.wname = names; K.save(); }
    });
    if (own) { form.appendChild(f); form.appendChild(plus); box.appendChild(form); }
    box.appendChild(rows);
    if (!own) { box.appendChild(el("label", "lbl", X.wun_name)); box.appendChild(who); }
    box.appendChild(el("p", "note", own ? X.wun_own_hint : X.wun_hint));
    if (own) box.appendChild(el("button", "chip", "🔗 " + X.wun_mine, async function () {   // her own link: the wishes, no marks, o: 1
      K.sfx.tap(); var v = now(), d = v[1].length && Tn.play(ctx.doc, [Tn.wishBare(v)], Tn.today());
      if (!d) { K.toast(X.wun_empty); return; }
      d.o = 1; root.Turn2.ownLink = root.Daily.docUrl(d);
      if (await K.copy(root.Turn2.ownLink)) K.toast(X.wun_mine_ok);
    }));
    // Only her phone ends the list, after one more tap to be sure; reservations never end it (turns.js GAMES.wunsch.ends).
    if (own && base) {
      var ask = el("div", "wunclose"), shut = el("button", "chip", "🔒 " + X.wun_close, function () { K.sfx.tap(); shut.hidden = true; ask.hidden = false; });
      ask.hidden = true; ask.setAttribute("role", "group"); ask.appendChild(el("p", "note", X.wun_close_q));
      ask.appendChild(el("button", "chip", X.wun_close_yes, function () {
        var v = now(), d = Tn.shopOk(v, cf) && Tn.play(ctx.doc, [v], Tn.today()), c = d && Tn.close(d);
        if (!c) return;
        K.sfx.tap(); root.TurnShop.keep(c, v); ctx.ed.next = null; ctx.ed.doc = c; A().changed(); A().tab("Move");
      }));
      ask.appendChild(el("button", "chip", X.wun_close_no, function () { K.sfx.tap(); ask.hidden = true; shut.hidden = false; }));
      box.appendChild(shut); box.appendChild(ask);
    }
    up();
  });

  // ---------- day: one calendar day, tapped in the date field; set in advance to a Friday two weeks ahead ----------
  root.Turn2.add("widget", "day", function (box, p, set, ctx) {
    var f = el("input", "field"), t0 = today(), def = t0 + 14;
    if (p.org) { bwRec(ctx.doc.seed).o = 1; root.Kit.save(); }   // this phone sets the group up, so it is the one that draws
    while (new Date(def * DAY).getUTCDay() !== 5) def++;
    f.type = "date"; f.min = iso(t0); f.value = iso(def); f.setAttribute("aria-label", L()[p.l]);
    f.addEventListener("change", function () {
      var m = f.value.match(/^(\d{4})-(\d{2})-(\d{2})$/), d = m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : 0;
      set(d >= t0 && root.Turns.okAnswer(p, d) ? d : null);
    });
    box.appendChild(f); set(def);
  });

  // ---------- bw: Büro-Wichteln after the setup (BizGames, Siegel). Each phone signs up with a key made on it and sends
  // its link back; the phone that set the group up merges the sign-ups it is sent and draws; then each phone opens only
  // the slip sealed to its key. What this phone knows of a group stays in Kit.store.bwk under the link's seed: o (set it
  // up), k/p (its key), n (the name it signed up with), r (the sign-ups seen, merged like the shopping list), z (drawn:
  // this phone drew or saw the draw, so an older sign-up link no longer takes sign-ups or a second draw), zd (on the
  // drawing phone: the draw as it is in the link, names and sealed boxes, to send it again).
  // Never the pairs. ----------
  function bwRec(seed) {
    var K = root.Kit, s = K.store.bwk && typeof K.store.bwk === "object" ? K.store.bwk : (K.store.bwk = {}), key = "s" + seed, k;
    if (!s[key] || typeof s[key] !== "object") { s[key] = {}; k = Object.keys(s); while (k.length > 12) delete s[k.shift()]; }
    return s[key];
  }
  function bwUnion(a, b) {
    var out = a.slice(), BG = root.BizGames;
    (Array.isArray(b) ? b : []).forEach(function (e) { if (out.length < BG.MAX && BG.roster(out.concat([e]))) out.push(e); });
    return out;
  }
  function fits(d) { var u = d && root.Daily.docUrl(d); return !!u && d.q.length <= 900 && u.split("#c=")[1].length <= root.DuellCore.MAX_FRAGMENT; }
  root.Turn2.add("widget", "bw", function (box, p, set, ctx) {
    var K = root.Kit, S = root.Siegel, BG = root.BizGames, Tn = root.Turns, Q = root.Quest, X = L(), doc = ctx.doc, m = ctx.m;
    var rec = bwRec(doc.seed), drawn = BG.drawn(m), link = m.length > 1 && !drawn ? m[1][0] : [], info = "bwichtel:" + doc.seed, w = el("div", "bw");
    var list = drawn || rec.z ? link : bwUnion(link, rec.r);
    if (drawn) rec.z = 1; else if (!rec.z) rec.r = list;
    K.save(); box.appendChild(w);
    function mine() { for (var i = 0; i < list.length; i++) if (rec.p && list[i][1] === rec.p) return i; return -1; }
    function note(s, cls, role) { var n = el("p", cls || "note", s); if (role) n.setAttribute("role", role); w.appendChild(n); return n; }
    // what goes back: this phone's sign-up first, then the others it knows, as many as fit a link
    function out() {
      var me = mine(), v = me >= 0 ? [list[me]].concat(list.filter(function (e, i) { return i !== me; })) : list.slice(), d = Tn.play(doc, [v], Tn.today());
      while (v.length > 1 && !fits(d)) { v.pop(); d = Tn.play(doc, [v], Tn.today()); }
      return d;
    }
    function slipOf(i, box2) {
      box2.textContent = "";
      function say(s) { box2.appendChild(el("p", "note", s)); }
      function other() { say(X.bw_other); K.toast(X.bw_other); }
      if (!rec.k) { other(); return; }
      S.open(rec.k, drawn[1], drawn[2][i], info + ":" + i, rec.p).then(function (to) {
        if (!(to >= 0 && to < drawn[0].length && to !== i)) { say(X.bw_broken); return; }
        BG.slip(doc, m, to, K.lang).forEach(function (s, j) { box2.appendChild(el("p", j ? "note" : "qtext", s)); });
        say(X.bw_honest);
      }, other);
    }
    function draw() {
      w.textContent = "";
      if (!S.ok()) { note(X.bw_nokey, "note", "alert"); set(null); return; }
      if (drawn) {   // the draw is in the link: tap one's own name, only the key of the phone that signed up opens it
        var row = el("div", "chips"), box2 = el("div", "bwslip");
        box2.setAttribute("aria-live", "polite");
        drawn[0].forEach(function (n, i) { row.appendChild(el("button", "chip", n, function () { K.sfx.tap(); slipOf(i, box2); })); });
        w.appendChild(row); w.appendChild(box2);
        if (rec.n && rec.k) note(fmt(X.bw_mine, { n: rec.n }), "note", "status");
        set(null); return;
      }
      if (rec.z) {   // an older sign-up link after the draw: no sign-up, no second draw; the drawing phone can send the draw again
        var again = BG.isDraw(rec.zd) && Tn.play(doc, [rec.zd], Tn.today());
        note(again ? X.bw_again_send : X.bw_was, "note", "status");
        if (again) { ctx.ed.next = again; A().changed(); } else set(null);
        return;
      }
      var me = mine();
      note(list.length ? fmt(X.bw_in, { n: list.length, s: list.map(function (e) { return e[0]; }).join(", ") }) : X.bw_nobody, "note", "status");
      if (me >= 0) note(fmt(rec.o ? X.bw_mine : X.bw_added, { n: list[me][0] }), "note", "status");
      else {
        var f = el("input", "field"), add = el("button", "btn", X.bw_add, async function () {
          var name = Q.clean(f.value, 12);
          if (!name) { K.toast(f.value.trim() ? K.t("filter") : X.bw_name); f.focus(); return; }
          if (list.some(function (e) { return Q.fold(e[0]) === Q.fold(name); })) { K.toast(X.bw_twice); return; }
          if (list.length >= BG.MAX) { K.toast(X.bw_full); return; }
          add.disabled = true;
          try { if (!rec.k || !rec.p) { var kp = await S.keys(); rec.k = kp.k; rec.p = kp.p; } } catch (e) { add.disabled = false; K.toast(X.bw_nokey); return; }
          rec.n = name; list = list.concat([[name, rec.p]]); rec.r = list; K.save(); K.sfx.pop(); draw();
        });
        f.maxLength = 12; f.autocomplete = "off"; f.placeholder = X.bw_name; f.setAttribute("aria-label", X.bw_name);
        var nick = A().me().nick; if (nick && Q.clean(nick, 12) === nick) f.value = nick;
        w.appendChild(f); w.appendChild(add); note(X.bw_add_hint);
      }
      if (rec.o) {
        note(X.bw_org);
        var go = el("button", "btn hot", fmt(X.bw_draw, { n: list.length }), async function () {
          if (list.length < 3) { K.toast(X.bw_least); return; }
          go.disabled = true;
          var d = null;
          try {
            var sealed = await S.draw(list.map(function (e) { return e[1]; }), info, BG.circle);
            d = Tn.play(doc, [[list.map(function (e) { return e[0]; }), sealed[0], sealed[1]]], Tn.today()); sealed = null;
          } catch (e) { d = null; }
          if (!d || !fits(d)) { go.disabled = false; K.toast(d ? X.bw_big : X.bw_nokey); return; }
          rec.z = 1; rec.zd = Tn.moves(d)[1][0]; K.save(); K.sfx.pop();   // only the boxes, as in the link
          ctx.ed.next = d; A().changed();
          w.textContent = ""; note(X.bw_drawn, "note", "status");
        });
        if (list.length < 3) { go.setAttribute("aria-disabled", "true"); go.title = X.bw_least; }
        w.appendChild(go); if (list.length < 3) note(X.bw_least);
      } else note(X.bw_wait);
      // a phone that signed up sends its sign-up back; the setting-up phone can pass the list on to those still missing
      if (list.length && (me >= 0 || rec.o)) { ctx.ed.next = out(); A().changed(); } else set(null);
    }
    draw();
  });
})(window);
