/* My Daily Idea: the community deck of free cards ("Create your own card", W4), part "deck" (scripts/build.js).
   - The deck comes from GET <api>/deck as signed, versioned data (CADS-DEMO-wrapper lib/duell-deck.mjs). Each entry
     passes Daily.sanitizeDoc like any link; an older version never replaces a newer one, a bad signature is ignored.
     The daily rotation (Daily.ROUND) is not touched: deck cards live here, in the search and in their own shelf.
   - Use of a free card is reported only with a login (same origin, cookie): "start" when its sheet shows, "done" once the
     sheet stayed at least 20 s and the person did something on it. Nothing else, no device id, nothing without login.
   - Thumbs on a deck card only after opening it. The creator sees the state of their cards, their credit and the reasons
     for decisions with a way to object; never how many people played. No ranking, no running tally, no chance. */
(function (root) {
  "use strict";
  var Kit = root.Kit, D = root.Daily, C = root.DuellCore, t = Kit.t;
  // The operator's Ed25519 public key (base64url, GET /api/duell/deck/key) once DUELL_DECK_SIGN_KEY is fixed on the server.
  // Empty: the key is taken from the same server, which still catches a broken or tampered cache, not a hostile server.
  var PIN = "";
  var FRESH = 5 * 60 * 1000, USE_MS = 20000, VOTE_MS = 10000, MAX = 200;
  var DeckTexts = root.DeckTexts;
  if (DeckTexts) Object.keys(DeckTexts).forEach(function (l) { root.DailyTexts[l] = Object.assign(root.DailyTexts[l] || {}, DeckTexts[l]); });

  function base() { return String(root.DUELL_API || C.DEFAULT_API).replace(/\/(config|ai)$/, ""); }
  /* The one way out of this part: GET of the deck and its key without a cookie; POST of a seal, a thumb, a token or an
     objection the person wrote, with the login cookie of this origin only (no device id, nothing else). */
  var POSTS = ["/deck/use", "/deck/vote", "/deck/me", "/mod/me", "/mod/appeal"];
  function net(path, body) {
    var get = body === undefined;
    if (!get && POSTS.indexOf(path) < 0) return Promise.reject(new Error("path"));
    return fetch(base() + path, get ? { credentials: "omit", referrerPolicy: "no-referrer" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", referrerPolicy: "no-referrer" });
  }
  function canonical(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(function (x) { return canonical(x === undefined ? null : x); }).join(",") + "]";
    return "{" + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
  }
  function unb64(s) { var b = String(s).replace(/-/g, "+").replace(/_/g, "/"); b += "===".slice(0, (4 - b.length % 4) % 4); return Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); }); }
  function b64(u) { var s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  var CID = /^[A-Za-z0-9_-]{22}$/;
  function cidOf(doc) { var k = doc && doc.ki; return k && k.k === "karte" && typeof k.h === "string" && /^[A-Za-z0-9_-]{43}$/.test(k.h) ? k.h.slice(0, 22) : ""; }

  // ---- the deck: only data, checked like a link ----
  function sane(j) {
    if (!j || typeof j !== "object" || !Number.isInteger(j.v) || j.v < 0 || !Array.isArray(j.cards)) return null;
    var revoked = (Array.isArray(j.revoked) ? j.revoked : []).filter(function (c) { return typeof c === "string" && CID.test(c); }).slice(-500);
    var cards = [];
    j.cards.slice(0, MAX).forEach(function (e) {
      if (!e || !CID.test(e.cid) || revoked.indexOf(e.cid) >= 0) return;
      var d = D.sanitizeDoc(e.doc);
      if (!d || cidOf(d) !== e.cid || !D.docAvailable(d)) return;
      cards.push({ cid: e.cid, doc: d });
    });
    return { v: j.v, kid: typeof j.kid === "string" ? j.kid.slice(0, 16) : "", cards: cards, revoked: revoked };
  }
  var deck = sane(Kit.store.deck) || { v: -1, kid: "", cards: [], revoked: [] }, got = 0, listeners = [];
  async function keyFor(kid) {
    var pub = PIN;
    if (!pub) { var r = await net("/deck/key"); var k = await r.json(); pub = k && k.pub; }
    var raw = unb64(pub), id = b64(new Uint8Array(await crypto.subtle.digest("SHA-256", raw))).slice(0, 8);
    if (kid && id !== kid) return null;
    return crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
  }
  /* true: signature holds. false: it does not. null: this device cannot check Ed25519 (then the data are still only data). */
  async function signed(j) {
    if (typeof j.sig !== "string") return false;
    if (!root.crypto || !crypto.subtle) return null;
    try {
      var key = await keyFor(j.kid); if (!key) return false;
      var body = {}; Object.keys(j).forEach(function (k) { if (k !== "sig") body[k] = j[k]; });
      return await crypto.subtle.verify({ name: "Ed25519" }, key, unb64(j.sig), new TextEncoder().encode(canonical(body)));
    } catch (e) { return e && e.name === "NotSupportedError" ? null : false; }
  }
  async function load(force) {
    if (!force && Date.now() - got < FRESH) return deck;
    if (navigator.onLine === false) return deck;
    try {
      var r = await net("/deck");
      if (!r.ok) return deck;
      var j = await r.json(), ok = await signed(j), d = ok !== false && sane(j);
      got = Date.now();
      if (!d || d.v < deck.v) return deck;   // a broken signature or an older version changes nothing
      deck = d; Kit.store.deck = { v: d.v, kid: d.kid, cards: d.cards, revoked: d.revoked }; Kit.save();
      listeners.forEach(function (f) { try { f(deck); } catch (e) {} });
    } catch (e) { /* offline or not reachable: the last deck stays */ }
    return deck;
  }
  function revoked(doc) { var c = cidOf(doc); return !!c && deck.revoked.indexOf(c) >= 0; }
  function search(q) {
    var words = D.fold(q).split(" ").filter(Boolean);
    if (!words.length) return [];
    return deck.cards.filter(function (e) {
      var hay = D.fold([e.doc.t, e.doc.s, e.doc.x, e.doc.y].filter(Boolean).join(" "));
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 10);
  }

  // ---- use and thumbs (login only) ----
  async function post(path, body) {
    if (navigator.onLine === false) return { status: 0 };
    try {
      var r = await net(path, body);
      var j = null; try { j = r.status === 204 ? null : await r.json(); } catch (e) { j = null; }
      return { status: r.status, json: j };
    } catch (e) { return { status: 0 }; }
  }
  var tokens = {}, done = {}, cur = null, noLogin = false;
  function acted() {
    if (!cur) return;
    cur.acted = true;
    if (Date.now() - cur.at >= USE_MS) finish();
  }
  function finish() {
    var c = cur; if (!c || !c.acted || !c.t || done[c.cid] || Date.now() - c.at < USE_MS) return;
    done[c.cid] = 1; cur = null;
    post("/deck/use", { ki: c.ki, ev: "done", t: c.t });
  }
  document.addEventListener("pointerdown", acted, true);
  document.addEventListener("keydown", acted, true);
  /* A sheet shows (home or editor): mark a revoked seal, and for a free card begin a use. */
  function seen(doc, badge) {
    if (badge && revoked(doc)) { badge.hidden = false; badge.textContent = t("deck_revoked"); badge.title = t("deck_revoked"); badge.setAttribute("aria-label", t("deck_revoked")); }
    var cid = cidOf(doc);
    if (!cid || (cur && cur.cid === cid)) return;
    cur = null;
    if (noLogin || done[cid] || revoked(doc)) return;
    var c = cur = { cid: cid, ki: { k: "karte", s: doc.ki.s, h: doc.ki.h }, at: Date.now(), acted: false, t: "" };
    post("/deck/use", { ki: c.ki, ev: "start" }).then(function (r) {
      if (r.status === 401) { noLogin = true; return; }
      if (r.status !== 200 || !r.json || typeof r.json.t !== "string") return;
      tokens[cid] = { t: r.json.t, at: c.at }; c.t = r.json.t;
      setTimeout(finish, USE_MS + 200);
    });
  }
  /* A thumb on a card this person opened: sent once the server would take it (10 s after opening). */
  function vote(doc, v) {
    var cid = cidOf(doc), tk = tokens[cid];
    if (!tk) return Promise.resolve(false);
    return new Promise(function (ok) {
      setTimeout(function () { post("/deck/vote", { ki: { k: "karte", s: doc.ki.s, h: doc.ki.h }, v: v, t: tk.t }).then(function (r) { ok(r.status === 204); }); }, Math.max(0, VOTE_MS - (Date.now() - tk.at)));
    });
  }

  // ---- the shelf: the deck, my cards, credit, decisions and objections ----
  function A() { return root.DailyApp; }
  function el(tag, cls, text, on) { return A().el(tag, cls, text, on); }
  function day(iso) { try { return new Date(iso).toLocaleDateString(Kit.loc(), { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return String(iso).slice(0, 10); } }
  function open(e) { var h = A().home() || {}; A().sheet({ date: h.date || new Date(), doc: e.doc, note: t("deck_from"), noteOf: function () { return t("deck_from"); } }); }
  function row(e, list) {
    var r = el("div", "deckrow"), b = el("button", "day", null, function () { Kit.sfx.tap(); open(e); });
    b.appendChild(el("b", "", "✦")); b.appendChild(el("span", "", D.plainTitle(e.doc.t || e.doc.x || "")));
    r.appendChild(b);
    if (tokens[e.cid]) [[1, "👍", "deck_up"], [-1, "👎", "deck_down"]].forEach(function (x) {
      var th = el("button", "chip", x[1], function () { th.disabled = true; vote(e.doc, x[0]).then(function () { Kit.toast(t("deck_thanks")); }); });
      th.setAttribute("aria-label", t(x[2])); r.appendChild(th);
    });
    list.appendChild(r);
  }
  function fact(n) {
    var f = n.facts || {}, out = [];
    if (f.why === "thumbs") out.push(t("mod_f_thumbs", { n: f.down, p: Math.round((f.share || 0) * 100) }));
    if (f.why === "reports") out.push(t("mod_f_reports", { n: f.reports }));
    if (f.why === "ai-recheck" || f.by === "ai-recheck") out.push(t("mod_f_ai"));
    if (f.cards) out.push(t("mod_f_cards"));
    if (f.why === "pause-ended") out.push(t("mod_f_end"));
    out.push(t(n.automated && n.automated.decided ? "mod_auto" : "mod_manual"));
    return out.join(" ");
  }
  function notice(n, box) {
    var TY = { "card-hidden": "mod_hidden", "card-removed": "mod_removed", pause: "mod_pause", ban: "mod_ban", lift: "mod_lift" };
    var c = el("div", "decknote"); c.appendChild(el("b", "", t(TY[n.type] || "mod_title") + " · " + day(n.at)));
    c.appendChild(el("p", "", fact(n) + (n.until ? " " + t("mod_until", { d: day(n.until) }) : "")));
    if (n.type !== "lift") c.appendChild(el("p", "", t("mod_ground")));
    if (n.appeal) c.appendChild(el("p", "", t("mod_a_" + n.appeal.state)));
    else if (n.appealUntil && Date.parse(n.appealUntil) > Date.now()) {
      c.appendChild(el("p", "", t("mod_appeal_until", { d: day(n.appealUntil) }) + " " + t("mod_court")));
      var go = el("button", "btn", t("mod_appeal"), function () {
        var f = el("div", "deckform"), ta = el("textarea", "field"), id = "ap" + n.nid, lb = el("label", "", t("mod_appeal_l"));
        ta.id = id; ta.maxLength = 1000; lb.htmlFor = id;
        f.appendChild(lb); f.appendChild(ta);
        f.appendChild(el("button", "btn hot", t("mod_appeal_send"), function () {
          if (!ta.value.trim()) { ta.focus(); return; }
          post("/mod/appeal", { nid: n.nid, text: ta.value }).then(function (r) { Kit.toast(t(r.status === 202 ? "mod_appeal_ok" : "mod_fail")); if (r.status === 202) shelf(); });
        }));
        go.replaceWith(f); ta.focus();
      });
      c.appendChild(go);
    }
    box.appendChild(c);
  }
  function mine(box) {
    box.appendChild(el("h3", "", t("deck_mine")));
    var wait = el("div", "empty", "…"); box.appendChild(wait);
    Promise.all([post("/deck/me", {}), post("/mod/me", {})]).then(function (rs) {
      wait.remove();
      var me = rs[0], md = rs[1];
      if (me.status === 401) { box.appendChild(el("div", "empty", t("deck_login"))); return; }
      if (me.status !== 200 || !me.json) { box.appendChild(el("div", "empty", t("mod_fail"))); return; }
      var cr = me.json.credit, st = md.json || me.json.mod || {};
      if (st.st === "paused") box.appendChild(el("p", "deckwarn", t("mod_st_paused", { d: day(st.until) })));
      if (st.st === "banned") box.appendChild(el("p", "deckwarn", t("mod_st_banned")));
      if (!me.json.cards.length) box.appendChild(el("div", "empty", t("deck_none")));
      me.json.cards.forEach(function (c) { box.appendChild(el("div", "deckmine", t("deck_card") + " " + c.cid.slice(0, 6) + " · " + t("deck_st_" + c.st))); });
      if (cr) {
        box.appendChild(el("p", "", t("credit_line", { n: cr.balance })));
        cr.items.forEach(function (x) { box.appendChild(el("div", "deckmine", t("credit_r_" + x.reason) + " +" + x.n + (x.revoked ? " · " + t("credit_revoked") : ""))); });
        box.appendChild(el("p", "decksmall", t("credit_note")));
      }
      var ns = (md.json && md.json.notices) || [];
      if (ns.length) { box.appendChild(el("h3", "", t("mod_title"))); ns.slice().reverse().forEach(function (n) { notice(n, box); }); }
    });
  }
  var css = 0;
  function style() {
    if (css) return; css = 1;
    var st = document.createElement("style");
    st.textContent = ".deckrow{display:flex;gap:8px;align-items:center}.deckrow .day{flex:1}.decknote{border:2px solid currentColor;border-radius:10px;padding:8px 10px;margin:8px 0}.decknote p{margin:4px 0}.deckform{display:grid;gap:6px}.deckform textarea{min-height:90px}.deckwarn{font-weight:700}.decksmall{font-size:.85em;opacity:.85}.deckmine{padding:2px 0}";
    document.head.appendChild(st);
  }
  function shelf() {
    style();
    A().shelf(t("deck_title"), function (b) {
      b.appendChild(el("p", "", t("deck_intro")));
      var list = el("div", "decklist"); b.appendChild(list);
      function fill() {
        list.textContent = "";
        if (!deck.cards.length) list.appendChild(el("div", "empty", t("deck_empty")));
        deck.cards.forEach(function (e) { row(e, list); });
      }
      fill(); listeners = [fill];
      load();
      mine(b);
    });
  }
  load();
  root.Deck = { load: load, list: function () { return deck.cards.slice(); }, version: function () { return deck.v; }, search: search, revoked: revoked, seen: seen, vote: vote, open: open, shelf: shelf, cidOf: cidOf, _sane: sane, _canonical: canonical };
})(window);
