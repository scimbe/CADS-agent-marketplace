/* Doppelkopf and Skat live on screen: the table (seats, invites), the hand, the end of a hand. Its own full-screen
   layer like live-ui.js. The table logic is table.js, the rules doko.js / skat.js, the cards mpoker.js.
   The card faces are drawn here in code (four-colour French deck as in German tournaments: clubs black, spades green,
   hearts red, diamonds orange); made for this app and dedicated to the public domain (CC0 1.0), licenses/Kartendeck-CC0.txt. */
(function () {
"use strict";
var Kit = window.Kit, T = window.Table;
var TX = {
  de: { doko: "Doppelkopf", skat: "Skat", making: "Tisch wird gedeckt …", invite: "➕ Platz {n} einladen", share: "Nochmal teilen",
    shareText: { doko: "Doppelkopf live! Mir fehlt noch wer am Tisch – tippen und hinsetzen (15 Min):", skat: "Skat live! Mir fehlt noch wer am Tisch – tippen und hinsetzen (15 Min):" },
    guest: "Gast {n}", total: "Gesamt", free: "frei", held: "eingeladen …", you: "Du", wait: "Es fehlen noch {n}.", mesh: "Alle verbinden sich …", shuffle: "Alle mischen gemeinsam …",
    badgeNote: "Seht ihr alle dieselben drei Bilder? Dann sitzt ihr am selben Tisch.", ipNote: "Live-Spiele laufen möglichst direkt zwischen euren Geräten. Dabei können die Geräte die IP-Adressen der anderen sehen.",
    leave: "Aufstehen", turnYou: "Du bist dran", turnOf: "{n} ist dran", next: "Nächstes Spiel", waitNext: "Warte auf die anderen …",
    won: "{p} gewinnt", none: "Keiner gewinnt", checked: "✓ Alle Karten nachgeprüft: fair gemischt, richtig gespielt.",
    cheat: "⚠ Beim Mischen hat jemand geschummelt ({n}). Das Spiel zählt nicht.", bad: "⚠ Regelverstoß von {n} ({w}). Das Spiel zählt nicht.",
    aborted: "{n} ist aufgestanden – dieses Spiel zählt nicht. Ladet jemanden ein, dann geht's weiter.", lost: "Verbindung zum Tisch weg.",
    full: "Der Tisch ist schon voll.", joining: "Du wirst an den Tisch geholt …",
    gesund: "Gesund", vorbehalt: "Vorbehalt", hochzeit: "Hochzeit", damen: "Damensolo", buben: "Bubensolo", fleischlos: "Fleischloser", kreuz: "Kreuz-Solo", pik: "Pik-Solo", herz: "Herz-Solo", karo: "Karo-Solo",
    k90: "keine 90", k60: "keine 60", k30: "keine 30", schwarz: "schwarz", normal: "Normalspiel", wedding: "Hochzeit",
    bid: "{v} reizen", hold: "Ja ({v})", pass: "Passe", pickup: "Skat aufnehmen", push: "Diese 2 drücken", pushHint: "Tipp zwei Karten an, die du drückst.",
    G: "Grand", N: "Null", C: "Kreuz", S: "Pik", H: "Herz", D: "Karo", handG: "Hand", schneiderA: "Schneider angesagt", schwarzA: "Schwarz angesagt", ouvertA: "offen",
    show: "Karten offen hinlegen", re_: "Re", kontra_: "Kontra", declarer: "Alleinspieler", defenders: "Gegenspieler", passed: "Eingepasst – neu geben.", eyes: "Augen",
    bidNow: "Gereizt: {v}", ranks: { A: "A", T: "10", K: "K", Q: "D", J: "B", 9: "9", 8: "8", 7: "7" } },
  en: { doko: "Doppelkopf", skat: "Skat", making: "Setting the table …", invite: "➕ Invite seat {n}", share: "Share again",
    shareText: { doko: "Doppelkopf live! I'm missing a player – tap and take a seat (15 min):", skat: "Skat live! I'm missing a player – tap and take a seat (15 min):" },
    guest: "Guest {n}", total: "Total", free: "free", held: "invited …", you: "You", wait: "{n} missing.", mesh: "Everyone is connecting …", shuffle: "Shuffling together …",
    badgeNote: "Do you all see the same three pictures? Then you sit at the same table.", ipNote: "Live games run directly between your devices where possible. The devices may see each other's IP addresses.",
    leave: "Stand up", turnYou: "Your turn", turnOf: "{n}'s turn", next: "Next game", waitNext: "Waiting for the others …",
    won: "{p} wins", none: "Nobody wins", checked: "✓ Every card checked: fairly shuffled, fairly played.",
    cheat: "⚠ Someone cheated while shuffling ({n}). This game does not count.", bad: "⚠ Rule broken by {n} ({w}). This game does not count.",
    aborted: "{n} left – this game does not count. Invite someone and carry on.", lost: "Connection to the table lost.",
    full: "The table is already full.", joining: "Taking you to the table …",
    gesund: "Healthy", vorbehalt: "Reservation", hochzeit: "Marriage", damen: "Queen solo", buben: "Jack solo", fleischlos: "Aces solo", kreuz: "Clubs solo", pik: "Spades solo", herz: "Hearts solo", karo: "Diamonds solo",
    k90: "no 90", k60: "no 60", k30: "no 30", schwarz: "schwarz", normal: "Normal game", wedding: "Marriage",
    bid: "Bid {v}", hold: "Yes ({v})", pass: "Pass", pickup: "Pick up the skat", push: "Discard these 2", pushHint: "Tap the two cards you discard.",
    G: "Grand", N: "Null", C: "Clubs", S: "Spades", H: "Hearts", D: "Diamonds", handG: "Hand", schneiderA: "Schneider announced", schwarzA: "Schwarz announced", ouvertA: "open",
    show: "Lay your cards open", re_: "Re", kontra_: "Kontra", declarer: "Declarer", defenders: "Defenders", passed: "All passed – deal again.", eyes: "card points",
    bidNow: "Bid: {v}", ranks: { A: "A", T: "10", K: "K", Q: "Q", J: "J", 9: "9", 8: "8", 7: "7" } }
};
function L() { return TX[Kit.lang] || TX.de; }
function t(k, v) { var s = L()[k]; if (s == null) s = TX.de[k]; if (s == null) return k; return String(s).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); }
function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }

// ---------- the deck ----------
var SUIT = { C: ["♣", "#111111"], S: ["♠", "#178a3a"], H: ["♥", "#d61f1f"], D: ["♦", "#ef8a00"] };
var NS = "http://www.w3.org/2000/svg";
function svg(tag, at, text) { var e = document.createElementNS(NS, tag); Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); }); if (text != null) e.textContent = text; return e; }
function corner(g, r, s) {
  g.appendChild(svg("text", { x: 6, y: 17, "font-size": 14, "font-weight": 900, fill: s[1], "font-family": "system-ui,sans-serif" }, r));
  g.appendChild(svg("text", { x: 6, y: 31, "font-size": 13, fill: s[1] }, s[0]));
}
function cardSvg(code) {
  var s = SUIT[code[0]], r = L().ranks[code[1]], face = /[KQJ]/.test(code[1]);
  var root = svg("svg", { viewBox: "0 0 60 90", "aria-hidden": "true" }), turned = svg("g", { transform: "rotate(180 30 45)" });
  root.appendChild(svg("rect", { x: 1, y: 1, width: 58, height: 88, rx: 6, fill: "#fff", stroke: "#111", "stroke-width": 2 }));
  corner(root, r, s);
  if (face) root.appendChild(svg("rect", { x: 14, y: 22, width: 32, height: 46, rx: 4, fill: "none", stroke: s[1], "stroke-width": 1.5 }));
  root.appendChild(svg("text", { x: 30, y: 57, "font-size": face ? 24 : 30, "font-weight": 900, "text-anchor": "middle", fill: s[1], "font-family": "system-ui,sans-serif" }, face ? r : s[0]));
  corner(turned, r, s); root.appendChild(turned);
  return root;
}
function cardName(code) { return t(code[0]) + " " + L().ranks[code[1]]; }
function cardEl(code, on, cls) { var b = el(on ? "button" : "span", "tbcard" + (cls ? " " + cls : ""), null, on); b.appendChild(cardSvg(code)); b.setAttribute("aria-label", cardName(code)); b.dataset.card = code; return b; }
// Trumps first, highest left, then the plain suits.
function sortHand(st, cards) {
  var kind = st && (st.kind || (st.contract && st.contract.game)) || (game === "skat" ? "G" : "normal"), rk = game === "skat" && kind === "N" ? "AKQJT987" : "ATKQJ987", J = ["CJ", "SJ", "HJ", "DJ"];
  function key(c) {
    var tr = game === "doko" ? window.Doko.trumps(kind).indexOf(c) : kind === "N" ? -1 : J.indexOf(c) >= 0 ? J.indexOf(c) : window.Skat.isTrump(kind, c) ? 4 + rk.indexOf(c[1]) : -1;
    return tr >= 0 ? tr : 100 + "CSHD".indexOf(c[0]) * 10 + rk.indexOf(c[1]);
  }
  return cards.slice().sort(function (a, b) { return key(a) - key(b); });
}
// The day's card: a fan of four cards over the game's name.
function preview(c, W, H, doc) {
  c.fillStyle = "#0d5c2e"; c.fillRect(0, 0, W, H);
  var fan = doc.g === "skat" ? ["CJ", "SJ", "HA", "DT"] : ["HT", "CQ", "SQ", "DA"], cw = W * 0.22, ch = cw * 1.5;
  fan.forEach(function (code, i) {
    c.save(); c.translate(W / 2, H * 0.62); c.rotate((i - 1.5) * 0.22); c.translate(-cw / 2, -ch);
    c.fillStyle = "#fff"; c.strokeStyle = "#111"; c.lineWidth = 4; c.beginPath(); c.rect(0, 0, cw, ch); c.fill(); c.stroke();
    var s = SUIT[code[0]]; c.fillStyle = s[1]; c.font = "900 " + Math.round(cw * 0.28) + "px system-ui,sans-serif"; c.textAlign = "left"; c.textBaseline = "top";
    c.fillText(TX.de.ranks[code[1]], cw * 0.08, cw * 0.06); c.font = Math.round(cw * 0.5) + "px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(s[0], cw / 2, ch * 0.42);
    c.restore();
  });
  c.fillStyle = "#ffd400"; c.font = "400 " + Math.round(W * 0.12) + "px Anton,Impact,sans-serif"; c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.fillText(TX.de[doc.g === "skat" ? "skat" : "doko"].toUpperCase(), W / 2, H * 0.84);
}
if (window.Render) window.Render.extra.table = preview;

// ---------- the layer ----------
var ov = null, tb = null, game = "doko", pick = [], tick = 0;
function layer() {
  if (!ov) {
    ov = el("div", "liveov tbov"); ov.setAttribute("role", "dialog");
    ov.appendChild(el("button", "liveback", "✕", function () { Kit.sfx.tap(); close(); }));
    ov.appendChild(el("div", "livebody tbbody")); document.body.appendChild(ov);
  }
  var b = ov.querySelector(".tbbody"); b.textContent = ""; return b;
}
function close() { clearInterval(tick); tick = 0; if (tb) { try { tb.leave(); } catch (e) {} tb = null; } if (ov) { ov.remove(); ov = null; } }
function link(token) { return window.DuellCore.SHARE_BASE + "#tisch=" + game + "." + token; }
function me() { var p = window.Daily.sanitizeProfile(Kit.store && Kit.store.me); return { name: p.nick, emoji: p.emoji }; }
// players without a nickname are "Gast 2" after their seat
function nick(x, s) { return x.name && x.name !== "?" ? x.name : t("guest", { n: s + 1 }); }
function seatName(v, s) { var x = v.seats[s]; return x && !x.free ? (x.me ? t("you") : x.emoji + " " + nick(x, s)) : "?"; }
function render(v) {
  if (!ov) return;
  var b = layer();
  b.appendChild(el("p", "lbl", t(game)));
  // the three pictures on every screen of the table, so everyone can compare them at any time
  b.appendChild(el("p", "livemini tbbadge", v.badge || "· · ·"));
  if (v.lost) { b.appendChild(el("p", "livebig", t(v.note === "full" ? "full" : "lost"))); b.appendChild(el("button", "btn", t("leave"), function () { close(); })); return; }
  if (v.mySeat < 0) { b.appendChild(el("p", "livebig", t("joining"))); return; }
  if (v.hand && v.hand.dealt) return play(b, v);
  if (v.last && !v.last.aborted && !v.hand) return end(b, v);
  lobby(b, v);
}
function seats(b, v) {
  var box = el("div", "tbseats");
  v.seats.forEach(function (x, s) {
    var row = el("div", "tbseat" + (x.me ? " me" : ""));
    if (x.free) {
      row.appendChild(el("span", "", (s + 1) + ". " + t(x.held ? "held" : "free")));
      if (!x.held) row.appendChild(el("button", "btn hot", t("invite", { n: s + 1 }), function () { Kit.sfx.tap(); inviteOne(); }));
    } else {
      row.appendChild(el("span", "", (s + 1) + ". " + x.emoji + " " + (x.me ? t("you") : nick(x, s)) + (x.linked ? "" : " …")));
      row.appendChild(el("b", "", String(x.score)));
    }
    box.appendChild(row);
  });
  b.appendChild(box);
}
function lobby(b, v) {
  if (v.last && v.last.aborted) b.appendChild(el("p", "note tbwarn", t("aborted", { n: v.last.who })));
  seats(b, v);
  var missing = v.seats.filter(function (x) { return x.free; }).length;
  b.appendChild(el("p", "note tbstatus", missing ? t("wait", { n: missing }) : v.hand ? t("shuffle") : t("mesh")));
  v.invites.forEach(function (i) { b.appendChild(el("button", "btn", t("share") + " (" + (i.seat + 1) + ")", function () { Kit.share({ url: link(i.token), text: L().shareText[game] }); })); });
  b.appendChild(el("p", "note", t("badgeNote"))); b.appendChild(el("p", "note", t("ipNote")));
  b.appendChild(el("button", "btn", t("leave"), function () { close(); }));
}
async function inviteOne() {
  try { var i = await tb.invite(); Kit.share({ url: link(i.token), text: L().shareText[game] }); }
  catch (e) { Kit.toast(t(e && e.message === "full" ? "full" : "lost")); }
}
function label(a, st) {
  if (a.t === "vorbehalt") return t(a.v);
  if (a.t === "call") return a.a === a.p ? t(a.p + "_") : t(a.a);
  if (a.t === "bid") return t("bid", { v: a.v });
  if (a.t === "hold") return t("hold", { v: st.bid.v });
  if (a.t === "declare") return [t(a.game), a.hand ? t("handG") : "", a.ouvert ? t("ouvertA") : "", a.schwarz ? t("schwarzA") : a.schneider ? t("schneiderA") : ""].filter(Boolean).join(" · ");
  return t(a.t);
}
function info(v) {
  var st = v.hand.state, out = [];
  if (game === "doko") {
    if (st.phase === "play") out.push(st.wedding >= 0 ? t("wedding") : st.kind === "normal" ? t("normal") : t(st.kind));
    (st.calls || []).forEach(function (c) { out.push(seatName(v, c.seat) + ": " + (c.a === c.p ? t(c.p + "_") : t(c.a))); });
  } else {
    if (st.bid && st.bid.v) out.push(t("bidNow", { v: st.bid.v }));
    if (st.contract) out.push(seatName(v, st.declarer) + ": " + label(Object.assign({ t: "declare" }, st.contract), st));
  }
  return out.join(" · ");
}
function play(b, v) {
  var h = v.hand, st = h.state, acts = h.actions, mine = h.turn === v.mySeat;
  b.appendChild(el("p", "note tbinfo", info(v)));
  b.appendChild(el("p", "tbturn" + (mine ? " hot" : ""), h.turn < 0 ? "" : mine ? t("turnYou") : t("turnOf", { n: seatName(v, h.turn) })));
  // the trick on the table: the running one, or the last one taken while the next has not started
  var tr = st.trick && st.trick.cards.length ? st.trick : st.tricks.length ? st.tricks[st.tricks.length - 1] : null, box = el("div", "tbtrick");
  if (tr) tr.cards.forEach(function (x) { var w = el("div", "tbplayed"); w.appendChild(cardEl(x.card)); w.appendChild(el("small", "", seatName(v, x.seat))); box.appendChild(w); });
  b.appendChild(box);
  if (st.open && st.declarer !== v.mySeat) { var op = el("div", "tbhand tbopen"); sortHand(st, st.open).forEach(function (c) { op.appendChild(cardEl(c, null, "small")); }); b.appendChild(op); }
  var playable = {}; acts.forEach(function (a) { if (a.t === "play") playable[a.card] = a; });
  var pushing = acts.some(function (a) { return a.t === "push"; }), hand = el("div", "tbhand");
  if (!pushing) pick = [];
  sortHand(st, h.cards).forEach(function (c) {
    var a = playable[c], sel = pick.indexOf(c) >= 0;
    hand.appendChild(cardEl(c, a || pushing ? function () {
      Kit.sfx.tap();
      if (pushing) { pick = sel ? pick.filter(function (x) { return x !== c; }) : pick.concat([c]).slice(-2); render(tb.view()); return; }
      tb.act(a);
    } : null, (a || pushing ? "ok" : mine ? "no" : "") + (sel ? " sel" : "")));   // greyed only what I may not play now
  });
  b.appendChild(hand);
  var row = el("div", "tbacts");
  if (pushing) { b.appendChild(el("p", "note", t("pushHint"))); row.appendChild(el("button", "btn hot", t("push"), function () { if (pick.length === 2 && tb.act({ t: "push", cards: pick })) pick = []; })); }
  var bids = acts.filter(function (a) { return a.t === "bid"; });
  if (bids.length) row.appendChild(button(bids[0], st));     // the next value only; going higher is one tap more
  acts.filter(function (a) { return a.t !== "play" && a.t !== "push" && a.t !== "bid"; }).forEach(function (a) { row.appendChild(button(a, st)); });
  b.appendChild(row);
  b.appendChild(el("p", "note tbscore", v.seats.map(function (x, s) { return x.free ? "" : (x.me ? t("you") : nick(x, s)) + " " + x.score; }).join(" · ")));
}
function button(a, st) { return el("button", "btn" + (a.t === "pass" || a.t === "call" ? "" : " hot"), label(a, st), function () { Kit.sfx.tap(); tb.act(a); }); }
function end(b, v) {
  var l = v.last, r = l.result;
  if (l.cheat != null) b.appendChild(el("p", "livebig", t("cheat", { n: l.cheat >= 0 ? seatName(v, l.cheat) : "?" })));
  else if (l.audit && l.audit.length) b.appendChild(el("p", "livebig", t("bad", { n: l.audit[0].seat >= 0 ? seatName(v, l.audit[0].seat) : "?", w: l.audit[0].why })));
  else if (r && r.passedOut) b.appendChild(el("p", "livebig", t("passed")));
  else if (r) {
    var who = r.winner === "re" ? t("re_") : r.winner === "kontra" ? t("kontra_") : r.winner === "declarer" ? seatName(v, r.declarer) : r.winner === "defenders" ? t("defenders") : null;
    b.appendChild(el("p", "livebig", who ? t("won", { p: who }) : t("none")));
    if (r.eyes) b.appendChild(el("p", "note", Object.keys(r.eyes).map(function (k) { return t(k === "re" ? "re_" : k === "kontra" ? "kontra_" : k) + " " + r.eyes[k]; }).join(" : ") + " " + t("eyes")));
    var pts = game === "skat" ? r.list : r.points, list = el("div", "tbseats tbresult");
    l.roster.forEach(function (id, s) { var row = el("div", "tbseat"); row.appendChild(el("span", "", seatName(v, s))); row.appendChild(el("b", "", (pts[s] > 0 ? "+" : "") + pts[s])); list.appendChild(row); });
    b.appendChild(list);
    b.appendChild(el("p", "note tbcheck", t("checked")));
  }
  b.appendChild(el("p", "lbl", t("total")));
  seats(b, v);
  if (v.want) b.appendChild(el("p", "note", t("waitNext")));
  else b.appendChild(el("button", "btn hot", t("next"), function () { Kit.sfx.thud(); tb.next(); }));
  b.appendChild(el("button", "btn", t("leave"), function () { close(); }));
}
function start(make) {
  close(); layer().appendChild(el("p", "livebig", t("making")));
  return Promise.resolve().then(make).then(function (x) {
    tb = x; tb.on(render); render(tb.view());
    tick = setInterval(function () { if (tb && ov) render(tb.view()); }, 5000);
    return tb;
  }).catch(function (e) {
    var b = layer(); b.appendChild(el("p", "livebig", t(e && e.message === "full" ? "full" : "lost")));
    b.appendChild(el("button", "btn", t("leave"), function () { close(); }));
    return null;
  });
}
// A new table: I take seat 1 and invite straight away.
function open(g) {
  game = g === "skat" ? "skat" : "doko";
  return start(function () { return T.create(Object.assign({ game: game, live: window.Live }, me())); }).then(function (x) { if (x) inviteOne(); });
}
function accept(g, token) {
  game = g === "skat" ? "skat" : "doko";
  return start(function () { return T.join(token, Object.assign({ game: game, live: window.Live }, me())); });
}
window.TableUI = { open: open, accept: accept, close: close, cardSvg: cardSvg, preview: preview };
})();
