// Vertrag Seite <-> Wrapper (Befund Integrator: die neue App rief POST /api/duell/weather, der Wrapper bedient nur
// /api/duell/ai/weather; Staging: anonym 401, angemeldet 404). Jeder Aufruf aus src/broker/api.js muss in
// test/fixtures/wrapper-routes.json stehen; mit MDI_WRAPPER=<Wrapper-Checkout> wird der Wrapper live geprueft.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createApi } from "../src/broker/api.js";

const FIX = JSON.parse(fs.readFileSync(new URL("./fixtures/wrapper-routes.json", import.meta.url), "utf8"));
const KNOWN = new Set(FIX.routes.map((r) => r.call));
function rig(status = 200, body = {}) {
  const calls = [];
  const fetch = async (url, o) => { const u = new URL(url, "https://x.test"); calls.push((o.method || "GET") + " " + u.pathname.replace(/^\/api\/s\/[^/]+$/, "/api/s/<id>")); return { status, headers: { get: () => "application/json" }, json: async () => body, text: async () => JSON.stringify(body) }; };
  return { calls, api: createApi({ location: { protocol: "https:", host: "x.test", origin: "https://x.test" }, fetch }) };
}

test("Jeder Server-Aufruf der Seite ist eine Route des Wrappers (Fixture)", async () => {
  const { calls, api } = rig();
  await api.status("d"); await api.me("/duell", "de"); await api.profileGet({ via: "account" }); await api.profilePut({ via: "account" }, { rev: 0, profile: { me: {} } });
  await api.profileDelete({ via: "account" }); await api.redeem("ABC"); await api.modMe(); await api.appeal("n1", "x");
  await api.shortCreate("#v2.card.x", "k", "de"); await api.shortResolve("abcdefgh"); await api.shortDelete("abcdefgh", "t".repeat(20));
  await api.weather("Hamburg", "2026-12-03");
  assert.ok(calls.length >= 12, calls.join(", "));
  for (const c of calls) assert.ok(KNOWN.has(c), "nicht im Wrapper-Vertrag: " + c);
  assert.ok(calls.includes("POST /api/duell/ai/weather"), "Wetter ueber /api/duell/ai/weather wie die alte App");
  assert.ok(!calls.includes("POST /api/duell/weather"));
});

test("Wetter: Antworten des Wrappers (lib/duell-weather.mjs) werden ehrlich abgebildet, 401 = Anmeldung noetig", async () => {
  const ok = await rig(200, { place: "Hamburg", date: "2026-12-03", hi: 4, lo: -1, rain: 60, code: 61, source: "Open-Meteo" }).api.weather("Hamburg", "2026-12-03");
  assert.equal(ok.ok, true); assert.equal(ok.body.place, "Hamburg");
  for (const [st, body, want] of [[401, { error: "login" }, "login"], [404, { error: "no-place" }, "no-place"], [422, { error: "blocked" }, "blocked"], [422, { error: "date-range" }, "date-range"], [429, { error: "rate-limited" }, "limit"], [503, { error: "weather-unavailable" }, "aus"]]) {
    const r = await rig(st, body).api.weather("x", "2026-12-03");
    assert.equal(r.ok, false); assert.equal(r.error, want, st + " " + JSON.stringify(body));
  }
});

if (process.env.MDI_WRAPPER) test("Wrapper live (MDI_WRAPPER): jede Route steht in ihrer Datei", () => {
  for (const r of FIX.routes) assert.ok(fs.readFileSync(path.join(process.env.MDI_WRAPPER, r.file), "utf8").includes(r.needle), r.call + " -> " + r.file);
});
