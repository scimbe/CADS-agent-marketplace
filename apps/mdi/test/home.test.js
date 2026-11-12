// Heimseite (Strang H): Fuehrung in hoechstens 3 Taps, Zurueck an den Ort, Kalender blaettern, Satz -> Absicht, Mein Regal
// (Wand mit Rueckgaengig, Einladungen mit Kurzlink, Gemerkt), Profil-Sync, Kurzlink-API, Familien decken den Katalog ab.
import test from "node:test";
import assert from "node:assert/strict";
import { machine, initialContext } from "../src/app/machine.js";
import { actionsOf, view, leaf } from "../src/ui/view.js";
import * as S from "../src/ui/home/store.js";
import * as R from "../src/ui/home/rotation.js";
import { FAMILIES, INTENT_ORDER, familiesOf, newIdOf, allCatalogIds } from "../src/ui/home/families.js";
import { profileLocal } from "../src/ui/home/feature.js";
import { createApi } from "../src/broker/api.js";
import { qrMatrix } from "../src/ui/home/qr.js";

const AT = Date.UTC(2026, 10, 12, 9);
let tick = 0;
function go(s, ev, { consumed = true } = {}) {
  const r = machine.send(s, { rand: ["a".repeat(32), "b".repeat(32), "c".repeat(32), "d".repeat(32)], at: AT + tick++ * 1000, ...ev });
  assert.equal(r.consumed, consumed, ev.type + " verbraucht=" + r.consumed);
  return r;
}
function start() { let s = machine.initial(initialContext("de")); s = go(s, { type: "HOME_LOADED", data: {} }); return s; }
const fx = (s, type) => s.effects.filter((e) => e.type === type);
const texts = (s) => JSON.stringify(view(s, () => {}), (k, x) => (k === "on" || k === "el" ? undefined : x));

test("Start laedt Mein Regal genau einmal (home.load) und zeigt das Kalenderblatt des Tages", () => {
  const s0 = machine.initial(initialContext("de"));
  assert.equal(fx(s0, "home.load").length, 1);
  const s = go(s0, { type: "HOME_LOADED", data: {} });
  assert.equal(s.ctx.today, Math.floor(AT / R.DAY));
  assert.equal(s.ctx.mine.loaded, true);
  const idea = R.ideaOn(s.ctx.today);
  assert.ok(texts(s).includes("12"), "Tag 12");
  assert.equal(idea.id, "arcade-panzer", "Altcode am 12.11.2026: Insel-Panzer");
  // Hauptaktion haengt nur davon ab, ob die Karte im Register ist: vorhanden -> Los, fehlt -> "kommt" + Merken (nie ersetzt)
  assert.equal(actionsOf(s).primary.id, newIdOf(idea.id) ? "day-go" : "day-save");
  let k = s;
  for (let off = 0; off <= 31 && newIdOf(R.ideaOn(k.ctx.today + k.ctx.home.off).id); off++) k = go(k, { type: "DAY", d: 1 });
  if (!newIdOf(R.ideaOn(k.ctx.today + k.ctx.home.off).id)) {
    assert.equal(actionsOf(k).primary.id, "day-save", "fehlende Karte: Merken");
    assert.ok(texts(k).includes("kommt"), "fehlende Karte: als kommt markiert");
  }
  const back = go(go(s, { type: "OPEN", id: "gruss" }), { type: "BACK" });
  assert.equal(fx(back, "home.load").length, 0, "Rueckkehr laedt nicht erneut");
});

test("Fuehrung: Absicht -> Karte -> Los in hoechstens 3 Taps fuer jede spielbare Karte jeder Absicht", () => {
  for (const intent of INTENT_ORDER) for (const f of familiesOf(intent)) for (const cid of f.ids) {
    const nid = newIdOf(cid);
    if (!nid) continue;
    let s = start();
    s = go(s, { type: "HOME", to: "family", intent });                      // Tap 1
    assert.ok(texts(s).includes('"data-act":"open-' + nid + '"'), intent + ": Kachel " + nid + " sichtbar");
    s = go(s, { type: "OPEN", id: nid });                                    // Tap 2
    assert.equal(leaf(s), "card.view");
    // Tap 3 = Los, bei Echtzeitkarten der Doppelknopf der aktuellen Spielweise (data-act "go", PLAY_AS)
    const duo = actionsOf(s).primary === null;
    if (duo) assert.ok(texts(s).includes('"data-act":"go"'), nid + ": Doppelknopf traegt go"); else assert.equal(actionsOf(s).primary.id, "go");
    const after = go(s, duo ? { type: "PLAY_AS", mode: s.ctx.mode } : { type: "GO" });
    assert.notEqual(leaf(after), "card.view", nid + ": Los fuehrt weiter");
  }
});

test("Zurueck aus einer Karte fuehrt dorthin, wo man war; Zurueck auf Unterseiten fuehrt zum Blatt", () => {
  let s = go(start(), { type: "HOME", to: "family", intent: "spielen" });
  s = go(s, { type: "OPEN", id: "bluff" });
  s = go(s, { type: "BACK" });
  assert.equal(leaf(s), "shelf"); assert.equal(s.ctx.home.at, "family"); assert.equal(s.ctx.home.intent, "spielen");
  s = go(s, { type: "BACK" }); assert.equal(s.ctx.home.at, "day");
  go(s, { type: "BACK" }, { consumed: false }); // auf dem Blatt von heute: App darf beendet werden
});

test("Kalender: blaettern bis 31 Tage, Heute, Letzte Tage oeffnen das Blatt jenes Tages", () => {
  let s = start();
  for (let i = 0; i < 40; i++) s = go(s, { type: "DAY", d: 1 });
  assert.equal(s.ctx.home.off, 31);
  s = go(s, { type: "BACK" }); assert.equal(s.ctx.home.off, 0, "Zurueck springt auf heute");
  s = go(s, { type: "HOME", to: "day", off: -3 });
  assert.equal(s.ctx.home.off, -3);
  assert.equal(R.ideaOn(s.ctx.today - 3).id, R.lastDays(new Date(AT), 3)[2].idea.id);
});

test("Ein Satz: 'Danke an Oma' -> Absicht Gruss, Karte Danke genau, Oma als Anrede; leer -> Hinweis", () => {
  let s = go(start(), { type: "UNDERSTAND" });
  assert.equal(s.ctx.home.note, "empty"); assert.equal(s.ctx.home.at, "day");
  s = go(s, { type: "SENTENCE", text: "Danke an Oma" });
  s = go(s, { type: "UNDERSTAND" });
  assert.equal(s.ctx.home.at, "family"); assert.equal(s.ctx.home.intent, "gruss");
  assert.deepEqual(s.ctx.home.res.top[0], { id: "karte-danke", exact: true });
  assert.ok(texts(s).includes("Oma"));
});

test("Fertig verschickt: Werk auf die Wand, Link ins Archiv, Kurzlink angefragt; Ergebnis setzt den Status", () => {
  let s = go(start(), { type: "OPEN", id: "gruss" });
  s = go(s, { type: "GO" });
  assert.equal(leaf(s), "card.share");
  assert.equal(s.ctx.mine.invites.length, 1); assert.equal(s.ctx.mine.wall.length, 1);
  const f = s.ctx.mine.invites[0].f;
  assert.match(f, /^v2\.card\./);
  assert.deepEqual(fx(s, "short.create").map((e) => e.f), [f]);
  assert.equal(fx(s, "wall.snap").length, 1); assert.equal(fx(s, "home.save").length, 1);
  s = go(s, { type: "SHORT_DONE", f, r: { ok: false, error: "form" } });
  assert.equal(s.ctx.mine.invites[0].st, "lang", "Server kennt die Form nicht: ehrlich langer Link");
  s = go(s, { type: "SHORT_DONE", f, r: { ok: true, s: { id: "Ab3dEf7h", token: "t", exp: AT + 90 * R.DAY, url: "https://bunsenbrenner.org/s/Ab3dEf7h" } } });
  assert.equal(S.inviteStatus(s.ctx.mine.invites[0], AT).k, "bis");
  // erneutes Betreten mit demselben Link: kein zweiter Eintrag
  s = go(go(s, { type: "BACK" }), { type: "GO" });
  assert.equal(s.ctx.mine.invites.length, 1);
  // Loeschen mit Kurzlink: erst der Server, dann lokal
  s = go(go(s, { type: "BACK" }), { type: "BACK" });
  s = go(s, { type: "HOME", to: "meins", tab: "einladungen" });
  s = go(s, { type: "INV_DELETE", f });
  assert.equal(fx(s, "short.delete").length, 0, "erster Tipp fragt nur nach"); assert.equal(s.ctx.home.sure, f);
  assert.ok(texts(s).includes("Wirklich löschen?"));
  s = go(s, { type: "INV_DELETE", f });
  assert.equal(fx(s, "short.delete").length, 1); assert.equal(s.ctx.mine.invites.length, 1);
  s = go(s, { type: "SHORT_DELETED", f, ok: false }); assert.equal(s.ctx.home.note, "delFail"); assert.equal(s.ctx.mine.invites.length, 1);
  s = go(s, { type: "INV_DELETE", f }); s = go(s, { type: "INV_DELETE", f }); s = go(s, { type: "SHORT_DELETED", f, ok: true });
  assert.equal(s.ctx.mine.invites.length, 0);
});

test("Wand: abnehmen sofort, Rueckgaengig binnen 6 s, danach weg; Merken schaltet", () => {
  let s = go(go(start(), { type: "OPEN", id: "gruss" }), { type: "GO" });
  s = go(go(s, { type: "BACK" }), { type: "BACK" });
  s = go(s, { type: "HOME", to: "meins" });
  s = go(s, { type: "WALL_OFF", i: 0 });
  assert.equal(s.ctx.mine.wall.length, 0); assert.ok(s.ctx.mine.undo); assert.equal(fx(s, "home.later").length, 1);
  s = go(s, { type: "WALL_UNDO" }); assert.equal(s.ctx.mine.wall.length, 1);
  s = go(s, { type: "WALL_OFF", i: 0 });
  s = go(s, { type: "HOME_TICK", at: AT + 1e6 }); assert.equal(s.ctx.mine.undo, null, "abgelaufen");
  assert.equal(S.undoOff([], { e: { id: "x" }, i: 0, at: 0 }, S.UNDO_MS).length, 0, "nach 6 s kein Rueckgaengig");
  s = go(s, { type: "MERKEN", id: "zug-kennst" }); assert.equal(s.ctx.mine.saved.length, 1);
  s = go(s, { type: "MERKEN", id: "zug-kennst" }); assert.equal(s.ctx.mine.saved.length, 0);
});

test("Profil-Sync: lokale Wand nur mit Bild zum Server; Server-Profil wird zusammengefuehrt", () => {
  let s = go(go(start(), { type: "OPEN", id: "gruss" }), { type: "GO" });
  assert.deepEqual(profileLocal(s.ctx).wall, [], "ohne Bild noch nichts fuer den Server");
  const th = "data:image/jpeg;base64,AAAA";
  s = go(s, { type: "WALL_SNAP", id: "gruss", ts: s.ctx.mine.wall[0].ts, th });
  assert.equal(profileLocal(s.ctx).wall.length, 1); assert.equal(profileLocal(s.ctx).wall[0].th, th);
  assert.match(profileLocal(s.ctx).wall[0].f, /^v2\.card\./, "Link des Werks reist mit (wrapper #132)");
  assert.ok(!("p" in profileLocal(s.ctx).wall[0]), "Einstellungen bleiben lokal");
  const remote = { me: {}, wall: [{ id: "karte-danke", ts: AT - 5000, k: "card", th }], saved: [{ id: "zug-bluff", ts: AT - 1 }] };
  s = go(s, { type: "PROFIL", op: "get", result: { ok: true, profile: remote, rev: 3 } });
  assert.equal(s.ctx.mine.wall.length, 2); assert.equal(s.ctx.mine.wall[0].id, "gruss", "neueste zuerst");
  assert.deepEqual(s.ctx.mine.saved.map((x) => x.id), ["zug-bluff"]);
});

test("Speicher: Grenzen wie der Server, kaputte Eintraege fallen weg, keine Fotos", () => {
  const th = "data:image/jpeg;base64,AAAA";
  const many = Array.from({ length: 40 }, (_, i) => ({ id: "karte-danke", ts: i + 1, k: "card", th }));
  assert.equal(S.cleanWall(many).length, 30);
  assert.equal(S.cleanWall([{ id: "x", ts: 1, k: "photo", th }]).length, 0);
  assert.equal(S.cleanWall([{ id: "x", ts: 1, k: "card" }]).length, 0, "weder Bild noch Einstellungen");
  assert.equal(S.cleanWall([{ id: "x", ts: 1, k: "card", th: "data:image/png;base64,AA" }]).length, 0);
  assert.equal(S.cleanInvites([{ f: "v2.live.abc", c: "bluff", ts: 1 }]).length, 0, "Live-Einladungen nie im Archiv");
  assert.equal(S.cleanSaved([{ id: "a", ts: 1 }, { id: "a", ts: 2 }]).length, 1);
});

test("Familien: jede der 64 Regalkarten genau einmal; Absichten decken alle Familien ab", () => {
  const ids = FAMILIES.flatMap((f) => f.ids);
  assert.equal(new Set(ids).size, ids.length, "keine Karte doppelt");
  assert.deepEqual([...ids].sort(), [...allCatalogIds()].sort());
  for (const f of FAMILIES) assert.ok(INTENT_ORDER.includes(f.intent), f.id);
});

test("Kurzlink-API (broker/api.js): 201 ok, 400 Form unbekannt, Netzfehler, Loeschen mit Token, 410 = schon weg", async () => {
  const calls = [];
  const resp = (status, body) => ({ status, json: async () => body });
  const queue = [resp(201, { id: "Ab3dEf7h", url: "https://bunsenbrenner.org/s/Ab3dEf7h", token: "tok", exp: 99 }), resp(400, { error: "bad-fragment" }), null, resp(410, {}), resp(201, { id: "Ab3dEf7h", url: "https://evil.example/x", token: "t", exp: 1 })];
  const api = createApi({ location: { protocol: "https:", host: "bunsenbrenner.org" }, fetch: async (u, o) => { calls.push([u, o.method, o.headers]); const r = queue.shift(); if (!r) throw new Error("offline"); return r; } });
  assert.deepEqual(await api.shortCreate("v2.card.x", "card", "de"), { ok: true, s: { id: "Ab3dEf7h", token: "tok", exp: 99, url: "https://bunsenbrenner.org/s/Ab3dEf7h" } });
  assert.equal((await api.shortCreate("v2.card.x", "card", "de")).error, "form");
  assert.equal((await api.shortCreate("v2.card.x", "card", "de")).error, "netz");
  assert.deepEqual(await api.shortDelete("Ab3dEf7h", "tok"), { ok: true });
  assert.equal(calls[3][1], "DELETE"); assert.equal(calls[3][2].Authorization, "Bearer tok");
  assert.equal((await api.shortCreate("v2.card.x", "card", "de")).error, "server", "fremde Adresse abgelehnt");
  assert.equal(calls[0][0], "/api/s");
});

test("Story-Bild: Adresse passt in den QR-Code, auch der lange Link", () => {
  assert.ok(qrMatrix("https://bunsenbrenner.org/s/Ab3dEf7h").length <= 33);
  assert.ok(qrMatrix("https://bunsenbrenner.org/duell#v2.card." + "A".repeat(1100)).length <= 177);
});

import { effects as homeEffects, proofFor } from "../src/ui/home/effects.js";
test("Kurzlink ohne Anmeldung: Geraete-Kennung + Arbeitsnachweis (16 Bit) gehen mit (wrapper #136); ohne Nachweis kein Raten", async () => {
  const device = "0123456789abcdef0123456789abcdef", calls = [];
  const api = { shortCreate: async (...a) => { calls.push(a); return { ok: false, error: "form" }; } };
  const done = new Promise((res) => homeEffects["short.create"]({ f: "v2.card.abc", lang: "de" }, { dispatch: res, api, deps: { home: { subtle: globalThis.crypto.subtle } }, state: () => ({ ctx: { device } }) }));
  const ev = await done;
  assert.equal(ev.type, "SHORT_DONE");
  const [f, k, l, dev, proof] = calls[0];
  assert.deepEqual([f, k, l, dev], ["v2.card.abc", "card", "de", device]);
  const h = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(device + ":" + proof)));
  assert.ok(h[0] === 0 && h[1] === 0, "16 fuehrende Nullbits");
  assert.equal(await proofFor(device, globalThis.crypto.subtle), proof, "einmal je Geraet");
  assert.equal(await proofFor("kein-geraet", globalThis.crypto.subtle), null);
  assert.equal(await proofFor(device, null), null, "ohne WebCrypto kein Nachweis");
});

test("Laden eines Teils: main traegt data-loading=<teil> und aria-busy, die Ladezeile kuendigt sich an (aria-live); danach weg", () => {
  const s = start();
  const find = (n, pred) => { if (!n || typeof n !== "object") return null; if (pred(n)) return n; for (const c of n.children || []) { const r = find(c, pred); if (r) return r; } return null; };
  const mainOf = (st) => find({ children: [].concat(view(st, () => {})) }, (n) => n.tag === "main");
  const busy = { ...s, ctx: { ...s.ctx, loading: "home-find" } };
  const m = mainOf(busy);
  assert.equal(m.props["data-loading"], "home-find"); assert.equal(m.props["aria-busy"], "true");
  const line = find(m, (n) => n.props && n.props.class === "h-loading");
  assert.equal(line.props.role, "status"); assert.equal(line.props["aria-live"], "polite");
  const idle = mainOf(s);
  assert.equal(idle.props["data-loading"], null); assert.equal(idle.props["aria-busy"], null);
});

test("Gate C: Mein Regal heisst so (de/en) und hat ein Symbol; Eigene Karte ist ein eigener Block mit Satzfeld", () => {
  const s = start(), t = texts(s);
  assert.ok(t.includes("Mein Regal"), "Kopfzeile");
  assert.ok(!/"Meins"/.test(t), "kein altes Wort");
  assert.ok(t.includes('"data-act":"frei"') && t.includes('"id":"frei-satz"') && t.includes("Neu erfinden"), "Block Neu erfinden mit Satzfeld");
  assert.ok(t.includes('"data-act":"intent-suchen"') && !t.includes('"data-act":"intent-eigene"'), "Suchen statt Eigene Karte");
  const en = machine.send(machine.initial(initialContext("en")), { type: "HOME_LOADED", data: {}, at: AT });
  assert.ok(texts(en).includes("My shelf"));
  const m = go(s, { type: "HOME", to: "meins" });
  assert.ok(texts(m).includes("Mein Regal"), "Ueberschrift");
});

test("Kopfzeile Start: ohne Zurueck keine leere Spalte (bar-noback), Schrift-Knopf zeigt AA nebeneinander", () => {
  const s = start(), t = texts(s);
  assert.ok(t.includes('"class":"bar bar-noback"'), "Startseite ohne Zurueck");
  assert.ok(t.includes('"class":"h-headbtn-i h-aa"'));
  const deep = go(s, { type: "HOME", to: "meins" });
  assert.ok(texts(deep).includes('"class":"bar"'), "mit Zurueck die normale Kopfzeile");
});

test("Folge-PR 2: Spiel des Tages startet mit einem Ereignis OPEN {start}; Erst ueben = gegen den Computer bzw. ein Geraet; hoechstens 3 Taps bis zum Spiel", async () => {
  const { dayPrimary, practiceOf } = await import("../src/ui/home/views.js");
  const { modesOfId, manifestOf } = await import("../src/cards/index.js");
  const s = start();
  let game = null, practice = null, card = null;
  for (let off = -60; off <= 60 && !(game && practice && card); off++) {
    const p = dayPrimary({ ...s.ctx, home: { ...s.ctx.home, off } });
    if (!p || !p.ev || p.ev.type !== "OPEN") continue;
    const st = manifestOf(p.ev.id).mode === "static";
    if (st) { card = card || p; assert.equal(p.ev.start, undefined, "Karten oeffnen zum Gestalten"); assert.equal(p.practice, undefined); continue; }
    assert.equal(p.ev.start, true, p.ev.id);
    game = game || { p, off };
    if (p.practice) {
      practice = practice || { p, off };
      const modes = modesOfId(p.ev.id, p.ev.variant);
      assert.equal(p.practice.ev.mode, modes.includes("bot") ? "bot" : "alone", p.ev.id);
      assert.equal(p.practice.sub, modes.includes("bot") ? "gegen den Computer" : "ein Gerät");
    } else assert.equal(practiceOf(p.ev.id, p.ev.variant), null);
  }
  assert.ok(game && practice && card, "Tage mit Spiel, Uebung und Karte gefunden");
  // Taps: Start (0) -> Jetzt spielen (1) = im Spiel; Erst ueben ebenso mit Uebungsweise
  for (const [ev, mode] of [[game.p.ev, null], [practice.p.practice.ev, practice.p.practice.ev.mode]]) {
    const r = go(s, ev);
    assert.ok(r.config.some((c) => c === "inhalt.card.play" || c === "inhalt.card.rt"), "ein Tap bis ins Spiel: " + ev.id + " " + r.config.join(" "));
    if (mode) assert.equal(r.ctx.mode, mode);
  }
});

test("Spielkopf: Spielweise wechselbar bis zum ersten Zug (MODE), danach gesperrt mit Grund", () => {
  let s = start();
  s = go(s, { type: "OPEN", id: "zug-einkauf", start: true });
  assert.ok(s.config.some((c) => c.startsWith("inhalt.card.play")), s.config.join(" "));
  const find = (n, pred, out = []) => { if (!n || typeof n !== "object") return out; if (pred(n)) out.push(n); for (const c of n.children || []) find(c, pred, out); return out; };
  const pm = (st) => find({ children: [].concat(view(st, () => {})) }, (n) => n.props && /^pm-/.test(n.props["data-act"] || ""));
  let b = pm(s);
  assert.deepEqual(b.map((x) => x.props["data-act"]), ["pm-link", "pm-alone"]);
  assert.ok(b.every((x) => !x.props.disabled), "vor dem ersten Zug frei");
  assert.ok(texts(s).includes("Wechseln geht bis zum ersten Zug."));
  const moved = { ...s, ctx: { ...s.ctx, session: { ...(s.ctx.session || {}), log: [{ t: "move" }] } } };
  b = pm(moved);
  assert.equal(b.find((x) => x.props["data-act"] === "pm-alone").props.disabled, true, "nach dem ersten Zug gesperrt");
  assert.ok(texts(moved).includes("Nach dem ersten Zug bleibt die Spielweise."));
});

test("Mein Regal wie Board Meins: Gemacht | Verschickt | Gemerkt, Kacheln mit ⋯-Menue, Kopfzeile ohne Knoepfe (Ueberschrift ungekuerzt)", () => {
  let s = go(go(start(), { type: "OPEN", id: "gruss" }), { type: "GO" });
  s = go(go(s, { type: "BACK" }), { type: "BACK" });
  s = go(s, { type: "HOME", to: "meins" });
  const k = String(s.ctx.mine.wall[0].ts);
  const t = texts(s);
  assert.ok(t.includes("Gemacht 1") && t.includes("Verschickt 1") && t.includes("Gemerkt 0"), "Reiter: " + t.match(/Gemacht[^"]*|Verschickt[^"]*/g));
  assert.ok(!t.includes('"data-act":"schrift"') && !t.includes('"data-act":"stil"'), "keine Kopfknoepfe auf Mein Regal");
  assert.ok(t.includes('"data-act":"wall-more-0"') && !t.includes('"data-act":"wall-off-0"'), "Menue zu");
  const m = go(s, { type: "WMENU", k });
  assert.ok(texts(m).includes('"data-act":"wall-off-0"') && texts(m).includes('"aria-expanded":"true"'), "Menue offen");
  const off = go(m, { type: "WALL_OFF", i: 0 });
  assert.equal(off.ctx.home.menu, null, "nach dem Abnehmen zu");
});

test("Board Desktop: Suchfeld in der Kopfzeile nur breit (Umgebung wide), Tippen fuehrt mit einem Ereignis ins Regal; Absicht-Symbole als Strich", () => {
  const s = start();
  const wide = JSON.stringify(view(s, () => {}, { wide: true }), (k, x) => (k === "on" || k === "el" ? undefined : x));
  assert.ok(wide.includes('"class":"h-headsearch"') && wide.includes("Alle "), "breit: Suchfeld in der Kopfzeile");
  assert.ok(!texts(s).includes('"class":"h-headsearch"'), "schmal: kein Suchfeld oben");
  const r = go(s, { type: "QUERY", q: "quiz", open: true });
  assert.equal(r.ctx.home.at, "regal"); assert.equal(r.ctx.home.q, "quiz"); assert.equal(r.ctx.home.rtab, "alles");
  const rw = JSON.stringify(view(r, () => {}, { wide: true }), (k, x) => (k === "on" || k === "el" ? undefined : x));
  assert.equal((rw.match(/"id":"h-q"/g) || []).length, 1, "breit genau ein Suchfeld (oben), im Regal nicht doppelt");
  assert.ok(texts(s).includes('"class":"h-ico h-line"'), "Strich-Symbole");
});

test("Startansicht Flug (Board GFlugStart): Level-Regler mit -/+ und Stufennamen; LEVEL_STEP setzt nur Stufenwerte; Spielkopf mit Leiste und Regeln", () => {
  let s = go(start(), { type: "OPEN", id: "flug", variant: "spiel-lava" });
  const t = texts(s);
  for (const k of ["gravity", "jump", "gap", "speed"]) assert.ok(t.includes('"data-act":"lv-minus-' + k + '"') && t.includes('"data-act":"lv-plus-' + k + '"'), k);
  assert.ok(t.includes('"aria-valuetext"'), "Vorlesehilfe nennt die Stufe");
  const g0 = s.ctx.params.flug ? s.ctx.params.flug.gravity : null;
  const r = go(s, { type: "LEVEL_STEP", key: "gravity", value: 900 });
  assert.equal(r.ctx.params.flug.gravity, 900); assert.ok(texts(r).includes("Mond"), "Stufenname");
  const bad = go(r, { type: "LEVEL_STEP", key: "gravity", value: 1000 });
  assert.equal(bad.ctx.params.flug.gravity, 900, "nur Stufenwerte");
  assert.notEqual(g0, undefined);
  let p = go(start(), { type: "OPEN", id: "zug-einkauf", start: true });
  const pt = texts(p);
  assert.ok(pt.includes("Du bist dran") && pt.includes('"class":"play-bar"') && pt.includes("Regeln"), "Leiste und Regeln");
});

test("Varianten-Chips: nur Varianten mit chip (Manifest), Wechsel per VARIANT", async () => {
  const { levelBox } = await import("../src/ui/view.js");
  const card = { manifest: { id: "flug", title: { de: "Flug" }, params: { properties: {} }, variants: [{ id: "a", chip: { de: "Klassisch" } }, { id: "b" }, { id: "c", chip: { de: "Mond", en: "Moon" } }] } };
  const sent = [], n = levelBox(card, { lang: "de", variant: "a", params: {}, cardId: "flug" }, (e) => sent.push(e));
  const find = (x, pred, out = []) => { if (!x || typeof x !== "object") return out; if (pred(x)) out.push(x); for (const c of x.children || []) find(c, pred, out); return out; };
  const chips = find(n, (x) => x.props && /^lv-var-/.test(x.props["data-act"] || ""));
  assert.deepEqual(chips.map((c) => c.children[0]), ["Klassisch", "Mond"]);
  assert.equal(chips[0].props["aria-pressed"], "true");
  chips[1].props.on.click(); assert.deepEqual(sent, [{ type: "VARIANT", variant: "c" }]);
  assert.equal(levelBox({ manifest: { params: { properties: {} }, variants: [{ id: "x" }] } }, { lang: "de", params: {} }, () => {}), null, "ohne Stufen und Chips nichts");
});

test("VARIANT in der Startansicht: nur Varianten mit chip, Parameter der Variante, Schema geprueft", () => {
  let s = go(start(), { type: "OPEN", id: "flug" });
  const r = go(s, { type: "VARIANT", variant: "spiel-mond" });
  assert.equal(r.ctx.variant, "spiel-mond");
  assert.equal(r.ctx.params.flug.gravity, 1000, "Parameter der Variante (spiel-mond: gravity 1000)");
  const no = go(r, { type: "VARIANT", variant: "plan-01" });
  assert.equal(no.ctx.variant, "spiel-mond", "Variante ohne chip wird nicht gewechselt");
});

test("Echtzeitkarten: Startansicht dunkel (rt-dark), Doppelknopf aus play.offer, PLAY_AS startet mit dieser Spielweise; Kopf in Familienfarbe", async () => {
  const { duoOf } = await import("../src/ui/view.js");
  let s = go(start(), { type: "OPEN", id: "arcade-kick" });
  const t = texts(s);
  assert.ok(t.includes("rt-dark"), "dunkle Startansicht");
  const { cardOf } = await import("../src/cards/index.js");
  assert.deepEqual(duoOf(cardOf(s.ctx.cardId), s.ctx), ["bot", "live"]);
  assert.ok(t.includes("Gegen den Computer") && t.includes('"data-act":"go-live"') && t.includes('"data-act":"go"'));
  assert.ok(t.includes('"class":"bar bar-fam"'), "Kopf in Familienfarbe");
  const r = go(s, { type: "PLAY_AS", mode: "bot" });
  assert.notEqual(leaf(r), "card.view"); assert.equal(r.ctx.mode, "bot");
  const no = go(s, { type: "PLAY_AS", mode: "link" }, { consumed: false });
  assert.equal(leaf(no), "card.view", "fremde Spielweise startet nicht");
  const turn = go(start(), { type: "OPEN", id: "zug-einkauf" });
  assert.ok(!texts(turn).includes("rt-dark") && actionsOf(turn).primary.id === "go", "Zugkarten wie bisher");
});
