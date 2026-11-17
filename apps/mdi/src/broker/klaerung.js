// Klaerungsdienst des Clients (Freie Karte 2, P1): EIN Ort, der POST /api/duell/klaerung/* spricht. Der Server entscheidet
// alles (Moderation, Grenzen, Kosten, Nachbessern-Zaehler); hier wird nur ehrlich abgebildet, was zurueckkam.
// Server: CADS-DEMO-wrapper lib/duell-klaerung.mjs.
//
//   -> { how: "ok", body } | { how, reason?, help?, vorschlaege?, frage? }
//   how: login | age16 | paused | throttled | daily | crisis | refused | blocked | bad | gone | limit | conflict | unknown |
//        off | netz | nicht-hier

export const OPS = ["an", "fragen", "antwort", "liste", "auftrag", "optin", "status", "nachbessern", "melden", "behalten"];

/** Bedeutung einer Serverantwort */
export function klaerVerdict(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 200 || status === 202) return { how: "ok", body: b };
  if (status === 401) return { how: "login" };
  if (status === 403) return { how: b.error === "age16" ? "age16" : "paused" };
  if (status === 429) return { how: b.error === "daily-cap" ? "daily" : "throttled" };
  if (status === 422 && b.why === "crisis") return { how: "crisis", help: typeof b.help === "string" ? b.help.slice(0, 300) : "" };
  if (status === 422) {
    return { how: b.error === "blocked" ? "blocked" : "refused", reason: typeof b.reason === "string" && /^[a-z_]{1,20}$/.test(b.reason) ? b.reason : "other",
      vorschlaege: Array.isArray(b.vorschlaege) ? b.vorschlaege.filter(Number.isInteger).slice(0, 2) : [], ...(Number.isInteger(b.frage) ? { frage: b.frage } : {}) };
  }
  if (status === 502) return { how: "bad" };
  if (status === 410) return { how: "gone" };
  if (status === 409) return b.error === "limit" ? { how: "limit" } : { how: "conflict", reason: typeof b.error === "string" ? b.error.slice(0, 30) : "" };
  if (status === 404) return { how: "unknown" };
  return { how: "off" };
}

/** @param {{raw(method:string, path:string, body?:object):Promise<object>}} deps.api  src/broker/api.js */
export function createKlaerung({ api }) {
  const out = {};
  for (const op of OPS) out[op] = async (body) => {
    const r = await api.raw("POST", "/api/duell/klaerung/" + op, body);
    if (!r.status) return { how: r.error === "nicht-hier" ? "nicht-hier" : "netz" };
    return klaerVerdict(r.status, r.body);
  };
  return out;
}
