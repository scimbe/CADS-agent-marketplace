/* Card numbers: which cards get shared, opened and liked. Only the card id, the event and, for share, the changed areas;
   never a name, a text or a link. Fire and forget: any failure is ignored, nothing waits for it. */
(function (root) {
  "use strict";
  var C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.DuellCore;
  var URL_ = C.DEFAULT_API.replace(/\/api\/.*$/, "") + "/api/duell/stat", SEEN = 100;
  function id(c) { return (c && (c.i || c.id)) || "own"; }   // doc.i or idea.id
  function send(p, o) {
    var n = (o && o.nav) || root.navigator, b = JSON.stringify(p);
    try { if (n && n.sendBeacon && n.sendBeacon(URL_, new Blob([b], { type: "application/json" }))) return p; } catch (e) {}
    var go = (o && o.fetch) || function (u, x) { return fetch(u, x); };
    try { go(URL_, { method: "POST", keepalive: true, credentials: "omit", headers: { "Content-Type": "application/json" }, body: b }).catch(function () {}); } catch (e) {}
    return p;
  }
  // The areas the last person changed (the doc's trail), when there is one.
  function share(doc, o) {
    var by = doc && doc.by, w = by && by.length && by[by.length - 1].w, p = { i: id(doc), e: "share" };
    if (w && w.length) p.w = w.slice();
    return send(p, o);
  }
  // Once per link on this device: store.seen keeps the last link ids (or hashes) already counted.
  function open(store, doc, key, o) {
    var s = Array.isArray(store.seen) ? store.seen : [];
    if (s.indexOf(key) >= 0) return null;
    store.seen = s.concat([key]).slice(-SEEN);
    return send({ i: id(doc), e: "open" }, o);
  }
  // A tap on the vote it already has takes it back (0). store.votes[id] keeps 1 or -1.
  function vote(store, card, v, o) {
    var k = id(card), vs = store.votes = store.votes && typeof store.votes === "object" ? store.votes : {}, p = vs[k] === 1 || vs[k] === -1 ? vs[k] : 0;
    v = v === p ? 0 : v;
    if (v) vs[k] = v; else delete vs[k];
    send({ i: k, e: "vote", v: v, p: p }, o);
    return v;
  }
  var api = { URL: URL_, id: id, send: send, share: share, open: open, vote: vote };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Stat = api;
})(typeof window !== "undefined" ? window : globalThis);
