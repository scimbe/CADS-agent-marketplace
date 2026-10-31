/* Zusammen bauen, the surface: invite, accept, status, leave. The shell's channel is reached only through
   window.DuellHost (peerReady, peerInvite, peerAccept, peerSend, peerLeave); the shell answers by calling
   window.DuellPeer.onPeerMessage(json). A plain browser has no such bridge and says so instead of relaying.
   All peer data ends up in textContent. */
(function () {
  "use strict";
  var Kit = window.Kit, S = window.Collab, t = Kit.t;
  var $ = function (id) { return document.getElementById(id); };
  var LINK = "https://bunsenbrenner.org/duell#p=", FRAG = /^[A-Za-z0-9_-]{40,1024}$/, TICK_MS = 100;
  var ctx = null, eng = null, timer = 0, phase = "off", code = "", link = "", role = "";

  function host() { return window.DuellHost; }
  function bridged() { var h = host(); return !!h && typeof h.peerInvite === "function"; }
  function ready() { try { return bridged() && !!host().peerReady(); } catch (e) { return false; } }
  function now() { return Date.now(); }
  function btn(label, hot, on) {
    var b = document.createElement("button"); b.type = "button"; b.className = hot ? "btn hot" : "btn"; b.textContent = label; b.addEventListener("click", on); return b;
  }
  function sheet(title, text, acts, qr) {
    $("cotitle").textContent = title; $("cotext").textContent = text;
    var box = $("coacts"); box.textContent = ""; (acts || []).forEach(function (a) { box.appendChild(a); });
    var c = $("coqr"); c.hidden = !qr; if (qr) drawQr(c, qr);
    $("cosheet").hidden = false;
  }
  function closeSheet() { $("cosheet").hidden = true; }
  function drawQr(c, text) {
    var q = window.qrcode(0, "L"); q.addData(text, "Byte"); q.make();
    var n = q.getModuleCount(), k = Math.floor(c.width / (n + 8)), o = Math.floor((c.width - k * n) / 2), g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#000";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect(o + x * k, o + y * k, k, k);
  }
  function status() {
    var bar = $("cobar"), on = phase !== "off" && !$("editor").hidden;
    bar.hidden = !on; if (!on) return;
    var p = eng && eng.peer(), nick = p ? (p.emoji + " " + (p.nick || t("anon"))) : t("someone"), s;
    if (phase === "live") s = eng.peerHere(now()) ? t("co_with", { n: nick }) + (code ? " · " + t("co_code", { c: code }) : "") : t("co_wait");
    else if (phase === "back") s = t("co_back");
    else if (phase === "alone") s = t("co_alone", { n: nick });
    else s = t("co_wait");
    bar.classList.toggle("off", phase === "back" || phase === "alone");
    var el = $("costatus"); if (el.textContent !== s) el.textContent = s;
  }
  function loop() {
    if (!eng) return;
    var e = ctx.ed();
    if (e) { eng.local(e.doc); applyRemote(); }
    eng.tick(now());
    status();
  }
  function startEngine() {
    eng = S.create({
      actor: S.newActor(), nick: function () { return ctx.me().nick; }, emoji: function () { return ctx.me().emoji; },
      onPeer: status,
      send: function (f) { try { host().peerSend(f); } catch (e) { /* the digest repairs it */ } }
    });
    clearInterval(timer); timer = setInterval(loop, TICK_MS);
  }
  function stop() { clearInterval(timer); timer = 0; eng = null; phase = "off"; code = ""; link = ""; role = ""; status(); }
  function invite() {
    var e = ctx.ed(); if (!e) return;
    Kit.sfx.tap();
    if (phase !== "off") { Kit.toast(t("co_busy")); return; }
    var ok = btn(t("co_close"), false, closeSheet);
    if (!bridged()) { sheet(t("co_title"), t("co_app"), [ok]); return; }
    if (!ready()) { sheet(t("co_title"), t("co_soon"), [ok]); return; }
    role = "inviter"; startEngine(); eng.seed(e.doc); phase = "inviting";
    sheet(t("co_title"), t("co_making"), [btn(t("co_cancel"), false, end)]);
    try { host().peerInvite(); } catch (x) { fail(t("co_fail")); }
  }
  function accept(frag) {
    closeSheet(); role = "invitee"; startEngine(); phase = "joining";
    sheet(t("co_title"), t("co_joining"), [btn(t("co_cancel"), false, end)]);
    try { host().peerAccept(LINK + frag); } catch (x) { fail(t("co_fail")); }
  }
  function fail(text) {
    var hadPeer = eng && eng.peer();
    if (!hadPeer) { clearInterval(timer); eng = null; phase = "off"; }
    sheet(t("co_title"), text, [btn(t("co_close"), false, closeSheet)]); status();
  }
  function end() {
    if (phase === "off") return;
    closeSheet();
    var was = phase;
    try { host().peerLeave(); } catch (e) {}
    stop();
    if (was === "live" || was === "back" || was === "alone") Kit.toast(t("co_ended"));
  }
  function applyRemote() {
    var e = ctx.ed();
    if (!e) {
      if (role === "invitee" && eng.hasWork()) { var d = eng.doc(); ctx.open(d); closeSheet(); e = ctx.ed(); }
      else return;
    }
    var sel = e.doc.sk && e.doc.sk[e.sel], keys = eng.applyTo(e.doc);
    if (e.doc.sk) e.sel = e.doc.sk.indexOf(sel);
    if (keys && keys.length) ctx.remote(keys);
  }
  // From the shell. Anything it passes is treated like any other untrusted input.
  function onPeerMessage(json) {
    var m; try { m = JSON.parse(json); } catch (e) { return; }
    if (!m || typeof m !== "object" || !eng) return;
    if (m.t === "msg") {
      var e = ctx.ed(); if (e) eng.local(e.doc);
      if (typeof m.body === "string") eng.receive(m.body, now());
      applyRemote();
    } else if (m.t === "invite" && phase === "inviting" && typeof m.link === "string") {
      link = m.link; phase = "waiting";
      sheet(t("co_title"), t("co_scan"), [btn(t("co_share"), true, shareLink), btn(t("co_cancel"), false, end)], link);
    } else if (m.t === "connected") {
      phase = "live"; code = typeof m.code === "string" && /^[0-9 ]{1,12}$/.test(m.code) ? m.code : "";
      closeSheet(); eng.connected(now());
    } else if (m.t === "reconnecting") { phase = "back"; eng.disconnected(); }
    else if (m.t === "peer-left") { phase = "alone"; eng.disconnected(); }
    else if (m.t === "closed") { var was = phase; try { host().peerLeave(); } catch (x) {} stop(); if (was !== "off") Kit.toast(t("co_ended")); }
    else if (m.t === "error") {
      var why = m.e;
      if (why === "login") sheet(t("co_title"), t("co_login"), [btn(t("co_loginGo"), true, function () { end(); closeSheet(); ctx.more(); }), btn(t("co_cancel"), false, end)]);
      else fail(t(why === "used" ? "co_used" : why === "expired" ? "co_expired" : why === "invalid" ? "co_bad" : "co_fail"));
    }
    status();
  }
  function shareLink() {
    var h = host(); Kit.sfx.tap();
    try { h.share(link, t("co_shareText")); } catch (e) {}
  }
  var api = {
    init: function (c) {
      ctx = c;
      window.DailyCaps = Object.assign(window.DailyCaps || {}, { channel: ready() });   // other modules ask here, at run time
      $("cogo").addEventListener("click", invite);
      $("coleave").addEventListener("click", function () { Kit.sfx.tap(); end(); });
      window.DuellPeer = Object.freeze({ onPeerMessage: onPeerMessage });
      return {
        local: function () { var e = ctx.ed(); if (eng && e) eng.local(e.doc); },
        end: end,
        editor: function () { var e = ctx.ed(); if (eng && e && role === "invitee") { eng.applyTo(e.doc); e.base = JSON.parse(JSON.stringify(e.doc)); ctx.remote([]); } status(); },
        labels: function () { $("coleave").textContent = t("co_leave"); $("cogo").setAttribute("aria-label", t("co_title")); status(); },
        // A link with #p= lands here first; the rest of the page does not see the secret part.
        route: function (hash) {
          var m = /^#?p=(.*)$/.exec(hash || ""); if (!m) return false;
          var ok = btn(t("co_close"), false, closeSheet);
          if (!FRAG.test(m[1])) { sheet(t("co_title"), t("co_bad"), [ok]); return true; }
          if (!bridged()) { sheet(t("co_title"), t("co_app"), [ok]); return true; }
          if (!ready()) { sheet(t("co_title"), t("co_soon"), [ok]); return true; }
          if (phase !== "off") { Kit.toast(t("co_busy")); return true; }
          var frag = m[1];
          sheet(t("co_title"), t("co_ask"), [btn(t("co_accept"), true, function () { Kit.sfx.thud(); accept(frag); }), btn(t("co_no"), false, closeSheet)]);
          return true;
        },
        engine: function () { return eng; }
      };
    }
  };
  window.CollabUI = api;
})();
