// Steuerbare Uhr und Mikrofon-Attrappe fuer die Zeit- und Ton-Widgets der Z2-Karten:
// - Uhr: Playwright page.clock (Date, performance.now, setTimeout, rAF) wird vor dem Laden installiert; Tests spulen
//   mit tick(p, ms) vor, statt echte Sekunden zu warten. Abspielen (AudioBufferSource.onended) laeuft in echter Zeit,
//   deshalb wartet tick zusaetzlich kurz real.
// - Mikrofon: getUserMedia liefert einen Stream mit Testsignal (Sinus 440 Hz aus einem OscillatorNode); jeder Aufruf
//   wird in window.__mic gezaehlt, damit der Test sieht, dass wirklich aufgenommen wurde.
import { open, act, screen } from "./grund.mjs";

const FAKE_MIC = () => {
  window.__mic = 0;
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = async (c) => {
    if (!c || !c.audio) throw new DOMException("nur Audio", "NotAllowedError");
    window.__mic++;
    const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination();
    osc.frequency.value = 440; osc.connect(dst); osc.start();
    return dst.stream;
  };
};
/** Seite mit steuerbarer Uhr und Mikrofon-Attrappe */
export function openTimed(b, o) {
  return open(b, { ...o, before: async (ctx, p) => { await p.clock.install(); await p.addInitScript(FAKE_MIC); } });
}
export async function tick(p, ms) { await p.clock.runFor(ms); await p.waitForTimeout(120); }
const btn = (p, name) => p.locator("main .widget").getByRole("button", { name, exact: true });
async function has(l) { return (await l.count()) > 0; }
async function clickIf(l) { if (await has(l)) { await l.first().click(); return true; } return false; }
async function go(p) { return clickIf(p.locator("main .w-go:not([disabled])")); }

/**
 * Ein Schritt eines Zeit- oder Ton-Widgets; true, wenn ein Widget dieser Art da war und bedient wurde.
 * mem haelt, was die Spielerin vorher gesehen hat (Woerter der Suchzettel).
 */
export async function timedStep(p, mem) {
  const w = (t) => p.locator("main .widget.w-" + t);
  // Woerter, die eine Seite gerade zeigt (Z1 show: grosse Zeilen), fuer die Suchzettel merken
  if (!(await has(p.locator("main .widget")))) { const bigs = (await p.locator("main .stage .t-big").allInnerTexts()).map((x) => x.trim()).filter(Boolean); if (bigs.length >= 2) mem.words = bigs; return false; }
  if (await clickIf(p.locator('main [data-act="w-ready"]'))) { await tick(p, 50); return true; } // Countdown-Tor: Los
  if (await has(w("clock"))) { await tick(p, 31000); await go(p); return true; }
  if (await has(w("explain"))) { await clickIf(btn(p, "Erraten")); await clickIf(btn(p, "Weiter")); await clickIf(btn(p, "Erraten")); await tick(p, 61000); await go(p); return true; }
  if (await has(w("inner"))) {
    if (await clickIf(btn(p, "Start"))) { await tick(p, 4000); await clickIf(btn(p, "Stopp")); await tick(p, 50); return true; }
    return go(p);
  }
  if (await has(w("blind"))) {
    if (await clickIf(btn(p, "Start"))) { await tick(p, 9800); await clickIf(btn(p, "Stopp")); await tick(p, 50); return true; }
    return go(p);
  }
  if (await has(w("react"))) {
    const pad = p.locator("main .w-pad");
    if (await has(pad)) {
      for (let i = 0; i < 40; i++) { await tick(p, 150); if ((await pad.getAttribute("data-sig")) === "star") { await pad.focus(); await p.keyboard.press("Space"); return true; } if (!(await has(pad))) return true; }
      return true;
    }
    return go(p);
  }
  if (await has(w("drop"))) {
    if (await clickIf(btn(p, "Start"))) { await tick(p, 900); await clickIf(btn(p, "Kaufen")); return true; }
    return clickIf(btn(p, "Kaufen"));
  }
  if (await has(w("hunt"))) {
    if (await clickIf(btn(p, "Start"))) { await tick(p, 50); return true; }
    const f = w("hunt").locator("input.field");
    if (await has(f)) { const i = mem.hunt || 0; await f.fill(mem.words[i]); mem.hunt = i + 1; await tick(p, 7000); return true; }
    return go(p);
  }
  if (await has(w("tuer"))) {
    if (await clickIf(btn(p, "✅ Rein").or(btn(p, "Rein")))) { await clickIf(btn(p, "Raus")); await tick(p, 61000); }
    return go(p) || true;
  }
  if (await has(w("freeze"))) {
    const n = mem.freeze || 0;
    if (n < 2) { await clickIf(w("freeze").getByRole("button", { name: /Abspielen/ })); for (let i = 0; i < 30 && (mem.freeze || 0) === n; i++) { await tick(p, 1000); if (await has(w("freeze").locator(".w-big"))) mem.freeze = n + 1; } mem.freeze = n + 1; return true; }
    return clickIf(btn(p, "Ende"));
  }
  if (await has(w("rec"))) {
    if (await clickIf(w("rec").getByRole("button", { name: /Aufnehmen/ }))) { await tick(p, 5000); await tick(p, 500); return true; }
    return go(p);
  }
  if (await has(w("once"))) {
    if (await clickIf(w("once").getByRole("button", { name: /abspielen/i }))) { for (let i = 0; i < 60 && !(await has(p.locator("main .w-go:not([disabled])"))); i++) await tick(p, 500); }
    return go(p) || true;
  }
  if (await has(w("parrot"))) {
    const rec = w("parrot").getByRole("button", { name: /Aufnehmen/ });
    if (await has(p.locator("main .w-go:not([disabled])"))) return go(p);
    if (await has(rec)) { await rec.first().click(); for (let i = 0; i < 60 && !(await has(p.locator("main .w-go:not([disabled])"))); i++) await tick(p, 500); return true; }
    await clickIf(w("parrot").getByRole("button", { name: /Rückwärts/ })); for (let i = 0; i < 60 && !(await has(rec)); i++) await tick(p, 500);
    return true;
  }
  if (await has(w("whose"))) {
    const opts = w("whose").locator(".options .chip");
    if (await has(opts)) { await opts.first().click(); return true; }
    await clickIf(w("whose").getByRole("button", { name: /Abspielen/ })); for (let i = 0; i < 60 && !(await has(opts)); i++) await tick(p, 500);
    return true;
  }
  if (await has(w("blocks"))) {
    if (await has(p.locator("main .w-go:not([disabled])"))) return go(p);
    await p.locator("main .widget.w-blocks button.bcell").first().click(); await tick(p, 50);
    return true;
  }
  return false;
}
export { act, screen };
