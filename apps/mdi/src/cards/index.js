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
import c_flug from "./flug/card.js";
import c_frei from "./frei/card.js";
import c_geschenk_finder from "./geschenk-finder/card.js";
import c_gruss from "./gruss/card.js";
import c_karte_danke from "./karte-danke/card.js";
import c_lauf from "./lauf/card.js";
import c_quiz_preis from "./quiz-preis/card.js";
import c_raum_sorry from "./raum-sorry/card.js";
import c_spiel_dart from "./spiel-dart/card.js";
import c_zug_abfragen from "./zug-abfragen/card.js";
import c_zug_einig from "./zug-einig/card.js";
import c_zug_einkauf from "./zug-einkauf/card.js";
import c_zug_gutschein from "./zug-gutschein/card.js";
import c_zug_kapsel from "./zug-kapsel/card.js";
import c_zug_malrat from "./zug-malrat/card.js";
import c_zug_reihum from "./zug-reihum/card.js";
import c_zug_sammeln from "./zug-sammeln/card.js";
import c_zug_termin from "./zug-termin/card.js";
import c_zug_typen from "./zug-typen/card.js";
import c_zug_umschlag from "./zug-umschlag/card.js";
import c_zug_wichteln from "./zug-wichteln/card.js";
import c_zug_wunschzettel from "./zug-wunschzettel/card.js";
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "arcade-elfer": c_arcade_elfer, "arcade-flipper": c_arcade_flipper, "arcade-kick": c_arcade_kick, "arcade-murmel": c_arcade_murmel, "arcade-panzer": c_arcade_panzer, "arcade-puck": c_arcade_puck, "arcade-snow": c_arcade_snow, "arcade-stock": c_arcade_stock, "arcade-volley": c_arcade_volley, "arcade-ziegel": c_arcade_ziegel, "bluff": c_bluff, "flug": c_flug, "frei": c_frei, "geschenk-finder": c_geschenk_finder, "gruss": c_gruss, "karte-danke": c_karte_danke, "lauf": c_lauf, "quiz-preis": c_quiz_preis, "raum-sorry": c_raum_sorry, "spiel-dart": c_spiel_dart, "zug-abfragen": c_zug_abfragen, "zug-einig": c_zug_einig, "zug-einkauf": c_zug_einkauf, "zug-gutschein": c_zug_gutschein, "zug-kapsel": c_zug_kapsel, "zug-malrat": c_zug_malrat, "zug-reihum": c_zug_reihum, "zug-sammeln": c_zug_sammeln, "zug-termin": c_zug_termin, "zug-typen": c_zug_typen, "zug-umschlag": c_zug_umschlag, "zug-wichteln": c_zug_wichteln, "zug-wunschzettel": c_zug_wunschzettel });
export const ORDER = Object.freeze(["zug-sammeln","zug-termin","zug-einkauf","zug-wichteln","zug-reihum","zug-einig","zug-wunschzettel","geschenk-finder","karte-danke","zug-umschlag","zug-kapsel","zug-gutschein","raum-sorry","flug","lauf","arcade-kick","arcade-elfer","arcade-ziegel","arcade-panzer","arcade-stock","arcade-puck","arcade-volley","arcade-flipper","arcade-snow","arcade-murmel","bluff","gruss","quiz-preis","spiel-dart","zug-abfragen","zug-malrat","zug-typen","frei"]);
const PARAMS = { "arcade-elfer": V.params_arcade_elfer, "arcade-flipper": V.params_arcade_flipper, "arcade-kick": V.params_arcade_kick, "arcade-murmel": V.params_arcade_murmel, "arcade-panzer": V.params_arcade_panzer, "arcade-puck": V.params_arcade_puck, "arcade-snow": V.params_arcade_snow, "arcade-stock": V.params_arcade_stock, "arcade-volley": V.params_arcade_volley, "arcade-ziegel": V.params_arcade_ziegel, "bluff": V.params_bluff, "flug": V.params_flug, "frei": V.params_frei, "geschenk-finder": V.params_geschenk_finder, "gruss": V.params_gruss, "karte-danke": V.params_karte_danke, "lauf": V.params_lauf, "quiz-preis": V.params_quiz_preis, "raum-sorry": V.params_raum_sorry, "spiel-dart": V.params_spiel_dart, "zug-abfragen": V.params_zug_abfragen, "zug-einig": V.params_zug_einig, "zug-einkauf": V.params_zug_einkauf, "zug-gutschein": V.params_zug_gutschein, "zug-kapsel": V.params_zug_kapsel, "zug-malrat": V.params_zug_malrat, "zug-reihum": V.params_zug_reihum, "zug-sammeln": V.params_zug_sammeln, "zug-termin": V.params_zug_termin, "zug-typen": V.params_zug_typen, "zug-umschlag": V.params_zug_umschlag, "zug-wichteln": V.params_zug_wichteln, "zug-wunschzettel": V.params_zug_wunschzettel };
const INPUTS = { "geschenk-finder": V.inputs_geschenk_finder, "karte-danke": V.inputs_karte_danke, "quiz-preis": V.inputs_quiz_preis, "raum-sorry": V.inputs_raum_sorry, "spiel-dart": V.inputs_spiel_dart, "zug-abfragen": V.inputs_zug_abfragen, "zug-einig": V.inputs_zug_einig, "zug-einkauf": V.inputs_zug_einkauf, "zug-gutschein": V.inputs_zug_gutschein, "zug-kapsel": V.inputs_zug_kapsel, "zug-malrat": V.inputs_zug_malrat, "zug-reihum": V.inputs_zug_reihum, "zug-sammeln": V.inputs_zug_sammeln, "zug-termin": V.inputs_zug_termin, "zug-typen": V.inputs_zug_typen, "zug-umschlag": V.inputs_zug_umschlag, "zug-wichteln": V.inputs_zug_wichteln, "zug-wunschzettel": V.inputs_zug_wunschzettel };
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
