/* Parts: code that only some people open (live and arcade duels, the card table, the QR code, the licence texts) is
   built into files of its own next to the page (scripts/build.js, window.DailyParts) and loaded here on first use.
   Offline: the apps ship the files in their bundle next to index.html (Android assets, iOS bundle; nothing goes over the
   network). On the web the page loads every part once it has been idle, so losing the connection later cuts nothing off.
   Only the files named in the build manifest, from the page's own folder; on http(s) each one with its SRI hash, so a
   changed file is refused. Until a part is there, small stand-ins below keep the names the core calls. */
(function (root) {
  "use strict";
  var LIST = root.DailyParts || {}, got = {}, done = {};
  // The folder of the page: …/index.html, /duell/ and /duell (the web route without a slash) all mean the same folder.
  function dir() { var p = location.pathname; return /\.html?$/i.test(p) ? p.replace(/[^/]*$/, "") : p.replace(/\/?$/, "/"); }
  function need(name) {
    var p = LIST[name];
    if (!p) return Promise.reject(new Error("part " + name));
    if (got[name]) return got[name];
    var wait = got[name] = Promise.all((p.d || []).map(need)).then(function () {
      return new Promise(function (ok, no) {
        var s = document.createElement("script");
        if (/^https?:$/.test(location.protocol)) s.integrity = p.h;   // file:// (iOS, tests) has no CORS origin for SRI
        s.onload = function () { done[name] = true; ok(); };
        s.onerror = function () { s.remove(); no(new Error("part " + name)); };
        s.src = dir() + p.f;
        document.head.appendChild(s);
      });
    });
    // Any failure, its own file or one it depends on, clears the entry, so the next try loads again.
    wait.catch(function () { if (got[name] === wait) delete got[name]; });
    return wait;
  }
  function fail() { try { root.Kit.toast(root.Kit.t("part_fail")); } catch (e) {} }
  // need() + then, with a short word on screen if the file is missing (an old page after an update, a broken bundle).
  function use(name, fn) { return need(name).then(fn, function (e) { fail(); throw e; }); }
  // A stand-in: each listed call waits for the part, then calls the real one (the part replaces root[key] when it runs).
  function stand(part, key, calls, extra) {
    var s = extra || {};
    calls.forEach(function (m) {
      s[m] = function () {
        // Built without it on purpose (no entry in the manifest): quiet, no word on screen.
        if (!LIST[part]) return Promise.resolve();
        var a = arguments;
        // A part that loaded but did not set its module (it threw while running) gets the same word on screen.
        return use(part, function () { var r = root[key]; if (!r || r === s) { fail(); throw new Error("part " + part + " without " + key); } return r[m].apply(r, a); }).catch(function () {});
      };
    });
    return (root[key] = s);
  }
  // The Robot and the Magic (robot-ui.js, the part robot): can() answers without the part, from the doc alone (the part's own
  // answer is stricter); open() and fill() load it. A build without the free card has no part: can() is false there.
  var FREE_KINDS = ["card", "photo", "sound", "game", "lauf", "turn", "duel", "table", "arcade", "tool"], DICE = ["card", "photo", "sound", "game"];
  stand("robot", "FreeFromCard", ["open"], { close: function () {}, can: function (d) { return !!LIST.robot && !!d && FREE_KINDS.indexOf(d.k) >= 0 && (typeof d.i === "string" || !!(d.ki && d.ki.k === "karte")); } });
  stand("robot", "Magic", ["fill"], { can: function (d, panel) { return !!LIST.robot && !!d && (!!(panel && panel.querySelector && panel.querySelector("input.tlist")) || DICE.indexOf(d.k) >= 0); } });
  // Live duels (live-ui.js). on() answers like the switch ON there (true; test/parts.test.js keeps both the same); the
  // stand-in has nothing open to close.
  stand("play", "LiveUI", ["invite", "accept"], { close: function () {}, on: function () { return true; } });
  // Arcade duels (arcade-ui.js). count() comes from the catalog, so the games shelf shows its number without the part;
  // demo() only loads the part for an arcade sheet, and only the latest call wins (a sheet may change while it loads).
  var pv = 0, arc = stand("play", "ArcadeUI", ["menu", "tiles", "playBot"], {
    count: function () { return ((root.DuellIdeas && root.DuellIdeas.ideas) || []).filter(function (i) { return i.kind === "arcade"; }).length; },
    dress: function () { return false; },
    back: function () { return false; },   // without the part no arcade layer is open: the phone's back is the app's
    demo: function (c, a, still) {
      var my = ++pv;
      if (a) need("play").then(function () { if (my === pv && root.ArcadeUI !== arc) root.ArcadeUI.demo(c, a, still); }, function () {});
    }
  });
  // Doppelkopf and Skat (table-ui.js), which play over live.js.
  stand("table", "TableUI", ["open", "accept"], { close: function () {} });
  // The community deck of free cards (deck.js). search() and revoked() answer from nothing until the part is there; seen()
  // of a free card (doc.ki.k "karte") loads the part, which reports a use (login only) and marks a revoked seal.
  // A build without the part (the business app): every call stays quiet, see stand().
  // seen() of any sheet loads the part (on the web it comes when the page is idle anyway); deck.js looks only at free cards.
  var dk = stand("deck", "Deck", ["shelf", "load", "seen", "btn"], {
    hits: function () { return 0; },
    // gate(): a free card (or a remix, doc.fr) opens only once the part has asked the server; without the part it stays closed
    gate: function (doc, go) {
      if (!(doc.fr || (doc.ki && doc.ki.k === "karte"))) return false;
      need("deck").then(function () { if (root.Deck !== dk && !root.Deck.gate(doc, go)) go(); }, fail);
      return true;
    }
  });
  // On the web: everything once the page is idle (see above). In the apps the files are on the device anyway. Not the
  // parts in ONDEMAND: only a sheet, card or link that needs one asks for it, so a visitor who opens none never downloads
  // them (test/build.test.js gives them a budget of their own). noto (Noto Emoji for stickers in the picture, about
  // 110 KB): the editor asks at its first sticker (app.js paint); offline without it the picture is made without stickers.
  // dart (the dartboard, about 50 KB): a dart card or link (app.js two()). klang (Stimme verzerren, about 27 KB): a voice
  // sheet when it is shown (app.js setHome). lauf, blasen, bahn, raten: the game engines of the free card, each asked for
  // by its own card or link. warten (the waiting screen of the free card, a few KB): its form (create-ui.js). A name without a part in this build stays harmless. Nor the preview pictures (bilda, bildb …,
  // about 80 KB each): the start page asks for a part when one of its pictures comes into sight (start-ui.js shots);
  // offline without it a tile shows its title on its colour.
  var ONDEMAND = ["noto", "dart", "klang", "lauf", "blasen", "bahn", "raten", "warten", "robot"];
  if (/^https?:$/.test(location.protocol) && location.hostname !== "appassets.androidplatform.net") {
    root.addEventListener("load", function () {
      (root.requestIdleCallback || function (f) { return setTimeout(f, 1500); })(function () {
        Object.keys(LIST).forEach(function (n) { if (ONDEMAND.indexOf(n) < 0 && !/^bild[a-z]$/.test(n)) need(n).catch(function () {}); });
      });
    });
  }
  // The catalog (katalog) is needed for the first sheet: asked for at once, while the rest of the core is still parsed.
  if (LIST.katalog) need("katalog").catch(function () {});
  // Registration API for parts that collect pieces by kind (turnzwei: rule, widget; logik: gen). A part creates its registry
  // with registry("turnzwei", ["rule", "widget"]) and adds to it; the core asks through Parts.use("turnzwei", ...) and get().
  // Names are short ids; one name once per kind, so two cards never overwrite each other's rules unnoticed.
  var regs = {};
  function registry(name, kinds) {
    if (regs[name]) return regs[name];
    var m = {};
    kinds.forEach(function (k) { m[k] = {}; });
    function box(k) { if (!m[k]) throw new Error(name + ": unknown kind " + k); return m[k]; }
    return (regs[name] = {
      add: function (k, id, def) {
        var b = box(k);
        if (typeof id !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) throw new Error(name + ": bad id " + id);
        if (b[id]) throw new Error(name + ": " + k + " " + id + " twice");
        b[id] = def; return def;
      },
      get: function (k, id) { var b = box(k); return Object.prototype.hasOwnProperty.call(b, id) ? b[id] : null; },
      list: function (k) { return Object.keys(box(k)).sort(); },
      kinds: function () { return kinds.slice(); }
    });
  }
  root.Parts = { need: need, use: use, ready: function (name) { return !!done[name]; }, names: function () { return Object.keys(LIST); }, registry: registry };
})(window);
