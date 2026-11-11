// Falsche App-Huelle fuer die e2e-Tests: stellt DuellHost.account (iOS-Form, Promise) bereit und fuehrt die Aufrufe wie die
// echte Huelle aus: Bearer statt Cookie (credentials "omit"), nur erlaubte Pfade, Token nie an die Seite. Das Token liegt
// hier nur in einer Closure des Init-Skripts (in der echten App: Keychain/Keystore, ausserhalb der Seite).
// Erlaubte Aufrufe: dieselbe exakte Liste wie in den Huellen (bridge-account-v1.json, ok:true).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ACCOUNT_ROUTES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../android/app/src/test/resources/bridge-account-v1.json"), "utf8"))
  .route.filter((c) => c.ok).map((c) => c.method + " " + c.path);

/** -> [Init-Skript, Argument] fuer context.addInitScript */
export function fakeShellScript() {
  return [(allowed) => {
    let token = null;
    const ok = (m, p) => allowed.includes(m + " " + p);
    const account = async (req) => {
      if (!req || req.v !== 1) return { v: 1, ok: false, error: "refused" };
      if (req.op === "state") return { v: 1, ok: true, available: true, signedIn: !!token };
      if (req.op === "login") { const r = await fetch("/__shell/login", { method: "POST", credentials: "omit" }); token = (await r.json()).token; return { v: 1, ok: true, signedIn: true }; }
      if (req.op === "logout") { const t = token; token = null; await fetch("/__shell/logout", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) }); return { v: 1, ok: true, signedIn: false }; }
      if (req.op !== "api" || !ok(req.method, req.path)) return { v: 1, ok: false, error: "refused" };
      const h = { ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}) };
      const r = await fetch(req.path, { method: req.method, credentials: "omit", redirect: "error", headers: h, body: req.body });
      return { v: 1, ok: true, status: r.status, body: await r.text() };
    };
    window.DuellHost = Object.freeze({ account });
  }, ACCOUNT_ROUTES];
}
