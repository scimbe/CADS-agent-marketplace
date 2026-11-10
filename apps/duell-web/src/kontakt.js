// Word filter, second half (P-D): a card travels as a link to whoever gets it, so it carries no way to reach anyone
// (phone, mail, account names, web addresses, "schreib mir auf ...") and no common insult as an order or about someone
// else. Joins C.isClean through C.CHECKS; "contact" gets a kind note of its own (texts filter_contact), nothing counts
// against anyone. Built into the core of the youth app only: Daily Business is a work tool where a phone number or a
// mail address on a meeting card is normal (scripts/build.js).
(function (root) {
  "use strict";
  var node = typeof module !== "undefined" && module.exports, C = node ? require("./core.js") : root.DuellCore;
  // On the folded text (lower case, no accents: "hässlich" -> "hasslich"). Whole phrases, so the verb "fressen" or "das
  // ist dumm gelaufen" stay free. The third person: one word (a name in any script, "Lisa aus der 7b") at the start of a
  // sentence, not "das/es/it ...".
  var MEAN = /\b(verpiss|verzieh)\s+dich\b|\bhalt\s+((doch|mal)\s+)?(die|deine?)\s+(fresse|klappe|schnauze|maul)|\b(fresse|schnauze|maul)\s+halten|\bhalt'?s\s+maul|\bleck\s+mich\b|\b(stirb|verreck)\b|\bhae?ng\s+dich\s+auf|\bdu\s+((kleine|dumme)[rs]?\s+)?(opfer|lappen|penner|spacko|spasti|idiot|vollidiot|depp|trottel|loser|versager|assi|freak)\b|\b(piss\s+off|go\s+die|go\s+to\s+hell|drop\s+dead|screw\s+you|kys)\b|\byou\s+((stupid|little)\s+)?(idiot|loser|moron|retard|dumbass|freak)\b|(^|[.!?,;:]\s*)(?!(das|es|dies|alles|that|it|this)\s)[\p{L}'-]+(\s+aus\s+der\s+\S+)?\s+(ist|is)\s+((so|voll|echt|total|richtig|really)\s+)*(hae?sslich|fett|eklig|wertlos|dumm|bloe?d|ein\s+(opfer|loser|versager|idiot|spast)|eine\s+(kuh|sau|schlampe)|ugly|fat|stupid|worthless|disgusting|a\s+(loser|freak))\b/u;
  // mail, "lisa (at) gmx", "lisa at gmx dot de", @handle (not "Kaffee @ 15 Uhr"), web addresses, messengers, "my number"
  var CONTACT = [
    /[^\s@]+@[^\s@]+\.\p{L}{2,}/u,
    /\S\s*[([]\s*(at|ät)\s*[)\]]\s*\S|\S\s+(at|ät)\s+\S+\s+(dot|punkt)\s+\p{L}{2}/iu,
    /(^|[^\p{L}\d._@-])@[\p{L}_][\p{L}\d_.]/u,
    /\bhttps?:|\bwww\.|:\/\/|\b(t|wa)\.me\/|\bbit\.ly\b|\b[a-z\d][a-z\d-]*\.(de|com|net|org|io|gg|tv|info|eu|app|shop|ch|at|ru)(?![\p{L}\d-])/iu,
    /\b(insta(gram)?|snapchat|whats\s*app|telegram|discord|tiktok|threema|(auf|bei|per|on|via)\s+(snap|signal))\b/i,
    /\b((handy|telefon|tel)\s*-?\s*(nr|nummer)|handynummer|telefonnummer|meine\s+nummer|my\s+(phone\s+)?number|phone\s+number|schreib\s+mir\s+(auf|bei|per|unter|an)|add\s+me\s+on|dm\s+me|adde?\s+mich|folg(e|t)?\s+mir\s+(auf|bei)|follow\s+me\s+on)\b/i
  ];
  // A phone number: 6 digits or more, also with spaces, dots, slashes, dashes or brackets. What only looks like one stays:
  // a date, years ("2025-2026"), a big number in groups ("1.000.000"), short groups ("1 2 3 4 5 6"), a count with its unit
  // ("250000 Punkte"); a time or a score ("17:30", "12:7") never joins up (":" is no separator).
  var RUN = /\+?\(?\d(?:[\d()]|[ .\/–-]{1,3}(?=\(?\d))*/g;
  var UNIT = /^\s*(punkte?|pkt|points?|euro|€|\$|km|m|kg|leute|people|jahre|years?|tage|days?|mal|schritte|steps|likes|%)(?!\p{L})/iu;
  function phone(run, after) {
    var g = run.split(/\D+/).filter(Boolean), b = run.replace(/[()]/g, "");
    if (g.join("").length < 6) return false;
    if (run[0] === "+") return true;
    if (/^\d\d?[.\/-]\d\d?[.\/-](\d\d|\d{4})$|^\d{4}-\d\d?(-\d\d?)?$/.test(b) || g.every(function (x) { return /^(1[5-9]|20)\d\d$/.test(x); })) return false;
    if (/^\(?0/.test(run)) return true;
    return !(/^[1-9]\d{0,2}([. ]\d{3})+$/.test(b) || (g.length > 1 && g.every(function (x) { return x.length < 3; })) || UNIT.test(after));
  }
  function hasContact(input) {
    var s = String(input == null ? "" : input).replace(/\s+/g, " "), m, re = new RegExp(RUN.source, "g");
    if (CONTACT.some(function (r) { return r.test(s); })) return true;
    // a colour "#306230" or part of a word "x1234567" is no number to call
    while ((m = re.exec(s))) if (!/[#\p{L}\d_]/u.test(s.charAt(m.index - 1)) && phone(m[0].replace(/[ .\/–()-]+$/, ""), s.slice(m.index + m[0].length))) return true;
    return false;
  }
  function check(input) { return hasContact(input) ? "contact" : MEAN.test(C.foldText(input).replace(/\s+/g, " ")) ? "word" : ""; }
  if (C.CHECKS.indexOf(check) < 0) C.CHECKS.push(check);
  if (node) module.exports = { hasContact: hasContact, check: check };
})(typeof window !== "undefined" ? window : globalThis);
