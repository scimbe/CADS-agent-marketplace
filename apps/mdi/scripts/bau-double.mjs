// Model double for G3 (game builder) in scripts/record-frei.mjs (Strang K). Answers exactly the calls of lib/duell-bau.mjs:
//   check (with schema.properties.takt: G3 wish) -> takt; card_bau_zug -> quiz; card_bau_szene / card_bau_regeln -> flappy in
//   two steps; bau_fakten -> question 0 "falsch" (shows bau:fakten-entfernt:1 + bau:fakten-unkalibriert, 3 of 4 remain).
// BAU_MODE: "quiz" | "flug" | "kaputt" (a realtime game without danger -> playtest refusal bau_trivial with counter-proposal)
//   | "fakten" (every question unsicher -> refusal bau_fakten). The game descriptions come from the wrapper's vendored kit.
export function bauDouble(W, mode = () => "quiz") {
  let B = null;
  const kit = async () => (B ||= {
    ex: (await import(W + "/lib/vendor/mdi-baukasten/engines/baukasten/beispiele.js")).BEISPIELE,
    check: (await import(W + "/lib/vendor/mdi-baukasten/engines/baukasten/check.js")).check,
  });
  return async (req) => {
    const m = mode(), { ex, check } = await kit();
    if (req.name === "check" && req.schema && req.schema.properties && req.schema.properties.takt) return { json: { risk: 0, cats: [], drink: "none", takt: m === "quiz" || m === "fakten" ? "zug" : "echtzeit" }, usage: { out: 10 }, stop: "end_turn" };
    if (req.name === "bau_fakten") {
      const f = JSON.parse(req.user.slice(6, -7));
      return { json: { items: f.map((x) => ({ i: x.i, grund: m === "fakten" || x.i === 0 ? "Fakt nicht eindeutig belegt" : "", urteil: m === "fakten" ? "unsicher" : x.i === 0 ? "falsch" : "sicher", besser: "" })) }, usage: { out: 40 }, stop: "end_turn" };
    }
    if (req.name === "card_bau_zug") return { json: { ok: true, ...check(ex.quiz).desc }, usage: { out: 300 }, stop: "end_turn" };
    if (req.name === "card_bau_szene" || req.name === "card_bau_regeln") {
      const d = check(ex.flappy).desc;
      if (m === "kaputt") d.rules = d.rules.filter((r) => !r.do.some((e) => e.act === "life" || e.act === "lose"));
      const { spawn, rules, ...scene } = d;
      return { json: req.name === "card_bau_szene" ? { ok: true, ...scene } : { ok: true, spawn, rules }, usage: { out: 300 }, stop: "end_turn" };
    }
    return null;   // not a G3 call: the recorder's own double answers
  };
}
