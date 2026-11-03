/* My Daily Idea: one ad strip on the home screen and the Pro sheet. Off unless the build sets DailyFlags.ads.
   Honest by design: labelled "Anzeige", hidden for the day with one tap, no countdown, no reward, no waiting, no video.
   Context only: the request carries the language and the kind of today's idea, never the device id or anything about the person.
   AdSense only on the web page and only when the server put window.DUELL_ADSENSE there (with the CSP that allows it);
   never in an app shell. Pro (no ads, more AI) is sold only on the web, only to adults; the apps never show a price or a buy link. */
(function (root) {
  "use strict";
  var IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]{1,140000}$/;
  var ID = /^[a-z0-9-]{1,40}$/;
  var clip = function (v, n) { return typeof v === "string" ? Array.from(v.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()).slice(0, n).join("") : ""; };
  // A sponsor card from the server, or null. Nothing but these fields reaches the page.
  function sanitize(a) {
    if (!a || typeof a !== "object" || !ID.test(a.id || "")) return null;
    var o = { id: a.id, by: clip(a.by, 40), t: clip(a.t, 60), s: clip(a.s, 90), img: typeof a.img === "string" && IMG.test(a.img) ? a.img : "", url: "" };
    try { var u = new URL(a.url); if (u.protocol === "https:" && !u.username && !u.password) o.url = u.href; } catch (e) {}
    return o.by && o.t ? o : null;
  }
  // Whether the strip may ask at all: switch on, no Pro, not hidden today.
  function allowed(flags, meter, hiddenDay, day) { return !!(flags && flags.ads) && !(meter && meter.abo) && hiddenDay !== day; }
  // AdSense config the server injected, or null. Never inside an app shell.
  function adsense(cfg, host) {
    if (host || !cfg || typeof cfg !== "object") return null;
    return /^ca-pub-\d{10,20}$/.test(cfg.client || "") && /^\d{5,15}$/.test(cfg.slot || "") ? { client: cfg.client, slot: cfg.slot } : null;
  }
  // What the Pro sheet offers: "app" (no price, no link), "shop" (web, buying on), or "none" (nothing to buy yet).
  function offer(meter, host) { if (!(meter && meter.shop && meter.shop.buy)) return "none"; return host ? "app" : "shop"; }
  var api = { sanitize: sanitize, allowed: allowed, adsense: adsense, offer: offer };

  if (typeof window === "undefined") { if (typeof module !== "undefined" && module.exports) module.exports = api; return; }

  var Kit = window.Kit, t = Kit.t, loaded = false, asked = "";
  function dayKey(d) { return d.toISOString().slice(0, 10); }
  function hide(box, day) { Kit.store.adHidden = day; Kit.save(); box.hidden = true; box.textContent = ""; }
  function frame(box, el, by, day, onPro) {
    box.textContent = "";
    var top = el("div", "adtop");
    top.appendChild(el("span", "adlbl", by ? t("adBy", { by: by }) : t("adLbl")));
    var x = el("button", "adx", "✕", function () { Kit.sfx.tap(); hide(box, day); }); x.setAttribute("aria-label", t("adHide"));
    top.appendChild(x); box.appendChild(top);
    var body = el("div", "adbody"); box.appendChild(body);
    var pro = el("button", "adpro", t("adPro"), function () { Kit.sfx.tap(); onPro(); });
    box.appendChild(pro); box.hidden = false;
    return body;
  }
  function google(box, el, cfg, day, onPro) {
    var body = frame(box, el, "", day, onPro), ins = el("ins", "adsbygoogle");
    ins.dataset.adClient = cfg.client; ins.dataset.adSlot = cfg.slot; ins.dataset.adFormat = "horizontal";
    body.appendChild(ins);
    var q = window.adsbygoogle = window.adsbygoogle || [];
    q.requestNonPersonalizedAds = 1;     // contextual only: no profiling of minors (Art. 28 DSA)
    if (!loaded) {
      loaded = true;
      var s = document.createElement("script"); s.async = true; s.crossOrigin = "anonymous";
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(cfg.client);
      document.head.appendChild(s);
    }
    try { q.push({}); } catch (e) { box.hidden = true; }
  }
  // The strip under the day's sheet. ctx: { box, el, today, idea, onPro }
  async function home(ctx) {
    var box = ctx.box, day = dayKey(ctx.today), meter = Kit.store.aiMeter || null;
    if (!allowed(window.DailyFlags, meter, Kit.store.adHidden, day)) { box.hidden = true; return; }
    if (asked === day) return;             // one request a day, not one per torn sheet
    asked = day;
    var r = null;
    try { r = await window.Ai.post("/ad", { lang: Kit.lang, kind: ctx.idea && ctx.idea.kind || "" }); } catch (e) { r = null; }
    if (r && r.json && r.json.meter && r.json.meter.abo) { box.hidden = true; return; }
    var ad = r && r.status === 200 && r.json ? sanitize(r.json.ad) : null, g = adsense(window.DUELL_ADSENSE, window.DuellHost);
    if (!ad) { if (g) google(box, ctx.el, g, day, ctx.onPro); else box.hidden = true; return; }
    var body = frame(box, ctx.el, ad.by, day, ctx.onPro);
    if (ad.img) { var im = ctx.el("img", "adimg"); im.alt = ""; im.src = ad.img; body.appendChild(im); }
    var txt = ctx.el("div", "adtxt"); txt.appendChild(ctx.el("b", "", ad.t)); if (ad.s) txt.appendChild(ctx.el("span", "", ad.s)); body.appendChild(txt);
    if (ad.url) body.appendChild(ctx.el("button", "adgo", t("adOpen") + " ↗", function () { Kit.sfx.tap(); if (!window.open(ad.url, "_blank", "noopener")) location.href = ad.url; }));
  }
  // The Pro sheet. Without a shop it is the honest wall from ai.js ("nothing to buy yet").
  function pro(b, el, meter) {
    var how = offer(meter, window.DuellHost), shop = meter && meter.shop || {};
    if (how === "none") { window.Ai.wall(b, el, true); return; }
    b.appendChild(el("div", "empty", t(meter && meter.pro ? "proOn" : "proTitle")));
    b.appendChild(el("p", "note", "✓ " + t("proNoAds")));
    b.appendChild(el("p", "note", "✓ " + t("proAi", { n: shop.perDay || 30 })));
    if (how === "app") { b.appendChild(el("p", "note", t("proApp"))); return; }
    if (!(meter && meter.pro)) {
      b.appendChild(el("p", "note", t("proPrice", { p: shop.price || "" })));
      b.appendChild(el("p", "note", t("proAdult")));
      if (!meter.account) {
        var a = el("a", "btn", t("proLogin")); a.href = "/auth/login?return=" + encodeURIComponent("/duell"); b.appendChild(a);
      } else {
        var lab = el("label", "note proage"), box = el("input"); box.type = "checkbox";
        lab.appendChild(box); lab.appendChild(document.createTextNode(" " + t("proAge"))); b.appendChild(lab);
        var go = el("a", "btn", t("proBuy")); go.setAttribute("aria-disabled", "true");
        go.addEventListener("click", function (e) { if (!box.checked) { e.preventDefault(); Kit.toast(t("proAge")); } });
        box.addEventListener("change", function () { go.setAttribute("aria-disabled", String(!box.checked)); if (box.checked) go.href = "/api/duell/pro/buy?adult=1"; else go.removeAttribute("href"); });
        b.appendChild(go);
      }
    }
    var c = el("a", "btn", t("proCancel")); c.href = "/duell/kuendigen"; b.appendChild(c);
  }
  window.Ads = { home: home, pro: pro, api: api };
})(typeof globalThis !== "undefined" ? globalThis : this);
