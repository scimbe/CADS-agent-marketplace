// Statische Harness-Pruefung fuer Kartenlogik (KONZEPT §3.5, 08-forschung/determinismus.md):
// AST-Allowlist statt Textsuche. Verboten sind approximierte Math-Funktionen, Math.random, der Operator **,
// berechneter Zugriff auf Math, Uhr/Netz/DOM/Globale und dynamischer Code. Erlaubt: exakt spezifizierte Math-Teile.
import * as acorn from "acorn";

export const MATH_OK = new Set(["abs", "floor", "ceil", "round", "trunc", "min", "max", "sign", "imul", "fround", "sqrt", "clz32"]);
export const MATH_BANNED = ["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "hypot", "random"];
const GLOBALS_BANNED = new Set(["Date", "performance", "Intl", "globalThis", "window", "self", "document", "navigator", "fetch", "XMLHttpRequest", "WebSocket", "RTCPeerConnection", "eval", "Function", "setTimeout", "setInterval", "requestAnimationFrame", "localStorage", "sessionStorage", "crypto", "Worker", "importScripts"]);
// Erlaubte Importe (ADR 0001 a): Karte -> eigenes Manifest/Geschwister/JSON-Daten, SDK-Teile, Engines; Engine -> Geschwister,
// andere Engines, SDK-Teile. Alles andere (DOM-Helfer, Broker, App) ist fuer Logik tabu.
const CONTRACT_OK = "(sdk|tokens|text|trace)";
const IMPORTS_CARD = [/^\.\/manifest\.json$/, /^\.\/[a-z0-9-]+\.(js|json)$/, new RegExp("^\\.\\./\\.\\./contract/" + CONTRACT_OK + "\\.js$"), /^\.\.\/\.\.\/engines\/[a-z0-9-]+\/[a-z0-9-]+\.(js|json)$/];
const IMPORTS_ENGINE = [/^\.\/[a-z0-9-]+\.(js|json)$/, /^\.\.\/[a-z0-9-]+\/[a-z0-9-]+\.(js|json)$/, new RegExp("^\\.\\./\\.\\./contract/" + CONTRACT_OK + "\\.js$")];
function importsFor(file) { return file && /(^|\/)engines\//.test(file) ? IMPORTS_ENGINE : IMPORTS_CARD; }

function walk(node, visit, parent) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, visit, node));
    else if (v && typeof v.type === "string" && k !== "parent") walk(v, visit, node);
  }
}

/** @returns {string[]} Befunde (leer = bestanden) */
/** @param {string} src @param {{file?:string}} [opt] file relativ zum Projekt (bestimmt die Import-Regel) */
export function checkCardSource(src, opt = {}) {
  const IMPORTS_OK = importsFor(opt.file);
  // Testkarten liegen unter test/fixtures/cards/<id>/: ihr Weg zu src/ ist vier Ebenen laenger, die Regel dieselbe
  const fixture = !!(opt.file && /^test\/fixtures\/cards\//.test(opt.file));
  const spec = (v) => (fixture ? v.replace(/^\.\.\/\.\.\/\.\.\/\.\.\/src\//, "../../") : v);
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const out = [], declared = new Set();
  // Nur Deklarationen auf oberster Ebene zaehlen (Review L7): ein lokal verschatteter Name entlastet nie die Nutzung
  // des globalen Namens anderswo. Lokale Verschattung wird dadurch streng ebenfalls gemeldet (lieber falsch-positiv).
  for (const st of ast.body) {
    const d = st.type === "ExportNamedDeclaration" && st.declaration ? st.declaration : st;
    if (d.type === "VariableDeclaration") for (const v of d.declarations) if (v.id.type === "Identifier") declared.add(v.id.name);
    if (d.type === "FunctionDeclaration" && d.id) declared.add(d.id.name);
  }
  walk(ast, (n, parent) => {
    const at = n.loc ? " (Zeile " + n.loc.start.line + ")" : "";
    if ((n.type === "ImportDeclaration" || ((n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.source)) && !IMPORTS_OK.some((r) => r.test(spec(n.source.value)))) out.push("Import nicht erlaubt: " + n.source.value + at);
    if (n.type === "ImportExpression") out.push("dynamischer Import" + at);
    if (n.type === "BinaryExpression" && n.operator === "**") out.push("Operator ** (approximiert, Number::exponentiate)" + at);
    if (n.type === "AssignmentExpression" && n.operator === "**=") out.push("Operator **=" + at);
    if (n.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === "Math") {
      if (n.computed) out.push("berechneter Zugriff auf Math" + at);
      else if (!MATH_OK.has(n.property.name)) out.push("Math." + n.property.name + " nicht erlaubt" + at);
    }
    if (n.type === "Identifier" && GLOBALS_BANNED.has(n.name) && !declared.has(n.name)) {
      const isProp = parent && parent.type === "MemberExpression" && parent.property === n && !parent.computed;
      const isKey = parent && parent.type === "Property" && parent.key === n && !parent.computed;
      if (!isProp && !isKey) out.push("Global " + n.name + " nicht erlaubt" + at);
    }
    if (n.type === "Identifier" && n.name === "Math" && !(parent && parent.type === "MemberExpression" && parent.object === n)) out.push("Math als Wert" + at);
    if (n.type === "NewExpression" && n.callee.type === "Identifier" && n.callee.name === "Function") out.push("new Function" + at);
    // gebietsschema- oder gleitkomma-abhaengige Ausgaben im Spielzustand (Review LOW, determinismus.md Befund 3)
    if (n.type === "MemberExpression" && !n.computed && n.property.type === "Identifier") {
      const p = n.property.name;
      if (["localeCompare", "toLocaleString", "toLocaleUpperCase", "toLocaleLowerCase", "toFixed", "toPrecision", "toExponential"].includes(p)) out.push(p + " nicht erlaubt" + at);
      if (p === "toString" && parent && parent.type === "CallExpression" && parent.callee === n && parent.arguments.length > 0) out.push("toString(radix) nicht erlaubt" + at);
    }
  });
  return out;
}
