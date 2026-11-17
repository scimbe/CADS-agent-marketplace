// Freie Karte 2: "Probe spielen" laedt nur vom Spiel-Ursprung und nur, was zum Hash des Server-Stands passt.
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, createHash } from "node:crypto";
import { createSpielModul, SPIEL_ORIGIN } from "../src/broker/spiel-modul.js";

test("Spielmodul: Ursprung, Pfad und sha256 werden geprueft; Netzfehler ehrlich", async () => {
  const code = "export default { title: \"t\" };\n", sha = createHash("sha256").update(code).digest("hex");
  const seen = [];
  const fetch = async (u, i) => { seen.push([u, i]); return { ok: true, text: async () => (u.includes("falsch") ? "anders" : code) }; };
  const m = createSpielModul({ win: { fetch }, subtle: webcrypto.subtle });
  assert.equal(SPIEL_ORIGIN, "https://spiel-f29c55da.bunsenbrenner.org");
  assert.deepEqual(await m.laden(SPIEL_ORIGIN + "/m/" + sha + ".js", sha), { how: "ok", code });
  assert.equal(seen[0][1].credentials, "omit"); assert.equal(seen[0][1].mode, "cors");
  assert.deepEqual(await m.laden("https://boese.example/m/" + sha + ".js", sha), { how: "ursprung" });
  assert.deepEqual(await m.laden(SPIEL_ORIGIN + "/m/" + "a".repeat(64) + ".js", sha), { how: "ursprung" }, "Pfad und Hash gehoeren zusammen");
  const falsch = createSpielModul({ win: { fetch: async () => ({ ok: true, text: async () => "anders" }) }, subtle: webcrypto.subtle });
  assert.deepEqual(await falsch.laden(SPIEL_ORIGIN + "/m/" + sha + ".js", sha), { how: "hash" });
  assert.deepEqual(await createSpielModul({ win: { fetch: async () => { throw new Error("offline"); } }, subtle: webcrypto.subtle }).laden(SPIEL_ORIGIN + "/m/" + sha + ".js", sha), { how: "netz" });
  assert.deepEqual(await createSpielModul({ win: { fetch: async () => ({ ok: false }) }, subtle: webcrypto.subtle }).laden(SPIEL_ORIGIN + "/m/" + sha + ".js", sha), { how: "netz" });
  assert.deepEqual(await createSpielModul({ win: { fetch }, subtle: null }).laden(SPIEL_ORIGIN + "/m/" + sha + ".js", sha), { how: "nicht-hier" });
});
