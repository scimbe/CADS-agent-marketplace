// Freie Karte 2, P3: Egress-Proxy (bau/egress-proxy.mjs) und fetch ueber den Proxy (bau/proxy-fetch.mjs). Der Proxy laesst nur
// CONNECT zu Zielen der Allowlist durch; der Modell-Client kommt ohne Proxy nicht hinaus. Alles lokal, kein Netz.
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createEgressProxy, ALLOW_STANDARD } from "../bau/egress-proxy.mjs";
import { proxyFetch, tunnel } from "../bau/proxy-fetch.mjs";
import { createLlm, createLedger } from "../bau/llm.mjs";

const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));
const roh = (port, text) => new Promise((ok) => { const c = net.connect(port, "127.0.0.1", () => c.write(text)); let b = ""; c.on("data", (d) => { b += d; }); c.on("close", () => ok(b)); c.on("error", () => ok(b)); setTimeout(() => c.destroy(), 500); });

test("Egress-Proxy: nur CONNECT zu Zielen der Allowlist; andere Ziele, Ports, Methoden und Upgrades abgelehnt", async () => {
  assert.deepEqual([...ALLOW_STANDARD], ["api.anthropic.com:443"]);
  const echo = net.createServer((s) => s.pipe(s)), ePort = await listen(echo);
  const logs = [], proxy = createEgressProxy({ allow: ["127.0.0.1:" + ePort], log: (o) => logs.push(o) }), pPort = await listen(proxy);
  try {
    const s = await tunnel("http://127.0.0.1:" + pPort, "127.0.0.1", ePort);
    const back = await new Promise((ok) => { s.once("data", (d) => ok(String(d))); s.write("hallo"); });
    assert.equal(back, "hallo", "erlaubtes Ziel: Tunnel steht"); s.destroy();
    await assert.rejects(tunnel("http://127.0.0.1:" + pPort, "127.0.0.1", ePort + 1), /lehnt ab: 403/, "anderer Port");
    await assert.rejects(tunnel("http://127.0.0.1:" + pPort, "example.org", 443), /lehnt ab: 403/, "anderes Ziel");
    await assert.rejects(tunnel("http://127.0.0.1:" + pPort, "api.anthropic.com", 443), /lehnt ab: 403/, "nicht in dieser Allowlist");
    assert.match(await roh(pPort, "GET http://127.0.0.1:" + ePort + "/ HTTP/1.1\r\nHost: x\r\n\r\n"), /^HTTP\/1\.1 405/, "kein normales HTTP");
    assert.match(await roh(pPort, "GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"), /^HTTP\/1\.1 405/, "kein Upgrade");
    assert.match(await roh(pPort, "CONNECT 127.0.0.1:" + ePort + "@evil:1 HTTP/1.1\r\nHost: x\r\n\r\n"), /^HTTP\/1\.1 403/, "kein Trick im Ziel");
    assert.ok(logs.some((l) => l.ok === true) && logs.filter((l) => l.ok === false).length >= 5);
    assert.ok(!JSON.stringify(logs).includes("hallo"), "kein Inhalt im Log");
  } finally { proxy.close(); echo.close(); }
  assert.throws(() => createEgressProxy({ allow: [] }), /host:port/);
  assert.throws(() => createEgressProxy({ allow: ["*"] }), /host:port/);
});

test("fetch ueber den Proxy: TLS Ende-zu-Ende, Antwort gestreamt, Body und Kopfzeilen; nur https", async (t) => {
  let tmp;
  try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "egress-tls-")); execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(tmp, "k.pem"), "-out", path.join(tmp, "c.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" }); }
  catch (e) { t.skip("openssl fehlt"); return; }
  const key = fs.readFileSync(path.join(tmp, "k.pem")), cert = fs.readFileSync(path.join(tmp, "c.pem"));
  const ziel = https.createServer({ key, cert }, (req, res) => { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => { res.writeHead(200, { "content-type": "application/json", "x-test": "1" }); res.end(JSON.stringify({ m: req.method, b, h: req.headers["x-api-key"] })); }); });
  const zPort = await listen(ziel);
  const proxy = createEgressProxy({ allow: ["localhost:" + zPort] }), pPort = await listen(proxy);
  try {
    const f = proxyFetch("http://127.0.0.1:" + pPort, { ca: cert });
    const r = await f("https://localhost:" + zPort + "/v1/messages", { method: "POST", headers: { "x-api-key": "k" }, body: JSON.stringify({ a: 1 }) });
    assert.equal(r.status, 200); assert.equal(r.headers.get("x-test"), "1");
    assert.deepEqual(await r.json(), { m: "POST", b: "{\"a\":1}", h: "k" });
    await assert.rejects(f("http://localhost:" + zPort + "/"), /nur https/);
    await assert.rejects(proxyFetch("http://127.0.0.1:" + pPort)("https://localhost:" + zPort + "/"), /self.signed|certificate/i, "Zertifikat wird geprueft");
  } finally { proxy.close(); ziel.close(); }
  assert.throws(() => proxyFetch(""), /HTTPS_PROXY/);
});

test("Modell-Client: ohne Proxy kein Aufruf; mit Proxy geht die Verbindung zu api.anthropic.com durch den Proxy", async (t) => {
  assert.throws(() => createLlm({ keyFile: "/x", ledger: createLedger({ cap: 1 }) }), /ohne Egress-Proxy/);
  let sdk = null;
  try { sdk = await import("@anthropic-ai/sdk"); } catch (e) { sdk = null; }
  if (!sdk) { t.skip("@anthropic-ai/sdk fehlt im node_modules dieser Umgebung"); return; }
  const gesehen = [];
  const proxy = http.createServer((q, r) => r.writeHead(405).end());
  proxy.on("connect", (req, socket) => { gesehen.push(req.url); socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); });
  const pPort = await listen(proxy);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "egress-key-")), keyFile = path.join(dir, "k");
  fs.writeFileSync(keyFile, "sk-test-nicht-echt");
  try {
    const llm = createLlm({ keyFile, proxy: "http://127.0.0.1:" + pPort, ledger: createLedger({ cap: 1 }) });
    await assert.rejects(llm.call({ role: "planer", model: "claude-haiku-5-5", req: { max_tokens: 10, system: "x", messages: [{ role: "user", content: "y" }] } }));
    assert.ok(gesehen.includes("api.anthropic.com:443"), JSON.stringify(gesehen));
  } finally { proxy.close(); }
});
