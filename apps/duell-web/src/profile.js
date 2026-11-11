/* My Daily Idea: the account card under My style (src/stil.js). Without it everything stays on this device, as before.
   Two ways, both optional (decision in the PR, Art. 8 GDPR):
   - bunsenbrenner account, only after "I am 16 or older"; the login cookie works only where the page comes from the API host.
   - device code ("Geräte-Code") without account: 128 random bits made here; whoever has the code has the profile. No e-mail, no name.
   What travels: nickname, emoji, colours, sticker set, "Meine Wand" without photo works, saved cards, and with the code the AI
   device id. Photos and wall pictures of photo works never leave the device. Server: CADS-DEMO-wrapper lib/duell-profile.mjs.
   A part of its own (konto, scripts/build.js): loaded when My style opens, or at start while linked (app.js konto). */
(function (root) {
  "use strict";
  var CODE_RE = /^[a-f0-9]{32}$/, THUMB_MAX = 30000, BODY_MAX = 100000, MAX_WALL = 30, MAX_SAVED = 200, ID_RE = /^[a-z0-9-]{1,40}$/;

  function newCode(bytes) { return Array.from(bytes).map(function (x) { return (x + 256).toString(16).slice(1); }).join(""); }
  function fmtCode(c) { return (c.match(/.{4}/g) || []).join("-"); }
  // What a person types: any case, dashes and spaces allowed. -> code or null
  function parseCode(s) { var c = String(s || "").toLowerCase().replace(/[^0-9a-f]/g, ""); return CODE_RE.test(c) ? c : null; }
  var wallKey = function (e) { return e.id + ":" + e.ts; }, savedKey = function (e) { return e.id; };
  function sendsWall(e) { return !!e && typeof e.k === "string" && e.k !== "photo" && typeof e.th === "string" && e.th.length <= THUMB_MAX && /^data:image\/jpeg;base64,/.test(e.th); }
  function cleanSaved(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (e) { return e && ID_RE.test(e.id) && typeof e.ts === "number" && !seen[e.id] && (seen[e.id] = 1); }).slice(0, MAX_SAVED);
  }

  // The profile as it goes to the server, from the device store. Newest wall pictures first, inside the size limit.
  function pack(s, via) {
    var me = s.me && typeof s.me === "object" ? s.me : {}, size = 0;
    var wall = (Array.isArray(s.wall) ? s.wall : []).filter(sendsWall).sort(function (a, b) { return b.ts - a.ts; }).filter(function (e) { size += e.th.length + (typeof e.f === "string" ? e.f.length : 0); return size <= BODY_MAX; })   // the server keeps 128 KB per profile (CADS-DEMO-wrapper #82)
      .map(function (e) { var o = { id: e.id, ts: e.ts, k: e.k, th: e.th }; if (typeof e.f === "string" && e.f.length <= 1200 && /^c=[A-Za-z0-9_-]+={0,2}$/.test(e.f)) o.f = e.f; return o; });   // f: the Merken link, checked as the server does
    var p = { me: { nick: me.nick || "", emoji: me.emoji || "", colors: me.colors || null, set: me.set || "" }, wall: wall, saved: cleanSaved(s.saved).map(function (e) { return { id: e.id, ts: e.ts }; }) };
    if (via === "code" && typeof s.aiDev === "string") { p.ai = { dev: s.aiDev }; if (typeof s.aiProof === "string") p.ai.proof = s.aiProof; }
    return p;
  }
  // What both sides agreed on after a sync: the base of the next three-way merge.
  function snapshot(p) { return { me: JSON.stringify(p.me), wall: p.wall.map(wallKey), saved: p.saved.map(savedKey) }; }
  // What came from the server is checked like a device entry before it reaches the store.
  function cleanWall(list) { return (Array.isArray(list) ? list : []).filter(function (e) { return sendsWall(e) && typeof e.id === "string" && typeof e.ts === "number"; }); }
  // Three-way merge of a list: keep what both have, plus what is new on either side since the base. Gone on one side = gone.
  function merge3(local, remote, base, key) {
    var inR = {}, inL = {}, inB = {}, out = [];
    remote.forEach(function (e) { inR[key(e)] = 1; }); local.forEach(function (e) { inL[key(e)] = 1; }); (base || []).forEach(function (k) { inB[k] = 1; });
    local.forEach(function (e) { if (inR[key(e)] || !inB[key(e)]) out.push(e); });
    remote.forEach(function (e) { if (!inL[key(e)] && !inB[key(e)]) out.push(e); });
    return out.sort(function (a, b) { return b.ts - a.ts; });
  }
  // remote: the server's profile or null. -> the changes for the device store (only keys that change).
  function merge(s, remote, base, via) {
    var out = {};
    if (!remote) return out;
    var mine = JSON.stringify(pack(s, via).me);
    if (remote.me && (!base || base.me === mine) && JSON.stringify(remote.me) !== mine) {
      var m = s.me && typeof s.me === "object" ? s.me : {}, r = remote.me;
      out.me = { nick: r.nick || m.nick, emoji: r.emoji || m.emoji, colors: r.colors || m.colors, set: r.set || m.set };
    }
    var wall = merge3(Array.isArray(s.wall) ? s.wall : [], cleanWall(remote.wall), base && base.wall, wallKey).slice(0, MAX_WALL);
    if (JSON.stringify(wall) !== JSON.stringify(merge3(Array.isArray(s.wall) ? s.wall : [], [], null, wallKey))) out.wall = wall;   // order alone is no change
    var saved = merge3(cleanSaved(s.saved), cleanSaved(remote.saved), base && base.saved, savedKey).slice(0, MAX_SAVED);
    if (JSON.stringify(saved) !== JSON.stringify(merge3(cleanSaved(s.saved), [], null, savedKey))) out.saved = saved;
    if (via === "code" && remote.ai && CODE_RE.test(remote.ai.dev) && remote.ai.dev !== s.aiDev) { out.aiDev = remote.ai.dev; out.aiProof = typeof remote.ai.proof === "string" ? remote.ai.proof : undefined; }
    return out;
  }
  // The login pages (Keycloak, CADS-Tunnel #890) wear the My Daily Idea look only with the cookie ct_look = "daily.<a>.<b>"
  // (a = background, b = accent, lower-case hex), set for bunsenbrenner.org right before the jump (look below). Only the two
  // colours go. host: location.hostname. -> the cookie string, or null away from bunsenbrenner.org (file:, app shells, tests).
  function lookCookie(colors, host) {
    host = String(host || "").toLowerCase();
    if (host !== "bunsenbrenner.org" && !/\.bunsenbrenner\.org$/.test(host)) return null;
    var c = Array.isArray(colors) ? colors.map(function (x) { return String(x || "").toLowerCase(); }) : [];
    if (!/^#[0-9a-f]{6}$/.test(c[0]) || !/^#[0-9a-f]{6}$/.test(c[1])) c = ["#ffd400", "#ff3b1d"];
    return "ct_look=daily." + c[0].slice(1) + "." + c[1].slice(1) + "; Domain=bunsenbrenner.org; Path=/; Max-Age=86400; Secure; SameSite=Lax";
  }

  // Signing out at the gate (CADS-Tunnel control plane, GET /gate/logout?host=&return=): clears the gate cookie for every
  // demo on bunsenbrenner.org, not the Keycloak session. Only from a page on a bunsenbrenner.org host, else null.
  function logoutUrl(host, ret) {
    host = String(host || "").toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.bunsenbrenner\.org$/.test(host)) return null;
    return "https://bunsenbrenner.org/gate/logout?host=" + encodeURIComponent(host) + "&return=" + encodeURIComponent(/^\/(?!\/)[\w\/-]*$/.test(ret || "") ? ret : "/duell");
  }
  // An account link counts once a first sync went through (base/at). Before that it is an attempt, made by the tap on the
  // button (t0, with the 16+ statement of that very tap). An attempt older than 30 minutes is dropped, its 16+ statement
  // with it: a later sign-in never carries a statement nobody made this time.
  var ATTEMPT = 1800000;
  function done(p) { return !!(p && (p.via !== "account" || p.base || p.at)); }
  function stale(p, now) { return !!(p && p.via === "account" && !done(p) && !((now || Date.now()) - (p.t0 || 0) < ATTEMPT)); }

  var api = { logoutUrl: logoutUrl, done: done, stale: stale, lookCookie: lookCookie, newCode: newCode, fmtCode: fmtCode, parseCode: parseCode, pack: pack, snapshot: snapshot, merge3: merge3, merge: merge, sendsWall: sendsWall, THUMB_MAX: THUMB_MAX };

  if (typeof window === "undefined") { if (typeof module !== "undefined" && module.exports) module.exports = api; return; }

  var Kit = window.Kit, C = window.DuellCore, t = Kit.t, H = window.DuellHost, busy = null, timer = 0, onChange = function () {}, state = "";
  var shown = function () {};   // the open account card shows each sync's outcome (section below)
  // The section's own styles come with the part (the core stays small).
  var css = document.createElement("style"); css.textContent = ".profile .btn,.profile .field{margin-bottom:10px}.profile .btn{display:block;width:100%;min-height:52px;border:2px solid #17140f;border-radius:16px;background:transparent;color:#17140f;font:600 .94rem Inter,var(--ui)}.profile .lbl{font:700 1rem Inter,var(--ui)}" +
    ".accheck{display:flex;gap:12px;align-items:center;font-weight:600;margin:10px 0;min-height:44px;cursor:pointer}.accheck input{width:28px;height:28px;margin:0;flex:none;accent-color:#17140f}" +
    ".accode{font:800 .94rem ui-monospace,Menlo,monospace;overflow-wrap:break-word;margin:0 0 6px}.accard{border:3px solid #17140f;border-radius:22px;background:#fff;color:#17140f;padding:16px 18px;margin:0 0 18px;font-family:Inter,var(--ui)}.accard .note{font-size:.875rem;line-height:1.45;color:#4a4436}" +
    ".acwhy{list-style:none;margin:8px 0 6px;padding:0;font-weight:600;line-height:1.3}.acwhy li{display:flex;align-items:center;gap:10px;margin:6px 0}.acwhy svg{flex:none}" +
    ".accard,.profile{color-scheme:light}.accard .lbl,.accard h3{color:#17140f}.acgo,.accancel{display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;border:2px solid #17140f;border-radius:16px;background:#fff;color:#17140f;font:700 1rem Inter,var(--ui);margin:6px 0;padding:8px 14px}.accancel{border-style:dashed;font-weight:600}" +
    ".accheck.want{outline:3px solid #b3321f;outline-offset:4px;border-radius:8px}.acneed{margin:0;color:#b3321f;font-weight:700;font-size:.875rem}.acneed:empty{display:none}" +
    ".accard .note{font-size:.8125rem}.acok{margin:4px 0 2px;font-weight:700;font-size:1.06rem}.aclink{min-height:44px;padding:0;border:0;background:none;color:#b3321f;font:600 .875rem Inter,var(--ui);text-decoration:underline;text-underline-offset:3px;text-align:left}"; document.head.appendChild(css);
  // Right before any jump to sign in / register / the account (here and the AI login in ai.js): the login pages in my colours.
  // Back from the login to the page of this build: /duell, Daily Business /duell/business (ai.js loginReturn, #154).
  var back = function () { return window.Ai && window.Ai.loginReturn ? window.Ai.loginReturn(window.DailyFlavor) : "/duell"; };
  function look() { if (H) return; var k = lookCookie(Kit.store.me && Kit.store.me.colors, location.hostname); if (k) document.cookie = k; }
  function base() { return (window.DUELL_API || C.DEFAULT_API).replace(/\/config$/, "/profile"); }
  // The iOS shell loads the page from a file with all network blocked (only its AI bridge goes out): no sync there yet.
  var canCode = !(H && typeof H.ai === "function");
  var canAccount = !H && (function () { try { return new URL(base()).origin === location.origin; } catch (e) { return false; } })();
  var link = function () { var p = Kit.store.profile; if (stale(p)) { delete Kit.store.profile; plainSave(); return null; } return p && (p.via === "account" || (p.via === "code" && CODE_RE.test(p.code))) ? p : null; };

  async function call(op, body) {
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 20000);
    try {
      var r = await fetch(base() + "/" + op, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal, credentials: "same-origin", referrerPolicy: "no-referrer" });
      var j = null; try { j = await r.json(); } catch (e) {}
      return { status: r.status, json: j || {} };
    } finally { clearTimeout(tm); }
  }
  var who = function (p) { return p.via === "code" ? { via: "code", code: p.code } : { via: "account" }; };
  function stripV(r) { var o = { me: r.me, wall: r.wall, saved: r.saved }; if (r.ai) o.ai = r.ai; return o; }
  var plainSave = Kit.save;
  // One sync: read, merge into the device, write back if the server is behind. A stale write starts over once.
  async function syncNow() {
    var p = link(); if (!p) return "off";
    if (navigator.onLine === false) return (state = "offline");
    for (var round = 0; round < 2; round++) {
      var g = await call("get", who(p));
      if (link() !== p) return (state = "");   // unlinked or deleted meanwhile: write nothing
      if (g.status === 401) return (state = "login");
      if (g.status === 429) return (state = "limit");
      if (g.status !== 200) return (state = "error");
      if (g.json.gone && p.base) { unlink(); onChange(); Kit.toast(t("ac_gone")); return (state = "gone"); }   // deleted on another device: stay local, do not upload it again
      // Joining with a code never creates: no profile behind it, nothing goes out (only "Geräte-Code anlegen" makes one).
      if (p.via === "code" && !p.base && !p.make && !g.json.profile) { unlink(); return (state = "unknown"); }
      var ch = merge(Kit.store, g.json.profile, p.base, p.via);
      if (Object.keys(ch).length) { Object.keys(ch).forEach(function (k) { Kit.store[k] = ch[k]; }); if (ch.aiDev) delete Kit.store.aiMeter; plainSave(); onChange(); }
      var out = pack(Kit.store, p.via), rev = g.json.rev;
      // 18+ lives on the server as the account's own statement, a self-declaration (Selbstauskunft) nobody verifies; the free
      // card reads it there, never from a request:
      // the device's age band "18 or older" goes up with the sync, any other band takes it back, no band leaves it; only when
      // this device's band changed since it last sent it (p.a18), so two devices with different bands do not flip it
      var pf = Kit.store.me && Kit.store.me.pref, a18 = p.via === "account" && pf && pf.age ? pf.age === "a18" : null;
      if (a18 !== null && a18 === p.a18) a18 = null;
      if (!g.json.profile || JSON.stringify(out) !== JSON.stringify(stripV(g.json.profile)) || (a18 !== null && a18 !== !!g.json.age18)) {
        var body = who(p); body.rev = rev; body.profile = out; if (!p.base) body.fresh = true; if (p.via === "account" && p.age16) body.age16 = true; if (a18 !== null) body.age18 = a18;
        var w = await call("put", body);
        if (link() !== p) return (state = "");
        if (w.status === 409) continue;
        if (w.status === 410) { unlink(); onChange(); Kit.toast(t("ac_gone")); return (state = "gone"); }
        if (w.status === 401) return (state = "login");
        if (w.status === 403 && w.json.error === "code-needs-login") return (state = "codeLogin");   // a new code needs an account (server #82)
        if (w.status !== 200) return (state = w.status === 429 ? "limit" : "error");   // 429: store full or a limit, not "syncing"
        rev = w.json.rev;
        if (a18 !== null) p.a18 = a18;
      } else if (a18 !== null) p.a18 = a18;   // the server already holds this device's band
      p.rev = rev; p.base = snapshot(out); p.at = Date.now(); plainSave();
      return (state = "ok");
    }
    return (state = "error");
  }
  function sync() {
    if (busy) return busy;
    busy = syncNow().catch(function () { return (state = "error"); }).then(function (s) { busy = null; shown(s); return s; });
    return busy;
  }
  // Every save of the page may change the profile: sync a little later, only while linked.
  Kit.save = function () { plainSave(); if (link() && done(link())) { clearTimeout(timer); timer = setTimeout(sync, 2500); } };

  function unlink() { delete Kit.store.profile; plainSave(); state = ""; }
  function startCode(code, make) { Kit.store.profile = { via: "code", code: code, rev: 0, base: null }; if (make) Kit.store.profile.make = true; plainSave(); return sync(); }
  // A new device code needs a signed-in account (16+, e.g. a parent for a child; the server does not keep who). Not signed in:
  // the login first; the mark { via: "start" } brings the page back here (app.js loads this part while store.profile is set).
  async function newCodeNow(rerender) {
    var b16 = new Uint8Array(16); crypto.getRandomValues(b16);
    var s = await startCode(newCode(b16), true);
    if (s === "ok") { Kit.toast(t("ac_linked")); onChange(); }
    else { unlink(); if (s === "codeLogin" && canAccount && !rerender.again) { Kit.store.profile = { via: "start", at: Date.now() }; plainSave(); look(); location.href = C.loginPath(back(), Kit.lang); return; } Kit.toast(t(s === "codeLogin" ? "ac_codeLogin" : "ac_err")); }
    if (rerender) rerender();
  }

  // The account in My style (src/stil.js): a card (signed out: what an account brings, the 16+ statement, one button; signed
  // in: one line with the state) and its details (what is saved, the code, save now, sign out, delete) in `more`, which My
  // style keeps under "Konto & Daten"; open() opens that. Without `more` the details follow the card. el(tag, cls, text,
  // onClick) is the page's element helper. Both redraw in place.
  // A stroke icon (the design's look), aria-hidden: the words carry the meaning. Built as DOM, never from an HTML string.
  function icon(d, color, w) {
    var NS = "http://www.w3.org/2000/svg", g = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    [["width", 22], ["height", 22], ["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", color], ["stroke-width", w], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"]].forEach(function (a) { g.setAttribute(a[0], a[1]); });
    p.setAttribute("d", d); g.appendChild(p); return g;
  }
  function section(b, el, more, open) {
    var n = draw(); b.appendChild(n[0]); (more || b).appendChild(n[1]);
    function rerender() { var c = document.getElementById("acbox"), d = document.getElementById("acmore"); if (!c) return; var x = draw(); c.replaceWith(x[0]); if (d) d.replaceWith(x[1]); }   // the page may have redrawn the panel meanwhile
    function draw() {
    var box = el("section", "accard"), info = el("div", "profile"), p = link(), m = Kit.store.me || {};
    box.id = "acbox"; info.id = "acmore"; box.setAttribute("aria-labelledby", "achead");
    var wait = !!p && !done(p);   // tapped "Anmelden", but the sign-in did not finish (cancelled, back, still on its way)
    var head = el("h3", "lbl", t(p && !wait ? "ac_titleOn" : "ac_title")); head.id = "achead"; box.appendChild(head);
    // "Guthaben & Aufladen" (create-ui.js, the part erschaffen): free cards, credit, voucher; signed out it signs in first.
    // A link to #aufladen (app.js route opens the view), so the signed-in card stays compact without a button. Only where
    // the build has the free card (not the business app).
    function credit() {
      if (!(root.DailyParts || {}).erschaffen) return;
      var g = el("a", "aclink", t("ac_credit")); g.href = "#aufladen"; g.id = "accredit"; g.setAttribute("aria-haspopup", "dialog"); g.style.display = "inline-flex"; g.style.alignItems = "center"; box.appendChild(g);
    }
    if (!p || wait) {
      var cb = null;
      if (wait) {
        var pn = el("p", "acok", t("ac_pending")); pn.setAttribute("role", "status"); box.appendChild(pn);
        shown = function () { if (box.isConnected && done(link())) rerender(); };   // the first sync went through: signed in
      }
      if (canAccount) {
        // what an account brings: short lines with a stroke icon each (no emoji), only what this build has (no votes without stat)
        var ul = el("ul", "acwhy"), votes = !(window.DailyFlavor && window.DailyFlavor.stat === false);
        if (!wait) [["ac_b1", "M3 5h12v9H3zM1 18h16M18 8h5v11h-5z"], ["ac_b2", "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"], ["ac_b3", "M7 11v9H3v-9zM7 11l4-8c1.3 0 2.5 1 2.5 2.5V9h5.4a2 2 0 0 1 2 2.4l-1.3 6.8a2 2 0 0 1-2 1.8H7"]].filter(function (x) { return votes || x[0] !== "ac_b3"; }).forEach(function (x) {
          var li = el("li", "", t(x[0])); li.prepend(icon(x[1], "currentColor", 2)); ul.appendChild(li);
        });
        if (ul.children.length) box.appendChild(ul);
        var lab = el("label", "accheck"); cb = el("input"); cb.type = "checkbox"; cb.id = "ac16";
        lab.appendChild(cb); lab.appendChild(document.createTextNode(" " + t("ac_16")));
        // The main button never looks locked: without the 16+ tick a tap says so (alert) and puts the focus on the tick.
        var need = el("p", "acneed", ""); need.setAttribute("role", "alert");
        var go = el("button", "acgo", t(wait ? "ac_continue" : "ac_login"), function () {
          if (!cb.checked) {   // emptied first, so a second tap is announced again
            need.textContent = ""; lab.classList.add("want"); cb.focus(); setTimeout(function () { need.textContent = t("ac_need"); }, 80); return;
          }
          Kit.store.profile = { via: "account", rev: 0, base: null, age16: true, t0: Date.now() }; plainSave();
          look();
          location.href = C.loginPath(back(), Kit.lang);
        });
        go.setAttribute("aria-describedby", "acwhere");
        cb.addEventListener("change", function () { if (cb.checked) { need.textContent = ""; lab.classList.remove("want"); } });
        var wh = el("p", "note", t("ac_where")); wh.id = "acwhere";
        box.appendChild(lab); box.appendChild(need); box.appendChild(go);
        if (wait) box.appendChild(el("button", "btn accancel", t("ac_cancel"), function () { unlink(); rerender(); var g = document.querySelector("#acbox .acgo"); if (g) g.focus(); }));
        box.appendChild(wh);
      } else box.appendChild(el("p", "note", t("ac_browser")));
      box.appendChild(el("p", "note acquiet", t("ac_local")));
      if (canCode && open) box.appendChild(el("button", "aclink", t(canAccount ? "ac_u16" : "ac_toCode"), function () { open(); var f = document.getElementById("accodein"); if (f) f.focus(); }));
      credit();
      info.appendChild(el("p", "note", t("ac_what")));
      if (canAccount) info.appendChild(el("p", "note", t("ac_under16")));
      if (canCode) {
        info.appendChild(el("h4", "lbl", t("ac_code")));
        info.appendChild(el("p", "note", t("ac_codeNote")));
        info.appendChild(el("p", "note", t("ac_codeNew")));
        if (canAccount) {   // creating needs the login cookie: only in the browser on this host, and only after the 16+ statement
          var mk = el("button", "btn", t("ac_new"), function () { if (cb.checked) newCodeNow(rerender); });
          mk.disabled = true; cb.addEventListener("change", function () { mk.disabled = !cb.checked; });
          info.appendChild(mk);
        }
        var f = el("input", "field"); f.id = "accodein"; f.placeholder = t("ac_enter"); f.setAttribute("aria-label", t("ac_enter")); f.autocomplete = "off"; f.spellcheck = false;
        info.appendChild(f);
        info.appendChild(el("button", "btn", t("ac_join"), async function () {
          var c = parseCode(f.value); if (!c) { Kit.toast(t("ac_bad")); return; }
          var s = await startCode(c); Kit.toast(t(s === "ok" ? "ac_linked" : s === "unknown" ? "ac_unknown" : s === "limit" ? "ac_limit" : "ac_err")); if (s !== "ok") unlink(); rerender();
        }));
      } else info.appendChild(el("p", "note", t("ac_noCode")));
      return [box, info];
    }
    box.classList.add("on");
    var ok = el("p", "acok", t(p.via === "code" ? "ac_onCode" : "ac_onAcc", { n: ((m.emoji || "") + " " + (m.nick || "")).trim() }));
    var ck = icon("M4 12l5 5L20 6", "#1e5631", 3); ck.style.cssText = "vertical-align:-4px;margin-right:6px"; ok.prepend(ck);
    box.appendChild(ok);
    var st = el("p", "note acstate", ""); st.setAttribute("role", "status"); box.appendChild(st);
    box.appendChild(el("p", "note", t("ac_auto")));
    credit();
    function showState(s) {
      if (!link()) return;
      var at = link().at;
      st.textContent = (s === "ok" || !s) && at ? t("ac_ok", { time: new Date(at).toLocaleTimeString(Kit.lang === "de" ? "de-DE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) }) : s && s !== "ok" ? t(s === "login" ? "ac_relogin_note" : "ac_" + s) : "";
      if (s === "login" && canAccount) { var a = el("a", "btn", t("ac_relogin")); a.href = C.loginPath(back(), Kit.lang); a.addEventListener("click", look); st.appendChild(document.createTextNode(" ")); st.appendChild(a); }
    }
    showState(state); shown = function (s) { if (st.isConnected) showState(s); };
    // the account picture (part kibild), in the details (the card stays compact): with an account only, made by the AI when
    // there is credit, else it says why
    if (p.via === "account" && window.Parts) { var kb = el("div", "kbrow"); info.appendChild(kb); window.Parts.use("kibild", function () { window.KiBild.avatarRow(kb); }).catch(function () {}); }
    info.appendChild(el("p", "note", t(p.via === "code" ? "ac_viaCode" : "ac_viaAccount")));
    if (p.via === "code") {
      info.appendChild(el("p", "accode", fmtCode(p.code)));
      info.appendChild(el("button", "chip", t("ac_copy"), function () { Kit.copy(fmtCode(p.code)).then(function (ok) { Kit.toast(t(ok ? "copied" : "shareFail")); }); }));
      info.appendChild(el("p", "note", t("ac_secret")));
    }
    info.appendChild(el("p", "note", t("ac_what")));
    info.appendChild(el("button", "btn", t("ac_sync"), async function () { showState("busy"); var r = await sync(); if (r === "gone") rerender(); else showState(r); }));
    // Honest: this only stops saving from here. The gate's sign-in stays; signing out there is its own step (logoutUrl).
    info.appendChild(el("button", "btn", t("ac_unlink"), function () { unlink(); Kit.toast(t("ac_unlinked")); rerender(); }));
    if (p.via === "account") {
      info.appendChild(el("p", "note", t("ac_stay")));
      var out = canAccount && logoutUrl(location.hostname, back());
      if (out) {
        var lo = el("a", "btn", t("ac_logout")); lo.href = out; lo.addEventListener("click", function () { unlink(); });
        info.appendChild(lo); info.appendChild(el("p", "note", t("ac_logoutNote")));
      }
    }
    var del = el("button", "btn", t("ac_delete"), async function () {
      if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = t("ac_sure"); return; }
      del.disabled = true;
      try { var r = await call("delete", who(p)); if (r.status !== 200) throw new Error(String(r.status)); unlink(); Kit.toast(t("ac_deleted")); rerender(); }
      catch (e) { del.disabled = false; Kit.toast(t("ac_err")); }
    });
    info.appendChild(del);
    return [box, info];
    }
  }

  // Back from the login page, or a new start while linked: sync once. Back from the login for a new code: make it now, once.
  if (link()) setTimeout(sync, 800);
  else if (Kit.store.profile && Kit.store.profile.via === "start") {
    var mark = Kit.store.profile; delete Kit.store.profile; plainSave();
    if (Date.now() - mark.at < 1800000) setTimeout(function () { newCodeNow(Object.assign(function () { var o = document.getElementById("acbox"); if (o) onChange(); }, { again: true })); }, 800);
  }
  window.Profile = { look: look, section: section, sync: sync, linked: function () { return !!link(); }, onChange: function (f) { onChange = f; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
