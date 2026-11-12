// zug-bluff, Bedienung nach 13-produktverstaendnis §6.4: Rolle und Ziel vor der ersten Handlung, eine Frage je Schritt
// mit dem eigenen Wert und Fortschritt, erklaertes Ergebnis (jede Karte nennt ihre Punkte, die Summe ist der Spielstand).
import test from "node:test";
import assert from "node:assert/strict";
import bluff from "../src/cards/bluff/card.js";

const P = { cards: 5, bonus: 2, accent: "red" };
function texts(node, out = []) { if (!node) return out; if (node.t === "text") out.push(node.text); if (node.t === "choice") out.push(node.label); (node.children || []).forEach((c) => texts(c, out)); return out; }
function choice(node) { if (!node) return null; if (node.t === "choice") return node; for (const c of node.children || []) { const r = choice(c); if (r) return r; } return null; }
function start(cards) { const st = bluff.init({ params: P }); return { pub: st.pub, priv: [{ cards }, null] }; }

for (const lang of ["de", "en"]) {
  test(`Bote (${lang}): Rolle, Ziel und Frage mit eigenem Wert und Fortschritt vor dem ersten Zug`, () => {
    const st = start([3, 1, 6, 2, 5]);
    const v = bluff.view(bluff.observe(st, 0), 0, { lang });
    const t = texts(v);
    assert.match(t[0], lang === "de" ? /^Du bist der Bote\. .*schwindeln/ : /^You are the messenger\. .*fib/);
    assert.match(t[1], lang === "de" ? /gewinnt/ : /wins/);
    const c = choice(v);
    assert.equal(c.label, lang === "de" ? "Karte 1 von 5: Du hast 3. Was sagst du an?" : "Card 1 of 5: you hold 3. What do you announce?");
    assert.deepEqual(c.options.map((o) => o.input.v), [3, 4, 5, 6], "nur gleich hoch oder hoeher (alt: says())");
    assert.equal(c.options[0].label, lang === "de" ? "3 (ehrlich)" : "3 (honest)", "die ehrliche Wahl ist benannt");
  });
  test(`Pruefer (${lang}): Rolle, Ziel, Frage mit Ansage und Fortschritt; keine fremden Werte`, () => {
    let st = start([3, 1, 6, 2, 5]);
    for (const v of [4, 1, 6, 6, 5]) st = bluff.step(st, { t: "say", seat: 0, v });
    const obs = bluff.observe(st, 1);
    assert.equal(obs.mine, null);
    const v = bluff.view(obs, 1, { lang }), t = texts(v);
    assert.match(t[0], lang === "de" ? /^Du bist der Prüfer\./ : /^You are the checker\./);
    assert.equal(choice(v).label, lang === "de" ? "Karte 1 von 5: Der Bote sagt 4. Glaubst du das?" : "Card 1 of 5: the messenger says 4. Do you believe it?");
    assert.equal(JSON.stringify(v).includes('"value":"3"'), false, "verdeckte Karten bleiben verdeckt");
  });
}

test("Nicht am Zug: keine Rolle, keine Frage (Host zeigt Warten)", () => {
  const st = start([3, 1, 6, 2, 5]);
  const v = bluff.view(bluff.observe(st, 1), 1, { lang: "de" });
  assert.equal(choice(v), null);
  assert.equal(texts(v).some((x) => /Du bist/.test(x)), false);
});

test("Ergebnis erklaert jede Karte; Summe der Kartenpunkte = Spielstand; status liefert Zug n von 2", () => {
  const cards = [1, 2, 6, 5, 4], say = [4, 4, 6, 6, 4], open = [false, true, false, false, true];
  let st = start(cards);
  assert.deepEqual([bluff.status(st).turnNo, bluff.status(st).turns], [1, 2]);
  for (const v of say) st = bluff.step(st, { t: "say", seat: 0, v });
  assert.equal(bluff.status(st).turnNo, 2);
  for (const o of open) st = bluff.step(st, { t: "call", seat: 1, open: o });
  st = bluff.step(st, { t: "reveal", seat: 0 });
  assert.deepEqual(st.pub.score, [22, 4]);
  const t = texts(bluff.view(bluff.observe(st, 1), 1, { lang: "de" }));
  assert.equal(t[0], "Bote 22 – Prüfer 4");
  const lines = t.filter((x) => /^Karte \d: Ansage/.test(x));
  assert.equal(lines.length, 5);
  assert.equal(lines[1], "Karte 2: Ansage 4, in Wahrheit 2. Aufgedeckt, gelogen: Prüfer +4.");
  assert.equal(lines[4], "Karte 5: Ansage 4, in Wahrheit 4. Aufgedeckt, ehrlich: Bote +6.");
  let a = 0, b = 0;
  for (const l of lines) { const m = /(Bote|Prüfer) \+(\d+)/.exec(l); if (m[1] === "Bote") a += +m[2]; else b += +m[2]; }
  assert.deepEqual([a, b], st.pub.score);
  assert.equal(bluff.status(st).winner, 0);
});

test("Vorschau: ein Satz Regel mit Ziel, keine Frage", () => {
  const st = bluff.init({ params: P });
  const v = bluff.view(bluff.observe(st, 0), 0, { lang: "de", preview: true });
  assert.match(texts(v)[0], /schwindeln.*Wer mehr Punkte hat, gewinnt\./);
  assert.equal(choice(v), null);
});
