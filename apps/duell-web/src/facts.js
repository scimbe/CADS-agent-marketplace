/* My Daily Idea: data cards. A free web API gives the day's fact or question through our server (/api/duell/ai/fact);
   this file holds the list of sources with the credit line each card must show, and keeps a creation's data strip clean.
   The credit comes from this list, never from a link or the server, so nobody can share a card without its source. */
(function (root) {
  "use strict";
  var C = typeof module !== "undefined" && module.exports ? require("./core.js") : root.DuellCore;
  // id -> c: credit line on the card (always shown), q: the chips to choose from, as [value, label, english label] (or none).
  // The server (lib/duell-facts-sources.mjs in CADS-DEMO-wrapper) accepts exactly these values and sends the same credit.
  var SRC = {
    quiz: { c: "opentdb.com · CC BY-SA 4.0" },
    hauptstadt: { c: "Wikidata · CC0" },
    waermste: { c: "Deutscher Wetterdienst · CC BY 4.0 · via Bright Sky" },
    tiere: { c: "GBIF.org · Meldungen in Deutschland" },
    band: { c: "MusicBrainz · CC0" },
    geld: { c: "Kurse: Europäische Zentralbank · via frankfurter.dev" },
    strom: { c: "Energy-Charts.info (Fraunhofer ISE) · CC BY 4.0" },
    liga: { c: "OpenLigaDB.de · ODbL" },
    ferien: { c: "OpenHolidays API · ODbL", q: [["BW", "Baden-Württemberg"], ["BY", "Bayern"], ["BE", "Berlin"], ["BB", "Brandenburg"], ["HB", "Bremen"], ["HH", "Hamburg"], ["HE", "Hessen"], ["MV", "Mecklenburg-Vorpommern"], ["NI", "Niedersachsen"], ["NW", "Nordrhein-Westfalen"], ["RP", "Rheinland-Pfalz"], ["SL", "Saarland"], ["SN", "Sachsen"], ["ST", "Sachsen-Anhalt"], ["SH", "Schleswig-Holstein"], ["TH", "Thüringen"]] },
    zucker: { c: "Open Food Facts · ODbL", q: [["cola", "Cola", "Cola"], ["schoko", "Schokolade", "Chocolate"], ["ketchup", "Ketchup", "Ketchup"], ["eistee", "Eistee", "Iced tea"], ["cornflakes", "Cornflakes", "Cornflakes"], ["aufstrich", "Schoko-Aufstrich", "Choc spread"]] },
    beben: { c: "U.S. Geological Survey · Public Domain" },
    damals: { c: "Wikipedia · CC BY-SA 4.0" },
    polarlicht: { c: "NOAA Space Weather Prediction Center · Public Domain" },
    pollen: { c: "Deutscher Wetterdienst · CC BY 4.0", q: [["10", "Schleswig-Holstein, Hamburg"], ["20", "Mecklenburg-Vorpommern"], ["30", "Niedersachsen, Bremen"], ["40", "Nordrhein-Westfalen"], ["50", "Brandenburg, Berlin"], ["60", "Sachsen-Anhalt"], ["70", "Thüringen"], ["80", "Sachsen"], ["90", "Hessen"], ["100", "Rheinland-Pfalz, Saarland"], ["110", "Baden-Württemberg"], ["120", "Bayern"]] }
  };
  var DATE = /^\d{4}-\d{2}-\d{2}$/, MAX = 60;

  function clean(s, max) {
    var t = Array.from(String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
    return t && C.isClean(t) ? t : "";
  }
  function has(id) { return typeof id === "string" && Object.prototype.hasOwnProperty.call(SRC, id); }
  // The strip on a card: which source, which day, and one line from the answer. Anything else is dropped.
  function sanitize(o) {
    if (!o || typeof o !== "object" || !has(o.a) || !DATE.test(o.d)) return null;
    var v = clean(o.v, MAX), out = { a: o.a, d: o.d };
    if (v) out.v = v;
    return out;
  }
  function credit(strip) { return strip && has(strip.a) ? SRC[strip.a].c : ""; }
  // The server's answer -> what the page shows. Only a full, well-formed answer counts.
  function verdict(status, json, id) {
    if (status === 200 && json && json.api === id && typeof json.h === "string" && json.h) {
      if (json.c !== undefined && !(Array.isArray(json.c) && json.c.length >= 2 && json.c.length <= 4 && json.a >= 0 && json.a < json.c.length)) return "fail";
      return "ok";
    }
    if (status === 404) return "none";
    if (status === 422) return "blocked";
    if (status === 429) return "busy";
    return "fail";
  }
  // A quiz answer is final: one tap, no second try, and the strip always shows the real answer.
  function answer(json, pick) {
    var right = pick === json.a;
    return { right: right, v: clean((right ? "✓ " : "✗ ") + (typeof json.r === "string" && json.r ? json.r : json.c[json.a]), MAX) };
  }
  function label(chip, lang) { return lang === "en" && chip[2] ? chip[2] : chip[1]; }
  var api = { SRC: SRC, has: has, sanitize: sanitize, credit: credit, verdict: verdict, answer: answer, label: label, clean: clean };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Facts = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
