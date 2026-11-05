/* Question pack on screen (part "quiz", loaded on first use): a checked night pack (no AI action), a pack from a topic or
   from the person's own learning or company text (AI kind quiz), and before anything goes out the check list for whoever
   makes it: every question can be changed or struck, "steht im Text" shows whether the answer stands in the own text, the
   seal says that AI made it. The charge comes only with "Übernehmen" (Ai.block auto returns a promise). Without AI (no
   network, nothing left) the night packs and the card's own game stay. Logic: quizpack.js, quizmake.js; packs: quiz-packs.json. */
(function () {
"use strict";
var A = window.DailyApp, Tn = window.Turns, P = window.QuizPack, M = window.QuizMake, D = window.Daily, C = window.DuellCore, Kit = window.Kit, el = A.el;
var PACKS = (window.QuizPacks && window.QuizPacks.packs) || [], TEXT_MAX = 3000, TEXT_MIN = 80, ASK_N = 6;
var TX = {
  de: { title: "Fragenpaket", name: "Titel", night: "🌙 Fertige Pakete", topic: "✨ Thema", own: "✨ Eigener Text", keys: "✨ Stichworte", nightNote: "Nachts gemacht und von Hand geprüft. Kostet keine KI-Aktion.",
    none: "Für diese Karte gibt es noch kein fertiges Paket.", qn: "{n} Fragen", ab: "ab {n}", topicL: "Thema", topicH: "z. B. Vulkane", keysL: "Drei Stichworte zur Gruppe", keysH: "z. B. Klassenfahrt, Fußball, Kochen",
    textL: "Dein Lernstoff (Text einfügen)", textH: "Text aus Heft oder Buch einfügen …", count: "{n} von {m} Zeichen, mindestens {k}", ownNote: "Nur dieser Text geht an die KI, kein Foto. Er wird nicht gespeichert.",
    make: "Fragen machen", check: "Vor dem Senden prüfen", byAi: "KI · bitte jede Frage prüfen", byNight: "🌙 Nachtpaket · mit KI gemacht, von Hand geprüft", inText: "✓ steht im Text", notIn: "⚠ nicht im Text gefunden",
    q: "Frage {n}", right: "Richtig", wrong: "Falsch", strike: "✕ Streichen", back: "↶ Zurückholen", types: "Ergebnistypen (nur Stärken)", typeN: "Typ", typeS: "Stärke", to: "→ {n}",
    take: "Übernehmen", drop: "Verwerfen", fit: "{n} von {m} Fragen passen in den Link.", fitAll: "Alle {n} Fragen passen in den Link.", few: "Zu wenige Fragen: mindestens 3.", long: "Zu lang für einen Link: Texte kürzen oder Fragen streichen.", sub: "Fragenpaket mit {n} Fragen", nums: "Für Schätzen braucht es 3 Fragen mit einer Zahl als Antwort.",
    took: "Paket übernommen", noAi: "Ohne KI geht es weiter: fertige Pakete oder die Karte ohne Paket.", help: "Du bist nicht allein. Nummer gegen Kummer: 116 111 (kostenlos, anonym). TelefonSeelsorge: 0800 111 0 111, rund um die Uhr." },
  en: { title: "Question pack", name: "Title", night: "🌙 Ready packs", topic: "✨ Topic", own: "✨ Own text", keys: "✨ Keywords", nightNote: "Made at night and checked by hand. Costs no AI action.",
    none: "There is no ready pack for this card yet.", qn: "{n} questions", ab: "from {n}", topicL: "Topic", topicH: "e.g. volcanoes", keysL: "Three keywords about the group", keysH: "e.g. school trip, football, cooking",
    textL: "Your study text (paste it)", textH: "Paste text from your notes or book …", count: "{n} of {m} characters, at least {k}", ownNote: "Only this text goes to the AI, never a photo. It is not stored.",
    make: "Make questions", check: "Check before sending", byAi: "AI · please check every question", byNight: "🌙 Night pack · made with AI, checked by hand", inText: "✓ stands in the text", notIn: "⚠ not found in the text",
    q: "Question {n}", right: "Right", wrong: "Wrong", strike: "✕ Strike", back: "↶ Bring back", types: "Result types (strengths only)", typeN: "Type", typeS: "Strength", to: "→ {n}",
    take: "Use it", drop: "Discard", fit: "{n} of {m} questions fit into the link.", fitAll: "All {n} questions fit into the link.", few: "Too few questions: at least 3.", long: "Too long for one link: shorten texts or strike questions.", sub: "Question pack with {n} questions", nums: "Guessing needs 3 questions with a number as the answer.",
    took: "Pack taken", noAi: "Without AI you can go on: ready packs or the card without a pack.", help: "You are not alone. In Germany: Nummer gegen Kummer 116 111 (free, anonymous), TelefonSeelsorge 0800 111 0 111, day and night." }
};
function L() { return TX[Kit.lang === "en" ? "en" : "de"]; }
function say(k, o) { return String(L()[k]).replace(/\{(\w+)\}/g, function (m, n) { return o[n]; }); }
function modus(g) { return g === "typen" ? "gruppe" : window.DailyFlavor && window.DailyFlavor.id === "business" ? "firma" : "lernen"; }
// A crisis is not for a quiz: help at once, on the device, and nothing is sent (the server would refuse it too, 422 crisis).
var CRISIS = /suizid|selbstmord|selbstverletz|umbring|nicht mehr leben|will sterben|sterben will|lebensm(ü|ue|u)de|\britzen\b|kill myself|suicid|self.?harm|want to die|end my life/i;
var CSS = ".qzseg{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.qzpack{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;padding:10px 12px;margin:0 0 8px}" +
  ".qzpack small{font:600 12px var(--ui)}.qzcard{border:3px solid var(--ink);border-radius:4px;background:#fff;color:#111;padding:10px;margin:0 0 10px}.qzcard.off .field{text-decoration:line-through;color:#555;background:#f3f3f3}" +
  ".qzcard .field{margin-bottom:6px;user-select:text;-webkit-user-select:text}.qzhead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0 0 6px}.qzbadge{display:inline-block;font:800 12px var(--ui);padding:3px 6px;border-radius:4px;margin:0 0 6px}" +
  ".qzbadge.ok{background:#dcfce7;color:#14532d}.qzbadge.no{background:#fee2e2;color:#7f1d1d}.qzbadge.ki{background:#111;color:#fff}.qzsmall{display:block;font:700 12px var(--ui);margin:0 0 4px;color:#111}.qzarea{min-height:140px;user-select:text;-webkit-user-select:text}" +
  ".qzhelp{border:3px solid var(--ink);background:#fff;color:#111;padding:10px;font:800 15px var(--ui)}.qzfoot{position:sticky;bottom:0;background:var(--paper);padding:8px 0;display:flex;flex-direction:column;gap:6px}";
function style() { if (document.getElementById("qzcss")) return; var s = document.createElement("style"); s.id = "qzcss"; s.textContent = CSS; document.head.appendChild(s); }
// area: true a big text field (own text), 2 a two-line one; hide: the label only for screen readers (the card says it)
function input(box, label, value, max, area, ph, hide) {
  if (!hide) box.appendChild(el("label", "qzsmall", label));
  var f = el(area ? "textarea" : "input", "field" + (area === true ? " qzarea" : "")); f.value = value || ""; f.maxLength = max; f.autocomplete = "off"; f.setAttribute("aria-label", label); if (ph) f.placeholder = ph; if (area === 2) f.rows = 2;
  box.appendChild(f); return f;
}
// The night packs this card and this app can use, in the page's language first.
function nightPacks(g) {
  var m = P.MODES[modus(g)], all = PACKS.filter(function (x) { return x && x.pk && x.pk.m === m && P.fits(g, P.sanitize(x.pk)); });
  var mine = all.filter(function (x) { return x.lang === Kit.lang; });
  return mine.length ? mine : all;
}
// The pack as it fits into one link, with room for one more name in the trail (quizpack.js fit).
function fit(doc, pk, ki) {
  var d0 = JSON.parse(JSON.stringify(doc)); if (ki) d0.ki = ki;
  return M.fit(d0, pk, function (d) { return Math.ceil(new TextEncoder().encode(JSON.stringify({ v: 1, d: D.sanitizeDoc(d) })).length / 3) * 4; }, C.MAX_FRAGMENT - 80, Tn.seal);
}

function open(ed) {
  style();
  var g = ed.doc.g, mo = modus(g), done = null;
  ed.styling = true;      // the shelf's back button returns to the editor with the work intact (app.js backFromStyle)
  A.shelf(L().title, function (b) {
    var seg = el("div", "qzseg"), pane = el("div"), check = el("div");
    var tabs = [["night", night]].concat(mo === "gruppe" ? [["keys", topic]] : [["topic", topic], ["own", own]]);
    tabs.forEach(function (x, i) {
      var c = el("button", "chip" + (i ? "" : " on"), L()[x[0]], function () { Kit.sfx.tap(); Array.from(seg.children).forEach(function (y) { y.classList.remove("on"); y.setAttribute("aria-pressed", "false"); }); c.classList.add("on"); c.setAttribute("aria-pressed", "true"); show(x[1]); });
      c.setAttribute("aria-pressed", String(!i)); seg.appendChild(c);
    });
    b.appendChild(seg); b.appendChild(pane); b.appendChild(check);
    function show(fn) { pane.textContent = ""; fn(pane); }
    function night(p) {
      var list = nightPacks(g);
      p.appendChild(el("p", "note", list.length ? L().nightNote : L().none));
      list.forEach(function (x) {
        var pk = P.sanitize(x.pk), n = g === "schaetzen" ? (pk.z || []).filter(Boolean).length : pk.q.length;
        var btn = el("button", "chip qzpack", null, function () { Kit.sfx.tap(); review(pk, null, null); });
        btn.appendChild(el("b", "", "🌙 " + pk.t)); btn.appendChild(el("small", "", say("qn", { n: n }) + (x.ab ? " · " + say("ab", { n: x.ab }) : "")));
        p.appendChild(btn);
      });
    }
    function ask(p, read) {
      var help = el("p", "qzhelp", L().help); help.hidden = true; help.setAttribute("role", "status");
      p.appendChild(help);
      var own = false;      // the answer is about the person's own text: then "steht im Text" is shown
      A.aiBlock(p, { kind: "quiz", label: L().make, input: function () { var i = read(); help.hidden = !(i && CRISIS.test((i.thema || "") + " " + (i.text || ""))); own = !!(i && i.text); return i && help.hidden ? i : null; },
        auto: function (opt, ki) { var pk = M.fromOption(opt); if (!pk) return false; return review(pk, ki, own ? opt : null); } });
      p.appendChild(el("p", "note", L().noAi));
    }
    function topic(p) {
      var f = input(p, mo === "gruppe" ? L().keysL : L().topicL, "", 80, false, mo === "gruppe" ? L().keysH : L().topicH);
      ask(p, function () { var v = D.cleanInput(f.value, 80); return v && Array.from(v).length >= 3 ? { modus: mo, thema: v, n: ASK_N } : null; });
    }
    function own(p) {
      var f = input(p, L().textL, "", TEXT_MAX, true, L().textH), c = el("p", "note", "");
      function up() { c.textContent = say("count", { n: f.value.length, m: TEXT_MAX, k: TEXT_MIN }); }
      f.addEventListener("input", up); up(); p.appendChild(c); p.appendChild(el("p", "note", L().ownNote));
      ask(p, function () { var v = f.value.replace(/[<>]/g, " ").trim(); return v.length >= TEXT_MIN ? { modus: mo, text: v.slice(0, TEXT_MAX), n: ASK_N } : null; });
    }
    /* The check list. pk: the pack, ki: the AI seal (null: a night pack), opt: the server's option for an own text (quelle_im_text).
       -> a promise: true once taken, false when discarded or replaced by the next one. */
    function review(pk, ki, opt) {
      if (done) done(false);
      check.textContent = "";
      return new Promise(function (resolve) {
        done = function (v) { done = null; resolve(v); };
        // per question of the pack (a question the filter dropped is not there), found by its text
        var key = function (f) { return String(f || "").replace(/\s+/g, " ").trim().slice(0, 40); }, inT = {};
        if (opt && opt.fragen) opt.fragen.forEach(function (x) { if (x) inT[key(x.f)] = x.quelle_im_text === true; });
        var src = opt && opt.fragen ? pk.q.map(function (r) { return inT[key(r[0])] === true; }) : null, hasText = !!src && modus(g) !== "gruppe";
        check.appendChild(el("p", "lbl", L().check));
        check.appendChild(el("span", "qzbadge ki", ki ? L().byAi : L().byNight));
        var tf = input(check, L().name, pk.t, 40, false), types = [], rows = [];
        if (pk.y) {
          check.appendChild(el("p", "lbl", L().types));
          pk.y.forEach(function (y, i) { var c = el("div", "qzcard"); types.push([input(c, L().typeN + " " + (i + 1), y[0], 26), input(c, L().typeS, y[1], 90, 2)]); check.appendChild(c); });
        }
        pk.q.forEach(function (row, i) {
          var c = el("div", "qzcard"), head = el("div", "qzhead"), r = { off: false, c: c };
          head.appendChild(el("b", "", say("q", { n: i + 1 })));
          var st = el("button", "chip", L().strike, function () { Kit.sfx.tap(); r.off = !r.off; c.classList.toggle("off", r.off); st.textContent = r.off ? L().back : L().strike; st.setAttribute("aria-pressed", String(r.off)); foot(); });
          st.setAttribute("aria-pressed", "false"); head.appendChild(st); c.appendChild(head);
          if (hasText) c.appendChild(el("span", "qzbadge " + (src[i] ? "ok" : "no"), src[i] ? L().inText : L().notIn));
          r.f = input(c, say("q", { n: i + 1 }), row[0], 120, 2, "", true);
          if (pk.m === "g") r.a = row.slice(1).map(function (a) { return [input(c, say("to", { n: pk.y[a[1]][0] }), a[0], 56), a[1]]; });
          else r.a = row.slice(1).map(function (a, k) { return input(c, k ? L().wrong : L().right, a, 60); });
          r.a.forEach(function (x) { (x[0] || x).addEventListener("input", foot); }); r.f.addEventListener("input", foot);
          rows.push(r); check.appendChild(c);
        });
        var bar = el("div", "qzfoot"), line = el("p", "note", ""), take = el("button", "btn hot", L().take, function () {
          var p = read(), fitted = p && fit(named(p), p, ki);
          if (!fitted) { Kit.toast(p ? L().long : L().few); return; }
          // the card shows the pack: its title and how many questions, both in the link (counted by fit)
          Kit.sfx.pop(); Object.assign(ed.doc, named(fitted)); ed.doc.pk = fitted; ed.doc.ki = D.sanitizeKi(ki) || { k: "quiz" }; ed.next = null; ed.styling = true;
          done(true); Kit.toast(L().took);
          document.getElementById("shback").click(); A.tab("Move");
        });
        bar.appendChild(line); bar.appendChild(take);
        bar.appendChild(el("button", "btn", L().drop, function () { Kit.sfx.tap(); check.textContent = ""; done(false); }));
        check.appendChild(bar);
        // What the fields say now, as a pack (null when too few questions are left); numbers for Schätzen from the answers as typed.
        function named(p) { var n = g === "schaetzen" ? (p.z || []).filter(Boolean).length : p.q.length; return Object.assign(JSON.parse(JSON.stringify(ed.doc)), { t: D.cleanInput(p.t, 40), s: say("sub", { n: Math.min(n, p.q.length) }) }); }
        function read() {
          var o = { t: tf.value, m: pk.m, q: [] };
          if (pk.y) o.y = types.map(function (x) { return [x[0].value, x[1].value]; });
          rows.forEach(function (r) { if (!r.off) o.q.push([r.f.value].concat(r.a.map(function (x) { return Array.isArray(x) ? [x[0].value, x[1]] : x.value; }))); });
          if (pk.m !== "g") o.z = o.q.map(function (x) { return P.whole(x[1]); });
          var s = P.sanitize(o);
          return s && P.fits(g, s) ? s : null;
        }
        function foot() {
          var p = read(), f = p && fit(named(p), p, ki);
          take.disabled = !f;
          line.textContent = !p ? (g === "schaetzen" ? L().nums : L().few) : !f ? L().long : f.q.length < p.q.length ? say("fit", { n: f.q.length, m: p.q.length }) : say("fitAll", { n: f.q.length });
        }
        foot();
        try { check.scrollIntoView({ block: "start" }); } catch (e) {}
      });
    }
    show(night);
  });
}
// A check list nobody decided on stays open until the next one or until the sheet is left; then Ai.drop refunds it.
window.QuizUI = { open: open, fit: fit, nightPacks: nightPacks };
})();
