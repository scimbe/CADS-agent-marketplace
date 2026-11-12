// Strang K: Statechart der freien Karte (inhalt.frei.*) gegen die Aufnahmen des echten Servers (wrapper-frei.json).
// Jeder Zustand aus 12-paritaet §3a: Einstieg, 16+ und Anmelden, Zaehler, Kategorie/Genre/Wer spielt, Bald, Senden,
// Warten (echte Zustaende, Abbrechen), Vorschau, Uebernehmen (accept -> Karte own:true), Verwerfen (discard), Absage mit
// Gegenvorschlag, Genre-Rueckfrage, Status-Gate beim Empfaenger und beim Teilen, Deck, Daumen, Melden, Robot, KI-Arten.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { machine, initialContext } from "../src/app/machine.js";
import { actionsOf, view, leaf } from "../src/ui/view.js";
import { createApi } from "../src/broker/api.js";
import { encode } from "../src/app/link.js";
import { counter } from "./helpers.js";
import { cardOf } from "../src/features/frei/chart.js";

const REC = JSON.parse(fs.readFileSync(new URL("./fixtures/wrapper-frei.json", import.meta.url), "utf8"));
const rec = (n) => REC.exchanges.find((x) => x.name === n).res;
const T0 = Date.UTC(2026, 10, 11, 9), rnd = counter("f"), R = () => [rnd(), rnd(), rnd(), rnd()];
const statusOf = async (n) => createApi({ location: { protocol: "https:", host: REC.host }, fetch: async () => ({ status: rec(n).status, json: async () => rec(n).body }) }).status(REC.device);
function go(s, ev, { consumed = true } = {}) {
  const r = machine.send(s, { at: T0 + 1000, rand: R(), ...ev });
  assert.equal(r.consumed, consumed, ev.type + " in " + r.config.join());
  assert.equal(machine.valid(r.config), null);
  return r;
}
const fx = (s, t) => s.effects.filter((e) => e.type === t);
const txt = (s) => JSON.stringify(view(s, () => {}), (k, x) => (k === "on" || k === "el" ? undefined : x));
const acts = (s) => { const a = actionsOf(s); return [a.primary && a.primary.id, ...a.secondary.map((x) => x.id)]; };

async function signedIn(status = "status-angemeldet-16") {
  let s = machine.initial(initialContext("de"));
  s = go(s, { type: "STATUS", result: await statusOf(status) });
  assert.ok(s.config.includes("konto.angemeldet"));
  return s;
}

test("Einstieg immer sichtbar im Regal; FREI oeffnet die freie Karte und fragt den Stand neu", async () => {
  let s = machine.initial(initialContext("de"));
  assert.ok(txt(s).includes("\"data-act\":\"frei\"") && txt(s).includes("Neu erfinden"), "Einstieg auf dem Start (Gate C: Block Neu erfinden)");
  s = go(s, { type: "FREI" });
  assert.equal(leaf(s), "frei.start"); assert.equal(fx(s, "konto.status").length, 1);
  assert.ok(txt(s).includes("Einen Moment"), "pruefen: ehrlich warten");
});

test("Ohne Konto: Anmelden nur mit 16+-Haken; ohne Haken Hinweis; Rueckweg ?go=erschaffen", async () => {
  let s = machine.initial(initialContext("de"));
  s = go(s, { type: "STATUS", result: { ok: true, account: false, canLogin: true, ki: { enabled: true, remaining: 7, size: 7, period: "week", resetAt: null }, karte: null } });
  s = go(s, { type: "FREI" });
  assert.deepEqual(acts(s), ["login", "deck"]);
  assert.ok(txt(s).includes("Eigene Karten gibt es mit Konto: 5 Karten frei."));
  s = go(s, { type: "LOGIN" });
  assert.equal(s.ctx.konto.need16, true); assert.ok(txt(s).includes("Bitte zuerst bestätigen"));
  s = go(s, { type: "AGE16", on: true });
  s = go(s, { type: "LOGIN" });
  assert.equal(fx(s, "konto.login").length, 1); assert.ok(s.config.includes("konto.anmelden"));
});

test("Angemeldet ohne 16+ im Profil: ehrlicher Hinweis und Weg zu Mein Stil, kein Senden", async () => {
  let s = await signedIn("status-angemeldet-16");
  s = { ...s, ctx: { ...s.ctx, konto: { ...s.ctx.konto, st: { ...s.ctx.konto.st, karte: { ...s.ctx.konto.st.karte, age16: false } } } } };
  s = go(s, { type: "FREI" });
  assert.deepEqual(acts(s)[0], "stil"); assert.ok(txt(s).includes("Eigene Karten gibt es ab 16"));
  s = go(s, { type: "SEND", crisis: false }, { consumed: false });
  s = go(s, { type: "STIL_GO" }); assert.equal(leaf(s), "stil.start");
});

test("Kategorie ohne Vorauswahl, Genre G1/G2, Wer spielt (kein Bot), Bald mit naechsten Karten; Zaehler sichtbar", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  assert.equal(s.ctx.frei.art, "", "keine Vorauswahl");
  assert.ok(txt(s).includes("5 von 5 frei"), "Zaehler");
  s = go(s, { type: "SEND", crisis: false }, { consumed: false });
  s = go(s, { type: "ART", art: "game" });
  assert.ok(txt(s).includes("Erst die Art des Spiels wählen"));
  s = go(s, { type: "PLAYMODE", mode: "allein" }, { consumed: false });
  s = go(s, { type: "GENRE", genre: "G2" });
  s = go(s, { type: "PLAYMODE", mode: "bot" }, { consumed: false });
  s = go(s, { type: "PLAYMODE", mode: "duell" });
  assert.ok(txt(s).includes("Duell per Link: Die andere Person muss deine Punkte schlagen."));
  s = go(s, { type: "SOON_PICK", id: "rennen" });
  assert.ok(txt(s).includes("„Rennen“ gibt es noch nicht."));
  s = go(s, { type: "ART", art: "zauber" });
  assert.equal(s.ctx.frei.art, "game", "unbekannte Kategorie aendert nichts");
});

test("Senden -> Warten (gesendet, Platz N, KI baut, Pruefung) -> Vorschau mit KI-Badge -> Uebernehmen: accept, Karte frei own:true mit Siegel", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(s, { type: "ART", art: "card" });
  s = go(s, { type: "TEXT", value: "Geburtstagskarte für meine Freundin" });
  s = go(s, { type: "SEND", crisis: false });
  assert.equal(leaf(s), "frei.warten");
  const ask = fx(s, "frei.ask")[0];
  assert.deepEqual(ask.input, { text: "Geburtstagskarte für meine Freundin", art: "card" });
  assert.deepEqual(acts(s), ["cancel"], "Abbrechen immer da");
  s = go(s, { type: "FREI_PHASE", req: ask.req, step: "line", n: 3 });
  assert.ok(txt(s).includes("Warteschlange auf Platz 3"));
  s = go(s, { type: "FREI_PHASE", req: ask.req, step: "make", n: 0 });
  assert.ok(txt(s).includes("Die KI baut jetzt deine Karte"));
  const body = rec("karte-ok-card").body;
  s = go(s, { type: "FREI_RESULT", req: ask.req, r: { how: "result", options: body.options, seals: body.seals, hashes: body.hashes, receipt: body.receipt, note: [] } });
  assert.equal(leaf(s), "frei.vorschau"); assert.deepEqual(acts(s), ["take", "drop", "refine"]);
  for (const t of ["MINE", "DECK", "BILD"]) go(s, { type: t }, { consumed: false });   // Review: kein Verlassen der Vorschau ohne Abrechnung
  assert.ok(txt(s).includes("Mit KI erstellt"));
  s = go(s, { type: "TAKE" });
  assert.equal(leaf(s), "card.view"); assert.equal(s.ctx.cardId, "frei"); assert.equal(s.ctx.own, true);
  assert.deepEqual(fx(s, "frei.settle"), [{ type: "frei.settle", how: "accept", receipt: body.receipt }]);
  assert.equal(s.ctx.params.frei.hash, body.options[0].ki.h); assert.equal(s.ctx.params.frei.title, "Sonnenblumen-Tag");
  assert.ok(acts(s).includes("robot") && acts(s).includes("melden"), "Robot und Melden an der eigenen Karte");
});

test("Verwerfen: discard, Einheit kommt zurueck; Abbrechen: spaetes Ergebnis zaehlt nicht mehr", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(go(go(s, { type: "ART", art: "meme" }), { type: "TEXT", value: "Mein Hund wartet" }), { type: "SEND", crisis: false });
  const req = fx(s, "frei.ask")[0].req, body = rec("karte-ok-meme").body;
  s = go(s, { type: "FREI_RESULT", req, r: { how: "result", options: body.options, seals: body.seals, hashes: body.hashes, receipt: body.receipt } });
  s = go(s, { type: "DROP" });
  assert.equal(leaf(s), "frei.start"); assert.equal(fx(s, "frei.settle")[0].how, "discard");
  s = go(s, { type: "SEND", crisis: false });
  const r2 = fx(s, "frei.ask")[0].req;
  s = go(s, { type: "CANCEL" });
  assert.equal(leaf(s), "frei.start"); assert.ok(txt(s).includes("Abgebrochen."));
  s = go(s, { type: "FREI_RESULT", req: r2, r: { how: "result", options: body.options, seals: body.seals, hashes: [], receipt: "x" } }, { consumed: false });
  assert.equal(leaf(s), "frei.start", "das spaete Ergebnis veraendert nichts (die Laufzeit gibt es zurueck)");
});

test("Was nicht passt, wird verworfen und zurueckgegeben (Art/Kind), nie gezeigt", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(go(go(s, { type: "ART", art: "card" }), { type: "TEXT", value: "Ein Frosch im All" }), { type: "SEND", crisis: false });
  const req = fx(s, "frei.ask")[0].req, body = rec("karte-ok-game").body;
  s = go(s, { type: "FREI_RESULT", req, r: { how: "result", options: body.options, seals: body.seals, hashes: body.hashes, receipt: body.receipt } });
  assert.equal(leaf(s), "frei.start"); assert.equal(fx(s, "frei.settle")[0].how, "discard");
  assert.ok(txt(s).includes("Das hat nicht gepasst. Nichts verbraucht"));
});

test("Absage mit Gegenvorschlag; Genre-Rueckfrage mit zwei Antworten; noch nicht mit Katalog; Krise auf dem Geraet", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(go(go(go(s, { type: "ART", art: "game" }), { type: "GENRE", genre: "G1" }), { type: "TEXT", value: "Tetris mit bunten Steinen" }), { type: "SEND", crisis: false });
  let req = fx(s, "frei.ask")[0].req; const t = rec("karte-absage-tetris").body;
  s = go(s, { type: "FREI_RESULT", req, r: { how: "notyet", notyet: t.notyet, reason: t.reason, alt: t.alt, catalog: t.catalog } });
  assert.ok(txt(s).includes("Tetris kann die freie Karte noch nicht. Dafür wird nichts abgebucht."));
  assert.ok(txt(s).includes(cardOf("zug-steine") ? "Stattdessen:" : "Im Katalog gibt es dafür noch keine Karte."), "Gegenvorschlag nur, wenn es die Karte gibt");
  s = go(go(s, { type: "TEXT", value: "Endless Runner über Brücken" }), { type: "SEND", crisis: false });
  req = fx(s, "frei.ask")[0].req;
  s = go(s, { type: "FREI_RESULT", req, r: { how: "notyet", notyet: rec("karte-genre-frage").body.notyet, catalog: [] } });
  assert.ok(txt(s).includes("Dein Satz klingt nach Jump & Run, gewählt ist Fliegen."));
  s = go(s, { type: "RESEND", genre: "G2" });
  assert.equal(leaf(s), "frei.warten"); assert.deepEqual(fx(s, "frei.ask")[0].input, { text: "Endless Runner über Brücken", art: "game", genre: "G2", fest: true });
  s = go(s, { type: "CANCEL" });
  s = go(s, { type: "TEXT", value: "ich will nicht mehr leben" });
  s = go(s, { type: "SEND", crisis: true });
  assert.equal(leaf(s), "frei.start"); assert.equal(fx(s, "frei.ask").length, 0, "nichts gesendet");
  assert.ok(txt(s).includes("Nummer gegen Kummer 116 111"));
});

test("Kein Kontingent: kein Senden; mit Gutschein Aufladen; unter 16 und Karte aus: ehrlich", async () => {
  let s = go(await signedIn("status-leer"), { type: "FREI" });
  assert.ok(txt(s).includes("Alle 1 freien Karten sind erstellt."));
  s = go(go(go(s, { type: "ART", art: "card" }), { type: "TEXT", value: "Danke an mein Team" }), { type: "SEND", crisis: false }, { consumed: false });
  s = { ...s, ctx: { ...s.ctx, konto: { ...s.ctx.konto, st: { ...s.ctx.konto.st, karte: { ...s.ctx.konto.st.karte, voucher: true } } } } };
  assert.ok(txt(s).includes("Gutschein-Code"));
  s = go(s, { type: "VOUCHER_TEXT", value: "TEST-GUTSCHEIN-1" });
  s = go(s, { type: "REDEEM" }); assert.equal(fx(s, "redeem").length, 1);
  let off = go(await signedIn("status-karte-aus"), { type: "FREI" });
  assert.ok(txt(off).includes("Eigene Karten sind gerade nicht verfügbar."));
});

test("Status-Gate beim Empfaenger: eine geteilte freie Karte oeffnet erst nach ok; gesperrt/unbekannt -> nicht verfuegbar", async () => {
  const ki = rec("deck-mit-karte").body.cards[0].doc.ki;
  const params = { kind: "card", title: "Sonnenblumen-Tag", text: "Alles Gute!", top: "", bottom: "", style: "herz", palette: "gelb", stickers: ["🌻"], seal: ki.s, hash: ki.h, owner: ki.o, root: "" };
  const hash = encode("card", { c: "frei", v: "1.0.0", p: params });
  let s = machine.initial(initialContext("de"));
  s = go(s, { type: "LINK", hash });
  assert.equal(leaf(s), "frei.gate");
  const chk = fx(s, "frei.status")[0].checks;
  assert.deepEqual(chk.map((c) => c.cid), [ki.h.slice(0, 22)]); assert.equal(chk[0].doc.x, "Alles Gute!", "das Gate fragt mit dem Inhalt, der gleich gezeigt wird");
  const ok = go(s, { type: "GATE", st: "ok" });
  assert.equal(leaf(ok), "receive.show");
  const no = go(s, { type: "GATE", st: "blocked" });
  assert.equal(leaf(no), "receive.reject"); assert.ok(txt(no).includes("Diese Karte ist nicht mehr verfügbar."));
  const ch = go(s, { type: "GATE", st: "changed" });
  assert.equal(leaf(ch), "receive.reject"); assert.ok(txt(ch).includes("passt nicht zur freigegebenen Karte"));
  const un = go(s, { type: "GATE", st: "unknown" });
  assert.ok(txt(un).includes("kann gerade nicht geprüft werden"));
  // eine gewoehnliche Karte geht am Gate vorbei
  const plain = go(machine.initial(initialContext("de")), { type: "LINK", hash: encode("card", { c: "gruss", v: "1.0.0", p: { title: "Hi", text: "x", bg: "yellow", stickers: [] } }) });
  assert.equal(leaf(plain), "receive.show");
});

test("Teilen nur bei Deck-Status ok: sonst zurueck zur Karte mit Grund", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(go(go(s, { type: "ART", art: "card" }), { type: "TEXT", value: "Geburtstagskarte" }), { type: "SEND", crisis: false });
  const req = fx(s, "frei.ask")[0].req, body = rec("karte-ok-card").body;
  s = go(go(s, { type: "FREI_RESULT", req, r: { how: "result", options: body.options, seals: body.seals, hashes: body.hashes, receipt: body.receipt } }), { type: "TAKE" });
  s = go(s, { type: "GO" });
  assert.equal(leaf(s), "frei.sharegate"); assert.equal(fx(s, "frei.status")[0].checks[0].cid, body.options[0].ki.h.slice(0, 22));
  // veraendert: als Remix ohne Siegel, die Wurzel wird per id geprueft (Gate erneut), dann Teilen mit Hinweis
  const rx = go(s, { type: "GATE", st: "changed" });
  assert.equal(leaf(rx), "frei.sharegate"); assert.equal(rx.ctx.params.frei.seal, ""); assert.equal(rx.ctx.params.frei.root, body.options[0].ki.h.slice(0, 22));
  assert.deepEqual(fx(rx, "frei.status")[0].checks, [{ cid: body.options[0].ki.h.slice(0, 22), doc: null }]);
  const rs = go(rx, { type: "GATE", st: "ok" });
  assert.equal(leaf(rs), "card.share"); assert.ok(txt(rs).includes("ohne KI-Siegel geteilt"));
  const no = go(s, { type: "GATE", st: "blocked" });
  assert.equal(leaf(no), "card.view"); assert.ok(txt(no).includes("Teilen geht erst, wenn die Karte freigegeben ist"));
  const ok = go(s, { type: "GATE", st: "ok" });
  assert.equal(leaf(ok), "card.share");
});

test("Deck: laden, oeffnen (Nutzung beginnt), Daumen, Melden mit Grund, Spielen, Robot", async () => {
  let s = go(machine.initial(initialContext("de")), { type: "DECK" });
  assert.equal(leaf(s), "frei.deck"); assert.equal(fx(s, "frei.deck.load").length, 1);
  const cards = [{ cid: rec("deck-mit-karte").body.cards[0].cid, doc: { ...rec("deck-mit-karte").body.cards[0].doc } }];
  s = go(s, { type: "DECK_LOADED", ok: true, cards, v: 1 });
  assert.ok(txt(s).includes("Sonnenblumen-Tag"));
  s = go(s, { type: "DECK_OPEN", cid: cards[0].cid });
  assert.equal(leaf(s), "frei.deckkarte"); assert.equal(fx(s, "frei.use.start").length, 1);
  s = go(s, { type: "USE", ok: true });
  assert.ok(txt(s).includes("Gefällt mir"));
  s = go(s, { type: "VOTE", v: 1 }); assert.equal(fx(s, "frei.vote")[0].v, 1);
  s = go(s, { type: "VOTED", st: "zu-frueh" }); assert.ok(txt(s).includes("Daumen gibt es nach ein paar Sekunden"));
  let m = go(s, { type: "MELDEN" });
  assert.equal(leaf(m), "frei.melden");
  m = go(m, { type: "REPORT_SEND" }, { consumed: false });
  m = go(m, { type: "REASON", reason: "wrong" });
  m = go(m, { type: "REPORT_SEND" }); assert.equal(fx(m, "frei.report")[0].reason, "wrong");
  m = go(m, { type: "REPORTED", ok: true }); assert.ok(txt(m).includes("Danke"));
  m = go(m, { type: "BACK" }); assert.equal(leaf(m), "frei.deckkarte");
  const p = go(s, { type: "PLAY" });
  assert.equal(leaf(p), "card.view"); assert.equal(p.ctx.cardId, "frei"); assert.equal(fx(p, "frei.use.acted").length, 1);
  const r = go(s, { type: "ROBOT" });
  assert.equal(leaf(r), "frei.robot"); assert.equal(r.ctx.frei.robot.base.ki.h, cards[0].doc.ki.h);
});

test("Robot aus einer Katalogkarte (gruss hat noch keinen Adapter -> kein Knopf); aus der eigenen Karte: base mit Siegel", async () => {
  let s = go(machine.initial(initialContext("de")), { type: "OPEN", id: "gruss" });
  assert.ok(!acts(s).includes("robot"), "ohne toFree kein Robot-Knopf (offen: Adapter in gruss)");
  s = go(s, { type: "ROBOT" }, { consumed: false });
  s = await signedIn(); s = go(s, { type: "FREI" });
  s = go(go(go(s, { type: "ART", art: "card" }), { type: "TEXT", value: "Geburtstagskarte" }), { type: "SEND", crisis: false });
  const req = fx(s, "frei.ask")[0].req, body = rec("karte-ok-card").body;
  s = go(go(s, { type: "FREI_RESULT", req, r: { how: "result", options: body.options, seals: body.seals, hashes: body.hashes, receipt: body.receipt } }), { type: "TAKE" });
  s = go(s, { type: "ROBOT" });
  assert.equal(leaf(s), "frei.robot");
  s = go(go(s, { type: "TEXT", value: "Im Weltraum" }), { type: "SEND", crisis: false });
  const ask = fx(s, "frei.ask")[0];
  assert.equal(ask.input.text, "Im Weltraum"); assert.equal(ask.input.base.k, "card"); assert.equal(ask.input.base.ki.h, body.options[0].ki.h);
});

test("KI-Arten an jeder Karte: Mit KI fuer x-model-Felder, Auswahl setzt das Feld, gilt nur bei gueltigem Wert", async () => {
  let s = go(go(machine.initial(initialContext("de")), { type: "OPEN", id: "gruss" }), { type: "CUSTOMIZE" });
  s = go(s, { type: "KI", part: "farbe" }, { consumed: false });
  s = go(s, { type: "KI", part: "titel" });
  assert.equal(leaf(s), "frei.ki"); const k = fx(s, "frei.ki")[0];
  assert.equal(k.kind, "line"); assert.equal(k.input.text, "Du schaffst das");
  s = go(s, { type: "KI_RESULT", req: k.req, r: { how: "result" }, opts: rec("ki-line").body.options, receipt: rec("ki-line").body.receipt });
  assert.equal(fx(s, "frei.settle").length, 0, "abgerechnet wird erst beim Antippen");
  assert.ok(txt(s).includes("Heute zählt nur Mut."));
  s = go(s, { type: "KI_PICK", i: 1 });
  assert.equal(leaf(s), "card.customize.bubbles"); assert.equal(s.ctx.params.gruss.title, "Heute zählt nur Mut.");
  assert.deepEqual(fx(s, "frei.settle"), [{ type: "frei.settle", how: "accept", receipt: rec("ki-line").body.receipt }]);
});

test("KI-Bild: Status, Text, Stil, Auftrag, Warten, Ergebnis, Nehmen; Kontobild ohne Guthaben gesperrt", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(s, { type: "BILD" }); assert.equal(fx(s, "frei.bild.status").length, 1);
  const st = rec("bild-status").body;
  s = go(s, { type: "BILD_STATUS", r: { ok: true, on: true, login: true, age16: true, free: st.free, credit: 0, perDay: st.perDay, can: st.can, why: st.why, avatar: null } });
  s = go(s, { type: "BILD_USE", use: "avatar" });
  s = go(go(s, { type: "BILD_TEXT", value: "Ein Fuchs mit Brille" }), { type: "BILD_GO", crisis: false }, { consumed: false });
  assert.ok(txt(s).includes("Ein Kontobild kostet 1 Guthaben – du hast gerade keins."));
  s = go(s, { type: "BILD_USE", use: "card" });
  s = go(s, { type: "BILD_GO", crisis: false });
  assert.equal(leaf(s), "frei.bildwarten"); const req = fx(s, "frei.bild.make")[0].req;
  s = go(s, { type: "BILD_PHASE", req, step: "checking", n: 0 }); assert.ok(txt(s).includes("Bild wird geprüft"));
  s = go(s, { type: "BILD_RESULT", req, r: { how: "done", id: rec("bild-job-fertig").body.id, url: rec("bild-job-fertig").body.url, dataUrl: "data:image/png;base64,AAAA" } });
  assert.equal(leaf(s), "frei.bild"); assert.equal(acts(s)[0], "bild-take");
  s = go(s, { type: "BILD_TAKE" }); assert.equal(fx(s, "frei.bild.keep")[0].id, rec("bild-job-fertig").body.id);
});

test("Meine freien Karten: /deck/me und /mod/me; Widerspruch fuehrt in den vorhandenen Widerspruch (stil.widerspruch)", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  s = go(s, { type: "MINE" });
  assert.equal(leaf(s), "frei.meine"); assert.deepEqual([fx(s, "frei.mine").length, fx(s, "mod.me").length], [1, 1]);
  const me = rec("deck-me").body;
  s = go(s, { type: "MINE_LOADED", r: { ok: true, cards: me.cards, credit: { balance: 5, items: [{ reason: "use", n: 2, revoked: false }, { reason: "deck", n: 3, revoked: false }] }, mod: { st: "ok" } } });
  assert.ok(txt(s).includes("in den Community-Karten")); assert.ok(txt(s).includes("Guthaben: 5 freie Karten"));
  s = go(s, { type: "MOD", result: { ok: true, st: "ok", until: null, notices: [{ nid: "n-abcdef", at: "2026-11-11T09:00:00.000Z", type: "card-hidden", automated: true, ground: null, facts: {}, until: null, appealUntil: "2099-01-01T00:00:00.000Z", court: true, appeal: null }] } });
  assert.ok(txt(s).includes("Widersprechen"));
  s = go(s, { type: "APPEAL", nid: "n-abcdef" });
  assert.equal(leaf(s), "stil.widerspruch");
});

test("Disclosure: jeder Zustand der freien Karte hat hoechstens eine Haupt- und drei Nebenaktionen; BACK fuehrt heim", async () => {
  let s = go(await signedIn(), { type: "FREI" });
  for (const ev of [{ type: "ART", art: "game" }, { type: "GENRE", genre: "G1" }, { type: "TEXT", value: "Ein Drache fliegt" }]) { s = go(s, ev); const a = actionsOf(s); assert.ok(a.secondary.length <= 3); }
  let n = 0;
  while (leaf(s) !== "shelf" && n++ < 6) s = go(s, { type: "BACK" });
  assert.equal(leaf(s), "shelf");
});

test("KI-Knoten der Zugkarten (Z1): KI_ASK in jeder Kartenansicht -> Effekt frei.kiask; KI_SETTLE rechnet ab; fremde Arten gehen nicht raus", async () => {
  let s = go(machine.initial(initialContext("de")), { type: "OPEN", id: "gruss" });
  s = go(s, { type: "KI_ASK", kind: "plan", input: { satz: "Grillen naechsten Samstag", art: "termin" }, into: "ai" });
  assert.deepEqual(fx(s, "frei.kiask")[0], { type: "frei.kiask", kind: "plan", input: { satz: "Grillen naechsten Samstag", art: "termin" }, into: "ai", cardId: "gruss" });
  go(s, { type: "KI_ASK", kind: "karte", input: {}, into: "ai" }, { consumed: false });
  go(s, { type: "KI_ASK", kind: "plan", input: {}, into: "../x" }, { consumed: false });
  s = go(s, { type: "KI_SETTLE", receipt: "r1.f.x", how: "accept" });
  assert.deepEqual(fx(s, "frei.settle"), [{ type: "frei.settle", how: "accept", receipt: "r1.f.x" }]);
});

test("Einstieg schlank fuer das Regal (H, Design D): eine Zeile in Leseschrift mit Pfeil, sendet FREI; die grosse Form bleibt", async () => {
  const { freiEntry } = await import("../src/features/frei/view-core.js");
  const s = machine.initial(initialContext("de")), sent = [];
  const v = freiEntry(s, {}, (e) => sent.push(e), { compact: true });
  const j = JSON.stringify(v, (k, x) => (k === "on" || k === "el" ? undefined : x));
  assert.ok(j.includes("Eigene Karte: ein Satz, die KI baut sie")); assert.ok(j.includes("frei-row")); assert.ok(!j.includes("frei-tile"));
  v.children[0].props.on.click(); assert.deepEqual(sent, [{ type: "FREI" }]);
  assert.ok(JSON.stringify(freiEntry(s, {}, () => {}), (k, x) => (k === "on" ? undefined : x)).includes("frei-tile"), "ohne compact die bisherige Form");
  const en = machine.initial(initialContext("en"));
  assert.ok(JSON.stringify(freiEntry(en, {}, () => {}, { compact: true }), (k, x) => (k === "on" ? undefined : x)).includes("Your own card"));
});

test("FREI mit Satz (Startseiten-Block, H Gate C): Satz vorausgefuellt, keine Kategorie vorgewaehlt, Senden erst nach Wahl; Krise sofort Hilfe; ohne text wie bisher", async () => {
  let s = go(await signedIn(), { type: "FREI", text: "  Ein Frosch, der\u0000 Astronaut werden will <b>  " });
  assert.equal(leaf(s), "frei.start");
  assert.equal(s.ctx.frei.text, "Ein Frosch, der Astronaut werden will b", "bereinigt, gekuerzt");
  assert.equal(s.ctx.frei.art, "", "keine Vorauswahl der Kategorie");
  go(s, { type: "SEND", crisis: false }, { consumed: false });
  s = go(go(s, { type: "ART", art: "card" }), { type: "SEND", crisis: false });
  assert.deepEqual(fx(s, "frei.ask")[0].input, { text: "Ein Frosch, der Astronaut werden will b", art: "card" });
  const k = go(await signedIn(), { type: "FREI", text: "ich will nicht mehr leben" });
  assert.equal(k.ctx.frei.res.how, "crisis"); assert.ok(txt(k).includes("Nummer gegen Kummer"));
  assert.equal(go(await signedIn(), { type: "FREI" }).ctx.frei.text, "");
  assert.equal(go(await signedIn(), { type: "FREI", text: "x".repeat(300) }).ctx.frei.text.length, 200);
});

test("needParts frei-ui (Befund Z2, Bisect 3aca9f06): nur Ereignisse, die eine Ansicht der freien Karte oeffnen; GO und LINK nie", async () => {
  const { freiParts } = await import("../src/features/frei/chart.js");
  for (const t of ["FREI", "DECK", "DECK_OPEN", "MINE", "BILD", "KI", "ROBOT", "MELDEN"]) assert.deepEqual(freiParts({ type: t }), ["frei-ui"], t);
  for (const t of ["GO", "LINK", "OPEN", "INPUT", "SEND", "GATE"]) assert.deepEqual(freiParts({ type: t }), [], t);
});

test("Status-Gate beim Teilen ok: das ausgeloeste GO traegt rand, die versiegelte Zugkarte startet (Befund Z2)", () => {
  let s = machine.initial(initialContext("de"));
  s = { ...s, ctx: { ...s.ctx, frei: { ...s.ctx.frei, req: 1, art: "faehigkeit", text: "x" } }, config: [...s.config.filter((c) => !c.startsWith("inhalt.")), "inhalt", "inhalt.frei", "inhalt.frei.warten"] };
  const b = rec("karte-ok-faehigkeit").body;
  s = go(s, { type: "FREI_RESULT", req: 1, r: { how: "result", options: b.options, seals: b.seals, hashes: b.hashes, receipt: b.receipt } });
  s = go(s, { type: "TAKE" });
  assert.equal(s.ctx.cardId, "zug-termin");
  s = go(s, { type: "MODE", mode: "link" });
  s = go(s, { type: "GO" });
  assert.equal(leaf(s), "frei.sharegate");
  s = go(s, { type: "GATE", st: "ok" });
  assert.equal(leaf(s), "card.play.turn");
  assert.equal(s.ctx.error, null);
});

test("Vorschau: Hinweise der Faktenpruefung (Wrapper #141): unkalibriert und weggelassene Fragen, de und en", async () => {
  for (const [lang, a, b3, b1] of [["de", "noch nicht von Menschen nachgemessen", "3 Fragen mit unsicheren Fakten", "Eine Frage mit unsicheren Fakten"], ["en", "not been verified by people yet", "I left out 3 questions", "I left out one question"]]) {
    for (const [notes, want, not] of [[["bau:fakten-unkalibriert", "bau:fakten-entfernt:3"], [a, b3], []], [["bau:fakten-entfernt:1"], [b1], [a]], [["bau:fakten-entfernt:0", "bau:fakten-entfernt:x"], [], [b1, "[create_"]]]) {
      let s = go(await signedIn(), { type: "FREI" });
      s = { ...s, ctx: { ...s.ctx, lang } };
      s = go(go(go(s, { type: "ART", art: "card" }), { type: "TEXT", value: "Geburtstagskarte für meine Freundin" }), { type: "SEND", crisis: false });
      const req = fx(s, "frei.ask")[0].req, body = rec("karte-ok-card").body;
      s = go(s, { type: "FREI_RESULT", req, r: { how: "result", options: body.options, seals: body.seals, hashes: body.hashes, receipt: body.receipt, note: notes } });
      assert.equal(leaf(s), "frei.vorschau");
      const t = txt(s);
      for (const w of want) assert.ok(t.includes(w), lang + " " + notes + ": " + w);
      for (const w of not) assert.ok(!t.includes(w), lang + " " + notes + " ohne " + w);
    }
  }
});
