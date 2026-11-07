/* Doppelkopf, Skat and Bauernskat live on screen: the table (seats, invites), the hand, the end of a hand. Its own full-screen
   layer like live-ui.js. The table logic is table.js, the rules doko.js / skat.js / bauernskat.js, the cards mpoker.js.
   Bauernskat is for two: against a friend over one pair link, or against the bot on this device - a second table in
   the same page on Auto, joined over an in-page link, so it shuffles, locks and is checked exactly like a person.
   The card faces are drawn here in code (four-colour French deck as in German tournaments: clubs black, spades green,
   hearts red, diamonds orange); made for this app and dedicated to the public domain (CC0 1.0), licenses/Kartendeck-CC0.txt. */
(function () {
"use strict";
var Kit = window.Kit, T = window.Table;
var TX = {
  de: { doko: "Doppelkopf", skat: "Skat", bauernskat: "Bauernskat", making: "Tisch wird gedeckt …", invite: "➕ Platz {n} einladen", share: "Nochmal teilen",
    shareText: { doko: "Doppelkopf live! Mir fehlt noch wer am Tisch – tippen und hinsetzen (15 Min):", skat: "Skat live! Mir fehlt noch wer am Tisch – tippen und hinsetzen (15 Min):", bauernskat: "Bauernskat zu zweit! Tippen und hinsetzen (15 Min):" },
    inviteAll: "👥 Alle einladen", shareAll: "Gruppenlink nochmal teilen",
    shareGroup: { doko: "Doppelkopf live! Wer zuerst tippt, sitzt am Tisch (15 Min):", skat: "Skat live! Wer zuerst tippt, sitzt am Tisch (15 Min):", bauernskat: "Bauernskat zu zweit! Wer zuerst tippt, spielt gegen mich (15 Min):" },
    bsBot: "🤖 Gegen den Bot", bsLink: "🔗 Freund per Link", bsHow: "Skat zu zweit: 8 Stapel, je eine Karte offen auf einer verdeckten. Vorhand sagt an, 61 Augen gewinnen.",
    bsDeclare: "Sag das Spiel an:", botName: "Bot", r_null: "Null erlaubt",
    bsBad: "⚠ {n} hat einen falschen Schlüssel geschickt – dieses Spiel zählt nicht. Aufstehen beendet es.",
    autoOff: "🤖 Auto: aus", autoOn: "🤖 Auto: an", autoIn: "Auto in {n} s", ghost: "🤖 spielt offen für {n}",
    guest: "Gast {n}", total: "Gesamt", free: "frei", held: "eingeladen …", you: "Du", wait: "Es fehlen noch {n}.", mesh: "Alle verbinden sich …", shuffle: "Alle mischen gemeinsam …",
    badgeNote: "Seht ihr alle dieselben drei Bilder? Dann sitzt ihr am selben Tisch.", ipNote: "Live-Spiele laufen möglichst direkt zwischen euren Geräten. Dabei können die Geräte die IP-Adressen der anderen sehen.",
    leave: "Aufstehen", turnYou: "Du bist dran", turnOf: "{n} ist dran", next: "Nächstes Spiel", waitNext: "Warte auf die anderen …",
    won: "{p} gewinnt", none: "Keiner gewinnt", checked: "✓ Alle Karten nachgeprüft: fair gemischt, richtig gespielt.",
    cheat: "⚠ Beim Mischen hat jemand geschummelt ({n}). Das Spiel zählt nicht.", bad: "⚠ Regelverstoß von {n} ({w}). Das Spiel zählt nicht.",
    aborted: "{n} ist aufgestanden – dieses Spiel zählt nicht. Ladet jemanden ein, dann geht's weiter.", lost: "Verbindung zum Tisch weg.",
    full: "Der Tisch ist schon voll (oder der Link ist abgelaufen).", joining: "Du wirst an den Tisch geholt …",
    own: "Das ist deine eigene Einladung – sie bleibt frei für deine Freunde.", ownNote: "Dein Tisch steht dort, wo du eingeladen hast. Ist das zu, deck hier einen neuen.", fresh: "Neuen Tisch decken", back: "Zurück",
    gesund: "Gesund", vorbehalt: "Vorbehalt", hochzeit: "Hochzeit", damen: "Damensolo", buben: "Bubensolo", fleischlos: "Fleischloser", kreuz: "Kreuz-Solo", pik: "Pik-Solo", herz: "Herz-Solo", karo: "Karo-Solo",
    k90: "keine 90", k60: "keine 60", k30: "keine 30", schwarz: "schwarz", normal: "Normalspiel", wedding: "Hochzeit",
    bid: "{v} reizen", hold: "Ja ({v})", pass: "Passe", pickup: "Skat aufnehmen", push: "Diese 2 drücken", pushHint: "Tipp zwei Karten an, die du drückst.",
    G: "Grand", N: "Null", C: "Kreuz", S: "Pik", H: "Herz", D: "Karo", handG: "Hand", schneiderA: "Schneider angesagt", schwarzA: "Schwarz angesagt", ouvertA: "offen",
    show: "Karten offen hinlegen", re_: "Re", kontra_: "Kontra", declarer: "Alleinspieler", defenders: "Gegenspieler", passed: "Eingepasst – neu geben.", eyes: "Augen",
    bidNow: "Gereizt: {v}", ranks: { A: "A", T: "10", K: "K", Q: "D", J: "B", 9: "9", 8: "8", 7: "7" },
    house: "Hausregeln (gelten für alle am Tisch)", houseNone: "Turnierregeln", r_dulle: "2. Dulle sticht 1.", r_nosp: "Ohne Fuchs & Karlchen", r_ramsch: "Ramsch statt Einpassen", r_kontra: "Kontra & Re",
    kontra: "Kontra!", re: "Re!", ramschG: "Ramsch", ramschLost: "Ramsch: {n} verliert", march: "Durchmarsch: {n}",
    why: "Warum?", wLedT: "Trumpf angespielt: wer Trumpf hat, muss Trumpf geben.", wLed: "{s} angespielt: wer {s} hat, muss {s} bedienen.",
    wTrump: "{n} hat kein {s} und sticht mit Trumpf.", wOff: "{n} hat kein {s} und wirft ab.", wWinTrump: "{c} gewinnt: Trumpf schlägt jede andere Farbe.",
    wWinT: "{c} gewinnt: höchster Trumpf im Stich.", wWin: "{c} gewinnt: höchste {s} im Stich.", wFirst: "{c} gewinnt: zwei gleiche Karten, die zuerst gespielte zählt.",
    wDulle: "{c} gewinnt: Hausregel, die zweite Dulle sticht die erste.", wOrder: "Trumpf von oben: {o} …", wNoTrump: "Kein Trumpf in diesem Spiel.", trumpW: "Trumpf" },
  en: { doko: "Doppelkopf", skat: "Skat", bauernskat: "Bauernskat", making: "Setting the table …", invite: "➕ Invite seat {n}", share: "Share again",
    shareText: { doko: "Doppelkopf live! I'm missing a player – tap and take a seat (15 min):", skat: "Skat live! I'm missing a player – tap and take a seat (15 min):", bauernskat: "Bauernskat for two! Tap and take a seat (15 min):" },
    inviteAll: "👥 Invite everyone", shareAll: "Share group link again",
    shareGroup: { doko: "Doppelkopf live! First to tap gets a seat (15 min):", skat: "Skat live! First to tap gets a seat (15 min):", bauernskat: "Bauernskat for two! First to tap plays me (15 min):" },
    bsBot: "🤖 Play the bot", bsLink: "🔗 Friend via link", bsHow: "Skat for two: 8 stacks, each one card face up on one face down. Forehand names the game, 61 card points win.",
    bsDeclare: "Name the game:", botName: "Bot", r_null: "Null allowed",
    bsBad: "⚠ {n} sent a wrong key – this game does not count. Stand up to end it.",
    autoOff: "🤖 Auto: off", autoOn: "🤖 Auto: on", autoIn: "Auto in {n} s", ghost: "🤖 plays {n}'s cards face up",
    guest: "Guest {n}", total: "Total", free: "free", held: "invited …", you: "You", wait: "{n} missing.", mesh: "Everyone is connecting …", shuffle: "Shuffling together …",
    badgeNote: "Do you all see the same three pictures? Then you sit at the same table.", ipNote: "Live games run directly between your devices where possible. The devices may see each other's IP addresses.",
    leave: "Stand up", turnYou: "Your turn", turnOf: "{n}'s turn", next: "Next game", waitNext: "Waiting for the others …",
    won: "{p} wins", none: "Nobody wins", checked: "✓ Every card checked: fairly shuffled, fairly played.",
    cheat: "⚠ Someone cheated while shuffling ({n}). This game does not count.", bad: "⚠ Rule broken by {n} ({w}). This game does not count.",
    aborted: "{n} left – this game does not count. Invite someone and carry on.", lost: "Connection to the table lost.",
    full: "The table is already full (or the link has expired).", joining: "Taking you to the table …",
    own: "This is your own invite – it stays free for your friends.", ownNote: "Your table is where you sent the invite. If that is closed, set a new one here.", fresh: "Set a new table", back: "Back",
    gesund: "Healthy", vorbehalt: "Reservation", hochzeit: "Marriage", damen: "Queen solo", buben: "Jack solo", fleischlos: "Aces solo", kreuz: "Clubs solo", pik: "Spades solo", herz: "Hearts solo", karo: "Diamonds solo",
    k90: "no 90", k60: "no 60", k30: "no 30", schwarz: "schwarz", normal: "Normal game", wedding: "Marriage",
    bid: "Bid {v}", hold: "Yes ({v})", pass: "Pass", pickup: "Pick up the skat", push: "Discard these 2", pushHint: "Tap the two cards you discard.",
    G: "Grand", N: "Null", C: "Clubs", S: "Spades", H: "Hearts", D: "Diamonds", handG: "Hand", schneiderA: "Schneider announced", schwarzA: "Schwarz announced", ouvertA: "open",
    show: "Lay your cards open", re_: "Re", kontra_: "Kontra", declarer: "Declarer", defenders: "Defenders", passed: "All passed – deal again.", eyes: "card points",
    bidNow: "Bid: {v}", ranks: { A: "A", T: "10", K: "K", Q: "Q", J: "J", 9: "9", 8: "8", 7: "7" },
    house: "House rules (for everyone at the table)", houseNone: "Tournament rules", r_dulle: "2nd Ten beats 1st", r_nosp: "No Fox & Charlie", r_ramsch: "Ramsch if all pass", r_kontra: "Kontra & Re",
    kontra: "Kontra!", re: "Re!", ramschG: "Ramsch", ramschLost: "Ramsch: {n} loses", march: "Durchmarsch: {n}",
    why: "Why?", wLedT: "Trump led: whoever has trump must play trump.", wLed: "{s} led: whoever has {s} must follow.",
    wTrump: "{n} has no {s} and trumps.", wOff: "{n} has no {s} and throws off.", wWinTrump: "{c} wins: trump beats every other suit.",
    wWinT: "{c} wins: highest trump in the trick.", wWin: "{c} wins: highest {s} in the trick.", wFirst: "{c} wins: two equal cards, the first one played counts.",
    wDulle: "{c} wins: house rule, the second Heart Ten beats the first.", wOrder: "Trumps from the top: {o} …", wNoTrump: "No trumps in this game.", trumpW: "trump" }
};
function L() { return window.DuellCore.textsFor(TX, Kit.lang); }
function t(k, v) { var s = L()[k]; if (s == null) s = TX.de[k]; if (s == null) return k; return String(s).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); }
function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }

// ---------- the deck ----------
var SUIT = { C: ["♣", "#111111"], S: ["♠", "#178a3a"], H: ["♥", "#d61f1f"], D: ["♦", "#b45309"] };   // diamonds a darker orange: 5:1 on white (AA)
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
  var sk = game !== "doko", kind = st && (st.kind || (st.contract && st.contract.game)) || (sk ? "G" : "normal"), rk = sk && kind === "N" ? "AKQJT987" : "ATKQJ987", J = ["CJ", "SJ", "HJ", "DJ"];
  function key(c) {
    var tr = game === "doko" ? window.Doko.trumps(kind).indexOf(c) : kind === "N" ? -1 : J.indexOf(c) >= 0 ? J.indexOf(c) : window.Skat.isTrump(kind, c) ? 4 + rk.indexOf(c[1]) : -1;
    return tr >= 0 ? tr : 100 + "CSHD".indexOf(c[0]) * 10 + rk.indexOf(c[1]);
  }
  return cards.slice().sort(function (a, b) { return key(a) - key(b); });
}
// The day's card: a fan of four cards over the game's name.
function preview(c, W, H, doc) {
  c.fillStyle = "#0d5c2e"; c.fillRect(0, 0, W, H);
  var fan = doc.g === "skat" ? ["CJ", "SJ", "HA", "DT"] : doc.g === "bauernskat" ? ["DJ", "SA", "HT", "CJ"] : ["HT", "CQ", "SQ", "DA"], cw = W * 0.22, ch = cw * 1.5;
  fan.forEach(function (code, i) {
    c.save(); c.translate(W / 2, H * 0.62); c.rotate((i - 1.5) * 0.22); c.translate(-cw / 2, -ch);
    c.fillStyle = "#fff"; c.strokeStyle = "#111"; c.lineWidth = 4; c.beginPath(); c.rect(0, 0, cw, ch); c.fill(); c.stroke();
    var s = SUIT[code[0]]; c.fillStyle = s[1]; c.font = "900 " + Math.round(cw * 0.28) + "px system-ui,sans-serif"; c.textAlign = "left"; c.textBaseline = "top";
    c.fillText(TX.de.ranks[code[1]], cw * 0.08, cw * 0.06); c.font = Math.round(cw * 0.5) + "px system-ui,sans-serif"; c.textAlign = "center"; c.fillText(s[0], cw / 2, ch * 0.42);
    c.restore();
  });
  var name = TX.de[pickGame(doc.g)].toUpperCase();
  c.fillStyle = "#ffd400"; c.font = "400 " + Math.round(W * (name.length > 8 ? 0.1 : 0.12)) + "px Anton,Impact,sans-serif"; c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.fillText(name, W / 2, H * 0.84);
}
if (window.Render) window.Render.extra.table = preview;

function pickGame(g) { return g === "skat" || g === "bauernskat" ? g : "doko"; }
// ---------- the layer ----------
var ov = null, tb = null, robot = null, game = "doko", pick = [], tick = 0, whyAt = "";
var mine = [];   // the tokens of this table's links that I made or came in with: tapped again, they lead back here
// Bauernskat (playBs): phone first, portrait 360-412 px - the other's 8 stacks small on top, the trick, my 8 stacks below
// (4 x 2, or 8 in a row where there is room). --cw: my card width from the screen's width and height, so 360x740 needs
// no scrolling. Lives here, in the table part, not in the page's core CSS.
var CSS = ".bsov{--cw:min(84px,10.8vh,calc((100vw - 48px)/4));--ow:min(46px,5.6vh,calc((100vw - 56px)/8));--tw:min(64px,8vh);padding:0 12px max(12px,env(safe-area-inset-bottom));overflow-x:hidden}" +
  ".bsov .tbbody{max-width:480px;gap:6px;padding-top:12px}.bsov .tbbody>.lbl:first-child{margin:0 0 0 52px;align-self:flex-start;font-size:16px;min-height:44px;line-height:44px}" +
  ".bsplay{width:100%;display:flex;flex-direction:column;gap:6px}.bsleft,.bsright{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}" +
  ".bstop{width:100%;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:2px 8px}.bstop .tbinfo{font-weight:800;text-align:left;margin:0}" +
  ".bsov .tbturn{font-size:17px;min-height:0}.bsov .tbturn.hot{color:var(--ink);background:var(--paper);border:2px solid var(--ink);padding:0 6px}.bswho{margin:0;font:800 15px var(--ui);align-self:flex-start}" +
  ".bsstacks{display:grid;grid-template-columns:repeat(4,var(--cw));gap:6px;justify-content:center}.bsstacks.theirs{grid-template-columns:repeat(8,var(--ow));gap:4px}" +
  ".bsstack{position:relative;width:100%;aspect-ratio:2/3.3}.bsstack .tbcard{position:absolute;left:0;top:0;width:100%;height:auto;aspect-ratio:2/3;z-index:1}.bsstack .bsback{top:auto;bottom:0;z-index:0}" +
  ".bsstack.empty{border:2px dashed rgba(17,17,17,.5);border-radius:6px;aspect-ratio:2/3}" +
  ".bsback{border-radius:6px;border:2px solid #111;background:#0d5c2e repeating-linear-gradient(45deg,transparent 0 6px,rgba(255,255,255,.18) 6px 9px)}" +
  ".bsstacks.mine .tbcard{min-width:44px}.bsstacks .tbcard.ok{outline:3px solid var(--ink);outline-offset:1px;border-radius:6px}" +
  ".bsmid{width:100%;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px 14px}.bsmid .tbexplain{flex-basis:100%}" +
  ".bstrick{min-height:calc(var(--tw)*1.5 + 16px);gap:12px;width:auto}.bstrick .tbcard{width:var(--tw);height:calc(var(--tw)*1.5)}.bsdeclare,.bsbad{margin:0;font-weight:900}" +
  ".bsov .tbacts .btn{min-height:48px;min-width:72px;font-size:17px}.bsfoot{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px}.bsfoot .tbauto{min-height:44px}.bsfoot .tbscore{margin:0;text-align:right}" +
  ".bsprev{width:min(100%,320px);height:auto;border:3px solid var(--ink)}" +
  "@media (min-width:700px){.bsov .tbbody{max-width:720px}.bsstacks.mine{grid-template-columns:repeat(8,var(--cw))}}" +
  "@media (orientation:landscape) and (max-height:520px){.bsov{--cw:min(60px,14vh);--ow:min(36px,9vh);--tw:min(52px,13vh)}.bsov .tbbody{max-width:920px}" +
  ".bsplay{display:grid;grid-template-columns:1fr 1.3fr;gap:12px;align-items:start}.bsstacks.mine{grid-template-columns:repeat(8,var(--cw))}}" +
  "@media (prefers-reduced-motion:reduce){.tbcard{transition:none}.tbcard.ok:active,.tbcard.sel{transform:none}}";
function css() { if (document.getElementById("bscss")) return; var st = document.createElement("style"); st.id = "bscss"; st.textContent = CSS; document.head.appendChild(st); }
function layer() {
  css();
  if (!ov) {
    ov = el("div", "liveov tbov" + (game === "bauernskat" ? " bsov" : "")); ov.setAttribute("role", "dialog");
    var x = el("button", "liveback", "✕", function () { Kit.sfx.tap(); close(); }); x.setAttribute("aria-label", Kit.t("xClose")); ov.appendChild(x);
    ov.appendChild(Kit.langBtn("livelang"));      // an invited player can change the language before the first card
    ov.appendChild(el("div", "livebody tbbody")); document.body.appendChild(ov);
  }
  var b = ov.querySelector(".tbbody"); b.textContent = ""; return b;
}
function close() {
  clearInterval(tick); tick = 0;
  // against the bot both leave at once; at a live Bauernskat table my device plays the hand out on Auto first (table.js)
  if (tb) { try { tb.leave(!!robot); } catch (e) {} tb = null; }
  if (robot) { try { robot.leave(true); } catch (e) {} robot = null; }
  if (ov) { ov.remove(); ov = null; }
  redo = null;
}
// Another language: the open table draws itself again in it, and so does a screen before the table.
var redo = null;
window.addEventListener("daily:lang", function () { if (!ov) return; if (tb) render(tb.view()); else if (redo) redo(); });
// one token, or a group link with one token per seat (tried in order by whoever opens it)
function link(tokens) { var r = tb ? tb.view().rules : saved(); return window.DuellCore.SHARE_BASE + "#tisch=" + game + "." + [].concat(tokens).join(".") + (r.length ? "&r=" + r.join(".") : ""); }
// The house rules this device chose last for the game: the next table it sets starts with them. Only a preference.
function engine() { return game === "skat" ? window.Skat : game === "bauernskat" ? window.Bauernskat : window.Doko; }
function saved() { var r = Kit.store.tbRules; return engine().rules(r && r[game]); }
function keepRules(list) { var r = Kit.store.tbRules; r = r && typeof r === "object" && !Array.isArray(r) ? r : {}; r[game] = list; Kit.store.tbRules = r; Kit.save(); }
// Chips for the house rules: everyone sees the same list (table.js keeps it equal); a change only between two games.
function houseChips(b, v) {
  b.appendChild(el("p", "lbl", t("house")));
  var row = el("div", "chips tbrules"), on = v.rules || [], free = v.rulesOpen;   // fixed once I said "ready": the others may start with them
  engine().RULES.forEach(function (k) {
    var x = on.indexOf(k) >= 0, c = el("button", "chip" + (x ? " on" : ""), t("r_" + k), function () {
      if (!free) return; Kit.sfx.tap();
      var next = x ? on.filter(function (y) { return y !== k; }) : on.concat([k]);
      if (tb.rules(next)) keepRules(engine().rules(next));
    });
    c.setAttribute("aria-pressed", String(x)); c.disabled = !free; row.appendChild(c);
  });
  b.appendChild(row);
}
function ruleLine(v) { return (v.rules || []).length ? v.rules.map(function (k) { return t("r_" + k); }).join(" · ") : t("houseNone"); }
function clock(v) { return v.auto ? "🤖" : v.deadline ? t("autoIn", { n: Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) }) : ""; }
function me() { var p = window.Daily.sanitizeProfile(Kit.store && Kit.store.me); return { name: p.nick, emoji: p.emoji }; }
// players without a nickname are "Gast 2" after their seat
function nick(x, s) { return x.name && x.name !== "?" ? x.name : t("guest", { n: s + 1 }); }
function seatName(v, s) {
  var x = v.seats[s];
  if (!x || x.free) return v.last && v.last.names && v.last.names[s] || "?";        // a seat freed after the hand
  return (x.me ? t("you") : x.emoji + " " + nick(x, s)) + (x.auto ? " 🤖" : "");
}
function render(v) {
  if (!ov) return;
  var b = layer();
  b.appendChild(el("p", "lbl", t(game)));
  // the three pictures on every screen of the table, so everyone can compare them at any time (not against the bot)
  if (!robot) b.appendChild(el("p", "livemini tbbadge", v.badge || "· · ·"));
  if (v.lost) { b.appendChild(el("p", "livebig", t(v.note === "full" ? "full" : "lost"))); b.appendChild(el("button", "btn", t("leave"), function () { close(); })); return; }
  if (v.mySeat < 0) { b.appendChild(el("p", "livebig", t("joining"))); return; }
  if (v.hand && v.hand.dealt) return game === "bauernskat" ? playBs(b, v) : play(b, v);
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
  houseChips(b, v);
  var missing = v.seats.filter(function (x) { return x.free; }).length;
  b.appendChild(el("p", "note tbstatus", missing ? t("wait", { n: missing }) : v.hand ? t("shuffle") : t("mesh")));
  var unheld = v.seats.filter(function (x) { return x.free && !x.held; }).length, groups = {};
  if (unheld > 1) b.appendChild(el("button", "btn hot", t("inviteAll"), function () { Kit.sfx.tap(); inviteGroup(); }));
  v.invites.forEach(function (i) {
    if (i.group) { (groups[i.group] = groups[i.group] || []).push(i.token); return; }
    b.appendChild(el("button", "btn", t("share") + " (" + (i.seat + 1) + ")", function () { Kit.share({ url: link(i.token), text: L().shareText[game] }); }));
  });
  // the tokens of a group link nobody has used yet, in one link again
  Object.keys(groups).forEach(function (g) { b.appendChild(el("button", "btn", t("shareAll"), function () { Kit.share({ url: link(groups[g]), text: L().shareGroup[game] }); })); });
  b.appendChild(el("p", "note", t("badgeNote"))); b.appendChild(el("p", "note", t("ipNote")));
  b.appendChild(el("button", "btn", t("leave"), function () { close(); }));
}
// Every link I hand out is remembered on this device first, so that tapping it myself never takes a seat (own.js).
function made(tokens, exp) { mine = mine.concat(tokens); if (window.OwnInvites) window.OwnInvites.add(tokens, exp); }
async function inviteOne() {
  try { var i = await tb.invite(); made([i.token], i.expires); Kit.share({ url: link(i.token), text: L().shareText[game] }); }
  catch (e) { Kit.toast(t(e && e.message === "full" ? "full" : "lost")); }
}
async function inviteGroup() {
  try { var g = await tb.inviteAll(); made(g.tokens, g.expires); Kit.share({ url: link(g.tokens), text: L().shareGroup[game] }); }
  catch (e) { Kit.toast(t(e && e.message === "full" ? "full" : "lost")); }
}
function label(a, st) {
  if (a.t === "vorbehalt") return t(a.v);
  if (a.t === "kontra" || a.t === "re") return t(a.t);
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
    if (st.contract && st.contract.ramsch) out.push(t("ramschG"));
    else {
      if (st.bid && st.bid.v) out.push(t("bidNow", { v: st.bid.v }));
      if (st.contract) out.push(seatName(v, st.declarer) + ": " + label(Object.assign({ t: "declare" }, st.contract), st));
    }
    if (st.kontra) out.push(t(st.kontra > 1 ? "re" : "kontra"));
  }
  return out.join(" · ");
}
function play(b, v) {
  var h = v.hand, st = h.state, acts = h.actions, mine = h.turn === v.mySeat;
  b.appendChild(el("p", "note tbinfo", info(v)));
  if ((st.rules || []).length) b.appendChild(el("p", "note tbhouse", "⚖ " + ruleLine({ rules: st.rules })));
  var turn = el("p", "tbturn" + (mine ? " hot" : ""), h.turn < 0 ? "" : mine ? t("turnYou") : t("turnOf", { n: seatName(v, h.turn) }));
  if (mine) { turn.appendChild(document.createTextNode(" · ")); turn.appendChild(el("span", "tbclock", clock(v))); }   // the Auto countdown, ticking
  b.appendChild(turn);
  // the trick on the table: the running one, or the last one taken while the next has not started
  var tr = st.trick && st.trick.cards.length ? st.trick : st.tricks.length ? st.tricks[st.tricks.length - 1] : null, box = el("div", "tbtrick");
  if (tr) tr.cards.forEach(function (x) { var w = el("div", "tbplayed"); w.appendChild(cardEl(x.card)); w.appendChild(el("small", "", seatName(v, x.seat))); box.appendChild(w); });
  b.appendChild(box);
  if (tr) why(b, v, st, tr);
  if (st.open && st.declarer !== v.mySeat) { var op = el("div", "tbhand tbopen"); sortHand(st, st.open).forEach(function (c) { op.appendChild(cardEl(c, null, "small")); }); b.appendChild(op); }
  // who stood up: their cards are open for everyone now, Auto plays them
  (h.ghosts || []).forEach(function (g) {
    b.appendChild(el("p", "note tbghost", t("ghost", { n: seatName(v, g.seat).replace(" 🤖", "") })));
    var gh = el("div", "tbhand tbopen"); sortHand(st, g.cards).forEach(function (c) { gh.appendChild(cardEl(c, null, "small")); }); b.appendChild(gh);
  });
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
  var au = el("button", "btn tbauto" + (v.auto ? " hot" : ""), t(v.auto ? "autoOn" : "autoOff"), function () { Kit.sfx.tap(); tb.auto(!v.auto); });
  au.setAttribute("aria-pressed", v.auto ? "true" : "false"); b.appendChild(au);
  b.appendChild(el("p", "note tbscore", v.seats.map(function (x, s) { return x.free ? "" : (x.me ? t("you") : nick(x, s)) + (x.auto ? " 🤖" : "") + " " + x.score; }).join(" · ")));
}
// ---------- Bauernskat: phone first ----------
// Top: the other player's eight stacks, small. Middle: the trick. Bottom: my eight stacks, big enough to tap. A stack
// shows its card; a face-down card under it peeks out below.
function stack(x, playable, mine, dim) {
  var w = el("div", "bsstack" + (x.under ? " under" : "") + (!x.top && !x.under ? " empty" : ""));
  if (x.under) w.appendChild(el("span", "tbcard bsback"));
  if (x.top) {
    var a = playable[x.top];
    w.appendChild(cardEl(x.top, a ? function () { Kit.sfx.tap(); tb.act(a); } : null, mine ? (a ? "ok" : dim ? "no" : "") : ""));
  }
  return w;
}
function stackRow(row, playable, mine, label, dim) {
  var r = el("div", "bsstacks" + (mine ? " mine" : " theirs"));
  r.setAttribute("role", "group"); r.setAttribute("aria-label", label);
  row.forEach(function (x) { r.appendChild(stack(x, playable, mine, dim)); });
  return r;
}
function playBs(b, v) {
  var h = v.hand, st = h.state, acts = h.actions, mine = h.turn === v.mySeat, op = 1 - v.mySeat, box = el("div", "bsplay");
  var left = el("div", "bsleft"), right = el("div", "bsright");
  var top = el("div", "bstop");
  top.appendChild(el("span", "note tbinfo", info(v)));
  var turn = el("span", "tbturn" + (mine ? " hot" : ""), h.turn < 0 ? "" : mine ? t("turnYou") : t("turnOf", { n: seatName(v, h.turn) }));
  if (mine) { turn.appendChild(document.createTextNode(" · ")); turn.appendChild(el("span", "tbclock", clock(v))); }
  top.appendChild(turn);
  left.appendChild(top);
  // a key that did not open its card: the hand cannot go on, and everyone sees whose key it was
  if ((h.flags || []).length) left.appendChild(el("p", "note tbwarn bsbad", t("bsBad", { n: seatName(v, h.flags[0].seat) })));
  left.appendChild(el("p", "bswho", seatName(v, op)));
  left.appendChild(stackRow(st.stacks[op], {}, false, seatName(v, op)));
  var tr = st.trick && st.trick.cards.length ? st.trick : st.tricks.length ? st.tricks[st.tricks.length - 1] : null, tbox = el("div", "tbtrick bstrick");
  if (tr) tr.cards.forEach(function (x) { var w = el("div", "tbplayed"); w.appendChild(cardEl(x.card)); w.appendChild(el("small", "", seatName(v, x.seat))); tbox.appendChild(w); });
  var mid = el("div", "bsmid"); mid.appendChild(tbox);
  if (tr) why(mid, v, st, tr);
  left.appendChild(mid);
  var playable = {}; acts.forEach(function (a) { if (a.t === "play") playable[a.card] = a; });
  // my turn: what I may not play is greyed, so the cards I must follow with stand out
  right.appendChild(stackRow(st.stacks[v.mySeat], playable, true, t("you"), mine && Object.keys(playable).length > 0));
  var row = el("div", "tbacts");
  if (acts.some(function (a) { return a.t === "declare"; })) right.appendChild(el("p", "note bsdeclare", t("bsDeclare")));
  acts.filter(function (a) { return a.t !== "play"; }).forEach(function (a) { row.appendChild(button(a, st)); });
  right.appendChild(row);
  var foot = el("div", "bsfoot");
  var au = el("button", "btn tbauto" + (v.auto ? " hot" : ""), t(v.auto ? "autoOn" : "autoOff"), function () { Kit.sfx.tap(); tb.auto(!v.auto); });
  au.setAttribute("aria-pressed", v.auto ? "true" : "false"); foot.appendChild(au);
  foot.appendChild(el("span", "note tbscore", v.seats.map(function (x, s) { return x.free ? "" : (x.me ? t("you") : nick(x, s)) + " " + x.score; }).join(" · ")));
  right.appendChild(foot);
  box.appendChild(left); box.appendChild(right); b.appendChild(box);
}
// "Why?" at the trick: what the rules say about the cards on the table, nothing about anyone's hand. It stays open
// for this trick (the screen redraws every few seconds) and closes by itself on the next one.
function why(b, v, st, tr) {
  var key = (v.hand.no) + ":" + st.tricks.length + ":" + tr.cards.length, open = whyAt === key;
  var bt = el("button", "chip tbwhy" + (open ? " on" : ""), "❓ " + t("why"), function () { Kit.sfx.tap(); whyAt = open ? "" : key; render(tb.view()); });
  bt.setAttribute("aria-expanded", String(open)); b.appendChild(bt);
  if (!open) return;
  var kind = game === "doko" ? st.kind : st.contract ? st.contract.game : "G", x = engine().explain(kind, tr.cards, st.rules), box = el("div", "note tbexplain");
  if (!x) return;
  var suit = x.led === "T" ? t("trumpW") : t(x.led), c = cardName(x.card), lines = [x.led === "T" ? t("wLedT") : t("wLed", { s: suit })];
  x.plays.forEach(function (p) { if (p.how === "trump" || p.how === "off") lines.push(t(p.how === "trump" ? "wTrump" : "wOff", { n: seatName(v, p.seat), s: suit })); });
  lines.push(x.why === "trump" ? t("wWinTrump", { c: c }) : x.why === "first" ? t("wFirst", { c: c }) : x.why === "dulle" ? t("wDulle", { c: c }) : x.led === "T" ? t("wWinT", { c: c }) : t("wWin", { c: c, s: suit }));
  lines.push(x.order.length ? t("wOrder", { o: x.order.slice(0, 6).map(cardName).join(" > ") }) : t("wNoTrump"));
  lines.forEach(function (s) { box.appendChild(el("p", "", s)); });
  b.appendChild(box);
}
function button(a, st) { return el("button", "btn" + (a.t === "pass" || a.t === "call" ? "" : " hot"), label(a, st), function () { Kit.sfx.tap(); tb.act(a); }); }
function end(b, v) {
  var l = v.last, r = l.result;
  if (l.cheat != null) b.appendChild(el("p", "livebig", t("cheat", { n: l.cheat >= 0 ? seatName(v, l.cheat) : "?" })));
  else if (l.audit && l.audit.length) b.appendChild(el("p", "livebig", t("bad", { n: l.audit[0].seat >= 0 ? seatName(v, l.audit[0].seat) : "?", w: l.audit[0].why })));
  else if (r && r.passedOut) b.appendChild(el("p", "livebig", t("passed")));
  else if (r && r.ramsch) {
    b.appendChild(el("p", "livebig", r.durchmarsch >= 0 ? t("march", { n: seatName(v, r.durchmarsch) }) : t("ramschLost", { n: r.losers.map(function (s) { return seatName(v, s); }).join(", ") })));
    b.appendChild(el("p", "note", l.roster.map(function (id, s) { return seatName(v, s) + " " + r.seatEyes[s]; }).join(" · ") + " " + t("eyes")));
    var rl = el("div", "tbseats tbresult");
    l.roster.forEach(function (id, s) { var row = el("div", "tbseat"); row.appendChild(el("span", "", seatName(v, s))); row.appendChild(el("b", "", (r.points[s] > 0 ? "+" : "") + r.points[s])); rl.appendChild(row); });
    b.appendChild(rl); b.appendChild(el("p", "note tbcheck", t("checked")));
  }
  else if (r) {
    var who = r.winner === "re" ? t("re_") : r.winner === "kontra" ? t("kontra_") : r.winner === "declarer" ? seatName(v, r.declarer) : r.winner === "defenders" ? (game === "bauernskat" ? seatName(v, 1 - r.declarer) : t("defenders")) : null;
    b.appendChild(el("p", "livebig", who ? t("won", { p: who }) : t("none")));
    if (r.eyes) b.appendChild(el("p", "note", Object.keys(r.eyes).map(function (k) { return t(k === "re" ? "re_" : k === "kontra" ? "kontra_" : k) + " " + r.eyes[k]; }).join(" : ") + " " + t("eyes")));
    var pts = game === "skat" ? r.list : r.points, list = el("div", "tbseats tbresult");
    l.roster.forEach(function (id, s) { var row = el("div", "tbseat"); row.appendChild(el("span", "", seatName(v, s))); row.appendChild(el("b", "", (pts[s] > 0 ? "+" : "") + pts[s])); list.appendChild(row); });
    b.appendChild(list);
    b.appendChild(el("p", "note tbcheck", t("checked")));
  }
  b.appendChild(el("p", "lbl", t("total")));
  seats(b, v);
  houseChips(b, v);
  if (v.want) b.appendChild(el("p", "note", t("waitNext")));
  else b.appendChild(el("button", "btn hot", t("next"), function () { Kit.sfx.thud(); tb.next(); }));
  b.appendChild(el("button", "btn", t("leave"), function () { close(); }));
}
function start(make) {
  close(); mine = []; layer().appendChild(el("p", "livebig", t("making")));
  return Promise.resolve().then(make).then(function (x) {
    tb = x; tb.on(render); render(tb.view());
    // every second the Auto countdown, every five seconds the whole screen (redrawing more often would eat taps)
    var n = 0;
    tick = setInterval(function () {
      if (!tb || !ov) return;
      var v = tb.view(), c = ov.querySelector(".tbclock");
      if (++n % 5 === 0) render(v); else if (c) c.textContent = clock(v);
    }, 1000);
    return tb;
  }).catch(function (e) {
    var b = layer(); b.appendChild(el("p", "livebig", t(e && e.message === "full" ? "full" : "lost")));
    b.appendChild(el("button", "btn", t("leave"), function () { close(); }));
    return null;
  });
}
// A new table: I take seat 1 and invite everyone straight away, with one link for the group chat. Bauernskat first
// asks: the bot or a friend.
function open(g) {
  game = pickGame(g);
  if (game === "bauernskat") return choose();
  return friends();
}
function friends() { return start(function () { return T.create(Object.assign({ game: game, live: window.Live, rules: saved() }, me())); }).then(function (x) { if (x) inviteGroup(); }); }
function choose() {
  close(); redo = choose;
  var b = layer();
  b.appendChild(el("p", "lbl", t(game)));
  var cv = el("canvas", "bsprev"); cv.width = 640; cv.height = 400; cv.setAttribute("aria-hidden", "true"); preview(cv.getContext("2d"), 640, 400, { g: game }); b.appendChild(cv);
  b.appendChild(el("button", "btn hot", t("bsBot"), function () { Kit.sfx.thud(); vsBot(); }));
  if (window.LiveUI && window.LiveUI.on()) b.appendChild(el("button", "btn hot live", t("bsLink"), function () { Kit.sfx.thud(); friends(); }));
  b.appendChild(el("p", "note", t("bsHow")));
  return Promise.resolve(null);
}
// The bot: an in-page pair link (ordered, like a data channel) to a second table on Auto.
function localLive() {
  var wait = {}, n = 0;
  function hex() { var a = new Uint8Array(32); window.crypto.getRandomValues(a); return Array.from(a, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); }
  function pipe() {
    var ch = hex(), A = { h: null, cl: [], dead: false }, Bn = { h: null, cl: [], dead: false };
    function end(me, other) {
      return { channel: ch, on: function (h) { me.h = h; }, onClose: function (h) { me.cl.push(h); },
        send: function (o) { if (me.dead) return; var s = JSON.stringify(o); setTimeout(function () { if (!other.dead && other.h) other.h(JSON.parse(s)); }, 0); },
        close: function () { if (me.dead) return; me.dead = other.dead = true; setTimeout(function () { me.cl.concat(other.cl).forEach(function (f) { f(); }); }, 0); } };
    }
    return [end(A, Bn), end(Bn, A)];
  }
  return {
    invite: function () { var tk = ("bot" + (++n)).padEnd(22, "x"), ok; var ready = new Promise(function (r) { ok = r; }); wait[tk] = ok; return Promise.resolve({ token: tk, expires: Date.now() + 9e5, ready: ready }); },
    accept: function (tk) { var ok = wait[tk]; if (!ok) return Promise.reject(new Error("gone")); delete wait[tk]; var p = pipe(); ok(p[0]); return Promise.resolve(p[1]); }
  };
}
function vsBot() {
  return start(function () {
    // against the bot nobody waits: my turn has no clock and no auto move (autoMs -1)
    var lv = localLive(), x = T.create(Object.assign({ game: game, live: lv, rules: saved(), autoMs: -1 }, me()));
    return x.invite().then(function (inv) {
      return T.join(inv.token, { game: game, live: lv, name: t("botName"), emoji: "🧑‍🌾", autoFast: 900 });
    }).then(function (b) {
      robot = b; b.auto(true);
      b.on(function (v) { if (v.last && !v.hand && !v.want) setTimeout(function () { if (robot === b) b.next(); }, 0); });   // always ready for the next game
      return x;
    });
  });
}
// My own link, opened on this device: never a join. Back to the table if this tab still has it.
function back(list) {
  if (!tb || !ov || !list.some(function (x) { return mine.indexOf(x) >= 0; })) return false;
  render(tb.view()); return true;
}
// The table is not here any more (another tab, a reload): the link stays free, share it again or set a new table.
function ownLink(list) {
  if (tb && ov) { Kit.toast(t("own")); render(tb.view()); return Promise.resolve(tb); }   // another table runs here: it stays
  close(); redo = function () { ownLink(list); };
  var b = layer();
  b.appendChild(el("p", "lbl", t(game)));
  b.appendChild(el("p", "livebig", t("own"))); b.appendChild(el("p", "note", t("ownNote")));
  b.appendChild(el("button", "btn hot", t(list.length > 1 ? "shareAll" : "share"), function () { Kit.share({ url: link(list), text: L()[list.length > 1 ? "shareGroup" : "shareText"][game] }); }));
  b.appendChild(el("button", "btn hot", t("fresh"), function () { Kit.sfx.thud(); open(game); }));
  b.appendChild(el("button", "btn", t("back"), function () { close(); }));
  return Promise.resolve(null);
}
// tokens: "a" or "a.b.c" (a group link); rules: the house rules the link names ("dulle.nosp"), until the table says
function accept(g, tokens, rules) {
  var list = String(tokens).split(".");
  if (back(list)) return Promise.resolve(tb);
  game = pickGame(g);
  if (window.OwnInvites && window.OwnInvites.mine(list)) return ownLink(list);
  return start(function () { return T.join(list, Object.assign({ game: game, live: window.Live, rules: String(rules || "").split(".") }, me())); }).then(function (x) { if (x) mine = mine.concat(list); return x; });
}
window.TableUI = { open: open, accept: accept, close: close, cardSvg: cardSvg, preview: preview };
})();
