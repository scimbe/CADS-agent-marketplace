// Gemeinsame E2E-Grundlage: Browser, Ansichten, Fehler-/CSP-Sammler, axe, Zustandsabfrage ueber die sichtbare UI.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, "../../..");
export const PAGE = "file://" + path.join(ROOT, "dist/index.html");
export const VIEWS = {
  phone360: { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone412: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true },
  desk1280: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
};
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

export async function browser(kind = "chromium") {
  const t = kind === "webkit" ? webkit : chromium;
  return t.launch({ executablePath: kind === "chromium" ? process.env.PW_CHROME || undefined : undefined });
}
/** Neue Seite mit Ansicht/Sprache/Farbschema; sammelt Fehler und CSP-Verstoesse. */
export async function open(b, { view = "phone390", lang = "de", scheme = "light", reduced = false, hash = "", init = [], before = null } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: lang === "de" ? "de-DE" : "en-GB", colorScheme: scheme, reducedMotion: reduced ? "reduce" : "no-preference" });
  ctx.setDefaultTimeout(15000);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective + " " + e.blockedURI)); });
  for (const s of init) await p.addInitScript(s);
  if (before) await before(ctx, p);
  await p.goto(PAGE + hash);
  await p.locator("header.bar").waitFor();
  return { ctx, p, errs };
}
// Karte oeffnen: steht sie nicht auf der aktuellen Seite (Startseite zeigt nur das Blatt und diese Woche), dann ueber das Regal,
// wo jede Karte des Registers eine Kachel hat (Strang H)
export async function act(p, id) {
  const l = p.locator('[data-act="' + id + '"]').first();
  if (id.startsWith("open-") && !(await l.count())) {
    const alle = p.locator('[data-act="intent-alle"]');
    if (await alle.count()) { await alle.first().click(); await p.locator("main.h-at-regal").waitFor(); }
    if (await p.locator("main.h-at-regal").count()) {   // Regal: Reiter Alles, ohne Suche und Filter, damit jede Karte eine Kachel hat
      await p.locator('[data-act="tab-alles"]').click();
      const q = p.locator("#h-q"); if (await q.count() && (await q.inputValue())) await q.fill("");
      const fam = p.locator('[data-act="fam-alle"]'); if (await fam.count() && (await fam.getAttribute("aria-pressed")) !== "true") await fam.click();
    }
  }
  return p.locator('[data-act="' + id + '"]').first().click();
}
export async function screen(p) { return p.locator("main").getAttribute("class").then((c) => c.split(" ").find((x) => x.startsWith("s-")).slice(2)); }
export async function waitScreen(p, s, ms = 15000) { await p.locator("main.s-" + s).waitFor({ timeout: ms }); }

/** Erster legaler Zug ueber die sichtbare UI: erste Option der aktuellen Wahl (kartenunabhaengig). */
export async function playVisible(p, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i++) {
    const s = await screen(p);
    if (s === "card-play-cover") { await act(p, "cover-ok"); continue; }
    if (s !== "card-play-turn") return s;
    const opts = p.locator(".choice .opt");
    await opts.last().click();
  }
  return screen(p);
}

export async function axe(p, label) {
  await p.evaluate(AXE);
  const r = await p.evaluate(() => globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }, resultTypes: ["violations"] }));
  return r.violations.map((v) => label + ": " + v.id + " (" + v.impact + ") " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "));
}
export async function noOverflow(p) { return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
export function shotsDir() { const d = process.env.MDI_SHOTS; if (d) fs.mkdirSync(d, { recursive: true }); return d || null; }
