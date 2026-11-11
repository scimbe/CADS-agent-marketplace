// Feldtypen mit Reiseregeln (KONZEPT §3.2). Eine Quelle fuer Link, Modell (Robot) und Server.
export const FIELD_TYPES = ["text", "color", "choice", "number", "list", "media.local", "media.server", "secret"];

/**
 * @param {object} prop Schema-Eigenschaft mit x-field, optional x-model
 * @param {{share?:'link'|'short', withLocalMedia?:boolean}} ctx
 * @returns {{link:'yes'|'no'|'ref'|'sealed', model:boolean, server:boolean}}
 */
export function travel(prop, ctx = {}) {
  const f = prop["x-field"];
  switch (f) {
    case "text": case "color": case "choice": case "number": case "list":
      return { link: "yes", model: prop["x-model"] === true, server: ctx.share === "short" };
    case "media.local":
      return { link: ctx.withLocalMedia ? "yes" : "no", model: false, server: false };
    case "media.server":
      return { link: "ref", model: false, server: true };
    case "secret":
      return { link: "sealed", model: false, server: false };
    default:
      throw new Error("Feldtyp unbekannt: " + f);
  }
}

/** Nur Felder, die im Link reisen duerfen; versiegelte und lokale Medien bleiben weg (Standard). */
export function paramsForLink(schema, params, ctx = {}) {
  const out = {};
  for (const [k, prop] of Object.entries(schema.properties || {})) {
    if (!(k in params)) continue;
    const t = travel(prop, ctx);
    if (t.link === "yes" || t.link === "ref") out[k] = params[k];
  }
  return out;
}

/** Standardwerte aus dem Schema. */
export function defaults(schema) {
  const out = {};
  for (const [k, prop] of Object.entries(schema.properties || {})) if ("default" in prop) out[k] = structuredClone(prop.default);
  return out;
}
