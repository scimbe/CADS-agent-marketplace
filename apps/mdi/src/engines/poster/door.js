// Adventstuer beim Empfaenger (alt:src/door.js): zuerst zu mit ihrer Nummer, ein Tipp oeffnet sie. Nie gesperrt: eine zu
// frueh geoeffnete Tuer sagt nur, fuer welchen Tag sie gedacht war. Alles in UTC wie im Altcode, aber aus dem UTC-Tag
// (Tage seit 1970-01-01, ctx.today) statt aus Date: Kartenmodule kennen keine Uhr (Harness).

/** UTC-Tag -> {y, m (1-12), d}; Algorithmus civil_from_days (H. Hinnant), nur Ganzzahl. */
export function civil(day) {
  const z = day + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}
/** Die Tuer traegt ihre Nummer 1-24; vor Dezember und nach dem 24. ist es die erste (alt daily.js:321 doorNumber). */
export function doorNumber(today) { const c = civil(today); return c.m === 12 && c.d <= 24 ? c.d : 1; }
/** Vor ihrem Tag in diesem Advent (November, oder Dezember vor der Nummer); alt door.js early. */
export function early(nr, today) { const c = civil(today); return c.m === 11 || (c.m === 12 && c.d < nr); }
// Flocken auf den geschlossenen Fluegeln (Prozent der Tuer), alt door.js:27
export const FLAKES = [[8, 6], [80, 10], [22, 84], [86, 78], [46, 4], [10, 46]];
