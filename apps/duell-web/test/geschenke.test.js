"use strict";
// Katalog v2, wave V1, PR "wichteln": biz-wichtel-ideen, biz-wichteln (Daily Business), zug-wunschzettel, geschenk-finder.
// The logic without a browser: the draw, the ideas without AI, what the AI may add, what each link carries.
const test = require("node:test");
const assert = require("node:assert/strict");
const Tn = require("../src/turns.js");
const G = require("../src/geschenke.js");
const B = require("../src/flavors/business/games.js");
const D = require("../src/daily.js");
const Q = require("../src/quest.js");
const BIZ_TEXT = require("../src/flavors/business/turn.json");
// The business build lays its turn.json over the shared one (scripts/build.js); here the same, for the slip texts.
for (const l of Object.keys(BIZ_TEXT)) Object.assign(Tn.T(l), BIZ_TEXT[l]);
const start = (g, seed) => ({ g, seed, q: "", f: "star" });
const run = (g, seed, moves) => moves.reduce((d, m) => d && Tn.play(d, m, 0), start(g, seed));
const names = (n) => ["Ana", "Ben", "Cem", "Dag", "Eva", "Finn", "Gus", "Hana", "Ida", "Jo", "Kai", "Lea"].slice(0, n);
const pad = (l) => l.concat(Array(12 - l.length).fill(""));

test("Wichteln: die Ziehung aus dem Seed ist ein Kreis, niemand zieht sich selbst (3 bis 12 Personen, 3000 Seeds)", () => {
  for (let n = 3; n <= 12; n++) for (let seed = 0; seed < 3000; seed += 7) {
    const to = B.circle(seed, n);
    assert.equal(new Set(to).size, n, "jede Person wird genau einmal gezogen");
    to.forEach((x, i) => assert.notEqual(x, i, "n=" + n + " seed=" + seed));
    let at = 0, steps = 0; do { at = to[at]; steps++; } while (at !== 0 && steps <= n);
    assert.equal(steps, n, "ein Kreis durch alle");
  }
  assert.deepEqual(B.circle(42, 5), B.circle(42, 5), "derselbe Link, dieselbe Ziehung auf jedem Handy");
  const seen = new Set(); for (let s = 0; s < 50; s++) seen.add(B.circle(s, 5).join()); assert.ok(seen.size > 10, "der Seed entscheidet, nicht die Reihenfolge");
});

test("Büro-Wichteln über echte Links: Selbsteintrag mit Geräteschlüssel, versiegelte Zettel, nur das eigene Gerät öffnet, der Link nennt keine Paare", async () => {
  const S = require("../src/siegel.js");
  const day = 20805;   // Fr 18.12.2026
  const viaLink = (d) => D.parseRoute("#" + D.docUrl(Object.assign({ k: "turn", col: ["#111111", "#eeeeee"], by: [] }, d)).split("#")[1]).doc;
  const setup = viaLink(run("bwichteln", 777, [[[2], [0], day]]));
  assert.equal(Tn.state(setup).turn, 1);
  const dev = []; for (const n of names(5)) dev.push(Object.assign({ n }, await S.keys()));
  assert.ok(dev.every((x) => /^[A-Za-z0-9_-]{87}$/.test(x.p)), "öffentlicher Schlüssel P-256, roh, base64url");
  // sign-ups: each newer list replaces the older one (snap from turn 1), the setup stays
  let d = setup;
  for (let i = 1; i <= 5; i++) { d = viaLink(Tn.play(d, [dev.slice(0, i).map((x) => [x.n, x.p])], 0)); assert.ok(d, "Eintrag " + i); assert.equal(Tn.moves(d).length, 2); }
  assert.deepEqual(Tn.moves(d)[0], [[2], [0], day]);
  assert.match(Tn.face(d, "de").join(" "), /5 machen mit/);
  // the draw: from a secret, sealed to each key; the link gets [ephemeral key, five boxes of the same length]
  const info = "bwichtel:" + d.seed, pubs = dev.map((x) => x.p);
  const sealed = await S.draw(pubs, info, B.circle), drawn = viaLink(Tn.play(d, [[names(5), sealed[0], sealed[1]]], 0));
  assert.ok(drawn); const m = Tn.moves(drawn); assert.equal(m.length, 2, "die Ziehung ersetzt die Anmeldungen, die Schlüssel fallen weg");
  const st = Tn.state(drawn), p = st.prompts[0];
  assert.equal(p.end(drawn, m), true, "danach nur noch Zettel öffnen, nichts mehr schicken");
  assert.equal(p.end(d, Tn.moves(d)), false); assert.equal(p.title(drawn, "de"), "Eigenen Namen antippen"); assert.equal(p.title(d, "de"), "Selbst eintragen");
  const [nm, eph, boxes] = m[1][0];
  assert.deepEqual(nm, names(5)); assert.ok(boxes.every((x) => /^[A-Za-z0-9_-]{12}$/.test(x)), "alle Zettel gleich lang, die Länge verrät keinen Namen");
  const raw = JSON.stringify(Tn.unseal(drawn.q, drawn.seed));
  for (const n of names(5)) assert.equal(raw.split(n).length - 1, 1, n + " steht genau einmal im Link (in der Namensliste), nie neben einem Zettel");
  for (const x of dev) assert.ok(!raw.includes(x.p), "keine Schlüssel mehr im Ziehungslink");
  assert.ok(D.docUrl(Object.assign({ k: "turn", col: ["#111111", "#eeeeee"], by: [] }, drawn)).split("#c=")[1].length <= 1200);
  const to = [];
  for (let i = 0; i < 5; i++) {
    to[i] = await S.open(dev[i].k, eph, boxes[i], info + ":" + i, dev[i].p);
    const lines = B.slip(drawn, m, to[i], "de");
    assert.notEqual(to[i], i, names(5)[i] + " zieht sich nicht selbst");
    assert.match(lines[1], /^Budget: bis 15\s?€$/); assert.equal(lines[2], "Übergabe: Fr 18.12.");
    for (let j = 0; j < 5; j++) if (j !== i) await assert.rejects(S.open(dev[j].k, eph, boxes[i], info + ":" + i, dev[j].p), "fremder Schlüssel öffnet den Zettel nicht");
  }
  assert.equal(new Set(to).size, 5, "jeder Name genau einmal zu beschenken");
  let at = 0, steps = 0; do { at = to[at]; steps++; } while (at !== 0 && steps <= 5); assert.equal(steps, 5, "ein Kreis durch alle");
  assert.match(B.slip(drawn, m, to[0], "en")[1], /^Budget: up to €15$/);
  // the link's own seed does not give the pairs: the same sign-ups drawn again come out differently
  const seen = new Set();
  for (let r = 0; r < 12; r++) {
    const x = await S.draw(pubs, info, B.circle), got = [];
    for (let i = 0; i < 5; i++) got.push(await S.open(dev[i].k, x[0], x[1][i], info + ":" + i, dev[i].p));
    seen.add(got.join());
  }
  assert.ok(seen.size > 3, "die Ziehung kommt aus einem Geheimnis des ziehenden Geräts, nicht aus dem Link: " + seen.size);
  // a box moved to another place does not open (the place and the key are bound in)
  await assert.rejects(S.open(dev[1].k, eph, boxes[1], info + ":0", dev[1].p));
  // invalid: two sign-ups only, a box missing, the same name or key twice, a draw before anyone signed up, a name too long
  const two = Tn.play(setup, [dev.slice(0, 2).map((x) => [x.n, x.p])], 0);
  const s2 = await S.draw(pubs.slice(0, 2), info, B.circle);
  assert.equal(Tn.play(two, [[names(2), s2[0], s2[1]]], 0), null);
  assert.equal(Tn.play(d, [[names(5), sealed[0], sealed[1].slice(0, 4)]], 0), null);
  assert.equal(Tn.play(d, [[["Ana", "ana", "Cem", "Dag", "Eva"], sealed[0], sealed[1]]], 0), null);
  assert.equal(Tn.play(d, [[["Ana", dev[0].p], ["ana", dev[1].p]]], 0), null);
  assert.equal(Tn.play(d, [[["Ana", dev[0].p], ["Ben", dev[0].p]]], 0), null);
  assert.equal(Tn.play(setup, [sealed], 0), null);
  assert.equal(Tn.play(d, [[names(5), sealed[0], sealed[1].map((x) => x + "AAAA")]], 0), null, "Zettel fester Länge");
  assert.equal(Tn.play(setup, [[["x".repeat(13), dev[0].p]]], 0), null);
  // (a sign-up list after the draw is still a valid move: a link can be built by hand. The app offers none: a phone that
  // drew or saw the draw keeps z and shows an older sign-up link as "already drawn", see the E2E.)
  // twelve people with names of twelve letters still fit one link after the draw
  const many = []; for (let i = 0; i < 12; i++) many.push(await S.keys());
  const long = many.map((x, i) => "Teilnehmer" + String(i).padStart(2, "0"));
  let r12 = run("bwichteln", 4, [[[1], [1], day], [[[long[0], many[0].p]]]]);
  const s12 = await S.draw(many.map((x) => x.p), "bwichtel:4", B.circle);
  r12 = Tn.play(r12, [[long, s12[0], s12[1]]], 0);
  assert.ok(r12 && r12.q.length <= 900, "q " + (r12 && r12.q.length));
  assert.ok(D.docUrl(Object.assign({ k: "turn", col: ["#111111", "#eeeeee"], by: [] }, r12)).split("#c=")[1].length <= 1200, "Link unter der Grenze");
  // Thanks instead of a gift: no budget on the slip
  const k = run("bwichteln", 9, [[[0], [3], day], [dev.slice(0, 3).map((x) => [x.n, x.p])]]);
  assert.equal(B.slip(k, Tn.moves(k), 1, "de")[1], Tn.T("de").bw_k_dank_do); assert.equal(B.slip(k, Tn.moves(k), 1, "de")[0], "Zu beschenken: Ben");
  assert.equal(run("bwichteln", 1, [[[0], [0], 5]]), null, "Tag außerhalb");
  // the face of the link names no pairs
  const face = Tn.face(drawn, "de").join(" ");
  assert.match(face, /5 machen mit/); for (const n of names(5)) assert.ok(!face.includes(n));
});

test("Geschenkideen ohne KI: fünf im Budget, passende zuerst, Reihenfolge nur aus dem Seed", () => {
  const W = Object.keys(G.WHO), L = Tn.GIFT.likes;
  for (const lang of ["de", "en"]) for (const who of W) for (const euro of [5, 10, 15, 20, 30, 50]) for (let a = 0; a < L.length; a += 3) {
    const ask = { who, euro, likes: [L[a], L[(a + 5) % L.length]] }, got = G.ideas(1234, ask, lang);
    assert.equal(got.length, 5, [lang, who, euro].join());
    assert.equal(new Set(got).size, 5);
    for (const t of got) {
      const x = G.LIST.find((i) => G.text(i, lang) === t);
      assert.ok(x && x[1] <= euro && x[3].includes(G.WHO[who]), t + " " + who + " " + euro);
    }
    const fits = G.LIST.filter((x) => x[1] <= euro && x[3].includes(G.WHO[who]) && ask.likes.some((l) => x[2].split(" ").includes(l)));
    const hit = got.filter((t) => fits.some((x) => G.text(x, lang) === t)).length;
    assert.equal(hit, Math.min(5, fits.length), "passende Ideen zuerst: " + [who, euro, ask.likes].join());
    assert.deepEqual(G.ideas(1234, ask, lang), got, "gleicher Seed, gleiche Ideen");
  }
  const ask = { who: "kollege", euro: 20, likes: ["tee", "spiel"] }, orders = new Set();
  for (let s = 0; s < 30; s++) orders.add(G.ideas(s, ask, "de").join());
  assert.ok(orders.size > 3, "der Seed mischt");
  const P = require("../src/geschenke.json");
  for (const x of G.LIST) {
    assert.equal(x.length, 4, "[Taste, Euro, Vorlieben, für wen], die Wörter stehen in geschenke.json");
    for (const lang of ["de", "en"]) { const t = P[lang]["gi_" + x[0]]; assert.ok(t, lang + " gi_" + x[0]); assert.equal(Q.clean(t, G.MAX), t, "passt in den Link: " + t); assert.ok(G.ok(t), "kein Ausschlusswort: " + t); }
    assert.ok([5, 10, 15, 20, 30, 50].includes(x[1]), x[0]);
    for (const l of x[2].split(" ")) assert.ok(L.includes(l), x[0] + " " + l);
    assert.match(x[3], /^[ktaob]+$/, x[0]);
  }
  assert.equal(new Set(G.LIST.map((x) => x[0])).size, G.LIST.length);
  for (const lang of ["de", "en"]) assert.equal(new Set(G.LIST.map((x) => G.text(x, lang))).size, G.LIST.length, lang + ": jede Idee nur einmal");
  assert.deepEqual(Object.keys(P.de).filter((k) => k.startsWith("gi_")).sort(), G.LIST.map((x) => "gi_" + x[0]).sort(), "keine Ideentexte ohne Eintrag in der Liste");
});

test("KI-Art liste: nur saubere, neue, harmlose Texte, höchstens fünf; Alkohol, Rauchen, Glücksspiel, Diät und Intimes fallen weg, Wetterstation bleibt", () => {
  const opt = { posten: [{ n: "Teesorten-Set" }, { n: "Rotwein" }, { n: "Teesorten-Set" }, { n: "Diät-Ratgeber" }, { n: "Sukkulente im Topf" }, { n: "<b>Kerze</b>" },
    { n: "Gin-Tasting" }, { n: "Notizbuch A5" }, { n: "Puzzle" }, { n: "Kalender" }, { n: "Kartenspiel" }, { n: "x".repeat(60) }] };
  const got = G.fromAi(opt, "de");
  assert.equal(got.length, 5);
  assert.deepEqual(got.slice(0, 2), ["Teesorten-Set", "Sukkulente im Topf"], "doppelt fällt weg, Reihenfolge bleibt");
  for (const t of got) { assert.ok(!/wein|diät|gin|[<>]/i.test(t), t); assert.equal(Q.clean(t, 40), t); }
  // the stop words hit words, not parts of harmless ones (Wetterstation, paperweight, origin, team spirit)
  for (const t of ["Wetterstation", "Paperweight", "Origami-Set", "Origin-Puzzle", "Team spirit mug", "Essex tea"]) assert.ok(G.ok(t), "harmlos: " + t);
  for (const t of ["Sportwetten-Gutschein", "Wette", "Spirits sampler", "Weight loss book", "Sexy socks", "Gin Tonic"]) assert.ok(!G.ok(t), "fällt weg: " + t);
  assert.deepEqual(G.fromAi(null, "de"), []); assert.deepEqual(G.fromAi({ posten: [{ n: "Bier" }, { n: "Lingerie" }] }, "en"), []);
  // one rule, word by word: harmless words that only look like an excluded one stay, German compounds of a drink go
  for (const t of ["Wetterstation", "Weather station", "Video game", "Paperweight", "Egg whisk", "Ginger tea", "Drum sticks", "Insektenhotel", "Sparschwein", "Tee-Probierset", "Origami-Papier",
    "Badesalz", "Massageball"]) assert.ok(G.ok(t), "bleibt: " + t);
  for (const t of ["Rotwein", "Glühwein", "Sekt", "Freibier", "Whisky-Gläser", "Gin-Tasting", "Red wine", "Craft beer", "Zigarren", "Sportwette", "Wetten, dass", "Lottoschein", "Casino-Gutschein",
    "Diät-Ratgeber", "Kalorienzähler", "Diet book", "Parfüm", "Deo", "Lingerie", "Erotik-Kalender"]) assert.equal(G.ok(t), false, "fällt weg: " + t);
  assert.deepEqual(G.fromAi({ posten: [{ n: "Wetterstation" }, { n: "Glühwein" }, { n: "Insektenhotel" }] }, "de"), ["Wetterstation", "Insektenhotel"]);
});

test("Geschenk in drei Fragen über Links: zweite Stimme, Ergebnis in de/en, weiter zu „Geld einsammeln“; kaputte Antworten fallen", () => {
  const five = G.ideas(5, { who: "oma", euro: 30, likes: ["lesen", "pflanze"] }, "de");
  const d = run("geschenk", 5, [[[4], [2], [2, 1], [five, 3]]]);
  assert.ok(d);
  assert.deepEqual(Tn.face(d, "de"), ["Vorschlag: " + five[3], "bis 30 €"]);
  const same = Tn.play(d, [[3]], 0), other = Tn.play(d, [[0]], 0);
  assert.equal(Tn.result(same, "de").h, "Einig: " + five[3]);
  assert.deepEqual(Tn.result(other, "de").lines, ["Erste Wahl: " + five[3], "Zweite Stimme: " + five[0], "bis 30 €"]);
  assert.equal(Tn.result(other, "en").h, "Two favourites"); assert.equal(Tn.result(other, "en").lines[2], "up to €30");
  assert.ok(D.byId(Tn.result(same, "de").open.i), "die Folgekarte gibt es");
  const ideas = Tn.GAMES.geschenk.turns[0][3];
  for (const bad of [[five.concat(["Noch eins"]), 0], [["A", "a"], 0], [["Kerze"], 1], [["x".repeat(41)], 0], [["<script>"], 0], [[], 0], ["Kerze", 0]])
    assert.equal(Tn.okAnswer(ideas, bad), false, JSON.stringify(bad));
  assert.equal(Tn.okAnswer(ideas, [["Kerze", "Tee"], 1]), true);
  assert.equal(run("geschenk", 5, [[[7], [2], [2, 1], [five, 3]]]), null, "nur vorhandene Personen");
  assert.equal(run("geschenk", 5, [[[1], [2], [2, 2], [five, 3]]]), null, "zwei verschiedene Vorlieben");
  // business: no "for whom", the smaller budgets
  const w = run("wichtelidee", 5, [[[1], [0, 3], [["Tee-Probierset", "Sudoku-Block"], 0]]]);
  assert.deepEqual(Tn.face(w, "de"), ["Vorschlag: Tee-Probierset", "bis 10 €"]);
  assert.equal(Tn.result(Tn.play(w, [[1]], 0), "de").open, null, "Business führt nicht zu PayPal");
});

test("Wunschzettel: der eigene Link trägt nur Wünsche, der Familienlink verdeckt, wer schenkt; das Bild nennt niemanden", () => {
  const W = Tn.WISH, list = [[], [["Hörbuch", 0, 1, []], ["Fahrradlicht", 1, 1, []], ["Puzzle", 2, 1, []]]];
  const b0 = run("wunsch", 11, [[list]]);
  assert.ok(b0);
  const mom = Tn.shopApply(Tn.moves(b0)[0][0], { name: "Mama", face: 0, adds: [], marks: { [Tn.shopKey("Hörbuch")]: 1 } }, W);
  const b1 = Tn.play(b0, [mom], 0);
  assert.deepEqual(Tn.shopRows(Tn.moves(b1)[0][0], W).map((r) => r.bring.map((p) => p[0]).join()), ["Mama", "", ""]);
  // the wisher's own link: the same list without marks or names, and o: 1 so her phone knows it is hers
  const own = Object.assign(Tn.play(b1, [Tn.wishBare(Tn.moves(b1)[0][0])], 0), { o: 1 });
  const v = Tn.moves(own)[0][0];
  assert.deepEqual(v[0], []); assert.ok(v[1].every((it) => it[3].length === 0));
  assert.ok(!JSON.stringify(Tn.unseal(own.q, own.seed)).includes("Mama"), "kein Name im eigenen Link");
  // what she sends on from her own link is the family's link again (o dropped), and the family's marks merge back in
  const fromOwn = Tn.play(own, [Tn.shopApply(v, { name: "", face: 0, adds: [{ text: "Schal", qty: 1 }], marks: {} }, W)], 0);
  assert.equal(fromOwn.o, undefined);
  const merged = Tn.shopMerge(Tn.moves(fromOwn)[0][0], Tn.moves(b1)[0][0], W);
  assert.deepEqual(Tn.shopRows(merged, W).map((r) => r.label + ":" + r.bring.length), ["Hörbuch:1", "Fahrradlicht:0", "Puzzle:0", "Schal:0"]);
  // face and result never name a giver
  for (const lang of ["de", "en"]) {
    const f = Tn.face(b1, lang).join(" "); assert.ok(!f.includes("Mama")); assert.match(f, /^3 (Wünsche|wishes)$/);
  }
  const all = Tn.shopApply(Tn.moves(b1)[0][0], { name: "Oma", face: 1, adds: [], marks: { [Tn.shopKey("Fahrradlicht")]: 1, [Tn.shopKey("Puzzle")]: 1 } }, W);
  const full = Tn.play(b1, [all], 0);
  assert.equal(Tn.state(full).over, false, "alles vergeben beendet den Zettel nicht (das würde es ihr verraten)");
  const done = Tn.close(full);
  assert.equal(Tn.state(done).over, true, "erst ihr Schließen");
  assert.ok(!/Mama|Oma/.test(JSON.stringify(Tn.result(done, "de"))));
  assert.equal(Tn.face(run("wunsch", 1, [[[[], [["Rad", 0, 1, []]]]]]), "de")[0], "1 Wunsch");
  // a count or a second item with the same text is no wish
  assert.equal(run("wunsch", 1, [[[[], [["Rad", 0, 2, []]]]]]), null);
  assert.equal(run("wunsch", 1, [[[[], [["Rad", 0, 1, []], ["rad", 1, 1, []]]]]]), null);
});

test("Texte: Teil- und Business-Wörter in de und en vollständig, jede genutzte Taste vorhanden, keine Platzhalter offen", () => {
  const P = require("../src/geschenke.json");
  assert.deepEqual(Object.keys(P.de).sort(), Object.keys(P.en).sort());
  assert.deepEqual(Object.keys(BIZ_TEXT.de).sort(), Object.keys(BIZ_TEXT.en).sort());
  const T = require("../src/turn.json").text;
  const need = ["gf_who", "gf_budget", "gf_like", "gf_ideas", "gf_fav", "wun_make", "wun_go", "inv_send", "wun_secret", "wun_empty", "wun_count", "wun_count_one"]
    .concat(Tn.GIFT.who.map((k) => "gfw_" + k), Tn.GIFT.likes.map((k) => "gfl_" + k));
  for (const l of ["de", "en"]) for (const k of need) assert.ok(T[l][k] || P[l][k], l + " " + k);
  for (const g of ["geschenk", "wunsch"]) for (const w of Object.values(Tn.GAMES[g].words)) for (const l of ["de", "en"]) assert.ok(T[l][w], g + " " + l + " " + w);
  for (const g of ["bwichteln", "wichtelidee"]) {
    for (const w of Object.values(Tn.GAMES[g].words)) for (const l of ["de", "en"]) assert.ok(T[l][w] || BIZ_TEXT[l][w], g + " " + l + " " + w);
    for (const k of Tn.GAMES[g].notes) for (const l of ["de", "en"]) assert.ok(BIZ_TEXT[l][k] || T[l][k], g + " " + l + " " + k);
    for (const t of Tn.GAMES[g].turns.flat()) for (const l of ["de", "en"]) assert.ok(T[l][t.l] || BIZ_TEXT[l][t.l], g + " " + l + " " + t.l);
  }
  // Business is neutral (rule 24): no "du/dein" in its new words
  for (const [k, v] of Object.entries(BIZ_TEXT.de)) if (/^(bw_|wi_|biz_free)/.test(k)) assert.ok(!/\b(du|dein|dich|dir)\b/i.test(v), k + ": " + v);
  assert.deepEqual(B.CARDS, ["bwichteln", "wichtelidee"]);
});
