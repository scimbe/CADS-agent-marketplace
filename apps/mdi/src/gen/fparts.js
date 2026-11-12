// ERZEUGT von scripts/gen.js – nicht von Hand aendern.
/* eslint-disable */
import * as p0_0 from "../engines/klang/rapbeat.js";
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function merge(n, list) { const o = {}; for (const m of list) for (const k of Object.keys(m)) { if (own(o, k)) throw new Error("teil " + n + ": Export doppelt: " + k); o[k] = m[k]; } return Object.freeze(o); }
const MODS = { "klang-rap": merge("klang-rap", [p0_0]) };
export const PART_NAMES = Object.freeze(Object.keys(MODS));
export function partOf(name) { return own(MODS, name) ? MODS[name] : null; }
export function isPartLoaded(name) { return own(MODS, name); }
export function loadFeatPart(name) { return own(MODS, name) ? Promise.resolve(MODS[name]) : Promise.reject(Object.assign(new Error("teil-unbekannt: " + name), { code: "teil-unbekannt" })); }
