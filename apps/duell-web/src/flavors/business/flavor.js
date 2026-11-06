/* Business flavor: the same app, calmer. An organisation's colour and initials travel inside the c= link next to the
   card, so whoever receives it sees the card in those colours; the card picture is drawn plain. Loaded last. */
(function () {
"use strict";
var F = window.DailyFlavor || {}, A = window.DailyApp, D = window.Daily, R = window.Render, Tn = window.Turns, O = window.Office, Kit = window.Kit, t = Kit.t, el = A.el;
var $ = function (id) { return document.getElementById(id); };
var HEX = /^#[0-9a-f]{6}$/, NICK = /^[A-Z0-9&]{1,3}$/, CONF = "https://webconference.bunsenbrenner.org/";
var DEF = { c: "#1d4ed8", n: "" };

/* ---------- organisation: own setting on this device, or the one a received link brought ---------- */
function clean(o) {
  if (!o || typeof o !== "object") return null;
  var c = String(o.c || "").toLowerCase(), n = String(o.n || "").toUpperCase().replace(/[^A-Z0-9&]/g, "").slice(0, 3);
  return HEX.test(c) && NICK.test(n) ? { c: c, n: n } : null;
}
var seen = null;
function own() { return clean(Kit.store.org); }
function org() { return seen || own(); }
function apply() {
  var o = org() || DEF, r = document.body.style, b = $("orglogo");   // body: the flavor CSS sets its defaults there
  r.setProperty("--org", o.c); r.setProperty("--onorg", R.ink(o.c));
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", o.c);
  if (b) b.textContent = o.n || "🏢";
}

/* ---------- the link: {v, d} plus o, which the daily app ignores ---------- */
function b64(s) { var b = new TextEncoder().encode(s), x = ""; b.forEach(function (c) { x += String.fromCharCode(c); }); return btoa(x).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64(s) { var b = s.replace(/-/g, "+").replace(/_/g, "/"), bin = atob(b + "===".slice(0, (4 - b.length % 4) % 4)); return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, function (x) { return x.charCodeAt(0); })); }
function payload(hash) { var c = String(hash || "").match(/(?:^#?|&)c=([A-Za-z0-9_-]+)/); try { return c ? JSON.parse(unb64(c[1])) : null; } catch (e) { return null; } }
var docUrl = D.docUrl;
D.docUrl = function (doc) {
  var url = docUrl(doc), o = org(), at = url.indexOf("#c="), p = o && at >= 0 && payload(url.slice(at + 1));
  if (!p) return url;
  p.o = o; var withOrg = url.slice(0, at) + "#c=" + b64(JSON.stringify(p));
  return withOrg.length - at - 3 <= window.DuellCore.MAX_FRAGMENT ? withOrg : url;   // the card first, the colours only if they fit
};
var parseRoute = D.parseRoute;
D.parseRoute = function (hash) {
  var r = parseRoute(hash);
  if (r && r.type === "doc") { var p = payload(hash), o = p && clean(p.o); if (o) { seen = o; apply(); } }
  return r;
};

/* ---------- short links resolve to the daily app on the server, so this build shares the long link until it knows us ---------- */
if (F.short === false && window.ShortLink) window.ShortLink.shorten = function (url) { return Promise.resolve({ url: url, short: false }); };

/* ---------- settings ---------- */
function settings() {
  A.shelf(t("org"), function (b) {
    var o = own() || { c: DEF.c, n: "" }, row = el("div", "orgrow"), col = el("input"), nick = el("input", "field");
    b.appendChild(el("p", "note", t("org_h")));
    col.type = "color"; col.value = o.c; col.setAttribute("aria-label", t("org_color"));
    nick.maxLength = 3; nick.value = o.n; nick.placeholder = t("org_name"); nick.setAttribute("aria-label", t("org_name")); nick.autocomplete = "off";
    row.appendChild(col); row.appendChild(nick); b.appendChild(el("label", "lbl", t("org_color") + " · " + t("org_name"))); b.appendChild(row);
    b.appendChild(el("button", "btn hot", t("org_save"), function () {
      var v = clean({ c: col.value, n: nick.value });
      if (!v) { Kit.toast(t("org_name")); return; }
      Kit.store.org = v; Kit.save(); seen = null; apply(); A.goHome();
    }));
    b.appendChild(el("button", "btn", t("org_off"), function () { delete Kit.store.org; Kit.save(); seen = null; apply(); A.goHome(); }));
  });
}

/* ---------- the card picture: white sheet, accent bar, title, the standing so far ---------- */
var FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif';
function wrap(c, s, w) { var out = [], cur = ""; String(s).split(" ").forEach(function (x) { var n = cur ? cur + " " + x : x; if (c.measureText(n).width > w && cur) { out.push(cur); cur = x; } else cur = n; }); if (cur) out.push(cur); return out; }
function text(c, s, x, y, w, size, weight, col, max) {
  c.font = weight + " " + size + "px " + FONT; c.fillStyle = col; c.textAlign = "left"; c.textBaseline = "top";
  wrap(c, s, w).slice(0, max || 9).forEach(function (l) { c.fillText(l, x, y); y += size * 1.25; });
  return y;
}
function heading(doc) { var i = doc.i ? D.byId(doc.i) : null, T = i ? (i[Kit.lang] || i.de) : null; return { t: doc.t || (T ? D.plainTitle(T.t) : t("turn")), s: doc.s || (T ? T.s : "") }; }
R.extra.turn = function (c, W, H, doc) {
  if (doc.g === "einkauf" && window.TurnShop) return window.TurnShop.draw(c, W, H, doc);   // the list is the picture, on white paper already
  var o = org() || DEF, st = Tn.state(doc), res = Tn.result(doc, Kit.lang), face = res ? null : O.face(doc, Kit.lang), h = heading(doc), L = Tn.T(Kit.lang), p = W * 0.08, y;
  c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
  c.fillStyle = o.c; c.fillRect(0, 0, W, W * 0.022);
  if (o.n) { c.fillRect(p, p * 1.2, W * 0.12, W * 0.075); c.font = "700 " + W * 0.036 + "px " + FONT; c.fillStyle = R.ink(o.c); c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(o.n, p + W * 0.06, p * 1.2 + W * 0.0375); }
  c.font = "600 " + W * 0.03 + "px " + FONT; c.fillStyle = "#5b6472"; c.textAlign = "right"; c.textBaseline = "top"; c.fillText(t("brand"), W - p, p * 1.35);
  y = text(c, res ? res.h : h.t, p, p * 2.6, W - 2 * p, W * 0.075, 700, "#111827", 3) + W * 0.02;
  c.fillStyle = "#d5d9e0"; c.fillRect(p, y, W - 2 * p, 2); y += W * 0.04;
  (res ? res.lines : face || [h.s, L[(Tn.GAMES[doc.g] && Tn.GAMES[doc.g].words && Tn.GAMES[doc.g].words.you_start) || "you_start"]]).forEach(function (s, i) {
    y = text(c, s, p, y, W - 2 * p, W * (i ? 0.04 : 0.045), i ? 500 : 600, i ? "#374151" : "#111827", 3) + W * 0.018;
  });
  c.font = "500 " + W * 0.03 + "px " + FONT; c.fillStyle = "#5b6472"; c.textAlign = "left"; c.textBaseline = "alphabetic";
  if (st.over || (st.turn && !Tn.game(doc).snap)) c.fillText(st.over ? L.note_over : String(L.picture_turn).replace("{n}", st.turn).replace("{m}", st.total), p, H - p * 1.1);
};

/* ---------- company networks: only 443, often a proxy, sometimes the conference or PayPal is blocked ---------- */
// One look at the host before leaving, without cookies or referrer and with a short deadline: an answer of any kind
// means the network lets it through; a refusal or silence means it does not, and the person hears it at once.
// A proxy that answers with its own block page cannot be told apart here; then the new tab shows that page.
var REACH_MS = 3000;
function reach(url) {
  var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, REACH_MS);
  return fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal })
    .then(function () { return true; }, function () { return false; }).finally(function () { clearTimeout(tm); });
}
var going = false;
async function conference() {
  if (going) return; going = true; Kit.toast(t("net_check"));
  try {
    if (!(await reach(CONF))) { blocked(t("net_conf")); return; }
    if (!window.open(CONF, "_blank", "noopener")) location.href = CONF;
  } finally { going = false; }
}
function blocked(text) {
  A.shelf(t("net_h"), function (b) {
    b.appendChild(el("p", "qtext", text)); b.appendChild(el("p", "note", t("net_try")));
    b.appendChild(el("button", "btn hot", t("net_copy"), async function () { if (await Kit.copy(CONF)) Kit.toast(t("copied")); }));
    b.appendChild(el("button", "btn", t("net_back"), function () { history.back(); }));
  });
}
// The feature row is drawn again on every language switch, so its conference button is caught here instead of rebuilt.
$("feat").addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b || b.textContent.indexOf(t("f_conf")) < 0) return;
  e.stopImmediatePropagation(); conference();
}, true);

/* ---------- a card that leads to a meeting offers the call; a payment link says what to do if PayPal is blocked ---------- */
var move = A.PANEL.Move;
// Onboarding, feedback evaluation and the next meeting live in the part "biz" (biz-ui.js); here only the hooks.
function biz(p, what) { var box = el("div", "bizbox"); p.appendChild(box); window.Parts.use("biz", function () { if (box.isConnected) window.BizUI[what](box, A.ed()); }).catch(function () {}); }
function boarding(ed) { return !!ed && ed.doc.g === "todo" && ed.doc.i === "biz-onboarding" && !Tn.moves(ed.doc).length; }
// Onboarding before its list exists: the main button makes the checklist from the plan on screen.
var TM = window.DailyModes.turn, foot = TM.footer, main = TM.main;
TM.footer = function (b, ed) { foot.apply(TM, arguments); if (boarding(ed)) { b.hidden = false; b.classList.remove("wait"); b.textContent = t("biz_ob_make"); } };
TM.main = function (ed) { if (!boarding(ed)) { main.apply(TM, arguments); return; } window.Parts.use("biz", function () { window.BizUI.make(); }).catch(function () {}); };
A.PANEL.Move = function (p) {
  var e0 = A.ed();
  if (boarding(e0)) { biz(p, "onboard"); return; }
  move(p);
  if (e0 && (e0.doc.g === "feedback" || e0.doc.g === "todo")) biz(p, e0.doc.g);
  var ed = A.ed(), g = ed && Tn.GAMES[ed.doc.g], pay = p.querySelector("#paylink");
  if (g && g.call && Tn.moves(ed.doc).length) p.appendChild(el("button", "btn", Tn.T(Kit.lang).age_call, conference));
  if (pay) {
    p.appendChild(el("p", "note", t("net_pay")));
    p.appendChild(el("button", "btn", t("net_copy"), async function () { if (await Kit.copy(pay.href)) Kit.toast(t("copied")); }));
  }
};

/* ---------- header: the logo opens the settings, the blank sheet opens the templates ---------- */
var logo = el("button", "orglogo", "", function () { Kit.sfx.tap(); settings(); });
logo.id = "orglogo"; logo.setAttribute("aria-label", t("org"));
$("brand").parentNode.insertBefore(logo, $("brand"));
var blank = $("own"), plain = blank.cloneNode(true);   // a clone drops the daily app's handler for an empty creation
blank.parentNode.replaceChild(plain, blank);
plain.addEventListener("click", function () { Kit.sfx.tap(); window.DailyModes.turn.menu(); });
window.DailyOrg = { get: org, own: own, clean: clean };
apply();
})();
