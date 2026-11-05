/* Part "daten": public holidays per Land 2026-2028 and school holidays 2026/27 (src/kalender.json, sources there and in
   scripts/kalender-daten.js). Pure lookups, no DOM; runs in Node (tests) and in the part. A card asks through
   Bausteine.daten(box, fn), which shows "Daten fehlen" when the part cannot be loaded or a year is not in the file. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var K = node ? require("./kalender.json") : root.KalenderData;
  var DAY = 86400000, YMD = /^\d{4}-\d{2}-\d{2}$/;
  function land(l) { return Object.prototype.hasOwnProperty.call(K.laender, l) ? l : null; }
  function name(map, k, lang) { var n = map[k]; return n ? n[lang] || n.de : k; }
  // Holidays of one Land in one year: [{ d, k, name, teil }] (teil: only in part of the Land). null: year or Land unknown.
  function feiertage(l, jahr, lang) {
    var list = K.feiertage[jahr];
    if (!land(l) || !list) return null;
    return list.filter(function (h) { return h.l[0] === "*" || h.l.indexOf(l) >= 0 || (h.teil || []).indexOf(l) >= 0; })
      .map(function (h) { return { d: h.d, k: h.k, name: name(K.feiertagNamen, h.k, lang), teil: (h.teil || []).indexOf(l) >= 0 }; });
  }
  // School holidays of one Land in one school year ("2026/27"): [{ von, bis, k, name }]. null: unknown.
  function ferien(l, schuljahr, lang) {
    var y = K.ferien[schuljahr];
    if (!land(l) || !y || !y[l]) return null;
    return y[l].map(function (r) { return { von: r[0], bis: r[1], k: r[2], name: name(K.ferienNamen, r[2], lang) }; });
  }
  // One day: { feiertag: name or "", ferien: name or "", wochenende } or null when the file says nothing about that year.
  function tag(d, l, lang) {
    if (typeof d !== "string" || !YMD.test(d) || !land(l) || isNaN(Date.parse(d + "T00:00:00Z")) || new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d) return null;
    var f = feiertage(l, d.slice(0, 4), lang);
    if (!f) return null;
    var h = f.filter(function (x) { return x.d === d && !x.teil; })[0], fe = "";
    Object.keys(K.ferien).forEach(function (sj) { (ferien(l, sj, lang) || []).forEach(function (r) { if (!fe && r.von <= d && d <= r.bis) fe = r.name; }); });
    var wd = new Date(d + "T00:00:00Z").getUTCDay();
    return { feiertag: h ? h.name : "", ferien: fe, wochenende: wd === 0 || wd === 6 };
  }
  // Working days between two dates (both included) in one Land: not Saturday, Sunday or a holiday of the whole Land.
  function arbeitstage(von, bis, l) {
    var n = 0;
    for (var t = Date.parse(von + "T00:00:00Z"); t <= Date.parse(bis + "T00:00:00Z"); t += DAY) {
      var x = tag(new Date(t).toISOString().slice(0, 10), l, "de");
      if (!x) return null;
      if (!x.wochenende && !x.feiertag) n++;
    }
    return n;
  }
  var api = { laender: function () { return Object.assign({}, K.laender); }, jahre: function () { return K.jahre.slice(); }, schuljahre: function () { return Object.keys(K.ferien); },
    quelle: function () { return Object.assign({}, K.quelle); }, feiertage: feiertage, ferien: ferien, tag: tag, arbeitstage: arbeitstage };
  if (node) module.exports = api; else root.Kalender = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
