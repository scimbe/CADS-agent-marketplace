// Erzeugt test/fixtures/karte-g1g2.json aus dem echten Server-Code (CADS-DEMO-wrapper lib/duell-karte.mjs compose).
// Aufruf: node test/fixtures/mk-karte-g1g2.mjs <Pfad zu CADS-DEMO-wrapper> <SHA> > test/fixtures/karte-g1g2.json
// test/karte-vertrag.test.js liest den Server direkt, wenn MDI_WRAPPER auf ein Wrapper-Verzeichnis zeigt.
const W = process.argv[2];
const K = await import(W + "/lib/duell-karte.mjs");
const text = (v, max) => { const s = typeof v === "string" ? v.trim() : ""; return Array.from(s).slice(0, max).join(""); };
const out = { herkunft: "Erzeugt aus CADS-DEMO-wrapper @ " + process.argv[3] + " lib/duell-karte.mjs compose() mit test/fixtures/mk-karte-g1g2.mjs (Server der freien Karte, Genres G1/G2)", source: "CADS-DEMO-wrapper @ " + process.argv[3] + " lib/duell-karte.mjs compose() mit text(v,max) = trim+Kuerzen", schemas: { game: K.SCHEMAS.game, lauf: K.SCHEMAS.lauf }, LEVELS: K.LEVELS, PHYSIK: K.PHYSIK, LAUF_LEVELS: K.Lauf.E.LEVELS, LAUF_HAS: K.Lauf.E.HAS, GENRE_ENGINE: K.GENRE_ENGINE, cases: [] };
const G = K.SCHEMAS.game.properties, L = K.SCHEMAS.lauf.properties;
const em = G.emoji.enum, th = G.theme.enum, mo = G.motif.enum, lv = G.level.enum, st = G.route.items.properties.physik.enum;
let n = 0;
for (const t of th) for (const m of mo) for (const l of lv) {
  const i = n++;
  const slots = { ok: true, title: "Spiel " + i, emoji: em[i % em.length], theme: t, motif: m, level: l,
    route: [0, 1, 2].map((k) => ({ physik: st[(i + k) % st.length], thema: th[(i + 2 * k) % th.length], emoji: em[(i * 3 + k) % em.length] })) };
  out.cases.push({ art: "game", seed: (i * 2654435761) >>> 0, slots, doc: K.compose("game", slots, (i * 2654435761) >>> 0, text) });
}
// every emoji at least once as hero
for (let i = 0; i < em.length; i++) { const slots = { ok: true, title: "Held " + i, emoji: em[i], theme: th[i % 8], motif: mo[i % mo.length], level: lv[i % 3], route: [0, 1, 2].map((k) => ({ physik: st[k], thema: th[k], emoji: em[(i + k + 1) % em.length] })) }; out.cases.push({ art: "game", seed: 1000 + i, slots, doc: K.compose("game", slots, 1000 + i, text) }); }
// edge: wrong slots the server repairs or refuses
for (const slots of [{ ok: true, title: "Kurz", emoji: "x", theme: "mars", motif: "?", level: "ultra", route: [{ physik: "x", thema: "y", emoji: "z" }, {}, null] }, { ok: true, title: "", emoji: em[0], theme: th[0], motif: mo[0], level: lv[0], route: [] }, { ok: false }])
  out.cases.push({ art: "game", seed: 7, slots, doc: K.compose("game", slots, 7, text) });
const W_ = L.world.enum, M = L.mode.enum, LV = L.level.enum, FIG = L.figure.enum, OBJ = L.obstacle.enum, COIN = L.coin.enum, FOE = L.foe.enum, HAS = L.has.items.enum, FOES = L.foes.items.enum;
n = 0;
for (const w of W_) for (const m of M) for (const l of LV) {
  const i = n++;
  const has = HAS.filter((_, k) => (i >> k) & 1), foes = FOES.filter((_, k) => ((i + 1) >> k) & 1);
  const slots = { ok: true, title: "Lauf " + i, mode: m, world: w, level: l, figure: FIG[i % FIG.length], obstacle: OBJ[i % OBJ.length], coin: COIN[i % COIN.length], foe: FOE[i % FOE.length], has, foes };
  out.cases.push({ art: "lauf", seed: (i * 40503 + 17) >>> 0, slots, doc: K.compose("lauf", slots, (i * 40503 + 17) >>> 0, text) });
}
for (const slots of [{ ok: true, title: "Alles", mode: "ziel", world: "lava", level: "hard", figure: FIG[15], obstacle: OBJ[11], coin: COIN[11], foe: FOE[11], has: HAS, foes: FOES }, { ok: true, title: "Unsinn", mode: "x", world: "mars", level: "x", figure: "x", obstacle: "x", coin: "x", foe: "x", has: ["x"], foes: ["y"] }, { ok: true, title: "", mode: "endlos" }])
  out.cases.push({ art: "lauf", seed: 9, slots, doc: K.compose("lauf", slots, 9, text) });
process.stdout.write(JSON.stringify(out) + "\n");
