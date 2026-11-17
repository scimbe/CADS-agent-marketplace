// Freie Karte 2, P3: Befunde aus Bot-Runner-Bericht, statischer Pruefung und Content-Policy als Saetze fuer die
// Reparaturrunde (Modell) und als feste Fehlerarten-Kennungen fuer die Auswertung (Harness-Optimierung).
// Rein: keine Uhr, kein Netz.

const HILFE = {
  scoreChanges: "Beim Spielen entstehen keine Punkte. g.addScore(n) muss bei normalem Spielen erreichbar sein (Treffer, Einsammeln, Ausweichen, Zeit ueberleben).",
  gameOverReachable: "In 60 s Spielzeit hat kein Bot (Nichtstun, Zufall, Vorausplanung) das Spielende erreicht. Es muss verlierbar sein: Kollision -> g.loseLife(), oder ein Zeit-/Zuglimit -> g.gameOver() bzw. g.win().",
  restartWorks: "Neustart ergibt keinen frischen Start. Alles Veraenderliche gehoert in s aus init(g); keine Variablen auf Modulebene veraendern (const-Tabellen sind ok).",
  inputsEffective: "Eine deklarierte Steuerung aendert den Zustand nicht sichtbar. Jede Steuerung in controls muss s innerhalb von 45 Frames veraendern, sonst aus controls entfernen.",
  deterministic: "Zwei Laeufe mit gleichem Seed enden verschieden. Zufall nur ueber g.random()/g.randInt(), kein Zustand ausserhalb von s.",
  performance: "Ein Frame ist zu teuer (p95 > 4 ms) oder zeichnet zu viel (> 1500 Befehle). Weniger Objekte, Listen kurz halten, keine verschachtelten Schleifen ueber alles.",
  framesContinuous: "Der Frame-Zaehler springt. update(s, input, g) darf nichts zurueckgeben und g nicht umgehen.",
  noNetwork: "Netzzugriff versucht. Kein fetch, kein Bild-/Datei-Laden; alles steckt im Code.",
  static: "Statische Pruefung."
};

const STATIC_HILFE = [
  [/Math\.(sin|cos|tan|atan2|atan|asin|acos)/, "Statt Math.sin/Math.cos: g.sin(grad)/g.cos(grad) (Grad!). Fuer Richtungen zum Ziel: dx/dy normieren mit Math.sqrt."],
  [/Math\.random/, "Statt Math.random(): g.random() oder g.randInt(a, b)."],
  [/Math\.(pow|hypot|exp|log)/, "Statt Math.pow/hypot: x * x und Math.sqrt(dx * dx + dy * dy) bzw. g.dist(a, b)."],
  [/\*\*/, "Der Operator ** ist verboten: x * x schreiben."],
  [/Global (Date|performance)/, "Keine Uhr: Zeit in Frames zaehlen (g.frame, eigener Zaehler in s)."],
  [/Global (setTimeout|setInterval|requestAnimationFrame)/, "Keine Zeitgeber: Verzoegerungen als Frame-Zaehler in s."],
  [/Global (window|document|self|globalThis)/, "Kein DOM/Global: nur g, s, input, d benutzen."],
  [/import/, "Keine Importe: genau eine Datei, alles steht drin."],
  [/(prototype|constructor|__proto__|defineProperty|setPrototypeOf)/, "Keine Klassen/Prototypen: einfache Objekte { } und Listen [ ]."],
  [/export default fehlt/, "Die Datei muss mit export default { title, controls, lives, init, update, draw } das Spiel liefern."],
  [/Syntax/, "Syntaxfehler: vollstaendiges, gueltiges JavaScript (ES2022) liefern, nichts abschneiden."]
];

/**
 * Saetze fuer die Reparaturrunde.
 * @param {object} report  Bericht aus runGame (scripts/spiel/runner.mjs)
 * @param {string[]} policy Befunde aus checkPolicy
 * @returns {string[]}
 */
export function repairNotes(report, policy = []) {
  const out = [];
  if (report && report.error) {
    const e = report.error;
    out.push("Laufzeitfehler (" + e.code + ", Phase " + (e.where || "?") + ", Frame " + (e.frame ?? "?") + "): " + e.message);
  }
  const c = (report && report.checks) || {};
  for (const [k, v] of Object.entries(c)) {
    if (!v || v.ok !== false || k === "noException") continue;
    if (k === "static") { for (const f of v.findings || []) { const h = STATIC_HILFE.find(([re]) => re.test(f)); out.push("Statisch: " + f + (h ? " – " + h[1] : "")); } continue; }
    let detail = "";
    if (k === "inputsEffective") detail = " Ohne Wirkung: " + Object.entries(v.perControl || {}).filter(([, ok]) => !ok).map(([x]) => x).join(", ") + ".";
    if (k === "scoreChanges") detail = " Punkte Nichtstun/gespielt: " + v.idle + "/" + v.played + ".";
    if (k === "gameOverReachable") detail = " Spielenden je Bot: " + JSON.stringify(v.overs) + ".";
    if (k === "performance") detail = " p95 " + v.p95Ms + " ms, max. Zeichenbefehle " + v.maxOps + ".";
    if (k === "noNetwork") detail = " Versuche: " + (v.attempts || []).slice(0, 3).join("; ") + ".";
    out.push("Abnahme-Invariante " + k + " verletzt. " + (HILFE[k] || "") + detail);
  }
  for (const p of policy) out.push(p);
  return out;
}

/**
 * Feste Kennungen der Fehlerarten (fuer die Haeufigkeitsauswertung). Eine Kennung je Befund.
 * @returns {string[]}
 */
export function errorKinds(report, policy = []) {
  const out = [];
  if (report && report.error) {
    const e = report.error, m = String(e.message || "");
    let k = "laufzeit:" + e.code;
    if (e.code === "zeichnen") k += /Farbe/.test(m) ? ":farbe" : /groesse|size/.test(m) ? ":groesse" : /unbekannte Option/.test(m) ? ":option" : /zu viele/.test(m) ? ":zuviele" : /erwartet eine Zahl/.test(m) ? ":keine-zahl" : /laenger als/.test(m) ? ":textlaenge" : "";
    else if (e.code === "modul") k += /unbekanntes Feld/.test(m) ? ":feld" : /controls/.test(m) ? ":controls" : /lives/.test(m) ? ":lives" : /title/.test(m) ? ":title" : /fehlt/.test(m) ? ":funktion-fehlt" : "";
    else if (e.code === "api") k += /geht nur in/.test(m) ? ":phase" : /g\.hit/.test(m) ? ":hit-form" : /addScore/.test(m) ? ":addscore" : /randInt/.test(m) ? ":randint" : /anderes Objekt/.test(m) ? ":update-return" : /g\.sound/.test(m) ? ":sound" : "";
    else if (e.code === "zustand") k += /Funktion/.test(m) ? ":funktion" : /doppelt/.test(m) ? ":geteilt" : /NaN|Infinity|endliche/.test(m) ? ":nan" : /kein einfaches Objekt/.test(m) ? ":klasse" : "";
    else if (e.code === "exception") k += /is not defined/.test(m) ? ":undefiniert" : /Cannot read|undefined/.test(m) ? ":undefined-zugriff" : /is not a function/.test(m) ? ":keine-funktion" : /frozen|read.only|not extensible/i.test(m) ? ":eingefroren" : "";
    out.push(k);
  }
  const c = (report && report.checks) || {};
  for (const [k, v] of Object.entries(c)) {
    if (!v || v.ok !== false || k === "noException") continue;
    if (k === "static") { for (const f of v.findings || []) out.push("statisch:" + (f.match(/Math\.\w+|\*\*|Global \w+|Syntax|export default fehlt|__proto__|prototype|constructor|defineProperty|import/) || ["sonst"])[0].replace(/^Global /, "global:")); continue; }
    out.push("invariante:" + k);
  }
  for (const p of policy) out.push("policy:" + (/Menschen/.test(p) ? "mensch" : /Emoji/.test(p) ? "emoji" : "wort"));
  return out;
}

/** Holt das Spielmodul aus einer Modellantwort: letzter ```js-Block, sonst die ganze Antwort, wenn sie export default enthaelt. */
export function extractCode(text) {
  const t = String(text || "");
  const blocks = [...t.matchAll(/```(?:js|javascript|mjs)?[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const withExport = blocks.filter((b) => /export\s+default/.test(b));
  if (withExport.length) return withExport[withExport.length - 1].trim() + "\n";
  // abgeschnittener letzter Block (max_tokens): Rest ab ```js
  const open = t.lastIndexOf("```");
  if (open >= 0 && /export\s+default/.test(t.slice(open))) return t.slice(t.indexOf("\n", open) + 1).trim() + "\n";
  if (/export\s+default/.test(t)) return t.trim() + "\n";
  return null;
}
