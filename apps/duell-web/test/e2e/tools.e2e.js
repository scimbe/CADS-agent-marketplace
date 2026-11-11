"use strict";
// Tools end to end (src/tools-ui.js): the sticky note and the file for two, two devices at 390x844. The network part
// (live.js) is replaced by an in-memory channel between the two pages (no bridge, no TURN): JSON and bytes travel in order
// through this test, the send buffer drains as they arrive. Everything else runs for real: the part, the QR code, the
// accept dialog, the bar, SHA-256 on both sides, the download. TOOLS_SHOTS=<folder> keeps the screenshots.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs"), crypto = require("node:crypto");
const jsQR = require("jsqr");
const G = require("./lib/grund.js");
const shots = process.env.TOOLS_SHOTS;
const TOKEN = "Tk" + "x".repeat(20);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const snap = async (p, n) => { if (shots) { fs.mkdirSync(shots, { recursive: true }); await p.screenshot({ path: path.join(shots, n + ".png") }); } };

// The stand-in for live.js: same calls as the real connection (send/on/onClose/close, bin/onBin/buffered/onLow, fp).
const STUB = (side) => `(() => {
  const FP = ${side === "a" ? '["AA:01", "BB:02"]' : '["BB:02", "AA:01"]'};
  function mk() {
    let h = null, bh = null, low = null, buf = 0; const cl = [];
    window.__toolIn = (s) => h && h(JSON.parse(s));
    window.__toolBinIn = (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); if (bh) bh(u.buffer); };
    window.__toolGone = () => cl.splice(0).forEach((f) => f());
    return {
      channel: "c0ffee".padEnd(64, "0"), caller: ${side === "a"},
      send: (o) => { window.__toolOut(JSON.stringify(o)); },
      on: (f) => { h = f; }, onClose: (f) => { cl.push(f); }, close: () => { window.__toolBye(); },
      bin: (b) => { const u = new Uint8Array(b); let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); buf += u.length;
        window.__toolBin(btoa(s)).then(() => { buf -= u.length; if (buf <= 262144 && low) low(); }); },
      onBin: (f) => { bh = f; }, buffered: () => buf, onLow: (f) => { low = f; }, fp: () => FP
    };
  }
  // what the page hands live.js: direct only or not, the purpose for the bridge, and whether it asks for a relay grant
  function seen(o) { o = o || {}; window.__toolGrant = o.grant || null; return { direct: !!o.direct, purpose: o.purpose || null, grant: typeof o.grant === "function" }; }
  window.Live = {
    // what the page asked for (direct only or not); window.__toolNoPath: no direct path, the join ends as live.js ends it ("rtc")
    invite: async (s, o) => { window.__toolOpts = seen(o); return { token: "${TOKEN}", expires: Date.now() + 900000, ready: new Promise((ok, no) => { window.__toolReady = () => ok(mk()); window.__toolFail = () => no(new Error("rtc")); }) }; },
    accept: async (t, s, o) => { window.__toolOpts = seen(o); if (t !== "${TOKEN}") throw new Error("gone"); if (window.__toolNoPath) throw new Error("rtc"); const c = mk(); await window.__toolJoined(); return c; }
  };
  // what would go to the share sheet
  navigator.share = async (o) => { window.__shared = o; };
})();`;

// credit: what the wrapper says about this account on POST /api/duell/relay-grant (undefined = no login: 401; 0: 402)
const STATUS = "https://demos-34a13a96.bunsenbrenner.org/api/duell/relay-grant";
const AI_STATUS = "https://demos-34a13a96.bunsenbrenner.org/api/duell/ai/status";
function relayAnswer(credit, body) {
  if (credit === undefined) return { status: 401, body: { ok: false, error: "login" } };
  if (!(credit > 0)) return { status: 402, body: { ok: false, error: "credit", credit: 0 } };
  const ch = body && body.channel;
  return { status: 200, body: ch ? { ok: true, relay: true, credit, grant: "rg1.test-" + ch.slice(0, 8), exp: 0 } : { ok: true, relay: true, credit } };
}
async function device(b, side, view, credit) {
  const ctx = await G.person(b, { lang: "de", view: view || "phone390", web: true });
  ctx.side = side; ctx.out = []; ctx.status = [];   // requests that leave 127.0.0.1 (other than the credit question)
  // AI_STATUS: the free card's own status, asked when "Guthaben aufladen" opens it (create-ui.js), never by the tool
  ctx.on("request", (r) => { if (r.url() === STATUS) ctx.status.push(r.postData() || ""); else if (r.url() !== AI_STATUS && !G.isLocal(r.url()) && !/^(data|blob):/.test(r.url())) ctx.out.push(r.url()); });
  await ctx.route(AI_STATUS, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: "{}" }));
  await ctx.route(STATUS, (r) => { let b = {}; try { b = JSON.parse(r.request().postData() || "{}"); } catch (e) { b = {}; } const a = relayAnswer(credit, b); return r.fulfill({ status: a.status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(a.body) }); });
  await ctx.addInitScript(STUB(side));
  return ctx;
}
// Two pages joined by this test: every message and every piece of bytes in order, the bytes as base64. slow: ms per piece.
async function wire(A, B, o) {
  const st = { bins: 0, slow: 0, log: [] };
  const lane = (from, to) => {
    let q = Promise.resolve();
    const put = (f) => (q = q.then(f).catch(() => {}));
    return {
      msg: (s) => { st.log.push(from.side + ">" + JSON.parse(s).t); put(() => to.evaluate((m) => window.__toolIn(m), s)); },
      bin: (b64) => { st.bins++; return put(async () => { if (st.slow) await new Promise((r) => setTimeout(r, st.slow)); await to.evaluate((m) => window.__toolBinIn(m), b64); }); }
    };
  };
  const ab = lane(A, B), ba = lane(B, A);
  A.side = "a"; B.side = "b";
  await A.exposeFunction("__toolOut", ab.msg); await A.exposeFunction("__toolBin", ab.bin);
  await B.exposeFunction("__toolOut", ba.msg); await B.exposeFunction("__toolBin", ba.bin);
  await B.exposeFunction("__toolJoined", () => A.evaluate(() => window.__toolReady()));
  await A.exposeFunction("__toolBye", () => B.evaluate(() => window.__toolGone && window.__toolGone()).catch(() => {}));
  await B.exposeFunction("__toolBye", () => A.evaluate(() => window.__toolGone && window.__toolGone()).catch(() => {}));
  return st;
}
async function pickFile(p, file) {
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Datei wählen" }).first().click()]);
  await fc.setFiles(file);
}
const text = (p, sel) => p.locator(sel).first().innerText();

test("Notizzettel: schreiben, Farbe und Sticker, bleibt auf dem Geraet, als Link teilen, auf dem zweiten Geraet oeffnen und behalten", { timeout: 120000 }, async () => {
  const b = await G.launch();
  try {
    const ca = await device(b, "a"), cb = await device(b, "b");
    const A = await G.open(ca, "#i=notizzettel");
    assert.equal((await A.locator("#go").innerText()).trim().toLowerCase(), "öffnen");
    await A.locator("#go").click();
    await A.locator(".tlov .tlnotex").waitFor();
    assert.equal((await text(A, ".tltitle")).toLowerCase(), "notizzettel");
    await A.locator(".tlnotex").fill("Milch\nBrot\nOma anrufen");
    await A.getByRole("button", { name: "Farbe 3" }).click();
    await A.locator(".tlstks .chip", { hasText: "🛒" }).click();
    assert.equal(await A.locator(".tlnote").evaluate((e) => e.style.backgroundColor), "rgb(158, 216, 255)");
    assert.equal(await text(A, ".tlstk"), "🛒");
    assert.match(await text(A, ".tlfoot .why"), /Bleibt nur auf diesem Gerät\. · Link zu \d+ % voll/);
    await snap(A, "notiz-1-schreiben");
    // stays on this device: a new page of the same device finds it
    const saved = await A.evaluate(() => JSON.parse(localStorage.getItem("daily.notes")));
    assert.deepEqual(saved[0], { x: "Milch\nBrot\nOma anrufen", c: 2, s: 6 });
    const A2 = await G.open(ca, "#i=notizzettel"); await A2.locator("#go").click();
    assert.equal(await A2.locator(".tlnotex").inputValue(), "Milch\nBrot\nOma anrufen"); await A2.close();
    // a second note, then back to the first
    await A.locator(".tlnew").click(); await A.locator(".tlnotex").fill("Zweiter Zettel");
    assert.equal(await A.locator(".tlmini").count(), 2);
    await A.getByRole("button", { name: "Zettel 2 öffnen" }).click();
    assert.equal(await A.locator(".tlnotex").inputValue(), "Milch\nBrot\nOma anrufen");
    // share as a link: the note travels in the fragment only
    await A.locator(".tlov .press").click();
    await A.waitForFunction(() => window.__shared);
    const sh = await A.evaluate(() => window.__shared);
    assert.equal(sh.text, "Ein Zettel für dich:"); assert.match(sh.url, /^https:\/\/bunsenbrenner\.org\/duell#notiz=[A-Za-z0-9_-]+$/);
    assert.ok(sh.url.split("#notiz=")[1].length <= 1200);
    // the second device opens it: read first, then keep it
    const B = await G.open(cb, "#" + sh.url.split("#")[1]);
    await B.locator(".tlov .tlnotex").waitFor();
    assert.equal((await text(B, ".tltitle")).toLowerCase(), "ein zettel für dich");
    assert.equal(await B.locator(".tlnotex").inputValue(), "Milch\nBrot\nOma anrufen");
    assert.equal(await B.locator(".tlnotex").evaluate((e) => e.readOnly), true);
    assert.equal(await B.locator(".tlnote").evaluate((e) => e.style.backgroundColor), "rgb(158, 216, 255)");
    assert.equal(await B.evaluate(() => location.hash), "", "der Zettel bleibt nicht in der Adresse");
    await snap(B, "notiz-2-empfangen");
    await B.locator(".tlov .press").click();
    await B.locator(".tlnotex:not([readonly])").waitFor();
    assert.deepEqual((await B.evaluate(() => JSON.parse(localStorage.getItem("daily.notes"))))[0], { x: "Milch\nBrot\nOma anrufen", c: 2, s: 6 });
    // a broken or filtered link shows nothing of it
    const B2 = await G.open(cb, "#notiz=" + Buffer.from(JSON.stringify({ v: 1, x: "ruf an 0171 2345678", c: 0, s: 0 })).toString("base64url"));
    await B2.waitForTimeout(800);
    assert.equal(await B2.locator(".tlov").count(), 0, "Kontaktdaten: kein Zettel");
    assert.match(await B2.locator("#toast").innerText(), /Nummern|draußen/);
    // Escape closes the layer
    await A.locator(".tltitle").click(); await A.keyboard.press("Escape"); assert.equal(await A.locator(".tlov").count(), 0);
    assert.deepEqual(ca.out.concat(cb.out), [], "nichts ging an einen fremden Server");
    assert.deepEqual(A.errs.concat(B.errs, B2.errs), []);
  } finally { await b.close(); }
});

test("Datei rueber: Code am Rechner, Handy verbindet, Annehmen mit Name und Groesse, Fortschritt, gleiche SHA-256, Speichern; Ablehnen; Abbrechen auf beiden Seiten", { timeout: 240000 }, async () => {
  const b = await G.launch();
  try {
    // the computer shows the code (1280x800); the same steps then at 390x844 on two phones
    const pc = await device(b, "a", "desk1280"), pcp = await G.open(pc, "#i=datei-rueber");
    await pcp.locator("#go").click(); await pcp.locator(".tlov .press", { hasText: "Verbinden" }).click();
    await pcp.locator(".tlqr:not([hidden])").waitFor();
    await snap(pcp, "datei-0-rechner-code");
    await pcp.close(); await pc.close();

    const ca = await device(b, "a"), cb = await device(b, "b");
    const A = await G.open(ca, "#i=datei-rueber");
    const B = await cb.newPage(); B.errs = []; B.on("pageerror", (e) => B.errs.push(String(e)));
    const W = await wire(A, B);
    await A.locator("#go").click();
    await A.locator(".tlcard").waitFor();
    assert.match(await text(A, ".tlcard"), /Ende-zu-Ende verschlüsselt, nie über einen Server/);
    assert.doesNotMatch(await text(A, ".tlcard"), /Relais/, "Relais aus: kein Wort davon");
    assert.match(await text(A, ".tlcard"), /Bis 100 MB pro Datei/);
    await snap(A, "datei-1-start");
    await A.locator(".tlov .press").click();
    await A.locator(".tlqr:not([hidden])").waitFor();
    // the link the other device opens is the one read back from the QR code
    const px = await A.evaluate(() => { const c = document.querySelector(".tlqr"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, d: Array.from(d.data) }; });
    const qr = jsQR(Uint8ClampedArray.from(px.d), px.w, px.h);
    assert.ok(qr, "QR-Code lesbar"); assert.equal(qr.data, "https://bunsenbrenner.org/duell#tl=" + TOKEN + "&w=datei");
    await snap(A, "datei-2-code");
    assert.deepEqual(await A.evaluate(() => window.__toolOpts), { direct: true, purpose: "file", grant: false }, "Datei: nur direkt (Relais aus)");
    await B.goto((await G.webUrl("index.html")) + "#" + qr.data.split("#")[1]);
    await A.locator(".tlbadge").waitFor(); await B.locator(".tlbadge").waitFor();
    assert.equal(await text(A, ".tlbadge"), await text(B, ".tlbadge"), "dieselben drei Bilder auf beiden Geraeten");
    assert.equal((await text(A, ".tlbadge")).split(" ").length, 3);
    assert.deepEqual(await B.evaluate(() => window.__toolOpts), { direct: true, purpose: "file", grant: false }, "auch das beitretende Geraet nur direkt");

    // the phone (B) sends to the computer (A): nothing flows before the yes
    const buf = crypto.randomBytes(1536 * 1024 + 321);
    await pickFile(B, { name: "Urlaub 2026.jpg", mimeType: "image/jpeg", buffer: buf });
    await A.locator(".tlask").waitFor();
    assert.match(await text(A, ".tlask"), /Urlaub 2026\.jpg/); assert.match(await text(A, ".tlask"), /1,6 MB/);
    assert.equal(W.bins, 0, "vor dem Annehmen kein Byte");
    assert.match(await text(B, ".tlcard"), /Warte, bis das andere Gerät annimmt/i);
    await snap(A, "datei-3-annehmen"); await snap(B, "datei-3-sender-wartet");
    W.slow = 4;
    await A.getByRole("button", { name: "Annehmen" }).click();
    await A.locator(".tlbar").waitFor(); await B.locator(".tlbar").waitFor();
    const mid = await G.poll(() => A.locator(".tlbar").getAttribute("aria-valuenow"), (v) => Number(v) >= 20, { what: "Balken" });
    await snap(A, "datei-4-empfang-laeuft"); await snap(B, "datei-4-senden-laeuft");
    await A.getByText("Angekommen – die Prüfsumme stimmt.").waitFor({ timeout: 60000 });
    await B.getByText("Angekommen – die Prüfsumme stimmt auf beiden Seiten.").waitFor();
    assert.ok(Number(mid) < 100, "der Balken lief: " + mid);
    assert.match(await text(A, ".tlhash"), new RegExp("SHA-256 " + sha(buf).slice(0, 16)));
    assert.match(await text(B, ".tlhash"), new RegExp("SHA-256 " + sha(buf).slice(0, 16)));
    await snap(A, "datei-5-angekommen");
    const [dl] = await Promise.all([A.waitForEvent("download"), A.locator(".tlov .press", { hasText: "Speichern" }).click()]);
    assert.equal(dl.suggestedFilename(), "Urlaub 2026.jpg");
    assert.equal(sha(fs.readFileSync(await dl.path())), sha(buf), "gespeichert = gesendet");
    assert.ok(W.bins >= Math.ceil(buf.length / 16384));

    // declined: the other way round, A sends, B says no
    W.slow = 0; const before = W.bins;
    await pickFile(A, { name: "geheim.pdf", mimeType: "application/pdf", buffer: crypto.randomBytes(5000) });
    await B.locator(".tlask").waitFor(); await snap(B, "datei-6-empfaenger-fragt");
    await B.getByRole("button", { name: "Ablehnen" }).click();
    await A.getByText("Das andere Gerät hat abgelehnt.").waitFor();
    assert.equal(W.bins, before, "abgelehnt: kein Byte");

    // cancelled by the sender, then by the receiver
    for (const [snd, rcv, who] of [[B, A, "snd"], [B, A, "rcv"]]) {
      W.slow = 15;
      await pickFile(snd, { name: "gross.bin", mimeType: "application/octet-stream", buffer: crypto.randomBytes(3 * 1048576) });
      await rcv.locator(".tlask").waitFor(); await rcv.getByRole("button", { name: "Annehmen" }).click();
      await rcv.locator(".tlbar").waitFor();
      await G.poll(() => rcv.locator(".tlbar").getAttribute("aria-valuenow"), (v) => Number(v) >= 2, { what: "Fortschritt" });
      await (who === "snd" ? snd : rcv).locator(".tlov .press", { hasText: "Abbrechen" }).click();
      await (who === "snd" ? snd : rcv).getByText("Abgebrochen.").waitFor();
      await (who === "snd" ? rcv : snd).getByText("Das andere Gerät hat abgebrochen.").waitFor();
      W.slow = 0;
      await G.settled(() => W.bins);
      assert.equal(await rcv.locator(".tlbar").count(), 0); assert.equal(await rcv.getByRole("button", { name: /Speichern/ }).count(), 0, "nichts zum Speichern");
    }
    assert.deepEqual(ca.out.concat(cb.out), [], "kein Byte und kein Name an einen fremden Server");
    // closing one side: the other hears it
    await B.locator(".tlx").click();
    await A.getByText("Verbindung weg.").first().waitFor();
    assert.deepEqual(A.errs.concat(B.errs), []);
  } finally { await b.close(); }
});

test("Notiz zu zweit: einladen, das andere Geraet tritt bei, beide schreiben auf denselben Zettel, Verbindung weg - jeder behaelt seinen", { timeout: 120000 }, async () => {
  const b = await G.launch();
  try {
    const ca = await device(b, "a"), cb = await device(b, "b");
    const A = await G.open(ca, "#i=notizzettel");
    const B = await cb.newPage(); B.errs = []; B.on("pageerror", (e) => B.errs.push(String(e)));
    await wire(A, B);
    await A.locator("#go").click(); await A.locator(".tlnotex").fill("Einkauf:");
    await A.getByRole("button", { name: /Zu zweit schreiben/ }).click();
    await A.locator(".tlqr:not([hidden])").waitFor();
    assert.equal(await A.locator(".tlqr").getAttribute("data-url"), "https://bunsenbrenner.org/duell#tl=" + TOKEN + "&w=notiz");
    await B.goto((await G.webUrl("index.html")) + "#tl=" + TOKEN + "&w=notiz");
    await A.locator(".tlon").waitFor(); await B.locator(".tlon").waitFor();
    assert.deepEqual(await A.evaluate(() => window.__toolOpts), { direct: false, purpose: null, grant: false }, "Notiz zu zweit: wie bisher (Spiel-Kanal)"); assert.deepEqual(await B.evaluate(() => window.__toolOpts), { direct: false, purpose: null, grant: false });
    assert.equal(await text(A, ".tlon"), await text(B, ".tlon"), "dieselben drei Bilder");
    await G.poll(() => B.locator(".tlnotex").inputValue(), (v) => v === "Einkauf:", { what: "der Zettel kommt an" });
    await B.locator(".tlnotex").click(); await B.keyboard.press("End"); await B.keyboard.type(" Milch");
    await G.poll(() => A.locator(".tlnotex").inputValue(), (v) => v === "Einkauf: Milch", { what: "B schreibt, A sieht es" });
    await A.getByRole("button", { name: "Farbe 4" }).click();
    await G.poll(() => B.locator(".tlnote").evaluate((e) => e.style.backgroundColor), (v) => v === "rgb(182, 240, 156)", { what: "Farbe kommt an" });
    await snap(A, "notiz-3-zu-zweit"); await snap(B, "notiz-3-zu-zweit-b");
    await A.getByRole("button", { name: "Beenden" }).click();
    await B.getByText("Verbindung weg – dein Zettel bleibt.").waitFor();
    assert.equal((await B.evaluate(() => JSON.parse(localStorage.getItem("daily.notes"))))[0].x, "Einkauf: Milch");
    assert.equal((await A.evaluate(() => JSON.parse(localStorage.getItem("daily.notes"))))[0].x, "Einkauf: Milch");
    assert.deepEqual(ca.out.concat(cb.out), []);
    assert.deepEqual(A.errs.concat(B.errs), []);
  } finally { await b.close(); }
});

test("Datei rueber, Relais nur mit Guthaben: ohne - nur direkt, ehrlicher Satz plus Weg zum Aufladen; mit - Relais erlaubt und erklaert; Schalter fuer alle", { timeout: 150000 }, async () => {
  const b = await G.launch();
  try {
    // free (no login: /ai/status without a create block): direct only, on both devices
    const ca = await device(b, "a"), A = await G.open(ca, "#i=datei-rueber");
    assert.deepEqual(ca.status, [], "beim ersten Bild kein Guthaben-Abruf");
    await A.locator("#go").click(); await G.poll(() => ca.status.length, (n) => n === 1, { what: "Guthaben erst beim Oeffnen" });
    assert.doesNotMatch(await text(A, ".tlcard"), /Relais/);
    await A.locator(".tlov .press").click(); await A.locator(".tlqr:not([hidden])").waitFor();
    assert.deepEqual(await A.evaluate(() => window.__toolOpts), { direct: true, purpose: "file", grant: false });
    await A.evaluate(() => window.__toolFail());
    await A.getByText("Keine direkte Verbindung möglich (z. B. Mobilfunk oder Firmennetz). Versucht es im selben WLAN.").waitFor();
    await A.getByText("Mit Guthaben klappt es auch über ein Relais, das nur verschlüsselte Daten sieht.").waitFor();
    assert.equal(await A.locator(".tlqr").count(), 0); await A.getByRole("button", { name: "Neu verbinden" }).waitFor();
    await snap(A, "datei-7-kein-direkter-weg");
    // the way to top up: the free card with its "Aufladen" (part erschaffen, create-ui.js)
    await A.getByRole("button", { name: "Guthaben aufladen" }).click();
    assert.equal(await A.locator(".tlov").count(), 0);
    await A.waitForFunction(() => window.Parts.ready("erschaffen"));
    const cb = await device(b, "b", "phone390", 0), B = await cb.newPage(); B.errs = []; B.on("pageerror", (e) => B.errs.push(String(e)));
    await B.addInitScript(() => { window.__toolNoPath = true; });
    await B.goto((await G.webUrl("index.html")) + "#tl=" + TOKEN + "&w=datei");
    await B.getByText("Keine direkte Verbindung möglich (z. B. Mobilfunk oder Firmennetz). Versucht es im selben WLAN.").waitFor();
    assert.deepEqual(await B.evaluate(() => window.__toolOpts), { direct: true, purpose: "file", grant: false }, "Guthaben 0: auch das beitretende Geraet nur direkt");
    // paying (credit > 0): the relay may carry the ciphertext, and the card says so; without any path the plain network word
    const cc = await device(b, "a", "phone390", 3), C2 = await G.open(cc, "#i=datei-rueber");
    await C2.locator("#go").click();
    await G.poll(() => text(C2, ".tlcard"), (v) => /wenn kein direkter Weg geht, über ein Relais, das nichts lesen kann/.test(v), { what: "Relais-Satz fuer Zahlende" });
    await C2.locator(".tlov .press").click(); await C2.locator(".tlqr:not([hidden])").waitFor();
    assert.deepEqual(await C2.evaluate(() => window.__toolOpts), { direct: false, purpose: "file", grant: true });
    // the grant for the bridge: asked for this channel only, after the pair met (live.js, before /ice)
    assert.equal(await C2.evaluate(() => window.__toolGrant("ab".repeat(32))), "rg1.test-abababab");
    await C2.evaluate(() => window.__toolFail());
    await C2.getByText("Eure Netze lassen gerade keine Verbindung zu", { exact: false }).waitFor();
    assert.equal(await C2.getByText("Mit Guthaben klappt es").count(), 0);
    // the one switch: relay for everyone (DailyFlags.toolRelay), even without credit
    const cd = await device(b, "a"); await cd.addInitScript(() => { window.DailyFlags = { toolRelay: true }; });
    const D2 = await G.open(cd, "#i=datei-rueber"); await D2.locator("#go").click(); await D2.locator(".tlov .press").click(); await D2.locator(".tlqr:not([hidden])").waitFor();
    assert.deepEqual(await D2.evaluate(() => window.__toolOpts), { direct: false, purpose: "file", grant: true });
    assert.equal(await D2.evaluate(() => window.__toolGrant("ab".repeat(32))), null, "Schalter ohne Guthaben: kein Grant, die Bridge entscheidet (PLAY_FILE_RELAY)");
    for (const c of [ca, cb, cc, cd]) for (const body of c.status) assert.match(body, /^\{("channel":"[0-9a-f]{64}")?\}$/, "nur der Kanal geht mit, kein Dateiname, keine Geraete-Kennung");
    assert.deepEqual(A.errs.concat(B.errs, C2.errs, D2.errs), []);
    assert.deepEqual(ca.out.concat(cb.out, cc.out, cd.out), []);
  } finally { await b.close(); }
});
