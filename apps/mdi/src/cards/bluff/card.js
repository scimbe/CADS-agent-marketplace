// Zugkarte mit Geheimnis: "Mein Bote luegt" (Regeln aus der Altkarte zug-bluff, siehe test/fixtures/bluff-alt.json).
// Sitz 0 (Bote) haelt verdeckte Karten; sie entstehen aus seinem geheimen Salz (Commit-Reveal, Host) und sind auf
// anderen Geraeten bis zur Aufloesung unbekannt (priv[0] === null). Die Karte prueft Ansagen gegen die Wahrheit,
// sobald sie die Wahrheit kennt: auf dem eigenen Geraet sofort, bei allen anderen bei der Aufloesung.
import manifest from "./manifest.json" with { type: "json" };
import { onFill } from "../../contract/tokens.js";

const TX = {
  de: {
    role0: "Du bist der Bote. Du kennst deine Karten und darfst schwindeln.",
    role1: "Du bist der Prüfer. Du siehst nur die Ansagen.",
    goal0: "Sag jede Karte an: gleich hoch oder höher. Wer am Ende mehr Punkte hat, gewinnt.",
    goal1: "Glaub die Ansage oder deck sie auf. Erwischst du eine Lüge, bekommst du ihre Punkte.",
    say: "Karte {n} von {m}: Du hast {v}. Was sagst du an?",
    see: "Karte {n} von {m}: Der Bote sagt {v}. Glaubst du das?",
    honestOpt: "{v} (ehrlich)",
    yes: "Glauben", no: "Aufdecken",
    said: "Ansage\u00a0{v}", believed: "geglaubt", opened: "aufgedeckt", lie: "gelogen",
    line: "Karte {n}: Ansage {c}, in Wahrheit {t}.",
    why: { believed: "Geglaubt: Bote +{p}.", honest: "Aufgedeckt, ehrlich: Bote +{p}.", caught: "Aufgedeckt, gelogen: Prüfer +{p}." },
    score: "{s0} {a} – {s1} {b}", cheat: "Ansage unter dem echten Wert: Die Partie zählt nicht.",
    rule: "So zählt es: Geglaubt – der Bote bekommt die Ansage. Aufgedeckt und ehrlich – der Bote bekommt den Wert plus {b}. Aufgedeckt und gelogen – der Prüfer bekommt die Ansage.",
    hidden: "verdeckt", card: "Karte {n}", honest: "Alles war ehrlich. Gegen eine ehrliche Hand punktet nur der Bote."
  },
  en: {
    role0: "You are the messenger. You know your cards and you may fib.",
    role1: "You are the checker. You only see the announcements.",
    goal0: "Announce each card: the same or higher. Whoever has more points at the end wins.",
    goal1: "Believe the announcement or reveal it. Catch a lie and its points are yours.",
    say: "Card {n} of {m}: you hold {v}. What do you announce?",
    see: "Card {n} of {m}: the messenger says {v}. Do you believe it?",
    honestOpt: "{v} (honest)",
    yes: "Believe", no: "Reveal",
    said: "Said\u00a0{v}", believed: "believed", opened: "revealed", lie: "a lie",
    line: "Card {n}: announced {c}, really {t}.",
    why: { believed: "Believed: messenger +{p}.", honest: "Revealed, honest: messenger +{p}.", caught: "Revealed, a lie: checker +{p}." },
    score: "{s0} {a} – {s1} {b}", cheat: "An announcement below the real value: this game does not count.",
    rule: "How it counts: believed – the messenger scores the announcement. Revealed and honest – the messenger scores the value plus {b}. Revealed and a lie – the checker scores the announcement.",
    hidden: "face down", card: "Card {n}", honest: "Everything was honest. Against an honest hand only the messenger scores."
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
    // turnNo/turns: "Zug n von m" fuer die Kopfzeile des Hosts (Bote = Zug 1, Pruefer = Zug 2, wie alt note_turn)
    return { over, turn: p.phase === "say" || p.phase === "reveal" ? 0 : p.phase === "call" ? 1 : -1, reveal: p.phase === "reveal", score: p.score.slice(), winner, cheat: p.cheat, turnNo: p.phase === "say" ? 1 : 2, turns: 2 };
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
      const lied = p.truth && said !== undefined && said !== truth;
      const sub = [said !== undefined ? fmt(X.said, { v: said }) : "", call === undefined ? "" : call ? X.opened : X.believed, lied ? X.lie : ""].filter(Boolean).join("\n");
      tiles.push({
        t: "tile", fill: p.accent, ink, value: truth === null ? null : String(truth), sub,
        mark: p.truth && said !== truth ? "hit" : "none", // Luegen nach der Aufloesung sichtbar markieren
        focus: !preview && ((p.phase === "say" && i === p.say.length) || (p.phase === "call" && i === p.call.length)),
        a11y: fmt(X.card, { n: i + 1 }) + ": " + (truth === null ? X.hidden : truth) + (sub ? ", " + sub.replace(/\n/g, ", ") : ""),
        part: "farbe"
      });
    }
    const kids = [];
    // Muster 13 §6.4: Rolle und Ziel stehen vor der ersten Handlung, eine Frage je Bildschirm mit dem eigenen Wert
    const acting = !preview && ((p.phase === "say" && seat === 0 && obs.mine) || (p.phase === "call" && seat === 1));
    if (preview) kids.push({ t: "text", role: "body", text: manifest.howto[ctx.lang] || manifest.howto.de, part: "regeln" });
    else if (acting) {
      kids.push({ t: "text", role: "label", text: seat === 0 ? X.role0 : X.role1 });
      kids.push({ t: "text", role: "small", text: seat === 0 ? X.goal0 : X.goal1, part: "regeln" });
    }
    kids.push({ t: "row", wrap: false, children: tiles });
    if (!preview) {
      const i = p.phase === "say" ? p.say.length : p.call.length;
      if (p.phase === "say" && seat === 0 && obs.mine) {
        const own = obs.mine.cards[i];
        kids.push({ t: "choice", label: fmt(X.say, { n: i + 1, m: p.n, v: own }), options: moves(obs, seat).map((mv) => ({ label: mv.v === own ? fmt(X.honestOpt, { v: mv.v }) : String(mv.v), input: mv })) });
      } else if (p.phase === "call" && seat === 1) {
        kids.push({ t: "choice", label: fmt(X.see, { n: i + 1, m: p.n, v: p.say[i] }), options: [{ label: X.yes, input: { t: "call", seat: 1, open: false } }, { label: X.no, input: { t: "call", seat: 1, open: true } }] });
      } else if (p.phase === "over") {
        const names = manifest.seats[ctx.lang] || manifest.seats.de;
        kids.push({ t: "text", role: "big", text: p.cheat ? "–" : fmt(X.score, { s0: names[0], a: p.score[0], s1: names[1], b: p.score[1] }) });
        if (p.cheat) kids.push({ t: "text", role: "body", text: X.cheat });
        else {
          // jede Karte erklaert ihre Punkte: Ansage, Wahrheit, Entscheidung, wer wie viel bekommt
          for (let k = 0; k < p.n; k++) {
            const s = p.say[k], t = p.truth[k], open = p.call[k];
            const why = !open ? fmt(X.why.believed, { p: s }) : s === t ? fmt(X.why.honest, { p: t + p.bonus }) : fmt(X.why.caught, { p: s });
            kids.push({ t: "text", role: "body", text: fmt(X.line, { n: k + 1, c: s, t }) + " " + why });
          }
          if (p.say.every((s, k) => s === p.truth[k])) kids.push({ t: "text", role: "body", text: X.honest });
          kids.push({ t: "text", role: "small", text: fmt(X.rule, { b: p.bonus }) });
        }
      }
    }
    return { t: "stack", children: kids };
  }
};
