// Heimseite als reine Funktion von (ctx.home, ctx.mine, ctx.today): Abreisskalender, Absichten, Familienseite, Regal,
// Meins (Wand, Einladungen, Gemerkt), Eigene Karte. Kein Element liegt ueber einem anderen, keine sticky Leisten.
import { h } from "../dom.js";
import * as R from "./rotation.js";
import { bundesweit } from "./feiertage.js";
import { partOf } from "../../gen/fparts.js";
import { FAMILIES, INTENT_ORDER, familiesOf, family, familyOf, newIdOf, variantOf, extras, catalogIdOf } from "./families.js";
import { homeTexts, fmt } from "./texts.js";
import { ideaTile, extraTile, icon, regalIcon, ideaText, plateLines, duration, badge, art, thumbKey } from "./tile.js";
import { SLOTS } from "./slots.js";
import { inviteStatus, isSaved, UNDO_MS } from "./store.js";
import { cardOf, manifestOf, ORDER, modesOfId } from "../../cards/index.js";
import { playOf } from "../../contract/modes.js";
import { render } from "../../render/render.js";
import * as G from "../../app/game.js";

const INTENT_SHAPE = { gruss: "heart", planen: "ring", spielen: "bolt", stimme: "drop" };
const INTENT_FAM = { gruss: "gruessen", planen: "planen", spielen: "bluff", stimme: "kreativ" };

function dateParts(n, X) {
  const d = new Date(n * R.DAY);
  return { num: String(d.getUTCDate()).padStart(2, "0"), mon: X.months[d.getUTCMonth()], wd: X.days[d.getUTCDay()], key: R.dayKey(n), d };
}
function fmtDate(ms, lang) { const d = new Date(ms); return String(d.getUTCDate()).padStart(2, "0") + "." + String(d.getUTCMonth() + 1).padStart(2, "0") + "." + (lang === "en" ? d.getUTCFullYear() : d.getUTCFullYear()); }
function caps() { return R.WEB_CAPS; }

/** Was die Heimseite als Hauptaktion anbietet (fuer actionsOf und den Hauptknopf). */
export function dayPrimary(ctx) {
  if (ctx.today === null) return null;
  const X = homeTexts(ctx.lang, ctx.pref && ctx.pref.easy), idea = R.ideaOn(ctx.today + ctx.home.off, caps());
  if (!idea) return null;
  const nid = newIdOf(idea.id);
  if (nid) {
    const man = manifestOf(nid), v = variantOf(idea.id), vv = v ? { variant: v } : {}, isStatic = man.mode === "static";
    // Board Main -> Bote1: Spiele starten direkt (OPEN start, ein atomares Ereignis, Strang F); Karten oeffnen zum Gestalten
    const ev = isStatic ? { type: "OPEN", id: nid, ...vv } : { type: "OPEN", id: nid, ...vv, start: true };
    const p = { id: "day-go", label: X.go[isStatic ? "card" : idea.kind] || X.go.default, ev };
    const pr = isStatic ? null : practiceOf(nid, v);
    if (pr) p.practice = { id: "day-ueben", label: X.practice, sub: X.practiceSub[pr], ev: { type: "OPEN", id: nid, ...vv, mode: pr, start: true } };
    return p;
  }
  const on = isSaved(ctx.mine.saved, idea.id);
  return { id: "day-save", label: on ? X.soonSaved : X.soonSave, ev: { type: "MERKEN", id: idea.id }, pressed: on };
}

/** Uebungsweise einer Karte: gegen den Computer, sonst ein Geraet; keine, wenn es beides nicht gibt oder sie schon die
 *  Vorauswahl ist (dann waere "Erst ueben" dasselbe wie "Jetzt spielen"). Ohne geladene Karte aus den Metadaten. */
export function practiceOf(id, variant = null) {
  const modes = modesOfId(id, variant), m = manifestOf(id);
  if (!m) return null;
  const pr = modes.includes("bot") ? "bot" : modes.includes("alone") ? "alone" : null;
  const def = playOf({ manifest: m, bot: modes.includes("bot") ? true : undefined }, variant).default;
  return pr && pr !== def ? pr : null;
}

function freiEntry(state, X, dispatch, where) {
  if (SLOTS.freiEntry) return SLOTS.freiEntry(state, X, dispatch, where === "regal" ? { compact: true } : undefined);
  return h("button", { type: "button", class: "h-frei", key: "frei-" + where, "data-act": "frei", on: { click: () => dispatch({ type: "HOME", to: "eigene" }) } },
    icon("plus", "h-ico"), h("span", { class: "h-frei-t" }, h("span", { class: "h-frei-k" }, X.own.t), h("span", { class: "h-frei-s" }, X.own.s)));
}

function sheet(ctx, X, dispatch) {
  const n = ctx.today + ctx.home.off, idea = R.ideaOn(n, caps()), dp = dateParts(n, X), tx = ideaText(idea, ctx.lang);
  const fam = familyOf(idea.id) || family("gruessen"), nid = newIdOf(idea.id), hol = bundesweit(dp.key, ctx.lang);
  const title = plateLines(tx.t);
  let x0 = null;
  const swipe = {
    pointerdown: (e) => { x0 = e.clientX; },
    pointerup: (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) dispatch({ type: "DAY", d: dx < 0 ? 1 : -1 }); },
    pointercancel: () => { x0 = null; }
  };
  return h("section", { class: "h-cal", key: "cal", "aria-label": fmt(X.sheetLabel, { d: dp.num + ". " + dp.mon, t: title.join(" ") }) },
    h("div", { class: "h-leaf", key: "leaf-" + n, on: swipe },
      h("div", { class: "h-holes", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5, 6].map((i) => h("i", { key: String(i) }))),
      h("div", { class: "h-date" },
        h("span", { class: "h-dnum" }, dp.num),
        h("span", { class: "h-dmon" }, h("span", null, dp.mon), h("span", null, ctx.home.off === 0 ? X.todayIs.toUpperCase() : dp.wd)),
        h("span", { class: "h-star" }, h("span", null, badge(idea, X)), idea.min ? h("span", null, duration(idea.min, X)) : null)),
      hol ? h("p", { class: "h-hol" }, fmt(X.holiday, { n: hol })) : null,
      h("div", { class: "h-leaf-art" }, art(fam, nid ? thumbKey(nid, variantOf(idea.id)) : null, "", ctx.thumbs), h("span", { class: "h-fam fam-" + fam.id }, X.families[fam.id]), nid ? null : h("span", { class: "h-soon" }, X.soon),
        idea.door ? h("span", { class: "h-dur" }, fmt(X.door, { n: R.doorNumber(dp.d) })) : null),
      h("h2", { class: "h-stamp" }, title.map((l, i) => h("span", { key: String(i), class: "h-stamp-l" }, l))),
      // Teaser und Blaettern in einer Zeile wie im Design (Board Start): Pfeile mit sichtbarem "gestern/morgen"
      h("div", { class: "h-flip" },
        h("p", { class: "h-teaser" }, tx.s),
        h("nav", { class: "h-flipnav", "aria-label": X.swipe },
          h("button", { type: "button", class: "h-arrow", "data-act": "day-prev", "aria-label": X.prevDay, disabled: ctx.home.off <= -31 || null, on: { click: () => dispatch({ type: "DAY", d: -1 }) } }, h("span", { class: "h-arrow-i", "aria-hidden": "true" }, "‹"), h("span", { class: "h-arrow-t", "aria-hidden": "true" }, X.prevShort)),
          h("button", { type: "button", class: "h-arrow", "data-act": "day-next", "aria-label": X.nextDay, disabled: ctx.home.off >= 31 || null, on: { click: () => dispatch({ type: "DAY", d: 1 }) } }, h("span", { class: "h-arrow-i", "aria-hidden": "true" }, "›"), h("span", { class: "h-arrow-t", "aria-hidden": "true" }, X.nextShort)))),
      ctx.home.off !== 0 ? h("button", { type: "button", class: "h-today", "data-act": "day-today", on: { click: () => dispatch({ type: "DAY", to0: true }) } }, X.toToday) : null,
      nid ? null : h("p", { class: "h-soonline" }, X.soonLong)));
}

function primaryBtn(p, dispatch) {
  const main = h("button", { type: "button", class: "btn primary h-go", key: p.id, "data-act": p.id, "aria-pressed": p.pressed === undefined ? null : p.pressed ? "true" : "false", on: { click: () => dispatch(p.ev) } }, p.label);
  if (!p.practice) return main;
  // Board Main: "Jetzt spielen | Erst ueben" nebeneinander (2:1)
  const q = p.practice;
  return h("div", { class: "h-go-row", key: "go-row" }, main,
    h("button", { type: "button", class: "btn secondary h-ueben", key: q.id, "data-act": q.id, on: { click: () => dispatch(q.ev) } }, h("span", { class: "h-ueben-t" }, q.label), h("span", { class: "h-ueben-s" }, q.sub)));
}

function sentenceForm(ctx, X, dispatch) {
  return h("form", { class: "h-ask", key: "ask", on: { submit: (e) => { e.preventDefault(); dispatch({ type: "UNDERSTAND" }); } } },
    h("label", { class: "h-ask-q", for: "h-sentence" }, X.ask),
    h("div", { class: "h-field" },
      h("input", { id: "h-sentence", class: "h-input", type: "text", autocomplete: "off", maxlength: "200", placeholder: X.hint, value: ctx.home.text, "aria-describedby": "h-local", on: { input: (e) => dispatch({ type: "SENTENCE", text: e.target.value }) } }),
      h("button", { type: "submit", class: "h-field-go", "data-act": "understand" }, X.fieldGo)),
    h("p", { class: "h-local", id: "h-local" }, ctx.home.note === "empty" ? X.field : X.local));
}

function intents(state, X, dispatch) {
  return h("nav", { class: "h-intents", key: "intents", "aria-label": X.ask },
    INTENT_ORDER.map((k) => h("button", { type: "button", key: k, class: "h-intent fam-" + INTENT_FAM[k], "data-act": "intent-" + k, on: { click: () => dispatch({ type: "HOME", to: "family", intent: k }) } },
      icon(INTENT_SHAPE[k], "h-ico"), h("span", { class: "h-intent-t", lang: state.ctx.lang }, X.intentHead[k]), h("span", { class: "visually-hidden" }, ": " + X.intents[k].s))),
    // Gate C (D): an die Stelle von "Eigene Karte" (jetzt der grosse Block "Neu erfinden") tritt "Suchen"
    h("button", { type: "button", key: "suchen", class: "h-intent h-intent-such", "data-act": "intent-suchen", on: { click: () => dispatch({ type: "HOME", to: "family", intent: null, focus: "sentence" }) } },
      icon("lupe", "h-ico"), h("span", { class: "h-intent-t" }, X.searchShort), h("span", { class: "visually-hidden" }, ": " + X.search)),
    h("button", { type: "button", key: "alle", class: "h-intent h-intent-alle", "data-act": "intent-alle", on: { click: () => dispatch({ type: "HOME", to: "regal", rtab: "alles", fam: null }) } },
      icon("grid", "h-ico"), h("span", { class: "h-intent-t" }, X.all), h("span", { class: "visually-hidden" }, ": " + fmt(X.hits, { n: R.IDEAS.length }))));
}

function grid(items, cls = "") { return h("div", { class: "h-grid " + cls }, items); }
function section(title, kids, o = {}) {
  return h("section", { class: "h-sec", key: o.key || title, "aria-labelledby": o.id },
    h("h2", { class: "h-sec-h", id: o.id }, o.fam ? h("span", { class: "h-dot fam-" + o.fam, "aria-hidden": "true" }) : null, title, o.count !== undefined ? h("span", { class: "h-count" }, String(o.count)) : null), kids);
}

// Gate C (User, Masse und Texte von D, Canvas v52 ".erfinden"): "Neu erfinden" gross mit Satzfeld direkt unter dem Blatt und
// dem Hauptknopf. Aus dem Satz baut die freie Karte (Strang K) eine ganz neue Karte oder ein neues Spiel; der Satz geht beim
// Absenden mit FREI {text} an K (ohne K: Seite "Eigene Karte"). Das Feld ist nur Eingabe, kein Zustand in der Statechart.
function freiHero(state, X, dispatch) {
  const go = (text) => dispatch(SLOTS.freiEntry ? { type: "FREI", text } : { type: "HOME", to: "eigene" });
  return h("section", { class: "h-erf", key: "hero", "aria-labelledby": "h-erf-t" },
    h("h2", { class: "h-erf-t", id: "h-erf-t" }, h("span", { class: "h-erf-sym", "aria-hidden": "true" }, "✦"), X.hero.t),
    h("p", { class: "h-erf-s" }, X.hero.s),
    h("form", { class: "h-erf-form", on: { submit: (e) => { e.preventDefault(); const f = e.target.elements.namedItem("frei-satz"); go(f ? String(f.value || "").trim().slice(0, 300) : ""); } } },
      h("label", { class: "visually-hidden", for: "frei-satz" }, X.hero.label),
      h("textarea", { id: "frei-satz", name: "frei-satz", class: "h-erf-in", rows: "2", maxlength: "300", placeholder: X.hero.label }),
      h("div", { class: "h-erf-row" }, h("p", { class: "h-erf-n" }, X.hero.note),
        h("button", { type: "submit", class: "h-erf-go", "data-act": "frei" }, X.hero.go))));
}

// "Diese Woche im Kalender" (Board Desktop): die letzten 6 Blaetter als Kacheln; die ganze Historie steht im Regal (Letzte Tage)
function weekRow(ctx, X, dispatch) {
  const days = R.lastDays(new Date(ctx.today * R.DAY), 6, caps());
  const tiles = days.map((d) => ideaTile({ idea: d.idea, X, lang: ctx.lang, dispatch, saved: ctx.mine.saved, thumbs: ctx.thumbs, key: "w-" + d.key, extra: X.days[new Date(d.n * R.DAY).getUTCDay()].charAt(0) + X.days[new Date(d.n * R.DAY).getUTCDay()].slice(1).toLowerCase() }));
  return h("section", { class: "h-sec", key: "week", "aria-labelledby": "h-week" },
    h("div", { class: "h-sec-row" }, h("h2", { class: "h-sec-h", id: "h-week" }, X.week),
      h("button", { type: "button", class: "h-link", "data-act": "tab-tage-home", on: { click: () => dispatch({ type: "HOME", to: "regal", rtab: "tage" }) } }, X.lastDays + " ›")),
    grid(tiles, "h-week"));
}

function lastDaysRow(ctx, X, dispatch, n = 7) {
  const days = R.lastDays(new Date(ctx.today * R.DAY), n, caps());
  return section(X.lastDays, h("ol", { class: "h-days" }, days.map((d, i) => {
    const dp = dateParts(d.n, X), t = plateLines(ideaText(d.idea, ctx.lang).t).join(" "), fam = familyOf(d.idea.id) || family("gruessen");
    return h("li", { key: d.key }, h("button", { type: "button", class: "h-day", "data-act": "past-" + (i + 1), "aria-label": fmt(X.dayOf, { d: dp.num + ". " + dp.mon }) + ": " + t, on: { click: () => dispatch({ type: "HOME", to: "day", off: -(i + 1) }) } },
      h("span", { class: "h-day-d fam-" + fam.id }, dp.num), h("span", { class: "h-day-t" }, t), newIdOf(d.idea.id) ? null : h("span", { class: "h-soon small" }, X.soon)));
  })), { key: "last", id: "h-last" });
}

function dayView(state, X, dispatch) {
  const ctx = state.ctx;
  // Bis der Tag bekannt ist (erster Takt), wartet nur das Blatt; Satz, Absichten und "Eigene Karte" sind sofort da
  const known = ctx.today !== null, p = known ? dayPrimary(ctx) : null;
  return [
    h("div", { class: "h-top", key: "top" },
      // Raster wie Board Start/Desktop: Blatt | Hauptknopf | Satz, Absichten, Diese Woche (ab 900 px: Blatt links, rechts oben der Knopf)
      h("div", { class: "h-top-a" }, known ? sheet(ctx, X, dispatch) : h("p", { class: "h-wait", role: "status", key: "wait" }, "…")),
      p ? h("div", { class: "h-top-go" }, primaryBtn(p, dispatch), freiHero(state, X, dispatch)) : h("div", { class: "h-top-go" }, freiHero(state, X, dispatch)),
      // Board Start v52: Frage als Ueberschrift ueber den Absichten; der Satz-Weg liegt unter "Suchen" (Board Treffer)
      h("div", { class: "h-top-b" }, h("p", { class: "h-ask-q", key: "askq" }, X.ask), intents(state, X, dispatch), known ? weekRow(ctx, X, dispatch) : null))
  ];
}

function familyView(state, X, dispatch) {
  const ctx = state.ctx, res = ctx.home.res, intent = ctx.home.intent, out = [];
  // "Suchen" (Board Treffer): ein Satz -> passende Karten (alt Startbox); auch nach einem Satz bleibt das Feld zum Aendern da
  if (!intent) out.push(sentenceForm(ctx, X, dispatch));
  if (res) {
    const name = res.name || (res.who && res.who.call ? res.who[ctx.lang] || res.who.de : "");
    out.push(h("div", { class: "h-heard", key: "heard", role: "status" },
      h("p", { class: "h-heard-k" }, X.heard), h("p", { class: "h-heard-t" }, "„" + res.text + "“"),
      name ? h("p", null, fmt(X.forName, { n: name })) : null,
      res.missing ? h("p", { class: "h-miss" }, fmt(X.missing, { w: res.missing[ctx.lang] || res.missing.de })) : null,
      !res.top.length ? h("p", { class: "h-miss" }, X.none) : null));
    if (res.top.length) out.push(section(X.heard, grid(res.top.map((t) => ideaTile({ idea: R.byId(t.id), X, lang: ctx.lang, dispatch, saved: ctx.mine.saved, thumbs: ctx.thumbs, key: "t-" + t.id, extra: t.exact ? X.exact : X.near }))), { key: "top", id: "h-tophits" }));
  }
  if (!intent) { out.push(intents(state, X, dispatch)); return out; }
  for (const f of familiesOf(intent)) {
    const tiles = familyTiles(f, ctx, X, dispatch, f.id + "-");
    out.push(section(X.families[f.id], grid(tiles), { key: "f-" + f.id, id: "h-f-" + f.id, fam: f.id, count: tiles.length }));
  }
  return out;
}

// Kacheln einer Familie in Katalogreihenfolge; eine Variante mit eigener Karte (manifest.family = Traegerkarte, alt "to")
// steht direkt hinter ihrer Traegerkarte, sonst am Anfang (neue Karten)
function familyTiles(f, ctx, X, dispatch, kp) {
  const ext = extras().filter((x) => x.fam.id === f.id), out = [];
  const tileX = (x) => extraTile(x, X, ctx.lang, dispatch, ctx.mine.saved, true, ctx.thumbs);
  for (const x of ext) if (!f.ids.includes(x.manifest.family)) out.push(tileX(x));
  for (const id of f.ids) {
    const idea = R.byId(id); if (!idea) continue;
    out.push(ideaTile({ idea, X, lang: ctx.lang, dispatch, saved: ctx.mine.saved, thumbs: ctx.thumbs, key: kp + idea.id, noFam: true }));
    for (const x of ext) if (x.manifest.family === id) out.push(tileX(x));
  }
  return out;
}

function tabs(items, sel, dispatch, label) {
  return h("div", { class: "h-tabs", role: "tablist", "aria-label": label }, items.map((t) => h("button", { type: "button", role: "tab", key: t.id, id: "tab-" + t.id, "aria-selected": t.id === sel ? "true" : "false", "aria-controls": "panel-" + sel, "data-act": "tab-" + t.id, on: { click: () => dispatch(t.ev) } }, t.label)));
}

function regalView(state, X, dispatch) {
  const ctx = state.ctx, hm = ctx.home, out = [];
  out.push(h("div", { class: "h-search", key: "search", role: "search" },
    h("label", { class: "h-search-l", for: "h-q" }, X.search),
    h("input", { id: "h-q", class: "h-input", type: "search", autocomplete: "off", maxlength: "80", placeholder: X.searchPh, value: hm.q, on: { input: (e) => dispatch({ type: "QUERY", q: e.target.value }) } })));
  out.push(tabs(["alles", "tage", "andere"].map((id) => ({ id, label: X.tabs[id], ev: { type: "RTAB", tab: id } })), hm.rtab, dispatch, X.regal));
  const panel = [];
  if (hm.rtab === "alles") {
    if (hm.q.trim()) {
      const F = partOf("home-find"); // geladen vor QUERY (needParts)
      const hits = F ? F.searchIdeas(hm.q, new Date(ctx.today * R.DAY), X.bdg, caps()) : [];
      panel.push(h("p", { class: "h-hits", role: "status", key: "hits" }, hits.length ? fmt(X.hits, { n: hits.length }) : X.searchNone));
      panel.push(grid(hits.map((x) => ideaTile({ idea: x.idea, X, lang: ctx.lang, dispatch, saved: ctx.mine.saved, thumbs: ctx.thumbs, key: "s-" + x.idea.id, extra: x.date ? fmt(X.lastSeen, { d: fmtDate(x.date.getTime(), ctx.lang) }) : x.idea.on ? X.calendarOnly : "" }))));
    } else {
      panel.push(freiEntry(state, X, dispatch, "regal"));
      panel.push(h("div", { class: "h-chips", role: "group", "aria-label": X.regal, key: "chips" },
        [{ id: null, label: X.filterAll }].concat(FAMILIES.map((f) => ({ id: f.id, label: X.families[f.id] }))).map((c) =>
          h("button", { type: "button", key: String(c.id), class: "h-chip" + (c.id ? " fam-" + c.id : ""), "aria-pressed": hm.fam === c.id ? "true" : "false", "data-act": "fam-" + (c.id || "alle"), on: { click: () => dispatch({ type: "FAM", fam: c.id }) } }, c.label))));
      for (const f of FAMILIES.filter((x) => !hm.fam || x.id === hm.fam)) {
        const tiles = familyTiles(f, ctx, X, dispatch, "a-");
        panel.push(section(X.families[f.id], grid(tiles), { key: "rf-" + f.id, id: "h-rf-" + f.id, fam: f.id, count: tiles.length }));
      }
    }
  } else if (hm.rtab === "tage") {
    panel.push(lastDaysRow(ctx, X, dispatch, 31));
  } else {
    panel.push(SLOTS.freiDeckShelf ? SLOTS.freiDeckShelf(state, X, dispatch) : h("p", { class: "h-empty", key: "others" }, X.othersSoon));
  }
  out.push(h("div", { class: "h-panel", role: "tabpanel", id: "panel-" + hm.rtab, "aria-labelledby": "tab-" + hm.rtab, key: "panel-" + hm.rtab }, panel));
  return out;
}

function workPreview(entry, lang) {
  const card = cardOf(entry.id);
  if (card && entry.p) {
    try {
      return h("span", { class: "h-work-live" }, render(G.previewNode(card, entry.p, lang, { receive: true }), { onInput: () => {}, disabled: true, idp: "w" + entry.ts }));
    } catch (e) { /* Werk passt nicht mehr zur Karte: Bild, falls vorhanden */ }
  }
  if (entry.th) return h("img", { class: "h-work-img", src: entry.th, alt: "" });
  const fam = familyOf(catalogIdOf(entry.id)) || family("gruessen");
  return h("span", { class: "h-thumb" }, art(fam, null, ""));
}

function meinsView(state, X, dispatch) {
  const ctx = state.ctx, mine = ctx.mine, tab = ctx.home.mtab, out = [], linked = !!(ctx.profil && ctx.profil.via);
  out.push(tabs([
    { id: "wand", label: X.mtabs.wand + " " + mine.wall.length, ev: { type: "MTAB", tab: "wand" } },
    { id: "einladungen", label: X.mtabs.einladungen + " " + mine.invites.length, ev: { type: "MTAB", tab: "einladungen" } },
    { id: "gemerkt", label: X.mtabs.gemerkt + " " + mine.saved.length, ev: { type: "MTAB", tab: "gemerkt" } }
  ], tab, dispatch, X.meins));
  const panel = [h("p", { class: "h-sync", key: "sync" }, linked ? X.sync.on : X.sync.off)];
  const note = ctx.home.note;
  if (note === "storyOk" || note === "storyFail" || note === "delFail") panel.push(h("p", { class: "h-note", role: "status", key: "note" }, note === "storyOk" ? X.storyDone : note === "storyFail" ? X.storyFail : X.invDeleteFail));
  if (tab === "wand") {
    if (mine.undo) panel.push(h("div", { class: "h-undo", role: "status", key: "undo" }, h("span", null, X.wallGone), h("button", { type: "button", class: "btn secondary h-undo-b", "data-act": "wall-undo", on: { click: () => dispatch({ type: "WALL_UNDO" }) } }, "↶ " + X.undo)));
    if (!mine.wall.length) panel.push(h("p", { class: "h-empty", key: "empty" }, X.wallEmpty));
    // Board Meins: 2er-Kacheln, Name mit ⋯ (Weiter bauen, Von der Wand nehmen), darunter Datum
    else panel.push(h("ul", { class: "h-wall", key: "wall" }, mine.wall.map((e, i) => {
      const nid = manifestOf(e.id) ? e.id : null, k = String(e.ts), open = ctx.home.menu === k, t = e.t || e.id;
      return h("li", { key: e.id + e.ts, class: "h-work" },
        h("div", { class: "h-work-pic" }, workPreview(e, ctx.lang)),
        h("div", { class: "h-work-head" }, h("p", { class: "h-work-t" }, t),
          h("button", { type: "button", class: "h-more", "data-act": "wall-more-" + i, "aria-expanded": open ? "true" : "false", "aria-controls": "wm-" + i, "aria-label": fmt(X.more, { t }), on: { click: () => dispatch({ type: "WMENU", k }) } }, "⋯")),
        h("p", { class: "h-work-d" }, fmtDate(e.ts, ctx.lang)),
        open ? h("div", { class: "h-work-acts", id: "wm-" + i, key: "menu" },
          nid ? h("button", { type: "button", class: "btn secondary h-small", "data-act": "wall-open-" + i, on: { click: () => dispatch({ type: "OPEN", id: nid }) } }, X.openAgain) : null,
          h("button", { type: "button", class: "btn secondary h-small", "data-act": "wall-off-" + i, on: { click: () => dispatch({ type: "WALL_OFF", i }) } }, "✕ " + X.takeOff)) : null);
    })));
  } else if (tab === "einladungen") {
    if (!mine.invites.length) panel.push(h("p", { class: "h-empty", key: "empty" }, X.invEmpty));
    else panel.push(h("ul", { class: "h-invs", key: "invs" }, mine.invites.map((x, i) => {
      const st = inviteStatus(x, (ctx.today ?? 0) * R.DAY + R.DAY / 2), fam = familyOf(catalogIdOf(x.c)) || family("gruessen");
      const label = st.k === "bis" ? fmt(X.inv.bis, { d: fmtDate(st.exp, ctx.lang) }) : st.k === "offen" ? fmt(X.inv.offen, { d: fmtDate(x.ts, ctx.lang) }) : X.inv[st.k];
      return h("li", { key: x.f, class: "h-inv" },
        h("span", { class: "h-inv-pic fam-" + fam.id, "aria-hidden": "true" }, icon(fam.shape, "h-ico")),
        h("div", { class: "h-inv-txt" }, h("p", { class: "h-inv-t" }, x.t || x.c), h("p", { class: "h-inv-st st-" + st.k }, label)),
        h("div", { class: "h-inv-acts" },
          h("button", { type: "button", class: "btn secondary h-small", "data-act": "inv-share-" + i, on: { click: () => dispatch({ type: "INV_SHARE", f: x.f }) } }, X.invShare),
          h("button", { type: "button", class: "btn secondary h-small", "data-act": "inv-story-" + i, disabled: mine.busy === "story" || null, on: { click: () => dispatch({ type: "STORY", f: x.f }) } }, X.invStory),
          h("button", { type: "button", class: "btn secondary h-small h-danger", "data-act": "inv-del-" + i, disabled: mine.busy === x.f || null, on: { click: () => dispatch({ type: "INV_DELETE", f: x.f }) } }, ctx.home.sure === x.f ? X.invSure : X.invDelete)));
    })));
  } else {
    if (!mine.saved.length) panel.push(h("p", { class: "h-empty", key: "empty" }, X.savedEmpty));
    else panel.push(grid(mine.saved.map((s) => {
      const idea = R.byId(catalogIdOf(s.id));
      if (idea && R.IDEAS.includes(idea)) return ideaTile({ idea, X, lang: ctx.lang, dispatch, saved: mine.saved, thumbs: ctx.thumbs, key: "g-" + s.id });
      const x = extras().find((e) => e.id === s.id);
      return x ? extraTile(x, X, ctx.lang, dispatch, mine.saved, false, ctx.thumbs) : null;
    }).filter(Boolean)));
  }
  out.push(h("div", { class: "h-panel", role: "tabpanel", id: "panel-" + tab, "aria-labelledby": "tab-" + tab, key: "panel-" + tab }, panel));
  return out;
}

function eigeneView(state, X, dispatch) {
  const ctx = state.ctx, out = [];
  if (SLOTS.freiEntry) out.push(SLOTS.freiEntry(state, X, dispatch));
  else out.push(h("p", { class: "h-empty", key: "soon" }, X.own.soon));
  const blank = Object.keys(ORDER.reduce((a, id) => (manifestOf(id).mode === "static" ? { ...a, [id]: 1 } : a), {}));
  if (blank.length) out.push(section(X.own.blank, grid(blank.map((id) => {
    const idea = R.byId(catalogIdOf(id));
    return idea && R.IDEAS.includes(idea) ? ideaTile({ idea, X, lang: ctx.lang, dispatch, saved: ctx.mine.saved, thumbs: ctx.thumbs, key: "e-" + id }) : extraTile(extras().find((e) => e.id === id) || { id, fam: family("gruessen"), manifest: manifestOf(id) }, X, ctx.lang, dispatch, ctx.mine.saved, false, ctx.thumbs);
  })), { key: "blank", id: "h-blank" }));
  return out;
}

/** -> { heading, body, cls } */
export function homeView(state, dispatch) {
  const ctx = state.ctx, X = homeTexts(ctx.lang, ctx.pref && ctx.pref.easy), at = ctx.home.at;
  if (at === "family") return { heading: ctx.home.intent ? X.intentHead[ctx.home.intent] : X.searchShort, body: familyView(state, X, dispatch), cls: "family" };
  if (at === "regal") return { heading: X.all, body: regalView(state, X, dispatch), cls: "regal" };
  if (at === "meins") return { heading: X.meins, body: meinsView(state, X, dispatch), cls: "meins" };
  if (at === "eigene") return { heading: X.own.page, body: eigeneView(state, X, dispatch), cls: "eigene" };
  return { heading: null, body: dayView(state, X, dispatch), cls: "day" };
}
/** Knopf "Meins" fuer die Kopfzeile (neben Mein Stil). */
export function meinsButton(state, dispatch) {
  const ctx = state.ctx, X = homeTexts(ctx.lang, ctx.pref && ctx.pref.easy), n = ctx.mine.wall.length + ctx.mine.invites.length + ctx.mine.saved.length;
  // Gate C: "Mein Regal" mit Symbol und sichtbarem Namen (Board Start: beschriftete Kopfknoepfe)
  return h("button", { type: "button", class: "h-headbtn h-meins", key: "meins", "aria-label": X.meinsOpen + (n ? " (" + n + ")" : ""), "data-act": "meins", on: { click: () => dispatch({ type: "HOME", to: "meins" }) } },
    h("span", { class: "h-headbtn-i", "aria-hidden": "true" }, regalIcon(), n ? h("span", { class: "h-meins-n" }, String(n)) : null), h("span", { class: "h-headbtn-t", "aria-hidden": "true" }, X.meins));
}
/** Kopfknopf "Schrift" (AA, Board Start): fuehrt zu Mein Stil, wo Schriftgroesse und Einfache Sprache stehen (Fenster folgt mit PR 4). */
export function schriftButton(state, dispatch) {
  const X = homeTexts(state.ctx.lang, state.ctx.pref && state.ctx.pref.easy);
  return h("button", { type: "button", class: "h-headbtn", key: "schrift", "aria-label": X.schriftOpen, "data-act": "schrift", on: { click: () => dispatch({ type: "STIL" }) } },
    h("span", { class: "h-headbtn-i h-aa", "aria-hidden": "true" }, "A", h("span", null, "A")), h("span", { class: "h-headbtn-t", "aria-hidden": "true" }, X.schrift));
}
export { UNDO_MS };

// Bild teilen (Entscheidung Integrator, "Foto mitschicken"): Eine Karte bietet in ihrer Anzeigeliste
// {t:"action", act:"share-image", label, name, of:<id des canvas-Knotens>} an (nur mit gewaehltem lokalem Foto).
// Das Teilen-Blatt zeigt dafuer einen Knopf; gezeichnet wird ueber den Geraetedienst cardImage (P), geteilt ueber das System.
function findNode(n, pred) { if (!n || typeof n !== "object") return null; if (pred(n)) return n; for (const k of ["children", "items", "layers"]) for (const c of Array.isArray(n[k]) ? n[k] : []) { const r = findNode(c, pred); if (r) return r; } return null; }
export function shareImageOffer(tree) {
  const a = findNode(tree, (n) => n.t === "action" && n.act === "share-image");
  if (!a) return null;
  const node = findNode(tree, (n) => n.t === "canvas" && (a.of ? n.id === a.of : true));
  const name = typeof a.name === "string" && /^[a-z0-9-]{1,60}\.png$/.test(a.name) ? a.name : "my-daily-idea.png";
  return node ? { label: a.label, name, node } : null;
}
export function shareImageBox(tree, ctx, dispatch) {
  const o = shareImageOffer(tree);
  if (!o) return null;
  const X = homeTexts(ctx.lang), st = ctx.home && ctx.home.img, label = o.label && typeof o.label === "object" ? o.label[ctx.lang] || o.label.de : String(o.label || "");
  return h("div", { class: "h-imgshare", key: "imgshare" },
    h("button", { type: "button", class: "btn secondary", "data-act": "share-image", disabled: st === "busy" || null, on: { click: () => dispatch({ type: "SHARE_IMAGE", name: o.name, node: o.node }) } }, st === "busy" ? X.imgBusy : label.slice(0, 60)),
    st && st !== "busy" && st !== "ok" ? h("p", { class: "warn", role: "alert" }, X.imgErr[st] || X.imgErr.fehler) : null,
    h("p", { class: "hint" }, X.imgNote));
}
