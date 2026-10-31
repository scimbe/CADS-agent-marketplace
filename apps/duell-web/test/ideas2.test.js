"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const Duel = require("../src/duel.js");
const Q = require("../src/quest.js");
const me = D.sanitizeProfile({ nick: "Mira", emoji: "🐙", colors: ["#2b4bff", "#ffe600"], set: "essen" });
const UNSAFE = /alkohol|bier\b|schnaps|wodka|zigarett|rauch|droge|kiffen|nackt|kuss|küss|sex|waffe|messer|klau|stehl|prügel|dach|gleis|autobahn|fremde|hässlich|fett\b|beer\b|cigarette|smok|drug|naked|kiss|steal|weapon|knife|ugly|\broof|stranger|mutprobe|\bdare\b/i;
const CAPS = [{ crypto: true }, { crypto: false }, { crypto: true, channel: true }, { crypto: true, call: true }, { crypto: false, call: true }, { crypto: true, channel: true, call: true }];
const NEW = D.IDEAS.filter((i) => i.kind === "duel" || i.kind === "quest").concat(D.GATED);
const docOf = (id, patch) => Object.assign(D.docFromIdea(D.byId(id), me, "de"), patch);
const agent = (r, c, p) => ({ n: "X", e: "🤖", r, c, p });
const wins = (mk, n = 200) => { let w = 0; for (let i = 0; i < n; i++) { const r = Duel.winner(Duel.play(D.sanitizeDoc(mk(i)), "de")); if (r > 0) w++; } return w / n; };

test("Umfang: mindestens 25 neue Ideen, genau 2 neue Mechaniken, DE und EN, Bedarf nur aus bekannten Faehigkeiten", () => {
  assert.ok(NEW.length >= 25, String(NEW.length));
  assert.deepEqual([...new Set(NEW.map((i) => i.kind))].sort(), ["duel", "quest"]);
  assert.equal(new Set(D.IDEAS.concat(D.GATED).map((i) => i.id)).size, D.IDEAS.length + D.GATED.length);
  for (const i of NEW) {
    assert.ok(i.de.t && i.en.t && i.de.s && i.en.s, i.id);
    for (const n of i.needs || []) assert.ok(["crypto", "channel", "call"].includes(n), i.id);
    const d = D.docFromIdea(i, me, "de"); assert.ok(d, i.id); assert.equal(d.k, i.kind);
  }
  for (const i of D.GATED) assert.ok(i.needs.length, i.id + " braucht needs");
  for (const i of D.IDEAS.filter((x) => x.kind === "quest")) assert.deepEqual(i.needs, ["crypto"], i.id);
});
test("Jeder Tag des Jahres zeigt etwas Lauffaehiges, in jeder Geraeteklasse, auch im Archiv", () => {
  const start = Date.UTC(2026, 10, 1);
  for (const c of CAPS) for (let n = 0; n < 366 * 3; n++) {
    const day = new Date(start + n * 86400000), idea = D.ideaForDay(day, c);
    assert.ok(idea, "kein Inhalt am " + day.toISOString());
    assert.ok(D.available(idea, c), idea.id + " am " + day.toISOString() + " mit " + JSON.stringify(c));
    assert.ok(D.docFromIdea(idea, me, "de"), idea.id);
    if (idea.kind === "duel" && idea.duel.mode !== "deck") assert.equal(typeof Duel.play(D.docFromIdea(idea, me, "de"), "de").sa, "number");
  }
});
test("Reine Webversion: nie ein Anruf, weder heute noch im Stapel; ohne Web Crypto nie ein Geheimkanal", () => {
  const start = Date.UTC(2026, 10, 1);
  const web = { crypto: true };
  for (let n = 0; n < 800; n++) assert.notEqual(D.ideaForDay(new Date(start + n * 86400000), web).duel && D.ideaForDay(new Date(start + n * 86400000), web).duel.mode, "deck");
  for (let n = 0; n < 800; n++) assert.notEqual(D.ideaForDay(new Date(start + n * 86400000), { crypto: false }).kind, "quest");
  for (let i = 0; i < 400; i++) assert.ok(!(D.randomIdea(Math.random, "").needs || []).includes("call"));
});
test("Faehigkeiten: unbekannte Kanal-Idee bleibt verborgen, bis sie wirklich da ist; Flag wird zur Laufzeit gelesen", () => {
  const fake = { id: "x", needs: ["channel"] };
  assert.equal(D.available(fake, { crypto: true }), false); assert.equal(D.available(fake, { crypto: true, channel: true }), true);
  assert.equal(D.caps().channel, false);
  globalThis.DailyCaps = { channel: true, call: true };
  assert.deepEqual([D.caps().channel, D.caps().call], [true, true]);
  globalThis.DailyCaps = { channel: "yes", call: 1 };
  assert.deepEqual([D.caps().channel, D.caps().call], [false, false], "nur echtes true zaehlt");
  delete globalThis.DailyCaps;
});
test("Mit Anruf kommen Anruf-Ideen dazu, die Webversion behaelt ihren Tag", () => {
  const start = Date.UTC(2026, 10, 1); let seen = 0, kept = 0;
  for (let n = 0; n < 366; n++) {
    const d = new Date(start + n * 86400000), w = D.ideaForDay(d, { crypto: true }), c = D.ideaForDay(d, { crypto: true, call: true });
    if (c.needs && c.needs.includes("call")) seen++; else { assert.equal(c.id, w.id); kept++; }
  }
  assert.ok(seen > 20 && kept > 250, seen + "/" + kept);
});
test("Links zu Ideen, die das Geraet nicht kann, gelten als nicht verfuegbar", () => {
  const d = D.sanitizeDoc(D.docFromIdea(D.byId("anruf-quiz"), me, "de"));
  assert.equal(D.docAvailable(d, { crypto: true }), false); assert.equal(D.docAvailable(d, { crypto: true, call: true }), true);
  const hand = D.sanitizeDoc({ k: "duel", m: "deck" }); assert.equal(D.docAvailable(hand, { crypto: true }), false, "auch ohne Idee-Id");
  const q = D.sanitizeDoc(D.docFromIdea(D.byId("kanal-geheim"), me, "de"));
  assert.equal(D.docAvailable(q, { crypto: false }), false); assert.equal(D.docAvailable(q, { crypto: true }), true);
});
test("Inhalt: Wortfilter und Sicherheitsliste ueber Ideen, Duelldaten und Texte, keine Einladung an Fremde, keine Standortdaten", () => {
  for (const i of NEW) for (const s of D.ideaStrings(i)) { assert.ok(C.isClean(s), i.id + ": " + s); assert.ok(!UNSAFE.test(s), i.id + ": " + s); assert.ok(!/standort|gps|location|öffentlich|public/i.test(s), i.id + ": " + s); }
  for (const s of Duel.strings()) { assert.ok(C.isClean(s), s); if (!/Treffpunkte|meeting places/.test(s)) assert.ok(!UNSAFE.test(s), s); }
  for (const i of NEW.filter((x) => x.kind === "quest")) for (const l of ["de", "en"]) for (const s of i[l].riddles.concat(i[l].end)) assert.equal(Q.clean(s, Q.MAX_Q), s, "Rätselvorlage muss den Quest-Filter passieren: " + s);
  assert.deepEqual(Object.keys(Duel.DATA.texts.de).sort(), Object.keys(Duel.DATA.texts.en).sort());
});
test("Duell: gleich auf beiden Handys, Seiten getauscht ist das Spiegelbild", () => {
  for (const id of ["duell-ssp", "rap-agenten", "auktion-quatsch", "flug-agent"]) {
    const d = D.sanitizeDoc(docOf(id, { a: agent(70, 20, 40), b: agent(10, 80, 60) }));
    const r = Duel.play(d, "de"), m = Duel.play(D.sanitizeDoc({ ...d, a: d.b, b: d.a }), "de");
    assert.deepEqual([r.sa, r.sb], [m.sb, m.sa], id);
    assert.deepEqual(Duel.play(d, "de"), r, id);
  }
});
test("Duell: Regler wirken wirklich", () => {
  const seed = (i) => ({ seed: i + 1 });
  const counter = wins((i) => docOf("duell-ssp", { ...seed(i), a: agent(50, 0, 100), b: agent(100, 0, 0) }));
  assert.ok(counter > 0.75, "Geduld kontert Dauer-Stein: " + counter);
  const over = wins((i) => docOf("auktion-quatsch", { ...seed(i), a: agent(45, 0, 0), b: agent(100, 0, 0) }));
  assert.ok(over > 0.7, "Wer ueberbietet, zahlt drauf: " + over);
  const shy = wins((i) => docOf("auktion-quatsch", { ...seed(i), a: agent(45, 0, 0), b: agent(0, 0, 0) }));
  assert.ok(shy > 0.1 && shy < 0.9, "Vorsicht entscheidet nicht allein: " + shy);
  const rap = wins((i) => docOf("rap-agenten", { ...seed(i), a: agent(100, 50, 50), b: agent(0, 50, 50) }));
  assert.ok(rap > 0.7, "Risiko bringt Punkte: " + rap);
});
test("Rap und Auktion nehmen das eigene Wort auf", () => {
  const r = Duel.play(D.sanitizeDoc(docOf("rap-agenten", { w: "Quokka" })), "de");
  assert.ok(JSON.stringify(r.rounds).includes("Quokka"));
  const a = Duel.play(D.sanitizeDoc(docOf("auktion-quatsch", { w: "Quokka" })), "de");
  assert.equal(a.rounds[0].item, "Quokka");
  for (const x of a.rounds) { assert.ok(x.la >= 0 && x.lb >= 0, "Budget nie negativ"); assert.ok(x.ba >= 0 && x.bb >= 0); }
  assert.equal(new Set(a.rounds.map((x) => x.item)).size, a.rounds.length);
});
test("Flug: echte Simulation, ruhige Mitte schlaegt Tiefflug, Gelerntes kommt aus den Eingaben", () => {
  const d = D.sanitizeDoc(docOf("flug-agent"));
  assert.ok(Duel.fly(d, agent(50, 0, 100)) > Duel.fly(d, agent(100, 0, 0)));
  assert.equal(Duel.learnFlap([1, 2]), null);
  const low = Duel.learnFlap([27, 27, 27, 27]), wild = Duel.learnFlap([-40, 40, -40, 40]);
  assert.equal(low.r, 80); assert.equal(low.p, 100); assert.equal(wild.r, 50); assert.equal(wild.p, 20);
});
test("Agent liest dich: wer stur spielt, verliert gegen ihn", () => {
  const h = []; let w = 0, n = 0;
  for (let i = 0; i < 40; i++) { const seq = [0, 1, 2][i % 3], y = Duel.mindHand(h, 100, 0); if (i > 10) { n++; if (Duel.outcome(y, seq) > 0) w++; } h.push(seq); }
  assert.ok(w / n > 0.8, String(w / n));
});
test("Duell-Link: traegt nur Regler, Eingaben sind gefiltert, Fremdes faellt raus", () => {
  const evil = { k: "duel", m: "boese", a: { n: "<b>x", e: "<svg>", r: 999, c: -5, p: "x" }, b: null, w: "fuck", seed: -3, set: 99, ch: 7, evil: 1, photo: "data:" };
  const d = D.sanitizeDoc(evil), s = JSON.stringify(d);
  assert.equal(d.m, "rps"); assert.equal(d.a.r, 100); assert.equal(d.a.c, 0); assert.equal(d.w, ""); assert.equal(d.ch, 0); assert.equal(d.evil, undefined);
  assert.ok(!/[<>]|data:/.test(s), s);
  const url = D.docUrl(Object.assign(D.sanitizeDoc(docOf("flug-agent")), { ch: 1 }));
  const r = D.parseRoute(url.slice(url.indexOf("#")));
  assert.equal(r.type, "doc"); assert.equal(r.doc.ch, 1); assert.equal(r.doc.m, "flappy"); assert.ok(r.doc.g.params.gravity);
});
const draft = { stops: [{ q: "Wie heißt unser Witz?", a: "Grüne Möhre" }, { q: "Und das Tier?", a: "Qualle" }], end: "Geschafft!" };
test("Geheimkanal: Antwort oeffnet genau den naechsten Schritt, falsche nichts, Schreibweise egal", async () => {
  const s = await Q.seal(draft);
  assert.equal(s.q0, "Wie heißt unser Witz?");
  assert.equal(await Q.open(s.c[0], "falsch"), null);
  const one = await Q.open(s.c[0], "  gruene möhre!! ".replace("gruene", "grüne"));
  assert.equal(one.q, "Und das Tier?"); assert.equal(one.h, "Q6");
  assert.equal(await Q.open(s.c[1], "Grüne Möhre"), null);
  assert.equal((await Q.open(s.c[1], "QUALLE")).e, "Geschafft!");
});
test("Geheimkanal: weder Antwort noch Folgetext stehen im Link, jede Versiegelung sieht anders aus", async () => {
  const s = await Q.seal(draft), t = await Q.seal(draft);
  assert.notEqual(s.c[0], t.c[0]);
  const url = D.docUrl(Object.assign(D.sanitizeDoc(D.docFromIdea(D.byId("kanal-geheim"), me, "de")), s, { stops: draft.stops, end: draft.end }));
  const r = D.parseRoute(url.slice(url.indexOf("#"))), dump = JSON.stringify(r.doc) + Buffer.from(url.split("#c=")[1], "base64url").toString();
  for (const w of ["Möhre", "Qualle", "Und das Tier", "Geschafft"]) assert.ok(!dump.includes(w), w);
  assert.equal(r.doc.c.length, 2);
  assert.equal((await Q.open(r.doc.c[0], "grüne möhre")).q, "Und das Tier?");
});
test("Geheimkanal: voll beladen passt in den Link", async () => {
  const stops = [0, 1, 2].map(() => ({ q: "Ü".repeat(44), a: "ä".repeat(24) }));
  const s = await Q.seal({ stops, end: "Ö".repeat(44) });
  const doc = Object.assign(D.sanitizeDoc(D.docFromIdea(D.byId("kanal-drei"), me, "de")), s, { t: "Ü".repeat(40), s: "Ö".repeat(70) });
  const url = D.docUrl(doc), f = url.split("#c=")[1];
  assert.ok(f.length <= C.MAX_FRAGMENT, String(f.length));
  const r = D.parseRoute("#c=" + f); assert.equal(r.doc.c.length, 3);
  assert.ok((await Q.open(r.doc.c[2], "ä".repeat(24))).e);
});
test("Geheimkanal: Treffpunkte, Adressen, Nummern, Links werden nicht versiegelt", async () => {
  for (const s of ["Komm allein zum Park", "Treffen um 20 Uhr", "Hauptstraße 12", "0171 2345678", "Schreib mir auf Insta", "https://x.example", "ruf an: a@b.de", "meet me at 8:30"]) assert.equal(Q.clean(s, Q.MAX_Q), "", s);
  assert.equal(await Q.seal({ stops: [{ q: "Komm allein", a: "ja" }], end: "x y" }), null);
  assert.equal(Q.clean("Welches Tier wären wir?", 60), "Welches Tier wären wir?");
});
test("Geheimkanal: von Hand gebauter Link kann gesperrte Inhalte nicht durchschleusen", async () => {
  const crypto = globalThis.crypto, enc = new TextEncoder();
  async function forge(obj, answer) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const raw = await crypto.subtle.importKey("raw", enc.encode(Q.fold(answer)), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: nonce, iterations: 30000, hash: "SHA-256" }, raw, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, enc.encode(JSON.stringify(obj))));
    return Buffer.concat([nonce, ct]).toString("base64url");
  }
  for (const body of [{ e: "fuck you" }, { e: "Komm allein zum Bahnhof" }, { q: "schreib auf Insta" }, { x: 1 }])
    assert.deepEqual(await Q.open(await forge(body, "ja"), "ja"), { blocked: true }, JSON.stringify(body));
  assert.ok(!/[<>]/.test((await Q.open(await forge({ e: "a<b>c" }, "ja"), "ja")).e));
  assert.equal(await Q.open("kaputt", "ja"), null); assert.equal(await Q.open(null, "ja"), null);
  const d = D.sanitizeDoc({ k: "quest", q0: "Komm allein", c: ["<x>", "A".repeat(999), 5], e: "<b>", stops: [{ a: "geheim" }] });
  assert.equal(d.q0, ""); assert.deepEqual(d.c, []); assert.equal(d.stops, undefined);
});
