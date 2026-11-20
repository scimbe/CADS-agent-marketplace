// Gate double for staging (stands in for bunsenbrenner.org/gate/check, which lib/auth.mjs asks in DEMO_AUTH_MODE=gate).
// Reachable only inside the docker network mdi-staging-net. A test session is the cookie ct_gate_session=staging-<name>;
// it maps to <name>@staging.invalid. Anything else is "not logged in" (401). No real account exists or is created.
import { createServer } from "node:http";

const NAME = /^staging-([a-z0-9]{1,20})$/;
createServer((req, res) => {
  const u = new URL(req.url, "http://gate");
  if (u.pathname === "/gate/check") {
    const m = /(?:^|;\s*)ct_gate_session=([^;]+)/.exec(req.headers.cookie || "");
    const n = m && NAME.exec(m[1]);
    console.log(JSON.stringify({ at: new Date().toISOString(), check: n ? n[1] : null, host: req.headers["x-forwarded-host"] || "" }));
    if (n) { res.writeHead(200, { "X-Gate-Email": n[1] + "@staging.invalid" }).end(); return; }
    res.writeHead(401).end(); return;
  }
  if (u.pathname === "/gate/start" || u.pathname === "/gate/logout") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Staging-Gate-Attrappe: kein echter Login. Testsitzung = Cookie ct_gate_session=staging-<name> auf dem Staging-Host.\n");
    return;
  }
  res.writeHead(404).end();
}).listen(8080, () => console.log("gate double on :8080"));
