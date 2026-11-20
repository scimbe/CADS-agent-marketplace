// Katze auf den Daechern (nur Spiel-API). Umgesetzt: p1 Springen, p2 Fischgraeten, p3 Luecken und Neustart, p5 Tempo.
// Nicht umgesetzt (ehrlich): p4 (gestreifter Schwanz, gruene Augen: nur das Emoji 🐱 ist moeglich),
// p6 (Ergebnisanzeige nach dem Spiel mit bestem Stand: fehlt).
// Luecken 40 bis 80 px statt 120: bei Tempo 2 ist der Sprung (ca. 37 Frames Flug) sonst nicht schaffbar.
const ROOF_Y = 400, RUN_END = 900;

export default {
  title: "Katze auf den Dächern",
  controls: ["up"],
  lives: 3,

  init(g) {
    const s = { cat: null, roofs: [], fish: 0, held: false, safe: 0 };
    reset(s, g);
    return s;
  },

  update(s, input, g) {
    const c = s.cat;
    if (s.safe > 0) s.safe -= 1;

    // Welt scrollt nach links
    const sp = 2 + 0.5 * (g.level - 1);
    for (const r of s.roofs) r.x -= sp;
    s.roofs = s.roofs.filter((r) => r.x + r.w > -4);
    let last = 0;
    for (const r of s.roofs) last = Math.max(last, r.x + r.w);
    fill(s, g, last);

    // Auf einem Dach bleiben, nur solange es unter der Katze liegt
    if (c.ground && !onRoof(s, c)) c.ground = false;

    // Sprung nur vom Dach und nur beim Druecken (nicht beim Halten)
    if (input.up && !s.held && c.ground) { c.vy = -11; c.ground = false; g.sound("jump"); }
    s.held = !!input.up;

    if (!c.ground) {
      const prev = c.y + c.h;
      c.vy = Math.min(c.vy + 0.6, 14);
      c.y += c.vy;
      for (const r of s.roofs) {
        if (c.vy >= 0 && c.x + c.w > r.x && c.x < r.x + r.w && prev <= r.y && c.y + c.h >= r.y) {
          c.y = r.y - c.h; c.vy = 0; c.ground = true; break;
        }
      }
    }

    // Fischgraeten einsammeln (kein Leben-Verlust)
    for (const r of s.roofs) {
      if (!r.f) continue;
      const fish = { x: r.x + r.w / 2 - 9, y: r.y - 18, w: 18, h: 18 };
      if (g.hit(c, fish)) { r.f = false; s.fish += 1; g.addScore(1); g.sound("coin"); }
    }

    // Sturz durch eine Luecke: ein Leben, Neustart an der Startposition
    if (c.y > g.H) {
      if (s.safe === 0) g.loseLife();
      reset(s, g);
      return;
    }

    if ((g.frame + 1) % 600 === 0) { g.nextLevel(); g.sound("level"); }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (const r of s.roofs) {
      d.rect(r.x, r.y, r.w, 16, "yellow", { round: 6, shadow: true, line: true });
      if (r.f) d.emoji("🐟", r.x + r.w / 2, r.y - 9, 18);
    }
    const c = s.cat;
    d.emoji("🐱", c.x + c.w / 2, c.y + c.h / 2, 30);
    d.text("Fischgräten: " + s.fish, 12, g.H - 16, { size: 20, align: "left" });
  }
};

function reset(s, g) {
  s.cat = { x: 40, y: ROOF_Y - 30, w: 26, h: 30, vy: 0, ground: true };
  s.fish = 0;
  s.safe = 60;
  s.roofs = [];
  for (let x = 0; x < RUN_END; x += 150) s.roofs.push({ x, y: ROOF_Y, w: 150, f: x % 300 === 0 });
  fill(s, g, RUN_END);
}

function fill(s, g, last) {
  while (last < g.W + 60) {
    const r = addRoof(s, g, last + g.randInt(40, 80));
    last = r.x + r.w;
  }
}

function addRoof(s, g, x) {
  const r = { x, y: g.randInt(360, 440), w: g.randInt(90, 150), f: g.random() < 0.5 };
  s.roofs.push(r);
  return r;
}

function onRoof(s, c) {
  return s.roofs.some((r) => Math.abs(r.y - (c.y + c.h)) < 0.5 && c.x + c.w > r.x && c.x < r.x + r.w);
}
