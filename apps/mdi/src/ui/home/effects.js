// Effekte der Heimseite (ADR 0001 §g: fn(fx, {dispatch, state, api, deps})). Alles Browserspezifische kommt ueber
// deps.home herein (main.js: storage, fetch, document, navigator, location, setInterval) – keine Globals (A1).
// Ergebnisse gehen immer als Ereignis zurueck (HOME_LOADED, SHORT_DONE, SHORT_DELETED, STORY_DONE, WALL_SNAP).
import * as SL from "./shortlink.js";
import { partOf, isPartLoaded, loadFeatPart } from "../../gen/fparts.js";
import { familyOf, family, catalogIdOf } from "./families.js";
import { byId } from "./rotation.js";
import { manifestOf } from "../../cards/index.js";
import { homeTexts } from "./texts.js";
import { weatherFromApi } from "../../engines/poster/doc.js";
import { solve, PROOF_BITS } from "../../broker/ai.js";

// Ein Nachweis je Geraete-Kennung (derselbe, den die KI rechnet; der Server prueft sha256("<device>:<proof>") mit 16 Nullbits)
let proofCache = null;
export async function proofFor(device, subtle) {
  if (typeof device !== "string" || !/^[0-9a-f]{32}$/.test(device) || !subtle) return null;
  if (proofCache && proofCache.d === device) return proofCache.p;
  const p = await solve(device, PROOF_BITS, subtle);
  proofCache = { d: device, p };
  return p;
}

const TICK_MS = 60000;

// QR und Zeichnen (Teil home-share) erst nach einem Tipp laden; Fehler kommen als Ergebnis-Ereignis zurueck
function sharePart(deps) { return isPartLoaded("home-share") ? Promise.resolve(partOf("home-share")) : loadFeatPart("home-share", deps && deps.loadFeat).then(() => partOf("home-share")); }

// Ohne deps.home (Tests, Laufzeit ohne Browser) gibt es weder Speicher noch Netz: Ergebnisse sagen das ehrlich
// (leeres Meins, Kurzlink "nicht-hier" -> langer Link), nichts wird vorgetaeuscht.
function envOf(deps) { return (deps && deps.home) || {}; }
function look(cardId, lang) {
  const cid = catalogIdOf(cardId), idea = byId(cid), fam = familyOf(cid) || family(manifestOf(cardId) && manifestOf(cardId).family) || family("gruessen");
  const man = manifestOf(cardId);
  const title = idea ? (idea[lang] || idea.de).t.replace(/\|/g, " ") : man ? man.title[lang] || man.title.de : cardId;
  return { color: fam.color, ink: fam.ink, shape: fam.shape, title };
}
function absUrl(env, f) { return String(env.location.href).split("#")[0] + "#" + f; }

export const effects = {
  "home.load": (fx, { dispatch, deps }) => {
    const env = envOf(deps), st = deps && deps.storage;
    const data = st && st.loadHome ? st.loadHome() : null;
    dispatch({ type: "HOME_LOADED", data: data || {} });
    if (env.setInterval) env.setInterval(() => dispatch({ type: "HOME_TICK" }), TICK_MS);
  },
  "home.later": (fx, { dispatch, deps }) => { const env = envOf(deps); if (env.setTimeout) env.setTimeout(() => dispatch({ type: "HOME_TICK" }), fx.ms + 50); },
  // Startbilder (Thumbnail-Teile, ADR 0001 d): je Teil einmal geladen; fehlt eins, bleibt die Familienflaeche (sichtbar, kein Fehler)
  "home.thumbs": (fx, { dispatch, deps }) => {
    const env = envOf(deps);
    if (typeof env.thumb !== "function") return;
    Promise.all(fx.keys.map((k) => { const [id, v] = k.split("/"); return env.thumb(id, v || null).then((u) => [k, u], () => [k, null]); }))
      .then((pairs) => { const map = {}; for (const [k, u] of pairs) if (typeof u === "string" && u.startsWith("data:image/")) map[k] = u; if (Object.keys(map).length) dispatch({ type: "THUMBS", map }); });
  },
  // Leseschrift Atkinson Hyperlegible Next (Teil home-font): ueber die FontFace-API aus dem Puffer, CSP bleibt unveraendert;
  // bis sie da ist, gilt die Systemschrift (reine Darstellung)
  "home.font": (fx, { deps }) => {
    const env = envOf(deps);
    if (!env.FontFace || !env.document || !env.document.fonts) return;
    const load = isPartLoaded("home-font") ? Promise.resolve(partOf("home-font")) : loadFeatPart("home-font", deps && deps.loadFeat).then(() => partOf("home-font"));
    load.then((F) => Promise.all(F.FONT_FACES.map((f) => {
      const bin = atob(f.b64), buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new env.FontFace(F.FONT_FAMILY, buf.buffer, { weight: f.weight, style: "normal", display: "swap" }).load().then((face) => env.document.fonts.add(face));
    }))).catch(() => {});
  },
  // Wetter: Antwort des Servers -> Feldwert ueber PARAM (der Host prueft das Schema); ohne Zahlen bleibt das Feld, wie es war
  "home.wx": (fx, { dispatch, api }) => {
    if (!api || !api.weather) { dispatch({ type: "WX_DONE", key: fx.key, st: "fail" }); return; }
    api.weather(fx.place, fx.date).then((r) => {
      const w = r.ok ? weatherFromApi(r.body) : null;
      if (w) { dispatch({ type: "PARAM", key: fx.key, value: w }); dispatch({ type: "WX_DONE", key: fx.key, st: "ok" }); }
      else dispatch({ type: "WX_DONE", key: fx.key, st: r.ok ? "fail" : r.error === "no-place" ? "no-place" : r.error === "blocked" ? "blocked" : "fail" });
    });
  },
  // Foto: nur auf dem Geraet (broker/media.js), danach Feldwert "local:<id>" ueber PARAM; ohne Speicher ehrlich nicht-verfuegbar
  "home.photo": (fx, { dispatch, deps }) => {
    const md = envOf(deps).media;
    if (!md || !md.available) { dispatch({ type: "PHOTO_DONE", key: fx.key, st: "nicht-verfuegbar" }); return; }
    md.put(fx.file).then((r) => {
      if (r.ok) dispatch({ type: "PARAM", key: fx.key, value: r.value });
      dispatch({ type: "PHOTO_DONE", key: fx.key, st: r.ok ? "ok" : r.error });
    });
  },
  "home.save": (fx, { deps }) => { const st = deps && deps.storage; if (st && st.saveHome) st.saveHome(fx.data); },
  "short.create": (fx, { dispatch, api, deps, state }) => {
    if (!api || !api.shortCreate || !SL.fragmentOf("#" + fx.f)) { dispatch({ type: "SHORT_DONE", f: fx.f, r: { ok: false, error: "nicht-hier" } }); return; }
    const env = envOf(deps), device = state().ctx.device;
    // Arbeitsnachweis wie fuer die KI (broker/ai.js solve, 16 Bit), einmal je Geraet; ohne WebCrypto keiner -> Server sagt nein -> langer Link
    const proofP = proofFor(device, env.subtle);
    proofP.then((proof) => api.shortCreate(fx.f, SL.kindOf(fx.f), fx.lang === "en" ? "en" : "de", device, proof))
      .then((r) => dispatch({ type: "SHORT_DONE", f: fx.f, r }));
  },
  "short.delete": (fx, { dispatch, api }) => {
    (api && api.shortDelete ? api.shortDelete(fx.s.id, fx.s.token) : Promise.resolve({ ok: false })).then((r) => dispatch({ type: "SHORT_DELETED", f: fx.f, ok: r.ok === true }));
  },
  "home.share": (fx, { deps }) => {
    const env = envOf(deps);
    if (!env.location) return;
    const url = SL.shareUrl(absUrl(env, fx.inv.f), fx.inv, fx.at), nav = env.navigator;
    if (nav && nav.share) nav.share({ url, title: fx.inv.t || "My Daily Idea" }).catch(() => {});
    else if (nav && nav.clipboard) nav.clipboard.writeText(url).catch(() => {});
  },
  "wall.snap": (fx, { dispatch, deps }) => {
    const env = envOf(deps);
    if (!env.document) return;
    // ohne Bild bleibt das Werk lokal (live gezeichnet); zum Server geht es erst mit Bild (wallForServer)
    sharePart(deps).then((P) => { const th = P.tileJpeg(env.document, look(fx.id, fx.lang)); if (th) dispatch({ type: "WALL_SNAP", id: fx.id, ts: fx.ts, th }); }, () => {});
  },
  // Bild der Karte (mit lokalem Foto) ueber den Geraetedienst cardImage (Strang P) zeichnen und ueber das System teilen,
  // sonst herunterladen. Kein Upload; ohne Dienst oder Foto ehrlich nein.
  "home.image": (fx, { dispatch, deps }) => {
    const env = envOf(deps), done = (st) => dispatch({ type: "IMAGE_DONE", st });
    if (!env.cardImage || typeof env.cardImage.draw !== "function" || !env.document || !env.File) { done("nicht-verfuegbar"); return; }
    Promise.resolve().then(() => env.cardImage.draw(fx.node, { images: env.images || null, high: env.high || null, makeCanvas: (w, h) => { const c = env.document.createElement("canvas"); c.width = w || 1; c.height = h || 1; return c; } }))
      .then((cv) => new Promise((ok) => cv.toBlob(ok, "image/png")))
      .then((blob) => {
        if (!blob) { done("fehler"); return; }
        const file = new env.File([blob], fx.name, { type: "image/png" }), nav = env.navigator;
        if (nav && nav.canShare && nav.canShare({ files: [file] })) return nav.share({ files: [file] }).then(() => done("ok"), (e) => done(e && e.name === "AbortError" ? "ok" : "fehler"));
        const a = env.document.createElement("a"), href = env.URL.createObjectURL(blob);
        a.href = href; a.download = fx.name; env.document.body.appendChild(a); a.click(); a.remove();
        if (env.setTimeout) env.setTimeout(() => env.URL.revokeObjectURL(href), 4000);
        done("ok");
      })
      .catch((e) => done(e && e.code === "foto-fehlt" ? "foto-fehlt" : "fehler"));
  },
  "story.make": (fx, { dispatch, deps }) => {
    const env = envOf(deps);
    if (!env.document || !env.location) { dispatch({ type: "STORY_DONE", ok: false }); return; }
    sharePart(deps).then((P) => {
      const X = homeTexts(fx.lang), url = SL.shareUrl(absUrl(env, fx.inv.f), fx.inv, fx.at), lk = look(fx.inv.c, fx.lang);
      const cv = P.drawStory(env.document, { ...lk, url, cta: X.storyCta, headline: fx.inv.t || lk.title, bg: "#F9D84A" });
      cv.toBlob((blob) => {
        if (!blob) { dispatch({ type: "STORY_DONE", ok: false }); return; }
        const file = new env.File([blob], "my-daily-idea-story.png", { type: "image/png" }), nav = env.navigator;
        if (nav && nav.canShare && nav.canShare({ files: [file] })) nav.share({ files: [file] }).then(() => dispatch({ type: "STORY_DONE", ok: true }), () => dispatch({ type: "STORY_DONE", ok: true }));
        else {
          const a = env.document.createElement("a"), href = env.URL.createObjectURL(blob);
          a.href = href; a.download = "my-daily-idea-story.png"; env.document.body.appendChild(a); a.click(); a.remove();
          env.setTimeout(() => env.URL.revokeObjectURL(href), 4000);
          dispatch({ type: "STORY_DONE", ok: true });
        }
      }, "image/png");
    }).catch(() => dispatch({ type: "STORY_DONE", ok: false }));
  }
};
