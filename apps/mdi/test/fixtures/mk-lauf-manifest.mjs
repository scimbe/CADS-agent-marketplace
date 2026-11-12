// Erzeugt src/cards/lauf/manifest.json aus den Engine-Daten (eine Quelle): node test/fixtures/mk-lauf-manifest.mjs "$PWD" > src/cards/lauf/manifest.json
// test/manifest-frisch.test.js prueft, dass die eingecheckte Datei aktuell ist.
const root = process.argv[2];
const L = await import(root + "/src/engines/lauf/params.js");
const P = await import(root + "/src/engines/flug/params.js");
const T = (await import(root + "/src/engines/lauf/texts.json", { with: { type: "json" } })).default;
const Lb = (de, en) => ({ de, en });
const def = L.paramsOfLauf(L.build({ mode: "endlos", world: "bruecke", level: "normal", figure: "🦊", obstacle: "📦", coin: "🪙", foe: "🐦", has: ["luecken", "hindernisse", "muenzen"], foes: ["geh"] }, 4242), { t: "Brückenlauf" });
const props = {
  m: { type: "string", enum: L.MODES, default: def.m, "x-field": "choice", "x-label": Lb("Modus", "Mode"), "x-names": { de: L.MODES.map((m) => T.de["lf_m_" + m]), en: L.MODES.map((m) => T.en["lf_m_" + m]) } },
  seed: { type: "integer", minimum: 0, maximum: 4294967295, default: def.seed, "x-field": "number", "x-label": Lb(T.de.lf_seed, T.en.lf_seed) },
  w: { type: "string", enum: L.WORLDS, default: def.w, "x-field": "choice", "x-label": Lb("Welt", "World"), "x-names": { de: L.WORLDS.map((w) => T.de["lf_w_" + w]), en: L.WORLDS.map((w) => T.en["lf_w_" + w]) } },
  e: { type: "string", enum: L.FIG, default: def.e, "x-field": "choice", "x-label": Lb(T.de.lf_fig, T.en.lf_fig) },
  o: { type: "string", enum: L.OBJ, default: def.o, "x-field": "choice", "x-label": Lb(T.de.lf_obj, T.en.lf_obj) },
  c: { type: "string", enum: L.COIN, default: def.c, "x-field": "choice", "x-label": Lb(T.de.lf_coin, T.en.lf_coin) },
  f: { type: "string", enum: L.FOE, default: def.f, "x-field": "choice", "x-label": Lb(T.de.lf_foe, T.en.lf_foe) },
  fp: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: L.PATTERNS }, default: def.fp, "x-field": "list", "x-label": Lb(T.de.lf_fp, T.en.lf_fp) }
};
for (const k of L.PKEYS) props[k] = { type: "integer", minimum: L.SPEC[k][0], maximum: L.SPEC[k][1], default: def[k], "x-field": "number", "x-label": Lb(T.de["lf_p_" + k], T.en["lf_p_" + k]) };
Object.assign(props, {
  ev: { type: ["integer", "null"], minimum: 1, maximum: 999, default: 1, "x-field": "number", "x-hidden": true, "x-label": Lb("Engine-Version", "Engine version") },
  r: { type: ["integer", "null"], minimum: 1, maximum: 999999, default: null, "x-field": "number", "x-hidden": true, "x-label": Lb("Punkte zum Schlagen", "Score to beat") },
  anim: { type: ["object", "null"], additionalProperties: false, default: null, required: ["art"], "x-field": "list", "x-label": Lb("Animation", "Animation"),
    properties: { art: { type: "string", enum: P.ANIM.filter((a) => a !== "keine") }, tempo: { type: "number", minimum: 0.5, maximum: 2 }, staerke: { type: "number", minimum: 0, maximum: 1 }, bei: { type: "string", enum: P.ANIM_BEI.slice(1) } } },
  figur: { type: ["string", "null"], default: null, "x-field": "media.local", "x-slot": "figur", "x-label": Lb("Eigenes Foto als Figur", "Own photo as runner") },
  hintergrund: { type: ["string", "null"], default: null, "x-field": "media.local", "x-slot": "hintergrund", "x-label": Lb("Eigenes Foto als Hintergrund", "Own photo as background") },
  col: { type: "array", minItems: 2, maxItems: 2, items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, default: def.col, "x-field": "color", "x-label": Lb("Farben", "Colours") },
  t: { type: "string", maxLength: 40, default: def.t, "x-field": "text", "x-model": true, "x-label": Lb(T.de.lf_title, T.en.lf_title) },
  ki: { type: ["object", "null"], additionalProperties: false, required: ["k", "s"], properties: { k: { type: "string", enum: ["karte"] }, s: { type: "string", pattern: "^[A-Za-z0-9._~-]{8,200}$" }, h: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" }, o: { type: "string", pattern: "^[A-Za-z0-9_-]{22}$" } }, default: null, "x-field": "text", "x-hidden": true, "x-label": Lb("KI-Siegel", "AI seal") },
  by: { type: "array", maxItems: 8, default: [], "x-field": "list", "x-hidden": true, "x-label": Lb("Bearbeitet von", "Edited by"), items: { type: "object", additionalProperties: false, required: ["n", "w"], properties: { n: { type: "string", maxLength: 16 }, w: { type: "array", items: { type: "string" } } } } },

  fr: { type: ["string", "null"], pattern: "^[A-Za-z0-9_-]{22}$", default: null, "x-field": "text", "x-hidden": true, "x-label": Lb("Freie Karte", "Free card") }
});
const m = {
  id: "lauf", version: "1.0.0", sdk: "mdi-sdk/0.2", kind: "realtime", mode: "realtime", order: 310,
  title: Lb("Lauf und Sprung", "Run and jump"), teaser: Lb("Tippen = springen, halten = höher.", "Tap = jump, hold = higher."),
  rule: Lb(T.de.lf_hint, T.en.lf_hint), howto: Lb(T.de.lf_start, T.en.lf_start),
  family: "lauf", grip: "pause", dur: 60,
  players: { min: 1, max: 2 }, hidden: "none", uses: ["image"], modes: ["alone", "ghost"], play: { default: "alone", offer: ["alone"] },
  limits: { stepBudget: 4000, stateBytes: 65536 },
  rt: { tick: 120, view: { w: 400, h: 360, fit: "width" }, numeric: "f64", net: "none", maxTicks: 21600, ghost: { bytes: 1200 },
    controls: { buttons: [
      { id: "tap", kind: "pulse", keys: ["Space", "ArrowUp", "KeyW"], zone: "any", label: Lb("Springen", "Jump") },
      { id: "hold", kind: "hold", keys: ["Space", "ArrowUp", "KeyW"], zone: "any", label: Lb("Höher springen", "Jump higher") },
      { id: "duck", kind: "hold", keys: ["ArrowDown", "KeyS"], zone: "button", swipe: "down", label: Lb("Ducken", "Duck") } ] },
    sounds: { coin: { synth: "tone", f0: 880, f1: 1320, dur: 0.06, type: "triangle", vol: 0.08 }, jump: { synth: "tone", f0: 320, f1: 640, dur: 0.07, type: "square", vol: 0.04 },
      stomp: { synth: "tone", f0: 600, f1: 300, dur: 0.08, type: "square", vol: 0.1 }, dead: { synth: "tone", f0: 260, f1: 40, dur: 0.4, type: "sawtooth", vol: 0.14, haptic: 120 }, goal: { haptic: 80 } } },
  params: { type: "object", additionalProperties: false, properties: props },
  // Teile nur mit Feldern, die der Editor heute darstellen kann (view.js fieldControls); Zahlen-Regler, Farben,
  // Animation und Fotos kommen zurueck, sobald H sie rendert (Nachricht an strang-h, PR #243 offen)
  parts: [
    { id: "modus", params: ["m"], label: Lb("Modus", "Mode") },
    { id: "welt", params: ["w", "o", "c"], label: Lb("Welt", "World") },
    { id: "figur", params: ["e", "f", "fp"], label: Lb("Figur", "Runner") },
    { id: "text", params: ["t"], label: Lb("Text", "Text") }
  ]
};
// nur die Vokabeln, die der Generator kennt (x-field, x-label, x-model, x-pairs, x-steps, x-hidden; ADR 0001, F @ 15338b5)
const strip = (o) => { if (Array.isArray(o)) return o.map(strip); if (o && typeof o === "object") { const r = {}; for (const [k, v] of Object.entries(o)) if (!/^x-/.test(k) || ["x-field", "x-label", "x-model", "x-pairs", "x-steps", "x-hidden"].includes(k)) r[k] = strip(v); return r; } return o; };
m.thumb = { src: "shot", file: "thumb.webp", alt: m.title };   // scripts/thumbs.js (F) erzeugt die Datei
m.params = strip(m.params);
process.stdout.write(JSON.stringify(m, null, 1) + "\n");
