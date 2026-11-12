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
<<<<<<< HEAD
const HEAD = "// ERZEUGT von scripts/gen.js – nicht von Hand aendern.\n/* eslint-disable */\n";
=======
export const CARDS = ["gruss", "bluff", "tisch-skat", "tisch-doko", "tisch-bauernskat"];
>>>>>>> dd5edbd (feat(mdi): Tisch-Engine E6 – Skat, Doppelkopf, Bauernskat mit Mental Poker im Kartenvertrag)

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
  const map = { linkCard: "link#/$defs/card", linkChallenge: "link#/$defs/challenge", linkLive: "link#/$defs/live", linkGhost: "link#/$defs/ghost", liveMsg: "live", manifest: "manifest" };
  const ids = discover(cardsDir), hashes = {}, assets = {}, metas = [], warnings = [], withInputs = [];
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
    map["params_" + ident(id)] = "params-" + id;
    if (man.inputs) { ajv.addSchema({ ...man.inputs, $id: "inputs-" + id }); map["inputs_" + ident(id)] = "inputs-" + id; withInputs.push(id); }
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
  const index = HEAD + "// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.\n" +
    ids.map((id) => "import c_" + ident(id) + " from \"" + imp(id) + "\";").join("\n") + "\n" +
    "import * as V from \"../gen/validators.js\";\nimport { CODE_HASH } from \"../gen/codehash.js\";\nimport { deriveModes } from \"../contract/modes.js\";\n\n" +
    "export const CARDS = Object.freeze({ " + ids.map((id) => JSON.stringify(id) + ": c_" + ident(id)).join(", ") + " });\n" +
    "export const ORDER = Object.freeze(" + JSON.stringify(metas.map((m) => m.id)) + ");\n" +
    "const PARAMS = { " + ids.map((id) => JSON.stringify(id) + ": V.params_" + ident(id)).join(", ") + " };\n" +
    "const INPUTS = { " + withInputs.map((id) => JSON.stringify(id) + ": V.inputs_" + ident(id)).join(", ") + " };\n" +
    "const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);\n" +
    "export function cardOf(id) { return own(CARDS, id) ? CARDS[id] : null; }\n" +
    "export function manifestOf(id) { const c = cardOf(id); return c ? c.manifest : null; }\n" +
    "export function validParams(id, p) { return own(PARAMS, id) && PARAMS[id](p) === true; }\n" +
    "/** Eingabe gegen das Schema der Karte; Karten ohne manifest.inputs pruefen nur ueber moves()/accepts(). */\n" +
    "export function validInput(id, x) { if (!own(CARDS, id)) return false; return own(INPUTS, id) ? INPUTS[id](x) === true : true; }\n" +
    "export function codeHash(id) { return own(CODE_HASH, id) ? CODE_HASH[id] : null; }\n" +
    "/** Varianten aller Karten: id -> { card, variant }. */\n" +
    "export const VARIANTS = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => (CARDS[id].manifest.variants || []).map((v) => [v.id, Object.freeze({ card: id, variant: v })]))));\n" +
    "/** Modi aus dem Manifest abgeleitet – keine Kartensonderlogik (A3). */\n" +
    "export function modesOf(card, variantId = null) { return deriveModes(card, variantId); }\n" +
    "/** Alte Karten-ids (eingeklappte Varianten, legacy) -> { card, variant }. */\n" +
    "export const LEGACY = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => [...(CARDS[id].manifest.legacy || []).map((l) => [l, { card: id, variant: null }]), ...(CARDS[id].manifest.variants || []).flatMap((v) => (v.legacy || []).map((l) => [l, { card: id, variant: v.id }]))])));\n";

  const validators = HEAD + esmRuntime(standaloneCode(ajv, map));
  const codehash = HEAD + "export const CODE_HASH = " + JSON.stringify(hashes, null, 2) + ";\n";
  const out = { "gen/validators.js": validators, "gen/codehash.js": codehash, "gen/assets.json": JSON.stringify(assets, null, 2) + "\n" };
  if (!opt.cardsDir) out["cards/index.js"] = index; else out["index"] = index;
  return Object.assign(out, opt.withWarnings ? { _warnings: warnings } : {});
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
