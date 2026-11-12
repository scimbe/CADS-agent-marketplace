// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import c_arcade_elfer from "./arcade-elfer/card.js";
import c_arcade_flipper from "./arcade-flipper/card.js";
import c_arcade_kick from "./arcade-kick/card.js";
import c_arcade_murmel from "./arcade-murmel/card.js";
import c_arcade_panzer from "./arcade-panzer/card.js";
import c_arcade_puck from "./arcade-puck/card.js";
import c_arcade_snow from "./arcade-snow/card.js";
import c_arcade_stock from "./arcade-stock/card.js";
import c_arcade_volley from "./arcade-volley/card.js";
import c_arcade_ziegel from "./arcade-ziegel/card.js";
import c_bluff from "./bluff/card.js";
import c_gruss from "./gruss/card.js";
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "arcade-elfer": c_arcade_elfer, "arcade-flipper": c_arcade_flipper, "arcade-kick": c_arcade_kick, "arcade-murmel": c_arcade_murmel, "arcade-panzer": c_arcade_panzer, "arcade-puck": c_arcade_puck, "arcade-snow": c_arcade_snow, "arcade-stock": c_arcade_stock, "arcade-volley": c_arcade_volley, "arcade-ziegel": c_arcade_ziegel, "bluff": c_bluff, "gruss": c_gruss });
export const ORDER = Object.freeze(["arcade-kick","arcade-elfer","arcade-ziegel","arcade-panzer","arcade-stock","arcade-puck","arcade-volley","arcade-flipper","arcade-snow","arcade-murmel","bluff","gruss"]);
const PARAMS = { "arcade-elfer": V.params_arcade_elfer, "arcade-flipper": V.params_arcade_flipper, "arcade-kick": V.params_arcade_kick, "arcade-murmel": V.params_arcade_murmel, "arcade-panzer": V.params_arcade_panzer, "arcade-puck": V.params_arcade_puck, "arcade-snow": V.params_arcade_snow, "arcade-stock": V.params_arcade_stock, "arcade-volley": V.params_arcade_volley, "arcade-ziegel": V.params_arcade_ziegel, "bluff": V.params_bluff, "gruss": V.params_gruss };
const INPUTS = {  };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function cardOf(id) { return own(CARDS, id) ? CARDS[id] : null; }
export function manifestOf(id) { const c = cardOf(id); return c ? c.manifest : null; }
export function validParams(id, p) { return own(PARAMS, id) && PARAMS[id](p) === true; }
/** Eingabe gegen das Schema der Karte; Karten ohne manifest.inputs pruefen nur ueber moves()/accepts(). */
export function validInput(id, x) { if (!own(CARDS, id)) return false; return own(INPUTS, id) ? INPUTS[id](x) === true : true; }
export function codeHash(id) { return own(CODE_HASH, id) ? CODE_HASH[id] : null; }
/** Varianten aller Karten: id -> { card, variant }. */
export const VARIANTS = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => (CARDS[id].manifest.variants || []).map((v) => [v.id, Object.freeze({ card: id, variant: v })]))));
/** Modi aus dem Manifest abgeleitet – keine Kartensonderlogik (A3). */
export function modesOf(card, variantId = null) { return deriveModes(card, variantId); }
/** Alte Karten-ids (eingeklappte Varianten, legacy) -> { card, variant }. */
export const LEGACY = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => [...(CARDS[id].manifest.legacy || []).map((l) => [l, { card: id, variant: null }]), ...(CARDS[id].manifest.variants || []).flatMap((v) => (v.legacy || []).map((l) => [l, { card: id, variant: v.id }]))])));
