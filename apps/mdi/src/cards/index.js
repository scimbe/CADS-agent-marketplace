<<<<<<< HEAD
// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import c_bluff from "./bluff/card.js";
import c_gruss from "./gruss/card.js";
=======
// Kartenregister: alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import gruss from "./gruss/card.js";
import bluff from "./bluff/card.js";
import tischSkat from "./tisch-skat/card.js";
import tischDoko from "./tisch-doko/card.js";
import tischBauernskat from "./tisch-bauernskat/card.js";
>>>>>>> dd5edbd (feat(mdi): Tisch-Engine E6 – Skat, Doppelkopf, Bauernskat mit Mental Poker im Kartenvertrag)
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

<<<<<<< HEAD
export const CARDS = Object.freeze({ "bluff": c_bluff, "gruss": c_gruss });
export const ORDER = Object.freeze(["bluff","gruss"]);
const PARAMS = { "bluff": V.params_bluff, "gruss": V.params_gruss };
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
=======
const VALIDATE = { gruss: V.params_gruss, bluff: V.params_bluff, "tisch-skat": V.params_tisch_skat, "tisch-doko": V.params_tisch_doko, "tisch-bauernskat": V.params_tisch_bauernskat };
export const CARDS = { gruss, bluff, "tisch-skat": tischSkat, "tisch-doko": tischDoko, "tisch-bauernskat": tischBauernskat };
export const ORDER = ["gruss", "bluff", "tisch-skat", "tisch-doko", "tisch-bauernskat"];
export function cardOf(id) { return Object.prototype.hasOwnProperty.call(CARDS, id) ? CARDS[id] : null; }
export function validParams(id, p) { const f = VALIDATE[id]; return !!f && f(p) === true; }
export function codeHash(id) { return CODE_HASH[id]; }
>>>>>>> dd5edbd (feat(mdi): Tisch-Engine E6 – Skat, Doppelkopf, Bauernskat mit Mental Poker im Kartenvertrag)
/** Modi aus dem Manifest abgeleitet – keine Kartensonderlogik (A3). */
export function modesOf(card, variantId = null) { return deriveModes(card, variantId); }
/** Alte Karten-ids (eingeklappte Varianten, legacy) -> { card, variant }. */
export const LEGACY = Object.freeze(Object.fromEntries(ORDER.flatMap((id) => [...(CARDS[id].manifest.legacy || []).map((l) => [l, { card: id, variant: null }]), ...(CARDS[id].manifest.variants || []).flatMap((v) => (v.legacy || []).map((l) => [l, { card: id, variant: v.id }]))])));
