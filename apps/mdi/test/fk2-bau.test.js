// Freie Karte 2, P3: Bau-Worker ohne Browser und ohne Netz – Abnahme je Punkt, Kundensprache, Konfiguration, Kosten,
// Warteschlange, statischer Spiel-Dienst (Kopfzeilen), Policy-Liste und Statik ohne Fehlalarm.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { bewerte, istKundensatz, szenarioAusPlan, szenarioSatz } from "../bau/abnahme.mjs";
import { konfig, KOSTEN, ROLLEN_STANDARD } from "../bau/konfig.mjs";
import { createLedger, createLlm, createTagesbuch, BudgetAbbruch } from "../bau/llm.mjs";
import { createWorker, createQueueClient, meldung } from "../bau/worker.mjs";
import { createBauPipeline, BAU_GRUENDE, GRENZEN } from "../bau/pipeline.mjs";
import { createSpielDienst, kopfzeilen } from "../bau/spiel-dienst.mjs";
import { buildSpiel, frameCsp } from "../scripts/spiel/build.mjs";
import { checkPolicy, checkTexte } from "../bau/policy.mjs";
import { checkSpielSource } from "../scripts/harness.js";
import { praefix, VORLAGEN } from "../bau/doku.mjs";
import { modellDouble } from "../bau/doppel.mjs";
import { createPruefDienst, createPruefClient } from "../bau/pruef-dienst.mjs";
import { BROWSER_ARGS } from "../scripts/spiel/runner.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "fk2-bau-"));
const AUFTRAG = { id: "A".repeat(22), lang: "de", satz: "Boote abwehren", titel: "Segelabwehr", verstehe: "", nicht: [], fragen: [],
  punkte: [{ id: "p1", text: "Du steuerst ein Boot", pruefung: "Links bewegt das Boot" }, { id: "p2", text: "Fotos von Oma", pruefung: "Fotos sind zu sehen" }, { id: "p3", text: "Es macht Pling", pruefung: "Ton beim Treffer" }] };

test("Abnahme je Punkt: gespielt schlaegt gelesen, nicht machbar fehlt, bestandenes Szenario widerlegt nur ein gueltiger Satz, Saetze ohne Technik", () => {
  const sz = szenarioAusPlan("p1", { pruefbar: true, schritte: [{ halte: ["left"], frames: 60 }], art: "figur_bewegt", emoji: "⛵", richtung: "links", text: "" }).szenario;
  assert.deepEqual(sz, { id: "p1", schritte: [{ halte: ["left"], frames: 60 }], erwartung: { art: "figur_bewegt", emoji: "⛵", richtung: "links" } });
  assert.match(szenarioAusPlan("p1", { pruefbar: true, schritte: [], art: "figur_bewegt", emoji: "⛵", richtung: "links", text: "" }).ungueltig, /schritte/);
  assert.equal(szenarioAusPlan("p1", { pruefbar: false, schritte: [], art: "keins", emoji: "", richtung: "", text: "" }).szenario, null);
  const plan = { punkte: [{ id: "p1", machbar: true, kunde: "", szenario: sz }, { id: "p2", machbar: false, kunde: "Eigene Fotos gehen in diesem Spiel nicht.", szenario: null }, { id: "p3", machbar: true, kunde: "", szenario: null }] };
  // Szenario besteht nicht: fester Satz, egal was das Modell sagt
  let b = bewerte(AUFTRAG, plan, [{ id: "p1", ok: false, grund: "nicht_erreicht" }], { punkte: [{ id: "p1", urteil: "erfuellt", kunde: "" }, { id: "p3", urteil: "erfuellt", kunde: "" }] });
  assert.deepEqual(b.punkte.map((p) => [p.id, p.erfuellt, p.geprueft]), [["p1", false, "gespielt"], ["p2", false, "gelesen"], ["p3", true, "gelesen"]]);
  assert.equal(b.punkte[0].notiz, "Beim Ausprobieren hat sich ⛵ nicht nach links bewegt.");
  assert.equal(b.punkte[1].notiz, "Eigene Fotos gehen in diesem Spiel nicht.");
  assert.equal(b.fehlt, 2);
  // Szenario besteht, Modell sagt fehlt mit Code-Zeile: das Gespielte gilt (ueberstimmt, gezaehlt); gelesen ohne Satz bleibt
  // offen, mit einem Satz, der nichts ueber das Spiel behauptet (A10: falsche "fehlt")
  b = bewerte(AUFTRAG, plan, [{ id: "p1", ok: true, grund: null }], { punkte: [{ id: "p1", urteil: "fehlt", kunde: "In update() Zeile 12 fehlt s.boot.x" }] });
  assert.deepEqual([b.punkte[0].erfuellt, b.punkte[0].notiz, b.ueberstimmt], [true, "", 1]);
  assert.equal(b.ersetzt, 1, "p3 ohne Satz");
  assert.deepEqual([b.punkte[2].erfuellt, b.punkte[2].notiz], [false, "Ob das Spiel das so macht, konnten wir nicht sicher feststellen."], "ohne Urteil der Abnahme ist ein gelesener Punkt offen");
  // Szenario besteht, Modell sagt fehlt mit gueltigem Satz: fehlt mit diesem Satz (das Szenario prueft nicht jedes Detail)
  // (das Gespielte ist verworfen, die Abnahme hat entschieden: gelesen, Review Nit 10)
  b = bewerte(AUFTRAG, plan, [{ id: "p1", ok: true, grund: null }], { punkte: [{ id: "p1", urteil: "fehlt", kunde: "Das Boot faehrt nur nach links, nicht nach rechts." }] });
  assert.deepEqual([b.punkte[0].erfuellt, b.punkte[0].notiz, b.punkte[0].geprueft, b.ueberstimmt], [false, "Das Boot faehrt nur nach links, nicht nach rechts.", "gelesen", 0]);
  // ohne gueltiges Urteil (null, ungueltiges JSON) wird nie automatisch erfuellt, auch kein bestandenes Szenario
  const OFFEN = "Ob das Spiel das so macht, konnten wir nicht sicher feststellen.";
  b = bewerte(AUFTRAG, plan, [{ id: "p1", ok: true, grund: null }], null);
  assert.deepEqual(b.punkte.map((p) => [p.id, p.erfuellt, p.geprueft]), [["p1", false, "gelesen"], ["p2", false, "gelesen"], ["p3", false, "gelesen"]]);
  assert.deepEqual([b.punkte[0].notiz, b.ueberstimmt], [OFFEN, 0]);
  // schwache Art (eine Figur ist zu sehen): bestanden reicht nur mit bestaetigendem Urteil; "fehlt" ohne Satz -> offen
  const sicht = szenarioAusPlan("p1", { pruefbar: true, schritte: [{ halte: [], frames: 10 }], art: "figur_sichtbar", emoji: "⛵", richtung: "", text: "" }).szenario;
  const planS = { punkte: [{ ...plan.punkte[0], szenario: sicht }, plan.punkte[1], plan.punkte[2]] };
  b = bewerte(AUFTRAG, planS, [{ id: "p1", ok: true, grund: null }], { punkte: [{ id: "p1", urteil: "fehlt", kunde: "x = 1;" }, { id: "p3", urteil: "erfuellt", kunde: "" }] });
  assert.deepEqual([b.punkte[0].erfuellt, b.punkte[0].notiz, b.punkte[0].geprueft, b.ueberstimmt], [false, OFFEN, "gelesen", 0]);
  b = bewerte(AUFTRAG, planS, [{ id: "p1", ok: true, grund: null }], { punkte: [{ id: "p1", urteil: "erfuellt", kunde: "" }] });
  assert.deepEqual([b.punkte[0].erfuellt, b.punkte[0].geprueft], [true, "gespielt"]);
  assert.equal(szenarioSatz(sz, { grund: "von_allein" }), "Beim Ausprobieren passierte das auch ohne Tastendruck, die Steuerung dafür haben wir nicht gesehen.");
  for (const t of ["Beim Treffer macht es Pling.", "Die Boote werden noch nicht schneller."]) assert.ok(istKundensatz(t), t);
  for (const t of ["Zeile 14: g.addScore fehlt", "Bot greedy hat 0 Punkte", "update(s) setzt nichts", "p95 4.2 ms", "Gegner wird getötet", "x".repeat(161)]) assert.ok(!istKundensatz(t), t);
  assert.equal(szenarioSatz({ erwartung: { art: "punkte_steigen" } }, { grund: "steuerung_fehlt" }, "en"), "The game has no button for this.");
});

test("Konfiguration: Rollen A als Standard, Modell je Rolle umschaltbar, Unbekanntes ist ein Startfehler; Kostenbremse fest", () => {
  const env = { MDI_BAU_QUEUE_URL: "http://demos-wrapper:8791", MDI_BAU_PRUEF_URL: "http://mdi-pruef:8796", MDI_BAU_TOKEN_FILE: "/run/secrets/t", MDI_ANTHROPIC_KEY_FILE: "/run/secrets/k", HTTPS_PROXY: "http://mdi-egress:3128" };
  const c = konfig(env);
  assert.deepEqual(c.rollen, ROLLEN_STANDARD);
  assert.deepEqual(Object.values(c.rollen), ["claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5"]);
  assert.equal(konfig({ ...env, MDI_BAU_MODELL_ABNAHME: "claude-sonnet-5-5" }).rollen.abnahme, "claude-sonnet-5-5");
  assert.throws(() => konfig({ ...env, MDI_BAU_MODELL_BAUER: "gpt-9" }), /unbekanntes Modell gpt-9/);
  assert.throws(() => konfig({ ...env, MDI_BAU_AUFWAND_BAUER: "max" }), /AUFWAND_BAUER/);
  assert.throws(() => konfig({ MDI_BAU_TOKEN_FILE: "x" }), /QUEUE_URL[\s\S]*PRUEF_URL[\s\S]*KEY_FILE/);
  assert.throws(() => konfig({ ...env, MDI_BAU_PRUEF_URL: "" }), /getrennt von Key und Token/);
  assert.throws(() => konfig({ ...env, HTTPS_PROXY: "" }), /HTTPS_PROXY fehlt/, "ohne Egress-Proxy kein Start");
  assert.equal(konfig(env).tagesgrenze, KOSTEN.jeTagUsd); assert.equal(konfig({ ...env, MDI_BAU_TAGESGRENZE_USD: "1.15" }).tagesgrenze, 1.15);
  assert.throws(() => konfig({ ...env, MDI_BAU_TAGESGRENZE_USD: "50" }), /nur senken/);
  assert.equal(konfig({ MDI_BAU_QUEUE_URL: "http://w:1", MDI_BAU_PRUEF_URL: "http://p:2", MDI_BAU_TOKEN_FILE: "t", MDI_BAU_MODELL_DOUBLE: "1" }).double, true);
  assert.ok(Object.isFrozen(KOSTEN) && KOSTEN.jeAuftragUsd === 0.25 && KOSTEN.jeTagUsd === 5);
  assert.equal(GRENZEN.bauzeitMs, 15 * 60 * 1000); assert.ok(GRENZEN.maxTokensBau >= 32000); assert.ok(GRENZEN.maxTokensPlan >= 32000, "Planer wie Bauer (A10-Befund 2)");
});

test("Kosten: Auftragsgrenze unter Tagesgrenze, je UTC-Tag eine Datei; nichts geht ueber eine Grenze raus", async () => {
  const dir = tmp();
  let t = Date.parse("2026-11-18T10:00:00Z");
  const buch = createTagesbuch({ cap: 0.0022, dir, now: () => t });
  let sent = 0;
  const llm = createLlm({ ledger: buch(), fake: async (req, o) => { sent++; assert.ok(o && "signal" in o, "Signal wird durchgereicht"); return { stop_reason: "end_turn", content: [{ type: "text", text: "x" }], usage: { input_tokens: 1000, output_tokens: 1000 } }; } });
  const req = { max_tokens: 1000, system: "x", messages: [{ role: "user", content: "y" }] };
  const a1 = createLedger({ cap: 0.001, parent: buch(), name: "Auftragsgrenze" });
  await llm.call({ role: "bauer", model: "claude-haiku-5-5", req, ledger: a1 });
  await assert.rejects(llm.call({ role: "bauer", model: "claude-haiku-5-5", req, ledger: a1 }), (e) => e instanceof BudgetAbbruch && /Auftragsgrenze/.test(e.message));
  const a2 = createLedger({ cap: 1, parent: buch() });
  await llm.call({ role: "bauer", model: "claude-haiku-5-5", req, ledger: a2 });
  await llm.call({ role: "bauer", model: "claude-haiku-5-5", req, ledger: a2 });
  await assert.rejects(llm.call({ role: "bauer", model: "claude-haiku-5-5", req, ledger: a2 }), (e) => e instanceof BudgetAbbruch && /Tagesgrenze 2026-11-18/.test(e.message));
  assert.equal(sent, 3);
  assert.ok(fs.existsSync(path.join(dir, "kosten-2026-11-18.json")));
  t += 86400000;
  assert.equal(buch().spent, 0, "neuer Tag, neue Grenze");
  const ac = new AbortController(); ac.abort();
  await assert.rejects(llm.call({ role: "bauer", model: "claude-haiku-5-5", req, ledger: createLedger({ cap: 1 }), signal: ac.signal }), /Zeitgrenze/);
});

test("Pipeline mit Modell-Double (ohne Browser): Plan nur mit den Punkten des Auftrags, Grund bei jedem Ende ohne Spiel", async () => {
  const pruef = { async pruefe() { return { ok: true, policy: [], report: { ok: true, controls: ["left"], checks: {}, bots: {}, szenarien: [] } }; }, async fotos() { return { shots: [], status: null, errs: [] }; } };
  const ledger = () => createLedger({ cap: 1 });
  const p = createBauPipeline({ llm: createLlm({ ledger: ledger(), fake: modellDouble() }), pruef, rollen: ROLLEN_STANDARD });
  const ac = new AbortController();
  const e = await p.bauen(AUFTRAG, { signal: ac.signal, ledger: ledger() });
  assert.equal(e.ok, true);
  assert.deepEqual(e.punkte.map((x) => [x.id, x.erfuellt, x.geprueft]), [["p1", false, "gelesen"], ["p2", false, "gelesen"], ["p3", false, "gelesen"]]);
  assert.match(e.spiel.sha256, /^[0-9a-f]{64}$/);
  assert.equal(e.spiel.sha256, createHash("sha256").update(e.spiel.code).digest("hex"));
  // Planer erfindet einen Punkt: eine Korrekturrunde, dann ehrlich "fehler"
  const falsch = async (req) => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ entscheidung: "bauen", absage: "", typ: "echtzeit", spielplan: "x", punkte: [{ id: "p9", machbar: true, kunde: "", szenario: { pruefbar: false, schritte: [], art: "keins", emoji: "", richtung: "", text: "" } }] }) }], usage: {} });
  const p2 = createBauPipeline({ llm: createLlm({ ledger: ledger(), fake: falsch }), pruef, rollen: ROLLEN_STANDARD });
  assert.deepEqual((await p2.bauen(AUFTRAG, { signal: ac.signal, ledger: ledger() })).grund, "fehler");
  const absage = async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ entscheidung: "absagen", absage: "kein_spiel", typ: "echtzeit", spielplan: "", punkte: AUFTRAG.punkte.map((x) => ({ id: x.id, machbar: false, kunde: "", szenario: { pruefbar: false, schritte: [], art: "keins", emoji: "", richtung: "", text: "" } })) }) }], usage: {} });
  assert.equal((await createBauPipeline({ llm: createLlm({ ledger: ledger(), fake: absage }), pruef, rollen: ROLLEN_STANDARD }).bauen(AUFTRAG, { signal: ac.signal, ledger: ledger() })).grund, "kein_spiel");
  const tot = new AbortController(); tot.abort();
  assert.equal((await p.bauen(AUFTRAG, { signal: tot.signal, ledger: ledger() })).grund, "zeit");
  assert.equal((await p.bauen(AUFTRAG, { signal: ac.signal, ledger: createLedger({ cap: 0.000001 }) })).grund, "kosten");
  // abgeschnitten: nie reparieren, kuerzer neu bauen; immer abgeschnitten -> nicht_geschafft
  const lang = async (req) => /^Rolle: BAUER/.test(req.system[1].text) ? { stop_reason: "max_tokens", content: [{ type: "text", text: "```js\nexport default {" }], usage: {} } : modellDouble()(req);
  const seen = [];
  const p3 = createBauPipeline({ llm: createLlm({ ledger: ledger(), fake: async (req) => { seen.push(req); return lang(req); } }), pruef, rollen: ROLLEN_STANDARD });
  const n = await p3.bauen(AUFTRAG, { signal: ac.signal, ledger: ledger() });
  assert.equal(n.grund, "nicht_geschafft");
  assert.equal(seen.filter((r) => /^Rolle: BAUER/.test(r.system[1].text)).length, GRENZEN.reparaturen + 1);
  assert.ok(seen.filter((r) => /^Rolle: BAUER/.test(r.system[1].text)).slice(1).every((r) => /KOMPAKT/.test(r.messages[0].content) && !/Bisheriger Code/.test(r.messages[0].content)));
  assert.ok(seen.every((r) => r.max_tokens <= 32000) && seen.some((r) => r.max_tokens === 32000));
  for (const g of ["fehler", "kein_spiel", "zeit", "kosten", "nicht_geschafft"]) assert.ok(BAU_GRUENDE.includes(g));
});

test("Planer: 32k gestreamt; abgeschnitten -> eine Runde \"kuerzer\" statt gleicher Wiederholung; scheitert er, steht es im Log", async () => {
  const pruef = { async pruefe() { return { ok: true, policy: [], report: { ok: true, controls: ["left"], checks: {}, bots: {}, szenarien: [] } }; }, async fotos() { return { shots: [], status: null, errs: [] }; } };
  const ledger = () => createLedger({ cap: 1 });
  const ac = new AbortController();
  const istPlaner = (req) => /^Rolle: PLANER/.test(req.system[1].text);
  // erste Planer-Antwort abgeschnitten (halbes JSON), zweite vollstaendig
  const planer = [];
  let n = 0;
  const fake = async (req, o) => {
    if (!istPlaner(req)) return modellDouble()(req, o);
    planer.push(req);
    if (n++ === 0) return { stop_reason: "max_tokens", content: [{ type: "text", text: "{\"entscheidung\":\"bauen\",\"spielplan\":\"Typ echtzeit, lives 3, ..." }], usage: { output_tokens: 32000 } };
    return modellDouble()(req, o);
  };
  const logs = [];
  const p = createBauPipeline({ llm: createLlm({ ledger: ledger(), fake }), pruef, rollen: ROLLEN_STANDARD, log: (x) => logs.push(x) });
  const e = await p.bauen(AUFTRAG, { signal: ac.signal, ledger: ledger() });
  assert.equal(e.ok, true, "zweiter Planer-Versuch liefert den Plan");
  assert.equal(planer.length, 2);
  assert.ok(planer.every((r) => r.max_tokens === 32000), "Planer-Budget wie Bauer");
  assert.match(planer[1].messages[0].content, /ABGESCHNITTEN[\s\S]*KUERZER/);
  assert.doesNotMatch(planer[1].messages[0].content, /UNGUELTIG/, "kein Wiederholen mit gleicher Auflage");
  assert.equal(logs.filter((l) => l.event === "fk2-bau-plan").length, 0);
  // immer abgeschnitten: zwei Versuche, dann "fehler" mit Logzeile (heute ohne Logzeile, A10-Befund 2)
  const immer = async (req, o) => istPlaner(req) ? { stop_reason: "max_tokens", content: [{ type: "text", text: "{" }], usage: {} } : modellDouble()(req, o);
  const logs2 = [];
  const p2 = createBauPipeline({ llm: createLlm({ ledger: ledger(), fake: immer }), pruef, rollen: ROLLEN_STANDARD, log: (x) => logs2.push(x) });
  const e2 = await p2.bauen(AUFTRAG, { signal: ac.signal, ledger: ledger() });
  assert.equal(e2.grund, "fehler");
  const l = logs2.find((x) => x.event === "fk2-bau-plan");
  assert.deepEqual(l && l.runden.map((r) => [r.runde, r.stop, r.fehler[0]]), [[0, "max_tokens", "abgeschnitten"], [1, "max_tokens", "abgeschnitten"]]);
});

test("Worker: holt, baut mit Zeit- und Kostengrenze, meldet ohne Belege; Tagesgrenze haelt an; Token aus Datei", async () => {
  const dir = tmp(), tokenFile = path.join(dir, "token");
  fs.writeFileSync(tokenFile, "geheim-1234567890\n");
  const calls = [];
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => {
      calls.push({ url: req.url, auth: req.headers.authorization, body: b ? JSON.parse(b) : null });
      if (req.url === "/api/intern/fk2/holen") { if (calls.filter((c) => c.url === req.url).length > 1) { res.writeHead(204).end(); return; } res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ auftrag: AUFTRAG, lease: "L".repeat(22), art: "neu" })); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end("{\"ok\":true}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const queue = createQueueClient({ base: "http://127.0.0.1:" + server.address().port, tokenFile });
    const buch = createTagesbuch({ cap: 5, dir });
    let signal = null;
    const pipeline = { async bauen(a, o) { signal = o.signal; assert.equal(o.ledger.cap, KOSTEN.jeAuftragUsd); return { ok: true, titel: a.titel, fehlt: 0, ersetzt: 0, ms: 5, usd: 0.01, punkte: a.punkte.map((p) => ({ id: p.id, erfuellt: true, notiz: "", geprueft: "gespielt", beleg: "intern" })), spiel: { code: "x", sha256: "0".repeat(64) }, plan: { typ: "echtzeit" }, versuche: [{ runde: 0, ok: true, fehlerarten: [], code: "x" }] }; } };
    const w = createWorker({ queue, pipeline, tagesbuch: buch, log: () => {} });
    assert.equal(await w.einmal(), "gebaut");
    assert.equal(await w.einmal(), "leer");
    assert.ok(signal && !signal.aborted, "Signal nach dem Bau aufgeraeumt");
    const erg = calls.find((c) => c.url === "/api/intern/fk2/ergebnis");
    assert.equal(erg.auth, "Bearer geheim-1234567890");
    assert.equal(erg.body.auftrag, AUFTRAG.id); assert.equal(erg.body.lease, "L".repeat(22));
    assert.ok(!JSON.stringify(erg.body).includes("beleg") && !JSON.stringify(erg.body.versuche).includes("code"), "keine Belege, kein Code der Versuche");
    const voll = createTagesbuch({ cap: 0, dir: tmp() });
    assert.equal(await createWorker({ queue, pipeline, tagesbuch: voll, log: () => {} }).einmal(), "tagesgrenze");
  } finally { server.close(); }
  assert.deepEqual(meldung({ auftrag: { id: "x" }, lease: "l", art: "neu" }, { ok: false, grund: "zeit", ms: 1, usd: 0 }), { auftrag: "x", lease: "l", art: "neu", ms: 1, usd: 0, ok: false, grund: "zeit", alt: false });
});

test("Spiel-Dienst: nur Rahmen und Module, genau die Kopfzeilen aus frameCsp(), Hash-Pruefung, nichts sonst", async () => {
  const dir = tmp();
  const code = "export default {};\n", hash = createHash("sha256").update(code).digest("hex");
  fs.writeFileSync(path.join(dir, hash + ".js"), code);
  fs.writeFileSync(path.join(dir, "b".repeat(64) + ".js"), "falscher Inhalt");
  const A = "https://demos-34a13a96.bunsenbrenner.org", B = "https://bunsenbrenner.org";
  const cfg = { spielOrigin: "https://spiel-f29c55da.bunsenbrenner.org", appOrigins: [A, B], moduleDir: dir };
  const server = createSpielDienst(cfg, await buildSpiel());
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const get = async (p, o = {}) => { const r = await fetch(base + p, { method: o.method || "GET", headers: o.headers || {} }); return { status: r.status, h: Object.fromEntries([...r.headers].filter(([k]) => !["date", "connection", "keep-alive", "transfer-encoding"].includes(k))), body: await r.text() }; };
  const KEYS = ["cache-control", "content-length", "content-security-policy", "content-type", "referrer-policy", "vary", "x-content-type-options"];
  try {
    const cspA = frameCsp(cfg.spielOrigin, A), cspB = frameCsp(cfg.spielOrigin, B);
    assert.ok(cspA.includes("sandbox allow-scripts") && cspA.includes("connect-src 'none'") && cspA.includes("frame-ancestors " + A));
    const f = await get("/frame.html");
    assert.equal(f.status, 200);
    assert.deepEqual(Object.keys(f.h).sort(), KEYS);
    assert.equal(f.h["content-security-policy"], cspA, "ohne Sec-Required-CSP: der erste Ursprung");
    assert.equal(f.h["x-content-type-options"], "nosniff"); assert.equal(f.h["content-type"], "text/html; charset=utf-8");
    assert.equal((await get("/frame.html", { headers: { "Sec-Required-CSP": cspB } })).h["content-security-policy"], cspB, "eingebettet von B: genau die verlangte Policy");
    assert.equal((await get("/frame.html", { headers: { "Sec-Required-CSP": frameCsp(cfg.spielOrigin, "https://boese.example") } })).h["content-security-policy"], cspA, "fremder Einbettender: nie seine Policy");
    for (const n of ["/frame.js", "/frame.css"]) { const r = await get(n); assert.equal(r.status, 200, n); assert.equal(r.h["content-security-policy"], cspA); }
    const m = await get("/m/" + hash + ".js", { headers: { Origin: B } });
    assert.equal(m.status, 200); assert.equal(m.body, code);
    assert.deepEqual(Object.keys(m.h).sort(), ["access-control-allow-origin", ...KEYS].sort());
    assert.equal(m.h["access-control-allow-origin"], B); assert.equal(m.h["content-type"], "text/javascript; charset=utf-8");
    assert.deepEqual(m.h, Object.fromEntries(Object.entries(kopfzeilen(cfg, "modul", code.length, { origin: B })).map(([k, v]) => [k.toLowerCase(), v])));
    assert.equal((await get("/m/" + hash + ".js", { headers: { Origin: "https://boese.example" } })).h["access-control-allow-origin"], undefined, "kein CORS fuer fremde Urspruenge");
    for (const p of ["/m/" + "b".repeat(64) + ".js", "/", "/host.html", "/m/" + hash + ".js.map", "/frame.html/x", "/.env", "/m/" + hash.toUpperCase() + ".js"]) { const r = await get(p); assert.equal(r.status, 404, p); assert.equal(r.h["content-security-policy"], cspA, p); }
    assert.equal((await get("/frame.html", { method: "POST" })).status, 405);
    assert.equal((await get("/frame.html", { method: "HEAD" })).status, 200);
  } finally { server.close(); }
  assert.throws(() => createSpielDienst({ ...cfg, appOrigins: ["*"] }, { frame: {} }), /Urspruenge/);
  assert.throws(() => createSpielDienst({ ...cfg, appOrigins: [] }, { frame: {} }), /Urspruenge/);
});

test("Policy ohne Fehlalarme (Liste statt Bereiche) und Statik ohne parent-Fehlalarm; Praefix mit Rundenspiel-Vorlage", () => {
  for (const e of ["🏆", "🏅", "🕹", "🕷", "🕸", "🕶", "🙈", "👽", "👾", "👻", "🤖", "👍", "⛵", "🐸"]) assert.deepEqual(checkPolicy('d.emoji("' + e + '", 1, 1, 20)'), [], e);
  for (const e of ["🧑", "👩🏽", "🏊", "⛹", "🤶", "🧟", "👁", "🚣", "🎅"]) assert.match(checkPolicy('d.emoji("' + e + '", 1, 1, 20)').join(" "), /Menschen/, e);
  assert.match(checkTexte(["Alle Gegner getötet"]).join(" "), /Gewalt/);
  assert.deepEqual(checkSpielSource("function childRock(g, parent, size) { return { x: parent.x, s: size }; }\nexport default { title: \"t\" };"), []);
  assert.match(checkSpielSource("function a(parent) { return parent; }\nfunction b() { return parent.x; }\nexport default { a, b };").join(" "), /Global parent/);
  assert.match(checkSpielSource("export default { update(s) { parent.document.body.textContent = 1; } };").join(" "), /Global parent/);
  assert.deepEqual([...VORLAGEN], ["invaders", "snake", "plattformer", "memory"]);
  const p = praefix();
  for (const s of ["Bot-Regeln fuer Runden- und Brettspiele", "Zwischenpunkte je Zug", "Vorlage memory.js", "Szenario-Bots", "figur_bewegt"]) assert.ok(p.includes(s), s);
});

test("Review S1: Pruef-Dienst getrennt (nur /pruefe und /fotos, Eingaben geprueft), Client mit gleicher Schnittstelle; Browser ohne WebRTC", async () => {
  const calls = [];
  const fake = { async pruefe(code, o) { calls.push(["pruefe", code, o]); return { ok: true, policy: [], report: { ok: true, szenarien: [] } }; }, async fotos(code, o) { calls.push(["fotos", code, o]); return { shots: [Buffer.from("png")], status: null, errs: [] }; } };
  const server = createPruefDienst(fake);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const c = createPruefClient({ base });
    assert.deepEqual(await c.pruefe("export default {}", { name: "x", seed: "s", seconds: 60, szenarien: [] }), { ok: true, policy: [], report: { ok: true, szenarien: [] } });
    const f = await c.fotos("export default {}", { seed: "foto" });
    assert.ok(Buffer.isBuffer(f.shots[0])); assert.equal(f.shots[0].toString(), "png");
    for (const [p, b] of [["/pruefe", { code: "", seed: "s", seconds: 60, name: "x" }], ["/pruefe", { code: "x", seed: "a b", seconds: 60, name: "x" }], ["/pruefe", { code: "x", seed: "s", seconds: 9999, name: "x" }],
      ["/pruefe", { code: "x", seed: "s", seconds: 60, name: "x", szenarien: [{ id: "p1" }] }], ["/fotos", { code: "x".repeat(70000), seed: "s" }]]) {
      assert.equal((await fetch(base + p, { method: "POST", body: JSON.stringify(b) })).status, 400, JSON.stringify(b).slice(0, 60));
    }
    assert.equal((await fetch(base + "/key", { method: "POST", body: "{}" })).status, 404);
    assert.equal((await fetch(base + "/pruefe")).status, 404);
    assert.equal(calls.length, 2);
  } finally { server.close(); }
  for (const a of ["--webrtc-ip-handling-policy=disable_non_proxied_udp", "--force-webrtc-ip-handling-policy"]) assert.ok(BROWSER_ARGS.includes(a), a);
});

test("KI-Ausfall im Bau: ki-limit (auch als 400 mit Limit-Text) endet ehrlich mit ki_nicht_verfuegbar, Worker pausiert", async () => {
  const { kiKlasse } = await import("../bau/ki-klasse.mjs");
  assert.equal(kiKlasse({ status: 400, message: "You have reached your specified API usage limits." }), "ki-limit");
  assert.equal(kiKlasse({ status: 402 }), "ki-limit"); assert.equal(kiKlasse({ status: 401 }), "ki-key");
  assert.equal(kiKlasse({ status: 529 }), "ki-ueberlastet"); assert.equal(kiKlasse({ status: 503 }), "ki-ausfall");
  assert.equal(kiKlasse({ name: "APIConnectionError" }), "ki-ausfall"); assert.equal(kiKlasse({ code: "proxy-403" }), "ki-ausfall");
  assert.equal(kiKlasse({ status: 400, message: "messages: field required" }), "", "eigener Fehler bleibt ein Fehler");
  assert.equal(kiKlasse(new TypeError("x")), "");
  const limit = async () => { throw Object.assign(new Error("400 You have reached your specified API usage limits"), { status: 400 }); };
  const pruef = { async pruefe() { throw new Error("nie"); }, async fotos() { throw new Error("nie"); } };
  const p = createBauPipeline({ llm: createLlm({ ledger: createLedger({ cap: 1 }), fake: limit }), pruef, rollen: ROLLEN_STANDARD });
  const e = await p.bauen(AUFTRAG, { signal: new AbortController().signal, ledger: createLedger({ cap: 1 }) });
  assert.deepEqual([e.ok, e.grund, e.ki], [false, "ki_nicht_verfuegbar", "ki-limit"]);
  assert.ok(BAU_GRUENDE.includes("ki_nicht_verfuegbar"));
  assert.deepEqual(meldung({ auftrag: { id: "x" }, lease: "l", art: "neu" }, e).ki, "ki-limit");
  // der Worker meldet und holt danach 15 Minuten nichts
  let holen = 0, t = 0;
  const queue = { async holen() { holen++; return { auftrag: AUFTRAG, lease: "L".repeat(22), art: "neu" }; }, async ergebnis() { return { ok: true }; } };
  const w = createWorker({ queue, pipeline: p, tagesbuch: createTagesbuch({ cap: 5, dir: tmp() }), log: () => {}, now: () => t });
  assert.equal(await w.einmal(), "gebaut");
  assert.equal(await w.einmal(), "ki-pause"); assert.equal(holen, 1);
  t += 15 * 60000 + 1;
  assert.equal(await w.einmal(), "gebaut"); assert.equal(holen, 2);
});

test("Nit 8: KI-Fehler in der Abnahme -> einmal wiederholen, bevor das fertige Spiel verworfen wird; Meldung traegt ueberstimmt und Anlauf", async () => {
  const pruef = { async pruefe() { return { ok: true, policy: [], report: { ok: true, controls: ["left"], checks: {}, bots: {}, szenarien: [{ id: "p1", ok: true, grund: null, wert: { anlauf: 2 } }] } }; }, async fotos() { return { shots: [], status: null, errs: [] }; } };
  const istAbnahme = (req) => /^Rolle: ABNAHME/.test(req.system[1].text);
  const lauf = async (fehler) => {
    let n = 0;
    const fake = async (req, o) => {
      if (istAbnahme(req) && n++ < fehler) throw Object.assign(new Error("529 overloaded"), { status: 529 });
      const r = await modellDouble()(req, o);
      if (!/^Rolle: PLANER/.test(req.system[1].text)) return r;
      // Plan mit einem Szenario fuer p1 (der Pruef-Double meldet es als im zweiten Anlauf bestanden)
      const plan = JSON.parse(r.content[0].text);
      plan.punkte[0].machbar = true;
      plan.punkte[0].szenario = { pruefbar: true, schritte: [{ halte: ["left"], frames: 60 }], art: "figur_bewegt", emoji: "⛵", richtung: "links", text: "" };
      return { ...r, content: [{ type: "text", text: JSON.stringify(plan) }] };
    };
    const logs = [];
    const p = createBauPipeline({ llm: createLlm({ ledger: createLedger({ cap: 1 }), fake }), pruef, rollen: ROLLEN_STANDARD, log: (x) => logs.push(x) });
    return { e: await p.bauen(AUFTRAG, { signal: new AbortController().signal, ledger: createLedger({ cap: 1 }) }), logs, n };
  };
  const eins = await lauf(1);
  assert.equal(eins.e.ok, true, "ein KI-Fehler: zweiter Versuch, Spiel geliefert");
  assert.equal(eins.n, 2);
  assert.ok(eins.logs.some((l) => l.event === "fk2-bau-ki" && l.phase === "abnahme" && l.wiederholt === true));
  const zwei = await lauf(2);
  assert.deepEqual([zwei.e.ok, zwei.e.grund, zwei.e.ki, zwei.n], [false, "ki_nicht_verfuegbar", "ki-ueberlastet", 2], "zweimal: ehrlich nicht verfuegbar, kein dritter Versuch");
  // Meldung an den Wrapper: ueberstimmt und die Szenario-Ergebnisse mit Anlauf (Review Nit 9)
  const m = meldung({ auftrag: { id: "x" }, lease: "l", art: "neu" }, eins.e);
  assert.equal(typeof m.ueberstimmt, "number");
  assert.deepEqual(m.szenarien, [{ id: "p1", ok: true, grund: null, anlauf: 2, kontrolle: false }]);
});
