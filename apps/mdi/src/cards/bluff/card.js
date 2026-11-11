// Zugkarte mit Geheimnis: "Mein Bote luegt" (Regeln aus der Altkarte zug-bluff, siehe test/fixtures/bluff-alt.json).
// Sitz 0 (Bote) haelt verdeckte Karten; sie entstehen aus seinem geheimen Salz (Commit-Reveal, Host) und sind auf
// anderen Geraeten bis zur Aufloesung unbekannt (priv[0] === null). Die Karte prueft Ansagen gegen die Wahrheit,
// sobald sie die Wahrheit kennt: auf dem eigenen Geraet sofort, bei allen anderen bei der Aufloesung.
import manifest from "./manifest.json" with { type: "json" };
import { onFill } from "../../contract/tokens.js";

const TX = {
  de: {
    you0: "Sag jede Karte an – gleich hoch oder höher.",
    you1: "Glaub die Ansage oder deck sie auf.",
    say: "Karte {n}: Du hast {v}. Was sagst du an?",
    see: "Karte {n}: angesagt {v}. Glaubst du das?",
    yes: "Glauben", no: "Aufdecken",
    said: "Ansage {v}", believed: "geglaubt", opened: "aufgedeckt",
    line: "Karte {n}: Ansage {c}, in Wahrheit {t}.",
    score: "{s0} {a} – {s1} {b}", cheat: "Ansage unter dem echten Wert: Die Partie zählt nicht.",
    rule: "So zählt es: Geglaubt – der Bote bekommt die Ansage. Aufgedeckt und ehrlich – der Bote bekommt den Wert plus {b}. Aufgedeckt und gelogen – der Prüfer bekommt die Ansage.",
    hidden: "verdeckt", card: "Karte {n}"
  },
  en: {
    you0: "Announce each card – the same or higher.",
    you1: "Believe the announcement or reveal it.",
    say: "Card {n}: you hold {v}. What do you announce?",
    see: "Card {n}: announced {v}. Do you believe it?",
    yes: "Believe", no: "Reveal",
    said: "Said {v}", believed: "believed", opened: "revealed",
    line: "Card {n}: announced {c}, really {t}.",
    score: "{s0} {a} – {s1} {b}", cheat: "An announcement below the real value: this game does not count.",
    rule: "How it counts: believed – the messenger scores the announcement. Revealed and honest – the messenger scores the value plus {b}. Revealed and a lie – the checker scores the announcement.",
    hidden: "face down", card: "Card {n}"
  }
};
function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => String(o[k])); }
function copy(pub) { return { n: pub.n, bonus: pub.bonus, accent: pub.accent, say: pub.say.slice(), call: pub.call.slice(), truth: pub.truth ? pub.truth.slice() : null, score: pub.score.slice(), phase: pub.phase, cheat: pub.cheat }; }
function int(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi; }
function deck() { const d = []; for (let k = 0; k < 2; k++) for (let v = 1; v <= 6; v++) d.push(v); return d; }

function score(pub, truth) {
  let a = 0, b = 0;
  for (let i = 0; i < pub.n; i++) {
    const s = pub.say[i], t = truth[i], open = pub.call[i];
    if (!open) a += s; else if (s === t) a += t + pub.bonus; else b += s;
  }
  return [a, b];
}

function moves(obs, seat) {
  const p = obs.pub;
  if (p.phase === "say" && seat === 0 && obs.mine) { const out = []; for (let v = obs.mine.cards[p.say.length]; v <= 6; v++) out.push({ t: "say", seat: 0, v }); return out; }
  if (p.phase === "call" && seat === 1) return [{ t: "call", seat: 1, open: false }, { t: "call", seat: 1, open: true }];
  if (p.phase === "reveal" && seat === 0 && obs.mine) return [{ t: "reveal", seat: 0 }];
  return [];
}

export default {
  manifest,
  init({ params }) {
    return { pub: { n: params.cards, bonus: params.bonus, accent: params.accent, say: [], call: [], truth: null, score: [0, 0], phase: "say", cheat: false }, priv: [null, null] };
  },
  // nur fuer Sitze mit Geheimnis; rng stammt aus dem Salz dieses Sitzes
  deal({ rng, seat, pub }) {
    if (seat !== 0) return null;
    return { cards: rng.shuffle(deck()).slice(0, pub.n) };
  },
  step(state, input) {
    const pub = copy(state.pub), priv = state.priv.slice(), mine = priv[0];
    if (pub.phase === "say") {
      if (input.t !== "say" || input.seat !== 0 || !int(input.v, 1, 6)) throw new Error("ungueltig: say");
      if (mine && input.v < mine.cards[pub.say.length]) throw new Error("ungueltig: Ansage unter Wert");
      pub.say.push(input.v);
      if (pub.say.length === pub.n) pub.phase = "call";
    } else if (pub.phase === "call") {
      if (input.t !== "call" || input.seat !== 1 || typeof input.open !== "boolean") throw new Error("ungueltig: call");
      pub.call.push(input.open);
      if (pub.call.length === pub.n) pub.phase = "reveal";
    } else if (pub.phase === "reveal") {
      if (input.t !== "reveal" || input.seat !== 0 || !mine || !Array.isArray(mine.cards) || mine.cards.length !== pub.n) throw new Error("ungueltig: reveal");
      pub.truth = mine.cards.slice();
      pub.cheat = pub.say.some((s, i) => s < pub.truth[i]);
      pub.score = pub.cheat ? [0, 0] : score(pub, pub.truth);
      pub.phase = "over";
    } else throw new Error("ungueltig: Partie vorbei");
    return { pub, priv };
  },
  observe(state, seat) {
    // nur Oeffentliches und der eigene private Teil; fremde Teile erscheinen nie
    return { pub: copy(state.pub), mine: seat === 0 && state.priv[0] ? { cards: state.priv[0].cards.slice() } : null };
  },
  status(state) {
    const p = state.pub, over = p.phase === "over";
    const winner = !over ? -1 : p.cheat ? 1 : p.score[0] > p.score[1] ? 0 : p.score[1] > p.score[0] ? 1 : -1;
    return { over, turn: p.phase === "say" || p.phase === "reveal" ? 0 : p.phase === "call" ? 1 : -1, reveal: p.phase === "reveal", score: p.score.slice(), winner, cheat: p.cheat };
  },
  moves,
  // Determinisierung fuer ISMCTS: eine zur Sicht passende Welt, nur aus der Beobachtung und dem rng
  sample(obs, seat, rng) {
    const p = obs.pub;
    if (seat === 0 || p.truth) return { pub: copy(p), priv: [obs.mine || (p.truth ? { cards: p.truth.slice() } : null), null] };
    for (let k = 0; k < 64; k++) {
      const c = rng.shuffle(deck()).slice(0, p.n);
      if (p.say.every((s, i) => c[i] <= s)) return { pub: copy(p), priv: [{ cards: c }, null] };
    }
    const left = deck(), c = [];
    for (let i = 0; i < p.n; i++) {
      const ok = left.filter((v) => i >= p.say.length || v <= p.say[i]);
      const v = ok.length ? ok[rng.int(ok.length)] : Math.min(...left);
      left.splice(left.indexOf(v), 1); c.push(v);
    }
    return { pub: copy(p), priv: [{ cards: c }, null] };
  },
  view(obs, seat, ctx) {
    const X = TX[ctx.lang] || TX.de, p = obs.pub, preview = !!ctx.preview;
    const ink = onFill(p.accent);
    const tiles = [];
    for (let i = 0; i < p.n; i++) {
      const truth = p.truth ? p.truth[i] : obs.mine ? obs.mine.cards[i] : null;
      const said = p.say[i];
      const call = p.call[i];
      const sub = [said !== undefined ? fmt(X.said, { v: said }) : "", call === undefined ? "" : call ? X.opened : X.believed].filter(Boolean).join(" · ");
      tiles.push({
        t: "tile", fill: p.accent, ink, value: truth === null ? null : String(truth), sub,
        mark: p.truth && call !== undefined ? (call ? (said === truth ? "ok" : "hit") : "none") : "none",
        focus: !preview && ((p.phase === "say" && i === p.say.length) || (p.phase === "call" && i === p.call.length)),
        a11y: fmt(X.card, { n: i + 1 }) + ": " + (truth === null ? X.hidden : truth) + (sub ? ", " + sub : ""),
        part: "farbe"
      });
    }
    const kids = [];
    if (preview) kids.push({ t: "text", role: "body", text: manifest.howto[ctx.lang] || manifest.howto.de, part: "regeln" });
    else if (p.phase === "say" && seat === 0) kids.push({ t: "text", role: "label", text: X.you0 });
    else if (p.phase === "call" && seat === 1) kids.push({ t: "text", role: "label", text: X.you1 });
    kids.push({ t: "row", wrap: false, children: tiles });
    if (!preview) {
      const i = p.phase === "say" ? p.say.length : p.call.length;
      if (p.phase === "say" && seat === 0 && obs.mine) {
        kids.push({ t: "choice", label: fmt(X.say, { n: i + 1, v: obs.mine.cards[i] }), options: moves(obs, seat).map((m) => ({ label: String(m.v), input: m })) });
      } else if (p.phase === "call" && seat === 1) {
        kids.push({ t: "choice", label: fmt(X.see, { n: i + 1, v: p.say[i] }), options: [{ label: X.yes, input: { t: "call", seat: 1, open: false } }, { label: X.no, input: { t: "call", seat: 1, open: true } }] });
      } else if (p.phase === "over") {
        const names = manifest.seats[ctx.lang] || manifest.seats.de;
        kids.push({ t: "text", role: "big", text: p.cheat ? "–" : fmt(X.score, { s0: names[0], a: p.score[0], s1: names[1], b: p.score[1] }) });
        if (p.cheat) kids.push({ t: "text", role: "body", text: X.cheat });
        else kids.push({ t: "text", role: "small", text: fmt(X.rule, { b: p.bonus }) });
      }
    }
    return { t: "stack", children: kids };
  }
};
