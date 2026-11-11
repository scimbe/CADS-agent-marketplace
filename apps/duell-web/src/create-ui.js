/* My Daily Idea: "Create your own card" (freie Karte, W2), the part "erschaffen". One sentence becomes a card: the server's
   AI kind "karte" (login account only, 16 and older, its own pot of free cards) checks the sentence, makes the card and
   checks it again (CADS-DEMO-wrapper lib/duell-karte.mjs). Here: the form, an honest count, a preview with the AI badge,
   then "Übernehmen" (the editor, own:true, the card is final and never made again) or "Verwerfen" (the unit comes back).
   The typed text is checked for a crisis on the device first (ai.js CRISIS_KINDS). Only the text leaves the device, never
   a photo: a meme gets its captions, the photo is added in the editor. No count of views, no streak, no countdown. */
(function (root) {
  "use strict";
  var ARTS = ["card", "meme", "game", "sound", "quiz", "faehigkeit"];
  // the kind of doc each art comes back as: anything else is refused and given back, never shown or booked (never arcade)
  var KIND_OF = { card: "card", meme: "photo", game: "game", sound: "sound", quiz: "turn", lauf: "lauf" };
  // asked: the art chosen here; art: the one the server made. A game wish the server reads as a runner or a jump'n'run comes
  // back as art "lauf" (the second engine, src/lauf.js), never as a flying game; nothing else may change the art.
  function artOk(asked, art) { return art === asked || (asked === "game" && art === "lauf"); }
  function kindOk(art, doc) {
    if (art === "faehigkeit") return (doc.k === "turn" || doc.k === "duel") && !!doc.i;   // an existing card of the catalog
    if (art === "quiz") return doc.k === "turn" && !!doc.pk;                              // a quiz has its questions
    if (art === "sound") return doc.k === "sound" && !!(doc.ly && doc.ly.length);
    return doc.k === KIND_OF[art];
  }
  // the preview's own look, part of this part and not of the core (scripts/build.js budget)
  var CSS = ".cr16{display:flex;gap:12px;align-items:center;min-height:44px;margin:8px 0;font-weight:600}.cr16 input{width:28px;height:28px;margin:0;flex:none;accent-color:#17140f}.crneed{margin:0;color:#b3321f;font-weight:700}.crneed:empty{display:none}" +
    ".createpv{position:relative;margin:10px 0;padding:18px 16px 30px;border:3px solid #111;border-radius:6px;display:flex;flex-direction:column;gap:8px;min-height:150px;box-shadow:0 5px 0 #111}.createpv-t{font:900 20px/1.1 var(--disp);text-transform:uppercase}.createpv-x{font:800 18px/1.25 var(--ui)}.createpv-sk{font-size:26px}.createpv-photo{border:2px dashed currentColor;padding:18px 8px;font:700 13px/1.3 var(--ui);text-align:center}.createpv-ki{position:absolute;right:8px;bottom:6px;background:#111;color:#fff;font:800 11px/1 var(--ui);padding:4px 6px;border-radius:4px}.createalt{width:100%;box-sizing:border-box;border:3px solid #111;border-radius:6px;padding:12px;margin:10px 0;display:flex;flex-direction:column;gap:8px}.createalt .row{padding:0}";
  function style() { if (document.getElementById("createcss")) return; var s = document.createElement("style"); s.id = "createcss"; s.textContent = CSS; document.head.appendChild(s); }
  var A, Kit, t, el, D;
  var state = { art: "card", meter: null, account: false, net: true };

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
  // 16+ and 18+ are the server's to read: the account's own statement in its profile ("Mein Stil"), a self-declaration
  // (Selbstauskunft) that nobody verifies; this page sends no age at all.
  // the label of an art's chip ("🕹 Spiel"); the waiting screen takes its figure from the same label, so the two never differ
  function artLabel(k) { return t("create_art_" + k); }
  function chipRow(list, now, label, pick) {
    var row = el("div", "chips"); row.setAttribute("role", "group"); row.setAttribute("aria-label", label);
    list.forEach(function (c) {
      var b = el("button", "chip" + (c[0] === now ? " on" : ""), c[1], function () { Kit.sfx.tap(); pick(c[0]); });
      b.setAttribute("aria-pressed", String(c[0] === now)); row.appendChild(b);
    });
    return row;
  }

  /* The waiting screen (src/warten.js, the part "warten", only on demand): asked for when the form is shown, opened at the
     tap. Its steps come from ai.js block (phase); a call before the part is there waits for it. Without the part (offline,
     a broken bundle) the button's own "… Denkt nach" stays, as before. */
  function waiting(text, art, ta, res) {
    var h = null, q = [], gone = false, me = { cancelled: false, end: null };
    function call(m, a) { if (gone) return; if (h) h[m].apply(h, a); else q.push([m, a]); }
    root.Parts.need("warten").then(function () {
      if (gone || !root.Warten) return;
      h = root.Warten.open({
        text: text, fig: String(artLabel(art)).split(" ")[0], t: t,
        // cancel: the panel is free again at once; a late answer goes back (ai.js block), so it costs what "Verwerfen" costs
        onCancel: function () {
          gone = true; me.cancelled = true; if (me.go) me.go.cancel();
          res.textContent = ""; var n = el("p", "note aistate", t("create_wait_cancelled")); n.setAttribute("role", "status"); res.appendChild(n);
          try { ta.focus(); } catch (e) {}
        },
        onClose: function () { gone = true; try { (res.querySelector(".createalt button, .chip") || ta).focus(); } catch (e) {} }
      });
      q.forEach(function (c) { h[c[0]].apply(h, c[1]); }); q = [];
    }, function () { gone = true; });
    me.phase = function (s, x) { if (s === "end") { if (x) call("end", [x]); else me.close(); } else call("phase", [s, x]); };
    me.end = function (m) { call("end", [m]); };
    me.close = function () { if (h) h.close(); gone = true; };
    // the card is there: shown in the frame, then the screen goes; without the screen at once
    me.reveal = function (doc, node) { if (h && !gone) { gone = true; return h.reveal(doc, node); } gone = true; return Promise.resolve(); };
    return me;
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
      // one short step, no failing later: the 16+ statement of this very tap (as the account card, profile.js: an attempt
      // with t0 and age16), then the sign-in; the way back (?go=erschaffen, start-ui.js) opens this making again
      var lab = el("label", "cr16"), cb = el("input"), need = el("p", "crneed", "");
      cb.type = "checkbox"; cb.id = "create16"; lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + t("create_16")));
      need.setAttribute("role", "alert");
      var go = el("button", "btn hot", t("create_login"), function () {
        if (!cb.checked) { need.textContent = ""; cb.focus(); setTimeout(function () { need.textContent = t("create_need"); }, 80); return; }   // never a locked look
        Kit.store.profile = { via: "account", rev: 0, base: null, age16: true, t0: Date.now() };
        Kit.save();   // an attempt is not synced (profile.js Kit.save: only a done link)
        location.href = root.DuellCore.loginPath((root.Ai && root.Ai.loginReturn ? root.Ai.loginReturn(root.DailyFlavor) : "/duell") + "?go=erschaffen", Kit.lang);
      });
      go.id = "createlogin";
      cb.addEventListener("change", function () { if (cb.checked) need.textContent = ""; });
      b.appendChild(lab); b.appendChild(need); b.appendChild(go); b.appendChild(el("p", "note", t("create_free")));
      return;
    }
    // switched off on the server (DUELL_KARTE_OFF): said kindly, nothing else
    if (state.meter && state.meter.off) { b.appendChild(el("p", "note", t("create_off"))); return; }
    // 16+ only with the account's own statement, a self-declaration (Mein Stil, Anmelden / Registrieren); no way past it here.
    // 18+ is never sent: the server reads the account's self-declaration (profile.js syncs the age band "18+ (eigene Angabe)")
    if (!state.meter || state.meter.age16 !== true) { b.appendChild(el("p", "note", t("create_age16"))); return; }

    root.Parts.need("warten").catch(function () {});   // the waiting screen, before the first tap (on demand, see waiting())
    b.appendChild(el("p", "note", t("create_h")));
    b.appendChild(el("p", "note", t("create_art")));
    var arts = chipRow(ARTS.map(function (k) { return [k, artLabel(k)]; }), state.art, t("create_art"), function (v) { state.art = v; fill(b); });
    b.appendChild(arts);
    var ta = el("textarea", "field");
    ta.id = "createtext"; ta.rows = 3; ta.maxLength = 200; ta.placeholder = t("create_ph"); ta.setAttribute("aria-label", t("create_label"));
    b.appendChild(ta);
    var ex = el("div", "chips");
    t(state.art === "card" ? "create_ex" : "create_ex_" + state.art).split("|").forEach(function (s) { ex.appendChild(el("button", "chip", s, function () { ta.value = s; ta.focus(); })); });
    b.appendChild(ex);
    var left = el("p", "aicount create-left", line(state.meter)); left.setAttribute("aria-live", "polite");
    b.appendChild(left);
    b.appendChild(el("p", "note", t("create_rules")));
    // before anything is made: what a discard gives back (no hidden cost)
    if (state.meter && state.meter.remaining > 0) b.appendChild(el("p", "note", state.meter.refundsLeft > 0 ? t("create_drop_n", { n: state.meter.refundsLeft }) : t("create_drop_0")));
    if (state.meter && state.meter.remaining <= 0) return;
    if (state.meter && state.meter.paused) { b.appendChild(el("p", "note", t("create_paused"))); return; }

    // alt: a catalog card (opens by id) or a genre with its sentence, editable; only a tap sends it, as a wish in that genre
    var GENRE_ART = { G1: "game", G2: "game", G11: "quiz" }, ask = "", W = null;
    function altCard(alt) {
      var idea = alt && alt.kind === "katalog" ? D.byId(String(alt.id)) : null;
      var gen = alt && alt.kind === "genre" && /^G\d{1,2}$/.test(alt.id) && typeof alt.satz === "string" && alt.satz;
      if (!idea && !gen) return null;
      var box = el("div", "createalt"), row = el("div", "row"), f;
      box.setAttribute("role", "group"); box.setAttribute("aria-label", t("create_alt"));
      box.appendChild(el("p", "note", t("create_alt")));
      if (idea) {
        box.appendChild(el("b", "", D.plainTitle((idea[Kit.lang] || idea.de).t)));
        row.appendChild(el("button", "btn", t("create_alt_open"), function () { Kit.sfx.thud(); A.openEditor(D.docFromIdea(idea, A.me(), Kit.lang), { idea: idea }); }));
      } else {
        f = el("textarea", "field"); f.id = "createalt"; f.rows = 3; f.maxLength = 200; f.value = alt.satz.slice(0, 200); f.setAttribute("aria-label", t("create_alt_edit"));
        box.appendChild(f);
        row.appendChild(el("button", "btn", t("create_alt_send"), function () {
          Kit.sfx.tap(); var art = GENRE_ART[alt.id] || state.art;
          if (art !== state.art) { state.art = art; arts.querySelectorAll("button").forEach(function (c, i) { var on = ARTS[i] === art; c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); }); }
          ta.value = f.value; ask = alt.id; go(); ask = "";   // a crisis stops before input(): the genre must not ride on the next wish
        }));
      }
      row.appendChild(el("button", "btn", t("create_alt_no"), function () { Kit.sfx.tap(); box.remove(); ta.focus(); }));
      box.appendChild(row);
      return box;
    }
    var go = root.Ai.block(b, {
      kind: "karte", label: t("create_go"), el: el, noteLast: true,
      raw: function () { return ta.value; },
      input: function () { var s = String(ta.value || "").trim(), g = ask; ask = ""; return s.length >= 3 ? Object.assign({ text: s.slice(0, 200), art: state.art }, g ? { genre: g } : {}) : null; },
      wall: function () { left.textContent = line(state.meter); },
      phase: function (s, x) {
        if (s === "send") { if (W) W.close(); W = waiting(String(ta.value || "").trim().slice(0, 200), state.art, ta, b.querySelector(".aibox .chips:last-child") || b); W.go = go; }
        if (W) W.phase(s, x);
      },
      show: function () { return ""; },
      apply: function () { return false; },
      // one card comes back: shown as a preview; the promise says whether it was taken (true) or thrown away (false)
      // cannot make it: the fixed reason and at most one alt of the server's table (wrapper lib/duell-absage.mjs), never model text
      notyet: function (r, res) {
        res.textContent = "";
        var n = r.notyet && typeof r.notyet.name === "string" ? r.notyet.name.slice(0, 30) : "";
        var feat = r.notyet && r.notyet.what === "feature";      // a need no ability covers yet (replies, a card game ...)
        // a reason without a full stop is the name of a game: "… kann die freie Karte noch nicht."
        var k = typeof r.reason === "string" && /^[a-z0-9_]{1,20}$/.test(r.reason) ? "create_absage_" + r.reason : "", why = k && t(k) !== k ? t(k) : "";
        if (why) why = (/\.$/.test(why) ? why : t("create_absage_n", { x: why })) + " " + t("create_absage_0");
        var said = why || (n ? t(feat ? "create_notyet_feature" : "create_notyet_game", { name: n }) : t("create_notyet"));
        res.appendChild(el("p", "note aistate", said));
        if (W) W.end(said);
        var card = altCard(r.alt), aid = card ? r.alt.id : "";
        if (card) res.appendChild(card);
        var cs = (Array.isArray(r.catalog) ? r.catalog : []).filter(function (id) { return String(id) !== aid; }).map(function (id) { return D.byId(String(id)); }).filter(Boolean);
        if (!cs.length) { if (!card) res.appendChild(el("p", "note", t("create_notyet_none"))); return; }
        res.appendChild(el("p", "note", t(feat ? "create_notyet_similar" : "create_notyet_catalog")));
        cs.forEach(function (idea) {
          var L = idea[Kit.lang] || idea.de;
          res.appendChild(el("button", "chip", "→ " + D.plainTitle(L.t), function () { Kit.sfx.thud(); A.openEditor(D.docFromIdea(idea, A.me(), Kit.lang), { idea: idea }); }));
        });
      },
      auto: function (opt, ki, res, note) {
        var doc = opt && opt.doc ? D.sanitizeDoc(opt.doc) : null;
        // what came back must be what was asked for (art and kind); otherwise said so, given back, nothing booked
        var w = W; W = null;
        if (w && w.cancelled) return false;   // cancelled while the answer was checked: given back, nothing shown
        if (!doc || !opt || !artOk(state.art, opt.art) || !kindOk(opt.art, doc) || !ki || !ki.s) { res.textContent = ""; res.appendChild(el("p", "note aistate", t("create_bad"))); if (w) w.end(t("create_bad")); return false; }
        return new Promise(function (done) {
          res.textContent = "";
          var pv = preview(doc); pv.tabIndex = -1; res.appendChild(pv);
          // the waiting screen shows a copy of the card in its frame, then goes; the focus lands on the preview below
          var shown = w ? w.reveal(doc, preview(doc)) : Promise.resolve();
          // what the server says about the card, once each: a drink with alcohol left out (cards reach teenagers too), and the
          // limits of the ability the wish asks beyond ("days:14", "people:4"); unknown codes are not shown
          [].concat(note || []).forEach(function (c) {
            var m = /^(days|people|chars):(\d{1,3})$/.exec(String(c));
            if (c === "drinks") res.appendChild(el("p", "note", t("create_drinks")));
            else if (m) res.appendChild(el("p", "note", t("create_lim_" + m[1], { n: Number(m[2]) })));
            else if (c === "money18" || c === "nosend" || c === "async" || c === "duel") res.appendChild(el("p", "note", t("create_lim_" + c)));
          });
          shown.then(function () { try { pv.focus(); } catch (e) {} });
          var row = el("div", "row");
          row.appendChild(el("button", "btn hot", t("create_take"), function () {
            Kit.sfx.pop();
            // with the deck (W4) the server seals the frozen card itself (ki with the creator tag o); else the page's own hash
            var sk = opt.ki && opt.ki.k === "karte" ? D.sanitizeKi(opt.ki) : null;
            var d = JSON.parse(JSON.stringify(doc)); d.ki = sk && sk.s ? sk : { k: "karte", s: ki.s, h: ki.h };
            // first the receipt is settled as taken (ai.js, in the promise's then), only then the editor: openEditor drops every
            // receipt still open, and this one would be given back instead of booked
            done(true); setTimeout(function () { A.openEditor(d, { own: true, made: true, idea: d.i ? D.byId(d.i) : null }); }, 0);
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

  // What a card that is no plain card shows in the preview: its game, beat, questions or the existing card it uses.
  function lines(doc) {
    if (doc.k === "lauf") return [doc.l.e + " " + (doc.t || ""), t("create_lauf_" + doc.l.m) + " · " + [doc.l.o, doc.l.c, doc.l.f].join(" ")];
    if (doc.k === "game" && doc.g) return [doc.g.emoji + " " + doc.g.title, (doc.g.route || []).map(function (r) { return r.e; }).join(" → ")];
    if (doc.k === "sound") return [doc.x + " · " + doc.bpm + " BPM"].concat(doc.ly || []);
    if (doc.k === "turn" && doc.pk) return [t("create_questions", { n: doc.pk.q.length }), doc.pk.q[0][0]];
    var idea = doc.i ? D.byId(doc.i) : null, L = idea ? idea[Kit.lang] || idea.de : null;
    return [doc.s || "", L ? t("create_uses", { x: D.plainTitle(L.t) }) : ""].filter(Boolean);
  }
  // The card as a small sheet in its colours, with its stickers and the badge. A meme shows where the own photo will go.
  // WCAG contrast of two #rrggbb colours
  function contrast(a, b) {
    var L = function (h) { var v = [1, 3, 5].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    var x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function preview(doc) {
    var plain = doc.k === "card" || doc.k === "photo";
    var box = el("figure", "createpv"), txt = doc.k === "photo" ? [doc.x, doc.y].filter(Boolean).join(" … ") : plain ? doc.x : lines(doc).join(". ");
    // the model's colour pair as it is when the text stays readable (AA for large text), else the print look
    var ok = contrast(doc.col[0], doc.col[1]) >= 3;
    box.style.background = ok ? doc.col[0] : "#ffd400"; box.style.color = ok ? doc.col[1] : "#111111";
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
