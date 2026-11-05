"use strict";
// Writes src/kalender.json: public holidays per Land 2026-2028 and school holidays 2026/27, for the cards that plan with
// days off (biz-brueckentage, biz-urlaub, zug-ferien). Run: node scripts/kalender-daten.js. test/kalender.test.js checks
// the file against this script and against fixed dates.
//
// Sources (facts set by law, no text taken over):
// - Public holidays: the Sonn- und Feiertagsgesetze of the 16 Laender (Ostersonntag/Pfingstsonntag in Brandenburg,
//   Frauentag in Berlin and Mecklenburg-Vorpommern, Weltkindertag in Thueringen, Berlin's one-off 17.06.2028:
//   GVBl. Berlin Nr. 28 vom 20.07.2024). Moving days from the Easter date (Gauss/Lichtenberg).
// - School holidays: "Ferien im Schuljahr 2026/2027", Sekretariat der Kultusministerkonferenz, Stand 09.10.2025,
//   https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2026_27.pdf (first and last day off as listed there).
//   The dates are set by the Laender in their Ferienverordnungen (amtliche Werke, Paragraf 5 UrhG); the file holds only
//   the dates. Cross-checked against the OpenHolidays API (ODbL), from which nothing is copied.
const fs = require("fs");
const path = require("path");

const LAENDER = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen",
  MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen",
  ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };
const ALL = Object.keys(LAENDER);

function easter(y) {   // Gregorian Easter Sunday (anonymous Gregorian algorithm)
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const DAY = 86400000;

// k: key of the name below; l: the Laender where it is a holiday everywhere; teil: Laender where it holds only in part
// of the Land (Mariä Himmelfahrt in Bavaria's mainly Catholic municipalities, Fronleichnam in some places in SN and TH).
function holidays(y) {
  const E = easter(y), at = (o) => iso(E + o * DAY), f = (m, d) => y + "-" + m + "-" + d;
  // Buss- und Bettag: the Wednesday before 23 November
  let bb = Date.UTC(y, 10, 22); while (new Date(bb).getUTCDay() !== 3) bb -= DAY;
  const list = [
    { d: f("01", "01"), k: "neujahr", l: ALL },
    { d: f("01", "06"), k: "dreikoenige", l: ["BW", "BY", "ST"] },
    { d: f("03", "08"), k: "frauentag", l: ["BE", "MV"] },
    { d: at(-2), k: "karfreitag", l: ALL },
    { d: at(0), k: "ostersonntag", l: ["BB"] },
    { d: at(1), k: "ostermontag", l: ALL },
    { d: f("05", "01"), k: "arbeit", l: ALL },
    { d: at(39), k: "himmelfahrt", l: ALL },
    { d: at(49), k: "pfingstsonntag", l: ["BB"] },
    { d: at(50), k: "pfingstmontag", l: ALL },
    { d: at(60), k: "fronleichnam", l: ["BW", "BY", "HE", "NW", "RP", "SL"], teil: ["SN", "TH"] },
    { d: f("08", "15"), k: "mariae", l: ["SL"], teil: ["BY"] },
    { d: f("09", "20"), k: "kindertag", l: ["TH"] },
    { d: f("10", "03"), k: "einheit", l: ALL },
    { d: f("10", "31"), k: "reformation", l: ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"] },
    { d: f("11", "01"), k: "allerheiligen", l: ["BW", "BY", "NW", "RP", "SL"] },
    { d: iso(bb), k: "busstag", l: ["SN"] },
    { d: f("12", "25"), k: "weihnachten1", l: ALL },
    { d: f("12", "26"), k: "weihnachten2", l: ALL }
  ];
  if (y === 2028) list.push({ d: "2028-06-17", k: "volksaufstand", l: ["BE"] });
  return list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)).map((h) => { const o = { d: h.d, k: h.k, l: h.l.length === 16 ? ["*"] : h.l }; if (h.teil) o.teil = h.teil; return o; });
}
const NAMEN = {
  neujahr: ["Neujahr", "New Year's Day"], dreikoenige: ["Heilige Drei Könige", "Epiphany"], frauentag: ["Internationaler Frauentag", "International Women's Day"],
  karfreitag: ["Karfreitag", "Good Friday"], ostersonntag: ["Ostersonntag", "Easter Sunday"], ostermontag: ["Ostermontag", "Easter Monday"],
  arbeit: ["Tag der Arbeit", "Labour Day"], himmelfahrt: ["Christi Himmelfahrt", "Ascension Day"], pfingstsonntag: ["Pfingstsonntag", "Whit Sunday"],
  pfingstmontag: ["Pfingstmontag", "Whit Monday"], fronleichnam: ["Fronleichnam", "Corpus Christi"], mariae: ["Mariä Himmelfahrt", "Assumption Day"],
  kindertag: ["Weltkindertag", "World Children's Day"], einheit: ["Tag der Deutschen Einheit", "German Unity Day"], reformation: ["Reformationstag", "Reformation Day"],
  allerheiligen: ["Allerheiligen", "All Saints' Day"], busstag: ["Buß- und Bettag", "Day of Repentance and Prayer"],
  weihnachten1: ["1. Weihnachtstag", "Christmas Day"], weihnachten2: ["2. Weihnachtstag", "Boxing Day"],
  volksaufstand: ["75. Jahrestag des Volksaufstands in der DDR", "75th anniversary of the East German uprising"]
};

// KMK, Ferien im Schuljahr 2026/2027 (Stand 09.10.2025): [first, last, kind]; "frei" are single days off (bewegliche
// Ferientage, Brueckentage) as listed. Sonderregeln (SH: Sylt, Foehr, Amrum, Helgoland, Halligen) are not in the file.
const r = (a, b, k) => [a, b || a, k];
const FERIEN_2026_27 = {
  BW: [r("2026-10-26", "2026-10-30", "herbst"), r("2026-10-31", 0, "frei"), r("2026-12-23", "2027-01-09", "weihnachten"), r("2027-03-25", 0, "frei"), r("2027-03-30", "2027-04-03", "ostern"), r("2027-05-18", "2027-05-29", "pfingsten"), r("2027-07-29", "2027-09-11", "sommer")],
  BY: [r("2026-11-02", "2026-11-06", "herbst"), r("2026-12-24", "2027-01-08", "weihnachten"), r("2027-02-08", "2027-02-12", "winter"), r("2027-03-22", "2027-04-02", "ostern"), r("2027-05-18", "2027-05-28", "pfingsten"), r("2027-08-02", "2027-09-13", "sommer")],
  BE: [r("2026-10-19", "2026-10-31", "herbst"), r("2026-12-23", "2027-01-02", "weihnachten"), r("2027-02-01", "2027-02-06", "winter"), r("2027-03-22", "2027-04-02", "ostern"), r("2027-05-07", 0, "frei"), r("2027-05-18", "2027-05-19", "pfingsten"), r("2027-07-01", "2027-08-14", "sommer")],
  BB: [r("2026-10-19", "2026-10-30", "herbst"), r("2026-12-23", "2027-01-02", "weihnachten"), r("2027-02-01", "2027-02-06", "winter"), r("2027-03-22", "2027-04-03", "ostern"), r("2027-05-18", 0, "pfingsten"), r("2027-07-01", "2027-08-14", "sommer")],
  HB: [r("2026-10-12", "2026-10-24", "herbst"), r("2026-12-23", "2027-01-09", "weihnachten"), r("2027-02-01", "2027-02-02", "winter"), r("2027-03-22", "2027-04-03", "ostern"), r("2027-05-07", 0, "frei"), r("2027-05-18", 0, "pfingsten"), r("2027-07-08", "2027-08-18", "sommer")],
  HH: [r("2026-10-19", "2026-10-30", "herbst"), r("2026-12-21", "2027-01-01", "weihnachten"), r("2027-01-29", 0, "winter"), r("2027-03-01", "2027-03-12", "ostern"), r("2027-05-07", "2027-05-14", "pfingsten"), r("2027-07-01", "2027-08-11", "sommer")],
  HE: [r("2026-10-05", "2026-10-17", "herbst"), r("2026-12-23", "2027-01-12", "weihnachten"), r("2027-03-22", "2027-04-02", "ostern"), r("2027-06-28", "2027-08-06", "sommer")],
  MV: [r("2026-10-15", "2026-10-24", "herbst"), r("2026-12-21", "2027-01-02", "weihnachten"), r("2027-02-08", "2027-02-19", "winter"), r("2027-03-24", "2027-04-02", "ostern"), r("2027-05-07", 0, "frei"), r("2027-05-14", "2027-05-18", "pfingsten"), r("2027-07-05", "2027-08-14", "sommer")],
  NI: [r("2026-10-12", "2026-10-24", "herbst"), r("2026-12-23", "2027-01-09", "weihnachten"), r("2027-02-01", "2027-02-02", "winter"), r("2027-03-22", "2027-04-03", "ostern"), r("2027-05-07", 0, "frei"), r("2027-05-18", 0, "pfingsten"), r("2027-07-08", "2027-08-18", "sommer")],
  NW: [r("2026-10-17", "2026-10-31", "herbst"), r("2026-12-23", "2027-01-06", "weihnachten"), r("2027-03-22", "2027-04-03", "ostern"), r("2027-05-18", 0, "pfingsten"), r("2027-07-19", "2027-08-31", "sommer")],
  RP: [r("2026-10-05", "2026-10-16", "herbst"), r("2026-12-23", "2027-01-08", "weihnachten"), r("2027-03-22", "2027-04-02", "ostern"), r("2027-06-28", "2027-08-06", "sommer")],
  SL: [r("2026-10-05", "2026-10-16", "herbst"), r("2026-12-21", "2026-12-31", "weihnachten"), r("2027-02-08", "2027-02-12", "winter"), r("2027-03-30", "2027-04-09", "ostern"), r("2027-06-28", "2027-08-06", "sommer")],
  SN: [r("2026-10-12", "2026-10-24", "herbst"), r("2026-12-23", "2027-01-02", "weihnachten"), r("2027-02-08", "2027-02-19", "winter"), r("2027-03-26", "2027-04-02", "ostern"), r("2027-05-07", 0, "frei"), r("2027-05-15", "2027-05-18", "pfingsten"), r("2027-07-10", "2027-08-20", "sommer")],
  ST: [r("2026-10-19", "2026-10-30", "herbst"), r("2026-12-21", "2027-01-02", "weihnachten"), r("2027-02-01", "2027-02-06", "winter"), r("2027-03-22", "2027-03-27", "ostern"), r("2027-05-15", "2027-05-22", "pfingsten"), r("2027-07-10", "2027-08-20", "sommer")],
  SH: [r("2026-10-12", "2026-10-24", "herbst"), r("2026-12-21", "2027-01-06", "weihnachten"), r("2027-03-30", "2027-04-10", "ostern"), r("2027-05-07", 0, "frei"), r("2027-07-03", "2027-08-14", "sommer")],
  TH: [r("2026-10-12", "2026-10-24", "herbst"), r("2026-12-23", "2027-01-02", "weihnachten"), r("2027-02-01", "2027-02-06", "winter"), r("2027-03-22", "2027-04-03", "ostern"), r("2027-05-07", 0, "frei"), r("2027-07-10", "2027-08-20", "sommer")]
};
const FERIEN_NAMEN = { herbst: ["Herbstferien", "Autumn holidays"], weihnachten: ["Weihnachtsferien", "Christmas holidays"], winter: ["Winterferien", "Winter holidays"],
  ostern: ["Osterferien", "Easter holidays"], pfingsten: ["Pfingstferien", "Whitsun holidays"], sommer: ["Sommerferien", "Summer holidays"], frei: ["Freier Tag", "Day off"] };

function build() {
  const names = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { de: v[0], en: v[1] }]));
  return {
    v: 1,
    quelle: {
      feiertage: "Sonn- und Feiertagsgesetze der Länder, Stand 2026; Berlin 17.06.2028: GVBl. Berlin Nr. 28 vom 20.07.2024",
      ferien: "Kultusministerkonferenz: Ferien im Schuljahr 2026/2027, Stand 09.10.2025, https://www.kmk.org/fileadmin/Dateien/pdf/Ferienkalender/FER2026_27.pdf",
      lizenz: "Nur Daten aus amtlichen Festlegungen (Feiertagsgesetze, Ferienverordnungen der Länder; amtliche Werke nach § 5 UrhG), keine Texte übernommen",
      hinweis: "Schleswig-Holstein: Sonderregeln für Sylt, Föhr, Amrum, Helgoland und die Halligen fehlen. teil: gilt nur in Teilen des Landes."
    },
    laender: LAENDER,
    jahre: [2026, 2027, 2028],
    feiertage: { 2026: holidays(2026), 2027: holidays(2027), 2028: holidays(2028) },
    feiertagNamen: names(NAMEN),
    ferien: { "2026/27": FERIEN_2026_27 },
    ferienNamen: names(FERIEN_NAMEN)
  };
}
module.exports = { build, easter, holidays };
if (require.main === module) {
  const out = path.join(__dirname, "../src/kalender.json");
  fs.writeFileSync(out, JSON.stringify(build()) + "\n");
  console.log(out, fs.statSync(out).size, "bytes");
}
