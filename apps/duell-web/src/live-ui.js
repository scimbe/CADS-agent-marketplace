/* Ballduell live on screen: invite, arrive, play, end. Its own full-screen layer, so the editor and home stay as they
   were. Rules live in ballduell.js, the connection in live.js; in tests a fake Live joins two pages directly. */
(function () {
"use strict";
var Kit = window.Kit, B = window.Ballduell, t = Kit.t;
var ov = null, conn = null, loop = 0, net = 0, game = null, busy = false, games = 0;   // game: { g } for a duel from window.LiveGames, { g: "rps", set } for the agent duel
// Further live duels register here: LiveGames[g](api, serving) plays one game on the layer; invite, badge and link stay here.
var GAMES = window.LiveGames = window.LiveGames || {};
// Shown on the shelf; switched on once the server side registered channels and a real game ran over edge and TURN.
var ON = true;
function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }
function layer() {
  close(true);
  ov = el("div", "liveov"); ov.setAttribute("role", "dialog");
  var body = el("div", "livebody"); ov.appendChild(body);
  // An arcade duel wears the arcade banner with its ✕ (arcade-ui.js); every other live game keeps the plain ✕.
  if (!(game && window.ArcadeUI && window.ArcadeUI.dress(ov, close, game.g))) { var x = el("button", "liveback", "✕", function () { Kit.sfx.tap(); close(); }); x.setAttribute("aria-label", t("xClose")); ov.insertBefore(x, body); ov.insertBefore(Kit.langBtn("livelang"), body); }
  document.body.appendChild(ov);
  return body;
}
function close(keepLink) {
  cancelAnimationFrame(loop); clearInterval(net); clearTimeout(net); loop = net = 0; busy = false;
  if (conn && !keepLink) { try { conn.close(); } catch (e) {} conn = null; }
  if (ov) { ov.remove(); ov = null; }
  again = null;
}
// The invited player's screen before the game draws itself again in another language (the game itself draws live).
var again = null;
window.addEventListener("daily:lang", function () { if (ov && again) again(); });
function screen(lines, buttons) {
  var b = layer();
  lines.forEach(function (l) { b.appendChild(el(l[0], l[1], l[2])); });
  // The plain "Back" button only where there is no banner ✕ to go back with.
  var banner = !!ov.querySelector(".arcbar");
  (buttons || []).forEach(function (x) { if (!(banner && x[2] === "btn")) b.appendChild(el("button", x[2] || "btn hot", x[0], x[1])); });
  return b;
}
function fail(e) {
  var k = { gone: "live_gone", expired: "live_expired", server: "live_server", self: "live_self", rate: "live_busy", busy: "live_busy", rtc: "live_nonet" }[e && e.message] || "live_lost";
  screen([["p", "livebig", t(k)]], [[t("live_again"), function () { invite(game); }], [t("live_home"), function () { close(); }, "btn"]]);
}
function link(token) { return window.DuellCore.SHARE_BASE + "#live=" + token + (game ? "&g=" + game.g : ""); }
// The agent duel brings the picture set of its card along; every other game is just its name.
// A free arcade card (the Robot, src/frei.js) brings its free part: checked here on both phones, so both play the same values.
function pick(g, set, free) {
  if (!g || !GAMES[g]) return null;
  if (g === "rps") return { g: g, set: set | 0 };
  var f = free && window.Frei ? window.Frei.sanitize(free) : null;
  return f && f.k === "arcade" && f.a === g ? { g: g, free: { k: "arcade", i: f.i, a: f.a, col: f.col, t: f.t, s: f.s, fa: f.fa } } : { g: g };
}
// A game may bring its own share and how-to text (live_<g>ShareText, live_<g>Howto); otherwise the arcade ones.
function own(k, fb, v) { return t(k) !== k ? t(k, v) : t(fb, v); }
function begin(serving) {
  if (!game) { play(serving); return; }
  busy = true;
  GAMES[game.g]({ conn: conn, layer: layer, close: close, el: el, again: function () { invite(game); }, badge: B.badge(conn.channel), game: game }, serving);
}
function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
// ---------- the inviter ----------
// My open invite in this tab. Its own link (tapped in the chat after sharing) brings me back here instead of using it up.
var mine = null, joined = null;
async function invite(opt) {
  game = pick(opt && opt.g, opt && opt.set, opt && opt.free); games = 0;
  screen([["p", "livebig", t("live_making")]]);
  var inv;
  try { inv = await window.Live.invite(onState); } catch (e) { fail(e); return; }
  try { sessionStorage.setItem("liveInvite", JSON.stringify({ token: inv.token, until: inv.expires })); } catch (e) {}
  if (window.OwnInvites) window.OwnInvites.add([inv.token], inv.expires);
  var share = function () { Kit.share({ url: link(inv.token), text: game ? own("live_" + game.g + "ShareText", "arc_share", { n: t("arc_" + game.g) }) : t("live_shareText") }); };
  var tick = 0, g = game;
  function wait() {
    clearInterval(tick); game = g;
    var b = screen([["p", "livebig", t("live_wait")], ["p", "livecount", ""], ["p", "note", t("live_waitNote")], ["p", "note", t("live_ipNote")]], [[t("live_share"), share], [t("live_home"), function () { close(); }, "btn"]]);
    var cnt = b.querySelector(".livecount");
    tick = setInterval(function () { if (!b.isConnected) return clearInterval(tick); cnt.textContent = t("live_left", { t: mmss(inv.expires - Date.now()) }); }, 500);
  }
  var me = mine = { token: inv.token, wait: wait };
  wait();
  share();
  try { conn = await inv.ready; } catch (e) { clearInterval(tick); if (mine === me) mine = null; if (window.OwnInvites) window.OwnInvites.drop([inv.token]); fail(e); return; }
  clearInterval(tick); me.wait = null;
  if (window.OwnInvites) window.OwnInvites.drop([inv.token]);   // used by the friend now: a later tap on it is an ordinary used link
  arrived();
  screen([["p", "livebig", t("live_here")], ["p", "livebadge", B.badge(conn.channel)], ["p", "note", t("live_badgeNote")]], [[t("live_start"), function () { conn.send(Object.assign({ t: "go" }, game)); begin(true); }]]);
  conn.onClose(lost);
}
// The friend took the invite: a short rising chime and a buzz (both follow the sound switch, Kit.muted), and while the
// page waits in the background (the inviter is usually still in the messenger) the tab title says so until it is back.
function arrived() {
  [660, 880].forEach(function (f, i) { Kit.tone(f, f, 0.14, "triangle", 0.16, i * 0.12); });
  Kit.haptic([200, 100, 200]);
  if (!document.hidden) return;
  var was = document.title, on = true, blink = setInterval(function () { document.title = (on = !on) ? t("live_here") : was; }, 1000);
  document.title = t("live_here");
  document.addEventListener("visibilitychange", function back() { if (document.hidden) return; clearInterval(blink); document.title = was; document.removeEventListener("visibilitychange", back); });
}
// My own link, opened on this device: never a join. The waiting screen or the running game if this tab still has it,
// otherwise a word that the link stays free, with a way to share it again or to invite anew.
function back(token) {
  if (joined === token && ov) return true;   // the link I came in with, tapped again during the game
  if (!mine || mine.token !== token) return false;
  if (mine.wait) { mine.wait(); return true; }
  return !!ov;
}
function ownLink(token, g) {
  if (ov && conn) { Kit.toast(t("live_own")); return; }   // another game runs here: it stays
  game = pick(g);
  var share = function () { Kit.share({ url: link(token), text: game ? own("live_" + game.g + "ShareText", "arc_share", { n: t("arc_" + game.g) }) : t("live_shareText") }); };
  screen([["p", "livebig", t("live_own")], ["p", "note", t("live_ownNote")]], [[t("live_share"), share], [t("live_again"), function () { invite(game); }], [t("live_home"), function () { close(); }, "btn"]]);
}
// ---------- the invited friend ----------
async function accept(token, g) {
  if (back(token)) return;
  if (window.OwnInvites && window.OwnInvites.mine([token])) { ownLink(token, g); return; }
  game = pick(g); games = 0; joined = token;
  screen([["p", "livebig", t("live_challenged")], ["p", "note", t("live_connecting")]]);
  try { conn = await window.Live.accept(token, onState); } catch (e) { fail(e); return; }
  conn.onClose(lost);
  (function ready() { screen([["p", "livebig", t("live_challenged")], ["p", "livebadge", B.badge(conn.channel)], ["p", "note", t("live_badgeNote")], ["p", "note", game ? own("live_" + game.g + "Howto", "arc_how_" + game.g) : t("live_howto")], ["p", "lbl", t("live_waitStart")]]); again = ready; })();
  conn.on(function (m) { if (m.t !== "go" || !ov || loop || busy) return; game = pick(m.g, m.set, m.free); begin(false); });
}
function onState(s) { var n = ov && ov.querySelector(".note"); if (n && t("live_s_" + s) !== "live_s_" + s) n.textContent = t("live_s_" + s); }
function lost() { if (!ov || !conn) return;   /* no connection any more: this side ended the game itself */ cancelAnimationFrame(loop); clearInterval(net); clearTimeout(net); loop = net = 0; busy = false; try { conn.close(); } catch (e) {} conn = null; /* close() frees the channel on the server too */ screen([["p", "livebig", t("live_lost")]], [[t("live_again"), function () { invite(game); }], [t("live_home"), function () { close(); }, "btn"]]); }
// ---------- the game ----------
function play(serving) {
  var body = layer(), cv = el("canvas", "livecv"), c = cv.getContext("2d"), info = el("p", "livescore", "");
  cv.width = B.W / 2; cv.height = B.H / 2;
  // The three pictures stay up the whole game: the invited player cannot hold the start screen to compare them.
  body.appendChild(el("p", "livemini", B.badge(conn.channel))); body.appendChild(info); body.appendChild(cv);
  var seed = conn.channel, s = { me: B.W / 2, opp: B.W / 2, oppAt: performance.now(), credit: 0.1, ball: null, score: [0, 0], n: 0, held: false, again: [false, false], done: false };
  // The other paddle is drawn from a small jitter buffer (smooth.js): no steps at the report rate, no jumps after a stall.
  var T = window.Smooth ? window.Smooth.track(1, { lo: [B.PW / 2], hi: [B.W - B.PW / 2] }) : null, t0 = performance.now();
  var countdown = performance.now() + 3000, last = performance.now();
  function toX(e) { var r = cv.getBoundingClientRect(); return Math.min(B.W - B.PW / 2, Math.max(B.PW / 2, (e.clientX - r.left) / r.width * B.W)); }
  cv.addEventListener("pointerdown", function (e) { s.me = toX(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", function (e) { if (e.buttons || e.pointerType === "touch") s.me = toX(e); });
  function serveNow() { s.ball = B.serve(seed, s.n); conn.send({ t: "serve", n: s.n, b: B.mirror(s.ball) }); s.n++; }
  conn.on(function (m) {
    if (m.t === "p" && typeof m.x === "number") {
      // Finger time saved up while nothing came (up to half a second) covers a burst after a stall, step by step.
      var now = performance.now(), x = B.W - m.x; s.credit = Math.min(0.5, s.credit + (now - s.oppAt) / 1000); s.oppAt = now;
      var use = Math.min(s.credit, Math.max(0.016, Math.abs(x - s.opp) / B.PMAX)); s.credit -= use;
      s.opp = B.plausiblePaddle(s.opp, x, use);
      if (T) T.push((now - t0) / 1000, typeof m.ms === "number" && isFinite(m.ms) ? m.ms / 1000 : null, [s.opp]);
    }
    else if ((m.t === "hit" || m.t === "serve") && m.b) { s.ball = m.b; s.held = false; if (m.t === "serve") s.n = m.n + 1; }   // already mirrored by the sender into this frame
    else if (m.t === "miss") { s.score[0]++; s.ball = null; Kit.sfx.pop(); check(); }
    else if (m.t === "again") { s.again[1] = true; restart(); }
    else if (m.t === "pause") info.textContent = t("live_pause");
  });
  net = setInterval(function () { conn && conn.send({ t: "p", x: Math.round(s.me), ms: Math.round(performance.now() - t0) }); }, 50);
  function check() {
    if (B.over(s.score)) { s.done = true; s.ball = null; end(); return; }
    // whoever just lost the point serves the next ball
  }
  function end() {
    var won = s.score[0] > s.score[1], b = layer();
    b.appendChild(el("p", "livebig", won ? t("live_won", { a: s.score[0], b: s.score[1] }) : t("live_lostGame", { a: s.score[0], b: s.score[1] })));
    var again = el("button", "btn hot", t("live_more"), function () { again.disabled = true; again.textContent = t("live_moreWait"); s.again[0] = true; conn && conn.send({ t: "again" }); restart(); });
    b.appendChild(again); b.appendChild(el("button", "btn", t("live_home"), function () { close(); }));
  }
  function restart() { if (!(s.again[0] && s.again[1])) return; play(!serving); }
  document.addEventListener("visibilitychange", function vis() { if (!ov) return document.removeEventListener("visibilitychange", vis); if (document.hidden && conn) conn.send({ t: "pause" }); });
  function frame(now) {
    if (!ov || s.done) return;
    // Real elapsed time in small steps: a slow phone plays at the same speed, and no step jumps past the paddle.
    var left = Math.min(0.25, (now - last) / 1000); last = now;
    if (now >= countdown && !s.ball && serving && s.n === 0) serveNow();
    while (s.ball && left > 0) {
      var dt = Math.min(0.02, left); left -= dt;
      if (!s.held) s.ball = B.step(s.ball, dt);
      if (s.ball.vy > 0) {
        var r = B.defend(s.ball, s.me);
        if (r && r.hit) { s.ball = r.ball; conn.send({ t: "hit", b: B.mirror(s.ball) }); Kit.sfx.tap(); }
        else if (r) { s.score[1]++; s.ball = null; conn.send({ t: "miss" }); Kit.haptic(40); check(); if (!s.done) setTimeout(function () { if (ov && !s.done) serveNow(); }, 800); }
      } else if (s.ball.y < B.TOP - B.R) { s.ball.y = B.TOP - B.R; s.held = true; }    // the other phone decides; wait for it
    }
    draw(now);
    loop = requestAnimationFrame(frame);
  }
  function draw(now) {
    var k = 0.5; c.fillStyle = "#111"; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = "#333"; c.setLineDash([12, 12]); c.beginPath(); c.moveTo(0, cv.height / 2); c.lineTo(cv.width, cv.height / 2); c.stroke(); c.setLineDash([]);
    c.fillStyle = "#ffd400"; c.fillRect((s.me - B.PW / 2) * k, B.PY * k, B.PW * k, 14);
    var sm = T && T.at((now - t0) / 1000, [B.PMAX]), opp = sm ? sm.v[0] : s.opp;
    c.fillStyle = "#ff3b1d"; c.fillRect((opp - B.PW / 2) * k, (B.H - B.PY) * k - 14, B.PW * k, 14);
    if (s.ball) { c.fillStyle = "#fff"; c.beginPath(); c.arc(s.ball.x * k, s.ball.y * k, B.R * k, 0, 6.3); c.fill(); }
    info.textContent = now < countdown && !s.ball ? String(Math.ceil((countdown - now) / 1000)) : t("live_score", { a: s.score[0], b: s.score[1] });
  }
  loop = requestAnimationFrame(frame);
}
// ---------- the agent duel: rock-paper-scissors to 5, every hand sealed before it is shown (rpslive.js) ----------
function agentOf() {
  var me = (window.DailyApp && window.DailyApp.me()) || {}, a = window.Duel.sanitizeAgent(Kit.store.agent, { n: me.nick, e: me.emoji || "🤖" });
  return { n: a.n, e: a.e };
}
function playRps(set) {
  var R = window.RpsLive, faces = window.DuelData.sets[set] || window.DuelData.sets[0], m = R.match(conn.channel, games), mine = agentOf(), foe = { n: "", e: "❔" };
  var again = [false, false], body = layer();
  busy = true;   // a running game: a late "go" does not start a second one
  body.appendChild(el("p", "livemini", B.badge(conn.channel)));
  var head = el("p", "livescore", ""), last = el("p", "rpslast", ""), say = el("p", "note", t("live_rpsPick")), row = el("div", "chips");
  [head, last, say, row].forEach(function (x) { body.appendChild(x); });
  function who() { return foe.n || t("live_friend"); }
  function draw() { var s = m.state().score; head.textContent = mine.e + " " + s[0] + " : " + s[1] + " " + foe.e; }
  function send(list) { list.forEach(function (x) { conn && conn.send(x); }); }
  function lock(on) { row.querySelectorAll("button").forEach(function (b) { b.disabled = on; }); }
  faces.forEach(function (f, i) {
    row.appendChild(el("button", "chip em hand", f, function () {
      if (m.state().picked || m.state().done) return;
      lock(true); Kit.sfx.tap(); say.textContent = t("live_rpsSealed", { n: who() });
      m.pick(i).then(function (r) { send(r.send); watch(); });
    }));
  });
  // A seal without its reveal would stall the game for good: after a while the round does not count.
  function watch() { clearTimeout(net); net = setTimeout(function () { var s = m.state(); if (ov && s.picked && s.theyPicked) stop(t("live_rpsStall")); }, 30000); }
  function stop(text) { clearTimeout(net); net = 0; busy = false; if (conn) { try { conn.close(); } catch (e) {} } conn = null; screen([["p", "livebig", text]], [[t("live_again"), function () { invite(game); }], [t("live_home"), function () { close(); }, "btn"]]); }
  conn.on(function (x) {
    if (x.t === "ag") { foe = { n: window.DuellCore.sanitizeName(x.n) || "", e: typeof x.e === "string" ? window.DuellCore.sanitizeEmoji(x.e) : "❔" }; draw(); return; }
    if (x.t === "again") { again[1] = true; restart(); return; }
    m.receive(x).then(function (r) {
      if (!ov) return;
      send(r.send); if (r.send.length) watch();
      if (r.cheat) { stop(t("live_rpsCheat", { n: who() })); return; }
      if (r.theyPicked && !m.state().picked) say.textContent = t("live_rpsTheyPicked", { n: who() });
      if (!r.result) return;
      clearTimeout(net); var o = r.result;
      last.textContent = faces[o.x] + "  " + faces[o.y]; draw();
      Kit.sfx[o.o > 0 ? "pop" : "tap"](); if (o.o < 0) Kit.haptic(40);
      say.textContent = t(o.o > 0 ? "live_rpsWin" : o.o < 0 ? "live_rpsLose" : "live_rpsDraw", { n: who() });
      if (o.over) end(o.score); else lock(false);
    });
  });
  function end(s) {
    row.remove();
    var b = el("div", "chips"), more = el("button", "btn hot", t("live_more"), function () { more.disabled = true; more.textContent = t("live_moreWait"); again[0] = true; conn && conn.send({ t: "again" }); restart(); });
    body.insertBefore(el("p", "livebig", s[0] > s[1] ? t("live_won", { a: s[0], b: s[1] }) : t("live_lostGame", { a: s[0], b: s[1] })), head);
    b.appendChild(more); b.appendChild(el("button", "btn", t("live_home"), function () { close(); })); body.appendChild(b);
    if (s[0] > s[1]) Kit.sfx.win();
  }
  function restart() { if (!(again[0] && again[1])) return; games++; playRps(set); }
  send([{ t: "ag", n: mine.n, e: mine.e }]); draw();
}
GAMES.rps = function () { playRps(game.set); };
window.LiveUI = { invite: invite, accept: accept, close: close, on: function () { return ON || window.__liveOn === true; } };
})();
