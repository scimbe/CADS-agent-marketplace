/* Tools on screen (kind "tool"): the sticky note and the file for two, each on a layer of its own in the frame of the
   editor (bar with ✕ and title, the picture in the middle, a paper panel, the big button at the foot). The rules are in
   tools.js; two devices meet over live.js (part play, asked for only when they do: one-time invite, Noise handshake of the
   ct-agent, then a WebRTC data channel). Nothing here goes to our servers: the note lives in this device's storage and in
   the #fragment of its link, a file only on the channel. No file name is logged or stored, nothing is kept after closing. */
(function () {
"use strict";
var Kit = window.Kit, T = window.Tools, C = window.DuellCore, t = Kit.t;
var KEY = "daily.notes", MAX_NOTES = 12;
var ov = null, keyH = null, conn = null, xf = null, gen = 0, mine = null, redraw = null, ticks = [];
function el(tag, cls, text, on) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (on) e.addEventListener("click", on); return e; }
function btn(text, cls, on) { var b = el("button", cls || "btn", text, on); b.type = "button"; return b; }
function mb(n) { return T.size(n, Kit.lang); }
function catalog() { return (window.Daily && window.Daily.IDEAS) || []; }
function kindOf(x) { var i = catalog().filter(function (c) { return c.kind === "tool" && (c.id === x || (c.tool && c.tool.t === x)); })[0]; return i ? (i.tool && i.tool.t) || i.id : x; }

// ---------- the layer ----------
function layer(title, w) {
  close();
  var my = ++gen;
  ov = el("section", "tlov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "tltitle"); ov.dataset.tool = w;
  var bar = el("header", "bar tight"), x = btn("✕", "ico tlx", function () { Kit.sfx.tap(); close(); }), h = el("div", "tltitle", title);
  x.setAttribute("aria-label", t("xClose")); h.id = "tltitle";
  bar.appendChild(x); bar.appendChild(h); bar.appendChild(Kit.langBtn("tllang"));
  var stage = el("div", "tlstage"), panel = el("div", "tlpanel"), foot = el("div", "foot tlfoot"), why = el("p", "why"), main = btn("", "press");
  why.setAttribute("aria-live", "polite"); foot.appendChild(why); foot.appendChild(main);
  [bar, stage, panel, foot].forEach(function (a) { ov.appendChild(a); });
  document.body.appendChild(ov);
  // Escape closes the layer; inside a field it only leaves the field (app.js does that), the typing stays.
  keyH = function (e) { if (e.key === "Escape" && ov && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !document.querySelector("dialog[open]")) { e.preventDefault(); close(); } };
  document.addEventListener("keydown", keyH);
  return { gen: my, stage: stage, panel: panel, foot: foot, why: why, main: main, title: h };
}
function close() {
  gen++;
  ticks.splice(0).forEach(function (x) { clearInterval(x); });
  if (xf) { xf.close(); xf = null; }
  if (conn) { var c = conn; conn = null; try { c.close(); } catch (e) {} }
  if (keyH) { document.removeEventListener("keydown", keyH); keyH = null; }
  if (ov) { ov.remove(); ov = null; }
  redraw = null; blob = null;
}
window.addEventListener("daily:lang", function () { if (ov && redraw) redraw(); });

// ---------- two devices meet (live.js, part play) ----------
function linkOf(token, w) { return C.SHARE_BASE + "#tl=" + token + "&w=" + w; }
function failText(e) { return t({ gone: "live_gone", expired: "live_expired", server: "live_server", rate: "live_busy", busy: "live_busy", rtc: "live_nonet" }[e && e.message] || "tl_lost"); }
function onState(s) { var n = ov && ov.querySelector(".tlstate"); if (n && t("live_s_" + s) !== "live_s_" + s) n.textContent = t("live_s_" + s); }
function qr(cv, text) {
  window.Parts.use("qr", function () {
    if (!cv.isConnected) return;
    var q = window.qrcode(0, "M"); q.addData(text, "Byte"); q.make();
    var n = q.getModuleCount(), k = Math.floor(cv.width / (n + 8)), o = Math.floor((cv.width - k * n) / 2), g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#000";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect(o + x * k, o + y * k, k, k);
    cv.hidden = false;
  }).catch(function () {});
}
// The inviting device: a QR code (a computer shows it, the phone scans it) and the link to send; then the connection.
// The file tool goes direct only unless this person may use the relay (Tools.relayFor: credit > 0, or the switch); the
// note for two keeps the relay as before. credit: null until the wrapper answered (asked when the file tool opens, never on
// the first paint; without a login or offline it stays 0). The relay itself is the bridge's decision: a file channel gets
// TURN only against a grant the wrapper signs for this account and this channel (grantFor), so the rule holds in the
// browser and in the apps alike; the apps ask through the shell with their Bearer login (Tools.relayAsk).
var credit = null, creditP = null;
window.DuellHostReply = T.hostReply;
function ask(body) { return T.relayAsk(body, { host: window.DuellHost, post: function (p, b) { return window.Ai.post(p, b); } }); }
function askCredit() {
  creditP = ask({}).then(function (r) { var c = r && r.json && r.json.credit; credit = r && r.status === 200 && typeof c === "number" ? c : 0; return credit; }, function () { credit = 0; return credit; });
  return creditP;
}
function grantFor(channel) { return ask({ channel: channel }).then(function (r) { return r && r.status === 200 && r.json && typeof r.json.grant === "string" ? r.json.grant : null; }); }
function paid() { return T.relayFor(credit); }
function opts(w) { var f = w === "datei"; return { direct: f && !paid(), purpose: f ? "file" : undefined, grant: f && paid() ? grantFor : undefined }; }
// before a file connection: the answer about credit, at most 4 s (then direct only)
function credited(w) { return w === "datei" && creditP ? Promise.race([creditP, new Promise(function (ok) { setTimeout(ok, 4000); })]) : Promise.resolve(); }
async function host(box, w, shareText, then) {
  var my = gen;
  box.textContent = ""; box.appendChild(el("p", "note tlstate", t("live_making")));
  var inv;
  try { await credited(w); await window.Parts.need("play"); inv = await window.Live.invite(onState, opts(w)); } catch (e) { if (my === gen) failed(box, e, function () { host(box, w, shareText, then); }, w); return; }
  if (my !== gen) { inv.ready.then(function (c) { c.close(); }, function () {}); return; }
  mine = inv.token;
  var url = linkOf(inv.token, w), cv = el("canvas", "tlqr"), left = el("p", "livecount", ""), row = el("div", "tlrow");
  cv.width = cv.height = 264; cv.hidden = true; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", t("tl_qr")); cv.dataset.url = url;
  row.appendChild(btn(t("tl_shareLink"), "btn hot", function () { Kit.sfx.tap(); Kit.share({ url: url, text: t(shareText) }); }));
  row.appendChild(btn(t("tl_copy"), "btn", function () { Kit.sfx.tap(); Kit.copy(url).then(function (ok) { Kit.toast(t(ok ? "copied" : "shareFail")); }); }));
  box.textContent = "";
  [el("p", "lbl tlstate", t("tl_waiting")), cv, el("p", "note", t("tl_scan")), left, row, el("p", "note", t("tl_ipNote"))].forEach(function (a) { box.appendChild(a); });
  qr(cv, url);
  function count() { var s = Math.max(0, Math.ceil((inv.expires - Date.now()) / 1000)); left.textContent = t("live_left", { t: Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") }); }
  var tick = setInterval(count, 500); count();
  ticks.push(tick);
  var c;
  try { c = await inv.ready; } catch (e) { clearInterval(tick); if (my === gen) { mine = null; failed(box, e, function () { host(box, w, shareText, then); }, w); } return; }
  clearInterval(tick);
  if (my !== gen) { try { c.close(); } catch (e) {} return; }
  mine = null; Kit.tone(660, 880, 0.14, "triangle", 0.14); Kit.haptic([120, 60, 120]);
  then(c, "a");
}
// The other device: it opened the link. My own link on this device is never a join (it would use up the invite).
async function join(box, token, again, then, w) {
  var my = gen;
  if (mine === token) { box.textContent = ""; box.appendChild(el("p", "lbl", t("tl_ownLink"))); return; }
  box.textContent = ""; box.appendChild(el("p", "lbl tlstate", t("live_connecting")));
  var c;
  try { await credited(w); await window.Parts.need("play"); c = await window.Live.accept(token, onState, opts(w)); } catch (e) { if (my === gen) failed(box, e, again, w); return; }
  if (my !== gen) { try { c.close(); } catch (e) {} return; }
  then(c, "b");
}
// No direct path for a file without the relay: said as it is, no quiet way round over a server, and how it would work.
function failed(box, e, again, w) {
  var free = e && e.message === "rtc" && opts(w).direct;
  box.textContent = ""; box.appendChild(el("p", "lbl tlfail", free ? t("tl_noDirect") : failText(e)));
  if (free && !(window.DailyFlags && window.DailyFlags.toolRelay === false)) {
    box.appendChild(el("p", "note tlpaid", t("tl_relayPaid")));
    box.appendChild(btn(t("tl_topup"), "btn tltopup", function () { Kit.sfx.tap(); close(); window.Parts.use("erschaffen", function () { window.CreateUI.open(); }).catch(function () {}); }));
  }
  box.appendChild(btn(t("tl_again"), "btn hot", function () { Kit.sfx.tap(); again(); }));
}
// The three pictures both screens show: from both DTLS fingerprints (live.js fp), which differ on the two sides if anyone
// sits in between; without them (an older live.js) from the channel, as the live games do.
function code(c) {
  var f = typeof c.fp === "function" ? c.fp() : null, base = f && f[0] && f[1] ? f.slice().sort().join("|") : String(c.channel || "");
  var h = T.sha256().update(new TextEncoder().encode("tools|" + base)).hex();
  return window.Ballduell ? window.Ballduell.badge(h) : h.slice(0, 8);
}

// ---------- the sticky note ----------
function loadNotes() {
  try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a.map(T.cleanNote).filter(Boolean).slice(0, MAX_NOTES) : []; } catch (e) { return []; }
}
function saveNotes(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
// o: { at } a note of the list; { got } a note from a link (read first, then "Behalten"); { join: token } the other device
// of a note for two.
function note(o) {
  o = o || {};
  var L = layer(t(o.got ? "tl_gotNote" : "tl_note"), "notiz"), my = L.gen;
  var notes = loadNotes(), at = Math.min(o.at || 0, Math.max(0, notes.length - 1)), sh = null, sendT = 0, delArm = false, live = null, meeting = false;
  if (o.join) { notes.unshift({ x: "", c: 0, s: 0 }); at = 0; }
  if (!notes.length) notes.push({ x: "", c: 0, s: 1 });
  var cur = o.got ? T.cleanNote(o.got) : notes[at], stored = !o.got && saveNotes(notes);
  var paper = el("div", "tlnote"), stk = el("span", "tlstk"), ta = el("textarea", "tlnotex");
  stk.setAttribute("aria-hidden", "true"); ta.maxLength = 1000; ta.readOnly = !!o.got; ta.spellcheck = false;
  paper.appendChild(stk); paper.appendChild(ta); L.stage.appendChild(paper);
  function setText(v) {
    if (ta.value === v) return;
    var focus = document.activeElement === ta, a = ta.selectionStart, b = ta.selectionEnd, old = ta.value;
    ta.value = v;
    if (focus) { var k = old.slice(0, a) === v.slice(0, a) ? a : Math.max(0, Math.min(v.length, a + v.length - old.length)); ta.setSelectionRange(k, Math.min(v.length, k + (b - a))); }
  }
  function look() {
    paper.style.background = T.COLORS[cur.c]; stk.textContent = T.STICKERS[cur.s]; setText(cur.x);
    L.panel.querySelectorAll(".sw").forEach(function (b, i) { b.classList.toggle("on", i === cur.c); b.setAttribute("aria-pressed", String(i === cur.c)); });
    L.panel.querySelectorAll(".tlstks .chip").forEach(function (b, i) { b.classList.toggle("on", i === cur.s); b.setAttribute("aria-pressed", String(i === cur.s)); });
    status();
  }
  function status() {
    if (o.got) { L.why.textContent = ""; return; }
    var p = Math.round(T.noteLoad(cur) * 100);
    L.why.textContent = (stored ? t("tl_here") : t("tl_noSave")) + " · " + (p > 100 ? t("tl_tooLong") : t("tl_linkFull", { p: p }));
  }
  function changed(remote) {
    cur = T.cleanNote(cur);
    if (!o.got) { notes[at] = cur; stored = saveNotes(notes); minis(); }
    if (sh && !remote) { clearTimeout(sendT); sendT = setTimeout(function () { if (sh) sh.local(cur); }, 120); }
    look();
  }
  ta.addEventListener("input", function () { cur.x = ta.value; changed(); });
  // the panel: colour, sticker, my notes, for two, throw away
  var mineRow = el("div", "tlrow tlminis");
  function minis() {
    if (o.got) return;
    mineRow.textContent = "";
    notes.forEach(function (n, i) {
      var b = btn(Array.from(n.x).slice(0, 14).join("") || T.STICKERS[n.s] || "…", "tlmini" + (i === at ? " on" : ""), function () { if (i === at || meeting) return; Kit.sfx.tap(); at = i; cur = notes[i]; delArm = false; look(); minis(); });
      b.style.background = T.COLORS[n.c]; b.setAttribute("aria-label", t("tl_open", { n: i + 1 })); b.setAttribute("aria-pressed", String(i === at));
      mineRow.appendChild(b);
    });
    if (notes.length < MAX_NOTES && !meeting) mineRow.appendChild(btn(t("tl_new"), "btn tlnew", function () { Kit.sfx.tap(); notes.unshift({ x: "", c: cur.c, s: 0 }); at = 0; cur = notes[0]; stored = saveNotes(notes); look(); minis(); ta.focus(); }));
  }
  function panel() {
    var P = L.panel; P.textContent = "";
    if (o.got) return;
    P.appendChild(el("span", "lbl", t("tl_color")));
    var sw = el("div", "chips");
    T.COLORS.forEach(function (c, i) { var b = btn("", "sw", function () { Kit.sfx.tap(); cur.c = i; changed(); }); b.style.background = c; b.setAttribute("aria-label", t("tl_colorN", { n: i + 1 })); sw.appendChild(b); });
    P.appendChild(sw);
    P.appendChild(el("span", "lbl", t("tl_sticker")));
    var st = el("div", "chips tlstks");
    T.STICKERS.forEach(function (s, i) { var b = btn(s || "∅", "chip em", function () { Kit.sfx.tap(); cur.s = i; changed(); }); if (!s) b.setAttribute("aria-label", t("tl_noSticker")); st.appendChild(b); });
    P.appendChild(st);
    P.appendChild(el("span", "lbl", t("tl_mine"))); P.appendChild(mineRow); minis();
    live = el("div", "tllive"); P.appendChild(live);
    var row = el("div", "tlrow");
    var two = btn("👥 " + t("tl_two"), "btn", function () { Kit.sfx.tap(); two.disabled = true; meeting = true; minis(); up(); host(live, "notiz", "tl_twoShare", together); });
    var del = btn("🗑 " + t("tl_del"), "btn", function () {
      Kit.sfx.tap();
      if (!delArm) { delArm = true; del.textContent = "🗑 " + t("tl_delAgain"); return; }
      notes.splice(at, 1); if (!notes.length) notes.push({ x: "", c: 0, s: 0 }); at = 0; cur = notes[0]; stored = saveNotes(notes); delArm = false; del.textContent = "🗑 " + t("tl_del"); look(); minis();
    });
    row.appendChild(two); row.appendChild(del); P.appendChild(row);
    live.appendChild(el("p", "note", t("tl_twoNote")));
    if (o.join) { two.disabled = meeting = true; minis(); up(); join(live, o.join, function () { note({}); }, together, "notiz"); o.join = null; }
  }
  // the two are apart again: the panel as before (a new invite possible), with a word why if the line broke
  function ended(why) { sh = null; meeting = false; panel(); look(); if (why) { live.textContent = ""; live.appendChild(el("p", "lbl", why)); up(); } }
  // while two devices meet, their box stands first in the panel
  function up() { L.panel.insertBefore(live, L.panel.firstChild); L.panel.scrollTop = 0; }
  // Both write on this note now; each change goes over (tools.js shared). The link I came in with is used up.
  function together(c, side) {
    if (my !== gen) return;
    conn = c;
    sh = T.shared({ side: side, send: function (m) { if (conn === c) c.send(m); }, apply: function (n) { cur = n; changed(true); } });
    // the other device asks for the note once it listens (a message before that would be lost); the inviter answers
    c.on(function (m) { if (!sh) return; if (m && m.t === "n-hi") { if (side === "a") sh.local(cur); return; } sh.msg(m); });
    c.onClose(function () { if (conn !== c || my !== gen) return; conn = null; ended(t("tl_twoLost")); });
    live.textContent = "";
    var head = el("p", "lbl tlon", "🔴 " + t("tl_twoOn") + " · " + code(c));
    live.appendChild(head); live.appendChild(el("p", "note", t("tl_check")));
    live.appendChild(btn(t("tl_twoEnd"), "btn", function () { Kit.sfx.tap(); var x = conn; conn = null; if (x) { try { x.close(); } catch (e) {} } ended(""); }));
    minis();
    if (side === "b") c.send({ t: "n-hi" });   // the inviter brings the note; the other device starts from it
  }
  L.main.textContent = t(o.got ? "tl_keep" : "tl_share");
  L.main.addEventListener("click", function () {
    Kit.sfx.tap();
    if (o.got) { var list = loadNotes(); list.unshift(cur); list = list.slice(0, MAX_NOTES); var ok = saveNotes(list); Kit.toast(t(ok ? "tl_kept" : "tl_noSave")); note({ at: 0 }); return; }
    share(cur);
  });
  ta.placeholder = t("tl_notePh"); ta.setAttribute("aria-label", t("tl_note"));
  panel(); look();
  // a new language: the words; the panel only when nothing runs in it (a code on screen, a note for two)
  redraw = function () { L.title.textContent = t(o.got ? "tl_gotNote" : "tl_note"); L.main.textContent = t(o.got ? "tl_keep" : "tl_share"); ta.placeholder = t("tl_notePh"); ta.setAttribute("aria-label", t("tl_note")); if (!meeting) panel(); look(); };
  if (!o.got && !o.join && !cur.x) ta.focus();
}
// A note as a link: only with text, only if it fits the link, only past the same filter as every card.
function share(n) {
  if (!n.x.trim()) { Kit.toast(t("tl_empty")); return; }
  if (!T.noteFits(n)) { Kit.toast(t("tl_tooLong")); return; }
  if (!C.isClean(n.x)) { Kit.toast(t(C.filterNote(n.x)), 5000); return; }
  Kit.share({ url: C.SHARE_BASE + "#notiz=" + T.noteCode(n), text: t("tl_shareText") });
}

// ---------- the file for two ----------
var blob = null;
function file(token) {
  var L = layer(t("tl_file"), "datei"), my = L.gen, st = { p: token ? "join" : "idle" }, badge = "", frame = 0;
  // credit only now, when the file tool opens; the card text follows once it is known
  askCredit().then(function () { if (my === gen && st.p === "idle") draw(); });
  var card = el("div", "tlcard"), box = el("div", "tlbox"), pick = el("input");
  pick.type = "file"; pick.hidden = true; pick.className = "tlpick";
  card.appendChild(box); card.appendChild(pick); L.stage.appendChild(card);
  pick.addEventListener("change", function () { var f = pick.files && pick.files[0]; pick.value = ""; if (f && xf) { blob = null; if (!xf.send(f)) draw(); } });
  function msg(k, v) { st.m = k ? t(k, v) : ""; }
  function on(ev) {
    if (my !== gen) return;
    if (ev.e === "wait") { st = { p: "askOut", n: ev.n, s: ev.s }; }
    else if (ev.e === "offer") { st = { p: "askIn", n: ev.n, s: ev.s }; blob = null; Kit.sfx.pop(); Kit.haptic([60, 40, 60]); }
    else if (ev.e === "big") { st = { p: "ready" }; msg("tl_bigIn", { m: mb(T.MAX_BYTES) }); }
    else if (ev.e === "no") { st = { p: "ready" }; msg({ busy: "tl_busy", big: "tl_bigThem" }[ev.why] || "tl_declined"); }
    else if (ev.e === "progress") { st.p = ev.dir; st.b = ev.b; st.s = ev.s; if (!frame) frame = requestAnimationFrame(function () { frame = 0; if (my === gen) draw(); }); return; }
    else if (ev.e === "done" && ev.dir === "in") {
      if (ev.ok) { blob = new Blob(ev.parts, { type: "application/octet-stream" }); st = { p: "got", n: ev.n, s: ev.s, h: ev.h }; Kit.sfx.win(); }
      else { st = { p: "ready" }; msg("tl_badSum"); }
    }
    else if (ev.e === "done") { st = { p: "ready", h: ev.h }; msg(ev.ok ? "tl_sent" : "tl_badSum"); if (ev.ok) Kit.sfx.pop(); }
    else if (ev.e === "stop") { st = { p: ev.by === "net" ? "lost" : "ready" }; msg(ev.by === "me" ? "tl_stopMe" : ev.by === "them" ? "tl_stopThem" : "tl_lost"); }
    else if (ev.e === "error") { st = { p: "ready" }; msg(ev.why === "big" ? "tl_big" : ev.why === "read" ? "tl_readFail" : "tl_badSum", { m: mb(T.MAX_BYTES) }); }
    draw();
  }
  function connected(c, side) {
    if (my !== gen) return;
    conn = c;
    if (typeof c.bin !== "function") { st = { p: "lost" }; msg("tl_noBin"); draw(); return; }
    xf = T.transfer({ send: c.send, bin: c.bin, buffered: c.buffered, onLow: c.onLow }, { side: side, on: on });
    c.on(function (m) { if (xf) xf.msg(m); });
    c.onBin(function (d) { if (xf) xf.bin(d); });
    c.onClose(function () { if (conn !== c) return; conn = null; if (xf) { xf.close(); xf = null; } st = { p: "lost" }; msg("tl_lost"); draw(); });
    badge = code(c); st = { p: "ready" }; draw();
  }
  function head(big, sub) { box.appendChild(el("p", "tlbig", big)); if (sub) box.appendChild(el("p", "note", sub)); }
  function fileLine() { box.appendChild(el("p", "tlfile", "📄 " + st.n + " · " + mb(st.s))); }
  function bar() {
    var pct = st.s ? Math.min(100, Math.floor((st.b || 0) / st.s * 100)) : 100, b = el("div", "tlbar"), i = el("i");
    b.setAttribute("role", "progressbar"); b.setAttribute("aria-valuemin", "0"); b.setAttribute("aria-valuemax", "100"); b.setAttribute("aria-valuenow", String(pct));
    i.style.width = pct + "%"; b.appendChild(i); box.appendChild(b);
    box.appendChild(el("p", "note tlbytes", t("tl_of", { a: mb(st.b || 0), b: mb(st.s) }) + " · " + pct + " %"));
  }
  // the foot only with something in it (a question on the card has its own two buttons)
  function draw() { paint(); L.foot.hidden = L.main.hidden && !L.why.textContent; }
  function paint() {
    if (my !== gen) return;
    box.textContent = ""; L.main.hidden = false; L.main.disabled = false; L.main.className = "press"; L.why.textContent = "";
    var P = st.p;
    if (P === "idle") {
      box.appendChild(el("p", "tlicon", "📱 ⇄ 💻")); head(t("tl_file"), t(paid() ? "tl_fileWhatRelay" : "tl_fileWhat"));
      box.appendChild(el("p", "note", t("tl_fileKeep", { m: mb(T.MAX_BYTES) })));
      box.appendChild(el("p", "note tlhint", t("tl_hintPc"))); box.appendChild(el("p", "note tlhint", t("tl_hintPhone")));
      L.main.textContent = t("tl_connect"); L.main.onclick = function () { Kit.sfx.tap(); st = { p: "host" }; draw(); };
      return;
    }
    if (P === "host" || P === "join") {
      L.main.hidden = true; box.appendChild(el("p", "note", t(paid() ? "tl_fileWhatRelay" : "tl_fileWhat")));
      var b2 = el("div"); box.appendChild(b2);
      if (P === "host") host(b2, "datei", "tl_fileShare", connected); else join(b2, token, function () { st = { p: "host" }; draw(); }, connected, "datei");
      st.p = P + "-run"; return;
    }
    if (P === "host-run" || P === "join-run") return;
    if (badge) { box.appendChild(el("p", "tlbadge", badge)); }
    if (P === "ready" || P === "got") {
      if (P === "got") { head("✓ " + t("tl_fileGot")); fileLine(); box.appendChild(el("p", "note tlhash", "SHA-256 " + st.h.slice(0, 16) + "…")); }
      else { head(t("tl_joined"), t("tl_check")); if (st.m) box.appendChild(el("p", "lbl tlmsg", st.m)); if (st.h) box.appendChild(el("p", "note tlhash", "SHA-256 " + st.h.slice(0, 16) + "…")); box.appendChild(el("p", "note", t("tl_pickNote"))); }
      if (P === "got") {
        L.main.textContent = "💾 " + t("tl_save"); L.main.onclick = function () { Kit.sfx.tap(); if (blob) Kit.saveFile(blob, st.n); };
        box.appendChild(btn(t("tl_pick"), "btn", function () { Kit.sfx.tap(); pick.click(); }));
      } else { L.main.textContent = t("tl_pick"); L.main.onclick = function () { Kit.sfx.tap(); pick.click(); }; }
      L.why.textContent = t(paid() ? "tl_fileWhatRelay" : "tl_fileWhat");
      return;
    }
    if (P === "askIn") {
      var ask = el("div", "tlask"); ask.setAttribute("role", "alertdialog"); ask.setAttribute("aria-label", t("tl_ask"));
      box.appendChild(ask); ask.appendChild(el("p", "tlbig", t("tl_ask"))); ask.appendChild(el("p", "tlfile", "📄 " + st.n)); ask.appendChild(el("p", "lbl tlsize", mb(st.s))); ask.appendChild(el("p", "note", t("tl_askNote")));
      var row = el("div", "tlrow"); ask.appendChild(row);
      row.appendChild(btn(t("tl_yes"), "btn hot", function () { Kit.sfx.tap(); if (xf) xf.accept(); }));
      row.appendChild(btn(t("tl_no"), "btn", function () { Kit.sfx.tap(); if (xf && xf.reject()) { st = { p: "ready" }; msg(""); draw(); } }));
      L.main.hidden = true; return;
    }
    if (P === "askOut") { head(t("tl_askWait")); fileLine(); cancel(); return; }
    if (P === "out" || P === "in") { head(t(P === "out" ? "tl_sending" : "tl_getting")); fileLine(); bar(); cancel(); return; }
    if (P === "lost") { head(st.m || t("tl_lost")); L.main.textContent = t("tl_again"); L.main.onclick = function () { Kit.sfx.tap(); badge = ""; blob = null; st = { p: "host" }; draw(); }; }
  }
  function cancel() { L.main.textContent = t("tl_cancel"); L.main.className = "press tlstop"; L.main.onclick = function () { Kit.sfx.tap(); if (xf) xf.cancel(); }; }
  redraw = function () { L.title.textContent = t("tl_file"); if (!/-run$/.test(st.p)) draw(); };
  draw();
}

// ---------- the sheet picture ----------
function demo(c, w) {
  if (!c || !c.getContext) return;
  c.width = 540; c.height = 675;
  var g = c.getContext("2d"), W = c.width, H = c.height;
  g.fillStyle = "#ffd400"; g.fillRect(0, 0, W, H);
  g.lineJoin = "round"; g.lineCap = "round";
  if (kindOf(w) === "datei") {
    g.fillStyle = "#111"; g.strokeStyle = "#111"; g.lineWidth = 10;
    g.fillStyle = "#fff6dc"; g.fillRect(60, 210, 130, 240); g.strokeRect(60, 210, 130, 240); g.fillStyle = "#111"; g.fillRect(105, 425, 40, 8);   // phone
    g.fillStyle = "#fff6dc"; g.fillRect(300, 240, 190, 130); g.strokeRect(300, 240, 190, 130); g.fillStyle = "#111"; g.fillRect(270, 380, 250, 16);   // laptop
    g.fillStyle = "#ff3b1d"; g.beginPath(); g.moveTo(205, 300); g.lineTo(265, 300); g.lineTo(265, 280); g.lineTo(295, 320); g.lineTo(265, 360); g.lineTo(265, 340); g.lineTo(205, 340); g.closePath(); g.fill(); g.stroke();
    g.font = "64px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("🔒", 250, 470); g.fillText("📄", 125, 330);
  } else {
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.06);
    g.fillStyle = "#111"; g.fillRect(-170, -160, 350, 350);
    g.fillStyle = "#ffe45c"; g.fillRect(-180, -175, 350, 350); g.strokeStyle = "#111"; g.lineWidth = 8; g.strokeRect(-180, -175, 350, 350);
    g.lineWidth = 9; [-90, -30, 30, 90].forEach(function (y, i) { g.beginPath(); g.moveTo(-140, y); for (var x = -140; x < 120 - i * 40; x += 20) g.lineTo(x + 20, y + (x % 40 ? 6 : -6)); g.stroke(); });
    g.restore();
    g.font = "84px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("📌", W / 2 + 120, H / 2 - 170);
  }
}

// ---------- entry points (parts.js stand-in ToolsUI) ----------
function open(x) { Kit.sfx.thud(); if (kindOf(x) === "datei") file(); else note({}); }
// kind "note": a note from #notiz=; "notiz" / "datei": the other device of a tool for two (#tl=<token>&w=…).
function link(kind, v) {
  if (kind === "note") { var n = T.noteFrom(v); if (!n) { note({}); Kit.toast(t("tl_badNote"), 5000); return; } if (!C.isClean(n.x)) { Kit.toast(t(C.filterNote(n.x)), 5000); return; } note({ got: n }); return; }
  if (kind === "datei") { file(v); return; }
  if (kind === "notiz") note({ join: v });
}
function list() { return catalog().filter(function (i) { return i.kind === "tool"; }).map(function (i) { return { id: i.id, t: (i.tool && i.tool.t) || i.id }; }); }
window.ToolsUI = { open: open, link: link, demo: demo, list: list, close: close, isOpen: function () { return !!ov; } };
})();
