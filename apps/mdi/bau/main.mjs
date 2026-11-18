#!/usr/bin/env node
// Freie Karte 2, P3: Einstieg des Bau-Worker-Containers (bau/Dockerfile, Befehl "node bau/main.mjs"). Er haelt Key und
// Token, spricht nur mit der Modell-API (ueber den Egress-Proxy, HTTPS_PROXY), der Warteschlange des Wrappers und dem
// Pruef-Dienst (bau/pruef-dienst.mjs); er haengt nur an Docker-Netzen mit --internal.
// Konfiguration: bau/konfig.mjs. SIGTERM/SIGINT: der laufende Auftrag wird zu Ende gebaut, dann endet der Prozess
// (ein abgebrochener Bau kaeme nach Ablauf der Lease ohnehin wieder in die Warteschlange).
import { konfig } from "./konfig.mjs";
import { createLlm, createTagesbuch } from "./llm.mjs";
import { createPruefClient } from "./pruef-dienst.mjs";
import { createBauPipeline } from "./pipeline.mjs";
import { createQueueClient, createWorker } from "./worker.mjs";
import { KOSTEN } from "./konfig.mjs";
import { modellDouble } from "./doppel.mjs";

const c = konfig();
const log = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));
// Schreibtest beim Start (createTagesbuch): ist der Ordner nicht beschreibbar, holt der Worker keinen Auftrag, sagt es laut im
// Log und endet mit 1 (Docker startet ihn mit Wartezeit neu; der Wrapper meldet auf /api/status bau.grund "worker-still")
let tagesbuch;
try { tagesbuch = createTagesbuch({ cap: c.tagesgrenze, dir: c.stateDir }); }
catch (e) { log({ event: "fk2-bau-start", ok: false, why: "state-nicht-beschreibbar", dir: c.stateDir, code: e.code, note: "Eigentuemer des Volumes pruefen (Wrapper-Repo deploy/fk2-p34/release.sh setzt ihn)" }); process.exit(1); }
// Aufruf-Protokoll ohne Inhalte: Rolle, Modell, Tokens, Kosten
const llm = createLlm({ keyFile: c.keyFile, proxy: c.proxy, ledger: tagesbuch(), log: (row) => log({ event: "fk2-llm", ...row }), ...(c.double ? { fake: modellDouble() } : {}) });
// Chromium und der fremde Code laufen NICHT hier, sondern im Pruef-Container ohne Key, Token und Netz (Review S1)
const pruef = createPruefClient({ base: c.pruefUrl });
const pipeline = createBauPipeline({ llm, pruef, rollen: c.rollen, effort: c.effort, log });
const worker = createWorker({ queue: createQueueClient({ base: c.queueUrl, tokenFile: c.tokenFile }), pipeline, tagesbuch, log });
const ac = new AbortController();
for (const s of ["SIGTERM", "SIGINT"]) process.once(s, () => { log({ event: "fk2-bau-stop", signal: s }); ac.abort(); });
log({ event: "fk2-bau-start", rollen: c.rollen, effort: c.effort, double: c.double, kosten: { ...KOSTEN, jeTagUsd: c.tagesgrenze } });
await worker.laufen({ signal: ac.signal, pollMs: c.pollMs });
await pruef.close();
