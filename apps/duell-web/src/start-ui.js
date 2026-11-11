/* Start (redesign wave 1, the part start): below the day's card the question "Wem willst du heute eine Freude machen?",
   one sentence field (with a microphone only where the browser recognises speech on the device), four intention tiles and
   "Alle Karten", behind which the demo strip waits (Arcade, Webconference, Tunnel: nothing a first visit needs). The
   sentence leads to the card that fits (src/start.js) on the sheet "Deine Karte": "So verstehe ich dich", "Daraus wird".
   The core only calls home() and labels() (app.js); without this part the start page stays as it was. */
(function (root) {
  "use strict";
  var Kit = root.Kit, D = root.Daily, SI = root.StartIntent, W = root.Warm;
  function A() { return root.DailyApp; }
  function t(k, o) { return Kit.t(k, o); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text, on) { return A().el(tag, cls, text, on); }

  /* ---------- stroke icons (24 x 24, the colour of the text): no emoji in the controls ---------- */
  var P = {
    gruss: "M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z",
    planen: "M6 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M14.5 9a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5M15 15.5c2.4 0 4.3 1.4 5 4.5",
    spielen: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0M10.5 12a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
    stimme: "M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
    go: "M5 12h14M13 6l6 6-6 6",
    star: "M12 3l2.2 5.6L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.4z",
    grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    sound: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
    mute: "M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6"
  };
  function icon(name, size) {
    var NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", size || 24); s.setAttribute("height", size || 24); s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "sti"); p.setAttribute("d", P[name]); s.appendChild(p);
    return s;
  }

  /* ---------- look: the canvas the user approved (yellow, cream, ink, red; hard shadows; cards 22, buttons 16, chips round) ---------- */
  var CSS = [
    "#home.neu,#done,.stc{--sy:#F9D84A;--sc:#FBF5DD;--sk:#17140F;--sr:#B3321F;--sm:#4A4436;--st:system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif}",
    ".sti{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}",
    "#home.neu{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scroll-padding:12px 0}",
    "#home.neu>*{flex-shrink:0}#home.neu::before{display:none}",
    /* a phone at 150 % zoom and more (narrow): the intentions first, the day's card after them */
    "@media (max-width:300px){#home.neu:not(.recv)>.bar{order:-2}#home.neu:not(.recv)>#startbox{order:-1}.stform>.sti{display:none}.stform{padding-left:10px}}",
    /* a tall phone: the sheet gives room, so the question and the tiles are on the first screen; a short one (200 % zoom, a
       small phone) keeps sheet and main button on the first screen as before (rule A4) and the start follows below it */
    "#home.neu #feat{padding:0}#home.neu .pvimg img{object-fit:contain}",
    /* the card's own extras (Look würfeln, Live ansehen) on the card, next to the thumbs: the row under the main button is the
       same every day, so the start below does not move with the day's kind */
    "#stacts{position:absolute;right:14px;bottom:12px;z-index:3;display:flex;gap:6px;max-width:calc(100% - 132px)}#stacts:not(:has(>:not([hidden]))){display:none}",
    "#stacts button{min-height:44px;padding:2px 8px;border:2px solid #17140f;border-radius:12px;background:#fff;color:#17140f;font:700 .8125rem/1.1 system-ui,sans-serif}#stacts button[hidden]{display:none}",
    /* the gallery of bunsenbrenner (the old strip) only quietly at the foot, closed */
    ".stfoot{display:block;margin:4px auto 12px;min-height:44px;padding:0 12px;border:0;background:none;color:inherit;font:600 .875rem var(--st);text-decoration:underline;text-underline-offset:3px}",
    ".stfree{display:flex;align-items:center;gap:12px;width:100%;min-height:64px;margin:0 0 12px;padding:10px 14px;border:3px solid #17140f;border-radius:18px;background:#F9D84A;color:#17140f;text-align:left;box-shadow:4px 4px 0 #17140f}.stfree b{display:block;font:800 1.0625rem/1.2 system-ui,sans-serif}.stfree small{font:500 .875rem/1.3 system-ui,sans-serif}",
    "@media (orientation:landscape) and (max-height:500px) and (min-width:560px){#home #startbox{display:none}}",
    "#startbox{position:relative;display:flex;flex-direction:column;gap:14px;margin:6px 0 0;padding:16px 18px 14px;border-top:3px solid var(--sk);border-radius:26px 26px 0 0;background:var(--sc);font-family:var(--st);color:var(--sk)}#home.neu #tools{background:var(--sc);flex:1 0 auto;align-content:start;padding-bottom:16px}#home.neu #tools button{color:var(--sk)}",
    "#starth{margin:6px 0 0;font:400 1.75rem/1.06 var(--disp);text-transform:uppercase;letter-spacing:.3px;overflow-wrap:anywhere}",
    ".stform{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:6px;min-height:56px;padding:5px 5px 5px 14px;border:2px solid var(--sk);border-radius:18px;background:#fff;color:var(--sk);box-shadow:4px 4px 0 var(--sk)}",
    ".stform:focus-within{outline:3px solid var(--sk);outline-offset:3px}",
    ".stform>.sti{color:var(--sr);align-self:center}",
    ".stin{flex:1 1 9rem;min-width:0;min-height:44px;border:0;background:transparent;color:var(--sk);font:600 1rem/1.3 var(--st);padding:0;outline:none;user-select:text;-webkit-user-select:text}",
    ".stin::placeholder{color:var(--sm);opacity:1}",
    ".stico{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:0;background:transparent;color:var(--sk);padding:0}",
    ".stico.go{background:var(--sk);color:var(--sy)}.stico.mic{background:var(--sr);color:var(--sc)}.stico.mic[aria-pressed=true]{outline:3px solid var(--sk);outline-offset:2px}",
    ".sttiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(9.5rem,100%),1fr));gap:12px}",
    ".sttile{display:grid;grid-template-columns:auto 1fr;align-content:start;align-items:center;gap:4px 8px;min-height:88px;padding:12px;border:2px solid var(--sk);border-radius:22px;background:#fff;color:var(--sk);text-align:left;box-shadow:4px 4px 0 var(--sk);font-family:var(--st);transition:transform 90ms ease-out}",
    ".sttile:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--sk)}",
    ".sttile b{font:800 1rem/1.2 var(--st);overflow-wrap:break-word;hyphens:auto}.sttile small{grid-column:1/-1;font:500 .875rem/1.3 var(--st);overflow-wrap:anywhere}",
    ".sttile.t0{background:var(--sy)}.sttile.t3{background:var(--sr);color:var(--sc)}",
    ".stall{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:6px 16px;border:2px solid currentColor;border-radius:16px;background:transparent;color:var(--sk);font:700 1rem/1.2 var(--st)}",
    "#allbox{display:flex;flex-direction:column;gap:8px;margin:0 18px 12px}",
    /* preview pictures (the grid in "Alle Karten"): the picture fills the tile, the facts in its corners */
    ".stshots{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(9.5rem,100%),1fr));gap:16px 14px;padding-top:6px}",
    ".stshot{display:flex;flex-direction:column;gap:6px;min-width:0;padding:0;border:0;background:none;color:var(--sk);text-align:left;font-family:var(--st)}",
    ".stpic{position:relative;display:block;aspect-ratio:3/4;border:3px solid var(--sk);border-radius:8px;overflow:hidden;background:var(--sy);box-shadow:4px 4px 0 var(--sk)}",
    ".stpic img{display:block;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .2s}.stpic.on img{opacity:1}",
    ".stlen{position:absolute;right:6px;bottom:6px;padding:2px 7px;border-radius:5px;background:var(--sk);color:var(--sc);font:800 .8125rem/1.3 var(--st)}",
    ".stshot small{margin-top:-4px;font:700 .8125rem/1.25 var(--st);color:var(--sm)}",
    ".stshot b{font:400 1.25rem/1.08 var(--disp);text-transform:uppercase;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
    ".stshot:focus-visible{outline:none}.stshot:focus-visible .stpic{outline:3px solid var(--sk);outline-offset:3px}",
    "@media (prefers-reduced-motion:reduce){.stpic img{transition:none}}",
    /* two columns: the right one (free card, start, "Alle Karten") scrolls under a sheet that keeps the screen's height */
    "@media (min-width:900px),(orientation:landscape) and (max-height:500px) and (min-width:560px){#home.neu>#pad{position:sticky;top:12px;align-self:start;height:calc(100svh - 28px)}}",
    "#home.neu #tools button{font-family:var(--st);font-weight:700;text-decoration:underline;text-underline-offset:3px}",
    "@media (min-width:900px),(orientation:landscape) and (max-height:500px) and (min-width:560px){#startbox{margin:4px 10px 10px;border:3px solid var(--sk);border-radius:22px}#home.neu #tools{background:none}#home.neu #tools button{color:var(--on)}#starth{font-size:1.5rem}}",
    "@media (prefers-reduced-motion:reduce){.sttile{transition:none}}",
    /* a phone below 820 px height (360x780, 360x800): the day's title stays, the tiles get flatter (no subtitle) */
    "@media (max-width:899px) and (min-height:701px) and (max-height:819px){.sttile{min-height:72px}.sttile small{display:none}}",
    // a day with a live card has one more row under the sheet (Look würfeln / Anruf öffnen): the tiles give up that room
    "@media (max-width:899px) and (min-height:701px) and (max-height:899px){#home:has(#homerow>:not([hidden])) .sttile{min-height:72px}#home:has(#homerow>:not([hidden])) .sttile small{display:none}}",
    "@media (max-width:899px) and (min-height:701px) and (max-height:819px){#home:has(#homerow>:not([hidden])) .sttiles{gap:8px}#home:has(#homerow>:not([hidden])) .sttile{min-height:56px;padding:8px 12px}}",
    /* the sheet "Deine Karte" */
    ".stc{display:flex;flex-direction:column;gap:16px;padding:6px 2px 18px;font-family:var(--st);color:var(--sk)}",
    ".stc h3{margin:0;font:800 .875rem/1.2 var(--st);letter-spacing:.6px;text-transform:uppercase;color:var(--sm)}",
    ".stbox{display:flex;flex-direction:column;gap:8px;padding:14px 14px 10px;border:2px solid var(--sk);border-radius:22px;background:#fff}",
    ".stbox label{font:600 .9rem var(--st);color:var(--sm)}",
    ".stbox .strow{display:flex;gap:10px;align-items:flex-start}",
    ".stta{flex:1;min-width:0;min-height:3.2em;border:0;resize:none;background:transparent;color:var(--sk);font:600 1.2rem/1.3 var(--st);padding:0;user-select:text;-webkit-user-select:text}",
    ".stta:focus-visible{outline:3px solid var(--sk);outline-offset:4px}",
    ".stnote{margin:0;font:500 .875rem/1.35 var(--st);color:var(--sm)}",
    ".stchips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}",
    ".stchip{display:inline-flex;align-items:center;min-height:40px;padding:6px 14px;border:2px solid #8a8064;border-radius:999px;background:#fff;color:var(--sk);font:600 .9rem/1.2 var(--st)}",
    ".stbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:6px 16px;border:2px solid var(--sk);border-radius:999px;background:#fff;color:var(--sk);font:700 .9rem/1.2 var(--st);text-align:center}",
    ".stbtn[aria-pressed=true]{background:var(--sk);color:var(--sy)}",
    ".stbtn.stghost{background:transparent}",
    ".stlist{display:flex;flex-direction:column;gap:10px}",
    ".stcard{display:flex;align-items:center;gap:14px;width:100%;padding:14px;border:3px solid var(--sk);border-radius:22px;background:#fff;color:var(--sk);text-align:left;box-shadow:5px 5px 0 var(--sk);font-family:var(--st)}",
    ".stcard.alt{border-width:2px;box-shadow:3px 3px 0 var(--sk);padding:10px 12px}",
    ".stcard .badge{flex:none;display:grid;place-items:center;width:64px;height:64px;border-radius:16px;background:var(--sk);color:var(--sy)}",
    ".stcard.alt .badge{width:44px;height:44px;border-radius:12px}",
    ".stcard span{display:flex;flex-direction:column;gap:3px;min-width:0}",
    ".stcard b{font:800 1.05rem/1.2 var(--st);overflow-wrap:anywhere}.stcard small{font:500 .88rem/1.3 var(--st);color:#4a4436;overflow-wrap:anywhere}",
    ".stcard q{font:600 .95rem/1.35 var(--st);quotes:\"„\" \"“\";overflow-wrap:anywhere}.stcard i{font:700 .875rem/1.2 var(--st);font-style:normal;color:#1e5631}.stcard i.near{color:#7a4a00}",
    ".sthonest{margin:0;padding:12px 14px;border-radius:16px;background:#fff1c2;color:var(--sk);font:500 .92rem/1.4 var(--st)}",
    ".stmakebar{--sy:#F9D84A;--sc:#FBF5DD;--sk:#17140F;--sm:#4A4436;--st:system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;display:flex;flex-direction:column;gap:6px;flex:none;padding:8px 14px calc(10px + env(safe-area-inset-bottom));border-top:2px solid var(--sk);background:var(--sc);text-align:center}",
    ".stmake{width:100%;display:flex;align-items:center;justify-content:center;min-height:60px;border:0;border-radius:16px;background:var(--sk);color:var(--sy);font:400 1.5rem/1 var(--disp);letter-spacing:.5px;text-transform:uppercase}",
    ".stmake[aria-disabled=true]{background:transparent;color:var(--sk);border:2px dashed var(--sk)}",
    /* Empfang: who sent it on top, the card big, one main action, the rest quiet */
    "#recvhead{position:relative;display:flex;align-items:center;gap:12px;margin:4px 18px 8px;color:var(--on);font-family:var(--st)}",
    ".recvav{flex:none;display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:var(--sk);color:var(--sy);font:400 1.375rem/1 var(--disp)}",
    ".recvtx{display:flex;flex-direction:column;gap:2px;min-width:0}.recvtx strong{font:800 1.125rem/1.25 var(--st);overflow-wrap:anywhere}.recvtx span{font:500 .875rem/1.3 var(--st);overflow-wrap:anywhere}",
    "#home.recv #wishgo,#home.recv #livego,#home.recv #from.stdup,#home.recv #leaf .dateline{display:none!important}#home.recv #homerow{justify-content:space-between}",
    "#home.recv #homerow button{flex:0 1 auto;min-height:44px;padding:0 6px;border:0;background:transparent;color:var(--on);font:700 .9375rem/1.2 var(--st);text-decoration:underline;text-underline-offset:3px}",
    "@media (max-width:300px){#recvhead{margin:2px 14px 4px}.recvav{display:none}.recvtx strong{font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.recvtx span{display:none}}",
    "@media (max-height:560px){#recvhead{margin:2px 18px 4px;gap:8px}.recvav{width:36px;height:36px;font-size:1.1rem}.recvtx strong{font-size:1rem}}",
    "#home.recv #kireport{font-weight:500;font-size:.875rem}#home.recv #kireport:disabled{text-decoration:none;opacity:1}",
    /* Fertig: "Wer bekommt sie?", one button that opens the share menu, an honest line about the link */
    "#donetitle{flex:1;margin:0 4px;font:400 1.5rem/1.05 var(--disp);text-transform:uppercase;color:var(--on);overflow-wrap:anywhere}",
    "#share.st1{display:flex;align-items:center;justify-content:center;gap:12px;font-size:1.6rem}",
    "#share.st1::before{content:\"\";flex:none;width:1em;height:1em;background:currentColor;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3v12M7 8l5-5 5 5M5 14v6h14v-6'/%3E%3C/svg%3E\") center/contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 3v12M7 8l5-5 5 5M5 14v6h14v-6'/%3E%3C/svg%3E\") center/contain no-repeat}",
    /* Fertig on a phone: the picture keeps a real size above "Teilen" (the main button stays on the first screen); Mehr,
       the note, the row and the account offer follow by scrolling instead of squeezing the picture */
    "@media (max-width:899px){#done:has(#share.st1){overflow-y:auto}#done:has(#share.st1) #donewrap{flex:1 0 auto;min-height:min(18rem,calc(100svh - 9rem))}}",
    "#staccount{margin:4px 18px 12px;padding:12px 14px;border:2px solid var(--on);border-radius:16px;color:var(--on);font:500 .875rem/1.45 var(--st)}#staccount[hidden]{display:none}#staccount p{margin:0 0 8px}",
    "#staccount button{min-height:44px;padding:0 18px;border:2px solid var(--on);border-radius:999px;background:transparent;color:var(--on);font:700 .95rem var(--st);cursor:pointer}",
    "#shnote.st1{margin:0 18px 8px;padding:12px 14px;border-radius:16px;background:#fff;color:var(--sk);font:500 .875rem/1.45 var(--st)}"
  ].join("\n");
  function style() {
    if ($("startcss")) return;
    var s = document.createElement("style"); s.id = "startcss"; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ---------- the start page ---------- */
  var box = null, refs = {};
  var TILES = ["gruss", "planen", "spielen", "stimme"];
  function build() {
    if (box) return box;
    style();
    box = el("section"); box.id = "startbox"; box.setAttribute("aria-labelledby", "starth");
    var h = el("h2"); h.id = "starth"; box.appendChild(h);
    var f = el("form", "stform"); f.setAttribute("role", "search"); f.noValidate = true;
    f.appendChild(icon("star", 20));
    var inp = el("input", "stin"); inp.id = "satz"; inp.type = "text"; inp.autocomplete = "off"; inp.enterKeyHint = "go"; inp.maxLength = 120;
    var mic = el("button", "stico mic"); mic.id = "satzmic"; mic.hidden = true; mic.setAttribute("aria-pressed", "false"); mic.appendChild(icon("stimme", 22));
    var go = el("button", "stico go"); go.type = "submit"; go.id = "satzgo"; go.appendChild(icon("go", 22));
    f.appendChild(inp); f.appendChild(mic); f.appendChild(go);
    f.addEventListener("submit", function (e) { e.preventDefault(); Kit.sfx.tap(); create(inp.value, ""); });
    mic.addEventListener("click", function () { listen(inp, mic, function () { create(inp.value, ""); }); });
    box.appendChild(f);
    var grid = el("div", "sttiles"); grid.setAttribute("role", "group");
    TILES.forEach(function (k, i) {
      var b = el("button", "sttile t" + i, null, function () { Kit.sfx.tap(); create("", k); });
      b.dataset.i = k; b.appendChild(icon(k, 26)); b.appendChild(el("b")); b.appendChild(el("small"));
      grid.appendChild(b);
    });
    box.appendChild(grid);
    // "Alle Karten": the shelf of every card, with the search and the free card on top; no strip opens here
    var all = el("button", "stall", null, function () { Kit.sfx.tap(); allShelf(); }); all.id = "allcards"; all.appendChild(icon("grid", 20)); all.appendChild(el("span"));
    box.appendChild(all);
    // the old demo strip (app.js feats: games, Webconference, ...) only quietly at the foot, closed; never Tunnel or Alle Demos
    var more = el("button", "stfoot"); more.id = "stmore"; more.setAttribute("aria-controls", "allbox");
    var drawer = el("div"); drawer.id = "allbox";
    drawer.appendChild($("feat"));
    more.addEventListener("click", function () { Kit.sfx.tap(); openAll(more.getAttribute("aria-expanded") !== "true"); });
    refs = { h: h, inp: inp, mic: mic, go: go, grid: grid, all: all, more: more, drawer: drawer };
    var slot = $("startslot"); if (slot) slot.replaceWith(box); else $("homerow").after(box);
    $("tools").after(more); more.after(drawer);
    micCheck(mic);
    openAll(!!Kit.store.alle || !!window.DailyShelfOpen, true);   // DailyShelfOpen: a link to a card that is gone (app.js route)
    // the start page scrolls: a field that gets the focus comes into sight (the keyboard covers the lower half), as the
    // scrolling sheet does it (app.js, .roll)
    $("home").addEventListener("focusin", function (e) { if (this.classList.contains("neu") && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.target.scrollIntoView({ block: "nearest" }); });
    return box;
  }
  // Open or closed is remembered on this device only (a convenience, not a setting): whoever opened it once finds it open.
  function openAll(on, quiet) {
    refs.more.setAttribute("aria-expanded", String(on)); refs.drawer.hidden = !on || refs.more.hidden;
    if (quiet) return;
    if (on) Kit.store.alle = true; else delete Kit.store.alle;
    Kit.save();
  }
  function paint() {
    if (!box) return;
    refs.h.textContent = t("st_ask");
    refs.inp.placeholder = t("st_hint"); refs.inp.setAttribute("aria-label", t("st_field"));
    refs.mic.setAttribute("aria-label", t("st_mic")); refs.go.setAttribute("aria-label", t("st_go"));
    refs.grid.setAttribute("aria-label", t("st_ask"));
    Array.from(refs.grid.children).forEach(function (b) { b.querySelector("b").textContent = t("st_" + b.dataset.i); b.querySelector("small").textContent = t("st_" + b.dataset.i + "_s"); });
    refs.all.lastChild.textContent = t("st_all"); refs.more.textContent = t("st_gallery");
  }

  /* ---------- Vorschaubilder: what a game looks like, before it is opened ---------- */
  // Every card of the shelf has a real screenshot of its game (scripts/shots.js, src/shots/<id>.webp), packed into the parts
  // bilda, bildb … (scripts/build.js; StartData.shots: id -> part), shown in "Alle Karten" and on the day's sheet (dayShot);
  // the start page itself shows no strip of them (only the day's picture). A tile is the picture, big, with two plain facts in its
  // corner (how long it takes) and under it the title and how it is played (both from the catalog). Nothing is counted,
  // nothing urges. A picture's part is loaded when its tile comes near the screen; with Save-Data none are loaded, and a
  // tile without its picture (offline, part missing) keeps its title on a quiet colour.
  var SHOTS = (root.StartData && root.StartData.shots) || {}, seen = null;
  var KINDS = { arcade: "st_k_arcade", game: "st_k_arcade", photo: "st_k_photo", sound: "st_k_sound", table: "table", card: "card" };
  function lean() {
    try { var c = navigator.connection; return !!(c && c.saveData) || !!(root.matchMedia && matchMedia("(prefers-reduced-data: reduce)").matches); } catch (e) { return false; }
  }
  function kindOf(i) { var g = i.turn && i.turn.g; return g && root.Turns ? t("bdg_" + root.Turns.who(g)) : t(KINDS[i.kind] || "turn"); }
  function lenOf(n) { return n >= 120 ? t("mins", { n: Math.round(n / 60) }) : t("sec", { n: n }); }
  function show(img) {
    var id = img.dataset.shot, part = SHOTS[id];
    if (!part || lean() || !root.Parts) return;
    root.Parts.need(part).then(function () { var u = root.DailyShots && root.DailyShots[id]; if (u) img.src = u; }, function () {});
  }
  function watch(img) {
    if (!root.IntersectionObserver) return show(img);
    seen = seen || new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { seen.unobserve(e.target); show(e.target); } }); }, { rootMargin: "300px" });
    seen.observe(img);
  }
  function shotTile(i) {
    var L = ideaText(i), b = el("button", "stshot", null, function () { Kit.sfx.thud(); openCard(i); });
    var f = el("span", "stpic"), img = document.createElement("img");
    img.alt = t("st_shot", { s: L.s || D.plainTitle(L.t) }); img.width = 216; img.height = 288; img.decoding = "async"; img.dataset.shot = i.id;
    img.addEventListener("load", function () { f.classList.add("on"); });
    f.appendChild(img);
    if (i.min) f.appendChild(el("span", "stlen", lenOf(i.min)));
    b.appendChild(f); b.appendChild(el("b", "", D.plainTitle(L.t))); b.appendChild(el("small", "", kindOf(i)));
    watch(img);
    return b;
  }
  // The day's card on its sheet: its picture in place of the drawn card, on the same canvas (#pvcard, same size and place,
  // so the sheet's layout stays as it is), the title under it as before. Not for a running game (arcade, the flight game:
  // the sheet plays it live), not for a card with a name field (warm cards, drawn with the name) and not with Save-Data.
  // app.js draws the card again when the font has come (fonts.load): the picture follows it.
  // Not either where the picture is a moment later in the game (scripts/shots.js: a turn card's finished game in a shelf
  // colour pair, Bauernskat mid-hand): what is tapped must be what opens, so those keep the drawn card, the very start
  // in the person's own colours. Their pictures stay on the tiles ("So sieht es aus", "Alle Karten").
  var shotOn = null;
  function dayShot(h) {
    var c = $("pvcard"), i = h && h.idea;
    if (!c) return;
    if (c.dataset.shot) { delete c.dataset.shot; c.setAttribute("aria-label", t("a_preview")); }
    shotOn = null;
    if (!i || h.doc || /^(arcade|game)$/.test(i.kind) || i.kind === "turn" || i.id === "tisch-bauernskat" || (W && W.is(i)) || !SHOTS[i.id] || lean() || !root.Parts) return;
    shotOn = h;
    root.Parts.need(SHOTS[i.id]).then(function () {
      var u = root.DailyShots && root.DailyShots[i.id], img = new Image();
      if (!u || shotOn !== h) return;
      img.onload = function () {
        var draw = function () {
          if (shotOn !== h || A().home() !== h) return;
          var x = c.getContext("2d"), sw = img.width, sh = img.height, r = c.height / c.width;
          if (sh / sw > r) sh = sw * r; else sw = sh / r;   // cover: the middle of the picture fills the card
          x.imageSmoothingQuality = "high"; x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
          c.dataset.shot = i.id; c.setAttribute("aria-label", t("st_shot", { s: ideaText(i).s || D.plainTitle(ideaText(i).t) }));
        };
        draw(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { setTimeout(draw, 0); });
      };
      img.src = u;
    }, function () {});
  }
  // The day's sheet and every sheet chosen from here get the new start; whatever came by link keeps its own page.
  // The bubbles on the day's card and the free card (part blasen, src/blasen-start.js): asked for only after the first
  // paint, when the page is idle, and not with Save-Data; once there, each new sheet places them anew.
  function bubbles() {
    if (root.Blasen && root.Blasen.start) { root.Blasen.start(); return; }
    if (lean() || !root.Parts || root.Parts.names().indexOf("blasen") < 0) return;
    var go = function () { root.Parts.use("blasen", function () { if (root.Blasen && root.Blasen.start && !$("home").hidden) root.Blasen.start(); }).catch(function () {}); };
    if (root.requestIdleCallback) root.requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 400);
  }
  function home(h) {
    build(); paint(); mute(); setTimeout(bubbles, 0);
    var on = !!h && !h.note && !h.doc;
    $("home").classList.add("neu"); box.hidden = !on;
    refs.more.hidden = !on; openAll(refs.more.getAttribute("aria-expanded") === "true", true);
    acts(on);
    // back from signing in for "Erschaffe deine Karte" (create-ui.js, ?go=erschaffen): straight into making the free card,
    // with the category tapped on the start page before, if any (app.js openFree)
    if (/[?&]go=erschaffen\b/.test(location.search)) {
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
      A().free();
    }
    receive(h);
    dayShot(on && h);
    first(); requestAnimationFrame(first);
    // the burst on the sheet in plain words for a first visit: "Spiel", not "Arcade"; "Bild", not "Meme"
    var k = on && h.idea && h.idea.kind, dk = document.querySelector("#leaf .dkind");
    if (dk && (k === "arcade" || k === "photo" || k === "sound")) dk.textContent = dk.textContent.replace(/^[^\n]*/, t("st_k_" + k));
  }
  function labels() { paint(); mute(); done(); }

  // On the day's start: "Look würfeln" and "Live ansehen" on the card (bottom right, the thumbs on the left); elsewhere back
  // in the row under the main button as before.
  // Only on a phone upright (301-899 px wide, from 560 px high): with zoom (narrower or lower) or in two columns the row stays.
  function acts(on) {
    on = on && matchMedia("(orientation:portrait) and (min-width:301px) and (max-width:899px) and (min-height:560px)").matches;
    var a = $("stacts");
    if (!a) { a = el("div"); a.id = "stacts"; $("leaf").appendChild(a); }
    ["wishgo", "livego"].forEach(function (id) { var b = $(id); if (on) a.appendChild(b); else if (b.parentNode === a) $("kireport").before(b); });
  }

  /* ---------- "Alle Karten": every card of the catalog, the search, the free card always on top ---------- */
  function allShelf() {
    A().shelf(t("st_all"), function (b) {
      if (!$("create").hidden) {
        var fr = el("button", "stfree", null, function () { $("create").click(); }); fr.id = "allfree";
        var s = el("span"); s.appendChild(el("b", "", t("create_tile"))); s.appendChild(el("small", "", t("create_sub")));
        fr.appendChild(icon("star", 26)); fr.appendChild(s); b.appendChild(fr);
      }
      var q = el("input", "field"), list = el("div"), T = root.DailyTexts || {}, L = T[Kit.lang] || T.de || {};
      q.type = "search"; q.id = "allq"; q.placeholder = t("pastSearch"); q.setAttribute("aria-label", t("pastSearch")); q.autocomplete = "off"; q.enterKeyHint = "search";
      list.id = "alllist";
      // without a search: every card of the shelf with its picture (Vorschaubilder; a tile without its picture keeps its
      // title); a search shows the hits as a list
      var shots = el("div", "stshots"); shots.id = "allshots";
      function fill() {
        list.textContent = "";
        var v = q.value.trim(), c = D.caps();
        shots.hidden = !!v;
        if (!v && !shots.firstChild) D.IDEAS.filter(function (i) { return D.available(i, c); }).forEach(function (i) { shots.appendChild(shotTile(i)); });
        var ideas = v ? D.searchIdeas(v, new Date()).map(function (h) { return h.idea; }) : D.IDEAS.filter(function (i) { return D.available(i, c); });
        ideas.forEach(function (i) {
          var r = el("button", "day", null, function () { Kit.sfx.tap(); A().sheet({ date: new Date(), idea: i }); });
          r.appendChild(el("b", "", "✦")); r.appendChild(el("span", "", D.plainTitle((i[Kit.lang] || i.de || {}).t)));
          if (L[i.kind]) r.appendChild(el("small", "", L[i.kind]));
          list.appendChild(r);
        });
        if (!ideas.length) list.appendChild(el("div", "empty", t("pastNone")));
      }
      q.addEventListener("input", fill);
      b.appendChild(q); b.appendChild(list); b.appendChild(shots); fill();
    });
  }

  /* ---------- Empfang ---------- */
  var head = null, selbst = null, PLAY = ["game", "arcade", "duel", "quest", "table"];
  function recvBuild() {
    if (head) return;
    head = el("div"); head.id = "recvhead";
    var av = el("span", "recvav"); av.setAttribute("aria-hidden", "true");
    var tx = el("div", "recvtx"), who = el("strong"), sub = el("span"); who.id = "recvwho"; sub.id = "recvsub";
    tx.appendChild(who); tx.appendChild(sub); head.appendChild(av); head.appendChild(tx);
    $("pad").before(head);
    // leave the card, start something of one's own: the day's start page
    selbst = el("button", "", null, function () { Kit.sfx.tap(); var n = new Date(); A().sheet({ date: n, idea: D.ideaForDay(n) }); });
    selbst.id = "selbst"; $("homerow").prepend(selbst);
  }
  // "Von {Name}, für dich": the name from the sender's field (the trail, warm.js sender: a plain first name), else "Jemand".
  function receive(h) {
    recvBuild();
    var on = !!(h && h.doc && h.note);
    $("home").classList.toggle("recv", on); head.hidden = !on; selbst.hidden = !on;
    if (!on) { var lb = $("langpick"); if (lb && lb.nextElementSibling !== $("go")) $("go").before(lb); return; }
    var doc = h.doc, n = W.sender(doc) || t("someone"), X = root.DailyModes || {}, mode = X[doc.k] && X[doc.k].label && X[doc.k].label(doc);
    head.firstChild.textContent = n.charAt(0).toUpperCase();
    $("recvwho").textContent = t("st_from", { n: n });
    // a turn card says where it stands in its own line (#from); otherwise that line would only name the sender again
    var sub = $("recvsub"); sub.textContent = ""; sub.hidden = true; $("from").classList.toggle("stdup", !mode);
    // one main action by kind; a turn card keeps its own words (Wann kannst du?, Raten …), a voice card its "🎙 Antworten"
    if (!mode && !(doc.k === "sound" && doc.m === "voice")) $("go").textContent = t(PLAY.indexOf(doc.k) >= 0 ? "st_play" : "st_reply");
    selbst.textContent = t("st_self");
    var kr = $("kireport"); if (!kr.disabled) kr.textContent = t("st_report");
    // the language choice is not what a received card is about: below "Melden", out of the first screen
    var lp = $("langpick"); if (lp && lp.previousElementSibling !== $("homerow")) $("homerow").after(lp);
  }

  /* ---------- Fertig: one tap to the share menu ---------- */
  var copyB = null;
  function done() {
    var r = A().res && A().res();
    if (!r || !box) return;
    var bar = $("dback").parentNode, title = $("donetitle");
    if (!title) { title = el("h2"); title.id = "donetitle"; bar.insertBefore(title, $("dback").nextSibling); }
    title.textContent = t("st_done");
    var sh = $("share"), h = A().home(), to = r.doc && W.is(r.doc) && h && h.to ? W.name(h.to) : "";
    sh.classList.add("st1"); sh.textContent = to ? t("st_sendTo", { n: to }) : t("share");
    // honest about the link: made at "Fertig", how long it stays (24 hours until opened, then 90 days), or the long link
    var note = $("shnote"), k = r.doc && r.doc.k === "photo" ? "photo" : "", line;   // the voice: the sheet "Als Datei verschicken" says it
    if (!r.link) line = t("st_shortWait");
    else if (r.link.short) { var e = (Kit.store.links || []).filter(function (x) { return x.id === r.link.id; })[0]; line = t(e && e.exp - Date.now() < 2 * 86400000 ? "st_shortDay" : "st_shortOk"); }
    else line = t(root.ShortLink && !root.ShortLink.fragmentOf(r.url) ? "st_shortLong" : "st_shortNo");
    if (t("sh_note")) { note.classList.add("st1"); note.textContent = [line, k ? t("sh_" + k) : ""].filter(Boolean).join(" "); }
    if (!copyB) {
      copyB = el("button", "btn", null, function () { Kit.sfx.tap(); var x = A().res(), u = x && (x.link ? x.link.url : x.url); if (u) Kit.copy(u).then(function (ok) { Kit.toast(t(ok ? "st_copied" : "shareFail")); if (ok && A().count) A().count("copy"); }); });
      copyB.id = "copylink"; $("tostory").after(copyB);   // with Status and Story under "Mehr": the row below keeps its three buttons
    }
    copyB.textContent = t("st_copy");
    // without a login: an offer, quiet and below the rest (no pressure, nothing changes without it); linked: nothing.
    // Honest about what travels: a photo work stays on this device, so for it the offer names only what does go along.
    var acc = $("staccount"), p = Kit.store.profile, linked = !!(p && (p.via === "account" || p.via === "code"));
    if (!acc) {
      acc = el("div"); acc.id = "staccount"; acc.appendChild(el("p"));
      acc.appendChild(el("button", "", null, function () { Kit.sfx.tap(); A().style.open(); }));
      $("dhome").parentNode.after(acc);
    }
    acc.hidden = linked; acc.firstChild.textContent = t(k === "photo" ? "st_accPhoto" : "st_acc"); acc.lastChild.textContent = t("st_accGo");
  }
  // Rule A4: the main button is on the first screen without scrolling. A short screen (a small phone, 200 % zoom) and a card
  // that came by link give the sheet exactly the room left above the main button; what follows is reached by scrolling. A
  // tall phone keeps the fixed sheet height from the CSS, a wide screen its two columns.
  function first() {
    var H = $("home"), pad = $("pad"), go = $("go");
    pad.style.height = ""; pad.style.flex = "";
    if (H.hidden || !H.classList.contains("neu") || getComputedStyle(H).display === "grid") return;
    var recv = !box || box.hidden;
    if (!recv && innerHeight > 700) return legible(pad);
    // the big-type order (intentions first, <= 300 px): the day's card keeps a real size below them, it is not squeezed
    if (!recv && innerWidth <= 300) { pad.style.flex = "none"; pad.style.height = Math.round(Math.min(Math.max(240, innerHeight * 0.7), 480)) + "px"; if (A().style && A().style.fit) A().style.fit(); return; }
    // measured with everything shown: the sheet's own fitting (app.js fitCard, .lean/.roll) decides again afterwards
    var had = ["lean", "roll"].filter(function (c) { return H.classList.contains(c); });
    H.classList.remove("lean", "roll");
    // only a card someone sent (#leaf.got) gives up room for the quiet row; a catalog link (#i=) keeps its sheet as before
    var got = recv && $("leaf").classList.contains("got");
    var used = 0, quiet = 0, e = pad.nextElementSibling, ps = getComputedStyle(pad), row = $("homerow");
    for (; e; e = e.nextElementSibling) {
      var cs = getComputedStyle(e), hh = e.getClientRects().length ? e.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom) : 0;
      if (e === row) { quiet = hh; break; }
      used += hh;
      if (e === go && !got) break;
    }
    var room = H.clientHeight - pad.offsetTop - parseFloat(ps.marginBottom) - used - 8;   // 8: the shadow under the main button
    // received: "Selbst eine machen" and "Melden" on the first screen too, as long as the card keeps its room (sheet >= 200 px)
    if (got && room - quiet >= 200) room -= quiet;
    had.forEach(function (c) { H.classList.add(c); });
    pad.style.flex = "none"; pad.style.height = Math.max(96, Math.floor(room)) + "px";
    if (A().style && A().style.fit) A().style.fit();
  }
  // The day's title is never smaller than 14 px (readers up to 85): on a tall phone the sheet has a fixed height from the
  // CSS, and a long title with a two-line subtitle (11 Nov, "Auktion der Agenten") would shrink to 10 px. The sheet grows
  // in 4 px steps until every title line has 14 px; what lies below (the second row of tiles) moves down instead.
  var TITLE_MIN = 14;
  function titleMin(hero) { var m = Infinity; Array.from(hero.children).forEach(function (s) { var f = parseFloat(s.style.fontSize); if (f) m = Math.min(m, f); }); return m; }
  function legible(pad) {
    var hero = $("hero"), fit = A().style && A().style.fit;
    if (!fit || !hero || !hero.children.length || !hero.getClientRects().length || !hero.clientWidth) return;
    fit();
    for (var base = pad.offsetHeight, n = 1; titleMin(hero) < TITLE_MIN && n <= 40; n++) { pad.style.flex = "none"; pad.style.height = base + 4 * n + "px"; fit(); }
  }
  addEventListener("resize", function () { if (box) { acts(!box.hidden); first(); } });
  // the display font arrives after the first paint and changes the heights above the main button
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (box) first(); });
  function mute() { var m = $("mute"); if (m && box) { m.textContent = ""; m.appendChild(icon(Kit.muted ? "mute" : "sound", 22)); } }

  /* ---------- speech: only where the browser says it recognises on the device (audio never leaves it) ---------- */
  var SR = root.SpeechRecognition || root.webkitSpeechRecognition;
  // Server-side recognition (Chrome's default, Safari's Siri) would send the voice away: listening starts only after the
  // browser said, for this language, that it recognises on the device (SpeechRecognition.available with processLocally) and
  // with processLocally set. Asked only after a tap on the microphone, never at load (a browser without the speech service
  // may fall over on the question). The app shells keep the phone's own dictation on the keyboard instead.
  // The answer is remembered on this device (Kit.store.mic "ok" | "no"): the microphone shows only once it is known to work
  // here; before that the sheet "Deine Karte" offers a neutral check, and "no" is said once and never offered again.
  function micOk() { return !!SR && typeof SR.available === "function" && !root.DuellHost && location.hostname !== "appassets.androidplatform.net"; }
  function micCheck(b) { b.hidden = !(micOk() && Kit.store.mic === "ok"); }
  function off(b) { b.hidden = true; b.setAttribute("aria-pressed", "false"); Kit.store.mic = "no"; Kit.save(); Kit.toast(t("st_micOff")); }
  function probe() {
    var ask;
    try { ask = Promise.resolve(SR.available({ langs: [Kit.loc()], processLocally: true })); } catch (e) { ask = Promise.resolve(""); }
    return ask.then(function (s) { Kit.store.mic = s === "available" ? "ok" : "no"; Kit.save(); return Kit.store.mic === "ok"; }, function () { Kit.store.mic = "no"; Kit.save(); return false; });
  }
  function listen(field, b, done) {
    if (!micOk() || b.getAttribute("aria-pressed") === "true") return;
    b.setAttribute("aria-pressed", "true");
    probe().then(function (ok) {
      var r = null;
      if (ok) try { r = new SR(); r.lang = Kit.loc(); r.processLocally = true; r.interimResults = false; r.maxAlternatives = 1; } catch (e) { r = null; }
      if (!r || r.processLocally !== true) return off(b);   // no promise of the device: no listening
      Kit.toast(t("st_micOn"));
      r.onresult = function (e) { var x = e.results && e.results[0] && e.results[0][0]; if (x && x.transcript) { field.value = String(x.transcript).slice(0, 120); done(); } };
      r.onerror = function () { off(b); };
      r.onend = function () { b.setAttribute("aria-pressed", "false"); };
      try { r.start(); } catch (e) { off(b); }
    }, function () { off(b); });
  }

  /* ---------- "Deine Karte": one sentence -> the card that fits ---------- */
  function ideaText(i) { return i[Kit.lang] || i.de; }
  function badge(intent) { var s = el("span", "badge"); s.appendChild(icon(intent || "star", 30)); return s; }
  // Opens a card: a feel-good card as its sheet with the name already in front (its button "Karte fertig machen" is the
  // "Fertig" that makes the link); every other card its editor or game, as a tap on its main button. Nothing goes to the
  // server here. The sheet stays the chosen card, as after "Letzte Tage".
  function callTo(idea, r) { var to = r && W.is(idea) ? SI.callName(r, Kit.lang) : ""; return to && W.name(to) ? to : ""; }
  function openCard(idea, r) {
    var to = callTo(idea, r);
    A().sheet({ date: new Date(), idea: idea, to: to || undefined });
    if (!W.is(idea)) return $("go").click();
    // the sheet gets its height from first() and the card's fitting in the next frames: the button comes into sight after
    // that layout, not before (at 150 %/200 % an earlier scroll left it below the screen)
    var g = $("go"); if (!g) return;
    g.focus({ preventScroll: true });
    requestAnimationFrame(function () { first(); requestAnimationFrame(function () { g.scrollIntoView({ block: "nearest" }); }); });
  }
  // the line the card will carry, as it comes out ("Oma, danke, dass es dich gibt.")
  function lineOf(idea, r) { try { return W.is(idea) ? W.cardFor(idea, callTo(idea, r), A().me(), Kit.lang).x : ""; } catch (e) { return ""; } }
  function cardRow(x, intent, r, alt) {
    var i = x.idea, L = ideaText(i), b = el("button", "stcard" + (alt ? " alt" : ""), null, function () { Kit.sfx.thud(); openCard(i, r); });
    b.appendChild(badge(intent || SI.intentOf(i)));
    var s = el("span"), line = !alt && lineOf(i, r); s.appendChild(el("b", "", D.plainTitle(L.t)));
    if (line) s.appendChild(el("q", "", line)); else if (L.s) s.appendChild(el("small", "", L.s));
    if (!alt) s.appendChild(el("i", x.exact ? "" : "near", t(x.exact ? "st_exact" : "st_near")));
    b.appendChild(s);
    return b;
  }
  function create(text, intent) {
    A().shelf(t("st_title"), function (b) {
      var c = el("div", "stc"), forced = intent || "", last = null;
      var bx = el("div", "stbox"), lab = el("label", "", t("st_what")), row = el("div", "strow"), ta = el("textarea", "stta");
      ta.id = "wunsch"; ta.rows = 2; ta.maxLength = 120; ta.value = text || ""; lab.htmlFor = "wunsch"; ta.setAttribute("enterkeyhint", "done");
      var mic = el("button", "stico mic"); mic.setAttribute("aria-label", t("st_mic")); mic.setAttribute("aria-pressed", "false"); mic.appendChild(icon("stimme", 22)); micCheck(mic);
      mic.addEventListener("click", function () { listen(ta, mic, function () { forced = ""; show(); }); });
      row.appendChild(ta); row.appendChild(mic); bx.appendChild(lab); bx.appendChild(row);
      c.appendChild(bx); c.appendChild(el("p", "stnote", t("st_local")));
      var res = el("section"); res.id = "stres"; res.setAttribute("aria-live", "polite"); c.appendChild(res);
      var ideas = el("div", "stchips");
      ["st_ex1", "st_ex2", "st_ex3"].forEach(function (k) { ideas.appendChild(el("button", "stbtn", t(k), function () { Kit.sfx.tap(); ta.value = t(k); forced = ""; show(); })); });
      c.appendChild(el("h3", "", t("st_ideas"))); c.appendChild(ideas);
      var make = el("button", "stmake"); make.id = "stmake"; make.textContent = t("st_make");
      make.addEventListener("click", function () {
        if (make.getAttribute("aria-disabled") === "true") { ta.focus(); return; }
        Kit.sfx.thud(); openCard(last.top[0].idea, last);
      });
      var bar = el("div", "stmakebar"); bar.appendChild(make); bar.appendChild(el("p", "stnote stfree", t("st_free")));
      document.querySelectorAll("#shelf .stmakebar").forEach(function (x) { x.remove(); });
      $("shbody").after(bar);
      var mo = new MutationObserver(function () { if (!c.isConnected) { bar.remove(); mo.disconnect(); } }); mo.observe($("shbody"), { childList: true });
      if (micOk() && !Kit.store.mic) {
        var chk = el("button", "stbtn stghost", t("st_micAsk"), function () { Kit.sfx.tap(); probe().then(function (ok) { chk.remove(); if (ok) { micCheck(mic); micCheck(refs.mic); mic.focus(); } else c.insertBefore(el("p", "stnote", t("st_micNo")), c.children[2]); }); });
        chk.id = "micask"; c.insertBefore(chk, c.children[2]);
      }
      b.appendChild(c);
      var timer = 0;
      ta.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { forced = ""; show(); }, 220); });
      ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); clearTimeout(timer); forced = ""; show(); if (last && last.top.length) make.focus(); } });
      function show() {
        res.textContent = "";
        var r = last = SI.understand(ta.value, { intent: forced, date: new Date() }), any = !!ta.value.trim() || !!forced;
        make.setAttribute("aria-disabled", String(!r.top.length));
        if (!any) { res.appendChild(el("p", "stnote", t("st_empty"))); return; }
        // what was understood, as plain chips; the change offers the four intentions, one tap each
        res.appendChild(el("h3", "", t("st_heard")));
        var chips = el("div", "stchips");
        if (r.intent) chips.appendChild(el("span", "stchip", t("st_" + r.intent)));
        var who = r.name || (r.who && (r.who[Kit.lang] || r.who.de));
        if (who) chips.appendChild(el("span", "stchip", t("st_for", { n: who })));
        var g = r.top[0] && r.top[0].idea.turn && r.top[0].idea.turn.g;
        if (g && root.Turns && root.Turns.GAMES[g]) chips.appendChild(el("span", "stchip", t("bdg_" + root.Turns.who(g))));
        var ch = el("button", "stbtn stghost", t("st_change")); ch.setAttribute("aria-expanded", "false"); ch.setAttribute("aria-controls", "stpick");
        chips.appendChild(ch); res.appendChild(chips);
        var pick = el("div", "stchips"); pick.id = "stpick"; pick.hidden = true; pick.setAttribute("role", "group"); pick.setAttribute("aria-label", t("st_pick"));
        TILES.forEach(function (k) {
          var p = el("button", "stbtn", t("st_" + k), function () { Kit.sfx.tap(); forced = k; show(); var f = res.querySelector(".stcard"); if (f) f.focus(); });
          p.setAttribute("aria-pressed", String(k === r.intent)); pick.appendChild(p);
        });
        ch.addEventListener("click", function () { var on = pick.hidden; pick.hidden = !on; ch.setAttribute("aria-expanded", String(on)); if (on) pick.firstChild.focus(); });
        res.appendChild(pick);
        // honest: what is not here yet is named, and no card at all is said plainly
        if (r.missing) res.appendChild(el("p", "sthonest", t("st_missing", { w: r.missing[Kit.lang] || r.missing.de })));
        if (!r.top.length) { res.appendChild(el("p", "sthonest", t("st_none"))); return; }
        res.appendChild(el("h3", "", t("st_becomes")));
        res.appendChild(cardRow(r.top[0], r.intent, r, false));
        if (r.top.length > 1) {
          res.appendChild(el("h3", "", t("st_more")));
          var more = el("div", "stlist");
          r.top.slice(1, 4).forEach(function (x) { more.appendChild(cardRow(x, r.intent, r, true)); });
          res.appendChild(more);
        }
      }
      show();
      // the focus goes along to the new sheet: into the field when it is empty, else to its title (WCAG 2.4.3)
      setTimeout(function () { if (!text && !intent) ta.focus(); else { var tt = $("shtitle"); tt.tabIndex = -1; tt.focus(); } }, 0);
    });
  }

  root.StartUI = { home: home, labels: labels, create: create, icon: icon, all: function (on) { if (refs) openAll(on, true); } };
})(typeof globalThis !== "undefined" ? globalThis : this);
