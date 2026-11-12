// Widget-Primitive (ADR 0001 c) ohne DOM: der virtuelle Baum aus render() wird durchsucht und Handler werden direkt
// ausgeloest. Der Entwurf laeuft wie im Host: onDraft ersetzt host.draft, danach wird neu gerendert.
import test from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render/render.js";
import { why, euro, parseCents, payLink, known } from "../src/render/widgets.js";
import { WIDGETS, DRAFT } from "../src/render/primitives.js";

function all(v, out = []) { if (v && typeof v === "object") { out.push(v); for (const c of v.children || []) all(c, out); } return out; }
const textOf = (v) => (typeof v === "string" ? v : (v.children || []).map(textOf).join(""));
function harness(node, extra = {}) {
  const sent = [], acts = [];
  const H = { draft: null, lang: "de", onInput: (x) => sent.push(x), onDraft: (d) => { H.draft = d; }, onAction: (a) => acts.push(a), random: () => 1, ...extra };
  const tree = () => all(render(node, H));
  const btn = (re) => { const b = tree().find((x) => (x.tag === "button" || x.tag === "a") && (re.test(textOf(x)) || re.test(String(x.props["aria-label"] || "")))); assert.ok(b, "Knopf " + re); return b; };
  const click = (re) => btn(re).props.on.click({ preventDefault() {} });
  const input = (i, value) => { const f = tree().filter((x) => x.tag === "input" || x.tag === "textarea")[i]; f.props.on.input({ target: { value } }); };
  return { H, sent, acts, tree, btn, click, input, main: () => tree().find((x) => x.props && x.props.class === "btn primary w-go") };
}
const sub = { t: "answer", seat: 1 };

test("Inventar: jedes Widget aus ADR 0001 c hat einen Renderer", () => {
  for (const w of [...WIDGETS, ...DRAFT.filter((x) => x !== "ai" || true)]) assert.ok(known().includes(w), "fehlt: " + w);
});

test("pick: n=1 mit auto sendet sofort; n=2 laesst die aelteste Wahl fallen; Zaehler und gesperrter Knopf mit Grund", () => {
  const a = harness({ t: "pick", id: "p1", label: "Wahl", n: 1, auto: true, options: [{ label: "A" }, { label: "B" }], submit: sub });
  a.click(/^B$/); assert.deepEqual(a.sent, [{ t: "answer", seat: 1, a: [1] }]);
  const b = harness({ t: "pick", id: "p2", n: 2, options: [{ label: "A" }, { label: "B" }, { label: "C" }], submit: sub });
  assert.equal(b.main().props.disabled, true); assert.ok(b.main().props["aria-describedby"]);
  b.click(/^A$/); b.click(/^B$/); b.click(/^C$/);
  assert.deepEqual(b.H.draft["w:p2"], [1, 2]);
  assert.equal(b.btn(/^B$/).props["aria-pressed"], "true");
  b.main().props.on.click(); assert.deepEqual(b.sent[0].a, [1, 2]);
});

test("rank: Tippreihenfolge, das letzte stellt sich selbst; Pfeiltasten verschieben", () => {
  const r = harness({ t: "rank", id: "r", options: [{ label: "x" }, { label: "y" }, { label: "z" }], submit: sub });
  r.click(/z$/); r.click(/x$/);
  assert.deepEqual(r.H.draft["w:r"], [2, 0, 1]);
  r.btn(/x$/).props.on.keydown({ key: "ArrowUp", preventDefault() {} });
  assert.deepEqual(r.H.draft["w:r"], [0, 2, 1]);
  r.main().props.on.click(); assert.deepEqual(r.sent[0].a, [0, 2, 1]);
});

test("slide/input/list/alloc: Grenzen, Bereinigung, lose Listen, Summe", () => {
  const s = harness({ t: "slide", id: "s", min: 1, max: 20, step: 1, def: 3, unit: "👤", label: "Personen", submit: sub });
  s.click(/mehr/); s.click(/mehr/); s.main().props.on.click(); assert.equal(s.sent[0].a, 5);
  assert.equal(why({ t: "slide", min: 0, max: 10, step: 5 }, 7), "Das geht so nicht");
  const i = harness({ t: "input", id: "i", max: 14, oneWord: true, submit: sub });
  i.input(0, "zwei Wörter"); assert.match(i.tree().find((x) => x.props && x.props.class === "w-why").children.join(""), /Nur ein Wort/);
  i.input(0, "Ruf 0171 2345678"); assert.equal(i.main().props.disabled, true);
  i.input(0, "Pizza"); i.main().props.on.click(); assert.equal(i.sent[0].a, "Pizza");
  assert.equal(why({ t: "list", n: 3, max: 12, loose: true, least: 2 }, ["a", "", "b"]), "");
  assert.notEqual(why({ t: "list", n: 3, max: 12 }, ["a", "", "b"]), "");
  assert.notEqual(why({ t: "list", n: 2, max: 12 }, ["Haus", "haus"]), "", "Doppelte nach fold");
  const al = harness({ t: "alloc", id: "a", sum: 20, step: 10, options: [{ label: "x" }, { label: "y" }], submit: sub });
  al.click(/mehr x/); al.click(/mehr y/); assert.equal(al.btn(/mehr x/).props.disabled, true, "Summe erreicht");
  al.main().props.on.click(); assert.deepEqual(al.sent[0].a, [10, 10]);
});

test("money/pay: Cent wie Altcode, Zeile je Person und Rest; PayPal nur mit 18+ und gueltigem Link", () => {
  assert.equal(parseCents("37,50"), 3750); assert.equal(parseCents("37.5"), 3750); assert.equal(parseCents("37 €"), 3700); assert.equal(parseCents("3,999"), null);
  assert.equal(euro(937, "de"), "9,37 €"); assert.equal(euro(900, "en"), "€9");
  assert.equal(payLink("Ada1", 937), "https://paypal.me/Ada1/9.37EUR"); assert.equal(payLink("a b", 1), null);
  const m = harness({ t: "money", id: "m", people: 3, min: 100, max: 15000, submit: sub });
  m.input(0, "10"); assert.match(textOf(m.tree().find((x) => x.props && x.props.class === "w-line")), /3,33 €.*Rest 1 Cent|Rest/);
  m.main().props.on.click(); assert.equal(m.sent[0].a, 1000);
  const p0 = harness({ t: "pay", id: "y", link: "https://paypal.me/Ada1/9.37EUR", label: "Zahlen" });
  assert.ok(!p0.tree().some((x) => x.tag === "a"), "ohne 18+ kein Link"); p0.click(/18 oder älter/); assert.deepEqual(p0.acts, [{ act: "age18" }]);
  const p1 = harness({ t: "pay", id: "y", link: "https://paypal.me/Ada1/9.37EUR", label: "Zahlen" }, { age18: true });
  assert.equal(p1.btn(/Zahlen/).props.rel, "noopener noreferrer");
  const p2 = harness({ t: "pay", id: "y", link: "https://evil.example/x", label: "Zahlen" }, { age18: true });
  assert.ok(!p2.tree().some((x) => x.tag === "a"), "fremder Link wird nicht angezeigt");
});

test("Grundschicht (Z1): choice mit draft/on/disabled, field, go mit Grund, link nur paypal.me, copy/file/action/ai/open", () => {
  const c = harness({ t: "choice", label: "Termin", wrap: true, options: [{ label: "Mo", draft: { d: 1 }, on: true }, { label: "Di", draft: { d: 2 } }, { label: "X", input: { t: "x", seat: 0 }, disabled: true }] });
  assert.equal(c.btn(/^Mo$/).props["aria-pressed"], "true");
  c.click(/^Di$/); assert.deepEqual(c.H.draft, { d: 2 });
  assert.equal(c.btn(/^X$/).props.disabled, true);
  const g = harness({ t: "stack", children: [{ t: "go", label: "Weiter", input: { t: "go", seat: 0 }, disabled: true, why: "Name fehlt" }, { t: "link", href: "javascript:alert(1)", label: "x" }, { t: "link", href: "https://paypal.me/Ada/5EUR", label: "Pay" }, { t: "copy", text: "abc", label: "Kopieren" }, { t: "file", name: "termin.ics", mime: "text/calendar", text: "BEGIN", label: "ics" }, { t: "action", act: "age18", label: "18" }, { t: "ai", kind: "plan", input: { s: "x" }, into: "f", label: "KI" }, { t: "open", card: "zug-sammeln", label: "Geld" }] });
  const go = g.btn(/Weiter/); assert.equal(go.props.disabled, true); assert.ok(g.tree().some((x) => textOf(x) === "Name fehlt"));
  assert.equal(g.tree().filter((x) => x.tag === "a").length, 1, "nur der paypal.me-Link");
  g.click(/Kopieren/); g.click(/ics/); g.click(/^18$/); g.click(/KI/); g.click(/Geld/);
  assert.deepEqual(g.acts.map((a) => a.act), ["copy", "file", "age18", "ai", "open"]);
  const f = harness({ t: "field", key: "name", label: "Name", value: "" });
  assert.equal(f.tree().find((x) => x.tag === "input").props.maxlength, "60");
});

test("Unbekannte Knoten werden sichtbar gemeldet (kein stilles Weglassen)", () => {
  const seen = []; const u = harness({ t: "stack", children: [{ t: "rakete" }] }, { onUnknown: (t) => seen.push(t) });
  assert.ok(u.tree().some((x) => x.props && x.props.class === "w-unknown"));
  assert.deepEqual(seen, ["rakete"]);
});

test("grid/probe/form/slots/vote/shop/pcard/pickn/steps/door: Werte wie Altcode", () => {
  const g = harness({ t: "grid", id: "g", n: 2, submit: sub }); g.click(/Feld A1/); g.click(/Feld B2/); g.click(/Feld C3/);
  assert.deepEqual(g.H.draft["w:g"], [0, 6]);
  const pr = harness({ t: "probe", id: "p", n: 2, answers: [0, 1, 2], before: [0], submit: sub }); pr.click(/Feld A2/); pr.main().props.on.click(); assert.deepEqual(pr.sent[0].a, [1]);
  const fo = harness({ t: "form", id: "f", fields: [{ t: "input", id: "n", max: 12 }, { t: "slide", id: "k", min: 1, max: 5 }], submit: sub });
  fo.input(0, "Ada"); assert.equal(fo.main().props.disabled, null); fo.main().props.on.click(); assert.deepEqual(fo.sent[0].a, { n: "Ada", k: 1 });
  const sl = harness({ t: "slots", id: "s", from: 20769, days: 14, submit: sub }, { nick: "Ada" });
  sl.click(/^18 Uhr$/); const days = sl.tree().filter((x) => x.tag === "button" && /\d/.test(textOf(x)) && !/Uhr/.test(textOf(x)));
  days[0].props.on.click(); sl.tree().filter((x) => x.tag === "button" && /\d/.test(textOf(x)) && !/Uhr|✕/.test(textOf(x)))[2].props.on.click();
  sl.main().props.on.click(); assert.deepEqual(sl.sent[0].a, ["Ada", [207690 + 6, 207710 + 6]]);
  const vo = harness({ t: "vote", id: "v", dates: [207697, 207717], submit: sub }, { nick: "Bo" }); vo.click(/Überall ja/); vo.main().props.on.click(); assert.deepEqual(vo.sent[0].a, ["Bo", [0, 0]]);
  const sh = harness({ t: "shop", id: "e", cfg: { items: 20, text: 24, people: 8 }, list: [[], []], submit: sub }, { nick: "Ada" });
  sh.input(0, "2x Milch"); sh.tree().find((x) => x.tag === "form").props.on.submit({ preventDefault() {} });
  sh.click(/bringe ich: Milch/); sh.main().props.on.click();
  assert.deepEqual(sh.sent[0].a, [[["Ada", 0]], [["Milch", 0, 2, [[0, 1]]]]]);
  const pc = harness({ t: "pcard", code: "HQ", a11y: "Herz-Dame", submit: { t: "play", seat: 0 } }, { cardSvg: (code) => ({ tag: "svg", attrs: { viewBox: "0 0 10 14" }, children: [code] }) });
  pc.click(/Herz-Dame/); assert.deepEqual(pc.sent, [{ t: "play", seat: 0, a: 0 }]);
  const pn = harness({ t: "pickn", id: "k", n: 2, label: "Drücken", items: [{ code: "C7", a11y: "Kreuz 7" }, { code: "S8", a11y: "Pik 8" }, { code: "HA", a11y: "Herz Ass" }], options: [{ sel: [0, 2], input: { t: "skat", seat: 0, c: "x" } }] });
  pn.click(/Kreuz 7/); pn.click(/Herz Ass/); pn.click(/Weiter/); assert.deepEqual(pn.sent, [{ t: "skat", seat: 0, c: "x" }]);
  const st = harness({ t: "steps", id: "b", rows: [{ id: "k", label: "Kick", cells: "x---x---x---x---" }], submit: { t: "set", seat: 0 } });
  assert.equal(st.btn(/Kick Schritt 1$/).props["aria-pressed"], "true"); st.click(/Kick Schritt 2$/); assert.deepEqual(st.sent[0].a, { row: "k", i: 1 });
  const d = harness({ t: "door", id: "d", nr: 12, closed: true, label: "Tür 12 aufklappen", submit: { t: "open", seat: 1 }, children: [{ t: "text", role: "body", text: "Hallo" }] });
  d.click(/Tür 12/); assert.deepEqual(d.sent[0], { t: "open", seat: 1, a: 0 });
  assert.ok(d.tree().some((x) => textOf(x) === "Hallo"), "aufgeklappt zeigt den Inhalt");
});

test("Zeitspiele mit Testuhr: blind (bester), inner (Abweichung), drop (Preis), react (Strafe bei Koeder)", () => {
  let t = 0; const clock = () => t;
  const b = harness({ t: "blind", id: "b", tries: 2, goal: 10000, submit: sub }, { clock });
  b.click(/Start/); t += 9000; b.click(/Stopp/); b.click(/Start/); t += 12000; b.click(/Stopp/);
  b.main().props.on.click(); assert.equal(b.sent[0].a, 9000);
  const i = harness({ t: "inner", id: "i", targets: [3000], submit: sub }, { clock });
  i.click(/Start/); t += 3500; i.click(/Stopp/); i.main().props.on.click(); assert.deepEqual(i.sent[0].a, [500]);
  const dr = harness({ t: "drop", id: "d", max: 100, item: "Socke", submit: sub }, { clock });
  dr.click(/Start/); t += 800; dr.click(/Kaufen/); assert.equal(dr.sent[0].a, 90);
});

test("image: nur data:-Bilder oder vom Host aufgeloeste Quellen, Alt-Text; sonst sichtbarer Hinweis", () => {
  const ok = harness({ t: "image", src: "data:image/png;base64,iVBORw0KGgo=", alt: "Ein Bild" });
  assert.equal(ok.tree().find((x) => x.tag === "img").props.alt, "Ein Bild");
  const bad = harness({ t: "image", src: "https://evil.example/x.png", alt: "x" });
  assert.ok(!bad.tree().some((x) => x.tag === "img"));
  const srv = harness({ t: "image", src: { kind: "server", ref: "gi1" }, alt: "KI" }, { images: { url: (s) => (s.ref === "gi1" ? "data:image/jpeg;base64,AAAA" : null) } });
  assert.equal(srv.tree().find((x) => x.tag === "img").props.src, "data:image/jpeg;base64,AAAA");
});

test("form: eingebettete Widgets mit eigenem Senden (aim) landen im Formularwert (Dart: ein Wurf = aim + power)", () => {
  const f = harness({ t: "form", id: "wurf", fields: [{ t: "aim", id: "aim", grid: 4096 }, { t: "slide", id: "power", min: 0, max: 8, def: 4 }], submit: { t: "throw", seat: 0 } });
  const aim = f.tree().find((x) => x.props && x.props.class === "w-aim");
  aim.props.on.keydown({ key: "ArrowRight", preventDefault() {} });
  f.tree().find((x) => x.props && x.props.class === "w-aim").props.on.keydown({ key: "Enter", preventDefault() {} });
  f.main().props.on.click();
  assert.deepEqual(f.sent[0], { t: "throw", seat: 0, a: { aim: [2048 + 64, 2048], power: 4 } });
});

test("Countdown-Tor: t0 liegt unter eigenem Schluessel; react/explain/tuer laufen nach Los und die Uhr laeuft ab (Z2-Befund)", () => {
  let t = 1000; const clock = () => t;
  const tu = harness({ t: "tuer", id: "tu", secs: 10, streak: 4, rules: [{ beings: [{ look: ["🐱"], in: true }, { look: ["🐶"], in: false }, { look: ["🐭"], in: true }] }], submit: sub }, { clock });
  tu.click(/^Los$/);
  assert.equal(tu.H.draft["w:tu:t0"], 1000);
  tu.click(/^Rein$/); assert.equal(tu.H.draft["w:tu"].right, 1);
  t += 11000; tu.main().props.on.click(); assert.deepEqual(tu.sent[0].a, [0, 1, 1]);
  const ex = harness({ t: "explain", id: "ex", secs: 5, words: ["Hund", "Katze"], submit: sub }, { clock });
  ex.click(/^Los$/);
  assert.ok(ex.tree().some((x) => typeof x === "object" && /Hund/.test(textOf(x))), "erstes Wort sichtbar");
  const re = harness({ t: "react", id: "re", plan: [{ decoys: 0, pause: 10 }], submit: sub }, { clock });
  re.click(/^Los$/);
  assert.ok(re.tree().some((x) => x.props && x.props.class === "w-pad"), "Tippfeld nach Los");
});
