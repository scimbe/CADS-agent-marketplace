/* My own invites: the one-time tokens this device made for a live duel or a card table. Whoever taps their own link
   (in the chat after sharing it) must not use it up: the live and table screens ask here before any join goes out.
   Only on this device, at most MAX entries, each gone once its invite has run out. */
(function (root) {
  "use strict";
  var KEY = "daily.own", MAX = 24, DAY = 86400000, TOKEN = /^[A-Za-z0-9_-]{22}$/, mem = [];

  function kept(list, now) {
    return (Array.isArray(list) ? list : []).filter(function (e) {
      return e && typeof e === "object" && TOKEN.test(e.t) && typeof e.exp === "number" && e.exp > now && e.exp - now <= DAY;
    });
  }
  function valid(tokens) { return [].concat(tokens).filter(function (t) { return TOKEN.test(t); }); }
  // A group link carries one token per seat: one of mine among them makes the whole link mine.
  function add(list, tokens, exp, now) {
    var ts = valid(tokens);
    var out = kept(list, now).filter(function (e) { return ts.indexOf(e.t) < 0; });
    if (typeof exp === "number" && exp > now) ts.forEach(function (t) { out.push({ t: t, exp: Math.min(exp, now + DAY) }); });
    return out.slice(-MAX);
  }
  function mine(list, tokens, now) {
    var ts = valid(tokens);
    return ts.length > 0 && kept(list, now).some(function (e) { return ts.indexOf(e.t) >= 0; });
  }
  function drop(list, tokens, now) { var ts = valid(tokens); return kept(list, now).filter(function (e) { return ts.indexOf(e.t) < 0; }); }

  var api = { kept: kept, add: add, mine: mine, drop: drop, MAX: MAX, KEY: KEY };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  // In the page: read fresh every time, so a tab opened before the invite still knows it.
  function read() { try { var s = root.localStorage.getItem(KEY); return s ? JSON.parse(s) : mem; } catch (e) { return mem; } }
  function write(l) { mem = l; try { root.localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* private mode: this page only */ } }
  root.OwnInvites = {
    add: function (tokens, exp) { write(add(read(), tokens, exp, Date.now())); },
    mine: function (tokens) { return mine(read(), tokens, Date.now()); },
    drop: function (tokens) { write(drop(read(), tokens, Date.now())); }
  };
})(typeof window !== "undefined" ? window : globalThis);
