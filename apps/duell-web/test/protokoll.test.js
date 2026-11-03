"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/protokoll.js");

const tone = (sec, amp) => { const n = Math.round(sec * P.RATE), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = amp * Math.sin(i / 5); return a; };

test("Modellwahl: ehrliches Nein ohne Isolation oder auf sehr schwachen Geraeten, sonst klein oder base", () => {
  const ok = { wasm: true, worker: true, isolated: true, media: true };
  assert.deepEqual(P.pickModel({ ...ok, isolated: false }), { ok: false, why: "browser" });
  assert.deepEqual(P.pickModel({ ...ok, media: false }), { ok: false, why: "browser" });
  assert.deepEqual(P.pickModel({ ...ok, mem: 1, cores: 8 }), { ok: false, why: "weak" });
  assert.equal(P.pickModel({ ...ok, mem: 3, cores: 8 }).model, "tiny");
  assert.equal(P.pickModel({ ...ok, cores: 4, mobile: true }).model, "tiny", "Handy mit 4 Kernen bekommt das kleine Modell");
  assert.equal(P.pickModel({ ...ok, mem: 8, cores: 8 }).model, "base");
  assert.equal(P.threads({ cores: 12, mobile: true }), 4);
  assert.equal(P.threads({ cores: 1 }), 1);
});

test("Resampling: 48 kHz -> 16 kHz drittelt die Laenge, 16 kHz bleibt", () => {
  assert.equal(P.resample(new Float32Array(48000), 48000).length, 16000);
  assert.equal(P.resample(new Float32Array(441), 44100).length, 160);
  assert.equal(P.resample(new Float32Array(100), 16000).length, 100);
});

test("Chunker: schneidet an einer Pause, spaetestens nach maxSec, Stille wird verworfen", () => {
  const c = P.Chunker({ minSec: 2, maxSec: 5, pauseSec: 0.5 });
  assert.deepEqual(c.push(tone(1.5, 0.2)), [], "zu kurz");
  const a = c.push(tone(1, 0)); // 2.5 s, endet mit 1 s Stille -> Schnitt
  assert.equal(a.length, 1); assert.equal(a[0].start, 0); assert.equal(a[0].sec, 2.5);
  const b = c.push(tone(6, 0.2)); // ohne Pause: Zwangsschnitt bei 5 s
  assert.equal(b.length, 1); assert.equal(b[0].sec, 5); assert.equal(b[0].start, 2.5);
  assert.equal(c.flush().sec, 1);
  const s = P.Chunker({ minSec: 1, maxSec: 3 });
  assert.deepEqual(s.push(tone(4, 0)), [], "reine Stille geht nie an die Erkennung");
  assert.equal(s.flush(), null);
});

test("Erkennung: Untertitel-Halluzinationen und Geraeusch-Marken fliegen raus", () => {
  assert.equal(P.resultText({ transcription: [{ text: " Wir starten mit dem Budget." }, { text: "[Musik]" }, { text: "(Applaus)" }] }), "Wir starten mit dem Budget.");
  assert.equal(P.resultText({ transcription: [{ text: "Untertitel im Auftrag des ZDF, 2020" }] }), "");
  assert.equal(P.resultText({ transcription: [{ text: "Vielen Dank fürs Zuschauen!" }] }), "");
  assert.equal(P.resultText("  ...  "), "");
  assert.equal(P.resultText(null), "");
  assert.equal(P.stamp(754), "12:34");
});

test("Namen: getrennt, gesaeubert, ohne Doppelte, hoechstens 12", () => {
  assert.deepEqual(P.cleanNames("Anna, Ben;anna\n<b>Cem</b>"), ["Anna", "Ben", "bCemb"]);
  assert.equal(P.cleanNames(Array.from({ length: 20 }, (_, i) => "N" + i).join(",")).length, 12);
});

test("Schwaerzen: E-Mail, Telefon, IBAN und Links verlassen das Geraet nicht", () => {
  const r = P.redact("Schreib an anna.b@firma.de oder ruf 0171 2345678 an. IBAN DE89 3704 0044 0532 0130 00, Link https://x.y/z. Raum 204, 3 Punkte.");
  assert.doesNotMatch(r, /anna\.b|2345678|3704|x\.y/);
  assert.match(r, /\[E-Mail\].*\[Nummer\].*\[IBAN\].*\[Link\]/);
  assert.match(r, /Raum 204, 3 Punkte/, "kurze Zahlen bleiben");
});

test("Protokoll auf dem Geraet: Themen, Entscheidungen und Aufgaben mit Person und Frist", () => {
  const segs = [
    { t: 0, x: "Thema: Sommerfest der Abteilung." },
    { t: 9, x: "Wir haben beschlossen, das Fest am Freitag zu machen. Anna kümmert sich um die Getränke bis Mittwoch." },
    { t: 20, x: "Ben schickt die Einladung bis 12.11." }
  ];
  const p = P.localSummary(segs, ["Anna", "Ben"], "de");
  assert.equal(p.source, "local");
  assert.deepEqual(p.participants, ["Anna", "Ben"]);
  assert.deepEqual(p.topics, ["Sommerfest der Abteilung."]);
  assert.equal(p.decisions.length, 1); assert.match(p.decisions[0], /Freitag/);
  assert.equal(p.tasks.length, 2);
  assert.deepEqual([p.tasks[0].who, p.tasks[0].due], ["Anna", "bis Mittwoch"]);
  assert.deepEqual([p.tasks[1].who, p.tasks[1].due], ["Ben", "bis 12.11."]);
  assert.ok(!P.isEmpty(p));
  assert.ok(P.isEmpty(P.localSummary([], [], "de")));
});

test("KI-Antwort: wird geprueft und gekuerzt, Unsinn faellt auf lokal zurueck, Kontingent und Last ehrlich", () => {
  const good = P.aiVerdict(200, { options: [{ title: "Sommerfest <b>", participants: ["Anna", 3], topics: ["Fest"], decisions: [], tasks: [{ who: "Ben", what: "Einladung", due: "Fr" }, { who: "x" }, "y"], extra: 1 }] });
  assert.equal(good.how, "result");
  assert.equal(good.protocol.title, "Sommerfest b");
  assert.deepEqual(good.protocol.participants, ["Anna"]);
  assert.deepEqual(good.protocol.tasks, [{ who: "Ben", what: "Einladung", due: "Fr" }]);
  assert.equal(good.protocol.source, "ai");
  assert.equal(P.aiVerdict(200, { options: [{ title: "leer" }] }).how, "local");
  assert.equal(P.aiVerdict(429, { error: "quota" }).how, "quota");
  assert.equal(P.aiVerdict(429, { error: "busy" }).how, "busy");
  assert.equal(P.aiVerdict(422, {}).how, "blocked");
  assert.equal(P.aiVerdict(503, {}).how, "local");
  assert.equal(Array.from(P.check({ topics: ["x".repeat(500)] }, "ai").topics[0]).length, 120);
});

test("An die KI geht nur geschwaerzter Text, die Namen und die Zustimmung, hoechstens MAX_TEXT Zeichen", () => {
  const i = P.aiInput([{ t: 0, x: "Mail an a@b.de" }, { t: 5, x: "ok" }], ["Anna"]);
  assert.deepEqual(Object.keys(i).sort(), ["consent", "names", "text"]);
  assert.equal(i.text, "Mail an [E-Mail]\nok"); assert.equal(i.consent, true);
  assert.equal(P.aiInput([{ t: 0, x: "a".repeat(P.MAX_TEXT + 50) }], []).text.length, P.MAX_TEXT);
});

test("Export: Text mit allen Abschnitten, Mitschrift nur auf Wunsch, Kurzfassung passt in den Link", () => {
  const rec = { id: "p1", at: Date.UTC(2026, 10, 3, 9, 30), sec: 754, segs: [{ t: 3, x: "Hallo" }],
    protocol: P.check({ title: "Jour fixe", participants: ["Anna"], topics: ["Budget"], decisions: ["Freigabe"], tasks: [{ who: "", what: "Angebot holen", due: "bis Freitag" }] }, "ai") };
  const t = P.toText(rec, "de", false);
  assert.match(t, /^# Jour fixe – 2026-11-03 09:30\nDauer: 12:34\n/);
  assert.match(t, /## Aufgaben\n- \[ \] offen: Angebot holen \(bis Freitag\)/);
  assert.match(t, /eigener Server, ohne Speicherung/);
  assert.doesNotMatch(t, /Mitschrift/);
  assert.match(P.toText(rec, "de", true), /## Mitschrift\n\[00:03\] Hallo/);
  assert.match(P.toText(rec, "en", false), /## Action items\n- \[ \] open: Angebot holen \(by Freitag\)/);
  rec.protocol.topics = Array.from({ length: 8 }, () => "y".repeat(120));
  assert.ok(Array.from(P.brief(rec, "de")).length <= 900);
});

test("Ablage: neuestes zuerst, gleiche id ersetzt, Loeschen entfernt, hoechstens 50", () => {
  let l = [];
  for (let i = 0; i < 55; i++) l = P.keep(l, { id: "p" + i });
  assert.equal(l.length, 50); assert.equal(l[0].id, "p54");
  l = P.keep(l, { id: "p40", x: 1 }); assert.equal(l[0].x, 1); assert.equal(l.filter((r) => r.id === "p40").length, 1);
  l = P.drop(l, "p40"); assert.ok(!l.some((r) => r.id === "p40"));
});

test("Arbeitsnachweis: dieselbe Regel wie der Server", async () => {
  const { webcrypto, createHash } = require("node:crypto");
  const dev = "0123456789abcdef0123456789abcdef", n = await P.solve(dev, 8, webcrypto.subtle);
  assert.equal(createHash("sha256").update(dev + ":" + n).digest()[0], 0);
});
