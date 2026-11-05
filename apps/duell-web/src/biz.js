/* Daily Business, stage 2 (KI-Konzept section 2): onboarding from a start date, the feedback evaluation and the next
   meeting from a protocol's open tasks. Pure logic, no DOM (the screens are in src/flavors/business/biz-ui.js, both in
   the part "biz"). Dates and deadlines are always computed here, never by the AI; the AI only names tasks or themes. */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var Tn = node ? require("./turns.js") : root.Turns;
  var Q = node ? require("./quest.js") : root.Quest;
  var C = node ? require("./core.js") : root.DuellCore;
  var Ai = node ? require("./ai.js") : root.Ai;   // the one crisis list of the page (ai.js), never a copy
  if (node) require("./office.js");
  var TEXT = Tn.TODO.text, AGENDA_T = 40, AGENDA_P = 30, NAME = 16;

  // ---------- onboarding: a fixed plan from the start date (days relative to day one), the AI adds tasks for the role ----------
  var PLAN = [
    [-14, "Arbeitsplatz und Technik bestellen", "Order desk and equipment"],
    [-7, "Zugänge und Konten anlegen", "Set up accounts and access"],
    [-7, "Patin oder Paten festlegen", "Pick a buddy"],
    [-3, "Willkommensmail mit Ablauf senden", "Send a welcome mail with the plan"],
    [0, "Begrüßung und Rundgang", "Welcome and tour"],
    [0, "Team und Ansprechpartner vorstellen", "Introduce the team and contacts"],
    [7, "Erstes Feedbackgespräch", "First feedback talk"],
    [30, "Ziele für die Probezeit besprechen", "Agree goals for the probation period"]
  ];
  // The AI's relative deadlines (CADS-DEMO-wrapper LISTE.frist) as days from day one; "offen" has no deadline.
  var FRIST = { sofort: "now", "2_wochen_vorher": -14, "1_woche_vorher": -7, "3_tage_vorher": -3, "1_tag_vorher": -1, am_tag: 0, danach: 7 };
  // The nationwide public holidays in Germany (the ones of all federal states): fixed days and the days around Easter.
  var DAY = 86400000;
  function easter(y) {   // Gregorian Easter Sunday (anonymous Gregorian algorithm) -> day number
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return Math.floor(Date.UTC(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1) / DAY);
  }
  function holiday(day) {
    var t = new Date(day * DAY), md = (t.getUTCMonth() + 1) * 100 + t.getUTCDate(), e = easter(t.getUTCFullYear());
    return [101, 501, 1003, 1225, 1226].indexOf(md) >= 0 || [-2, 1, 39, 50].indexOf(day - e) >= 0;
  }
  function workday(day) { return new Date(day * DAY).getUTCDay() % 6 !== 0 && !holiday(day); }
  // The suggested first day: the first Monday at least a week ahead (time to order and set up), not a public holiday.
  function firstDay(today) { var d = today + 7 + ((8 - new Date((today + 7) * DAY).getUTCDay()) % 7); while (holiday(d)) d += 7; return d; }
  // A deadline before today is today: nobody gets a task that is overdue the moment the list exists. A deadline other than
  // day one that falls on a weekend or a public holiday moves to the working day before it.
  function dueOf(off, start, today) {
    if (off === undefined || off === null) return 0;
    var d = off === "now" ? today : start + off;
    if (off !== "now" && off !== 0) while (!workday(d) && d > today) d--;
    return Math.max(d, today, 1);
  }
  // A text over the cap ends at a word, never mid-word (a word that ends exactly at the cap stays); nothing the filter refuses.
  function cut(s, max) {
    var a = Array.from(String(s || "").replace(/\s+/g, " ").trim());
    if (max < 1) return "";
    if (a.length > max) { var h = a.slice(0, max).join(""), sp = a[max] === " " ? max : h.lastIndexOf(" "); a = Array.from(sp > max / 2 ? h.slice(0, sp) : h); }
    return Q.clean(a.join("").replace(/[\s,;:–-]+$/, ""), max);
  }
  // -> [[text, "", due day]] for Turns.todoFrom, in the order of the plan.
  function onboardPlan(start, today, lang) {
    return PLAN.map(function (p) { return [cut(lang === "en" ? p[2] : p[1], TEXT), "", dueOf(p[0], start, today)]; });
  }
  // The tasks of an AI option (liste, art aufgaben) the plan does not have yet, at most `room`. Never a name ("wer" is empty).
  function aiTasks(opt, have, start, today, room) {
    var seen = have.map(function (x) { return Tn.shopKey(x[0]); }), out = [];
    ((opt && Array.isArray(opt.aufgaben)) ? opt.aufgaben : []).forEach(function (x) {
      var s = x && cut(x.was, TEXT), k = s && Tn.shopKey(s);
      if (!k || seen.indexOf(k) >= 0 || out.length >= room) return;
      var off = Object.prototype.hasOwnProperty.call(FRIST, x.frist) ? FRIST[x.frist] : null;
      seen.push(k); out.push([s, "", dueOf(off, start, today), off]);   // the 4th field: the relative deadline, for redate
    });
    return out;
  }
  // A new first day: each AI task's deadline again from its relative deadline, never shifted from a day already cut to today.
  function redate(list, start, today) { return list.map(function (x) { return [x[0], x[1], dueOf(x[3], start, today), x[3]]; }); }
  // Only as many of `add` as still fit into the link next to `have` (Turns.TODO caps count and bytes): nothing is lost later.
  function fits(have, add, title) {
    var out = [];
    add.forEach(function (x) { var t = out.concat([x]), got = Tn.todoFrom({ t: title, i: have.concat(t) }); if (got.list && !got.lost) out = t; });
    return out;
  }
  // The checklist link's payload: the title names the role, never a person.
  function onboardTitle(role, lang) { var r = cut(role, 26); return cut((lang === "en" ? "Onboarding" : "Onboarding") + (r ? ": " + r : ""), AGENDA_T); }

  // ---------- feedback: the notes of a feedback card (office.js), mixed by the card's own seed ----------
  function notes(doc) { return Tn.moves(doc).slice(1).map(function (t) { return t[1] && t[1][0]; }).filter(Boolean); }
  // The same order on every device for the same card, no random number of the device: the seed and the number of notes decide.
  function mixed(doc, list) {
    var a = list.slice(), r = C.mulberry32(C.hash32("fb|" + doc.seed + "|" + a.length));
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  // Same rule as the server (CADS-DEMO-wrapper quotes): n words in a row of one note, or a text of two words or more that
  // stands in a note as a whole, is a quote.
  function words(s) { return String(s || "").toLowerCase().replace(/ß/g, "ss").replace(/ä|ae/g, "a").replace(/ö|oe/g, "o").replace(/ü|ue/g, "u").normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean); }
  function quotes(t, list, n) {
    var w = words(t); if (!w.length) return false;
    if (w.length >= 2) n = Math.min(n, w.length);
    return list.some(function (x) {
      var v = words(x), note = " " + v.join(" ") + " ";
      if (v.join(" ") === w.join(" ")) return true;
      for (var i = 0; i + n <= w.length; i++) if (note.indexOf(" " + w.slice(i, i + n).join(" ") + " ") >= 0) return true;
      return false;
    });
  }
  // -> { themen, vorschlag } or { bad: "old" (a server without art feedback answered with a list) | "quote" }.
  function evaluation(opt, list) {
    if (!opt || opt.art !== "feedback" || !Array.isArray(opt.themen)) return { bad: "old" };
    var th = opt.themen.map(function (s) { return cut(s, AGENDA_P); }).filter(Boolean).slice(0, 3), tip = cut(opt.vorschlag, 120);
    if (th.length < 3 || !tip) return { bad: "old" };
    if (th.some(function (s) { return quotes(s, list, 3); }) || quotes(tip, list, 4)) return { bad: "quote" };
    return { themen: th, vorschlag: tip };
  }
  // A note that sounds like someone is in danger: the page shows its one crisis line (ai.js, aiCrisis) before anything is
  // sent. The list is ai.js's (a work topic like "Burnout" is not a crisis); a note that says only "Ich kann nicht mehr"
  // is one too (the same rule as isSpent in CADS-DEMO-wrapper), inside a sentence ("kann nicht mehr folgen") it is not.
  var SPENT = /^(ich )?kann (einfach |echt |so |wirklich |bald )?nicht mehr( weiter)?$/;
  function spent(s) { return SPENT.test(String(s || "").replace(/[!?.]+\s*$/, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()); }
  function crisis(list) { return list.some(function (s) { return Ai.crisis(s) || spent(s); }); }

  // ---------- agendas: the first move of an agenda card (office.js): [title, three points, name] ----------
  function nameOf(nick, lang) { var n = cut(nick, NAME); return n || (lang === "en" ? "Host" : "Moderation"); }
  function agendaMove(title, points, nick, lang) {
    var p = [], seen = [];
    points.forEach(function (s) { var c = cut(s, AGENDA_P), k = Q.fold(c); if (c && p.length < 3 && seen.indexOf(k) < 0) { seen.push(k); p.push(c); } });
    while (p.length < 3) p.push("");
    return p[0] ? [cut(title, AGENDA_T), p, nameOf(nick, lang)] : null;
  }
  // One agenda point from a task: "who: task" (the agenda card adds the host in brackets itself). Several people: the first
  // and "+N"; no room left for the task next to the name: the task alone.
  function point(text, people) {
    var who = people.length ? cut(people[0], NAME) + (people.length > 1 ? " +" + (people.length - 1) : "") : "", room = AGENDA_P - who.length - 2;
    return who && room >= 8 ? who + ": " + cut(text, room) : cut(text, AGENDA_P);
  }
  // The next meeting from a task list: the open tasks with who has them; more than three: two and "N more open tasks".
  function followUp(list, title, nick, lang) {
    var X = Tn.T(lang), open = Tn.shopRows(list, Tn.TODO).filter(function (r) { return !r.bought.length; });
    var pts = open.map(function (r) { return point(r.text, r.bring.map(function (x) { return x[0]; })); });
    if (pts.length > 3) pts = pts.slice(0, 2).concat([String(lang === "en" ? "{n} more open tasks" : "{n} weitere offene Aufgaben").replace("{n}", pts.length - 2)]);
    if (!pts.length) pts = [lang === "en" ? "Review: all done" : "Rückblick: alles erledigt"];
    return agendaMove(String(X.tdo_agenda_h).replace("{t}", cut(title || X.tdo_title, 24)), pts, nick, lang);
  }
  function retro(themen, topic, nick, lang) { return agendaMove((lang === "en" ? "Retro: " : "Retro: ") + cut(topic, 30), themen, nick, lang); }

  var api = { PLAN: PLAN, FRIST: FRIST, dueOf: dueOf, holiday: holiday, firstDay: firstDay, redate: redate, point: point, spent: spent, cut: cut, onboardPlan: onboardPlan, aiTasks: aiTasks, fits: fits, onboardTitle: onboardTitle, notes: notes, mixed: mixed, quotes: quotes, evaluation: evaluation, crisis: crisis, agendaMove: agendaMove, followUp: followUp, retro: retro, LEAST: 5 };
  if (node) module.exports = api; else root.Biz = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
