#!/usr/bin/env node
// Freie Karte 2, P3: Messlauf. Jede Variante (Rollenverteilung) x jeder Spiel-Wunsch x k Laeufe:
// neue Karte, danach bis zu 3 Nachbesserungen ohne Kundentext (nur die fehlt-Punkte der Abnahme).
// Eingabe: Wunschdatei OHNE Erwartungen (id, wunsch, genre, wer_spielt). Die Erwartungen kennt nur das Urteil.
//
//   node scripts/fk2-p3/messung.mjs --in wuensche.jsonl --out /work/out --key /run/secrets/anthropic.key \
//        --varianten A,C,B --laeufe 3 --cap 14.5 --parallel 3 [--nur P01,P05] [--nachbesserungen 3]
//        [--effort-bauer low] [--effort-planer medium] [--effort-abnahme medium]   (Variante "A2" = Rollen von A, eigener Name)
//
// Schreibt nach --out: karten.jsonl (je Karte, mit Code; Fotos als PNG unter fotos/), aufrufe.jsonl (jeder Modellaufruf
// mit Tokens und Kosten), abweichungen.jsonl (Format fk2-abweichung/1, siehe unten), budget.json, lauf.log.
// Bricht hart ab, sobald die Kostengrenze einen weiteren Aufruf nicht mehr zulaesst. Gibt nie den Key aus.
import fs from "node:fs";
import path from "node:path";
import { createLedger, createLlm, BudgetAbbruch } from "./llm.mjs";
import { createPruefstand } from "./pruefen.mjs";
import { createPipeline, VARIANTEN } from "./pipeline.mjs";

const a = process.argv.slice(2), opt = { varianten: "A", laeufe: 1, cap: 1, parallel: 2, nachbesserungen: 3 };
for (let i = 0; i < a.length; i += 2) opt[a[i].replace(/^--/, "")] = a[i + 1];
const OUT = path.resolve(opt.out), CAP = Number(opt.cap), K = Number(opt.laeufe), PAR = Number(opt.parallel), NB = Number(opt.nachbesserungen);
fs.mkdirSync(path.join(OUT, "fotos"), { recursive: true });
const jl = (f, row) => fs.appendFileSync(path.join(OUT, f), JSON.stringify(row) + "\n");
const log = (s) => { const l = new Date().toISOString().slice(11, 19) + " " + s; console.log(l); fs.appendFileSync(path.join(OUT, "lauf.log"), l + "\n"); };

let wuensche = fs.readFileSync(opt.in, "utf8").trim().split("\n").map((l) => JSON.parse(l));
if (wuensche.some((w) => w.erwartung)) throw new Error("Eingabe enthaelt Erwartungen – die Pipeline darf sie nicht kennen");
if (opt.nur) { const s = new Set(opt.nur.split(",")); wuensche = wuensche.filter((w) => s.has(w.id)); }

const ledger = createLedger({ cap: CAP, file: path.join(OUT, "budget.json") });
const kosten = {};   // je Karte (Tag-Praefix), damit parallele Karten sich nicht vermischen
const llm = createLlm({ keyFile: opt.key, ledger, log: (row) => { jl("aufrufe.jsonl", row); const k = String(row.tag || "").split(":")[0]; kosten[k] = (kosten[k] || 0) + (row.usd || 0); } });
const pruef = await createPruefstand();
const erledigt = new Set(fs.existsSync(path.join(OUT, "karten.jsonl")) ? fs.readFileSync(path.join(OUT, "karten.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []);
let stop = false;

/**
 * Abweichungs-Datensatz fk2-abweichung/1: eine Zeile je (Karte, Version/Runde, Punkt). Gleiches Format fuer
 *   quelle "abnahme" (Pipeline prueft Haekchen), "erwartung" (Urteil gegen Persona-Erwartung) und spaeter "meldung"
 *   (Kunde meldet nach 3 Nachbesserungen mit Begruendung). So lassen sich Meldungen und Erwartungsabweichungen gemeinsam
 *   nach wunsch_id, karte, runde und fehlerart auswerten.
 */
function abweichungen(karte, variante, lauf) {
  const base = { schema: "fk2-abweichung/1", karte: karte.id, wunsch_id: karte.wunsch_id, variante, lauf };
  if (!karte.plan) return;
  for (const v of karte.versionen || []) {
    for (const h of karte.plan.haekchen) {
      const u = v.abnahme.punkte.find((x) => x.id === h.id);
      jl("abweichungen.jsonl", { ...base, quelle: "abnahme", runde: v.runde, punkt_id: h.id, punkt: h.punkt, status: !h.machbar ? "fehlt_angesagt" : u && u.urteil === "erfuellt" ? "erfuellt" : "fehlt", grund: !h.machbar ? h.grund : u ? u.beleg : "", fehlerarten: [], kundentext: null });
    }
  }
}

async function eineKarte(variante, w, lauf) {
  const tag = variante + "-" + w.id + "-L" + lauf;
  if (erledigt.has(tag) || stop) return;
  const pipe = createPipeline({ llm, pruef, rollen: VARIANTEN[variante.replace(/[^ABC]/g, "")], effort: { planer: opt["effort-planer"], bauer: opt["effort-bauer"], abnahme: opt["effort-abnahme"] } });
  const t0 = Date.now();
  try {
    const karte = await pipe.neu({ ...w, tag });
    karte.anzeige0 = structuredClone(karte.anzeige);   // was die Person beim ersten Ausliefern sieht (Grundlage des Urteils)
    for (let i = 0; i < NB && karte.ende === "geliefert"; i++) {
      const nb = await pipe.nachbessern(karte);
      if (nb.melden || nb.ergebnis === "nichts-zu-tun") break;
    }
    // Fotos als Dateien, nicht im JSON
    for (const v of karte.versionen || []) { v.fotoDateien = v.fotos.map((buf, i) => { const f = "fotos/" + tag + "-v" + v.runde + "-" + i + ".png"; fs.writeFileSync(path.join(OUT, f), buf); return f; }); delete v.fotos; }
    karte.variante = variante; karte.lauf = lauf; karte.usd = kosten[tag] || 0; karte.wallMs = Date.now() - t0;
    jl("karten.jsonl", karte);
    abweichungen(karte, variante, lauf);
    const nbs = (karte.nachbesserungen || []).map((n) => n.offen_nachher).join(">");
    log(tag + " " + karte.ende + " fehlt=" + (karte.anzeige && karte.anzeige.fehlt ? karte.anzeige.fehlt.length : "-") + (nbs ? " nb:" + nbs : "") + " rep=" + ((karte.versuche || []).length - 1) + " " + (karte.ms / 1000).toFixed(0) + "s " + karte.usd.toFixed(4) + "$ gesamt=" + ledger.spent.toFixed(4) + "$");
  } catch (e) {
    if (e instanceof BudgetAbbruch) { stop = true; log("ABBRUCH Budget bei " + tag + ": " + e.message); jl("karten.jsonl", { id: tag, wunsch_id: w.id, variante, lauf, ende: "budget-abbruch" }); return; }
    log("FEHLER " + tag + ": " + String(e.stack || e).slice(0, 400));
  }
}

const jobs = [];
for (const v of opt.varianten.split(",")) for (let l = 1; l <= K; l++) for (const w of wuensche) jobs.push([v, w, l]);
log("start: " + jobs.length + " Karten, Grenze " + CAP + " $, bisher " + ledger.spent.toFixed(4) + " $");
let next = 0;
await Promise.all(Array.from({ length: PAR }, async () => { while (!stop && next < jobs.length) { const j = jobs[next++]; await eineKarte(...j); } }));
await pruef.close();
log("fertig: ausgegeben " + ledger.spent.toFixed(4) + " $ von " + CAP + " $" + (stop ? " (hart abgebrochen)" : ""));
