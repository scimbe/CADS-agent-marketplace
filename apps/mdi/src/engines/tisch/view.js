// Anzeigeliste fuer den Tisch (Skat, Doppelkopf, Bauernskat). Texte aus dem Altcode table-ui.js (TX), Aufbau wie dort:
// Ansage/Info, wer dran ist, Stich mit „Warum?", eigene Hand bzw. Stapel, Knoepfe, Stand. Primitive: pcard, pickn, more
// (Renderer, Strang F; pcard mit submit: der Host schickt {...submit, a:0}) sowie stack/row/text/choice. Jede Karte traegt ihren Namen fuer Screenreader (Farbe + Rang).
import { cardName } from "./deck.js";

export const TX = {
  de: { doko: "Doppelkopf", skat: "Skat", bauernskat: "Bauernskat", shuffle: "Alle mischen gemeinsam …", keys: "Karten werden verteilt …", open: "Karte wird aufgedeckt …",
    turnYou: "Du bist dran", turnOf: "{n} ist dran", you: "Du", seat: "Platz {n}", next: "Nächstes Spiel", end: "Aufhören",
    won: "{p} gewinnt", none: "Keiner gewinnt", checked: "✓ Alle Karten nachgeprüft: fair gemischt, richtig gespielt.",
    cheat: "⚠ Beim Mischen hat jemand geschummelt ({n}). Das Spiel zählt nicht.", bad: "⚠ Regelverstoß von {n} ({w}). Das Spiel zählt nicht.",
    cheatSeed: "⚠ {n} hat am Ende einen anderen Schlüssel gezeigt als festgelegt.",
    gesund: "Gesund", vorbehalt: "Vorbehalt", hochzeit: "Hochzeit", damen: "Damensolo", buben: "Bubensolo", fleischlos: "Fleischloser", kreuz: "Kreuz-Solo", pik: "Pik-Solo", herz: "Herz-Solo", karo: "Karo-Solo",
    k90: "keine 90", k60: "keine 60", k30: "keine 30", schwarz: "schwarz", normal: "Normalspiel", wedding: "Hochzeit",
    bid: "{v} reizen", hold: "Ja ({v})", pass: "Passe", pickup: "Skat aufnehmen", push: "Diese 2 drücken", pushHint: "Tipp zwei Karten an, die du drückst.",
    G: "Grand", N: "Null", C: "Kreuz", S: "Pik", H: "Herz", D: "Karo", handG: "Hand", schneiderA: "Schneider angesagt", schwarzA: "Schwarz angesagt", ouvertA: "offen",
    re_: "Re", kontra_: "Kontra", declarer: "Alleinspieler", defenders: "Gegenspieler", passed: "Eingepasst – neu geben.", eyes: "Augen",
    bidNow: "Gereizt: {v}", house: "Hausregeln", houseNone: "Turnierregeln", r_dulle: "2. Dulle sticht 1.", r_nosp: "Ohne Fuchs & Karlchen", r_ramsch: "Ramsch statt Einpassen", r_kontra: "Kontra & Re", r_null: "Null erlaubt",
    kontra: "Kontra!", re: "Re!", ramschG: "Ramsch", ramschLost: "Ramsch: {n} verliert", march: "Durchmarsch: {n}",
    why: "Warum?", wLedT: "Trumpf angespielt: wer Trumpf hat, muss Trumpf geben.", wLed: "{s} angespielt: wer {s} hat, muss {s} bedienen.",
    wTrump: "{n} hat kein {s} und sticht mit Trumpf.", wOff: "{n} hat kein {s} und wirft ab.", wWinTrump: "{c} gewinnt: Trumpf schlägt jede andere Farbe.",
    wWinT: "{c} gewinnt: höchster Trumpf im Stich.", wWin: "{c} gewinnt: höchste {s} im Stich.", wFirst: "{c} gewinnt: zwei gleiche Karten, die zuerst gespielte zählt.",
    wDulle: "{c} gewinnt: Hausregel, die zweite Dulle sticht die erste.", wOrder: "Trumpf von oben: {o} …", wNoTrump: "Kein Trumpf in diesem Spiel.", trumpW: "Trumpf",
    bsDeclare: "Sag das Spiel an:", bsHow: "Skat zu zweit: 8 Stapel, je eine Karte offen auf einer verdeckten. Vorhand sagt an, 61 Augen gewinnen.",
    total: "Gesamt", hand: "Spiel {h} von {n}", games: "{n} Spiele", myHand: "Deine Karten", trick: "Stich", stacksOf: "Stapel von {n}", openHand: "Offene Karten von {n}",
    over: "Partie vorbei", wait: "Warte auf {n} …", lastHand: "Letztes Spiel", nextWait: "Bereit für das nächste Spiel?", hidden: "verdeckt", empty: "leer" },
  en: { doko: "Doppelkopf", skat: "Skat", bauernskat: "Bauernskat", shuffle: "Shuffling together …", keys: "Dealing …", open: "Turning a card …",
    turnYou: "Your turn", turnOf: "{n}'s turn", you: "You", seat: "Seat {n}", next: "Next game", end: "Stop",
    won: "{p} wins", none: "Nobody wins", checked: "✓ Every card checked: fairly shuffled, fairly played.",
    cheat: "⚠ Someone cheated while shuffling ({n}). This game does not count.", bad: "⚠ Rule broken by {n} ({w}). This game does not count.",
    cheatSeed: "⚠ {n} showed a different key at the end than committed.",
    gesund: "Healthy", vorbehalt: "Reservation", hochzeit: "Marriage", damen: "Queen solo", buben: "Jack solo", fleischlos: "Aces solo", kreuz: "Clubs solo", pik: "Spades solo", herz: "Hearts solo", karo: "Diamonds solo",
    k90: "no 90", k60: "no 60", k30: "no 30", schwarz: "schwarz", normal: "Normal game", wedding: "Marriage",
    bid: "Bid {v}", hold: "Yes ({v})", pass: "Pass", pickup: "Pick up the skat", push: "Discard these 2", pushHint: "Tap the two cards you discard.",
    G: "Grand", N: "Null", C: "Clubs", S: "Spades", H: "Hearts", D: "Diamonds", handG: "Hand", schneiderA: "Schneider announced", schwarzA: "Schwarz announced", ouvertA: "open",
    re_: "Re", kontra_: "Kontra", declarer: "Declarer", defenders: "Defenders", passed: "All passed – deal again.", eyes: "card points",
    bidNow: "Bid: {v}", house: "House rules", houseNone: "Tournament rules", r_dulle: "2nd Ten beats 1st", r_nosp: "No Fox & Charlie", r_ramsch: "Ramsch if all pass", r_kontra: "Kontra & Re", r_null: "Null allowed",
    kontra: "Kontra!", re: "Re!", ramschG: "Ramsch", ramschLost: "Ramsch: {n} loses", march: "Durchmarsch: {n}",
    why: "Why?", wLedT: "Trump led: whoever has trump must play trump.", wLed: "{s} led: whoever has {s} must follow.",
    wTrump: "{n} has no {s} and trumps.", wOff: "{n} has no {s} and throws off.", wWinTrump: "{c} wins: trump beats every other suit.",
    wWinT: "{c} wins: highest trump in the trick.", wWin: "{c} wins: highest {s} in the trick.", wFirst: "{c} wins: two equal cards, the first one played counts.",
    wDulle: "{c} wins: house rule, the second Heart Ten beats the first.", wOrder: "Trumps from the top: {o} …", wNoTrump: "No trumps in this game.", trumpW: "trump",
    bsDeclare: "Name the game:", bsHow: "Skat for two: 8 stacks, each one card face up on one face down. Forehand names the game, 61 card points win.",
    total: "Total", hand: "Game {h} of {n}", games: "{n} games", myHand: "Your cards", trick: "Trick", stacksOf: "{n}'s stacks", openHand: "{n}'s open cards",
    over: "Match over", wait: "Waiting for {n} …", lastHand: "Last game", nextWait: "Ready for the next game?", hidden: "face down", empty: "empty" }
};

function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? String(o[k]) : m)); }

export function tableView(T, manifest, obs, seat, ctx) {
  const L = ctx.lang === "en" ? "en" : "de", X = TX[L], t = (k, v) => fmt(X[k] !== undefined ? X[k] : k, v);
  const pub = obs.pub, r = pub.r, R = T.R, game = T.game, n = T.n;
  const name = (s) => (s === seat && !ctx.preview ? X.you : (ctx.names && ctx.names[s]) || (manifest.seats && manifest.seats[L] && manifest.seats[L][s]) || t("seat", { n: s + 1 }));
  const cn = (c) => cardName(c, L);
  const pc = (code, o = {}) => ({ t: "pcard", code: code || null, a11y: code ? cn(code) : X.hidden, size: o.size || "m", state: o.state || "none", ...(o.input ? { submit: o.input } : {}) });
  const kids = [];
  if (ctx.preview) {
    // Vorschau und Thumbnail: der Spielname, ein Faecher aus fuenf Karten, darunter kurz die eingestellten Regeln
    const fan = game === "skat" ? ["CJ", "SJ", "HJ", "HA", "HT"] : game === "bauernskat" ? ["DJ", "SA", "HT", "CJ", "CA"] : ["HT", "CQ", "SQ", "DA", "DT"];
    kids.push({ t: "text", role: "title", text: X[game] });
    kids.push({ t: "row", wrap: false, children: fan.map((c) => pc(c, { size: "xl" })) });
    const rules = (pub.rules || []).length ? pub.rules.map((k) => t("r_" + k)).join(" · ") : X.houseNone;
    kids.push({ t: "text", role: "body", text: t("games", { n: pub.runden }) + " · " + rules, part: "regeln" });
    return { t: "stack", children: kids };
  }
  const pt = T.protoTurn(pub), mine = pt && pt.seat === seat, moves = T.moves(obs, seat);
  kids.push({ t: "text", role: "label", text: X[game] + " · " + t("hand", { h: pub.hand + 1, n: pub.runden }) });
  if (pub.ph === "over" || pub.ph === "reveal" || pub.ph === "next") return endView();
  if (pub.ph === "seed" || pub.ph === "check") { kids.push({ t: "text", role: "body", text: X.checked.replace("✓ ", "") + " …" }); return { t: "stack", children: kids }; }
  const info = infoLine();
  if (info) kids.push({ t: "text", role: "body", text: info });
  if ((r.rules || []).length) kids.push({ t: "text", role: "small", text: X.house + ": " + r.rules.map((k) => t("r_" + k)).join(" · ") });
  if (pub.ph === "mix" || pub.ph === "lock") { kids.push({ t: "text", role: "big", text: X.shuffle }); return { t: "stack", children: kids }; }
  if (pt && pt.auto) kids.push({ t: "text", role: "small", text: game === "bauernskat" && r.phase !== "deal" ? X.open : X.keys });
  else if (pt) kids.push({ t: "text", role: "big", text: mine ? X.turnYou : t("turnOf", { n: name(pt.seat) }) });

  // Stich (laufend, sonst der zuletzt genommene)
  const tr = r.trick && r.trick.cards.length ? r.trick : r.tricks.length ? r.tricks[r.tricks.length - 1] : null;
  if (game === "bauernskat") kids.push(stackRow(1 - seat, false));
  if (tr) {
    kids.push({ t: "row", wrap: false, part: "stich", children: tr.cards.map((x) => ({ t: "stack", children: [pc(x.card, { size: "m" }), { t: "text", role: "small", text: name(x.seat) }] })) });
    const why = explainLines(tr);
    if (why.length) kids.push({ t: "more", label: X.why, children: why.map((s) => ({ t: "text", role: "small", text: s })) });
  }
  if (r.open && r.declarer !== seat) kids.push({ t: "text", role: "small", text: t("openHand", { n: name(r.declarer) }) }, { t: "row", wrap: true, children: sortHand(r.open.filter((c) => !played().includes(c))).map((c) => pc(c, { size: "s" })) });

  // eigene Karten
  const playable = {};
  for (const m of moves) if (m.t === "play") { const a = game === "bauernskat" ? m.c : codeOfPos(m.pos); if (a) playable[a] = m; }
  if (game === "bauernskat") kids.push(stackRow(seat, true, playable));
  else if (obs.mine) {
    const cards = T.myCards(obs, seat), pushing = moves.some((m) => m.t === "push");
    if (pushing) {
      const own = T.ownPositions(pub, seat), codes = own.map((p) => R.DECK[obs.mine.hand[p]]);
      const options = [];
      for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) options.push({ sel: [i, j], input: moves.find((m) => m.t === "push" && m.c === T.pushCommit(obs.mine.sec.k, own[i], own[j])) });
      kids.push({ t: "pickn", id: "push", part: "hand", n: 2, label: X.pushHint, confirm: X.push, items: codes.map((c) => pc(c, { size: "l" })), options: options.filter((o) => o.input) });
    } else {
      kids.push({ t: "text", role: "label", text: X.myHand });
      kids.push({ t: "row", wrap: true, part: "hand", children: sortHand(cards).map((c) => pc(c, { size: "l", input: playable[c], state: playable[c] ? "ok" : mine && Object.keys(playable).length ? "no" : "none" })) });
    }
  }
  // Knoepfe: Reizen nur der naechste Wert, alles andere wie angeboten
  const opts = [], bids = moves.filter((m) => m.t === "bid");
  if (bids.length) opts.push({ label: t("bid", { v: bids[0].v }), input: bids[0] });
  for (const m of moves) if (!["play", "push", "bid", "key", "mix", "lock", "seed", "show", "reveal"].includes(m.t)) opts.push({ label: label(m), input: m });
  if (opts.length) {
    if (game === "bauernskat" && moves.some((m) => m.t === "declare")) kids.push({ t: "text", role: "body", text: X.bsDeclare });
    for (let i = 0; i < opts.length; i += 12) kids.push({ t: "choice", label: i ? "" : (mine ? X.turnYou : ""), options: opts.slice(i, i + 12) });
  }
  kids.push(scoreLine());
  return { t: "stack", children: kids };

  // ---------- Hilfen ----------
  function played() { const o = []; for (const x of r.tricks.concat(r.trick ? [r.trick] : [])) for (const y of x.cards) o.push(y.card); return o; }
  function codeOfPos(p) { const id = obs.mine && obs.mine.hand[p]; return id === undefined ? null : R.DECK[id]; }
  function kind() { return game === "doko" ? r.kind : r.contract ? r.contract.game : "G"; }
  function sortHand(cards) {
    const k = kind(), rk = game !== "doko" && k === "N" ? "AKQJT987" : "ATKQJ987", J = ["CJ", "SJ", "HJ", "DJ"];
    const key = (c) => {
      const tr = game === "doko" ? R.trumps(k).indexOf(c) : k === "N" ? -1 : J.indexOf(c) >= 0 ? J.indexOf(c) : R.isTrump(k, c) ? 4 + rk.indexOf(c[1]) : -1;
      return tr >= 0 ? tr : 100 + "CSHD".indexOf(c[0]) * 10 + rk.indexOf(c[1]);
    };
    return cards.slice().sort((a, b) => key(a) - key(b));
  }
  function stackRow(s, own, playable = {}) {
    return { t: "stack", children: [
      { t: "text", role: "small", text: own ? X.you : t("stacksOf", { n: name(s) }) },
      { t: "row", wrap: true, part: own ? "hand" : "gegner", children: r.stacks[s].map((x) => {
        if (!x.top && !x.under) return { t: "text", role: "small", text: "·" };
        const a = own ? playable[x.top] : null;
        return x.top ? pc(x.top, { size: own ? "l" : "s", input: a, state: a ? "ok" : own && mine && Object.keys(playable).length ? "no" : "none" }) : pc(null, { size: own ? "l" : "s" });
      }) }
    ] };
  }
  function label(m) {
    if (m.t === "vorbehalt") return X[m.v];
    if (m.t === "kontra" || m.t === "re") return X[m.t];
    if (m.t === "call") return m.a === m.p ? X[m.p + "_"] : X[m.a];
    if (m.t === "hold") return t("hold", { v: r.bid.v });
    if (m.t === "next") return X.next;
    if (m.t === "end") return X.end;
    if (m.t === "declare") { const f = m.f; return [X[m.g], f & 1 && game === "skat" ? X.handG : "", f & 8 ? X.ouvertA : "", f & 4 ? X.schwarzA : f & 2 ? X.schneiderA : ""].filter(Boolean).join(" · "); }
    return X[m.t] || m.t;
  }
  function infoLine() {
    const out = [];
    if (game === "doko") {
      if (r.phase === "play") out.push(r.wedding >= 0 && r.kind === "hochzeit" ? X.wedding : r.kind === "normal" ? X.normal : X[r.kind]);
      for (const c of r.calls || []) out.push(name(c.seat) + ": " + (c.a === c.p ? X[c.p + "_"] : X[c.a]));
    } else {
      if (r.contract && r.contract.ramsch) out.push(X.ramschG);
      else {
        if (r.bid && r.bid.v) out.push(t("bidNow", { v: r.bid.v }));
        if (r.contract) { const c = r.contract; out.push(name(r.declarer) + ": " + [X[c.game], c.hand && game === "skat" ? X.handG : "", c.ouvert ? X.ouvertA : "", c.schwarz ? X.schwarzA : c.schneider ? X.schneiderA : ""].filter(Boolean).join(" · ")); }
      }
      if (r.kontra) out.push(X[r.kontra > 1 ? "re" : "kontra"]);
    }
    return out.join(" · ");
  }
  function explainLines(trick) {
    const x = R.explain(kind(), trick.cards, r.rules);
    if (!x) return [];
    const suit = x.led === "T" ? X.trumpW : X[x.led], c = cn(x.card), lines = [x.led === "T" ? X.wLedT : t("wLed", { s: suit })];
    for (const p of x.plays) if (p.how === "trump" || p.how === "off") lines.push(t(p.how === "trump" ? "wTrump" : "wOff", { n: name(p.seat), s: suit }));
    lines.push(x.why === "trump" ? t("wWinTrump", { c }) : x.why === "first" ? t("wFirst", { c }) : x.why === "dulle" ? t("wDulle", { c }) : x.led === "T" ? t("wWinT", { c }) : t("wWin", { c, s: suit }));
    lines.push(x.order.length ? t("wOrder", { o: x.order.slice(0, 6).map(cn).join(" > ") }) : X.wNoTrump);
    return lines;
  }
  function scoreLine() { return { t: "text", role: "small", text: X.total + ": " + pub.score.map((x, s) => name(s) + " " + x).join(" · ") }; }
  function endView() {
    const l = pub.last;
    if (l) {
      const res = l.result;
      kids.push({ t: "text", role: "label", text: X.lastHand });
      if (l.cheat !== undefined) kids.push({ t: "text", role: "big", text: t("cheat", { n: l.cheat >= 0 ? name(l.cheat) : "?" }) });
      else if (l.audit && l.audit.length) kids.push({ t: "text", role: "big", text: t("bad", { n: l.audit[0].seat >= 0 ? name(l.audit[0].seat) : "?", w: l.audit[0].why }) });
      else if (res && res.passedOut) kids.push({ t: "text", role: "big", text: X.passed });
      else if (res && res.ramsch) {
        kids.push({ t: "text", role: "big", text: res.durchmarsch >= 0 ? t("march", { n: name(res.durchmarsch) }) : t("ramschLost", { n: res.losers.map(name).join(", ") }) });
        kids.push({ t: "text", role: "body", text: res.seatEyes.map((e, s) => name(s) + " " + e).join(" · ") + " " + X.eyes });
      } else if (res) {
        const who = res.winner === "re" ? X.re_ : res.winner === "kontra" ? X.kontra_ : res.winner === "declarer" ? name(res.declarer) : res.winner === "defenders" ? (game === "bauernskat" ? name(1 - res.declarer) : X.defenders) : null;
        kids.push({ t: "text", role: "big", text: who ? t("won", { p: who }) : X.none });
        if (res.eyes) kids.push({ t: "text", role: "body", text: Object.keys(res.eyes).map((k) => (k === "re" ? X.re_ : k === "kontra" ? X.kontra_ : X[k]) + " " + res.eyes[k]).join(" : ") + " " + X.eyes });
      }
      if (res) {
        const pts = game === "skat" ? res.list : res.points;
        kids.push({ t: "text", role: "body", text: pts.map((p, s) => name(s) + " " + (p > 0 ? "+" : "") + p).join(" · ") });
        kids.push({ t: "text", role: "small", text: X.checked });
      }
    }
    if (pub.cheatSeed >= 0) kids.push({ t: "text", role: "body", text: t("cheatSeed", { n: name(pub.cheatSeed) }) });
    kids.push({ t: "text", role: "label", text: pub.ph === "over" ? X.over : X.total });
    kids.push({ t: "text", role: "big", text: pub.score.map((x, s) => name(s) + " " + x).join(" · ") });
    if (pub.ph === "next") {
      if (mine) kids.push({ t: "choice", label: X.nextWait, options: moves.map((m) => ({ label: label(m), input: m })) });
      else if (pt) kids.push({ t: "text", role: "body", text: t("wait", { n: name(pt.seat) }) });
    }
    return { t: "stack", children: kids };
  }
}
