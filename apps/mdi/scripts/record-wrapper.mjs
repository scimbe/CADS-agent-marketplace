// Nimmt Antworten des ECHTEN Servers (CADS-DEMO-wrapper, lib/) fuer die Konto-Schnittstellen auf und schreibt sie nach
// test/fixtures/wrapper-konto.json. Die Unit-Tests des API-Moduls und der Statechart spielen genau diese Antworten ab;
// der falsche Server der E2E-Tests (test/e2e/lib/fakewrapper.mjs) liefert dieselben Formen.
// Aufruf (nur lesend gegen einen Klon des Wrappers, kein Netz): node scripts/record-wrapper.mjs <pfad-zum-wrapper>
// Zusammensetzung und Reihenfolge der Routen wie in server.mjs des Wrappers; das Login-Gate ist ein Doppel, das genau
// die Antwort des echten Gates nachbildet (200 + X-Gate-Email bei gueltigem Cookie, sonst 401).
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const W = path.resolve(process.argv[2] || "");
if (!fs.existsSync(path.join(W, "lib/auth.mjs"))) { console.error("Aufruf: node scripts/record-wrapper.mjs <pfad-zum-CADS-DEMO-wrapper>"); process.exit(2); }
const lib = (f) => import(pathToFileURL(path.join(W, "lib", f)).href);
const { createAuth } = await lib("auth.mjs");
const { createDuell } = await lib("duell.mjs");
const { createDuellAi } = await lib("duell-ai.mjs");
const { createDuellProfile } = await lib("duell-profile.mjs");
const { createCredit } = await lib("duell-credit.mjs");
const { createMod } = await lib("duell-mod.mjs");
const { createDeck } = await lib("duell-deck.mjs");
const { createVouchers } = await lib("duell-voucher.mjs");
let commit = "unbekannt";
try { commit = execFileSync("git", ["-C", W, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch (e) { /* kein git */ }

const HOST = "demos-34a13a96.bunsenbrenner.org";
const CODE = "TEST-GUTSCHEIN-1"; // nur fuer die Aufnahme; echte Codes stehen nur als Hash in der Server-Umgebung
const H = (c) => createHash("sha256").update(c).digest("hex");
const T0 = Date.UTC(2026, 10, 11, 9);
const clock = { t: T0 }, now = () => clock.t, log = () => {};
const SESSIONS = { "sess-lea": "lea@example.org", "sess-tom": "tom@example.org" };
let gateDown = false;
// Doppel des Gates (GET /gate/check): liest nur das weitergereichte Cookie
const gateFetch = async (url, o) => {
  if (gateDown) return { status: 502, headers: new Map() };
  const m = /ct_gate_session=([^;]+)/.exec((o && o.headers && o.headers.cookie) || "");
  const email = m && SESSIONS[m[1]];
  return { status: email ? 200 : 401, headers: { get: (k) => (k === "x-gate-email" && email ? email : null) } };
};

function server(voucherEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-rec-"));
  const env = { DEMO_AUTH_MODE: "gate", DEMO_GATE_HOST: HOST, DEMO_GATE_CHECK_URL: "https://bunsenbrenner.org/gate/check" };
  const AUTH = createAuth({ env, fetchImpl: gateFetch, now, log, posTtlMs: 0, negTtlMs: 0 });
  const DUELL = createDuell({ env: { DUELL_SEAL_SECRET: "seal" }, salt: "s", log, llm: async () => "{}", now });
  const AI = createDuellAi({ env: { DUELL_AI_SALT: "x", DUELL_AI_PROOF_BITS: "0" }, llm: async () => "{}", shared: DUELL.shared, auth: AUTH, log, now });
  const CREDIT = createCredit({ env: {}, now, log, file: path.join(dir, "credit.json") });
  const MOD = createMod({ env: {}, now, log, file: path.join(dir, "mod.json"), salt: "m" });
  const DECK = createDeck({ env: { DUELL_DECK_EPHEMERAL: "1" }, shared: DUELL.shared, who: AI.who, credit: CREDIT, mod: MOD, blockLink: () => {}, now, log, file: path.join(dir, "deck.json") });
  const VOUCHERS = createVouchers({ env: voucherEnv, shared: DUELL.shared, who: AI.who, credit: CREDIT, now, log });
  Object.assign(DUELL.shared, { credit: CREDIT, mod: MOD, vouchers: VOUCHERS });
  const PROFILE = createDuellProfile({ env: { DUELL_PROFILE_DIR: path.join(dir, "profiles"), DUELL_PROFILE_SALT: "salt-salt-salt-salt" }, auth: AUTH, shared: DUELL.shared, now, log });
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://" + HOST);
    // Reihenfolge wie server.mjs route()
    for (const r of [AI, PROFILE, VOUCHERS, DECK]) if (await r.route(req, res, url)) return;
    if (await AUTH.guard(req, res, url)) return;
    res.writeHead(404, { "Content-Type": "text/plain" }).end("nf");
  });
  return { srv, AI, MOD, dir };
}

const out = [];
async function rec(base, name, method, p, body, sess) {
  const headers = { host: HOST };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (sess) headers.cookie = "ct_gate_session=" + sess;
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; }
  const e = { name, req: { method, path: p, ...(body !== undefined ? { body } : {}), session: sess ? "signed-in" : "anonymous" }, res: { status: r.status, ...(json !== null ? { body: json } : {}), ...(r.headers.get("location") ? { location: r.headers.get("location") } : {}) } };
  out.push(e);
  return e.res;
}
async function listen(s) { await new Promise((ok) => s.srv.listen(0, "127.0.0.1", ok)); return "http://127.0.0.1:" + s.srv.address().port; }

const A = server({ DUELL_VOUCHERS: H(CODE) + ":5:2:100:1" });
const base = await listen(A);
const DEV = "0123456789abcdef0123456789abcdef", CODEX = "fedcba9876543210fedcba9876543210";
try {
  await rec(base, "auth-me-anonym", "GET", "/auth/me?return=%2Fduell%3Fgo%3Dkonto&lang=de");
  await rec(base, "auth-me-angemeldet", "GET", "/auth/me?return=%2Fduell&lang=de", undefined, "sess-lea");
  await rec(base, "auth-login", "GET", "/auth/login?return=%2Fduell%3Fgo%3Dkonto&lang=de");
  await rec(base, "status-anonym", "POST", "/api/duell/ai/status", { device: DEV });
  await rec(base, "status-geraet-ungueltig", "POST", "/api/duell/ai/status", { device: "kurz" });
  await rec(base, "status-angemeldet-ohne-16", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  await rec(base, "profil-get-anonym-konto", "POST", "/api/duell/profile/get", { via: "account" });
  await rec(base, "profil-get-leer", "POST", "/api/duell/profile/get", { via: "account" }, "sess-lea");
  await rec(base, "profil-put-ohne-16", "POST", "/api/duell/profile/put", { via: "account", rev: 0, profile: { me: { nick: "Lea", emoji: "🦊", colors: ["#ffd400", "#ff3b1d"], set: "" }, wall: [], saved: [] }, fresh: true }, "sess-lea");
  await rec(base, "profil-put-mit-16", "POST", "/api/duell/profile/put", { via: "account", rev: 0, profile: { me: { nick: "Lea", emoji: "🦊", colors: ["#ffd400", "#ff3b1d"], set: "" }, wall: [], saved: [] }, fresh: true, age16: true }, "sess-lea");
  await rec(base, "status-angemeldet-16", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  await rec(base, "profil-get-da", "POST", "/api/duell/profile/get", { via: "account" }, "sess-lea");
  await rec(base, "profil-put-veraltet", "POST", "/api/duell/profile/put", { via: "account", rev: 0, profile: { me: { nick: "Alt" } } }, "sess-lea");
  await rec(base, "profil-put-18", "POST", "/api/duell/profile/put", { via: "account", rev: 1, profile: { me: { nick: "Lea M", emoji: "🦊", colors: ["#0b3d91", "#ffd400"], set: "" }, wall: [], saved: [] }, age18: true }, "sess-lea");
  await rec(base, "profil-get-18", "POST", "/api/duell/profile/get", { via: "account" }, "sess-lea");
  await rec(base, "status-angemeldet-18", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  await rec(base, "profil-put-code-ohne-konto", "POST", "/api/duell/profile/put", { via: "code", code: CODEX, rev: 0, profile: { me: { nick: "Kind" } }, fresh: true });
  await rec(base, "profil-put-code-neu", "POST", "/api/duell/profile/put", { via: "code", code: CODEX, rev: 0, profile: { me: { nick: "Kind", emoji: "🐢", colors: null, set: "" }, wall: [], saved: [] }, fresh: true }, "sess-lea");
  await rec(base, "profil-get-code", "POST", "/api/duell/profile/get", { via: "code", code: CODEX });
  await rec(base, "profil-get-code-unbekannt", "POST", "/api/duell/profile/get", { via: "code", code: "00000000000000000000000000000000" });
  await rec(base, "profil-get-code-ungueltig", "POST", "/api/duell/profile/get", { via: "code", code: "xyz" });
  await rec(base, "gutschein-anonym", "POST", "/api/duell/credit/redeem", { code: CODE });
  await rec(base, "gutschein-unbekannt", "POST", "/api/duell/credit/redeem", { code: "FALSCH-1234" }, "sess-lea");
  await rec(base, "gutschein-ok", "POST", "/api/duell/credit/redeem", { code: CODE.toLowerCase() }, "sess-lea");
  await rec(base, "status-guthaben", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  for (let i = 0; i < 5; i++) await rec(base, "gutschein-falsch-" + i, "POST", "/api/duell/credit/redeem", { code: "FALSCH-X" + i }, "sess-tom");
  await rec(base, "gutschein-limit", "POST", "/api/duell/credit/redeem", { code: "FALSCH-X9" }, "sess-tom");
  await rec(base, "mod-me-anonym", "POST", "/api/duell/mod/me", {});
  await rec(base, "mod-me-leer", "POST", "/api/duell/mod/me", {}, "sess-tom");
  const lea = await A.AI.who({ headers: { cookie: "ct_gate_session=sess-lea", host: HOST } }, {});
  A.MOD.cardHidden(lea.acct, "c-abc123", { down: 8, share: 72 });
  clock.t += 60000;
  A.MOD.strike(lea.acct, "confirmed", ["c-abc123"], { ground: "harm" });
  const me = await rec(base, "mod-me-hinweise", "POST", "/api/duell/mod/me", {}, "sess-lea");
  const nid = me.body.notices[0].nid;
  await rec(base, "mod-widerspruch-leer", "POST", "/api/duell/mod/appeal", { nid, text: "  " }, "sess-lea");
  await rec(base, "mod-widerspruch-ok", "POST", "/api/duell/mod/appeal", { nid, text: "Die Karte war ein Witz unter Freunden." }, "sess-lea");
  await rec(base, "mod-widerspruch-doppelt", "POST", "/api/duell/mod/appeal", { nid, text: "Nochmal" }, "sess-lea");
  await rec(base, "mod-me-nach-widerspruch", "POST", "/api/duell/mod/me", {}, "sess-lea");
  await rec(base, "profil-delete", "POST", "/api/duell/profile/delete", { via: "account" }, "sess-lea");
  await rec(base, "profil-get-geloescht", "POST", "/api/duell/profile/get", { via: "account" }, "sess-lea");
  await rec(base, "profil-put-geloescht", "POST", "/api/duell/profile/put", { via: "account", rev: 3, profile: { me: { nick: "X" } } }, "sess-lea");
  gateDown = true;
  await rec(base, "status-gate-weg", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  await rec(base, "auth-me-gate-weg", "GET", "/auth/me?return=%2Fduell&lang=de", undefined, "sess-lea");
  gateDown = false;
} finally { A.srv.close(); fs.rmSync(A.dir, { recursive: true, force: true }); }

const B = server({});
const base2 = await listen(B);
try { await rec(base2, "gutschein-aus", "POST", "/api/duell/credit/redeem", { code: CODE }, "sess-lea"); }
finally { B.srv.close(); fs.rmSync(B.dir, { recursive: true, force: true }); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "test/fixtures/wrapper-konto.json");
const doc = { herkunft: "Aufgenommen mit scripts/record-wrapper.mjs gegen CADS-DEMO-wrapper @ " + commit + " (lib/auth.mjs, duell-ai.mjs, duell-profile.mjs, duell-voucher.mjs, duell-deck.mjs, duell-mod.mjs; Routenreihenfolge wie server.mjs). Gate als Doppel, Uhr fest auf " + new Date(T0).toISOString() + ".", host: HOST, device: DEV, code: CODEX, exchanges: out };
fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
console.log("record-wrapper: " + out.length + " Antworten -> " + path.relative(ROOT, file));
