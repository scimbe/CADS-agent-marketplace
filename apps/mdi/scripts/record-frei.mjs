// Strang K: nimmt Antworten des ECHTEN Servers (CADS-DEMO-wrapper, lib/) fuer die freie Karte, die KI-Arten, das Deck, die
// Meldung und das KI-Bild auf und schreibt sie nach test/fixtures/wrapper-frei.json. Gleiches Vorgehen wie
// scripts/record-wrapper.mjs (Strang F): echte Module, Routenreihenfolge wie server.mjs, Gate als Doppel, Uhr fest.
// Das Modell ist ein Doppel mit festen Antworten (keine Secrets, kein Netz); alles danach – Harness S1-S5, Pot, Schlange,
// Siegel, Deck-Signatur, Moderation, Bild-Pruefung (stub) – ist der echte Servercode.
// Aufruf: node scripts/record-frei.mjs <pfad-zum-CADS-DEMO-wrapper>
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const W = path.resolve(process.argv[2] || "");
if (!fs.existsSync(path.join(W, "lib/duell-karte.mjs"))) { console.error("Aufruf: node scripts/record-frei.mjs <pfad-zum-CADS-DEMO-wrapper>"); process.exit(2); }
const lib = (f) => import(pathToFileURL(path.join(W, "lib", f)).href);
const { createAuth } = await lib("auth.mjs");
const { createDuell } = await lib("duell.mjs");
const { createDuellAi } = await lib("duell-ai.mjs");
const { createDuellProfile } = await lib("duell-profile.mjs");
const { createCredit } = await lib("duell-credit.mjs");
const { createMod } = await lib("duell-mod.mjs");
const { createDeck } = await lib("duell-deck.mjs");
const { createVouchers } = await lib("duell-voucher.mjs");
const { createReports } = await lib("duell-report.mjs");
const { createBild } = await lib("duell-bild.mjs");
let commit = "unbekannt";
try { commit = execFileSync("git", ["-C", W, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch (e) { /* kein git */ }

const HOST = "demos-34a13a96.bunsenbrenner.org";
const T0 = Date.UTC(2026, 10, 11, 9);
const clock = { t: T0 }, now = () => clock.t, log = () => {};
const SESSIONS = { "sess-lea": "lea@example.org", "sess-tom": "tom@example.org", "sess-max": "max@example.org", "sess-kim": "kim@example.org" };
const ADMIN = "admin-token-nur-fuer-die-aufnahme";
const gateFetch = async (url, o) => {
  const m = /ct_gate_session=([^;]+)/.exec((o && o.headers && o.headers.cookie) || "");
  const email = m && SESSIONS[m[1]];
  return { status: email ? 200 : 401, headers: { get: (k) => (k === "x-gate-email" && email ? email : null) } };
};

// Modell-Doppel: S2/S4 (Moderation) sagt harmlos, S3 (Karte) liefert die Beispielkarte der Art; langsam, wenn gewuenscht
const MODEL = { delay: 0 };
const CARDS = {
  card: { ok: true, title: "Sonnenblumen-Tag", x: "Alles Gute! Du bringst Sonne in jeden Tag.", st: "herz", palette: 0, stickers: ["🌻", "🎂", "✨"] },
  meme: { ok: true, title: "Kein Leckerli", top: "Wenn du sagst", bottom: "Heute kein Leckerli", st: "meme" },
  game: { ok: true, title: "Tiefsee-Sturm", emoji: "🐠", theme: "ocean", motif: "bubbles", level: "normal", route: [{ physik: "ruhig", thema: "ocean", emoji: "🐟" }, { physik: "sturm", thema: "night", emoji: "⚡" }, { physik: "schnell", thema: "ocean", emoji: "🐳" }] },
  lauf: { ok: true, title: "Brückenlauf", mode: "endlos", world: "bruecke", level: "normal", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["luecken", "hindernisse", "muenzen"], foes: ["geh"] },
  quiz: { ok: true, title: "Unser Sonnensystem", questions: [{ q: "Welcher Planet ist der Sonne am nächsten?", a: "Merkur", wrong: ["Venus", "Mars", "Erde"] }, { q: "Welcher Planet ist der größte?", a: "Jupiter", wrong: ["Saturn", "Neptun", "Erde"] }, { q: "Wie heißt der rote Planet?", a: "Mars", wrong: ["Venus", "Uranus", "Merkur"] }, { q: "Was umkreist die Erde?", a: "Der Mond", wrong: ["Die Sonne", "Der Mars", "Ein Komet"] }] },
  faehigkeit: { ok: true, cap: "zug-termin", title: "Grillabend", sub: "Termine antippen, alle stimmen ab.", word: "" }
};
const cardLlm = {
  async generate(req) {
    if (MODEL.delay) await new Promise((ok) => setTimeout(ok, MODEL.delay));
    if (req.name === "check" || /^check/.test(req.name || "")) return { json: { risk: 0, cats: [], drink: "none", ...(req.schema && req.schema.properties && req.schema.properties.spiel ? { spiel: "szene" } : {}) }, usage: { out: 10 }, stop: "end_turn" };
    const art = String(req.name || "").replace(/^card_/, "");
    return { json: CARDS[art] || CARDS.card, usage: { out: 80 }, stop: "end_turn" };
  }
};
// Modell-Doppel fuer die uebrigen KI-Arten (line): drei Zeilen
const llm = async () => ({ text: JSON.stringify({ options: ["Du rockst den Tag!", "Heute zählt nur Mut.", "Kleiner Schritt, große Wirkung."] }), tokens: 30 });

function server(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-recfrei-"));
  const env = { DEMO_AUTH_MODE: "gate", DEMO_GATE_HOST: HOST, DEMO_GATE_CHECK_URL: "https://bunsenbrenner.org/gate/check" };
  const AUTH = createAuth({ env, fetchImpl: gateFetch, now, log, posTtlMs: 0, negTtlMs: 0 });
  const DUELL = createDuell({ env: { DUELL_SEAL_SECRET: "seal", DUELL_QUEUE_HOLD_MS: extraEnv.HOLD || "8000", DUELL_LLM_PARALLEL: "1" }, salt: "s", log, llm: async () => "{}", now });
  const AI = createDuellAi({ env: { DUELL_AI_SALT: "x", DUELL_AI_PROOF_BITS: "0", DUELL_CREATE_FREE: extraEnv.FREE || "5", ...(extraEnv.OFF ? { DUELL_KARTE_OFF: "1" } : {}) }, llm, cardLlm, shared: DUELL.shared, auth: AUTH, log, now });
  const CREDIT = createCredit({ env: {}, now, log, file: path.join(dir, "credit.json") });
  const MOD = createMod({ env: {}, now, log, file: path.join(dir, "mod.json"), salt: "m" });
  const DECK = createDeck({ env: { DUELL_DECK_EPHEMERAL: "1", DUELL_DECK_K: "2", DUELL_DECK_CARD_MIN_DAYS: "0", DUELL_DECK_ACCOUNT_MIN_DAYS: "0", DUELL_DECK_ACCOUNT_ACTIVE_DAYS: "1", DUELL_DECK_REVIEW_REQUIRED: "0", DUELL_ADMIN_TOKEN: ADMIN }, shared: DUELL.shared, who: AI.who, credit: CREDIT, mod: MOD, blockLink: () => ({ status: 200 }), now, log, file: path.join(dir, "deck.json") });
  const VOUCHERS = createVouchers({ env: {}, shared: DUELL.shared, who: AI.who, credit: CREDIT, now, log });
  Object.assign(DUELL.shared, { credit: CREDIT, mod: MOD, vouchers: VOUCHERS });
  const BILD = createBild({ env: { DUELL_BILD_BACKEND: "stub", DUELL_BILD_CHECK: "stub", DUELL_BILD_DIR: path.join(dir, "bild"), DUELL_BILD_STUB_MS: "10" }, shared: DUELL.shared, who: AI.who, llm: cardLlm, now, log });
  const REPORTS = createReports({ env: { DUELL_REPORT_DIR: path.join(dir, "rep") }, shared: DUELL.shared, onCard: DECK, onBild: BILD, now, log });
  const PROFILE = createDuellProfile({ env: { DUELL_PROFILE_DIR: path.join(dir, "profiles"), DUELL_PROFILE_SALT: "salt-salt-salt-salt" }, auth: AUTH, shared: DUELL.shared, now, log });
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://" + HOST);
    for (const r of [AI, PROFILE, REPORTS, BILD, VOUCHERS, DECK, DUELL]) if (await r.route(req, res, url)) return;
    if (await AUTH.guard(req, res, url)) return;
    res.writeHead(404, { "Content-Type": "text/plain" }).end("nf");
  });
  return { srv, AI, DECK, BILD, dir, stop: () => { try { BILD.stop(); } catch (e) { /* aus */ } } };
}

const out = [];
async function rec(base, name, method, p, body, sess, extra = {}) {
  const headers = { host: HOST, ...extra };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (sess) headers.cookie = "ct_gate_session=" + sess;
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const ct = r.headers.get("content-type") || "";
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null; if (/json/.test(ct)) { try { json = JSON.parse(buf.toString("utf8")); } catch (e) { json = null; } }
  const e = { name, req: { method, path: p, ...(body !== undefined ? { body } : {}), session: sess ? "signed-in:" + sess.slice(5) : "anonymous" }, res: { status: r.status, ...(json !== null ? { body: json } : {}), ...(!json && buf.length ? { contentType: ct, bytes: buf.length, ...(ct.startsWith("image/") ? { base64: buf.toString("base64") } : {}) } : {}) } };
  if (!/^(admin|setup)/.test(name)) out.push(e);
  return e.res;
}
async function listen(s) { await new Promise((ok) => s.srv.listen(0, "127.0.0.1", ok)); return "http://127.0.0.1:" + s.srv.address().port; }
const DEV = "0123456789abcdef0123456789abcdef";
const ask = (art, text, extra = {}) => ({ kind: "karte", input: { art, text, ...extra }, device: DEV, proof: "0", lang: "de", queue: "ticket" });
const put16 = (b, sess) => rec(b, "setup-profil-" + sess, "POST", "/api/duell/profile/put", { via: "account", rev: 0, profile: { me: { nick: "X" }, wall: [], saved: [] }, fresh: true, age16: true }, sess);

const A = server();
const base = await listen(A);
try {
  await rec(base, "karte-anonym", "POST", "/api/duell/ai", ask("card", "Geburtstagskarte für meine Freundin"));
  await rec(base, "karte-ohne-16", "POST", "/api/duell/ai", ask("card", "Geburtstagskarte für meine Freundin"), "sess-lea");
  for (const s of ["sess-lea", "sess-tom", "sess-max", "sess-kim"]) await put16(base, s);
  await rec(base, "status-angemeldet-16", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  await rec(base, "karte-krise", "POST", "/api/duell/ai", ask("card", "ich will nicht mehr leben"), "sess-lea");
  await rec(base, "karte-ohne-kategorie", "POST", "/api/duell/ai", ask("", "Geburtstagskarte für meine Freundin"), "sess-lea");
  await rec(base, "karte-absage-tetris", "POST", "/api/duell/ai", ask("game", "Tetris mit bunten Steinen", { genre: "G1" }), "sess-lea");
  await rec(base, "karte-absage-sound", "POST", "/api/duell/ai", ask("sound", "Beat für mein Team"), "sess-lea");
  await rec(base, "karte-genre-frage", "POST", "/api/duell/ai", ask("game", "Endless Runner über Brücken", { genre: "G1" }), "sess-lea");
  await rec(base, "karte-noch-nicht-spiel", "POST", "/api/duell/ai", ask("game", "Ein Zahlen-Schiebepuzzle wie 2048"), "sess-lea");
  const ok = await rec(base, "karte-ok-card", "POST", "/api/duell/ai", ask("card", "Geburtstagskarte für meine Freundin, sie liebt Sonnenblumen"), "sess-lea");
  await rec(base, "karte-accept", "POST", "/api/duell/ai/accept", { device: DEV, receipt: ok.body.receipt }, "sess-lea");
  await rec(base, "status-nach-accept", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  const meme = await rec(base, "karte-ok-meme", "POST", "/api/duell/ai", ask("meme", "Mein Hund schaut beleidigt, weil es kein Leckerli gab"), "sess-lea");
  await rec(base, "karte-discard", "POST", "/api/duell/ai/discard", { device: DEV, receipt: meme.body.receipt }, "sess-lea");
  await rec(base, "karte-ok-game", "POST", "/api/duell/ai", ask("game", "Unter Wasser mit Fischen, dann ein Sturm", { genre: "G1" }), "sess-tom");
  await rec(base, "karte-ok-lauf", "POST", "/api/duell/ai", ask("game", "Endless Runner über Brücken", { genre: "G2" }), "sess-tom");
  await rec(base, "karte-ok-quiz", "POST", "/api/duell/ai", ask("quiz", "Quiz über das Sonnensystem"), "sess-tom");
  await rec(base, "karte-ok-faehigkeit", "POST", "/api/duell/ai", ask("faehigkeit", "Wann können alle zum Grillen?"), "sess-tom");
  // Robot: eine Katalogkarte mit eigenem Satz verfeinert (from), und die eigene Karte (base)
  await rec(base, "karte-robot-katalog", "POST", "/api/duell/ai", { ...ask("", "Im Weltraum, mit Raketen"), input: { text: "Im Weltraum, mit Raketen", from: "zug-termin" } }, "sess-max");
  await rec(base, "karte-robot-gleich", "POST", "/api/duell/ai", { ...ask("", "Nochmal genau so"), input: { text: "Nochmal genau so", base: { ...ok.body.options[0].doc, ki: ok.body.options[0].ki } } }, "sess-max");
  // Deck: die angenommene Karte von lea wird von tom und max genutzt (>= 20 s), dann aufgenommen
  const ki = ok.body.options[0].ki, cid = ki.h.slice(0, 22);
  await rec(base, "deck-status-privat", "GET", "/api/duell/deck/status?c=" + cid);
  await rec(base, "deck-status-unbekannt", "GET", "/api/duell/deck/status?c=AAAAAAAAAAAAAAAAAAAAAA");
  await rec(base, "deck-use-anonym", "POST", "/api/duell/deck/use", { ki, ev: "start" });
  for (const s of ["sess-tom", "sess-max"]) {
    const st = await rec(base, "deck-use-start", "POST", "/api/duell/deck/use", { ki, ev: "start" }, s);
    clock.t += 21000;
    await rec(base, "deck-use-done", "POST", "/api/duell/deck/use", { ki, ev: "done", t: st.body.t }, s);
    await rec(base, "deck-vote", "POST", "/api/duell/deck/vote", { ki, v: 1, t: st.body.t }, s);
  }
  await rec(base, "admin-admit", "POST", "/api/duell/deck/review/" + cid, { action: "admit" }, null, { authorization: "Bearer " + ADMIN });
  await rec(base, "deck-key", "GET", "/api/duell/deck/key");
  await rec(base, "deck-mit-karte", "GET", "/api/duell/deck");
  await rec(base, "deck-status-ok", "GET", "/api/duell/deck/status?c=" + cid);
  await rec(base, "deck-me", "POST", "/api/duell/deck/me", {}, "sess-lea");
  await rec(base, "deck-me-anonym", "POST", "/api/duell/deck/me", {});
  // Meldung mit Einwilligung (Siegel + Hash)
  await rec(base, "report-ok", "POST", "/api/duell/report", { reason: "wrong", consent: true, kind: "karte", seal: ki.s, optionHash: ki.h, content: { type: "card", t: "Sonnenblumen-Tag" } });
  // Sperre: der Pruefer entfernt die Karte (block) -> Status blocked
  await rec(base, "admin-block", "POST", "/api/duell/deck/review/" + cid, { action: "block", ground: "other" }, null, { authorization: "Bearer " + ADMIN });
  await rec(base, "deck-status-gesperrt", "GET", "/api/duell/deck/status?c=" + cid);
  // KI-Art line (Vorschlaege fuer ein x-model-Feld)
  await rec(base, "ki-line", "POST", "/api/duell/ai", { kind: "line", input: { text: "Du schaffst das", style: "druck" }, device: DEV, proof: "0", lang: "de", queue: "ticket" }, "sess-kim");
  // KI-Bild
  await rec(base, "bild-status-anonym", "POST", "/api/duell/bild/status", {});
  await rec(base, "bild-status", "POST", "/api/duell/bild/status", {}, "sess-kim");
  await rec(base, "bild-krise", "POST", "/api/duell/bild", { use: "card", text: "ich will nicht mehr leben", style: "comic", lang: "de" }, "sess-kim");
  await rec(base, "bild-avatar-ohne-guthaben", "POST", "/api/duell/bild", { use: "avatar", text: "Ein Fuchs mit Brille", style: "comic", lang: "de" }, "sess-kim");
  const job = await rec(base, "bild-auftrag", "POST", "/api/duell/bild", { use: "card", text: "Ein Fuchs, der Pizza liefert", style: "comic", lang: "de" }, "sess-kim");
  let j = null;
  for (let i = 0; i < 50; i++) { await new Promise((ok2) => setTimeout(ok2, 50)); j = await rec(base, "setup-bild-job", "POST", "/api/duell/bild/job", { job: job.body.job }, "sess-kim"); if (j.body && (j.body.state === "done" || j.body.state === "failed")) break; }
  out.push({ name: "bild-job-fertig", req: { method: "POST", path: "/api/duell/bild/job", body: { job: job.body.job }, session: "signed-in:kim" }, res: j });
  if (j.body && j.body.url) await rec(base, "bild-datei", "GET", j.body.url);
  if (j.body && j.body.id) await rec(base, "bild-keep", "POST", "/api/duell/bild/keep", { id: j.body.id }, "sess-kim");
} finally { A.stop(); A.srv.close(); fs.rmSync(A.dir, { recursive: true, force: true }); }

// Kein Kontingent: 1 freie Karte, verbraucht, kein Guthaben -> 429 quota
const B = server({ FREE: "1" });
const b2 = await listen(B);
try {
  await put16(b2, "sess-tom");
  const o1 = await rec(b2, "setup-erste", "POST", "/api/duell/ai", ask("card", "Danke an mein Team für das tolle Jahr"), "sess-tom");
  await rec(b2, "setup-accept", "POST", "/api/duell/ai/accept", { device: DEV, receipt: o1.body.receipt }, "sess-tom");
  await rec(b2, "status-leer", "POST", "/api/duell/ai/status", { device: DEV }, "sess-tom");
  await rec(b2, "karte-kein-kontingent", "POST", "/api/duell/ai", ask("card", "Viel Glück bei der Prüfung morgen"), "sess-tom");
} finally { B.stop(); B.srv.close(); fs.rmSync(B.dir, { recursive: true, force: true }); }

// Warteschlange: das Modell braucht laenger als die Haltezeit -> 202 Ticket, dann /queue
const C = server({ HOLD: "50" });
const b3 = await listen(C);
try {
  await put16(b3, "sess-max");
  MODEL.delay = 400;
  const q = await rec(b3, "karte-warteschlange", "POST", "/api/duell/ai", ask("card", "Ein Frosch, der Astronaut werden will"), "sess-max");
  let r = q;
  for (let i = 0; i < 40 && r.status === 202; i++) r = await rec(b3, i === 0 ? "karte-queue-202" : "setup-queue", "POST", "/api/duell/queue", { ticket: q.body.ticket });
  out.push({ name: "karte-queue-fertig", req: { method: "POST", path: "/api/duell/queue", body: { ticket: q.body.ticket }, session: "anonymous" }, res: r });
  await rec(b3, "karte-queue-verfallen", "POST", "/api/duell/queue", { ticket: "abcd1234unbekannt" });
  MODEL.delay = 0;
} finally { C.stop(); C.srv.close(); fs.rmSync(C.dir, { recursive: true, force: true }); }

// Notschalter: freie Karte aus
const D = server({ OFF: "1" });
const b4 = await listen(D);
try {
  await put16(b4, "sess-lea");
  await rec(b4, "status-karte-aus", "POST", "/api/duell/ai/status", { device: DEV }, "sess-lea");
  await rec(b4, "karte-aus", "POST", "/api/duell/ai", ask("card", "Danke an mein Team"), "sess-lea");
} finally { D.stop(); D.srv.close(); fs.rmSync(D.dir, { recursive: true, force: true }); }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "test/fixtures/wrapper-frei.json");
const doc = { herkunft: "Aufgenommen mit scripts/record-frei.mjs gegen CADS-DEMO-wrapper @ " + commit + " (lib/duell-ai.mjs, duell-karte.mjs, duell-frei.mjs, duell-absage.mjs, duell-deck.mjs, duell-mod.mjs, duell-credit.mjs, duell-report.mjs, duell-bild.mjs, duell.mjs Schlange; Routenreihenfolge wie server.mjs). Gate und Modell als Doppel (feste Antworten), Bild-Backend stub, Uhr fest ab " + new Date(T0).toISOString() + ".", host: HOST, device: DEV, exchanges: out };
fs.writeFileSync(file, JSON.stringify(doc, null, 1) + "\n");
console.log("record-frei: " + out.length + " Antworten -> " + path.relative(ROOT, file));
for (const e of out) console.log(String(e.res.status).padEnd(4) + e.name + (e.res.body && e.res.body.error ? " (" + e.res.body.error + ")" : ""));
