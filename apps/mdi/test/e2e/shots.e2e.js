// Bildschirmfotos aller D0-Zustaende fuer die Design-Kritik (nur mit MDI_SHOTS=<ordner>), in drei Varianten.
import test from "node:test";
import path from "node:path";
import { browser, shotsDir } from "./lib/grund.mjs";
import { visitAll } from "./lib/states.mjs";

const DIR = shotsDir();
test("Fotos: Telefon hell de, Telefon dunkel en, Desktop hell de", { skip: !DIR && "MDI_SHOTS nicht gesetzt" }, async () => {
  const b = await browser();
  try {
    for (const o of [{ view: "phone390", lang: "de", scheme: "light" }, { view: "phone390", lang: "en", scheme: "dark" }, { view: "desk1280", lang: "de", scheme: "light" }]) {
      const tag = o.view + "-" + o.scheme + "-" + o.lang;
      await visitAll(b, o, (name, p) => p.screenshot({ path: path.join(DIR, tag + "-" + name + ".png"), fullPage: o.view === "phone390" }));
    }
  } finally { await b.close(); }
});
