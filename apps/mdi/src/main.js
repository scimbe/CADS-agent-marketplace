// Einstieg im Browser: verbindet Laufzeit, Ansicht und Broker. Keine window.*-Singletons (A1).
import { createRuntime } from "./app/runtime.js";
import { langOf } from "./app/texts.js";
import { view, leaf } from "./ui/view.js";
import { patch } from "./ui/dom.js";
import { grow, shrink } from "./ui/motion.js";
import { createStorage } from "./broker/storage.js";
import { share, copy } from "./broker/share.js";
import { loadLive } from "./broker/live-host.js";
import { linkUrl } from "./ui/view.js";
import { createApi, lookCookie } from "./broker/api.js";
import { nativeAccount } from "./broker/native.js";
import { download, downloadText } from "./broker/share.js";
import { createStage } from "./render/rt-stage.js";
import { createSound } from "./render/sound.js";
import { featureEnv } from "./app/features.js";
import { createAi } from "./broker/ai.js";        // Strang K: freie Karte und KI-Arten
import { createDeck } from "./broker/deck.js";
import { createBild } from "./broker/bild.js";
import { sanitizeDoc } from "./features/frei/doc.js";
import { pinFor } from "./broker/deck-pin.js";

const root = document.getElementById("app");
const lang = langOf(navigator);
document.documentElement.lang = lang;

const reducedMq = matchMedia("(prefers-reduced-motion: reduce)");
// Echtzeit-Buehne und Klang (ADR 0001 b): die Laufzeit zeichnet ueber stage.draw, view.js haengt stage.stageNode ein
let rtApi = null;
// Dienste aus Features (Strang P: audio/high, T: cardSvg, K: images) – ohne Feature ehrlich gesperrt im Widget
const fenv = featureEnv(window);
const stageEnv = { high: fenv.high || null, images: fenv.images || null, win: window, doc: document, rt: { get active() { return rtApi && rtApi.active; }, get view() { return rtApi && rtApi.view; }, screenButtons: () => (rtApi ? rtApi.screenButtons() : []), get controls() { return rtApi && rtApi.controls; }, key: (c, d) => rtApi && rtApi.key(c, d), pointer: (...a) => rtApi && rtApi.pointer(...a), button: (...a) => rtApi && rtApi.button(...a), blur: () => rtApi && rtApi.blur(), hidden: () => rtApi && rtApi.hidden() }, reduced: () => reducedMq.matches };
const stage = createStage(stageEnv);
const sound = createSound({ audioContext: () => new AudioContext(), vibrate: navigator.vibrate ? (ms) => navigator.vibrate(ms) : null });
function randomInt(n) { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % Math.max(1, n); }
const viewEnv = { stage, random: randomInt, clock: () => performance.now(), reduced: reducedMq.matches, audio: fenv.audio || null, high: fenv.high || null, cardSvg: fenv.cardSvg || null, images: fenv.images || null };

function entropy() { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }

let lastDialog = null, lastDialogRect = null, opener = null;
// Rueckweg vom Gate: diese Seite, mit dem Hinweis, Mein Stil wieder zu oeffnen (nur ein Pfad, nie ein anderer Host)
// Strang K: aus der freien Karte heraus angemeldet -> zurueck zur freien Karte (?go=erschaffen, wie im Altcode)
const returnPath = () => location.pathname + (rt && rt.matches("inhalt.frei.start") ? "?go=erschaffen" : "?go=konto");
const api = createApi({ location, native: nativeAccount(window) });
const rt = createRuntime({
  lang, entropy, storage: createStorage(),
  // App-Huelle mit Konto-Bruecke: Anmelden nativ (OIDC + PKCE), Aufrufe mit Bearer durch die Huelle; sonst Web (Cookie)
  api, ai: createAi({ api }), deck: createDeck({ api, sanitize: sanitizeDoc, pin: pinFor(location.hostname) }), bild: createBild({ api }),
  returnPath,
  setLook: (colors) => { const k = lookCookie(colors, location.hostname); if (k) document.cookie = k; },
  navigate: (url) => { if (!/^https?:$/.test(location.protocol)) return false; location.assign(url); return true; },
  download, downloadText,
  copyText: (t) => copy(t),
  rt: { now: () => performance.now(), frame: (f) => requestAnimationFrame(f), cancel: (h) => cancelAnimationFrame(h), draw: (node, info) => stage.draw(node, info), sound: (ev, sounds) => sound.play(ev, sounds), reduced: () => reducedMq.matches },
  live: () => loadLive(),
  share: (fragment) => share(linkUrl(fragment), document.title),
  copy: (fragment) => copy(linkUrl(fragment)),
  // Heimseite (Strang H): Leinwand fuer Story-Bild und Wand, Teilen, Takt (Speicher und Netz laufen ueber storage und api)
  home: { document, navigator, location, File, URL, setInterval: (f, ms) => setInterval(f, ms), setTimeout: (f, ms) => setTimeout(f, ms) },
  clearUrl: () => { try { history.replaceState(history.state, "", location.pathname + location.search); } catch (e) { /* file:// in manchen Hosts */ } },
  onChange: draw
});

function bubbleRect(part) { const b = root.querySelector('.bubble[data-for="' + part + '"]'); return b ? b.getBoundingClientRect() : null; }

// Blasen an die Teile der Karte heften (Layout, kein Zustand): Mitte oben ueber dem Teil, innerhalb der Buehne.
function placeBubbles() {
  const st = root.querySelector("#stage"), layer = root.querySelector(".bubbles");
  if (!st || !layer) return;
  const sr = st.getBoundingClientRect(), placed = [];
  for (const b of layer.querySelectorAll(".bubble")) {
    const els = st.querySelectorAll('[data-part="' + b.dataset.for + '"]');
    if (!els.length) { b.style.setProperty("display", "none"); continue; }
    let l = Infinity, t = Infinity, r = -Infinity, btm = -Infinity;
    for (const e of els) { const q = e.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); btm = Math.max(btm, q.bottom); }
    const big = (r - l) * (btm - t) > 0.6 * sr.width * sr.height;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    // links ueber dem Teil, damit die Blase den Inhalt nicht verdeckt; grosse Teile (ganze Karte): unten links
    let x = big ? sr.left + 12 : l - 6, y = big ? sr.bottom - bh - 12 : t - bh - 6;
    x = Math.max(sr.left + 4, Math.min(sr.right - bw - 4, x)); y = Math.max(sr.top + 4, Math.min(sr.bottom - bh - 4, y));
    for (const p of placed) if (Math.abs(p.x - x) < bw && Math.abs(p.y - y) < bh) y = p.y + bh + 6;
    placed.push({ x, y });
    b.style.setProperty("left", (x + window.scrollX) + "px"); b.style.setProperty("top", (y + window.scrollY) + "px");
    b.style.removeProperty("display");
  }
}

function trapFocus(e) {
  const d = root.querySelector("#dialog");
  if (!d || e.key !== "Tab") return;
  const f = [...d.querySelectorAll("button:not([disabled]), input, textarea, [tabindex]:not([tabindex='-1'])")];
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  else if (!d.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
}

function draw(state, info) {
  const beforeLeaf = info && info.before ? leaf(info.before) : null, nowLeaf = leaf(state);
  patch(root, view(state, (ev) => rt.dispatch(ev), { ...viewEnv, reduced: reducedMq.matches }));
  placeBubbles();
  const d = root.querySelector("#dialog");
  if (d && beforeLeaf !== "card.customize.dialog") {
    opener = root.querySelector('.bubble[data-for="' + state.ctx.part + '"]');
    grow(d, opener ? opener.getBoundingClientRect() : null);
    const first = d.querySelector("input, textarea, button.seg-opt, button.chip") || d.querySelector("button");
    if (first) first.focus();
  }
  if (!d && beforeLeaf === "card.customize.dialog") {
    shrink(lastDialog, lastDialogRect, bubbleRect(info.before.ctx.part));
    const b = root.querySelector('.bubble[data-for="' + info.before.ctx.part + '"]');
    if (b) b.focus();
  }
  lastDialog = d; lastDialogRect = d ? d.getBoundingClientRect() : null;
  if (!nowLeaf.startsWith("card.customize")) for (const g of document.querySelectorAll(".ghost")) g.remove();
  if (beforeLeaf !== null && beforeLeaf !== nowLeaf && !d && nowLeaf !== "card.customize.dialog" && !nowLeaf.startsWith("card.customize")) {
    // Bildschirmwechsel: Fokus an den Hauptbereich (Screenreader liest den neuen Inhalt)
    const m = root.querySelector("#main"); if (m && !m.contains(document.activeElement)) m.focus({ preventScroll: true });
  }
  // Heimseite: neue Unterseite (Familie, Regal, Meins, Reiter) beginnt oben, wie ein Bildschirmwechsel
  const hb = info && info.before && info.before.ctx.home, hn = state.ctx.home;
  if (hb && hn && nowLeaf === "shelf" && beforeLeaf === "shelf" && (hb.at !== hn.at || hb.intent !== hn.intent || hb.mtab !== hn.mtab || hb.rtab !== hn.rtab)) { window.scrollTo(0, 0); const m = root.querySelector("#main"); if (m) m.focus({ preventScroll: true }); }
  syncHistory(nowLeaf === "shelf" && state.ctx.home && (state.ctx.home.at !== "day" || state.ctx.home.off !== 0) ? "shelf.tief" : nowLeaf);
  // Schriftgroesse aus Mein Stil (Lesen & Bedienen): Projektion des Zustands auf die Wurzel, alles skaliert per rem
  const fs = { n: "100%", g: "118.75%", sg: "137.5%" }[state.ctx.pref.fs] || "100%";
  if (document.documentElement.style.getPropertyValue("font-size") !== fs) document.documentElement.style.setProperty("font-size", fs);
}

// System-Zurueck (Browser/Android): ein Verlaufseintrag, solange die App Zurueck verbrauchen kann.
let guarded = false;
function syncHistory(l) {
  if (l !== "shelf" && !guarded) { try { history.pushState({ mdi: 1 }, ""); guarded = true; } catch (e) { /* ohne Verlauf */ } }
  if (l === "shelf" && guarded) { guarded = false; try { history.back(); } catch (e) { /* ohne Verlauf */ } ignoreNextPop = true; }
}
let ignoreNextPop = false;
addEventListener("popstate", () => {
  if (ignoreNextPop) { ignoreNextPop = false; return; }
  guarded = false;
  rt.dispatch({ type: "BACK" });
});

addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (rt.dispatch({ type: "BACK" })) e.preventDefault(); return; }
  if (e.code === "KeyP" && rt.rt.active && !/^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) { rt.dispatch({ type: "PAUSE" }); e.preventDefault(); return; }
  trapFocus(e);
});
addEventListener("resize", placeBubbles);
addEventListener("hashchange", () => { if (/^#v2\./.test(location.hash)) rt.link(location.hash); });

rtApi = rt.rt;
// Bilder, die nachladen (KI-Bild ueber Strang K), zeichnen die Ansicht neu, sobald sie da sind
if (fenv.images && typeof fenv.images.subscribe === "function") fenv.images.subscribe(() => draw(rt.state, null));
draw(rt.state, null);
if (location.hash.length > 1) rt.link(location.hash);
else if (new URLSearchParams(location.search).get("go") === "erschaffen") {
  try { history.replaceState(history.state, "", location.pathname); } catch (e) { /* ohne Verlauf */ }
  rt.dispatch({ type: "FREI" });
} else if (new URLSearchParams(location.search).get("go") === "konto") {
  // zurueck vom Anmelden: Mein Stil wieder oeffnen, die Adresse ohne ?go= behalten
  try { history.replaceState(history.state, "", location.pathname); } catch (e) { /* ohne Verlauf */ }
  rt.dispatch({ type: "STIL" });
}
