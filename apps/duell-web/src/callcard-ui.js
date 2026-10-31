/* "Ruf mich an": building the card, playing the quiz, the request and the creator's answer. Peer data goes into text
   nodes only. The call itself is not here yet: the end of the road is an accepted channel and an honest note. */
(function () {
  "use strict";
  var Kit = window.Kit, CC = window.CallCard, t = Kit.t;
  var ctx = null, ui = null, gate = null, card = null, role = "", code = "", timer = 0;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function now() { return Date.now(); }
  function host() { return window.DuellHost; }
  function book() { var b = Kit.store.ccBook; if (!b || typeof b !== "object") b = Kit.store.ccBook = {}; return b; }
  function who() { return (card && card.n) || t("someone"); }
  function say(text, acts) { ui.sheet(t("cc_title"), text, acts); }
  function closeBtn() { return ui.btn(t("co_close"), false, ui.close); }
  function blockBtn() { return ui.btn(t("cc_block"), false, block); }
  function clear() { clearInterval(timer); timer = 0; }
  function finish() { clear(); ui.release(); gate = null; role = ""; code = ""; }
  function leave() { try { host().peerLeave(); } catch (e) {} finish(); }
  function closeAll() { leave(); ui.close(); }
  function block() { if (gate) gate.tap("block"); leave(); say(t("cc_blocked"), [closeBtn()]); }
  function send(f) { try { host().peerSend(f); } catch (e) {} }
  function usable() {
    if (!ui.bridged()) { say(t("co_app"), [closeBtn()]); return false; }
    if (!ui.ready()) { say(t("co_soon"), [closeBtn()]); return false; }
    if (ui.busy()) { Kit.toast(t("co_busy")); return false; }
    return true;
  }
  function accepted() { say(t("cc_open"), [ui.btn(t("cc_end"), true, closeAll), blockBtn()]); }

  /* ---------- creator ---------- */
  function build() {
    var me = ctx.me(), draft = { col: me.colors.slice(), f: [] };
    ctx.shelf(t("cc_title"), function (b) {
      b.appendChild(el("p", "note", t("cc_intro")));
      for (var i = 0; i < CC.QUESTIONS; i++) {
        var q = el("input", "field"), a = el("input", "field");
        q.maxLength = CC.MAX_Q; a.maxLength = CC.MAX_A; q.autocomplete = a.autocomplete = "off";
        q.setAttribute("aria-label", t("cc_q", { n: i + 1 })); a.setAttribute("aria-label", t("cc_a", { n: i + 1 }));
        b.appendChild(el("label", "lbl", t("cc_q", { n: i + 1 }))); b.appendChild(q);
        b.appendChild(el("label", "lbl", t("cc_a", { n: i + 1 }))); b.appendChild(a);
        draft.f.push([q, a]);
      }
      b.appendChild(el("label", "lbl", t("colors")));
      ctx.colors(b, function () { return draft.col; }, function (c) { draft.col = c; });
      var go = el("button", "btn hot", t("cc_send")); go.type = "button"; go.id = "ccsend";
      go.addEventListener("click", function () {
        var made = CC.create({ qs: draft.f.map(function (p) { return { q: p[0].value, a: p[1].value }; }), nick: ctx.me().nick, emoji: ctx.me().emoji, col: draft.col }, now());
        if (!made) { Kit.toast(t("cc_incomplete")); return; }
        if (usable()) invite(made);
      });
      b.appendChild(go);
    });
  }
  function invite(made) {
    card = made; role = "creator"; gate = CC.gate();
    ui.claim(onEvent);
    say(t("co_making"), [ui.btn(t("co_cancel"), false, closeAll)]);
    timer = setInterval(watch, 500);
    try { host().peerInvite(); } catch (e) { closeAll(); }
  }
  function watch() {
    if (!gate) return;
    if (gate.tick(now())) { send(CC.frame("no")); leave(); say(t("cc_timeout"), [closeBtn()]); return; }
    if (now() >= card.x && gate.expire()) { leave(); say(t("cc_expired"), [closeBtn()]); }
  }
  function ask() {
    var n = gate.who() || t("someone");
    say(t("cc_asked", { n: n, c: code }), [
      ui.btn(t("co_accept"), true, function () { if (gate.tap("accept")) { send(CC.frame("ok")); clear(); accepted(); } }),
      ui.btn(t("cc_decline"), false, function () { if (gate.tap("decline")) { send(CC.frame("no")); closeAll(); } }),
      blockBtn()
    ]);
  }

  /* ---------- recipient ---------- */
  function quiz(c, frag) {
    card = c;
    ctx.shelf(t("cc_title"), function (b) {
      var head = el("div", "cccard"); head.style.background = c.col[0]; head.style.color = ctx.ink(c.col[0]);
      head.appendChild(el("b", "", c.e + " " + (c.n || t("someone")))); head.appendChild(el("p", "", t("cc_card"))); b.appendChild(head);
      b.appendChild(el("p", "note", t("cc_game")));
      var fields = c.q.map(function (q, i) {
        var f = el("input", "field"); f.maxLength = CC.MAX_A; f.autocomplete = "off"; f.setAttribute("aria-label", q.t);
        b.appendChild(el("label", "lbl", (i + 1) + ". " + q.t)); b.appendChild(f); return f;
      });
      var res = el("p", "note", ""); res.id = "ccres"; res.setAttribute("role", "status"); b.appendChild(res);
      var go = el("button", "btn hot", t("cc_check")); go.type = "button"; go.id = "cccheck";
      go.addEventListener("click", function () {
        var r = CC.answer(c, fields.map(function (f) { return f.value; }), book(), now()); Kit.save();
        if (r.state === "wrong") { res.textContent = t("cc_wrong", { h: r.hit, left: r.left }); return; }
        if (r.state === "passed") { say(t("cc_passed", { n: who() }), [ui.btn(t("cc_request"), true, function () { request(frag); }), ui.btn(t("co_no"), false, ui.close)]); return; }
        say(t(r.state === "expired" ? "cc_expired" : r.state === "used" ? "co_used" : "cc_locked"), [closeBtn()]);
      });
      b.appendChild(go);
    });
  }
  // Only here does the link get used: the single-use invite is spent by a tap after the quiz, not by opening it.
  function request(frag) {
    role = "recipient"; ui.claim(onEvent);
    say(t("co_joining"), [ui.btn(t("co_cancel"), false, closeAll), blockBtn()]);
    try { host().peerAccept(ui.link(frag)); } catch (e) { closeAll(); }
  }

  /* ---------- events from the shell ---------- */
  function onEvent(m) {
    if (m.t === "invite" && role === "creator" && typeof m.link === "string") {
      var enc = CC.encode(card); if (!enc) { closeAll(); return; }
      var full = m.link + "&k=" + enc;
      say(t("cc_waiting"), [ui.btn(t("cc_direct"), true, function () { Kit.sfx.tap(); try { host().share(full, t("cc_shareText")); } catch (e) {} }), ui.btn(t("co_cancel"), false, closeAll)]);
    } else if (m.t === "connected") {
      code = typeof m.code === "string" && /^[0-9 ]{1,12}$/.test(m.code) ? m.code : "";
      if (role === "recipient") { send(CC.frame("req", ctx.me().nick)); say(t("cc_sent", { n: who() }), [ui.btn(t("co_cancel"), false, closeAll), blockBtn()]); }
      else if (gate.state() === "wait") say(t("cc_there"), [ui.btn(t("co_cancel"), false, closeAll), blockBtn()]);
    } else if (m.t === "msg") {
      var f = CC.parseFrame(m.body); if (!f) return;
      if (role === "creator" && f.a === "req" && gate.request(f.n, now())) ask();
      if (role === "recipient" && f.a === "ok") accepted();
      if (role === "recipient" && f.a === "no") { leave(); say(t("cc_no", { n: who() }), [closeBtn()]); }
    } else if (m.t === "peer-left" || m.t === "closed") {
      leave(); say(t("co_ended"), [closeBtn()]);
    } else if (m.t === "error") {
      var e = m.e; finish();
      if (e === "login") say(t("co_login"), [ui.btn(t("co_loginGo"), true, function () { ui.close(); ctx.more(); }), ui.btn(t("co_cancel"), false, ui.close)]);
      else say(t(e === "used" ? "co_used" : e === "expired" ? "cc_expired" : e === "invalid" ? "co_bad" : "co_fail"), [closeBtn()]);
    }
  }

  window.CallCardUI = {
    init: function (c, collab) {
      ctx = c; ui = collab;
      return {
        tile: function (b) {
          var m = el("button", "mech", "📞 " + t("cc_tile")); m.type = "button"; m.id = "cctile";
          m.addEventListener("click", function () { Kit.sfx.thud(); build(); }); b.appendChild(m);
        },
        // #p=<invite>&k=<card>: opened by the person it was sent to. Nothing happens on the network yet.
        route: function (hash) {
          var m = /^#?p=([A-Za-z0-9_-]{40,1024})&k=([A-Za-z0-9_-]{1,1500})$/.exec(hash || ""); if (!m) return false;
          var c = CC.decode(m[2]);
          if (!c) { say(t("co_bad"), [closeBtn()]); return { keep: false }; }
          if (!usable()) return { keep: false };
          if (now() >= c.x) { say(t("cc_expired"), [closeBtn()]); return { keep: false }; }
          quiz(c, m[1]); return { keep: true };
        }
      };
    }
  };
})();
