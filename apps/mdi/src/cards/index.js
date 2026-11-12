// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import c_advent_tuer from "./advent-tuer/card.js";
import c_beat_pausenhof from "./beat-pausenhof/card.js";
import c_bluff from "./bluff/card.js";
import c_foto_alien from "./foto-alien/card.js";
import c_geschenk_finder from "./geschenk-finder/card.js";
import c_gruss from "./gruss/card.js";
import c_kanal_geheim from "./kanal-geheim/card.js";
import c_karte_danke from "./karte-danke/card.js";
import c_raum_sorry from "./raum-sorry/card.js";
import c_stimme_verzerren from "./stimme-verzerren/card.js";
import c_strassenrap_beat from "./strassenrap-beat/card.js";
import c_zettel from "./zettel/card.js";
import c_zug_advent from "./zug-advent/card.js";
import c_zug_einig from "./zug-einig/card.js";
import c_zug_einkauf from "./zug-einkauf/card.js";
import c_zug_gutschein from "./zug-gutschein/card.js";
import c_zug_kapsel from "./zug-kapsel/card.js";
import c_zug_reihum from "./zug-reihum/card.js";
import c_zug_sammeln from "./zug-sammeln/card.js";
import c_zug_stimme from "./zug-stimme/card.js";
import c_zug_termin from "./zug-termin/card.js";
import c_zug_umschlag from "./zug-umschlag/card.js";
import c_zug_wichteln from "./zug-wichteln/card.js";
import c_zug_wunschzettel from "./zug-wunschzettel/card.js";
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "advent-tuer": c_advent_tuer, "beat-pausenhof": c_beat_pausenhof, "bluff": c_bluff, "foto-alien": c_foto_alien, "geschenk-finder": c_geschenk_finder, "gruss": c_gruss, "kanal-geheim": c_kanal_geheim, "karte-danke": c_karte_danke, "raum-sorry": c_raum_sorry, "stimme-verzerren": c_stimme_verzerren, "strassenrap-beat": c_strassenrap_beat, "zettel": c_zettel, "zug-advent": c_zug_advent, "zug-einig": c_zug_einig, "zug-einkauf": c_zug_einkauf, "zug-gutschein": c_zug_gutschein, "zug-kapsel": c_zug_kapsel, "zug-reihum": c_zug_reihum, "zug-sammeln": c_zug_sammeln, "zug-stimme": c_zug_stimme, "zug-termin": c_zug_termin, "zug-umschlag": c_zug_umschlag, "zug-wichteln": c_zug_wichteln, "zug-wunschzettel": c_zug_wunschzettel });
export const ORDER = Object.freeze(["zug-sammeln","zug-termin","zug-einkauf","zug-wichteln","zug-reihum","zug-einig","zug-wunschzettel","geschenk-finder","karte-danke","zug-umschlag","advent-tuer","zug-kapsel","zug-advent","zug-gutschein","raum-sorry","zettel","foto-alien","beat-pausenhof","strassenrap-beat","zug-stimme","kanal-geheim","stimme-verzerren","bluff","gruss"]);
const PARAMS = { "advent-tuer": V.params_advent_tuer, "beat-pausenhof": V.params_beat_pausenhof, "bluff": V.params_bluff, "foto-alien": V.params_foto_alien, "geschenk-finder": V.params_geschenk_finder, "gruss": V.params_gruss, "kanal-geheim": V.params_kanal_geheim, "karte-danke": V.params_karte_danke, "raum-sorry": V.params_raum_sorry, "stimme-verzerren": V.params_stimme_verzerren, "strassenrap-beat": V.params_strassenrap_beat, "zettel": V.params_zettel, "zug-advent": V.params_zug_advent, "zug-einig": V.params_zug_einig, "zug-einkauf": V.params_zug_einkauf, "zug-gutschein": V.params_zug_gutschein, "zug-kapsel": V.params_zug_kapsel, "zug-reihum": V.params_zug_reihum, "zug-sammeln": V.params_zug_sammeln, "zug-stimme": V.params_zug_stimme, "zug-termin": V.params_zug_termin, "zug-umschlag": V.params_zug_umschlag, "zug-wichteln": V.params_zug_wichteln, "zug-wunschzettel": V.params_zug_wunschzettel };
const INPUTS = { "geschenk-finder": V.inputs_geschenk_finder, "kanal-geheim": V.inputs_kanal_geheim, "karte-danke": V.inputs_karte_danke, "raum-sorry": V.inputs_raum_sorry, "strassenrap-beat": V.inputs_strassenrap_beat, "zug-advent": V.inputs_zug_advent, "zug-einig": V.inputs_zug_einig, "zug-einkauf": V.inputs_zug_einkauf, "zug-gutschein": V.inputs_zug_gutschein, "zug-kapsel": V.inputs_zug_kapsel, "zug-reihum": V.inputs_zug_reihum, "zug-sammeln": V.inputs_zug_sammeln, "zug-stimme": V.inputs_zug_stimme, "zug-termin": V.inputs_zug_termin, "zug-umschlag": V.inputs_zug_umschlag, "zug-wichteln": V.inputs_zug_wichteln, "zug-wunschzettel": V.inputs_zug_wunschzettel };
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
