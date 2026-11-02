const test = require("node:test"), assert = require("node:assert/strict");
const B = require("../src/ballduell.js");

test("Spiegeln zweimal ergibt den Ball zurueck, beide Seiten sehen denselben Ball", () => {
  const b = { x: 120, y: 300, vx: 50, vy: -400 };
  assert.deepEqual(B.mirror(B.mirror(b)), b);
  assert.equal(B.mirror(b).x, B.W - 120); assert.equal(B.mirror(b).vy, 400);
});
test("Aufschlag kommt nur aus dem Startwert und fliegt vom Aufschlaeger weg", () => {
  assert.deepEqual(B.serve("abc", 3), B.serve("abc", 3));
  assert.notDeepEqual(B.serve("abc", 3), B.serve("abc", 4));
  for (let n = 0; n < 50; n++) { const s = B.serve("k" + n, n); assert.ok(s.vy < 0); assert.ok(Math.abs(Math.hypot(s.vx, s.vy) - B.V0) < 1e-6); }
});
test("Wandabpraller halten den Ball im Feld", () => {
  let b = { x: 30, y: 800, vx: -900, vy: 100 };
  for (let i = 0; i < 200; i++) { b = B.step(b, 1 / 60); assert.ok(b.x >= B.R - 1e-9 && b.x <= B.W - B.R + 1e-9); }
});
test("Abwehr: Treffer dreht den Ball nach oben, daneben ist ein Punkt, unterwegs passiert nichts", () => {
  assert.equal(B.defend({ x: 500, y: 900, vx: 0, vy: 600 }, 500), null);
  assert.equal(B.defend({ x: 500, y: B.PY, vx: 0, vy: -600 }, 500), null);
  const hit = B.defend({ x: 520, y: B.PY, vx: 0, vy: 600 }, 500);
  assert.equal(hit.hit, true); assert.ok(hit.ball.vy < 0); assert.ok(hit.ball.vx > 0);
  assert.equal(B.defend({ x: 900, y: B.PY, vx: 0, vy: 600 }, 300).hit, false);
  let b = { x: 500, y: B.PY, vx: 0, vy: 600 };
  for (let i = 0; i < 40; i++) { b = B.defend({ x: 500, y: B.PY, vx: b.vx, vy: Math.abs(b.vy) }, 500).ball; }
  assert.ok(Math.hypot(b.vx, b.vy) <= B.VMAX + 1e-6, "Tempo bleibt gedeckelt");
});
test("Gegnerschlaeger springt nicht schneller als ein Finger, Spiel endet bei 5", () => {
  assert.ok(B.plausiblePaddle(500, 1000, 0.016) < 600);
  assert.equal(B.plausiblePaddle(500, 520, 0.05), 520);
  assert.equal(B.over([5, 3]), true); assert.equal(B.over([4, 4]), false);
  assert.equal(B.badge("ab12"), B.badge("ab12")); assert.equal(B.badge("ab12").split(" ").length, 3);
});
