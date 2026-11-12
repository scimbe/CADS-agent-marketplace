// Konto-Region der Statechart (anonym / anmelden / angemeldet / abmelden / fehler) und die Mein-Stil-Bildschirme.
// Die Ergebnisse, die als Ereignisse hereinkommen, entstehen aus den aufgenommenen Antworten des echten Wrappers ueber das
// API-Modul – also genau die Formen, die die Seite im Betrieb sieht.
import test from "node:test";
import assert from "node:assert/strict";
import { machine, initialContext } from "../src/app/machine.js";
import { actionsOf, view, leaf } from "../src/ui/view.js";
import { kontoSaved } from "../src/app/konto-chart.js";
import { createRuntime } from "../src/app/runtime.js";
import { apiFor, scriptedApi, REC, ex } from "./wrapper.js";
import { counter } from "./helpers.js";

const DEV = REC.device, T0 = Date.UTC(2026, 10, 11, 9);
const rnd = counter("c"), R = () => [rnd(), rnd(), rnd(), rnd()];
async function result(name, call) { const { api } = apiFor(name, { loose: true }); return call(api); }
const status = (n) => result(n, (a) => a.status(DEV));
const get = (n, w = { via: "account" }) => result(n, (a) => a.profileGet(w));
const putR = (n, w = { via: "account" }) => result(n, (a) => a.profilePut(w, { rev: 0, profile: {} }));

function go(s, ev, { consumed = true } = {}) {
  const r = machine.send(s, { at: T0 + 1000, rand: R(), ...ev });
  assert.equal(r.consumed, consumed, ev.type + " in " + r.config.join());
  assert.equal(machine.valid(r.config), null);
  return r;
}
const K = (s) => s.config.find((c) => c.startsWith("konto.")).slice(6);
const fx = (s, type) => s.effects.filter((e) => e.type === type);

test("Start: Konto wird geprueft (Effekt konto.status); anonym -> Anmelden nur mit 16+-Haken, sonst Hinweis", async () => {
  let s = machine.initial(initialContext("de"));
  assert.equal(K(s), "pruefen"); assert.deepEqual(s.effects, [{ type: "konto.status" }]);
  s = go(s, { type: "STATUS", result: await status("status-anonym") });
  assert.equal(K(s), "anonym"); assert.equal(s.ctx.konto.st.ki.remaining, 7);
  s = go(s, { type: "STIL" }); assert.equal(leaf(s), "stil.start");
  assert.equal(actionsOf(s).primary.id, "login");
  s = go(s, { type: "LOGIN" });
  assert.equal(K(s), "anonym", "ohne Haken kein Sprung zum Gate"); assert.equal(s.ctx.konto.need16, true); assert.deepEqual(s.effects, []);
  const txt = JSON.stringify(view(s, () => {}), (k, x) => (k === "on" || k === "el" ? undefined : x));
  assert.ok(txt.includes("Bitte zuerst bestätigen: Ich bin 16 oder älter."), "Hinweis sichtbar");
  s = go(s, { type: "AGE16", on: true }); assert.equal(s.ctx.konto.need16, false);
  s = go(s, { type: "LOGIN" });
  assert.equal(K(s), "anmelden");
  assert.deepEqual(s.effects.map((e) => e.type), ["device.save", "konto.login"]);
  assert.deepEqual(s.ctx.konto.attempt, { age16: true, t0: T0 + 1000 });
  assert.deepEqual(kontoSaved(s.ctx).attempt, { age16: true, t0: T0 + 1000 }, "der Versuch ueberlebt die Seitenwechsel zum Gate");
});

test("Zurueck vom Gate: angemeldet, Profil leer -> mit der 16+-Aussage dieses Tipps angelegt (age16+fresh), dann gesichert", async () => {
  const saved = { device: DEV, me: { nick: "Lea", emoji: "🦝", colors: ["#2b4bff", "#ffe600"], set: "weltall" }, attempt: { age16: true, t0: T0 } };
  let s = machine.initial(initialContext("de", saved));
  s = go(s, { type: "STATUS", result: await status("status-angemeldet-ohne-16"), logout: "https://bunsenbrenner.org/gate/logout?host=h&return=%2Fduell" });
  assert.equal(K(s), "angemeldet"); assert.equal(s.ctx.profil.via, "account");
  assert.deepEqual(fx(s, "profil.get"), [{ type: "profil.get", who: { via: "account" } }]);
  s = go(s, { type: "PROFIL", op: "get", who: { via: "account" }, result: await get("profil-get-leer") });
  const [p] = fx(s, "profil.put");
  assert.equal(p.body.age16, true); assert.equal(p.body.fresh, true); assert.equal(p.body.rev, 0);
  assert.equal(p.body.profile.me.nick, "Lea", "der eigene Stil geht mit"); assert.deepEqual(p.body.profile.wall, []);
  s = go(s, { type: "PROFIL", op: "put", who: { via: "account" }, body: p.body, result: await putR("profil-put-mit-16") });
  assert.equal(s.ctx.profil.exists, true); assert.equal(s.ctx.profil.rev, 1); assert.equal(s.ctx.profil.sync, "ok");
  assert.equal(s.ctx.konto.attempt, null, "die Aussage gilt genau einmal");
});

test("Angemeldet ohne Versuch: Profil wird NICHT still angelegt; die Seite fragt 16+ und legt erst dann an", async () => {
  let s = machine.initial(initialContext("de", { device: DEV }));
  s = go(s, { type: "STATUS", result: await status("status-angemeldet-ohne-16") });
  s = go(s, { type: "PROFIL", op: "get", who: { via: "account" }, result: await get("profil-get-leer") });
  assert.deepEqual(fx(s, "profil.put"), [], "nichts angelegt");
  assert.equal(s.ctx.profil.sync, "need16");
  s = go(go(s, { type: "STIL" }), { type: "PROFIL_NEU" });
  assert.equal(s.ctx.konto.need16, true); assert.deepEqual(fx(s, "profil.put"), []);
  s = go(go(s, { type: "AGE16", on: true }), { type: "PROFIL_NEU" });
  assert.equal(fx(s, "profil.put")[0].body.age16, true);
  // ein Versuch aelter als 30 Minuten traegt keine Aussage mehr
  let o = machine.initial(initialContext("de", { device: DEV, attempt: { age16: true, t0: T0 - 31 * 60000 } }));
  o = go(o, { type: "STATUS", result: await status("status-angemeldet-ohne-16") });
  o = go(o, { type: "PROFIL", op: "get", who: { via: "account" }, result: await get("profil-get-leer") });
  assert.deepEqual(fx(o, "profil.put"), []); assert.equal(o.ctx.profil.sync, "need16");
});

test("Abgebrochene Anmeldung: wieder anonym mit ehrlichem Hinweis; Abbrechen loescht den Versuch", async () => {
  let s = machine.initial(initialContext("de", { device: DEV, attempt: { age16: true, t0: T0 } }));
  s = go(s, { type: "STATUS", result: await status("status-anonym") });
  assert.equal(K(s), "anonym"); assert.equal(s.ctx.konto.note, "pending");
  s = go(s, { type: "CANCEL_LOGIN" }); assert.equal(s.ctx.konto.attempt, null); assert.equal(s.ctx.konto.note, null);
});

test("Mein Stil bearbeiten: lokal sofort, beim Verlassen gesichert; veraltete Revision -> neu lesen und erneut schreiben", async () => {
  let s = machine.initial(initialContext("de", { device: DEV, link: { via: "account", rev: 1, exists: true, remote: { me: {}, wall: [{ id: "w" }], saved: [] } } }));
  s = go(s, { type: "STATUS", result: await status("status-angemeldet-16") });
  s = go(s, { type: "PROFIL", op: "get", who: { via: "account" }, result: await get("profil-get-da") });
  assert.equal(s.ctx.me.nick, "Lea", "Server-Stand uebernommen"); assert.equal(s.ctx.profil.dirty, false);
  s = go(s, { type: "STIL" });
  s = go(s, { type: "ME", key: "nick", value: "Lea M" });
  assert.deepEqual(fx(s, "device.save").length, 1); assert.equal(s.ctx.profil.dirty, true);
  s = go(s, { type: "ME", key: "colors", value: ["#0b3d91", "#ffd400"] });
  s = go(s, { type: "ME", key: "nick", value: "lea@example.org" });
  assert.equal(s.ctx.me.nick, "Lea M", "Kontaktangabe wird nicht uebernommen"); assert.equal(s.ctx.konto.nickErr, true);
  s = go(s, { type: "DONE" });
  assert.equal(leaf(s), "shelf");
  const [p] = fx(s, "profil.put");
  assert.equal(p.body.profile.me.nick, "Lea M"); assert.deepEqual(p.body.profile.me.colors, ["#0b3d91", "#ffd400"]);
  s = go(s, { type: "PROFIL", op: "put", who: { via: "account" }, body: p.body, result: await putR("profil-put-veraltet") });
  assert.deepEqual(fx(s, "profil.get"), [{ type: "profil.get", who: { via: "account" } }], "409 -> neu lesen");
  s = go(s, { type: "PROFIL", op: "get", who: { via: "account" }, result: await get("profil-get-da") });
  assert.equal(s.ctx.me.nick, "Lea M", "eigene Aenderung bleibt"); assert.equal(fx(s, "profil.put")[0].body.rev, 1);
  s = go(s, { type: "PROFIL", op: "put", who: { via: "account" }, body: fx(s, "profil.put")[0].body, result: await putR("profil-put-18") });
  assert.equal(s.ctx.profil.dirty, false); assert.equal(s.ctx.profil.rev, 2);
});

test("18+: eigene Angabe geht als age18 an den Server und wird angezeigt", async () => {
  let s = machine.initial(initialContext("de", { device: DEV, link: { via: "account", rev: 1, exists: true, remote: { me: {}, wall: [], saved: [] } } }));
  s = go(s, { type: "STATUS", result: await status("status-angemeldet-16") });
  s = go(s, { type: "PROFIL", op: "get", who: { via: "account" }, result: await get("profil-get-da") });
  s = go(s, { type: "AGE18", on: true });
  const [p] = fx(s, "profil.put"); assert.equal(p.body.age18, true);
  s = go(s, { type: "PROFIL", op: "put", who: { via: "account" }, body: p.body, result: await putR("profil-put-18") });
  assert.equal(s.ctx.profil.age18, true);
  // nicht angemeldet: kein 18+
  const a = go(machine.initial(initialContext("de")), { type: "STATUS", result: await status("status-anonym") });
  go(a, { type: "AGE18", on: true }, { consumed: false });
});

test("Gutschein: zu kurz, unbekannt, ok -> Guthaben neu abfragen; ohne Konto gibt es kein Einloesen", async () => {
  let s = go(machine.initial(initialContext("de")), { type: "STATUS", result: await status("status-angemeldet-16") });
  s = go(s, { type: "REDEEM" }); assert.equal(s.ctx.konto.redeem.error, "kurz"); assert.deepEqual(fx(s, "redeem"), []);
  s = go(s, { type: "VOUCHER_TEXT", value: "FALSCH-1234" });
  s = go(s, { type: "REDEEM" }); assert.deepEqual(fx(s, "redeem"), [{ type: "redeem", code: "FALSCH-1234" }]); assert.equal(s.ctx.konto.redeeming, true);
  s = go(s, { type: "REDEEM" }, { consumed: true }); assert.deepEqual(fx(s, "redeem"), [], "kein zweiter Aufruf, solange einer laeuft");
  s = go(s, { type: "REDEEMED", result: await result("gutschein-unbekannt", (a) => a.redeem("FALSCH-1234")) });
  assert.equal(s.ctx.konto.redeem.error, "unknown"); assert.deepEqual(fx(s, "konto.status"), []);
  s = go(go(s, { type: "VOUCHER_TEXT", value: "test-gutschein-1" }), { type: "REDEEM" });
  s = go(s, { type: "REDEEMED", result: await result("gutschein-ok", (a) => a.redeem("x")) });
  assert.deepEqual(s.ctx.konto.redeem, { ok: true, added: 5, credit: 5 }); assert.equal(s.ctx.konto.voucher, "");
  assert.equal(fx(s, "konto.status").length, 1, "Guthaben wird beim Server neu abgefragt, nicht lokal gerechnet");
  s = go(s, { type: "STATUS", result: await status("status-guthaben") });
  assert.equal(K(s), "angemeldet"); assert.equal(s.ctx.konto.st.karte.credit, 5);
  const a = go(machine.initial(initialContext("de")), { type: "STATUS", result: await status("status-anonym") });
  go(go(a, { type: "VOUCHER_TEXT", value: "ABCDEF" }), { type: "REDEEM" }, { consumed: false });
});

test("Abmelden: nur mit Abmelde-Adresse des Servers; trennt die Konto-Verknuepfung und verlaesst die Seite", async () => {
  let s = machine.initial(initialContext("de", { device: DEV }));
  s = go(s, { type: "STATUS", result: await status("status-angemeldet-16") });
  go(s, { type: "LOGOUT" }, { consumed: false });
  s = go(machine.initial(initialContext("de", { device: DEV })), { type: "STATUS", result: await status("status-angemeldet-16"), logout: "https://bunsenbrenner.org/gate/logout?host=h&return=%2Fduell" });
  s = go(s, { type: "LOGOUT" });
  assert.equal(K(s), "abmelden"); assert.equal(s.ctx.profil.via, null);
  assert.deepEqual(fx(s, "konto.logout"), [{ type: "konto.logout", url: "https://bunsenbrenner.org/gate/logout?host=h&return=%2Fduell" }]);
  s = go(s, { type: "NAV_FAIL", reason: "nicht-hier" }); assert.equal(K(s), "fehler");
});

test("Fehler sind ehrlich: Gate weg -> fehler (erneut pruefbar); ohne Server-Seite -> fehler „nicht-hier“ ohne toten Knopf", async () => {
  let s = go(machine.initial(initialContext("de")), { type: "STATUS", result: await status("status-gate-weg") });
  assert.equal(K(s), "fehler"); assert.equal(s.ctx.konto.err, "anmeldung-weg");
  s = go(s, { type: "STIL" }); assert.equal(actionsOf(s).primary.id, "retry");
  s = go(s, { type: "CHECK" }); assert.equal(K(s), "pruefen"); assert.deepEqual(fx(s, "konto.status"), [{ type: "konto.status" }]);
  let n = go(machine.initial(initialContext("de")), { type: "STATUS", result: { ok: false, error: "nicht-hier" } });
  n = go(n, { type: "STIL" });
  assert.equal(actionsOf(n).primary.id, "done"); go(n, { type: "CHECK" }, { consumed: false });
  go(n, { type: "LOGIN" }, { consumed: false });
});

test("Geraete-Code: falsch, unbekannt (nichts angelegt), verbinden; neu nur angemeldet (Server verlangt Login)", async () => {
  let s = go(machine.initial(initialContext("de", { device: DEV })), { type: "STATUS", result: await status("status-anonym") });
  s = go(go(s, { type: "CODE_TEXT", value: "abc" }), { type: "CODE_JOIN" }); assert.equal(s.ctx.konto.codeErr, "bad");
  s = go(go(s, { type: "CODE_TEXT", value: "0000-0000-0000-0000-0000-0000-0000-0000" }), { type: "CODE_JOIN" });
  const w0 = { via: "code", code: "0".repeat(32) };
  assert.deepEqual(fx(s, "profil.get"), [{ type: "profil.get", who: w0 }]);
  s = go(s, { type: "PROFIL", op: "get", who: w0, result: await get("profil-get-code-unbekannt", w0) });
  assert.equal(s.ctx.konto.codeErr, "unknown"); assert.equal(s.ctx.profil.via, null); assert.deepEqual(fx(s, "profil.put"), [], "Verbinden legt nie an");
  const w = { via: "code", code: REC.code };
  s = go(go(s, { type: "CODE_TEXT", value: REC.code.toUpperCase() }), { type: "CODE_JOIN" });
  s = go(s, { type: "PROFIL", op: "get", who: w, result: await get("profil-get-code", w) });
  assert.equal(s.ctx.profil.via, "code"); assert.equal(s.ctx.me.emoji, "🐢"); assert.equal(K(s), "anonym", "Code ist kein Login");
  go(s, { type: "CODE_NEW" }, { consumed: false });
  let a = go(machine.initial(initialContext("de", { device: DEV })), { type: "STATUS", result: await status("status-angemeldet-16") });
  a = go(a, { type: "CODE_NEW" });
  const nw = fx(a, "profil.get")[0].who;
  assert.equal(nw.via, "code"); assert.match(nw.code, /^[0-9a-f]{32}$/);
  a = go(a, { type: "PROFIL", op: "get", who: nw, result: await get("profil-get-code-unbekannt", nw) });
  assert.equal(fx(a, "profil.put")[0].body.fresh, true, "neuer Code wird angelegt");
  a = go(a, { type: "PROFIL", op: "put", who: nw, body: fx(a, "profil.put")[0].body, result: await putR("profil-put-code-ohne-konto", nw) });
  assert.equal(a.ctx.konto.codeErr, "codeLogin"); assert.equal(a.ctx.profil.via, null, "abgelehnt: getrennt, ehrlich gemeldet");
});

test("Loeschen: zweimal tippen; danach getrennt; spaete Antworten fuer eine alte Verknuepfung zaehlen nicht", async () => {
  let s = machine.initial(initialContext("de", { device: DEV, link: { via: "account", rev: 2, exists: true, remote: { me: {}, wall: [], saved: [] } } }));
  s = go(s, { type: "STATUS", result: await status("status-angemeldet-16") });
  s = go(go(s, { type: "STIL" }), { type: "DATEN" });
  assert.deepEqual(actionsOf(s).secondary.map((a) => a.id), ["export", "delete"]);
  s = go(s, { type: "DELETE" }); assert.equal(s.ctx.konto.sure, true); assert.deepEqual(fx(s, "profil.delete"), []);
  assert.equal(actionsOf(s).secondary[1].label, "Wirklich löschen? Nochmal tippen.");
  s = go(s, { type: "DELETE" }); assert.deepEqual(fx(s, "profil.delete"), [{ type: "profil.delete", who: { via: "account" } }]);
  s = go(s, { type: "PROFIL", op: "delete", who: { via: "account" }, result: await result("profil-delete", (a) => a.profileDelete({ via: "account" })) });
  assert.equal(s.ctx.profil.via, null); assert.equal(s.ctx.konto.note, "deleted"); assert.equal(s.ctx.profil.off, true, "nicht still wieder verknuepfen");
  const late = go(s, { type: "PROFIL", op: "get", who: { via: "code", code: "1".repeat(32) }, result: await get("profil-get-code") });
  assert.equal(late.ctx.profil.via, null); assert.equal(late.ctx.me.emoji, s.ctx.me.emoji);
});

test("Daten herunterladen: Datei mit Geraete- und Server-Stand; ohne Netz", async () => {
  let s = machine.initial(initialContext("de", { device: DEV, link: { via: "account", rev: 2, exists: true, remote: { me: { nick: "Lea" }, wall: [{ id: "a" }], saved: [] } } }));
  s = go(go(s, { type: "STIL" }), { type: "DATEN" });
  s = go(s, { type: "EXPORT" });
  const [d] = fx(s, "download");
  assert.equal(d.name, "my-daily-idea-daten.json");
  assert.equal(d.data.geraet.gesichert, "konto"); assert.deepEqual(d.data.server.profil.wall, [{ id: "a" }]); assert.equal(d.data.server.revision, 2);
  assert.equal(s.ctx.konto.note, "exported");
});

test("Moderation: Hinweise beim Oeffnen von Konto & Daten (nur angemeldet), Widerspruch leer/ok/doppelt", async () => {
  let s = go(machine.initial(initialContext("de", { device: DEV })), { type: "STATUS", result: await status("status-angemeldet-16") });
  s = go(go(s, { type: "STIL" }), { type: "DATEN" });
  assert.deepEqual(fx(s, "mod.me"), [{ type: "mod.me" }]);
  s = go(s, { type: "MOD", result: await result("mod-me-hinweise", (a) => a.modMe()) });
  assert.equal(s.ctx.mod.notices.length, 2);
  const nid = s.ctx.mod.notices[1].nid;
  s = go(s, { type: "APPEAL", nid });
  assert.equal(leaf(s), "stil.widerspruch");
  s = go(s, { type: "APPEAL_SEND" }); assert.equal(s.ctx.mod.err, "leer"); assert.deepEqual(fx(s, "mod.appeal"), []);
  s = go(go(s, { type: "APPEAL_TEXT", value: "Die Karte war ein Witz." }), { type: "APPEAL_SEND" });
  assert.deepEqual(fx(s, "mod.appeal"), [{ type: "mod.appeal", nid, text: "Die Karte war ein Witz." }]);
  const doppelt = go(s, { type: "APPEALED", result: await result("mod-widerspruch-doppelt", (a) => a.appeal(nid, "x")) });
  assert.equal(leaf(doppelt), "stil.widerspruch"); assert.equal(doppelt.ctx.mod.err, "doppelt");
  s = go(s, { type: "APPEALED", result: await result("mod-widerspruch-ok", (a) => a.appeal(nid, "x")) });
  assert.equal(leaf(s), "stil.daten"); assert.equal(s.ctx.mod.sent, nid); assert.deepEqual(fx(s, "mod.me"), [{ type: "mod.me" }], "Liste neu laden");
  s = go(s, { type: "MOD", result: await result("mod-me-nach-widerspruch", (a) => a.modMe()) });
  go(s, { type: "APPEAL", nid: s.ctx.mod.notices[1].nid }, { consumed: false });
  const a = go(go(go(machine.initial(initialContext("de")), { type: "STATUS", result: await status("status-anonym") }), { type: "STIL" }), { type: "DATEN" });
  assert.deepEqual(fx(a, "mod.me"), [], "anonym: kein Aufruf");
});

test("Pfad-Enumeration der Konto-Achse bis Tiefe 5: gueltig, Disclosure, keine toten Knoepfe, BACK fuehrt heim", async () => {
  const ST = { anon: await status("status-anonym"), in16: await status("status-angemeldet-16"), in0: await status("status-angemeldet-ohne-16"), weg: await status("status-gate-weg"), nh: { ok: false, error: "nicht-hier" } };
  const PG = { leer: await get("profil-get-leer"), da: await get("profil-get-da") };
  const mod = await result("mod-me-hinweise", (a) => a.modMe());
  const evs = (s) => [
    { type: "STIL" }, { type: "DATEN" }, { type: "DONE" }, { type: "BACK" }, { type: "LOGIN" }, { type: "AGE16", on: true }, { type: "CHECK" },
    ...Object.values(ST).map((r) => ({ type: "STATUS", result: r, logout: "https://bunsenbrenner.org/gate/logout?host=h&return=%2Fduell" })),
    { type: "PROFIL", op: "get", who: { via: "account" }, result: PG.leer }, { type: "PROFIL", op: "get", who: { via: "account" }, result: PG.da },
    { type: "PROFIL_NEU" }, { type: "ME", key: "nick", value: "X" }, { type: "SAVE" }, { type: "DELETE" }, { type: "LOGOUT" }, { type: "EXPORT" },
    { type: "MOD", result: mod }, { type: "APPEAL", nid: mod.notices[0].nid }, { type: "APPEAL_TEXT", value: "a" }, { type: "APPEAL_SEND" }, { type: "CODE_NEW" }, { type: "UNLINK" }, { type: "LINK_ACCOUNT" }
  ];
  const sig = (s) => s.config.join() + "|" + JSON.stringify([s.ctx.profil.via, s.ctx.profil.exists, s.ctx.konto.age16, s.ctx.konto.sure, s.ctx.mod.load, s.ctx.mod.nid, !!s.ctx.mod.text, !!s.ctx.konto.logout, s.ctx.konto.err]);
  let frontier = [machine.initial(initialContext("de", { device: DEV }))];
  const seen = new Set([sig(frontier[0])]), leaves = new Set(), kstates = new Set();
  for (let d = 1; d <= 5; d++) {
    const next = [];
    for (const s of frontier) for (const ev of evs(s)) {
      const r = machine.send(s, { at: T0, rand: R(), ...ev });
      if (!r.consumed || seen.has(sig(r))) continue;
      seen.add(sig(r)); next.push(r);
    }
    frontier = next;
    for (const s of next) {
      assert.equal(machine.valid(s.config), null);
      const L = leaf(s); leaves.add(L); kstates.add(K(s));
      const acts = actionsOf(s);
      if (L !== "shelf") assert.ok(acts.secondary.length <= 3, L); // Regal = Katalog (Strang H), siehe statechart.test
      for (const a of [acts.primary, ...acts.secondary].filter(Boolean)) assert.ok(machine.send(s, { at: T0, rand: R(), ...a.ev }).consumed, L + "/" + K(s) + ": toter Knopf " + a.id);
      let b = s; for (let i = 0; i < 6 && leaf(b) !== "shelf"; i++) { const r = machine.send(b, { type: "BACK", rand: [] }); if (!r.consumed) break; b = r; }
      assert.equal(leaf(b), "shelf", L + ": BACK kommt nicht heim");
      view(s, () => {});
    }
  }
  for (const m of ["stil.start", "stil.daten", "stil.widerspruch"]) assert.ok(leaves.has(m), "nicht erreicht: " + m);
  for (const k of ["pruefen", "anonym", "anmelden", "angemeldet", "abmelden", "fehler"]) assert.ok(kstates.has(k), "Konto-Zustand nicht erreicht: " + k);
  console.log("# konto-enumeration: " + seen.size + " Zustaende, Konto: " + [...kstates].sort().join(" "));
});

test("Laufzeit: angemeldet zurueck -> profile/get, dann put mit 16+ (genau diese Pfade, kein delete)", async () => {
  const calls = [];
  const api = scriptedApi((p, body) => {
    calls.push(p);
    if (p === "/api/duell/ai/status") return "status-angemeldet-ohne-16";
    if (p === "/api/duell/profile/get") return "profil-get-leer";
    if (p === "/api/duell/profile/put") { assert.equal(body.age16, true); assert.equal(body.fresh, true); return "profil-put-mit-16"; }
    throw new Error("unerwartet " + p);
  });
  api.me = async () => ({ ok: true, authenticated: true, logoutUrl: null });
  const store = { k: JSON.stringify({ device: DEV, attempt: { age16: true, t0: T0 } }) };
  const rt = createRuntime({ lang: "de", entropy: counter("e"), api, storage: { saveGame() {}, loadGame: () => null, loadKonto: () => JSON.parse(store.k), saveKonto: (v) => { store.k = JSON.stringify(v); } }, live: () => Promise.reject(new Error("x")), share: async () => false, clearUrl() {}, schedule: (f) => setTimeout(f, 0), onChange() {}, now: () => T0 + 1000 });
  for (let i = 0; i < 50 && rt.state.ctx.profil.sync !== "ok"; i++) await new Promise((r) => setTimeout(r, 2));
  assert.deepEqual(calls, ["/api/duell/ai/status", "/api/duell/profile/get", "/api/duell/profile/put"]);
  assert.ok(rt.matches("konto.angemeldet")); assert.equal(rt.state.ctx.profil.exists, true);
  assert.equal(JSON.parse(store.k).attempt, null, "Versuch verbraucht");
});

test("Laufzeit mit API aus Aufnahmen: Start prueft, Stil wird gespeichert und nach Neustart (gleiches Geraet) wiederhergestellt", async () => {
  const store = new Map();
  const storage = { saveGame() {}, loadGame: () => null, loadKonto: () => (store.has("k") ? JSON.parse(store.get("k")) : null), saveKonto: (v) => { store.set("k", JSON.stringify(v)); return true; } };
  const api = scriptedApi((p) => (p === "/api/duell/ai/status" ? "status-anonym" : null));
  const nav = [];
  const mk = () => createRuntime({ lang: "de", entropy: counter("e"), storage, api, live: () => Promise.reject(new Error("x")), share: async () => false, clearUrl() {}, schedule: (f) => setTimeout(f, 0), onChange() {}, navigate: (u) => { nav.push(u); return true; }, returnPath: () => "/duell?go=konto", now: () => T0 });
  let rt = mk();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(rt.matches("konto.anonym"), rt.state.config.join());
  const dev = rt.state.ctx.device;
  assert.match(dev, /^[0-9a-f]{32}$/); assert.equal(JSON.parse(store.get("k")).device, dev, "Geraete-id gemerkt");
  rt.dispatch({ type: "STIL" }); rt.dispatch({ type: "ME", key: "nick", value: "Oma Gisela" }); rt.dispatch({ type: "PREF", key: "fs", value: "g" });
  rt.dispatch({ type: "AGE16", on: true }); rt.dispatch({ type: "LOGIN" });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(nav, ["/auth/login?return=%2Fduell%3Fgo%3Dkonto&lang=de"]);
  rt = mk();
  assert.equal(rt.state.ctx.me.nick, "Oma Gisela"); assert.equal(rt.state.ctx.pref.fs, "g"); assert.equal(rt.state.ctx.device, dev);
  assert.ok(rt.state.ctx.konto.attempt, "Versuch ueberlebt den Neustart");
  // ohne API (z. B. Datei oder App-Huelle): ehrlich „nicht hier“, kein Netz
  const none = createRuntime({ lang: "de", entropy: counter("n"), storage: { saveGame() {}, loadGame: () => null }, live: () => Promise.reject(new Error("x")), share: async () => false, clearUrl() {}, schedule: (f) => setTimeout(f, 0), onChange() {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(none.matches("konto.fehler")); assert.equal(none.state.ctx.konto.err, "nicht-hier");
  assert.equal(ex("status-anonym").res.status, 200);
});
