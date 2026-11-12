// Zustaende der Heimseite (Strang H) fuer axe, Verdeckung, Ueberlauf und Screenshots: Kalenderblatt heute und geblaettert,
// Satz verstanden, Familienseite, Regal (Alles, Suche, Filter, Letzte Tage, Von anderen), Mein Regal (Wand, Einladungen,
// Gemerkt) mit Inhalt, Eigene Karte. Endet wieder auf dem Kalenderblatt von heute.
import { act } from "./grund.mjs";

async function home(p) { for (let i = 0; i < 6 && (await p.locator('[data-act="back"]').count()); i++) await act(p, "back"); await p.locator("main.h-at-day").waitFor(); }
export async function visitHome(p, cb, lang = "de") {
  await p.locator("main.h-at-day .h-leaf").waitFor();
  await cb("h01-kalender-heute", p);
  await act(p, "day-next"); await cb("h02-kalender-morgen", p);
  await act(p, "day-today");
  await act(p, "merken-zug-kennst").catch(() => {});
  await act(p, "intent-suchen"); await p.locator("#h-sentence").fill(lang === "de" ? "Danke an Oma" : "Thanks to Grandma"); await act(p, "understand");
  await p.locator("main.h-at-family").waitFor(); await cb("h03-satz-verstanden", p);
  await home(p); await act(p, "intent-spielen"); await p.locator("main.h-at-family").waitFor(); await cb("h04-familie-spielen", p);
  await act(p, "merken-zug-kennst");
  await home(p); await act(p, "intent-alle"); await p.locator("main.h-at-regal").waitFor(); await cb("h05-regal-alles", p);
  await act(p, "fam-bluff"); await cb("h06-regal-filter", p);
  await p.locator("#h-q").fill("quiz"); await cb("h07-regal-suche", p);
  await act(p, "tab-tage"); await cb("h08-regal-letzte-tage", p);
  await act(p, "tab-andere"); await cb("h09-regal-von-anderen", p);
  // "Eigene Karte": mit Strang K oeffnet die Kachel die freie Karte (inhalt.frei.*), sonst die Route "eigene"
  await home(p); await act(p, "frei"); await p.locator("main:not(.h-at-day)").waitFor(); await cb("h10-eigene-karte", p);
  // ein Werk verschicken: landet auf der Wand und in den Einladungen
  await home(p); await act(p, "open-gruss"); await p.locator("main.s-card-view").waitFor(); await act(p, "go"); await p.locator("main.s-card-share").waitFor();
  await home(p); await act(p, "meins"); await p.locator("main.h-at-meins").waitFor(); await p.locator(".h-work").first().waitFor(); await cb("h11-meins-wand", p);
  await act(p, "tab-einladungen"); await p.locator(".h-inv").first().waitFor(); await cb("h12-meins-einladungen", p);
  await act(p, "tab-gemerkt"); await cb("h13-meins-gemerkt", p);
  await act(p, "tab-wand"); await act(p, "wall-more-0"); await p.locator('[data-act="wall-off-0"]').waitFor(); await cb("h14-meins-menue", p); await act(p, "wall-off-0"); await p.locator(".h-undo").waitFor(); await cb("h14-meins-rueckgaengig", p);
  await act(p, "wall-undo");
  await home(p);
}
