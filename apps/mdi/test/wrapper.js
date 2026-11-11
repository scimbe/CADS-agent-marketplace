// Abspielen der vom echten Wrapper aufgenommenen Antworten (test/fixtures/wrapper-konto.json, scripts/record-wrapper.mjs).
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createApi } from "../src/broker/api.js";

export const REC = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/wrapper-konto.json"), "utf8"));
export function ex(name) { const e = REC.exchanges.find((x) => x.name === name); if (!e) throw new Error("Aufnahme fehlt: " + name); return e; }
const response = (res) => ({ status: res.status, json: async () => { if (res.body === undefined) throw new Error("kein JSON"); return JSON.parse(JSON.stringify(res.body)); } });

/** fetch, das genau diese Aufnahmen der Reihe nach liefert und prueft, dass die Anfrage zur Aufnahme passt. */
export function replay(...args) {
  const opt = typeof args[args.length - 1] === "object" ? args.pop() : {};
  const q = args.map(ex), seen = [];
  const f = async (url, init) => {
    const e = q.shift();
    assert.ok(e, "unerwartete Anfrage " + url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    seen.push({ url, method: init.method, body });
    assert.equal(init.method, e.req.method, e.name);
    assert.equal(url.split("?")[0], e.req.path.split("?")[0], e.name + ": Pfad");
    assert.equal(init.credentials, "same-origin", e.name);
    if (!opt.loose && e.req.body !== undefined && body !== undefined) assert.deepEqual(Object.keys(body).sort(), Object.keys(e.req.body).sort(), e.name + ": Felder wie beim echten Server");
    return response(e.res);
  };
  f.left = () => q.length; f.seen = seen;
  return f;
}
export const HERE = { protocol: "https:", host: REC.host };
export function apiFor(...args) { const f = replay(...args); return { api: createApi({ fetch: f, location: HERE }), f }; }
/** API, die jede Methode mit der Aufnahme beantwortet, deren Name die Funktion liefert (fuer die Laufzeit-Tests). */
export function scriptedApi(script) {
  const api = createApi({ location: HERE, fetch: async (url, init) => {
    const name = script(url.split("?")[0], init.body ? JSON.parse(init.body) : undefined);
    return response(ex(name).res);
  } });
  return api;
}
