"use strict";
// Daily Business stage 2 (src/biz.js): onboarding from a start date, the feedback evaluation, the next meeting.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Tn = require("../src/turns.js");
const B = require("../src/biz.js");
const start = (g) => ({ g, seed: 7, q: "", f: "star" });
const run = (g, moves) => moves.reduce((d, m) => d && Tn.play(d, m, 0), start(g));
const DAY1 = 20500, TODAY = 20480;   // day one in 20 days

test("Onboarding: feste Vorlage, Fristen rechnet der Code relativ zum ersten Tag, nie vor heute", () => {
  const p = B.onboardPlan(DAY1, TODAY, "de");
  assert.equal(p.length, B.PLAN.length);
  assert.deepEqual(p.map((x) => x[2]), [DAY1 - 14, DAY1 - 7, DAY1 - 7, DAY1 - 3, DAY1, DAY1, DAY1 + 7, DAY1 + 30]);
  assert.ok(p.every((x) => x[1] === "" && x[0].length <= Tn.TODO.text), "kein Name, Text passt in die Liste");
  const soon = B.onboardPlan(TODAY + 2, TODAY, "en");
  assert.equal(soon[0][2], TODAY, "14 days before a start in 2 days: today, not in the past");
  assert.equal(soon[0][0], "Order desk and equipment");
  const got = Tn.todoFrom({ t: B.onboardTitle("Vertrieb", "de"), i: p });
  assert.ok(got.list, "die Vorlage ist eine gueltige Aufgabenliste"); assert.equal(got.lost, 0); assert.equal(got.t, "Onboarding: Vertrieb");
});

test("Onboarding: KI-Aufgaben (liste, art aufgaben) mit relativer Frist, ohne Doppelte, ohne Namen, hoechstens bis die Liste voll ist", () => {
  const plan = B.onboardPlan(DAY1, TODAY, "de");
  const opt = { art: "aufgaben", aufgaben: [
    { was: "Zugänge und Konten anlegen", frist: "1_woche_vorher" },     // already in the plan
    { was: "CRM-Zugang einrichten", frist: "3_tage_vorher", wer: "Ana" },
    { was: "Kundenliste übergeben", frist: "danach" },
    { was: "Produktschulung buchen", frist: "sofort" },
    { was: "Mit dem Team zu Mittag essen", frist: "offen" },
    { was: "Eine Aufgabe, die deutlich zu lang ist für die Liste und am Wortende endet", frist: "am_tag" },
    { was: "Nummer sechs", frist: "gestern" }] };
  const add = B.aiTasks(opt, plan, DAY1, TODAY, Tn.TODO.items - plan.length);
  assert.deepEqual(add.map((x) => x[0]), ["CRM-Zugang einrichten", "Kundenliste übergeben", "Produktschulung buchen", "Mit dem Team zu Mittag essen"]);
  assert.deepEqual(add.map((x) => x[2]), [DAY1 - 3, DAY1 + 7, TODAY, 0], "sofort = heute, offen = ohne Frist");
  assert.ok(add.every((x) => x[1] === ""), "the AI never names who");
  const all = Tn.todoFrom({ t: "Onboarding", i: plan.concat(add) });
  assert.ok(all.list); assert.equal(all.lost, 0, "12 Aufgaben passen in den Link");
  // live answer (2026-11-05): 4 tasks fit the count, but not all of them the link's bytes
  const live = [["Onboarding-Checkliste erstellen", "", DAY1 - 14], ["Arbeitsplatz und IT einrichten", "", DAY1 - 7], ["Rolle Vertrieb und Ziele klären", "", DAY1 - 1], ["Willkommenspaket bereitlegen", "", DAY1]];
  assert.equal(Tn.todoFrom({ t: "Onboarding: Vertrieb", i: plan.concat(live) }).lost, 1, "ohne Pruefung ginge eine verloren");
  const kept = B.fits(plan, live, "Onboarding: Vertrieb");
  assert.deepEqual(kept, live.slice(0, 3)); assert.equal(Tn.todoFrom({ t: "Onboarding: Vertrieb", i: plan.concat(kept) }).lost, 0);
  assert.deepEqual(B.aiTasks({ art: "einkauf", posten: [{ n: "Brot" }], aufgaben: [] }, plan, DAY1, TODAY, 4), [], "a shopping list adds nothing");
  assert.equal(B.cut("Eine Aufgabe, die deutlich zu lang ist für die Liste und am Wortende endet", 48), "Eine Aufgabe, die deutlich zu lang ist für die");
});

const fb = (notes) => run("feedback", [["Workshop Montag"]].concat(notes.map((n, i) => [1 + (i % 5), [n]])));
const NOTES = ["Zu lang ohne Pause", "Ziel war unklar", "Gute Praxisbeispiele", "Pausen fehlten", "Mehr Zeit für Fragen"];

test("Feedback: Notizen aus der Karte, ab 5; lokal gemischt nur aus dem Seed (gleiche Karte, gleiche Reihenfolge)", () => {
  const d = fb(NOTES);
  assert.deepEqual(B.notes(d), NOTES);
  assert.equal(B.notes(run("feedback", [["X"], [3, [""]], [4, ["nur eine"]]])).length, 1, "a rating without a note is no note");
  const a = B.mixed(d, B.notes(d)), b = B.mixed(JSON.parse(JSON.stringify(d)), B.notes(d));
  assert.deepEqual(a, b, "deterministic");
  assert.deepEqual(a.slice().sort(), NOTES.slice().sort(), "a permutation");
  assert.notDeepEqual(a, NOTES, "not in the order people wrote them");
  const src = fs.readFileSync(path.join(__dirname, "../src/biz.js"), "utf8") + fs.readFileSync(path.join(__dirname, "../src/flavors/business/biz-ui.js"), "utf8");
  assert.doesNotMatch(src, /Math\.random/, "Zufall nur aus dem Seed");
});

test("Feedback: Auswertung nur mit 3 Themen + Vorschlag, nie woertlich; alter Server (Einkaufsliste) ehrlich erkannt", () => {
  const ok = { art: "feedback", titel: "Workshop", themen: ["Zeitrahmen", "Praxisbezug", "Zielklarheit"], vorschlag: "Ziel und Pausen zu Beginn festlegen.", posten: [], aufgaben: [] };
  assert.deepEqual(B.evaluation(ok, NOTES), { themen: ok.themen, vorschlag: ok.vorschlag });
  assert.deepEqual(B.evaluation({ ...ok, themen: ["Zeitrahmen", "Pausen fehlten", "Zielklarheit"] }, NOTES), { bad: "quote" });
  assert.deepEqual(B.evaluation({ ...ok, vorschlag: "Mehr Zeit fuer Fragen einplanen" }, NOTES), { bad: "quote" }, "ue = ü");
  assert.deepEqual(B.evaluation({ art: "einkauf", titel: "x", personen: 0, posten: [{ n: "Brot" }], aufgaben: [] }, NOTES), { bad: "old" });
  assert.deepEqual(B.evaluation({ ...ok, themen: ["Zeitrahmen", "Praxisbezug"] }, NOTES), { bad: "old" });
  assert.equal(B.quotes("Pausen", NOTES, 3), false, "ein Wort ist ein Thema, kein Zitat");
  assert.equal(B.crisis(["Ich will nicht mehr leben"]), true); assert.equal(B.crisis(NOTES), false);
});

test("Retro-Agenda aus den 3 Themen und Folgetermin aus offenen Aufgaben sind gueltige erste Zuege der Agenda-Karte", () => {
  const r = B.retro(["Zeitrahmen", "Praxisbezug", "Zielklarheit"], "Workshop Montag", "", "de");
  assert.deepEqual(r, ["Retro: Workshop Montag", ["Zeitrahmen", "Praxisbezug", "Zielklarheit"], "Moderation"]);
  assert.ok(Tn.play(start("agenda"), r, 0), "the agenda card takes it");
  const got = Tn.todoFrom({ t: "Weekly", i: [["Angebot schicken", "Ana", 0], ["Raum buchen", "", 0], ["Budget prüfen", "Ben", 0], ["Protokoll teilen", "", 0]] });
  const f = B.followUp(got.list, "Weekly", "Cem", "de");
  assert.deepEqual(f, ["Folgetermin: Weekly", ["Angebot schicken (Ana)", "Raum buchen", "2 weitere offene Aufgaben"], "Cem"]);
  assert.ok(Tn.play(start("agenda"), f, 0));
  const two = B.followUp(Tn.todoFrom({ t: "W", i: [["Eine sehr lange Aufgabe für den Termin", "Maximilian", 0]] }).list, "W", "", "en");
  assert.ok(two[1][0].length <= 30 && two[1][0].endsWith("(Maximilian)"), two[1][0]);
  assert.ok(Tn.play(start("agenda"), two, 0));
});
