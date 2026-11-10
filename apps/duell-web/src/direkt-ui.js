/* Part direkt (editor concept, wave E1) on top of the core editor (app.js, through window.DailyApp): one undo and redo
   over the whole sheet (buttons by the preview, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y), stickers without dragging (Move,
   then tap the spot; arrow buttons; keys), a list of what is on the card, a description of the preview for screen
   readers, colour names instead of codes, a pause switch for the game preview, and the plain-language switch.
   Without this part (offline without a cache, a refused file) the core's tabs work exactly as before. */
(function (root) {
  "use strict";
  var A = root.DailyApp, M = root.EditModel, Kit = root.Kit, D = root.Daily, C = root.DuellCore, T = root.DailyTexts, EZ = root.DirektData.einfach;
  var t = Kit.t, el = A.el, $ = function (id) { return document.getElementById(id); };
  var UNDO = ["card", "photo", "sound", "game", "duel", "quest"];   // a turn's move is the game itself: no undo across it
  var STEP = 0.05, want = null, placing = false, ptr = null, gestures = 0, fields = new WeakMap(), nf = 0, orig = {};

  var css = document.createElement("style");
  css.textContent = "#editor.dk #stagewrap{padding-left:56px;padding-right:56px}#editor.dk .skundo{display:none!important}" +
    "#editor.dk #stagewrap{min-height:56px}#dkbar{pointer-events:none;position:absolute;left:6px;top:6px;bottom:6px;display:flex;flex-direction:column;flex-wrap:wrap;align-content:flex-start;gap:6px 8px;z-index:3}" +
    "#dkbar button{pointer-events:auto}#dkbar button,.dkhold{width:44px;height:44px;padding:0;border:3px solid var(--ink);border-radius:50%;background:#fff;color:#111;font:900 21px/1 var(--ui)}" +
    "#dkbar button[aria-disabled=true]{opacity:.4;cursor:default}.dkhold{position:absolute;right:6px;top:6px;z-index:2;font-size:17px}" +
    ".dkl{margin:8px 0;border:2px solid var(--ink);border-radius:6px;background:#fff;color:#111}.dkl:focus-visible{outline:3px solid var(--ink);outline-offset:2px}" +
    ".dkl [role=option]{min-height:44px;padding:10px 12px;border-top:1px solid #d8d2c2;font-weight:700;cursor:pointer}.dkl [role=option]:first-child{border-top:0}" +
    ".dkl [aria-selected=true]{background:#111;color:#fff;outline:3px solid #111;outline-offset:-3px}" +
    ".dkpad .chip{min-width:48px}#stagewrap.dkplace #stage{cursor:crosshair;outline:4px dashed var(--ink);outline-offset:3px}" +
    ".dkvh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    "#editor.dk #stagewrap.pic{flex-direction:row}#editor.dk #stagewrap.pic #stage{flex:0 1 auto;height:auto}#editor.dk #stagewrap.pic .pvimg{position:absolute;right:4px;top:6px;z-index:3;width:48px;height:48px;max-width:none;aspect-ratio:auto;border-width:2px;box-shadow:2px 3px 0 var(--ink)}#editor.dk #stagewrap.pic .pvimg .kitag{right:1px;bottom:1px;padding:1px 2px;font-size:10px;letter-spacing:0;white-space:nowrap}#editor.dk #stagewrap.pic.swap .pvimg{left:12px;right:12px;top:4px;bottom:4px;width:auto;height:auto;margin:auto;aspect-ratio:16/9;max-height:calc(100% - 8px)}#editor.dk #stagewrap.pic.swap #stage{visibility:hidden}#stagewrap{transition:flex-basis .18s ease-out}#editor[data-platz=ruhe] #stagewrap{flex-basis:60%}#editor[data-platz=ruhe] #panel{box-shadow:inset 0 -16px 12px -12px rgba(0,0,0,.3)}#editor[data-platz=sticker] #stagewrap,#editor[data-platz=look] #stagewrap{flex-basis:50%}#editor[data-platz=foto] #stagewrap{flex-basis:48%}#editor[data-platz=text] #stagewrap,#editor[data-platz=regler] #stagewrap{flex-basis:max(calc(40% + 14px),236px)}@media (prefers-reduced-motion:reduce){#stagewrap{transition:none}}@media (max-height:640px){#editor .foot{padding:4px 0 2px}#editor .foot .press{min-height:52px;font-size:25px;margin-bottom:4px}#editor .why{margin-bottom:3px;font-size:14px}}@media (orientation:landscape) and (max-height:500px) and (min-width:480px) and (max-width:559px){#editor[data-platz]{left:0;right:0;width:auto;margin:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1.3fr);grid-template-rows:auto auto auto auto 1fr auto;column-gap:6px}#editor[data-platz]>*{grid-column:2;min-width:0}#editor[data-platz]>.bar{grid-row:1}#editor[data-platz]>#cobar{grid-row:2}#editor[data-platz]>#trail{grid-row:3}#editor[data-platz]>#tabs{grid-row:4}#editor[data-platz]>.foot{grid-row:6}#editor[data-platz]>#panel{grid-row:5;height:auto;min-height:0}#editor[data-platz]>#stagewrap{grid-column:1;grid-row:1/-1;padding:8px 6px 8px 56px}#editor.dk #stagewrap.pic .pvimg{left:6px;right:auto;top:auto;bottom:8px}}" +
    "@media (max-width:420px){#tabs button{padding:0 6px;font-size:13px}}@media (max-width:360px){#tabs button{padding:0 4px;font-size:12.5px}}" +
    "@media (forced-colors:active){#dkbar button,.dkhold,.dkl{border-color:CanvasText}.dkl [aria-selected=true]{outline-color:Highlight}}";
  document.head.appendChild(css);

  // ---------- the chrome this part adds once ----------
  var bar = el("div"), undoB = el("button", "", "↶", function () { go(-1); }), redoB = el("button", "", "↷", function () { go(1); });
  bar.id = "dkbar"; bar.appendChild(undoB); bar.appendChild(redoB); $("stagewrap").appendChild(bar);
  undoB.setAttribute("aria-keyshortcuts", "Control+Z Meta+Z"); redoB.setAttribute("aria-keyshortcuts", "Control+Shift+Z Meta+Shift+Z Control+Y");
  var desc = el("div"), say = el("div", "dkvh"); desc.id = "dkdesc"; desc.hidden = true; say.setAttribute("role", "status");
  $("editor").appendChild(desc); $("editor").appendChild(say);
  [A.cv, $("demo")].forEach(function (c) { c.setAttribute("role", "img"); c.setAttribute("aria-describedby", "dkdesc"); });
  var hold = el("button", "dkhold", "", function () { A.game.hold(!A.game.hold()); holdState(); });
  $("gamestage").appendChild(hold);
  function holdState() { var h = !!(A.game.hold && A.game.hold()); hold.hidden = !A.game.hold; hold.textContent = h ? "▶" : "⏸"; hold.setAttribute("aria-pressed", String(h)); }
  function labels() { undoB.setAttribute("aria-label", t("dk_undo")); redoB.setAttribute("aria-label", t("dk_redo")); hold.setAttribute("aria-label", t("dk_hold")); }
  function tell(s) { say.textContent = ""; setTimeout(function () { say.textContent = s; }, 40); }

  // ---------- one history over the whole sheet ----------
  // The doc is the history: what lives outside it stays as it is on undo and redo (an own photo or the bot face, a
  // recorded voice, the panel's page, a running match), and none of it is kept by the history.
  function active(ed) { return !!ed && UNDO.indexOf(ed.doc.k) >= 0 && !$("tabs").hidden && $("cobar").hidden; }   // not while a match runs or someone builds along
  // Which steps join: one finger on the preview, or one text field or slider while it is used.
  function key() {
    if (ptr) return ptr;
    var a = document.activeElement;
    if (!a || !$("panel").contains(a) || !/^(INPUT|TEXTAREA)$/.test(a.tagName)) return null;
    if (!fields.has(a)) fields.set(a, "f" + ++nf);
    return fields.get(a);
  }
  window.addEventListener("pointerdown", function () { ptr = null; }, true);   // a touch elsewhere ends the gesture at once
  $("stagewrap").addEventListener("pointerdown", function () { ptr = "p" + ++gestures; }, true);
  ["pointerup", "pointercancel"].forEach(function (n) { window.addEventListener(n, function () { var mine = ptr; setTimeout(function () { if (ptr === mine) ptr = null; }, 40); }, true); });
  function go(dir) {
    var ed = A.ed(); if (!active(ed) || !ed.dk) return;
    A.paint();   // a change still waiting for its redraw (16 ms) becomes its step first, so a quick undo never skips it
    var s = dir < 0 ? M.undo(ed.dk) : M.redo(ed.dk); if (s == null) return;
    var p = $("panel"), top = p.scrollTop, sel = ed.sel, all = function () { return Array.from(p.querySelectorAll("button,input,textarea,select,[tabindex]")); }, at = all().indexOf(document.activeElement);
    Kit.sfx.tap(); A.setDoc(JSON.parse(s));
    if (ed.doc.sk && ed.doc.sk[sel]) ed.sel = sel;   // the same sticker stays chosen while it is there
    A.tab(ed.tab); p.scrollTop = top; buttons(ed, true); tell(t(dir < 0 ? "dk_undone" : "dk_redone"));
    var f = all()[at]; if (at >= 0 && f && !f.disabled) f.focus({ preventScroll: true });   // a keyboard user stays where they were
  }
  document.addEventListener("keydown", function (e) {
    if ($("editor").hidden || document.querySelector("dialog[open]")) return;
    if (e.key === "Escape" && placing) { place(false); e.preventDefault(); return; }   // before the core's Escape (it waits for defaultPrevented)
    var k = String(e.key).toLowerCase(), a = document.activeElement;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || (k !== "z" && k !== "y")) return;
    if (a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.type !== "range"))) return;   // a text field keeps its own undo
    e.preventDefault(); go(k === "y" || e.shiftKey ? 1 : -1);
  }, true);

  // A change is a step at once (not 16 ms later with the redraw): the buttons are right right away, and two key presses
  // inside one redraw are two steps. After the event's own handlers (bubbling on the editor).
  function sync() {
    var ed = A.ed(); if (!active(ed) || !ed.dk) return;
    M.record(ed.dk, JSON.stringify(ed.doc), Date.now(), key()); buttons(ed, true);
  }
  ["input", "change", "click", "keydown", "pointerup"].forEach(function (n) { $("editor").addEventListener(n, sync); });
  function buttons(ed, on) { undoB.setAttribute("aria-disabled", String(!on || !M.canUndo(ed.dk))); redoB.setAttribute("aria-disabled", String(!on || !M.canRedo(ed.dk))); }
  // ---------- after every redraw of the editor (app.js paint) ----------
  function paint(ed) {
    if (!ed) return;
    if (roomOf !== ed) { roomOf = ed; $("editor").removeAttribute("data-platz"); platz("ruhe"); }   // a new sheet opens in ruhe, without an announcement
    $("editor").classList.add("dk"); labels();
    var snap = JSON.stringify(ed.doc), on = active(ed);
    if (!ed.dk || !on) ed.dk = M.history(snap); else M.record(ed.dk, snap, Date.now(), key());
    bar.hidden = UNDO.indexOf(ed.doc.k) < 0; buttons(ed, on);
    var d = M.describe(ed.doc, t); if (desc.textContent !== d) desc.textContent = d;
    if (placing && (ed.tab !== "Sticker" || !ed.doc.sk || !ed.doc.sk[ed.sel])) place(false);
    if (ed.tab === "Color") names($("panel"));
    if ($("stagewrap").classList.contains("pic") && !pic.classList.contains("thumb")) A.picThumb(pic);   // the thumbnail look comes with this part
    holdState();
  }

  // ---------- colours by name ----------
  function cn(hex) { return t("dk_c_" + M.colorName(hex)); }
  function names(p) {
    Array.from(p.querySelectorAll(".sw")).forEach(function (b) {
      var i = b.querySelector("i"); if (!i) return;
      b.setAttribute("aria-label", t("dk_cols", { a: cn(M.hexOf(i.style.backgroundColor)), b: cn(M.hexOf(b.style.backgroundColor)) }));
      b.setAttribute("aria-pressed", String(b.classList.contains("on")));
    });
    Array.from(p.querySelectorAll("input[type=color]")).forEach(function (x, n) { x.setAttribute("aria-label", t("dk_custom", { n: n + 1, c: cn(x.value) })); });
  }
  // the colour tab of the part blasen (src/blasen.js), which may come before or after this part (blasen keeps this one)
  A.PANEL.Color = function (p) { window.Blasen.PANEL.Color(p); names(p); };

  // ---------- stickers without dragging ----------
  function sticker(s) { return t("dk_sk", { e: s.e, at: t("dk_at" + M.where(s.x, s.y)) }); }
  function rerender() { var p = $("panel"), top = p.scrollTop; A.tab("Sticker"); p.scrollTop = top; }
  function place(on) {
    placing = on; $("stagewrap").classList.toggle("dkplace", on); tell(t(on ? "dk_moveOn" : "dk_moveOff"));
    var ed = A.ed(); if (ed && ed.tab === "Sticker") { want = want || "move"; rerender(); }
  }
  // Move, then a tap on the card: the chosen sticker goes there. Before stickers.js sees the tap (capture on the wrapper).
  $("stagewrap").addEventListener("pointerdown", function (e) {
    var ed = A.ed(); if (placing && ed && ed.tab !== "Sticker") place(false);
    if (!placing || !ed || !ed.doc.sk || !ed.doc.sk[ed.sel]) return;
    var r = A.cv.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    e.stopPropagation(); e.preventDefault();
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, i = ed.sel;
    placing = false; $("stagewrap").classList.remove("dkplace"); want = "move";
    A.SK.step(function (l) { l[i] = M.nudge(l[i], { dx: x - l[i].x, dy: y - l[i].y }); });
    tell(sticker(ed.doc.sk[i]));
  }, true);
  function step(o, k) {
    var ed = A.ed(), i = ed.sel; if (!ed.doc.sk[i]) { tell(t("dk_pick")); return; }
    want = k; Kit.sfx.tap(); A.SK.step(function (l) { l[i] = M.nudge(l[i], o); });
    tell(sticker(ed.doc.sk[i]));
  }
  function drop(k) { var ed = A.ed(); if (!ed.doc.sk[ed.sel]) return; want = k; Kit.sfx.tap(); A.SK.remove(ed.sel); }
  function btn(box, k, text, label, fn) {
    var b = el("button", "chip em", text, fn); b.dataset.dk = k; if (label) b.setAttribute("aria-label", label); box.appendChild(b); return b;
  }
  $("tabs").addEventListener("click", function () { var ed = A.ed(); if (placing && ed && ed.tab !== "Sticker") place(false); });   // another tab ends Move
  A.PANEL.Sticker = function (p) {
    var ed = A.ed(), d = ed.doc, me = A.me(), own = D.byId(d.i), set = D.SETS[(own && own.set) || me.set].concat([me.emoji]);
    var box = el("div", "chips");
    set.forEach(function (e, n) {
      btn(box, "add" + n, e, null, function () {
        if (d.sk.length >= D.MAX_STICKERS) { Kit.toast(t("skFull")); return; }
        Kit.sfx.pop(); var r = C.mulberry32(C.hash32(me.nick + d.sk.length + e + d.x)); want = "add" + n;   // where it lands: from a seed, like the core
        A.SK.step(function (l) { l.push({ e: e, x: 0.15 + r() * 0.7, y: 0.15 + r() * 0.65, r: (r() - 0.5) * 0.7, z: 0.8 + r() * 0.7 }); ed.sel = l.length - 1; });
        tell(sticker(d.sk[d.sk.length - 1]));
      });
    });
    p.appendChild(box);
    // What is on the card, one row each: the screen reader's way to the stickers, and a second way to pick one by eye.
    var L = M.layers(d, t), act = L.findIndex(function (x) { return x.k === "sk" && x.i === ed.sel; });
    if (act < 0) act = L[ed.dkRow] && L[ed.dkRow].k !== "sk" ? ed.dkRow : 0;
    var lb = el("div", "dkl"), help = el("p", "dkvh", t("dk_layersH"));
    help.id = "dklh"; lb.setAttribute("role", "listbox"); lb.tabIndex = 0; lb.dataset.dk = "list";
    lb.setAttribute("aria-label", t("dk_layers")); lb.setAttribute("aria-describedby", "dklh"); lb.setAttribute("aria-activedescendant", "dko" + act);
    function choose(j) {
      var x = L[j]; if (!x) return; ed.dkRow = j; want = "list";
      if (x.k === "sk") A.SK.select(x.i); else { ed.sel = -1; A.SK.sync(); rerender(); }
    }
    function open(x) { if (x.k === "text") A.tab("Text"); if (x.k === "bg") A.tab("Color"); }
    L.forEach(function (x, j) {
      var o = el("div", "", x.l); o.id = "dko" + j; o.setAttribute("role", "option"); o.setAttribute("aria-selected", String(j === act));
      o.addEventListener("click", function () { if (x.k === "sk") choose(j); else open(x); });
      lb.appendChild(o);
    });
    lb.addEventListener("keydown", function (e) {
      var n = L.length, j = { ArrowDown: act + 1, ArrowUp: act - 1, Home: 0, End: n - 1 }[e.key];
      if (j != null) { e.preventDefault(); choose(Math.max(0, Math.min(n - 1, j))); return; }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(L[act]); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && L[act].k === "sk") { e.preventDefault(); drop("list"); }
    });
    p.appendChild(help); p.appendChild(lb);
    if (d.sk.length) {
      p.appendChild(el("p", "note", t("dk_skHint")));
      var s = d.sk[ed.sel], mrow = el("div", "chips dkpad"), pad = el("div", "chips dkpad"), size = el("div", "chips dkpad");
      [[mrow, "dk_moveT"], [pad, "dk_arrowsT"], [size, "dk_sizeT"]].forEach(function (g) { g[0].setAttribute("role", "group"); g[0].setAttribute("aria-label", t(g[1])); });
      var mv = btn(mrow, "move", "✥ " + t("dk_move"), null, function () { want = "move"; place(!placing); });
      mv.setAttribute("aria-pressed", String(placing));
      [["left", "←", { dx: -STEP }], ["up", "↑", { dy: -STEP }], ["down", "↓", { dy: STEP }], ["right", "→", { dx: STEP }]].forEach(function (x) {
        btn(pad, x[0], x[1], t("dk_" + x[0]), function () { step(x[2], x[0]); });
      });
      [["small", "−", { dz: -0.2 }, "a_skSmall"], ["big", "+", { dz: 0.2 }, "a_skBig"], ["turn", "↻", { dr: 0.25 }, "a_skTurn"]].forEach(function (x) {
        btn(size, x[0], x[1], t(x[3]), function () { step(x[2], x[0]); });
      });
      btn(size, "del", "✕", t("skDelete"), function () { drop("del"); });
      // Keys on the tools: arrows 2 % (Shift 10 %), + and - size, R turns, Delete removes.
      [mrow, pad, size].forEach(function (g) {
        g.addEventListener("keydown", function (e) {
          if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser zoom and reload stay the browser's
          var o = M.keyStep(e.key, e.shiftKey), b = e.target.dataset && e.target.dataset.dk;
          if (o) { e.preventDefault(); step(o, b); } else if (e.key === "Delete") { e.preventDefault(); drop(b); }
        });
        Array.from(g.children).forEach(function (b) { b.disabled = !s; });
      });
      if (!s) p.appendChild(el("p", "note", t("dk_pick")));
      p.appendChild(mrow); p.appendChild(pad); p.appendChild(size);
    }
    if (want) { var f = p.querySelector('[data-dk="' + want + '"]'); want = null; if (f && !f.disabled) f.focus({ preventScroll: true }); else lb.focus({ preventScroll: true }); }
  };

  // ---------- plain language (Mein Stil): shorter words and hints, only on this device ----------
  function ezApply() {
    var on = !!Kit.store.ez;
    Object.keys(EZ).forEach(function (l) {
      var b = T[l]; if (!b) return; var o = orig[l] = orig[l] || {};
      Object.keys(EZ[l]).forEach(function (k) {
        if (on) { if (!Object.prototype.hasOwnProperty.call(o, k)) o[k] = b[k]; b[k] = EZ[l][k]; }
        else if (Object.prototype.hasOwnProperty.call(o, k)) b[k] = o[k];
      });
    });
  }
  function redraw() { try { root.dispatchEvent(new CustomEvent("daily:lang")); } catch (e) {} }
  function style(slot) {
    slot.textContent = "";
    var lbl = el("p", "lbl", t("dk_ez")), row = el("div", "chips");
    lbl.id = "dkez"; row.setAttribute("role", "group"); row.setAttribute("aria-labelledby", "dkez");
    [0, 1].forEach(function (v) {
      var on = !!Kit.store.ez === !!v, b = el("button", "chip" + (on ? " on" : ""), t(v ? "dk_ezOn" : "dk_ezOff"), function () {
        Kit.sfx.tap(); if (v) Kit.store.ez = 1; else delete Kit.store.ez; Kit.save(); ezApply(); redraw(); style(slot);
        var f = slot.querySelector('[data-v="' + v + '"]'); if (f) f.focus();
      });
      b.dataset.v = v; b.setAttribute("aria-pressed", String(on)); row.appendChild(b);
    });
    slot.appendChild(lbl); slot.appendChild(row); slot.appendChild(el("p", "note", t("dk_ezNote")));
  }

  // the AI picture in the editor: a thumbnail beside the live card (CSS above); a tap, Enter or Space lays it over
  var pic = $("edpic");
  pic.addEventListener("click", function () { if (pic.classList.contains("thumb")) A.picSwap(pic); });
  pic.addEventListener("keydown", function (e) { if (pic.classList.contains("thumb") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); A.picSwap(pic); } });
  // ---------- room (E1.5): the tool in use gets the room, the card moves with it (#editor[data-platz]) ----------
  // ruhe: a new sheet, or the open tab tapped again: the card large. Otherwise the open tab's state. A turn card's panel
  // is the game itself (its move, its list): it keeps the fixed layout.
  var PLATZ = { Sticker: "sticker", Style: "look", Color: "look", Figure: "look", World: "look", Photo: "foto", Rules: "regler", Agent: "regler", Rival: "regler", Arena: "regler", Sound: "regler" };
  var roomOf = null, tabBefore = null, wasRuhe = false;
  function platz(m) {
    var ed = A.ed(), e = $("editor");
    if (!ed || ed.doc.k === "turn") { e.removeAttribute("data-platz"); return; }
    e.dataset.platz = m || PLATZ[ed.tab] || "text"; if (m !== "ruhe") $("stagewrap").classList.remove("swap");
  }
  $("tabs").addEventListener("click", function () { var ed = A.ed(); tabBefore = ed && ed.tab; wasRuhe = $("editor").dataset.platz === "ruhe"; }, true);
  $("tabs").addEventListener("click", function (e) { var b = e.target.closest("[role=tab]"); if (b) platz(b.dataset.k === tabBefore && !wasRuhe ? "ruhe" : 0); });
  // using the panel: after a tap has done its work (click, so nothing moves under the finger), or keyboard focus
  $("panel").addEventListener("click", function () { platz(0); });
  $("panel").addEventListener("focusin", function (e) { if (e.target.matches(":focus-visible")) platz(0); });
  // A field in focus is never under FERTIG / WEITER (.foot under the panel) nor under the on-screen keyboard
  // (visualViewport, P5-P8): the panel moves it into sight, at once and once the room has settled (platz: 180 ms).
  function keep() {
    var f = document.activeElement, P = $("panel"), V = root.visualViewport;
    if (!f || !P.contains(f) || !f.matches("input:not([type=range]):not([type=color]),textarea")) return;
    var r = f.getBoundingClientRect(), q = P.getBoundingClientRect(), lo = Math.min(q.bottom, V ? V.offsetTop + V.height : innerHeight) - 6, hi = Math.max(q.top, V ? V.offsetTop : 0) + 6;
    if (r.bottom > lo) P.scrollTop += Math.min(r.bottom - lo, r.top - hi); else if (r.top < hi) P.scrollTop -= hi - r.top;
  }
  $("panel").addEventListener("focusin", function () { setTimeout(keep, 0); setTimeout(keep, 260); });
  if (root.visualViewport) root.visualViewport.addEventListener("resize", keep);
  // a tab opened by the program (a layer chosen in the list, a wish that leads to Rules) while a tool is in use
  new MutationObserver(function () { var p = $("editor").dataset.platz; if (p && p !== "ruhe") platz(0); }).observe($("tabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  // Room (E1.5): back to the large card is said once; a tool getting the room is said by its tab already.
  new MutationObserver(function (m) { if ($("editor").dataset.platz === "ruhe" && m[0].oldValue && m[0].oldValue !== "ruhe") tell(t("dk_ruhe")); })
    .observe($("editor"), { attributes: true, attributeFilter: ["data-platz"], attributeOldValue: true });
  root.Direkt = { paint: paint, style: style, go: go };
  if (Kit.store.ez) { ezApply(); redraw(); }
  // The editor that is open now: its history starts here, and an open sticker or colour tab gets its new look.
  var ed = A.ed(); if (ed) { paint(ed); if (ed.tab === "Sticker" || ed.tab === "Color") rerenderTab(ed.tab); }
  function rerenderTab(k) { var p = $("panel"), top = p.scrollTop; A.tab(k); p.scrollTop = top; }
})(window);
