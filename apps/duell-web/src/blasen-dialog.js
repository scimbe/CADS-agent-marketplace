/* The sheet of a bubble as an overlay dialog (bubble plan, step 5): a tap on a bubble grows it into a floating sheet next
   to it (FLIP: from the bubble's circle to a rounded card, about a quarter second, a little spring), the card stays
   visible behind a light scrim and changes live. The sheet's content is the editor's own #panel (A.PANEL[k], nothing
   twice): it moves into the dialog and back. ✕, a tap on the scrim, Escape and the back gesture shrink it back into its
   bubble. "Alle Einstellungen" (the first Tab stop after the header, shown on focus) opens the same dialog with the list
   of all sheets (the tab bar, #tabs, moved in). role=dialog aria-modal, focus stays inside, and goes back to where it
   came from. prefers-reduced-motion: a fade only. In the part blasen after src/blasen-ebene.js. */
(function (root) {
"use strict";
var A = root.DailyApp, Kit = root.Kit, B = root.Blasen;
var $ = function (id) { return document.getElementById(id); };
var WORDS = { de: { all: "Alle Einstellungen", close: "Schließen" }, en: { all: "All settings", close: "Close" } };
function w(k) { return (WORDS[Kit.lang] || WORDS.de)[k]; }
var CSS = "#bscrim{position:fixed;left:0;top:0;right:0;background:rgba(23,20,15,.18);z-index:40}" +
  "#bdlg{position:fixed;z-index:41;box-sizing:border-box;display:flex;flex-direction:column;background:#FBF5DD;color:#17140F;border:3px solid #17140F;border-radius:20px;box-shadow:6px 6px 0 #17140F;overflow:hidden;transform-origin:50% 50%}" +
  "#bdlg .bdhead{flex:none;display:flex;align-items:center;gap:6px;padding:6px 6px 0 14px}#bdlg .bdhead h2{flex:1;margin:0;font:400 22px/1.1 var(--disp,Anton,sans-serif);text-transform:uppercase}" +
  "#bdlg .bdx{min-width:44px;height:44px;border:0;background:transparent;font:900 20px var(--ui,system-ui);color:#17140F;border-radius:50%}" +
  "#bdlg .bdbody{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}" +
  "#bdlg #panel{flex:1 1 auto;min-height:0;height:auto!important;background:transparent;overflow-y:auto}#bdlg #tabs{flex:none;border-radius:12px;margin:6px 10px 0}" +
  "#bdlg .bdtip{position:absolute;width:16px;height:16px;background:#FBF5DD;border:3px solid #17140F;transform:rotate(45deg);pointer-events:none}" +
  "#ballset{position:absolute;left:8px;top:8px;z-index:7;min-height:44px;padding:0 14px;border:2px solid #17140F;border-radius:999px;background:#FBF5DD;color:#17140F;font:700 14px var(--ui,system-ui)}" +
  "#ballset:not(:focus){clip-path:inset(50%);width:1px;height:1px;min-height:0;padding:0;border:0;overflow:hidden}" +
  "#editor.bl #tabs,#editor.bl>#panel{display:none}#editor.bl #stagewrap{flex:1 1 auto}" +
  // the freed height goes to the card: as big as fits between header and footer (aspect kept), undo and redo in a row
  // above it instead of a column beside it
  "#editor.bl.dk #stagewrap{padding:10px}#editor.bl.dk #stagewrap:has(#dkbar button:not([hidden])){padding-top:58px}#editor.bl #dkbar{flex-direction:row;bottom:auto}";
var st = { open: false, from: null, mode: "", pushed: false, skipPop: false, home: null, anim: null };
function calm() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
function css() { if ($("bdlgcss")) return; var s = document.createElement("style"); s.id = "bdlgcss"; s.textContent = CSS; document.head.appendChild(s); }
function rect(e) { var r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
function title(k) { var t = $("tab" + k); return t ? t.textContent : k; }

// where the sheet goes: beside the bubble, on the side with more room, never over the footer (FERTIG / WEITER stays)
function placeFor(from) {
  var vw = innerWidth, foot = document.querySelector("#editor>.foot"), bottom = foot && foot.offsetParent ? rect(foot).y - 8 : innerHeight - 8, top = 8, foot0 = bottom;
  var head = document.querySelector("#editor>.bar"); if (head) top = Math.max(top, rect(head).y + rect(head).h + 4);
  var b = from ? rect(from) : { x: vw / 2 - 20, y: (top + bottom) / 2 - 20, w: 40, h: 40 }, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  // the side away from the part the bubble changes, when that side has room for a sheet; else the side with more room
  var W = Math.min(380, vw - 24), above = b.y - 12 - top, below = bottom - (b.y + b.h + 12), ty = from && from.dataset.ty ? +from.dataset.ty : NaN;
  var up = !isNaN(ty) && Math.min(above, below) >= 220 ? ty > cy : above > below;
  var H = Math.min(up ? above : below, 520), side = vw >= 900;   // a wide screen: always beside the bubble, the card stays in sight
  var x = Math.max(12, Math.min(vw - W - 12, cx - W / 2)), y = up ? b.y - 12 - H : b.y + b.h + 12;
  if (side) {   // a wide screen with little room above and below: beside the bubble
    // right of the bubble, else left; a side where the footer is not below it may reach down to the window's bottom
    var fr = foot && foot.offsetParent ? rect(foot) : null, xr = cx + b.w / 2 + 12, xl = b.x - 12 - W;
    var free = function (x) { return !fr || x + W < fr.x || x > fr.x + fr.w; }, fitsR = xr + W < vw - 12, fitsL = xl >= 12;
    x = fitsR && (free(xr) || !fitsL || !free(xl) || cy < bottom) ? xr : fitsL ? xl : Math.max(12, Math.min(vw - W - 12, xr));
    if (free(x)) bottom = innerHeight - 8;
    H = Math.min(bottom - top, 520); y = Math.max(top, Math.min(bottom - H, cy - H / 2));
  }
  // the part itself stays in sight where the sheet can step past it (a title under its bubble: the sheet starts below it)
  var pt = from && +from.dataset.pt, pb = from && +from.dataset.pb;
  if (!side && pt && pb) {
    // only a short step (a title right under its bubble), never far from the bubble
    if (!up && pb > y && pb + 12 - y <= 180 && bottom - (pb + 12) >= 220) { y = pb + 12; H = Math.min(bottom - y, 520); }
    else if (up && pt < y + H && y + H - (pt - 12) <= 180 && pt - 12 - top >= 220) { H = Math.min(pt - 12 - top, 520); y = pt - 12 - H; }
  }
  if (H < 220) { H = bottom - top; y = top; }   // too little room on either side: the whole height, the bubble covered
  return { x: x, y: y, w: W, h: H, cx: cx, cy: cy, up: up, side: side, bottom: bottom, foot: foot0 };
}

function build(mode) {
  css();
  var scrim = $("bscrim"), d = $("bdlg");
  if (!d) {
    scrim = document.createElement("div"); scrim.id = "bscrim"; scrim.addEventListener("click", function () { close(); });
    d = document.createElement("div"); d.id = "bdlg"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "bdlgt");
    var head = document.createElement("div"), h = document.createElement("h2"), x = document.createElement("button"), body = document.createElement("div"), tip = document.createElement("i");
    head.className = "bdhead"; h.id = "bdlgt"; x.type = "button"; x.className = "bdx"; x.textContent = "✕"; x.addEventListener("click", function () { Kit.sfx.tap(); close(); });
    body.className = "bdbody"; tip.className = "bdtip"; tip.setAttribute("aria-hidden", "true");
    head.appendChild(h); head.appendChild(x); d.appendChild(head); d.appendChild(body); d.appendChild(tip);
    document.body.appendChild(scrim); document.body.appendChild(d);
  }
  d.querySelector(".bdx").setAttribute("aria-label", w("close"));
  var body = d.querySelector(".bdbody"), tabs = $("tabs"), panel = $("panel");
  if (!st.home) st.home = { tabs: [tabs.parentNode, tabs.nextSibling], panel: [panel.parentNode, panel.nextSibling] };
  if (mode === "all") body.appendChild(tabs); else if (tabs.parentNode === body) back(tabs, "tabs");
  body.appendChild(panel);
  return { scrim: scrim, d: d };
}
function back(e, k) { var h = st.home && st.home[k]; if (h && h[0]) h[0].insertBefore(e, h[1] && h[1].parentNode === h[0] ? h[1] : null); }

// open(tab, from, mode): mode "part" (one sheet, from its bubble) or "all" (the tab bar on top, from "Alle Einstellungen")
function open(k, from, mode) {
  if (st.open) close(true);
  var el = build(mode), d = el.d, p = placeFor(from);
  st.open = true; st.from = from || null; st.mode = mode || "part";
  if (k) B.tab(k);
  d.querySelector("h2").textContent = mode === "all" ? w("all") : k ? title(k) : w("all");
  el.scrim.style.bottom = (innerHeight - p.foot - 8) + "px"; el.scrim.hidden = false; d.hidden = false;   // the footer (FERTIG / WEITER) stays clear
  d.style.left = p.x + "px"; d.style.top = p.y + "px"; d.style.width = p.w + "px"; d.style.height = p.h + "px";
  var tip = d.querySelector(".bdtip");   // the small pointer towards the bubble
  tip.hidden = !from || p.h >= p.bottom - 20;
  if (!p.side) { tip.style.left = Math.max(14, Math.min(p.w - 30, p.cx - p.x - 8)) + "px"; tip.style.top = p.up ? (p.h - 13) + "px" : "-13px"; }
  else { tip.style.top = Math.max(14, Math.min(p.h - 30, p.cy - p.y - 8)) + "px"; tip.style.left = p.cx < p.x ? "-13px" : (p.w - 13) + "px"; }
  morph(d, from, true);
  if (!st.pushed) { try { history.pushState({ bdlg: 1 }, "", location.href); st.pushed = true; } catch (e) {} }
  var first = d.querySelector("#panel input,#panel textarea,#panel button,#panel [tabindex='0'],#tabs [aria-selected=true]") || d.querySelector(".bdx");
  setTimeout(function () { if (st.open && first && first.isConnected) first.focus({ preventScroll: true }); }, calm() ? 0 : 200);
  if (B.ebene) B.ebene.tick();
}
// The morph: from the bubble's box (a circle) to the sheet, or back; without the bubble or with reduced motion a fade.
function morph(d, from, grow, done) {
  if (st.anim) { try { st.anim.cancel(); } catch (e) {} st.anim = null; }
  var body = d.querySelector(".bdbody"), b = from && from.isConnected && rect(from), s = rect(d), a;
  if (!d.animate) { if (done) done(); return; }
  if (calm() || !b || !b.w) a = d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, direction: grow ? "normal" : "reverse", fill: "both" });
  else {
    var dx = b.x + b.w / 2 - (s.x + s.w / 2), dy = b.y + b.h / 2 - (s.y + s.h / 2), from0 = { transform: "translate(" + dx + "px," + dy + "px) scale(" + b.w / s.w + "," + b.h / s.h + ")", borderRadius: "50%", opacity: 0.9 };
    // the sheet is drawn before it moves: its content grows with it out of the bubble (never an empty card); on the way back
    // the content fades a little ahead, so the bubble it shrinks into is a bubble again
    a = d.animate([from0, { transform: "none", borderRadius: "20px", opacity: 1 }], { duration: grow ? 260 : 200, easing: grow ? "cubic-bezier(.2,1.25,.4,1)" : "cubic-bezier(.5,0,.75,0)", direction: grow ? "normal" : "reverse", fill: "both" });
    if (grow) body.animate([{ opacity: 0.35 }, { opacity: 1, offset: 0.45 }, { opacity: 1 }], { duration: 260, fill: "both" });
    else body.animate([{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: 200, fill: "both" });
  }
  st.anim = a;
  a.onfinish = function () { st.anim = null; if (grow) { try { a.cancel(); } catch (e) {} } if (done) done(); };
}
// close(instant): shrink back into the bubble (or vanish at once), the panel and the tab bar go home, focus goes back
function close(instant, fromPop) {
  if (!st.open) return;
  st.open = false;
  var d = $("bdlg"), scrim = $("bscrim"), from = st.from;
  function end() {
    if (st.open) return;   // opened again meanwhile
    if (d.getAnimations) d.getAnimations({ subtree: true }).forEach(function (a) { try { a.cancel(); } catch (e) {} });
    d.hidden = true; scrim.hidden = true;
    back($("panel"), "panel"); back($("tabs"), "tabs");   // the panel first: the tab bar goes back in front of it
    if (B.ebene) B.ebene.tick();
  }
  if (instant) end(); else morph(d, from, false, end);
  if (st.pushed && !fromPop) { st.pushed = false; st.skipPop = true; try { history.back(); } catch (e) { st.skipPop = false; } }   // ✕, scrim, Escape: its history entry goes too
  if (fromPop) st.pushed = false;
  if (from && from.isConnected && !instant) from.focus({ preventScroll: true });
}
// the back gesture closes the dialog and nothing else: the core's popstate asks here first (app.js); true = handled
B.back = function () {
  if (st.skipPop) { st.skipPop = false; return true; }   // the entry the dialog took itself away
  st.pushed = false; if (!st.open) return false; close(false, true); return true;
};
// Escape closes (wherever the focus is: before the core's Escape, which would leave the editor); Tab stays inside
document.addEventListener("keydown", function (e) {
  if (!st.open) return;
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (e.key !== "Tab") return;
  var f = Array.prototype.filter.call($("bdlg").querySelectorAll("button,input,textarea,select,a[href],[tabindex]:not([tabindex='-1'])"), function (x) { return !x.disabled && x.offsetParent; });
  if (!f.length) return;
  var i = f.indexOf(document.activeElement);
  if (i < 0) { e.preventDefault(); f[0].focus(); }
  else if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
}, true);
// the list's tabs change the sheet in place; the dialog's title follows
document.addEventListener("click", function (e) { var t = st.open && e.target.closest && e.target.closest("#bdlg #tabs [role=tab]"); if (t) $("bdlgt").textContent = w("all"); }, true);

// "Alle Einstellungen": the first Tab stop after the header, seen only when it has the focus
function allButton(on) {
  css();
  var b = $("ballset"), wrap = $("stagewrap");
  if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "ballset"; b.addEventListener("click", function () { Kit.sfx.tap(); open(A.ed() && A.ed().tab, b, "all"); }); }
  b.textContent = "⚙ " + w("all"); b.hidden = !on;
  if (wrap.firstChild !== b) wrap.insertBefore(b, wrap.firstChild);
}
B.dialog = { open: open, close: close, isOpen: function () { return st.open; }, from: function () { return st.open ? st.from : null; }, all: allButton, mode: function () { return st.open ? st.mode : ""; } };
})(window);
