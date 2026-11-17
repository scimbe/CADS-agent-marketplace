// Szenario-Bots (src/spiel/szenario.js): Form, Grenzen und jede Erwartung gegen echte Referenzspiele, ohne Browser.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSzenario, checkSzenarien, runSzenario, runSzenarien, ARTEN, SZ } from "../src/spiel/szenario.js";
import { playtest, PHASES } from "../src/spiel/pruefung.js";
import { checkToFrame, V } from "../src/spiel/protokoll.js";
import { gesamtfristMs, FRISTEN } from "../src/spiel/fristen.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = async (n) => (await import(path.join(ROOT, "src/spiel/beispiele", n + ".js"))).default;
const sz = (id, schritte, erwartung) => ({ id, schritte, erwartung });
// kleines Spiel mit Emoji-Figur: Boot unten, Pfeile bewegen es, Feuer wirft Wassertropfen, Treffer oben gibt Punkte
const BOOT = {
  title: "Boot", controls: ["left", "right", "fire"], lives: 1,
  init: () => ({ x: 180, drops: [] }),
  update(s, inp, g) {
    if (inp.left) s.x -= 3;
    if (inp.right) s.x += 3;
    if (inp.firePressed) s.drops.push({ x: s.x, y: 560 });
    for (const d of s.drops) d.y -= 8;
    for (const d of s.drops) if (d.y < 60) g.addScore(1);
    s.drops = s.drops.filter((d) => d.y >= 60);
  },
  draw(s, d) { d.clear("cream"); d.emoji("⛵", s.x, 580, 40); for (const x of s.drops) d.emoji("💧", x.x, x.y, 16); d.text("Boot", 20, 70); }
};

test("Szenario: Form ist streng (Schluessel, Grenzen, geschlossene Liste)", () => {
  assert.equal(checkSzenario(sz("p1", [{ halte: ["left"], frames: 60 }], { art: "figur_bewegt", emoji: "⛵", richtung: "links" })), null);
  assert.equal(checkSzenario(sz("p2", [{ halte: [], frames: 30 }], { art: "punkte_steigen" })), null);
  assert.match(checkSzenario(sz("p1", [{ halte: ["left"], frames: 60 }], { art: "macht_spass" })), /art/);
  assert.match(checkSzenario(sz("p1", [{ halte: ["jump"], frames: 60 }], { art: "punkte_steigen" })), /halte/);
  assert.match(checkSzenario(sz("p1", [{ halte: [], frames: SZ.frames + 1 }], { art: "punkte_steigen" })), /Frames/);
  assert.match(checkSzenario(sz("p1", [{ halte: [], frames: 1 }], { art: "punkte_steigen", emoji: "⛵" })), /genau/);
  assert.match(checkSzenario(sz("p1", [{ halte: [], frames: 1 }], { art: "figur_bewegt", emoji: "⛵", richtung: "seitwaerts" })), /richtung/);
  assert.match(checkSzenario({ ...sz("p1", [{ halte: [], frames: 1 }], { art: "sieg" }), extra: 1 }), /Schluessel/);
  assert.match(checkSzenarien([sz("p1", [{ halte: [], frames: 1 }], { art: "sieg" }), sz("p1", [{ halte: [], frames: 1 }], { art: "sieg" })]), /doppelt/);
  assert.match(checkSzenarien(Array.from({ length: SZ.max + 1 }, (_, i) => sz("p" + i, [{ halte: [], frames: 1 }], { art: "sieg" }))), /hoechstens/);
  assert.equal(ARTEN.length, 9);
});

test("Szenario: Bewegung, Punkte, Leben, Spielende, Figuren und Text werden gespielt, nicht gelesen", async () => {
  const inv = await load("invaders"), snake = await load("snake");
  const r = runSzenarien(BOOT, [
    sz("p1", [{ halte: ["left"], frames: 40 }], { art: "figur_bewegt", emoji: "⛵", richtung: "links" }),
    sz("p2", [{ halte: ["right"], frames: 40 }], { art: "figur_bewegt", emoji: "⛵", richtung: "links" }),
    sz("p3", [{ halte: ["fire"], frames: 30 }], { art: "mehr_figuren", emoji: "💧" }),
    sz("p4", [{ halte: ["fire"], frames: 120 }], { art: "punkte_steigen" }),
    sz("p5", [{ halte: ["up"], frames: 10 }], { art: "punkte_steigen" }),
    sz("p6", [{ halte: [], frames: 5 }], { art: "figur_sichtbar", emoji: "🦖" }),
    sz("p7", [{ halte: [], frames: 5 }], { art: "text_sichtbar", text: "boot" })
  ], { seed: "t" });
  assert.equal(r[0].ok, true, JSON.stringify(r[0]));
  assert.equal(r[1].ok, false); assert.equal(r[1].grund, "nicht_erreicht");
  assert.equal(r[2].ok, true, JSON.stringify(r[2]));
  assert.equal(r[3].ok, true, JSON.stringify(r[3]));
  assert.equal(r[4].ok, false); assert.equal(r[4].grund, "steuerung_fehlt", "up ist nicht deklariert");
  assert.equal(r[5].ok, false); assert.equal(r[5].grund, "figur_fehlt");
  assert.equal(r[6].ok, true, "Text ohne Gross-/Kleinschreibung");
  const l = runSzenario(inv, sz("p1", [{ halte: [], frames: 1200 }], { art: "leben_sinken" }), { seed: "t" });
  assert.equal(l.ok, true, "ohne Ausweichen trifft eine Kanonenkugel: " + JSON.stringify(l));
  const s = runSzenario(snake, sz("p1", [{ halte: [], frames: 600 }], { art: "spiel_endet" }), { seed: "t" });
  assert.equal(s.ok, true, "die Schlange faehrt ohne Steuerung gegen die Wand: " + JSON.stringify(s));
  assert.deepEqual(runSzenario(snake, sz("p1", [{ halte: [], frames: 5 }], { art: "sieg" }), { seed: "t" }).ok, false);
});

test("Szenario: gleicher Seed, gleiches Ergebnis; ein Fehler im Spiel ist ein ehrliches fehlt", async () => {
  const inv = await load("invaders");
  const a = runSzenario(inv, sz("p1", [{ halte: ["fire", "left"], frames: 300 }], { art: "punkte_steigen" }), { seed: "x" });
  const b = runSzenario(inv, sz("p1", [{ halte: ["fire", "left"], frames: 300 }], { art: "punkte_steigen" }), { seed: "x" });
  assert.deepEqual(a, b);
  const kaputt = { title: "K", controls: ["left"], lives: 1, init: () => ({ n: 0 }), update(s) { s.n++; if (s.n > 3) throw new Error("kaputt"); }, draw(s, d) { d.clear("cream"); } };
  const k = runSzenario(kaputt, sz("p1", [{ halte: ["left"], frames: 10 }], { art: "punkte_steigen" }), { seed: "x" });
  assert.equal(k.ok, false); assert.equal(k.grund, "fehler");
});

test("Szenarien laufen in der Pruefung nach den Invarianten, entscheiden nicht ueber ok und haben eine eigene Frist", async () => {
  const r = playtest(BOOT, { seed: "s", seconds: 3, now: () => 0, szenarien: [sz("p1", [{ halte: ["left"], frames: 40 }], { art: "figur_bewegt", emoji: "⛵", richtung: "rechts" })] });
  assert.equal(r.szenarien.length, 1); assert.equal(r.szenarien[0].ok, false);
  assert.ok(PHASES.includes("szenarien") && FRISTEN.fenster.szenarien > 0);
  assert.ok(gesamtfristMs(60) > 0);
  const start = { v: V, t: "start", mode: "test", code: "x", seed: "a", lang: "de", seconds: 5 };
  assert.match(checkToFrame(start), /Schluessel/, "Pruefauftrag ohne szenarien wird abgelehnt");
  assert.match(checkToFrame({ ...start, szenarien: [{ id: "p1" }] }), /Szenario/);
  assert.equal(checkToFrame({ ...start, szenarien: [] }), null);
});
