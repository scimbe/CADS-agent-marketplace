#!/usr/bin/env node
// Freie Karte 2, P3: statischer Spiel-Dienst fuer den eigenen Ursprung (spiel-f29c55da.bunsenbrenner.org; auf ssh-united
// zeigt ein CADS-Tunnel auf 127.0.0.1:8794). Liefert NUR den Sandbox-Rahmen (frame.html, frame.js, frame.css aus
// scripts/spiel/build.mjs) und fertige Spielmodule /m/<sha256>.js aus SPIEL_MODULE_DIR (read-only gemountet; geschrieben
// vom Wrapper, nachdem der Bau-Worker das Spiel abgenommen hat). Sonst nichts: kein Verzeichnis, keine anderen Dateien,
// keine anderen Methoden als GET/HEAD.
//
// Kopfzeilen jeder Antwort: Content-Security-Policy = frameCsp(SPIEL_ORIGIN, App) (src/broker/spiel-csp.js: kein Netz,
// sandbox allow-scripts, frame-ancestors nur die App), X-Content-Type-Options: nosniff, Content-Type, Cache-Control,
// Referrer-Policy: no-referrer, Vary. Die App laeuft unter mehreren Urspruengen (APP_ORIGINS, wie PLAY_PARENTS im Build);
// eingebettet verlangt sie per iframe.csp genau frameCsp(SPIEL_ORIGIN, ihr Ursprung), Chromium schickt das als
// Sec-Required-CSP. Gehoert es zu einem erlaubten Ursprung, antwortet der Dienst mit genau dieser Policy, sonst mit der des
// ersten (dann zeigt Chromium den Rahmen nicht: fail closed). Module zusaetzlich Access-Control-Allow-Origin fuer einen
// erlaubten Origin der Anfrage, damit die App sie holen und gegen den sha256 aus dem Server-Status pruefen kann (die Datei
// heisst nach ihrem Hash; stimmt der Inhalt nicht, gibt es 404).
//
// Umgebung: SPIEL_ORIGIN, APP_ORIGINS (Pflicht, Urspruenge mit Komma), SPIEL_MODULE_DIR (Pflicht), SPIEL_PORT (8794),
// SPIEL_HOST (0.0.0.0 im Container; veroeffentlicht wird nur 127.0.0.1:8794).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildSpiel, frameCsp } from "../scripts/spiel/build.mjs";
import { LIMITS } from "../src/spiel/api.js";

const MODUL = /^\/m\/([0-9a-f]{64})\.js$/;
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/;

/**
 * Kopfzeilen einer Antwort (eine Quelle fuer Dienst und Test).
 * @param {{spielOrigin:string, appOrigins:string[]}} cfg
 * @param {string} art  "modul" | "fehlt" | MIME-Typ des Rahmens
 * @param {{required?:string, origin?:string}} anfrage  Sec-Required-CSP und Origin der Anfrage
 */
export function kopfzeilen(cfg, art, laenge, anfrage = {}) {
  const app = cfg.appOrigins.find((o) => frameCsp(cfg.spielOrigin, o) === anfrage.required) || cfg.appOrigins[0];
  const h = { "Content-Security-Policy": frameCsp(cfg.spielOrigin, app), "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Vary": "Sec-Required-CSP, Origin" };
  if (art === "modul") return { ...h, "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000, immutable", "Content-Length": String(laenge), ...(cfg.appOrigins.includes(anfrage.origin) ? { "Access-Control-Allow-Origin": anfrage.origin } : {}) };
  if (art === "fehlt") return { ...h, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Length": String(laenge) };
  return { ...h, "Content-Type": art + "; charset=utf-8", "Cache-Control": "no-cache", "Content-Length": String(laenge) };
}

/**
 * @param {{spielOrigin:string, appOrigins:string[], moduleDir:string}} cfg
 * @param {Awaited<ReturnType<typeof buildSpiel>>} built
 */
export function createSpielDienst(cfg, built, log = () => {}) {
  if (!ORIGIN.test(cfg.spielOrigin) || !cfg.appOrigins.length || !cfg.appOrigins.every((o) => ORIGIN.test(o))) throw new Error("spiel-dienst: SPIEL_ORIGIN und APP_ORIGINS muessen Urspruenge sein (https://host)");
  if (!cfg.moduleDir) throw new Error("spiel-dienst: SPIEL_MODULE_DIR fehlt");
  const rahmen = Object.fromEntries(Object.entries(built.frame).map(([n, f]) => ["/" + n, { body: Buffer.from(f.body, "utf8"), type: f.type }]));
  const fehlt = Buffer.from("nicht gefunden\n");
  function send(req, res, status, headers, body) { res.writeHead(status, headers); res.end(req.method === "HEAD" ? undefined : body); }
  function modul(hash) {
    const f = path.join(cfg.moduleDir, hash + ".js");
    let st;
    try { st = fs.lstatSync(f); } catch { return null; }
    if (!st.isFile() || st.size > LIMITS.codeBytes) return null;
    const body = fs.readFileSync(f);
    if (createHash("sha256").update(body).digest("hex") !== hash) { log({ event: "spiel-dienst", ok: false, why: "hash", hash }); return null; }
    return body;
  }
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://x"), anfrage = { required: req.headers["sec-required-csp"], origin: req.headers.origin };
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { ...kopfzeilen(cfg, "fehlt", 0, anfrage), Allow: "GET, HEAD" }); res.end(); return; }
    const r = rahmen[url.pathname];
    if (r) return send(req, res, 200, kopfzeilen(cfg, r.type, r.body.length, anfrage), r.body);
    const m = MODUL.exec(url.pathname);
    const body = m ? modul(m[1]) : null;
    if (body) return send(req, res, 200, kopfzeilen(cfg, "modul", body.length, anfrage), body);
    return send(req, res, 404, kopfzeilen(cfg, "fehlt", fehlt.length, anfrage), fehlt);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cfg = { spielOrigin: process.env.SPIEL_ORIGIN || "", appOrigins: String(process.env.APP_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean), moduleDir: process.env.SPIEL_MODULE_DIR || "" };
  const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
  const server = createSpielDienst(cfg, await buildSpiel(), log);
  const port = Number(process.env.SPIEL_PORT || 8794), host = process.env.SPIEL_HOST || "0.0.0.0";
  server.listen(port, host, () => log({ event: "spiel-dienst-start", port, spiel: cfg.spielOrigin, app: cfg.appOrigins }));
  for (const s of ["SIGTERM", "SIGINT"]) process.once(s, () => server.close(() => process.exit(0)));
}
