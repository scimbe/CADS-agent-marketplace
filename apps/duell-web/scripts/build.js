"use strict";
// Inlines data, styles and code into the template -> dist/index.html (the core, no external requests), plus the rarely used
// parts as files of their own in dist/parts/ that the core loads on first use (src/parts.js).
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const safe = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const json = (p) => JSON.parse(read(p));
// A flavor (`--flavor business`) is the same app with its own catalog, words and look: src/flavors/<name>/ replaces
// ideas.json, lays texts.json and turn.json over the shared ones key by key, adds its CSS and script last.
const arg = process.argv.slice(2).join("=").match(/--flavor=([a-z]+)/), flavor = arg ? arg[1] : "";
const fl = (f) => "src/flavors/" + flavor + "/" + f, has = (f) => flavor && fs.existsSync(path.join(root, fl(f)));
if (flavor && !has("flavor.json")) throw new Error("Unbekannter Flavor: " + flavor);
const over = (base, f) => { if (has(f)) { const o = json(fl(f)); for (const l of Object.keys(o)) Object.assign(base[l], o[l]); } return base; };
const conf = flavor ? json(fl("flavor.json")) : null, texts = over(json("src/texts.json"), "texts.json"), turnData = json("src/turn.json");
over(turnData.text, "turn.json");
// A flavor may list cards whose game another branch still brings (termin, sammeln): until it is there, they stay out.
require("../src/office.js");
const games = require("../src/turns.js").GAMES, catalog = json(has("ideas.json") ? fl("ideas.json") : "src/ideas.json");
if (flavor) catalog.ideas = catalog.ideas.filter((i) => !i.turn || games[i.turn.g]);
// Pictures of the day's cards (AI-made, see src/thumbs.json): only the ids go in, the images stay on the gallery server.
const thumbs = Object.keys(json(has("thumbs.json") ? fl("thumbs.json") : "src/thumbs.json").items);
const data = "window.DailyThumbs=" + JSON.stringify(thumbs) + ";" + (conf ? "window.DailyFlavor=" + JSON.stringify(conf) + ";" : "") + "window.DuellIdeas=" + JSON.stringify(catalog) + ";window.DailyTexts=" + JSON.stringify(texts) + ";window.OfficeData=" + JSON.stringify(json("src/office.json")) + ";";
const duelData = JSON.parse(read("src/duel.json"));
const licenses = ["Anton-OFL.txt", "qrcode-generator-MIT.txt", "Kartendeck-CC0.txt"].map((f) => read("licenses/" + f)).join("\n\n");
const dataAll = data + "window.TurnData=" + JSON.stringify(turnData) + ";window.DuelData=" + JSON.stringify(duelData) + ";Object.assign(window.DailyTexts.de,window.DuelData.texts.de);Object.assign(window.DailyTexts.en,window.DuelData.texts.en);" +
  "window.ArcadeTexts=" + JSON.stringify(JSON.parse(read("src/arcade.json"))) + ";Object.assign(window.DailyTexts.de,window.ArcadeTexts.de);Object.assign(window.DailyTexts.en,window.ArcadeTexts.en);";
const parts = { DATA: dataAll, DUEL: read("src/duel.js"), QUEST: read("src/quest.js"), MODES: read("src/modes.js"), DOOR: read("src/door.js"), TURNS: read("src/turns.js"), OFFICE: read("src/office.js"), FLAVOR: has("flavor.js") ? read(fl("flavor.js")) : "", WARM: read("src/warm.js"), TURNUI: read("src/turn-ui.js"), PARTS: read("src/parts.js"), ARCADE: read("src/arcade.js"), ARCADE2: read("src/arcade2.js"), ARCADEUI: read("src/arcade-ui.js"), MPOKER: read("src/mpoker.js"), DOKO: read("src/doko.js"), SKAT: read("src/skat.js"), TABLE: read("src/table.js"), TABLEUI: read("src/table-ui.js"), RPSLIVE: read("src/rpslive.js"), BALLDUELL: read("src/ballduell.js"), LIVE: read("src/live.js"), LIVEUI: read("src/live-ui.js"), QRCODE: read("node_modules/qrcode-generator/qrcode.js"), SHORT: read("src/shortlink.js"), OWN: read("src/own.js"), STATUSCARD: read("src/statuscard.js"), CORE: read("src/core.js"), ENGINE: read("src/engine.js"), DAILY: read("src/daily.js"), STUDIO: read("src/studio.js"), KIT: read("src/kit.js"), COLLAB: read("src/collab.js"), COLLABUI: read("src/collab-ui.js"), CALLCARD: read("src/callcard.js"), CALLCARDUI: read("src/callcard-ui.js"), STICKERS: read("src/stickers.js"), AI: read("src/ai.js"), WISH: read("src/wish.js"), WELTUI: read("src/welt-ui.js"), RENDER: read("src/render.js"), PLAYABLE: read("src/playable.js"), GAME: read("src/game.js"), APP: read("src/app.js") };
// Parts: past 1 MB the page is split instead of growing. The core (home, calendar sheet, editor, sharing) stays inline in
// index.html; what only some people open lands in parts/<name>.<hash>.js next to it and is loaded on first use. The apps
// ship the folder in their bundle (Android assets, iOS bundle), the web gets it from /duell/parts/. `d`: parts it needs first.
// New, rarely used code goes into a part here (or a new one), not into the core: test/build.test.js holds the budgets.
const PARTS = {
  play: { d: [], src: ["BALLDUELL", "RPSLIVE", "LIVE", "LIVEUI", "ARCADE", "ARCADE2", "ARCADEUI"] },   // live and arcade duels
  table: { d: ["play"], src: ["MPOKER", "DOKO", "SKAT", "TABLE", "TABLEUI"] },                        // Doppelkopf and Skat live (over live.js)
  qr: { d: [], src: ["QRCODE", "STATUSCARD"] },                                                        // status picture and invite code with a QR code
  licenses: { d: [], src: ["LICENSES"] },                                                              // the licence texts, shown on request
  welt: { d: [], src: ["WELTUI"] },                                                                    // the flight game's "What do you want to fly?" (AI kind welt)
  texte: { d: [], src: ["TEXTEDATA", "TEXTE"] },                                                       // Worte finden, card text, song (texte.js + ready-made texts)
};
parts.LICENSES = "window.DailyLicenses=" + JSON.stringify(licenses) + ";";
parts.TEXTE = read("src/texte.js");
parts.TEXTEDATA = "window.TexteData=" + JSON.stringify(json("src/texte.json")) + ";";
// QR code for invites: qrcode-generator (MIT, Kazuhiko Arase), licenses/qrcode-generator-MIT.txt.
// Display font: Anton (SIL OFL 1.1), latin subset (covers ä ö ü ß and German quotes) from @fontsource, embedded as data: URL.
const fontFile = path.join(root, "node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2");
if (!fs.existsSync(fontFile)) throw new Error("Schrift fehlt: im Ordner apps/duell-web zuerst `npm ci` ausfuehren");
const fontCss = "/* Anton, Copyright 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont.git), SIL Open Font License 1.1 (licenses/Anton-OFL.txt) */\n" +
  '@font-face{font-family:"Anton";font-style:normal;font-weight:400 900;font-display:block;src:url(data:font/woff2;base64,' + fs.readFileSync(fontFile).toString("base64") + ") format(\"woff2\")}\n";
let html = read("src/index.template.html").replace("/*@CSS@*/", () => fontCss + read("src/style.css") + (has("style.css") ? "\n" + read(fl("style.css")) : ""));
if (conf) html = html.replace(/<title>[^<]*<\/title>/, () => "<title>" + conf.title + "</title>").replace(/(name="theme-color" content=")[^"]*/, (m, a) => a + conf.theme);
// Our own sources lose their comment-only lines in the page (about 55 KB); third-party code (QR code) and the data stay as they are.
const KEEP = new Set(["DATA", "QRCODE", "LICENSES", "TEXTEDATA"]);
const lean = (s) => s.split("\n").filter((l) => !/^\s*\/\/(?![#@])/.test(l)).join("\n");
const code = (k) => safe(KEEP.has(k) ? parts[k] : lean(parts[k]));
const out = flavor ? "dist/" + flavor + "/index.html" : "dist/index.html", outDir = path.join(root, path.dirname(out));
// Each part: its sources one after the other, each closed with ";" like the separate <script> blocks they were. The name
// carries the content hash (a new build never meets an old cached file); the manifest carries the SRI hash.
fs.rmSync(path.join(outDir, "parts"), { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "parts"), { recursive: true });
const manifest = {};
let partBytes = 0;
for (const name of Object.keys(PARTS)) {
  const body = PARTS[name].src.map((k) => { const c = code(k); delete parts[k]; return c; }).join("\n;\n") + "\n";
  const file = "parts/" + name + "." + crypto.createHash("sha256").update(body).digest("hex").slice(0, 12) + ".js";
  fs.writeFileSync(path.join(outDir, file), body);
  manifest[name] = { f: file, h: "sha384-" + crypto.createHash("sha384").update(body).digest("base64"), d: PARTS[name].d };
  partBytes += Buffer.byteLength(body);
  console.log(path.dirname(out) + "/" + file, Buffer.byteLength(body), "bytes");
}
parts.DATA = "window.DailyParts=" + JSON.stringify(manifest) + ";" + parts.DATA;
for (const k of Object.keys(parts)) html = html.replace("/*@" + k + "@*/", () => code(k));
fs.writeFileSync(path.join(root, out), html);
console.log(out, Buffer.byteLength(html), "bytes (core); parts", partBytes, "bytes; together", Buffer.byteLength(html) + partBytes);

// Fast Easy Protokoll: its own page, because whisper.cpp needs a cross-origin isolated page and connect-src 'self' (served by
// the gallery at /duell/protokoll). The worker stays a separate file: a Worker is only started from a same-origin URL.
const prot = { CSS: read("src/protokoll.css"), DATA: "window.ProtokollTexts=" + JSON.stringify(JSON.parse(read("src/protokoll.json"))) + ";", PROTOKOLL: read("src/protokoll.js"), PAGE: read("src/protokoll-page.js") };
let ph = read("src/protokoll.template.html");
for (const k of Object.keys(prot)) ph = ph.replace("/*@" + k + "@*/", () => (k === "CSS" ? prot[k] : safe(prot[k])));
fs.writeFileSync(path.join(root, path.dirname(out), "protokoll.html"), ph);
fs.copyFileSync(path.join(root, "src/protokoll-worker.js"), path.join(root, path.dirname(out), "protokoll-worker.js"));
console.log(path.dirname(out) + "/protokoll.html", Buffer.byteLength(ph), "bytes");
