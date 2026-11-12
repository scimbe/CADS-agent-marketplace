// Erzeugt zur Build-Zeit (ADR 0001 a): das Kartenregister src/cards/index.js aus allen src/cards/*/manifest.json,
// Ajv-Standalone-Validatoren (kein new Function zur Laufzeit, CSP ohne unsafe-eval) fuer Link, Live, Manifest,
// Parameter und Eingaben je Karte, die Code-Hashes (Manifest + alle gebuendelten Quelldateien + Assets) und die
// Asset-Liste fuer den Build. Ausgabe eingecheckt; build.test prueft Aktualitaet. Lehnt ab statt zu raten.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import standaloneCode from "ajv/dist/standalone/index.js";
import * as esbuild from "esbuild";
import { checkCardSource } from "./harness.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const HEAD = "// ERZEUGT von scripts/gen.js – nicht von Hand aendern.\n/* eslint-disable */\n";

// Budgets in Byte (ADR 0001 e)
export const BUDGET = { image: 120 * 1024, sheet: 120 * 1024, json: 64 * 1024, sound: 96 * 1024, card: 256 * 1024, thumb: 60 * 1024 };

export class GenError extends Error {}
// Editor-Vokabeln an Parameterfeldern (ADR 0001, Anfragen P/L): nur Beschreibung, keine Pruefregeln
export const FIELD_VOCAB = ["x-field", "x-label", "x-model", "x-pairs", "x-names", "x-hidden", "x-set", "x-suggest", "x-default", "x-rows", "x-unit", "x-note", "x-use", "x-icons", "x-steps"];
// Ajv-Standalone setzt fuer manche Schluesselwoerter Laufzeit-Hilfen per require() ein; im ESM-Bundle gibt es kein
// require. Bekannte Hilfen werden durch ESM-Importe ersetzt, unbekannte lehnt der Generator ab.
const AJV_RUNTIME = { "ajv/dist/runtime/equal": "__ajvEqual" };
function esmRuntime(code) {
  const used = new Set();
  const out = code.replace(/require\("([^"]+)"\)\.default/g, (m, mod) => { if (!AJV_RUNTIME[mod]) fail("Validator braucht unbekannte Laufzeit " + mod); used.add(mod); return AJV_RUNTIME[mod]; });
  if (/require\(/.test(out)) fail("Validator enthaelt require()");
  return (used.has("ajv/dist/runtime/equal") ? 'import { deepEqual as __ajvEqual } from "../contract/equal.js";\n' : "") + out;
}
function fail(msg) { throw new GenError("gen: " + msg); }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { fail(path.relative(ROOT, p) + ": " + e.message); } }
const ident = (id) => id.replace(/-/g, "_");

/** Alle Kartenordner (ohne _-Ordner) eines Wurzelverzeichnisses, sortiert. */
export function discover(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name).sort();
}

/** Quelldateien, die esbuild fuer card.js buendelt (inkl. src/engines/**), relativ zu ROOT, sortiert. */
function bundleInputs(cardJs) {
  const r = esbuild.buildSync({ entryPoints: [cardJs], bundle: true, write: false, metafile: true, format: "esm", platform: "neutral", logLevel: "silent" });
  return Object.keys(r.metafile.inputs).map((p) => path.resolve(ROOT, p)).sort();
}

function newAjv() {
  const ajv = new Ajv({ code: { source: true, esm: true, lines: false }, strict: true, unicodeRegExp: true, unicode: false, allErrors: false, logger: false });
  ajv.addVocabulary(FIELD_VOCAB);
  return ajv;
}

/**
 * @param {{cardsDir?:string}} [opt] cardsDir fuer Tests (Fixture-Register)
 * @returns {Object<string,string>} Pfad relativ zu src/ -> Inhalt
 */
export function generate(opt = {}) {
  const cardsDir = opt.cardsDir || path.join(SRC, "cards");
  const strictThumbs = opt.strictThumbs ?? process.env.MDI_STRICT_THUMBS === "1";
  const ajv = newAjv();
  for (const s of ["link", "live", "manifest"]) ajv.addSchema(readJson(path.join(SRC, "schema", s + ".schema.json")));
  const checkManifest = ajv.getSchema("manifest");
  const map = { linkCard: "link#/$defs/card", linkChallenge: "link#/$defs/challenge", linkLive: "link#/$defs/live", linkGhost: "link#/$defs/ghost", liveMsg: "live" };
  const ids = discover(cardsDir), hashes = {}, assets = {}, metas = [], warnings = [], withInputs = [], manifests = {};
  for (const id of ids) {
    const dir = path.join(cardsDir, id), mf = path.join(dir, "manifest.json"), cj = path.join(dir, "card.js");
    if (!fs.existsSync(mf) || !fs.existsSync(cj)) fail(id + ": manifest.json und card.js sind Pflicht");
    const man = readJson(mf);
    if (!checkManifest(man)) fail(id + ": Manifest ungueltig: " + ajv.errorsText(checkManifest.errors));
    if (man.id !== id) fail(id + ": manifest.id \"" + man.id + "\" passt nicht zum Ordner");
    if (man.players.min > man.players.max) fail(id + ": players.min > players.max");
    for (const [k, arr] of [["on", man.on], ["modes", man.modes], ["play.offer", man.play && man.play.offer]]) if (arr && new Set(arr).size !== arr.length) fail(id + ": " + k + " enthaelt Doppelte");
    if (man.play && !man.play.offer.includes(man.play.default)) fail(id + ": play.default nicht in play.offer");
    checkRt(id, man);
    // Parameter und Eingaben
    ajv.addSchema({ ...man.params, $id: "params-" + id });
    if (man.inputs) { ajv.addSchema({ ...man.inputs, $id: "inputs-" + id }); withInputs.push(id); }
    manifests[id] = man;
    // Varianten muessen mit den Standardwerten gueltige Parameter ergeben
    const pv = ajv.getSchema("params-" + id), defs = {};
    for (const [k, p] of Object.entries(man.params.properties || {})) defs[k] = p.default;
    if (!pv(defs)) fail(id + ": Standardwerte verletzen das params-Schema: " + ajv.errorsText(pv.errors));
    const seen = new Set();
    for (const v of man.variants || []) {
      if (seen.has(v.id)) fail(id + ": Variante doppelt: " + v.id); seen.add(v.id);
      if (!pv({ ...defs, ...v.params })) fail(id + ": Variante " + v.id + " hat ungueltige Parameter: " + ajv.errorsText(pv.errors));
    }
    // Harness ueber alle gebuendelten Kartendateien und Engines
    const inputs = bundleInputs(cj);
    for (const f of inputs) {
      const rel = path.relative(ROOT, f).replace(/\\/g, "/");
      if (!/\.js$/.test(f)) continue;
      if (!/(^|\/)(cards|engines|contract)\//.test(rel)) fail(id + ": Import ausserhalb von cards/engines/contract: " + rel);
      if (rel.startsWith("src/contract/")) continue; // SDK ist selbst geprueft (sdk.test)
      const found = checkCardSource(fs.readFileSync(f, "utf8"), { file: rel });
      if (found.length) fail(id + ": Harness " + rel + ": " + found.join("; "));
    }
    // Assets und Thumbnail mit Budget
    let total = 0;
    const list = [];
    for (const a of man.assets || []) {
      const p = path.join(dir, a.file);
      if (!fs.existsSync(p)) fail(id + ": Asset fehlt: " + a.file);
      const n = fs.statSync(p).size;
      if (n > BUDGET[a.type]) fail(id + ": Asset " + a.file + " " + n + " B > Budget " + BUDGET[a.type] + " B");
      if (a.type === "json") readJson(p);
      if (a.type === "sheet" && (!a.tile || !a.keys)) fail(id + ": Sheet " + a.id + " braucht tile und keys");
      total += n; list.push({ id: a.id, type: a.type, file: a.file, bytes: n });
    }
    if (total > BUDGET.card) fail(id + ": Assets zusammen " + total + " B > " + BUDGET.card + " B");
    if (new Set(list.map((a) => a.id)).size !== list.length) fail(id + ": Asset-id doppelt");
    const thumbs = [];
    for (const t of [man.thumb, ...(man.variants || []).map((v) => v.thumb)].filter(Boolean)) {
      const p = path.join(dir, t.file);
      if (!fs.existsSync(p)) fail(id + ": Thumbnail fehlt: " + t.file);
      const n = fs.statSync(p).size;
      if (n > BUDGET.thumb) fail(id + ": Thumbnail " + t.file + " " + n + " B > " + BUDGET.thumb + " B");
      thumbs.push({ file: t.file, src: t.src, bytes: n });
    }
    if (!man.thumb) (strictThumbs ? fail : (m) => warnings.push(m))(id + ": thumb fehlt (ADR 0001 d)");
    assets[id] = { assets: list, thumbs };
    // Code-Hash: Quelldateien (ohne SDK/Token: die tragen die SDK-Version) + Asset-Dateien, feste Reihenfolge
    const h = crypto.createHash("sha256");
    for (const f of inputs) { if (path.relative(ROOT, f).startsWith("src/contract")) continue; h.update(path.relative(dir, f).replace(/\\/g, "/") + "\0"); h.update(fs.readFileSync(f)); }
    for (const a of list) { h.update("asset:" + a.file + "\0"); h.update(fs.readFileSync(path.join(dir, a.file))); }
    hashes[id] = h.digest("hex").slice(0, 32);
    metas.push({ id, order: Number.isInteger(man.order) ? man.order : 1000, variants: (man.variants || []).map((v) => v.id) });
  }
  // Varianten-ids duerfen keine Karten-id und keine andere Variante verdecken
  const all = new Set(ids);
  for (const m of metas) for (const v of m.variants) { if (all.has(v)) fail(m.id + ": Variante " + v + " kollidiert"); all.add(v); }
  metas.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

  const relToCards = path.relative(path.join(SRC, "cards"), cardsDir).replace(/\\/g, "/");
  const imp = (id) => "./" + (relToCards ? relToCards + "/" : "") + id + "/card.js";
  const order = metas.map((m) => m.id);
  // Kern-Validatoren (Link, Live, Manifest) und je Karte eigene Validatoren (Parameter, Eingaben): die Karten-Validatoren
  // reisen im Teil der Karte (Nachladen, ADR 0001 Nachtrag 2), nicht im Kern.
  const cardValidators = {};
  for (const id of ids) {
    const man = manifests[id], aj = newAjv(), m2 = { params: "params-" + id };
    aj.addSchema({ ...man.params, $id: "params-" + id });
    if (man.inputs) { aj.addSchema({ ...man.inputs, $id: "inputs-" + id }); m2.inputs = "inputs-" + id; }
    cardValidators["gen/cards/" + id + ".js"] = HEAD + esmRuntime(standaloneCode(aj, m2)).replace('from "../contract/equal.js"', 'from "../../contract/equal.js"') + (man.inputs ? "" : "export const inputs = null;\n");
  }
  const common =
    "const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);\n" +
    "export const ORDER = Object.freeze(" + JSON.stringify(order) + ");\n" +
    "export function codeHash(id) { return own(CODE_HASH, id) ? CODE_HASH[id] : null; }\n" +
    "/** Varianten aller Karten: id -> { card, variant }. */\n" +
    "export const VARIANTS = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => (META[id].variants || []).map((v) => [v.id, Object.freeze({ card: id, variant: v })]))));\n" +
    "/** Alte Karten-ids (eingeklappte Varianten, legacy) -> { card, variant }. */\n" +
    "export const LEGACY = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => [...(META[id].legacy || []).map((l) => [l, { card: id, variant: null }]), ...(META[id].variants || []).flatMap((v) => (v.legacy || []).map((l) => [l, { card: id, variant: v.id }]))])));\n" +
    "/** Modi aus dem Manifest abgeleitet – keine Kartensonderlogik (A3). */\n" +
    "export function modesOf(card, variantId = null) { return deriveModes(card, variantId); }\n" +
    "/** Modi ohne geladene Karte (Regal): aus den Metadaten und den Faehigkeiten der Karte. */\n" +
    "export function modesOfId(id, variantId = null) { return own(META, id) ? deriveModes({ manifest: META[id], bot: CAPS[id].bot ? true : undefined }, variantId) : []; }\n";
  const meta = {};
  for (const id of ids) meta[id] = metaOf(manifests[id]);
  const index = HEAD + "// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.\n" +
    "// Statische Fassung (Node, Tests, Werkzeuge): alle Karten sind geladen. Im Browser ersetzt der Build sie durch\n" +
    "// src/cards/lazy.js (dieselbe Schnittstelle, Karten als nachladbare Teile, ADR 0001 Nachtrag 2).\n" +
    ids.map((id) => "import c_" + ident(id) + " from \"" + imp(id) + "\";\nimport * as v_" + ident(id) + " from \"../gen/cards/" + id + ".js\";").join("\n") + "\n" +
    "import { CODE_HASH } from \"../gen/codehash.js\";\nimport { deriveModes } from \"../contract/modes.js\";\n\n" +
    "export const CARDS = Object.freeze({ " + ids.map((id) => JSON.stringify(id) + ": c_" + ident(id)).join(", ") + " });\n" +
    "const VAL = { " + ids.map((id) => JSON.stringify(id) + ": v_" + ident(id)).join(", ") + " };\n" +
    "const META = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, c.manifest]));\n" +
    "const CAPS = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, { bot: typeof c.bot === \"function\" }]));\n" +
    common +
    "export function cardOf(id) { return own(CARDS, id) ? CARDS[id] : null; }\n" +
    "export function manifestOf(id) { return own(META, id) ? META[id] : null; }\n" +
    "export function isLoaded(id) { return own(CARDS, id); }\n" +
    "/** Statisch: jede Karte ist geladen. Unbekannte ids werden abgelehnt (gleich wie im Browser). */\n" +
    "export function loadCard(id) { return own(CARDS, id) ? Promise.resolve(CARDS[id]) : Promise.reject(Object.assign(new Error(\"karte-unbekannt\"), { code: \"karte-unbekannt\" })); }\n" +
    "export function validParams(id, p) { return own(VAL, id) && VAL[id].params(p) === true; }\n" +
    "/** Eingabe gegen das Schema der Karte; Karten ohne manifest.inputs pruefen nur ueber moves()/accepts(). */\n" +
    "export function validInput(id, x) { if (!own(VAL, id)) return false; return VAL[id].inputs ? VAL[id].inputs(x) === true : true; }\n";
  const lazy = HEAD + "// Kartenregister im Browser (ADR 0001 Nachtrag 2): im Kern nur Metadaten; Karte, Validatoren und Assets kommen als\n" +
    "// Teil (src/broker/parts.js) und sind danach synchron ueber cardOf/validParams/validInput da. Die Laufzeit laedt die\n" +
    "// Karte, bevor ein Ereignis sie braucht (OPEN, LINK, HELLO, SHOW). Fehlt ein Teil, meldet sie das ehrlich.\n" +
    "import { CODE_HASH } from \"../gen/codehash.js\";\nimport { deriveModes } from \"../contract/modes.js\";\n\n" +
    "const META = " + JSON.stringify(meta) + ";\n" +
    "// Faehigkeiten (z. B. eigener Bot) und Teile setzt der Build ein (scripts/build.js liest die Karten-Module)\n" +
    "const CAPS = __CARD_CAPS__;\n" +
    common +
    "const LOADED = new Map(), PENDING = new Map();\n" +
    "export function cardOf(id) { return LOADED.has(id) ? LOADED.get(id).card : null; }\n" +
    "export function manifestOf(id) { return LOADED.has(id) ? LOADED.get(id).card.manifest : own(META, id) ? META[id] : null; }\n" +
    "export function isLoaded(id) { return LOADED.has(id); }\n" +
    "export function validParams(id, p) { return LOADED.has(id) && LOADED.get(id).params(p) === true; }\n" +
    "export function validInput(id, x) { if (!LOADED.has(id)) return false; const v = LOADED.get(id).inputs; return v ? v(x) === true : true; }\n" +
    "export function assetsOf(id) { return LOADED.has(id) ? LOADED.get(id).assets : null; }\n" +
    "/** Laedt die Karte ueber loadPart(id) -> Promise<{card, params, inputs, hash, assets}>; prueft id und Code-Hash. */\n" +
    "export function loadCard(id, loadPart) {\n" +
    "  if (LOADED.has(id)) return Promise.resolve(LOADED.get(id).card);\n" +
    "  if (!own(META, id)) return Promise.reject(Object.assign(new Error(\"karte-unbekannt\"), { code: \"karte-unbekannt\" }));\n" +
    "  if (!PENDING.has(id)) PENDING.set(id, loadPart(id).then((p) => {\n" +
    "    if (!p || !p.card || p.card.manifest.id !== id || p.hash !== CODE_HASH[id]) throw Object.assign(new Error(\"teil-falsch\"), { code: \"teil-falsch\" });\n" +
    "    LOADED.set(id, p); return p.card;\n" +
    "  }).finally(() => PENDING.delete(id)));\n" +
    "  return PENDING.get(id);\n" +
    "}\n";
  const validators = HEAD + esmRuntime(standaloneCode(ajv, map));
  // Manifest-Validator nur fuer Generator und Tests (nicht im ausgelieferten Kern)
  const manifestValidator = HEAD + esmRuntime(standaloneCode(ajv, { manifest: "manifest" })).replace('from "../contract/equal.js"', 'from "../contract/equal.js"');
  const codehash = HEAD + "export const CODE_HASH = " + JSON.stringify(hashes, null, 2) + ";\n";
  const out = { "gen/validators.js": validators, "gen/codehash.js": codehash, "gen/assets.json": JSON.stringify(assets, null, 2) + "\n", "gen/manifest.js": manifestValidator, ...cardValidators };
  if (!opt.cardsDir) { out["cards/index.js"] = index; out["cards/lazy.js"] = lazy; } else { out["index"] = index; out["lazy"] = lazy; }
  return Object.assign(out, opt.withWarnings ? { _warnings: warnings } : {});
}

/** Metadaten fuer den Kern (Regal, Modi, Varianten, Thumbnails) – ohne Parameter-Schemata, Texte der Felder, Eingaben. */
// Nur, was Regal, Modi, Varianten und Thumbnails ohne geladene Karte brauchen; howto, rule, roles, seats usw. kommen mit dem Teil
export const META_KEYS = ["id", "version", "kind", "mode", "title", "teaser", "family", "grip", "on", "dur", "order", "players", "modes", "play", "legacy", "thumb", "shelf"];
export function metaOf(man) {
  const m = {};
  for (const k of META_KEYS) if (man[k] !== undefined) m[k] = man[k];
  if (man.rt) m.rt = { net: man.rt.net, tick: man.rt.tick, ...(man.rt.ghost ? { ghost: man.rt.ghost } : {}) };
  if (man.variants) m.variants = man.variants.map((v) => { const o = { ...v }; delete o.params; return o; });
  return m;
}

function checkRt(id, man) {
  const rt = man.rt, isRt = man.mode === "realtime";
  if (isRt !== !!rt) fail(id + ": mode realtime braucht rt und umgekehrt");
  if (isRt && man.kind !== "realtime") fail(id + ": mode realtime braucht kind realtime");
  if (!isRt) return;
  if (rt.net !== "none" && man.players.max < 2) fail(id + ": Live braucht mindestens zwei Sitze");
  const ids = rt.controls.buttons.map((b) => b.id);
  if (new Set(ids).size !== ids.length) fail(id + ": Knopf-id doppelt");
  if (rt.ghost && rt.ghost.bytes > 2400) fail(id + ": ghost.bytes zu gross");
}

/** Schreibt die erzeugten Dateien (nur bei Aenderung). */
export function writeGenerated(out = generate()) {
  for (const [f, s] of Object.entries(out)) {
    if (f.startsWith("_")) continue;
    const p = path.join(SRC, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== s) fs.writeFileSync(p, s);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const out = generate({ withWarnings: true });
    writeGenerated(out);
    for (const w of out._warnings) console.warn("gen: Warnung: " + w);
    console.log("gen: " + Object.keys(out).filter((k) => !k.startsWith("_")).join(", "));
  } catch (e) { if (e instanceof GenError) { console.error(e.message); process.exit(1); } throw e; }
}
