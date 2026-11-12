// Klang und Haptik zu Echtzeit-Ereignissen (ADR 0001 b): manifest.rt.sounds[ev.k] = tone | noise | asset | haptic.
// WebAudio erst bei Bedarf (nach einer Nutzergeste), Stummschalter von aussen. Keine Klaenge ohne Ereignis.
// Port der Synthese aus dem Altcode (kit.js tone(), arcade-ui.js noise()).
// Review L5: hoechstens MAX_VOICES gleichzeitige Klaenge, je Ereignisart hoechstens einer je MIN_GAP Sekunden,
// Rauschpuffer werden je (Dauer, Rate) einmal erzeugt und wiederverwendet.
export const MAX_VOICES = 8, MIN_GAP = 0.03;
export function createSound({ audioContext, vibrate = null, muted = () => false, assets = null } = {}) {
  let ac = null, voices = 0;
  const last = new Map(), noiseCache = new Map();
  const voice = (node, dur) => { voices++; node.onended = () => { voices = Math.max(0, voices - 1); }; void dur; };
  function ctx() {
    if (!audioContext) return null;
    if (!ac) { try { ac = audioContext(); } catch (e) { return null; } }
    if (ac.state === "suspended" && ac.resume) ac.resume().catch(() => {});
    return ac;
  }
  function tone(s, v) {
    const a = ctx(); if (!a) return false;
    const k = Number.isFinite(v) && v > 0 ? Math.min(2, Math.max(0.5, v / 10)) : 1;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime, dur = s.dur || 0.1;
    o.type = s.type || "sine"; o.frequency.setValueAtTime((s.f0 || 440) * k, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, (s.f1 || s.f0 || 440) * k), t + dur);
    g.gain.setValueAtTime(s.vol === undefined ? 0.2 : s.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02); voice(o, dur);
    return true;
  }
  function noise(s) {
    const a = ctx(); if (!a) return false;
    const dur = s.dur || 0.2, key = dur + "|" + a.sampleRate;
    let buf = noiseCache.get(key);
    if (!buf) {
      const n = Math.max(1, Math.floor(a.sampleRate * dur)); buf = a.createBuffer(1, n, a.sampleRate); const d = buf.getChannelData(0);
      let x = 12345; // Rauschen fuer die Klangebene, nicht fuer die Spiellogik
      for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; const e = 1 - i / n; d[i] = ((x / 0x3fffffff) - 1) * e * e; }
      noiseCache.set(key, buf);
    }
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = "lowpass"; f.frequency.value = s.freq || 1000; g.gain.value = s.vol === undefined ? 0.3 : s.vol;
    src.connect(f).connect(g).connect(a.destination); src.start(); voice(src, dur);
    return true;
  }
  /** @returns {string[]} gespielte Ereignisse (fuer Tests) */
  function play(events, sounds) {
    const done = [];
    if (muted()) return done;
    ctx(); // Zeitbasis fuer die Ratengrenze
    for (const ev of events) {
      const s = sounds && sounds[ev.k]; if (!s) continue;
      const t = ac ? ac.currentTime : null;
      if (t !== null && last.has(ev.k) && t - last.get(ev.k) < MIN_GAP) continue;
      if ((s.synth || s.asset) && voices >= MAX_VOICES) continue;
      if (t !== null) last.set(ev.k, t);
      if (s.haptic && vibrate) { vibrate(s.haptic); done.push(ev.k + ":haptic"); }
      if (s.synth === "tone" && tone(s, ev.v)) done.push(ev.k + ":tone");
      else if (s.synth === "noise" && noise(s)) done.push(ev.k + ":noise");
      else if (s.asset && assets && assets.play(s.asset)) done.push(ev.k + ":asset");
    }
    return done;
  }
  return { play };
}
