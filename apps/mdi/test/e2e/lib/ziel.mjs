// Ziel der e2e-Suiten: die gebaute Datei (Standard) oder ein laufender Server (URL-Modus, z. B. Staging auf labor-setup.de).
//
//   MDI_BASE_URL=http://127.0.0.1:18794 npm run test:e2e:url
//
// MDI_BASE_URL   Ursprung des Servers (ohne Pfad). Gesetzt = URL-Modus.
// MDI_PAGE_PATH  Pfad der App auf dem Server, Standard /duell (der Fall der Produktion, ohne Schraegstrich).
// MDI_TEST_SESSION  Wert des Cookies ct_gate_session fuer angemeldete Ablaeufe (Staging: Gate-Attrappe, "staging-<name>").
//
// Im URL-Modus laufen alle Tests, die die App ueber open()/PAGE oeffnen, gegen den Server. Tests, deren Gegenstelle eine
// Attrappe ist (fakeWrapper, fakeFrei, fakeShell, fakeLive), werden uebersprungen (NEEDS_FAKE): ihre Annahmen ueber den
// Zustand der Attrappe gelten fuer einen echten Server nicht. Die echten Dienste prueft staging.e2e.js.
// nolive.js laesst im URL-Modus genau den Ursprung von MDI_BASE_URL durch; jeder andere Host bleibt gesperrt.
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const raw = String(process.env.MDI_BASE_URL || "").trim();
let base = "";
if (raw) {
  const u = new URL(raw); // wirft bei einer ungueltigen Adresse: lieber Abbruch als stiller Rueckfall auf die Datei
  if (!/^https?:$/.test(u.protocol) || (u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) throw new Error("MDI_BASE_URL muss ein Ursprung sein, z. B. http://127.0.0.1:18794 (Pfad in MDI_PAGE_PATH): " + raw);
  base = u.origin;
}
const pagePath = String(process.env.MDI_PAGE_PATH || "/duell");
if (base && !/^\/[\x21-\x7e]*$/.test(pagePath)) throw new Error("MDI_PAGE_PATH muss mit / beginnen: " + pagePath);

export const BASE = base;
export const URL_MODE = !!base;
export const PAGE = base ? base + pagePath : "file://" + path.join(ROOT, "dist/index.html");
/** Fuer test(name, { skip: NEEDS_FAKE }, fn): im URL-Modus uebersprungen, mit Grund. */
export const NEEDS_FAKE = URL_MODE ? "braucht eine Attrappe als Gegenstelle (URL-Modus, siehe staging.e2e.js)" : false;
/** Ganze Datei mit Attrappe: const test = fakeOnly(nodeTest) – Hooks bleiben, jeder Test bekommt NEEDS_FAKE. */
export function fakeOnly(t) {
  if (!URL_MODE) return t;
  const f = (name, o, fn) => (typeof o === "function" ? t(name, { skip: NEEDS_FAKE }, o) : t(name, { ...o, skip: NEEDS_FAKE }, fn));
  return Object.assign(f, { before: t.before, after: t.after, beforeEach: t.beforeEach, afterEach: t.afterEach, skip: t.skip, todo: t.todo });
}
/** Testsitzung fuer angemeldete Ablaeufe im URL-Modus (Cookie des Login-Gates, auf Staging von der Gate-Attrappe gedeutet). */
export async function loginCookie(ctx, value = process.env.MDI_TEST_SESSION) {
  if (!URL_MODE) throw new Error("loginCookie nur im URL-Modus");
  if (!value) throw new Error("MDI_TEST_SESSION fehlt (Staging: staging-<name>)");
  await ctx.addCookies([{ name: "ct_gate_session", value, url: BASE }]);
}
