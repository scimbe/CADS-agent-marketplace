// Feature "home" (ADR 0001 §g, Form aus src/app/features.js): Heimseite als Zustand inhalt.shelf. Navigation in der Heimseite ist erweiterter Zustand
// (ctx.home), damit Zurueck aus einer Karte genau dorthin fuehrt, wo man war (Regal, Familie, Meins), ohne History-Zustaende.
// Die Ansicht leitet alles aus ctx.home/ctx.mine ab (A2). Effekte (Speichern, Kurzlink, Story-Bild) gibt nur die Aktion aus.
import * as R from "./rotation.js";
import * as S from "./store.js";
import { understand } from "./intent.js";
import { cardOf } from "../../cards/index.js";
import { fragmentOf } from "./shortlink.js";
import * as G from "../../app/game.js";
import { effects } from "./effects.js";

export const AT = ["day", "family", "regal", "meins", "eigene"];
const RTABS = ["alles", "tage", "andere"], MTABS = ["wand", "einladungen", "gemerkt"];
export const MAX_OFF = 31;
const todayOf = (ev) => (Number.isFinite(ev.at) ? Math.floor(ev.at / R.DAY) : null);

export function homeContext() {
  return { home: { at: "day", off: 0, intent: null, text: "", res: null, rtab: "alles", fam: null, q: "", mtab: "wand", note: null }, today: null, mine: { wall: [], saved: [], invites: [], undo: null, loaded: false, busy: null } };
}
const H = (ctx, o) => ({ ...ctx, home: { ...ctx.home, ...o } });
const M = (ctx, o) => ({ ...ctx, mine: { ...ctx.mine, ...o } });
const day = (ctx, ev) => { const t = todayOf(ev); return t === null || t === ctx.today ? ctx : { ...ctx, today: t }; };
function saveFx(ctx, emit) { emit({ type: "home.save", data: { wall: ctx.mine.wall, saved: ctx.mine.saved, invites: ctx.mine.invites } }); }
// Konto verbunden: Profil als geaendert markieren, damit SAVE (Konto-Region) Wand und Gemerktes mitschickt
function dirty(ctx) { return ctx.profil && ctx.profil.via ? { ...ctx, profil: { ...ctx.profil, dirty: true } } : ctx; }
const persist = (ctx, emit) => { saveFx(ctx, emit); return dirty(ctx); };

export const guards = {
  homeDeep: (ctx) => ctx.home.at !== "day" || ctx.home.off !== 0 || !!ctx.home.note,
  homeLinked: (ctx) => !!(ctx.profil && ctx.profil.via)
};

export const actions = {
  homeInit: (ctx, ev, emit) => { if (ctx.mine.loaded || ctx.mine.loading) return ctx; emit({ type: "home.load" }); return M(ctx, { loading: true }); },
  homeGo: (ctx, ev) => {
    const to = AT.includes(ev.to) ? ev.to : "day";
    const o = { at: to, note: null };
    if (to === "family") { o.intent = ["gruss", "planen", "spielen", "stimme"].includes(ev.intent) ? ev.intent : null; o.res = ev.keepRes ? ctx.home.res : null; }
    if (to === "regal") { o.rtab = RTABS.includes(ev.rtab) ? ev.rtab : ctx.home.rtab; if (ev.fam !== undefined) o.fam = ev.fam; }
    if (to === "meins") o.mtab = MTABS.includes(ev.tab) ? ev.tab : ctx.home.mtab;
    if (to === "day") o.off = Number.isInteger(ev.off) ? Math.max(-MAX_OFF, Math.min(MAX_OFF, ev.off)) : 0;
    return H(day(ctx, ev), o);
  },
  homeBack: (ctx) => (ctx.home.note ? H(ctx, { note: null }) : ctx.home.at !== "day" ? H(ctx, { at: "day" }) : H(ctx, { off: 0 })),
  homeDay: (ctx, ev) => { const c = day(ctx, ev); const d = Number.isInteger(ev.d) ? ev.d : 0; return H(c, { off: Math.max(-MAX_OFF, Math.min(MAX_OFF, ev.to0 ? 0 : c.home.off + d)) }); },
  homeText: (ctx, ev) => H(ctx, { text: String(ev.text || "").slice(0, 200) }),
  homeUnderstand: (ctx, ev) => {
    const c = day(ctx, ev), text = c.home.text.trim();
    if (!text) return H(c, { note: "empty" });
    const r = understand(text, { date: new Date((c.today ?? todayOf(ev) ?? 0) * R.DAY), intent: ev.intent || undefined });
    const res = { text, intent: r.intent, name: r.name, who: r.who, missing: r.missing, top: r.top.map((t) => ({ id: t.idea.id, exact: t.exact })) };
    return H(c, { at: "family", intent: r.intent || null, res, note: null });
  },
  homeQuery: (ctx, ev) => H(day(ctx, ev), { q: String(ev.q || "").slice(0, 80), rtab: "alles" }),
  homeRtab: (ctx, ev) => H(ctx, { rtab: RTABS.includes(ev.tab) ? ev.tab : "alles" }),
  homeFam: (ctx, ev) => H(ctx, { fam: typeof ev.fam === "string" ? ev.fam : null }),
  homeMtab: (ctx, ev) => H(ctx, { mtab: MTABS.includes(ev.tab) ? ev.tab : "wand" }),
  homeLoaded: (ctx, ev) => {
    const d = ev.data || {};
    const c = M(day(ctx, ev), { wall: S.cleanWall(d.wall), saved: S.cleanSaved(d.saved), invites: S.cleanInvites(d.invites), loaded: true, loading: false });
    return c;
  },
  // Minutentakt: neuer Tag -> heute zeigt das neue Blatt (alt:app.js:372-380); abgelaufenes Rueckgaengig verschwindet
  homeTick: (ctx, ev) => {
    const c = day(ctx, ev);
    return c.mine.undo && Number.isFinite(ev.at) && ev.at - c.mine.undo.at >= S.UNDO_MS ? M(c, { undo: null }) : c;
  },
  merken: (ctx, ev, emit) => (typeof ev.id === "string" ? persist(M(ctx, { saved: S.toggleSaved(ctx.mine.saved, ev.id, ev.at) }), emit) : ctx),
  wallOff: (ctx, ev, emit) => { const r = S.takeOff(ctx.mine.wall, ev.i, ev.at); if (r.undo) emit({ type: "home.later", ms: S.UNDO_MS }); return persist(M(ctx, { wall: r.wall, undo: r.undo }), emit); },
  wallUndo: (ctx, ev, emit) => persist(M(ctx, { wall: S.undoOff(ctx.mine.wall, ctx.mine.undo, ev.at), undo: null }), emit),
  wallSnap: (ctx, ev, emit) => persist(M(ctx, { wall: S.setThumb(ctx.mine.wall, ev.id, ev.ts, ev.th) }), emit),
  // Jeder erzeugte Link ins Archiv; ein fertiges Werk (Karte verschickt) auf die Wand, wie alt bei "Fertig"
  homeArchive: (ctx, ev, emit) => {
    if (!ctx.link || !ctx.cardId) return ctx;
    const f = String(ctx.link).replace(/^#/, ""), card = cardOf(ctx.cardId), at = Number.isFinite(ev.at) ? ev.at : 1;
    const title = card ? card.manifest.title[ctx.lang] || card.manifest.title.de : ctx.cardId;
    if (ctx.mine.invites.some((x) => x.f === f)) return ctx;
    let c = M(ctx, { invites: S.archive(ctx.mine.invites, { f, c: ctx.cardId, t: title, at }) });
    if (card && card.manifest.mode === "static") {
      const params = G.paramsOf(ctx);
      if (params) {
        c = M(c, { wall: S.addWall(c.mine.wall, { id: ctx.cardId, ts: at, k: "card", f, p: params, t: title }) });
        emit({ type: "wall.snap", id: ctx.cardId, ts: at, params, lang: ctx.lang });
      }
    }
    if (fragmentOf(f)) emit({ type: "short.create", f, lang: ctx.lang });
    return persist(c, emit);
  },
  shortDone: (ctx, ev, emit) => persist(M(ctx, { invites: S.setShort(ctx.mine.invites, ev.f, ev.r && ev.r.ok ? ev.r.s : null) }), emit),
  invDelete: (ctx, ev, emit) => {
    const x = ctx.mine.invites.find((i) => i.f === ev.f);
    if (!x) return ctx;
    if (x.s) { emit({ type: "short.delete", f: x.f, s: x.s }); return M(ctx, { busy: x.f }); }
    return persist(M(ctx, { invites: S.dropInvite(ctx.mine.invites, ev.f) }), emit);
  },
  shortDeleted: (ctx, ev, emit) => (ev.ok ? persist(M(ctx, { invites: S.dropInvite(ctx.mine.invites, ev.f), busy: null }), emit) : H(M(ctx, { busy: null }), { note: "delFail" })),
  invShare: (ctx, ev, emit) => { const x = ctx.mine.invites.find((i) => i.f === ev.f); if (x) emit({ type: "home.share", inv: x, at: ev.at }); return ctx; },
  story: (ctx, ev, emit) => {
    const x = ctx.mine.invites.find((i) => i.f === ev.f);
    if (x) emit({ type: "story.make", inv: x, at: ev.at, lang: ctx.lang });
    return M(ctx, { busy: x ? "story" : null });
  },
  storyDone: (ctx, ev) => H(M(ctx, { busy: null }), { note: ev.ok ? "storyOk" : "storyFail" }),
  // Server-Profil (P1) kam: Wand und Gemerktes beider Seiten zusammenfuehren (neueste zuerst, ohne Doppelte)
  homeProfil: (ctx, ev, emit) => {
    const r = ev.result;
    if (!r || !r.ok || !r.profile || (ev.op !== "get" && ev.op !== "put")) return ctx;
    const m = S.mergeRemote(ctx.mine, r.profile);
    if (JSON.stringify(m.wall) === JSON.stringify(ctx.mine.wall) && JSON.stringify(m.saved) === JSON.stringify(ctx.mine.saved)) return ctx;
    const c = M(ctx, m); saveFx(c, emit); return c;
  },
  homeNoteClear: (ctx) => H(ctx, { note: null })
};

// Uebergaenge in inhalt.shelf (OPEN und STIL wie bisher)
export const shelfOn = {
  HOME: { actions: ["homeGo"] },
  DAY: { actions: ["homeDay"] },
  SENTENCE: { actions: ["homeText"] },
  UNDERSTAND: { actions: ["homeUnderstand"] },
  QUERY: { actions: ["homeQuery"] },
  RTAB: { actions: ["homeRtab"] },
  FAM: { actions: ["homeFam"] },
  MTAB: { actions: ["homeMtab"] },
  WALL_OFF: { actions: ["wallOff"] },
  WALL_UNDO: { actions: ["wallUndo"] },
  INV_DELETE: { actions: ["invDelete"] },
  INV_SHARE: { actions: ["invShare"] },
  STORY: { actions: ["story"] },
  NOTE_OK: { actions: ["homeNoteClear"] },
  BACK: { cond: "homeDeep", actions: ["homeBack"] }
};
// Ereignisse in jedem Inhalt-Zustand (Ergebnisse von Effekten, Merken aus der Kartenansicht, Profil)
export const inhaltOn = {
  HOME_LOADED: { actions: ["homeLoaded"] },
  HOME_TICK: { actions: ["homeTick"] },
  MERKEN: { actions: ["merken"] },
  WALL_SNAP: { actions: ["wallSnap"] },
  SHORT_DONE: { actions: ["shortDone"] },
  SHORT_DELETED: { actions: ["shortDeleted"] },
  STORY_DONE: { actions: ["storyDone"] },
  PROFIL: { actions: ["homeProfil"] }
};
// homeInit beim Betreten der Heimseite: beim ersten Mal Meins laden und den Minutentakt starten (Effekte des Anfangszustands
// fuehrt die Laufzeit aus)
export const entry = { "inhalt.shelf": ["homeInit"], "inhalt.card.share": ["homeArchive"], "inhalt.card.play.send": ["homeArchive"], "inhalt.card.play.over": ["homeArchive"] };

// Wand-Sync ueber das Profil (P1): was der Server von Meins bekommt (konto-chart put -> pack(me, remote, local))
export const profileLocal = (ctx) => (ctx.mine ? { wall: S.wallForServer(ctx.mine.wall), saved: ctx.mine.saved } : null);

export const home = { id: "home", shelfOn, on: { inhalt: inhaltOn }, entry, guards, actions, context: homeContext, effects, profileLocal };
