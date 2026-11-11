/* My Daily Idea: the Robot and the Magic (the part "robot", next to the free card's "erschaffen").
   Robot (window.FreeFromCard): any card of the deck becomes a free card. The base is the deck card (the server loads it by its
   catalog id) plus the person's own edits; one sentence ("Wie soll die Karte anders werden?") changes it through the free
   card's own refine step (wrapper lib/duell-karte.mjs runKarte with data.base: the AI kind "karte", same pot, receipts, seal,
   accept/discard). Every further sentence refines the last result the same way. The card stays visible above the sheet.
   Magic (window.Magic): fills what a card still needs, on the device and from the card's own seed: the empty entries of a
   list (the options of "Worauf einigen wir uns?", names as "Person 1" ...), or the dice of the editor (style, colours,
   stickers). No AI, no network, no personal data invented.
   API for the bubbles (blasen.js): FreeFromCard.can(doc) -> bool, FreeFromCard.open(doc); Magic.can(doc, panel) -> bool,
   Magic.fill(doc, panel) -> Promise<number of filled parts>. */
(function (root) {
  "use strict";
  var CSS = ".robot{position:fixed;left:0;right:0;bottom:0;z-index:40;max-height:62vh;overflow:auto;background:#fff6dc;color:#111;border-top:4px solid #111;box-shadow:0 -6px 0 rgba(0,0,0,.18);padding:12px 16px calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}" +
    ".robot h2{margin:0;font:400 20px/1.1 var(--disp);text-transform:uppercase;display:flex;align-items:center;gap:8px}.robot h2 button{margin-left:auto;min-width:44px;min-height:44px;border:0;background:none;font-size:22px;color:inherit}" +
    ".robot .field{width:100%;box-sizing:border-box}.robot .row{display:flex;gap:8px;flex-wrap:wrap}" +
    ".robotpv{position:relative;margin:4px 0;padding:14px 14px 28px;border:3px solid #111;border-radius:6px;box-shadow:0 4px 0 #111;display:flex;flex-direction:column;gap:6px}.robotpv b{font:400 20px/1.1 var(--disp);text-transform:uppercase}.robotpv span{font:700 15px/1.3 var(--ui)}.robotpv i{position:absolute;right:8px;bottom:6px;background:#111;color:#fff;font:800 11px/1 var(--ui);font-style:normal;padding:4px 6px;border-radius:4px}";
  var KINDS = ["card", "photo", "sound", "game", "lauf", "turn", "duel", "table", "arcade", "tool"];
  var DICE = ["card", "photo", "sound", "game"];
  var A, Kit, t, el, D, F;
  function init() { A = root.DailyApp; Kit = root.Kit; t = Kit.t; el = A.el; D = root.Daily; F = root.Frei; style(); }
  function style() { if (document.getElementById("robotcss")) return; var s = document.createElement("style"); s.id = "robotcss"; s.textContent = CSS; document.head.appendChild(s); }

  // The deck card's id when the doc is still that card (not someone's free card): the server takes the card from its catalog.
  function deckId(doc) { return doc && typeof doc.i === "string" && !(doc.ki && doc.ki.k === "karte") && (D.byId(doc.i) || (F && F.TOOL_IDS[doc.i])) ? doc.i : ""; }
  // What goes out as the base: the doc as the free card keeps it (src/frei.js), never more.
  function baseOf(doc) { return F ? F.sanitize(doc) : null; }
  /** true when this card can become a free card: a known kind, and either a deck card or a free card of one */
  function can(doc) {
    if (!doc || KINDS.indexOf(doc.k) < 0) return false;
    if (root.DailyFlavor && root.DailyFlavor.feats && root.DailyFlavor.feats.indexOf("f_create") < 0) return false;
    return !!deckId(doc) || !!(baseOf(doc) && (doc.ki && doc.ki.k === "karte" || doc.i));
  }

  var sheet = null;
  function close() { if (sheet) { sheet.remove(); sheet = null; } }
  // the server's count of this account (as create-ui.js): an account and 16+, else the way to sign in there
  async function status() {
    try { var r = await root.Ai.post("/status", { device: Kit.store.aiDev || undefined }); return r.json && r.json.create ? r.json.create : null; } catch (e) { return null; }
  }
  /* Optional waiting screen (src/warten.js, PR #217): when the build has the part "warten", its steps follow ai.js block's
     phase(); without it the button's own "… Denkt nach" stays. */
  function waiting(text) {
    var h = null, gone = false, q = [], has = root.DailyParts && root.DailyParts.warten;
    function call(m, a) { if (gone) return; if (h) h[m].apply(h, a); else q.push([m, a]); }
    if (has) root.Parts.need("warten").then(function () {
      if (gone || !root.Warten) return;
      h = root.Warten.open({ text: text, fig: "🤖", t: t, onCancel: function () { gone = true; }, onClose: function () { gone = true; } });
      q.forEach(function (c) { h[c[0]].apply(h, c[1]); }); q = [];
    }, function () { gone = true; });
    return { phase: function (s, x) { if (!has) return; if (s === "end") { if (x) call("end", [x]); else if (h) h.close(); } else call("phase", [s, x]); }, close: function () { gone = true; if (h) h.close(); } };
  }
  /** Opens the Robot for this card. -> Promise of the sheet (or nothing when the card cannot). */
  function open(doc) {
    init();
    if (!can(doc)) { Kit.toast(t("create_robot_no")); return Promise.resolve(null); }
    close();
    var box = sheet = el("section", "robot"), head = el("h2", "", "🤖 " + t("create_robot_h"));
    box.id = "robot"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", t("create_robot_h"));
    head.appendChild(el("button", "", "✕", function () { Kit.sfx.tap(); if (root.Ai && root.Ai.drop) root.Ai.drop(); close(); }));
    head.lastChild.setAttribute("aria-label", t("create_robot_close"));
    box.appendChild(head);
    var body = el("div", "robotb"); box.appendChild(body); body.appendChild(el("p", "note", "…"));
    document.body.appendChild(box);
    return status().then(function (m) { if (sheet === box) fill(body, doc, m); return box; });
  }
  function fill(b, doc, m) {
    b.textContent = "";
    if (!m) {   // no account (or offline): the free card's own way in, which explains and signs in
      b.appendChild(el("p", "note", t("create_login_h", { m: 5 })));
      b.appendChild(el("button", "btn hot", t("create_login"), function () { close(); if (root.CreateUI) root.CreateUI.open(); }));
      return;
    }
    if (m.off) { b.appendChild(el("p", "note", t("create_off"))); return; }
    if (m.age16 !== true) { b.appendChild(el("p", "note", t("create_age16"))); return; }
    var first = deckId(doc), base = baseOf(doc) || null, round = 0;
    var ta = el("textarea", "field"); ta.id = "robottext"; ta.rows = 2; ta.maxLength = 200; ta.placeholder = t("create_robot_ph"); ta.setAttribute("aria-label", t("create_robot_l"));
    b.appendChild(el("label", "lbl", t("create_robot_l"))); b.appendChild(ta);
    var left = el("p", "aicount robot-left", m.remaining > 0 ? t("create_left", { n: m.remaining, m: m.size }) : t("create_none", { m: m.size }));
    b.appendChild(left);
    if (m.remaining <= 0) return;
    var w = null;
    root.Ai.block(b, {
      kind: "karte", label: t("create_robot_go"), el: el, noteLast: true,
      raw: function () { return ta.value; },
      // round 1: the deck card by its id plus the person's edits; later rounds: the last result (no id, it is a free card now)
      input: function () {
        var s = String(ta.value || "").trim(); if (s.length < 3) return null;
        w = waiting(s);
        var o = { text: s.slice(0, 200) }; if (round === 0 && first) o.from = first; if (base) o.base = base; return o;
      },
      phase: function (s, x) { if (w) w.phase(s, x); },
      wall: function () {}, show: function () { return ""; }, apply: function () { return false; },
      notyet: function (r, res) {
        if (w) w.close();
        res.textContent = "";
        res.appendChild(el("p", "note aistate", r.notyet && r.notyet.what === "same" ? t("create_robot_same") : t("create_notyet")));
      },
      auto: function (opt, ki, res, note) {
        if (w) w.close();
        var d = opt && opt.doc ? baseOf(opt.doc) : null;
        if (!d || !ki || !ki.s || (base && d.k !== base.k)) { res.textContent = ""; res.appendChild(el("p", "note aistate", t("create_bad"))); return false; }
        return new Promise(function (done) {
          res.textContent = "";
          var pv = preview(d); pv.tabIndex = -1; res.appendChild(pv);
          try { pv.focus(); } catch (e) {}
          [].concat(note || []).forEach(function (c) { var mm = /^skip:([a-z]{2,12})$/.exec(String(c)); if (mm && F.MISSING.indexOf(mm[1]) >= 0) res.appendChild(el("p", "note robotskip", t("create_skip", { x: t("create_skip_" + mm[1]) }))); });
          var row = el("div", "row");
          row.appendChild(el("button", "btn hot", t("create_take"), function () {
            Kit.sfx.pop();
            var sk = opt.ki && opt.ki.k === "karte" ? D.sanitizeKi(opt.ki) : null;
            var take = JSON.parse(JSON.stringify(d)); take.ki = sk && sk.s ? sk : { k: "karte", s: ki.s, h: ki.h };
            done(true); close(); setTimeout(function () { use(take); }, 0);
          }));
          var was = base, wasRound = round;
          row.appendChild(el("button", "btn", t("create_drop"), function () { Kit.sfx.tap(); res.textContent = ""; base = was; round = wasRound; ta.placeholder = t("create_robot_ph"); done(false); }));
          res.appendChild(row);
          // one more sentence refines this result (a new round: this one, if not taken, goes back as "Verwerfen")
          base = d; round++; ta.value = ""; ta.placeholder = t("create_robot_more");
          status().then(function (mm) { if (mm) left.textContent = mm.remaining > 0 ? t("create_left", { n: mm.remaining, m: mm.size }) : t("create_none", { m: mm.size }); });
        });
      }
    });
    // the count of ai.js is the weekly pot of the other AI actions; this card counts in the free card's own (robot-left)
    var other = b.querySelector(".aibox .aicount"); if (other) other.hidden = true;
    try { ta.focus(); } catch (e) {}
  }
  // The result as a small sheet in its colours with the AI badge: its title and what it is (the kind's own words).
  function lines(d) {
    var idea = d.i ? D.byId(d.i) : null, L = idea ? idea[Kit.lang] || idea.de : null, out = [];
    if (d.k === "card" || d.k === "photo") out.push([d.x, d.y].filter(Boolean).join(" … "));
    if (d.k === "game" && d.g) out.push(d.g.emoji + " " + d.g.title);
    if (d.k === "sound") out.push(d.x + " · " + d.bpm + " BPM");
    if (d.s) out.push(d.s);
    if (d.fa && d.fa.e) out.push(d.fa.e);
    if (d.fa && d.fa.w) out.push(t("arc_win", { n: d.fa.w }));
    if (d.fa && d.fa.r) out.push("⚖ " + d.fa.r.join(" · "));
    if (d.fa && d.fa.x) out.push(d.fa.x);
    if (L) out.push(t("create_uses", { x: D.plainTitle(L.t) }));
    return out.filter(Boolean);
  }
  function lum(h) { var v = [1, 3, 5].map(function (i) { var x = parseInt(String(h).substr(i, 2), 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
  function preview(d) {
    var box = el("figure", "robotpv"), c = Array.isArray(d.col) ? d.col : ["#ffd400", "#111111"];
    box.id = "robotpv"; box.style.background = c[0]; box.style.color = lum(c[0]) < 0.18 ? "#fff" : "#111";   // readable on its own colour
    box.setAttribute("role", "img");
    var ls = lines(d); box.setAttribute("aria-label", [d.t].concat(ls, [t("kiBadgeL")]).filter(Boolean).join(". "));
    if (d.t) box.appendChild(el("b", "", d.t));
    ls.forEach(function (l) { box.appendChild(el("span", "", l)); });
    box.appendChild(el("i", "", t("kiBadgeL")));
    return box;
  }
  // A taken free card: the kinds the editor has open in it as the person's own (as create-ui.js does); an arcade duel or a
  // tool is kept on this device (Kit.store.frei, at most 12) and opened where it is played.
  function use(d) {
    if (d.k === "arcade" || d.k === "tool") {
      var list = (Array.isArray(Kit.store.frei) ? Kit.store.frei : []).map(baseOf).filter(Boolean).filter(function (x) { return !(x.ki && d.ki && x.ki.s === d.ki.s); });
      list.unshift(d); Kit.store.frei = list.slice(0, 12); Kit.save();
      if (d.k === "arcade" && root.ArcadeUI) root.ArcadeUI.menu(d.a, d);
      else Kit.toast(t("create_robot_kept"));
      return;
    }
    A.openEditor(d, { own: true, made: true, idea: d.i ? D.byId(d.i) : null });
  }

  // ---------- Magic: fill what is still open, on the device ----------
  var POOL = {
    de: ["Pizza", "Kino", "Spieleabend", "Picknick", "Bowling", "Kochen", "Spaziergang", "Minigolf", "Museum", "Eis essen", "Schwimmen", "Karaoke", "Flohmarkt", "Grillen", "Escape Room", "Serienabend"],
    en: ["Pizza", "Cinema", "Game night", "Picnic", "Bowling", "Cooking", "A walk", "Mini golf", "Museum", "Ice cream", "Swimming", "Karaoke", "Flea market", "Barbecue", "Escape room", "Series night"]
  };
  function lists(panel) { return panel ? Array.prototype.slice.call(panel.querySelectorAll("input.tlist")) : []; }
  function empty(panel) { return lists(panel).filter(function (f) { return !String(f.value || "").trim(); }); }
  function seedOf(doc) { return doc && doc.seed != null ? doc.seed : doc && doc.i || doc && doc.k || "x"; }
  /** true when Magic has something to fill here: empty list entries in the panel, or a sheet the dice can roll */
  function magicCan(doc, panel) {
    if (!doc) return false;
    if (empty(panel).length) return true;
    return DICE.indexOf(doc.k) >= 0 && !!root.Wish && !!(root.DailyApp && root.DailyApp.ed && root.DailyApp.ed());
  }
  /** Fills them; -> Promise of how many parts it filled (0: nothing to do). Names stay placeholders, never invented. */
  function magicFill(doc, panel) {
    init();
    var fs = empty(panel);
    if (fs.length) {
      var have = lists(panel).map(function (f) { return String(f.value || "").trim().toLowerCase(); }).filter(Boolean);
      var named = /name|wic|wer|who/i.test(fs[0].getAttribute("data-l") || "");
      var R = mul(hash(String(seedOf(doc)) + "|magic|" + (Kit.store.magicN = (Kit.store.magicN || 0) + 1))), pool = (POOL[Kit.lang] || POOL.de).slice(), n = 0;
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), x = pool[i]; pool[i] = pool[j]; pool[j] = x; }
      fs.forEach(function (f, k) {
        var max = f.maxLength > 0 ? f.maxLength : 16, v = named ? t("create_magic_person", { n: lists(panel).indexOf(f) + 1 }) : pool.filter(function (p) { return have.indexOf(p.toLowerCase()) < 0; })[0] || "";
        if (!v) return;
        have.push(v.toLowerCase()); f.value = v.slice(0, max); f.dispatchEvent(new Event("input", { bubbles: true })); n++;
      });
      Kit.save();
      return Promise.resolve(n);
    }
    // the editor's own dice (blasen.js Dice): style, colours, stickers, a card's line from its idea; no AI, no count
    var ed = root.DailyApp.ed(), W = root.Wish, st = root.DailyApp.style;
    if (!ed || !W || DICE.indexOf(ed.doc.k) < 0) return Promise.resolve(0);
    var d = ed.doc, key = d.seed != null ? d.seed : d.i || d.k, seed = key + "|" + st.roll(key);
    var linesOf = ed.idea && d.k === "card" ? root.DailyApp.ideaText(ed.idea).lines : null;
    root.DailyApp.setDoc(W.apply(d, W.dice(d, seed, st.PAIRS, linesOf), st.PAIRS, st.seeded(seed + "|sk")));
    return Promise.resolve(1);
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mul(a) { return function () { a = (a + 0x6D2B79F5) | 0; var x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

  root.FreeFromCard = { can: function (doc) { if (!F) init(); return can(doc); }, open: open, close: close };
  root.Magic = { can: magicCan, fill: magicFill };
})(typeof globalThis !== "undefined" ? globalThis : this);
