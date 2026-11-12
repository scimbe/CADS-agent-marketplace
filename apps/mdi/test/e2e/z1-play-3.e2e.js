// Z1 bedienen, Teil 3/4: karte-danke, zug-kapsel, zug-gutschein, zug-wichteln auf 360x740, 390x844, 412x915, 1280x800.
// Ablaeufe und Pruefungen (Verdeckung, axe, Ueberlauf, Seitenfehler) in test/e2e/lib/z1play.mjs.
import { flowTest, VIEWS_RUN, withBrowser } from "./lib/z1play.mjs";

withBrowser();
for (const view of VIEWS_RUN) for (const id of ["karte-danke", "zug-kapsel", "zug-gutschein", "zug-wichteln"]) flowTest(id, view);
