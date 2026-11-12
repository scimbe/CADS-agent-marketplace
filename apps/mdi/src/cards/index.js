// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
// Kartenregister (ADR 0001 a): alle Karten erfuellen denselben Vertrag; der Host kennt nur diese Schnittstelle.
// Statische Fassung (Node, Tests, Werkzeuge): alle Karten sind geladen. Im Browser ersetzt der Build sie durch
// src/cards/lazy.js (dieselbe Schnittstelle, Karten als nachladbare Teile, ADR 0001 Nachtrag 2).
import c_advent_tuer from "./advent-tuer/card.js";
import * as v_advent_tuer from "../gen/cards/advent-tuer.js";
import c_arcade_elfer from "./arcade-elfer/card.js";
import * as v_arcade_elfer from "../gen/cards/arcade-elfer.js";
import c_arcade_flipper from "./arcade-flipper/card.js";
import * as v_arcade_flipper from "../gen/cards/arcade-flipper.js";
import c_arcade_kick from "./arcade-kick/card.js";
import * as v_arcade_kick from "../gen/cards/arcade-kick.js";
import c_arcade_murmel from "./arcade-murmel/card.js";
import * as v_arcade_murmel from "../gen/cards/arcade-murmel.js";
import c_arcade_panzer from "./arcade-panzer/card.js";
import * as v_arcade_panzer from "../gen/cards/arcade-panzer.js";
import c_arcade_puck from "./arcade-puck/card.js";
import * as v_arcade_puck from "../gen/cards/arcade-puck.js";
import c_arcade_snow from "./arcade-snow/card.js";
import * as v_arcade_snow from "../gen/cards/arcade-snow.js";
import c_arcade_stock from "./arcade-stock/card.js";
import * as v_arcade_stock from "../gen/cards/arcade-stock.js";
import c_arcade_volley from "./arcade-volley/card.js";
import * as v_arcade_volley from "../gen/cards/arcade-volley.js";
import c_arcade_ziegel from "./arcade-ziegel/card.js";
import * as v_arcade_ziegel from "../gen/cards/arcade-ziegel.js";
import c_beat_pausenhof from "./beat-pausenhof/card.js";
import * as v_beat_pausenhof from "../gen/cards/beat-pausenhof.js";
import c_bluff from "./bluff/card.js";
import * as v_bluff from "../gen/cards/bluff.js";
import c_flug from "./flug/card.js";
import * as v_flug from "../gen/cards/flug.js";
import c_foto_alien from "./foto-alien/card.js";
import * as v_foto_alien from "../gen/cards/foto-alien.js";
import c_frei from "./frei/card.js";
import * as v_frei from "../gen/cards/frei.js";
import c_geschenk_finder from "./geschenk-finder/card.js";
import * as v_geschenk_finder from "../gen/cards/geschenk-finder.js";
import c_gruss from "./gruss/card.js";
import * as v_gruss from "../gen/cards/gruss.js";
import c_kanal_geheim from "./kanal-geheim/card.js";
import * as v_kanal_geheim from "../gen/cards/kanal-geheim.js";
import c_karte_danke from "./karte-danke/card.js";
import * as v_karte_danke from "../gen/cards/karte-danke.js";
import c_lauf from "./lauf/card.js";
import * as v_lauf from "../gen/cards/lauf.js";
import c_quiz_preis from "./quiz-preis/card.js";
import * as v_quiz_preis from "../gen/cards/quiz-preis.js";
import c_raum_sorry from "./raum-sorry/card.js";
import * as v_raum_sorry from "../gen/cards/raum-sorry.js";
import c_spiel_dart from "./spiel-dart/card.js";
import * as v_spiel_dart from "../gen/cards/spiel-dart.js";
import c_stimme_verzerren from "./stimme-verzerren/card.js";
import * as v_stimme_verzerren from "../gen/cards/stimme-verzerren.js";
import c_strassenrap_beat from "./strassenrap-beat/card.js";
import * as v_strassenrap_beat from "../gen/cards/strassenrap-beat.js";
import c_zettel from "./zettel/card.js";
import * as v_zettel from "../gen/cards/zettel.js";
import c_zug_abfragen from "./zug-abfragen/card.js";
import * as v_zug_abfragen from "../gen/cards/zug-abfragen.js";
import c_zug_advent from "./zug-advent/card.js";
import * as v_zug_advent from "../gen/cards/zug-advent.js";
import c_zug_einig from "./zug-einig/card.js";
import * as v_zug_einig from "../gen/cards/zug-einig.js";
import c_zug_einkauf from "./zug-einkauf/card.js";
import * as v_zug_einkauf from "../gen/cards/zug-einkauf.js";
import c_zug_gutschein from "./zug-gutschein/card.js";
import * as v_zug_gutschein from "../gen/cards/zug-gutschein.js";
import c_zug_kapsel from "./zug-kapsel/card.js";
import * as v_zug_kapsel from "../gen/cards/zug-kapsel.js";
import c_zug_malrat from "./zug-malrat/card.js";
import * as v_zug_malrat from "../gen/cards/zug-malrat.js";
import c_zug_reihum from "./zug-reihum/card.js";
import * as v_zug_reihum from "../gen/cards/zug-reihum.js";
import c_zug_sammeln from "./zug-sammeln/card.js";
import * as v_zug_sammeln from "../gen/cards/zug-sammeln.js";
import c_zug_stimme from "./zug-stimme/card.js";
import * as v_zug_stimme from "../gen/cards/zug-stimme.js";
import c_zug_termin from "./zug-termin/card.js";
import * as v_zug_termin from "../gen/cards/zug-termin.js";
import c_zug_typen from "./zug-typen/card.js";
import * as v_zug_typen from "../gen/cards/zug-typen.js";
import c_zug_umschlag from "./zug-umschlag/card.js";
import * as v_zug_umschlag from "../gen/cards/zug-umschlag.js";
import c_zug_wichteln from "./zug-wichteln/card.js";
import * as v_zug_wichteln from "../gen/cards/zug-wichteln.js";
import c_zug_wunschzettel from "./zug-wunschzettel/card.js";
import * as v_zug_wunschzettel from "../gen/cards/zug-wunschzettel.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "advent-tuer": c_advent_tuer, "arcade-elfer": c_arcade_elfer, "arcade-flipper": c_arcade_flipper, "arcade-kick": c_arcade_kick, "arcade-murmel": c_arcade_murmel, "arcade-panzer": c_arcade_panzer, "arcade-puck": c_arcade_puck, "arcade-snow": c_arcade_snow, "arcade-stock": c_arcade_stock, "arcade-volley": c_arcade_volley, "arcade-ziegel": c_arcade_ziegel, "beat-pausenhof": c_beat_pausenhof, "bluff": c_bluff, "flug": c_flug, "foto-alien": c_foto_alien, "frei": c_frei, "geschenk-finder": c_geschenk_finder, "gruss": c_gruss, "kanal-geheim": c_kanal_geheim, "karte-danke": c_karte_danke, "lauf": c_lauf, "quiz-preis": c_quiz_preis, "raum-sorry": c_raum_sorry, "spiel-dart": c_spiel_dart, "stimme-verzerren": c_stimme_verzerren, "strassenrap-beat": c_strassenrap_beat, "zettel": c_zettel, "zug-abfragen": c_zug_abfragen, "zug-advent": c_zug_advent, "zug-einig": c_zug_einig, "zug-einkauf": c_zug_einkauf, "zug-gutschein": c_zug_gutschein, "zug-kapsel": c_zug_kapsel, "zug-malrat": c_zug_malrat, "zug-reihum": c_zug_reihum, "zug-sammeln": c_zug_sammeln, "zug-stimme": c_zug_stimme, "zug-termin": c_zug_termin, "zug-typen": c_zug_typen, "zug-umschlag": c_zug_umschlag, "zug-wichteln": c_zug_wichteln, "zug-wunschzettel": c_zug_wunschzettel });
const VAL = { "advent-tuer": v_advent_tuer, "arcade-elfer": v_arcade_elfer, "arcade-flipper": v_arcade_flipper, "arcade-kick": v_arcade_kick, "arcade-murmel": v_arcade_murmel, "arcade-panzer": v_arcade_panzer, "arcade-puck": v_arcade_puck, "arcade-snow": v_arcade_snow, "arcade-stock": v_arcade_stock, "arcade-volley": v_arcade_volley, "arcade-ziegel": v_arcade_ziegel, "beat-pausenhof": v_beat_pausenhof, "bluff": v_bluff, "flug": v_flug, "foto-alien": v_foto_alien, "frei": v_frei, "geschenk-finder": v_geschenk_finder, "gruss": v_gruss, "kanal-geheim": v_kanal_geheim, "karte-danke": v_karte_danke, "lauf": v_lauf, "quiz-preis": v_quiz_preis, "raum-sorry": v_raum_sorry, "spiel-dart": v_spiel_dart, "stimme-verzerren": v_stimme_verzerren, "strassenrap-beat": v_strassenrap_beat, "zettel": v_zettel, "zug-abfragen": v_zug_abfragen, "zug-advent": v_zug_advent, "zug-einig": v_zug_einig, "zug-einkauf": v_zug_einkauf, "zug-gutschein": v_zug_gutschein, "zug-kapsel": v_zug_kapsel, "zug-malrat": v_zug_malrat, "zug-reihum": v_zug_reihum, "zug-sammeln": v_zug_sammeln, "zug-stimme": v_zug_stimme, "zug-termin": v_zug_termin, "zug-typen": v_zug_typen, "zug-umschlag": v_zug_umschlag, "zug-wichteln": v_zug_wichteln, "zug-wunschzettel": v_zug_wunschzettel };
const META = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, c.manifest]));
const CAPS = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, { bot: typeof c.bot === "function" }]));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const ORDER = Object.freeze(["zug-sammeln","zug-termin","zug-einkauf","zug-wichteln","zug-reihum","zug-einig","zug-wunschzettel","geschenk-finder","karte-danke","zug-umschlag","advent-tuer","zug-kapsel","zug-advent","zug-gutschein","raum-sorry","zettel","foto-alien","beat-pausenhof","strassenrap-beat","zug-stimme","kanal-geheim","flug","lauf","arcade-kick","arcade-elfer","arcade-ziegel","arcade-panzer","arcade-stock","arcade-puck","arcade-volley","arcade-flipper","arcade-snow","arcade-murmel","stimme-verzerren","bluff","gruss","quiz-preis","spiel-dart","zug-abfragen","zug-malrat","zug-typen","frei"]);
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
