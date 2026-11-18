#!/usr/bin/env node
// Freie Karte 2, P3 (Review S1): der Pruefstand als eigener Container ohne Geheimnisse und ohne Netz nach aussen. Hier – und
// nur hier – laeuft Chromium mit dem fremden Spielcode (runGame, Fotos). Der Bau-Worker (bau/main.mjs, mit Key und Token)
// ruft ihn ueber ein internes Netz (mdi-pruef-net, --internal) auf:
//   POST /pruefe { code, name, seed, seconds, szenarien } -> { report, policy, ok }
//   POST /fotos  { code, seed }                           -> { shots: [base64 png], status, errs }
// Sonst nichts. Groesse der Anfragen begrenzt; Chromium mit Sandbox (MDI_CHROMIUM_SANDBOX=1) und ohne WebRTC.
// Umgebung: PRUEF_PORT (8796), PRUEF_HOST (0.0.0.0 im Container; kein veroeffentlichter Port).
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPruefstand } from "./pruefen.mjs";
import { checkSzenarien } from "../src/spiel/szenario.js";
import { LIMITS } from "../src/spiel/api.js";

const MAX_BODY = LIMITS.codeBytes * 2 + 65536;

/** @param {{pruefe:Function, fotos:Function}} pruef */
export function createPruefDienst(pruef, log = () => {}) {
  const send = (res, status, body) => { const s = JSON.stringify(body); res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(s) }).end(s); };
  async function body(req) {
    let n = 0; const parts = [];
    for await (const c of req) { n += c.length; if (n > MAX_BODY) return undefined; parts.push(c); }
    try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return undefined; }
  }
  const okCode = (c) => typeof c === "string" && c.length > 0 && Buffer.byteLength(c) <= LIMITS.codeBytes;
  const okSeed = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s);
  return http.createServer(async (req, res) => {
    try {
      const p = new URL(req.url, "http://x").pathname;
      if (req.method !== "POST" || (p !== "/pruefe" && p !== "/fotos")) { req.resume(); return send(res, 404, { error: "not-found" }); }
      const b = await body(req);
      if (!b || !okCode(b.code) || !okSeed(b.seed)) return send(res, 400, { error: "bad-request" });
      if (p === "/pruefe") {
        const szenarien = b.szenarien || [];
        if (checkSzenarien(szenarien) || !Number.isInteger(b.seconds) || b.seconds < 1 || b.seconds > 120 || typeof b.name !== "string") return send(res, 400, { error: "bad-request" });
        return send(res, 200, await pruef.pruefe(b.code, { name: b.name.slice(0, 80), seed: b.seed, seconds: b.seconds, szenarien }));
      }
      const f = await pruef.fotos(b.code, { seed: b.seed });
      return send(res, 200, { shots: f.shots.map((x) => Buffer.from(x).toString("base64")), status: f.status, errs: f.errs });
    } catch (e) {
      log({ event: "pruef-dienst", ok: false, msg: String(e && e.message || e).slice(0, 200) });
      if (!res.headersSent) send(res, 500, { error: "pruefstand" });
    }
  });
}

/** Client im Bau-Worker: dieselbe Schnittstelle wie createPruefstand() (pruefe, fotos, close), ueber HTTP. */
export function createPruefClient({ base, fetchImpl = fetch, timeoutMs = 10 * 60 * 1000 }) {
  async function post(p, body) {
    const r = await fetchImpl(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (r.status !== 200) throw new Error("pruefstand: HTTP " + r.status);
    return r.json();
  }
  return {
    pruefe: (code, { name = "karte", seed = "p3", seconds = 60, szenarien = [] } = {}) => post("/pruefe", { code, name, seed, seconds, szenarien }),
    async fotos(code, { seed = "foto" } = {}) { const f = await post("/fotos", { code, seed }); return { ...f, shots: f.shots.map((x) => Buffer.from(x, "base64")) }; },
    async close() {}
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
  const pruef = await createPruefstand();
  const server = createPruefDienst(pruef, log);
  const port = Number(process.env.PRUEF_PORT || 8796), host = process.env.PRUEF_HOST || "0.0.0.0";
  server.listen(port, host, () => log({ event: "pruef-dienst-start", port, sandbox: process.env.MDI_CHROMIUM_SANDBOX === "1" }));
  for (const s of ["SIGTERM", "SIGINT"]) process.once(s, () => server.close(async () => { await pruef.close(); process.exit(0); }));
}
