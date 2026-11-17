// Z1 bedienen, Teil 1/4: zug-einig, zug-sammeln, zug-termin auf 360x740, 390x844, 412x915, 1280x800.
// Ablaeufe und Pruefungen (Verdeckung, axe, Ueberlauf, Seitenfehler) in test/e2e/lib/z1play.mjs.
import { flowTest, VIEWS_RUN, withBrowser } from "./lib/z1play.mjs";

withBrowser();
for (const view of VIEWS_RUN) for (const id of ["zug-einig", "zug-sammeln", "zug-termin"]) flowTest(id, view);
