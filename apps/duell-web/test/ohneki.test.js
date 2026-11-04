"use strict";
// Functions without AI (KI-Konzept, wave A): the duel's explanation, my defaults, the task list from a protocol.
const test = require("node:test");
const assert = require("node:assert/strict");
const Duel = require("../src/duel.js");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
const O = require("../src/office.js");
const P = require("../src/protokoll.js");
const T = require("../src/duel.json").texts;

const agent = (n, r, c, p) => ({ n, e: "🤖", r, c, p });
const doc = (m, seed, a, b) => Object.assign({ m, seed, set: 0, w: "", a, b }, m === "flappy" ? { g: { params: C.sanitizeState({ v: 1, seed }).params } } : {});

test("Agent-Duell: Erklaerung kommt aus dem Spielverlauf, zaehlt richtig und ist fuer gleiche Eingabe gleich", () => {
  let seen = new Set();
  for (const m of ["rps", "rap", "auction"]) for (let s = 1; s <= 60; s++) {
    const d = doc(m, s, agent("", (s * 37) % 101, (s * 53) % 101, (s * 71) % 101), agent("Bot", (s * 13) % 101, (s * 29) % 101, (s * 7) % 101)), r = Duel.play(d, "de"), x = Duel.explain(d, r);
    assert.deepEqual(x, Duel.explain(d, Duel.play(d, "de")), "deterministisch");
    seen.add(x.k);
    assert.equal(x.w, Duel.winner(r) > 0 ? "a" : Duel.winner(r) < 0 ? "b" : "");
    for (const L of ["de", "en"]) assert.ok(T[L]["why_" + x.k], x.k);
    if (x.tip) for (const L of ["de", "en"]) assert.ok(T[L]["tip_" + x.tip], x.tip);
    if (!x.w) assert.equal(x.k, "draw");
    if (x.k === "rpsCounter") {   // count it again from the rounds: the loser's last hand, answered by the one that beats it, lost
      const lo = x.w === "a" ? "b" : "a", me = (q) => (lo === "a" ? q.x : q.y), fo = (q) => (lo === "a" ? q.y : q.x), lost = (q) => (lo === "a" ? q.o < 0 : q.o > 0);
      assert.equal(x.v.n, r.rounds.filter((q, i) => i && lost(q) && fo(q) === (me(r.rounds[i - 1]) + 1) % 3).length);
    }
    if (x.k === "aucOver") assert.ok(r.rounds.some((q) => (x.w === "a" ? q.o === -1 && q.bb > q.vb : q.o === 1 && q.ba > q.va)));
  }
  for (const k of ["rpsCounter", "rpsLead", "rapCourage", "rapPatience", "aucOver", "aucLeft", "aucFew"]) assert.ok(seen.has(k), k);
  assert.equal(Duel.explain(doc("mind", 1, agent("", 50, 50, 50), agent("", 50, 50, 50)), { rounds: [], sa: 3, sb: 1 }), null, "gegen sich selbst: nichts zu erklaeren");
});
test("Agent-Duell: Flugduell nennt den Grund aus den Reglern, die Regel faellt nie ueber den Ausgang", () => {
  const shaky = doc("flappy", 7, agent("", 50, 50, 0), agent("Bot", 50, 50, 100)), r = Duel.play(shaky, "de"), x = Duel.explain(shaky, r);
  if (Duel.winner(r) < 0) { assert.equal(x.k, "flyShaky"); assert.equal(x.v.n, r.sa + 1); assert.equal(x.tip, "tipShaky"); }
  const close = doc("flappy", 7, agent("", 100, 50, 100), agent("Bot", 50, 50, 100)), r2 = Duel.play(close, "de"), x2 = Duel.explain(close, r2);
  if (Duel.winner(r2) < 0) assert.equal(x2.k, "flyClose");
  const before = JSON.stringify(Duel.play(close, "de")); Duel.explain(close, r2); assert.equal(JSON.stringify(Duel.play(close, "de")), before, "erklaeren aendert nichts am Spiel");
});

test("Profil: Vorgaben nur aus festen Listen, Essen erst ab 16, PayPal-Name erst ab 18, nichts davon im Kontext ausser Haushalt, Essen, Zeiten", () => {
  const p = (pref) => D.sanitizeProfile({ nick: "Mia", pref });
  assert.equal(p(undefined).pref, undefined); assert.deepEqual(Object.keys(p({})), ["nick", "emoji", "colors", "set"]);
  assert.deepEqual(p({ age: "u16", hh: 4, diet: "veg", no: ["so", "x", "abend"], pp: "mia" }).pref, { age: "u16", hh: 4, no: ["abend", "so"] }, "unter 16: kein Essen, kein PayPal");
  assert.deepEqual(p({ age: "u18", diet: "vegan", pp: "mia" }).pref, { age: "u18", diet: "vegan" });
  assert.deepEqual(p({ diet: "vegan", pp: "mia" }).pref, undefined, "ohne Alter: weder Essen noch PayPal");
  assert.deepEqual(p({ age: "a18", hh: 9, diet: "fisch", pp: "mia/../x", no: "so" }).pref, { age: "a18" });
  const a = p({ age: "a18", hh: 6, diet: "veg", no: ["tag", "so"], pp: "mia99" });
  assert.equal(D.prefContext(a, "de"), "Haushalt 6+ Personen; vegetarisch; keine Zeit werktags 9–17 Uhr, sonntags");
  assert.equal(D.prefContext(a, "en", ["hh", "diet"]), "household of 6+; vegetarian");
  assert.ok(!/mia|18|alter|age/i.test(D.prefContext(a, "de") + D.prefContext(a, "en")), "kein Alter, kein PayPal-Name");
  assert.ok(D.prefContext(a, "de").length <= 120, "rund 60 Token");
  assert.deepEqual(D.prefChips(a, "de").map((c) => c.l), ["Alter 18+", "6+ Pers.", "vegetarisch", "Keine Zeit werktags 9–17 Uhr", "Keine Zeit sonntags", "paypal.me/mia99"]);
  assert.deepEqual(D.dropPref(a, "no", "so"), { age: "a18", hh: 6, diet: "veg", no: ["tag"], pp: "mia99" });
  assert.deepEqual(D.dropPref(a, "age"), { hh: 6, no: ["tag", "so"] }, "Alter weg: Essen und PayPal gehen mit");
  assert.equal(D.adult(a), true); assert.equal(D.adult(p({ age: "u18" })), false); assert.equal(D.dietOk(p({ age: "u16" })), false);
  globalThis.DailyFlavor = { adult: true };
  try { assert.deepEqual(D.sanitizePref({ age: "u16", pp: "firma", diet: "veg" }), { diet: "veg", pp: "firma" }, "Business-Build: 18+ laut Bedingungen, kein Alter gefragt"); }
  finally { delete globalThis.DailyFlavor; }
});

test("Aufgaben aus dem Protokoll: Uebergabe, Namen nur wo genannt, Frist als Tag, passt in einen Link", () => {
  assert.ok(O.CARDS.includes("todo") && Tn.GAMES.todo.list === Tn.TODO);
  const r = Tn.todoFrom({ t: "Sommerfest", i: [["Getränke besorgen bis Mittwoch", "Anna", 20771], ["Raum buchen", "", 0], ["Einladung schicken", "Ben Müller-Lüdenscheid", 20775], ["Treffen am Bahnhof", "", 0], ["Getränke besorgen", "", 0], ["  ", "", 0]] });
  assert.deepEqual(r.list, [[["Anna", 0], ["Ben", 1]], [["Getränke besorgen", 0, 20771, [[0, 1]]], ["Raum buchen", 1, 0, []], ["Einladung schicken", 2, 20775, [[1, 1]]]]]);
  assert.equal(r.lost, 3, "Kontaktangabe, doppelt, leer"); assert.equal(r.t, "Sommerfest");
  assert.deepEqual(Tn.todoFrom({ i: [] }), { list: null, lost: 0, t: "" }); assert.equal(Tn.todoFrom(null).list, null);
  const many = Tn.todoFrom({ i: Array.from({ length: 20 }, (x, i) => ["Aufgabe Nummer " + i + " mit einem langen Text dazu", "", 20771 + i]) });
  assert.ok(Tn.shopOk(many.list, Tn.TODO)); assert.equal(many.list[1].length + many.lost, 20); assert.ok(many.lost > 0);
  // the list travels like any turn and opens again
  const d = { k: "turn", col: ["#ffd400", "#ff3b1d"], by: [], g: "todo", seed: 5, q: Tn.seal([[r.list]], 5), f: "bolt", t: "Sommerfest" };
  const back = D.parseRoute("#" + D.docUrl(d).split("#")[1]).doc; assert.deepEqual(Tn.moves(back)[0][0], r.list);
  assert.equal(Tn.face(back, "de")[0], "3 Aufgaben · 0 erledigt · 2 übernommen");
  // replies merge like the shopping list: Ben ticks his task off, Cem takes the room, both come back in any order
  const ben = Tn.shopApply(r.list, { name: "Ben", face: 1, adds: [], marks: { [Tn.shopKey("Einladung schicken")]: 2 } }, Tn.TODO);
  const cem = Tn.shopApply(r.list, { name: "Cem", face: 2, adds: [{ text: "Musik", qty: 0 }], marks: { [Tn.shopKey("Raum buchen")]: 1 } }, Tn.TODO);
  const m1 = Tn.shopMerge(Tn.shopMerge(r.list, ben, Tn.TODO), cem, Tn.TODO), m2 = Tn.shopMerge(Tn.shopMerge(r.list, cem, Tn.TODO), ben, Tn.TODO);
  assert.deepEqual(m1, m2);
  assert.deepEqual(Tn.shopRows(m1, Tn.TODO).map((x) => [x.label, x.due, x.bring.map((p) => p[0]).join(), x.bought.map((p) => p[0]).join()]),
    [["Getränke besorgen", 20771, "Anna", ""], ["Raum buchen", 0, "Cem", ""], ["Einladung schicken", 20775, "", "Ben"], ["Musik", 0, "", ""]]);
  assert.equal(Tn.okAnswer(Tn.GAMES.todo.turns[1][0], m1, back, "de", [], []), true);
  assert.equal(Tn.okAnswer(Tn.GAMES.einkauf.turns[1][0], m1, back, "de", [], []), false, "eine Frist ist keine Menge");
});
test("Aufgaben: .ics nur fuer offene Aufgaben mit Frist, Folgetermin aus offenen Punkten", () => {
  const r = Tn.todoFrom({ t: "Sommerfest", i: [["Getränke besorgen", "Anna", 20771], ["Raum buchen", "", 0], ["Einladung schicken", "Ben", 20775]] });
  const done = Tn.shopApply(r.list, { name: "Ben", face: 1, adds: [], marks: { [Tn.shopKey("Einladung schicken")]: 2 } }, Tn.TODO);
  const ics = Tn.todoIcs(done, "Sommerfest; Team", "de", Date.UTC(2026, 10, 4, 12));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, "erledigt und ohne Frist: kein Termin");
  assert.match(ics, /DTSTART;VALUE=DATE:20261114\r\nDTEND;VALUE=DATE:20261115\r\nSUMMARY:Getränke besorgen \(Anna\)\r\nDESCRIPTION:Sommerfest\\; Team/);
  assert.match(ics, /DTSTAMP:20261104T120000Z/);
  assert.equal(Tn.todoIcs(Tn.todoFrom({ i: [["Raum buchen", "", 0]] }).list, "", "de"), "");
  assert.equal(Tn.todoAgenda(done, "Sommerfest", "de"), "Folgetermin: Sommerfest\n1. Rückblick: 1 von 3 erledigt\n2. Getränke besorgen (Anna, bis Sa 14.11.)\n3. Raum buchen (offen)\n4. Neue Punkte");
  assert.equal(Tn.todoAgenda(done, "", "en").split("\n")[0], "Next meeting: Tasks");
});
test("Protokoll -> Aufgaben-Link: Frist aus dem Gesagten, Name nur bei ausdruecklicher Nennung, sonst offen", () => {
  const at = new Date(2026, 10, 4, 10).getTime(), day = (s, l) => P.dueDay(s, at, l || "de"), iso = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
  assert.deepEqual(["bis Freitag", "Mittwoch", "bis 14.11.", "14.11.2026", "3.1.", "morgen", "übermorgen", "nächste Woche", "Ende der Woche", "Monatsende"].map((s) => iso(day(s))),
    ["2026-11-06", "2026-11-11", "2026-11-14", "2026-11-14", "2027-01-03", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-06", "2026-11-30"]);
  assert.deepEqual(["by Friday", "by 11/14", "tomorrow", "end of month"].map((s) => iso(day(s, "en"))), ["2026-11-06", "2026-11-14", "2026-11-05", "2026-11-30"]);
  for (const s of ["bis 31.2.", "irgendwann", "", null, "13.13."]) assert.equal(day(s), 0, String(s));
  assert.equal(P.said("Anna", "Anna übernimmt die Getränke."), true); assert.equal(P.said("Anna", "Annabell macht das"), false);
  assert.equal(P.said("ben", "Das schickt Ben."), true); assert.equal(P.said("A.B", "AxB"), false); assert.equal(P.said("", "x"), false);
  const rec = { at, segs: [{ t: 0, x: "Anna übernimmt die Getränke bis Freitag." }, { t: 5, x: "Wer bucht den Raum? Das klären wir." }],
    protocol: P.check({ title: "Sommerfest", tasks: [{ who: "Anna", what: "Getränke besorgen", due: "bis Freitag" }, { who: "Ben", what: "Raum buchen", due: "Mittwoch" }] }, "ai") };
  const pay = P.todoPayload(rec, "de");
  assert.deepEqual(pay, { t: "Sommerfest", i: [["Getränke besorgen", "Anna", day("Freitag")], ["Raum buchen", "", day("Mittwoch")]] }, "Ben fiel im Meeting nie: offen");
  const link = P.todoLink(rec, "de"); assert.match(link, /^\/duell#todo=[A-Za-z0-9_-]+$/);
  const got = JSON.parse(Buffer.from(link.split("=")[1], "base64url").toString("utf8")); assert.deepEqual(got, pay);
  assert.deepEqual(Tn.todoFrom(got).list[0], [["Anna", 0]]);
});
