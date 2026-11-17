// Freie Karte 2, Klaerungsdialog (P1) e2e gegen den falschen Wrapper (Konto: fakewrapper.mjs, freie Karte: fakefrei.mjs) und
// eine Attrappe von /api/duell/klaerung/* (Antworten wie lib/duell-klaerung.mjs). Je Bildschirm: axe (WCAG 2.2 AA), kein
// waagerechter Ueberlauf, kein verdecktes Bedienelement, keine CSP-Verstoesse, keine Konsolenfehler.
import nodeTest from "node:test";
import { fakeOnly } from "./lib/ziel.mjs";
const test = fakeOnly(nodeTest); // Gegenstelle ist eine Attrappe: im URL-Modus uebersprungen
import assert from "node:assert/strict";
import { browser, VIEWS, act, axe, noOverflow, shotsDir, istSpielSonde } from "./lib/grund.mjs";
import { fakeWrapper, APP } from "./lib/fakewrapper.mjs";
import { fakeFrei } from "./lib/fakefrei.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/grund.mjs";
import { buildSpiel } from "../../scripts/spiel/build.mjs";
import { kopfzeilen } from "../../bau/spiel-dienst.mjs";

let b;
test.before(async () => { b = await browser(); });
test.after(async () => { await b.close(); });

async function openApp(fw, ff, { view = "phone390", lang = "de", scheme = "light", path = "/duell", origin = APP } = {}) {
  const ctx = await b.newContext({ ...VIEWS[view], locale: lang === "de" ? "de-DE" : "en-GB", colorScheme: scheme });
  ctx.setDefaultTimeout(15000);
  await fw.attach(ctx); await ff.attach(ctx);
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e));
  p.on("console", (m) => { if (m.type() === "error" && !istSpielSonde(m.text()) && !/^Failed to load resource: the server responded with a status of (401|403|404|409|410|422|429|503)/.test(m.text())) errs.push("console " + m.text()); });
  await p.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => console.error("CSP " + e.violatedDirective + " " + e.blockedURI)); });
  await p.goto(origin + path);
  await p.locator("header.bar").waitFor();
  return { ctx, p, errs };
}
const screenIs = (p, s) => p.locator("main.s-" + s).waitFor();
const settle = (p) => p.evaluate(() => new Promise((res) => { let t; const done = () => { mo.disconnect(); res(); }; const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 250); }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); t = setTimeout(done, 250); setTimeout(done, 3000); }));
// wie layout.e2e.js: nichts Bedienbares liegt unter etwas anderem
const covered = (p) => p.evaluate(async () => {
  const out = [];
  const els = [...document.querySelectorAll("button, input, select, textarea, a[href], summary, [role=radio]")].filter((e) => e.checkVisibility({ visibilityProperty: true }) && !e.closest(".liveframe"));
  for (const e of els) {
    e.scrollIntoView({ block: "center", inline: "center" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = e.getBoundingClientRect();
    for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width * 0.2, r.top + r.height / 2], [r.right - r.width * 0.2, r.top + r.height / 2]]) {
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) { out.push((e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30) + " unter " + (hit.className || hit.tagName)); break; }
    }
  }
  window.scrollTo(0, 0);
  return out;
});
async function checks(p, name, found, { layout = true } = {}) {
  await settle(p);
  found.push(...(await axe(p, name)));
  if (!(await noOverflow(p))) found.push(name + ": waagerechter Ueberlauf");
  if (layout) for (const c of await covered(p)) found.push(name + ": verdeckt " + c);
  const d = shotsDir(); if (d) await p.screenshot({ path: d + "/frei-" + name + ".png", fullPage: true });
}
/** Anmelden aus der freien Karte heraus: 16+-Haken, Gate, zurueck ueber ?go=erschaffen, Profil mit 16+ angelegt */
async function loginFromFrei(p, fw, found, view) {
  await act(p, "frei"); await screenIs(p, "frei-start");
  await p.getByText("Eigene Karten gibt es mit Konto").waitFor();
  if (found) await checks(p, view + "-01-ohne-konto", found);
  await act(p, "login");
  await p.getByText("Bitte zuerst bestätigen: Ich bin 16 oder älter.").waitFor();
  assert.ok(!fw.state.log.some((l) => l.startsWith("GATE")), "ohne 16+ geht niemand zum Gate");
  await p.locator("#frei-16").check();
  await act(p, "login");
  await p.waitForURL(/\/duell$/);
  await screenIs(p, "frei-start");
  await p.locator('[data-k="frei-left"]').filter({ hasText: /von \d+ frei|sind erstellt/ }).waitFor();
}

const ID = "A".repeat(22), AUF = "B".repeat(22), EIGEN = "Wasserbomben, die bunt platzen";
const FRAGEN = { id: ID, verstehe: "ein Spiel. Von oben kommt etwas angesegelt, du wehrst es ab.", fragen: [
  { frage: "Wer bist du im Spiel?", hinweis: "Tipp ein Bild an.", kacheln: [{ label: "Ein Segelboot", sub: "", emoji: "⛵" }, { label: "Ein Piratenschiff", sub: "", emoji: "🚢" }, { label: "Eine Badeente", sub: "", emoji: "🦆" }] },
  { frage: "Womit wirfst du?", hinweis: "Es soll nass oder lustig werden, nicht brutal.", kacheln: [{ label: "Wasserbomben", sub: "Platsch – das Boot kentert.", emoji: "💧" }, { label: "Seifenblasen", sub: "Die Boote schweben davon.", emoji: "🫧" }, { label: "Kanonenkugeln", sub: "Sie treffen nur Holz und Segel.", emoji: "🎯" }] },
  { frage: "Wie schwer soll es sein?", hinweis: "Später kannst du es noch ändern.", kacheln: [{ label: "Gemütlich", sub: "langsam, viele Leben", emoji: "🐢" }, { label: "Normal", sub: "wird schneller", emoji: "🌊" }, { label: "Knifflig", sub: "schnell, 1 Leben", emoji: "⚡" }] }] };
const LISTE = { titel: "Segelboot gegen Piraten", verstehe: "Ein Spiel mit Wasserbomben.", punkte: [
  { id: "p1", text: "Du steuerst ein Segelboot unten am Rand – wischen oder Pfeiltasten.", pruefung: "Wischen nach links bewegt das Boot nach links." },
  { id: "p2", text: `Ein großer Knopf wirft „${EIGEN}“ – so wie du es gesagt hast.`, pruefung: "Antippen wirft eine Wasserbombe nach oben." },
  { id: "p3", text: "Von oben segeln Reihen von Piratenbooten heran und kommen näher.", pruefung: "Nach 10 Sekunden sind die Boote tiefer." },
  { id: "p4", text: "Normal schwer: 3 Leben, mit jeder Runde etwas schneller.", pruefung: "Runde 2 ist messbar schneller." }],
  nicht: ["Gleichzeitig online gegeneinander spielen ist nicht dabei. Wer deinen Link öffnet, spielt allein und versucht deinen Rekord."], dauerMaxMin: 15, kosten: { guthaben: 1, nurBeiErfolg: true } };
// Freie Karte 2 (P3): der Spiel-Ursprung mit den Kopfzeilen des statischen Spiel-Dienstes (bau/spiel-dienst.mjs) und ein Modul
const SPIEL_O = "https://spiel-f29c55da.bunsenbrenner.org";
const MODUL = fs.readFileSync(path.join(ROOT, "src/spiel/beispiele/invaders.js"), "utf8"), SHA = createHash("sha256").update(MODUL).digest("hex");
async function spielUrsprung(ctx) {
  const built = await buildSpiel(), cfg = { spielOrigin: SPIEL_O, appOrigins: [APP] }, seen = [];
  await ctx.route(SPIEL_O + "/**", (r) => {
    const u = new URL(r.request().url()), h = r.request().headers(), anfrage = { required: h["sec-required-csp"], origin: h.origin };
    seen.push(u.pathname);
    const f = built.frame[u.pathname.slice(1)];
    if (f) return r.fulfill({ status: 200, headers: kopfzeilen(cfg, f.type, Buffer.byteLength(f.body), anfrage), body: f.body });
    if (u.pathname === "/m/" + SHA + ".js") return r.fulfill({ status: 200, headers: kopfzeilen(cfg, "modul", Buffer.byteLength(MODUL), anfrage), body: MODUL });
    return r.fulfill({ status: 404, body: "" });
  });
  return seen;
}
/** Attrappe des Servers; nachbessern zaehlt hier wie dort (der Client zaehlt nie) */
async function fakeKlaerung(ctx) {
  const S = { log: [], left: 3, gemeldet: false, an: true, bau: "nicht-verfuegbar", push: false };
  const json = (status, body) => ({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
  const status = () => ({ titel: LISTE.titel, status: "fertig", kosten: 1, abgebucht: false, vorgemerkt: true, grund: null, hinweis: null, nachbessernLeft: S.left, gemeldet: S.gemeldet, behalten: false,
    spiel: { rahmen: SPIEL_O + "/frame.html", modul: SPIEL_O + "/m/" + SHA + ".js", sha256: SHA },
    ergebnis: { titel: LISTE.titel, fehlt: 1, punkte: LISTE.punkte.map((p, i) => ({ id: p.id, text: p.text, erfuellt: i !== 3, notiz: i === 3 ? "Die Boote werden noch nicht schneller." : "", geprueft: i === 2 ? "gelesen" : "gespielt" })) } });
  await ctx.route(APP + "/api/duell/klaerung/**", async (r) => {
    const op = new URL(r.request().url()).pathname.split("/").pop(); let b = {}; try { b = r.request().postDataJSON() || {}; } catch (e) { b = {}; }
    S.log.push(op + " " + JSON.stringify(b));
    if (op === "an") return r.fulfill(json(200, { on: S.an }));
    if (op === "fragen") return r.fulfill(json(200, FRAGEN));
    if (op === "antwort") return r.fulfill(/Raketen/.test(b.text) ? json(422, { error: "refused", reason: "weapons", vorschlaege: [0, 2] }) : json(200, { ok: true, text: b.text }));
    if (op === "liste") return r.fulfill(json(200, LISTE));
    if (op === "auftrag") return r.fulfill(json(202, { auftrag: AUF, status: "bestaetigt", bau: S.bau, kanaele: { push: S.push, mail: true } }));
    if (op === "optin") return r.fulfill(json(200, { optin: { push: b.push, mail: b.mail }, kanaele: { push: S.push, mail: true } }));
    if (op === "status") return r.fulfill(json(200, status()));
    if (op === "nachbessern") { if (S.left <= 0) return r.fulfill(json(409, { error: "limit" })); S.left--; return r.fulfill(json(200, { nachbessernLeft: S.left })); }
    if (op === "melden") { S.gemeldet = true; return r.fulfill(json(200, { gemeldet: true, kosten: { erlassen: true } })); }
    if (op === "behalten") return r.fulfill(json(200, { behalten: true, abgebucht: false, guthaben: 1 }));
    return r.fulfill(json(404, {}));
  });
  return S;
}

for (const view of ["phone360", "phone390", "desk1280"]) {
  test("Klaeren: Satz, 3 Fragen mit Kacheln, eigene Worte abgelehnt und ersetzt nur nach Antippen, Liste, Auftrag, Opt-in; " + view, async () => {
    const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-card" }), found = [];
    const { p, errs, ctx } = await openApp(fw, ff, { view });
    const S = await fakeKlaerung(ctx);
    await loginFromFrei(p, fw);
    await act(p, "klaeren"); await screenIs(p, "frei-klaeren");
    await p.locator("#k-satz").fill("Space Invaders mit Segelbooten");
    await checks(p, view + "-k1-satz", found);
    await act(p, "k-go"); await screenIs(p, "frei-kfrage");
    assert.equal(await p.locator('[data-act="k-weiter"]').isDisabled(), true, "Weiter erst nach einer Wahl");
    await p.locator('[data-act="k-kachel-0"]').click();
    assert.equal(await p.locator('[data-act="k-kachel-0"]').getAttribute("aria-pressed"), "true");
    await checks(p, view + "-k2-frage1", found);
    await act(p, "k-weiter");
    await p.locator("#k-eigen-1").fill("Raketen, die alles in die Luft jagen");
    await act(p, "k-eigen-go");
    await p.getByText("Das bauen wir nicht.").waitFor();
    assert.equal(await p.locator('[data-act="k-weiter"]').isDisabled(), true, "FreiAbsage: Weiter gesperrt");
    await checks(p, view + "-k3-absage", found);
    await p.locator("#k-eigen-1").fill(EIGEN);
    await act(p, "k-eigen-go");
    await p.getByText("Verstanden: " + EIGEN).waitFor();
    await act(p, "k-weiter");
    await p.locator('[data-act="k-egal"]').click();
    await checks(p, view + "-k4-frage3", found);
    await act(p, "k-weiter"); await screenIs(p, "frei-kliste");
    assert.match(await p.locator("main").innerText(), new RegExp("„" + EIGEN + "“"));
    await checks(p, view + "-k5-liste", found);
    await act(p, "k-ja"); await screenIs(p, "frei-kbauen");
    // ohne Bau-Worker: ehrlich gespeichert, kein Fortschritt, keine Dauer
    await p.locator('[data-bau="nicht-verfuegbar"]').waitFor();
    const bt = await p.locator("main").innerText();
    assert.match(bt, /Dein Bauauftrag ist gespeichert\. Das Bauen selbst kommt im nächsten Schritt – wir sagen Bescheid\./);
    assert.match(bt, /Kein Guthaben, keine Abbuchung/);
    assert.equal(await p.locator(".k-steps").count(), 0); assert.ok(!/Minuten|wird gebaut/.test(bt));
    // der Server stellt hier nur E-Mail zu: nur die wird angeboten
    assert.equal(await p.locator('[data-act="k-optin-push"]').count(), 0);
    await p.locator('[data-act="k-optin-mail"]').click();   // angehakt ist erst, was der Server gespeichert hat
    await p.waitForFunction(() => document.querySelector('[data-act="k-optin-mail"]').checked && !document.querySelector('[data-act="k-optin-mail"]').disabled);
    await checks(p, view + "-k6-bauen", found);
    assert.ok(S.log.some((l) => l.startsWith("optin") && l.includes('"mail":true')), S.log.join(" | "));
    assert.ok(S.log.some((l) => l.startsWith("liste") && l.includes(EIGEN)));
    assert.deepEqual(found, []); assert.deepEqual(errs, []);
  });
}

test("Fertig: Nachbessern noch 3× bis 0 (Server zaehlt), dann Melden mit Entschuldigung und Freitext, Trotzdem behalten", async () => {
  const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-card" }), found = [];
  const { p, errs, ctx } = await openApp(fw, ff);
  const S = await fakeKlaerung(ctx), seen = await spielUrsprung(ctx);
  await loginFromFrei(p, fw);
  // Ziel der Mitteilung/E-Mail (P3): ?go=fertig&auftrag=<id>
  await p.goto(APP + "/duell?go=fertig&auftrag=" + AUF);
  await screenIs(p, "frei-kfertig");
  assert.match(await p.locator('[data-act="k-nach"]').innerText(), /noch 3×/);
  assert.match(await p.locator("main").innerText(), /nicht automatisch prüfbar/);
  await checks(p, "k7-fertig", found);
  // Probe spielen: Modul vom Spiel-Ursprung (Hash geprueft), Rahmen mit der CSP des Spiel-Dienstes, Spiel startet
  await act(p, "k-probe");
  const fr = p.frameLocator("iframe.spielrahmen");
  await fr.locator("canvas").waitFor();
  assert.deepEqual([...new Set(seen)].sort(), ["/frame.css", "/frame.html", "/frame.js", "/m/" + SHA + ".js"]);
  await checks(p, "k7a-probe", found);
  await act(p, "k-probe-zu");
  await p.locator("iframe.spielrahmen").waitFor({ state: "detached" });
  for (const n of [2, 1, 0]) {
    await act(p, "k-nach");
    await p.getByText("Wir bauen neu und prüfen wieder", { exact: false }).waitFor();
    if (n === 2) await checks(p, "k7b-nachbessern", found);
    // P3 hat neu gebaut: die Mitteilung oeffnet das neue Ergebnis
    await p.goto(APP + "/duell?go=fertig&auftrag=" + AUF); await screenIs(p, "frei-kfertig");
    if (n) await p.locator('[data-act="k-nach"]').filter({ hasText: "noch " + n + "×" }).waitFor();
  }
  await p.locator('[data-act="k-melden-open"]').waitFor();
  assert.equal(S.left, 0);
  await act(p, "k-melden-open"); await screenIs(p, "frei-kmelden");
  await p.locator("#k-meldung").fill("Die Boote werden nie schneller.");
  await checks(p, "k8-melden", found);
  await act(p, "k-melden");
  await p.getByText("Die Karte kostet dich nichts.", { exact: false }).first().waitFor();
  // die erwartete CSP-Sonde des Spielrahmens filtert der Sammler exakt heraus (lib/grund.mjs SPIEL_SONDE); alles andere zaehlt
  assert.deepEqual(found, []); assert.deepEqual(errs, []);
});

// Freie Karte 2, P4: Push-Abo der neuen App gegen ein Push-Double (Erlaubnis, Service Worker und Push-Dienst im Browser
// ersetzt, Server-Routen /api/duell/push/* als Attrappe). Das Haekchen gilt erst nach Erlaubnis und Abo.
for (const erlaubnis of ["granted", "denied"]) {
  test("Push-Abo auf dem Bau-Bildschirm (Push-Double, Erlaubnis " + erlaubnis + ")", async () => {
    const fw = fakeWrapper(), ff = fakeFrei(fw, { karte: "karte-ok-card" }), found = [];
    const { p, errs, ctx } = await openApp(fw, ff);
    const S = await fakeKlaerung(ctx);
    S.bau = "wartet"; S.push = true;
    const push = [];
    await ctx.route(APP + "/api/duell/push/**", async (r) => {
      const op = new URL(r.request().url()).pathname.split("/").pop();
      push.push(op + " " + (r.request().postData() || ""));
      if (op === "key") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ on: true, key: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" }) });
      if (op === "subscribe") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mark: "M".repeat(22), del: "d".repeat(30), days: 30 }) });
      return r.fulfill({ status: 404, body: "" });
    });
    // Push-Double im Browser: Erlaubnis, Registrierung des Service Workers und Abo beim Push-Dienst
    await p.addInitScript((perm) => {
      const sub = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/double", keys: { p256dh: "p", auth: "a" } }) };
      window.__pushDouble = { register: [] };
      Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default", requestPermission: async () => perm } });
      Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: async (url, o) => { window.__pushDouble.register.push([url, o.scope]); return { pushManager: { subscribe: async () => sub } }; } } });
    }, erlaubnis);
    await p.reload(); await p.locator("header.bar").waitFor();
    await loginFromFrei(p, fw);
    await act(p, "klaeren"); await p.locator("#k-satz").fill("Space Invaders mit Segelbooten");
    await act(p, "k-go"); await screenIs(p, "frei-kfrage");
    for (let i = 0; i < 3; i++) { await p.locator('[data-act="k-egal"]').click(); await act(p, "k-weiter"); }
    await screenIs(p, "frei-kliste");
    await act(p, "k-ja"); await screenIs(p, "frei-kbauen");
    assert.equal(await p.locator('[data-act="k-optin-push"]').isChecked(), false);
    await p.locator('[data-act="k-optin-push"]').click();
    if (erlaubnis === "granted") {
      await p.waitForFunction(() => document.querySelector('[data-act="k-optin-push"]').checked);
      assert.deepEqual(await p.evaluate(() => window.__pushDouble.register), [[APP + "/duell/mdi-push-sw.js", "/duell"]]);
      assert.deepEqual(push.map((x) => x.split(" ")[0]), ["key", "subscribe"]);
      assert.ok(S.log.some((l) => l.startsWith("optin") && l.includes('"push":true') && l.includes('"mark":"' + "M".repeat(22) + '"')), S.log.join(" | "));
    } else {
      await p.locator('[data-push="verweigert"]').waitFor();
      assert.equal(await p.locator('[data-act="k-optin-push"]').isChecked(), false, "ohne Erlaubnis kein Haekchen");
      assert.ok(!S.log.some((l) => l.startsWith("optin")), "kein Opt-in ohne Erlaubnis");
      assert.deepEqual(push, []);
    }
    await checks(p, "k6p-push-" + erlaubnis, found);
    assert.deepEqual(found, []); assert.deepEqual(errs, []);
  });
}
