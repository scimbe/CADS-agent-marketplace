// Effekte der Heimseite (ADR 0001 §g: fn(fx, {dispatch, state, api, deps})). Alles Browserspezifische kommt ueber
// deps.home herein (main.js: storage, fetch, document, navigator, location, setInterval) – keine Globals (A1).
// Ergebnisse gehen immer als Ereignis zurueck (HOME_LOADED, SHORT_DONE, SHORT_DELETED, STORY_DONE, WALL_SNAP).
import * as SL from "./shortlink.js";
import { partOf, isPartLoaded, loadFeatPart } from "../../gen/fparts.js";
import { familyOf, family, catalogIdOf } from "./families.js";
import { byId } from "./rotation.js";
import { manifestOf } from "../../cards/index.js";
import { homeTexts } from "./texts.js";
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
