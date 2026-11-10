/* Push as a wake-up signal ("Bescheid geben"): one place that knows how this device can be woken, asks the person first and
   talks to the server (CADS-DEMO-wrapper lib/duell-push.mjs). A part of its own (scripts/build.js PARTS.push).

   Channels, in this order:
     host     the app shells offer DuellHost.push() -> JSON {"v":1,"kind":"none|fcm|apns|unifiedpush","state":...}. Bridge v1;
              an unknown v counts as "none". Without push() inside a shell: none (a WebView has no Web Push).
     webpush  browsers with service worker + PushManager + Notification (iOS/iPadOS only as a web app on the home screen).
     none     why: "app" (shell without push), "install" (iPhone/iPad in a Safari tab: add to home screen first), "browser".
              iOS Safari is recognised by navigator.standalone === false (only Safari on iOS has the property), not by the
              user agent: the page reads no device signals (test/turns.test.js).

   Rules (plan in the PR, no dark patterns): nothing happens before the person taps "Ja" in our own dialog; only then the
   system prompt. "Nein" is the same size as "Ja". The server learns only the subscription (endpoint and the device's public
   keys) and gives back a mark and a delete key; no name, no card, no text. Pushes carry only the kind ("reply", "live");
   the service worker (src/push-sw.js) writes the sentence. Off again: Mein Stil, or the system settings. */
(function (root) {
  "use strict";
  var KINDS = ["reply", "live"], BRIDGE_V = 1;

  function standalone(win, nav) {
    try { if (nav && nav.standalone === true) return true; return !!(win.matchMedia && win.matchMedia("(display-mode: standalone)").matches); } catch (e) { return false; }
  }
  /** How this device can be woken. Pure: everything comes from env (window, navigator, the shell's bridge). */
  function channel(env) {
    var host = env.host, nav = env.nav || {}, win = env.win || {};
    if (host) {
      if (typeof host.push !== "function") return { via: "none", why: "app" };
      var c = null; try { c = JSON.parse(String(host.push())); } catch (e) { c = null; }
      if (!c || c.v !== BRIDGE_V || !c.kind || c.kind === "none") return { via: "none", why: "app" };
      return { via: "host", kind: String(c.kind), state: String(c.state || "default") };
    }
    var can = !!(nav.serviceWorker && win.PushManager && win.Notification);
    if (!can) return { via: "none", why: nav.standalone === false && !standalone(win, nav) ? "install" : "browser" };
    return { via: "webpush", state: String(win.Notification.permission || "default") };
  }
  function keyBytes(b64u) {
    var s = String(b64u).replace(/-/g, "+").replace(/_/g, "/"), pad = s.length % 4 ? "====".slice(s.length % 4) : "", bin = atob(s + pad), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // The folder of the page (/duell, /duell/, …/index.html all mean the same), like src/parts.js dir().
  function dir(loc) { var p = loc.pathname; return /\.html?$/i.test(p) ? p.replace(/[^/]*$/, "") : p.replace(/\/?$/, "/"); }

  /** deps: { host, nav, win, loc, fetch, store(), save(), api } -> the push API of this page. */
  function make(deps) {
    var env = { host: deps.host, nav: deps.nav, win: deps.win };
    function base() { return String(deps.api || "").replace(/\/(config|ai)$/, "") + "/push/"; }
    async function call(path, body) {
      var r = await deps.fetch(base() + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "omit", referrerPolicy: "no-referrer" } : { credentials: "omit" });
      var j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, json: j };
    }
    function mine() { var s = deps.store().push; return s && typeof s.mark === "string" && typeof s.del === "string" ? s : null; }
    function keep(v) { var st = deps.store(); if (v) st.push = v; else delete st.push; deps.save(); }
    async function registration() {
      var sw = deps.nav.serviceWorker, scope = dir(deps.loc).replace(/\/$/, "");   // "/duell": the server allows exactly that
      return sw.register(dir(deps.loc) + "push-sw.js", { scope: scope || "/" });
    }
    async function send(sub) {
      var old = mine(), body = { sub: typeof sub.toJSON === "function" ? sub.toJSON() : sub };
      if (old) { body.mark = old.mark; body.del = old.del; }
      var r = await call("subscribe", body);
      if (r.status !== 200 || !r.json || !r.json.mark) return false;
      keep({ mark: r.json.mark, del: r.json.del, at: Date.now() });
      return true;
    }
    /** After "Ja" in our dialog only. Returns "on" | "denied" | "off" (server without keys) | "none" | "error". */
    async function enable() {
      var c = channel(env);
      if (c.via !== "webpush") return "none";   // host channels come with FCM/APNs (accounts needed), see the plan
      var N = deps.win.Notification, perm = N.permission;
      if (perm === "default") perm = await N.requestPermission();
      if (perm !== "granted") return "denied";
      try {
        var k = await call("key");
        if (!k.json || !k.json.on || !k.json.key) return "off";
        var reg = await registration(), pm = reg.pushManager;
        var sub = (await pm.getSubscription()) || (await pm.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.json.key) }));
        return (await send(sub)) ? "on" : "error";
      } catch (e) { return "error"; }
    }
    /** Off: the server forgets the mark, the browser drops the subscription, the device forgets both. */
    async function disable() {
      var s = mine();
      keep(null);
      try { if (s) await call("unsubscribe", { mark: s.mark, del: s.del }); } catch (e) { /* the mark expires on its own */ }
      try { var reg = await deps.nav.serviceWorker.getRegistration(dir(deps.loc).replace(/\/$/, "") || "/"); var sub = reg && (await reg.pushManager.getSubscription()); if (sub) await sub.unsubscribe(); } catch (e) {}
      return "off";
    }
    /** On page open while on: renews the mark (keeps it, the links already carry it). Quiet; drops it when the permission went. */
    async function renew() {
      var s = mine(), c = channel(env);
      if (!s) return "off";
      if (c.via !== "webpush" || c.state !== "granted") { await disable(); return "off"; }
      try {
        var reg = await registration(), sub = await reg.pushManager.getSubscription();
        if (!sub) { await disable(); return "off"; }
        return (await send(sub)) ? "on" : "error";
      } catch (e) { return "error"; }
    }
    /** Somebody answered: wake the device behind this mark. Only the two kinds; nothing else goes out. */
    async function wake(mark, r) {
      if (!/^[A-Za-z0-9_-]{22}$/.test(String(mark)) || KINDS.indexOf(r) < 0) return false;
      try { return (await call("wake", { mark: mark, r: r })).status === 202; } catch (e) { return false; }
    }
    return { channel: function () { return channel(env); }, enable: enable, disable: disable, renew: renew, wake: wake, mark: function () { var s = mine(); return s ? s.mark : null; }, on: function () { return !!mine(); } };
  }

  // ---------- the page: dialog and the row in "Mein Stil" ----------
  function ui(P, Kit) {
    var t = Kit.t;
    function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }
    function word(c) { return c.via === "none" ? t("pu_none_" + c.why) : c.state === "denied" ? t("pu_blocked") : ""; }
    /** Our own question first. why: "reply" | "live" | "" (from Mein Stil). done(result) after the dialog closed. */
    function ask(why, done) {
      var c = P.channel(), dlg = el("dialog", "kidlg"), h = el("h2", "", t("pu_title")), msg = el("p", "note"), row = el("div", "chips"), result = "cancel";
      h.id = "pudlgh"; dlg.setAttribute("aria-labelledby", "pudlgh"); msg.setAttribute("role", "status");
      [h, el("p", "", t(why === "live" ? "pu_why_live" : why === "reply" ? "pu_why_reply" : "pu_why")), el("p", "note", t("pu_what"))].forEach(function (x) { dlg.appendChild(x); });
      var no = el("button", "btn", t("pu_no"), function () { result = "no"; dlg.close(); });
      if (c.via === "none" || c.state === "denied") { msg.textContent = word(c); no.textContent = t("pu_close"); row.appendChild(no); }
      else {
        var yes = el("button", "btn", t("pu_yes"), async function () {
          yes.disabled = no.disabled = true; msg.textContent = "…";
          result = await P.enable();
          msg.textContent = t("pu_res_" + result);
          no.disabled = false; no.textContent = t("pu_close"); yes.hidden = true;
        });
        row.appendChild(yes); row.appendChild(no);   // same size, same look: "Nein" is not hidden or greyed
      }
      dlg.addEventListener("close", function () { dlg.remove(); if (done) done(result); });
      [row, msg].forEach(function (x) { dlg.appendChild(x); });
      document.body.appendChild(dlg); dlg.showModal();
    }
    /** The row in Mein Stil: state and one switch. */
    function section(box) {
      box.textContent = "";
      var c = P.channel(), on = P.on(), b = el("button", "chip" + (on ? " on" : ""), t("pu_switch"), function () {
        Kit.sfx.tap();
        if (P.on()) P.disable().then(function () { section(box); });
        else ask("", function () { section(box); });
      });
      b.setAttribute("aria-pressed", String(on));
      if (c.via === "none" && !on) b.disabled = true;
      box.appendChild(b);
      box.appendChild(el("p", "note", on ? t("pu_on_note") : word(c) || t("pu_off_note")));
    }
    return { ask: ask, section: section };
  }

  var api = { make: make, channel: channel, keyBytes: keyBytes, KINDS: KINDS, BRIDGE_V: BRIDGE_V };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document && root.Kit) {
    var Kit = root.Kit, C = root.DuellCore || {};
    var P = make({ host: root.DuellHost, nav: root.navigator, win: root, loc: root.location, fetch: root.fetch && root.fetch.bind(root), store: function () { return Kit.store; }, save: function () { Kit.save(); }, api: root.DUELL_API || C.DEFAULT_API });
    var U = ui(P, Kit);
    root.DuellPush = { channel: P.channel, enable: P.enable, disable: P.disable, renew: P.renew, wake: P.wake, mark: P.mark, on: P.on, ask: U.ask, section: U.section };
  }
})(typeof window !== "undefined" ? window : this);
