// Freie Karte 2, P3: Pipeline Ende-zu-Ende mit Ersatz-Modell (kein Netz, kein Key) durch die echte Sandbox:
// Plan -> Bau (kaputt) -> Pruefung -> Reparatur mit Befunden -> gruen -> Fotos -> Abnahme -> Anzeige mit ehrlichem
// "fehlt"; dann Nachbesserung 3x und danach "Melden".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/grund.mjs";
import { createLedger, createLlm } from "../../bau/llm.mjs";
import { createPruefstand } from "../../bau/pruefen.mjs";
import { createPipeline, VARIANTEN } from "../../scripts/fk2-p3/pipeline.mjs";

const INV = fs.readFileSync(path.join(ROOT, "src/spiel/beispiele/invaders.js"), "utf8");
const KAPUTT = INV.replace("const speed = 0.5", "const speed = Math.sin(1) * 0 + 0.5").replace('d.emoji("⛵"', 'd.emoji("🔫"');
const msg = (text, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 100 } });

test("P3-Pipeline mit Ersatz-Modell: Reparatur aus Befunden, ehrliches fehlt, Nachbesserung bis Melden", async () => {
  const seen = [];
  let bau = 0;
  const fake = async (req) => {
    const sys = req.system[1].text, user = typeof req.messages[0].content === "string" ? req.messages[0].content : req.messages[0].content[0].text;
    seen.push({ model: req.model, rolle: sys.match(/^Rolle: (\w+)/)[1], user });
    if (sys.startsWith("Rolle: PLANER")) return msg(JSON.stringify({ entscheidung: "bauen", absage_grund: "", titel: "Segel-Invaders", hinweise: ["Figuren als Emojis"], spielplan: "wie Vorlage invaders",
      haekchen: [{ id: "h1", punkt: "Segelboote kommen in Reihen", machbar: true, grund: "" }, { id: "h2", punkt: "Ich schiesse mit Wasserbomben", machbar: true, grund: "" }, { id: "h3", punkt: "Boote sind Fotos von meinem Boot", machbar: false, grund: "keine Fotos" }] }));
    if (sys.startsWith("Rolle: BAUER")) { bau++; return msg("```js\n" + (bau === 1 ? KAPUTT : INV) + "```"); }
    return msg(JSON.stringify({ punkte: [{ id: "h1", urteil: "erfuellt", beleg: "fleet() Zeile 60" }, { id: "h2", urteil: "fehlt", beleg: "absichtlich fehlt im Test" }], nachbessern: "h2 umsetzen" }));
  };
  const ledger = createLedger({ cap: 1 });
  const pruef = await createPruefstand();
  try {
    const pipe = createPipeline({ llm: createLlm({ ledger, fake }), pruef, rollen: VARIANTEN.C });
    const k = await pipe.neu({ id: "T1", wunsch: "Space Invaders mit Segelbooten", genre: "G1", tag: "C-T1-L1" });
    assert.equal(k.ende, "geliefert", JSON.stringify(k.versuche && k.versuche.map((v) => v.fehlerarten)));
    assert.equal(k.versuche.length, 2, "eine Reparaturrunde");
    assert.ok(k.versuche[0].fehlerarten.includes("statisch:Math.sin"), JSON.stringify(k.versuche[0].fehlerarten));
    assert.ok(k.versuche[0].fehlerarten.includes("policy:emoji"));
    assert.ok(/g\.sin\(grad\)/.test(seen[2].user) && /Policy: Emoji 🔫/.test(seen[2].user), "Reparaturauftrag enthaelt Befunde mit Abhilfe");
    assert.equal(seen[0].model, "claude-sonnet-5-5"); assert.equal(seen[1].model, "claude-haiku-5-5");
    assert.equal(k.versionen[0].fotos.length, 2, "zwei Fotos aus dem echten Spielmodus");
    assert.ok(k.versionen[0].fotos[0].length > 1000);
    assert.deepEqual(k.anzeige.kann.map((x) => x.id), ["h1"]);
    assert.deepEqual(k.anzeige.fehlt.map((x) => [x.id, x.quelle]), [["h2", "abnahme"], ["h3", "planer"]]);
    for (let i = 1; i <= 3; i++) {
      const nb = await pipe.nachbessern(k);
      assert.equal(nb.ergebnis, "geliefert"); assert.equal(nb.nr, i); assert.equal(nb.offen_nachher, 2);
      assert.match(seen.filter((s) => s.rolle === "BAUER").at(-1).user, /Fehlt laut Abnahme:\n- \[h2\]/);
    }
    const m = await pipe.nachbessern(k);
    assert.equal(m.melden, true, "nach drei Nachbesserungen: Melden");
    assert.ok(ledger.spent > 0);
  } finally { await pruef.close(); }
});
