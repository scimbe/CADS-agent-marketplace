// Ton-Modul fuer den Host: Quellen, Slots nur im Speicher, Aufnahme mit Rueckfall auf die Spassstimme, einmal abspielen, Pusten.
import test from "node:test";
import assert from "node:assert/strict";
import { createHostAudio } from "../src/engines/klang/host-audio.js";
import * as Studio from "../src/engines/klang/studio.js";
import * as Rap from "../src/engines/klang/rapbeat.js";

function fakeAc(level = 0) {
  const started = [];
  const a = {
    sampleRate: 44100, destination: {}, started,
    createBuffer: (n, len, sr) => { const ch = Array.from({ length: n }, () => new Float32Array(len)); return { n, len, sr, getChannelData: (i) => ch[i] }; },
    createBufferSource: () => { const s = { connect() {}, start() { started.push(s); }, stop() { s.stopped = true; } }; return s; },
    createMediaStreamSource: () => ({ connect(sp) { if (sp && sp.feed) sp.feed(); }, disconnect() {} }),
    createScriptProcessor: () => { const sp = { connect() {}, disconnect() {}, feed() { for (let k = 0; k < 3; k++) sp.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) } }); } }; return sp; },
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createAnalyser: () => ({ fftSize: 32, getByteTimeDomainData: (b) => b.fill(128 + level) })
  };
  return a;
}
const stream = () => ({ getTracks: () => [{ stop() {} }] });
const sync = (f, ms) => { if (ms < 20000) f(); return 1; }; // der 20-s-Waechter bleibt aus

test("Quellen: Beat (Schleife, mono 22050), eigene Stimme mit Effekt, ohne Aufnahme Spassstimme nur mit fallback", () => {
  const a = fakeAc(), H = createHostAudio({ audioContext: () => a });
  assert.equal(H.play({ kind: "beat", p: { k: "x---x---x---x---", s: "----x-------x---", h: "x-x-x-x-x-x-x-x-", b: "----------------" }, bpm: 100, loops: 1 }), true);
  assert.equal(a.started[0].loop, true); assert.equal(a.started[0].buffer.sr, Studio.SR);
  assert.equal(H.play({ kind: "local", slot: "voice", fx: "robot" }), false, "kein Slot, kein Rueckfall");
  assert.equal(H.play({ kind: "local", slot: "voice", fx: "robot", fallback: "dummy" }), true);
  assert.equal(a.started[0].stopped, true, "eine Quelle zur Zeit");
  assert.equal(H.peaks({ kind: "beat", p: { k: "x---------------", s: "----------------", h: "----------------", b: "----------------" }, bpm: 120, loops: 1 }).length, 40);
  assert.equal(createHostAudio({ audioContext: () => null }).play({ kind: "beat", p: { k: "x---------------", s: "----------------", h: "----------------", b: "----------------" }, bpm: 120 }), false, "ohne Ton ehrlich false");
});
test("Aufnahme: Samples im Slot (heruntergetastet auf 22050), einmal abspielen leert den Slot; ohne Mikrofon Spassstimme", async () => {
  const a = fakeAc(), H = createHostAudio({ audioContext: () => a, getUserMedia: async () => stream(), setTimeout: sync, clearTimeout: () => {} });
  const r = await H.record("maus", 4000);
  assert.equal(r.mic, true); assert.equal(H.slots.has("maus"), true);
  assert.equal(Math.round(r.sec * Studio.SR), Math.floor(3 * 4096 / 2), "44,1 kHz -> 22,05 kHz");
  const end = () => a.started.at(-1).onended();
  let r1 = H.playReversed("maus"); end(); assert.equal(await r1, true);
  r1 = H.playFx("maus", "robot"); end(); assert.equal(await r1, true); assert.equal(H.slots.has("maus"), true, "whose: Slot bleibt");
  r1 = H.playOnce("maus", "chip"); assert.equal(H.slots.has("maus"), false, "once: sofort geleert"); end(); assert.equal(await r1, true);
  assert.equal(await H.playOnce("maus", "chip"), false, "zweites Mal: weg");
  const N = createHostAudio({ audioContext: () => a, setTimeout: sync, clearTimeout: () => {} });
  const d = await N.record("x", 2500); assert.equal(d.mic, false); assert.equal(d.sec, Studio.dummyVoice().length / Studio.SR);
});
test("Strassenrap: Schleife Hook, Aufnahme-Modus einmal mit Einzaehlen; WAV gueltig; Musik bis zur Pause; Pusten zaehlt", async () => {
  let loads = 0;
  const a = fakeAc(40), H = createHostAudio({ part: async (name) => { assert.equal(name, "klang-rap"); loads++; return Rap; }, audioContext: () => a, getUserMedia: async () => stream(), setTimeout: (f) => { f(); return 1; }, clearTimeout: () => {}, now: (() => { let t = 0; return () => (t += 500); })(), raf: () => 0 });
  assert.equal(await H.play({ kind: "rapbeat", v: [0, 90, 9, 0, 1234], loop: "hook" }), true); assert.equal(a.started.at(-1).loop, true);
  assert.equal(await H.play({ kind: "rapbeat", v: [0, 90, 9, 0, 1234], loop: "hook" }), true); assert.equal(loads, 1, "Teil klang-rap nur einmal geladen");
  const w = H.wav({ kind: "beat", p: { k: "x---------------", s: "----------------", h: "----------------", b: "----------------" }, bpm: 120, loops: 1 });
  assert.equal(String.fromCharCode(...w.slice(0, 4)), "RIFF");
  await H.playUntil({ k: "x---x---x---x---", s: "----------------", h: "----------------", b: "----------------" }, 5);
  assert.equal(a.started.at(-1).stopped, true, "Musik aus zur Pause");
  let blows = 0; const stopBlow = await H.listenBlow(() => blows++); stopBlow(); assert.equal(blows, 1);
});

test("Strassenrap ohne Teil: ehrlicher Fehler mit code, kein Ersatzklang; Ladefehler des Teils wird durchgereicht", async () => {
  const a = fakeAc(), none = createHostAudio({ audioContext: () => a });
  await assert.rejects(none.play({ kind: "rapbeat", v: [0, 90, 9, 0, 1], loop: "hook" }), (e) => e.code === "teil-fehlt");
  assert.equal(a.started.length, 0, "kein Ton");
  const bad = createHostAudio({ audioContext: () => a, part: async () => { const e = new Error("SRI"); e.code = "teil-manipuliert"; throw e; } });
  await assert.rejects(bad.wav({ kind: "rapbeat", v: [0, 90, 9, 0, 1] }), (e) => e.code === "teil-manipuliert");
});
