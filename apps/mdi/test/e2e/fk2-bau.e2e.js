// Freie Karte 2, P3: Bau-Worker Ende-zu-Ende mit Modell-Double (kein Netz, kein Key) durch die echte Sandbox:
// Warteschlange (HTTP-Double des Wrappers) -> Planer mit Szenarien -> Bau -> Pruefung mit Szenario-Bots -> Szenario-
// Nachholrunde -> Fotos -> Abnahme -> Ergebnis je Punkt (gespielt/gelesen, Kundensaetze) -> Meldung an den Wrapper;
// danach eine Nachbesserung mit Kundentext.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { ROOT } from "./lib/grund.mjs";
import { createLlm, createTagesbuch } from "../../bau/llm.mjs";
import { createPruefstand } from "../../bau/pruefen.mjs";
import { createBauPipeline } from "../../bau/pipeline.mjs";
import { createQueueClient, createWorker } from "../../bau/worker.mjs";

const BOOT = fs.readFileSync(path.join(ROOT, "test/fixtures/spiel/tropfenboot.js"), "utf8");
const msg = (text, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 100 } });
const keins = { pruefbar: false, schritte: [], art: "keins", emoji: "", richtung: "", text: "" };
const AUFTRAG = { id: "B".repeat(22), lang: "de", satz: "Ein Boot wirft Wassertropfen auf Wolken", titel: "Tropfenboot", verstehe: "", nicht: [], fragen: [{ frage: "Wer bist du?", antwort: "ein Boot" }],
  punkte: [{ id: "p1", text: "Du steuerst ein Boot ⛵ – Pfeile nach links und rechts.", pruefung: "Links bewegt das Boot nach links." },
    { id: "p2", text: "Wolken sind Fotos aus deinem Urlaub.", pruefung: "Fotos sind zu sehen." },
    { id: "p3", text: "Nach 5 Sekunden hast du gewonnen.", pruefung: "Nichtstun gewinnt nach 5 Sekunden." },
    { id: "p4", text: "Tropfen lassen Wolken platzen.", pruefung: "Ein Treffer gibt Punkte." }] };

test("Bau-Worker: Szenarien entscheiden je Punkt, ehrliche Kundensaetze, Ergebnis an den Wrapper, Nachbessern mit Kundentext", async () => {
  const seen = [];
  const fake = async (req) => {
    const rolle = req.system[1].text.match(/^Rolle: (\w+)/)[1], user = typeof req.messages[0].content === "string" ? req.messages[0].content : req.messages[0].content[0].text;
    seen.push({ rolle, user, model: req.model, max: req.max_tokens });
    if (rolle === "PLANER") return msg(JSON.stringify({ entscheidung: "bauen", absage: "", typ: "echtzeit", spielplan: "Boot ⛵ unten, Wolken ☁️, Tropfen 💧",
      punkte: [{ id: "p1", machbar: true, kunde: "", szenario: { pruefbar: true, schritte: [{ halte: ["left"], frames: 60 }], art: "figur_bewegt", emoji: "⛵", richtung: "links", text: "" } },
        { id: "p2", machbar: false, kunde: "Eigene Fotos gehen in diesem Spiel nicht – die Wolken sind gezeichnet.", szenario: keins },
        { id: "p3", machbar: true, kunde: "", szenario: { pruefbar: true, schritte: [{ halte: [], frames: 300 }], art: "sieg", emoji: "", richtung: "", text: "" } },
        { id: "p4", machbar: true, kunde: "", szenario: keins }] }));
    if (rolle === "BAUER") return msg("```js\n" + BOOT + "```");
    return msg(JSON.stringify({ punkte: [{ id: "p1", urteil: "erfuellt", beleg: "update Zeile 9", kunde: "" }, { id: "p3", urteil: "erfuellt", beleg: "-", kunde: "" }, { id: "p4", urteil: "erfuellt", beleg: "g.hit Zeile 15", kunde: "" }], nachbessern: "" }));
  };
  const posts = [];
  let holen = 0;
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => {
      if (req.headers.authorization !== "Bearer t0k3n-fuer-den-test") { res.writeHead(401).end(); return; }
      if (req.url === "/api/intern/fk2/holen") {
        holen++;
        if (holen === 1) return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ auftrag: AUFTRAG, lease: "L".repeat(22), art: "neu" }));
        if (holen === 2) { const e = posts[0]; return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ auftrag: { ...AUFTRAG, nachbessern: { code: e.spiel.code, plan: e.plan, punkte: e.punkte, kundentext: "Ich möchte gewinnen können." } }, lease: "M".repeat(22), art: "nachbessern" })); }
        return res.writeHead(204).end();
      }
      posts.push(JSON.parse(b)); res.writeHead(200, { "Content-Type": "application/json" }).end("{\"ok\":true}");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fk2-bau-e2e-")), tokenFile = path.join(dir, "token");
  fs.writeFileSync(tokenFile, "t0k3n-fuer-den-test");
  const tagesbuch = createTagesbuch({ cap: 5, dir });
  const pruef = await createPruefstand();
  try {
    const pipeline = createBauPipeline({ llm: createLlm({ ledger: tagesbuch(), fake }), pruef, rollen: { planer: "claude-haiku-5-5", bauer: "claude-haiku-5-5", abnahme: "claude-haiku-5-5" } });
    const w = createWorker({ queue: createQueueClient({ base: "http://127.0.0.1:" + server.address().port, tokenFile }), pipeline, tagesbuch, log: () => {} });
    assert.equal(await w.einmal(), "gebaut");
    const e = posts[0];
    assert.equal(e.ok, true, JSON.stringify(e));
    assert.deepEqual(e.punkte.map((p) => [p.id, p.erfuellt, p.geprueft]), [["p1", true, "gespielt"], ["p2", false, "gelesen"], ["p3", false, "gespielt"], ["p4", true, "gelesen"]]);
    assert.equal(e.punkte[1].notiz, "Eigene Fotos gehen in diesem Spiel nicht – die Wolken sind gezeichnet.");
    assert.equal(e.punkte[2].notiz, "Beim Ausprobieren ließ sich so nicht gewinnen.", "fester Satz, obwohl das Modell erfuellt sagt");
    assert.ok(e.punkte.every((p) => !/Zeile|update|g\./.test(p.notiz)), "keine Code-Zeilen in den Saetzen fuer die Person");
    assert.match(e.spiel.sha256, /^[0-9a-f]{64}$/);
    const bauer = seen.filter((s) => s.rolle === "BAUER");
    assert.equal(bauer.length, 4, "gruen, dann bis zu drei Runden fuer das fehlende Szenario (das bessere Ergebnis zaehlt)");
    assert.match(bauer[1].user, /Diese Szenario-Bots bestehen noch nicht:\n- \{"id":"p3"/);
    assert.ok(bauer.every((s) => s.max === 32000));
    assert.equal(e.versuche.length, 4); assert.ok(e.versuche.every((v) => v.szenarien === "1/2"));
    // Nachbessern: bestehendes Spiel, fehlt-Punkte und Kundentext als Daten
    assert.equal(await w.einmal(), "gebaut");
    const n = posts[1];
    assert.equal(n.art, "nachbessern"); assert.equal(n.lease, "M".repeat(22)); assert.equal(n.ok, true);
    const nb = seen.filter((s) => s.rolle === "BAUER")[4];
    assert.match(nb.user, /Bestehendes Spiel \(gezielt aendern, nicht neu bauen\)/);
    assert.match(nb.user, /- \[p3\] Beim Ausprobieren ließ sich so nicht gewinnen\./);
    assert.match(nb.user, /<data>"Ich möchte gewinnen können\."<\/data>/);
    assert.equal(await w.einmal(), "leer");
  } finally { await pruef.close(); server.close(); }
});
