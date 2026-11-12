// Steuerbare Uhr und Mikrofon-Attrappe fuer die Zeit- und Ton-Widgets der Z2-Karten:
// - Uhr: Playwright page.clock (Date, performance.now, setTimeout, rAF) wird vor dem Laden installiert; tick(p, ms)
//   spult vor. Abspielen (AudioBufferSource.onended) laeuft in echter Zeit, deshalb wartet tick zusaetzlich kurz real.
// - Mikrofon: getUserMedia liefert einen Stream mit Testsignal (Sinus 440 Hz); jeder Aufruf zaehlt in window.__mic.
// Der Treiber erkennt Widgets nur ueber Rollen, sichtbare Beschriftungen und data-act auf der Buehne (#stage), nie ueber
// CSS-Klassen (Befund: Klassen wechselten von w-<typ> auf wg-<typ>). Beschriftungen wie in render/widgets-more.js (de).
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
const stage = (p) => p.locator("#stage");
const btn = (p, name) => stage(p).getByRole("button", { name, exact: true });
async function has(l) { return (await l.count()) > 0; }
async function enabled(l) { return (await l.count()) > 0 && (await l.first().isEnabled()); }
async function clickIf(l) { if (await enabled(l)) { await l.first().click(); return true; } return false; }
/** Hauptknopf eines Schritts: Widget-Knopf (data-act w-<id>) oder Weiter des Zug-Kerns (go-step) */
export const goBtn = (p) => stage(p).locator('[data-act="go-step"]:enabled, [data-act^="w-"]:not([data-act="w-ready"]):not([data-act="w-door"]):enabled');
async function go(p) { return clickIf(goBtn(p)); }
async function until(p, cond, n = 60, ms = 500) { for (let i = 0; i < n && !(await cond()); i++) await tick(p, ms); }

/** Ein Schritt eines Zeit- oder Ton-Widgets; true, wenn bedient. mem merkt sich, was die Seite vorher zeigte. */
export async function timedStep(p, mem) {
  const st = stage(p);
  // Woerter, die gerade gross angezeigt werden (Suchzettel), merken – solange kein Widget auf der Buehne ist
  if (!(await has(st.getByRole("group")))) {
    const one = (await st.locator("p").allInnerTexts()).map((x) => x.trim()).filter((x) => x && !/\s/.test(x));
    if (one.length >= 2) mem.words = one;
    return false;
  }
  if (await has(st.locator('[data-act="w-ready"]'))) { await st.locator('[data-act="w-ready"]').first().click(); await tick(p, 50); return true; } // „Los“
  const star = st.getByRole("button", { name: "Stern antippen (Leertaste)" });
  if (await has(star)) { // Reaktion: auf den Stern warten, dann Leertaste
    for (let i = 0; i < 40; i++) { await tick(p, 150); if (!(await has(star))) return true; if ((await star.getAttribute("data-sig")) === "star") { await star.focus(); await p.keyboard.press("Space"); return true; } }
    return true;
  }
  if (await has(btn(p, "Erraten"))) { await clickIf(btn(p, "Erraten")); await clickIf(btn(p, "Weiter")); await clickIf(btn(p, "Erraten")); await tick(p, 61000); return true; }
  if (await has(btn(p, "Rein"))) { await clickIf(btn(p, "Rein")); await clickIf(btn(p, "Raus")); await tick(p, 61000); await clickIf(btn(p, "Rein")); return true; }
  if (await has(btn(p, "Kaufen"))) { await tick(p, 900); await clickIf(btn(p, "Kaufen")); return true; }
  if (await has(btn(p, "Stopp"))) { await tick(p, 9800); await clickIf(btn(p, "Stopp")); await tick(p, 50); return true; }
  if (await clickIf(btn(p, "Start"))) { mem.started = true; await tick(p, 50); return true; }
  const box = st.getByRole("textbox");
  if (mem.started && mem.words && (await has(box)) && !(await enabled(goBtn(p)))) { // Suchzettel: das gefundene Wort tippen
    const i = mem.hunt || 0; await box.first().fill(mem.words[i] || ""); mem.hunt = i + 1; await tick(p, 7000); return true;
  }
  if (await has(btn(p, "Ende"))) { // Statue: Musik bis zum Stopp, zwei Runden, dann Ende
    if ((mem.freeze || 0) < 2) { await clickIf(st.getByRole("button", { name: /Abspielen/ })); await tick(p, 13000); mem.freeze = (mem.freeze || 0) + 1; return true; }
    await clickIf(btn(p, "Ende")); return true;
  }
  if (await enabled(goBtn(p))) return false; // fertig: Hauptknopf drueckt der allgemeine Treiber
  const rec = st.getByRole("button", { name: /Aufnehmen/ });
  if (await clickIf(rec)) { await until(p, () => enabled(goBtn(p))); return true; }
  if (await clickIf(st.getByRole("button", { name: /Rückwärts abspielen/ }))) { await until(p, () => has(rec)); return true; }
  if (await clickIf(st.getByRole("button", { name: /Einmal abspielen/ }))) { await until(p, () => enabled(goBtn(p))); return true; }
  const play = st.getByRole("button", { name: /^▶ Abspielen$/ });
  if (await has(play)) { // Wessen Stimme: abspielen, dann einen Namen waehlen
    await play.first().click(); await tick(p, 3000);
    const names = st.getByRole("button").filter({ hasNotText: "Abspielen" });
    await until(p, () => has(names), 30);
    await clickIf(names); return true;
  }
  const cell = btn(p, "1"); // Steine: Feld 1 (oben links) nimmt jeden ersten Stein
  if ((await has(cell)) && (await has(btn(p, "64")))) { await cell.first().click(); await tick(p, 50); return true; }
  return false;
}
export { act, screen };
