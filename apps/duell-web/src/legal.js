/* Legal pages (legal notice, privacy, terms, accessibility, licences): one source, two outputs. The page shows them
   offline in a shelf (app.js), the build writes them as static pages the server hands out (scripts/build.js).
   Texts come from legal.json, the operator's details from legal/operator.json. A line naming an optional field that is
   empty ("") is left out. Anything still in ⟦…⟧ is a placeholder: missing() lists it, and nothing with one may go live. */
(function (root) {
  "use strict";
  var PAGES = ["impressum", "datenschutz", "agb", "barrierefreiheit", "lizenzen"];
  var MARK = "⟦";
  var FIELD = /\{([a-zA-Z]+)\}/g;
  // The sentences in legal.json that state these facts; the operator confirms each one in operator.json.
  var CONFIRM = ["hosting", "aiModelOwnHardware", "avvHosting", "conference", "channelRelay"];

  /** Everything that still keeps the pages from going live: placeholder fields and facts not yet confirmed. */
  function missing(op) {
    var out = [];
    Object.keys(op || {}).forEach(function (k) { if (k.charAt(0) !== "_" && typeof op[k] === "string" && op[k].indexOf(MARK) >= 0) out.push(k); });
    var ok = (op && op.bestaetigt) || {};
    CONFIRM.forEach(function (k) { if (ok[k] !== true) out.push("bestaetigt." + k); });
    return out;
  }

  function fill(s, op) { return s.replace(FIELD, function (_, k) { return op[k] == null ? "" : String(op[k]); }); }
  function empty(s, op) { var e = false; s.replace(FIELD, function (_, k) { if (op[k] === "" || op[k] == null) e = true; return ""; }); return e; }

  /** The blocks of one page in one language: [{ t: "h"|"p"|"ul"|"lic", s?, items? }]. */
  function blocks(L, op, page, lang) {
    var src = (L[lang] || L.de)[page] || [], out = [];
    src.forEach(function (b) {
      if (b[0] === "lic") { out.push({ t: "lic" }); return; }
      if (b[0] === "ul") { var items = b[1].filter(function (x) { return !empty(x, op); }).map(function (x) { return fill(x, op); }); if (items.length) out.push({ t: "ul", items: items }); return; }
      if (!empty(b[1], op)) out.push({ t: b[0], s: fill(b[1], op) });
    });
    return out;
  }

  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var STYLE = "body{margin:0;background:#ffd400;color:#111;font:500 17px/1.5 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:20px 16px 48px}" +
    "h1{font:900 34px/1.1 system-ui,sans-serif;text-transform:uppercase;margin:12px 0 4px}h2{font-size:19px;margin:26px 0 6px}p,li{margin:6px 0}" +
    "nav{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}nav a{padding:8px 12px;background:#111;color:#ffd400;font-weight:800;text-decoration:none;border-radius:4px}" +
    "nav a[aria-current]{background:#fffaf0;color:#111;outline:3px solid #111}.stand{font-size:14px}pre{white-space:pre-wrap;font-size:13px;background:#fffaf0;border:3px solid #111;padding:10px}" +
    "a{color:#111}@media (prefers-color-scheme:dark){body{background:#111;color:#ffd400}nav a{background:#ffd400;color:#111}nav a[aria-current]{background:#111;color:#ffd400;outline-color:#ffd400}pre{background:#222;border-color:#ffd400;color:#ffd400}a{color:#ffd400}}";

  /** A static page for the server: plain HTML, no script, links to the other pages and back to the app.
      Paths: German at /duell/<page>, English at /duell/en/<page>. */
  function html(L, op, page, lang, lic) {
    var N = (L[lang] || L.de).nav, up = lang === "en" ? "../" : "", other = lang === "en" ? "../" + page : "en/" + page;
    var nav = PAGES.map(function (p) { return '<a href="' + esc(p) + '"' + (p === page ? ' aria-current="page"' : "") + ">" + esc(N[p]) + "</a>"; }).join("");
    var body = blocks(L, op, page, lang).map(function (b) {
      if (b.t === "h") return "<h2>" + esc(b.s) + "</h2>";
      if (b.t === "ul") return "<ul>" + b.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
      if (b.t === "lic") return (lic || []).map(function (l) { return "<h2>" + esc(l.name) + "</h2><p>" + esc(l.license) + " · " + esc(l.url) + "</p><pre>" + esc(l.text) + "</pre>"; }).join("");
      return "<p>" + esc(b.s) + "</p>";
    }).join("");
    return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>" + esc(N[page]) + " · My Daily Idea</title><style>" + STYLE + "</style></head><body><main>" +
      '<nav aria-label="' + esc(N.title) + '"><a href="' + up + '../duell">← ' + esc(N.back) + '</a><a href="' + esc(other) + '" hreflang="' + (lang === "en" ? "de" : "en") + '">' + (lang === "en" ? "Deutsch" : "English") + "</a></nav>" +
      "<h1>" + esc(N[page]) + "</h1>" + body + '<p class="stand">' + esc(N.stand) + "</p>" + '<nav aria-label="' + esc(N.title) + '">' + nav + "</nav></main></body></html>";
  }

  var api = { PAGES: PAGES, MARK: MARK, CONFIRM: CONFIRM, missing: missing, blocks: blocks, html: html };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Legal = api;
})(typeof window !== "undefined" ? window : this);
