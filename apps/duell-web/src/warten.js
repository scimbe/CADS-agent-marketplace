/* My Daily Idea: the waiting of the free card (create-ui.js), the part "warten", only on demand (parts.js ONDEMAND).
   A full screen over the page while the server makes the card: the person's own sentence, big, and a card frame that is
   built from it. Every step on screen is a real state of the request (ai.js block -> phase): sent, in the line with the
   server's own place number, the AI at work, the answer checked here, the card. No percentage, no invented progress, no
   timer that pretends to know how long it takes. The motion (words flying into the frame, the sparks) is drawn from a
   seed made of the sentence, never from Math.random. "Abbrechen" is always there (Escape too); a refusal or an error ends
   the screen with its message. prefers-reduced-motion: the same steps as text, nothing moves. */
(function (root) {
  "use strict";
  var CSS = ".wt{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;gap:10px;padding:calc(14px + env(safe-area-inset-top)) 16px calc(14px + env(safe-area-inset-bottom));background:#ffd400;color:#111;overflow:hidden;animation:wtin .32s cubic-bezier(.2,.9,.3,1.2) both}" +
    ".wt::before{content:\"\";position:absolute;left:50%;top:42%;width:190vmax;height:190vmax;margin:-95vmax;background:repeating-conic-gradient(rgba(0,0,0,.07) 0 12deg,transparent 0 24deg);animation:wtspin 40s linear infinite;pointer-events:none;z-index:-1}" +
    ".wt.wtno{background:#f3ead2}.wt.wtno::before{animation:none;opacity:.4}" +
    ".wt-h{margin:0;font:400 15px/1 var(--disp);letter-spacing:.06em;text-transform:uppercase}" +
    ".wt-q{margin:0;font:400 var(--wtq,30px)/1.06 var(--disp);text-transform:uppercase;overflow-wrap:anywhere;max-height:34vh;overflow:hidden}" +
    ".wt-q .w{display:inline-block;animation:wtpop .38s cubic-bezier(.2,.9,.3,1.4) both;transition:opacity .3s,color .3s}.wt-q .w.used{color:#ff3b1d}" +
    ".wt-stage{flex:1;min-height:150px;display:flex;align-items:center;justify-content:center;position:relative}" +
    ".wt-card{position:relative;width:min(78vw,300px);min-height:min(26vh,190px);padding:16px 14px;background:#fff6dc;border-radius:8px;box-shadow:8px 8px 0 #111;transform:rotate(-2deg);display:flex;flex-direction:column;gap:6px}" +
    ".wt-e{position:absolute;background:#111;animation:wtdraw .5s ease-out both}.wt-e1{left:0;right:0;top:0;height:4px;transform-origin:left}.wt-e2{top:0;bottom:0;right:0;width:4px;transform-origin:top;animation-delay:.12s}.wt-e3{left:0;right:0;bottom:0;height:4px;transform-origin:right;animation-delay:.24s}.wt-e4{top:0;bottom:0;left:0;width:4px;transform-origin:bottom;animation-delay:.36s}" +
    ".wt-sl{display:block;flex:none;margin-bottom:4px;box-sizing:border-box;height:14px;border:2px dashed rgba(17,17,17,.45);border-radius:4px}.wt-sl1{width:62%;height:22px}.wt-sl2{width:88%}.wt-sl3{width:70%;margin-bottom:auto}" +
    ".wt-fig{position:absolute;right:12px;top:8px;font-size:44px;line-height:1;animation:wtdrop .6s .45s cubic-bezier(.2,.9,.3,1.5) both}" +
    ".wt-mat{display:flex;flex-wrap:wrap;gap:4px;align-content:flex-end;min-height:40px}.wt-mat b{height:12px;border:2px solid #111;border-radius:3px;animation:wtpop .3s both}" +
    ".wt-tk{position:absolute;left:-10px;top:-14px;background:#ff3b1d;color:#fff;border:3px solid #111;border-radius:6px;padding:4px 8px;font:400 16px/1 var(--disp);text-transform:uppercase;transform:rotate(-6deg);box-shadow:3px 3px 0 #111;animation:wtstamp .35s both}" +
    ".wt-scan{position:absolute;left:4px;right:4px;top:4px;height:6px;background:#ff3b1d;border-radius:3px;animation:wtscan 1.1s ease-in-out infinite alternate}" +
    ".wt.wtmake .wt-card{animation:wtwob 1.6s ease-in-out infinite}" +
    ".wt.wtno .wt-card{transform:rotate(3deg) translateY(8px);filter:grayscale(1);transition:transform .4s,filter .4s}" +
    ".wtpv{position:relative;margin:0;padding:18px 16px 30px;border:3px solid #111;border-radius:6px;display:flex;flex-direction:column;gap:8px;box-shadow:8px 8px 0 #111;animation:wtpop .45s cubic-bezier(.2,.9,.3,1.4) both}.wt.wtdone .wt-card{padding:0;background:none;box-shadow:none}" +
    ".wt-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}" +
    ".wt-steps li{border:3px solid #111;border-radius:6px;background:#fff6dc;padding:6px 4px;font:800 12px/1.15 var(--ui);text-align:center;opacity:.55;transition:background .25s,opacity .25s,transform .25s}" +
    ".wt-steps li::before{content:attr(data-n);display:block;font:400 18px/1 var(--disp)}.wt-steps li.ok::before{content:\"\\2713\"}" +
    ".wt-steps li.on{opacity:1;background:#fff;transform:translateY(-3px);box-shadow:3px 3px 0 #111}.wt-steps li.ok{opacity:1;background:#1b9e3a;color:#fff}" +
    ".wt-st{margin:0;min-height:2.5em;font:700 15px/1.25 var(--ui)}" +
    ".wt-msg{margin:0;padding:12px;border:3px solid #111;border-radius:6px;background:#fff;box-shadow:4px 4px 0 #111;font:800 16px/1.3 var(--ui)}.wt-msg:empty{display:none}" +
    ".wt-x{width:100%;min-height:52px;margin:0;border:3px solid #111;border-radius:6px;background:#fff;box-shadow:0 5px 0 #111;font:400 20px/1 var(--disp);text-transform:uppercase}" +
    ".wt-fly{position:fixed;z-index:61;pointer-events:none;font:400 24px/1 var(--disp);text-transform:uppercase;color:#111;background:#fff;border:3px solid #111;border-radius:5px;padding:3px 6px;box-shadow:3px 3px 0 #ff3b1d;white-space:nowrap}" +
    ".wt-cf{position:fixed;z-index:61;width:10px;height:14px;border:2px solid #111;pointer-events:none}" +
    ".wt.wtout{animation:wtout .38s ease-in both}" +
    "@keyframes wtin{from{opacity:0;transform:scale(1.06)}}@keyframes wtout{to{opacity:0;transform:scale(1.08)}}@keyframes wtspin{to{transform:rotate(360deg)}}" +
    "@keyframes wtpop{from{opacity:0;transform:scale(.4) rotate(-8deg)}}@keyframes wtdraw{from{transform:scale(0)}}@keyframes wtdrop{from{opacity:0;transform:translateY(-60px) rotate(-30deg)}}" +
    "@keyframes wtstamp{from{opacity:0;transform:scale(2.2) rotate(-6deg)}}@keyframes wtscan{to{top:calc(100% - 10px)}}@keyframes wtwob{50%{transform:rotate(1.5deg) scale(1.02)}}" +
    "@media (prefers-reduced-motion:reduce){.wt,.wt *,.wt::before{animation:none!important;transition:none!important}.wt-scan{display:none}}";
  var STEPS = ["send", "make", "check", "ready"];
  // A seed from the sentence (FNV-1a), and from it every "random" choice of the motion (mulberry32).
  function seedOf(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(a) { return function () { a = (a + 0x6D2B79F5) | 0; var x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  var COLS = ["#ff3b1d", "#1b9e3a", "#ff3d71", "#f5a623", "#2b6cff", "#111111", "#ffffff"];
  function still() { try { return root.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
  function style() { if (document.getElementById("wartencss")) return; var s = document.createElement("style"); s.id = "wartencss"; s.textContent = CSS; document.head.appendChild(s); }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /* open(o) -> the screen. o: { text, fig, t, onCancel(), onClose() }. The screen's calls:
       phase("send" | "line" (n = the server's place) | "make" | "check")   a real state of the request
       reveal(doc, node) -> Promise   the card is there: node (create-ui's preview) is shown in the frame, then the screen goes
       end(message)                   a refusal or an error: said, the step marked, one button "Zurück zu deinem Satz"
       close()                        gone at once (cancel) */
  function open(o) {
    style();
    var t = o.t, calm = still(), R = rng(seedOf(String(o.text || "") + "|" + (o.fig || ""))), done = false, now = "";
    var ov = mk("div", "wt"), h = mk("p", "wt-h", t("create_wait_h")), q = mk("p", "wt-q"), stage = mk("div", "wt-stage"), card = mk("div", "wt-card");
    var fig = mk("span", "wt-fig", o.fig || "✨"), mat = mk("div", "wt-mat"), tk = null, scan = null;
    var steps = mk("ol", "wt-steps"), st = mk("p", "wt-st"), msg = mk("p", "wt-msg"), x = mk("button", "wt-x", t("create_wait_cancel"));
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); h.id = "wth"; ov.setAttribute("aria-labelledby", "wth"); ov.id = "warten";
    st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite"); msg.setAttribute("role", "alert"); x.type = "button"; x.id = "wartenx";
    // the sentence word by word, big; its length sets the size so it fits a 390 px phone
    var words = String(o.text || "").split(/\s+/).filter(Boolean).slice(0, 40), len = words.join(" ").length;
    ov.style.setProperty("--wtq", (len <= 30 ? 40 : len <= 70 ? 30 : len <= 120 ? 24 : 19) + "px");
    q.appendChild(document.createTextNode("„"));
    var spans = words.map(function (w, i) { var s = mk("span", "w", w); s.style.animationDelay = calm ? "0s" : Math.min(i * 45, 900) + "ms"; q.appendChild(s); q.appendChild(document.createTextNode(i < words.length - 1 ? " " : "")); return s; });
    q.appendChild(document.createTextNode("“"));
    ["wt-e wt-e1", "wt-e wt-e2", "wt-e wt-e3", "wt-e wt-e4"].forEach(function (c) { card.appendChild(mk("i", c)); });
    // the empty places of title and text, then the bricks the sentence's words become
    ["wt-sl wt-sl1", "wt-sl wt-sl2", "wt-sl wt-sl3"].forEach(function (c) { card.appendChild(mk("i", c)); });
    fig.setAttribute("aria-hidden", "true"); card.appendChild(fig); card.appendChild(mat); card.setAttribute("aria-hidden", "true");
    stage.appendChild(card);
    var li = STEPS.map(function (s, i) { var e = mk("li", "", t("create_wait_s_" + s)); e.setAttribute("data-n", String(i + 1)); steps.appendChild(e); return e; });
    [h, q, stage, steps, st, msg, x].forEach(function (e) { ov.appendChild(e); });
    // the rest of the page is out of reach while the screen is up (screen readers too); given back on close
    var quiet = Array.prototype.filter.call(document.body.children, function (c) { return c !== ov && !c.inert && c.tagName !== "SCRIPT" && c.tagName !== "STYLE"; });
    quiet.forEach(function (c) { c.inert = true; });
    document.body.appendChild(ov);
    var back = null;   // after end(): the button leads back to the sentence instead of cancelling
    x.addEventListener("click", function () { if (back) back(); else { var f = o.onCancel; close(); if (f) f(); } });
    // focus stays on the one button of the screen; Escape is the same as the button
    ov.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); x.click(); }
      else if (e.key === "Tab") { e.preventDefault(); x.focus(); }
    });
    try { x.focus({ preventScroll: true }); } catch (e) { x.focus(); }

    // steps: the one now is "on", the ones before are done
    function mark(s) {
      var k = STEPS.indexOf(s);
      li.forEach(function (e, i) { e.classList.toggle("ok", i < k || (s === "ready" && i === k)); e.classList.toggle("on", i === k && s !== "ready"); if (i === k) e.setAttribute("aria-current", "step"); else e.removeAttribute("aria-current"); });
    }
    // while the AI works: a word of the sentence flies into the frame and becomes one brick of it, again and again (seeded order)
    var fly = 0, bricks = 0;
    function flyOne() {
      if (done || !spans.length) return;
      var s = spans[Math.floor(R() * spans.length)], a = s.getBoundingClientRect(), c = card.getBoundingClientRect();
      s.classList.add("used"); setTimeout(function () { s.classList.remove("used"); }, 900);
      var b = mk("b"); b.style.width = (14 + Math.floor(R() * 46)) + "px"; b.style.background = COLS[Math.floor(R() * (COLS.length - 1))];
      if (calm || !root.Element.prototype.animate) { add(b); return; }
      var f = mk("span", "wt-fly", s.textContent); f.style.left = a.left + "px"; f.style.top = a.top + "px"; f.setAttribute("aria-hidden", "true"); document.body.appendChild(f);
      var dx = c.left + c.width * (0.2 + R() * 0.5) - a.left, dy = c.top + c.height * (0.45 + R() * 0.3) - a.top, rot = (R() * 2 - 1) * 40;
      var an = f.animate([{ transform: "none", opacity: 1 }, { transform: "translate(" + dx * 0.5 + "px," + (dy * 0.5 - 60) + "px) rotate(" + rot / 2 + "deg) scale(1.2)", opacity: 1 }, { transform: "translate(" + dx + "px," + dy + "px) rotate(" + rot + "deg) scale(.3)", opacity: 0 }], { duration: 760, easing: "cubic-bezier(.3,.1,.4,1)" });
      an.onfinish = function () { f.remove(); if (!done) add(b); };
    }
    function add(b) { if (++bricks > 14) { mat.textContent = ""; bricks = 1; } mat.appendChild(b); }
    function flying(on) {
      if (on && !fly) { flyOne(); fly = setInterval(flyOne, calm ? 1400 : 620); }
      if (!on && fly) { clearInterval(fly); fly = 0; }
    }
    function say(s) { if (st.textContent !== s) st.textContent = s; }

    function phase(s, n) {
      if (done) return;
      if (s === "line") {
        mark("make");
        if (!tk) { tk = mk("span", "wt-tk"); card.appendChild(tk); }
        tk.textContent = t("create_wait_place", { n: n }); say(t("create_wait_line", { n: n }));
        ov.classList.remove("wtmake"); flying(false); now = s; return;
      }
      if (tk) { tk.remove(); tk = null; }
      now = s; mark(s);
      if (s === "send") { say(t("create_wait_send")); flying(true); }
      if (s === "make") { say(t("create_wait_make")); ov.classList.add("wtmake"); flying(true); }
      if (s === "check") {
        say(t("create_wait_check")); ov.classList.remove("wtmake"); flying(false);
        if (!scan) { scan = mk("i", "wt-scan"); card.appendChild(scan); }
      }
    }
    // The sparks of the card that is there: seeded positions and colours, a burst from the frame.
    function sparks() {
      if (calm || !root.Element.prototype.animate) return;
      var c = card.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
      for (var i = 0; i < 28; i++) {
        var p = mk("i", "wt-cf"), a = R() * Math.PI * 2, d = 90 + R() * 170;
        p.style.left = cx + "px"; p.style.top = cy + "px"; p.style.background = COLS[i % COLS.length]; p.setAttribute("aria-hidden", "true");
        document.body.appendChild(p);
        p.animate([{ transform: "translate(-50%,-50%) scale(.2)", opacity: 1 }, { transform: "translate(" + Math.cos(a) * d + "px," + (Math.sin(a) * d + 80) + "px) rotate(" + Math.floor(R() * 720) + "deg)", opacity: 0 }], { duration: 900 + R() * 400, easing: "cubic-bezier(.1,.7,.3,1)" });
        setTimeout(p.remove.bind(p), 1400);
      }
    }
    function reveal(doc, node) {
      if (done) return Promise.resolve();
      flying(false); if (scan) { scan.remove(); scan = null; } if (tk) { tk.remove(); tk = null; }
      ov.classList.remove("wtmake"); mark("ready"); say(t("create_wait_ready"));
      card.textContent = ""; ov.classList.add("wtdone");
      // the copy in the frame is a picture only (the preview below is the one that is read and focused)
      if (node) { node.className = "wtpv"; node.removeAttribute("tabindex"); node.removeAttribute("role"); node.removeAttribute("aria-label"); card.appendChild(node); }
      x.hidden = true;
      if (calm) { close(); return Promise.resolve(); }
      sparks();
      return new Promise(function (ok) {
        setTimeout(function () { ov.classList.add("wtout"); setTimeout(function () { close(); ok(); }, 380); }, 1300);
      });
    }
    function end(m) {
      if (done) return;
      flying(false); if (scan) { scan.remove(); scan = null; } if (tk) { tk.remove(); tk = null; }
      ov.classList.remove("wtmake"); ov.classList.add("wtno");
      // the steps give way to the message: a refusal is the server's answer, not a step that broke
      steps.hidden = true;
      say(""); msg.textContent = m || "";
      x.textContent = t("create_wait_back");
      back = function () { var f = o.onClose; close(); if (f) f(); };
      try { x.focus({ preventScroll: true }); } catch (e) {}
    }
    function close() {
      if (done) return; done = true; flying(false);
      quiet.forEach(function (c) { c.inert = false; });
      document.querySelectorAll(".wt-fly,.wt-cf").forEach(function (e) { e.remove(); });
      ov.remove();
    }
    return { phase: phase, reveal: reveal, end: end, close: close, open: function () { return !done; }, el: ov };
  }
  root.Warten = { open: open, seedOf: seedOf, rng: rng };
})(typeof globalThis !== "undefined" ? globalThis : this);
