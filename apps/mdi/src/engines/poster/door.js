// Adventstuer beim Empfaenger (alt:src/door.js): zuerst zu mit ihrer Nummer, ein Tipp oeffnet sie. Nie gesperrt: eine zu
// frueh geoeffnete Tuer sagt nur, fuer welchen Tag sie gedacht war. Datum in UTC wie im Altcode.
/** Vor ihrem Tag in diesem Advent (November, oder Dezember vor der Nummer). */
export function early(nr, now) {
  const m = now.getUTCMonth(), d = now.getUTCDate();
  return m === 10 || (m === 11 && d < nr);
}
// Flocken auf den geschlossenen Fluegeln (Prozent der Tuer), alt door.js:27
export const FLAKES = [[8, 6], [80, 10], [22, 84], [86, 78], [46, 4], [10, 46]];
