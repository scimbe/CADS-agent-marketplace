// Z1 bedienen, Teil 2/4: zug-einkauf, zug-wunschzettel, geschenk-finder auf 360x740, 390x844, 412x915, 1280x800.
// Ablaeufe und Pruefungen (Verdeckung, axe, Ueberlauf, Seitenfehler) in test/e2e/lib/z1play.mjs.
import { flowTest, VIEWS_RUN, withBrowser, wishReplyTest } from "./lib/z1play.mjs";

withBrowser();
for (const view of VIEWS_RUN) for (const id of ["zug-einkauf", "zug-wunschzettel", "geschenk-finder"]) flowTest(id, view);
wishReplyTest();
