// Wortfilter der Altkarten (alt:src/core.js isClean/words + alt:src/kontakt.js check), wörtlich portiert.
// Jeder Text eines Fragepakets läuft hier durch (alt:src/quizpack.js txt). Rein, ohne DOM und Netz.
// Hinweis: gehört fachlich in ein gemeinsames Modul (andere Stränge brauchen denselben Filter); bis dahin hier.
const STEMS = [
  "fuck", "shit", "bitch", "asshole", "nigger", "nigga", "faggot", "whore", "slut", "rapist", "hitler", "nazi",
  "scheiss", "arschloch", "fotze", "hurensohn", "wichser", "ficken", "schlampe", "missgeburt", "vergewaltig", "kanake", "behindert", "neger", "mongo", "judensau", "kinderfick", "pornhub"
];
const WORDS = ["cunt", "pedo", "dick", "cock", "porn", "rape", "fag", "fick", "nutte", "hure", "spast", "kkk", "isis", "nsdap"];
const BANNED_WORDS = WORDS;
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "+": "t" };

function foldText(s) {
  s = String(s == null ? "" : s).toLowerCase();
  try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* old engine */ }
  s = s.replace(/ß/g, "ss");
  return s;
}
// Words are not enough: these sentences are clean word by word and still hurt.
const HURT = /\b(du|ihr)\s+(bist|seid)\s+((so|voll|echt|total|richtig|einfach)\s+)*(h(ä|ae)sslich|fett|dumm|bl(ö|oe)d|peinlich|eklig|wertlos|nichts|ein\s+opfer|ein\s+loser)|(niemand|keiner)\s+mag\s+(dich|euch)|lachen\s+(alle\s+)?(ü|ue)ber\s+(dich|euch)|hasse\s+dich|geh\s+sterben|bring\s+dich\s+um|solltest\s+(sterben|verschwinden)|\byou\s+are\s+((so|really|just)\s+)*(ugly|fat|stupid|worthless|nothing|a\s+loser)|\byou'?re\s+((so|really|just)\s+)*(ugly|fat|stupid|worthless|nothing|a\s+loser)|nobody\s+likes\s+you|laugh(s|ing)?\s+at\s+you\b|i\s+hate\s+you|kill\s+yourself/;
const MEAN = /\b(verpiss|verzieh)\s+dich\b|\bhalt\s+((doch|mal)\s+)?(die|deine?)\s+(fresse|klappe|schnauze|maul)|\b(fresse|schnauze|maul)\s+halten|\bhalt'?s\s+maul|\bleck\s+mich\b|\b(stirb|verreck)\b|\bhae?ng\s+dich\s+auf|\bdu\s+((kleine|dumme)[rs]?\s+)?(opfer|lappen|penner|spacko|spasti|idiot|vollidiot|depp|trottel|loser|versager|assi|freak)\b|\b(piss\s+off|go\s+die|go\s+to\s+hell|drop\s+dead|screw\s+you|kys)\b|\byou\s+((stupid|little)\s+)?(idiot|loser|moron|retard|dumbass|freak)\b|(^|[.!?,;:]\s*)(?!(das|es|dies|alles|that|it|this)\s)[\p{L}'-]+(\s+aus\s+der\s+\S+)?\s+(ist|is)\s+((so|voll|echt|total|richtig|really)\s+)*(hae?sslich|fett|eklig|wertlos|dumm|bloe?d|ein\s+(opfer|loser|versager|idiot|spast)|eine\s+(kuh|sau|schlampe)|ugly|fat|stupid|worthless|disgusting|a\s+(loser|freak))\b/u;
// mail, "lisa (at) gmx", "lisa at gmx dot de", @handle (not "Kaffee @ 15 Uhr"), web addresses, messengers, "my number"
const CONTACT = [
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
const RUN = /\+?\(?\d(?:[\d()]|[ .\/–-]{1,3}(?=\(?\d))*/g;
const UNIT = /^\s*(punkte?|pkt|points?|euro|€|\$|km|m|kg|leute|people|jahre|years?|tage|days?|mal|schritte|steps|likes|%)(?!\p{L})/iu;
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
function check(input) { return hasContact(input) ? "contact" : MEAN.test(foldText(input).replace(/\s+/g, " ")) ? "word" : ""; }
function words(input) {
  if (HURT.test(String(input == null ? "" : input).toLowerCase().replace(/\s+/g, " "))) return false;
  var base = foldText(input);
  var leet = base.replace(/[0134578@$!+]/g, function (c) { return LEET[c] || c; });
  var variants = [base, leet];
  for (var i = 0; i < variants.length; i++) {
    var v = variants[i];
    var joined = v.replace(/[^a-z]/g, "");            // "f u c k", "f.u.c.k"
    var squeezed = joined.replace(/(.)\1+/g, "$1");   // "fuuuck"
    for (var j = 0; j < STEMS.length; j++) {
      var stem = STEMS[j];
      if (joined.indexOf(stem) >= 0 || squeezed.indexOf(stem.replace(/(.)\1+/g, "$1")) >= 0) return false;
    }
    var tokens = v.split(/[^a-z]+/);
    for (var t = 0; t < tokens.length; t++) {
      if (tokens[t] && BANNED_WORDS.indexOf(tokens[t]) >= 0) return false;
    }
  }
  return true;
}
/** Grund, warum ein Text draußen bleibt ("contact" | "word"), sonst "". */
export function whyNot(input) { const r = check(input); if (r) return r; return words(input) ? "" : "word"; }
export function isClean(input) { return !whyNot(input); }
export { foldText, hasContact };

// alt:src/quest.js: keine Treffpunkte, Adressen oder Kontaktwege (für Freitexte in Zügen, z. B. die eigenen Lernkarten).
const QUEST_CONTACT = /https?:|www\.|\.(de|com|org|net)\b|@|\d[\d\s/-]{4,}\d|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*uhr\b|stra(ß|ss)e|\bstr\.|(markt|sport|spiel|park|schul)platz|treffpunkt|treffen\b|\btreff\b|adresse|standort|bahnhof|haltestelle|komm (zu|allein|\w* ?vorbei)|allein|hausnummer|handynummer|telefon|snap|insta|tiktok|whatsapp|discord|\bstreet\b|\bmeet\b|address|location|\bcome (to|alone|over)|\balone\b|phone number/i;
function cut(s, max) { return Array.from(String(s === undefined || s === null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim(); }
/** alt:src/quest.js clean */
export function questClean(s, max) { const t = cut(s, max); return t && isClean(t) && !QUEST_CONTACT.test(t) ? t : ""; }
/** alt:src/quest.js fold */
export function questFold(s) { return String(s === undefined || s === null ? "" : s).toLowerCase().replace(/ß/g, "ss").replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, ""); }
/** alt:src/daily.js cleanInput */
export function cleanInput(s, max) { const t = cut(s, max || 90); return t && isClean(t) ? t : ""; }
