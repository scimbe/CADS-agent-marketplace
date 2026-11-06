const test = require("node:test"), assert = require("node:assert/strict");
const A = require("../src/arcade2.js"), Sm = require("../src/smooth.js"), N = require("./netsim.js");

test("Jitter-Puffer: trotz unregelmaessiger Ankunft laeuft die Figur gleichmaessig, ohne Stufen", () => {
  // a figure at 600 per second, reported every 50 ms on its own clock, arriving 150 ms later +-80 ms, in order
  const r = N.rng(3), T = Sm.track(1), got = [], sent = [];
  let last = 0;
  for (let s = 0; s <= 4; s += 0.05) { last = Math.max(last, s + 0.15 + (r() * 2 - 1) * 0.08); sent.push([last, s]); }
  let k = 0;
  for (let now = 0; now < 4; now += 1 / 60) {
    while (k < sent.length && sent[k][0] <= now) { T.push(sent[k][0], sent[k][1], [600 * sent[k][1]]); k++; }
    const p = T.at(now, [2000]); if (p) got.push(p.v[0]);
  }
  const steps = got.slice(60).map((x, i, a) => (i ? x - a[i - 1] : null)).filter((x) => x !== null);
  const still = steps.filter((d) => Math.abs(d) < 0.5).length / steps.length;
  assert.ok(still < 0.02, "fast nie ein stehendes Bild: " + still);
  assert.ok(Math.max(...steps) < 600 / 60 * 1.6, "keine Stufe: " + Math.max(...steps));
  const d = T.state().delay; assert.ok(d > 0.05 && d < 0.3, "Verzoegerung folgt dem Jitter: " + d);
});

test("Aussetzer: die Figur laeuft kurz weiter, nie ueber ihr Feld hinaus, und holt danach ohne Sprung auf", () => {
  const T = Sm.track(1, { lo: [0], hi: [650] });
  for (let s = 0; s <= 1; s += 0.05) T.push(s + 0.15, s, [600 * s]);   // data until 1 s, then nothing
  let last = null, step = 0, top = 0;
  for (let now = 1.2; now < 2.2; now += 1 / 60) { const p = T.at(now, [600]).v[0]; if (last !== null) step = Math.max(step, Math.abs(p - last)); top = Math.max(top, p); last = p; }
  assert.ok(top <= 650 && top > 600, "kurz weiter, nicht aus dem Feld: " + top);
  // data again; the figure is far away by now: the picture catches up a little faster than a finger, never jumps
  for (let s = 2; s <= 3; s += 0.05) T.push(s + 0.15, s, [1200 + 600 * (s - 2)]);
  for (let now = 2.2; now < 3.2; now += 1 / 60) { const p = T.at(now, [600]).v[0]; step = Math.max(step, Math.abs(p - last)); last = p; }
  assert.ok(step <= 600 / 60 * 1.41 + 1e-6, "groesster Schritt " + step);
});

test("Das Bild glaettet nur: mit und ohne Glaettung entscheiden die Regeln genau gleich", () => {
  for (const g of N.GAMES) {
    const o = Object.assign({ seed: 9, secs: 40 }, N.BAD), a = N.play(A, null, g, o), b = N.play(A, Sm, g, o);
    assert.deepEqual(a.score, b.score, g); assert.equal(a.t, b.t, g);
  }
});

test("Schlechtes Netz (150 +- 80 ms, 5 % Verlust, 500 ms Aussetzer): weniger Spruenge und Ruck als ohne Glaettung", () => {
  for (const g of N.GAMES) {
    const o = Object.assign({ seed: 2, secs: 60 }, N.BAD), plain = N.play(A, null, g, o), smooth = N.play(A, Sm, g, o);
    assert.ok(smooth.fig.jump <= 0.01, g + ": Figur springt in " + smooth.fig.jump);
    assert.ok(smooth.fig.jump <= plain.fig.jump, g + ": Figur " + smooth.fig.jump + " statt " + plain.fig.jump);
    assert.ok(smooth.fig.jerk < plain.fig.jerk, g + ": Ruck " + smooth.fig.jerk + " statt " + plain.fig.jerk);
    if (smooth.ball.frames > 60) assert.ok(smooth.ball.jump <= Math.max(0.02, plain.ball.jump), g + ": Ball springt in " + smooth.ball.jump);
    // through hand-overs and releases at the middle line too, the drawn ball jumps no more than the plain one
    if (smooth.whole.frames > 60) {
      assert.ok(smooth.whole.jump <= plain.whole.jump, g + ": Ball ueber Uebergaben " + smooth.whole.jump + " statt " + plain.whole.jump);
      // strict count (steps over 1.6 x top speed): far fewer than the plain picture; Ziegel's release at the line has none
      assert.ok(smooth.whole.strict <= plain.whole.strict, g + ": streng " + smooth.whole.strict + " statt " + plain.whole.strict);
      if (g === "ziegel") assert.equal(smooth.whole.strict, 0, "Ziegel: Freigabe an der Linie ohne Sprung");
    }
  }
});

test("Nach einem Stocken holt die Pruefung der Gegnerfigur den Stau auf, ohne schnellere Finger zu erlauben", () => {
  const S = A.side("ziegel", { seed: "b", serving: false }); S.start();
  S.receive({ t: "p", x: 150 }); S.tick(0.5);                     // half a second nothing, then five reports at once
  for (const x of [300, 450, 600, 750, 850]) S.receive({ t: "p", x });
  assert.ok(Math.abs(S.st.opp - 850) < 1e-6, "der Stau ist aufgeholt: " + S.st.opp);
  // a cheat that jumps across the field again and again gets only the time it saved up plus a frame per report
  const C = A.side("ziegel", { seed: "c", serving: false }); C.start(); C.receive({ t: "p", x: 150 }); C.tick(0.05);
  let path = 0, at = C.st.opp;
  for (let i = 0; i < 20; i++) { C.receive({ t: "p", x: i % 2 ? 150 : 850 }); path += Math.abs(C.st.opp - at); at = C.st.opp; }
  assert.ok(path <= (0.15 + 20 * 0.016) * A.ZIEGEL.PMAX * 1.25 + 1, "Weg " + path);
});

test("Zeitstempel kommen von der echten Uhr: haengt ein Bild, laeuft die Senderzeit trotzdem weiter", () => {
  let wall = 10; const out = [];
  const S = A.side("ziegel", { seed: "u", serving: false, clock: () => wall, send: (m) => out.push(m) }); S.start();
  S.tick(0.06); wall += 3; S.tick(0.06);   // three seconds the phone hung; the game only moves by one capped step
  const p = out.filter((m) => m.t === "p");
  assert.ok(p.length >= 2 && p[p.length - 1].ms - p[0].ms >= 3000, "Abstand " + (p[p.length - 1].ms - p[0].ms));
});
