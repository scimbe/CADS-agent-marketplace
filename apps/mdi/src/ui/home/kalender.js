// Feiertage und Schulferien je Land (2026-2028, Ferien 2026/27). Portierung von alt:src/kalender.js; Daten unveraendert
// (kalender.json, Quellen dort). Reine Abfragen ohne DOM. Fehlt ein Jahr, ist das Ergebnis null (nie geraten).
import K from "./kalender.json" with { type: "json" };

const DAY = 86400000, YMD = /^\d{4}-\d{2}-\d{2}$/;
const land = (l) => (Object.prototype.hasOwnProperty.call(K.laender, l) ? l : null);
const name = (map, k, lang) => { const n = map[k]; return n ? n[lang] || n.de : k; };
export function feiertage(l, jahr, lang = "de") {
  const list = K.feiertage[jahr];
  if (!land(l) || !list) return null;
  return list.filter((h) => h.l[0] === "*" || h.l.includes(l) || (h.teil || []).includes(l))
    .map((h) => ({ d: h.d, k: h.k, name: name(K.feiertagNamen, h.k, lang), teil: (h.teil || []).includes(l) }));
}
export function ferien(l, schuljahr, lang = "de") {
  const y = K.ferien[schuljahr];
  if (!land(l) || !y || !y[l]) return null;
  return y[l].map((r) => ({ von: r[0], bis: r[1], k: r[2], name: name(K.ferienNamen, r[2], lang) }));
}
export function tag(d, l, lang = "de") {
  if (typeof d !== "string" || !YMD.test(d) || !land(l) || isNaN(Date.parse(d + "T00:00:00Z")) || new Date(d + "T00:00:00Z").toISOString().slice(0, 10) !== d) return null;
  const f = feiertage(l, d.slice(0, 4), lang);
  if (!f) return null;
  const h = f.filter((x) => x.d === d && !x.teil)[0];
  let fe = "";
  for (const sj of Object.keys(K.ferien)) for (const r of ferien(l, sj, lang) || []) if (!fe && r.von <= d && d <= r.bis) fe = r.name;
  const wd = new Date(d + "T00:00:00Z").getUTCDay();
  return { feiertag: h ? h.name : "", ferien: fe, wochenende: wd === 0 || wd === 6 };
}
export function arbeitstage(von, bis, l) {
  let n = 0;
  for (let t = Date.parse(von + "T00:00:00Z"); t <= Date.parse(bis + "T00:00:00Z"); t += DAY) {
    const x = tag(new Date(t).toISOString().slice(0, 10), l, "de");
    if (!x) return null;
    if (!x.wochenende && !x.feiertag) n++;
  }
  return n;
}
/** Bundesweiter Feiertag an diesem Tag (fuer das Kalenderblatt, ohne Landeswahl): Name oder "". */
export function bundesweit(d, lang = "de") {
  const list = K.feiertage[d.slice(0, 4)];
  if (!list) return "";
  const h = list.find((x) => x.d === d && x.l[0] === "*");
  return h ? name(K.feiertagNamen, h.k, lang) : "";
}
export const laender = () => ({ ...K.laender });
export const quelle = () => ({ ...K.quelle });
