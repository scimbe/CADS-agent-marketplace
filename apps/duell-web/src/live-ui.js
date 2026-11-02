/* Ballduell live on screen: invite, arrive, play, end. Its own full-screen layer, so the editor and home stay as they
   were. Rules live in ballduell.js, the connection in live.js; in tests a fake Live joins two pages directly. */
(function () {
"use strict";
var Kit = window.Kit, B = window.Ballduell, t = Kit.t;
var ov = null, conn = null, loop = 0, net = 0;
// Shown on the shelf; switched on once the server side registered channels and a real game ran over edge and TURN.
var ON = false;
function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }
function layer() {
  close(true);
  ov = el("div", "liveov"); ov.setAttribute("role", "dialog");
  ov.appendChild(el("button", "liveback", "✕", function () { Kit.sfx.tap(); close(); }));
  var body = el("div", "livebody"); ov.appendChild(body); document.body.appendChild(ov);
  return body;
}
function close(keepLink) {
  cancelAnimationFrame(loop); clearInterval(net); loop = net = 0;
  if (conn && !keepLink) { try { conn.close(); } catch (e) {} conn = null; }
  if (ov) { ov.remove(); ov = null; }
}
function screen(lines, buttons) {
  var b = layer();
  lines.forEach(function (l) { b.appendChild(el(l[0], l[1], l[2])); });
  (buttons || []).forEach(function (x) { b.appendChild(el("button", x[2] || "btn hot", x[0], x[1])); });
  return b;
}
function fail(e) {
  var k = { gone: "live_gone", expired: "live_expired", server: "live_server", self: "live_self", rate: "live_busy", busy: "live_busy" }[e && e.message] || "live_lost";
  screen([["p", "livebig", t(k)]], [[t("live_again"), function () { invite(); }], [t("live_home"), function () { close(); }, "btn"]]);
}
function link(token) { return window.DuellCore.SHARE_BASE + "#live=" + token; }
function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
// ---------- the inviter ----------
async function invite() {
  screen([["p", "livebig", t("live_making")]]);
  var inv;
  try { inv = await window.Live.invite(onState); } catch (e) { fail(e); return; }
  try { sessionStorage.setItem("liveInvite", JSON.stringify({ token: inv.token, until: inv.expires })); } catch (e) {}
  var share = function () { Kit.share({ url: link(inv.token), text: t("live_shareText") }); };
  var b = screen([["p", "livebig", t("live_wait")], ["p", "livecount", ""], ["p", "note", t("live_waitNote")], ["p", "note", t("live_ipNote")]], [[t("live_share"), share], [t("live_home"), function () { close(); }, "btn"]]);
  var cnt = b.querySelector(".livecount"), tick = setInterval(function () { if (!b.isConnected) return clearInterval(tick); cnt.textContent = t("live_left", { t: mmss(inv.expires - Date.now()) }); }, 500);
  share();
  try { conn = await inv.ready; } catch (e) { clearInterval(tick); fail(e); return; }
  clearInterval(tick);
  screen([["p", "livebig", t("live_here")], ["p", "livebadge", B.badge(conn.channel)], ["p", "note", t("live_badgeNote")]], [[t("live_start"), function () { conn.send({ t: "go" }); play(true); }]]);
  conn.onClose(lost);
}
// ---------- the invited friend ----------
async function accept(token) {
  screen([["p", "livebig", t("live_challenged")], ["p", "note", t("live_connecting")]]);
  try { conn = await window.Live.accept(token, onState); } catch (e) { fail(e); return; }
  conn.onClose(lost);
  screen([["p", "livebig", t("live_challenged")], ["p", "livebadge", B.badge(conn.channel)], ["p", "note", t("live_badgeNote")], ["p", "note", t("live_howto")], ["p", "lbl", t("live_waitStart")]]);
  conn.on(function (m) { if (m.t === "go" && ov && !loop) play(false); });
}
function onState(s) { var n = ov && ov.querySelector(".note"); if (n && t("live_s_" + s) !== "live_s_" + s) n.textContent = t("live_s_" + s); }
function lost() { if (!ov) return; cancelAnimationFrame(loop); clearInterval(net); loop = net = 0; if (conn) { try { conn.close(); } catch (e) {} } conn = null; /* close() frees the channel on the server too */ screen([["p", "livebig", t("live_lost")]], [[t("live_again"), function () { invite(); }], [t("live_home"), function () { close(); }, "btn"]]); }
// ---------- the game ----------
function play(serving) {
  var body = layer(), cv = el("canvas", "livecv"), c = cv.getContext("2d"), info = el("p", "livescore", "");
  cv.width = B.W / 2; cv.height = B.H / 2; body.appendChild(info); body.appendChild(cv);
  var seed = conn.channel, s = { me: B.W / 2, opp: B.W / 2, oppAt: performance.now(), ball: null, score: [0, 0], n: 0, held: false, again: [false, false], done: false };
  var countdown = performance.now() + 3000, last = performance.now();
  function toX(e) { var r = cv.getBoundingClientRect(); return Math.min(B.W - B.PW / 2, Math.max(B.PW / 2, (e.clientX - r.left) / r.width * B.W)); }
  cv.addEventListener("pointerdown", function (e) { s.me = toX(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", function (e) { if (e.buttons || e.pointerType === "touch") s.me = toX(e); });
  function serveNow() { s.ball = B.serve(seed, s.n); conn.send({ t: "serve", n: s.n, b: B.mirror(s.ball) }); s.n++; }
  conn.on(function (m) {
    if (m.t === "p" && typeof m.x === "number") { var now = performance.now(); s.opp = B.plausiblePaddle(s.opp, B.W - m.x, (now - s.oppAt) / 1000); s.oppAt = now; }
    else if ((m.t === "hit" || m.t === "serve") && m.b) { s.ball = m.b; s.held = false; if (m.t === "serve") s.n = m.n + 1; }   // already mirrored by the sender into this frame
    else if (m.t === "miss") { s.score[0]++; s.ball = null; Kit.sfx.pop(); check(); }
    else if (m.t === "again") { s.again[1] = true; restart(); }
    else if (m.t === "pause") info.textContent = t("live_pause");
  });
  net = setInterval(function () { conn && conn.send({ t: "p", x: Math.round(s.me) }); }, 50);
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
    c.fillStyle = "#ff3b1d"; c.fillRect((s.opp - B.PW / 2) * k, (B.H - B.PY) * k - 14, B.PW * k, 14);
    if (s.ball) { c.fillStyle = "#fff"; c.beginPath(); c.arc(s.ball.x * k, s.ball.y * k, B.R * k, 0, 6.3); c.fill(); }
    info.textContent = now < countdown && !s.ball ? String(Math.ceil((countdown - now) / 1000)) : t("live_score", { a: s.score[0], b: s.score[1] });
  }
  loop = requestAnimationFrame(frame);
}
window.LiveUI = { invite: invite, accept: accept, close: close, on: function () { return ON || window.__liveOn === true; } };
})();
