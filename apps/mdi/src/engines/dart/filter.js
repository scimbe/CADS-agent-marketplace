// Wortfilter fuer Spitznamen, bitgleich aus dem Altcode portiert: alt:src/core.js (words, HURT, foldText),
// alt:src/kontakt.js (Kontaktdaten, Beleidigung als Befehl) und alt:src/quest.js (clean mit CONTACT).
// Offen: gehoert in ein gemeinsames Modul, sobald ein anderer Strang denselben Filter braucht (hier nur fuer Dart).

const STEMS = [
  "fuck", "shit", "bitch", "asshole", "nigger", "nigga", "faggot", "whore", "slut", "rapist", "hitler", "nazi",
  "scheiss", "arschloch", "fotze", "hurensohn", "wichser", "ficken", "schlampe", "missgeburt", "vergewaltig", "kanake", "behindert", "neger", "mongo", "judensau", "kinderfick", "pornhub"
];
const WORDS = ["cunt", "pedo", "dick", "cock", "porn", "rape", "fag", "fick", "nutte", "hure", "spast", "kkk", "isis", "nsdap"];
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "+": "t" };

export function foldText(s) {
  s = String(s === undefined || s === null ? "" : s).toLowerCase();
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.replace(/ß/g, "ss");
}
const HURT = /\b(du|ihr)\s+(bist|seid)\s+((so|voll|echt|total|richtig|einfach)\s+)*(h(ä|ae)sslich|fett|dumm|bl(ö|oe)d|peinlich|eklig|wertlos|nichts|ein\s+opfer|ein\s+loser)|(niemand|keiner)\s+mag\s+(dich|euch)|lachen\s+(alle\s+)?(ü|ue)ber\s+(dich|euch)|hasse\s+dich|geh\s+sterben|bring\s+dich\s+um|solltest\s+(sterben|verschwinden)|\byou\s+are\s+((so|really|just)\s+)*(ugly|fat|stupid|worthless|nothing|a\s+loser)|\byou'?re\s+((so|really|just)\s+)*(ugly|fat|stupid|worthless|nothing|a\s+loser)|nobody\s+likes\s+you|laugh(s|ing)?\s+at\s+you\b|i\s+hate\s+you|kill\s+yourself/;
function words(input) {
  if (HURT.test(String(input === undefined || input === null ? "" : input).toLowerCase().replace(/\s+/g, " "))) return false;
  const base = foldText(input);
  const leet = base.replace(/[0134578@$!+]/g, (c) => LEET[c] || c);
  for (const v of [base, leet]) {
    const joined = v.replace(/[^a-z]/g, "");
    const squeezed = joined.replace(/(.)\1+/g, "$1");
    for (const stem of STEMS) if (joined.indexOf(stem) >= 0 || squeezed.indexOf(stem.replace(/(.)\1+/g, "$1")) >= 0) return false;
    for (const t of v.split(/[^a-z]+/)) if (t && WORDS.indexOf(t) >= 0) return false;
  }
  return true;
}

// alt:src/kontakt.js
const MEAN = /\b(verpiss|verzieh)\s+dich\b|\bhalt\s+((doch|mal)\s+)?(die|deine?)\s+(fresse|klappe|schnauze|maul)|\b(fresse|schnauze|maul)\s+halten|\bhalt'?s\s+maul|\bleck\s+mich\b|\b(stirb|verreck)\b|\bhae?ng\s+dich\s+auf|\bdu\s+((kleine|dumme)[rs]?\s+)?(opfer|lappen|penner|spacko|spasti|idiot|vollidiot|depp|trottel|loser|versager|assi|freak)\b|\b(piss\s+off|go\s+die|go\s+to\s+hell|drop\s+dead|screw\s+you|kys)\b|\byou\s+((stupid|little)\s+)?(idiot|loser|moron|retard|dumbass|freak)\b|(^|[.!?,;:]\s*)(?!(das|es|dies|alles|that|it|this)\s)[\p{L}'-]+(\s+aus\s+der\s+\S+)?\s+(ist|is)\s+((so|voll|echt|total|richtig|really)\s+)*(hae?sslich|fett|eklig|wertlos|dumm|bloe?d|ein\s+(opfer|loser|versager|idiot|spast)|eine\s+(kuh|sau|schlampe)|ugly|fat|stupid|worthless|disgusting|a\s+(loser|freak))\b/u;
const KONTAKT = [
  /[^\s@]+@[^\s@]+\.\p{L}{2,}/u,
  /\S\s*[([]\s*(at|ät)\s*[)\]]\s*\S|\S\s+(at|ät)\s+\S+\s+(dot|punkt)\s+\p{L}{2}/iu,
  /(^|[^\p{L}\d._@-])@[\p{L}_][\p{L}\d_.]/u,
  /\bhttps?:|\bwww\.|:\/\/|\b(t|wa)\.me\/|\bbit\.ly\b|\b[a-z\d][a-z\d-]*\.(de|com|net|org|io|gg|tv|info|eu|app|shop|ch|at|ru)(?![\p{L}\d-])/iu,
  /\b(insta(gram)?|snapchat|whats\s*app|telegram|discord|tiktok|threema|(auf|bei|per|on|via)\s+(snap|signal))\b/i,
  /\b((handy|telefon|tel)\s*-?\s*(nr|nummer)|handynummer|telefonnummer|meine\s+nummer|my\s+(phone\s+)?number|phone\s+number|schreib\s+mir\s+(auf|bei|per|unter|an)|add\s+me\s+on|dm\s+me|adde?\s+mich|folg(e|t)?\s+mir\s+(auf|bei)|follow\s+me\s+on)\b/i
];
const RUN = /\+?\(?\d(?:[\d()]|[ .\/–-]{1,3}(?=\(?\d))*/g;
const UNIT = /^\s*(punkte?|pkt|points?|euro|€|\$|km|m|kg|leute|people|jahre|years?|tage|days?|mal|schritte|steps|likes|%)(?!\p{L})/iu;
function phone(run, after) {
  const g = run.split(/\D+/).filter(Boolean), b = run.replace(/[()]/g, "");
  if (g.join("").length < 6) return false;
  if (run[0] === "+") return true;
  if (/^\d\d?[.\/-]\d\d?[.\/-](\d\d|\d{4})$|^\d{4}-\d\d?(-\d\d?)?$/.test(b) || g.every((x) => /^(1[5-9]|20)\d\d$/.test(x))) return false;
  if (/^\(?0/.test(run)) return true;
  return !(/^[1-9]\d{0,2}([. ]\d{3})+$/.test(b) || (g.length > 1 && g.every((x) => x.length < 3)) || UNIT.test(after));
}
export function hasContact(input) {
  const s = String(input === undefined || input === null ? "" : input).replace(/\s+/g, " "), re = new RegExp(RUN.source, "g");
  if (KONTAKT.some((r) => r.test(s))) return true;
  let m;
  while ((m = re.exec(s))) if (!/[#\p{L}\d_]/u.test(s.charAt(m.index - 1)) && phone(m[0].replace(/[ .\/–()-]+$/, ""), s.slice(m.index + m[0].length))) return true;
  return false;
}
function check(input) { return hasContact(input) ? "contact" : MEAN.test(foldText(input).replace(/\s+/g, " ")) ? "word" : ""; }
export function isClean(input) { return !check(input) && words(input); }

// alt:src/quest.js clean
const CONTACT = /https?:|www\.|\.(de|com|org|net)\b|@|\d[\d\s/-]{4,}\d|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*uhr\b|stra(ß|ss)e|\bstr\.|(markt|sport|spiel|park|schul)platz|treffpunkt|treffen\b|\btreff\b|adresse|standort|bahnhof|haltestelle|komm (zu|allein|\w* ?vorbei)|allein|hausnummer|handynummer|telefon|snap|insta|tiktok|whatsapp|discord|\bstreet\b|\bmeet\b|address|location|\bcome (to|alone|over)|\balone\b|phone number/i;
export function clean(s, max) {
  const t = Array.from(String(s === undefined || s === null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
  return t && isClean(t) && !CONTACT.test(t) ? t : "";
}
