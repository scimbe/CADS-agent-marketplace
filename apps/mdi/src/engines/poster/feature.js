// Feature von Strang P fuer src/app/features.js (ADR 0001 g): Geraetedienste fuer Renderer und Widgets.
// high: die hohen Ops der Poster-Engine (Text, Raster, Welle, Sticker, Foto, KI-Bild) fuer canvas ops2d.
// audio: Ton fuer audio/record/once/parrot/freeze/blow (host-audio.js); Aufnahmen bleiben im Speicher des Tabs.
import { HIGH } from "./paint.js";
import { createHostAudio } from "../klang/host-audio.js";

export const posterFeature = {
  id: "poster",
  env: {
    high: HIGH,
    audio: (win) => { let ctx = null; return createHostAudio({
      audioContext: () => { const AC = win.AudioContext || win.webkitAudioContext; return AC ? ctx || (ctx = new AC()) : null; }, // ein Kontext je Fenster, erst nach Bedarf
      getUserMedia: win.navigator && win.navigator.mediaDevices && win.navigator.mediaDevices.getUserMedia ? (c) => win.navigator.mediaDevices.getUserMedia(c) : null,
      setTimeout: (f, ms) => win.setTimeout(f, ms), clearTimeout: (t) => win.clearTimeout(t), now: () => win.Date.now(), raf: (f) => win.requestAnimationFrame(f)
    }); }
  }
};
