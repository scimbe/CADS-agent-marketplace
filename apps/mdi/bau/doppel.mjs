// Freie Karte 2, P3: Modell-Double fuer Tests und fuer den Staging-Rauchtest ohne API (MDI_BAU_MODELL_DOUBLE=1, solange das
// Kontolimit gilt). Antwortet je Rolle deterministisch: Planer = alle Punkte machbar, keine Szenarien; Bauer = Vorlage
// invaders; Abnahme = jeder Punkt "fehlt" mit ehrlichem Satz. Ein Double-Lauf ist darum nie ein voller Erfolg und bucht
// nie ein Guthaben ab (Teilerfolg: nichts abgebucht).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const msg = (text) => ({ stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 100, output_tokens: 100 } });
const idsOf = (text) => [...String(text).matchAll(/^- \[(p\d+)\] /gm)].map((m) => m[1]);

/** fake fuer createLlm: (req) -> Nachricht */
export function modellDouble() {
  const code = fs.readFileSync(path.join(ROOT, "src/spiel/beispiele/invaders.js"), "utf8");
  return async (req) => {
    const rolle = req.system[1].text.match(/^Rolle: (\w+)/)[1];
    const user = typeof req.messages[0].content === "string" ? req.messages[0].content : req.messages[0].content[0].text;
    const ids = [...new Set(idsOf(user))];
    if (rolle === "PLANER") return msg(JSON.stringify({ entscheidung: "bauen", absage: "", typ: "echtzeit", spielplan: "Vorlage invaders (Modell-Double)",
      punkte: ids.map((id) => ({ id, machbar: true, kunde: "", szenario: { pruefbar: false, schritte: [], art: "keins", emoji: "", richtung: "", text: "" } })) }));
    if (rolle === "BAUER") return msg("```js\n" + code + "```");
    const pruefen = [...user.matchAll(/\[(p\d+)\]/g)].map((m) => m[1]);
    return msg(JSON.stringify({ punkte: [...new Set(pruefen)].map((id) => ({ id, urteil: "fehlt", beleg: "Modell-Double", kunde: "Das war ein Testlauf ohne KI, darum ist dieser Punkt nicht geprüft." })), nachbessern: "" }));
  };
}
