"use strict";
// Occasion and synonym tags for the search ("Geschenk für Oma" finds the card, offline). Two steps, both by hand or nightly:
//   node scripts/tags.js generate <raw.json>   asks the local model via LiteLLM, two cards per call, one call at a time
//   node scripts/tags.js apply <raw.json>      filters the answers and writes them into the field tags of both catalogs
// Between the two a person reads raw.json and strikes what does not fit; apply only sees what is left and filters again.
// generate needs LITELLM_URL (…/v1) and LITELLM_KEY_FILE (path to the key; the key itself is never printed or stored).
// Only card titles and subtitles go out, nothing a user typed. apply keeps tags that are already there and touches no
// other field: each card's text is edited in place, so it runs again unchanged on a catalog another branch has changed.
const fs = require("fs");
const path = require("path");
const C = require("../src/core.js");
const D = require("../src/daily.js");
const root = path.join(__dirname, "..");
const CATALOGS = ["src/ideas.json", "src/flavors/business/ideas.json"];
const MODEL = "local-qwen36-35b-a3b-coding", PER_CALL = 2, MAX_CALLS = 200, PAUSE_MS = 1500, PER_LANG = 7;

// Beyond the app's word list (C.isClean): nothing a 13-year-old should be steered to, no crisis or health words a card
// cannot carry, no brands. Stems match inside the folded tag, words only whole ("wein" but not "weinen" or "schwein").
const DENY = ["alkohol", "alcohol", "schnaps", "saufen", "besoffen", "betrunk", "trinkspiel", "drinking", "gluecksspiel", "gambl", "casino",
  "dating", "flirt", "sexy", "erotik", "kiffen", "zigarett", "cigarett", "vape", "waffe", "weapon", "mobb", "bully", "rache", "revenge",
  "depress", "suizid", "suicid", "therapie", "therapy", "diaet", "abnehm", "whatsapp", "tiktok", "instagram", "snapchat", "discord",
  "netflix", "youtube", "amazon", "google", "fortnite", "minecraft"];
const DENY_WORDS = ["wein", "wine", "bier", "beer", "sekt", "shot", "shots", "party drink", "rauchen", "smoking", "diet", "zoom", "teams", "date", "dates"];
// The content checks of the catalog (test/daily.test.js, test/ideas2.test.js) apply to tags too, false alarms included.
const UNSAFE = /alkohol|bier\b|schnaps|vodka|wodka|zigarett|rauch|droge|kiffen|nackt|kuss|küss|sex|waffe|messer|klau|stehl|prügel|schlag dich|dach|gleis|autobahn|fremde|hässlich|fett\b|beer\b|cigarette|smok|drug|naked|kiss|steal|weapon|knife|ugly|\broof|train track|mutprobe|\bdare\b|vorlage|signatur|sandbox|template|prompt|manifest|\bapi\b|lernziel|lektion|standort|gps|locati|öffentlich|oeffentlich|public/i;
// Words that fit every card find every card: they carry no meaning for the search. Whole folded tag only.
const GENERIC = ["spass", "fun", "unterhaltung", "entertainment", "spiel", "game", "games", "kreativ", "creative", "lustig", "funny", "witzig",
  "humor", "freizeit", "leisure", "zeitvertreib", "pastime", "freude", "joy", "interaktiv", "interactive", "app", "karte", "card", "online",
  "digital", "aktivitaet", "activity", "abwechslung", "schnell", "fast", "einfach", "easy", "freunde", "friends", "spielen", "play", "lachen", "laugh"];
function cleanTag(s) {
  if (typeof s !== "string") return "";
  const t = s.toLowerCase().replace(/[^\p{L}\p{N} &'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 28 || t.split(" ").length > 3) return "";
  const f = D.fold(t);
  if (!f || GENERIC.indexOf(f) >= 0 || UNSAFE.test(t) || !C.isClean(t) || DENY.some((w) => f.indexOf(w) >= 0) || f.split(" ").some((w) => DENY_WORDS.indexOf(w) >= 0)) return "";
  return t;
}
// What the search already sees for a card, without tags: title, subtitle and kind in both languages.
function hayOf(idea) {
  return D.fold([idea.kind].concat(["de", "en"].map((l) => (idea[l] ? idea[l].t + " " + idea[l].s : ""))).join(" "));
}
// The search matches each word as a substring, so a tag that is already inside the card's text, an existing tag or a
// longer suggestion adds nothing and is dropped: "geburtstag" goes when "geburtstagsfeier" stays. Otherwise the model's
// order counts (occasions first), at most PER_LANG per language.
function filterTags(idea, raw) {
  const hay = hayOf(idea), keep = (idea.tags || []).slice(), seen = keep.map(D.fold), lists = {}, all = [];
  for (const lang of ["de", "en"]) {
    lists[lang] = [];
    for (const t of ((raw && raw[lang]) || []).map(cleanTag).filter(Boolean)) {
      const f = D.fold(t);
      if (all.indexOf(f) < 0) { all.push(f); lists[lang].push(t); }
    }
  }
  for (const lang of ["de", "en"]) {
    let n = 0;
    for (const t of lists[lang]) {
      const f = D.fold(t);
      if (n >= PER_LANG || hay.indexOf(f) >= 0 || seen.some((s) => s.indexOf(f) >= 0) || all.some((g) => g !== f && g.indexOf(f) >= 0)) continue;
      keep.push(t); seen.push(f); n++;
    }
  }
  return keep;
}

const PROMPT = "Du erzeugst Suchbegriffe für Karten einer Alltags-App für Familien, Freundeskreise, Schule und Büro (Nutzer ab 13). " +
  "Leute suchen nicht nach dem Kartentitel, sondern nach ihrer Situation: Für welchen Anlass, für wen, wozu? " +
  "Gib für jede Karte 8 bis 12 deutsche (de) und 8 bis 12 englische (en) Begriffe, mindestens die Hälfte davon Anlässe, Personen oder Zwecke, " +
  "z. B. geburtstag, weihnachten, klassenfahrt, grillabend, teammeeting, abschied, regentag, langeweile, oma, kollegin, geschwister, wg, " +
  "mathe lernen, geschenk für oma, streit schlichten, fernbeziehung. Der Rest sind Synonyme. Nur Begriffe, bei denen die Karte wirklich hilft. " +
  "Kleinschreibung, 1 bis 3 Wörter, keine Marken, nichts zu Alkohol, Glücksspiel, Dating oder Gewalt, keine Wörter aus dem Titel. " +
  'Beispiel für eine geteilte Einkaufsliste: {"zug-einkauf":{"de":["grillabend","geburtstagsparty","wg","wocheneinkauf","picknick","mitbringliste","familie","rezept"],' +
  '"en":["barbecue","birthday party","flatmates","weekly shop","picnic","potluck","family","groceries"]}}. ' +
  'Antworte nur mit JSON: {"<id>":{"de":[...],"en":[...]}, ...}';
function cardLine(i, names) {
  const g = i.turn && i.turn.g ? ", Spiel " + i.turn.g : "";
  return i.id + " (" + (names[i.kind] || i.kind) + g + "): " + i.de.t.replace("|", " ") + ". " + i.de.s + " / " + i.en.t.replace("|", " ") + ". " + i.en.s;
}
async function generate(out) {
  const url = process.env.LITELLM_URL, keyFile = process.env.LITELLM_KEY_FILE;
  if (!url || !keyFile) throw new Error("LITELLM_URL und LITELLM_KEY_FILE setzen");
  const key = fs.readFileSync(keyFile, "utf8").trim(), T = require("../src/texts.json").de;
  const cards = [];
  for (const f of CATALOGS) { const c = JSON.parse(fs.readFileSync(path.join(root, f), "utf8")); cards.push(...(c.gated || []), ...c.ideas); }
  const done = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  const todo = cards.filter((i) => !done[i.id]);
  let calls = 0;
  for (let k = 0; k < todo.length && calls < MAX_CALLS; k += PER_CALL) {
    const batch = todo.slice(k, k + PER_CALL);
    calls++;
    try {
      const r = await fetch(url.replace(/\/$/, "") + "/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model: MODEL, temperature: 0.2, presence_penalty: 0.6, max_tokens: 900, response_format: { type: "json_object" }, chat_template_kwargs: { enable_thinking: false },
          messages: [{ role: "system", content: PROMPT }, { role: "user", content: batch.map((i) => cardLine(i, T)).join("\n") }] }) });
      const j = await r.json(), o = JSON.parse(j.choices[0].message.content);
      for (const i of batch) {
        const v = o[i.id];
        // a model stuck in a loop repeats one phrase: fewer than 5 different suggestions per language is asked again
        const uniq = (a) => Array.isArray(a) ? new Set(a.filter((x) => typeof x === "string").map(D.fold)).size : 0;
        if (v && uniq(v.de) >= 5 && uniq(v.en) >= 5) done[i.id] = { de: v.de.filter((x) => typeof x === "string"), en: v.en.filter((x) => typeof x === "string") };
        else console.log("ungueltig:", i.id);
      }
    } catch (e) { console.log("Fehler bei", batch.map((i) => i.id).join(","), String(e.message).slice(0, 80)); }
    fs.writeFileSync(out, JSON.stringify(done, null, 1));
    console.log(calls, Object.keys(done).length + "/" + cards.length);
    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }
}
// Each card object in the catalog's top-level arrays, as [start, end) in the source text.
function cardSpans(s) {
  const out = [];
  let depth = 0, str = false, start = -1;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (str) { if (ch === "\\") k++; else if (ch === '"') str = false; continue; }
    if (ch === '"') str = true;
    else if (ch === "{" || ch === "[") { if (++depth === 3 && ch === "{") start = k; }
    else if (ch === "}" || ch === "]") { if (depth-- === 3 && ch === "}") out.push([start, k + 1]); }
  }
  return out;
}
// Edits the source text, not a re-serialized object: in each card the tags array is replaced, or added as its first key.
function apply(rawFile) {
  const raw = JSON.parse(fs.readFileSync(rawFile, "utf8"));
  for (const f of CATALOGS) {
    const file = path.join(root, f), src = fs.readFileSync(file, "utf8"), before = JSON.parse(src), want = {};
    let s = "", last = 0;
    for (const [a, b] of cardSpans(src)) {
      const text = src.slice(a, b), card = JSON.parse(text), tags = raw[card.id] ? filterTags(card, raw[card.id]) : [];
      let next = text;
      if (tags.length) {
        want[card.id] = tags;
        const arr = '"tags":' + (/\n/.test(text) ? " " : "") + JSON.stringify(tags);
        next = card.tags ? text.replace(/"tags":\s*\[[^\]]*\]/, () => arr) : text.replace(/^\{(\s*)/, (m, ws) => "{" + ws + arr + "," + ws);
      }
      s += src.slice(last, a) + next; last = b;
    }
    s += src.slice(last);
    const after = JSON.parse(s), cards = (o) => (o.gated || []).concat(o.ideas);
    for (const i of cards(after)) if (want[i.id] && JSON.stringify(i.tags) !== JSON.stringify(want[i.id])) throw new Error(f + ": tags von " + i.id);
    for (const i of cards(after).concat(cards(before))) delete i.tags;
    if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(f + ": mehr als tags geaendert");
    fs.writeFileSync(file, s);
  }
}
module.exports = { cleanTag: cleanTag, filterTags: filterTags, DENY: DENY, GENERIC: GENERIC };
if (require.main === module) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "generate" && file) generate(file).catch((e) => { console.error(e.message); process.exit(1); });
  else if (cmd === "apply" && file) apply(file);
  else { console.error("node scripts/tags.js generate|apply <raw.json>"); process.exit(1); }
}
