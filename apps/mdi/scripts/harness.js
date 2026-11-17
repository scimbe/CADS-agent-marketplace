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

// ---- Gueltigkeitsbereiche (P3-Messung, Fehlalarm "statisch:global:parent"): ein Name ist nur dann global, wenn ihn kein
// umgebender Bereich bindet (Parameter, let/const/var, Funktion, Klasse, catch, Import). Ein lokal verschatteter Name
// entlastet die Nutzung des globalen Namens an anderer Stelle nicht (Review L7): gebunden ist nur, was im Bereich der
// jeweiligen Stelle deklariert ist.
function patternNames(p, out) {
  if (!p) return out;
  if (p.type === "Identifier") out.add(p.name);
  else if (p.type === "ObjectPattern") for (const q of p.properties) patternNames(q.type === "RestElement" ? q.argument : q.value, out);
  else if (p.type === "ArrayPattern") for (const q of p.elements) patternNames(q, out);
  else if (p.type === "AssignmentPattern") patternNames(p.left, out);
  else if (p.type === "RestElement") patternNames(p.argument, out);
  return out;
}
const FUNCS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
/** var-Deklarationen eines Funktionsrumpfs (ohne verschachtelte Funktionen) */
function varNames(node, out) {
  if (!node || typeof node.type !== "string" || FUNCS.has(node.type)) return out;
  if (node.type === "VariableDeclaration" && node.kind === "var") for (const d of node.declarations) patternNames(d.id, out);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && varNames(c, out));
    else if (v && typeof v.type === "string") varNames(v, out);
  }
  return out;
}
/** let/const/Funktion/Klasse direkt in einer Anweisungsliste */
function lexNames(stmts, out) {
  for (const st of stmts || []) {
    const d = (st.type === "ExportNamedDeclaration" || st.type === "ExportDefaultDeclaration") && st.declaration ? st.declaration : st;
    if (d.type === "VariableDeclaration" && d.kind !== "var") for (const x of d.declarations) patternNames(x.id, out);
    if ((d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") && d.id) out.add(d.id.name);
    if (d.type === "ImportDeclaration") for (const sp of d.specifiers) out.add(sp.local.name);
  }
  return out;
}
/** Menge der Identifier-Knoten, die ein umgebender Bereich bindet. */
function boundIdentifiers(ast) {
  const bound = new WeakSet();
  const has = (scope, name) => { for (let x = scope; x; x = x.up) if (x.names.has(name)) return true; return false; };
  function scopeFor(node, up) {
    const names = new Set();
    if (node.type === "Program") { varNames(node, names); lexNames(node.body, names); }
    else if (FUNCS.has(node.type)) {
      for (const p of node.params) patternNames(p, names);
      if (node.type === "FunctionExpression" && node.id) names.add(node.id.name);
      if (node.body.type === "BlockStatement") { varNames(node.body, names); lexNames(node.body.body, names); }
    } else if (node.type === "BlockStatement" || node.type === "StaticBlock") lexNames(node.body, names);
    else if (node.type === "SwitchStatement") for (const c of node.cases) lexNames(c.consequent, names);
    else if ((node.type === "ForStatement" && node.init) || node.type === "ForInStatement" || node.type === "ForOfStatement") {
      const d = node.type === "ForStatement" ? node.init : node.left;
      if (d.type === "VariableDeclaration" && d.kind !== "var") for (const x of d.declarations) patternNames(x.id, names);
    } else if (node.type === "CatchClause" && node.param) patternNames(node.param, names);
    else if (node.type === "ClassExpression" && node.id) names.add(node.id.name);
    else return up;
    return { names, up };
  }
  (function go(node, scope, fnBody) {
    if (!node || typeof node.type !== "string") return;
    // der Rumpf einer Funktion gehoert zum Bereich der Funktion (kein zweiter Block-Bereich)
    const sc = fnBody ? scope : scopeFor(node, scope);
    if (node.type === "Identifier" && has(sc, node.name)) bound.add(node);
    for (const k of Object.keys(node)) {
      const v = node[k];
      const body = FUNCS.has(node.type) && k === "body";
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && go(c, sc, false));
      else if (v && typeof v.type === "string") go(v, sc, body);
    }
  })(ast, null, false);
  return bound;
}

/** @returns {string[]} Befunde (leer = bestanden) */
/** @param {string} src @param {{file?:string}} [opt] file relativ zum Projekt (bestimmt die Import-Regel) */
export function checkCardSource(src, opt = {}) {
  const IMPORTS_OK = opt.imports || importsFor(opt.file);
  const banned = opt.globals ? new Set([...GLOBALS_BANNED, ...opt.globals]) : GLOBALS_BANNED;
  // Testkarten liegen unter test/fixtures/cards/<id>/: ihr Weg zu src/ ist vier Ebenen laenger, die Regel dieselbe
  const fixture = !!(opt.file && /^test\/fixtures\/cards\//.test(opt.file));
  const spec = (v) => (fixture ? v.replace(/^\.\.\/\.\.\/\.\.\/\.\.\/src\//, "../../") : v);
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const out = [], bound = boundIdentifiers(ast);
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
    if (n.type === "Identifier" && banned.has(n.name) && !bound.has(n)) {
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

// Spielmodule der Freien Karte 2 (src/spiel/api.js): eine Datei, keine Importe, dieselben Mathe-/Uhr-/Netz-Regeln wie
// Kartenlogik, dazu kein Zugriff auf Rahmen, Worker-Kanaele und Zeitgeber. Vorpruefung vor der Sandbox, kein Ersatz.
export const SPIEL_GLOBALS_BANNED = ["parent", "opener", "postMessage", "onmessage", "addEventListener", "removeEventListener", "dispatchEvent",
  "close", "queueMicrotask", "MessageChannel", "MessagePort", "BroadcastChannel", "Worker", "SharedWorker", "importScripts", "EventSource", "indexedDB", "caches", "Proxy", "Reflect", "SharedArrayBuffer", "Atomics", "WebAssembly"];
/** @returns {string[]} Befunde (leer = bestanden) */
export function checkSpielSource(src) {
  let out;
  try { out = checkCardSource(src, { imports: [], globals: SPIEL_GLOBALS_BANNED }); }
  catch (e) { return ["Syntax: " + e.message]; }
  if (!/export\s+default\b/.test(src)) out.push("export default fehlt");
  for (const p of ["__proto__", "prototype", "defineProperty", "setPrototypeOf", "constructor"]) if (new RegExp("\\b" + p + "\\b").test(src)) out.push(p + " nicht erlaubt");
  return out;
}
