// Freie Karte 2, P3: fetch fuer das Anthropic-SDK, das jede HTTPS-Verbindung ueber den Egress-Proxy (HTTPS_PROXY, CONNECT)
// aufbaut. Der Worker hat sonst keinen Weg nach draussen (nur --internal-Netze); ohne Proxy-Adresse gibt es keinen Client.
// TLS bleibt Ende-zu-Ende zwischen Worker und Ziel (Zertifikat und Hostname werden geprueft), der Proxy sieht nur host:port.
// Rein Node, ohne zusaetzliches Paket; Antworten werden gestreamt (Readable.toWeb), AbortSignal wird durchgereicht.
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { Readable } from "node:stream";

/** Oeffnet einen CONNECT-Tunnel zum Ziel -> der rohe Socket (fuer Tests auch ohne TLS nutzbar). */
export function tunnel(proxy, host, port, { signal } = {}) {
  const p = new URL(proxy);
  return new Promise((ok, no) => {
    const req = http.request({ host: p.hostname, port: Number(p.port || 80), method: "CONNECT", path: host + ":" + port, headers: { Host: host + ":" + port }, signal });
    req.once("connect", (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); no(Object.assign(new Error("Egress-Proxy lehnt ab: " + res.statusCode + " fuer " + host + ":" + port), { code: "proxy-" + res.statusCode })); return; }
      ok(socket);
    });
    req.once("error", no);
    req.end();
  });
}

/** https.Agent, dessen Verbindungen durch den Tunnel laufen. */
export class ProxyAgent extends https.Agent {
  constructor(proxy, opts = {}) { super({ keepAlive: true, ...opts }); this.proxy = proxy; }
  createConnection(options, cb) {
    tunnel(this.proxy, options.host, options.port || 443).then((socket) => {
      const s = tls.connect({ socket, servername: options.servername || options.host, ALPNProtocols: ["http/1.1"], ...(options.ca ? { ca: options.ca } : {}) });
      s.once("secureConnect", () => cb(null, s));
      s.once("error", (e) => cb(e));
    }, (e) => cb(e));
  }
}

/**
 * WHATWG-fetch ueber den Proxy (nur https:).
 * @param {string} proxy  z. B. http://mdi-egress:3128
 */
export function proxyFetch(proxy, { ca } = {}) {
  if (!/^http:\/\/[^/]+$/.test(String(proxy || "").replace(/\/+$/, ""))) throw new Error("proxyFetch: HTTPS_PROXY fehlt oder ist keine http://host:port-Adresse");
  const agent = new ProxyAgent(proxy, ca ? { ca } : {});
  return async function fetchUeberProxy(input, init = {}) {
    const u = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (u.protocol !== "https:") throw new Error("proxyFetch: nur https");
    const headers = {};
    new Headers(init.headers || {}).forEach((v, k) => { headers[k] = v; });
    const body = init.body == null ? null : typeof init.body === "string" || init.body instanceof Uint8Array ? init.body : Buffer.from(await new Response(init.body).arrayBuffer());
    return new Promise((ok, no) => {
      const req = https.request(u, { method: init.method || "GET", headers, agent, signal: init.signal || undefined, ...(ca ? { ca } : {}) }, (res) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) for (const x of [].concat(v)) h.append(k, String(x));
        const leer = res.statusCode === 204 || res.statusCode === 304 || (init.method || "GET") === "HEAD";
        ok(new Response(leer ? null : Readable.toWeb(res), { status: res.statusCode, statusText: res.statusMessage, headers: h }));
      });
      req.once("error", no);
      req.end(body || undefined);
    });
  };
}
