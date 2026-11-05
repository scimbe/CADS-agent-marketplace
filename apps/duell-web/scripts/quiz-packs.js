"use strict";
// Night packs for the quiz cards (Frag mich ab, Schätzen, Wörter, Lücke, Typen-Quiz): checked topic packs that cost no AI
// action. Two steps, like scripts/tags.js:
//   node scripts/quiz-packs.js generate <raw.json> [id,id]   asks the local model via LiteLLM, one topic per call, one at a time
//   node scripts/quiz-packs.js apply <raw.json>              filters the answers and writes src/quiz-packs.json
// Between the two a person reads raw.json, checks every fact and the youth protection, corrects or strikes questions in
// "answer" (the model's version stays in "draft", what was changed in "review") and sets "ok": true on the packs that
// passed; apply only takes those and filters again (QuizPack.sanitize, word list). Each pack: 6 to 8 questions, of which
// about 5 fit into one link (the person who sends it strikes the rest or the page cuts from the end).
// generate needs LITELLM_URL (…/v1) and LITELLM_KEY_FILE (path to the key; the key itself is never printed or stored).
// Only the topic goes out, nothing a user typed. The prompt is the server's quiz kind (CADS-DEMO-wrapper lib/duell-ai.mjs,
// kind quiz) plus one line for the night: some answers are whole numbers, so the pack also works for "Schätzen".
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const OUT = path.join(root, "src/quiz-packs.json"), MODEL = "local-qwen36-35b-a3b-coding", PAUSE_MS = 1500, MAX = 100;
// The topics: id, language, mode (lernen, firma = business flavor, gruppe = Typen-Quiz), the topic as the model gets it,
// the age from which it fits. Up to MAX packs; a new night adds topics here and runs generate for the new ids only.
const TOPICS = [
  ["planeten", "de", "lernen", "Die Planeten unseres Sonnensystems", 8],
  ["koerper", "de", "lernen", "Der menschliche Körper: Organe und Skelett", 10],
  ["photosynthese", "de", "lernen", "Photosynthese bei Pflanzen", 11],
  ["bundeslaender", "de", "lernen", "Die deutschen Bundesländer und ihre Hauptstädte", 9],
  ["mittelalter", "de", "lernen", "Ritter und Burgen im Mittelalter", 9],
  ["dinosaurier", "de", "lernen", "Dinosaurier", 8],
  ["wasserkreislauf", "de", "lernen", "Der Wasserkreislauf", 9],
  ["rom", "de", "lernen", "Das Römische Reich", 11],
  ["hauptstaedte", "de", "lernen", "Länder und Hauptstädte in Europa", 10],
  ["vulkane", "de", "lernen", "Vulkane und Erdbeben", 10],
  ["erfindungen", "de", "lernen", "Berühmte Erfindungen und ihre Erfinder", 11],
  ["wald", "de", "lernen", "Tiere und Pflanzen im heimischen Wald", 8],
  ["solar", "en", "lernen", "The planets of our solar system", 8],
  ["ocean", "en", "lernen", "Oceans and sea life", 9],
  ["egypt", "en", "lernen", "Ancient Egypt", 10],
  ["weather", "en", "lernen", "Weather and the water cycle", 9],
  ["datenschutz", "de", "firma", "Datenschutz im Büro: Grundlagen der DSGVO", 16],
  ["phishing", "de", "firma", "Sichere E-Mails im Büro: gefälschte Mails erkennen", 16],
  ["klassenfahrt", "de", "gruppe", "Klassenfahrt, Zeltlager, Ausflug", 10],
  ["teamtyp", "de", "gruppe", "Sportverein, Mannschaft, Training", 10],
];
const RULES = 'Audience: teenagers from 13. Clean, friendly, funny. No insults, no real people or brands, no violence, sex, drugs, alcohol, self-harm, religion or politics. No links, no contact data.';
const KIND_OK = 'ALWAYS start with the key "kind_ok": true when the request is friendly and harmless and your answer is too; false when it asks for insults, mocking, a dare, a roast, violence, something hurtful or exposing about a real person, or anything not for teenagers from 13 (then add nothing else).';
const COMPACT = "Write the JSON compact on ONE line without spaces or line breaks between keys; keep every text short.";
const lang_ = (l) => (l === "en" ? "English" : "German");
function system(l, m, n) {
  if (m === "gruppe") return 'You write a fun "which type are you" quiz for a group of friends, from their keywords. Every result type is a STRENGTH (e.g. the planner, the motivator), never a weakness, never a real person, no ranking.\n' + RULES + "\n" + KIND_OK + "\n" + COMPACT +
    '\nKeys: "kind_ok"; "titel": at most 40 characters; "typen": 3 or 4 objects {"name": at most 24 characters, "staerke": at most 80 characters, a kind sentence}; "fragen": exactly ' + n + ' objects {"f": question at most 100 characters, "antworten": 3 or 4 objects {"t": at most 50 characters, "typ": index into typen}}. Texts in ' + lang_(l) + ".";
  return "You write a quiz with " + n + " questions about the topic" + (m === "firma" ? " for colleagues (onboarding, no ranking of people)" : " for learning") + ".\n" + RULES + "\n" + KIND_OK + "\n" + COMPACT +
    '\nKeys: "kind_ok"; "titel": at most 40 characters; "fragen": exactly ' + n + ' objects {"f": question at most 120 characters, "a": the correct answer at most 60 characters, "d": exactly 3 wrong but plausible answers of at most 60 characters, "quelle_im_text": false}.' +
    '\nAsk about the central terms and facts of the topic and name them in the questions. "d" is ONE array of 3 strings.' +
    "\nFacts must be correct; if you are not sure of a fact, ask another question. Texts in " + lang_(l) + "." +
    '\nNight pack: at least 3 questions have a whole number as their answer, written in digits only in "a" (e.g. "8"), a number every textbook gives the same way.';
}
async function ask(url, key, sys, user) {
  const r = await fetch(url.replace(/\/+$/, "") + "/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: 1400, messages: [{ role: "system", content: sys }, { role: "user", content: user + "\nAnswer with minified JSON on one line." }] }) });
  const j = await r.json(), raw = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || "" : "";
  const s = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try { return JSON.parse(s); } catch (e) { return { raw: raw.slice(0, 4000) }; }
}
async function generate(file, only) {
  const url = process.env.LITELLM_URL, keyFile = String(process.env.LITELLM_KEY_FILE || "").replace(/^~/, require("os").homedir());
  if (!url || !keyFile) throw new Error("LITELLM_URL und LITELLM_KEY_FILE setzen");
  const key = fs.readFileSync(keyFile, "utf8").trim(), out = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { packs: {} };
  for (const [id, l, m, thema, ab] of TOPICS) {
    if (only.length ? only.indexOf(id) < 0 : out.packs[id]) continue;
    const t0 = Date.now(), o = await ask(url, key, system(l, m, 8), "Mode: " + m + ". Topic: <data>" + thema + "</data>");
    out.packs[id] = { lang: l, m: m, thema: thema, ab: ab, ok: false, answer: o };
    fs.writeFileSync(file, JSON.stringify(out, null, 1));
    console.log(id, o.raw ? "kein JSON (von Hand reparieren)" : o.kind_ok === true ? "kind_ok" : "abgelehnt", Date.now() - t0, "ms");
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  }
}
// raw answer -> the pack as the page keeps it (the server's option shape), or null. z: a whole number answer for Schätzen.
function packOf(id, e) {
  const C = require("../src/core.js"), M = require("../src/quizmake.js");
  const o = e.answer || {}, base = { id: id, lang: e.lang, m: e.m, ab: e.ab };
  if (o.kind_ok !== true) return null;
  const opt = e.m === "gruppe" ? { modus: "gruppe", titel: o.titel, typen: o.typen, fragen: o.fragen } : { modus: e.m, titel: o.titel, fragen: (o.fragen || []).map((q) => Object.assign({}, q, { quelle_im_text: false })) };
  const pk = M.fromOption(opt);
  if (!pk || !M.clean(pk, C.isClean)) return null;
  return Object.assign(base, { pk: pk });
}
function apply(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8")), packs = [];
  for (const [id] of TOPICS) {
    const e = raw.packs[id];
    if (!e || e.ok !== true) { console.log(id, "nicht geprüft, bleibt draußen"); continue; }
    const p = packOf(id, e);
    if (!p) { console.log(id, "fällt durch den Filter"); continue; }
    packs.push(p);
  }
  const data = { v: 1, max: MAX, checked: raw.checked || new Date().toISOString().slice(0, 10), model: MODEL, packs: packs.slice(0, MAX) };
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
  console.log("src/quiz-packs.json:", packs.length, "Pakete");
}
if (require.main === module) {
  const [cmd, file, ids] = process.argv.slice(2);
  if (cmd === "generate" && file) generate(file, ids ? ids.split(",") : []).catch((e) => { console.error(e.message); process.exit(1); });
  else if (cmd === "apply" && file) apply(file);
  else { console.error("node scripts/quiz-packs.js generate|apply <raw.json> [ids]"); process.exit(2); }
}
module.exports = { TOPICS: TOPICS, packOf: packOf, system: system };
