/* Thumbs on the calendar sheet and the card numbers: the part "stimme" (scripts/build.js, src/parts.js), loaded once a
   sheet shows; app.js calls sheet() for every sheet and share() for a new share link.
   Thumbs up or down for the day's card and for a received one. Only votes of signed-in accounts count (src/stat.js): a
   vote shows as given only once the server counted it; without an account a short line links to the sign-in, after many
   changes a short line says so. No counts, no pressure; a second tap takes it back. */
(function (root) {
  "use strict";
  var Kit = root.Kit, C = root.DuellCore, D = root.Daily, S = root.Stat, t = Kit.t, home = null, voting = false, timer = 0;
  // In the sheet's own ink like its other marks; the row itself and its place on small sheets are in the core (style.css).
  var CSS = ".votelogin[hidden]{display:none}.votes button{min-width:44px;min-height:44px;padding:0;border:2px solid var(--ink);border-radius:6px;background:var(--paper);color:var(--ink);font:900 18px/1 var(--ui)}" +
    ".votes button[aria-pressed=true]{background:var(--ink);box-shadow:inset 0 0 0 2px var(--paper)}.votelogin{align-self:center;font:800 14px/1.2 var(--ui);color:var(--ink);text-decoration:underline}";
  var $ = function (id) { return document.getElementById(id); };
  // The row is in the page (index.template.html, kept hidden or shown by app.js); the part fills it once.
  function box() {
    var b = $("votes");
    if (b.firstChild) return b;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    [["voteup", "👍", 1], ["votedown", "👎", -1]].forEach(function (x) {
      var e = document.createElement("button"); e.type = "button"; e.id = x[0]; e.textContent = x[1];
      e.addEventListener("click", function () { tap(x[2]); }); b.appendChild(e);
    });
    var a = document.createElement("a"); a.id = "votelogin"; a.className = "votelogin"; a.hidden = true; b.appendChild(a);
    return b;
  }
  function card() { return S.off() ? null : S.card(home); }
  function paint(why) {
    var b = box(), c = card(), v = c ? ((Kit.store.votes || {})[c.i || c.id] | 0) : 0, a = $("votelogin");
    b.hidden = !c; b.setAttribute("aria-label", t("vote_q"));
    [["voteup", 1, "vote_up"], ["votedown", -1, "vote_down"]].forEach(function (x) { var e = $(x[0]); e.setAttribute("aria-label", t(x[2])); e.title = t(x[2]); e.setAttribute("aria-pressed", String(v === x[1])); });
    // login: the sign-in of the API host, as in ai.js (the app shells send no cookie: no link there); dup/full: changed often today
    var hint = why === "login" ? "vote_login" : why === "dup" || why === "full" ? "vote_often" : "";
    clearTimeout(timer); a.hidden = !hint; a.textContent = hint ? t(hint) : "";
    if (hint !== "vote_login" || root.DuellHost) a.removeAttribute("href"); else a.href = (location.protocol === "https:" ? "" : new URL(C.DEFAULT_API).origin) + "/auth/login?return=" + encodeURIComponent("/duell");
    if (hint) timer = setTimeout(function () { a.hidden = true; }, 8000);
  }
  async function tap(v) {
    var c = card(); if (!c || voting) return;
    Kit.sfx.tap();
    if (root.DuellHost) { paint("login"); return; }
    voting = true;
    try { var r = await S.vote(Kit.store, c, v); Kit.save(); paint(r.why); } finally { voting = false; }
  }
  // Every sheet; a received card counts once per link on this device (short link id, else a hash of the card).
  function sheet(h) {
    home = h; paint();
    if (h.doc && S.card(h)) {
      var u = D.docUrl(h.doc);
      S.open(Kit.store, h.doc, h.link || "h" + C.hash32(u.slice(u.indexOf("#") + 1))); Kit.save();
    }
  }
  root.Stimme = { sheet: sheet, share: function (doc) { S.share(doc); } };
})(window);
