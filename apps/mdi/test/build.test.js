// Build-, Budget- und Datenschutzpruefungen gegen den neuen Build (02-spec/09-plattform.md, neu geschrieben).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "../scripts/build.js";
import { generate } from "../scripts/gen.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src"), DIST = path.join(ROOT, "dist");
function files(dir, re) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!["node_modules", "dist"].includes(e.name)) out.push(...files(p, re)); } else if (re.test(e.name)) out.push(p); } return out; }
const rel = (p) => path.relative(ROOT, p);

let report;
test.before(async () => { report = await build(); });

test("Budgets: Kern < 700 KiB, je Teil < 300 KB, Kern + Teile < 1,75 MiB", () => {
  const html = fs.statSync(path.join(DIST, "index.html")).size;
  assert.ok(html < 716800, "Kern " + html);
  let sum = html;
  for (const [f, n] of Object.entries(report.parts)) { assert.ok(n < 300000, f + " " + n); sum += n; }
  assert.ok(sum < 1835008, "gesamt " + sum);
  console.log("# budget: Kern " + html + " B, Teile " + JSON.stringify(report.parts));
});

test("Kern ist offline: keine externen Ressourcen im HTML ausser CSP-Hosts", () => {
  const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  assert.ok(!/<(script|link|img|iframe)[^>]+(src|href)=["']?https?:/i.test(html), "externe Ressource im Kern");
  assert.ok(!/@import|url\(https?:/i.test(html));
});

test("CSP: strikt, ohne unsafe-inline/unsafe-eval; Hashes passen zu Skript und Stil", () => {
  const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /default-src 'none'/);
  assert.ok(!/'unsafe-inline'/.test(csp) && !/'unsafe-eval'/.test(csp), csp);
  assert.match(csp, /base-uri 'none'/); assert.match(csp, /form-action 'none'/); assert.match(csp, /object-src 'none'/);
  const js = /<script>([\s\S]*)<\/script>/.exec(html)[1], css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const h = (s) => crypto.createHash("sha256").update(s).digest("base64");
  assert.ok(csp.includes("'sha256-" + h(js) + "'"), "Skript-Hash");
  assert.ok(csp.includes("'sha256-" + h(css) + "'"), "Stil-Hash");
  assert.equal((html.match(/<script/g) || []).length, 1, "genau ein Inline-Skript");
  assert.ok(!/ style="/.test(html) && !/ on[a-z]+="/.test(html), "keine Inline-Attribute");
});

const DANGEROUS = /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\b|[^.\w]Function\s*\(|setTimeout\s*\(\s*["'`]/;
test("Kein innerHTML/eval/new Function – in Quellen und im Build", () => {
  for (const f of files(SRC, /\.js$/)) assert.ok(!DANGEROUS.test(fs.readFileSync(f, "utf8")), rel(f));
  for (const f of files(DIST, /\.(js|html)$/)) { const m = DANGEROUS.exec(fs.readFileSync(f, "utf8")); assert.equal(m, null, rel(f) + ": " + (m && m[0])); }
});

const NET = /\bfetch\s*\(|new\s+WebSocket\b|\bRTCPeerConnection\b|XMLHttpRequest|sendBeacon|\bEventSource\b|new\s+(Shared)?Worker\b|\bimport\s*\(|createElement\(\s*["']script|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/;
test("Netz und Geraetespeicher nur im Broker (src/broker/*)", () => {
  for (const f of files(SRC, /\.js$/)) {
    if (rel(f).startsWith(path.join("src", "broker"))) continue;
    const m = NET.exec(fs.readFileSync(f, "utf8"));
    assert.equal(m, null, rel(f) + ": " + (m && m[0]));
  }
});

test("Genau EIN WebSocket und EINE RTCPeerConnection im ganzen Bundle, nur im Teil live; keine stun:/turn:-Literale", () => {
  const all = files(DIST, /\.(js|html)$/).map((f) => [rel(f), fs.readFileSync(f, "utf8")]);
  const count = (re) => all.reduce((n, [, s]) => n + (s.match(re) || []).length, 0);
  assert.equal(count(/new WebSocket\(/g), 1);
  assert.equal(count(/new RTCPeerConnection\(/g), 1);
  for (const [f, s] of all) if (/new (WebSocket|RTCPeerConnection)\(/.test(s)) assert.match(f, /parts[\\/]live\./);
  for (const [f, s] of all) assert.ok(!/["'`](stun|turns?):/.test(s), f);
  const src = files(path.join(SRC), /\.js$/).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.equal((src.match(/new WebSocket\(/g) || []).length, 1);
  assert.equal((src.match(/new RTCPeerConnection\(/g) || []).length, 1);
});

test("Keine Spielzustands-Zufaelle und keine globalen Singletons (A1)", () => {
  for (const f of files(SRC, /\.js$/)) {
    const s = fs.readFileSync(f, "utf8");
    assert.ok(!/Math\.random/.test(s), rel(f) + ": Math.random");
    assert.ok(!/\b(window|globalThis|self)\.[A-Za-z_$][\w$]*\s*=(?!=)/.test(s), rel(f) + ": globale Zuweisung");
  }
});

test("Kein Zustand in CSS (A2): keine :has()-Regeln, kein Ausblenden per Stil", () => {
  const css = fs.readFileSync(path.join(SRC, "ui/tokens.css"), "utf8");
  assert.ok(!/:has\(/.test(css));
  assert.ok(!/display\s*:\s*none|visibility\s*:\s*hidden/.test(css));
});

test("Keine Vermischung: nichts im neuen Baum verweist auf den Altbaum (CI no-legacy-refs)", () => {
  const re = /apps\/duell-web|duell-web\/dist|copy-duell\.sh|vendor\/duell-web/;
  for (const f of files(ROOT, /\.(js|json|html|css|md|yml)$/)) { if (rel(f) === "package-lock.json") continue; assert.ok(!re.test(fs.readFileSync(f, "utf8")), rel(f)); }
  for (const f of files(ROOT, /\.js$/)) for (const m of fs.readFileSync(f, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g)) assert.ok(!/duell-web/.test(m[1]), rel(f) + " importiert " + m[1]);
});

test("Kopierte Fixtures tragen einen Herkunftsvermerk", () => {
  for (const f of files(path.join(ROOT, "test/fixtures"), /\.json$/)) assert.ok(typeof JSON.parse(fs.readFileSync(f, "utf8")).herkunft === "string", rel(f));
});

test("Erzeugte Dateien (Validatoren, Code-Hashes) sind aktuell", () => {
  const g = generate();
  for (const [f, s] of Object.entries(g)) assert.equal(fs.readFileSync(path.join(SRC, "gen", f), "utf8"), s, "src/gen/" + f + " veraltet: node scripts/gen.js");
});

test("Abhaengigkeiten gepinnt, nur FOSS-Lizenzen", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(!pkg.dependencies, "keine Laufzeit-Abhaengigkeiten");
  for (const [n, v] of Object.entries(pkg.devDependencies)) {
    assert.match(v, /^\d+\.\d+\.\d+$/, n + " nicht gepinnt");
    const lic = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", n, "package.json"), "utf8")).license;
    assert.ok(["MIT", "Apache-2.0", "MPL-2.0", "OFL-1.1", "BSD-2-Clause", "BSD-3-Clause", "ISC"].includes(lic), n + " " + lic);
  }
});
