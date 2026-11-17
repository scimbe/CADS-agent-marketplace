// Teile, die der Host jeder Karte gibt (Blasen-Muster): Magie (KI fuellt offene Felder, rot) und Signatur (Logo,
// Hintergrund, Name aus Mein Stil). Kartenteile duerfen diese Namen nicht tragen (test/blasen-vertrag.test.js).
export const HOST_PARTS = [
  { id: "magie", kind: "ki", label: { de: "Magie", en: "Magic" }, params: [] },
  { id: "signatur", kind: "sig", label: { de: "Signatur", en: "Signature" }, params: [] }
];
export const HOST_PART_IDS = HOST_PARTS.map((p) => p.id);
/** Felder eines Kartenteils, die die KI fuellen kann (Text mit x-model), wie Strang K (features/frei/chart.js modelFields). */
export function kiFields(manifest, part) {
  return part.params.filter((k) => { const p = manifest.params.properties[k]; return p && p["x-model"] === true && p["x-field"] === "text"; });
}
