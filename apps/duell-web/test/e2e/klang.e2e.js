"use strict";
// Stimme verzerren (part klang) in a real Chromium with a fake microphone (--use-fake-device-for-media-stream and
// --use-file-for-fake-audio-capture with a synthetic voice): record only after the tap, effect and tempo chips that
// play at once, undo, the video (type, size, length) and the sound file through the share menu or as a download, and
// over the whole sharing not one request with sound or video to any host; a video that hangs ends after its time limit.
// Received: "Answer" (only the button, not a tap on the card) records at once where the microphone is allowed, else explains first.
// Old links of the three merged cards open the new one with their effect. axe, de/en, 328/390 px and 200 % zoom.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright-core");
const G = require("./lib/grund.js");
const S = require("../../src/studio.js");
const { ensureBuilt } = require("../../scripts/ensure-build.js");
const T = require("../../src/texts.json");

let AXE = null;
try { AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) {}
const RULES = { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } };

// The fake microphone: 3 s of a "voice" (220 Hz with moving vowels), looped by Chromium.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "klang-")), mic = path.join(dir, "mic.wav");
{ const n = 44100 * 3, a = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / 44100; a[i] = 0.5 * Math.sin(2 * Math.PI * (220 + 40 * Math.sin(t * 3)) * t) * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.5))); } fs.writeFileSync(mic, S.wav(a, 44100)); }
const launch = () => chromium.launch({ executablePath: process.env.PW_CHROME || undefined, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--use-file-for-fake-audio-capture=" + mic, "--autoplay-policy=no-user-gesture-required"] });

// Counts every microphone request and every sound played (Kit.playPcm), and catches what goes to the share menu.
const SPY = () => {
  window.__mic = 0; window.__shared = [];
  const md = navigator.mediaDevices, gum = md && md.getUserMedia && md.getUserMedia.bind(md);
  if (gum) md.getUserMedia = (c) => { window.__mic++; return gum(c); };
  if (window.__share !== false) {
    navigator.canShare = (d) => !!(d && d.files && d.files.length);
    navigator.share = async (d) => { for (const f of d.files || []) window.__shared.push({ name: f.name, type: f.type, size: f.size, url: URL.createObjectURL(f), text: d.text || "" }); };
  }
  addEventListener("DOMContentLoaded", () => { const P = window.Kit.playPcm; window.__played = 0; window.Kit.playPcm = function () { window.__played++; return P.apply(this, arguments); }; });
};
const ed = (p, f) => p.evaluate(f);
// How long a recorded video plays: WebM from MediaRecorder carries no length, so seek far to the end first.
const length = (p, url) => p.evaluate((u) => new Promise((ok) => {
  const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = u;
  v.onloadedmetadata = () => { v.currentTime = 1e6; };
  v.onseeked = () => ok(v.duration);
  v.onerror = () => ok(-1); setTimeout(() => ok(-2), 15000);
}), url);

async function editor(p, lang) {
  await p.locator("#go").click();
  await p.getByRole("tab", { name: T[lang].tabVoice }).waitFor();
  await p.locator("#panel .klplay").waitFor();
}

test("Stimme verzerren: Aufnahme nur nach Tipp, Effekt + Tempo sofort hoerbar, Zurueck, Video und Ton ueber das Teilen-Menue, 0 Requests mit Ton oder Video", async () => {
  ensureBuilt("");
  const b = await launch(), ctx = await G.person(b, { lang: "de", view: "phone390", web: true });
  await ctx.addInitScript(SPY);
  const p = await G.open(ctx, "#i=stimme-verzerren");
  await editor(p, "de");
  const panel = await p.locator("#panel").innerText();
  assert.match(panel, /braucht die App dein Mikrofon/); assert.match(panel, /Nimm nur dich selbst auf, oder frag vorher\./); assert.match(panel, /Bis zu 10 Sekunden/);
  await p.waitForTimeout(800);
  assert.equal(await ed(p, () => window.__mic), 0, "kein Mikrofon ohne Tipp");
  // record: 3-2-1, the ring, a tap stops it
  await p.getByRole("button", { name: /Aufnehmen/ }).click();
  await p.locator("#panel .ring").waitFor({ timeout: 6000 });
  assert.equal(await ed(p, () => window.__mic), 1);
  await p.waitForTimeout(2500); await p.locator("#panel .ring").click();
  const take = await G.poll(() => ed(p, () => { const e = window.DailyApp.ed(); return e.raw ? { n: e.raw.length, own: !!e.ownVoice, loud: Math.max(...Array.from(e.raw.slice(0, 22050), Math.abs)) } : null; }), Boolean, { what: "Aufnahme da" });
  assert.ok(take.n > 22050 * 1.5 && take.n < 22050 * 4, "etwa 2,5 s: " + take.n); assert.ok(take.own); assert.ok(take.loud > 0.01, "Ton vom Mikrofon");
  await p.getByRole("button", { name: /Neu aufnehmen/ }).waitFor();
  // an effect: applied and played at once; the tempo on top
  const played = await ed(p, () => window.__played);
  await p.getByRole("button", { name: "👽 Alien" }).click();
  assert.equal(await ed(p, () => window.DailyApp.ed().doc.fx), "alien"); assert.ok(await ed(p, () => window.__played) > played, "sofort vorgehoert");
  // keyboard: Enter on a focused chip works like a tap
  await p.getByRole("button", { name: /Zeitlupe/ }).focus(); await p.keyboard.press("Enter");
  const st = await ed(p, () => { const e = window.DailyApp.ed(); return { tp: e.doc.tp, fx: e.doc.fx, n: e.pcm.length, raw: e.raw.length }; });
  assert.equal(st.tp, "slow"); assert.equal(st.fx, "alien"); assert.equal(st.n, Math.floor(st.raw / 0.62), "Zeitlupe macht es laenger");
  await p.getByRole("button", { name: /Zurück/ }).click();
  assert.deepEqual(await ed(p, () => [window.DailyApp.ed().doc.fx, window.DailyApp.ed().doc.tp]), ["alien", undefined], "Zurueck nimmt das Tempo zurueck");
  await p.getByRole("button", { name: /Zeitlupe/ }).click();
  assert.deepEqual(await G.smallTargets(p, "#panel"), [], "44 px");
  // finished: the link carries effect, tempo and text only; the file buttons with the note before them
  await p.locator("#edmain").click(); await p.locator("#klopen").click(); await p.locator("#klsheet[open]").waitFor();
  const link = await ed(p, () => window.DailyDebug.result().url), doc = require("../../src/daily.js").parseRoute(link.slice(link.indexOf("#"))).doc;
  assert.equal(doc.fx, "alien"); assert.equal(doc.tp, "slow"); assert.equal(doc.i, "stimme-verzerren");
  assert.ok(link.length < 1500 && !/UklGR|audio|webm|mp4/.test(link), "kein Ton im Link");
  const box = await p.locator("#klsheet").innerText();
  assert.match(box, /Die Aufnahme speichern wir nicht\. Sie geht direkt von deinem Gerät in den Chat\./); assert.match(box, /Verzerrt heißt nicht anonym, und ein Video kann weitergeleitet werden\./);
  assert.ok(box.indexOf("speichern wir nicht") < box.indexOf("Video machen") && box.indexOf("nicht anonym") < box.indexOf("Video machen"), "die Hinweise stehen vor den Knoepfen");
  // every request from here on (all hosts), with its body
  const reqs = []; ctx.on("request", (r) => reqs.push({ url: r.url(), method: r.method(), type: r.resourceType(), body: r.postDataBuffer() ? r.postDataBuffer().length : 0 }));
  const vb = p.getByRole("button", { name: /Video machen/ });
  await vb.click();
  await p.getByRole("button", { name: /Video teilen/ }).waitFor({ timeout: 60000 });
  await p.getByRole("button", { name: /Video teilen/ }).click();
  await p.getByRole("button", { name: /Nur Ton teilen/ }).click();
  const files = await G.poll(() => ed(p, () => window.__shared), (l) => l.length === 2, { what: "zwei Dateien geteilt" });
  const [vid, wav] = files, pcm = await ed(p, () => window.DailyDebug.result().keep.pcm.length);
  assert.match(vid.type, /^video\/(mp4|webm)$/); assert.equal(vid.name, "my-daily-voice." + (vid.type === "video/mp4" ? "mp4" : "webm"));
  const want = await ed(p, () => (MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm"));
  assert.equal(vid.type, want, "MP4 wo der Browser es aufnimmt, sonst WebM");
  assert.ok(vid.size > 20000 && vid.size < 2 * 1024 * 1024, "Video " + vid.size + " B");
  const sec = await length(p, vid.url);
  assert.ok(Math.abs(sec - pcm / 22050) < 1, "Videolaenge " + sec + " s, Ton " + (pcm / 22050).toFixed(2) + " s");
  assert.equal(wav.type, "audio/wav"); assert.equal(wav.name, "my-daily-voice.wav"); assert.equal(wav.size, 44 + pcm * 2); assert.ok(wav.size < 2 * 1024 * 1024);
  assert.match(vid.text, /Antworte mit deiner Stimme: \S+#c=/, "im Text der Link zum Zuruecksprechen");
  // the network over the whole sharing: nothing with a body, nothing that is sound or video, no other host
  const out = reqs.filter((r) => !/^(blob|data):/.test(r.url));
  assert.deepEqual(out.filter((r) => r.body > 0 || r.method !== "GET" || r.type === "media" || r.type === "fetch" || r.type === "xhr" || !G.isLocal(r.url)), [], "0 Requests mit Ton oder Video");
  console.log("klang: " + vid.type + " " + vid.size + " B " + sec.toFixed(2) + " s; wav " + wav.size + " B; Requests beim Teilen: " + out.length);
  assert.deepEqual(p.errs, []); await b.close();
});

test("Stimme verzerren: ohne Teilen-Menue ein Download; Empfaenger antwortet mit einem Tipp (en); alte Links mit ihrem Effekt", async () => {
  ensureBuilt("");
  const b = await launch(), ctx = await G.person(b, { lang: "de", view: "phone328" });
  await ctx.addInitScript(() => { window.__share = false; }); await ctx.addInitScript(SPY);
  const p = await G.open(ctx, "#i=stimme-maus");
  await editor(p, "de");
  assert.equal(await ed(p, () => window.DailyApp.ed().doc.fx), "chip", "der alte Hamster-Link oeffnet den Hamster");
  assert.equal(await ed(p, () => window.DailyApp.ed().doc.i), "stimme-verzerren");
  await p.getByRole("button", { name: /Quatschstimme/ }).click();
  await p.locator("#edmain").click(); await p.locator("#klopen").click(); await p.locator("#klsheet[open]").waitFor();
  const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: /Nur Ton teilen/ }).click()]);
  assert.equal(dl.suggestedFilename(), "my-daily-voice.wav");
  const bytes = fs.readFileSync(await dl.path()); assert.equal(bytes.slice(0, 4).toString(), "RIFF");
  const link = await ed(p, () => window.DailyDebug.result().url);
  // the longest file: 10 s of voice, echo with its tail, slow motion (about 18 s): still under 2 MB
  await p.keyboard.press("Escape"); await p.locator("#klsheet[open]").waitFor({ state: "detached" }).catch(() => {});
  assert.equal(await p.locator("#klsheet[open]").count(), 0, "Esc schliesst das Blatt");
  await p.locator("#keep").click(); await p.locator("#panel .klplay").waitFor();
  await ed(p, () => { const e = window.DailyApp.ed(), a = new Float32Array(22050 * 10); for (let i = 0; i < a.length; i++) a[i] = 0.4 * Math.sin(i * 0.07) * Math.sin(i * 0.0004); e.raw = a; e.doc.fx = "echo"; e.doc.tp = "slow"; window.Klang.apply(a, e.doc); e.pcm = window.Klang.apply(a, e.doc); });
  await p.locator("#edmain").click(); await p.locator("#klopen").click(); await p.locator("#klsheet[open]").waitFor();
  const big = await ed(p, async () => { const r = window.DailyDebug.result(), v = await window.Klang.video(r, true); return { type: v.type, size: v.size, url: URL.createObjectURL(v), sec: r.keep.pcm.length / 22050 }; });
  assert.ok(big.sec > 17, "laengste Aufnahme " + big.sec + " s"); assert.ok(big.size < 2 * 1024 * 1024, "laengstes Video " + big.size + " B");
  const bigSec = await length(p, big.url); assert.ok(Math.abs(bigSec - big.sec) < 1, bigSec + " s");
  console.log("klang laengstes Video: " + big.type + " " + big.size + " B " + bigSec.toFixed(2) + " s");
  // a browser without MP4 recording (Firefox, older Chrome): WebM
  const wb = await ed(p, async () => { const MR = window.MediaRecorder, is = MR.isTypeSupported.bind(MR); MR.isTypeSupported = (x) => !/mp4/.test(x) && is(x); const r = window.DailyDebug.result(); r.keep.pcm = r.keep.pcm.slice(0, 22050 * 2); const v = await window.Klang.video(r, false); MR.isTypeSupported = is; return { type: v.type, size: v.size, url: URL.createObjectURL(v) }; });
  assert.equal(wb.type, "video/webm"); assert.ok(wb.size > 5000 && wb.size < 2 * 1024 * 1024, "WebM " + wb.size);
  const wbSec = await length(p, wb.url); assert.ok(Math.abs(wbSec - 2) < 1, "WebM " + wbSec + " s");
  console.log("klang WebM: " + wb.size + " B " + wbSec.toFixed(2) + " s");
  for (const [old, fx] of [["stimme-monster", "monster"], ["stimme-robo", "robot"]]) {
    const o = await G.open(ctx, "#i=" + old); await editor(o, "de");
    assert.equal(await ed(o, () => window.DailyApp.ed().doc.fx), fx, old); await o.close();
  }
  // the friend, English: a tap on the card itself never records; the main button "Answer" does
  const fr = await G.person(b, { lang: "en", view: "phone390" }); await fr.addInitScript(SPY);
  const t = await G.open(fr, link.slice(link.indexOf("#")));
  const pv = await t.locator("#pv").boundingBox(); await t.mouse.click(pv.x + pv.width / 2, pv.y + pv.height / 2); await t.waitForTimeout(3000);
  assert.equal(await ed(t, () => window.__mic), 0, "Tipp auf die Karte: kein Mikrofon"); await t.close();
  // microphone not allowed yet: the explanation first (big, read out, the record button in focus), no system question
  const q = await G.open(fr, link.slice(link.indexOf("#")));
  assert.equal(await q.locator("#go").textContent(), "🎙 Answer");
  assert.equal(await ed(q, () => window.__mic), 0);
  await q.locator("#go").click(); await q.locator("#panel .klmic.first").waitFor(); await q.waitForTimeout(1500);
  assert.equal(await ed(q, () => window.__mic), 0, "erst die Erklaerung, dann fragt das System");
  assert.match(await q.locator("#panel .klmic.first").innerText(), /needs your microphone[\s\S]*Only record yourself, or ask first\./);
  assert.equal(await ed(q, () => document.activeElement.classList.contains("klrec")), true, "der Aufnahmeknopf hat den Fokus");
  await q.keyboard.press("Enter"); await q.locator("#panel .ring").waitFor({ timeout: 8000 });
  assert.equal(await ed(q, () => window.__mic), 1);
  await q.locator("#panel .ring").click();
  await G.poll(() => ed(q, () => !!window.DailyApp.ed().ownVoice), Boolean, { what: "eigene Stimme" });
  assert.equal(await ed(q, () => window.DailyApp.ed().doc.fx), "chip", "mit dem Effekt des Absenders");
  // microphone allowed before (web route, permission granted): "Answer" is the one tap, the take starts (3-2-1)
  const gr = await G.person(b, { lang: "de", view: "phone390", web: true }); await gr.addInitScript(SPY);
  await gr.grantPermissions(["microphone"], { origin: new URL(await G.webUrl("index.html")).origin });
  const w = await G.open(gr, link.slice(link.indexOf("#")));
  assert.equal(await w.locator("#go").textContent(), "🎙 Antworten");
  await w.locator("#go").click(); await w.locator("#panel .ring").waitFor({ timeout: 8000 });
  assert.equal(await ed(w, () => window.__mic), 1, "ein Tipp: Aufnahme laeuft");
  await w.locator("#panel .ring").click();
  q.errs.push(...w.errs);
  assert.deepEqual(p.errs.concat(q.errs), []); await b.close();
});

test("Stimme verzerren: axe 0 Verstoesse, 44 px, kein Querscrollen – de/en, 328/390 px, 200 % Zoom, reduzierte Bewegung", { skip: !AXE && "axe-core fehlt" }, async () => {
  ensureBuilt("");
  const b = await launch(), bad = [];
  for (const [lang, view] of [["de", "phone328"], ["en", "phone390"], ["de", "zoom200"], ["en", "zoom200quer"]]) {
    const ctx = await G.person(b, { lang, view }); await ctx.addInitScript(SPY);
    const p = await G.open(ctx, "#i=stimme-verzerren");
    await p.emulateMedia({ reducedMotion: "reduce" });
    await editor(p, lang);
    await p.getByRole("button", { name: /🤪/ }).click();
    const check = async (where, sel) => {
      if (!(await p.evaluate(() => !!window.axe))) await p.addScriptTag({ content: AXE });
      const v = await p.evaluate(([s, o]) => window.axe.run(document.querySelector(s), o).then((r) => r.violations.map((x) => x.id + ": " + x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "))), [sel, RULES]);
      v.forEach((x) => bad.push(lang + " " + view + " " + where + ": " + x));
      (await G.smallTargets(p, sel)).forEach((x) => bad.push(lang + " " + view + " " + where + " klein: " + x));
      if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) bad.push(lang + " " + view + " " + where + ": quer scrollen");
    };
    await check("Editor", "#panel");
    await p.locator("#edmain").click(); await p.locator("#klopen").click(); await p.locator("#klsheet[open]").waitFor(); await p.waitForTimeout(300);
    await check("Fertig-Blatt", "#klsheet");
    assert.match(await p.locator("#klsheet").innerText(), lang === "de" ? /Die Aufnahme speichern wir nicht/ : /We do not store the recording/);
    // the subtitle switch in the card's look, not the browser's blue
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector(".klsub input")).appearance), "none");
    await p.keyboard.press("Escape"); await p.waitForTimeout(200); await check("Fertig", "#done");
    // the finished picture as big as with any other card: the file button sits in Save's place
    const pic = async (q) => q.evaluate(() => Math.round(document.getElementById("doneimg").getBoundingClientRect().height));
    const mine = await pic(p), o = await G.open(ctx, "#i=karte-lob"); await o.locator("#go").click(); await o.locator("#edmain").click(); await o.locator("#share").waitFor(); await o.waitForTimeout(800);
    const other = await pic(o); await o.close();
    if (mine < other - 1) bad.push(lang + " " + view + ": Fertig-Bild " + mine + " px, andere Karte " + other + " px");
    console.log("klang Fertig-Bild " + lang + " " + view + ": " + mine + " px (Karte: " + other + " px)");
    assert.deepEqual(p.errs, [], lang + " " + view); await ctx.close();
  }
  assert.deepEqual(bad, []); await b.close();
});

test("Stimme verzerren: ein Video, das haengt (Audio-Uhr steht, Recorder meldet kein Ende), bricht nach Tonlaenge + 5 s ab; neuer Versuch geht", async () => {
  ensureBuilt("");
  const b = await launch();
  const STALL = () => {
    const P = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function () { if (window.__stall === "clock") return; return P.apply(this, arguments); };
    addEventListener("DOMContentLoaded", () => { const st = MediaRecorder.prototype.stop; MediaRecorder.prototype.stop = function () { if (window.__stall === "stop" && this.stream.getVideoTracks().length) return; return st.apply(this, arguments); }; });
  };
  for (const kind of ["clock", "stop"]) {
    const ctx = await G.person(b, { lang: "de", view: "phone390" }); await ctx.addInitScript(SPY); await ctx.addInitScript(STALL);
    const p = await G.open(ctx, "#i=stimme-verzerren"); await editor(p, "de");
    await p.getByRole("button", { name: /Quatschstimme/ }).click();
    await p.locator("#edmain").click(); await p.locator("#klopen").click(); await p.locator("#klsheet[open]").waitFor();
    const sec = await ed(p, () => window.DailyDebug.result().keep.pcm.length / 22050);
    await p.evaluate((k) => { window.__stall = k; }, kind);
    const t0 = Date.now(); await p.getByRole("button", { name: /Video machen/ }).click();
    await p.locator("#klsheet .btn[aria-busy=true]").waitFor();
    await p.locator("#klsheet .btn[aria-busy=true]").waitFor({ state: "detached", timeout: (sec + 12) * 1000 });
    const took = (Date.now() - t0) / 1000;
    assert.ok(took >= sec + 4 && took < sec + 9, kind + ": Abbruch nach " + took.toFixed(1) + " s (Ton " + sec.toFixed(1) + " s + 5 s)");
    assert.match(await p.locator("#klsheet").innerText(), /Video machen/, kind + ": der Knopf ist wieder da");
    assert.match(await p.locator("#toast").textContent(), /Ein Video geht hier nicht/, kind + ": kl_fail");
    await ed(p, () => { window.__stall = ""; });
    await p.getByRole("button", { name: /Video machen/ }).click();
    await p.getByRole("button", { name: /Video teilen/ }).waitFor({ timeout: 30000 });
    console.log("klang Abbruch " + kind + ": nach " + took.toFixed(1) + " s, zweiter Versuch fertig");
    assert.deepEqual(p.errs, [], kind); await ctx.close();
  }
  await b.close();
});
