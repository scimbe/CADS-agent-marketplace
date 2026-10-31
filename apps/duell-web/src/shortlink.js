/* Short links: only after a tap on share, and never for anything but c= and i=. Any failure keeps the long link. */
(function (root) {
  "use strict";
  var C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.DuellCore;
  var API = C.DEFAULT_API.replace(/\/api\/.*$/, "") + "/api/s";
  var ID_RE = /^[2-9a-km-np-zA-HJ-NP-Z]{8}$/;
  var SAFE = /^(?:c=[A-Za-z0-9_-]+={0,2}|i=[a-z0-9-]{1,32})$/;   // same rule as the server; p= holds a key and stays out
  var TIMEOUT = 2500, MAX_KEPT = 30, DAY = 86400000;

  function fragmentOf(url) {
    var i = String(url).indexOf("#"), f = i < 0 ? "" : String(url).slice(i + 1);
    return SAFE.test(f) ? f : null;
  }
  function kept(list, now) {
    return (Array.isArray(list) ? list : []).filter(function (e) {
      return e && typeof e === "object" && ID_RE.test(e.id) && typeof e.t === "string" && typeof e.exp === "number" && e.exp > now;
    });
  }
  function call(path, opts, fetchFn) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : 0;
    return (fetchFn || fetch)(API + path, Object.assign({ signal: ctl && ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" }, opts))
      .finally(function () { clearTimeout(timer); });
  }
  // -> { url, short, id }. store.links remembers id and delete token on this device, nowhere else.
  async function shorten(longUrl, meta, store, o) {
    o = o || {};
    var now = (o.now || Date.now)(), f = fragmentOf(longUrl);
    if (!f) return { url: longUrl, short: false };
    store.links = kept(store.links, now);
    var hit = store.links.filter(function (e) { return e.f === f && e.exp - now > DAY; })[0];
    if (hit) return { url: C.SHORT_BASE + hit.id, short: true, id: hit.id };
    try {
      var r = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ f: f, k: meta.k, n: meta.n, l: meta.l }) }, o.fetch);
      if (r.status !== 201) return { url: longUrl, short: false };
      var j = await r.json();
      if (!j || !ID_RE.test(j.id) || typeof j.token !== "string" || j.url !== C.SHORT_BASE + j.id) return { url: longUrl, short: false };
      store.links.unshift({ id: j.id, t: j.token, exp: j.exp, ts: now, f: f });
      store.links = store.links.slice(0, MAX_KEPT);
      return { url: j.url, short: true, id: j.id };
    } catch (e) { return { url: longUrl, short: false }; }
  }
  // The app shells open /s/<id> as #s=<id>: the page fetches the fragment. Null when it is gone, unknown or the net is down.
  async function resolve(id, o) {
    if (!ID_RE.test(id)) return null;
    try {
      var r = await call("/" + id, { method: "GET" }, o && o.fetch);
      if (r.status !== 200) return null;
      var j = await r.json();
      return j && typeof j.f === "string" && SAFE.test(j.f) ? j.f : null;
    } catch (e) { return null; }
  }
  // Gone from the server, or already gone there: forget it here too. Offline: keep the token and say so.
  async function remove(id, store, o) {
    var e = kept(store.links, 0).filter(function (x) { return x.id === id; })[0];
    if (!e) return false;
    try {
      var r = await call("/" + id, { method: "DELETE", headers: { Authorization: "Bearer " + e.t } }, o && o.fetch);
      if (r.status !== 204 && r.status !== 404 && r.status !== 410) return false;
    } catch (x) { return false; }
    store.links = store.links.filter(function (x) { return x.id !== id; });
    return true;
  }
  var api = { fragmentOf: fragmentOf, shorten: shorten, resolve: resolve, remove: remove, kept: kept, ID_RE: ID_RE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ShortLink = api;
})(typeof window !== "undefined" ? window : globalThis);
