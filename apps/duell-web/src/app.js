/* Calendar, remix editor, my style, wall. All text goes in as text nodes, never as markup. */
(function () {
"use strict";
var C = window.DuellCore, D = window.Daily, W = window.Wish, WM = window.Warm, P = window.Playable, S = window.Studio, Kit = window.Kit, G = window.Game, R = window.Render, t = Kit.t;
var $ = function (id) { return document.getElementById(id); };
function el(tag, cls, text, on) {
  var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text;
  if (tag === "button") e.type = "button"; if (on) e.addEventListener("click", on);
  return e;
}
var store = Kit.store;
var me = D.sanitizeProfile(store.me);
var wall = D.sanitizeWall(store.wall);
var PAIRS = [["#ffd400", "#ff3b1d"], ["#2b4bff", "#ffe600"], ["#ff4fa3", "#0a7f55"], ["#14c872", "#ff3da5"], ["#ff6a1f", "#1b2bd8"], ["#c8ff00", "#7a1fff"], ["#ffffff", "#ff2d2d"], ["#7ee0ff", "#ff5a1f"]];
var EMOJI = ["🐸", "🦝", "🐙", "🦖", "🍕", "👽", "🤖", "👻", "🔥", "🌈", "🦄", "🐝"];
var today = new Date(), home = null, screen = "home", ed = null, result = null;

function saveMe() { store.me = me; Kit.save(); }
// Text on the second colour (the burst on the leaf): black or white by the WCAG contrast ratio, whichever is higher.
function onCol(h) {
  var l = [1, 3, 5].map(function (i) { var c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  var y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  return (y + 0.05) / 0.0556 >= 1.0092 / (y + 0.05) ? "#111111" : "#fffaf0";   // relative luminance: #111 0.0056, #fffaf0 0.9592
}
function setInk(a, b) {
  var r = document.documentElement.style;
  r.setProperty("--a", a); r.setProperty("--b", b); r.setProperty("--on", R.ink(a)); r.setProperty("--onb", onCol(b)); r.setProperty("--btn", R.lum(a) > 0.45 ? a : "#fffaf0");
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", a);
}
function show(name, push) {
  ["home", "editor", "done", "shelf", "game"].forEach(function (s) { $(s).hidden = s !== name; });
  if (name !== "home") G.stopDemo();
  screen = name; document.body.setAttribute("data-state", name === "game" ? "ready" : name);
  if (push) { try { history.pushState({ s: name }, "", location.href); } catch (e) {} }
}
function clearLink() { try { if (location.hash) history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }

/* ---------- calendar ---------- */
function ideaText(i) { return i[Kit.lang] || i.de; }
function monthLines(d) {
  var loc = Kit.loc();
  return d.toLocaleDateString(loc, { month: "short", timeZone: "UTC" }).replace(".", "") + "\n" + d.toLocaleDateString(loc, { weekday: "long", timeZone: "UTC" });
}
function fitHero(box) {
  box = box || $("hero"); var w = box.clientWidth, h = box.clientHeight, ls = Array.from(box.children), sum = 0;
  ls.forEach(function (s) { s.style.fontSize = "100px"; var size = Math.min(100 * w / Math.max(1, s.offsetWidth) * 0.97, h * 0.34); s.size = size; sum += size; });
  var k = sum > h ? h / sum : 1;
  ls.forEach(function (s) { s.style.fontSize = s.size * k + "px"; s.style.lineHeight = "1"; });
}
// The card a sheet draws: what was received, in the reader's language (#151), or the day's card. fillSheet and the redraw
// once the display font is there both take it from here, so the two never draw different cards.
function sheetDoc(h) { return h.doc ? D.localDoc(h.doc, Kit.lang) : D.docFromIdea(h.idea, me, Kit.lang); }
// One calendar sheet: the real one on top and the greyed next day below it are filled by the same code.
function fillSheet(root, h, still) {
  var q = function (k) { return root.querySelector("." + k); };
  var d = h.date || today, idea = h.idea, doc = h.doc && sheetDoc(h);
  q("dnum").textContent = String(d.getUTCDate()).padStart(2, "0");
  q("dmon").textContent = monthLines(d);
  var title, sub, kind, min;
  if (idea) { var L = ideaText(idea); title = L.t.split("|"); sub = L.s; kind = idea.kind; min = idea.min; }
  else if (doc.k === "turn" && !doc.t && D.byId(doc.i)) { var Li = ideaText(D.byId(doc.i)); title = Li.t.split("|"); sub = doc.s || Li.s; kind = doc.k; min = D.byId(doc.i).min; }
  else { title = (doc.t || doc.x || (doc.g && doc.g.title) || t("own")).split(/\s+/).reduce(function (a, w) { if (a.length && (a[a.length - 1] + " " + w).length < 13) a[a.length - 1] += " " + w; else a.push(w); return a; }, []).slice(0, 4); sub = doc.s || ""; kind = doc.k; min = 60; }
  var g = kind === "turn" && (idea ? idea.turn && idea.turn.g : doc.g);
  q("dkind").textContent = t(g ? "bdg_" + window.Turns.who(g) : kind) + "\n" + (min >= 120 ? t("mins", { n: Math.round(min / 60) }) : t("sec", { n: min }));
  var mode = doc && X[doc.k] && X[doc.k].label && X[doc.k].label(doc);
  // Something sent by a friend: the sheet is that work, big. Its text stands in the picture, so the title shows only
  // when the sheet has one of its own.
  var got = !!(doc && h.note && !mode); root.classList.toggle("got", got);
  var ks = q("kiseal"); ks.hidden = !(doc && doc.ki && doc.ki.s); ks.textContent = t("kiBadge"); ks.title = t("kiBadgeL"); ks.setAttribute("aria-label", t("kiBadgeL"));
  var hero = q("hero"); hero.textContent = ""; hero.hidden = got && !doc.t;
  title.filter(Boolean).forEach(function (l, i) { var s = el("span", "", l); s.style.setProperty("--i", i); hero.appendChild(s); });
  if (mode && !sub && D.byId(doc.i)) sub = ideaText(D.byId(doc.i)).s;
  q("teaser").textContent = sub;
  var from = q("from");
  if (h.note) { from.textContent = h.note; from.hidden = false; } else from.hidden = true;
  if (mode) { from.textContent = mode.note; from.hidden = false; }
  if (!doc && twoIdea(idea)) { root.querySelector(".pv").hidden = true; window.Parts.need(twoIdea(idea)).then(function () { if ((root.id === "leaf" ? home : h) === h) preview(root, sheetDoc(h), still); }, function () {}); }
  else preview(root, sheetDoc(h), still);
  picture(root, idea, doc, h.lazy, mode);
  fitHero(hero);
  return { kind: kind, mode: mode, got: got };
}
function setHome(h, animate) {
  home = h;
  var s = fillSheet($("leaf"), h, false), kind = s.kind, mode = s.mode, idea = h.idea;
  $("go").textContent = mode ? mode.go : idea && idea.protokoll && !h.doc ? t("go_protokoll") : s.got ? t("remixGo") : t("go_" + kind) !== "go_" + kind && t("go_" + kind) ? t("go_" + kind) : t("go");
  var wk = W.KINDS.indexOf(kind) >= 0, wb = $("wishgo");   // AI where it does real work, otherwise the dice
  wb.dataset.tab = wk ? "Wish" : "Dice"; wb.textContent = t(wk ? "wishHome" : "diceHome"); wb.hidden = !!mode || !allow("tabs", wb.dataset.tab) || (!wk && W.DICE.indexOf(kind) < 0);
  var kr = $("kireport"), done = h.doc && reported(h.doc); kr.textContent = t(done ? "kiReported" : "kiReport"); kr.disabled = !!done; kr.hidden = !h.doc;   // every shared sheet can be reported
  var live = idea && idea.live, lb = $("livego"); lb.hidden = !live; if (live) { lb.textContent = t("live_" + live); lb.dataset.u = LIVE[live]; }
  var leaf = $("leaf"); leaf.className = s.got ? "got" : ""; leaf.style.transform = ""; leaf.style.opacity = "";
  if (animate) { void leaf.offsetWidth; leaf.classList.add("enter"); }
  WM.sheet(h, s.got, animate);
  langPick(!!h.note);
  // The thumbs keep their row from the first paint (.votes in style.css), so the sheet does not move when their part arrives.
  var F = window.DailyFlavor, off = F && F.stat === false; $("votes").hidden = off || !(h.doc ? h.note && h.doc.i && !(h.doc.ki && h.doc.ki.k === "karte") : h.idea);   // as Stat.card
  stimme(function (S) { S.sheet(h); }, h);
}
// Thumbs and card numbers live in the part "stimme" (src/stimme-ui.js, src/stat.js); a flavor with stat: false has neither.
function stimme(fn, h) {
  var F = window.DailyFlavor; if (F && F.stat === false) return;
  window.Parts.need("stimme").then(function () { if (!h || h === home) fn(window.Stimme); }, function () {});
}
// An invitation shows its languages before the first tap, each in its own name ("Deutsch", "English").
function langPick(on) {
  var box = $("langpick");
  if (!box) { box = el("div", "langpick"); box.id = "langpick"; box.setAttribute("role", "group"); $("go").before(box); }
  box.hidden = !on || Kit.langs.length < 2; box.textContent = ""; box.setAttribute("aria-label", t("lang_pick"));
  if (box.hidden) return;
  Kit.langs.forEach(function (l) {
    var b = el("button", "chip" + (l === Kit.lang ? " on" : ""), Kit.langName(l), function () { Kit.sfx.tap(); Kit.setLang(l); });
    b.lang = l; b.setAttribute("aria-pressed", String(l === Kit.lang)); box.appendChild(b);
  });
}
var LIVE = { conf: "https://webconference.bunsenbrenner.org/", tunnel: "https://bunsenbrenner.org/", demos: "https://demos-34a13a96.bunsenbrenner.org/", nordwind: "https://a2a-demo.bunsenbrenner.org/" };
function openLive(url) { if (url === LIVE.conf) url = C.confLink(me.colors); if (!window.open(url, "_blank", "noopener")) location.href = url; }
// Fast Easy Protokoll records on its own page (cross-origin isolated, connect-src 'self'), on the gallery's origin.
// From the web page that is this origin; from an app shell (file:, appassets) it is the origin of the gallery API.
function protokollUrl() {
  var base = location.protocol === "https:" ? "" : new URL(C.DEFAULT_API).origin;
  return base + "/duell/protokoll?lang=" + Kit.lang;
}
// The day is shown as the real thing: a game flies by itself (on the greyed sheet it stands still), everything else is
// drawn like its finished picture.
function preview(root, doc, still) {
  var box = root.querySelector(".pv"), g = root.querySelector(".pvgame"), c = root.querySelector(".pvcard");
  if (!still) G.stopDemo();
  g.hidden = c.hidden = true; box.hidden = false;
  try {
    if (doc.k === "game") { g.hidden = false; var st = C.sanitizeState(Object.assign({ v: 1 }, doc.g)); if (still) G.still(g, st); else G.demo(g, st); return; }
    c.hidden = false;
    if (window.ArcadeUI) window.ArcadeUI.demo(c, doc.k === "arcade" ? doc.a : null, still);   // null ends a running duel preview
    if (doc.k === "arcade") return;
    R.draw(c, doc, { me: me, photo: doc.k === "photo" ? R.botFace(C.hash32(doc.x || "x"), doc.col[1]) : null, peaks: null, x: {} });
  } catch (e) { box.hidden = true; }
}
// A card of the day may have a picture (AI-made, src/thumbs.json): it comes from the gallery server, never inside this file,
// and stands in for the drawn preview once it has loaded (on the greyed sheet too). Something received keeps its drawn
// card and shows the picture above it, never when the sender used an own photo. Not for games (not in the list), not with
// Save-Data; offline or missing, the sheet stays as it is. No cookies go along (crossOrigin).
var THUMBS = window.DailyThumbs || [];
function thumbUrl(id) { return new URL(C.DEFAULT_API).origin + "/duell/img/" + id + ".jpg"; }
function saveData() {
  try { var c = navigator.connection; return !!(c && c.saveData) || !!(window.matchMedia && matchMedia("(prefers-reduced-data: reduce)").matches); } catch (e) { return false; }
}
function picId(id) { return id && THUMBS.indexOf(id) >= 0 && !saveData() ? id : null; }
function docPic(doc) { return doc && !(doc.by || []).some(function (e) { return (e.w || []).indexOf("foto") >= 0; }) ? doc.i : null; }
// box gets "pic" once the picture of id is there; box._pic is the id it waits for, box._go starts a lazy load.
function loadPic(box, f, id, lazy) {
  var img = f.querySelector("img"); box._pic = id; box._go = null; box.classList.remove("pic");
  if (!id) return;
  f.querySelector(".kitag").textContent = t("aiPic");
  img.onload = function () {
    if (box._pic !== id || box.hidden) return;
    box.classList.add("pic");
    var hero = box.classList.contains("pv") && box.parentNode.querySelector(".hero"); if (hero) fitHero(hero);   // the title's room changed
  };
  img.onerror = function () { if (box._pic === id) box.classList.remove("pic"); };
  // set once: changing either attribute makes the browser load the picture anew
  if (img.getAttribute("crossorigin") !== "anonymous") img.crossOrigin = "anonymous";
  if (img.getAttribute("referrerpolicy") !== "no-referrer") img.referrerPolicy = "no-referrer";
  // Only after the page has loaded: a network that silently drops the request must not hold up the page's load.
  var go = function () { if (box._pic !== id) return; if (img.getAttribute("src") !== thumbUrl(id)) img.src = thumbUrl(id); else if (img.complete && img.naturalWidth) img.onload(); };
  if (lazy) box._go = go; else if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
}
function picture(root, idea, doc, lazy, mode) {
  var box = root.querySelector(".pv"), f = root.querySelector(".pvimg");
  if (!f) return;
  box.classList.toggle("with", !!doc);
  loadPic(box, f, picId(!doc ? idea && idea.id : !mode && docPic(doc)), lazy);
}
// In the editor the picture stays above the card; the user's own photo takes its place once taken.
function edPic() {
  var w = $("stagewrap"), id = ed && !ed.ownPhoto && !cv.hidden ? picId(docPic(ed.doc)) : null;
  if (!id || w._pic !== id) loadPic(w, $("edpic"), id);
}
// The finished picture carries it too, above the card, when it can be drawn without tainting the canvas (CORS image on
// the web and in the Android shell; the iOS shell blocks the network, so there is none). Anything wrong: the card alone.
function withPic(c, doc) {
  var id = !(ed && ed.ownPhoto) && picId(docPic(doc)), img = id && [$("edpic"), document.querySelector("#leaf .pvimg")].map(function (f) { return f.querySelector("img"); })
    .filter(function (i) { return i.complete && i.naturalWidth && i.getAttribute("src") === thumbUrl(id); })[0];
  if (!img) return c;
  try {
    var o = document.createElement("canvas"), x = o.getContext("2d"), W = c.width, H = c.height, ink = "#111";
    var pw = Math.round(W * 2 / 3), ph = Math.round(pw * 9 / 16), px = Math.round((W - pw) / 2), py = 40, cy = py + ph + 46, ch = H - cy - 40, cw = Math.round(ch * W / H), cx = Math.round((W - cw) / 2);
    o.width = W; o.height = H; x.fillStyle = (window.DailyFlavor || {}).bg || doc.col[0]; x.fillRect(0, 0, W, H);
    x.fillStyle = ink; x.fillRect(px + 6, py + 9, pw + 9, ph + 9); x.fillRect(px - 9, py - 9, pw + 18, ph + 18); x.drawImage(img, px, py, pw, ph);
    x.font = "700 34px system-ui, sans-serif"; var tw = x.measureText(t("aiPic")).width;
    x.fillRect(px + pw - tw - 42, py + ph - 66, tw + 28, 50); x.fillStyle = "#fff"; x.textBaseline = "middle"; x.fillText(t("aiPic"), px + pw - tw - 28, py + ph - 41);
    x.fillStyle = ink; x.fillRect(cx + 3, cy + 6, cw + 9, ch + 9); x.fillRect(cx - 9, cy - 9, cw + 18, ch + 18); x.drawImage(c, cx, cy, cw, ch);
    x.getImageData(0, 0, 1, 1);   // throws on a tainted canvas
    return o;
  } catch (e) { return c; }
}
// A flavor (the business app) may show only some of these buttons, and only the tabs, tools and done buttons it lists.
function allow(w, k) { var F = window.DailyFlavor; return !F || !F[w] || F[w].indexOf(k) >= 0; }
function shown(k) { return allow("feats", k); }
// The games button stays put on the left; the rest is a strip that can run by as a ticker (WCAG 2.2.2): it starts only
// after 3 s without a key, never with reduced motion or big type, and the first touch (on the bar or anywhere) stops it for
// good where it stands (then it is a strip to swipe),
// and the switch next to it stops and restarts it. With fewer than 3 entries there is no ticker and no copy. Two copies
// in one track make it seamless; the second is only for the eye, not for screen readers or Tab.
var tick = { many: false, run: false, stop: false, timer: 0 };
function feats() {
  var bar = $("feat"), lane = el("div", "lane"), box = el("div", "track"), n = D.IDEAS.filter(function (i) { return i.kind === "turn" || i.kind === "arcade"; }).length;
  var list = [["f_flappy", "🕹", function () { blank("game"); }], ["f_conf", "📞", function () { openLive(LIVE.conf); }], ["f_card", "🃏", function () { blank("card"); }], ["f_photo", "📷", function () { blank("photo"); }],
    ["f_beat", "🥁", function () { blank("sound"); }], ["f_agent", "🤖", function () { blank("duel"); }], ["f_tunnel", "🌐", function () { openLive(LIVE.tunnel); }], ["f_demos", "🔥", function () { openLive(LIVE.demos); }]].filter(function (f) { return shown(f[0]); });
  bar.textContent = ""; tick.many = list.length >= 3;
  if (shown("f_two")) bar.appendChild(el("button", "hot", "🎲 " + t("f_twoN", { n: n }), function () { Kit.sfx.tap(); X.turn.menu(); }));
  lane.appendChild(box); bar.appendChild(lane);
  (tick.many ? [0, 1] : [0]).forEach(function (copy) { list.forEach(function (f) {
    var b = el("button", "", f[1] + " " + t(f[0]), function () { Kit.sfx.tap(); f[2](); });
    if (copy) { b.setAttribute("aria-hidden", "true"); b.tabIndex = -1; }
    box.appendChild(b);
  }); });
  if (tick.many) { var sw = el("button", "tickpause", "", function () { if (tick.stop) { tick.stop = false; tickRun(); } else tickHalt(); }); sw.id = "tickpause"; bar.appendChild(sw); }
  tickSync();
}
function tickSync() {
  var bar = $("feat"), sw = $("tickpause"), on = tick.many && tick.run;
  bar.classList.toggle("run", on);
  if (on) bar.querySelector(".lane").scrollLeft = 0;
  if (sw) { sw.textContent = tick.stop ? "▶" : "⏸"; sw.setAttribute("aria-label", t("a_tick")); sw.setAttribute("aria-pressed", String(tick.stop)); }
}
function tickRun() {   // start, or go on from where the strip stands
  var bar = $("feat"), lane = bar.querySelector(".lane"), tr = bar.querySelector(".track"), half = tr ? tr.scrollWidth / 2 : 0;
  clearTimeout(tick.timer);
  if (tick.stop || !tick.many || Kit.fs !== "n" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // nothing runs by with big type either
  if (tr) tr.style.animationDelay = half ? -(lane.scrollLeft % half) / half * 45 + "s" : "";
  tick.run = true; tickSync();
}
function tickHalt(to) {   // stops for good, the buttons stay exactly where they are (to: a button that got the focus)
  var bar = $("feat"), lane = bar.querySelector(".lane"), tr = bar.querySelector(".track"), was = tick.run && tr, x = 0;
  clearTimeout(tick.timer);
  if (was) { try { x = -new DOMMatrixReadOnly(getComputedStyle(tr).transform).m41; } catch (e) {} bar.classList.add("was"); }
  tick.run = false; tick.stop = true;
  if (was) bar.classList.add("hold");   // no snap in this frame: the buttons stay exactly where they are ...
  tickSync();
  if (was) { lane.scrollLeft = x; requestAnimationFrame(function () { tickSnap(bar, lane, to); }); } else if (to) tickSnap(bar, lane, to);
}
// ... and then glide to the nearest button edge (or the focused button), so the strip rests with a whole button on the
// left (style.css: snap); with reduced motion it jumps there
function tickSnap(bar, lane, to) {
  var l = lane.getBoundingClientRect().left, d = 1e9, done = function () { bar.classList.remove("hold"); };
  if (to) d = to.getBoundingClientRect().left - l;
  else lane.querySelectorAll("button").forEach(function (b) { var v = b.getBoundingClientRect().left - l; if (Math.abs(v) < Math.abs(d)) d = v; });
  if (Math.abs(d) < 1) return done();
  lane.addEventListener("scrollend", done, { once: true }); setTimeout(done, 700);
  lane.scrollTo({ left: lane.scrollLeft + d, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function tickWait() { clearTimeout(tick.timer); if (!tick.run && !tick.stop) tick.timer = setTimeout(tickRun, 3000); }
(function () {
  $("feat").addEventListener("pointerdown", function (e) { if (!e.target.closest("#tickpause")) tickHalt(); });
  // a button reached by key scrolls into place; one under a finger stays put, so the tap lands where it began
  $("feat").addEventListener("focusin", function (e) { if (!e.target.closest("#tickpause")) tickHalt(e.target.matches(":focus-visible") && e.target.closest(".lane button")); });
  // the first touch anywhere stops it for good too (a moving target is hard to hit); a key only starts the 3 s again
  document.addEventListener("pointerdown", function (e) { if (!tick.touched && !e.target.closest("#tickpause")) { tick.touched = 1; tickHalt(); } }, true);
  document.addEventListener("keydown", tickWait, true);
  tickWait();
})();
function blank(kind) { Kit.sfx.thud(); openEditor(D.blankDoc(kind, me, Kit.lang), { own: true }); }
var page = 0, PLAN_DAYS = 31;
function dayHome() { return { date: today, idea: D.ideaForDay(today) }; }
// The page can stay open for days, above all in an app shell: a new day shows up when it comes back or while it is open.
function newDay() {
  var n = new Date();
  if (D.dayNumber(n) === D.dayNumber(today)) return;
  today = n; page = 0; upcoming = {};
  if (home && (home.note || home.doc)) return;   // an invitation or a creation from a link stays until it is left
  home = dayHome();
  if (screen === "home") setHome(home, true);
}
function goHome() {
  CU.end(); stopSound(); G.stop(); ed = null; window.Ai.drop(); played = null; clearLink(); setInk(me.colors[0], me.colors[1]); show("home");
  if (!home) home = dayHome(); setHome(home, true);
}
// Swiping to the left turns to the next day, to the right back to the day before, like the pages of a book.
// The sheet is chosen once per direction, so the greyed preview and the sheet that lands after tearing are the same.
var upcoming = {};
function nextSheet(step) {
  step = step < 0 ? -1 : 1;
  var u = upcoming[step]; if (u && u.after === page) return u;
  var p = page + step; if (Math.abs(p) >= PLAN_DAYS) p = 0;
  var d = D.dayDate(today, -p);
  return (upcoming[step] = { after: page, page: p, date: d, idea: D.ideaForDay(d) || D.randomIdea(seeded(+d), "") });
}
// While the sheet is pulled, the one below already is the day it turns to: the same sheet, only greyed out.
function peek(step, lazy) {
  var under = document.querySelector("#pad .u1"), g = under.querySelector(".ghost");
  if (!g) {
    // copied through a document without a window and without src: a cloned <img> would fetch today's picture again
    var c = document.implementation.createHTMLDocument("").importNode($("leaf"), true);
    c.querySelectorAll("img").forEach(function (x) { x.removeAttribute("src"); });
    g = document.importNode(c, true); g.removeAttribute("id"); g.removeAttribute("style"); g.className = "ghost"; g.setAttribute("aria-hidden", "true");
    g.querySelectorAll(".votes").forEach(function (x) { x.remove(); });
    g.querySelectorAll("[id]").forEach(function (x) { x.removeAttribute("id"); });
    under.appendChild(g);
  }
  var n = nextSheet(step); fillSheet(g, { date: n.date, idea: n.idea, lazy: lazy }, true);
}
function wake() { var b = document.querySelector("#pad .ghost .pv"), go = b && b._go; if (go) { b._go = null; go(); } }   // the greyed sheet's picture once it shows
var busy = 0;   // until then the sheet is torn off and the next one lands: a tap there is no choice
function tear(step) {
  busy = Date.now() + 760;
  var leaf = $("leaf"), dir = step < 0 ? 1 : -1; Kit.rip(); Kit.haptic(18);   // forward flies off to the left, back to the right
  leaf.className = "gone"; leaf.style.transform = "translate(" + dir * 130 + "%,-20%) rotate(" + dir * 26 + "deg)";
  setTimeout(function () {
    var n = nextSheet(step); page = n.page;
    setHome({ date: n.date, idea: n.idea }, true); Kit.sfx.thud();
  }, 300);
}
(function drag() {
  var leaf = $("leaf"), sx = 0, sy = 0, on = false, t0 = 0, far = false, shown = 0;
  leaf.addEventListener("pointerdown", function (e) { if (e.target.closest("button")) return; on = true; sx = e.clientX; sy = e.clientY; t0 = Date.now(); far = false; shown = 1; try { peek(1, true); } catch (x) {} leaf.classList.add("drag"); try { leaf.setPointerCapture(e.pointerId); } catch (x) {} });
  leaf.addEventListener("pointermove", function (e) {
    if (!on) return; var dx = e.clientX - sx, dy = e.clientY - sy, step = dx > 0 ? -1 : 1;
    if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10) far = true;   // moved once: never a tap, even when let go where it began
    if (Math.abs(dx) > 8) { try { if (step !== shown) { shown = step; peek(step); } else wake(); } catch (x) {} }
    leaf.style.transform = "translate(" + dx + "px," + dy * 0.4 + "px) rotate(" + dx / 16 + "deg)"; leaf.style.opacity = String(1 - Math.min(0.7, Math.abs(dx) / 220)); });
  function up(e) {
    if (!on) return; on = false; leaf.classList.remove("drag");
    var dx = e.clientX - sx, dy = e.clientY - sy;
    // a cancelled pointer (the browser took it over, its position reads 0,0) only puts the sheet back
    if (e.type === "pointerup" && Math.abs(dx) > 90) { tear(dx > 0 ? -1 : 1); return; }
    leaf.style.transform = ""; leaf.style.opacity = "";
    // A tap (no move, short, not on a control of the sheet, not while a torn sheet flies) opens the card like #go; a swipe turns the day.
    if (e.type === "pointerup" && !far && Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - t0 < 500 && t0 > busy && !(e.target.closest && e.target.closest("a,button,input,textarea,select,label"))) start();
  }
  leaf.addEventListener("pointerup", up); leaf.addEventListener("pointercancel", up);
})();

/* ---------- editor ---------- */
var TABS = {
  card: ["Text", "Style", "Color", "Sticker"], photo: ["Photo", "Text", "Style", "Color", "Sticker"],
  sound: ["Sound", "Text", "Color"], game: ["Rules", "Figure", "World", "Text"]
};
var cv = $("stage"), timer = 0;
function paint() {
  timer = 0; if (!ed) return;
  ed.doc.col = ed.doc.col; setInk(ed.doc.col[0], ed.doc.col[1]);
  if (ed.doc.k === "game") G.update(ed.doc.g && gameState()); else { R.draw(cv, ed.doc, { me: me, photo: ed.photo, peaks: ed.peaks, x: ed.x, lyr: ed.lyr }); }
  edPic(); SK.sync(); footer(); CU.local(); saveMark(); if (window.Direkt) window.Direkt.paint(ed);
}
function changed() {           // every control ends up here: redraw within the next moment
  if (!timer) timer = setTimeout(paint, 16);
}
function gameState() { return C.sanitizeState(Object.assign({ v: 1 }, ed.doc.g, { ki: ed.doc.ki })); }
// A change by hand to a game the AI made: the sheet is no longer what the seal was made for, so the AI mark goes.
function byHand() { delete ed.doc.ki; }
function playGame() { Kit.sfx.thud(); G.stop(); show("game", true); G.play(gameState(), null, { own: touched() }); }
// A game state (played, or from a challenge) back into a sheet: route and AI mark go along.
function gameDoc(s) { var d = { k: "game", col: me.colors, by: [], g: { seed: s.seed, params: s.params, theme: s.theme, title: s.title, emoji: s.emoji, route: s.route } }; if (s.ki) d.ki = s.ki; return d; }
function areas() { var w = D.changedAreas(ed.base, ed.doc); if (X[ed.doc.k] && X[ed.doc.k].areas) w = w.concat(X[ed.doc.k].areas(ed)); if (ed.ownPhoto) w.push("foto"); if (ed.ownVoice) w.push("stimme"); return w; }
function touched() { var ok = areas().length > 0; return ed.own ? ok && !!ed.doc.t : ok; }
// The idea of the day can go out as it is; only a blank one needs something of your own first.
function ready() { return ed.own ? touched() : true; }
function footer() {
  var b = $("edmain"), ok = ready(), g = ed.doc.k === "game";
  b.hidden = false; delete b.dataset.why;
  if (X[ed.doc.k]) X[ed.doc.k].footer(b, ed, ok);
  else {
    b.classList.toggle("wait", !ok && !g);
    b.textContent = g ? t("play") : t(ed.doc.nr ? "doorSend" : "done");
    if (!ok && !g) b.dataset.why = t("needOwn");
  }
  var bad = $("panel").querySelector('[aria-invalid="true"]');   // a blocked entry (field above): nothing goes out until it is seen
  if (bad && !b.hidden) { b.classList.add("wait"); b.dataset.why = t("whyOpen", { s: bad.getAttribute("aria-label") }); }
  // A locked main button stays in place and looks locked; the line above it names what is still open (read out once).
  var w = !b.hidden && b.classList.contains("wait"), why = w ? b.dataset.why || "" : "";
  b.setAttribute("aria-disabled", String(w));
  if ($("edwhy").textContent !== why) $("edwhy").textContent = why;
}
// A tap on the locked button: to the first open field, focus there, and say again what is missing.
function nudge() {
  Kit.tone(200, 160, 0.1, "square", 0.06);
  var p = $("panel"), all = Array.from(p.querySelectorAll("input:not([type=hidden]),textarea,select,button")).filter(function (x) { return !x.disabled && x.getClientRects().length && !x.closest(".satz"); });
  var g = p.querySelector('[aria-invalid="true"]') || all.filter(function (x) { return /^(INPUT|TEXTAREA)$/.test(x.tagName) && x.type !== "range" && !x.value; })[0] || all.filter(function (x) { return !x.classList.contains("on"); })[0];
  if (g) { try { g.scrollIntoView({ block: "center" }); } catch (e) {} g.focus({ preventScroll: true }); g.classList.add("nudge"); setTimeout(function () { g.classList.remove("nudge"); }, 700); }
  // said again: empty for a moment, then the reason as it is by then (fields filled meanwhile may have unlocked it)
  $("edwhy").textContent = ""; setTimeout(function () { if (ed) footer(); }, 60);
}
// The line above the link says what the receiver gets: a move to make, a result, or something made for them.
function shareLine(doc) {
  if (doc && doc.k === "turn") { var st = window.Turns.state(doc); return t(st.over ? "shareResult" : "shareTurn"); }
  return t(doc && doc.nr ? "shareDoor" : doc && (doc.k === "card" || doc.k === "photo") ? "shareCard" : "shareText");
}
function trailLine() {
  var box = $("trail"), by = ed.doc.by; box.textContent = ""; box.hidden = !by.length; if (!by.length) return;
  box.textContent = t("trail") + ": " + by.map(function (e) { return (e.n || t("anon")) + " (" + e.w.map(function (w) { return t("a_" + w); }).join(", ") + ")"; }).join(" → ");
}
function openEditor(doc, opt) {
  opt = opt || {};
  if (doc && doc.k === "table") { if (window.TableUI) window.TableUI.open(doc.g); return; }   // a card table is played live, there is nothing to edit
  window.Ai.drop();
  ed = { doc: D.sanitizeDoc(doc), base: D.sanitizeDoc(doc), own: !!opt.own, photo: null, peaks: null, pcm: null, tab: null, sel: -1, page: 0, line: 0, idea: opt.idea || null };
  if (opt.own) ed.doc.n = me.nick;
  if (ed.doc.k === "sound" && ed.doc.m === "beat") beatPeaks();
  if (ed.doc.k === "photo") { ed.photo = R.botFace(D.botSeed(me.nick, ed.doc, 0), ed.doc.col[1]); }
  var g = ed.doc.k === "game";
  $("tabs").hidden = false;
  if (X[ed.doc.k]) X[ed.doc.k].open(ed);
  cv.hidden = g; $("gamestage").hidden = !g;
  $("edtitle").textContent = edTitle(); $("edlang").hidden = !opt.got;   // opened from an invitation: its language can change here
  $("edstyle").textContent = me.emoji;
  stopSound(); show("editor", true); trailLine();
  var tabs = $("tabs"); tabs.textContent = "";
  var list = (ed.own ? ["Idea"] : []).concat(W.KINDS.indexOf(ed.doc.k) >= 0 ? ["Wish"] : [], W.DICE.indexOf(ed.doc.k) >= 0 ? ["Dice"] : [], ed.doc.nr ? ["Door"] : [], TABS[ed.doc.k]), mine = list.filter(function (k) { return allow("tabs", k); });
  if (mine.length) list = mine;   // a flavor's list never leaves a kind it does not know (a duel link in Business) without tabs
  list.forEach(function (k) {
    var b = el("button", k === "Wish" ? "hot" : "", tabText(k), function () { Kit.sfx.tap(); tab(k); });
    b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "panel"); b.id = "tab" + k; b.dataset.k = k; tabs.appendChild(b);
  });
  tab(list.indexOf(opt.tab) >= 0 ? opt.tab : g ? "Wish" : list.filter(function (k) { return k !== "Wish" && k !== "Dice"; })[0]);
  if (g) G.demo($("demo"), gameState());
  paint(); CU.editor();
  // Parts direkt (one undo, stickers without dragging, layers, description) and regler (named steps); without them the tabs stay the editor.
  window.Parts.need("direkt").catch(function () {}); if (g) window.Parts.need("regler").catch(function () {});
}
function edTitle() { return ed.own ? t("own") : (ed.idea ? D.plainTitle(ideaText(ed.idea).t) : t(ed.doc.k)); }
function tabText(k) { return t("tab" + (k === "Sound" ? (ed.doc.m === "beat" ? "Beat" : "Voice") : k)); }
// The tabs are one stop for Tab; the arrows (Home, End) move along and open the tab they land on.
$("tabs").addEventListener("keydown", function (e) {
  var l = Array.from($("tabs").children), i = l.indexOf(document.activeElement), n = l.length, j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: n - 1 }[e.key];
  if (i < 0 || j == null) return; e.preventDefault(); l = l[(j + n) % n]; l.focus(); l.click();
});
function tab(k) {
  if (ed.pv) { ed.pv = false; ed.fly = null; window.Ai.drop(); G.update(gameState()); }
  ed.tab = k; Array.from($("tabs").children).forEach(function (b) { var on = b.dataset.k === k; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
  var p = $("panel"); p.textContent = ""; p.setAttribute("aria-labelledby", "tab" + k); p.removeAttribute("data-size"); p.classList.toggle("tall", (k === "Sound" && ed.doc.m === "beat") || (k === "Text" && ed.doc.k !== "game") || k === "Wish" || k === "Dice"); PANEL[k](p); p.scrollTop = 0;
}
function setDoc(d) {        // a whole creation replaced by a wish or its undo; the canvas state follows
  ed.doc = d; ed.sel = -1; if (d.k === "sound" && d.m === "beat") beatPeaks();
  if (d.k === "sound" && ed.raw) applyFx();
  $("edstyle").textContent = me.emoji; trailLine(); changed();
}
// Weather card (src/wetter.js, the part wetter): a slot in the text tab now, the block follows with the part. A flavor
// without cards does not build the part (scripts/build.js), so there is nothing to load. When it does not come the card
// works without the weather; a short word on screen once per session, not on every tab switch.
var wxSaid = false;
function weatherBlock(p) {
  var slot = el("div"); p.appendChild(slot);
  if (window.Parts.names().indexOf("wetter") >= 0) window.Parts.need("wetter").then(function () { if (slot.isConnected && ed) window.Wetter.block(slot); }).catch(function () { if (!wxSaid) { wxSaid = true; Kit.toast(t("part_fail")); } });
}
// The creation becomes the game: same engine, its colours, picture and figure. Back leads to the creation, not home.
var played = null, shortId = null;   // shortId: the short link a shared sheet came through, so a report can name it
function makePlayable() {
  var d = ed.doc, photo = ed.ownPhoto ? ed.photo : null, st = P.fromDoc(d, me);
  var o = { own: true, bg: P.backdrop(function (c, doc, m) { R.draw(c, doc, { me: m, photo: ed.photo, peaks: ed.peaks }); }, d, me), figure: photo ? P.figure(photo) : null };
  played = ed; Kit.sfx.thud(); stopSound(); G.stop(); show("game", true); G.play(st, null, o);
  if (photo) Kit.toast(t("playNote"));
}
function backFromPlay() {
  if (!played) return false;
  ed = played; played = null; G.stop(); show("editor"); changed(); return true;
}
// The panel belongs to the sheet open now; an answer that comes back after it was left is dropped, not applied elsewhere.
function aiBlock(p, o) { var mine = ed; o.el = el; o.wall = openAiWall; o.alive = function () { return !!mine && ed === mine; }; return window.Ai.block(p, o); }
function markKi(d, ki) { var k = D.sanitizeKi(ki); if (k) d.ki = k; }
// Texte und Song (texte.js) are a part of their own: the slot stands in the panel now, its content follows with the part.
function textePart(p, what, f) {
  var slot = el("div"); p.appendChild(slot);
  window.Parts.use("texte", function () {
    if (slot.isConnected && ed) window.TexteUI[what](slot, { f: f, aiBlock: aiBlock, markKi: markKi, setDoc: setDoc, play: function () { beatPeaks(); playBeat(); tab(ed.tab); }, stop: stopSound });
  }).catch(function () {});
}
// "Geändert: …" and the undo, after a wish or a roll. before: the doc as JSON before the change. -> false when nothing changed.
function didLine(res, before, next, lead) {
  var was = JSON.parse(before), what = D.changedAreas(was, next);
  if (next.k === "sound" && next.fx !== was.fx && what.indexOf("stimme") < 0) what.push("stimme");
  if (!what.length) { res.appendChild(el("p", "note", t("wishSame"))); return false; }
  setDoc(next); (ed.wishes = ed.wishes || []).push(before);
  res.appendChild(el("p", "aicount", (lead ? lead + " · " : "") + t("wishDid") + ": " + what.map(function (w) { return t("a_" + w); }).join(", ")));
  res.appendChild(el("button", "chip", "↶ " + t("skUndo"), function () { setDoc(JSON.parse(ed.wishes.pop())); Kit.sfx.pop(); res.textContent = ""; }));
  return true;
}
// Random only from a seed: the same wish text or the same roll of the same sheet always gives the same result.
function seeded(s) { return C.mulberry32(C.hash32(String(s))); }
function field(p, label, value, max, on, area) {
  p.appendChild(el("label", "lbl", label));
  var f = el(area ? "textarea" : "input", "field"), last = f.value = value || "", why = ""; f.maxLength = max; if (area) f.rows = 2; f.autocomplete = "off"; f.setAttribute("aria-label", label);
  // What is kept is what the field shows: a blocked entry is not kept (on() may block too and answer with its reason) and,
  // once the field is left, the field goes back to the last entry kept, with a note. While typing it stays, so a word whose
  // first letters are blocked can still be finished; a word being composed (IME) is never judged half-way.
  // While a field is marked (aria-invalid) the main button stays locked and names it (footer): a tap on "Fertig" right after a
  // blocked word never sends the cut one. After the field went back it stays marked until it has the focus again.
  function check(e) {
    if (e.isComposing) return;   // compositionend checks the word once it is complete
    var v = D.cleanInput(f.value, max), r = f.value.trim() && !v ? t("filter") : on(v);
    why = typeof r === "string" ? r : ""; f.setAttribute("aria-invalid", String(!!why));
    if (!why) { last = f.value; changed(); } else if (ed) footer();
  }
  f.addEventListener("input", check); f.addEventListener("compositionend", check);
  f.addEventListener("change", function () { if (why) { f.value = last; Kit.toast(why); why = ""; } });
  f.addEventListener("focus", function () { if (!why && f.getAttribute("aria-invalid") === "true") { f.setAttribute("aria-invalid", "false"); if (ed) footer(); } });
  p.appendChild(f); return f;
}
function chips(p, items, cur, on, cls) {
  var box = el("div", "chips");
  items.forEach(function (it) {
    var b = el("button", "chip " + (cls || "") + (it.v === cur ? " on" : ""), it.l, function () {
      Kit.sfx.tap(); Array.from(box.children).forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("on"); b.setAttribute("aria-pressed", "true"); on(it.v); changed();
    });
    b.setAttribute("aria-pressed", String(it.v === cur)); box.appendChild(b);
  });
  p.appendChild(box); return box;
}
function colors(p, get, set) {
  var box = el("div", "chips"), now = get();
  PAIRS.forEach(function (c) {
    var b = el("button", "sw" + (c.join() === now.join() ? " on" : ""), null, function () {
      Kit.sfx.tap(); Array.from(box.children).forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); set(c.slice()); a.value = c[0]; z.value = c[1]; changed();
    });
    b.style.background = c[1]; var i = el("i"); i.style.background = c[0]; b.appendChild(i); b.setAttribute("aria-label", c.join(" ")); box.appendChild(b);
  });
  p.appendChild(box);
  p.appendChild(el("label", "lbl", t("custom")));
  var row = el("div", "chips"), a = el("input"), z = el("input");
  [a, z].forEach(function (x, i) { x.type = "color"; x.value = now[i]; x.setAttribute("aria-label", t("custom")); x.addEventListener("input", function () { set([a.value, z.value]); changed(); }); row.appendChild(x); });
  p.appendChild(row);
}
var PANEL = {
  // Type a wish and apply it right below, or tap a suggestion: that applies it at once. The AI's answer is applied as it
  // came, nothing mixed in. The flight game's one way in, "What do you want to fly?", is the part welt-ui.js.
  Wish: function (p) {
    if (ed.doc.k === "game") {   // the flight game's one way in lives in a part (welt-ui.js)
      var mine = ed, hooks = { el: el, field: field, aiBlock: aiBlock, didLine: didLine, tab: tab, play: playGame, ed: function () { return ed; },
        preview: function (st, fly) { ed.pv = !!st; ed.fly = st && fly || null; G.update(st || gameState()); } };
      window.Parts.use("welt", function () { if (ed === mine && ed.tab === "Wish") window.WeltUI.panel(p, hooks); }).catch(function () {
        if (ed !== mine || ed.tab !== "Wish") return;      // the part did not load (offline without a cache, SRI): the way without AI stays
        p.appendChild(el("p", "note aistate", t("welt_noPart")));
        p.appendChild(el("button", "chip", "🎚 " + t("welt_rules"), function () { Kit.sfx.tap(); tab("Rules"); }));
      });
      return;
    }
    var f = field(p, t("wishL"), "", 100, function () {}, true), box = el("div", "chips");
    var want = function () { return D.cleanInput(f.value, 100); };
    var go = aiBlock(p, {
      kind: "wish", label: t("wishGo"), noteLast: true, input: function () { var v = want(); return v ? W.request(ed.doc, v, ed.idea ? D.plainTitle(ideaText(ed.idea).t) : "") : null; },
      auto: function (o, ki, res) {
        var before = JSON.stringify(ed.doc), next = W.apply(ed.doc, o.changes || {}, PAIRS, seeded(want() + "|sk"));
        if (ki) markKi(next, ki);
        return didLine(res, before, next, ki ? (o.note || "") : t("aiNoAi"));
      }
    });
    p.appendChild(el("label", "lbl wishtips", t("wishOr")));
    t("wishTips_" + ed.doc.k).split("|").forEach(function (x) { box.appendChild(el("button", "chip", x, function () { Kit.sfx.tap(); f.value = x; go(); })); });
    p.appendChild(box);
    p.appendChild(el("p", "note", t("wishH_" + ed.doc.k) + " " + t("aiNote")));
  },
  // The dice: style, colours, stickers (and a card's line from its idea) rolled on the device. No AI, no network, no count.
  Dice: function (p) {
    var res = el("div", "chips");
    p.appendChild(el("button", "chip hot", "🎲 " + t("diceGo"), function () {
      Kit.sfx.pop();
      var d = ed.doc, key = d.seed != null ? d.seed : d.i || d.k, n = roll(key), seed = key + "|" + n;
      var before = JSON.stringify(d), lines = ed.idea && d.k === "card" ? ideaText(ed.idea).lines : null;
      res.textContent = ""; didLine(res, before, W.apply(d, W.dice(d, seed, PAIRS, lines), PAIRS, seeded(seed + "|sk")));
    }));
    p.appendChild(res);
    p.appendChild(el("p", "note", t("diceNote")));
  },
  // Advent door: only its number; 1-24 as plain buttons, no typing.
  Door: function (p) {
    p.appendChild(el("label", "lbl", t("doorPick")));
    chips(p, Array.from({ length: 24 }, function (x, i) { return { v: i + 1, l: String(i + 1) }; }), ed.doc.nr, function (v) { ed.doc.nr = v; }, "em");
    p.appendChild(el("p", "note", t("doorNote")));
  },
  Idea: function (p) {
    p.appendChild(el("p", "note", t("ownH")));
    field(p, t("ideaT"), ed.doc.t, 40, function (v) { ed.doc.t = v; });
    field(p, t("ideaS"), ed.doc.s, 70, function (v) { ed.doc.s = v; });
  },
  Text: function (p) {
    var d = ed.doc;
    if (d.k === "card") {
      var f = field(p, t("line"), d.x, 90, function (v) { d.x = v; }, true), L = ed.idea ? ideaText(ed.idea).lines : null;
      if (L) p.appendChild(el("button", "chip", "↻ " + t("nextLine"), function () { Kit.sfx.pop(); ed.line = (ed.line + 1) % L.length; d.x = L[ed.line]; f.value = d.x; changed(); }));
      textePart(p, "card", f);
      if (!d.nr) weatherBlock(p);
    } else if (d.k === "photo") {
      var top = field(p, t("top"), d.x, 28, function (v) { d.x = v; }), low = field(p, t("bottom"), d.y, 28, function (v) { d.y = v; });
      var what = field(p, t("aiDesc"), "", 100, function () {});
      aiBlock(p, { kind: "meme", label: t("aiMeme"), input: function () { var v = D.cleanInput(what.value, 100); return v ? { desc: v } : null; }, show: function (o) { return o.top + " / " + o.bottom; }, apply: function (o, ki) { d.x = D.cleanInput(o.top, 28); d.y = D.cleanInput(o.bottom, 28); top.value = d.x; low.value = d.y; markKi(d, ki); changed(); } });
    } else if (d.k === "sound") {
      field(p, t("titleL"), d.x, 28, function (v) { d.x = v; });
      if (d.ly) p.appendChild(el("button", "chip", "✕ " + t("lyOff"), function () { delete d.ly; changed(); tab("Text"); }));
    }
    else field(p, t("titleL"), d.g.title, 28, function (v) { d.g.title = v || "Duell"; byHand(); });
  },
  Style: function (p) {
    var d = ed.doc;
    chips(p, D.STYLES[d.k].map(function (s) { return { v: s, l: t("st_" + s) }; }), d.st, function (v) { d.st = v; });
  },
  Color: function (p) { colors(p, function () { return ed.doc.col; }, function (c) { ed.doc.col = c; if (ed.doc.k === "photo") ed.photo._id += ""; }); },
  Sticker: function (p) {
    var d = ed.doc, own = D.byId(d.i), set = D.SETS[(own && own.set) || me.set], set = set.concat(set.indexOf(me.emoji) < 0 ? [me.emoji] : []);
    var box = el("div", "chips");
    set.forEach(function (e) {
      box.appendChild(el("button", "chip em", e, function () {
        if (d.sk.length >= D.MAX_STICKERS) { Kit.toast(t("skFull")); return; }
        Kit.sfx.pop(); var r = C.mulberry32(C.hash32(me.nick + d.sk.length + e + d.x));
        SK.step(function (l) { l.push({ e: e, x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.65, r: (r() - 0.5) * 0.7, z: 0.8 + r() * 0.7 }); ed.sel = l.length - 1; });
      }));
    });
    p.appendChild(box);
    if (!d.sk.length) return;
    p.appendChild(el("p", "note", t("skHint")));
    var mine = el("div", "chips");   // also the way to reach a sticker that is hard to tap, and the keyboard's way
    d.sk.forEach(function (s, i) {
      var b = el("button", "chip em" + (i === ed.sel ? " on" : ""), s.e, function () { Kit.sfx.tap(); SK.select(i); });
      b.setAttribute("aria-pressed", String(i === ed.sel)); mine.appendChild(b);
    });
    p.appendChild(mine);
    var row = el("div", "chips");
    [["−", function (s) { s.z = Math.max(0.5, s.z - 0.2); }, "a_skSmall"], ["+", function (s) { s.z = Math.min(2.5, s.z + 0.2); }, "a_skBig"], ["↻", function (s) { s.r = s.r > 2.9 ? -3 : s.r + 0.25; }, "a_skTurn"], ["✕", null, "skDelete"]].forEach(function (x) {
      var b = el("button", "chip em", x[0], function () {
        if (!d.sk[ed.sel]) return; Kit.sfx.tap();
        if (x[1]) SK.step(function (l) { x[1](l[ed.sel]); }); else SK.remove(ed.sel);
      });
      b.setAttribute("aria-label", t(x[2]));
      b.disabled = !d.sk[ed.sel]; row.appendChild(b);
    });
    p.appendChild(row);
  },
  Photo: function (p) {
    p.appendChild(el("button", "chip", "📷 " + t("pick"), function () { Kit.sfx.tap(); $("file").click(); }));
    p.appendChild(el("button", "chip", "🤖 " + t("noPhoto"), function () { Kit.sfx.pop(); ed.bots = (ed.bots || 0) + 1; ed.photo = R.botFace(D.botSeed(me.nick, ed.doc, ed.bots), ed.doc.col[1]); changed(); }));
    p.appendChild(el("p", "note", t("photoNote") + " " + t("noPick")));
    chips(p, D.STYLES.photo.map(function (s) { return { v: s, l: t("st_" + s) }; }), ed.doc.st, function (v) { ed.doc.st = v; });
  },
  Sound: function (p) { if (ed.doc.m === "beat") { textePart(p, "song"); beatPanel(p); } else voicePanel(p); },
  Rules: function (p) {
    var g = ed.doc.g, ranges = C.RANGES;
    ["gravity", "jump", "gap", "speed"].forEach(function (k) {
      var row = el("label", "slide"), r = el("input"), v = el("b", "", g.params[k]);
      row.appendChild(el("span", "", t(k))); r.type = "range"; r.min = ranges[k][0]; r.max = ranges[k][1]; r.value = g.params[k]; r.setAttribute("aria-label", t(k));
      r.addEventListener("input", function () { g.params[k] = Number(r.value); v.textContent = r.value; byHand(); changed(); });
      row.appendChild(r); row.appendChild(v); p.appendChild(row);
    });
    p.appendChild(el("button", "chip", "✨ " + t("wishL_game"), function () { Kit.sfx.tap(); tab("Wish"); }));   // the one way in, not a second one
  },
  Figure: function (p) {
    var g = ed.doc.g, list = EMOJI.indexOf(me.emoji) < 0 ? [me.emoji].concat(EMOJI) : EMOJI;
    chips(p, list.map(function (e) { return { v: e, l: e }; }), g.emoji, function (v) { g.emoji = v; byHand(); }, "em");
  },
  // A world chosen here replaces a world built by a wish or the idea (its look), which would otherwise cover every theme.
  World: function (p) {
    var g = ed.doc.g;
    var b = chips(p, G.THEMES.map(function (n) { return { v: n, l: t("w_" + n) }; }), g.look || g.route ? null : g.theme, function (v) { g.theme = v; delete g.look; delete g.route; byHand(); });
    Array.from(b.children).forEach(function (c, i) { c.style.borderBottom = "8px solid " + G.themeColor(G.THEMES[i]); });
  }
};

/* stickers on the preview (stickers.js) */
var SK = window.Stickers.attach({
  cv: cv, wrap: $("stagewrap"), state: function () { return ed; }, changed: changed, t: t, sfx: function (n) { Kit.sfx[n](); },
  onChange: function () { if (ed && ed.tab === "Sticker") { var keep = $("panel").scrollTop; tab("Sticker"); $("panel").scrollTop = keep; } }
});

/* photo: read locally, drawn to a canvas; the file never leaves this function's memory */
$("file").addEventListener("change", async function () {
  var f = $("file").files && $("file").files[0]; $("file").value = "";
  if (!f || !ed) return;
  try {
    var bmp = typeof createImageBitmap === "function" ? await createImageBitmap(f) : await new Promise(function (ok, no) { var i = new Image(), u = URL.createObjectURL(f); i.onload = function () { URL.revokeObjectURL(u); ok(i); }; i.onerror = no; i.src = u; });
    var k = Math.min(1, 1350 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    c._id = "p" + Date.now(); ed.photo = c; ed.ownPhoto = true; Kit.sfx.pop(); changed();
  } catch (e) { Kit.toast(t("noPick")); }
});

/* sound */
var loop = null, playTimer = 0;
function stopSound() { clearInterval(playTimer); playTimer = 0; if (loop) { try { loop.stop(); } catch (e) {} loop = null; } clearNow(); if (ed && ed.lyr >= 0) { ed.lyr = -1; changed(); } }
function clearNow() { document.querySelectorAll(".step.now").forEach(function (x) { x.classList.remove("now"); }); }
function beatPcm(loops) { return S.renderBeat(ed.doc.p, ed.doc.bpm, loops || 2); }
function beatPeaks() { ed.peaks = S.peaks(beatPcm(1), 40); }
function playBeat() {
  stopSound(); var pcm = beatPcm(1); loop = Kit.playPcm(pcm, S.SR, true); if (!loop) return;
  var i = 0, bar = 0, ms = 60000 / ed.doc.bpm / 4;
  playTimer = setInterval(function () {
    clearNow();
    if (i === 0 && ed.doc.ly) { ed.lyr = bar++ % ed.doc.ly.length; changed(); }   // a song's hook: one line per bar
    if (i >> 2 === ed.page) document.querySelectorAll('.step[data-c="' + (i % 4) + '"]').forEach(function (x) { x.classList.add("now"); });
    i = (i + 1) % 16;
  }, ms);
}
function beatPanel(p) {
  // 4 steps a row (44 px on the smallest phone), 4 pages of one beat each; every step says its sound, its beat and its state.
  var rows = [["k", "🥁"], ["s", "👏"], ["h", "✨"], ["b", "🎹"]], grid = el("div", "grid"), pages = el("div", "chips");
  function fill() {
    grid.textContent = ""; pages.textContent = "";
    rows.forEach(function (r) {
      grid.appendChild(el("span", "", r[1]));
      for (var c = 0; c < 4; c++) (function (c) {
        var i = ed.page * 4 + c, on = ed.doc.p[r[0]][i] === "x", b = el("button", "step" + (c ? "" : " q") + (on ? " on" : ""), null, function () {
          var v = ed.doc.p[r[0]]; ed.doc.p[r[0]] = v.slice(0, i) + (v[i] === "x" ? "-" : "x") + v.slice(i + 1);
          on = !on; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); Kit.sfx.tap(); beatPeaks(); changed(); if (loop) playBeat();
        });
        b.dataset.c = c; b.setAttribute("aria-label", t("bt_" + r[0]) + ", " + t("btN", { n: i + 1 })); b.setAttribute("aria-pressed", String(on)); grid.appendChild(b);
      })(c);
    });
    [0, 1, 2, 3].forEach(function (n) { var b = el("button", "chip" + (n === ed.page ? " on" : ""), n * 4 + 1 + "–" + (n * 4 + 4), function () { ed.page = n; fill(); }); b.setAttribute("aria-label", t("btN", { n: n * 4 + 1 + "–" + (n * 4 + 4) })); b.setAttribute("aria-pressed", String(n === ed.page)); pages.appendChild(b); });
  }
  var bar = el("div", "chips");
  fill(); p.appendChild(pages); p.appendChild(bar); p.appendChild(grid);
  var row = el("label", "slide"), r = el("input"), v = el("b", "", ed.doc.bpm);
  row.appendChild(el("span", "", t("bpm"))); r.type = "range"; r.min = 70; r.max = 170; r.value = ed.doc.bpm; r.setAttribute("aria-label", t("bpm"));
  r.addEventListener("input", function () { ed.doc.bpm = Number(r.value); v.textContent = r.value; beatPeaks(); changed(); });
  r.addEventListener("change", function () { if (loop) playBeat(); });
  row.appendChild(r); row.appendChild(v); p.appendChild(row);
  var pl = el("button", "chip", loop ? "■ " + t("stop") : "▶ " + t("listen"), function () { if (loop) { stopSound(); pl.textContent = "▶ " + t("listen"); } else { playBeat(); pl.textContent = "■ " + t("stop"); } });
  bar.appendChild(pl);
}
function setVoice(pcm, mine) { ed.raw = pcm; if (mine) ed.ownVoice = true; applyFx(); }
function applyFx() { if (!ed.raw) return; ed.pcm = S.warp(ed.raw, ed.doc.fx); ed.peaks = S.peaks(ed.pcm, 40); changed(); }
// 3-2-1 read out, then up to 4 s with a ring that fills (style.css .ring); a tap on the same button stops it early.
var recNow = null;
async function record(b) {
  if (recNow) { if (recNow.stop) recNow.stop(); return; }
  var n = S.SR, ms = 4000, ring = 0, t0;
  try {
    recNow = {};
    if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error("no mic");
    var st = await navigator.mediaDevices.getUserMedia({ audio: true }), rec = new MediaRecorder(st), parts = [];
    for (var k = 3; k; k--) { b.textContent = k; Kit.speak(k); await new Promise(function (ok) { setTimeout(ok, 700); }); }
    b.textContent = "■ " + t("stop"); Kit.speak(t("recing")); b.classList.add("ring"); recNow = rec;
    rec.ondataavailable = function (e) { parts.push(e.data); };
    rec.onstop = async function () {
      recNow = null; clearInterval(ring); b.classList.remove("ring"); b.style.setProperty("--p", 0); b.textContent = "🎙 " + t("rec"); st.getTracks().forEach(function (x) { x.stop(); });
      try { var buf = await Kit.audio(true).decodeAudioData(await new Blob(parts).arrayBuffer()), src = buf.getChannelData(0), k = buf.sampleRate / n, o = new Float32Array(Math.floor(src.length / k)); } catch (e) { return; }   // stopped at once: nothing to keep
      for (var i = 0; i < o.length; i++) o[i] = src[Math.floor(i * k)];
      if (ed) setVoice(o, true);
    };
    rec.start(); t0 = Date.now();
    ring = setInterval(function () { var f = Math.min(1, (Date.now() - t0) / ms); b.style.setProperty("--p", f); if (f >= 1 && rec.state === "recording") rec.stop(); }, 100);
  } catch (e) { recNow = null; Kit.toast(t("noMic")); }
}
function voicePanel(p) {
  var b = el("button", "chip", "🎙 " + t("rec"), function () { Kit.sfx.tap(); record(b); });
  var row = el("div", "chips"); row.appendChild(b);
  row.appendChild(el("button", "chip", "🤪 " + t("dummy"), function () { Kit.sfx.pop(); setVoice(S.dummyVoice(), false); }));
  row.appendChild(el("button", "chip", "▶ " + t("listen"), function () { if (!ed.pcm) setVoice(S.dummyVoice(), false); stopSound(); loop = Kit.playPcm(ed.pcm, S.SR, false); }));
  p.appendChild(row);
  chips(p, D.FX.map(function (f) { return { v: f, l: t("fx_" + f) }; }), ed.doc.fx, function (v) { ed.doc.fx = v; applyFx(); });
}

/* ---------- finish ---------- */
// AI Act Art. 50: a picture of a sheet that AI made (or helped to make: wish, AI picture, free card) says so in the picture
// itself, not only in the link's seal. White on black (contrast 18:1), bottom left inside the picture, clear of the
// "my daily idea" mark bottom right, so a crop of the card keeps it.
function aiMark(c, doc) {
  if (!doc || !doc.ki) return c;
  var x = c.getContext("2d"), s = t("kiBadgeL"), H = c.height;
  x.save(); x.font = "700 40px system-ui, sans-serif"; var w = x.measureText(s).width;
  x.fillStyle = "#111"; x.fillRect(40, H - 112, w + 40, 64); x.fillStyle = "#fff"; x.textBaseline = "middle"; x.textAlign = "left"; x.fillText(s, 60, H - 80);
  x.restore(); return c;
}
function makeBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(ok, type || "image/png", q); }); }
function tinyThumb(c) { var s = document.createElement("canvas"); s.width = 135; s.height = 169; s.getContext("2d").drawImage(c, 0, 0, 135, 169); return s.toDataURL("image/jpeg", 0.6); }
function thumb(c) { var s = document.createElement("canvas"); s.width = 270; s.height = 338; s.getContext("2d").drawImage(c, 0, 0, 270, 338); return s.toDataURL("image/jpeg", 0.6); }
async function finish(doc, idea, pictureDoc) {
  var c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
  R.exporting = true;
  try { R.draw(c, pictureDoc || doc, { me: me, photo: ed && ed.photo, peaks: ed && ed.peaks }); } finally { R.exporting = false; }
  c = aiMark(withPic(c, doc), doc);
  var png = await makeBlob(c), file = png, name = "my-daily-idea.png";
  if (doc.k === "sound") {
    var pcm = doc.m === "beat" ? beatPcm(2) : (ed.pcm || S.warp(S.dummyVoice(), doc.fx));
    file = new Blob([S.wav(pcm)], { type: "audio/wav" }); name = "my-daily-idea.wav";
  }
  var url = D.docUrl(doc);
  result = { url: url, file: file, name: name, png: png, keep: ed, canvas: c, kind: doc.k, doc: doc };
  var made = pictureDoc || doc;
  wall = D.addToWall(wall, { id: idea || doc.i || "own", ts: Date.now(), th: thumb(c), k: made.k === "photo" || (ed && ed.photo) ? "photo" : made.k }); store.wall = wall; Kit.save();
  if (!Kit.persisted) Kit.toast(t("wallFull"));
  var img = $("doneimg"); if (img.src) URL.revokeObjectURL(img.src); img.src = URL.createObjectURL(png);
  $("playit").hidden = true;   // a card is not a level: whoever does not fly far would never see it
  stopSound(); G.stop(); labels(); show("done", true); Kit.sfx.win();
}
$("edmain").addEventListener("click", function () {
  if (!ed) return;
  if ($("edmain").getAttribute("aria-disabled") === "true") { var x = X[ed.doc.k]; if (!(x && x.nudge && x.nudge(ed))) nudge(); return; }
  if (X[ed.doc.k]) { X[ed.doc.k].main(ed); return; }
  if (ed.doc.k === "game") { if (ed.pv && ed.fly) ed.fly(); else playGame(); return; }   // an open preview: PLAY flies it, like "Fly"
  if (!ready()) { Kit.tone(200, 160, 0.1, "square", 0.06); return; }
  Kit.sfx.thud();
  finish(D.withTrail(ed.doc, me.nick, areas()));
});
// A card finished straight from the sheet, without the editor (feel-good cards); Edit then opens it there.
function quick(doc, idea) {
  ed = { doc: D.sanitizeDoc(doc), base: D.docFromIdea(idea, me, Kit.lang), own: false, photo: null, peaks: null, idea: idea, quick: true };
  return finish(D.withTrail(ed.doc, me.nick, D.changedAreas(ed.base, ed.doc)));
}
// Two steps when the short link is not there yet: the first tap makes it, the second shares it. Sharing and copying need a fresh
// tap in most browsers, and the wait for the server would use it up, which sent an old or no link before. The button keeps
// its name through both; a note says when the link is ready.
var sharing = false;
$("share").addEventListener("click", async function () {
  var b = $("share"); if (sharing) return;
  Kit.sfx.tap();
  if (!result.link) { sharing = true; b.disabled = true; b.setAttribute("aria-busy", "true"); try { await shortLink(); } finally { sharing = false; b.disabled = false; b.removeAttribute("aria-busy"); } Kit.toast(t("sh_ready")); return; }
  var link = result.link;
  // Only the link: chat apps such as WhatsApp drop the link when a picture comes along. The picture stays one tap away under Save.
  await Kit.share({ url: link.url, text: shareLine(result.keep && result.keep.doc) });
});
$("playit").addEventListener("click", function () { ed = result.keep; ed.sel = -1; makePlayable(); });
// Reaches the server only from here, that is after a tap on one of the share buttons (or on "finish the card" of a feel-good card, see warm.js). The chat preview then shows the
// finished picture, before anyone can send the link; a photo poster keeps the fixed picture, photos stay on the phone.
async function shortLink() {
  if (!result.link) {
    result.link = await window.ShortLink.shorten(result.url, { k: result.kind, l: Kit.lang }, store);
    var doc = result.doc; stimme(function (S) { S.share(doc); });   // the card's id and what the last person changed, nothing else (src/stat.js)
    var mine = result.link.short && store.links.filter(function (e) { return e.id === result.link.id; })[0];
    if (mine && result.canvas) { mine.th = tinyThumb(result.canvas); mine.k = result.kind; }   // only on this phone, for the list of invitations
    Kit.save();
    if (result.link.short && result.kind !== "photo" && result.canvas) {
      try { await window.ShortLink.picture(result.link.id, await makeBlob(chatPicture(result.canvas, result.keep ? result.keep.doc.col : me.colors), "image/jpeg", 0.82), store); } catch (e) {}
    }
  }
  return result.link;
}
// 1200x630, the size chat apps show large: the work in the middle on its own colour, so a square crop still shows it whole.
function chatPicture(c, col) {
  var o = document.createElement("canvas"), x = o.getContext("2d"), h = 590, w = Math.round(h * c.width / c.height);
  o.width = 1200; o.height = 630; x.fillStyle = col[0]; x.fillRect(0, 0, 1200, 630); x.drawImage(c, (1200 - w) / 2, 20, w, h);
  return o;
}
/* Status and story: pictures cannot carry a tappable link, so the picture shows the address and a code, and the text goes to the clipboard.
   Without a short link the long one would be an unreadable code: the picture then points to the app, the long link stays in the text. */
async function exportStory(kind) {
  Kit.sfx.tap();
  var link = await shortLink(), shown = link.short ? link.url : C.SHARE_BASE, cols = result.keep ? result.keep.doc.col : me.colors;
  try { await window.Parts.use("qr", function () {}); } catch (e) { return; }   // statuscard.js and the QR code are a part of their own
  var cv = window.StatusCard.draw(result.canvas, { url: shown, bg: cols[0], ink: R.ink(cols[0]), cta: t(link.short ? "sh_cta" : "sh_ctaApp") });
  var blob = await makeBlob(cv, "image/jpeg", 0.92);
  var text = kind === "story" ? link.url : t("shareText") + " " + link.url;
  if (await Kit.copy(text)) Kit.toast(t(kind === "story" ? "sh_copiedStory" : "copied"));
  await Kit.share({ url: link.url, text: t("shareText"), blob: blob, name: "my-daily-idea-" + kind + ".jpg" });
}
$("tostatus").addEventListener("click", function () { exportStory("status"); });
$("tostory").addEventListener("click", function () { exportStory("story"); });
$("save").addEventListener("click", function () { Kit.sfx.tap(); Kit.saveFile(result.file, result.name); });
$("keep").addEventListener("click", function () { Kit.sfx.tap(); backToEditor(); });
function backToEditor() {
  if (result.keep.quick) { openEditor(result.keep.doc, { idea: result.keep.idea }); return; }
  ed = result.keep; ed.sel = -1; show("editor"); if (ed.doc.k === "game") G.demo($("demo"), gameState()); changed();
}
$("dhome").addEventListener("click", goHome);
$("dback").addEventListener("click", function () { Kit.sfx.tap(); goHome(); });
$("edback").addEventListener("click", function () { Kit.sfx.tap(); goHome(); });
// Merken: the work as it is now lands on the wall, with its link, so it opens again in the editor later.
function savedNow() { var f = docFragment(ed.doc); return !!f && wall.some(function (w) { return w.f === f; }); }
function docFragment(doc) { var u = D.docUrl(doc), i = u.indexOf("#"); return i < 0 ? "" : u.slice(i + 1); }
function saveMark() { var on = !!ed && savedNow(); $("edsave").textContent = on ? "♥" : "♡"; $("edsave").setAttribute("aria-pressed", String(on)); }
$("edsave").addEventListener("click", function () {
  if (!ed) return; Kit.sfx.pop(); Kit.haptic(12);
  var f = docFragment(ed.doc);
  if (savedNow()) { wall = wall.filter(function (w) { return w.f !== f; }); Kit.toast(t("unsaved")); }
  else {
    var c = document.createElement("canvas"); c.width = 540; c.height = 675;
    if (ed.doc.k === "game") { var g = $("demo"); c.getContext("2d").drawImage(g, 0, 0, c.width, c.height); }
    else R.draw(c, ed.doc, { me: me, photo: ed.photo, peaks: ed.peaks });
    wall = D.addToWall(wall, { id: ed.doc.i || "own", ts: Date.now(), th: thumb(c), f: f, k: ed.doc.k === "photo" || ed.photo ? "photo" : ed.doc.k }); Kit.toast(t("saved"));   // k: a photo work never leaves the device (profile.js)
  }
  store.wall = wall; Kit.save(); saveMark();
});
$("shback").addEventListener("click", function () { Kit.sfx.tap(); if (!backFromStyle()) goHome(); });
// My style opened from the editor returns there with the work intact; new colours apply unless they were chosen by hand.
function backFromStyle() {
  if (!ed || !ed.styling) return false;
  ed.styling = false;
  if (ed.doc.col.join() === ed.base.col.join()) { ed.doc.col = me.colors.slice(); ed.base.col = me.colors.slice(); }
  $("edstyle").textContent = me.emoji; show("editor");
  if (ed.doc.k === "game") G.demo($("demo"), gameState());
  changed(); return true;
}
$("gback").addEventListener("click", function () { Kit.sfx.tap(); if (!backFromPlay()) goHome(); });
function gameToEditor() {
  if (backFromPlay()) return;
  var d = gameDoc(G.current());
  if (ed && ed.doc.k === "game") { var keep = ed; G.stop(); show("editor"); ed = keep; G.demo($("demo"), gameState()); changed(); return; }
  G.stop(); openEditor(d);
}
$("remixbtn").addEventListener("click", function () { Kit.sfx.tap(); gameToEditor(); });
$("toremix").addEventListener("click", function () { Kit.sfx.tap(); gameToEditor(); });
$("image").addEventListener("click", function () {
  var s = G.current(), sc = G.score(), base = ed && ed.doc.k === "game" ? ed.doc : gameDoc(s);
  if (!ed) ed = { doc: D.sanitizeDoc(base), base: D.sanitizeDoc(base), photo: null, peaks: null };
  var pic = { k: "card", st: "druck", col: base.col, x: sc + " " + s.title, sk: [] };
  finish(D.withTrail(base, me.nick, D.changedAreas(ed.base, ed.doc)), base.i, pic);
});

/* ---------- my style ---------- */
// The roll number lives on the device, so closing and opening again goes on with the next roll instead of the first.
function roll(key) { var s = Kit.store; if (!s.rolls || typeof s.rolls !== "object" || Array.isArray(s.rolls)) s.rolls = {}; var n = W.nextRoll(s.rolls, key); Kit.save(); return n; }
// My style (src/stil.js) is the part stil: the shelf opens at once, its content follows with the part (at once when it is
// there); without the part the shelf says so. konto (its account section) is asked for first and stil right after, so each
// loads once and konto's script comes before stil's; stil does not wait for it: a missing or hanging konto still opens My
// style, without that section, as before (konto() below).
var styleFill = null, shelves = 0;
function openStyle() {
  shelf(t("style"), function (b) {
    var n = shelves, put = function () { b.textContent = ""; (styleFill = window.StilUI.fill)(b); };
    if (window.StilUI) { put(); return; }
    b.appendChild(el("p", "note", "…"));
    window.Parts.need("konto").catch(function () {});
    window.Parts.need("stil").then(function () { if (n === shelves && screen === "shelf") put(); }).catch(function () { if (n === shelves) { b.textContent = ""; b.appendChild(el("p", "note", t("part_fail"))); } });
  });
}
// A sync brought style, wall or saved cards from another device: the open My style shows them at once.
function profileChanged() {
  me = D.sanitizeProfile(store.me); wall = D.sanitizeWall(store.wall); $("me").textContent = me.emoji;
  if (screen === "home" || (screen === "shelf" && $("acbox"))) setInk(me.colors[0], me.colors[1]);
  if (screen === "shelf" && $("acbox")) { var b = $("shbody"); b.textContent = ""; styleFill(b); }   // acbox comes only with a filled My style, so styleFill is set
}
// "Anmelden / Registrieren" (src/profile.js) is the part konto: loaded when My style opens, and at start while linked.
function konto(fn) { return window.Parts.use("konto", function () { window.Profile.onChange(profileChanged); if (fn) fn(); }).catch(function () {}); }
if (store.profile) konto();
// For an AI feature (next wave): the defaults that would go along, shown as chips where the request is made; a tap
// leaves one out for this request only. use.context() is the short text (D.prefContext) with what is still on.
function prefUse(box, keys) {
  var off = {}, row = el("div", "chips pfuse");
  D.prefChips(me, Kit.lang).filter(function (c) { return keys.indexOf(c.k) >= 0; }).forEach(function (c) {
    var id = c.k + ":" + c.v, b = el("button", "chip on", c.l, function () { off[id] = !off[id]; b.classList.toggle("on", !off[id]); b.setAttribute("aria-pressed", String(!off[id])); Kit.sfx.tap(); });
    b.setAttribute("aria-pressed", "true"); row.appendChild(b);
  });
  if (row.children.length) box.appendChild(row);
  function on() {
    var p = { pref: JSON.parse(JSON.stringify(me.pref || {})) };
    Object.keys(off).forEach(function (id) { if (off[id]) { var k = id.split(":")[0]; p.pref = D.dropPref(p, k, id.slice(k.length + 1)); } });
    return p;
  }
  // pref(): the defaults still on, for what the page computes itself (household size, times without time).
  return { context: function () { return D.prefContext(on(), Kit.lang, keys); }, pref: function () { return on().pref; } };
}
// Report a shared sheet (src/melden.js, the part melden): the dialog comes with the part, a missing part says so (Parts.use).
// A sheet goes out once from this device: reported() keeps the button greyed without the part.
function reportKey(doc) { return String(C.hash32(JSON.stringify([doc.k, doc.t, doc.s, doc.x, doc.y, doc.g && doc.g.title, doc.ki && doc.ki.s]))); }
function reported(doc) { return Array.isArray(Kit.store.reported) && Kit.store.reported.indexOf(reportKey(doc)) >= 0; }
// One dialog at a time: a second tap while the part is still on its way does nothing.
var reporting = false;
function reportKi(h) {
  if (reported(h.doc) || reporting) return;
  reporting = true;
  window.Parts.use("melden", function () { reporting = false; if (home === h && screen === "home") window.Melden.open(h.doc, h.link); }).catch(function () { reporting = false; });
}
function shelf(title, fill) { shelves++; stopSound(); G.stop(); $("shtitle").textContent = title; var b = $("shbody"); b.textContent = ""; fill(b); show("shelf", true); }
function openAiWall() { ed.styling = true; shelf(t("aiTitle"), function (b) { window.Ai.wall(b, el); }); }
// The last week, and above it a search over every sheet: one word, one tap on a hit, and that sheet is back.
function openPast() {
  shelf(t("past"), function (b) {
    var q = el("input", "field"), list = el("div"), T = window.DailyTexts, names = {};
    q.type = "search"; q.id = "pastq"; q.placeholder = t("pastSearch"); q.setAttribute("aria-label", t("pastSearch")); q.autocomplete = "off"; q.enterKeyHint = "search";
    D.KINDS.forEach(function (k) { names[k] = [T.de[k], T.en[k]]; });
    function row(e) {
      var made = wall.some(function (w) { return w.id === e.idea.id; }), r = el("button", "day", null, function () { Kit.sfx.tap(); home = { date: e.date || today, idea: e.idea }; goHome(); });
      r.appendChild(el("b", "", e.date ? String(e.date.getUTCDate()).padStart(2, "0") : "✦"));
      r.appendChild(el("span", "", D.plainTitle(ideaText(e.idea).t)));
      if (e.found) r.appendChild(el("small", "", e.date ? monthLines(e.date).split("\n")[0] + " " + e.date.getUTCFullYear() : t("pastNew")));
      if (made) r.appendChild(el("i", "", "✓"));
      list.appendChild(r);
    }
    function fill() {
      list.textContent = "";
      if (!q.value.trim()) { D.lastDays(today, 7).forEach(row); return; }
      var hits = D.searchIdeas(q.value, today, names);
      if (!hits.length) { list.appendChild(el("div", "empty", t("pastNone"))); return; }
      hits.forEach(function (h) { h.found = true; row(h); });
    }
    q.addEventListener("input", fill);
    b.appendChild(q); b.appendChild(list); fill();
  });
}
function openWall(which) {
  shelf(t("wall"), function (b) {
    var links = window.ShortLink.kept(store.links, Date.now()), tabs = el("div", "chips walltabs");
    [["wall", t("wall")], ["links", t("invites") + " (" + links.length + ")"]].forEach(function (x) {
      var on = (which || "wall") === x[0], c = el("button", "chip" + (on ? " on" : ""), x[1], function () { Kit.sfx.tap(); openWall(x[0]); });
      c.setAttribute("role", "tab"); c.setAttribute("aria-selected", String(on)); tabs.appendChild(c);
    });
    b.appendChild(tabs);
    if (which === "links") { invites(b, links); return; }
    if (!wall.length) { b.appendChild(el("div", "empty", t("wallEmpty"))); return; }
    var g = el("div", "wallgrid");
    wall.forEach(function (w, i) {
      var c = el("button", "", null, function () {
        Kit.sfx.tap(); b.textContent = ""; var im = el("img", "big"); im.src = w.th; im.alt = ""; b.appendChild(im);
        var r = w.f ? D.parseRoute("#" + w.f) : null;
        if ((r && r.type === "doc") || two("#" + w.f)) b.appendChild(el("button", "btn hot", t("openAgain"), function () { Kit.sfx.thud(); if (two("#" + w.f)) window.Parts.use(two("#" + w.f), function () { again(w.f); }).catch(function () {}); else again(w.f); }));
        b.appendChild(el("button", "btn", t("gone"), function () { wall.splice(i, 1); store.wall = wall; Kit.save(); openWall(); }));
      });
      var im = el("img"); im.src = w.th; im.alt = ""; c.appendChild(im); g.appendChild(c);
    });
    b.appendChild(g);
  });
}
// A saved work opened again; a turn card that checks a signature first (prepare) waits for it.
function again(f) {
  var r = D.parseRoute("#" + f), pre = r && r.type === "doc" && r.doc.k === "turn" && window.Turns.game(r.doc).prepare, wait = pre && pre(r.doc);
  if (wait && wait.then) { wait.then(function () { again(f); }); return; }
  if (r && r.type === "doc") openEditor(r.doc, { idea: r.doc.i ? D.byId(r.doc.i) : null, own: !r.doc.i });
}
// Invitations: every short link made on this phone, as its picture with the date it runs out and a cross that deletes it.
function invites(b, list) {
  if (!list.length) { b.appendChild(el("div", "empty", t("invEmpty"))); return; }
  var g = el("div", "wallgrid inv"), ICON = { card: "🃏", photo: "📷", sound: "🥁", game: "🕹", idea: "💡" };
  list.forEach(function (l) {
    var url = C.SHORT_BASE + l.id, when = new Date(l.exp).toLocaleDateString(Kit.loc()), cell = el("div", "invcell");
    var open = el("button", "", null, function () { Kit.sfx.tap(); Kit.share({ url: url, text: t("shareText") }); });
    open.setAttribute("aria-label", t("invShare", { d: when }));
    if (typeof l.th === "string" && l.th.length < 30000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(l.th)) { var im = el("img"); im.src = l.th; im.alt = ""; open.appendChild(im); }
    else open.appendChild(el("span", "invicon", ICON[l.k] || "🔗"));
    var x = el("button", "invx", "✕", async function () {
      Kit.sfx.tap(); x.disabled = true;
      var ok = await window.ShortLink.remove(l.id, store);
      Kit.save(); Kit.toast(t(ok ? "sh_deleted" : "sh_deleteFail"));
      openWall("links");
    });
    x.setAttribute("aria-label", t("invDelete", { d: when }));
    cell.appendChild(open); cell.appendChild(x); cell.appendChild(el("span", "invdate", t("sh_until", { d: when }))); g.appendChild(cell);
  });
  b.appendChild(g);
}
function openOwn() {
  shelf(t("own"), function (b) {
    b.appendChild(el("p", "note", t("ownH")));
    [["card", "🃏"], ["photo", "📷"], ["sound", "🥁"], ["game", "🕹"], ["duel", "🤖"]].concat(D.caps().crypto ? [["quest", "🗝️"]] : []).forEach(function (m) {
      b.appendChild(el("button", "mech", m[1] + " " + t(m[0]), function () { Kit.sfx.thud(); openEditor(D.blankDoc(m[0], me, Kit.lang), { own: true }); }));
    });
    var door = D.byId("advent-tuer");   // an Advent door can be made any day, not only on its calendar days
    if (door) b.appendChild(el("button", "mech", "🎄 " + D.plainTitle(ideaText(door).t), function () { Kit.sfx.thud(); openEditor(D.docFromIdea(door, me, Kit.lang), { idea: door }); }));
    var shop = D.IDEAS.filter(function (i) { return i.turn && i.turn.g === "einkauf"; })[0];   // a shopping list is needed any day, too
    if (shop) b.appendChild(el("button", "mech", "🛒 " + D.plainTitle(ideaText(shop).t), function () { Kit.sfx.thud(); openEditor(D.docFromIdea(shop, me, Kit.lang), { idea: shop }); }));
    CC.tile(b);
  });
}

/* ---------- chrome ---------- */
function labels() {
  document.documentElement.lang = Kit.lang;
  feats(); $("brand").textContent = t("brand"); $("lang").textContent = Kit.lang.toUpperCase(); $("me").textContent = me.emoji;
  // Screen reader names in the language of the page (the template holds the German ones until this runs).
  [["lang", "a_lang"], ["mute", "a_mute"], ["me", "style"], ["edstyle", "style"], ["pvgame", "a_preview"], ["pvcard", "a_preview"], ["stage", "a_preview"], ["demo", "a_gamePreview"],
    ["feat", "a_feat"], ["edback", "a_close"], ["shback", "a_close"], ["gback", "a_close"], ["edsave", "a_keep"], ["cv", "a_field"], ["coqr", "a_qr"]].forEach(function (x) { $(x[0]).setAttribute("aria-label", t(x[1])); });
  $("mute").setAttribute("aria-pressed", String(!!Kit.muted));
  $("mute").textContent = Kit.muted ? "🔇" : "🔊"; $("more").textContent = t("more"); $("own").textContent = t("own"); $("past").textContent = t("past"); $("wall").textContent = t("wall");
  $("tostatus").textContent = t("sh_status"); $("tostory").textContent = t("sh_story"); $("dmore").textContent = t("mehr"); $("dmore").parentNode.hidden = !allow("done", "status");
  // what the other side gets: a photo or a voice stays on this phone, the link carries a bot face or only the effect
  var k = result && result.doc && (result.doc.k === "photo" ? "photo" : result.doc.k === "sound" && result.doc.m !== "beat" ? "voice" : "");
  $("shnote").textContent = [t("sh_note"), k ? t("sh_" + k) : ""].filter(Boolean).join(" ");
  $("share").textContent = t("share"); $("save").textContent = t("save"); $("keep").textContent = t("edit"); $("dhome").textContent = t("home"); $("playit").textContent = "🕹 " + t("playIt");
  $("save").hidden = !Kit.canSave(); SK.labels(); CU.labels(); $("dback").setAttribute("aria-label", t("xClose"));
  // Inside the app shells (DuellHost.more) a quiet "more" opens the native extras; in a browser it stays hidden.
  var host = window.DuellHost && typeof window.DuellHost.more === "function";
  $("host").hidden = !host; $("host").setAttribute("aria-label", t("hostMore"));
  $("game").dataset.rot = "📱 " + t("rotate");   // shown over a game when the phone lies sideways (style.css)
}
$("lang").addEventListener("click", function () { Kit.setLang(Kit.nextLang()); });
// The editor's own switch, shown when an invitation opened it (the home page's switch is out of sight there).
$("edtitle").after(Kit.langBtn("ico")); $("edtitle").nextSibling.id = "edlang";
// A new language redraws what is open: the chrome, the sheet, and in the editor its title, tabs, panel and picture.
window.addEventListener("daily:lang", function () {
  labels();
  if (home && home.noteOf) home.note = home.noteOf();   // the invitation's own line too ("Geschickt bekommen." / "Sent to you.")
  if (home && screen === "home") setHome(home, false);
  if (ed && screen === "editor") {
    $("edtitle").textContent = edTitle(); Array.from($("tabs").children).forEach(function (b) { b.textContent = tabText(b.dataset.k); });
    var p = $("panel"), top = p.scrollTop; tab(ed.tab); p.scrollTop = top; paint();
  }
});
$("host").addEventListener("click", function () { Kit.sfx.tap(); try { window.DuellHost.more(); } catch (e) {} });
$("mute").addEventListener("click", function () { Kit.muted = !Kit.muted; store.muted = Kit.muted; Kit.save(); labels(); Kit.sfx.tap(); });
$("me").addEventListener("click", function () { Kit.sfx.tap(); openStyle(); });
$("edstyle").addEventListener("click", function () { Kit.sfx.tap(); ed.styling = true; openStyle(); });
$("more").addEventListener("click", function () { tear(1); });
$("past").addEventListener("click", function () { Kit.sfx.tap(); openPast(); });
$("wall").addEventListener("click", function () { Kit.sfx.tap(); openWall(); });
$("own").addEventListener("click", function () { Kit.sfx.tap(); openOwn(); });
function start(tabName) {
  if (!home.doc && twoIdea(home.idea)) { window.Parts.use(twoIdea(home.idea), function () { start(tabName); }).catch(function () {}); return; }
  Kit.sfx.thud();
  if (WM.start(home, tabName)) return;
  if (home.doc && X[home.doc.k] && X[home.doc.k].incoming && X[home.doc.k].incoming(home.doc)) return;
  if (!home.doc && home.idea && home.idea.protokoll) { var u = protokollUrl(); if (location.protocol === "https:") location.href = u; else openLive(u); return; }
  if (!home.doc && home.idea && home.idea.kind === "arcade" && window.ArcadeUI) { window.ArcadeUI.menu(home.idea.arcade.g); return; }
  if (home.doc) openEditor(D.localDoc(home.doc, Kit.lang), { idea: home.doc.i ? D.byId(home.doc.i) : null, tab: tabName, got: !!home.note });
  else openEditor(D.docFromIdea(home.idea, me, Kit.lang), { idea: home.idea, tab: tabName, got: !!home.note });
}
$("go").addEventListener("click", function () { start(); });
$("wishgo").addEventListener("click", function () { start($("wishgo").dataset.tab || "Wish"); });
$("kireport").addEventListener("click", function () { Kit.sfx.tap(); if (home && home.doc) reportKi(home); });
$("livego").addEventListener("click", function () { Kit.sfx.tap(); openLive($("livego").dataset.u); });
["focus", "pageshow"].forEach(function (e) { window.addEventListener(e, newDay); });
document.addEventListener("visibilitychange", newDay);
setInterval(newDay, 60000);
window.addEventListener("resize", function () { if (screen === "home") fitHero(); });
// Escape does what the visible ✕ does, on every level. A game on a layer (live, table, arcade) asks first: a second Escape leaves.
var escAt = 0;
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]") || document.getElementById("door")) return;
  var a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== "range") { a.blur(); return; }   // first out of the field, the typing stays
  var co = $("cosheet"), ovs = document.querySelectorAll(".liveov"), ov = ovs[ovs.length - 1], x = null;
  if (!co.hidden) { var no = Array.from($("coacts").querySelectorAll(".btn:not(.hot)")).pop(); if (no) no.click(); else co.hidden = true; e.preventDefault(); return; }
  if (ov) {
    x = ov.querySelector(".arcx, .liveback"); e.preventDefault(); if (!x) return;
    if (Date.now() - escAt > 3000) { escAt = Date.now(); Kit.toast(t("xAgain")); return; }
    escAt = 0; x.click(); return;
  }
  x = { editor: "edback", shelf: "shback", game: "gback", done: "dback" }[screen];
  if (x && !$(x).hidden) { e.preventDefault(); $(x).click(); }
});
window.addEventListener("popstate", function () { if (screen !== "home" && !location.hash && !backFromPlay() && !backFromStyle()) goHome(); });   // with a hash, hashchange decides

function route() {
  var card = CC.route(location.hash);
  if (card) { clearLink(); if (!card.keep && screen !== "editor") goHomeKeep(); return true; }
  if (CU.route(location.hash)) { clearLink(); if (screen !== "editor") goHomeKeep(); return true; }
  var live = location.hash.match(/^#live=([A-Za-z0-9_-]{22})(?:&g=([a-z]{2,12}))?$/);
  if (live && window.LiveUI) { history.replaceState(null, "", location.pathname); window.LiveUI.accept(live[1], live[2]); }
  var seat = location.hash.match(/^#tisch=(doko|skat|bauernskat)\.([A-Za-z0-9_-]{22}(?:\.[A-Za-z0-9_-]{22}){0,2})(?:&r=([a-z]{1,8}(?:\.[a-z]{1,8}){0,3}))?$/);   // one token, or one per free seat; the house rules
  if (seat && window.TableUI) { history.replaceState(null, "", location.pathname); window.TableUI.accept(seat[1], seat[2], seat[3]); }
  if (todoLink()) return true;
  var r = D.parseRoute(location.hash);
  if (r && r.type === "short") {
    goHome();
    window.ShortLink.resolve(r.id).then(function (f) { if (f) { shortId = r.id; location.hash = f; } else Kit.toast(t("sh_gone")); });
    return true;
  }
  if (r && r.type === "challenge") {
    var st = Object.assign({}, r.state), riv = typeof st.score === "number" ? { score: st.score, name: st.name || "" } : null;
    delete st.score; delete st.name; show("game"); G.play(st, riv, { own: true }); return true;
  }
  if ((r && r.type === "idea" && !D.available(D.byId(r.id))) || (r && r.type === "doc" && !D.docAvailable(r.doc))) { home = dayHome(); goHomeKeep(); Kit.toast(t("notHere")); return true; }
  if (r && r.type === "idea") { home = { date: today, idea: D.byId(r.id), note: t("invite"), noteOf: function () { return t("invite"); } }; goHomeKeep(); return true; }
  // A turn card that checks a signature first (feier: the signed end) reads its link only once that is done.
  var pre = r && r.type === "doc" && r.doc.k === "turn" && window.Turns.game(r.doc).prepare, wait = pre && pre(r.doc);
  if (wait && wait.then) { wait.then(route, route); return true; }
  if (r && r.type === "doc") {
    var lastBy = r.doc.by.length ? r.doc.by[r.doc.by.length - 1].n : r.doc.n;
    home = { date: today, doc: r.doc, note: t("remixOf", { n: lastBy || t("someone") }), noteOf: function () { return t("remixOf", { n: lastBy || t("someone") }); }, link: shortId || undefined }; shortId = null; goHomeKeep();
    if (r.doc.k === "card" && r.doc.nr && window.Door) window.Door.show(r.doc);   // an Advent door comes closed first
    return true;
  }
  return false;
}
// Fast Easy Protokoll hands its tasks over as #todo=: they become a task list (turns.js todo) on this device, ready to
// share. Nothing is sent anywhere by opening it; the hash is dropped from the address at once.
function todoLink() {
  var m = location.hash.match(/^#todo=([A-Za-z0-9_-]{1,6000})$/), Tn = window.Turns, got = null;
  if (!m) return false;
  history.replaceState(null, "", location.pathname + location.search);
  try { var b = m[1].replace(/-/g, "+").replace(/_/g, "/"); got = Tn.todoFrom(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(b + "===".slice(0, (4 - b.length % 4) % 4)), function (c) { return c.charCodeAt(0); })))); } catch (e) { got = null; }
  if (!got || !got.list) { goHome(); Kit.toast(t("filter")); return true; }
  var seed = crypto.getRandomValues(new Uint32Array(1))[0], X = Tn.T(Kit.lang);
  var doc = D.sanitizeDoc({ k: "turn", g: "todo", seed: seed, q: Tn.seal([[got.list]], seed), f: "bolt", col: me.colors, by: [], t: got.t || X.tdo_title, s: X.tdo_from });
  openEditor(doc, { idea: null });
  if (got.lost) Kit.toast(X.tdo_lost.replace("{n}", got.lost));
  return true;
}
function goHomeKeep() { if (!home) home = dayHome(); stopSound(); G.stop(); ed = null; window.Ai.drop(); setInk(me.colors[0], me.colors[1]); show("home"); setHome(home, true); }
window.addEventListener("hashchange", function () { var n = two(location.hash); if (n) window.Parts.use(n, route).catch(route); else route(); });
// The new turn cards bring their rules in a part (turnzwei, malen; scripts/build.js lists their games in its manifest): a
// sheet, link or saved work of one of them waits for that part, named by these; every other start loads only the catalog.
function twoGame(g) { var P = window.DailyParts || {}; for (var n in P) if (P[n].g && P[n].g.indexOf(g) >= 0 && !window.Turns.GAMES[g]) return n; return ""; }
function twoIdea(i) { return i && i.turn ? twoGame(i.turn.g) : ""; }
function two(hash) {
  var s = String(hash || "").replace(/^#/, ""), i = s.match(/(?:^|&)i=([^&]*)/), c = s.match(/(?:^|&)c=([A-Za-z0-9_-]{1,1200})(?:&|$)/), raw = null;
  if (i) return twoIdea(D.byId(i[1]));
  try { raw = c && JSON.parse(D.fromB64(c[1])); } catch (e) { raw = null; }
  return raw && raw.v === 1 ? (raw.d ? (raw.d.k === "turn" ? twoGame(raw.d.g) : "") : twoIdea(D.byId(raw.i))) : "";
}

/* Zusammen bauen (collab-ui.js) reaches the editor only through these. */
var CU = window.CollabUI.init({
  ed: function () { return ed; }, me: function () { return me; }, changed: changed,
  open: function (doc) { openEditor(doc, { idea: doc.i ? D.byId(doc.i) : null, got: true }); },
  // A remote change arrived: redraw, and rebuild the open panel unless someone is typing or dragging in it.
  remote: function (keys) {
    if (ed.doc.k === "sound" && ed.doc.m === "beat") { beatPeaks(); if (loop) playBeat(); }
    if (keys.indexOf("fx") >= 0) applyFx();
    var a = document.activeElement, p = $("panel");
    if (!(a && p.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName))) { var top = p.scrollTop; tab(ed.tab); p.scrollTop = top; }
    trailLine(); changed();
  },
  more: function () { try { window.DuellHost.more(); } catch (e) {} }
});

var CC = window.CallCardUI.init({ me: function () { return me; }, shelf: shelf, colors: colors, ink: R.ink, more: function () { try { window.DuellHost.more(); } catch (e) {} } }, CU.channel);

var X = window.DailyModes = {};
window.DailyApp = { part: twoIdea, style: { save: saveMe, ink: setInk, EMOJI: EMOJI, PAIRS: PAIRS, seeded: seeded, roll: roll, konto: konto, fit: function () { if (screen === "home") fitHero(); }, open: openStyle }, reportKey: reportKey, aiBlock: aiBlock, footer: function () { if (ed) footer(); }, unpic: function () { loadPic(document.querySelector("#leaf .pv"), document.querySelector("#leaf .pvimg"), null); }, prefUse: prefUse, savePref: function (f) { me.pref = D.sanitizePref(f); if (!Object.keys(me.pref).length) delete me.pref; saveMe(); }, prefContext: function (keys) { return D.prefContext(me, Kit.lang, keys); }, TABS: TABS, PANEL: PANEL, SK: SK, setDoc: setDoc, paint: paint, el: el, field: field, chips: chips, colors: colors, changed: changed, tab: tab, finish: finish, areas: areas, me: function () { return me; }, ed: function () { return ed; }, openEditor: openEditor, quick: quick, home: function () { return home; }, sheet: function (h) { home = h; goHomeKeep(); }, shelf: shelf, show: show, goHome: goHome, cv: cv, game: G, setGame: function (st, rival) { G.stop(); show("game", true); G.play(st, rival, { own: true }); } };

window.DailyApp.allow = allow;

/* test hook, used by browser checks: read-only snapshot */
window.DailyDebug = { me: function () { return me; }, doc: function () { return ed && ed.doc; }, wall: function () { return wall; }, result: function () { return result; }, home: function () { return home; }, areas: function () { return ed ? areas() : []; }, tab: function (k) { tab(k); }, collab: function () { return CU.engine(); } };

window.addEventListener("DOMContentLoaded", function () {
// plain language switched on: its words come with the part direkt
labels(); if (store.ez) window.Parts.need("direkt").catch(function () {});
// The first sheet waits for the catalog part (src/parts.js asks for it at once; in the apps it is a file next to the page).
// Without it the day still shows from the core's index, as a plain card, and the page says the part is missing.
function boot() { if (!route()) goHome(); }
// The rules of the new turn cards (their part) only when the link or the day's card is one of them (two()).
window.Parts.need("katalog").then(function () { var n = two(location.hash) || twoIdea(D.ideaForDay(today)); return n ? window.Parts.need(n).catch(function () {}) : 0; }).then(boot, function () { Kit.toast(t("part_fail")); boot(); });
// The embedded display font loads after the first paint: fit the headline again once it is there, and draw the sheet's
// card and the editor's picture again. A canvas keeps the letters it was drawn with: on a slow phone the sheet drawn before
// the font was there kept the fallback font for good. Only the pictures are drawn again, the same card as fillSheet
// (sheetDoc); the sheet itself (texts, classes, the hearts of a received feel-good card) stays as it is.
if (document.fonts && document.fonts.load) document.fonts.load('900 40px Anton').then(function () {
  if (screen === "home") fitHero();
  var c = $("leaf").querySelector(".pvcard"), d = home && !c.hidden ? sheetDoc(home) : null;
  if (d && d.k !== "game" && d.k !== "arcade") preview($("leaf"), d, false);   // a drawn card only: no game, no arcade duel
  if (home) WM.redraw(home);   // the own feel-good card: again with the name typed so far
  if (ed) changed();
}, function () {});
});
})();
