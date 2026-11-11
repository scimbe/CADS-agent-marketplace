// Testhilfen: deterministischer "Zufall" und eine Laufzeit ohne DOM/Netz.
import { createRuntime } from "../src/app/runtime.js";

export function counter(prefix = "") {
  let i = 0;
  return () => { i++; return (prefix + i.toString(16)).padStart(32, "0").slice(-32); };
}
export function memStorage() {
  const m = new Map();
  return { saveGame: (e) => m.set(e.g, e), loadGame: (g) => m.get(g) || null, dump: () => [...m.values()] };
}
/** Laufzeit mit synchronem Planer (Warteschlange), Fake-Teilen (merkt sich das Fragment). */
export function testRuntime({ lang = "de", entropy = counter(), storage = memStorage(), live, async = false } = {}) {
  const q = [];
  const shared = [];
  const rt = createRuntime({
    lang, entropy, storage,
    live: live || (() => Promise.reject(new Error("kein live"))),
    share: (f) => { shared.push(f); return Promise.resolve("copied"); },
    clearUrl: () => {},
    schedule: async ? (f) => setTimeout(f, 0) : (f) => q.push(f),
    onChange: () => {}
  });
  rt.flush = () => { for (let n = 0; q.length && n < 10000; n++) q.shift()(); };
  rt.shared = shared;
  rt.storage = storage;
  return rt;
}
export const tick = () => new Promise((r) => setTimeout(r, 0));

/** Zwei Laufzeiten ueber einen falschen Live-Kanal (gleiche Broker-Schnittstelle wie src/broker/live.js). */
export function fakeLiveNet() {
  const rooms = new Map(), wire = [];
  let n = 0;
  const later = (f) => setTimeout(f, 0);
  function endpoint(room, side, cb) {
    return {
      send: (o) => { const s = JSON.stringify(o); wire.push(s); later(() => { const other = room[side === "a" ? "b" : "a"]; if (other && !room.closed) other.cb.onMessage(JSON.parse(s)); }); },
      close: () => { if (room.closed) return; room.closed = true; later(() => { const other = room[side === "a" ? "b" : "a"]; if (other) other.cb.onDown(); }); }
    };
  }
  const api = {
    invite(cb) {
      const token = ("T" + (++n)).padEnd(22, "x"), room = { a: { cb } };
      rooms.set(token, room);
      later(() => { cb.onStep("open"); cb.onToken(token); });
      return endpoint(room, "a", cb);
    },
    accept(token, cb) {
      const room = rooms.get(token);
      if (!room || room.b) { later(() => cb.onFail("gone")); return { send() {}, close() {} }; }
      room.b = { cb };
      later(() => { room.a.cb.onStep("found"); cb.onStep("found"); room.a.cb.onUp(); cb.onUp(); });
      return endpoint(room, "b", cb);
    }
  };
  return { loader: () => Promise.resolve(api), wire };
}
export async function until(f, ms = 4000) {
  const t0 = Date.now();
  while (!f()) { if (Date.now() - t0 > ms) throw new Error("until: Zeit"); await new Promise((r) => setTimeout(r, 1)); }
}
