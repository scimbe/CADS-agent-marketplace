// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
// Statische Fassung (Node, Tests, Werkzeuge): alle Karten sind geladen. Im Browser ersetzt der Build sie durch
// src/cards/lazy.js (dieselbe Schnittstelle, Karten als nachladbare Teile, ADR 0001 Nachtrag 2).
import c_bluff from "./bluff/card.js";
import * as v_bluff from "../gen/cards/bluff.js";
import c_geschenk_finder from "./geschenk-finder/card.js";
import * as v_geschenk_finder from "../gen/cards/geschenk-finder.js";
import c_gruss from "./gruss/card.js";
import * as v_gruss from "../gen/cards/gruss.js";
import c_karte_danke from "./karte-danke/card.js";
import * as v_karte_danke from "../gen/cards/karte-danke.js";
import c_raum_sorry from "./raum-sorry/card.js";
import * as v_raum_sorry from "../gen/cards/raum-sorry.js";
import c_zug_einig from "./zug-einig/card.js";
import * as v_zug_einig from "../gen/cards/zug-einig.js";
import c_zug_einkauf from "./zug-einkauf/card.js";
import * as v_zug_einkauf from "../gen/cards/zug-einkauf.js";
import c_zug_gutschein from "./zug-gutschein/card.js";
import * as v_zug_gutschein from "../gen/cards/zug-gutschein.js";
import c_zug_kapsel from "./zug-kapsel/card.js";
import * as v_zug_kapsel from "../gen/cards/zug-kapsel.js";
import c_zug_reihum from "./zug-reihum/card.js";
import * as v_zug_reihum from "../gen/cards/zug-reihum.js";
import c_zug_sammeln from "./zug-sammeln/card.js";
import * as v_zug_sammeln from "../gen/cards/zug-sammeln.js";
import c_zug_termin from "./zug-termin/card.js";
import * as v_zug_termin from "../gen/cards/zug-termin.js";
import c_zug_umschlag from "./zug-umschlag/card.js";
import * as v_zug_umschlag from "../gen/cards/zug-umschlag.js";
import c_zug_wichteln from "./zug-wichteln/card.js";
import * as v_zug_wichteln from "../gen/cards/zug-wichteln.js";
import c_zug_wunschzettel from "./zug-wunschzettel/card.js";
import * as v_zug_wunschzettel from "../gen/cards/zug-wunschzettel.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "bluff": c_bluff, "geschenk-finder": c_geschenk_finder, "gruss": c_gruss, "karte-danke": c_karte_danke, "raum-sorry": c_raum_sorry, "zug-einig": c_zug_einig, "zug-einkauf": c_zug_einkauf, "zug-gutschein": c_zug_gutschein, "zug-kapsel": c_zug_kapsel, "zug-reihum": c_zug_reihum, "zug-sammeln": c_zug_sammeln, "zug-termin": c_zug_termin, "zug-umschlag": c_zug_umschlag, "zug-wichteln": c_zug_wichteln, "zug-wunschzettel": c_zug_wunschzettel });
const VAL = { "bluff": v_bluff, "geschenk-finder": v_geschenk_finder, "gruss": v_gruss, "karte-danke": v_karte_danke, "raum-sorry": v_raum_sorry, "zug-einig": v_zug_einig, "zug-einkauf": v_zug_einkauf, "zug-gutschein": v_zug_gutschein, "zug-kapsel": v_zug_kapsel, "zug-reihum": v_zug_reihum, "zug-sammeln": v_zug_sammeln, "zug-termin": v_zug_termin, "zug-umschlag": v_zug_umschlag, "zug-wichteln": v_zug_wichteln, "zug-wunschzettel": v_zug_wunschzettel };
const META = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, c.manifest]));
const CAPS = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, { bot: typeof c.bot === "function" }]));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const ORDER = Object.freeze(["zug-sammeln","zug-termin","zug-einkauf","zug-wichteln","zug-reihum","zug-einig","zug-wunschzettel","geschenk-finder","karte-danke","zug-umschlag","zug-kapsel","zug-gutschein","raum-sorry","bluff","gruss"]);
export function codeHash(id) { return own(CODE_HASH, id) ? CODE_HASH[id] : null; }
/** Varianten aller Karten: id -> { card, variant }. */
export const VARIANTS = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => (META[id].variants || []).map((v) => [v.id, Object.freeze({ card: id, variant: v })]))));
/** Alte Karten-ids (eingeklappte Varianten, legacy) -> { card, variant }. */
export const LEGACY = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => [...(META[id].legacy || []).map((l) => [l, { card: id, variant: null }]), ...(META[id].variants || []).flatMap((v) => (v.legacy || []).map((l) => [l, { card: id, variant: v.id }]))])));
/** Modi aus dem Manifest abgeleitet – keine Kartensonderlogik (A3). */
export function modesOf(card, variantId = null) { return deriveModes(card, variantId); }
/** Modi ohne geladene Karte (Regal): aus den Metadaten und den Faehigkeiten der Karte. */
export function modesOfId(id, variantId = null) { return own(META, id) ? deriveModes({ manifest: META[id], bot: CAPS[id].bot ? true : undefined }, variantId) : []; }
export function cardOf(id) { return own(CARDS, id) ? CARDS[id] : null; }
export function manifestOf(id) { return own(META, id) ? META[id] : null; }
export function isLoaded(id) { return own(CARDS, id); }
/** Statisch: jede Karte ist geladen. Unbekannte ids werden abgelehnt (gleich wie im Browser). */
export function loadCard(id) { return own(CARDS, id) ? Promise.resolve(CARDS[id]) : Promise.reject(Object.assign(new Error("karte-unbekannt"), { code: "karte-unbekannt" })); }
export function validParams(id, p) { return own(VAL, id) && VAL[id].params(p) === true; }
/** Eingabe gegen das Schema der Karte; Karten ohne manifest.inputs pruefen nur ueber moves()/accepts(). */
export function validInput(id, x) { if (!own(VAL, id)) return false; return VAL[id].inputs ? VAL[id].inputs(x) === true : true; }
