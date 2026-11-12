// Ansichten der freien Karte im KERN (Strang K): was immer sichtbar ist (Einstieg, Deck-Zeile im Regal, "Mit KI"-Knopf) und
// der Zugang zum nachladbaren Teil "frei-ui" (src/features/frei/view.js). Der Teil bekommt alles mit Zustand von hier
// (Statechart, Kartenregister, Renderer); geladen wird er von der Laufzeit vor jedem Ereignis, das in inhalt.frei.* fuehrt
// (needParts, src/features/frei/chart.js). Fehlt er trotzdem, sagt die Ansicht das ehrlich (kein stiller Ersatz).
import { h } from "../../ui/dom.js";
import { machine } from "../../app/machine.js";
import { render } from "../../render/render.js";
import { rng } from "../../contract/sdk.js";
import { ftCore } from "./texts-core.js";
import { ARTS, GENRES, MODES, SOON, previewOf, targetOf, targetIdOf, freiParams } from "./doc.js";
import { cardOf, cardIdOf, modelFields } from "./chart.js";
import { manifestOf } from "../../cards/index.js";
import { crisis } from "../../broker/ai.js";
import { partOf } from "../../gen/fparts.js";

const plainTitle = (s) => String(s || "").replace(/-\|(\p{Ll})/gu, "$1").replace(/-\|/g, "-").replace(/\|/g, " ").trim();
const DEPS = { h, matches: (s, p) => machine.matches(s, p), render, rng, cardOf, cardIdOf, modelFields, manifestOf, crisis, ARTS, GENRES, MODES, SOON, previewOf, targetOf, targetIdOf, freiParams };
let made = null;
/** Die Ansichten des Teils "frei-ui" oder null, solange er nicht geladen ist */
export function freiUi() {
  if (made) return made;
  const mod = partOf("frei-ui");
  if (!mod || typeof mod.makeFreiView !== "function") return null;
  made = mod.makeFreiView(DEPS);
  return made;
}
/** Blaetter inhalt.frei.*: aus dem Teil; ohne Teil ein ehrlicher Ladehinweis (die Laufzeit laedt ihn vor dem Ereignis) */
export function freiView(state, X, dispatch, L) {
  const ui = freiUi();
  if (ui) return ui.freiView(state, X, dispatch, L);
  return { body: [h("p", { class: "hint", role: "status", key: "laden" }, ftCore(state.ctx.lang, "frei_status_wait"))], panel: [], actions: { primary: null, secondary: [] }, heading: ftCore(state.ctx.lang, "create_tile") };
}

/** Einstieg "Eigene Karte", immer sichtbar (Regal, Tagesblatt, Absichten). Offline: ehrlicher Hinweis. */
export function freiEntry(state, X, dispatch) {
  const L = state.ctx.lang, off = state.ctx.konto && state.ctx.konto.err === "netz";
  return h("div", { class: "frei-entry", key: "frei-entry" },
    h("button", { type: "button", class: "btn primary frei-tile", "data-act": "frei", on: { click: () => dispatch({ type: "FREI" }) } },
      h("span", { class: "sc-title" }, ftCore(L, "create_tile")), " ", h("span", { class: "sc-teaser" }, ftCore(L, "create_sub"))),
    off ? h("p", { class: "hint", role: "status" }, ftCore(L, "aiNet")) : null);
}
/** Community-Karten im Regal ("Von anderen"): nur geladene, gepruefte Karten; laden passiert in inhalt.frei.deck. */
export function freiDeckShelf(state, X, dispatch) {
  const L = state.ctx.lang, cards = state.ctx.frei.deck.cards;
  return h("section", { class: "frei-deckshelf", key: "frei-deck", "aria-labelledby": "fds-h" },
    h("h2", { class: "t-label", id: "fds-h" }, ftCore(L, "deck_title")),
    cards.length ? h("div", { class: "seg-row" }, cards.slice(0, 12).map((e) => h("button", { type: "button", class: "seg-opt", key: e.cid, "data-act": "deck-" + e.cid, on: { click: () => dispatch({ type: "DECK_OPEN", cid: e.cid }) } }, "✦ " + plainTitle(e.doc.t || e.doc.x || "")))) : null,
    h("button", { type: "button", class: "btn secondary", "data-act": "deck", on: { click: () => dispatch({ type: "DECK" }) } }, ftCore(L, "deck_open")));
}
/** Knopf "Mit KI" im Bearbeiten-Dialog, wenn der Teil x-model-Felder hat */
export function kiButton(state, X, dispatch, part) {
  const c = state.ctx.cardId && cardOf(state.ctx.cardId);
  if (!c || !modelFields(c.manifest, part).length) return null;
  return h("button", { type: "button", class: "btn secondary", "data-act": "ki", key: "ki", on: { click: () => dispatch({ type: "KI", part }) } }, "✨ " + ftCore(state.ctx.lang, "frei_ki_fill"));
}

