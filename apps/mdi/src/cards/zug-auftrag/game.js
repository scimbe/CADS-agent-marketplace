// zug-auftrag "Ich geb dir eine Aufgabe" – Altregel turns.js:225-229 (GAMES.auftrag): beide waehlen eine Aufgabe fuer den anderen.
import { D, T, fmt, pair } from "../../engines/zug-z2/lib.js";

function jobs(doc, m, now, lang) { return D.jobs.map((x, i) => pair(D.jobs, i, lang)); }
export default {
  turns: [[{ w: "pick", l: "job_pick", n: 1, from: jobs }], [{ w: "pick", l: "job_pick", n: 1, from: jobs }]],
  result(doc, m, lang) { const X = T(lang), l = jobs(doc, m, [], lang); return { h: X.job_h, lines: [fmt(X.job_a, { w: l[m[1][0][0]] }), fmt(X.job_b, { w: l[m[0][0][0]] })] }; }
};
