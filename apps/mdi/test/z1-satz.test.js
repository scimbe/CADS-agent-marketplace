// Portiert aus dem Altbaum (Tag pre-legacy-removal, test/satz.test.js), Erwartungen unveraendert. Satz zu Formular:
// die KI liefert Regeln und Schluessel (Wrapper-Arten plan/liste), das Geraet rechnet Termine, Mengen, Fristen.
// Tn ist ein schmaler Ersatz fuer das alte turns.js aus der neuen Zug-Engine. Einzige Auslassung: die Aufgabenliste
// (Tn.todoFrom, office.js) gehoert zum Business-Flavor (12-paritaet §1d), nicht zu Z1: dort pruefen wir S.tasks direkt.
// Einzige Anpassung: ics() bekommt den Zeitstempel immer vom Aufrufer (Harness: keine Uhr in der Engine).
import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../src/engines/zug/satz.js";
import { GAMES, HOURS, slotText, dayText } from "../src/engines/zug/spiele.js";
import { shopApply, shopOk, shopRows } from "../src/engines/zug/merge.js";
const Tn = { HOURS, slotText, dayText, GAMES, shopApply, shopOk, shopRows };
const day = (y, m, d) => S.dayOf(y, m, d);
const txt = (s) => Tn.slotText(s, "de");
const THU = day(2026, 11, 5);       // a Thursday
const rule = (o) => Object.assign({ wochentage: [], tageszeiten: [], uhrzeit: "", dauer_min: 0, zeitraum: "offen", ort: "offen", mitbringen: [] }, o);

test("Raster wie turns.js termin: dieselben Stunden, jeder Slot besteht dessen Pruefung", () => {
  assert.deepEqual(S.HOURS, Tn.HOURS);
  const r = S.slots(rule({ wochentage: ["di", "do"], tageszeiten: ["abends"] }), { today: THU, nowHour: 12 });
  assert.deepEqual(r.slots.map(txt), ["Di 10.11., 18 Uhr", "Do 12.11., 18 Uhr", "Di 17.11., 18 Uhr", "Do 19.11., 18 Uhr"]);
  assert.ok(Tn.GAMES.termin.turns[0][0].ok(["Mia", r.slots]));
});

test("Feiertage: Ostern nach Gauss/Meeus, alle neun bundesweiten Feiertage, Slots lassen sie aus und nennen sie", () => {
  assert.equal(S.easter(2026), day(2026, 4, 5)); assert.equal(S.easter(2027), day(2027, 3, 28)); assert.equal(S.easter(2025), day(2025, 4, 20));
  assert.equal(Object.keys(S.holidays(2026)).length, 9);
  assert.equal(S.holiday(day(2026, 5, 14)), "Christi Himmelfahrt"); assert.equal(S.holiday(day(2026, 5, 25)), "Pfingstmontag"); assert.equal(S.holiday(day(2026, 10, 3), "en"), "German Unity Day");
  assert.equal(S.holiday(day(2026, 12, 24)), "");
  // Thursday 24.9.: "naechste Woche" holds Saturday 3.10.
  const r = S.slots(rule({ wochentage: ["sa"], zeitraum: "naechste_woche" }), { today: day(2026, 9, 24) });
  assert.deepEqual(r.slots, []); assert.deepEqual(r.skipped, [day(2026, 10, 3)]);
  const x = S.slots(rule({ zeitraum: "naechste_woche", wochentage: ["mo", "di", "mi", "do", "fr"] }), { today: day(2026, 5, 7) });   // week of Ascension
  assert.ok(!x.slots.some((s) => Math.floor(s / 10) === day(2026, 5, 14))); assert.deepEqual(x.skipped, [day(2026, 5, 14)]);
});

test("Zeitraeume relativ zu heute; unklares 'naechstes Wochenende' bietet beide Wochenenden an", () => {
  const sat = (d) => Tn.dayText(d, "de");
  assert.deepEqual(S.period("dieses_wochenende", THU).map(sat), ["Sa 7.11.", "So 8.11."]);
  assert.deepEqual(S.period("naechstes_wochenende", THU).map(sat), ["Sa 7.11.", "So 8.11.", "Sa 14.11.", "So 15.11."]);
  assert.deepEqual(S.period("naechstes_wochenende", day(2026, 11, 7)).map(sat), ["Sa 14.11.", "So 15.11."]);
  assert.equal(S.period("naechste_woche", THU)[0], day(2026, 11, 9));
  assert.deepEqual(S.period("zwischen_den_jahren", THU), [day(2026, 12, 27), day(2026, 12, 28), day(2026, 12, 29), day(2026, 12, 30)]);
  assert.equal(S.period("vor_weihnachten", THU).slice(-1)[0], day(2026, 12, 23));
  assert.deepEqual([S.period("naechsten_monat", THU)[0], S.period("naechsten_monat", THU).slice(-1)[0]], [day(2026, 12, 1), day(2026, 12, 31)]);
  assert.deepEqual(S.period("morgen", THU), [THU + 1]);
});

test("Uhrzeit aufs Raster, ehrlich gemeldet; Vorgaben (keine Zeit) und Vergangenes fallen weg; hoechstens 5, gleichmaessig verteilt", () => {
  const r = S.slots(rule({ uhrzeit: "09:00", zeitraum: "morgen" }), { today: THU });
  assert.deepEqual(r.slots.map(txt), ["Fr 6.11., 10 Uhr"]); assert.equal(r.rounded, "09:00");
  assert.equal(S.slots(rule({ uhrzeit: "18:00", zeitraum: "morgen" }), { today: THU }).rounded, "");
  assert.deepEqual(S.slots(rule({ zeitraum: "heute", tageszeiten: ["mittags", "abends"] }), { today: THU, nowHour: 14 }).slots.map(txt), ["Do 5.11., 18 Uhr"]);
  const no = S.slots(rule({ wochentage: ["sa", "so"], zeitraum: "dieses_wochenende" }), { today: THU, no: ["sa", "so"] });
  assert.deepEqual(no.slots, []); assert.equal(no.none, true);
  assert.deepEqual(S.slots(rule({ tageszeiten: ["nachmittags"], zeitraum: "diese_woche" }), { today: THU, no: ["tag"] }).slots.map(txt), ["Sa 7.11., 15 Uhr", "So 8.11., 15 Uhr"]);
  const many = S.slots(rule({ wochentage: ["fr", "sa"], tageszeiten: ["abends"], zeitraum: "naechsten_monat" }), { today: THU });
  assert.equal(many.slots.length, 5); assert.equal(Math.floor(many.slots[0] / 10), day(2026, 12, 4)); assert.ok(many.slots.every((s, i) => !i || s > many.slots[i - 1]));
});

test(".ics: lokale Zeit ohne Zone, Dauer, ganztags, Zeilen hoechstens 75 Oktette, keine Namen", () => {
  const s = day(2026, 11, 7) * 10 + 6, t = S.ics(s, "Grillabend, bei mir", 120, Date.UTC(2026, 10, 5, 12));
  assert.match(t, /DTSTART:20261107T180000\r\nDTEND:20261107T200000\r\n/); assert.match(t, /SUMMARY:Grillabend\\, bei mir\r\n/); assert.ok(t.endsWith("END:VCALENDAR\r\n"));
  assert.match(S.ics(day(2026, 11, 7) * 10 + 8, "Lang", 360, Date.UTC(2026, 10, 5, 12)), /DTEND:20261108T020000/);
  assert.match(S.ics(s, "Tag", 1440, Date.UTC(2026, 10, 5, 12)), /DTSTART;VALUE=DATE:20261107\r\nDTEND;VALUE=DATE:20261108/);
  assert.ok(S.ics(s, "Ä".repeat(80), 60, Date.UTC(2026, 10, 5, 12)).split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
});

test("Ohne KI: lokale Regeln lesen Tage, Tageszeit, Uhrzeit, Zeitraum, Dauer, Ort, Mitbringen (de/en); nichts erkannt -> null", () => {
  const a = S.localPlan("Grillparty bei mir nächsten Samstag ab 17 Uhr, bringt Salat mit");
  assert.deepEqual([a.titel, a.wochentage, a.uhrzeit, a.zeitraum, a.ort, a.mitbringen], ["Grillparty", ["sa"], "17:00", "naechstes_wochenende", "zuhause", ["salat"]]);
  const b = S.localPlan("Elternabend nächste Woche, irgendwann nachmittags, eine Stunde");
  assert.deepEqual([b.tageszeiten, b.zeitraum, b.dauer_min], [["nachmittags"], "naechste_woche", 60]);
  assert.deepEqual(S.localPlan("Laufen im Park am Samstagmorgen").tageszeiten, ["morgens"]);
  assert.equal(S.localPlan("Zahnarzt morgen um 9 Uhr").zeitraum, "morgen");
  assert.deepEqual(S.localPlan("Lerngruppe am Wochenende vormittags, zwei Stunden").wochentage, ["sa", "so"]);
  const e = S.localPlan("Team call at 3 pm next week");
  assert.deepEqual([e.uhrzeit, e.zeitraum, e.ort], ["15:00", "naechste_woche", "online"]);
  assert.equal(S.localPlan("Hallo zusammen"), null);
  assert.equal(S.planArt("Grillen bei mir am Samstag"), "einladung"); assert.equal(S.planArt("Teammeeting mittwochs"), "termin"); assert.equal(S.planArt("Grillen bei mir", true), "termin");
  assert.equal(S.listArt("Grillen, jeder bringt was mit"), "mitbring"); assert.equal(S.listArt("Pfannkuchen für 4"), "einkauf"); assert.equal(S.listArt("Pfannkuchen", true), "mitbring");
});

test("Namen bleiben lokal: eine Namensliste geht als [Name] raus; Nomen-Listen bleiben stehen", () => {
  const n = S.names("Wichteln mit Anna, Ben, Carla und Dana, 15 Euro");
  assert.deepEqual(n.names, ["Anna", "Ben", "Carla", "Dana"]); assert.equal(n.satz, "Wichteln mit [Name], [Name], [Name], [Name], 15 Euro");
  assert.ok(!/Anna|Ben|Carla|Dana/.test(n.satz));
  assert.deepEqual(S.names("Salat, Brot und Kuchen mitbringen").names, []);
  assert.deepEqual(S.names("Wichteln mit Freunden, Familie und Kollegen").names, []);
  assert.deepEqual(S.names("Wichteln mit Anna und Ben").names, [], "erst ab drei Namen eine Liste");
});

// The live answer of 5.11.2026 for "Grillabend für 8, 2 vegetarisch" (kind liste, art einkauf), unchanged.
const GRILL = { titel: "Grillabend", personen: 8, vegetarisch: 2, posten: [
  { n: "Bratwurst", kat: "fleisch_fisch", m: "pro_person", e: "stueck", veg: false }, { n: "Gemuese", kat: "obst_gemuese", m: "nach_bedarf", e: "kg", veg: true },
  { n: "Brötchen", kat: "backwaren", m: "pro_person", e: "stueck", veg: true }, { n: "Grillsoße", kat: "gewuerze_saucen", m: "fix", e: "flasche", veg: true },
  { n: "Holzkohle", kat: "sonstiges", m: "fix", e: "packung", veg: true }, { n: "Getränke", kat: "getraenke", m: "pro_person", e: "l", veg: true }] };

test("Mengen: Regeltabelle aus pro_person/fix/nach_bedarf; Fleisch fuer die Nicht-Vegetarier, Gramm/Liter im Text, Stueck als Anzahl", () => {
  const l = S.shopList(GRILL, 8, 2, "de");
  assert.deepEqual(l.map((a) => [a.text, a.qty]), [["Bratwurst", 12], ["Gemuese", 1], ["Brötchen", 16], ["Grillsoße", 1], ["Holzkohle", 1], ["Getränke 8 l", 1]]);
  assert.deepEqual(S.shopList(GRILL, 8, 0, "de")[0].qty, 16);
  assert.ok(!S.shopList(GRILL, 4, 0, "de", true).some((a) => a.n === "Bratwurst"), "Profil vegetarisch: kein Fleisch");
  assert.equal(S.amount({ n: "Mehl", kat: "trockenwaren", m: "pro_person", e: "g" }, 4, "de").text, "Mehl 400 g");
  assert.equal(S.amount({ n: "Hackfleisch", kat: "fleisch_fisch", m: "pro_person", e: "g" }, 6, "de").text, "Hackfleisch 1,5 kg");
  assert.equal(S.amount({ n: "Hackfleisch", kat: "fleisch_fisch", m: "pro_person", e: "g" }, 6, "en").text, "Hackfleisch 1.5 kg");
  assert.equal(S.amount({ n: "Tofu", kat: "vegetarisch", m: "pro_person", e: "packung" }, 5, "de").qty, 2);
  assert.equal(S.amount({ n: "Kartoffelsalat mit Gurke und Ei", kat: "vegetarisch", m: "pro_person", e: "g" }, 8, "de").text.length <= 24, true);
  // every computed row is a valid shopping item and goes through the existing merge (shopApply)
  const e = { name: "Mia", face: 0, adds: l.map((a) => ({ text: a.text, qty: a.qty })), marks: {} }, v = Tn.shopApply(null, e);
  assert.ok(Tn.shopOk(v)); assert.equal(v[1].length, 6); assert.deepEqual(Tn.shopRows(v).map((r) => r.label).slice(0, 1), ["12× Bratwurst"]);
});

test("Fristen: relativ zum Event, nie vor heute; Event-Tag aus dem Satz; Aufgabenliste wird ein gueltiger todo-Link", () => {
  const ev = day(2026, 12, 12);
  assert.equal(S.due("2_wochen_vorher", ev, THU), day(2026, 11, 28)); assert.equal(S.due("am_tag", ev, THU), ev); assert.equal(S.due("danach", ev, THU), ev + 1);
  assert.equal(S.due("sofort", ev, THU), THU); assert.equal(S.due("offen", ev, THU), 0); assert.equal(S.due("2_wochen_vorher", THU + 3, THU), THU);
  assert.equal(S.eventDay("Sommerfest am 14.12.", THU), day(2026, 12, 14)); assert.equal(S.eventDay("Feier am 3.1.", THU), day(2027, 1, 3));
  assert.equal(S.eventDay("Flohmarktstand am Samstag", THU), day(2026, 11, 7)); assert.equal(S.eventDay("Umzug in 3 Wochen", THU), THU + 21); assert.equal(S.eventDay("Umzug", THU), 0);
  const o = { aufgaben: [{ was: "Einladungen verschicken", frist: "2_wochen_vorher" }, { was: "Kuchen backen", frist: "1_tag_vorher" }, { was: "Fotos teilen", frist: "danach" }, { was: "Ideen sammeln", frist: "offen" }] };
  // Alt: Tn.todoFrom (office.js, Business) machte daraus den todo-Link; die Fristen selbst kommen aus S.tasks:
  assert.deepEqual(S.tasks(o, ev, THU).map((x) => [x[0], x[2]]), [["Einladungen verschicken", day(2026, 11, 28)], ["Kuchen backen", ev - 1], ["Fotos teilen", ev + 1], ["Ideen sammeln", 0]]);
});

test("Review B2 #1: ein genanntes Datum ('am 12.11.') ist der einzige Tag der Abstimmung, auch ohne KI", () => {
  const d = S.namedDay("Treffen am 12.11. um 19 Uhr", THU);
  assert.equal(d, day(2026, 11, 12));
  assert.deepEqual(S.slots(rule({ uhrzeit: "19:00" }), { today: THU, day: d }).slots.map(txt), ["Do 12.11., 19 Uhr"]);
  assert.deepEqual(S.slots(rule({ wochentage: ["fr"], tageszeiten: ["abends"] }), { today: THU, day: d }).slots.map(txt), ["Do 12.11., 18 Uhr"], "der Tag zaehlt vor dem Wochentag");
  assert.deepEqual(S.slots(rule({ uhrzeit: "18:00" }), { today: THU, day: day(2026, 12, 25) }).slots.map(txt), ["Fr 25.12., 18 Uhr"], "ausdruecklich genannter Feiertag bleibt");
  const l = S.localPlan("Termin am 12.11.");
  assert.ok(l, "ein Datum allein reicht der lokalen Lesart");
  assert.equal(S.namedDay("Treffen naechsten Samstag", THU), 0);
});

test("Review B2 #2: Gruppenwort in der Namensliste: die Namen gehen trotzdem als [Name] raus; Akzente gehoeren zum Namen", () => {
  const n = S.names("Wichteln mit Jorinde, Kasimir, Wendelin und Familie, 10 Euro");
  assert.deepEqual(n.names, ["Jorinde", "Kasimir", "Wendelin"]);
  assert.equal(n.satz, "Wichteln mit [Name], [Name], [Name], Familie, 10 Euro");
  assert.ok(!/Jorinde|Kasimir|Wendelin/.test(n.satz));
  const z = S.names("Wichteln mit Zoë, Chloé und Émile");
  assert.deepEqual(z.names, ["Zoë", "Chloé", "Émile"]); assert.equal(z.satz, "Wichteln mit [Name], [Name], [Name]");
  assert.deepEqual(S.names("Wichteln mit Freunden, Familie und Kollegen"), { names: [], satz: "Wichteln mit Freunden, Familie und Kollegen" });
});

test("Review B2 gering: 'um 9' ohne 'Uhr', 12am ist Mitternacht, die Uhrzeit steht nicht im Titel", () => {
  assert.equal(S.localPlan("Treffen morgen um 9").uhrzeit, "09:00");
  assert.equal(S.localPlan("Party 12am tomorrow").uhrzeit, "00:00"); assert.equal(S.localPlan("Lunch 12pm tomorrow").uhrzeit, "12:00");
  const k = S.localPlan("Kaffee 7pm next week");
  assert.deepEqual([k.uhrzeit, k.titel], ["19:00", "Kaffee"]);
  assert.equal(S.localPlan("Zahnarzt morgen um 9 Uhr").uhrzeit, "09:00");
});

test("Review B2 gering: ungueltige Daten und Uhrzeiten werden kein Event-Tag", () => {
  assert.equal(S.eventDay("Feier am 31.2.", THU), 0);
  assert.equal(S.eventDay("Sitzung um 10.11 Uhr", THU), 0);
  assert.equal(S.eventDay("Feier am 30.4.", THU), day(2027, 4, 30));
  assert.equal(S.eventDay("Feier am 29.2.28", THU), day(2028, 2, 29));
});

test("Review B2 gering: 'morgens und abends' bleiben am selben Tag zusammen", () => {
  const r = S.slots(rule({ tageszeiten: ["morgens", "abends"], zeitraum: "naechste_woche" }), { today: THU });
  const by = {}; r.slots.forEach((s) => { const d = Math.floor(s / 10); (by[d] = by[d] || []).push(s % 10); });
  assert.ok(r.slots.length <= 5 && r.slots.length >= 4);
  assert.ok(Object.values(by).every((h) => h.length === 2), JSON.stringify(r.slots.map(txt)));
});
