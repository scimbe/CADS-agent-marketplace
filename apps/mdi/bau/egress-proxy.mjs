#!/usr/bin/env node
// Freie Karte 2, P3: Egress-Proxy des Bau-Workers. Der Worker haengt nur an Docker-Netzen mit --internal (kein Ausgang); dieser
// kleine Container haengt an seinem internen Netz und an einem normalen Netz und laesst ausschliesslich CONNECT zu den Zielen
// der Allowlist durch (Standard: api.anthropic.com:443). Alles andere – andere Ziele, andere Ports, normale HTTP-Anfragen,
// Upgrades – wird abgelehnt. DNS loest der Proxy auf, der Worker braucht keins. Keine Aenderung an der Host-Firewall.
// Kein Inhalt wird gelesen oder geloggt (TLS laeuft Ende-zu-Ende), nur Ziel und Ergebnis.
//
// Umgebung: EGRESS_ALLOW (Komma-Liste host:port, Standard api.anthropic.com:443), EGRESS_PORT (3128), EGRESS_HOST (0.0.0.0),
// EGRESS_MAX (gleichzeitige Tunnel, 16), EGRESS_IDLE_MS (Leerlauf eines Tunnels, 120000).
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_STANDARD = Object.freeze(["api.anthropic.com:443"]);
const ZIEL = /^([a-z0-9.-]{1,253}):(\d{1,5})$/;

/**
 * @param {{allow:string[], max?:number, idleMs?:number, connect?:typeof net.connect, log?:(o:object)=>void}} o
 */
export function createEgressProxy(o) {
  const allow = new Set(o.allow.map((x) => x.toLowerCase()));
  if (!allow.size || [...allow].some((x) => !ZIEL.test(x))) throw new Error("egress-proxy: EGRESS_ALLOW braucht host:port");
  const max = o.max || 16, idleMs = o.idleMs || 120000, connect = o.connect || net.connect, log = o.log || (() => {});
  let offen = 0;
  const server = http.createServer((req, res) => {
    // nur CONNECT: jede andere Anfrage (auch an erlaubte Hosts) wird abgelehnt
    log({ event: "egress", ok: false, why: "methode", m: req.method });
    req.resume(); res.writeHead(405, { Allow: "CONNECT", Connection: "close" }).end();
  });
  server.on("upgrade", (req, socket) => { log({ event: "egress", ok: false, why: "upgrade" }); socket.end("HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n"); });
  server.on("connect", (req, client, head) => {
    const ziel = String(req.url || "").toLowerCase(), m = ZIEL.exec(ziel);
    const nein = (code, why) => { log({ event: "egress", ok: false, why, ziel: ziel.slice(0, 80) }); client.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); };
    if (!m || !allow.has(ziel)) return nein("403 Forbidden", "ziel");
    if (offen >= max) return nein("503 Service Unavailable", "voll");
    offen++;
    let fertig = false;
    const ende = () => { if (fertig) return; fertig = true; offen--; up.destroy(); client.destroy(); };
    const up = connect({ host: m[1], port: Number(m[2]) }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head && head.length) up.write(head);
      up.pipe(client); client.pipe(up);
      log({ event: "egress", ok: true, ziel });
    });
    for (const s of [up, client]) { s.setTimeout(idleMs, ende); s.on("error", ende); s.on("close", ende); }
  });
  server.on("clientError", (e, socket) => socket.destroy());
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const allow = process.env.EGRESS_ALLOW ? process.env.EGRESS_ALLOW.split(",").map((x) => x.trim()).filter(Boolean) : [...ALLOW_STANDARD];
  const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
  const server = createEgressProxy({ allow, max: Number(process.env.EGRESS_MAX || 16), idleMs: Number(process.env.EGRESS_IDLE_MS || 120000), log });
  const port = Number(process.env.EGRESS_PORT || 3128), host = process.env.EGRESS_HOST || "0.0.0.0";
  server.listen(port, host, () => log({ event: "egress-start", port, allow }));
  for (const s of ["SIGTERM", "SIGINT"]) process.once(s, () => server.close(() => process.exit(0)));
}
