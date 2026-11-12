// Vorschau einer Karte im Startzustand, fuer jede Kartenart ueber ihren eigenen Vertrag (keine Sonderlogik je Karte, A3):
//   Zug-/Raum-/Tischkarten und statische Karten: init -> observe(Sitz 0) -> view (Zugvertrag, src/contract/session.js)
//   Echtzeitkarten: Partie ueber createMatch (src/app/rt/match.js) mit Bot gegen Bot (ohne bot(): leere Eingaben),
//   feste Zahl Ticks, dann view(Sitz 0, reduziert) -> Canvas-Anzeigeliste (ADR 0001 b; dieselbe Regel wie das Startbild
//   der Thumbnails, ADR 0001 d "nach festen n Ticks mit Bot gegen Bot").
// Deterministisch: fester Seed "preview", keine Uhr. Wirft nie still: ein Vertragsfehler kommt als Fehler heraus.
import { rng } from "../contract/sdk.js";
import { createMatch } from "../app/rt/match.js";

export const PREVIEW_SEED = "preview";
export const PREVIEW_TICKS = 90; // 1,5 s bei 60 Hz: Spielfeld im Lauf, noch kein Ergebnis (kein Endstand-Spoiler, 13 §3.2)

/** Startzustand als Anzeigeliste. @param vctx view-ctx (G.viewCtx) */
export function previewNode(card, params, vctx = {}) {
  const m = card.manifest;
  if (m.mode === "realtime") {
    const roles = Array.from({ length: m.players.max }, () => (typeof card.bot === "function" ? "bot" : "none"));
    const match = createMatch(card, { params, seed: PREVIEW_SEED, roles, level: 2 });
    const n = m.rt && m.rt.preview && Number.isInteger(m.rt.preview.ticks) ? m.rt.preview.ticks : PREVIEW_TICKS;
    for (let i = 0; i < n && !match.status().over; i++) match.step({});
    return match.view({ ...vctx, seat: 0, reduced: true, preview: true });
  }
  const st = card.init({ rng: rng(PREVIEW_SEED), params, players: m.players.max });
  return card.view(card.observe(st, 0), 0, vctx);
}
