// Game kit (G3) end to end on the staging server (host.sh kit-check, runs in the wrapper image on the host network):
// a quiz wish -> kit call -> bot playtests -> fact check (wrapper default "aktiv"; the model double marks question 0
// "falsch") -> one repair round -> the question is removed -> notes bau:fakten-entfernt:1 and bau:fakten-unkalibriert.
// Logged in through the gate double (test cookie), with the server's real device proof (16 bits). The app has no G3 entry
// yet (features/frei/doc.js GENRES = G1, G2), hence the API. Prints one JSON line and PASS/FAIL; exit code 1 on FAIL.
import { deviceProofOk } from "/app/lib/duell-pots.mjs";
import { randomBytes } from "node:crypto";

const B = process.env.B || "http://127.0.0.1:18794";
const H = { "content-type": "application/json", cookie: "ct_gate_session=staging-lea" };
const device = randomBytes(16).toString("hex");
let proof = "", n = 0;
while (!deviceProofOk(device, proof, 16)) proof = (n++).toString(36);

const post = (p, body) => fetch(B + p, { method: "POST", headers: H, body: JSON.stringify(body) });
let r = await post("/api/duell/ai", { kind: "karte", input: { text: "Weltraum-Quiz mit vier Fragen", art: "game", genre: "G3" }, device, proof, lang: "de", queue: "ticket" });
let j = await r.json();
for (let i = 0; i < 180 && r.status === 202 && j.ticket; i++) {
  await new Promise((ok) => setTimeout(ok, 1000));
  r = await post("/api/duell/queue", { ticket: j.ticket }); j = await r.json();
}
const o = (j.options || [])[0] || {}, d = o.doc || {};
const fragen = d.b ? (JSON.stringify(d.b).match(/"q":/g) || []).length : null;
const note = Array.isArray(j.note) ? j.note : [];
console.log(JSON.stringify({ status: r.status, k: d.k || null, art: o.art || null, fragen, note, reason: j.reason || null, error: j.error || null }));
const ok = r.status === 200 && d.k === "bau" && note.includes("bau:fakten-entfernt:1") && note.includes("bau:fakten-unkalibriert") && fragen === 3;
console.log(ok ? "PASS Baukasten (G3) mit Faktenpruefung aktiv: 1 Frage entfernt, 3 bleiben, Hinweis unkalibriert" : "FAIL Baukasten-Pfad");
process.exit(ok ? 0 : 1);
