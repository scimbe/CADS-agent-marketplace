// Build-, Budget- und Datenschutzpruefungen gegen den neuen Build (02-spec/09-plattform.md, neu geschrieben).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build, PLAY_PARENTS } from "../scripts/build.js";
import { generate } from "../scripts/gen.js";
import { findLegacyRefs } from "../scripts/legacy-check.js";
import os from "node:os";

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
test("Realm-Trennung (Review M4): App ohne Netz und ohne Fremdskript; Live nur im abgeschotteten Rahmen mit eigener CSP", () => {
  const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /frame-src 'self' https:\/\/webconference\.bunsenbrenner\.org\/play-frame\.html(;|$)/, "nur genau der Live-Rahmen der Webkonferenz");
  assert.ok(!/https?:|'self'/.test(/script-src ([^;]+)/.exec(csp)[1]), "script-src nur Hash: " + csp);
  const frames = fs.readdirSync(path.join(DIST, "parts")).filter((f) => /^live-frame\./.test(f));
  assert.equal(frames.length, 1);
  const fr = fs.readFileSync(path.join(DIST, "parts", frames[0]), "utf8");
  const fcsp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(fr)[1];
  assert.match(fcsp, /default-src 'none'/);
  assert.match(fcsp, /script-src 'sha256-[^']+' https:\/\/webconference\.bunsenbrenner\.org\/pkg\/ 'wasm-unsafe-eval'/);
  const host = fs.readFileSync(path.join(SRC, "broker/live-host.js"), "utf8");
  // allow-same-origin nur fuer den Rahmen vom FREMDEN Ursprung der Webkonferenz (eigener Ursprung, nicht der der App)
  assert.equal((host.replace(/\/\/.*$/gm, "").match(/allow-same-origin/g) || []).length, 1, "nur im Code-Zweig fuer den fremden Ursprung");
  assert.match(host, /if \(REMOTE && protocol === "https:"\) return \{ src: REMOTE\.src, origin: REMOTE\.origin, sandbox: "allow-scripts allow-same-origin" \}/);
  assert.match(host, /e\.source !== f\.contentWindow \|\| e\.origin !== cfg\.origin/, "Absender UND Ursprung geprueft");
  // Rahmen fuer die Webkonferenz: gleicher Ursprung wie /api/play, Eltern nur laut Allowlist
  const remote = fs.readFileSync(path.join(DIST, "remote/play-frame.html"), "utf8");
  const rcsp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(remote)[1];
  assert.match(rcsp, /connect-src 'self'(;|$)/); assert.match(rcsp, /script-src 'sha256-[^']+' 'self' 'wasm-unsafe-eval'/);
  const hd = JSON.parse(fs.readFileSync(path.join(DIST, "remote/play-frame.headers.json"), "utf8"));
  assert.equal(hd["Content-Security-Policy"], "frame-ancestors " + PLAY_PARENTS.join(" ") + "; base-uri 'none'");
  assert.ok(!/frame-ancestors[^;]*(\*|'self'|null)/.test(hd["Content-Security-Policy"]), "keine offene Einbettung");
  assert.ok(remote.includes(JSON.stringify(PLAY_PARENTS)), "Eltern-Allowlist im Rahmen");
  const js = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  assert.ok(!/ct_agent_wasm/.test(js), "App-Realm laedt das Webkonferenz-Modul nicht");
});

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

test("Genau EIN WebSocket und EINE RTCPeerConnection je Live-Rahmen, keiner im Kern; keine stun:/turn:-Literale", () => {
  const all = files(DIST, /\.(js|html)$/).map((f) => [rel(f), fs.readFileSync(f, "utf8")]);
  const frames = all.filter(([f]) => /parts[\\/]live-frame\.[0-9a-f]+\.html$|remote[\\/]play-frame\.html$/.test(f));
  assert.equal(frames.length, 2, "lokaler Rueckfall + Rahmen fuer die Webkonferenz");
  for (const [f, s] of frames) { assert.equal((s.match(/new WebSocket\(/g) || []).length, 1, f); assert.equal((s.match(/new RTCPeerConnection\(/g) || []).length, 1, f); }
  for (const [f, s] of all) if (!frames.some(([g]) => g === f)) assert.ok(!/new (WebSocket|RTCPeerConnection)\(/.test(s), f + " (Kern ohne Netz)");
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

test("Keine Vermischung: kein Token des Altbaums im neuen Baum und im Workflow (CI no-legacy-refs)", () => {
  assert.deepEqual(findLegacyRefs(ROOT, path.join(ROOT, "../../.github/workflows/mdi.yml")), []);
});

test("Sperre erkennt alle Umgehungen aus dem Review (relativ, nackt, mehrzeilig, Template, readFileSync, Shell)", () => {
  const T = "duell" + "-web";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mdi-legacy-"));
  const samples = {
    "src/a.js": 'import "../../../' + T + '/src/engine.js";',
    "src/b.js": 'import x from\n  "../../../' + T + '/src/engine.js";',
    "src/c.js": 'import fs from "fs"; fs.readFileSync(new URL("../../' + T + '/src/turns.js", import.meta.url));',
    "src/d.js": 'export * from "../../' + T + '/src/x.js";',
    "src/e.js": "const m = await import(`../../" + T + "/${n}.js`);",
    "scripts/sync.sh": "cp ../" + T + "/src/turns.js src/",
    "test/fixtures/x.json": JSON.stringify({ herkunft: "Altbaum " + T, wert: "../" + T + "/a" })
  };
  try {
    for (const [f, s] of Object.entries(samples)) { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); }
    const hits = findLegacyRefs(tmp).map((h) => path.relative(tmp, h).replace(/\\/g, "/").replace(/:\d+$/, ""));
    assert.deepEqual([...new Set(hits)].sort(), Object.keys(samples).sort(), "jede Umgehung wird gefunden, Herkunft allein nicht");
    // Gegenprobe: die alte Regel (Pfadmuster) haette diese Faelle verfehlt
    const old = new RegExp(["apps/" + T, T + "/dist", "copy-duell\\.sh", "vendor/" + T].join("|"));
    assert.ok(Object.values(samples).filter((s) => old.test(s)).length === 0, "alte Regel war blind");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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
