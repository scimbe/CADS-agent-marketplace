// Katze auf den Daechern: Jump and Run ueber Daecher, Fischgraeten sammeln, Luecke = Lauf vorbei.
// Nicht umgesetzt: Ende-Anzeige mit Fischgraeten-Zahl und Neustart-Knopf (p6, nicht machbar).
const SCROLL = 3, GAP = 50, ROOF_Y = 600, ROOF_H = 40;

export default {
  title: "Katze auf den Dächern",
  controls: ["left", "right", "fire"],
  lives: 1,

  init(g) {
    return {
      me: { x: 30, y: 576, w: 24, h: 24, vx: 0, vy: 0, ground: true },
      roofs: [
        { x: 0, y: ROOF_Y, w: 120, h: ROOF_H },
        { x: 170, y: ROOF_Y, w: 120, h: ROOF_H },
        { x: 340, y: ROOF_Y, w: 140, h: ROOF_H },
        { x: 530, y: ROOF_Y, w: 130, h: ROOF_H },
        { x: 700, y: ROOF_Y, w: 160, h: ROOF_H }
      ],
      fische: [{ x: 100, y: 552, got: false }],
      scroll: 0
    };
  },

  update(s, input, g) {
    const me = s.me;
    me.vx = input.left ? -3 : input.right ? 3 : 0;
    me.x = g.clamp(me.x + me.vx, 0, g.W - me.w);

    // Daecher und Fische scrollen nach links; neue Daecher rechts nachliefern
    for (const r of s.roofs) r.x -= SCROLL;
    for (const f of s.fische) f.x -= SCROLL;
    s.scroll += SCROLL;
    s.roofs = s.roofs.filter((r) => r.x + r.w > -10);
    s.fische = s.fische.filter((f) => f.x > -30 && !f.got);
    let last = s.roofs[s.roofs.length - 1];
    while (last.x + last.w < g.W + 60) {
      const x = last.x + last.w + GAP, w = g.randInt(80, 160);
      last = { x, y: ROOF_Y, w, h: ROOF_H };
      s.roofs.push(last);
      if (g.random() < 0.5) s.fische.push({ x: x + 30, y: 552, got: false });
    }

    const feet = () => me.y + me.h;

    // Sprung
    if ((input.fire || input.firePressed) && me.ground) {
      me.vy = -10; me.ground = false; g.sound("jump");
    }

    // Auf dem Dach bleiben nur, solange noch ein Dach unter den Fuessen ist
    if (me.ground) {
      const on = s.roofs.some((r) => me.x + me.w > r.x && me.x < r.x + r.w && r.y === feet());
      if (!on) { me.ground = false; me.vy = 0; }
    }

    // Schwerkraft und Landung von oben
    me.vy = Math.min(me.vy + 0.5, 12);
    const oldBottom = feet();
    me.y += me.vy;
    if (me.vy >= 0) {
      for (const r of s.roofs) {
        const over = me.x + me.w > r.x && me.x < r.x + r.w;
        if (over && oldBottom <= r.y && feet() >= r.y) { me.y = r.y - me.h; me.vy = 0; me.ground = true; }
      }
    }

    // Fischgraeten einsammeln
    for (const f of s.fische) {
      if (!f.got && g.hit({ x: f.x, y: f.y, w: 24, h: 36 }, { x: me.x, y: me.y, w: me.w, h: me.h })) {
        f.got = true; g.addScore(1); g.sound("coin");
      }
    }
    s.fische = s.fische.filter((f) => !f.got);

    // Gefallen: Lauf vorbei
    if (me.y > g.H) { g.sound("hurt"); g.loseLife(); return; }
  },

  draw(s, d, g) {
    d.clear("cream");
    for (const r of s.roofs) {
      d.rect(r.x, r.y, r.w, r.h, "yellow", { round: 6, line: true });
      for (let bx = r.x + 8; bx < r.x + r.w - 14; bx += 24) {
        const c = Math.floor(bx / 24) % 2 ? "red" : "ink";
        d.rect(bx, r.y + 6, 14, 8, c, { round: 2 });
        d.rect(bx + 12, r.y + 20, 14, 8, c === "red" ? "ink" : "red", { round: 2 });
      }
    }
    for (const f of s.fische) d.emoji("🐟", f.x + 12, f.y + 12, 24);
    d.emoji("🐈", s.me.x + 12, s.me.y + 12, 30);
  }
};
