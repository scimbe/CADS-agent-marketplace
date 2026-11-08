/* Start (redesign wave 1): one sentence -> what the person has in mind (intent), for whom, and which cards fit. Only on
   the device: keywords (src/start.json), the catalog's tags and the same search as "Letzte Tage" (daily.js searchIdeas).
   No AI and no request. Honest: a card that does not exist yet is named as missing, and no card at all says so; it never
   pretends. The rules run in Node (test/start.test.js); the screen is src/start-ui.js (the part start). */
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports;
  var D = node ? require("./daily.js") : root.Daily;
  var DATA = node ? require("./start.json") : root.StartData;
  var INTENTS = ["gruss", "planen", "spielen", "stimme"];
  // Words that carry no wish of their own; they never go to the search ("Ich will meiner Schwester ...").
  var STOP = " ich du er sie es wir ihr mein meine meinen meiner meinem dein deine deinen unser unsere euer will moechte mag mal bitte schick schicken senden machen mach heute morgen jetzt einen einer einem eines kein keine keinen nicht noch auch nur ganz sehr wer wie was wo wann kann koennen soll ueber gegen zeit leider einfach so schnell kurz the a an and to for my our your with want would like please send make some today something about ";
  var SPECIFIC = 6, ARTICLE = " den die das dem der des ein eine einen einem einer the a an ";   // a word that finds more cards than this says too little to pick one

  // "leid$" matches only the word itself ("leider" is no apology); any other stem matches the start of a word.
  // A stem of 5 letters or more also counts inside a compound ("Kindergeburtstag", "Spieleabend").
  function hit(w, stem) { return stem.charAt(stem.length - 1) === "$" ? w === stem.slice(0, -1) : w.indexOf(stem) === 0 || (stem.length >= 5 && w.indexOf(stem) > 0); }
  function len(stem) { return stem.replace(/\$$/, "").length; }
  // The longest stem of a table that matches the word, or "" ("kartenspiel": kartensp beats karte).
  function best(w, stems) { var b = ""; stems.forEach(function (s) { if (hit(w, s) && len(s) > len(b)) b = s; }); return b; }
  function words(text) { return D.fold(text).split(" ").filter(Boolean); }
  function avail(id) { var i = D.byId(id); return i && D.available(i) ? i : null; }
  // Which of the four a card belongs to: the curated lists first, then its kind.
  function intentOf(idea) {
    if (!idea) return "";
    for (var k = 0; k < INTENTS.length; k++) if (DATA.intents[INTENTS[k]].ids.indexOf(idea.id) >= 0) return INTENTS[k];
    if (idea.kind === "sound") return "stimme";
    if (idea.kind === "card" || idea.kind === "photo") return "gruss";
    return "spielen";
  }
  // The cards of an intent, as the tiles and "Stimmt nicht? Ändern" offer them: those that exist in this build.
  // Old ids that now lead to one card (the three voice cards are one since #181) count once.
  function cardsOf(intent) { return ((DATA.intents[intent] || {}).ids || []).map(avail).filter(function (i, k, a) { return i && a.indexOf(i) === k; }); }
  // A first name after "an", "für", "to", "for" ("Danke an Lea"), when it is no word the tables know ("für Geburtstag").
  function nameIn(text, known) {
    var m = String(text || "").match(/(?:^|\s)(?:an|für|fuer|to|for)\s+(?:meine[nmrs]?\s+|my\s+|unsere[nmrs]?\s+|our\s+)?(\p{L}[\p{L}'-]{1,13})(?=$|[\s.,!?])/iu);
    if (!m) return "";
    var f = D.fold(m[1]);
    if (known(f) || STOP.indexOf(" " + f + " ") >= 0 || ARTICLE.indexOf(" " + f + " ") >= 0) return "";
    return m[1].charAt(0).toUpperCase() + m[1].slice(1);
  }

  /* -> { intent, who: {de, en, call} | null, name, top: [{ idea, exact }], missing: {de, en} | null, words }
     intent "" when nothing points anywhere; top empty when no card fits. A forced intent ("Stimmt nicht? Ändern")
     keeps the sentence's cards of that intent and fills up with its curated list. */
  function understand(text, o) {
    o = o || {};
    var ws = words(text), score = { gruss: 0, planen: 0, spielen: 0, stimme: 0 }, pts = {}, order = [], who = null, missing = null, rest = [];
    var cardStems = Object.keys(DATA.cards), whoStems = Object.keys(DATA.who), missStems = Object.keys(DATA.missing);
    function known(f) { return !!(best(f, cardStems) || best(f, whoStems) || INTENTS.some(function (n) { return best(f, DATA.intents[n].keys); })); }
    ws.forEach(function (w) {
      var top = "", n0 = "";
      INTENTS.forEach(function (n) { var s = best(w, DATA.intents[n].keys); if (len(s) > len(top)) { top = s; n0 = n; } });
      if (n0) score[n0] += 1;
      var c = best(w, cardStems), ids = c ? DATA.cards[c].map(avail).filter(Boolean) : [];
      ids.forEach(function (i, k) { if (!(i.id in pts)) { pts[i.id] = 0; order.push(i); } pts[i.id] += k ? 2 : 3; });
      // what is missing is named only for the word itself, not inside a compound ("Kindergeburtstag" is no birthday card)
      var m = best(w, missStems.filter(function (x) { return w.indexOf(x.replace(/\$$/, "")) === 0; })); if (m && !ids.length && !missing) missing = DATA.missing[m];
      var h = best(w, whoStems); if (h && !who) who = DATA.who[h];
      if (!n0 && !c && !h && w.length > 3 && STOP.indexOf(" " + w + " ") < 0) rest.push(w);
    });
    var name = nameIn(text, known), nf = D.fold(name);
    rest = rest.filter(function (w) { return w !== nf; });
    // Words no table knows go to the catalog search, one by one; a card that several of them find ranks higher.
    var found = {};
    rest.forEach(function (w) {
      var hs = D.searchIdeas(w, o.date || new Date()) || [];
      if (hs.length <= SPECIFIC) hs.forEach(function (h) { found[h.idea.id] = (found[h.idea.id] || 0) + 1; });
    });
    // The cards named in the sentence vote for their intent, so "Termin für den Spieleabend" is a plan, not a game; a
    // card the search found for a specific word votes once ("Halloween Party").
    order.forEach(function (i) { var n = intentOf(i); if (n) score[n] += 2; });
    Object.keys(found).forEach(function (id) { var n = intentOf(D.byId(id)); if (n) score[n] += 1; });
    var intent = o.intent || INTENTS.reduce(function (a, n) { return score[n] > (a ? score[a] : 0) ? n : a; }, "");
    var list = order.slice().sort(function (a, b) { return pts[b.id] - pts[a.id]; }).map(function (i) { return { idea: i, exact: true }; });
    Object.keys(found).sort(function (a, b) { return found[b] - found[a]; }).forEach(function (id) {
      var i = D.byId(id); if (!i || list.some(function (x) { return x.idea.id === id; })) return;
      if (!intent || intentOf(i) === intent) list.push({ idea: i, exact: found[id] > 1 && found[id] === rest.length });
    });
    if (intent) list = list.filter(function (x) { return intentOf(x.idea) === intent; });
    // Nothing named, but an intent: its curated cards, marked as a rough fit (never "exact" on a guess).
    if (intent && (list.length < 3 || o.intent)) cardsOf(intent).forEach(function (i) {
      if (!list.some(function (x) { return x.idea.id === i.id; })) list.push({ idea: i, exact: false });
    });
    if (missing) list.forEach(function (x) { x.exact = false; });
    // a sport that is not here yet: the action duels first (Puck, Elfer), the rest after them
    if (missing && missing.sport) list.sort(function (a, b) { return (b.idea.kind === "arcade") - (a.idea.kind === "arcade"); });
    return { intent: intent, who: who, name: name, top: list.slice(0, 4), missing: missing, words: ws.length };
  }
  // The name that goes on the card itself (a feel-good card puts it in front: "Oma, danke, dass es dich gibt."): a name
  // from the sentence, or a word one calls someone by (Oma, Papa); never "Bruder" or "Kollegen".
  function callName(r, lang) {
    if (r.name) return r.name;
    return r.who && r.who.call ? (r.who[lang] || r.who.de) : "";
  }

  var api = { INTENTS: INTENTS, understand: understand, intentOf: intentOf, cardsOf: cardsOf, callName: callName, hit: hit };
  if (node) module.exports = api; else root.StartIntent = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
