/* Building blocks for the rules every new card follows (Katalog v2, W0 point 6). Small and in the core; a card calls them
   with its own fields, so the sentence on screen always says what the card really does.
   - wsw(f) / wswRow(f): the privacy line "Wer sieht was?" in one sentence, made from the card's fields:
       { link: ["name", "stimme", ...] what the link carries, ki: false | { a: "provider", o: "country" } | "opt" (only on a tap on ✨),
         server: false | ["text", ...] what a server keeps, tage: days until the link expires (0: never),
         plus: fn(lang) one more sentence of the card's own, e.g. what is sealed in the link }
   - daten(box, fn): runs fn(Kalender) once the part "daten" is there; without it (or when fn answers null, e.g. a year
     the file does not have) the box says "Daten fehlen" instead of guessing.
   All words come from texts.json through Kit.t and Kit.t.plural (no language branches here). */
(function (root) {
  "use strict";
  var LINK = ["name", "stimme", "text", "termin", "zahl", "bild", "antwort"];
  function kit() { return root.Kit; }
  function list(items) {
    var K = kit();
    try { return new Intl.ListFormat(K.loc(), { type: "conjunction" }).format(items); } catch (e) { return items.join(", "); }
  }
  function words(keys) { var t = kit().t; return list(keys.filter(function (k) { return LINK.indexOf(k) >= 0; }).map(function (k) { return t("wsw_l_" + k); })); }
  function wsw(f) {
    f = f || {};
    var K = kit(), t = K.t, out = [], link = (f.link || []).filter(function (k) { return LINK.indexOf(k) >= 0; });
    out.push(link.length ? t("wsw_link", { s: words(link) }) : t("wsw_link_card"));
    out.push(f.ki === "opt" ? t("wsw_kiopt") : f.ki && f.ki.a ? t("wsw_ki", { a: String(f.ki.a), o: String(f.ki.o || "") }) : t("wsw_noki"));
    var srv = (f.server || []).filter(function (k) { return LINK.indexOf(k) >= 0; });
    out.push(srv.length ? t("wsw_srv", { s: words(srv) }) : t(f.ki === "opt" ? "wsw_nosrv_else" : "wsw_nosrv"));
    // what the card numbers count (src/stat.js), once their part stimme is there
    if (root.Stimme) out.push(t("vote_wsw"));
    out.push(f.tage > 0 ? t.plural("wsw_exp", f.tage) : t("wsw_noexp"));
    if (f.plus) out.push(f.plus(K.lang));
    if (link.length) out.push(t("wsw_chat"));
    return out.join(" ");
  }
  function wswRow(f) {
    var p = document.createElement("p"), b = document.createElement("b");
    p.className = "wsw"; b.textContent = kit().t("wsw_h") + " ";
    p.appendChild(b); p.appendChild(document.createTextNode(wsw(f)));
    // With the part stimme (none in a flavor without card numbers): what they count, and the switch "Karten-Statistik aus".
    if (root.Parts) root.Parts.need("stimme").then(function () { root.Stimme.row(p, f); }, Boolean);
    return p;
  }
  function daten(box, fn) {
    function missing() {
      box.textContent = "";
      var p = document.createElement("p"); p.className = "note miss"; p.setAttribute("role", "status"); p.textContent = kit().t("data_missing");
      box.appendChild(p);
    }
    return root.Parts.need("daten").then(function () {
      var r = root.Kalender ? fn(root.Kalender) : null;
      if (r === null) missing();
      return r;
    }, function () { missing(); return null; });
  }
  root.Bausteine = { wsw: wsw, wswRow: wswRow, daten: daten, LINK: LINK };
})(window);
