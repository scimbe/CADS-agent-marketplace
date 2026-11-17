// Freie Karte 2, Klaerungsdialog (P1): Vertrag (src/features/frei/klaerung.js), Dienst (src/broker/klaerung.js), Statechart
// (src/features/frei/klaeren.js) und Ansichten (klaeren-view.js). Kein Netz: der Dienst ist ein Doppel mit den Antworten des
// Servers (CADS-DEMO-wrapper lib/duell-klaerung.mjs). Keine Policy im Client: was erlaubt ist und wie oft nachgebessert
// werden darf, kommt hier nur als Serverantwort herein.
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/app/runtime.js";
import * as K from "../src/features/frei/klaerung.js";
import { klaerVerdict, createKlaerung, OPS } from "../src/broker/klaerung.js";
import { fertigOf } from "../src/features/frei/klaeren.js";
import { makeKlaerenView } from "../src/features/frei/klaeren-view.js";
import { KLAEREN_TEXTS } from "../src/features/frei/klaeren-texts.js";
import { h } from "../src/ui/dom.js";

const ID = "A".repeat(22), AUF = "B".repeat(22);
const FRAGEN = { id: ID, verstehe: "ein Spiel. Von oben kommt etwas angesegelt, du wehrst es ab.", fragen: [
  { frage: "Wer bist du im Spiel?", hinweis: "Tipp ein Bild an.", kacheln: [{ label: "Ein Segelboot", sub: "", emoji: "⛵" }, { label: "Eine Badeente", sub: "", emoji: "🦆" }] },
  { frage: "Womit wirfst du?", hinweis: "Es soll nass oder lustig werden, nicht brutal.", kacheln: [{ label: "Wasserbomben", sub: "Platsch.", emoji: "💧" }, { label: "Seifenblasen", sub: "", emoji: "🫧" }, { label: "Kanonenkugeln", sub: "Nur Holz.", emoji: "🎯" }] }] };
const EIGEN = "Wasserbomben, die bunt platzen";
const LISTE = { titel: "Segelboot gegen Piraten", verstehe: "Ein Spiel mit Wasserbomben.", punkte: [
  { id: "p1", text: "Du steuerst ein Segelboot unten am Rand.", pruefung: "Wischen bewegt das Boot." },
  { id: "p2", text: `Ein großer Knopf wirft „${EIGEN}“.`, pruefung: "Antippen wirft." },
  { id: "p3", text: "Mit jeder Runde etwas schneller.", pruefung: "Runde 2 ist schneller." }], nicht: ["Gleichzeitig online gegeneinander spielen ist nicht dabei."], dauerMaxMin: 15, kosten: { guthaben: 1, nurBeiErfolg: true } };
const STATUS = (left, extra = {}) => ({ how: "ok", body: { titel: "Segelboot gegen Piraten", nachbessernLeft: left, gemeldet: false, behalten: false, ergebnis: { titel: "Segelboot gegen Piraten", fehlt: 1, punkte: [
  { id: "p1", text: LISTE.punkte[0].text, erfuellt: true, notiz: "" }, { id: "p2", text: LISTE.punkte[1].text, erfuellt: true, notiz: "" }, { id: "p3", text: LISTE.punkte[2].text, erfuellt: false, notiz: "bleibt gleich schnell" }] }, ...extra } });

/** Dienst-Doppel: je Aufruf eine Antwort (Funktion oder Wert), merkt sich die Aufrufe */
function fakeDienst(answers) {
  const calls = [];
  const d = { calls };
  for (const op of OPS) d[op] = async (body) => { calls.push({ op, body }); const a = answers[op]; const v = Array.isArray(a) ? a.shift() : a; return typeof v === "function" ? v(body) : v || { how: "off" }; };
  return d;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
function boot(answers) {
  const klaerung = fakeDienst(answers);
  const rt = createRuntime({ lang: "de", entropy: () => "e".repeat(32), schedule: (f) => f(), onChange: () => {}, storage: { loadKonto: () => null, saveKonto: () => true, loadFeature: () => null, saveFeature: () => true },
    klaerung, api: { loginHref: (r) => "/gate?r=" + r, status: async () => ({ ok: true, canLogin: true, account: false }), me: async () => ({ ok: false }) } });
  return { rt, klaerung, k: () => rt.state.ctx.frei.k };
}
const V = makeKlaerenView({ h, K });
const all = (v, out = []) => { if (v && typeof v === "object") { out.push(v); for (const c of v.children || []) all(c, out); } return out; };
const text = (v) => (typeof v === "string" ? v : v && v.children ? v.children.map(text).join("") : "");
const view = (rt) => V.klaerenView(rt.state, () => {}, rt.state.config.find((c) => c.startsWith("inhalt.frei.")).slice("inhalt.frei.".length));

test("Vertrag: hoechstens 3 Fragen, 2..4 Kacheln, nur erlaubte Emoji, nichts wird gekuerzt", () => {
  assert.equal(K.checkFragen({ ok: true, ...FRAGEN, id: undefined }).ok, false, "unbekanntes Feld id");
  const f = { ok: true, verstehe: FRAGEN.verstehe, fragen: FRAGEN.fragen };
  assert.equal(K.checkFragen(f).ok, true);
  assert.match(K.checkFragen({ ...f, fragen: [...f.fragen, f.fragen[0], f.fragen[1]] }).errors.join(), /4 statt 1\.\.3/);
  assert.match(K.checkFragen({ ...f, fragen: [{ ...f.fragen[0], kacheln: [{ label: "Pistole", sub: "", emoji: "🔫" }, f.fragen[0].kacheln[0]] }] }).errors.join(), /emoji: nicht erlaubt/);
  assert.match(K.checkFragen({ ...f, verstehe: "x".repeat(K.LEN.verstehe + 1) }).errors.join(), /laenger als/);
  assert.equal(K.checkFragen({ ok: false, verstehe: "", fragen: [] }).refusal, true);
  assert.ok(!K.EMOJI.some((e) => ["🔫", "💣", "🔪", "🩸", "🗡️"].includes(e)), "keine Waffen, kein Blut in den Kacheln");
});

test("Vertrag: Liste braucht pruefbare Punkte und eigene Worte woertlich; Ergebnis bewertet genau die Punkte", () => {
  const l = { ok: true, titel: LISTE.titel, verstehe: LISTE.verstehe, punkte: LISTE.punkte.map(({ text, pruefung }) => ({ text, pruefung })), nicht: LISTE.nicht };
  assert.equal(K.checkListe(l, [EIGEN]).ok, true);
  assert.match(K.checkListe(l, ["Wasserbomben die bunt platzen"]).errors.join(), /woertlich/);
  assert.match(K.checkListe({ ...l, punkte: [{ text: "macht Spass", pruefung: "" }, ...l.punkte.slice(1)] }).errors.join(), /pruefung: leer/);
  assert.match(K.checkListe({ ...l, punkte: l.punkte.slice(0, 2) }).errors.join(), /2 statt 3\.\.8/);
  const e = K.checkErgebnis({ titel: "X", punkte: LISTE.punkte.map((p, i) => ({ id: p.id, erfuellt: i !== 2, notiz: "" })) }, LISTE.punkte);
  assert.equal(e.fehlt, 1);
  assert.equal(K.checkErgebnis({ titel: "X", punkte: LISTE.punkte.slice(0, 2).map((p) => ({ id: p.id, erfuellt: true })) }, LISTE.punkte), null, "jeder Punkt wird bewertet");
  assert.equal(K.NACHBESSERN_MAX, 3); assert.equal(K.MELDUNG_MAX, 500); assert.equal(K.EIGEN_MAX, 120);
});

test("Dienst: Serverantworten ehrlich abgebildet; Pfade nur ueber api.raw", async () => {
  assert.deepEqual(klaerVerdict(200, { a: 1 }), { how: "ok", body: { a: 1 } });
  assert.equal(klaerVerdict(202, {}).how, "ok");
  assert.equal(klaerVerdict(401).how, "login"); assert.equal(klaerVerdict(403, { error: "age16" }).how, "age16"); assert.equal(klaerVerdict(403, { error: "account-paused" }).how, "paused");
  assert.equal(klaerVerdict(429, { error: "daily-cap" }).how, "daily"); assert.equal(klaerVerdict(429, { error: "throttled" }).how, "throttled");
  assert.deepEqual(klaerVerdict(422, { error: "refused", reason: "weapons", vorschlaege: [0, 1, 2] }), { how: "refused", reason: "weapons", vorschlaege: [0, 1] });
  assert.equal(klaerVerdict(422, { error: "blocked", why: "crisis", help: "116 111" }).how, "crisis");
  assert.equal(klaerVerdict(502, { error: "bad-output" }).how, "bad"); assert.equal(klaerVerdict(410).how, "gone");
  assert.equal(klaerVerdict(409, { error: "limit" }).how, "limit"); assert.equal(klaerVerdict(503, { error: "off" }).how, "off");
  const sent = [];
  const d = createKlaerung({ api: { raw: async (m, p, b) => { sent.push([m, p, b]); return p.endsWith("fragen") ? { status: 200, body: FRAGEN } : { ok: false, error: "netz" }; } } });
  assert.equal((await d.fragen({ satz: "x" })).how, "ok");
  assert.equal((await d.liste({})).how, "netz");
  assert.deepEqual(sent[0], ["POST", "/api/duell/klaerung/fragen", { satz: "x" }]);
});

test("Ablauf: Satz -> Fragen -> eigene Worte abgelehnt (Weiter gesperrt, Vorschlag gilt erst nach Antippen) -> Liste -> Auftrag -> Opt-in", async () => {
  const s = boot({
    fragen: { how: "ok", body: FRAGEN },
    antwort: (b) => (/Raketen/.test(b.text) ? { how: "refused", reason: "weapons", vorschlaege: [0, 2] } : { how: "ok", body: { ok: true, text: b.text } }),
    liste: { how: "ok", body: LISTE },
    auftrag: { how: "ok", body: { auftrag: AUF, status: "bestaetigt" } },
    optin: (b) => ({ how: "ok", body: { optin: { push: b.push, mail: b.mail } } })
  });
  const { rt } = s;
  rt.dispatch({ type: "FREI" }); await tick();
  rt.dispatch({ type: "KLAEREN" });
  assert.ok(rt.matches("inhalt.frei.klaeren"));
  assert.equal(view(rt).actions.primary.disabled, true, "ohne Satz kein Weiter");
  rt.dispatch({ type: "K_GO" }); assert.ok(rt.matches("inhalt.frei.klaeren"), "Wache: zu kurz");
  rt.dispatch({ type: "K_TEXT", value: "Space Invaders mit Segelbooten" });
  rt.dispatch({ type: "K_GO" });
  assert.ok(rt.matches("inhalt.frei.kwarten")); await tick();
  assert.ok(rt.matches("inhalt.frei.kfrage"));
  assert.deepEqual(s.klaerung.calls[0], { op: "fragen", body: { satz: "Space Invaders mit Segelbooten", lang: "de" } });
  // Frage 1: Kachel, Weiter
  assert.equal(view(rt).actions.primary.disabled, true, "nichts gewaehlt");
  rt.dispatch({ type: "K_PICK", kachel: 0 });
  assert.equal(view(rt).actions.primary.disabled, false);
  rt.dispatch({ type: "K_WEITER" });
  assert.equal(s.k().i, 1);
  // Frage 2: eigene Worte – abgelehnt
  rt.dispatch({ type: "K_EIGEN_TEXT", value: "Raketen, die alles in die Luft jagen" });
  rt.dispatch({ type: "K_EIGEN_GO" }); await tick();
  assert.equal(s.k().pruef.how, "refused");
  assert.equal(s.k().antworten[1], null, "nichts wird still ersetzt");
  rt.dispatch({ type: "K_WEITER" }); assert.ok(rt.matches("inhalt.frei.kfrage")); assert.equal(s.k().i, 1, "Weiter gesperrt");
  let v = view(rt), nodes = all({ children: v.body });
  assert.equal(v.actions.primary.disabled, true);
  assert.match(text({ children: v.body }), /Das bauen wir nicht\..*Raketen, Explosionen und echte Waffen/);
  assert.match(text({ children: v.body }), /Wir ersetzen deine Worte nicht heimlich/);
  assert.deepEqual(nodes.filter((n) => n.props && /^k-vorschlag-/.test(n.props["data-act"] || "")).map((n) => n.props["data-act"]), ["k-vorschlag-0", "k-vorschlag-2"]);
  assert.equal(nodes.find((n) => n.props && n.props.id === "k-eigen-1").props["aria-invalid"], "true");
  rt.dispatch({ type: "K_VORSCHLAG", kachel: 1 }); assert.equal(s.k().antworten[1], null, "nur angebotene Vorschlaege");
  // anders gesagt und angenommen: woertlich
  rt.dispatch({ type: "K_EIGEN_TEXT", value: EIGEN });
  rt.dispatch({ type: "K_EIGEN_GO" }); await tick();
  assert.deepEqual(s.k().antworten[1], { art: "eigen", text: EIGEN });
  v = view(rt);
  assert.match(text({ children: v.body }), new RegExp("So verstehe ich dich:.*„" + EIGEN + "“"));
  assert.match(text({ children: v.body }), /Wer bist du im Spiel: Ein Segelboot/);
  assert.equal(v.actions.primary.label, "Zusammenfassung");
  // Text geaendert: gilt erst wieder nach der Pruefung
  rt.dispatch({ type: "K_EIGEN_TEXT", value: EIGEN + "!" }); assert.equal(s.k().antworten[1], null);
  rt.dispatch({ type: "K_EIGEN_TEXT", value: EIGEN }); rt.dispatch({ type: "K_EIGEN_GO" }); await tick();
  rt.dispatch({ type: "K_WEITER" });
  assert.ok(rt.matches("inhalt.frei.klwarten")); await tick();
  assert.ok(rt.matches("inhalt.frei.kliste"));
  assert.deepEqual(s.klaerung.calls.find((c) => c.op === "liste").body, { id: ID, antworten: [{ art: "kachel", kachel: 0 }, { art: "eigen", text: EIGEN }] });
  v = view(rt);
  const t = text({ children: v.body });
  assert.match(t, /SO BAUEN WIR ES|So bauen wir es/); assert.match(t, /Geprüft wird: Wischen bewegt das Boot/);
  assert.match(t, /Ehrlich gesagt: Gleichzeitig online/); assert.match(t, /bis zu 15 Minuten\. Kostet 1 Guthaben – nur wenn alles klappt/);
  assert.equal(v.actions.primary.label, "Ja, so bauen");
  rt.dispatch({ type: "K_JA" }); await tick();
  assert.ok(rt.matches("inhalt.frei.kbauen")); assert.equal(s.k().auftrag, AUF);
  assert.deepEqual(s.k().optin, { push: false, mail: false }, "kein Haekchen vorausgewaehlt");
  rt.dispatch({ type: "K_OPTIN", kanal: "push", on: true }); await tick();
  assert.deepEqual(s.klaerung.calls.at(-1), { op: "optin", body: { auftrag: AUF, push: true, mail: false } });
  assert.deepEqual(s.k().optin, { push: true, mail: false });
  assert.match(text({ children: view(rt).body }), /abgebucht ist nichts/);
  rt.dispatch({ type: "K_HOME" }); assert.ok(rt.matches("inhalt.shelf"));
});

test("Fehler sind ehrlich: Server aus, kaputte Antwort, Krise; eine im Server abgelehnte Liste fuehrt zur Frage zurueck", async () => {
  const s = boot({ fragen: [{ how: "off" }, { how: "ok", body: { ...FRAGEN, fragen: [{ ...FRAGEN.fragen[0], kacheln: [{ label: "X", sub: "", emoji: "🔫" }, FRAGEN.fragen[0].kacheln[0]] }] } }, { how: "crisis", help: "Nummer gegen Kummer: 116 111" }, { how: "ok", body: FRAGEN }],
    liste: { how: "refused", reason: "weapons", frage: 1, vorschlaege: [0] }, antwort: (b) => ({ how: "ok", body: { ok: true, text: b.text } }) });
  const { rt } = s;
  rt.dispatch({ type: "FREI" }); await tick(); rt.dispatch({ type: "KLAEREN" }); rt.dispatch({ type: "K_TEXT", value: "Space Invaders" });
  rt.dispatch({ type: "K_GO" }); await tick();
  assert.ok(rt.matches("inhalt.frei.klaeren")); assert.match(text({ children: view(rt).body }), /Das Klären geht gerade nicht/);
  rt.dispatch({ type: "K_GO" }); await tick();
  assert.ok(rt.matches("inhalt.frei.klaeren"), "eine Antwort, die den Vertrag bricht, wird nicht gezeigt"); assert.equal(s.k().err.how, "off");
  rt.dispatch({ type: "K_GO" }); await tick();
  assert.match(text({ children: view(rt).body }), /116 111/);
  rt.dispatch({ type: "K_GO" }); await tick();
  rt.dispatch({ type: "K_PICK", kachel: 1 }); rt.dispatch({ type: "K_WEITER" });
  rt.dispatch({ type: "K_EIGEN_TEXT", value: "Seife" }); rt.dispatch({ type: "K_EIGEN_GO" }); await tick();
  rt.dispatch({ type: "K_WEITER" }); await tick();
  assert.ok(rt.matches("inhalt.frei.kfrage")); assert.equal(s.k().i, 1); assert.equal(s.k().antworten[1], null); assert.equal(s.k().pruef.how, "refused");
  // Abbrechen waehrend des Wartens: spaete Antworten zaehlen nicht
  rt.dispatch({ type: "K_PICK", kachel: 0 }); rt.dispatch({ type: "K_WEITER" }); rt.dispatch({ type: "CANCEL" });
  assert.ok(rt.matches("inhalt.frei.kfrage")); await tick(); assert.ok(rt.matches("inhalt.frei.kfrage"));
});

test("Fertig: Zaehler kommt vom Server; nach dem 3. Nachbessern steht Melden an seiner Stelle; der 4. Versuch wird abgelehnt", async () => {
  const s = boot({ status: STATUS(3), nachbessern: [{ how: "ok", body: { nachbessernLeft: 2 } }, { how: "ok", body: { nachbessernLeft: 1 } }, { how: "ok", body: { nachbessernLeft: 0 } }, { how: "limit" }],
    melden: { how: "ok", body: { gemeldet: true, kosten: { erlassen: true } } }, behalten: { how: "ok", body: { behalten: true, abgebucht: false, guthaben: 1 } } });
  const { rt } = s;
  rt.dispatch({ type: "K_FERTIG", auftrag: "kurz" }); assert.ok(!rt.matches("inhalt.frei.kfertig"), "nur echte Auftrags-ids");
  rt.dispatch({ type: "K_FERTIG", auftrag: AUF }); await tick();
  assert.ok(rt.matches("inhalt.frei.kfertig"));
  let v = view(rt);
  assert.match(text({ children: v.body }), /fehlt.*Mit jeder Runde etwas schneller\. – bleibt gleich schnell/);
  assert.match(text({ children: v.body }), /Ein Punkt fehlt noch\. Abgebucht ist nichts\./);
  assert.deepEqual(v.actions.secondary.map((x) => [x.id, x.sub]), [["k-nach", "kostenlos · noch 3×"], ["k-behalten", "1 Guthaben"]]);
  for (const left of [2, 1, 0]) { rt.dispatch({ type: "K_NACHBESSERN" }); await tick(); assert.equal(s.k().fertig.left, left); }
  v = view(rt);
  assert.deepEqual(v.actions.secondary.map((x) => x.id), ["k-melden-open", "k-behalten"], "Melden statt Nachbessern");
  // die App sendet keinen 4. Versuch (Wache), und selbst wenn: der Server sagt limit
  rt.dispatch({ type: "K_NACHBESSERN" }); await tick();
  assert.equal(s.klaerung.calls.filter((c) => c.op === "nachbessern").length, 3);
  assert.equal(fertigOf(STATUS(4).body), null, "mehr als 3 kann der Server nicht melden");
  rt.dispatch({ type: "K_MELDEN_OPEN" }); assert.ok(rt.matches("inhalt.frei.kmelden"));
  v = view(rt);
  const t = text({ children: v.body });
  assert.match(t, /3 von 3 Nachbesserungen gemacht/); assert.match(t, /Tut uns leid\. Wir haben es nicht so hinbekommen, wie du es wolltest\. Wir möchten das in Zukunft schaffen – sag uns, was gefehlt hat\./);
  assert.match(t, /Was hat aus deiner Sicht nicht gereicht\?/);
  const ta = all({ children: v.body }).find((n) => n.props && n.props.id === "k-meldung");
  assert.equal(ta.props.maxlength, "500");
  assert.equal(v.actions.primary.label, "Melden"); assert.equal(v.actions.secondary[0].label, "Trotzdem so behalten");
  rt.dispatch({ type: "K_MELD_TEXT", value: "x".repeat(600) }); assert.equal([...s.k().meldText].length, 500);
  rt.dispatch({ type: "K_MELD_TEXT", value: "Die Boote werden nie schneller." });
  rt.dispatch({ type: "K_MELDEN" }); await tick();
  assert.deepEqual(s.klaerung.calls.at(-1), { op: "melden", body: { auftrag: AUF, text: "Die Boote werden nie schneller." } });
  assert.match(text({ children: view(rt).body }), /Die Karte kostet dich nichts/);
  rt.dispatch({ type: "K_BEHALTEN" }); await tick();
  assert.equal(s.k().fertig.behalten, true);
  assert.match(text({ children: view(rt).body }), /Abgebucht ist nichts/);
});

test("Melden ohne Text ist erlaubt (keine Pflichtfelder); abgelehnter Text ehrlich", async () => {
  const s = boot({ status: STATUS(0), melden: [{ how: "refused", reason: "harassment" }, { how: "ok", body: { gemeldet: true, kosten: { erlassen: true } } }] });
  const { rt } = s;
  rt.dispatch({ type: "K_FERTIG", auftrag: AUF }); await tick();
  rt.dispatch({ type: "K_MELDEN_OPEN" });
  rt.dispatch({ type: "K_MELD_TEXT", value: "ihr seid ..." }); rt.dispatch({ type: "K_MELDEN" }); await tick();
  assert.match(text({ children: view(rt).body }), /bloßstellt oder beleidigt/);
  rt.dispatch({ type: "K_MELD_TEXT", value: "" }); rt.dispatch({ type: "K_MELDEN" }); await tick();
  assert.deepEqual(s.klaerung.calls.at(-1).body, { auftrag: AUF });
  assert.equal(s.k().fertig.gemeldet, true);
});

test("Ansichten: echte Buttons, Labels fuer jedes Feld, Mikrofon mit Namen, Texte de/en vollstaendig", async () => {
  assert.deepEqual(Object.keys(KLAEREN_TEXTS.de).sort(), Object.keys(KLAEREN_TEXTS.en).sort());
  const s = boot({ fragen: { how: "ok", body: FRAGEN } });
  const { rt } = s;
  rt.dispatch({ type: "FREI" }); await tick(); rt.dispatch({ type: "KLAEREN" });
  for (const leaf of ["klaeren", "kfrage"]) {
    if (leaf === "kfrage") { rt.dispatch({ type: "K_TEXT", value: "Space Invaders" }); rt.dispatch({ type: "K_GO" }); await tick(); }
    const v = view(rt), nodes = all({ children: v.body });
    for (const n of nodes.filter((x) => x.tag === "button")) { assert.equal(n.props.type, "button"); assert.ok(text(n).trim() || n.props["aria-label"], leaf + ": Button ohne Namen"); }
    for (const f of nodes.filter((x) => x.tag === "input" || x.tag === "textarea")) assert.ok(nodes.some((l) => l.tag === "label" && l.props.for === f.props.id), leaf + ": Feld ohne Label " + f.props.id);
    assert.ok(nodes.some((x) => x.props && x.props["aria-label"] === "Sprechen statt tippen"));
    assert.ok(!text({ children: v.body }).includes("["), leaf + ": fehlender Text");
  }
  const tiles = all({ children: view(rt).body }).filter((n) => n.props && n.props.class && /(^| )k-tile( |$)/.test(n.props.class));
  assert.equal(tiles.length, 3, "2 Kacheln + Egal"); assert.ok(tiles.every((t) => ["true", "false"].includes(t.props["aria-pressed"])));
  const eigen = all({ children: view(rt).body }).find((n) => n.props && n.props.id === "k-eigen-0");
  assert.equal(eigen.props.maxlength, "120");
});
