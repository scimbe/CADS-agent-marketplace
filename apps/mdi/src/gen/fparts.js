// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
import * as p0_0 from "../engines/klang/rapbeat.js";
import * as p1_0 from "../ui/home/intent.js";
import * as p1_1 from "../ui/home/search.js";
import * as p2_0 from "../ui/home/qr.js";
import * as p2_1 from "../ui/home/paint.js";
import * as p3_0 from "../ui/home/kalender.js";
import * as p4_0 from "../ui/home/font-atkinson.js";
import * as p5_0 from "../features/frei/view.js";
import * as p5_1 from "../features/frei/texts.js";
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function merge(n, list) { const o = {}; for (const m of list) for (const k of Object.keys(m)) { if (own(o, k)) throw new Error("teil " + n + ": Export doppelt: " + k); o[k] = m[k]; } return Object.freeze(o); }
const MODS = { "klang-rap": merge("klang-rap", [p0_0]), "home-find": merge("home-find", [p1_0, p1_1]), "home-share": merge("home-share", [p2_0, p2_1]), "home-kalender": merge("home-kalender", [p3_0]), "home-font": merge("home-font", [p4_0]), "frei-ui": merge("frei-ui", [p5_0, p5_1]) };
export const PART_NAMES = Object.freeze(Object.keys(MODS));
export function partOf(name) { return own(MODS, name) ? MODS[name] : null; }
export function isPartLoaded(name) { return own(MODS, name); }
export function loadFeatPart(name) { return own(MODS, name) ? Promise.resolve(MODS[name]) : Promise.reject(Object.assign(new Error("teil-unbekannt: " + name), { code: "teil-unbekannt" })); }
