// Eigenes Fragepaket über die KI-Art quiz (alt:src/quiz-ui.js ask/topic/own + alt:src/ai.js). Nur reine Funktionen:
// den Eingabeteil für POST /api/duell/ai bauen und die Antwort zu einem Paket machen. Den Aufruf (Gerät, Beweis,
// Warteschlange, Übernehmen/Verwerfen mit Beleg) macht der Host über src/broker/api.js, nie die Karte.
// Server: CADS-DEMO-wrapper lib/duell-ai.mjs, kind quiz: input { modus: lernen|gruppe|firma, thema (≤ 80), text (≤ 3000,
// nicht bei gruppe), n 3..8 }; Antwort 200 { options: [{ modus, titel, fragen, typen? }], seals, receipt?, meter }.
import { cleanInput } from "./clean.js";
import { fromOption } from "./make.js";

export const TEXT_MAX = 3000, TEXT_MIN = 80, ASK_N = 6, TOPIC_MAX = 80;

/** Modus je Karte (alt quiz-ui modus): Typen ist Gruppe, im Business-Regal Firma, sonst Lernen. */
export function modus(g, business) { return g === "typen" ? "gruppe" : business ? "firma" : "lernen"; }

/** Eingabe aus einem Thema (bei Gruppe: drei Stichworte) oder null, wenn der Filter es nicht durchlässt. */
export function topicInput(mo, raw) {
  const v = cleanInput(raw, TOPIC_MAX);
  return v && Array.from(v).length >= 3 ? { modus: mo, thema: v, n: ASK_N } : null;
}
/** Eingabe aus eigenem Lern- oder Firmentext (nie bei Gruppe) oder null bei weniger als 80 Zeichen. */
export function textInput(mo, raw) {
  if (mo === "gruppe") return null;
  const v = String(raw === undefined || raw === null ? "" : raw).replace(/[<>]/g, " ").trim();
  return v.length >= TEXT_MIN ? { modus: mo, text: v.slice(0, TEXT_MAX), n: ASK_N } : null;
}
/** Anfragekörper (ohne device/proof, die der Host ergänzt), wie alt ai.js ask ihn schickt. */
export function requestBody(input, lang) { return { kind: "quiz", input, lang: lang === "en" ? "en" : "de", queue: "ticket" }; }

/** Antwort des Servers (200) -> { pk, inText } je Option; inText: je Frage des Pakets, ob die Antwort im eigenen Text
 *  steht (quelle_im_text, nur bei eigenem Text). Ungültige Optionen fallen weg. */
export function packsFrom(json, ownText) {
  const opts = json && Array.isArray(json.options) ? json.options : [];
  return opts.map((opt) => {
    const pk = fromOption(opt);
    if (!pk) return null;
    const key = (f) => String(f || "").replace(/\s+/g, " ").trim().slice(0, 40), inT = {};
    if (ownText && opt && Array.isArray(opt.fragen)) opt.fragen.forEach((x) => { if (x) inT[key(x.f)] = x.quelle_im_text === true; });
    return { pk, inText: ownText && pk.m !== "g" ? pk.q.map((r) => inT[key(r[0])] === true) : null };
  }).filter(Boolean);
}
