// Feldtypen mit Reiseregeln (KONZEPT §3.2). Eine Quelle fuer Link, Modell (Robot) und Server.
export const FIELD_TYPES = ["text", "color", "choice", "number", "list", "media.local", "media.server", "secret", "stickers", "weather", "kibild", "steps", "slide", "pair", "spiel"];

/**
 * @param {object} prop Schema-Eigenschaft mit x-field, optional x-model
 * @param {{share?:'link'|'short', withLocalMedia?:boolean}} ctx
 * @returns {{link:'yes'|'no'|'ref'|'sealed', model:boolean, server:boolean}}
 */
export function travel(prop, ctx = {}) {
  const f = prop["x-field"];
  switch (f) {
    case "text": case "color": case "choice": case "number": case "list":
    case "stickers": case "steps": case "slide": case "pair": case "spiel":
      return { link: "yes", model: prop["x-model"] === true, server: ctx.share === "short" };
    case "media.local":
      return { link: ctx.withLocalMedia ? "yes" : "no", model: false, server: false };
    case "media.server": case "weather": case "kibild":
      return { link: "ref", model: false, server: true };
    case "secret":
      return { link: "sealed", model: false, server: false };
    default:
      throw new Error("Feldtyp unbekannt: " + f);
  }
}

/** Nur Felder, die im Link reisen duerfen; versiegelte und lokale Medien bleiben weg (Standard). */
// Eine Reiseregel fuer alles, was das Geraet verlaesst (travel): Link, Live-Handshake, Live-Echtzeit, Aufnahme (Geist).
function pickTravel(schema, params, ctx, kinds) {
  const out = {};
  for (const [k, prop] of Object.entries((schema && schema.properties) || {})) {
    if (!params || !(k in params)) continue;
    if (kinds.includes(travel(prop, ctx).link)) out[k] = params[k];
  }
  return out;
}
/** Traegt ein empfangener Parametersatz ein Feld, das nie reist (media.local ohne withLocalMedia)? Dann ist er ungueltig:
 *  eine fremde "local:<id>" zeigte sonst auf den Fotospeicher des Empfaengers (Abfrage, ob er ein Foto hat). */
export function travelsOnly(schema, params, ctx = {}) {
  for (const [k, prop] of Object.entries((schema && schema.properties) || {})) if (params && k in params && params[k] !== "" && params[k] !== null && params[k] !== undefined && travel(prop, ctx).link === "no") return false;
  return true;
}
/** Parameter fuer einen Link (ohne media.local, ohne Geheimnisse). */
export function paramsForLink(schema, params, ctx = {}) { return pickTravel(schema, params, ctx, ["yes", "ref"]); }
/** Parameter fuer den Partner (Live-Handshake, Show, Echtzeit live, Aufnahme): wie der Link, Geheimnisse bleiben (sie
 *  werden dort eigens versiegelt); media.local (Foto auf dem Geraet) reist nie ohne withLocalMedia. Beide Seiten spielen
 *  mit genau diesen Parametern, damit der Zustand (Hash) gleich ist; ein Foto ist reine Darstellung. */
export function paramsForPeer(schema, params, ctx = {}) { return pickTravel(schema, params, ctx, ["yes", "ref", "sealed"]); }

/** Standardwerte aus dem Schema. */
export function defaults(schema) {
  const out = {};
  for (const [k, prop] of Object.entries(schema.properties || {})) if ("default" in prop) out[k] = structuredClone(prop.default);
  return out;
}
