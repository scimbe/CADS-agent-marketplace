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

test("Büro-Wichteln über echte Links: Budget, Art, Tag; jede Person sieht nur den eigenen Zettel, nie den eigenen Namen", () => {
  const day = 20805;   // Fr 18.12.2026
  const d = run("bwichteln", 777, [[pad(names(5)), [2], [0], day]]);
  assert.ok(d, "erster Zug gültig");
  const link = D.parseRoute("#" + D.docUrl(Object.assign({ k: "turn", col: ["#111111", "#eeeeee"], by: [] }, d)).split("#")[1]);
  assert.equal(link.type, "doc");
  const st = Tn.state(link.doc); assert.equal(st.turn, 1);
  const slips = names(5).map((me, i) => {
    const p = Tn.GAMES.bwichteln.turns[1];
    assert.equal(p[0].w, "me");
    const lines = p[1].list(link.doc, st.moves, [[i]], "de");
    assert.ok(!lines[0].includes(me), me + " zieht sich nicht selbst: " + lines[0]);
    assert.match(lines[1], /^Budget: bis 15\s?€$/); assert.equal(lines[2], "Übergabe: Fr 18.12.");
    return lines[0];
  });
  assert.equal(new Set(slips).size, 5, "jeder Name genau einmal zu beschenken");
  const en = Tn.GAMES.bwichteln.turns[1][1].list(link.doc, st.moves, [[0]], "en");
  assert.match(en[1], /^Budget: up to €15$/); assert.ok(!/undefined|\{\w+\}/.test(JSON.stringify(en)));
  // Thanks instead of a gift: no budget on the slip
  const k = run("bwichteln", 9, [[pad(names(3)), [0], [3], day]]);
  assert.equal(Tn.GAMES.bwichteln.turns[1][1].list(k, Tn.moves(k), [[0]], "de")[1], Tn.T("de").bw_k_dank_do);
  // invalid: fewer than three, the same name twice, a day out of range, a name tap beyond the list
  assert.equal(run("bwichteln", 1, [[pad(["Ana", "Ben"]), [0], [0], day]]), null);
  assert.equal(run("bwichteln", 1, [[pad(["Ana", "ana", "Ben"]), [0], [0], day]]), null);
  assert.equal(run("bwichteln", 1, [[pad(names(3)), [0], [0], 5]]), null);
  assert.equal(Tn.play(d, [[7], 0], 0), null);
  assert.equal(Tn.GAMES.bwichteln.stay, true, "der Link geht weiter an die nächste Person");
  // the face of the link names no pairs
  const face = Tn.face(d, "de").join(" ");
  assert.match(face, /5 machen mit/); for (const n of names(5)) assert.ok(!face.includes(n));
});

test("Geschenkideen ohne KI: fünf im Budget, passende zuerst, Reihenfolge nur aus dem Seed", () => {
  const W = Object.keys(G.WHO), L = Tn.GIFT.likes;
  for (const lang of ["de", "en"]) for (const who of W) for (const euro of [5, 10, 15, 20, 30, 50]) for (let a = 0; a < L.length; a += 3) {
    const ask = { who, euro, likes: [L[a], L[(a + 5) % L.length]] }, got = G.ideas(1234, ask, lang);
    assert.equal(got.length, 5, [lang, who, euro].join());
    assert.equal(new Set(got).size, 5);
    for (const t of got) {
      const x = G.LIST.find((i) => i[lang === "en" ? 1 : 0] === t);
      assert.ok(x && x[2] <= euro && x[4].includes(G.WHO[who]), t + " " + who + " " + euro);
    }
    const fits = G.LIST.filter((x) => x[2] <= euro && x[4].includes(G.WHO[who]) && ask.likes.some((l) => x[3].split(" ").includes(l)));
    const hit = got.filter((t) => fits.some((x) => x[lang === "en" ? 1 : 0] === t)).length;
    assert.equal(hit, Math.min(5, fits.length), "passende Ideen zuerst: " + [who, euro, ask.likes].join());
    assert.deepEqual(G.ideas(1234, ask, lang), got, "gleicher Seed, gleiche Ideen");
  }
  const ask = { who: "kollege", euro: 20, likes: ["tee", "spiel"] }, orders = new Set();
  for (let s = 0; s < 30; s++) orders.add(G.ideas(s, ask, "de").join());
  assert.ok(orders.size > 3, "der Seed mischt");
  for (const x of G.LIST) {
    for (const t of [x[0], x[1]]) { assert.equal(Q.clean(t, G.MAX), t, "passt in den Link: " + t); assert.ok(G.ok(t), "kein Ausschlusswort: " + t); }
    assert.ok([5, 10, 15, 20, 30, 50].includes(x[2]), x[0]);
    for (const l of x[3].split(" ")) assert.ok(L.includes(l), x[0] + " " + l);
    assert.match(x[4], /^[ktaob]+$/, x[0]);
  }
  assert.equal(new Set(G.LIST.map((x) => x[0])).size, G.LIST.length); assert.equal(new Set(G.LIST.map((x) => x[1])).size, G.LIST.length);
});

test("KI-Art liste: nur saubere, neue, harmlose Texte, höchstens fünf; Alkohol, Diät und Zweideutiges fallen weg", () => {
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
  const done = Tn.play(b1, [all], 0);
  assert.equal(Tn.state(done).over, true);
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
