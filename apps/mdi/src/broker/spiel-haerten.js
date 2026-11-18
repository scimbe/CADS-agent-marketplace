// Haertung des Spiel-Realms (Worker im Spielrahmen), bevor fremder Spielcode geladen wird. Alles wird ueber `scope`
// angesprochen (keine Globals dieses Moduls), damit dieselbe Haertung im Worker und im Unit-Test (node:vm-Realm) laeuft.
//
// Fail closed: Jede Liste unten ist eine Forderung, kein Wunsch. Fehlt ein Objekt, ist eine Bindung nicht sperrbar oder
// ist nach der Haertung etwas nicht eingefroren, wirft harden() einen SpielFehler-artigen Fehler mit Code "sandbox" und
// der Spielcode wird nicht geladen. Es gibt kein stilles Ueberspringen.
//
// Was die Haertung NICHT leistet: Sie ist eine Teil-Haertung im selben Realm (kein SES-lockdown). Sie schuetzt die
// Laufzeit (api.js, pruefung.js) vor plumpem Umbiegen; sie entscheidet nichts. Ueber Abnahme und Guthaben entscheidet
// nie ein Bericht aus dem Browser-Host, sondern nur runGame (scripts/spiel/runner.mjs) auf dem Server – dort werden
// Netz, statische Pruefung und Absturz unabhaengig vom Bericht des Rahmens nachgetragen.

/** Groesste Laenge, die eine einzelne Massen-Operation (repeat, padStart, fill, join, Array.from) in einem Aufruf erzeugen darf. */
export const ALLOC_MAX = 1 << 20;

/**
 * Globale Faehigkeiten, die der Spielcode nie bekommt. Netz (fetch ...), Nachladen (importScripts) und neue, ungehaertete
 * Realms (Worker, SharedWorker) sowie Kanaele an der Laufzeit vorbei (BroadcastChannel). Jeder Name wird durch einen
 * werfenden Stub ersetzt – auch wenn er im Realm gar nicht existiert, damit spaetere Browser-Versionen nichts freischalten.
 * Dynamisches import() laesst sich nicht als Global sperren: das erledigt die CSP des Rahmens (script-src ohne fremde
 * Hosts), gemeldet ueber securitypolicyviolation, plus die statische Pruefung auf dem Server.
 */
export const BLOCKED = Object.freeze(["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport", "importScripts", "Worker", "SharedWorker", "BroadcastChannel"]);

/** Globale Bindungen, die nicht neu belegt werden duerfen (Laufzeit und Bericht benutzen sie). */
export const LOCKED = Object.freeze(["Object", "Array", "JSON", "Math", "Number", "String", "Boolean", "Symbol", "Promise", "Error", "TypeError", "RangeError",
  "Map", "Set", "WeakMap", "Reflect", "MessagePort", "EventTarget", "performance", "structuredClone", "TextEncoder", "DataView", "ArrayBuffer", "URL", "Blob",
  "Function", "Date", "RegExp", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array",
  "Float64Array", "BigInt64Array", "BigUint64Array"]);

const TYPED = ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"];

/**
 * Objekte, die eingefroren sein muessen, je mit Namen fuer die Fehlermeldung. Iterator-Prototypen werden ueber die
 * Funktionen des Realms geholt (nicht ueber Literale dieses Moduls), damit im vm-Test der richtige Realm getroffen wird.
 * @returns {Array<[string, () => object]>}
 */
export function frozenTargets(s) {
  const proto = (x) => Object.getPrototypeOf(x);
  const arrayIt = () => proto(s.Array.prototype[Symbol.iterator].call(new s.Array()));
  const typedBase = () => proto(s.Uint8Array);
  const list = [
    ["Object", () => s.Object], ["Object.prototype", () => s.Object.prototype], ["Function.prototype", () => s.Function.prototype],
    ["Array", () => s.Array], ["Array.prototype", () => s.Array.prototype], ["JSON", () => s.JSON], ["Math", () => s.Math],
    ["Number", () => s.Number], ["Number.prototype", () => s.Number.prototype], ["String", () => s.String], ["String.prototype", () => s.String.prototype],
    ["Boolean.prototype", () => s.Boolean.prototype], ["Symbol", () => s.Symbol], ["Symbol.prototype", () => s.Symbol.prototype],
    ["Promise", () => s.Promise], ["Promise.prototype", () => s.Promise.prototype], ["Error", () => s.Error], ["Error.prototype", () => s.Error.prototype],
    ["TypeError", () => s.TypeError], ["TypeError.prototype", () => s.TypeError.prototype], ["RangeError", () => s.RangeError], ["RangeError.prototype", () => s.RangeError.prototype],
    ["Map", () => s.Map], ["Map.prototype", () => s.Map.prototype], ["Set", () => s.Set], ["Set.prototype", () => s.Set.prototype], ["WeakMap.prototype", () => s.WeakMap.prototype],
    ["Reflect", () => s.Reflect], ["Date", () => s.Date], ["Date.prototype", () => s.Date.prototype], ["RegExp", () => s.RegExp], ["RegExp.prototype", () => s.RegExp.prototype],
    ["%IteratorPrototype%", () => proto(arrayIt())], ["%ArrayIteratorPrototype%", arrayIt],
    ["%MapIteratorPrototype%", () => proto(new s.Map()[Symbol.iterator]())], ["%SetIteratorPrototype%", () => proto(new s.Set()[Symbol.iterator]())],
    ["%StringIteratorPrototype%", () => proto(s.String.prototype[Symbol.iterator].call(""))],
    ["%TypedArray%", typedBase], ["%TypedArray%.prototype", () => typedBase().prototype],
    ["ArrayBuffer.prototype", () => s.ArrayBuffer.prototype], ["DataView.prototype", () => s.DataView.prototype],
    ["MessagePort.prototype", () => s.MessagePort.prototype], ["EventTarget.prototype", () => s.EventTarget.prototype], ["Performance.prototype", () => s.Performance.prototype],
    ["TextEncoder.prototype", () => s.TextEncoder.prototype], ["Blob.prototype", () => s.Blob.prototype], ["URL", () => s.URL]
  ];
  for (const t of TYPED) list.push([t, () => s[t]], [t + ".prototype", () => s[t].prototype]);
  return list;
}

function sandboxError(message) {
  const e = new Error("Sandbox nicht gehaertet: " + message);
  Object.defineProperty(e, "code", { value: "sandbox", enumerable: true });
  return e;
}
function memoryError(what, n) {
  const e = new RangeError(what + ": " + n + " Elemente in einem Schritt, erlaubt sind hoechstens " + ALLOC_MAX + " – kleinere Listen und Texte benutzen");
  Object.defineProperty(e, "code", { value: "speicher", enumerable: true });
  return e;
}
const len = (x) => { const n = Math.trunc(Number(x)); return Number.isFinite(n) ? Math.max(0, n) : Infinity; };

/**
 * Massen-Operationen mit Obergrenze: eine Speicherbombe in einem Tick ("x".repeat(2**28), new Array(2**30).fill(0)) wirft
 * sofort SpielFehler-Code "speicher", statt den Renderer-Prozess zu sprengen. Alles, was hier nicht abgedeckt ist
 * (Wachstum in einer Schleife), endet an der Heap-Grenze des Browsers; das erkennt der Runner als Absturz (fail closed).
 * @returns {Array<[object, string, Function]>} installierte Huellen (fuer die Pruefung)
 */
function capAllocations(s) {
  const wraps = [];
  const wrap = (obj, name, check) => {
    const orig = obj[name];
    if (typeof orig !== "function") throw sandboxError(name + " fehlt");
    const f = { [name](...args) { check(this, args); return orig.apply(this, args); } }[name];
    Object.defineProperty(obj, name, { value: f, writable: true, configurable: true, enumerable: false });
    wraps.push([obj, name, f]);
  };
  const SP = s.String.prototype, AP = s.Array.prototype;
  wrap(SP, "repeat", (self, [n]) => { const k = String(self).length * len(n); if (k > ALLOC_MAX) throw memoryError("String.repeat", k); });
  wrap(SP, "padStart", (self, [n]) => { if (len(n) > ALLOC_MAX) throw memoryError("String.padStart", len(n)); });
  wrap(SP, "padEnd", (self, [n]) => { if (len(n) > ALLOC_MAX) throw memoryError("String.padEnd", len(n)); });
  wrap(AP, "fill", (self) => { const k = len(self.length); if (k > ALLOC_MAX) throw memoryError("Array.fill", k); });
  wrap(AP, "join", (self) => { const k = len(self.length); if (k > ALLOC_MAX) throw memoryError("Array.join", k); });
  wrap(s.Array, "from", (self, [items]) => { if (items !== null && items !== undefined && items.length !== undefined && len(items.length) > ALLOC_MAX) throw memoryError("Array.from", len(items.length)); });
  // new Array(n) selbst legt nichts an (duenn besetzt); erst fill/join/from tun es – dort greift die Grenze.
  return wraps;
}

/**
 * Haertet den Realm. Wirft (Code "sandbox"), wenn eine Forderung nicht erfuellbar ist; dann darf kein Spielcode laufen.
 * @param {typeof globalThis} scope  globales Objekt des Spiel-Realms
 * @param {(name: string) => void} onBlocked  wird bei jedem Versuch gerufen, eine gesperrte Faehigkeit zu benutzen
 * @returns {{stubs: Record<string, Function>, random: Function, wraps: Array<[object, string, Function]>}} Nachweis fuer verifyHardened
 */
export function harden(scope, onBlocked) {
  const stubs = {};
  for (const name of BLOCKED) {
    const d = Object.getOwnPropertyDescriptor(scope, name);
    if (d && !d.configurable) throw sandboxError(name + " ist nicht ersetzbar");
    // function-Ausdruck (nicht Methoden-Kurzform): auch `new Worker(...)` muss den Stub ausfuehren, statt vorher an
    // "is not a constructor" zu scheitern und am Zaehler vorbeizulaufen
    const stub = { [name]: function () { onBlocked(name); throw new TypeError(name + " ist im Spiel gesperrt (kein Netz, keine weiteren Worker oder Kanaele)"); } }[name];
    Object.defineProperty(scope, name, { value: stub, writable: false, configurable: false, enumerable: false });
    stubs[name] = stub;
  }
  // Zufall nur aus dem Seed: der Math-Zufall wirft mit Hinweis auf g.random()
  const random = () => { throw new Error("Zufall von Math ist gesperrt – nutze g.random()"); };
  Object.defineProperty(scope.Math, "random", { value: random, writable: false, configurable: false });
  const wraps = capAllocations(scope);
  for (const [label, get] of frozenTargets(scope)) {
    let o;
    try { o = get(); } catch (e) { throw sandboxError(label + " nicht erreichbar (" + e.message + ")"); }
    if ((typeof o !== "object" && typeof o !== "function") || o === null) throw sandboxError(label + " fehlt");
    Object.freeze(o);
  }
  for (const name of LOCKED) {
    // Auch geerbte Bindungen (im Worker liegt performance als Accessor auf WorkerGlobalScope.prototype) werden als eigene,
    // feste Eigenschaft gesperrt; ein spaeteres Umbiegen des Prototyps erreicht sie dann nicht mehr.
    const d = Object.getOwnPropertyDescriptor(scope, name), v = scope[name];
    if (v === undefined || v === null) throw sandboxError("globale Bindung " + name + " fehlt");
    if (!d || d.configurable) Object.defineProperty(scope, name, { value: v, writable: false, configurable: false, enumerable: d ? d.enumerable : false });
    else if (!("value" in d) || d.writable) throw sandboxError("globale Bindung " + name + " ist nicht sperrbar");
  }
  const proof = { stubs, random, wraps };
  verifyHardened(scope, proof);
  return proof;
}

/**
 * Prueft nach der Haertung jede Forderung einzeln und wirft (Code "sandbox") mit allen Befunden.
 * @param {typeof globalThis} scope
 * @param {{stubs: Record<string, Function>, random: Function, wraps: Array<[object, string, Function]>}} proof
 */
export function verifyHardened(scope, proof) {
  const bad = [];
  for (const [label, get] of frozenTargets(scope)) {
    let o = null;
    try { o = get(); } catch (e) { bad.push(label + " nicht erreichbar"); continue; }
    if (!Object.isFrozen(o)) bad.push(label + " nicht eingefroren");
  }
  for (const name of LOCKED) {
    const d = Object.getOwnPropertyDescriptor(scope, name);
    if (!d || d.configurable || !("value" in d) || d.writable) bad.push("Bindung " + name + " nicht gesperrt");
  }
  for (const name of BLOCKED) {
    const d = Object.getOwnPropertyDescriptor(scope, name);
    if (!d || d.configurable || d.writable || d.value !== proof.stubs[name]) bad.push(name + " nicht gesperrt");
  }
  const r = Object.getOwnPropertyDescriptor(scope.Math, "random");
  if (!r || r.value !== proof.random || r.writable || r.configurable) bad.push("Zufall von Math nicht gesperrt");
  for (const [obj, name, f] of proof.wraps) if (obj[name] !== f) bad.push(name + " ohne Speichergrenze");
  if (bad.length) throw sandboxError(bad.join(", "));
}
