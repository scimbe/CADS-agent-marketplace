// Modi einer Karte, abgeleitet aus dem Manifest (A3: keine Kartensonderlogik im Host). ADR 0001 f/b.
//   static   -> link, live (zeigen)
//   turn     -> alone; mit 2+ Sitzen bot, link; live nur mit genau 2 Sitzen (Gruppen-Live ist Stufe 2)
//   realtime -> alone; bot, wenn die Karte bot() hat; live, wenn rt.net != none und 2 Sitze (Geist: nach dem Spiel)
// manifest.modes schneidet die abgeleitete Menge (z. B. Tischkarten ohne link). Reihenfolge bleibt fest.
export const ALL_MODES = ["alone", "bot", "link", "live", "ghost"];

export function deriveModes(card, variantId = null) {
  const m = card.manifest;
  let out;
  if (m.mode === "static") out = ["link", "live"];
  else if (m.mode === "realtime") {
    out = ["alone"];
    if (m.players.max >= 2 && typeof card.bot === "function") out.push("bot");
    if (m.players.max === 2 && m.rt.net !== "none") out.push("live");
    // Geist ist kein waehlbarer Modus: er entsteht nach einer Partie (Link senden) und beim Empfang des Links
  } else {
    out = ["alone"];
    if (m.players.max >= 2) out.push("bot", "link");
    if (m.players.max === 2) out.push("live");
  }
  if (Array.isArray(m.modes)) out = out.filter((x) => m.modes.includes(x));
  if (variantId) {
    const v = (m.variants || []).find((x) => x.id === variantId);
    if (v && Array.isArray(v.modes)) out = out.filter((x) => v.modes.includes(x));
  }
  return out;
}

/** Vorauswahl und angebotene Knoepfe (13 §6.4): play.offer ∩ Modi, default darin; sonst erste Modi. */
export function playOf(card) {
  const modes = deriveModes(card), p = card.manifest.play;
  if (!p) return { default: modes[0], offer: modes.slice(0, 3) };
  const offer = p.offer.filter((x) => modes.includes(x));
  return { default: offer.includes(p.default) ? p.default : offer[0] || modes[0], offer: offer.length ? offer : modes.slice(0, 3) };
}
