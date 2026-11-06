/* Part "quiz": the made-up mail or text of "Echt oder Phishing?" (src/quizspiele.js) on screen. Plain text only: the link in
   an example is never a link, nothing is loaded. On the answer screen the detail that gives it away is marked (<mark>)
   and explained. Words from turn.json (Turns.T), colours as tokens for light and dark. */
(function (root) {
  "use strict";
  var CSS = ".qmail{--qm-bg:#ffffff;--qm-ink:#111827;--qm-line:#9aa3af;--qm-mark:#fde68a;--qm-markink:#111827;--qm-bad:#991b1b;--qm-ok:#166534;" +
    "border:2px solid var(--qm-line);border-radius:8px;background:var(--qm-bg);color:var(--qm-ink);padding:10px 12px;margin:0 0 10px;font:500 1rem/1.35 var(--ui);overflow-wrap:anywhere}" +
    ".qmail p{margin:0 0 6px}.qmail .qmhd{font-size:.9375rem;border-bottom:1px solid var(--qm-line);padding-bottom:6px;margin-bottom:8px}" +
    ".qmail .qmk{font-weight:700}.qmail .qmlink{text-decoration:underline;word-break:break-all}.qmail .qmtag{display:inline-block;font:700 .9375rem/1.2 var(--ui);padding:2px 6px;border:1px solid var(--qm-line);border-radius:4px;margin:0 0 6px}" +
    ".qmail mark{background:var(--qm-mark);color:var(--qm-markink);font-weight:700;padding:0 2px;border-radius:2px;outline:2px solid var(--qm-ink);outline-offset:0}" +
    ".qmail.fake{border-color:var(--qm-bad)}.qmail.real{border-color:var(--qm-ok)}.qmwhy{font-weight:600;margin-top:8px!important}" +
    ".qmail~.chips{flex-wrap:nowrap;position:sticky;bottom:0;background:var(--paper);padding:6px 0;margin:0}.qmail~.chips .chip{min-height:48px;font-size:1.125rem;flex:1}" +
    "@media (prefers-color-scheme:dark){.qmail{--qm-bg:#1f2937;--qm-ink:#f9fafb;--qm-line:#6b7280;--qm-mark:#fbbf24;--qm-markink:#111827;--qm-bad:#f87171;--qm-ok:#4ade80}}";
  function style() { if (document.getElementById("qmcss")) return; var s = document.createElement("style"); s.id = "qmcss"; s.textContent = CSS; document.head.appendChild(s); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  // text with the first occurrence of the detail marked (only on the answer screen)
  function put(p, s, mark) {
    var at = mark ? s.indexOf(mark) : -1;
    if (at < 0) { p.appendChild(document.createTextNode(s)); return false; }
    p.appendChild(document.createTextNode(s.slice(0, at))); p.appendChild(el("mark", "", mark)); p.appendChild(document.createTextNode(s.slice(at + mark.length)));
    return true;
  }
  // c: { e: the example, phish: true/false, show: answer screen }
  function mail(box, c, lang) {
    style();
    var L = root.Turns.T(lang), e = c.e, m = c.show ? e.mark : "", done = false, w = el("div", "qmail" + (c.show ? (c.phish ? " fake" : " real") : ""));
    w.setAttribute("role", "group"); w.setAttribute("aria-label", L.phi_made);
    w.appendChild(el("span", "qmtag", c.tag || L.phi_made));
    var hd = el("div", "qmhd");
    function row(k, v) { if (!v) return; var p = el("p"); p.appendChild(el("span", "qmk", k + ": ")); if (put(p, v, done ? "" : m)) done = true; hd.appendChild(p); }
    row(e.k === "sms" ? L.phi_sms : L.phi_from, e.from);
    if (e.k !== "sms") row(L.phi_sub, e.sub);
    w.appendChild(hd);
    var b = el("p", "qmbody"); if (put(b, e.body, done ? "" : m)) done = true; w.appendChild(b);
    if (e.link) { var l = el("p", "qmlink"); if (put(l, e.link, done ? "" : m)) done = true; w.appendChild(l); }
    if (c.show) { var y = el("p", "qmwhy"); y.appendChild(el("span", "qmk", L.phi_tell + " ")); y.appendChild(document.createTextNode(e.why)); w.appendChild(y); }
    box.appendChild(w);   // the two answers come right below it, 48 px high (rule A6) and sticky at the panel's foot, so they stay in view while the example scrolls
  }
  // The words of the steps (quizspiele.json de.ui, en.ui, ...) join the turn texts of each language, German as fallback.
  var D = root.QuizSpieleData || {};
  root.DuellCore.langsOf(D).forEach(function (l) { if (D[l].ui) Object.assign(root.Turns.T(l), D[l].ui); });
  root.QuizSpieleUI = { mail: mail };
})(window);
