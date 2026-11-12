// Ton fuer den Host (Strang F haengt das in main.js ein): eine reine Fabrik ohne Globals. Aufnahmen bleiben nur im Speicher
// dieses Tabs (Slots), werden nach Gebrauch ueberschrieben und gehen nie ins Netz, in einen Link oder einen Speicher.
// Portiert aus alt:src/turn-ui.js:17-41 (listen, VOICE, wipe), :248-275 (rec, once, parrot), :309-320 (freeze), :379-392
// (blow), alt:src/kit.js:103 (playPcm), alt:src/klang-ui.js:72 (Dekodieren auf Studio.SR) und PR #227 rapbeat-ui.js (Schleifen,
// Aufnahme-Modus, WAV). Quellen (src) wie in den Anzeigelisten der Karten:
//   {kind:"beat", p:{k,s,h,b}, bpm, loops}          Drumcomputer (studio.js renderBeat, mono 22050 Hz)
//   {kind:"local", slot, fx?, tp?, fallback?:"dummy"} eigene Aufnahme mit Effekt/Tempo (klang.js apply)
//   {kind:"rapbeat", v:[5], loop:"hook"|"verse"|"song", rec:boolean}  Strassenrap-Beat (rapbeat.js render, stereo 44,1 kHz)
import * as Studio from "./studio.js";
import * as Klang from "./klang.js";
import * as Rap from "./rapbeat.js";
import { SONG } from "./rapbeat-rule.js";

/**
 * @param {{audioContext:()=>AudioContext|null, getUserMedia?:(c:object)=>Promise<MediaStream>, setTimeout?:Function,
 *          clearTimeout?:Function, now?:()=>number, raf?:(f:Function)=>number}} deps
 */
export function createHostAudio(deps) {
  const ac = () => deps.audioContext(), later = deps.setTimeout || setTimeout, cancel = deps.clearTimeout || clearTimeout;
  const now = deps.now || (() => Date.now()), raf = deps.raf || ((f) => later(f, 16));
  const slots = new Map(), cache = { key: "", res: null };
  let cur = null;

  function stop() { if (cur) { try { cur.onended = null; cur.stop(); } catch (e) { /* schon zu Ende */ } cur = null; } }
  /** Mono- oder Stereo-PCM abspielen (alt Kit.playPcm); gibt die Quelle zurueck oder null ohne Ton. */
  function playPcm(chans, sr, loop, done) {
    const a = ac(); if (!a) return null;
    stop();
    const b = a.createBuffer(chans.length, chans[0].length, sr);
    chans.forEach((c, i) => b.getChannelData(i).set(c));
    const s = a.createBufferSource(); s.buffer = b; s.loop = !!loop; s.connect(a.destination);
    s.onended = () => { if (cur === s) { cur = null; if (done) done(); } };
    s.start(); cur = s;
    return s;
  }
  function wipe(slot) { const x = slots.get(slot); if (x) x.fill(0); slots.delete(slot); }
  function rapOpt(src) {
    if (src.rec) return { from: 0, bars: SONG.length, countIn: true };
    const o = Rap.loop(src.loop || "hook"); if (src.loop !== "song") o.wrap = true;
    return o;
  }
  /** Quelle -> { chans, sr, loop } (Rap-Ergebnis zwischengespeichert, wie #227) */
  function render(src) {
    if (!src || typeof src !== "object") throw new Error("audio: Quelle");
    if (src.kind === "beat") return { chans: [Studio.renderBeat(src.p, src.bpm, src.loops || 2)], sr: Studio.SR, loop: true };
    if (src.kind === "local") {
      const raw = slots.get(src.slot) || (src.fallback === "dummy" ? Studio.dummyVoice() : null);
      if (!raw) return null;
      return { chans: [Klang.apply(raw, { fx: src.fx, tp: src.tp || undefined })], sr: Klang.SR, loop: false };
    }
    if (src.kind === "rapbeat") {
      const o = rapOpt(src), key = JSON.stringify([src.v, o]);
      if (cache.key !== key) { const r = Rap.render(src.v, o); cache.key = key; cache.res = { chans: [r.L, r.R], sr: r.sr, loop: !src.rec }; }
      return cache.res;
    }
    throw new Error("audio: Quelle " + src.kind);
  }
  /** Mikrofon direkt aus dem Audiograph in den Speicher (alt listen): kein File, kein Codec. Ohne Mikrofon oder ohne Antwort
   *  in 20 s die Spassstimme (der Ablauf friert nicht ein). Ergebnis: Mono auf Studio.SR, hoechstens ms Millisekunden. */
  function listen(ms) {
    return new Promise((done) => {
      let over = false;
      const fake = () => { if (over) return; over = true; done({ pcm: Studio.dummyVoice(), mic: false }); };
      const wait = later(fake, 20000), a = ac();
      if (!deps.getUserMedia || !a || !a.createScriptProcessor) { cancel(wait); fake(); return; }
      deps.getUserMedia({ audio: true }).then((st) => {
        cancel(wait); if (over) { st.getTracks().forEach((x) => x.stop()); return; }
        const src = a.createMediaStreamSource(st), sp = a.createScriptProcessor(4096, 1, 1), mute = a.createGain(), got = [];
        let n = 0;
        mute.gain.value = 0;
        sp.onaudioprocess = (e) => { const c = e.inputBuffer.getChannelData(0); got.push(Float32Array.from(c)); n += c.length; };
        src.connect(sp); sp.connect(mute); mute.connect(a.destination);
        later(() => {
          sp.disconnect(); src.disconnect(); mute.disconnect(); st.getTracks().forEach((x) => x.stop());
          const k = a.sampleRate / Studio.SR, o = new Float32Array(Math.floor(n / k)), all = new Float32Array(n);
          let at = 0;
          got.forEach((c) => { all.set(c, at); at += c.length; c.fill(0); }); got.length = 0;
          for (let i = 0; i < o.length; i++) o[i] = all[Math.floor(i * k)];
          all.fill(0); over = true; done(o.length ? { pcm: o, mic: true } : { pcm: Studio.dummyVoice(), mic: false });
        }, ms);
      }).catch(fake);
    });
  }

  return {
    slots: { has: (k) => slots.has(k), wipe },
    stop,
    playing: () => !!cur,
    /** Abspielen einer Quelle; done nach dem Ende (nicht bei Schleifen). false ohne Ton. */
    play(src, done) { const r = render(src); return r ? !!playPcm(r.chans, r.sr, r.loop, done) : false; },
    /** 40 Spitzen fuer die Welle im Bild (alt beatPeaks; compile.js op wave) */
    peaks(src) { const r = render(src); return r ? Studio.peaks(r.chans[0], 40) : null; },
    /** WAV-Bytes einer Quelle (#227: ganzer Song; Stimme: 22050 Hz mono) */
    wav(src) {
      if (src.kind === "rapbeat") { const r = Rap.render(src.v, { from: 0, bars: SONG.length, countIn: !!src.rec }); return Rap.wav(r.L, r.R, r.sr); }
      const r = render(src); return r ? Studio.wav(r.chans[0], r.sr) : null;
    },
    /** Aufnahme in einen Slot (alt rec): erst nach Tippen aufrufen. */
    async record(slot, ms) { stop(); const r = await listen(Math.min(ms, Klang.MAX_SEC * 1000)); slots.set(slot, r.pcm); return { mic: r.mic, sec: r.pcm.length / Studio.SR }; },
    /** Einmal abspielen, dann ist der Slot leer (alt once, Effekte aus studio.js warp). Promise<bool>: true am Ende der
     *  Wiedergabe, false ohne Aufnahme (Fs Widget zeigt dann „Die Aufnahme ist nicht mehr da.“). */
    playOnce(slot, fx) {
      const x = slots.get(slot); if (!x) return Promise.resolve(false);
      const o = Studio.warp(x, fx); wipe(slot);
      return new Promise((ok) => { if (!playPcm([o], Studio.SR, false, () => { o.fill(0); ok(true); })) { o.fill(0); ok(true); } });
    },
    /** Mit Effekt abspielen, Slot bleibt (alt whose: beliebig oft). Promise<bool> am Ende. */
    playFx(slot, fx) {
      const x = slots.get(slot); if (!x) return Promise.resolve(false);
      const o = Studio.warp(x, fx);
      return new Promise((ok) => { if (!playPcm([o], Studio.SR, false, () => ok(true))) ok(true); });
    },
    /** Rueckwaerts abspielen (alt parrot). Promise<bool> am Ende. */
    playReversed(slot) {
      const x = slots.get(slot); if (!x) return Promise.resolve(false);
      return new Promise((ok) => { if (!playPcm([Float32Array.from(x).reverse()], Studio.SR, false, () => ok(true))) ok(true); });
    },
    /** Musik bis zur Pause (alt freeze): Beat mit 124 BPM, 8 Takte, Schleife; nach s Sekunden Stopp. Promise, aufgeloest beim
     *  Stopp; .stop() beendet vorher. */
    playUntil(beat, s) {
      const pcm = Studio.renderBeat(beat, 124, 8); playPcm([pcm], Studio.SR, true);
      let t = null, fin = null;
      const p = new Promise((ok) => { fin = ok; t = later(() => { stop(); ok(); }, s * 1000); });
      p.stop = () => { cancel(t); stop(); fin(); };
      return p;
    },
    /** Pusten erkennen (alt blow): Pegel ueber 28 (8 Bit, RMS), hoechstens alle 450 ms ein Treffer. Rueckgabe: stop() */
    async listenBlow(cb) {
      if (!deps.getUserMedia) throw new Error("kein Mikrofon");
      const st = await deps.getUserMedia({ audio: true }), a = ac(), an = a.createAnalyser(), buf = new Uint8Array(an.fftSize);
      let on = true, last = 0;
      a.createMediaStreamSource(st).connect(an);
      (function loop() {
        if (!on) return;
        an.getByteTimeDomainData(buf); let s = 0; buf.forEach((x) => { s += (x - 128) * (x - 128); });
        if (Math.sqrt(s / buf.length) > 28 && now() - last > 450) { last = now(); cb(); }
        raf(loop);
      })();
      return () => { on = false; st.getTracks().forEach((x) => x.stop()); };
    }
  };
}
