// Kachel 16:9 in YouTube-Art (Design-System Phase C): grosses Bild, Familie oben links, Dauer oben rechts, fetter Kurztitel
// als Tafel unten links (Anton, 2-4 Woerter, Bild bleibt textfrei). Bild = Startzustand-Screenshot (Thumbnail-Teile, Strang F),
// sonst die gestaltete Familienflaeche (Strahlen + Form). Karten, die es im neuen Code noch nicht gibt: Plakette "kommt",
// kein Knopf zum Oeffnen, aber Merken.
import { h } from "../dom.js";
import { familyOf, newIdOf, variantOf, family } from "./families.js";
import { fmt } from "./texts.js";
import { isSaved } from "./store.js";

export const SHAPE_PATH = {
  star: "M50 6l11 32h34L67 58l11 34-28-21-28 21 11-34L5 38h34z",
  heart: "M50 88C22 66 6 50 6 31 6 16 18 6 31 6c9 0 15 5 19 12 4-7 10-12 19-12 13 0 25 10 25 25 0 19-16 35-44 57z",
  bolt: "M58 4L18 56h27l-8 40 45-56H55l9-36z",
  drop: "M50 6S16 47 16 65c0 19 15 30 34 30s34-11 34-30C84 47 50 6 50 6z",
  coin: "M50 8a42 42 0 1 0 0.1 0z",
  ring: "M50 14a36 36 0 1 0 0.1 0zM50 34a16 16 0 1 1-0.1 0z",
  grid: "M10 10h34v34H10zM56 10h34v34H56zM10 56h34v34H10zM56 56h34v34H56z",
  plus: "M40 8h20v32h32v20H60v32H40V60H8V40h32z"
};
export function icon(shape, cls = "h-ico") {
  return h("svg", { class: cls, viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" }, h("path", { d: SHAPE_PATH[shape] || SHAPE_PATH.star }));
}
export function ideaText(idea, lang) { const L = idea[lang] || idea.de; return { t: L.t, s: L.s }; }
export function plateLines(t) { return String(t).split("|").map((x) => x.trim()).filter(Boolean); }
export function duration(min, X) { return min >= 120 ? fmt(X.mins, { n: Math.round(min / 60) }) : fmt(X.sec, { n: min }); }
export function badge(idea, X) { return idea.how ? X.bdg[idea.how] || X.bdg.link : X.bdg[idea.kind] || ""; }

/** Schluessel eines Startbilds: Karte oder Karte/Variante (wie parts.thumb, ADR 0001 d) */
export function thumbKey(id, variant) { return variant ? id + "/" + variant : id; }
/** Kunstflaeche einer Kachel: echtes Startbild (ctx.thumbs, nachgeladen), sonst die Familienflaeche. */
export function art(fam, key, alt, thumbs) {
  const src = key && thumbs && typeof thumbs[key] === "string" ? thumbs[key] : null;
  // draggable=false: sonst startet beim Wischen ueber das Startbild das Ziehen des Bildes (pointercancel), das Blatt blaettert nicht
  if (src) return h("img", { class: "h-art", src, alt: alt || "", loading: "lazy", draggable: "false" });
  return h("span", { class: "h-art h-art-fam fam-" + fam.id, "aria-hidden": "true" }, h("span", { class: "h-rays" }), icon(fam.shape, "h-art-shape"));
}

/**
 * Kachel fuer eine Katalogkarte.
 * @param o { idea, X, lang, dispatch, saved, extra?: vnode, key?, small? }
 */
export function ideaTile(o) {
  const { idea, X, lang, dispatch } = o, fam = familyOf(idea.id) || family("gruessen"), nid = newIdOf(idea.id), tx = ideaText(idea, lang);
  const title = plateLines(tx.t).join(" "), on = isSaved(o.saved, idea.id);
  const thumb = h("span", { class: "h-thumb" + (o.small ? " small" : "") },
    art(fam, nid ? thumbKey(nid, variantOf(idea.id)) : null, fmt(X.thumbAlt, { t: title }), o.thumbs),
    o.noFam ? null : h("span", { class: "h-fam fam-" + fam.id }, X.families[fam.id]),
    idea.min ? h("span", { class: "h-dur" }, duration(idea.min, X)) : null,
    h("span", { class: "h-plate" }, plateLines(tx.t).map((l, i) => h("span", { key: String(i) }, l))));
  // "kommt" steht unter dem Bild, nicht darauf: nichts verdeckt die Titeltafel
  const meta = h("span", { class: "h-meta" }, nid ? null : h("span", { class: "h-soon small" }, X.soon), h("span", { class: "h-sub" }, badge(idea, X) + (o.extra ? " · " + o.extra : "")));
  const heart = h("button", { type: "button", class: "h-heart", "aria-pressed": on ? "true" : "false", "aria-label": (on ? X.unsave : X.save) + ": " + title, "data-act": "merken-" + idea.id, on: { click: () => dispatch({ type: "MERKEN", id: idea.id }) } }, icon("heart", "h-ico"));
  const main = nid
    ? h("button", { type: "button", class: "h-tile-open", "data-act": "open-" + nid, "aria-label": title + ", " + badge(idea, X) + (idea.min ? ", " + duration(idea.min, X) : ""), on: { click: () => dispatch({ type: "OPEN", id: nid, ...(variantOf(idea.id) ? { variant: variantOf(idea.id) } : {}) }) } }, thumb)
    : h("div", { class: "h-tile-open soon", role: "img", "aria-label": fmt(X.soonA11y, { t: title }) }, thumb);
  return h("div", { class: "h-tile", key: o.key || idea.id }, main, h("div", { class: "h-tile-foot" }, meta, heart));
}

/** Kachel fuer eine Karte, die es nur im neuen Code gibt (kein Katalogeintrag). */
export function extraTile({ id, fam, manifest }, X, lang, dispatch, saved, noFam = false, thumbs = null) {
  const title = manifest.title[lang] || manifest.title.de, on = isSaved(saved, id);
  return h("div", { class: "h-tile", key: "x-" + id },
    h("button", { type: "button", class: "h-tile-open", "data-act": "open-" + id, "aria-label": title, on: { click: () => dispatch({ type: "OPEN", id }) } },
      h("span", { class: "h-thumb" }, art(fam, id, fmt(X.thumbAlt, { t: title }), thumbs), noFam ? null : h("span", { class: "h-fam fam-" + fam.id }, X.families[fam.id]), h("span", { class: "h-plate" }, h("span", null, title)))),
    h("div", { class: "h-tile-foot" }, h("span", { class: "h-meta" }, h("span", { class: "h-sub" }, manifest.teaser ? manifest.teaser[lang] || manifest.teaser.de : "")),
      h("button", { type: "button", class: "h-heart", "aria-pressed": on ? "true" : "false", "aria-label": (on ? X.unsave : X.save) + ": " + title, "data-act": "merken-" + id, on: { click: () => dispatch({ type: "MERKEN", id }) } }, icon("heart", "h-ico"))));
}
