// Erzeugt src/cards/flug/manifest.json aus den Engine-Daten (eine Quelle): node test/fixtures/mk-flug-manifest.mjs "$PWD" > src/cards/flug/manifest.json
// test/manifest-frisch.test.js prueft, dass die eingecheckte Datei aktuell ist.
const root = process.argv[2];
const P = await import(root + "/src/engines/flug/params.js");
const V = await import(root + "/src/engines/flug/variants.js");
const R = await import(root + "/src/engines/flug/regeln.js");
const L = (de, en) => ({ de, en });
const color = { type: ["string", "null"], pattern: "^#[0-9a-fA-F]{6}$" };
const emoji = { type: "string", minLength: 1, maxLength: 12 };
const agent = { type: "object", additionalProperties: false, required: ["n", "e", "r", "c", "p"], properties: { n: { type: "string", maxLength: 16 }, e: emoji, r: { type: "integer", minimum: 0, maximum: 100 }, c: { type: "integer", minimum: 0, maximum: 100 }, p: { type: "integer", minimum: 0, maximum: 100 } } };
const lava = V.variantParams("spiel-lava", "de");
const TX = (await import(root + "/src/engines/flug/texts.json", { with: { type: "json" } })).default;
const num = (k, lab) => ({ type: "integer", minimum: P.RANGES[k][0], maximum: P.RANGES[k][1], default: lava[k], "x-field": "number", "x-steps": { values: R.steps(k), names: { de: R.steps(k).map((_, i) => TX.de["rg_" + k + i]), en: R.steps(k).map((_, i) => TX.en["rg_" + k + i]) } }, "x-label": lab });
const props = {
  variant: { type: "string", enum: V.VARIANT_IDS.concat(["eigen"]), default: "spiel-lava", "x-field": "choice", "x-label": L("Variante", "Variant") },
  mode: { type: "string", enum: ["solo", "agent", "train"], default: "solo", "x-field": "choice", "x-label": L("Wer fliegt?", "Who flies?") },
  seed: { type: "integer", minimum: 0, maximum: 4294967295, default: lava.seed, "x-field": "number", "x-label": L("Strecke", "Course") },
  gravity: num("gravity", L("Schwere", "Weight")), jump: num("jump", L("Sprung", "Jump")), gap: num("gap", L("Lücke", "Gap")), speed: num("speed", L("Tempo", "Speed")),
  theme: { type: "string", enum: P.THEME_NAMES, default: "lava", "x-field": "choice", "x-label": L("Welt", "World"), "x-names": { de: Object.fromEntries(P.THEME_NAMES.map((t) => [t, TX.de["w_" + t]])), en: Object.fromEntries(P.THEME_NAMES.map((t) => [t, TX.en["w_" + t]])) } },
  title: { type: "string", maxLength: 28, pattern: "^[^\\u0000-\\u001f\\u007f<>]*$", default: lava.title, "x-field": "text", "x-model": true, "x-label": L("Titel", "Title") },
  emoji: { ...emoji, default: "🐉", "x-field": "text", "x-label": L("Figur", "Hero") },
  look: { type: ["object", "null"], additionalProperties: false, default: null, "x-field": "list", "x-label": L("Look", "Look"),
    properties: { a: color, b: color, p: color, q: color, g: color, h: color, d: { type: "string", enum: P.DECOS }, f: { type: "string", enum: P.FORMS }, e: { type: "array", maxItems: 3, items: emoji }, o: emoji, m: emoji } },
  route: { type: ["array", "null"], minItems: 3, maxItems: 3, default: null, "x-field": "list", "x-label": L("Strecke in 3 Abschnitten", "Route in 3 sections"),
    items: { type: "object", additionalProperties: false, required: ["p", "d", "t", "e"], properties: { p: { type: "string", enum: P.STEPS }, t: { type: "string", enum: P.THEME_NAMES }, e: emoji,
      d: { type: "object", additionalProperties: false, properties: Object.fromEntries(Object.entries(P.DELTA_MAX).map(([k, m]) => [k, { type: "integer", minimum: -m, maximum: m }])) } } } },
  anim: { type: ["object", "null"], additionalProperties: false, default: null, "x-field": "list", "x-label": L("Animation", "Animation"),
    properties: { art: { type: "string", enum: P.ANIM.filter((a) => a !== "keine") }, tempo: { type: "number", minimum: 0.5, maximum: 2 }, staerke: { type: "number", minimum: 0, maximum: 1 }, bei: { type: "string", enum: P.ANIM_BEI.slice(1) } }, required: ["art"] },
  tempo: { type: "number", enum: P.TEMPOS, default: 1, "x-field": "choice", "x-label": L("Gemütlich spielen", "Play slowly"), "x-names": { de: { 1: "normal", 0.75: "gemütlich", 0.5: "sehr gemütlich" }, en: { 1: "normal", 0.75: "relaxed", 0.5: "very relaxed" } } },
  agent: { ...agent, default: { n: "", e: "🦊", r: 50, c: 50, p: 50 }, "x-field": "list", "x-label": L("Dein Agent", "Your agent") },
  rival: { ...agent, default: { n: "Toastomat", e: "🔌", r: 50, c: 50, p: 50 }, "x-field": "list", "x-label": L("Gegner", "Rival") },
  figur: { type: ["string", "null"], default: null, "x-field": "media.local", "x-slot": "figur", "x-label": L("Eigenes Foto als Figur", "Own photo as hero") },
  hintergrund: { type: ["string", "null"], default: null, "x-field": "media.local", "x-slot": "hintergrund", "x-label": L("Eigenes Foto als Hintergrund", "Own photo as background") },
  col: { type: "array", minItems: 2, maxItems: 2, items: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, default: ["#ffd400", "#ff3b1d"], "x-field": "color", "x-label": L("Farben", "Colours") },
  t: { type: "string", maxLength: 40, default: "", "x-field": "text", "x-label": L("Eigener Titel", "Own title") },
  by: { type: "array", maxItems: 8, default: [], "x-field": "list", "x-hidden": true, "x-label": L("Bearbeitet von", "Edited by"), items: { type: "object", additionalProperties: false, required: ["n", "w"], properties: { n: { type: "string", maxLength: 16 }, w: { type: "array", items: { type: "string" } } } } },
  ki: { type: ["object", "null"], additionalProperties: false, required: ["k", "s"], properties: { k: { type: "string", enum: ["karte", "welt"] }, s: { type: "string", pattern: "^[A-Za-z0-9._~-]{8,200}$" }, h: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" }, o: { type: "string", pattern: "^[A-Za-z0-9_-]{22}$" } }, default: null, "x-field": "text", "x-hidden": true, "x-label": L("KI-Siegel", "AI seal") },
  fr: { type: ["string", "null"], pattern: "^[A-Za-z0-9_-]{22}$", default: null, "x-field": "text", "x-hidden": true, "x-label": L("Freie Karte", "Free card") }
};
const m = {
  id: "flug", version: "1.0.0", sdk: "mdi-sdk/0.2", kind: "realtime", mode: "realtime", order: 300,
  title: L("Bau dein Lava-Level", "Build your lava level"), teaser: L("Feuer, Drache, kein Mitleid.", "Fire, dragon, zero mercy."),
  rule: L("Tippen oder Leertaste: flattern. Durch die Lücken fliegen.", "Tap or space: flap. Fly through the gaps."),
  howto: L("Tippen. Fliegen. Angeben.", "Tap. Fly. Flex."),
  family: "flug", grip: "pause", dur: 40, legacy: V.VARIANT_IDS.slice(),
  players: { min: 1, max: 2 }, hidden: "none", uses: ["image"], modes: ["alone", "bot", "ghost"], play: { default: "bot", offer: ["bot", "alone"] },
  limits: { stepBudget: 2000, stateBytes: 16384 },
  rt: { tick: 120, view: { w: 288, h: 512, fit: "contain" }, numeric: "f64", net: "none", maxTicks: 10800, ghost: { bytes: 1200 },
    controls: { buttons: [{ id: "tap", kind: "pulse", keys: ["Space", "ArrowUp", "KeyW"], zone: "any", label: L("Flattern", "Flap") }] },
    sounds: { flap: { synth: "tone", f0: 420, f1: 760, dur: 0.09, type: "square", vol: 0.05, haptic: 6 }, score: { synth: "tone", f0: 880, f1: 1320, dur: 0.14, type: "triangle", vol: 0.12, haptic: 14 },
      dead: { synth: "tone", f0: 260, f1: 40, dur: 0.45, type: "sawtooth", vol: 0.16, haptic: 160 }, section: { haptic: 20 } } },
  params: { type: "object", additionalProperties: false, properties: props },
  // Teile nur mit Feldern, die der Editor heute darstellen kann (view.js fieldControls); Regler (x-steps), Farben, Look,
  // Route, Animation, Agenten und Fotos kommen zurueck, sobald H sie rendert (Nachricht an strang-h, PR #243 offen)
  // Blasen nach Gate C (Reihe Lava-Flug): Vogel, Lava (Welt), Level (Regler mit benannten Stufen), Gemuetlich, Text.
  // "Eigenes Foto" (media.local) und Look/Route/Animation (Objekt-Felder) folgen, sobald der Editor sie darstellt (H/P).
  parts: [
    { id: "vogel", params: ["emoji"], label: L("Vogel", "Bird") },
    { id: "lava", params: ["theme"], label: L("Lava", "Lava") },
    { id: "level", params: ["gravity", "jump", "gap", "speed", "seed"], label: L("Level", "Level") },
    { id: "gemuetlich", params: ["tempo"], label: L("Gemütlich spielen", "Play slowly") },
    { id: "text", params: ["title", "t", "col"], label: L("Text", "Text") }
  ],
  variants: V.VARIANTS.map((v) => ({ id: v.id, title: { de: V.plainTitle(v.de.t), en: V.plainTitle(v.en.t) }, teaser: { de: v.de.s, en: v.en.s }, legacy: [v.id], thumb: { src: "shot", file: "thumb-" + v.id + ".webp", alt: { de: V.plainTitle(v.de.t), en: V.plainTitle(v.en.t) } }, modes: v.kind === "duel" ? ["alone"] : ["alone", "bot", "ghost"],
    tags: [...new Set(v.tags.map((t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).filter((t) => /^[a-z0-9-]{1,24}$/.test(t)))].slice(0, 8), params: Object.assign({}, props && {}, Object.fromEntries(Object.entries(props).map(([k, p]) => [k, p.default])), V.variantParams(v.id, "de", { nick: "", emoji: "🦊" })) }))
};
// nur die Vokabeln, die der Generator kennt (x-field, x-label, x-model, x-pairs, x-steps, x-hidden; ADR 0001, F @ 15338b5)
const { FIELD_VOCAB } = await import(root + "/scripts/gen.js");
const strip = (o) => { if (Array.isArray(o)) return o.map(strip); if (o && typeof o === "object") { const r = {}; for (const [k, v] of Object.entries(o)) if (!/^x-/.test(k) || FIELD_VOCAB.includes(k)) r[k] = strip(v); return r; } return o; };
m.thumb = { src: "shot", file: "thumb.webp", alt: m.title };   // scripts/thumbs.js (F) erzeugt die Dateien
m.params = strip(m.params);
process.stdout.write(JSON.stringify(m, null, 1) + "\n");
