// Quest-Engine (E9): Siegel und Oeffnen, Filter, Alt-Orakel in beide Richtungen (alte Links oeffnen, neue Links alt lesbar).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as Q from "../src/engines/quest/quest.js";

const ALT = JSON.parse(fs.readFileSync(new URL("./fixtures/quest-alt.json", import.meta.url), "utf8"));
const DRAFT = { stops: [{ q: "Was war unser bester Tag?", a: "Ostsee" }, { q: "Welches Lied läuft dazu?", a: "Atemlos" }, { q: "Wer hat damals gewonnen?", a: "Oma" }], end: "Alle drei auf. Respekt." };

test("Siegel: jede Antwort oeffnet genau den naechsten Schritt, falsche Antwort nichts, Gross/Klein und Umlaute egal", async () => {
  const s = await Q.seal(DRAFT);
  assert.equal(s.q0, DRAFT.stops[0].q); assert.equal(s.h0, "O6"); assert.equal(s.c.length, 3);
  assert.deepEqual(await Q.open(s.c[0], " ostsee! "), { q: "Welches Lied läuft dazu?", h: "A7" });
  assert.equal(await Q.open(s.c[0], "Nordsee"), null);
  assert.equal(await Q.open(s.c[1], "Ostsee"), null, "eine Antwort oeffnet nur ihren Schritt");
  assert.deepEqual(await Q.open(s.c[2], "OMA"), { e: "Alle drei auf. Respekt." });
  assert.equal(Q.fold("Größe Ärger"), "grossearger");
});
test("Filter: keine Treffpunkte, Adressen, Kontaktwege; unvollstaendige Entwuerfe werden nicht versiegelt", async () => {
  for (const bad of ["Treffpunkt am Bahnhof?", "Komm allein vorbei", "Meine Nummer 0171 2345678", "insta @lea", "Wir treffen uns um 17:30"]) assert.equal(Q.clean(bad, 44), "", bad);
  assert.equal(Q.complete({ stops: [{ q: "Frage?", a: "x" }], end: "Ende" }), false, "Antwort mindestens 2 Zeichen");
  assert.equal(await Q.seal({ stops: [], end: "x" }), null);
  assert.equal(Q.cleanDraft({ stops: new Array(5).fill({ q: "a", a: "bb" }), end: "e" }).stops.length, Q.MAX_STOPS);
  assert.equal(await Q.open("<script>", "x"), null);
});
test("Alt-Orakel: ein mit dem Altcode versiegelter Link oeffnet mit der neuen Engine genauso; neues Siegel hat dasselbe Format", async () => {
  const J = (x) => JSON.parse(JSON.stringify(x));
  const got = [];
  for (let i = 0; i < ALT.answers.length; i++) got.push(J(await Q.open(ALT.sealed.c[Math.min(i, 2) === 3 ? 0 : i === 3 ? 0 : i], ALT.answers[i])));
  assert.deepEqual(got, ALT.opened);
  const neu = await Q.seal(ALT.draft);
  assert.equal(neu.q0, ALT.sealed.q0); assert.equal(neu.h0, ALT.sealed.h0); assert.equal(neu.c.length, ALT.sealed.c.length);
  neu.c.forEach((b, i) => assert.equal(b.length, ALT.sealed.c[i].length, "gleiche Laenge (Nonce + Chiffrat + Tag)"));
});
