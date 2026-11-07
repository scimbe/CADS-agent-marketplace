/* Mal & Rat on screen (part "malen", rule in src/malrat.js): the turn editor's step "malrat" and the canvas over the whole
   screen. Drawing takes a finger, a mouse or a pen (pointer events); what is sent are the lines as points, never a picture
   file. Guessing works with the keyboard alone: the picture is described in words, "Show me one more word" gives hints
   step by step, and the letters can be tapped. No clock runs before "Go"; with reduced motion the picture is shown whole
   at once instead of line by line. */
(function (root) {
  "use strict";
  var A = root.DailyApp, Tn = root.Turns, M = root.Malrat, C = root.DuellCore, Kit = root.Kit, el = A.el;
  function L() { return Tn.T(Kit.lang); }
  function fmt(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : ""; }); }
  function say(k, n, o) { return fmt(C.form(L(), k, n, Kit.lang), Object.assign({ n: n }, o || {})); }
  function calm() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function strokes(n) { return say("mr_strokes", n); }
  function names(list) { var X = L(); try { return new Intl.ListFormat(Kit.loc(), { type: "conjunction" }).format(list.map(function (c) { return X["mr_c_" + c]; })); } catch (e) { return list.map(function (c) { return X["mr_c_" + c]; }).join(", "); } }
  function press(b, on) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }

  var CSS = ".mrov{justify-content:flex-start;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);overflow:hidden}" +
    ".mrbar{display:flex;align-items:center;gap:8px;width:100%;min-height:52px;padding:4px 8px;flex:none}.mrbar h2{margin:0;font:400 24px/1.1 var(--disp);text-transform:uppercase;flex:1;overflow-wrap:anywhere}" +
    ".mrmain{flex:1;min-height:0;width:100%;max-width:1000px;display:flex;flex-direction:column;gap:10px;padding:0 16px 12px;overflow-y:auto}" +
    ".mrpad{flex:1 1 0;min-width:0;min-height:160px;overflow:hidden;display:flex;align-items:center;justify-content:center}" +
    ".mrcv{display:block;background:#fff;border:3px solid var(--ink);border-radius:4px;touch-action:none}" +
    ".mrtools{flex:none;display:flex;flex-direction:column;gap:8px;text-align:left}.mrrow{display:flex;flex-wrap:wrap;gap:6px}" +
    ".mrcol{width:48px;height:48px;min-width:48px;border:3px solid var(--ink);border-radius:50%;position:relative}.mrcol.on{outline:4px solid var(--ink);outline-offset:3px}" +
    ".mrcol.on::after{content:'✓';position:absolute;inset:0;display:grid;place-items:center;font:900 22px var(--ui);color:#fff;text-shadow:0 0 3px #000}" +
    ".mrsize{min-width:56px;min-height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:2px 6px}.mrsize i{display:block;border-radius:50%;background:currentColor}" +
    ".mrrow .btn{flex:1 1 auto}.mrroom{margin:0;font-size:.8rem}.mrbarfill{height:8px;border:2px solid var(--ink);border-radius:4px;background:#fff;overflow:hidden}.mrbarfill i{display:block;height:100%;background:var(--ink)}" +
    ".mrtiles{display:flex;flex-wrap:wrap;gap:4px;margin:0}.mrtiles span{min-width:24px;height:34px;display:grid;place-items:center;border-bottom:3px solid var(--ink);font:900 20px var(--ui)}" +
    ".mrtools .btn.hot{font-size:20px;line-height:1.1;padding:6px 8px}" +
    ".mrguess{display:flex;gap:6px}.mrguess .field{flex:1 1 auto;width:auto;min-width:0;margin:0;user-select:text;-webkit-user-select:text}.mrguess .btn{flex:none;width:auto;min-width:96px}" +
    ".mrhints{margin:0;padding-left:1.2em;font-size:.9rem}.mrok{font:900 1.1rem var(--ui);margin:0}" +
    ".mrthumb{width:96px;height:96px;background:#fff;border:3px solid var(--ink);border-radius:4px;flex:none}.mrstate{display:flex;gap:10px;align-items:center;margin:6px 0}" +
    ".mrwords{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.mrwords .chip small{display:block;font-size:.7rem;font-weight:700}" +
    "@media (min-aspect-ratio:1/1){.mrmain{flex-direction:row;overflow:hidden}.mrpad{min-height:0}.mrtools{width:212px;max-height:100%;overflow-y:auto;padding-bottom:4px}}";
  function css() { if (document.getElementById("mrcss")) return; var s = document.createElement("style"); s.id = "mrcss"; s.textContent = CSS; document.head.appendChild(s); }

  // ---------- painting lines (grid points 0..63, or the raw points 0..1 while a line is being drawn) ----------
  function paint(cv, lines, upTo, raw) {
    var c = cv.getContext("2d"), W = cv.width, k = raw ? W : W / (M.GRID - 1), left = upTo == null ? Infinity : upTo;
    c.fillStyle = "#fff"; c.fillRect(0, 0, W, W); c.lineCap = "round"; c.lineJoin = "round";
    for (var i = 0; i < lines.length && left > 0; i++) {
      var l = lines[i], n = Math.min(l.p.length, left); left -= l.p.length;
      c.strokeStyle = c.fillStyle = M.COLORS[l.c]; c.lineWidth = Math.max(1.5, M.WIDTHS[l.w] * W);
      if (l.p.length === 1 || n === 1) { c.beginPath(); c.arc(l.p[0][0] * k, l.p[0][1] * k, c.lineWidth / 2, 0, 6.3); c.fill(); if (l.p.length === 1) continue; }
      c.beginPath(); c.moveTo(l.p[0][0] * k, l.p[0][1] * k);
      for (var j = 1; j < n; j++) c.lineTo(l.p[j][0] * k, l.p[j][1] * k);
      c.stroke();
    }
    c.fillStyle = "#fff";
  }
  function count(lines) { return lines.reduce(function (a, l) { return a + l.p.length; }, 0); }

  // ---------- the layer over the whole screen ----------
  var ov = null, hidden = [];
  function layer(title, onClose) {
    shut(); css();
    ov = el("div", "liveov mrov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "mrh");
    var bar = el("div", "mrbar"), x = el("button", "ico", "✕", function () { Kit.sfx.tap(); shut(); });
    x.setAttribute("aria-label", L().mr_close); bar.appendChild(x); var h = el("h2", "", title); h.id = "mrh"; bar.appendChild(h);
    var main = el("div", "mrmain"), pad = el("div", "mrpad"), tools = el("div", "mrtools");
    main.appendChild(pad); main.appendChild(tools); ov.appendChild(bar); ov.appendChild(main);
    // everything behind the layer is out of reach for the keyboard and the screen reader while it is open
    // (the toast stays reachable: it is what tells about a part that failed to load)
    hidden = Array.prototype.filter.call(document.body.children, function (n) { return !n.inert && n.tagName !== "SCRIPT" && n.id !== "toast"; });
    hidden.forEach(function (n) { n.inert = true; });
    document.body.appendChild(ov);
    document.addEventListener("keydown", esc, true);
    ov.done = onClose;
    return { ov: ov, pad: pad, tools: tools, x: x };
  }
  // Escape closes the layer wherever the focus is (also on the page body after drawing on the canvas, which takes no focus).
  // Tab and Shift+Tab go round inside the layer: from the last control to the first and back, and from the body (after
  // drawing) into the layer, never onto the page behind it or the body.
  function esc(e) {
    if (!ov) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); shut(); return; }
    if (e.key !== "Tab") return;
    var all = Array.prototype.filter.call(ov.querySelectorAll("button, input, select, textarea, a[href], [tabindex]"), function (n) { return !n.disabled && n.tabIndex >= 0 && n.getClientRects().length; });
    if (!all.length) return;
    var a = document.activeElement, i = all.indexOf(a), inside = ov.contains(a);
    if (!inside || (e.shiftKey && i === 0) || (!e.shiftKey && i === all.length - 1)) { e.preventDefault(); (e.shiftKey ? all[all.length - 1] : all[0]).focus(); }
  }
  function shut() {
    if (!ov) return;
    var o = ov, f = o.done; ov = null; document.removeEventListener("keydown", esc, true); if (o.stop) o.stop(); o.remove();
    hidden.forEach(function (n) { n.inert = false; }); hidden = [];
    if (f) f();
  }
  window.addEventListener("hashchange", function () { if (ov) ov.done = null; shut(); });
  // The canvas as large as the space beside or above the tools allows, sharp on every screen.
  function size(cv, pad, draw) {
    function fit() {
      if (!cv.isConnected) { window.removeEventListener("resize", fit); return; }
      var s = Math.max(120, Math.floor(Math.min(pad.clientWidth, pad.clientHeight))), r = Math.min(3, window.devicePixelRatio || 1);
      cv.style.width = cv.style.height = s + "px"; cv.width = cv.height = Math.round(s * r); draw();
    }
    window.addEventListener("resize", fit); fit();
  }

  // ---------- drawing ----------
  function drawLayer(st, ctx, back) {
    var X = L(), w = word(st, ctx), o = layer(fmt(X.mr_draw_h, { w: w }), back), cv = el("canvas", "mrcv"), cur = null, pid = null;
    cv.setAttribute("role", "img"); cv.setAttribute("aria-label", X.mr_canvas); o.pad.appendChild(cv);
    var cols = el("div", "mrrow"), sizes = el("div", "mrrow"), room = el("p", "mrroom"), fill = el("div", "mrbarfill"), bar = el("i"), msg = el("p", "note");
    cols.setAttribute("role", "group"); cols.setAttribute("aria-label", X.mr_colors); sizes.setAttribute("role", "group"); sizes.setAttribute("aria-label", X.mr_sizes);
    msg.setAttribute("aria-live", "polite"); fill.appendChild(bar); fill.setAttribute("aria-hidden", "true");
    M.COLORS.forEach(function (c, i) {
      var b = el("button", "mrcol", null, function () { Kit.sfx.tap(); st.c = i; sync(); });
      b.style.background = c; b.setAttribute("aria-label", X["mr_c_" + i]); b.title = X["mr_c_" + i]; cols.appendChild(b);
    });
    M.WIDTHS.forEach(function (x, i) {
      var b = el("button", "chip mrsize", null, function () { Kit.sfx.tap(); st.w = i; sync(); }), dot = el("i");
      dot.style.width = dot.style.height = [6, 12, 22][i] + "px"; dot.setAttribute("aria-hidden", "true"); b.appendChild(dot); b.appendChild(el("span", "", X["mr_s_" + i])); sizes.appendChild(b);
    });
    var undo = el("button", "btn", X.mr_undo, function () { Kit.sfx.tap(); st.lines.pop(); repack(st, ctx); msg.textContent = ""; show(); });
    sizes.appendChild(undo);
    var done = el("button", "btn hot", X.mr_done, function () { Kit.sfx.pop(); shut(); });
    [cols, sizes, room, fill, msg, done].forEach(function (n) { o.tools.appendChild(n); });
    function sync() {
      Array.prototype.forEach.call(cols.children, function (b, i) { press(b, i === st.c); });
      Array.prototype.forEach.call(sizes.querySelectorAll(".mrsize"), function (b, i) { press(b, i === st.w); });
      undo.disabled = !st.lines.length;
    }
    function show() {
      paint(cv, st.packed ? M.decode(st.packed) : [], null, false);
      var n = st.packed ? Math.min(100, Math.round(M.size(ctx.doc, M.move("AAAAAAAAAAA", word(st, ctx) || "Xx", Kit.lang, st.packed, 0, M.round(ctx.m))) / C.MAX_FRAGMENT * 100)) : 0;
      room.textContent = fmt(X.mr_room, { n: n }); bar.style.width = n + "%"; sync();
    }
    function pos(e) { var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
    cv.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (cur) { if (e.pointerId === pid) return; end({ pointerId: pid }); }   // a line whose end got lost (no capture) is taken as it is
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      pid = e.pointerId; cur = { c: st.c, w: st.w, p: [pos(e)] };
      var c = cv.getContext("2d"); c.fillStyle = M.COLORS[st.c]; c.beginPath(); c.arc(cur.p[0][0] * cv.width, cur.p[0][1] * cv.width, Math.max(1.5, M.WIDTHS[st.w] * cv.width) / 2, 0, 6.3); c.fill();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!cur || e.pointerId !== pid) return;
      var c = cv.getContext("2d"), W = cv.width, evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs.length) evs = [e];
      c.strokeStyle = M.COLORS[cur.c]; c.lineWidth = Math.max(1.5, M.WIDTHS[cur.w] * W); c.lineCap = "round"; c.lineJoin = "round";
      evs.forEach(function (x) { var a = cur.p[cur.p.length - 1], b = pos(x); cur.p.push(b); c.beginPath(); c.moveTo(a[0] * W, a[1] * W); c.lineTo(b[0] * W, b[1] * W); c.stroke(); });
    });
    function end(e) {
      if (!cur || e.pointerId !== pid) return;
      var line = cur; cur = null; pid = null;
      st.lines.push(line);
      if (!repack(st, ctx)) { st.lines.pop(); repack(st, ctx); msg.textContent = X.mr_full; Kit.sfx.thud(); }   // nothing is cut: the line is not taken, and the screen says why
      else msg.textContent = "";
      show();
    }
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("lostpointercapture", end);
    size(cv, o.pad, show);
    (st.lines.length ? done : cols.children[st.c]).focus();
  }
  // The word being drawn: one of the three on offer or one's own.
  function word(st, ctx) { return st.pick < 0 ? st.own : M.suggest(ctx.doc.seed, M.round(ctx.m), Kit.lang)[st.pick].w; }
  function mv(st, ctx, chk) { return M.move(chk || st.chk, word(st, ctx), Kit.lang, st.packed, st.secs || 0, M.round(ctx.m)); }
  // The finest packing that still fits into the link with this word; false when the lines do not fit at all.
  function repack(st, ctx) {
    if (!st.lines.length) { st.packed = ""; return true; }
    var w = word(st, ctx) || "Xx", p = M.pack(st.lines, function (s) { return M.fits(ctx.doc, w, Kit.lang, s); });
    if (p) st.packed = p.s;
    return !!p;
  }

  // ---------- guessing ----------
  function guessLayer(st, ctx, back) {
    var X = L(), v = ctx.m[ctx.m.length - 1][0], lines = M.decode(v[3]), h = M.hintParts(v[1]), seed = ctx.doc.seed;
    var o = layer(X.mr_guess_h, back), cv = el("canvas", "mrcv"), timer = 0, shown = 0;
    cv.setAttribute("role", "img"); o.pad.appendChild(cv);
    var desc = fmt(X.mr_pic, { s: strokes(lines.length), c: names(M.used(lines)) });
    var tiles = el("p", "mrtiles"), form = el("form", "mrguess"), inp = el("input", "field"), go = el("button", "btn hot", X.mr_try);
    var msg = el("p", "mrok"), more = el("button", "btn", X.mr_more), hints = el("ul", "mrhints"), bank = el("div", "mrrow"), again = el("button", "btn", X.mr_again), give = el("button", "btn", X.mr_give);
    var own = el("p", "note", X["mr_lang_" + M.langOf(v[2])]);
    inp.setAttribute("aria-label", X.mr_tip_ph); inp.placeholder = X.mr_tip_ph; inp.autocomplete = "off"; inp.maxLength = 24; inp.enterKeyHint = "go"; inp.setAttribute("autocapitalize", "off");
    go.type = "submit"; msg.setAttribute("aria-live", "polite"); hints.setAttribute("aria-live", "polite"); tiles.setAttribute("aria-live", "polite");
    form.appendChild(inp); form.appendChild(go);
    var parts = [tiles];
    if (st.known && M.langOf(v[2]) !== Kit.lang) parts.push(own);   // only a word from the list is known to be of that language
    parts.concat([form, msg, more, hints, bank, again, give]).forEach(function (n) { o.tools.appendChild(n); });
    function play() {
      clearTimeout(timer); var all = count(lines);
      if (calm()) { shown = all; draw(); return; }
      var step = Math.max(12, Math.min(70, 5000 / Math.max(1, all)));
      shown = 0; cv.setAttribute("aria-label", X.mr_playing);
      (function tick() { shown++; draw(); if (shown < all && ov === o.ov) timer = setTimeout(tick, step); })();
    }
    function draw() { paint(cv, lines, shown, false); if (shown >= count(lines)) cv.setAttribute("aria-label", desc); }
    o.ov.stop = function () { clearTimeout(timer); if (!st.solved && !st.gave) st.spent += Date.now() - st.at; };
    again.addEventListener("click", function () { Kit.sfx.tap(); play(); });
    function letters() {
      tiles.textContent = "";
      var out = [];
      for (var i = 0; i < h.n; i++) {
        var word = st.known ? st.known.w : st.solved ? st.word : "", l = st.open.indexOf(i) >= 0 ? (i === 0 ? h.first : word && M.letters(word)[i]) : "";
        var s = el("span", "", l || "\u00a0"); s.setAttribute("aria-hidden", "true"); tiles.appendChild(s); out.push(l || X.mr_gap);
      }
      tiles.appendChild(el("span", "dmsg", fmt(X.mr_tiles, { s: out.join(", ") }) + " (" + fmt(X.mr_len, { n: h.n }) + ")"));
    }
    function hintList() {
      hints.textContent = "";
      st.said.forEach(function (s) { hints.appendChild(el("li", "", s)); });
      bank.textContent = "";
      if (st.bank && st.known) M.bank(st.known.w, seed, v[5]).forEach(function (l) {
        var b = el("button", "chip", l, function () { Kit.sfx.tap(); inp.value = (inp.value + (inp.value ? l.toLowerCase() : l)).slice(0, 24); inp.focus(); });
        b.setAttribute("aria-label", fmt(X.mr_letter, { l: l })); bank.appendChild(b);
      });
    }
    // The next hint, in words: what it is, its colours, its first letter, the letters to tap, then one letter more each time.
    more.addEventListener("click", function () {
      Kit.sfx.tap();
      st.knowing.then(function () {
        var k = st.known, steps = [];
        if (k) steps.push(function () { return fmt(X.mr_h_cat, { c: X["mr_cat_" + k.cat] }); });
        steps.push(function () { return fmt(X.mr_h_col, { c: names(M.used(lines)) }); });
        steps.push(function () { st.open.push(0); return fmt(X.mr_h_first, { l: h.first }); });
        if (k) {
          steps.push(function () { st.bank = true; return X.mr_h_bank; });
          M.order(h.n, seed, v[5]).slice(0, Math.max(0, h.n - 2)).forEach(function (i) { steps.push(function () { st.open.push(i); return X.mr_h_letter; }); });
        }
        var f = steps[st.hints];
        if (f) { st.hints++; st.said.push(f()); } else if (st.said[st.said.length - 1] !== X.mr_h_none) st.said.push(X.mr_h_none);
        letters(); hintList();
      });
    });
    // "Schildkroete" was right for "S11": the tiles show it with its umlauts, when that gives the length of the hint.
    function spelt(g, n) { var u = g.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü"); return M.letters(g).length !== n && M.letters(u).length === n ? u : g; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var g = M.guess(inp.value);
      if (!inp.value.trim()) { inp.focus(); return; }
      if (!g) { msg.textContent = X.mr_bad; return; }
      go.disabled = true;
      M.right(g, v, seed).then(function (yes) {
        go.disabled = false; st.tries++;
        if (!yes) { Kit.sfx.thud(); msg.textContent = fmt(X.mr_wrong, { w: g }); inp.select(); return; }
        st.secs = Math.max(1, Math.min(3600, Math.round((st.spent + Date.now() - st.at) / 1000))); st.word = st.known ? st.known.w : h.first + M.letters(spelt(g, h.n)).slice(1).join("").toLowerCase(); st.solved = true;
        Kit.sfx.pop(); solved();
      });
    });
    give.addEventListener("click", function () { Kit.sfx.tap(); st.gave = true; st.secs = 0; solved(); });
    function solved() {
      shown = count(lines); draw(); clearTimeout(timer);
      [form, more, give, bank].forEach(function (n) { n.hidden = true; });
      msg.textContent = st.solved ? say("mr_right", st.secs, { w: st.word }) : st.known ? fmt(X.mr_was, { w: st.known.w }) : X.mr_secret_was;
      if (st.known || st.solved) { st.open = Array.from({ length: h.n }, function (x, i) { return i; }); letters(); }
      var b = el("button", "btn hot", X.mr_back, function () { Kit.sfx.thud(); st.mode = "draw"; shut(); });
      o.tools.appendChild(b); b.focus();
    }
    letters(); hintList();
    size(cv, o.pad, draw);
    st.at = Date.now();    // the clock runs only while the picture is open: from "Go", not before, and not while it is closed
    // the word from the list may still be looked for (PBKDF2): once it is known, the tiles and the language note follow
    st.knowing.then(function () { if (ov !== o.ov) return; letters(); if (st.known && M.langOf(v[2]) !== Kit.lang && !own.isConnected) o.tools.insertBefore(own, form); });
    if (st.solved || st.gave) solved(); else { play(); inp.focus(); }
  }

  // ---------- the step in the turn editor ----------
  root.Turn2.add("widget", "malrat", function (box, p, set, ctx) {
    css();
    var X = L(), ed = ctx.ed, guessing = ctx.m.length > 0, key = ed.doc.seed + "|" + M.round(ctx.m);
    var st = ed.malrat && ed.malrat.key === key ? ed.malrat : (ed.malrat = { key: key, lines: [], packed: "", c: 0, w: 1, pick: 0, own: "", chk: null, mode: guessing ? "guess" : "draw", open: [], said: [], hints: 0, tries: 0, secs: 0, at: 0, spent: 0, bank: false });
    if (guessing && !st.knowing) st.knowing = M.find(ctx.m[ctx.m.length - 1][0], ed.doc.seed).then(function (k) { st.known = k; }, function () { st.known = null; });
    function emit() {
      var w = word(st, ctx);
      if (!st.lines.length || !w || !st.chk || st.chk.w !== w || !repack(st, ctx)) { set(null); return; }
      set(mv(st, ctx, st.chk.h));
    }
    function hash() {
      var w = word(st, ctx); if (!w) { emit(); return; }
      if (st.chk && st.chk.w === w) { emit(); return; }
      emit(); if (st.wait === w) return; st.wait = w;
      M.check(w, ed.doc.seed, M.round(ctx.m)).then(function (h) { if (st.wait === w) st.wait = null; if (word(st, ctx) === w) { st.chk = { w: w, h: h }; emit(); } });
    }
    function render(focus) {
      box.textContent = "";
      if (st.mode === "guess") {
        var v = ctx.m[ctx.m.length - 1][0], n = M.hintParts(v[1]).n;
        box.appendChild(el("p", "qtext", X.mr_guess_h + " " + fmt(X.mr_len, { n: n })));
        var lo = el("button", "btn hot", X.mr_los, function () { Kit.sfx.thud(); guessLayer(st, ctx, function () { render(true); }); });
        box.appendChild(lo); if (focus) lo.focus();
        set(null); return;
      }
      if (guessing) box.appendChild(el("p", "mrok", st.solved ? say("mr_right", st.secs, { w: st.word }) : st.known ? fmt(X.mr_was, { w: st.known.w }) : X.mr_secret_was));
      box.appendChild(el("h4", "lbl", X.mr_word));
      var row = el("div", "mrwords"), sugg = M.suggest(ed.doc.seed, M.round(ctx.m), Kit.lang), field = el("input", "field"), bad = el("p", "note");
      bad.setAttribute("aria-live", "polite");
      sugg.forEach(function (s, i) {
        var b = el("button", "chip", null, function () { Kit.sfx.tap(); st.pick = i; render(); hash(); });
        b.appendChild(el("small", "", X["mr_lvl_" + s.lvl])); b.appendChild(document.createTextNode(s.w)); press(b, st.pick === i); row.appendChild(b);
      });
      var mine = el("button", "chip", X.mr_own, function () { Kit.sfx.tap(); st.pick = -1; render(); var f = box.querySelector("input.field"); if (f) f.focus(); hash(); });
      press(mine, st.pick < 0); row.appendChild(mine); box.appendChild(row);
      if (st.pick < 0) {
        field.maxLength = M.MAXW; field.autocomplete = "off"; field.placeholder = X.mr_own_ph; field.setAttribute("aria-label", X.mr_own_ph); field.value = st.typed || "";
        field.addEventListener("input", function () {
          st.typed = field.value; st.own = M.own(field.value); bad.textContent = field.value.trim() && !st.own ? X.mr_own_bad : "";
          if (bad.textContent) field.setAttribute("aria-invalid", "true"); else field.removeAttribute("aria-invalid");
          st.chk = null; hash();
        });
        box.appendChild(field); box.appendChild(bad);
      }
      box.appendChild(el("p", "note", X.mr_secret));
      var state = el("div", "mrstate");
      if (st.lines.length) {
        var th = el("canvas", "mrthumb"); th.width = th.height = 192; th.setAttribute("aria-hidden", "true"); paint(th, M.decode(st.packed) || [], null, false);
        state.appendChild(th);
      }
      state.appendChild(el("p", "note", st.lines.length ? fmt(X.mr_drawn, { s: strokes(st.lines.length), w: word(st, ctx) || "…" }) : X.mr_empty));
      box.appendChild(state);
      var open = el("button", st.lines.length ? "btn" : "btn hot", st.lines.length ? X.mr_open_more : X.mr_open, function () {
        if (!word(st, ctx)) { Kit.sfx.thud(); bad.textContent = X.mr_own_bad; var f = box.querySelector("input.field"); if (f) f.focus(); return; }
        Kit.sfx.thud(); drawLayer(st, ctx, function () { render(true); emit(); });
      });
      box.appendChild(open);
      if (focus) open.focus();
      hash();
    }
    render(false);
  });
})(window);
