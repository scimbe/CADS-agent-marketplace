// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
import c_advent_tuer from "./advent-tuer/card.js";
import c_beat_disco from "./beat-disco/card.js";
import c_beat_pausenhof from "./beat-pausenhof/card.js";
import c_bluff from "./bluff/card.js";
import c_duell_liest from "./duell-liest/card.js";
import c_foto_alien from "./foto-alien/card.js";
import c_geschenk_finder from "./geschenk-finder/card.js";
import c_gruss from "./gruss/card.js";
import c_kanal_geheim from "./kanal-geheim/card.js";
import c_karte_ausrede from "./karte-ausrede/card.js";
import c_karte_danke from "./karte-danke/card.js";
import c_karte_regel from "./karte-regel/card.js";
import c_mut_tierstory from "./mut-tierstory/card.js";
import c_mut_werbung from "./mut-werbung/card.js";
import c_raum_damals from "./raum-damals/card.js";
import c_raum_erklaeren from "./raum-erklaeren/card.js";
import c_raum_maschine from "./raum-maschine/card.js";
import c_raum_maus from "./raum-maus/card.js";
import c_raum_papagei from "./raum-papagei/card.js";
import c_raum_sorry from "./raum-sorry/card.js";
import c_raum_streichen from "./raum-streichen/card.js";
import c_raum_suche from "./raum-suche/card.js";
import c_stimme_verzerren from "./stimme-verzerren/card.js";
import c_strassenrap_beat from "./strassenrap-beat/card.js";
import c_zettel from "./zettel/card.js";
import c_zug_advent from "./zug-advent/card.js";
import c_zug_auftrag from "./zug-auftrag/card.js";
import c_zug_auktion from "./zug-auktion/card.js";
import c_zug_blitz from "./zug-blitz/card.js";
import c_zug_einig from "./zug-einig/card.js";
import c_zug_einkauf from "./zug-einkauf/card.js";
import c_zug_gutschein from "./zug-gutschein/card.js";
import c_zug_hoeflich from "./zug-hoeflich/card.js";
import c_zug_kapsel from "./zug-kapsel/card.js";
import c_zug_kennst from "./zug-kennst/card.js";
import c_zug_kreis from "./zug-kreis/card.js";
import c_zug_lob from "./zug-lob/card.js";
import c_zug_luecke from "./zug-luecke/card.js";
import c_zug_luege from "./zug-luege/card.js";
import c_zug_pokal from "./zug-pokal/card.js";
import c_zug_rap from "./zug-rap/card.js";
import c_zug_reaktion from "./zug-reaktion/card.js";
import c_zug_recht from "./zug-recht/card.js";
import c_zug_reihum from "./zug-reihum/card.js";
import c_zug_sammeln from "./zug-sammeln/card.js";
import c_zug_schmuggel from "./zug-schmuggel/card.js";
import c_zug_snack from "./zug-snack/card.js";
import c_zug_socken from "./zug-socken/card.js";
import c_zug_steine from "./zug-steine/card.js";
import c_zug_stimme from "./zug-stimme/card.js";
import c_zug_termin from "./zug-termin/card.js";
import c_zug_umschlag from "./zug-umschlag/card.js";
import c_zug_wette from "./zug-wette/card.js";
import c_zug_wichteln from "./zug-wichteln/card.js";
import c_zug_woerter from "./zug-woerter/card.js";
import c_zug_wort from "./zug-wort/card.js";
import c_zug_wunschzettel from "./zug-wunschzettel/card.js";
import * as V from "../gen/validators.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "advent-tuer": c_advent_tuer, "beat-disco": c_beat_disco, "beat-pausenhof": c_beat_pausenhof, "bluff": c_bluff, "duell-liest": c_duell_liest, "foto-alien": c_foto_alien, "geschenk-finder": c_geschenk_finder, "gruss": c_gruss, "kanal-geheim": c_kanal_geheim, "karte-ausrede": c_karte_ausrede, "karte-danke": c_karte_danke, "karte-regel": c_karte_regel, "mut-tierstory": c_mut_tierstory, "mut-werbung": c_mut_werbung, "raum-damals": c_raum_damals, "raum-erklaeren": c_raum_erklaeren, "raum-maschine": c_raum_maschine, "raum-maus": c_raum_maus, "raum-papagei": c_raum_papagei, "raum-sorry": c_raum_sorry, "raum-streichen": c_raum_streichen, "raum-suche": c_raum_suche, "stimme-verzerren": c_stimme_verzerren, "strassenrap-beat": c_strassenrap_beat, "zettel": c_zettel, "zug-advent": c_zug_advent, "zug-auftrag": c_zug_auftrag, "zug-auktion": c_zug_auktion, "zug-blitz": c_zug_blitz, "zug-einig": c_zug_einig, "zug-einkauf": c_zug_einkauf, "zug-gutschein": c_zug_gutschein, "zug-hoeflich": c_zug_hoeflich, "zug-kapsel": c_zug_kapsel, "zug-kennst": c_zug_kennst, "zug-kreis": c_zug_kreis, "zug-lob": c_zug_lob, "zug-luecke": c_zug_luecke, "zug-luege": c_zug_luege, "zug-pokal": c_zug_pokal, "zug-rap": c_zug_rap, "zug-reaktion": c_zug_reaktion, "zug-recht": c_zug_recht, "zug-reihum": c_zug_reihum, "zug-sammeln": c_zug_sammeln, "zug-schmuggel": c_zug_schmuggel, "zug-snack": c_zug_snack, "zug-socken": c_zug_socken, "zug-steine": c_zug_steine, "zug-stimme": c_zug_stimme, "zug-termin": c_zug_termin, "zug-umschlag": c_zug_umschlag, "zug-wette": c_zug_wette, "zug-wichteln": c_zug_wichteln, "zug-woerter": c_zug_woerter, "zug-wort": c_zug_wort, "zug-wunschzettel": c_zug_wunschzettel });
export const ORDER = Object.freeze(["zug-sammeln","zug-termin","zug-einkauf","zug-wichteln","zug-reihum","zug-einig","zug-wunschzettel","geschenk-finder","karte-danke","zug-umschlag","advent-tuer","zug-kapsel","zug-advent","zug-gutschein","raum-sorry","zettel","foto-alien","beat-pausenhof","strassenrap-beat","zug-stimme","kanal-geheim","stimme-verzerren","beat-disco","bluff","duell-liest","gruss","karte-ausrede","karte-regel","mut-tierstory","mut-werbung","raum-damals","raum-erklaeren","raum-maschine","raum-maus","raum-papagei","raum-streichen","raum-suche","zug-auftrag","zug-auktion","zug-blitz","zug-hoeflich","zug-kennst","zug-kreis","zug-lob","zug-luecke","zug-luege","zug-pokal","zug-rap","zug-reaktion","zug-recht","zug-schmuggel","zug-snack","zug-socken","zug-steine","zug-wette","zug-woerter","zug-wort"]);
const PARAMS = { "advent-tuer": V.params_advent_tuer, "beat-disco": V.params_beat_disco, "beat-pausenhof": V.params_beat_pausenhof, "bluff": V.params_bluff, "duell-liest": V.params_duell_liest, "foto-alien": V.params_foto_alien, "geschenk-finder": V.params_geschenk_finder, "gruss": V.params_gruss, "kanal-geheim": V.params_kanal_geheim, "karte-ausrede": V.params_karte_ausrede, "karte-danke": V.params_karte_danke, "karte-regel": V.params_karte_regel, "mut-tierstory": V.params_mut_tierstory, "mut-werbung": V.params_mut_werbung, "raum-damals": V.params_raum_damals, "raum-erklaeren": V.params_raum_erklaeren, "raum-maschine": V.params_raum_maschine, "raum-maus": V.params_raum_maus, "raum-papagei": V.params_raum_papagei, "raum-sorry": V.params_raum_sorry, "raum-streichen": V.params_raum_streichen, "raum-suche": V.params_raum_suche, "stimme-verzerren": V.params_stimme_verzerren, "strassenrap-beat": V.params_strassenrap_beat, "zettel": V.params_zettel, "zug-advent": V.params_zug_advent, "zug-auftrag": V.params_zug_auftrag, "zug-auktion": V.params_zug_auktion, "zug-blitz": V.params_zug_blitz, "zug-einig": V.params_zug_einig, "zug-einkauf": V.params_zug_einkauf, "zug-gutschein": V.params_zug_gutschein, "zug-hoeflich": V.params_zug_hoeflich, "zug-kapsel": V.params_zug_kapsel, "zug-kennst": V.params_zug_kennst, "zug-kreis": V.params_zug_kreis, "zug-lob": V.params_zug_lob, "zug-luecke": V.params_zug_luecke, "zug-luege": V.params_zug_luege, "zug-pokal": V.params_zug_pokal, "zug-rap": V.params_zug_rap, "zug-reaktion": V.params_zug_reaktion, "zug-recht": V.params_zug_recht, "zug-reihum": V.params_zug_reihum, "zug-sammeln": V.params_zug_sammeln, "zug-schmuggel": V.params_zug_schmuggel, "zug-snack": V.params_zug_snack, "zug-socken": V.params_zug_socken, "zug-steine": V.params_zug_steine, "zug-stimme": V.params_zug_stimme, "zug-termin": V.params_zug_termin, "zug-umschlag": V.params_zug_umschlag, "zug-wette": V.params_zug_wette, "zug-wichteln": V.params_zug_wichteln, "zug-woerter": V.params_zug_woerter, "zug-wort": V.params_zug_wort, "zug-wunschzettel": V.params_zug_wunschzettel };
const INPUTS = { "beat-disco": V.inputs_beat_disco, "duell-liest": V.inputs_duell_liest, "geschenk-finder": V.inputs_geschenk_finder, "kanal-geheim": V.inputs_kanal_geheim, "karte-ausrede": V.inputs_karte_ausrede, "karte-danke": V.inputs_karte_danke, "karte-regel": V.inputs_karte_regel, "mut-tierstory": V.inputs_mut_tierstory, "mut-werbung": V.inputs_mut_werbung, "raum-damals": V.inputs_raum_damals, "raum-erklaeren": V.inputs_raum_erklaeren, "raum-maschine": V.inputs_raum_maschine, "raum-maus": V.inputs_raum_maus, "raum-papagei": V.inputs_raum_papagei, "raum-sorry": V.inputs_raum_sorry, "raum-streichen": V.inputs_raum_streichen, "raum-suche": V.inputs_raum_suche, "strassenrap-beat": V.inputs_strassenrap_beat, "zug-advent": V.inputs_zug_advent, "zug-auftrag": V.inputs_zug_auftrag, "zug-auktion": V.inputs_zug_auktion, "zug-blitz": V.inputs_zug_blitz, "zug-einig": V.inputs_zug_einig, "zug-einkauf": V.inputs_zug_einkauf, "zug-gutschein": V.inputs_zug_gutschein, "zug-hoeflich": V.inputs_zug_hoeflich, "zug-kapsel": V.inputs_zug_kapsel, "zug-kennst": V.inputs_zug_kennst, "zug-kreis": V.inputs_zug_kreis, "zug-lob": V.inputs_zug_lob, "zug-luecke": V.inputs_zug_luecke, "zug-luege": V.inputs_zug_luege, "zug-pokal": V.inputs_zug_pokal, "zug-rap": V.inputs_zug_rap, "zug-reaktion": V.inputs_zug_reaktion, "zug-recht": V.inputs_zug_recht, "zug-reihum": V.inputs_zug_reihum, "zug-sammeln": V.inputs_zug_sammeln, "zug-schmuggel": V.inputs_zug_schmuggel, "zug-snack": V.inputs_zug_snack, "zug-socken": V.inputs_zug_socken, "zug-steine": V.inputs_zug_steine, "zug-stimme": V.inputs_zug_stimme, "zug-termin": V.inputs_zug_termin, "zug-umschlag": V.inputs_zug_umschlag, "zug-wette": V.inputs_zug_wette, "zug-wichteln": V.inputs_zug_wichteln, "zug-woerter": V.inputs_zug_woerter, "zug-wort": V.inputs_zug_wort, "zug-wunschzettel": V.inputs_zug_wunschzettel };
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
