"use strict";
// Wave D1 (PLAN Durchsicht §2 Nr. 4, 5, 7, 8, 11, 12, 15 and §5): the checks that need no browser. The screens themselves
// are in test/e2e/d1.e2e.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const D = require("../src/daily.js");
const Tn = require("../src/turns.js");
require("../src/office.js"); require("../src/quizspiele.js"); require("../src/feier.js");
const TEXTS = require("../src/texts.json");
const TURN = require("../src/turn.json");
const BIZ = require("../src/flavors/business/flavor.json");
const BIZT = require("../src/flavors/business/texts.json");
const src = (f) => fs.readFileSync(path.join(__dirname, "../src", f), "utf8");
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

test("Golden-Links: jede Katalogkarte (de, en) und Varianten lesen wie auf main und werden bitgleich wieder geschrieben", () => {
  const G = require("./golden-d1.json");
  assert.ok(G.links.length >= 300);
  const kinds = new Set();
  for (const [name, hash, want] of G.links) {
    const r = D.parseRoute(hash);
    const old = JSON.parse(Buffer.from(hash.slice(3), "base64url").toString("utf8")).d, to = D.MOVED[old.i], gone = D.GONE.includes(old.i);
    // shelf clean-up (2026-11): a bot card taken off (agent duel, photo meme with a bot face) says honestly that it is gone
    if (gone && ["duel", "photo"].includes(old.k)) { assert.deepEqual(r, { type: "gone", id: old.i }, name); continue; }
    assert.equal(r && r.type, "doc", name); kinds.add(r.doc.k);
    if (to || gone) {   // merged (D.MOVED) or gone: the same doc under the new card's id if of the same kind, else without an id
      const id = to && D.byId(to[0]).kind === old.k ? to[0] : undefined, want = D.sanitizeDoc(Object.assign({}, old, { i: id }));
      assert.deepEqual(r.doc, want, name + ": dasselbe Doc unter der neuen Karte oder ohne Karte");
      assert.deepEqual(D.parseRoute(D.docUrl(r.doc).replace(/^[^#]*/, "")).doc, want, name + ": wieder geteilt bleibt es gleich"); continue;
    }
    assert.equal(sha(r.doc), want, name + ": dasselbe Doc");
    const again = D.docUrl(r.doc); assert.equal(again.slice(again.indexOf("#")), hash, name + ": bitgleich wieder geteilt");
  }
  for (const k of D.KINDS.filter((k) => k !== "table" && k !== "arcade")) assert.ok(kinds.has(k), "Art " + k);
});

test("Nr. 4: kein {x}-Platzhalter in Titel, Hinweis oder Vorlese-Name eines Schritts (alle Spiele, de und en)", () => {
  // turn-ui.js ask(): the step's own title, else its top line, else its plain text. A text with a gap needs one of the first two.
  const ask = fs.readFileSync(path.join(__dirname, "../src/turn-ui.js"), "utf8");
  assert.match(ask, /function ask\(p, doc, m\) \{ return p\.title \? p\.title\(doc, Kit\.lang\) : p\.top \? p\.top\(doc, m, Kit\.lang\) :/);
  assert.match(ask, /why: t\("whyOpen", \{ s: ask\(p, ed\.doc, st\.moves\) \}\)/, "der Sperrhinweis nimmt ask()");
  assert.match(ask, /aria-label", ask\(p, ctx\.doc, ctx\.m\) \+ " " \+ \(i \+ 1\)\)/, "die Felder einer Liste heissen nach ask()");
  let n = 0;
  for (const lang of ["de", "en"]) {
    const X = Tn.T(lang);
    for (const g of Object.keys(Tn.GAMES)) (Tn.GAMES[g].turns || []).forEach((turn, ti) => (Array.isArray(turn) ? turn : []).forEach((p) => {
      if (!p || !p.l) return; n++;
      const plain = String(X[p.l]).replace(": {q}", "");
      if (/\{\w+\}/.test(plain)) assert.ok(p.title || p.top, lang + " " + g + "#" + ti + " " + p.l + ": Text mit Luecke ohne title/top: " + plain);
    }));
    // the two cards from the review, filled in
    const doc = { seed: 7, g: "bluff" }, bl = Tn.GAMES.bluff.turns[0][0].top(doc, [], lang), bz = Tn.GAMES.blitz.turns[0][0].title({ seed: 7, g: "blitz" }, lang);
    assert.doesNotMatch(bl + " " + bz, /\{\w+\}/, lang);
  }
  assert.ok(n > 300);
});

test("Nr. 4: Formen als Symbole mit Namen, das Feld der Dinge nur beim Deal, im Business keins von beiden", () => {
  const ui = src("turn-ui.js");
  for (const l of ["de", "en"]) { const N = TURN.text[l].shp.split("|"); assert.equal(N.length, Tn.SHAPES.length, l); assert.ok(TURN.text[l].fly, l); for (const x of N) assert.doesNotMatch(x, /^(cookie|star|heart|bolt|ring|drop|coin)$/, l); }
  assert.match(ui, /b\.setAttribute\("aria-label", N\[i\]\)/); assert.doesNotMatch(ui, /el\("button", "chip" \+ \(d\.f === f/, "keine Roh-ID als Knopftext");
  assert.match(ui, /if \(d\.g === "deal"\) A\.field\(p, L\(\)\.things/);
  assert.match(ui, /if \(!A\.allow\("tools", "shapes"\)\) return;/); assert.deepEqual(BIZ.tools, []);
});

test("Nr. 5: eine gesperrte Eingabe bleibt nicht im Feld: field() setzt zurueck, safe() meldet die Sperre", () => {
  const app = src("app.js"), modes = src("modes.js");
  assert.match(app, /f\.addEventListener\("change", function \(\) \{ if \(why\) \{ f\.value = last; Kit\.toast\(why\);/);
  assert.match(app, /if \(e\.isComposing\) return;/, "kein Urteil mitten im Zusammensetzen (IME)");
  assert.match(app, /f\.addEventListener\("compositionend", check\)/, "das fertige Wort wird geprueft und gespeichert");
  assert.match(app, /querySelector\('\[aria-invalid="true"\]'\);[^\n]*\n\s*if \(bad && !b\.hidden\) \{ b\.classList\.add\("wait"\)/, "Hauptknopf gesperrt, solange ein Feld markiert ist");
  const sh = fs.readFileSync(path.join(__dirname, "../../android/emulator-smoke.sh"), "utf8");
  assert.doesNotMatch(sh, /tap_node '\(Jetzt teilen\|Share now\)'/, "Android-Smoke tippt nicht auf den Hinweis");
  assert.doesNotMatch(sh, /wait_web '\(Jetzt teilen\|Share now\)'/, "ein Tipp teilt (Redesign W1): kein Warten auf einen zweiten Schritt");
  assert.equal((sh.match(/tap_node '[^']*\(Share\|Teilen\)/g) || []).length, 1, "genau ein Tipp auf Teilen bis zum Teilen-Menue");
  assert.match(sh, /tap_node '\^\\s\*\(Share\|Teilen\)\\s\*\$'/);
  // the selector against what the emulator listed in CI (find_node: text + " " + description, re.I): the button, not the toast
  const sel = new RegExp(sh.match(/tap_node '(\^\\s\*\(Share\|Teilen\)\\s\*\$)'/)[1], "i");
  assert.ok(sel.test("SHARE ") && sel.test("Teilen ") && !sel.test("Share now ") && !sel.test("Jetzt teilen "));
  assert.match(modes, /if \(v && !c\) return t\("questBlocked"\);/);
  // the words that are blocked are blocked for the receiver too: what the field keeps is what opens the lock
  const Q = require("../src/quest.js");
  assert.equal(Q.clean("Am Bahnhof", Q.MAX_A), ""); assert.equal(Q.clean("Am Bahnho", Q.MAX_A), "Am Bahnho");
});

test("Nr. 7: Auswahl mit aria-pressed und Haken, Socken-Zellen mit Reihe und Spalte, Arbeitsanweisung als h3 in 1 rem, #tools in rem", () => {
  const ui = src("turn-ui.js"), app = src("app.js"), css = src("style.css"), biz = src("flavors/business/style.css");
  assert.match(ui, /function press\(b, on\) \{ b\.classList\.toggle\("on", on\); b\.setAttribute\("aria-pressed", String\(on\)\); \}/);
  assert.match(ui, /function cell\(c, i\) \{ c\.setAttribute\("aria-label", say\("cell", \{ r: "ABCDE"/);
  assert.match(app, /b\.setAttribute\("aria-pressed", String\(it\.v === cur\)\)/, "chips() in app.js");
  assert.match(ui, /el\("h3", "lbl"/);
  assert.match(css, /\.lbl\{display:block;font-size:1rem;font-weight:800/);
  assert.match(css, /\.chip\[aria-pressed=true\]::before,\.bcell\[aria-pressed=true\]::before\{content:"✓"\/"";position:absolute/, "Haken ohne Breite, nicht im Namen");
  assert.match(css, /#tools button\{[^}]*font:800 \.85rem/); assert.match(biz, /#tools button\{[^}]*font:600 \.85rem/);
  // 0.85rem at "Sehr gross" (1.5) is 20.4 px
  assert.ok(0.85 * 16 * 1.5 >= 20);
  for (const l of ["de", "en"]) assert.match(TURN.text[l].cell, /\{r\}.*\{c\}/);
});

test("Nr. 8: die Zeitspiele liegen im Teil turnzwei hinter dem Start-Tipp, die Uhr der Bot-Partie bleibt aus", () => {
  const two = src("turn2.js"), ui = src("turn-ui.js"), table = src("table.js"), tui = src("table-ui.js");
  for (const w of ["explain", "clock", "inner", "blind", "react", "door"]) assert.doesNotMatch(ui, new RegExp("\\n  " + w + ": "), w + " nicht mehr im Kern");
  for (const w of ["explain", "react", "door"]) assert.match(two, new RegExp("\\n    " + w + ": gate\\(function"), w);
  assert.match(two, /clock: function \(box, p, set, ctx\) \{\n\s+box\.appendChild\(el\("p", "qtext", p\.text/); assert.match(two, /\}\)\(box, p, set, ctx\);/);
  assert.match(two, /if \(!t0\) \{ go\(\); return; \}/, "innere Uhr: jede Runde auf Tipp");
  assert.match(two, /if \(!t0\) \{ t0 = performance\.now\(\); b\.textContent = L\(\)\.pok_stop; return; \}/, "Pokal: jeder Versuch auf Tipp");
  assert.doesNotMatch(two, /setTimeout\(function \(\) \{\s*if \(!box\.isConnected\) return; t0 = performance\.now\(\)/, "nichts startet von selbst");
  assert.match(table, /var ms = me\.auto \? autoFast : autoMs; if \(ms < 0\) return;/); assert.match(tui, /rules: saved\(\), autoMs: -1 \}/);
  for (const l of ["de", "en"]) { assert.ok(TURN.text[l].rdy && TURN.text[l].rdy_go, l); }
});

test("Nr. 8: eine Bot-Partie Bauernskat hat keine Uhr fuer den Menschen (table.js, autoMs -1)", async () => {
  const Table = require("../src/table.js");
  const open = new Map(); let n = 0;
  const pipe = () => { const ch = (++n).toString(16).padStart(64, "b"), a = { h: null, cl: [], dead: false }, b = { h: null, cl: [], dead: false };
    const c = (me, o) => ({ channel: ch, send: (m) => { const s = JSON.stringify(m); setImmediate(() => { if (!o.dead && o.h) o.h(JSON.parse(s)); }); }, on: (h) => { me.h = h; }, onClose: (h) => { me.cl.push(h); }, close: () => { me.dead = o.dead = true; } });
    return [c(a, b), c(b, a)]; };
  const live = { invite: async () => { const token = String(++n).padStart(22, "T"); let ok; const ready = new Promise((r) => { ok = r; }); open.set(token, ok); return { token, expires: Date.now() + 9e5, ready }; },
    accept: async (token) => { const ok = open.get(token); open.delete(token); const [x, y] = pipe(); ok(x); return y; } };
  const me = Table.create({ game: "bauernskat", live, name: "Ada", emoji: "🦊", autoMs: -1 });
  const inv = await me.invite(); const bot = await Table.join(inv.token, { game: "bauernskat", live, name: "Bot", emoji: "🧑‍🌾", autoFast: 5 }); bot.auto(true);
  const t0 = Date.now(); let mine = null;
  while (Date.now() - t0 < 15000) {
    const v = me.view(); if (v.hand && v.hand.turn === v.mySeat && v.hand.actions.length) { mine = v; break; }
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(mine, "der Mensch ist dran");
  assert.equal(mine.deadline, 0, "keine Frist");
  const was = JSON.stringify(mine.hand.state);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(JSON.stringify(me.view().hand.state), was, "niemand spielt fuer den Menschen");
  assert.equal(me.view().deadline, 0);
  me._crash(); bot._crash();
});

test("Nr. 11: Business-Whitelist (Reiter, Werkzeuge, Fertig) und ehrlicher Fertig-Text je Art", () => {
  const app = src("app.js"), tpl = src("index.template.html");
  assert.deepEqual(BIZ.tabs, ["Idea", "Move", "Text"]); assert.deepEqual(BIZ.done, []); assert.ok(BIZ.bg);
  assert.equal(BIZT.de.sh_note, ""); assert.equal(BIZT.en.sh_note, "");
  assert.match(app, /\.filter\(function \(k\) \{ return allow\("tabs", k\); \}\)/);
  assert.match(app, /\$\("dmore"\)\.parentNode\.hidden = !allow\("done", "status"\)/);
  assert.match(tpl, /<details class="more"><summary id="dmore"><\/summary><div class="row"><button id="tostatus"/);
  assert.doesNotMatch(app, /b\.textContent = t\("sh_making"\)|b\.textContent = t\("sh_ready"\)/, "der Teilen-Knopf behaelt seinen Namen");
  for (const l of ["de", "en"]) for (const k of ["sh_photo", "sh_voice", "mehr"]) assert.ok(TEXTS[l][k], l + " " + k);
  assert.match(TEXTS.de.sh_photo, /Foto bleibt hier/); assert.match(TEXTS.de.sh_voice, /Stimme bleibt hier/);
});

test("Nr. 12: kein Math.random in warm.js (Antwortkarte, wie in #164) und in den Mitmach-Widgets (turn-ui.js, turn2.js)", () => {
  for (const f of ["warm.js", "turn-ui.js", "turn2.js"]) assert.doesNotMatch(src(f).replace(/\/\/.*$/gm, ""), /Math\.random/, f);
  // the feel-good cards left the catalog with the shelf clean-up (2026-11), so the reply check by card went with them
});

test("Nr. 15: Abzeichen aus der Spielart, Einladung mit Spitzname oder neutral", () => {
  const ideas = D.IDEAS.filter((i) => i.kind === "turn"), mk = (id) => Tn.who(ideas.find((i) => i.id === id).turn.g);
  for (const i of ideas) {
    const g = Tn.GAMES[i.turn.g] || {}, w = Tn.who(i.turn.g);
    assert.ok(["solo", "bot", "room", "link"].includes(w), i.id);
    if (w === "link") assert.ok(!g.local, i.id + ": Per Link nur ohne local");
    if (w === "room" || w === "solo") assert.ok(g.local, i.id);
    if (w === "bot") assert.ok(g.bot, i.id);
  }
  const WANT = { "raum-pommes": "bot", "raum-uhr": "solo", "raum-tuer": "solo", "raum-unlesbar": "solo", "raum-schaetzen": "solo",
    "beat-disco": "room", "mut-tierstory": "room", "mut-werbung": "room", "raum-streichen": "room", "raum-finger": "room", "raum-erklaeren": "room", "raum-sorry": "room",
    "karte-urkunde": "room", "raum-damals": "room", "raum-maschine": "room", "raum-suche": "room", "raum-tunnel": "room", "raum-maus": "room", "raum-papagei": "room" };
  for (const i of ideas) assert.equal(mk(i.id), WANT[i.id] || "link", i.id);
  for (const l of ["de", "en"]) for (const k of ["bdg_solo", "bdg_bot", "bdg_room", "bdg_link", "friend"]) assert.ok(TEXTS[l][k], l + " " + k);
  const modes = src("modes.js"), DD = require("../src/duel.json");
  assert.match(modes, /function sender\(doc\) \{ var b = doc\.by \|\| \[\], n = b\.length && b\[b\.length - 1\]\.n; return n \|\| t\("friend"\); \}/);
  assert.match(DD.texts.de.questInvite, /^\{n\} /); assert.match(DD.texts.en.questInvite, /^\{n\} /);
  // durations that can be kept
  const by = (id) => D.IDEAS.find((i) => i.id === id);
  // zug-advent and tisch-doko went into advent-tuer and tisch-skat with the shelf clean-up (2026-11)
  assert.ok(by("tisch-skat").min >= 300); assert.ok(by("tisch-bauernskat").min >= 300);
});

test("Zusaetze D1: Untertitel ohne Zeitdruck, quiz-* ohne „Nimm den Treffer“, plan-24 ehrlich, „Titel auf der Karte“, Live-Text ohne JETZT", () => {
  const cat = require("../src/ideas.json").ideas;
  for (const i of cat) for (const l of ["de", "en"]) {
    const s = (i[l] && i[l].s) || "";
    assert.doesNotMatch(s, /Heute Nacht zählt|Tonight counts|Sofort\.|\bNow\.$|Nimm den Treffer|Take the hit/, i.id + " " + l);
  }
  assert.equal(cat.find((i) => i.id === "plan-24"), undefined, "plan-24 ist in „Kennst du mich wirklich?“ aufgegangen (2026-11)");
  assert.equal(TEXTS.de.titleL, "Titel auf der Karte"); assert.equal(TEXTS.en.titleL, "Title on the card");
  const A = require("../src/arcade.json"), DD = require("../src/duel.json");
  for (const s of [TEXTS.de.live_shareText, TEXTS.en.live_shareText, A.de.arc_share, A.en.arc_share, DD.texts.de.live_rpsShareText, DD.texts.en.live_rpsShareText]) {
    assert.doesNotMatch(s, /JETZT|NOW|nur 15|only\)/, s); assert.match(s, /15/);
  }
  assert.match(src("app.js"), /set = set\.concat\(set\.indexOf\(me\.emoji\) < 0 \? \[me\.emoji\] : \[\]\)/, "das eigene Emoji nur, wenn das Set es nicht hat");
});
