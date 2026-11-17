// Z1 bedienen, Teil 4/4: zug-reihum, zug-umschlag, raum-sorry auf 360x740, 390x844, 412x915, 1280x800.
// Ablaeufe und Pruefungen (Verdeckung, axe, Ueberlauf, Seitenfehler) in test/e2e/lib/z1play.mjs.
import { flowTest, VIEWS_RUN, withBrowser, sorryTest } from "./lib/z1play.mjs";

withBrowser();
for (const view of VIEWS_RUN) for (const id of ["zug-reihum", "zug-umschlag"]) flowTest(id, view);
for (const view of VIEWS_RUN) sorryTest(view);
