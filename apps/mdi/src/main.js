// Einstieg im Browser: verbindet Laufzeit, Ansicht und Broker. Keine window.*-Singletons (A1).
import { createRuntime } from "./app/runtime.js";
import { langOf } from "./app/texts.js";
import { view, leaf } from "./ui/view.js";
import { patch } from "./ui/dom.js";
import { grow, shrink } from "./ui/motion.js";
import { createStorage } from "./broker/storage.js";
import { share } from "./broker/share.js";
import { loadPart } from "./broker/parts.js";
import { linkUrl } from "./ui/view.js";

const root = document.getElementById("app");
const lang = langOf(navigator);
document.documentElement.lang = lang;

function entropy() { const b = new Uint8Array(16); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }

let lastDialog = null, lastDialogRect = null, opener = null;
const rt = createRuntime({
  lang, entropy, storage: createStorage(),
  live: () => loadPart("live"),
  share: (fragment) => share(linkUrl(fragment), document.title),
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
  patch(root, view(state, (ev) => rt.dispatch(ev)));
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
  syncHistory(nowLeaf);
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
  trapFocus(e);
});
addEventListener("resize", placeBubbles);
addEventListener("hashchange", () => { if (/^#v2\./.test(location.hash)) rt.link(location.hash); });

draw(rt.state, null);
if (location.hash.length > 1) rt.link(location.hash);
