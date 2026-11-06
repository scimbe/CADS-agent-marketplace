/* Card numbers: which cards get shared, opened and liked. Only the card id, the event, for share the changed areas, for a
   vote the vote. Never a name, a text or a link. One POST per event; any failure is ignored. share and open go without
   cookies; a vote goes with the login cookie of this origin, because only votes of signed-in accounts count (the server
   checks the gate itself and answers "X-Stat: login" without one). A flavor with stat: false in its flavor.json (business) sends nothing. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var C = node ? require("./core.js") : root.DuellCore;
  var URL_ = C.DEFAULT_API.replace(/\/api\/.*$/, "") + "/api/duell/stat", SEEN = 100;
  function off() { var F = root.DailyFlavor; return !!(F && F.stat === false); }
  function areas() { var D = node ? require("./daily.js") : root.Daily; return (D && D.AREAS) || []; }
  // The card a sheet can be voted on and counted as: the day's card, or a received one of the catalog. A free card (AI kind
  // "karte") keeps the id of the card it came from, but is not that card: it counts in its own deck, not here.
  function card(h) { return (h && (h.doc ? h.note && h.doc.i && !(h.doc.ki && h.doc.ki.k === "karte") && h.doc : h.idea)) || null; }
  function id(c) { return (c && (c.i || c.id)) || "own"; }   // doc.i or idea.id
  // -> a promise of the response, or of null when nothing went out or it failed.
  function post(p, o, cred) {
    if (off()) return Promise.resolve(null);
    var go = (o && o.fetch) || function (u, x) { return fetch(u, x); };
    try {
      return Promise.resolve(go(URL_, { method: "POST", keepalive: true, credentials: cred || "omit", referrerPolicy: "no-referrer", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  // The areas the last person changed (the doc's trail), only those the contract knows.
  function share(doc, o) {
    // a free card (AI kind "karte") counts in its own deck, not as the catalog card it came from
    var by = doc && doc.by, w = by && by.length && by[by.length - 1].w, A = areas(), p = { i: doc && doc.ki && doc.ki.k === "karte" ? "own" : id(doc), e: "share" };
    w = Array.isArray(w) ? w.filter(function (x, i) { return A.indexOf(x) >= 0 && w.indexOf(x) === i; }) : [];
    if (w.length) p.w = w;
    post(p, o);
    return p;
  }
  // Once per link on this device: store.seen keeps the last link ids (or hashes) already counted.
  function open(store, doc, key, o) {
    var s = Array.isArray(store.seen) ? store.seen : [];
    if (s.indexOf(key) >= 0) return null;
    store.seen = s.concat([key]).slice(-SEEN);
    var p = { i: id(doc), e: "open" };
    post(p, o);
    return p;
  }
  // A tap on the vote it already has takes it back (0); the server keeps the vote per account and card. Kept in
  // store.votes[id] only when it counted (2xx without X-Stat, or "same"): -> { v: the vote now shown, why: "login" | "dup" | "full" |
  // "unavailable" | "" (offline, any other failure) when it did not }.
  async function vote(store, card, v, o) {
    var k = id(card), vs = store.votes && typeof store.votes === "object" ? store.votes : {}, p = vs[k] === 1 || vs[k] === -1 ? vs[k] : 0;
    v = v === p ? 0 : v;
    var r = await post({ i: k, e: "vote", v: v }, o, "same-origin"), x = r && r.headers && r.headers.get ? r.headers.get("X-Stat") : null;
    if (r && r.status === 401) x = "login";
    if (x === "same") x = null;   // the account gave this vote already (another device): it stands
    if (!r || x || !(r.status >= 200 && r.status < 300)) return { v: p, why: x || "" };
    store.votes = vs;
    if (v) vs[k] = v; else delete vs[k];
    return { v: v };
  }
  var api = { URL: URL_, off: off, card: card, id: id, share: share, open: open, vote: vote };
  if (node) module.exports = api; else root.Stat = api;
})(typeof window !== "undefined" ? window : globalThis);
