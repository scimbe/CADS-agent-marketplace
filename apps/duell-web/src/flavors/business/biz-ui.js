/* Daily Business, stage 2: the screens for onboarding, the feedback evaluation and the next meeting (logic in src/biz.js).
   Part "biz" (scripts/build.js), loaded by the flavor's hooks on first use. Every AI result is shown in full before it
   is taken, taking it carries the seal (doc.ki), and each screen also works without AI. */
(function () {
"use strict";
var A = window.DailyApp, D = window.Daily, Tn = window.Turns, B = window.Biz, Kit = window.Kit, t = Kit.t, el = A.el;
var DAY = 86400000;
function L() { return Tn.T(Kit.lang); }
function localDay() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY); }
function iso(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
function dayOf(v) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(v || ""); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : 0; }
function wall() { var e = A.ed(); if (e) e.styling = true; A.shelf(t("aiTitle"), function (b) { window.Ai.wall(b, el); }); }
function ai(box, o) { var mine = A.ed(); o.el = el; o.wall = wall; o.alive = function () { return !!mine && A.ed() === mine; }; return window.Ai.block(box, o); }
function seal(ki) { return D.sanitizeKi(ki); }
function nick() { return A.me().nick || ""; }
// A new agenda card with its first move already made (title, points, name): it opens ready to pass on.
function openAgenda(move, ki) {
  var i = D.byId("biz-agenda");
  if (!i || !move) { Kit.toast(t("filter")); return; }
  A.openEditor(D.docFromIdea(i, A.me(), Kit.lang), { idea: i });
  var e = A.ed(), n = Tn.play(e.doc, move, Tn.today());
  if (!n) { Kit.toast(t("filter")); return; }
  var k = seal(ki); if (k) { n.ki = k; e.doc.ki = k; }
  e.next = n; A.changed(); A.tab("Move");
}

/* ---------- onboarding: start date and role -> the fixed plan; the AI may add tasks for the role ---------- */
function onboard(box) {
  var today = localDay(), start = today + 7 + ((8 - new Date((today + 7) * DAY).getUTCDay()) % 7), extra = [], ki = null;
  var date = el("input", "field"), role = el("input", "field"), list = el("ul", "bizlist"), room = function () { return Tn.TODO.items - B.PLAN.length; };
  date.type = "date"; date.value = iso(start); date.min = iso(today); date.setAttribute("aria-label", t("biz_ob_start"));
  role.maxLength = 26; role.autocomplete = "off"; role.placeholder = t("biz_ob_role_ph"); role.setAttribute("aria-label", t("biz_ob_role"));
  function plan() { return B.onboardPlan(start, today, Kit.lang); }
  // The AI's new tasks that still fit into the link next to what is on the list.
  function more(opt) { var have = plan().concat(extra); return B.fits(have, B.aiTasks(opt, have, start, today, room() - extra.length), B.onboardTitle(role.value, Kit.lang)); }
  function draw() {
    list.textContent = "";
    plan().concat(extra).forEach(function (x, i) {
      var li = el("li", i >= B.PLAN.length ? "ki" : ""), due = x[2] ? Tn.dueText(x[2], Kit.lang) : "";
      li.appendChild(el("span", "", (i >= B.PLAN.length ? "✨ " : "") + x[0]));
      if (due) li.appendChild(el("small", "", due));
      if (i >= B.PLAN.length) {
        var x0 = el("button", "bizx", "×", function () { extra.splice(i - B.PLAN.length, 1); if (!extra.length) ki = null; Kit.sfx.tap(); draw(); });
        x0.setAttribute("aria-label", t("biz_drop") + ": " + x[0]); li.appendChild(x0);
      }
      list.appendChild(li);
    });
  }
  date.addEventListener("change", function () {
    var d = dayOf(date.value); if (d < today) return;
    // the AI's tasks keep their place relative to day one
    extra = extra.map(function (x) { return x[2] ? [x[0], "", Math.max(today, x[2] + (d - start))] : x; }); start = d; draw();
  });
  box.appendChild(el("p", "note", t("biz_ob_h")));
  box.appendChild(el("label", "lbl", t("biz_ob_start"))); box.appendChild(date);
  box.appendChild(el("label", "lbl", t("biz_ob_role"))); box.appendChild(role);
  box.appendChild(list); draw();
  ai(box, {
    kind: "liste", label: t("biz_ob_ai"),
    input: function () {
      var r = B.cut(role.value, 26);
      // Live, "neue Person als …" came back kind_ok false; the neutral first-day sentence passes (wrapper PR #95 adds a hint).
      return { art: "aufgaben", satz: Kit.lang === "en" ? "Prepare the first weeks in the new team" + (r ? ", role: " + r : "") : "Erste Wochen im neuen Team vorbereiten" + (r ? ", Rolle: " + r : "") };
    },
    show: function (opt) {
      var add = more(opt);
      return add.length ? t("biz_ob_add", { n: add.length }) + "\n" + add.map(function (x) { return "• " + x[0]; }).join("\n") : "⚠ " + t("biz_ob_none");
    },
    apply: function (opt, k) {
      var add = more(opt);
      if (!add.length) return false;
      extra = extra.concat(add); ki = k; draw(); return true;
    }
  });
  make = function () {
    if (!box.isConnected) return;
    var got = Tn.todoFrom({ t: B.onboardTitle(role.value, Kit.lang), i: plan().concat(extra) });
    if (!got.list) { Kit.toast(t("filter")); return; }
    var ed = A.ed(), i = ed.doc.i ? D.byId(ed.doc.i) : null, s = window.crypto.getRandomValues(new Uint32Array(1))[0];
    var doc = { k: "turn", g: "todo", i: ed.doc.i, seed: s, q: Tn.seal([[got.list]], s), f: "bolt", col: A.me().colors, by: [], t: got.t, s: t("biz_ob_from", { d: Tn.dayText(start, Kit.lang) }) };
    var k = extra.length && seal(ki); if (k) doc.ki = k;
    Kit.sfx.thud(); A.openEditor(D.sanitizeDoc(doc), { idea: i });
    if (got.lost) Kit.toast(L().tdo_lost.replace("{n}", got.lost));
  };
}
// The checklist from the onboarding screen on show (the footer's main button, flavor.js).
var make = function () {};

/* ---------- feedback: at least five notes -> three themes and one suggestion, never a quote, never a person ---------- */
function feedback(box, ed) {
  var doc = ed.doc, notes = B.notes(doc), m = Tn.moves(doc);
  if (!m.length) return;
  if (notes.length < B.LEAST) { if (notes.length) box.appendChild(el("p", "note", t("biz_fb_wait", { n: notes.length, m: B.LEAST }))); return; }
  var res = el("div", "bizres");
  box.appendChild(el("label", "lbl", t("biz_fb_h")));
  box.appendChild(el("p", "note", t("biz_fb_br")));
  if (B.crisis(notes)) box.appendChild(el("p", "note bizhelp", t("biz_help")));
  ai(box, {
    kind: "liste", label: t("biz_fb_ai"),
    input: function () { return { art: "feedback", notizen: B.mixed(doc, notes) }; },
    show: function (opt) {
      var e = B.evaluation(opt, notes);
      if (e.bad) return "⚠ " + t(e.bad === "old" ? "biz_fb_old" : "biz_fb_quote");
      return e.themen.map(function (s, i) { return (i + 1) + ". " + s; }).join("\n") + "\n→ " + e.vorschlag;
    },
    apply: function (opt, ki) {
      var e = B.evaluation(opt, notes);
      if (e.bad) { Kit.toast(t(e.bad === "old" ? "biz_fb_old" : "biz_fb_quote")); return false; }
      res.textContent = "";
      res.appendChild(el("p", "bizseal", t("biz_seal")));
      res.appendChild(el("p", "lbl", t("biz_fb_themes")));
      e.themen.forEach(function (s, i) { res.appendChild(el("p", "qtext", (i + 1) + ". " + s)); });
      res.appendChild(el("p", "lbl", t("biz_fb_tip"))); res.appendChild(el("p", "note", e.vorschlag));
      var text = t("biz_fb_themes") + ": " + e.themen.join(" · ") + "\n" + t("biz_fb_tip") + ": " + e.vorschlag + "\n(" + t("biz_seal") + ")";
      res.appendChild(el("button", "btn hot", t("biz_fb_retro"), function () { Kit.sfx.thud(); openAgenda(B.retro(e.themen, m[0][0], nick(), Kit.lang), ki); }));
      res.appendChild(el("button", "btn", t("biz_copy"), async function () { if (await Kit.copy(text)) Kit.toast(t("copied")); }));
      return true;
    }
  });
  box.appendChild(res);
}

/* ---------- next meeting from a task list (Fast Easy Protokoll -> #todo=): the open tasks as an agenda link, no AI ---------- */
function todo(box, ed) {
  var src = ed.next || ed.doc, m = Tn.moves(src);
  if (!m.length || !m[0][0]) return;
  box.appendChild(el("label", "lbl", t("biz_next_h")));
  box.appendChild(el("button", "btn", t("biz_next"), function () {
    var cur = Tn.moves(A.ed().next || A.ed().doc);
    Kit.sfx.thud(); openAgenda(cur.length ? B.followUp(cur[0][0], A.ed().doc.t, nick(), Kit.lang) : null, null);
  }));
  box.appendChild(el("p", "note", t("biz_next_br")));
}

window.BizUI = { onboard: onboard, feedback: feedback, todo: todo, make: function () { make(); } };
})();
