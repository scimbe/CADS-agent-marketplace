// Test-Host fuer Echtzeitkarten (nur e2e, nie im Bundle): spielt eine Karte nach ADR 0001 (b) im Browser, bis der
// Echtzeit-Host von Strang F (src/app/rt/loop.js, Canvas-Renderer) da ist. Er zeigt, dass die Karten den Vertrag
// erfuellen: fester Tick, Eingaben als Daten aus controls (Tasten, Tippen, Wischen, echter Ducken-Knopf), Canvas-Ops,
// Pause, reduzierte Bewegung, aria-live, Geist per Link (Spur-Bytes), eigene Fotos nur als lokale Slots.
import flug from "../../../src/cards/flug/card.js";
import lauf from "../../../src/cards/lauf/card.js";
import * as Spur from "../../../src/engines/flug/spur.js";
import * as R from "../../../src/engines/flug/regeln.js";
import FT from "../../../src/engines/flug/texts.json" with { type: "json" };

const CARDS = { flug, lauf };
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const lang = q.get("lang") === "en" ? "en" : "de";
const card = CARDS[q.get("card")] || flug;
const M = card.manifest, TPS = M.rt.tick, DT = 1 / TPS;
const defaults = () => Object.fromEntries(Object.entries(M.params.properties).map(([k, d]) => [k, structuredClone(d.default)]));
let params = defaults();
const vid = q.get("variant");
if (vid && M.variants) { const v = M.variants.find((x) => x.id === vid); if (v) params = Object.assign(defaults(), card.variantParams ? card.variantParams(vid, lang, { nick: "", emoji: "🦊" }) : v.params); }
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const assets = {}, images = {};

// ---------- Geist aus dem Link ----------
function b64u(bytes) { let s = ""; for (const x of bytes) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64u(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
let ghost = null;
const hm = location.hash.match(/^#g=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)\.(\d+)$/);
if (hm) {
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64u(hm[1])));
    const bytes = Spur.sanitize(unb64u(hm[2]));
    if (p && typeof p === "object" && bytes) { params = Object.assign(defaults(), p); ghost = { bytes, score: Number(hm[3]) }; }
  } catch { ghost = null; }
}

// ---------- Canvas-Renderer (Teilmenge der ADR-Ops, die flug/lauf nutzen) ----------
const cv = $("stage"), ctx = cv.getContext("2d");
const EMO = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
function paint(fill, x0, y0) {
  if (!fill || typeof fill === "string") return fill || "transparent";
  if (fill.lin) { const [a, b, c, d] = fill.lin, g = ctx.createLinearGradient(a, b, c, d); for (const [o, col] of fill.stops) g.addColorStop(o, col); return g; }
  return "transparent";
}
function style(o, path) {
  if (o.shadow) { ctx.shadowColor = o.shadow.color; ctx.shadowBlur = o.shadow.blur || 0; }
  if (o.fill) { ctx.fillStyle = paint(o.fill); path ? ctx.fill(path) : ctx.fill(); }
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || 1; path ? ctx.stroke(path) : ctx.stroke(); }
  ctx.shadowBlur = 0;
}
function op(o) {
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  switch (o.o) {
    case "rect": ctx.beginPath(); if (o.r) ctx.roundRect(o.x, o.y, o.w, o.h, o.r); else ctx.rect(o.x, o.y, o.w, o.h); style(o); break;
    case "circle": ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(0, o.r), 0, 7); style(o); break;
    case "ellipse": ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx, o.ry, o.rot || 0, 0, 7); style(o); break;
    case "line": ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); style({ stroke: o.stroke, lw: o.lw }); break;
    case "poly": ctx.beginPath(); ctx.moveTo(o.pts[0], o.pts[1]); for (let i = 2; i < o.pts.length; i += 2) ctx.lineTo(o.pts[i], o.pts[i + 1]); if (o.closed) ctx.closePath(); style(o); break;
    case "text": ctx.font = (o.font === "brand" ? "900 " : "800 ") + o.size + "px " + (o.font === "brand" ? "Anton, Impact, sans-serif" : "system-ui, sans-serif"); ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "alphabetic";
      if (o.stroke) { ctx.lineWidth = o.lw || 3; ctx.strokeStyle = o.stroke; ctx.strokeText(o.text, o.x, o.y); } ctx.fillStyle = paint(o.fill); ctx.fillText(o.text, o.x, o.y); break;
    case "sprite": ctx.translate(o.x + o.w / 2, o.y + o.h / 2); if (o.rot) ctx.rotate(o.rot); ctx.font = Math.round(o.h * 0.86) + "px " + EMO; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(o.emoji, 0, o.h * 0.04); break;
    case "image": { const im = o.src && o.src.kind === "local" && images[o.src.slot]; if (!im) break; if (o.clip === "circle") { ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + o.h / 2, Math.min(o.w, o.h) / 2, 0, 7); ctx.clip(); }
      const s = Math.max(o.w / im.width, o.h / im.height), w = im.width * s, h = im.height * s; ctx.drawImage(im, o.x + (o.w - w) / 2, o.y + (o.h - h) / 2, w, h); break; }
    case "group": ctx.translate(o.tx || 0, o.ty || 0); if (o.rot) ctx.rotate(o.rot); ctx.scale(o.sx == null ? 1 : o.sx, o.sy == null ? 1 : o.sy);
      if (o.clip) { ctx.beginPath(); ctx.rect(o.clip.x, o.clip.y, o.clip.w, o.clip.h); ctx.clip(); } for (const c of o.ops) op(c); break;
    case "shake": break;   // in render() vor der Ebene
    case "flash": if (!reduced) { ctx.fillStyle = o.color; ctx.globalAlpha = o.alpha; ctx.fillRect(-50, -50, 5000, 5000); } break;
  }
  ctx.restore();
}
function render(list) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const k = M.rt.view.fit === "width" ? cv.width / list.w : Math.min(cv.width / list.w, cv.height / list.h);
  const ox = (cv.width - list.w * k) / 2, oy = M.rt.view.fit === "width" ? (cv.height - list.h * k) * 0.55 : (cv.height - list.h * k) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#111"; ctx.fillRect(0, 0, cv.width, cv.height);
  for (const layer of list.layers) {
    ctx.setTransform(k, 0, 0, k, ox, oy);
    if (layer.camera) ctx.translate(-layer.camera.x, -layer.camera.y);
    const sh = layer.ops.find((o) => o.o === "shake");
    if (sh && !reduced) ctx.translate((Math.random() - 0.5) * sh.amt, (Math.random() - 0.5) * sh.amt);   // nur Optik
    for (const o of layer.ops) op(o);
  }
  cv.setAttribute("aria-label", list.a11y);
}

// ---------- Eingaben aus manifest.rt.controls ----------
const B = M.rt.controls.buttons, held = new Set(), pulse = new Set();
function press(id) { if (!held.has(id)) pulse.add(id); held.add(id); }
function release(id) { held.delete(id); }
function sample() {
  let b = 0;
  B.forEach((btn, i) => { if (btn.kind === "pulse" ? pulse.has(btn.id) : held.has(btn.id)) b |= 1 << i; });
  pulse.clear();
  return { b };
}
const stageBtns = B.filter((x) => x.zone === "any").map((x) => x.id);
addEventListener("keydown", (e) => {
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) && e.code === "Space") return;
  if ((e.code === "Escape" || e.code === "KeyP") && phase === "run") { e.preventDefault(); setPause(!paused); return; }
  const hit = B.filter((x) => x.keys.includes(e.code));
  if (!hit.length || phase !== "run" || e.repeat) return;
  e.preventDefault(); if (paused) { setPause(false); return; }
  for (const x of hit) press(x.id);
});
addEventListener("keyup", (e) => { for (const x of B.filter((y) => y.keys.includes(e.code))) release(x.id); });
let py = null;
cv.addEventListener("pointerdown", (e) => { if (phase !== "run") return; e.preventDefault(); py = e.clientY; if (paused) { setPause(false); return; } for (const id of stageBtns) press(id); });
cv.addEventListener("pointermove", (e) => { const sw = B.find((x) => x.swipe === "down"); if (py != null && sw && e.clientY - py > 40) { for (const id of stageBtns) release(id); press(sw.id); } });
for (const n of ["pointerup", "pointercancel"]) cv.addEventListener(n, () => { py = null; for (const x of B) if (x.zone !== "button") release(x.id); const sw = B.find((x) => x.swipe === "down"); if (sw) release(sw.id); });
const btnRow = $("btns");
for (const x of B.filter((y) => y.zone === "button")) {
  const el = document.createElement("button"); el.type = "button"; el.className = "hold"; el.textContent = (x.id === "duck" ? "⬇ " : "") + x.label[lang];
  el.setAttribute("aria-pressed", "false"); el.dataset.btn = x.id;
  const on = (e) => { e.preventDefault(); press(x.id); el.setAttribute("aria-pressed", "true"); }, off = () => { release(x.id); el.setAttribute("aria-pressed", "false"); };
  el.addEventListener("pointerdown", on); for (const n of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(n, off);
  btnRow.appendChild(el);
}

// ---------- Partie ----------
let st = null, phase = "ready", paused = false, acc = 0, last = 0, clock = 0, rec = null, player = null, hashes = [];
const live = $("live");
function sayLine(s) { live.textContent = ""; requestAnimationFrame(() => { live.textContent = s; }); }
function setPause(p) { paused = p; $("pause").textContent = p ? "▶" : "⏸"; $("pause").setAttribute("aria-label", p ? (lang === "en" ? "Resume" : "Weiter") : (lang === "en" ? "Pause" : "Pause")); if (p) sayLine(lang === "en" ? "Paused" : "Pause"); last = 0; }
function start() {
  st = card.init({ params, seed: "host", players: ghost ? 2 : 1 });
  rec = Spur.recorder(); player = ghost ? Spur.player(ghost.bytes) : null; hashes = [];
  phase = "run"; paused = false; acc = 0; last = 0; $("result").hidden = true; $("start").hidden = true; $("pause").hidden = false;
  sayLine(lang === "en" ? "Go! Tap or press space." : "Los! Tippen oder Leertaste.");
  cv.focus();
}
function tick() {
  const mine = sample();
  rec.put(st.t, mine.b);
  const inputs = [mine];
  if (player) inputs.push({ b: player.at(st.t) });
  const r = card.step(st, inputs, st.t); st = r.state;
  if (st.t % TPS === 0) hashes.push(card.hash(st));
  const s = card.status(st);
  if (s.over) end(s);
}
function end(s) {
  phase = "over"; rec.end(st.t); $("pause").hidden = true;
  const line = (s.say && s.say[lang]) || "";
  const vs = ghost ? (s.winner === 0 ? (lang === "en" ? " You beat the ghost." : " Geist geschlagen.") : s.winner === 1 ? (lang === "en" ? " The ghost wins." : " Der Geist gewinnt.") : (lang === "en" ? " Tie." : " Gleichstand.")) : "";
  $("resline").textContent = line + vs; $("resscore").textContent = String(s.score[0]);
  $("result").hidden = false; sayLine(line + vs); $("again").focus();
  document.body.dataset.over = "1";
}
function frame(ts) {
  const dt = Math.min(0.25, last ? (ts - last) / 1000 : 0); last = ts;
  if (phase === "run" && !paused) { clock += dt; acc += dt; while (acc >= DT && phase === "run") { acc -= DT; tick(); } }
  if (st) render(card.view(st, { lang, reduced, t: reduced ? 0 : clock, assets, col: params.col }));
  requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => { if (document.hidden && phase === "run") setPause(true); });
$("start").addEventListener("click", start);
$("again").addEventListener("click", () => { delete document.body.dataset.over; start(); });
$("pause").addEventListener("click", () => setPause(!paused));
$("challenge").addEventListener("click", () => {
  // Link: nur Felder, die reisen (keine lokalen Fotos), dazu die Spur-Bytes und die Punkte
  const p = {}; for (const [k, d] of Object.entries(M.params.properties)) if (d["x-field"] !== "media.local") p[k] = params[k];
  const url = location.href.split("#")[0] + "#g=" + b64u(new TextEncoder().encode(JSON.stringify(p))) + "." + b64u(rec.bytes()) + "." + card.status(st).score[0];
  $("link").value = url; $("link").hidden = false; document.body.dataset.link = url;
});
// eigene Fotos: bleiben im Geraet (Objekt-URL im Speicher), nie im Zustand oder Link
for (const slot of ["figur", "hintergrund"]) {
  const inp = $("foto-" + slot); if (!inp) continue;
  inp.addEventListener("change", async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try { images[slot] = await createImageBitmap(f); assets[slot] = true; inp.setCustomValidity(""); }
    catch { delete images[slot]; delete assets[slot]; sayLine(lang === "en" ? "This photo cannot be read." : "Dieses Foto kann nicht gelesen werden."); }   // ehrlich, kein stiller Rueckfall
  });
}
// Regler in benannten Stufen (alt regeln.js), nur Karte flug
if (card === flug) {
  const box = $("regler");
  for (const k of R.KEYS) {
    const row = document.createElement("label"), r = document.createElement("input"), out = document.createElement("b"), i = R.level(k, params[k]);
    row.className = "slide"; row.append(FT[lang][k] + " ");
    r.type = "range"; r.min = 0; r.max = R.N - 1; r.step = 1; r.value = i; r.dataset.k = k;
    r.setAttribute("aria-valuetext", FT[lang]["rg_" + k + i]); out.textContent = FT[lang]["rg_" + k + i];
    r.addEventListener("input", () => { const n = Number(r.value); params[k] = R.value(k, n); out.textContent = FT[lang]["rg_" + k + n]; r.setAttribute("aria-valuetext", out.textContent); if (phase !== "run") st = card.init({ params, players: 1 }); });
    row.append(r, out); box.appendChild(row);
  }
}
$("title").textContent = (vid && M.variants ? M.variants.find((v) => v.id === vid)?.title[lang] : null) || M.title[lang];
$("rule").textContent = M.rule[lang];
if (ghost) $("ghostline").textContent = (lang === "en" ? "Ghost duel: beat " : "Geist-Duell: schlag ") + ghost.score;
st = card.init({ params, players: ghost ? 2 : 1 });
requestAnimationFrame(frame);
window.HOST = { state: () => st, phase: () => phase, paused: () => paused, hashes: () => hashes, params: () => params, spur: () => rec && Array.from(rec.bytes()), status: () => st && card.status(st),
  run: (n, feed) => { for (let i = 0; i < n && phase === "run"; i++) { if (feed) { const b = feed(st, i); if (b & 1) press(B[0].id); else release(B[0].id); } tick(); } return card.status(st); } };
