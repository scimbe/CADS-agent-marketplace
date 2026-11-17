// Suche mit Tags (Teil home-find, ADR 0001 Nachtrag 4): die Tags beider Sprachen liegen nicht im Kern, sondern hier.
import TAGS from "./catalog-tags.json" with { type: "json" };
import * as R from "./rotation.js";

export function searchIdeas(query, date, names = null, caps = R.WEB_CAPS) { return R.searchIdeas(query, date, names, caps, TAGS); }
