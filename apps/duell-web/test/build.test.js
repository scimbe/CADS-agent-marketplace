"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const dist = path.join(__dirname, "../dist/index.html");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
// The page as it runs: the core (dist/index.html) and its parts (dist/parts/, loaded on first use by src/parts.js).
const partFiles = () => fs.readdirSync(path.join(path.dirname(dist), "parts")).map((f) => path.join(path.dirname(dist), "parts", f));
const bundle = () => [fs.readFileSync(dist, "utf8")].concat(partFiles().map((f) => fs.readFileSync(f, "utf8"))).join("\n");

// Parts that only some people open, never in the web's idle preload: the list ONDEMAND in src/parts.js. They have a
// budget of their own (ONDEMAND_MAX, proposal 512 KiB, awaiting the user's decision); the 1.75 MiB below count only what
// every web visitor downloads: the core and the parts preloaded on idle.
const ONDEMAND = JSON.parse(src("parts.js").match(/var ONDEMAND = (\[[^\]]*\]);/)[1]), ONDEMAND_MAX = 512 * 1024;
// The core's budget (see the test below): 700 KiB again. It was raised to 724 992 B until redesign wave R4 (user decision,
// 8 Nov 2026); R4 moved the editor's tabs and panels into the part blasen (src/blasen.js), so the raise is over.
const CORE_MAX = 700 * 1024;
test("Kern-Budget wieder 700 KiB (716 800 B): die befristete Anhebung bis Welle R4 ist vorbei", () => {
  assert.equal(CORE_MAX, 716800);
});
test("Build: Kern + Teildateien, voll offline, alle Welten da, Platzhalter ersetzt, Kern unter 700 KB, jede Teildatei unter 300 KB", () => {
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js")]);
  const html = fs.readFileSync(dist, "utf8");
  assert.ok(!/\/\*@[A-Z]+@\*\//.test(html), "Platzhalter uebrig");
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*["']?https?:/i.test(html), "externe Ressource");
  assert.ok(!/<(img|audio|video|iframe)[^>]+src=["']https?:/i.test(html));
  const core = require("../src/core.js");
  for (const t of core.THEME_NAMES) assert.match(html, new RegExp("\\b" + t + ":\\s*\\{"), "Welt " + t);
  // At 998 KB the single page was split (rule: past 1 MB split instead of growing). The core (home, calendar sheet, editor,
  // sharing) stays below 700 KB, every part below 300 KB; new, rarely used code goes into a part (scripts/build.js PARTS).
  // Sizes at the split: core 693 KB, parts 310 KB (play 140, table 104, qr 59, licenses 6), together 1003 KB.
  // Core budget 700 KiB (716 800 B). From 8 Nov 2026 it was raised to 724 992 B until redesign wave R4; R4 moved PANEL/TABS
  // into the part blasen and brought the core back under 700 KiB.
  console.log("Kern " + Buffer.byteLength(html) + " B (< " + CORE_MAX + ")");
  assert.ok(Buffer.byteLength(html) < CORE_MAX, "Kern ueber " + CORE_MAX + " B: " + Buffer.byteLength(html));
  const man = JSON.parse(html.match(/window\.DailyParts=(\{.*?\});window\./)[1]), files = partFiles();
  // The preview pictures (scripts/shots.js) come in parts of their own, bilda, bildb … (checked below).
  const shotParts = Object.keys(man).filter((n) => /^bild[a-z]$/.test(n));
  assert.ok(shotParts.length >= 1, "Vorschaubilder fehlen");
  assert.deepEqual(Object.keys(man).filter((n) => shotParts.indexOf(n) < 0).sort(), ["blasen", "dart", "daten", "deck", "direkt", "erschaffen", "katalog", "kibild", "klang", "konto", "lauf", "licenses", "logik", "malen", "melden", "noto", "play", "push", "qr", "quiz", "regler", "robot", "satz", "start", "stil", "stimme", "table", "texte", "turnzwei", "warten", "welt", "wetter"]);
  // The new start (redesign wave 1) is a part: its code, keywords and words only there, in the core only the hooks.
  const startBody = fs.readFileSync(partFiles().find((f) => /\/start\.[0-9a-f]{12}\.js$/.test(f)), "utf8");
  assert.match(startBody, /root\.StartUI = \{/); assert.match(startBody, /root\.StartIntent = api/); assert.match(startBody, /window\.StartTexts=\{"de":\{"st_ask":"Wem willst du heute eine Freude machen\?"/);
  assert.ok(!/StartUI = \{|"st_ask":|"st_shortOk":/.test(html), "start: nur die Haken im Kern");
  assert.match(html, /if \(window\.StartUI\) window\.StartUI\.home\(h\);/);
  // The account card: its texts (ac_) only in the part konto, none in the core
  assert.ok(!/"ac_[a-z]/.test(html), "ac_-Texte im Kern");
  assert.match(fs.readFileSync(partFiles().find((f) => /\/konto\.[0-9a-f]{12}\.js$/.test(f)), "utf8"), /window\.KontoTexts=\{"de":\{"ac_title":"Konto \(freiwillig\)"/);
  // My style, the report dialog and the weather card: code and words only in their parts, in the core
  // only the hooks; the words the sheet and daily.js prefChips still use stay in the core.
  assert.deepEqual(man.stil.d, [], "ohne konto oeffnet Mein Stil weiter, nur ohne Konto-Abschnitt (app.js openStyle)");
  for (const [n, re, words] of [["stil", /root\.StilUI = \{/, /"(nickNote|fs_title|pf_title|pf_pp_later|set_tiere|ms_pv|ms_data)":/], ["melden", /root\.Melden = \{/, /"(kiAsk|kiConsent|kiWhy_harm|kiThanks)":/], ["wetter", /root\.Wetter = \{/, /"wx[A-Z]\w*":/]]) {
    const body = fs.readFileSync(partFiles().find((f) => new RegExp("/" + n + "\\.[0-9a-f]{12}\\.js$").test(f)), "utf8");
    assert.match(body, re, n); assert.match(body, words, n + ": Texte im Teil"); assert.ok(!re.test(html) && !words.test(html), n + ": nur der Haken im Kern");
  }
  assert.match(html, /"kiReported":/); assert.match(html, /"pf_age_u16":/); assert.match(html, /"pf_ctx_hh":/);
  for (const n of Object.keys(man)) assert.match(n, /^[a-z]{1,20}$/, "Teilname nur Buchstaben (Galerie-Server und Android lassen nur [a-z]{1,20} durch): " + n);
  assert.equal(files.length, Object.keys(man).length, "nur die Teile aus dem Manifest liegen in dist/parts");
  let sum = 0, onDemand = 0, shotSum = 0;
  for (const [name, p] of Object.entries(man)) {
    assert.match(p.f, new RegExp("^parts/" + name + "\\.[0-9a-f]{12}\\.js$"), "Name mit Inhalts-Hash");
    const body = fs.readFileSync(path.join(path.dirname(dist), p.f));
    assert.ok(body.length < 300 * 1024, "Teil " + name + " ueber 300 KB: " + body.length);
    assert.equal(p.h, "sha384-" + require("node:crypto").createHash("sha384").update(body).digest("base64"), "SRI-Hash von " + name);
    for (const d of p.d) assert.ok(man[d], "Abhaengigkeit " + d);
    if (shotParts.indexOf(name) >= 0) shotSum += body.length; else if (ONDEMAND.includes(name)) onDemand += body.length; else sum += body.length;
  }
  // Preview pictures (Nov 2026, "YouTube-Vorschaubilder" on the start page): one real screenshot per shelf card, WebP
  // 216x288 as data: URLs, about 80 KB per part. They have a budget of their own, outside the 1.75 MiB below: no part of
  // them is preloaded on idle (src/parts.js), the start page loads a part when one of its pictures comes near the screen, so
  // a visit that only looks at the rail loads one or two parts (80-160 KB), never all of them.
  assert.ok(shotSum < 560 * 1024, "Vorschaubilder zusammen: " + shotSum);
  for (const n of shotParts) {
    const body = fs.readFileSync(path.join(path.dirname(dist), man[n].f), "utf8");
    assert.match(body, /^window\.DailyShots=Object\.assign\(window\.DailyShots\|\|\{\},\{("[a-z0-9-]+":"data:image\/webp;base64,[A-Za-z0-9+/=]+",?)+\}\);\n$/, n + ": nur Bilder");
    assert.ok(body.length < 96 * 1024, n + " klein: " + body.length); assert.deepEqual(man[n].d, [], n);
  }
  assert.ok(!/DailyShots=|data:image\/webp/.test(html), "keine Vorschaubilder im Kern");
  const shotMap = JSON.parse(fs.readFileSync(partFiles().find((f) => /\/start\.[0-9a-f]{12}\.js$/.test(f)), "utf8").match(/"shots":(\{[^}]*\})/)[1]);
  assert.deepEqual(Object.keys(shotMap).sort(), require("../src/ideas.json").ideas.map((i) => i.id).sort(), "jede Karte im Regal hat ihr Bild (npm run shots)");
  assert.ok(Object.values(shotMap).every((n) => shotParts.indexOf(n) >= 0), "Bild-Teil im Manifest");
  // Two budgets (A0, Bauplan freie Karte): with #189, #190 and #194 together core + all parts were 1 840 060 B, 5 052 B over
  // 1.75 MiB. (a) What every web visitor downloads: the core plus every part preloaded on idle, below 1.75 MiB (was 1.6 MiB
  // until #183, 1.5 MiB until #174). (b) The parts only some people open (ONDEMAND in src/parts.js: noto, dart, klang and
  // the free card's engines lauf, blasen, bahn, raten): at most ONDEMAND_MAX together, each below 300 KB like every part.
  // A large part that would be preloaded on idle does not get room from (b): it counts in (a).
  const preload = Buffer.byteLength(html) + sum;
  console.log("Byte-Budget: Kern + vorgeladene Teile " + preload + " B (< " + 1.75 * 1024 * 1024 + "), nur bei Bedarf " + onDemand + " B (<= " + ONDEMAND_MAX + "): " + Object.keys(man).filter((n) => ONDEMAND.includes(n)).join(", "));
  assert.ok(preload < 1.75 * 1024 * 1024, "Kern + vorgeladene Teile: " + preload);
  assert.ok(onDemand <= ONDEMAND_MAX, "Teile nur bei Bedarf: " + onDemand);
  assert.deepEqual(ONDEMAND, ["noto", "dart", "klang", "lauf", "blasen", "bahn", "raten", "warten", "robot", "kibild"], "Liste nur bei Bedarf");   // kibild: KI-Bilder auf Wunsch, only when a button or a sheet with doc.gi.l asks
  for (const n of ["noto", "dart", "klang"]) assert.ok(man[n], "Teil nur bei Bedarf fehlt im Manifest: " + n);
  assert.match(src("parts.js"), /Object\.keys\(LIST\)\.forEach\(function \(n\) \{ if \(ONDEMAND\.indexOf\(n\) < 0 && !\/\^bild\[a-z\]\$\/\.test\(n\)\) need\(n\)/, "Teile aus ONDEMAND und die Vorschaubilder nicht im Leerlauf-Vorladen");
  assert.match(src("app.js"), /=== "voice"\) window\.Parts\.need\("klang"\)/, "klang kommt mit einem Stimm-Blatt");
  // Each part runs where it ran inside the page: the module code, not a stand-in. Spot checks on what moved.
  const part = (n) => fs.readFileSync(path.join(path.dirname(dist), man[n].f), "utf8");
  assert.match(part("play"), /window\.ArcadeUI = \{/); assert.match(part("play"), /window\.LiveUI = \{/);
  assert.match(part("table"), /window\.TableUI = \{/); assert.match(part("qr"), /root\.StatusCard =/);
  // Katalog v2 W0: the catalog is a part, the core keeps its index only; empty parts turnzwei/logik, the data part daten.
  const idx = JSON.parse(html.match(/window\.DuellIdeas=(\{.*?\});window\./)[1]), full = require("../src/ideas.json");
  assert.equal(idx.index, true); assert.equal(idx.ideas.length, full.ideas.length);
  // Shelf clean-up (2026-11, 209 -> 74 cards): what is left on the shelf are mostly turn cards whose rules live in turn.json,
  // so an entry is short and the shelf's index is a larger share of it than before (0.49 then). Hence two bars: the share of
  // the shelf alone, and the absolute size with what the core needs for old links (retired without tags, gone), which went
  // down from 40 307 B to under 27 000 B.
  const bytes = (x) => Buffer.byteLength(JSON.stringify(x)), shelf = (x) => ({ ideas: x.ideas, gated: x.gated });
  assert.ok(bytes(shelf(idx)) < bytes(shelf(full)) * 0.65, "Index klein: " + bytes(shelf(idx)));
  assert.ok(bytes(idx) < 27000, "Index unter 27 000 B: " + bytes(idx));
  assert.deepEqual(idx.retired.map((i) => i.id), full.retired.map((i) => i.id)); assert.deepEqual(idx.gone, full.gone);
  assert.ok(idx.retired.every((i) => !i.x), "keine Tags fuer Karten, die niemand mehr sucht");
  assert.match(part("katalog"), /^window\.DuellIdeasFull=\{/); assert.ok(!/"lines":/.test(html), "Kartentexte nur im Teil");
  assert.deepEqual(man.play.d, ["katalog"], "Arcade liest die vollen Eintraege");
  assert.match(part("turnzwei"), /root\.Turn2 = root\.Parts\.registry\("turnzwei"/); assert.match(part("logik"), /root\.Logik = root\.Parts\.registry\("logik"/);
  assert.match(part("daten"), /window\.KalenderData=\{/); assert.match(part("daten"), /root\.Kalender = api/); assert.ok(!/KalenderData=/.test(html));
  assert.match(html, /root\.Bausteine = \{/);
  // Stickers in the picture: the Noto Emoji sheet and its code only in the part noto, in the core only the hook (app.js notoFor).
  assert.match(part("noto"), /^window\.NotoData="iVBORw0KGgo[A-Za-z0-9+/=]+";/); assert.match(part("noto"), /root\.NotoStickers = api/);
  assert.ok(!/NotoData=|root\.NotoStickers = api/.test(html), "Noto-Bogen nur im Teil"); assert.match(html, /Parts\.need\("noto"\)/);
  assert.ok(part("noto").length < 128 * 1024, "noto klein: " + part("noto").length);
  assert.match(part("licenses"), /Noto Emoji \(https:\/\/github\.com\/googlefonts\/noto-emoji, commit e20cbc2b/);
  assert.match(part("licenses"), /Noto Emoji images[\s\S]*2D\/png\/128[\s\S]*Copyright 2013 Google, Inc\.[\s\S]*Modifications by My Daily Idea[\s\S]*TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/, "Bilder: Apache 2.0 mit Quelle und Aenderungshinweis");
  assert.match(part("welt"), /root\.WeltUI = \{/); assert.ok(!/root\.WeltUI = \{/.test(html), "Flugspiel-Einstieg nur im Teil");
  assert.match(part("texte"), /root\.TexteUI = \{/); assert.match(part("texte"), /window\.TexteData=\{/); assert.ok(!/root\.TexteUI = \{|window\.TexteData=/.test(html), "Texte und Song nur im Teil");
  assert.match(part("stimme"), /root\.Stimme = \{/); assert.match(part("stimme"), /root\.Stat = api/); assert.match(part("stimme"), /^window\.StimmeTexts=\{"de":\{"vote_/);
  assert.ok(!/root\.Stimme = \{|root\.Stat = api|"vote_q"/.test(html), "Daumen, Statistik und ihre Texte nur im Teil");
  // Stimme verzerren: effects, recording, video and file sharing only in the part klang, in the core only the hooks
  // (app.js voicePanel, applyFx, done); its words (kl_, rec, recing, dummy) travel with it.
  assert.match(part("klang"), /^window\.KlangTexts=\{"de":\{/); assert.match(part("klang"), /root\.KlangFx = api/); assert.match(part("klang"), /root\.Klang = \{ apply: K\.apply/);
  assert.ok(!/root\.KlangFx = api|root\.Klang = \{|"kl_note":|"recing":|new MediaRecorder\(st\)/.test(html), "Stimme verzerren nur im Teil");
  assert.match(html, /window\.Parts\.use\("klang"/); assert.deepEqual(man.klang.d, []);
  // Mal & Rat: rule, screen and word lists only in the part malen; the manifest names its game, so a link waits for it
  assert.deepEqual([man.malen.d, man.malen.g], [["katalog"], ["malrat"]]);
  assert.match(part("malen"), /^window\.MalratData=\{"text":\{"de":\{"mr_l_draw"/); assert.match(part("malen"), /root\.Malrat = api/); assert.match(part("malen"), /root\.Turn2\.add\("widget", "malrat"/);
  assert.ok(!/MalratData=|root\.Malrat = api|"mr_l_draw"/.test(html), "Mal & Rat nur im Teil");
  // Dart: rule, board, bot and texts only in the part dart; in the core only the card's index entry and the picture hook
  assert.deepEqual([man.dart.d, man.dart.g], [["katalog"], ["dart"]]);
  assert.match(part("dart"), /^window\.DartData=\{"text":\{"de":\{"da_l"/); assert.match(part("dart"), /root\.Dart = api/); assert.match(part("dart"), /root\.Turn2\.add\("widget", "dart"/);
  assert.ok(!/DartData=|root\.Dart = api|"da_l"|root\.DartUI/.test(html), "Dart nur im Teil");
  assert.match(html, /var own = Tn\.GAMES\[doc\.g\] && Tn\.GAMES\[doc\.g\]\.pic; if \(own\) return own\(c, W, H, doc\);/, "Bild-Haken im Kern");
  assert.match(part("satz"), /window\.SatzUI = \{/); assert.match(part("satz"), /root\.SatzLogic = api/);
  assert.ok(!/window\.SatzUI = \{|root\.SatzLogic = api/.test(html), "Satz zu Formular steckt nur im Teil, im Kern nur der Haken");
  assert.ok(!/window\.ArcadeUI = \{ menu|window\.TableUI = \{ open|root\.StatusCard =/.test(html), "verschobener Code steckt nicht doppelt im Kern");
  // Editor E1: undo, sticker tools, layer list, description and plain language in the part direkt, the named slider
  // steps in regler; the core keeps only the hooks (Parts.need at openEditor, Direkt.paint, the style slot).
  assert.match(part("direkt"), /root\.EditModel = api/); assert.match(part("direkt"), /root\.Direkt = \{ paint: paint/); assert.match(part("direkt"), /window\.DirektData=\{/);
  assert.match(part("regler"), /root\.Regeln = api/); assert.match(part("regler"), /A\.PANEL\.Rules = function/);
  assert.deepEqual(man.direkt.d, []); assert.deepEqual(man.regler.d, []);
  // R4: the editor's tab bar and panels (TABS, PANEL, tab) only in the part blasen, never preloaded on idle (ONDEMAND);
  // the core keeps the empty A.TABS/A.PANEL others add to, the stand-in tab() and the hook in openEditor.
  assert.match(part("blasen"), /root\.Blasen = \{ open: open, tab: tab, PANEL: PANEL/); assert.match(part("blasen"), /^Wish: function \(p\) \{$/m); assert.match(part("blasen"), /^function beatPanel\(p\) \{$/m);
  assert.deepEqual(man.blasen.d, []); assert.ok(ONDEMAND.includes("blasen"));
  // A3b: the parts of a card (src/teile.js) and their bubbles (src/blasen-ebene.js) come with it, in this order; never in the core
  const bl = part("blasen");
  assert.ok(bl.indexOf("else root.Teile = api") >= 0 && bl.indexOf("else root.Teile = api") < bl.indexOf("root.Blasen = {") && bl.indexOf("root.Blasen = {") < bl.indexOf("B.open = function (opt) {") && bl.indexOf("B.open = function (opt) {") < bl.indexOf("B.dialog = { open: open"), "Teile, Blasen, Ebene, Dialog im Teil blasen");
  assert.ok(!/root\.Teile = api|B\.ebene = \{/.test(html), "Teile und Blasen-Ebene nicht im Kern");
  assert.ok(!/Wish: function \(p\) \{|function beatPanel\(|function didLine\(|card: \["Text", "Style", "Color", "Sticker"\]/.test(html), "Reiter und Blasen nur im Teil");
  assert.match(html, /var TABS = \{\}, PANEL = \{\};/); assert.match(html, /window\.Parts\.use\("blasen", function \(\) \{ if \(ed === mine\)/);
  assert.ok(!/root\.EditModel = api|root\.Regeln = api|window\.DirektData=/.test(html), "Editor-Teile nicht im Kern");
  assert.match(html, /window\.Parts\.need\("direkt"\)/); assert.match(html, /if \(window\.Direkt\) window\.Direkt\.paint\(ed\);/);
  assert.ok(!/axe-core|axe\.run/.test(bundle()), "axe-core ist nur Testwerkzeug, nie ausgeliefert");
  assert.match(html, /<title>My Daily Idea<\/title>/);
  assert.match(html, /Content-Security-Policy[^>]*default-src 'none'/);
  // Parts come only from the page's own origin ('self'); on http(s) each with its SRI hash (src/parts.js).
  assert.match(html, /script-src 'unsafe-inline' 'self' https:\/\/webconference\.bunsenbrenner\.org 'wasm-unsafe-eval';/);
  assert.match(src("parts.js"), /s\.integrity = p\.h;/); assert.match(src("parts.js"), /s\.src = dir\(\) \+ p\.f;/);
  assert.match(html, /connect-src https:\/\/demos-34a13a96\.bunsenbrenner\.org https:\/\/webconference\.bunsenbrenner\.org wss:\/\/webconference\.bunsenbrenner\.org;/, "der eigene Host und fuer Live-Spiele nur die Webconference");
});
// The Guthaben view (credit, voucher; create-ui.js): code and words (gh_) only in the part erschaffen, in the core only the
// stand-in window.Guthaben (parts.js) and the address #aufladen (app.js route); the start page asks nothing for it.
test("Guthaben: Ansicht und Texte im Teil erschaffen (Ansicht unter 8 KB), im Kern nur Stand-in und #aufladen (unter 400 B)", () => {
  execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.js")]);
  const html = fs.readFileSync(dist, "utf8"), man = JSON.parse(html.match(/window\.DailyParts=(\{.*?\});window\./)[1]);
  const part = fs.readFileSync(path.join(path.dirname(dist), man.erschaffen.f), "utf8");
  assert.match(part, /root\.Guthaben = \{ open:/); assert.match(part, /"gh_title":"Guthaben"/); assert.match(part, /"gh_title":"Credit"/);
  assert.ok(!/"gh_[a-z_]+":/.test(html), "gh_-Texte im Kern");
  assert.ok(!/function guthaben\(/.test(html), "Ansicht im Kern");
  assert.match(html, /stand\("erschaffen", "Guthaben", \["open"\]\);/);
  assert.match(html, /location\.hash === "#aufladen"/);
  // the hooks in the core: the stand-in and the route, with their comments
  const hooks = (src("parts.js").match(/\n  \/\/ The Guthaben view[^\n]*\n[^\n]*\n  stand\("erschaffen"[^\n]*\n/) || [""])[0] + (src("app.js").match(/\n  \/\/ #aufladen[^\n]*\n[^\n]*\n/) || [""])[0];
  assert.ok(hooks.length > 100 && Buffer.byteLength(hooks) < 900, "Haken im Kern: " + Buffer.byteLength(hooks));
  assert.ok(Buffer.byteLength(noComments(hooks).replace(/\/\/[^\n]*/g, "")) < 400, "Haken ohne Kommentar unter 400 B");
  // the view itself (from its comment to fill()) stays small; the part as a whole is below 300 KB like every part (above)
  const view = part.slice(part.indexOf('/* "Guthaben":'), part.indexOf("function fill(b) {"));
  assert.ok(view.length > 2000 && view.length < 8 * 1024, "Guthaben-Ansicht: " + view.length);
  // the account card's entry travels with konto
  assert.match(fs.readFileSync(path.join(path.dirname(dist), man.konto.f), "utf8"), /"ac_credit":"Guthaben & Aufladen"/);
});
test("Datenschutz: Kurzlink nur ueber shortlink.js, nur bei Fertig (Nutzerentscheidung Redesign W1, der Hinweis sagt es) und fuer Status/Story; p= bleibt draussen", () => {
  assert.ok(src("shortlink.js").includes("(fetchFn || fetch)(API + path"));
  const app = src("app.js");
  assert.ok(!/ShortLink\.shorten/.test(app.replace(/function shortLink\(r\) \{[\s\S]*?\n\}/, "")), "app.js: nur shortLink() kuerzt");
  // exactly two callers: the finished screen (after the tap on "Fertig") and the status/story picture (after its tap)
  const calls = [...app.matchAll(/shortLink\(/g)].map((m) => app.slice(m.index - 25, m.index + 12)).filter((x) => !/function shortLink\(/.test(x));
  assert.equal(calls.length, 2, calls.join(" | "));
  assert.match(app, /show\("done", true\); Kit\.sfx\.win\(\);\n(?:[^\n]*\n){1,3}  var r = result; shortLink\(r\)/, "beim Fertig-Bildschirm");
  assert.match(app, /async function exportStory\(kind\) \{\n  Kit\.sfx\.tap\(\);\n  var link = await shortLink\(\)/, "Status/Story: nach dem Tipp");
  const game = src("game.js"), at = game.indexOf("ShortLink.shorten");
  assert.ok(at > game.indexOf('$("challenge").addEventListener("click"'), "game.js: nur im Klick");
});
test("Datenschutz: nur die erlaubten fetch-Stellen (Spielsatz, KI-Text, KI-Meldung, Kurzlink, Profil), nur getippter Text; kein anderer Weg nach draussen", () => {
  const html = noComments(bundle());
  // Every call site by name; a new one fails here until it is argued for and listed.
  // protokoll-page.js is its own page (dist/protokoll.html, connect-src 'self'): one GET for the speech model from this
  // domain, one POST with the redacted text after the explicit yes. Neither is in the app build below.
  // deck.js: one place (net) for the community deck of free cards: GET deck and key without a cookie, POST only its five
  // paths with a seal, thumb, token or the person's own objection (see the assertions below).
  const allowed = { "game.js": 1, "ai.js": 1, "live.js": 1, "deck.js": 1, "stat.js": 1, "profile.js": 1, "kibild.js": 1, "push.js": 1, "protokoll-page.js": 2 }, short = /\(fetchFn \|\| fetch\)\(/g;
  assert.match(src("protokoll-page.js"), /fetch\(url, \{ signal: ctl\.signal, credentials: "same-origin", cache: "no-store" \}\)/, "Modell nur per GET");
  assert.match(src("protokoll-page.js"), /input: P\.aiInput\(rec\.segs, rec\.names\)/, "an die KI nur der geschwaerzte Text");
  assert.ok(!/deviceMemory|hardwareConcurrency|userAgent/.test(src("protokoll-page.js").match(/JSON\.stringify\(\{ kind: "protokoll"[^\n]*/)[0]), "Geraetedaten bleiben auf dem Geraet");
  for (const f of fs.readdirSync(path.join(__dirname, "../src")).filter((n) => n.endsWith(".js"))) {
    assert.equal((noComments(src(f)).match(/\bfetch\(/g) || []).length, allowed[f] || 0, "direktes fetch( in " + f);
    assert.equal((noComments(src(f)).match(short) || []).length, f === "shortlink.js" ? 1 : 0, "Kurzlink-fetch in " + f);
  }
  assert.equal((html.match(/\bfetch\(/g) || []).length, allowed["game.js"] + allowed["ai.js"] + allowed["live.js"] + allowed["stat.js"] + allowed["profile.js"] + allowed["deck.js"] + allowed["kibild.js"] + allowed["push.js"], "direkte fetch( im Build (Kern + Teile)");
  // push.js ("Bescheid geben", part push): one place, only key/subscribe/unsubscribe/wake of the push API, never a cookie;
  // what goes out is the browser's subscription, the mark with its delete key, or { mark, r } (test/push.test.js).
  assert.match(noComments(src("push.js")), /deps\.fetch\(base\(\) \+ path, body \? \{ method: "POST"[^\n]*credentials: "omit", referrerPolicy: "no-referrer" \} : \{ credentials: "omit" \}\)/, "Push nur ohne Cookie");
  const dk = noComments(src("deck.js"));
  assert.match(dk, /fetch\(base\(\) \+ path, get \? \{ credentials: "omit", referrerPolicy: "no-referrer" \} : \{ method: "POST"[^\n]*credentials: "same-origin"/, "Deck und Schluessel ohne Cookie, POST nur same-origin");
  assert.match(dk, /var POSTS = \["\/deck\/use", "\/deck\/vote", "\/deck\/me", "\/mod\/me", "\/mod\/appeal"\];/, "nur diese fuenf POSTs");
  assert.ok(!/device\(|aiDev|userAgent|deviceMemory|localStorage/.test(dk), "keine Geraete-ID im Deck-Teil");
  // kibild.js (KI-Bilder auf Wunsch): one place, POST JSON to the picture service of the API host, same-origin; what goes out
  // is the typed sentence, the use, the style and the language, or a job or picture id. Never a photo, never the device id.
  const kb = noComments(src("kibild.js"));
  assert.match(kb, /fetch\(base\(\) \+ path, \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(body \|\| \{\}\), credentials: "same-origin", referrerPolicy: "no-referrer"/, "Bilddienst nur per POST, same-origin");
  assert.match(kb, /call\("", \{ use: use, text: text, style: style0, lang: Kit\.lang \}\)/, "nur Satz, Zweck, Stil, Sprache");
  assert.ok(!/device\(|aiDev|userAgent|deviceMemory|toDataURL|toBlob|FileReader|getUserMedia/.test(kb), "kein Foto, keine Geraete-ID im Bild-Teil");
  const ph = noComments(fs.readFileSync(path.join(path.dirname(dist), "protokoll.html"), "utf8"));
  assert.equal((ph.match(/\bfetch\(/g) || []).length, 2, "Protokoll-Seite: Modell + KI-Text");
  assert.ok(!/XMLHttpRequest|sendBeacon|EventSource|WebSocket|RTCPeerConnection|analytics|serviceWorker/.test(ph), "Protokoll-Seite: kein weiterer Ausgang");
  assert.match(ph, /connect-src 'self' blob:;/, "Protokoll-Seite spricht nur mit der eigenen Domain");
  assert.equal((html.match(short) || []).length, 1, "eine Stelle fuer Kurzlinks im Build");
  for (const call of src("ai.js").match(/await fetch\([^\n]*/g)) assert.match(call, /body: text/, "nur der gepruefte Text");   // eine Stelle fuer KI-Aufruf, Warteschlange, Abrechnung und Meldung (nach Ja)
  assert.match(src("ai.js"), /fetch\(endpoint\(api0\(\), path\)[^\n]*credentials: path === "\/report" \? "omit" : "same-origin"/, "Meldung ohne Cookie, ueber dieselbe eine Stelle");
  assert.ok(!/toDataURL|toBlob|drawImage|getImageData/.test(src("ai.js")), "KI fasst kein Bild an");
  // Profile: only the opt-in sync of the profile; it never draws or reads a picture and leaves photo works out.
  assert.ok(!/toDataURL|toBlob|drawImage|getImageData|\.photo\b|ownPhoto/.test(noComments(src("profile.js"))), "Profil fasst kein Foto an");
  assert.match(src("profile.js"), /e\.k !== "photo"/, "Fotowerke bleiben auf dem Geraet");
  assert.match(src("profile.js"), /fetch\(base\(\) \+ "\/" \+ op/, "Profil spricht nur mit /api/duell/profile");
  assert.ok(src("game.js").includes("await fetch("), "fetch gehoert ins Spiel");
  const body = src("game.js").match(/fetch\([^\n]*/)[0];
  assert.match(body, /JSON\.stringify\(\{ prompt: prompt, lang: lang \}\)/, "nur Satz + Sprache");
  assert.ok(!/XMLHttpRequest|sendBeacon|EventSource|importScripts|new Worker/.test(html), "weiterer Ausgang");
  // Card numbers (stat.js): one fetch to /api/duell/stat, without referrer, without cookies; only the vote carries the login
  // cookie of this origin (only signed-in votes count). Only id, event, areas and vote go out; Business sends nothing.
  const stat = noComments(src("stat.js"));
  assert.match(stat, /"\/api\/duell\/stat"/);
  assert.match(stat, /go\(URL_, \{ method: "POST", keepalive: true, credentials: cred \|\| "omit", referrerPolicy: "no-referrer", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(p\) \}\)/);
  assert.equal((stat.match(/post\(p, o\)/g) || []).length, 2, "share und open ohne Cookie");
  assert.match(stat, /post\(\{ i: k, e: "vote", v: v \}, o, "same-origin"\)/, "nur die Stimme mit dem Login dieser Seite");
  assert.deepEqual(stat.match(/\{ i: [^}]*\}/g), ['{ i: doc && doc.ki && doc.ki.k === "karte" ? "own" : id(doc), e: "share" }', '{ i: id(doc), e: "open" }', '{ i: k, e: "vote", v: v }'], "nur Karte, Ereignis, Stimme");
  assert.equal(require("../src/flavors/business/flavor.json").stat, false, "Daily Business kommt ohne Server aus (ADR 0005)");
  // Live games: one WebSocket to the edge and one peer connection, both only in live.js, and its one fetch goes to the play API.
  for (const f of fs.readdirSync(path.join(__dirname, "../src")).filter((n) => n.endsWith(".js") && n !== "live.js")) assert.ok(!/WebSocket|RTCPeerConnection/.test(noComments(src(f))), "Live-Ausgang in " + f);
  assert.equal((html.match(/new WebSocket\(/g) || []).length, 1, "ein WebSocket"); assert.equal((html.match(/new RTCPeerConnection\(/g) || []).length, 1, "eine Peer-Verbindung");
  assert.match(src("live.js"), /API = WC \+ "\/api\/play"/, "Live spricht nur mit /api/play"); assert.ok(!/"turns?:|stun:|iceTransportPolicy: "relay"/.test(src("live.js")), "ICE-Server kommen nur vom Server, kein erzwungenes Relay"); assert.match(src("texts.json"), /IP-Adresse des anderen/, "Hinweis auf die sichtbare IP");
  assert.ok(!/analytics|\bgtag\b|tracker/i.test(html), "Tracker");
  // Push only in the part "push" ("Bescheid geben", product owner's order of 10 Nov 2026): our own question first, only the kind
  // of event, nothing in the core and no other part asks for notifications or registers a service worker (test/push.test.js).
  for (const f of [dist].concat(partFiles().filter((x) => !/\/push\.[0-9a-f]{12}\.js$/.test(x)))) assert.ok(!/Notification\.|serviceWorker|PushManager/.test(noComments(fs.readFileSync(f, "utf8"))), "Push ausserhalb des Teils push: " + path.basename(f));
  const pushPart = partFiles().find((x) => /\/push\.[0-9a-f]{12}\.js$/.test(x));
  assert.ok(pushPart && /requestPermission/.test(fs.readFileSync(pushPart, "utf8")), "der Teil push fragt das System");
  assert.ok(/async function enable\(\) \{[\s\S]*?requestPermission\(\)/.test(src("push.js")) && (src("push.js").match(/requestPermission\(/g) || []).length === 1, "nur enable() fragt, und enable() ruft nur der Ja-Knopf");
  assert.equal((noComments(src("push.js")).match(/P\.enable\(\)/g) || []).length, 1, "ein Aufrufer von enable(): der Ja-Knopf im eigenen Dialog");
});
test("XSS: kein HTML-Sink im Seitencode (Kern + Teile)", () => {
  const html = noComments(bundle());
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(html), "HTML-Sink");
});
test("Schrift: Anton als data:-URL eingebettet, Lizenzhinweis im Build, Volltext im Repo, deutsche Glyphen im Subset", () => {
  const html = fs.readFileSync(dist, "utf8");
  assert.match(html, /@font-face\{font-family:"Anton"[^}]*src:url\(data:font\/woff2;base64,/);
  assert.match(html, /font-src data:;/);
  assert.match(html, /Anton Project Authors[^*]*SIL Open Font License 1\.1/);
  assert.match(fs.readFileSync(path.join(__dirname, "../licenses/Anton-OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE Version 1\.1/);
  // latin subset: its unicode-range (checked once against the font's cmap with fontTools) must contain U+00C4 U+00D6 U+00DC U+00DF U+00E4 U+00F6 U+00FC and U+201E U+201C
  const css = fs.readFileSync(path.join(__dirname, "../node_modules/@fontsource/anton/index.css"), "utf8");
  const range = css.match(/anton-latin-400-normal \*\/[^}]*unicode-range:([^;]+);/)[1];
  const has = (cp) => range.split(",").some((r) => { const [a, b] = r.trim().replace("U+", "").split("-").map((x) => parseInt(x, 16)); return cp >= a && cp <= (b || a); });
  for (const cp of [0xc4, 0xd6, 0xdc, 0xdf, 0xe4, 0xf6, 0xfc, 0x201e, 0x201c, 0x2013]) assert.ok(has(cp), "Glyph U+" + cp.toString(16));
});
test("Lizenzen: Volltexte von Anton und qrcode-generator stecken im Bundle (Teil licenses)", () => {
  const html = bundle();
  assert.match(html, /SIL OPEN FONT LICENSE Version 1\.1/); assert.match(html, /Permission is hereby granted, free of charge/);
});

// node --test runs the E2E files in parallel, and pages of one file load dist while another file may build: a reader must
// never meet a half-written page or a part the page names but which is missing (the build used to delete dist/parts first).
test("Build waehrend andere lesen: nie eine halbe Seite, nie ein fehlender Teil; ensureBuilt baut nur nach einer Aenderung", async () => {
  const { spawn } = require("node:child_process"), E = require("../scripts/ensure-build.js");
  const dir = path.dirname(dist), bad = [];
  let reads = 0;
  for (let round = 0; round < 3; round++) {
    const b = spawn(process.execPath, [path.join(__dirname, "../scripts/build.js")], { stdio: "ignore" });
    let done = false; const exit = new Promise((ok) => b.on("exit", (c) => { done = true; ok(c); }));
    while (!done) {
      let html = "";
      try { html = fs.readFileSync(dist, "utf8"); } catch (e) { bad.push("Seite fehlt: " + e.code); }
      if (html) {
        reads++;
        if (!/<\/html>\s*$/.test(html)) bad.push("halbe Seite: " + html.length + " Zeichen");
        const m = html.match(/window\.DailyParts=(\{.*?\});window\./);
        if (m) for (const p of Object.values(JSON.parse(m[1]))) if (!fs.existsSync(path.join(dir, p.f))) bad.push("Teil fehlt: " + p.f);
      }
      await new Promise((ok) => setImmediate(ok));
    }
    assert.equal(await exit, 0);
  }
  assert.ok(reads > 3, "waehrend der Builds gelesen: " + reads);
  assert.deepEqual([...new Set(bad)], []);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith(".build-")), [], "kein Zwischenordner bleibt liegen");
  assert.equal(E.upToDate(""), true, "Stempel passt nach dem Build");
  assert.equal(E.ensureBuilt(""), false, "kein zweiter Build ohne Aenderung");
  assert.notEqual(E.stamp(""), E.stamp("business"), "jede Variante hat ihren Stempel");
});
// Under file:// Chromium now and then starts a reloaded page with an empty storage of its own (test/e2e/lib/grund.js):
// a test that reloads a page, or loads it again after about:blank, does so over the web route. The scan reads every E2E
// file test by test; a test passes when its file loads its pages from G.webUrl (and names no file:// page), when the test
// itself asks for the web route (web: true, G.webUrl), or when a helper checks for it (ctx.web).
test("E2E: Neuladen nur ueber die Web-Route, nie auf einer file://-Seite", () => {
  const dir = path.join(__dirname, "e2e"), bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".e2e.js")).sort()) {
    const code = fs.readFileSync(path.join(dir, f), "utf8").replace(/^\s*\/\/[^\n]*$/gm, "");
    const fileWeb = /=\s*await G\.webUrl\(/.test(code) && !/"file:\/\/"/.test(code);
    for (const b of code.split(/\n(?=\s*test\()/)) {
      if (!/\.reload\(|\.goto\("about:blank"\)/.test(b)) continue;
      const name = (b.match(/test\(\s*"([^"]+)/) || [null, "(Hilfsfunktionen)"])[1];
      if (!(fileWeb || /web: true|G\.webUrl\(|ctx\.web\b/.test(b))) bad.push(f + ": " + name);
    }
  }
  assert.deepEqual(bad, []);
});
// The catalog E2E is split into files (test/e2e/cards-*.e2e.js): together they still open every card, each once.
test("E2E-Katalog: die Dateien cards-* oeffnen zusammen jede Karte genau einmal", () => {
  const { slice, FLAVORS } = require("./e2e/lib/katalog.js"), dir = path.join(__dirname, "e2e"), seen = {};
  for (const f of fs.readdirSync(dir).filter((n) => /^cards-.*\.e2e\.js$/.test(n))) {
    for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/^katalog\("(\w+)", "([\w-]+)"(?:, (\d+), (\d+))?\);$/gm)) {
      const k = m[1] + " " + m[2]; seen[k] = (seen[k] || []).concat(slice(FLAVORS[m[1]][1], +(m[3] || 1), +(m[4] || 1)));
    }
  }
  for (const name of Object.keys(FLAVORS)) for (const l of ["de-DE", "en-US"]) assert.deepEqual(seen[name + " " + l], FLAVORS[name][1], name + " " + l);
});
