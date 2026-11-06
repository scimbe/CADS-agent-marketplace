/* Satz zu Formular on screen (a part, loaded on the first tap on "Aus einem Satz"). One field for the sentence, the profile
   defaults as chips (a tap leaves one out), one AI action. What comes back is shown before anything is taken: the rules
   the AI read, and what this page computed from them (dates, amounts, deadlines), each one can be tapped away. Only
   "Übernehmen" fills the card and settles the AI action; "Verwerfen" or leaving gives it back. Without AI (no network,
   used up) the date card still reads the sentence with local rules, marked as such; every other card stays as it was. */
(function () {
"use strict";
var A = window.DailyApp, Tn = window.Turns, D = window.Daily, Kit = window.Kit, S = window.SatzLogic, Q = window.Quest, el = A.el;
var TX = {
  de: {
    h_termin: "Wann, wie lange, wo? Ein Satz reicht", h_einkauf: "Anlass oder Rezept", h_wichteln: "Wer, wie viel, welches Thema?", h_reihum: "Wofür wandert die Karte?", h_aufgaben: "Was steht an?",
    ph_termin: "Grillen bei mir nächsten Samstagabend", ph_einkauf: "Grillabend für 8, 2 vegetarisch", ph_wichteln: "Wichteln mit Anna, Ben und Carla, 15 Euro", ph_reihum: "Abschiedskarte für unsere Trainerin", ph_aufgaben: "Sommerfest der Firma am 12.6.",
    go: "Vorschlag", ki: "KI-Vorschlag", seal: "Siegel", local: "Ohne KI erkannt", read: "Erkannt", take: "Übernehmen", drop: "Verwerfen", took: "Übernommen. Du kannst alles noch ändern.",
    tap: "Antippen nimmt etwas heraus.", none: "Keine passenden Termine. Tipp die Tage unten selbst an.", byPref: "Deine Vorgaben schließen alle Termine aus. Tipp eine Vorgabe weg.",
    hol: "Ohne Feiertag: {d}", round: "{t} gibt es im Raster nicht, nächste Zeit: {h}", one: "Nur ein Termin: Für die Abstimmung tippst du unten noch einen dazu.",
    people: "Personen", veg: "davon {n} vegetarisch", guess: "angenommen", calc: "Mengen rechnet die App: pro Person mal Personen.", need: "nach Bedarf", full: "{n} passen nicht mehr in den Link.",
    left: "{n} weggelassen: keine Orte oder Kontakte im Link.", budget: "Budget {n} €", theme: "Thema", ideas: "Ideen", names: "Namen bleiben auf dem Handy", event: "Termin", dueBy: "bis {d}", noDue: "ohne Frist",
    bring: "Bringt mit", dur: "{n} Min.", ics: "termin.ics",
    z: { offen: "", heute: "heute", morgen: "morgen", diese_woche: "diese Woche", dieses_wochenende: "dieses Wochenende", naechste_woche: "nächste Woche", naechstes_wochenende: "nächstes Wochenende", in_zwei_wochen: "in zwei Wochen", diesen_monat: "diesen Monat", naechsten_monat: "nächsten Monat", vor_weihnachten: "vor Weihnachten", zwischen_den_jahren: "zwischen den Jahren" },
    wd: { mo: "Mo", di: "Di", mi: "Mi", do: "Do", fr: "Fr", sa: "Sa", so: "So" },
    ort: { offen: "", zuhause: "bei mir", draussen: "draußen", park: "im Park", restaurant: "im Restaurant", cafe: "im Café", online: "online", schule: "in der Schule", buero: "im Büro", verein: "im Verein", sporthalle: "in der Halle" },
    mit: { getraenke: "Getränke", salat: "Salat", snacks: "Snacks", kuchen: "Kuchen", grillgut: "Grillgut", brot: "Brot", dessert: "Dessert", obst: "Obst", geschirr: "Geschirr", spiele: "Spiele", musik: "Musik", deko: "Deko" },
    idee: { buch: "Buch", spiel: "Spiel", suesses: "Süßes", kreatives: "Kreatives", selbstgemacht: "Selbstgemachtes", erlebnis: "Erlebnis", pflanze: "Pflanze", kuscheliges: "Kuscheliges", kleine_technik: "kleine Technik", lustiges: "Lustiges", schreibwaren: "Schreibwaren", wellness: "Wellness" }
  },
  en: {
    h_termin: "When, how long, where? One sentence will do", h_einkauf: "Occasion or recipe", h_wichteln: "Who, how much, which theme?", h_reihum: "What is the card for?", h_aufgaben: "What's coming up?",
    ph_termin: "Barbecue at mine next Saturday evening", ph_einkauf: "Barbecue for 8, 2 vegetarian", ph_wichteln: "Secret Santa with Anna, Ben and Carla, 15 euros", ph_reihum: "Farewell card for our coach", ph_aufgaben: "Company summer party on 12.6.",
    go: "Suggest", ki: "AI suggestion", seal: "Seal", local: "Recognised without AI", read: "Read", take: "Use it", drop: "Discard", took: "Done. You can still change everything.",
    tap: "Tap to take something out.", none: "No matching dates. Tap the days below yourself.", byPref: "Your defaults rule out every date. Tap one away.",
    hol: "Public holiday left out: {d}", round: "{t} is not on the grid, nearest time: {h}", one: "Only one date: tap one more below for the poll.",
    people: "people", veg: "{n} of them vegetarian", guess: "assumed", calc: "The app works out the amounts: per person times people.", need: "as needed", full: "{n} no longer fit into the link.",
    left: "{n} left out: no places or contacts in the link.", budget: "Budget €{n}", theme: "Theme", ideas: "Ideas", names: "Names stay on your phone", event: "Date", dueBy: "by {d}", noDue: "no deadline",
    bring: "Bring", dur: "{n} min", ics: "date.ics",
    z: { offen: "", heute: "today", morgen: "tomorrow", diese_woche: "this week", dieses_wochenende: "this weekend", naechste_woche: "next week", naechstes_wochenende: "next weekend", in_zwei_wochen: "in two weeks", diesen_monat: "this month", naechsten_monat: "next month", vor_weihnachten: "before Christmas", zwischen_den_jahren: "between the years" },
    wd: { mo: "Mon", di: "Tue", mi: "Wed", do: "Thu", fr: "Fri", sa: "Sat", so: "Sun" },
    ort: { offen: "", zuhause: "at mine", draussen: "outside", park: "in the park", restaurant: "restaurant", cafe: "café", online: "online", schule: "at school", buero: "office", verein: "club", sporthalle: "sports hall" },
    mit: { getraenke: "drinks", salat: "salad", snacks: "snacks", kuchen: "cake", grillgut: "barbecue food", brot: "bread", dessert: "dessert", obst: "fruit", geschirr: "dishes", spiele: "games", musik: "music", deko: "decoration" },
    idee: { buch: "book", spiel: "game", suesses: "sweets", kreatives: "creative", selbstgemacht: "homemade", erlebnis: "experience", pflanze: "plant", kuscheliges: "cosy", kleine_technik: "small gadget", lustiges: "funny", schreibwaren: "stationery", wellness: "wellness" }
  }
};
function L() { return TX[Kit.lang === "en" ? "en" : "de"]; }
function say(k, o) { return String(L()[k]).replace(/\{(\w+)\}/g, function (m, n) { return o[n]; }); }
function today() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000); }
function business() { return !!(window.DailyFlavor && window.DailyFlavor.adult === true); }
function dayText(d) { return Tn.dayText(d, Kit.lang); }
function cut(s, n) { s = String(s || "").trim(); if (Array.from(s).length <= n) return s; var t = Array.from(s).slice(0, n).join(""); return t.replace(/\s+\S*$/, "") || t; }
// The chip row of a review: each item on, a tap takes it out (and back in); change() after each tap. -> () => the indexes still on
function toggles(box, labels, change) {
  var on = labels.map(function () { return true; }), row = el("div", "chips");
  labels.forEach(function (l, i) {
    var b = el("button", "chip on", l, function () { on[i] = !on[i]; b.classList.toggle("on", on[i]); b.setAttribute("aria-pressed", String(on[i])); Kit.sfx.tap(); if (change) change(); });
    b.setAttribute("aria-pressed", "true"); row.appendChild(b);
  });
  box.appendChild(row);
  return function () { return on.map(function (x, i) { return x ? i : -1; }).filter(function (i) { return i >= 0; }); };
}
// The head of every review: who made it (the AI with its seal, or the local rules) and what was read from the sentence.
function head(box, ki, read) {
  var h = el("p", "satzki", ki ? "✨ " + L().ki + (ki.s ? " · " + L().seal + " ✓" + (ki.h ? " " + ki.h.slice(0, 8) : "") : "") : "⚙ " + L().local);
  if (ki && ki.h) h.title = ki.h;
  box.appendChild(h);
  if (read) box.appendChild(el("p", "note", L().read + ": " + read));
}
/* Take / discard: the promise the AI action waits for before it settles (true = taken, the charge is final). picked():
   false while nothing is chosen, "Übernehmen" is then off. onTake() returns false when it took nothing after all (the
   list was full, nothing fits the link): then nothing is settled, the check stays open, and leaving or "Verwerfen"
   gives the action back. -> sync(), to call when the choice changed. */
function decide(box, ok, onTake, picked) {
  var row = el("div", "airow"), take = el("button", "btn hot", L().take, function () {
    if (take.disabled || (picked && !picked())) return; take.disabled = true; Kit.sfx.pop();
    if (onTake() === false) { sync(); return; }
    done(true);
  }), x = el("button", "chip", L().drop, function () { Kit.sfx.tap(); box.textContent = ""; done(false); });
  var done = ok;
  function sync() { take.disabled = !!picked && !picked(); }
  row.appendChild(take); row.appendChild(x); box.appendChild(row); sync();
  return sync;
}
function markKi(doc, ki) { var k = ki && D.sanitizeKi(ki); if (k) doc.ki = k; }

// ---------- the five cards ----------
function readPlan(o, day) {
  var X = L(), parts = [];
  if (day) parts.push(dayText(day));
  if (o.wochentage.length) parts.push(o.wochentage.map(function (w) { return X.wd[w]; }).join(", "));
  if (o.uhrzeit) parts.push(o.uhrzeit); else if (o.tageszeiten.length) parts.push(o.tageszeiten.join(", "));
  if (X.z[o.zeitraum]) parts.push(X.z[o.zeitraum]);
  if (o.dauer_min) parts.push(say("dur", { n: o.dauer_min }));
  if (X.ort[o.ort]) parts.push(X.ort[o.ort]);
  if (o.mitbringen && o.mitbringen.length) parts.push(X.bring + ": " + o.mitbringen.map(function (m) { return X.mit[m]; }).join(", "));
  return parts.join(" · ");
}
var MODES = {
  termin: { kind: "plan", keys: ["no"], max: 200, art: function (s) { return S.planArt(s, business()); }, local: function (s) { var r = S.localPlan(s); if (r) r.art = S.planArt(s, business()); return r; },
    review: function (box, o, ki, ctx) {
      var X = L(), t0 = today(), named = S.namedDay(ctx.satz, t0);      // "am 12.11.": the plan format has no field for a date
      var pref = ctx.use.pref(), r = S.slots(o, { today: t0, nowHour: new Date().getHours(), no: pref.no || [], def: business() ? 0 : 6, day: named });
      head(box, ki, readPlan(o, named));
      if (!r.slots.length) { box.appendChild(el("p", "note", r.none ? X.byPref : X.none)); return Promise.resolve(false); }
      var sync = null, on = toggles(box, r.slots.map(function (s) { return Tn.slotText(s, Kit.lang); }), function () { sync(); });
      if (r.skipped.length) box.appendChild(el("p", "note", say("hol", { d: r.skipped.map(function (d) { return dayText(d) + " " + S.holiday(d, Kit.lang); }).join(", ") })));
      if (r.rounded) box.appendChild(el("p", "note", say("round", { t: r.rounded, h: Tn.hourText(r.slots[0] % 10, Kit.lang) })));
      if (r.slots.length === 1) box.appendChild(el("p", "note", X.one));
      box.appendChild(el("p", "note", X.tap));
      return new Promise(function (ok) {
        sync = decide(box, ok, function () {
          var d = ctx.ed.doc, pick = on().map(function (i) { return r.slots[i]; });
          if (!pick.length) return false;
          if (o.titel) d.t = D.cleanInput(o.titel, 40) || d.t;
          if (o.art === "einladung") { var s = [X.ort[o.ort], o.mitbringen.length ? X.bring + ": " + o.mitbringen.map(function (m) { return X.mit[m]; }).join(", ") : ""].filter(Boolean).join(" · "); if (s) d.s = D.cleanInput(cut(s, 70), 70) || d.s; }
          ctx.ed.satzMins = o.dauer_min || (o.art === "einladung" ? 120 : 60);
          ctx.ed.pre = { slots: pick, go: 1 }; markKi(d, ki); ctx.redo();
        }, function () { return on().length > 0; });
      });
    } },
  wichteln: { kind: "plan", keys: [], max: 200, art: function () { return "wichteln"; },
    review: function (box, o, ki, ctx) {
      var X = L(), nm = ctx.names;
      head(box, ki, [o.budget_eur ? say("budget", { n: o.budget_eur }) : "", o.thema ? X.theme + ": " + o.thema : ""].filter(Boolean).join(" · "));
      var ideas = o.ideen || [], onI = ideas.length ? (box.appendChild(el("p", "lbl", X.ideas)), toggles(box, ideas.map(function (i) { return X.idee[i] || i; }))) : function () { return []; };
      var onN = nm.length ? (box.appendChild(el("p", "lbl", X.names)), toggles(box, nm)) : function () { return []; };
      return new Promise(function (ok) {
        decide(box, ok, function () {
          var d = ctx.ed.doc, names = onN().map(function (i) { return nm[i]; });
          if (o.titel) d.t = D.cleanInput(o.titel, 40) || d.t;
          var s = [o.budget_eur ? say("budget", { n: o.budget_eur }) : "", o.thema, onI().map(function (i) { return X.idee[ideas[i]] || ideas[i]; }).join(", ")].filter(Boolean).join(" · ");
          if (s) d.s = D.cleanInput(cut(s, 70), 70) || d.s;
          var list = names.slice(0, 12); while (list.length < 12) list.push("");
          ctx.ed.pre = names.length ? { wic_names: list, go: names.length >= 3 ? 1 : 0 } : null; markKi(d, ki); ctx.redo();
        });
      });
    } },
  reihum: { kind: "plan", keys: [], max: 200, art: function () { return "einladung"; },
    review: function (box, o, ki, ctx) {
      head(box, ki, [o.titel, o.thema].filter(Boolean).join(" · "));
      return new Promise(function (ok) {
        decide(box, ok, function () { var d = ctx.ed.doc; if (o.titel) d.t = D.cleanInput(o.titel, 40) || d.t; if (o.thema) d.s = D.cleanInput(cut(o.thema, 70), 70) || d.s; markKi(d, ki); ctx.redo(); });
      });
    } },
  einkauf: { kind: "liste", keys: ["hh", "diet"], max: 300, art: function (s, ed) { return S.listArt(s, !!(ed.idea && /mitbring/i.test(JSON.stringify(ed.idea.de || "")))); },
    review: function (box, o, ki, ctx) {
      var X = L(), pref = ctx.use.pref(), noMeat = !!pref.diet, p = o.personen || pref.hh || 4, guess = !o.personen && !pref.hh, v = noMeat ? p : o.vegetarisch || 0;
      head(box, ki, o.titel);
      var row = el("div", "airow"), n = el("b", "satzn", ""), list = el("div"), on = null, items = [], sync = null;
      function draw() {
        n.textContent = p + " " + X.people + (v && !noMeat ? " · " + say("veg", { n: Math.min(v, p) }) : "") + (guess ? " (" + X.guess + ")" : "");
        var all = S.shopList(o, p, Math.min(v, p), Kit.lang, noMeat); list.textContent = "";
        items = all.filter(function (a) { return !!Q.clean(a.text, 24); });      // what the list takes (no places, no contacts): seen = sent
        if (all.length > items.length) list.appendChild(el("p", "note", say("left", { n: all.length - items.length })));
        on = toggles(list, items.map(function (a) { return (a.qty > 1 ? a.qty + "× " : "") + a.text + (a.m === "nach_bedarf" ? " (" + X.need + ")" : ""); }), function () { sync(); });
        if (sync) sync();
      }
      [["−", -1], ["+", 1]].forEach(function (x) {
        var b = el("button", "chip", x[0], function () { var q = Math.max(1, Math.min(99, p + x[1])); if (q === p) return; p = q; guess = false; Kit.sfx.tap(); draw(); });
        b.setAttribute("aria-label", (x[1] < 0 ? "− " : "+ ") + X.people); row.appendChild(b); if (x[1] < 0) row.appendChild(n);
      });
      box.appendChild(row); box.appendChild(list); box.appendChild(el("p", "note", X.calc)); draw();
      return new Promise(function (ok) {
        sync = decide(box, ok, function () {
          var ed = ctx.ed, e = ed.shop || (ed.shop = { name: "", face: 0, adds: [], marks: {} }), st = Tn.state(ed.doc), base = st.moves.length ? st.moves[0][0] : null, cf = Tn.GAMES[ed.doc.g].list, lost = 0, sel = on();
          sel.forEach(function (i) {
            var a = items[i], text = Q.clean(a.text, 24); if (!text || !Tn.shopKey(text)) { lost++; return; }
            e.adds = e.adds.filter(function (x) { return Tn.shopKey(x.text) !== Tn.shopKey(text); }); e.adds.push({ text: text, qty: a.qty });
            if (!Tn.shopApply(base, e, cf)[1].some(function (it) { return Tn.shopKey(it[0]) === Tn.shopKey(text); })) { e.adds.pop(); lost++; }
          });
          if (lost) Kit.toast(say("full", { n: lost }));
          if (lost === sel.length) return false;      // nothing went onto the list: nothing taken, nothing charged
          if (o.titel && !st.moves.length) ed.doc.t = D.cleanInput(o.titel, 40) || ed.doc.t;
          markKi(ed.doc, ki); ctx.redo();
        }, function () { return !!on && on().length > 0; });
      });
    } },
  aufgaben: { kind: "liste", keys: [], max: 300, art: function () { return "aufgaben"; },
    review: function (box, o, ki, ctx) {
      var X = L(), t0 = today(), ev = S.eventDay(ctx.satz, t0) || t0 + 14, f = el("input", "field"), list = el("div"), on = null, rows = [], sync = null;
      head(box, ki, o.titel);
      f.type = "date"; f.setAttribute("aria-label", X.event); f.value = new Date(ev * 86400000).toISOString().slice(0, 10);
      function draw() {
        var all = S.tasks(o, ev, t0); list.textContent = "";
        rows = all.filter(function (r) { return !!Q.clean(r[0], Tn.TODO.text); });
        if (all.length > rows.length) list.appendChild(el("p", "note", say("left", { n: all.length - rows.length })));
        on = toggles(list, rows.map(function (r) { return r[0] + " · " + (r[2] ? say("dueBy", { d: dayText(r[2]) }) : X.noDue); }), function () { sync(); });
        if (sync) sync();
      }
      f.addEventListener("change", function () { var m = f.value.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) { ev = S.dayOf(+m[1], +m[2], +m[3]); draw(); } });
      box.appendChild(el("label", "lbl", X.event)); box.appendChild(f); box.appendChild(list); box.appendChild(el("p", "note", X.tap)); draw();
      return new Promise(function (ok) {
        sync = decide(box, ok, function () {
          var got = Tn.todoFrom({ t: o.titel || "", i: on().map(function (i) { return rows[i]; }) });
          if (!got.list) { Kit.toast(Kit.t("filter")); return false; }
          var seed = crypto.getRandomValues(new Uint32Array(1))[0], T = Tn.T(Kit.lang);
          var doc = D.sanitizeDoc({ k: "turn", g: "todo", seed: seed, q: Tn.seal([[got.list]], seed), f: "bolt", col: A.me().colors, by: [], t: got.t || T.tdo_title, s: say("dueBy", { d: dayText(ev) }) });
          markKi(doc, ki);
          // after the action settled (the editor that opens next hands back what is still open)
          setTimeout(function () { A.openEditor(doc, { idea: null }); if (got.lost) Kit.toast(T.tdo_lost.replace("{n}", got.lost)); }, 0);
        }, function () { return !!on && on().length > 0; });
      });
    } }
};

/* The box above the first step. w: its place, ed: the editor, redo(): draw the step again with what was taken. */
function open(w, ed, redo) {
  var M = MODES[ed.doc.g], X = L(), f = el("input", "field"), mine = ed, names = [], said = "";
  if (!M) return;
  var pn = document.getElementById("panel"); if (pn) pn.dataset.size = "big";      // room for the check, like the shopping list
  w.appendChild(el("label", "lbl", X["h_" + ed.doc.g]));
  f.maxLength = M.max; f.autocomplete = "off"; f.enterKeyHint = "go"; f.placeholder = X["ph_" + ed.doc.g]; f.setAttribute("aria-label", X["h_" + ed.doc.g]);
  w.appendChild(f);
  var use = A.prefUse(w, M.keys);
  var ctx = { ed: ed, use: use, redo: redo, names: [], satz: "" };
  var act = window.Ai.block(w, {
    kind: M.kind, label: X.go, el: el, noteLast: false,
    alive: function () { return A.ed() === mine && w.isConnected; },
    wall: function () { var e = A.ed(); if (e) e.styling = true; A.shelf(Kit.t("aiTitle"), function (b) { window.Ai.wall(b, el); }); },
    input: function () {
      var raw = D.cleanInput(f.value, M.max); if (!raw || Array.from(raw).length < 3) return null;
      var nm = S.names(raw); names = nm.names; said = raw; ctx.names = names; ctx.satz = raw;
      var o = { art: M.art(raw, ed), satz: nm.satz }, c = use.context(); if (c) o.ctx = c;
      return o;
    },
    local: M.local ? function () { return M.local(said); } : null,
    auto: function (opt, ki, res) {
      var box = el("div", "satzrev"); res.appendChild(box);
      var r = M.review(box, opt, ki, ctx);
      setTimeout(function () { try { box.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) {} }, 30);      // the check in view, not below the fold
      return r;
    }
  });
  f.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); act(); } });
  try { f.focus(); } catch (e) {}
}

// The leading date of a poll as a calendar file: the same order as the card (most yes, then maybe, then earliest).
function lead(doc) {
  var m = Tn.moves(doc), dates = m[0][0][1];
  return dates.map(function (s, i) {
    var yes = 1, maybe = 0; m.slice(1).forEach(function (t) { var v = t[0][1][i]; if (v === 0) yes++; else if (v === 1) maybe++; });
    return { s: s, pts: (yes * 2 + maybe) * 100 + yes };
  }).sort(function (a, b) { return b.pts - a.pts || a.s - b.s; })[0].s;
}
function ics(doc) {
  var e = A.ed(), i = doc.i ? D.byId(doc.i) : null, title = doc.t || (i ? D.plainTitle((i[Kit.lang] || i.de).t) : "Termin");
  var text = S.ics(lead(doc), title, e && e.doc === doc && e.satzMins ? e.satzMins : 60);
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" })); a.download = L().ics;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  window.SatzUI.last = text;      // what the last tap handed out (tests read it; it is on this device only)
}
window.SatzUI = { open: open, ics: ics, MODES: Object.keys(MODES) };
})();
