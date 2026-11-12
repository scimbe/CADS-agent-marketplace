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
import c_baukasten from "./baukasten/card.js";
import * as v_baukasten from "../gen/cards/baukasten.js";
import c_baukasten_zug from "./baukasten-zug/card.js";
import * as v_baukasten_zug from "../gen/cards/baukasten-zug.js";
import c_beat_disco from "./beat-disco/card.js";
import * as v_beat_disco from "../gen/cards/beat-disco.js";
import c_beat_pausenhof from "./beat-pausenhof/card.js";
import * as v_beat_pausenhof from "../gen/cards/beat-pausenhof.js";
import c_bluff from "./bluff/card.js";
import * as v_bluff from "../gen/cards/bluff.js";
import c_duell_liest from "./duell-liest/card.js";
import * as v_duell_liest from "../gen/cards/duell-liest.js";
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
import c_karte_ausrede from "./karte-ausrede/card.js";
import * as v_karte_ausrede from "../gen/cards/karte-ausrede.js";
import c_karte_danke from "./karte-danke/card.js";
import * as v_karte_danke from "../gen/cards/karte-danke.js";
import c_karte_regel from "./karte-regel/card.js";
import * as v_karte_regel from "../gen/cards/karte-regel.js";
import c_lauf from "./lauf/card.js";
import * as v_lauf from "../gen/cards/lauf.js";
import c_mut_tierstory from "./mut-tierstory/card.js";
import * as v_mut_tierstory from "../gen/cards/mut-tierstory.js";
import c_mut_werbung from "./mut-werbung/card.js";
import * as v_mut_werbung from "../gen/cards/mut-werbung.js";
import c_quiz_preis from "./quiz-preis/card.js";
import * as v_quiz_preis from "../gen/cards/quiz-preis.js";
import c_raum_damals from "./raum-damals/card.js";
import * as v_raum_damals from "../gen/cards/raum-damals.js";
import c_raum_erklaeren from "./raum-erklaeren/card.js";
import * as v_raum_erklaeren from "../gen/cards/raum-erklaeren.js";
import c_raum_maschine from "./raum-maschine/card.js";
import * as v_raum_maschine from "../gen/cards/raum-maschine.js";
import c_raum_maus from "./raum-maus/card.js";
import * as v_raum_maus from "../gen/cards/raum-maus.js";
import c_raum_papagei from "./raum-papagei/card.js";
import * as v_raum_papagei from "../gen/cards/raum-papagei.js";
import c_raum_sorry from "./raum-sorry/card.js";
import * as v_raum_sorry from "../gen/cards/raum-sorry.js";
import c_raum_streichen from "./raum-streichen/card.js";
import * as v_raum_streichen from "../gen/cards/raum-streichen.js";
import c_raum_suche from "./raum-suche/card.js";
import * as v_raum_suche from "../gen/cards/raum-suche.js";
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
import c_zug_auftrag from "./zug-auftrag/card.js";
import * as v_zug_auftrag from "../gen/cards/zug-auftrag.js";
import c_zug_auktion from "./zug-auktion/card.js";
import * as v_zug_auktion from "../gen/cards/zug-auktion.js";
import c_zug_blitz from "./zug-blitz/card.js";
import * as v_zug_blitz from "../gen/cards/zug-blitz.js";
import c_zug_einig from "./zug-einig/card.js";
import * as v_zug_einig from "../gen/cards/zug-einig.js";
import c_zug_einkauf from "./zug-einkauf/card.js";
import * as v_zug_einkauf from "../gen/cards/zug-einkauf.js";
import c_zug_gutschein from "./zug-gutschein/card.js";
import * as v_zug_gutschein from "../gen/cards/zug-gutschein.js";
import c_zug_hoeflich from "./zug-hoeflich/card.js";
import * as v_zug_hoeflich from "../gen/cards/zug-hoeflich.js";
import c_zug_kapsel from "./zug-kapsel/card.js";
import * as v_zug_kapsel from "../gen/cards/zug-kapsel.js";
import c_zug_kennst from "./zug-kennst/card.js";
import * as v_zug_kennst from "../gen/cards/zug-kennst.js";
import c_zug_kreis from "./zug-kreis/card.js";
import * as v_zug_kreis from "../gen/cards/zug-kreis.js";
import c_zug_lob from "./zug-lob/card.js";
import * as v_zug_lob from "../gen/cards/zug-lob.js";
import c_zug_luecke from "./zug-luecke/card.js";
import * as v_zug_luecke from "../gen/cards/zug-luecke.js";
import c_zug_luege from "./zug-luege/card.js";
import * as v_zug_luege from "../gen/cards/zug-luege.js";
import c_zug_malrat from "./zug-malrat/card.js";
import * as v_zug_malrat from "../gen/cards/zug-malrat.js";
import c_zug_pokal from "./zug-pokal/card.js";
import * as v_zug_pokal from "../gen/cards/zug-pokal.js";
import c_zug_rap from "./zug-rap/card.js";
import * as v_zug_rap from "../gen/cards/zug-rap.js";
import c_zug_reaktion from "./zug-reaktion/card.js";
import * as v_zug_reaktion from "../gen/cards/zug-reaktion.js";
import c_zug_recht from "./zug-recht/card.js";
import * as v_zug_recht from "../gen/cards/zug-recht.js";
import c_zug_reihum from "./zug-reihum/card.js";
import * as v_zug_reihum from "../gen/cards/zug-reihum.js";
import c_zug_sammeln from "./zug-sammeln/card.js";
import * as v_zug_sammeln from "../gen/cards/zug-sammeln.js";
import c_zug_schmuggel from "./zug-schmuggel/card.js";
import * as v_zug_schmuggel from "../gen/cards/zug-schmuggel.js";
import c_zug_snack from "./zug-snack/card.js";
import * as v_zug_snack from "../gen/cards/zug-snack.js";
import c_zug_socken from "./zug-socken/card.js";
import * as v_zug_socken from "../gen/cards/zug-socken.js";
import c_zug_steine from "./zug-steine/card.js";
import * as v_zug_steine from "../gen/cards/zug-steine.js";
import c_zug_stimme from "./zug-stimme/card.js";
import * as v_zug_stimme from "../gen/cards/zug-stimme.js";
import c_zug_termin from "./zug-termin/card.js";
import * as v_zug_termin from "../gen/cards/zug-termin.js";
import c_zug_typen from "./zug-typen/card.js";
import * as v_zug_typen from "../gen/cards/zug-typen.js";
import c_zug_umschlag from "./zug-umschlag/card.js";
import * as v_zug_umschlag from "../gen/cards/zug-umschlag.js";
import c_zug_wette from "./zug-wette/card.js";
import * as v_zug_wette from "../gen/cards/zug-wette.js";
import c_zug_wichteln from "./zug-wichteln/card.js";
import * as v_zug_wichteln from "../gen/cards/zug-wichteln.js";
import c_zug_woerter from "./zug-woerter/card.js";
import * as v_zug_woerter from "../gen/cards/zug-woerter.js";
import c_zug_wort from "./zug-wort/card.js";
import * as v_zug_wort from "../gen/cards/zug-wort.js";
import c_zug_wunschzettel from "./zug-wunschzettel/card.js";
import * as v_zug_wunschzettel from "../gen/cards/zug-wunschzettel.js";
import { CODE_HASH } from "../gen/codehash.js";
import { deriveModes } from "../contract/modes.js";

export const CARDS = Object.freeze({ "advent-tuer": c_advent_tuer, "arcade-elfer": c_arcade_elfer, "arcade-flipper": c_arcade_flipper, "arcade-kick": c_arcade_kick, "arcade-murmel": c_arcade_murmel, "arcade-panzer": c_arcade_panzer, "arcade-puck": c_arcade_puck, "arcade-snow": c_arcade_snow, "arcade-stock": c_arcade_stock, "arcade-volley": c_arcade_volley, "arcade-ziegel": c_arcade_ziegel, "baukasten": c_baukasten, "baukasten-zug": c_baukasten_zug, "beat-disco": c_beat_disco, "beat-pausenhof": c_beat_pausenhof, "bluff": c_bluff, "duell-liest": c_duell_liest, "flug": c_flug, "foto-alien": c_foto_alien, "frei": c_frei, "geschenk-finder": c_geschenk_finder, "gruss": c_gruss, "kanal-geheim": c_kanal_geheim, "karte-ausrede": c_karte_ausrede, "karte-danke": c_karte_danke, "karte-regel": c_karte_regel, "lauf": c_lauf, "mut-tierstory": c_mut_tierstory, "mut-werbung": c_mut_werbung, "quiz-preis": c_quiz_preis, "raum-damals": c_raum_damals, "raum-erklaeren": c_raum_erklaeren, "raum-maschine": c_raum_maschine, "raum-maus": c_raum_maus, "raum-papagei": c_raum_papagei, "raum-sorry": c_raum_sorry, "raum-streichen": c_raum_streichen, "raum-suche": c_raum_suche, "spiel-dart": c_spiel_dart, "stimme-verzerren": c_stimme_verzerren, "strassenrap-beat": c_strassenrap_beat, "zettel": c_zettel, "zug-abfragen": c_zug_abfragen, "zug-advent": c_zug_advent, "zug-auftrag": c_zug_auftrag, "zug-auktion": c_zug_auktion, "zug-blitz": c_zug_blitz, "zug-einig": c_zug_einig, "zug-einkauf": c_zug_einkauf, "zug-gutschein": c_zug_gutschein, "zug-hoeflich": c_zug_hoeflich, "zug-kapsel": c_zug_kapsel, "zug-kennst": c_zug_kennst, "zug-kreis": c_zug_kreis, "zug-lob": c_zug_lob, "zug-luecke": c_zug_luecke, "zug-luege": c_zug_luege, "zug-malrat": c_zug_malrat, "zug-pokal": c_zug_pokal, "zug-rap": c_zug_rap, "zug-reaktion": c_zug_reaktion, "zug-recht": c_zug_recht, "zug-reihum": c_zug_reihum, "zug-sammeln": c_zug_sammeln, "zug-schmuggel": c_zug_schmuggel, "zug-snack": c_zug_snack, "zug-socken": c_zug_socken, "zug-steine": c_zug_steine, "zug-stimme": c_zug_stimme, "zug-termin": c_zug_termin, "zug-typen": c_zug_typen, "zug-umschlag": c_zug_umschlag, "zug-wette": c_zug_wette, "zug-wichteln": c_zug_wichteln, "zug-woerter": c_zug_woerter, "zug-wort": c_zug_wort, "zug-wunschzettel": c_zug_wunschzettel });
const VAL = { "advent-tuer": v_advent_tuer, "arcade-elfer": v_arcade_elfer, "arcade-flipper": v_arcade_flipper, "arcade-kick": v_arcade_kick, "arcade-murmel": v_arcade_murmel, "arcade-panzer": v_arcade_panzer, "arcade-puck": v_arcade_puck, "arcade-snow": v_arcade_snow, "arcade-stock": v_arcade_stock, "arcade-volley": v_arcade_volley, "arcade-ziegel": v_arcade_ziegel, "baukasten": v_baukasten, "baukasten-zug": v_baukasten_zug, "beat-disco": v_beat_disco, "beat-pausenhof": v_beat_pausenhof, "bluff": v_bluff, "duell-liest": v_duell_liest, "flug": v_flug, "foto-alien": v_foto_alien, "frei": v_frei, "geschenk-finder": v_geschenk_finder, "gruss": v_gruss, "kanal-geheim": v_kanal_geheim, "karte-ausrede": v_karte_ausrede, "karte-danke": v_karte_danke, "karte-regel": v_karte_regel, "lauf": v_lauf, "mut-tierstory": v_mut_tierstory, "mut-werbung": v_mut_werbung, "quiz-preis": v_quiz_preis, "raum-damals": v_raum_damals, "raum-erklaeren": v_raum_erklaeren, "raum-maschine": v_raum_maschine, "raum-maus": v_raum_maus, "raum-papagei": v_raum_papagei, "raum-sorry": v_raum_sorry, "raum-streichen": v_raum_streichen, "raum-suche": v_raum_suche, "spiel-dart": v_spiel_dart, "stimme-verzerren": v_stimme_verzerren, "strassenrap-beat": v_strassenrap_beat, "zettel": v_zettel, "zug-abfragen": v_zug_abfragen, "zug-advent": v_zug_advent, "zug-auftrag": v_zug_auftrag, "zug-auktion": v_zug_auktion, "zug-blitz": v_zug_blitz, "zug-einig": v_zug_einig, "zug-einkauf": v_zug_einkauf, "zug-gutschein": v_zug_gutschein, "zug-hoeflich": v_zug_hoeflich, "zug-kapsel": v_zug_kapsel, "zug-kennst": v_zug_kennst, "zug-kreis": v_zug_kreis, "zug-lob": v_zug_lob, "zug-luecke": v_zug_luecke, "zug-luege": v_zug_luege, "zug-malrat": v_zug_malrat, "zug-pokal": v_zug_pokal, "zug-rap": v_zug_rap, "zug-reaktion": v_zug_reaktion, "zug-recht": v_zug_recht, "zug-reihum": v_zug_reihum, "zug-sammeln": v_zug_sammeln, "zug-schmuggel": v_zug_schmuggel, "zug-snack": v_zug_snack, "zug-socken": v_zug_socken, "zug-steine": v_zug_steine, "zug-stimme": v_zug_stimme, "zug-termin": v_zug_termin, "zug-typen": v_zug_typen, "zug-umschlag": v_zug_umschlag, "zug-wette": v_zug_wette, "zug-wichteln": v_zug_wichteln, "zug-woerter": v_zug_woerter, "zug-wort": v_zug_wort, "zug-wunschzettel": v_zug_wunschzettel };
const META = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, c.manifest]));
const CAPS = Object.fromEntries(Object.entries(CARDS).map(([k, c]) => [k, { bot: typeof c.bot === "function" }]));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const ORDER = Object.freeze(["zug-sammeln","zug-termin","zug-einkauf","zug-wichteln","zug-reihum","zug-einig","zug-wunschzettel","geschenk-finder","karte-danke","zug-umschlag","advent-tuer","zug-kapsel","zug-advent","zug-gutschein","raum-sorry","zettel","foto-alien","beat-pausenhof","strassenrap-beat","zug-stimme","kanal-geheim","flug","lauf","arcade-kick","arcade-elfer","arcade-ziegel","arcade-panzer","arcade-stock","arcade-puck","arcade-volley","arcade-flipper","arcade-snow","arcade-murmel","stimme-verzerren","baukasten","baukasten-zug","beat-disco","bluff","duell-liest","gruss","karte-ausrede","karte-regel","mut-tierstory","mut-werbung","quiz-preis","raum-damals","raum-erklaeren","raum-maschine","raum-maus","raum-papagei","raum-streichen","raum-suche","spiel-dart","zug-abfragen","zug-auftrag","zug-auktion","zug-blitz","zug-hoeflich","zug-kennst","zug-kreis","zug-lob","zug-luecke","zug-luege","zug-malrat","zug-pokal","zug-rap","zug-reaktion","zug-recht","zug-schmuggel","zug-snack","zug-socken","zug-steine","zug-typen","zug-wette","zug-woerter","zug-wort","frei"]);
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
