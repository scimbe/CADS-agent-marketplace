// Ergaenzungen zum gemeinsamen Textfilter (src/contract/text.js, Strang F): cleanInput, Name und Emoji exakt wie
// alt:src/daily.js cleanInput und alt:src/core.js sanitizeName/sanitizeEmoji. Der Filter selbst existiert nur einmal.
import { isClean, whyNot, hasContact, foldText } from "../../contract/text.js";
export { isClean, whyNot, hasContact, foldText };
export const MAX_NAME = 16;
export const DEFAULT_EMOJI = "🪁";
/** Textschluessel fuer den freundlichen Hinweis (alt texts filter / filter_contact). */
export function filterNote(input) { return whyNot(input) === "contact" ? "filter_contact" : "filter"; }
/** alt:src/daily.js cleanInput: Steuerzeichen und Markup raus, Leerraum zusammen, nach Codepunkten kuerzen, dann Filter. */
export function cleanInput(s, max = 90) {
  const t = Array.from(String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("").trim();
  return t && isClean(t) ? t : "";
}
function stripText(s) {
  return String(s == null ? "" : s).replace(/[^\p{L}\p{N}\p{Extended_Pictographic}‍️ _\-.!?'’:,&+#]/gu, "").replace(/\s+/g, " ").trim();
}
export function sanitizeName(s) {
  const n = Array.from(stripText(s)).slice(0, MAX_NAME).join("").trim();
  return n && isClean(n) ? n : "";
}
const EMOJI_RE = /^\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*/u;
export function sanitizeEmoji(s) {
  if (typeof s !== "string") return DEFAULT_EMOJI;
  const m = s.trim().match(EMOJI_RE);
  return m && m[0].length <= 12 ? m[0] : DEFAULT_EMOJI;
}
