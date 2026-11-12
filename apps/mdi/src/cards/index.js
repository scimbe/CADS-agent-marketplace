// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import c_advent_tuer from "./advent-tuer/card.js";
import c_beat_pausenhof from "./beat-pausenhof/card.js";
import c_bluff from "./bluff/card.js";
import c_foto_alien from "./foto-alien/card.js";
import c_gruss from "./gruss/card.js";
import c_kanal_geheim from "./kanal-geheim/card.js";
import c_stimme_verzerren from "./stimme-verzerren/card.js";
import c_zug_advent from "./zug-advent/card.js";
import c_zug_stimme from "./zug-stimme/card.js";
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "advent-tuer": c_advent_tuer, "beat-pausenhof": c_beat_pausenhof, "bluff": c_bluff, "foto-alien": c_foto_alien, "gruss": c_gruss, "kanal-geheim": c_kanal_geheim, "stimme-verzerren": c_stimme_verzerren, "zug-advent": c_zug_advent, "zug-stimme": c_zug_stimme });
export const ORDER = Object.freeze(["advent-tuer","zug-advent","foto-alien","beat-pausenhof","zug-stimme","kanal-geheim","stimme-verzerren","bluff","gruss"]);
const PARAMS = { "advent-tuer": V.params_advent_tuer, "beat-pausenhof": V.params_beat_pausenhof, "bluff": V.params_bluff, "foto-alien": V.params_foto_alien, "gruss": V.params_gruss, "kanal-geheim": V.params_kanal_geheim, "stimme-verzerren": V.params_stimme_verzerren, "zug-advent": V.params_zug_advent, "zug-stimme": V.params_zug_stimme };
const INPUTS = { "kanal-geheim": V.inputs_kanal_geheim, "zug-advent": V.inputs_zug_advent, "zug-stimme": V.inputs_zug_stimme };
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
