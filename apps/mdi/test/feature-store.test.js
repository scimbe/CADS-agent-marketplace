// Feature-Speicher (store/persist): Satz und Auswahl der freien Karte ueberleben den Umweg ueber das Anmelde-Gate
// (?go=erschaffen), aber nur kurz (BACK_MS); "zuletzt gewaehlt" bleibt als Vorschlag. Befund K / Auftrag des Integrators.
import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime } from "../src/app/runtime.js";
import { BACK_MS } from "../src/features/frei/chart.js";

function boot(store, t) {
  const nav = [];
  const storage = { loadKonto: () => null, saveKonto: () => true, loadFeature: (id) => (store.has(id) ? JSON.parse(store.get(id)) : null), saveFeature: (id, v) => { store.set(id, JSON.stringify(v)); return true; } };
  const rt = createRuntime({ lang: "de", entropy: () => "e", schedule: (f) => f(), onChange: () => {}, storage, now: () => t,
    navigate: (u) => { nav.push(u); return true; }, api: { loginHref: (r) => "/gate?r=" + r, status: async () => ({ ok: true, canLogin: true, account: false }), me: async () => ({ ok: false }) } });
  return { rt, nav };
}

test("Satz und Art der freien Karte ueberleben das Anmelde-Gate; nach BACK_MS nicht mehr; 'zuletzt' bleibt Vorschlag", async () => {
  const store = new Map(), t0 = 1_800_000_000_000;
  const a = boot(store, t0);
  a.rt.dispatch({ type: "FREI" }); await new Promise((r) => setTimeout(r, 10));
  a.rt.dispatch({ type: "TEXT", value: "Gedicht fuer Oma zum 80." });
  a.rt.dispatch({ type: "AGE16", on: true });
  a.rt.dispatch({ type: "LOGIN" });
  assert.equal(a.nav.length, 1, "zum Gate");
  assert.equal(JSON.parse(store.get("frei")).back.text, "Gedicht fuer Oma zum 80.", "vor dem Gate gesichert");
  // Rueckkehr (?go=erschaffen startet die App neu und sendet FREI)
  const b = boot(store, t0 + 5 * 60 * 1000);
  b.rt.dispatch({ type: "FREI" }); await new Promise((r) => setTimeout(r, 10));   // main.js: ?go=erschaffen -> FREI
  assert.ok(b.rt.matches("inhalt.frei.start"));
  assert.equal(b.rt.state.ctx.frei.text, "Gedicht fuer Oma zum 80.", "nach FREI noch da (clearForm loescht ihn nicht)");
  b.rt.dispatch({ type: "BACK" }); b.rt.dispatch({ type: "FREI" }); await new Promise((r) => setTimeout(r, 10));
  assert.equal(b.rt.state.ctx.frei.text, "", "einmal verbraucht");
  // FREI { text } (Startseiten-Block, K #287) nach der Rueckkehr: der Satz im Ereignis gewinnt, back ist verbraucht
  const d = boot(store, t0 + 6 * 60 * 1000);
  d.rt.dispatch({ type: "FREI", text: "Neuer Satz vom Startblock" }); await new Promise((r) => setTimeout(r, 10));
  assert.equal(d.rt.state.ctx.frei.text, "Neuer Satz vom Startblock");
  assert.equal(d.rt.state.ctx.frei.back, null);
  // spaeter (abgelaufen): kein alter Satz im Feld
  const c = boot(store, t0 + BACK_MS + 1);
  assert.equal(c.rt.state.ctx.frei.back, null);
  // Uhr rueckwaerts: auch nichts
  assert.equal(boot(store, t0 - 1).rt.state.ctx.frei.back, null);
});
