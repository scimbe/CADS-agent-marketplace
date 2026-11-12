// Ansichten der freien Karte (Strang K): reine Funktion des Statechart-Zustands (gegen A2). Einhaengestellen fuer H
// (src/ui/home/slots.js): freiEntry, freiDeckShelf, freiView, kiButton. Je Zustand hoechstens eine Hauptaktion und drei
// Nebenaktionen (04-ux/disclosure). Texte: ./texts.js (Altcode-Schluessel unveraendert).
import { h } from "../../ui/dom.js";
import { machine } from "../../app/machine.js";
import { render } from "../../render/render.js";
import { rng } from "../../contract/sdk.js";
import { ft } from "./texts.js";
import { ARTS, GENRES, MODES, SOON, previewOf, targetOf, freiParams } from "./doc.js";
import { cardOf, modelFields } from "./chart.js";
import { crisis } from "../../broker/ai.js";

const kState = (state) => ["pruefen", "anonym", "anmelden", "angemeldet", "abmelden", "fehler"].find((s) => machine.matches(state, "konto." + s));
const a = (id, label, ev) => ({ id, label, ev: typeof ev === "string" ? { type: ev } : ev });
const status = (text, cls = "hint", key) => h("p", { class: cls, role: "status", key: key || "st" }, text);
const plainTitle = (s) => String(s || "").replace(/-\|(\p{Ll})/gu, "$1").replace(/-\|/g, "-").replace(/\|/g, " ").trim();
const date = (iso, lang) => { try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return String(iso); } };

/** Einstieg "Eigene Karte", immer sichtbar (Regal, Tagesblatt, Absichten). Offline: ehrlicher Hinweis. */
export function freiEntry(state, X, dispatch) {
  const L = state.ctx.lang, off = state.ctx.konto && state.ctx.konto.err === "netz";
  return h("div", { class: "frei-entry", key: "frei-entry" },
    h("button", { type: "button", class: "btn primary frei-tile", "data-act": "frei", on: { click: () => dispatch({ type: "FREI" }) } },
      h("span", { class: "sc-title" }, ft(L, "create_tile")), " ", h("span", { class: "sc-teaser" }, ft(L, "create_sub"))),
    off ? h("p", { class: "hint", role: "status" }, ft(L, "aiNet")) : null);
}
/** Community-Karten im Regal ("Von anderen"): nur geladene, gepruefte Karten; laden passiert in inhalt.frei.deck. */
export function freiDeckShelf(state, X, dispatch) {
  const L = state.ctx.lang, cards = state.ctx.frei.deck.cards;
  return h("section", { class: "frei-deckshelf", key: "frei-deck", "aria-labelledby": "fds-h" },
    h("h2", { class: "t-label", id: "fds-h" }, ft(L, "deck_title")),
    cards.length ? h("div", { class: "seg-row" }, cards.slice(0, 12).map((e) => h("button", { type: "button", class: "seg-opt", key: e.cid, "data-act": "deck-" + e.cid, on: { click: () => dispatch({ type: "DECK_OPEN", cid: e.cid }) } }, "✦ " + plainTitle(e.doc.t || e.doc.x || "")))) : null,
    h("button", { type: "button", class: "btn secondary", "data-act": "deck", on: { click: () => dispatch({ type: "DECK" }) } }, ft(L, "deck_open")));
}
/** Knopf "Mit KI" im Bearbeiten-Dialog, wenn der Teil x-model-Felder hat */
export function kiButton(state, X, dispatch, part) {
  const c = state.ctx.cardId && cardOf(state.ctx.cardId);
  if (!c || !modelFields(c.manifest, part).length) return null;
  return h("button", { type: "button", class: "btn secondary", "data-act": "ki", key: "ki", on: { click: () => dispatch({ type: "KI", part }) } }, "✨ " + ft(state.ctx.lang, "frei_ki_fill"));
}

function chips(id, label, items, value, onPick, sug, lang) {
  return h("div", { class: "seg", role: "group", "aria-labelledby": "lbl-" + id, key: id },
    h("p", { class: "seg-label", id: "lbl-" + id }, label),
    h("div", { class: "seg-row" }, items.map((it) => h("button", { type: "button", class: "seg-opt" + (!value && sug === it.value ? " sug" : ""), key: it.value, "data-v": it.value, "aria-pressed": it.value === value ? "true" : "false", disabled: it.off ? true : null, title: !value && sug === it.value ? ft(lang, "create_last") : null, on: { click: () => onPick(it.value) } }, it.label))));
}

/** Vorschau eines Server-Docs: freie Karte ueber den Renderer, sonst eine Zusammenfassung; immer mit KI-Badge. */
export function preview(doc, lang, key = "pv") {
  const pv = previewOf(doc);
  if (doc.k === "card" || doc.k === "photo") {
    const c = cardOf("frei"), params = freiParams(doc);
    const st = c.init({ rng: rng("preview"), params, players: 1 });
    return h("figure", { class: "stage frei-pv", key, tabindex: "-1", "aria-label": [pv.title, ...pv.lines, ft(lang, "kiBadgeL")].filter(Boolean).join(". ") }, render(c.view(c.observe(st, 0), 0, { lang, preview: true }), { onInput: () => {}, disabled: true, idp: key }));
  }
  const lines = pv.kind === "quiz" ? [ft(lang, "create_questions", { n: pv.n }), pv.lines[0]] : pv.kind === "lauf" ? [ft(lang, "create_lauf_" + pv.lines[0]), pv.lines[1]] : pv.kind === "faehigkeit" ? [pv.lines[0], ft(lang, "create_uses", { x: pv.uses })] : pv.lines;
  return h("figure", { class: "notice frei-pv", key, tabindex: "-1", role: "img", "aria-label": [pv.title, ...lines, ft(lang, "kiBadgeL")].filter(Boolean).join(". ") },
    h("h2", { class: "t-title", "aria-hidden": "true" }, pv.title),
    lines.filter(Boolean).map((l, i) => h("p", { key: "l" + i, "aria-hidden": "true" }, l)),
    h("p", { class: "badge", "aria-hidden": "true" }, ft(lang, "kiBadgeL")));
}

/** Satz fuer das Ergebnis einer Anfrage, die keine Karte brachte (Altcode stateText + notyet) */
export function refusalText(r, lang) {
  switch (r.how) {
    case "crisis": return ft(lang, "aiCrisis");
    case "blocked": return ft(lang, r.why === "crisis" ? "aiCrisis" : r.why === "kind_ok" ? "aiKind" : "aiBlocked");
    case "quota": return ft(lang, "aiQuota");
    case "busy": return r.position ? ft(lang, "aiBusyAt", { n: r.position }) : ft(lang, "aiBusy");
    case "paused": return ft(lang, "create_paused");
    case "age16": return ft(lang, "create_age16");
    case "age": return ft(lang, "create_lim_money18");
    case "modpause": return ft(lang, "mod_st_paused", { d: r.until ? date(r.until, lang) : "—" });
    case "karteoff": return ft(lang, "create_off");
    case "login": return ft(lang, "create_login_h", { m: 5 });
    case "bad": return ft(lang, "create_bad");
    case "nicht-hier": return ft(lang, "create_app");
    case "timeout": return ft(lang, "aiTimeout");
    case "notyet": {
      const n = r.notyet && typeof r.notyet.name === "string" ? r.notyet.name.slice(0, 30) : "";
      if (r.notyet && r.notyet.what === "genre" && GENRES.includes(n)) { const nm = (g) => ft(lang, "create_genre_" + g).replace(/^\S+\s/, ""); return ft(lang, "create_genre_ask", { a: nm(r.notyet.chosen), b: nm(n) }); }
      if (r.notyet && r.notyet.what === "game" && !n && !r.reason) return ft(lang, "create_notyet_spiel");
      if (r.notyet && r.notyet.what === "same") return ft(lang, "create_robot_same");
      const k = r.reason ? "create_absage_" + r.reason : "", why = k && ft(lang, k) !== "[" + k + "]" ? ft(lang, k) : "";
      if (why) return (/\.$/.test(why) ? why : ft(lang, "create_absage_n", { x: why })) + " " + ft(lang, "create_absage_0");
      return n ? ft(lang, r.notyet.what === "feature" ? "create_notyet_feature" : "create_notyet_game", { name: n }) : ft(lang, "create_notyet");
    }
    default: return ft(lang, "aiOff");
  }
}

function catalogButtons(ids, lang, dispatch, label) {
  const found = ids.map((id) => cardOf(id)).filter(Boolean);
  if (!found.length) return [h("p", { class: "hint", key: "cn" }, ft(lang, "create_notyet_none"))];
  return [h("p", { class: "hint", key: "cl" }, label), h("div", { class: "seg-row", key: "cb" }, found.map((c) => h("button", { type: "button", class: "seg-opt", key: c.manifest.id, "data-act": "catalog-" + c.manifest.id, on: { click: () => dispatch({ type: "CATALOG", id: c.manifest.id }) } }, "→ " + (c.manifest.title[lang] || c.manifest.title.de))))];
}

function potLine(k, lang) {
  if (!k) return "";
  const s = k.remaining > 0 ? ft(lang, "create_left", { n: k.remaining, m: k.size }) : ft(lang, "create_none", { m: k.size });
  return k.credit ? s + " " + ft(lang, k.credit === 1 ? "create_credit_1" : "create_credit", { n: k.credit }) : s;
}

function refusalBlock(ctx, lang, dispatch) {
  const r = ctx.frei.res; if (!r) return [];
  const out = [h("p", { class: r.how === "crisis" || (r.how === "blocked" && r.why === "crisis") ? "warn strong" : "warn", role: r.how === "crisis" || r.why === "crisis" ? "alert" : "status", key: "res", "data-how": r.how }, refusalText(r, lang))];
  if (r.how === "notyet" && r.notyet && r.notyet.what === "genre" && GENRES.includes(r.notyet.name)) {
    const nm = (g) => ft(lang, "create_genre_" + g).replace(/^\S+\s/, "");
    out.push(h("div", { class: "seg-row", key: "gq" },
      h("button", { type: "button", class: "btn secondary", "data-act": "genre-keep", on: { click: () => dispatch({ type: "RESEND", genre: r.notyet.chosen }) } }, ft(lang, "create_genre_keep", { a: nm(r.notyet.chosen) })),
      h("button", { type: "button", class: "btn secondary", "data-act": "genre-take", on: { click: () => dispatch({ type: "RESEND", genre: r.notyet.name }) } }, ft(lang, "create_genre_take", { b: nm(r.notyet.name) }))));
    return out;
  }
  if (r.how === "notyet") {
    // ein Gegenvorschlag, den es in diesem Stand nicht gibt (Katalogkarte fehlt), zaehlt nicht als Vorschlag
    const alt = r.alt && (r.alt.kind !== "katalog" || cardOf(String(r.alt.id))) ? r.alt : null;
    if (alt && alt.kind === "katalog" && cardOf(String(alt.id))) out.push(h("p", { class: "hint", key: "alt" }, ft(lang, "create_alt")), ...catalogButtons([String(alt.id)], lang, dispatch, ft(lang, "create_alt_open")));
    if (alt && alt.kind === "genre" && /^G\d{1,2}$/.test(alt.id) && typeof alt.satz === "string") {
      out.push(h("div", { class: "notice", key: "altg", role: "group", "aria-label": ft(lang, "create_alt") },
        h("p", { class: "hint" }, ft(lang, "create_alt")),
        h("label", { for: "frei-alt" }, ft(lang, "create_alt_edit")),
        h("textarea", { id: "frei-alt", class: "input", rows: "3", maxlength: "200", value: alt.satz.slice(0, 200) }),
        h("button", { type: "button", class: "btn secondary", "data-act": "alt-send", on: { click: () => { const t = document.getElementById("frei-alt").value; dispatch({ type: "ALT_SEND", text: t, crisis: crisis(t) }); } } }, ft(lang, "create_alt_send"))));
    }
    const cat = (r.catalog || []).filter((id) => !(alt && String(alt.id) === id));
    if (cat.length) out.push(...catalogButtons(cat, lang, dispatch, ft(lang, r.notyet && r.notyet.what === "feature" ? "create_notyet_similar" : "create_notyet_catalog")));
    else if (!alt) out.push(h("p", { class: "hint", key: "none" }, ft(lang, "create_notyet_none")));
  }
  return out;
}

function startView(state, dispatch) {
  const ctx = state.ctx, f = ctx.frei, lang = ctx.lang, ks = kState(state), k = ctx.konto.st ? ctx.konto.st.karte : null, body = [], panel = [];
  body.push(h("p", { class: "lede plain", key: "h" }, ft(lang, "create_h")));
  if (f.note === "settle-fail") body.push(status(ft(lang, "mod_fail"), "warn", "sf"));
  if (f.note === "cancelled") body.push(status(ft(lang, "create_wait_cancelled"), "hint strong", "nc"));
  if (f.note === "dropped") body.push(status(ft(lang, k && k.remaining === 0 && !k.credit ? "create_norefund" : "create_drop"), "hint", "nd"));
  if (ks === "pruefen" || ks === "anmelden" || ks === "abmelden") { body.push(status(ft(lang, "frei_status_wait"))); return { body, panel, gate: "wait" }; }
  if (ks === "fehler") { body.push(status(ft(lang, ctx.konto.err === "nicht-hier" ? "create_app" : "aiNet"), "warn")); return { body, panel, gate: ctx.konto.err === "nicht-hier" ? "here" : "retry" }; }
  if (ks === "anonym") {
    body.push(h("p", { class: "hint strong", key: "lh" }, ft(lang, "create_login_h", { m: 5 })));
    if (ctx.konto.st && ctx.konto.st.app && !ctx.konto.st.canLogin) { body.push(h("p", { class: "hint", key: "app" }, ft(lang, "create_app"))); return { body, panel, gate: "app" }; }
    body.push(h("label", { class: "check", key: "c16", for: "frei-16" },
      h("input", { type: "checkbox", id: "frei-16", checked: ctx.konto.age16, on: { change: (e) => dispatch({ type: "AGE16", on: e.target.checked }) } }), h("span", null, ft(lang, "create_16"))),
      h("p", { class: "warn", role: "alert", key: "n16" }, ctx.konto.need16 ? ft(lang, "create_need") : ""),
      h("p", { class: "hint", key: "free" }, ft(lang, "create_free")));
    return { body, panel, gate: "login" };
  }
  if (!k) { body.push(status(ft(lang, "frei_status_wait"))); return { body, panel, gate: "wait" }; }
  if (k.off) { body.push(status(ft(lang, "create_off"), "warn")); return { body, panel, gate: "off" }; }
  if (k.age16 !== true) { body.push(status(ft(lang, "create_age16"), "warn")); return { body, panel, gate: "age16" }; }
  // Formular
  panel.push(chips("art", ft(lang, "create_art"), ARTS.map((v) => ({ value: v, label: ft(lang, "create_art_" + v) })), f.art, (art) => dispatch({ type: "ART", art }), f.last.art, lang));
  if (f.art === "game") {
    panel.push(chips("genre", ft(lang, "create_genre"), GENRES.map((g) => ({ value: g, label: ft(lang, "create_genre_" + g) })), f.genre, (genre) => dispatch({ type: "GENRE", genre }), f.last.art === "game" ? f.last.genre : "", lang));
    panel.push(chips("soon", ft(lang, "create_soon"), SOON.map((x) => ({ value: x[0], label: ft(lang, "create_soon_" + x[0]) })), f.soon ? f.soon.id : "", (id) => dispatch({ type: "SOON_PICK", id }), "", lang));
    if (f.soon) {
      const name = ft(lang, "create_soon_" + f.soon.id).replace(/^\S+\s/, "");
      panel.push(status(ft(lang, "create_soon_no", { x: name }), "hint strong", "soonno"));
      if (typeof f.soon.near === "string") panel.push(h("button", { type: "button", class: "seg-opt", key: "soong", "data-act": "soon-genre", on: { click: () => dispatch({ type: "GENRE", genre: f.soon.near }) } }, "→ " + ft(lang, "create_genre_" + f.soon.near)));
      else if (f.soon.near.length) panel.push(...catalogButtons(f.soon.near, lang, dispatch, ft(lang, "create_soon_near")));
      else panel.push(h("p", { class: "hint", key: "soonn" }, ft(lang, "create_soon_nonear")));
    }
    if (f.genre) {
      const m = MODES[f.genre];
      panel.push(chips("mode", ft(lang, "create_mode"), ["allein", "bot", "duell"].map((v) => ({ value: v, label: ft(lang, "create_mode_" + v), off: !m[v] })), f.mode, (mode) => dispatch({ type: "PLAYMODE", mode }), "", lang));
      if (!m.bot) panel.push(h("p", { class: "hint", key: "mbot" }, ft(lang, "create_mode_bot_off")));
      if (f.mode === "duell") panel.push(h("p", { class: "hint", key: "md" }, ft(lang, "create_mode_duell_" + f.genre)));
      if (f.mode === "allein") panel.push(h("p", { class: "hint", key: "ma" }, ft(lang, "create_mode_allein_x")));
    }
  }
  const ready = !!f.art && (f.art !== "game" || !!f.genre);
  if (!ready) panel.push(h("p", { class: "hint", id: "frei-pick", key: "pick" }, ft(lang, f.art ? "create_pick_genre" : "create_pick")));
  panel.push(h("div", { class: "field", key: "txt" },
    h("label", { for: "frei-text" }, ft(lang, "create_label")),
    h("textarea", { id: "frei-text", class: "input", rows: "3", maxlength: "200", disabled: ready ? null : true, "aria-describedby": ready ? null : "frei-pick", placeholder: f.genre ? ft(lang, "create_ex_" + f.genre).split("|")[0] : ft(lang, "create_ph"), value: f.text, on: { input: (e) => dispatch({ type: "TEXT", value: e.target.value }) } })));
  if (ready) panel.push(h("div", { class: "seg-row", key: "ex" }, ft(lang, f.genre ? "create_ex_" + f.genre : f.art === "card" ? "create_ex" : "create_ex_" + f.art).split("|").map((s, i) => h("button", { type: "button", class: "seg-opt chip", key: "e" + i, on: { click: () => dispatch({ type: "EXAMPLE", value: s }) } }, s))));
  panel.push(h("p", { class: "meter", "aria-live": "polite", key: "left", "data-k": "frei-left" }, potLine(k, lang)));
  panel.push(h("p", { class: "hint", key: "rules" }, ft(lang, "create_rules")));
  panel.push(h("p", { class: "hint", key: "note" }, ft(lang, "aiNote")));
  if (k.remaining > 0) panel.push(h("p", { class: "hint", key: "drop" }, k.refundsLeft > 0 ? ft(lang, "create_drop_n", { n: k.refundsLeft }) : ft(lang, "create_drop_0")));
  else if (k.credit) panel.push(h("p", { class: "hint", key: "dropc" }, ft(lang, "create_drop_credit")));
  if (k.remaining <= 0 && k.voucher) panel.push(topup(ctx, lang, dispatch));
  if (k.paused) panel.push(status(ft(lang, "create_paused"), "warn", "pz"));
  body.push(...refusalBlock(ctx, lang, dispatch));
  const empty = k.remaining <= 0 && !k.credit;
  return { body, panel, gate: empty ? "empty" : k.paused ? "paused" : ready && [...f.text.trim()].length >= 3 ? "ready" : "form" };
}

function topup(ctx, lang, dispatch) {
  const r = ctx.konto.redeem;
  const msg = ctx.konto.redeeming ? "…" : r ? (r.ok ? ft(lang, "create_top_ok", { n: r.added }) : ft(lang, "create_top_" + (["unknown", "limit", "login"].includes(r.error) ? r.error : "off"))) : "";
  return h("form", { class: "topup", key: "topup", role: "group", "aria-labelledby": "ftop-h", on: { submit: (e) => { e.preventDefault(); dispatch({ type: "REDEEM" }); } } },
    h("h3", { class: "t-label", id: "ftop-h" }, ft(lang, "create_top_h")),
    h("label", { for: "frei-code" }, ft(lang, "create_top_code")),
    h("div", { class: "inline" },
      h("input", { id: "frei-code", class: "input", type: "text", maxlength: "64", autocomplete: "off", spellcheck: "false", autocapitalize: "characters", value: ctx.konto.voucher, on: { input: (e) => dispatch({ type: "VOUCHER_TEXT", value: e.target.value }) } }),
      h("button", { type: "submit", class: "btn secondary small", "data-act": "redeem", disabled: ctx.konto.redeeming ? true : null }, ft(lang, "create_top_go"))),
    h("p", { class: r && !r.ok ? "warn" : "hint strong", role: "status" }, msg),
    h("p", { class: "hint" }, ft(lang, "credit_note")));
}

const STEPS = ["send", "make", "check", "ready"];
function waitView(ctx, lang, text, fig) {
  const f = ctx.frei, step = f.phase === "line" ? "send" : f.phase || "send", at = STEPS.indexOf(step);
  const say = f.phase === "line" ? ft(lang, "create_wait_line", { n: f.place }) : f.phase === "make" ? ft(lang, "create_wait_make") : f.phase === "check" ? ft(lang, "create_wait_check") : ft(lang, "create_wait_send");
  return [h("div", { class: "notice frei-wait", key: "wait" },
    h("p", { class: "t-label" }, ft(lang, "create_wait_h")),
    h("p", { class: "t-title frei-q" }, (fig ? fig + " " : "") + text),
    h("ol", { class: "frei-steps seg-row", "aria-label": ft(lang, "create_wait_h") }, STEPS.map((s, i) => h("li", { key: s, class: "seg-opt" + (i === at ? " on" : ""), "aria-current": i === at ? "step" : null }, (i < at ? "✓ " : (i + 1) + " ") + ft(lang, "create_wait_s_" + s) + (s === "send" && f.phase === "line" ? " · " + ft(lang, "create_wait_place", { n: f.place }) : "")))),
    status(say, "hint strong", "say"))];
}

function noteLines(notes, lang, dispatch) {
  const out = [];
  for (const c of notes || []) {
    const m = /^(days|people|chars):(\d{1,3})$/.exec(c);
    if (c === "drinks") out.push(h("p", { class: "hint", key: c }, ft(lang, "create_drinks")));
    else if (m) out.push(h("p", { class: "hint", key: c }, ft(lang, "create_lim_" + m[1], { n: Number(m[2]) })));
    else if (["money18", "nosend", "async", "duel"].includes(c)) out.push(h("p", { class: "hint", key: c }, ft(lang, "create_lim_" + c)));
    else if (c === "engine:flug" || c === "engine:lauf") {
      const other = c === "engine:flug" ? "G2" : "G1";
      out.push(h("p", { class: "hint", key: c }, ft(lang, c === "engine:flug" ? "create_engine_flug" : "create_engine_lauf")),
        h("button", { type: "button", class: "seg-opt", key: c + "-to", "data-act": "engine-to", on: { click: () => dispatch({ type: "RESEND", genre: other }) } }, ft(lang, "create_engine_to", { b: ft(lang, "create_genre_" + other) })));
    }
  }
  return out;
}

const REASONS = ["harm", "sex", "hate", "private", "wrong", "other"];
const MOD_TY = { "card-hidden": "mod_hidden", "card-held": "mod_held", "card-removed": "mod_removed", strike: "mod_strike", pause: "mod_pause", ban: "mod_ban", lift: "mod_lift" };

/**
 * Ansicht eines Blatts inhalt.frei.* -> { body, panel, actions:{primary, secondary}, heading }
 */
export function freiView(state, X, dispatch, L) {
  const ctx = state.ctx, f = ctx.frei, lang = ctx.lang, leafName = L.slice("frei.".length);
  let body = [], panel = [], primary = null, secondary = [], heading = ft(lang, "create_title");
  const back = a("back", ft(lang, "frei_back"), "BACK");
  switch (leafName) {
    case "start": {
      const r = startView(state, dispatch);
      body = r.body; panel = r.panel;
      const extra = [a("mine", ft(lang, "frei_mine"), "MINE"), a("deck", ft(lang, "deck_open"), "DECK"), a("bild", ft(lang, "frei_bild"), "BILD")];
      if (r.gate === "login") primary = a("login", ft(lang, "create_login"), "LOGIN");
      else if (r.gate === "retry") primary = a("retry", ft(lang, "frei_retry"), "CHECK");
      else if (r.gate === "age16") primary = a("stil", X.stil, "STIL_GO");
      else if (r.gate === "ready" || r.gate === "form") primary = a("send", ft(lang, "create_go"), { type: "SEND", crisis: crisis(f.text) });
      secondary = r.gate === "login" || r.gate === "wait" || r.gate === "retry" || r.gate === "here" || r.gate === "app" ? [a("deck", ft(lang, "deck_open"), "DECK")] : extra;
      break;
    }
    case "warten":
      body = waitView(ctx, lang, [...String(f.text).trim()].slice(0, 200).join(""), f.art ? ft(lang, "create_art_" + f.art).split(" ")[0] : "✨");
      primary = a("cancel", ft(lang, "create_wait_cancel"), "CANCEL");
      break;
    case "vorschau": {
      const o = f.opt;
      body = [status(ft(lang, "create_wait_ready"), "hint strong", "rd"), preview(o.doc, lang), ...noteLines(o.note, lang, dispatch)];
      const t = targetOf(o.doc, cardOf);
      if (t.missing) panel.push(h("p", { class: "hint", key: "miss" }, ft(lang, "frei_missing", { x: t.missing })));
      primary = a("take", ft(lang, "create_take"), "TAKE");
      secondary = [a("drop", ft(lang, "create_drop"), "DROP"), a("refine", ft(lang, "create_robot_h"), "REFINE")];
      break;
    }
    case "fehlt":
      body = [h("div", { class: "notice", key: "f" }, h("p", { role: "status" }, ft(lang, "frei_missing", { x: f.missing || "?" })))];
      if (f.taken) body.push(preview(f.taken.doc, lang));
      primary = a("done", X.done, "DONE"); secondary = [back];
      break;
    case "robot": {
      const r = f.robot;
      heading = ft(lang, "create_robot_h");
      body = [h("p", { class: "lede plain", key: "rf" }, ft(lang, "frei_robot_from", { x: r ? r.title : "" }))];
      if (r && r.base) body.push(preview(r.base, lang, "rb"));
      if (r && !r.base && !r.from) body.push(status(ft(lang, "create_robot_no"), "warn"));
      panel.push(h("div", { class: "field", key: "rt" }, h("label", { for: "frei-robot" }, ft(lang, "create_robot_l")),
        h("textarea", { id: "frei-robot", class: "input", rows: "3", maxlength: "200", placeholder: ft(lang, "create_robot_ph"), value: f.text, on: { input: (e) => dispatch({ type: "TEXT", value: e.target.value }) } })));
      panel.push(...refusalBlock(ctx, lang, dispatch));
      primary = a("send", ft(lang, "create_robot_go"), { type: "SEND", crisis: crisis(f.text) });
      secondary = [a("back", ft(lang, "create_robot_close"), "BACK")];
      break;
    }
    case "gate": body = [status(ft(lang, "frei_gate_wait"))]; break;
    case "sharegate": body = [status(ft(lang, "frei_share_wait"))]; break;
    case "deck": {
      heading = ft(lang, "deck_title");
      body = [h("p", { class: "lede plain", key: "di" }, ft(lang, "deck_intro"))];
      const d = f.deck;
      if (d.load === "busy" && !d.cards.length) body.push(status(ft(lang, "frei_deck_load")));
      else if (d.load === "signatur" || d.load === "form") body.push(status(ft(lang, "frei_deck_sig"), "warn"));
      else if (d.load && d.load !== "ok" && d.load !== "busy" && d.load !== "aelter") body.push(status(ft(lang, d.load === "nicht-hier" ? "create_app" : "mod_fail"), "warn"));
      if (!d.cards.length && (d.load === "ok" || d.load === "aelter")) body.push(h("p", { class: "hint", key: "de" }, ft(lang, "deck_empty")));
      body.push(h("div", { class: "seg-row deck-list", key: "dl" }, d.cards.map((e) => h("button", { type: "button", class: "seg-opt", key: e.cid, "data-act": "deck-" + e.cid, on: { click: () => dispatch({ type: "DECK_OPEN", cid: e.cid }) } }, "✦ " + plainTitle(e.doc.t || e.doc.x || "")))));
      primary = a("back", ft(lang, "frei_back"), "BACK");
      if (d.load && d.load !== "ok" && d.load !== "busy") secondary = [a("again", ft(lang, "frei_retry"), "AGAIN")];
      break;
    }
    case "deckkarte": {
      heading = ft(lang, "deck_from");
      const e = f.card;
      body = [preview(e.doc, lang, "dk")];
      if (f.use === "login") body.push(h("p", { class: "hint", key: "ul" }, ft(lang, "deck_login")));
      if (f.use === "on") {
        panel.push(h("div", { class: "seg-row", key: "thumbs", role: "group", "aria-label": ft(lang, "deck_up") + " / " + ft(lang, "deck_down") },
          [[1, "👍", "deck_up"], [-1, "👎", "deck_down"]].map(([v, ic, key]) => h("button", { type: "button", class: "seg-opt", key: key, "data-act": "vote-" + v, "aria-label": ft(lang, key), "aria-pressed": f.vote && f.vote.v === v && f.vote.st === "ok" ? "true" : "false", disabled: f.vote && f.vote.st === "busy" ? true : null, on: { click: () => dispatch({ type: "VOTE", v }) } }, ic))));
        if (f.vote) panel.push(status(f.vote.st === "ok" ? ft(lang, "deck_thanks") : f.vote.st === "zu-frueh" ? ft(lang, "frei_vote_early") : f.vote.st === "busy" ? "…" : ft(lang, "mod_fail"), "hint", "vs"));
      }
      primary = a("play", ft(lang, "frei_take_deck"), "PLAY");
      secondary = [a("robot", ft(lang, "create_robot_h"), "ROBOT"), a("melden", ft(lang, "deck_report"), "MELDEN"), back];
      break;
    }
    case "meine": {
      heading = ft(lang, "deck_mine");
      const m = f.mine || {};
      if (m.load === "busy") body.push(status("…"));
      else if (m.load === "login") body.push(status(ft(lang, "deck_login"), "hint strong"));
      else if (m.load && m.load !== "ok") body.push(status(ft(lang, "mod_fail"), "warn"));
      if (m.load === "ok") {
        if (m.mod && m.mod.st === "paused") body.push(h("p", { class: "warn", key: "mp" }, ft(lang, "mod_st_paused", { d: ctx.mod.until ? date(ctx.mod.until, lang) : "—" })));
        if (m.mod && m.mod.st === "banned") body.push(h("p", { class: "warn", key: "mb" }, ft(lang, "mod_st_banned")));
        if (!m.cards.length) body.push(h("p", { class: "hint", key: "none" }, ft(lang, "deck_none")));
        body.push(h("ul", { class: "why", key: "mc" }, m.cards.map((c) => h("li", { key: c.cid }, ft(lang, "deck_card") + " " + c.cid.slice(0, 6) + " · " + ft(lang, "deck_st_" + c.st)))));
        if (m.credit) {
          body.push(h("p", { class: "meter strong", key: "cr" }, m.credit.balance === 1 ? ft(lang, "credit_line_one") : ft(lang, "credit_line", { n: m.credit.balance })));
          body.push(h("ul", { class: "why", key: "ci" }, m.credit.items.map((x, i) => h("li", { key: "i" + i }, ft(lang, "credit_r_" + x.reason) + " +" + x.n + (x.revoked ? " · " + ft(lang, "credit_revoked") : "")))));
          body.push(h("p", { class: "hint", key: "cn" }, ft(lang, "credit_note")));
        }
      }
      const ns = ctx.mod && ctx.mod.load === "ok" ? ctx.mod.notices : [];
      if (ns.length) {
        panel.push(h("h3", { class: "t-label", key: "mt" }, ft(lang, "mod_title")));
        for (const n of ns) {
          const can = !n.appeal && n.type !== "lift" && n.appealUntil && Date.parse(n.appealUntil) > Date.now();
          panel.push(h("div", { class: "notice", key: "n" + n.nid },
            h("h4", null, ft(lang, MOD_TY[n.type] || "mod_title") + " · " + date(n.at, lang)),
            h("p", null, [n.ground ? ft(lang, "mod_g_" + n.ground) : "", ft(lang, n.automated ? "mod_auto" : "mod_manual"), n.until ? ft(lang, "mod_until", { d: date(n.until, lang) }) : ""].filter((x) => x && !x.startsWith("[")).join(" ")),
            n.type !== "lift" ? h("p", { class: "hint" }, ft(lang, "mod_ground")) : null,
            n.appeal ? h("p", { class: "hint strong" }, ft(lang, "mod_a_" + n.appeal.state)) : can ? h("p", { class: "hint" }, ft(lang, "mod_appeal_until", { d: date(n.appealUntil, lang) }) + " " + ft(lang, "mod_court")) : null,
            can ? h("button", { type: "button", class: "btn secondary", "data-act": "appeal-" + n.nid, on: { click: () => dispatch({ type: "APPEAL", nid: n.nid }) } }, ft(lang, "mod_appeal")) : null));
        }
      }
      primary = back;
      if (m.load && m.load !== "ok" && m.load !== "busy") secondary = [a("again", ft(lang, "frei_retry"), "AGAIN")];
      break;
    }
    case "melden": {
      heading = ft(lang, "kiAsk");
      const r = f.report;
      body = [h("p", { key: "c" }, ft(lang, "kiConsent")),
        h("div", { class: "seg", role: "radiogroup", "aria-labelledby": "rw-l", key: "rw" }, h("p", { class: "seg-label", id: "rw-l" }, ft(lang, "kiWhy")),
          h("div", { class: "seg-row" }, REASONS.map((x) => h("button", { type: "button", role: "radio", class: "seg-opt", key: x, "data-v": x, "aria-checked": r.reason === x ? "true" : "false", disabled: r.sent === "ok" ? true : null, on: { click: () => dispatch({ type: "REASON", reason: x }) } }, ft(lang, "kiWhy_" + x)))))];
      if (r.sending) body.push(status("…"));
      if (r.sent) body.push(status(ft(lang, r.sent === "ok" ? "kiThanks" : "kiOffline"), r.sent === "ok" ? "hint strong" : "warn", "rs"));
      primary = r.sent === "ok" ? a("back", ft(lang, "kiClose"), "BACK") : a("report-send", ft(lang, "kiSend"), "REPORT_SEND");
      secondary = r.sent === "ok" ? [] : [a("back", ft(lang, "kiCancel"), "BACK")];
      break;
    }
    case "bild": case "bildwarten": {
      const b = f.bild, st = b.st;
      heading = ft(lang, "kb_title_" + b.use);
      if (leafName === "bildwarten") {
        const say = b.phase === "queued" ? (b.place ? ft(lang, "kb_s_line_n", { n: b.place }) : ft(lang, "kb_s_line")) : b.phase === "generating" ? ft(lang, "kb_s_make") : b.phase === "checking" ? ft(lang, "kb_s_test") : ft(lang, "kb_s_check");
        body = [h("p", { class: "t-title", key: "q" }, b.text), status(say, "hint strong")];
        primary = a("cancel", ft(lang, "kb_cancel"), "CANCEL");
        break;
      }
      if (!st) body.push(status(b.err ? ft(lang, "kb_offline") : "…", b.err ? "warn" : "hint"));
      else if (!st.login) body.push(status(ft(lang, "kb_login"), "hint strong"));
      else if (!st.on) body.push(status(ft(lang, "kb_off"), "warn"));
      else if (!st.age16) body.push(status(ft(lang, "kb_age16"), "warn"));
      if (st && st.login && st.on && st.age16) {
        panel.push(chips("buse", ft(lang, "kb_title_card").split(" ")[0], ["card", "logo", "avatar"].map((u) => ({ value: u, label: ft(lang, "kb_title_" + u) })), b.use, (use) => dispatch({ type: "BILD_USE", use }), "", lang));
        panel.push(h("div", { class: "field", key: "bt" }, h("label", { for: "frei-bild" }, ft(lang, "kb_ask")),
          h("input", { id: "frei-bild", class: "input", type: "text", maxlength: "200", placeholder: ft(lang, "kb_ph"), value: b.text, on: { input: (e) => dispatch({ type: "BILD_TEXT", value: e.target.value }) } })));
        panel.push(chips("bstyle", ft(lang, "kb_style"), ["foto", "comic", "aquarell", "pixel", "sticker"].map((s) => ({ value: s, label: ft(lang, "kb_st_" + s) })), b.style, (style) => dispatch({ type: "BILD_STYLE", style }), "", lang));
        panel.push(h("p", { class: "meter", key: "bp" }, b.use === "avatar" ? ft(lang, "kb_price_avatar", { n: st.credit }) : st.free.left > 0 ? ft(lang, "kb_price_free", { n: st.free.left }) : ft(lang, "kb_price_credit", { n: st.credit })));
        if (!st.can[b.use]) panel.push(status(ft(lang, st.why[b.use] === "credit" ? "kb_credit" : st.why[b.use] === "daily-cap" ? "kb_daycap" : "kb_quota"), "warn", "bw"));
        panel.push(h("p", { class: "hint", key: "bn" }, ft(lang, "kb_note")));
      }
      const res = b.res;
      if (res && res.how === "done") body.push(h("p", { class: "hint", key: "again" }, ft(lang, "kb_again_cost")));
      if (res && res.how === "done") body.push(h("figure", { class: "stage", key: "img" }, h("img", { src: res.dataUrl, alt: ft(lang, "kb_alt", { x: b.text }), class: "frei-img", width: "512", height: "512" })), b.kept ? status(ft(lang, "create_robot_kept"), "hint strong", "kept") : null);
      else if (res) {
        const K = { crisis: "aiCrisis", login: "kb_login", age16: "kb_age16", quota: "kb_quota", credit: "kb_credit", daily: "kb_daycap", paused: "kb_throttled", modpause: "kb_paused", blocked: "kb_blocked", refused: "kb_no_" + (["sexual", "minors", "hate", "gore", "violence", "weapons", "real_person", "brand", "drugs", "youth", "contact"].includes(res.reason) ? res.reason : "other"), failed: res.reason === "timeout" ? "kb_timeout" : res.reason === "unsafe" ? "kb_unsafe" : "kb_failed", gone: "create_wait_cancelled", kurz: "kb_ask", off: "kb_offline" };
        body.push(status(res.how === "busy" ? ft(lang, "kb_busy", { n: res.position || 1, s: res.etaS || "?", r: res.retryS || 10 }) : ft(lang, K[res.how] || "kb_offline"), res.how === "crisis" ? "warn strong" : "warn", "br"));
      }
      primary = res && res.how === "done" && !b.kept ? a("bild-take", ft(lang, "kb_take"), "BILD_TAKE") : st && st.login && st.on && st.age16 ? a("bild-go", res && res.how === "done" ? ft(lang, "kb_again") : ft(lang, "kb_make"), { type: "BILD_GO", crisis: crisis(b.text) }) : null;
      secondary = [back];
      break;
    }
    case "ki": {
      const k = f.ki;
      heading = ft(lang, "frei_ki_fill");
      if (k.res && k.res.how === "busy") body.push(status(ft(lang, "aiThinking") + " …"));
      else if (k.res && k.res.how !== "result") body.push(status(refusalText(k.res, lang), "warn"));
      if (k.opts.length) {
        body.push(h("p", { class: "hint", key: "kp" }, ft(lang, "frei_ki_pick")));
        body.push(h("div", { class: "seg-row", key: "ko", role: "group", "aria-label": ft(lang, "frei_ki_pick") }, k.opts.map((o, i) => h("button", { type: "button", class: "seg-opt", key: "o" + i, "data-act": "ki-" + i, on: { click: () => dispatch({ type: "KI_PICK", i }) } }, o))));
      }
      body.push(h("p", { class: "hint", key: "kn" }, ft(lang, "aiNote")));
      primary = a("back", ft(lang, "frei_back"), "BACK");
      secondary = k.res && k.res.how !== "busy" ? [a("ki-again", ft(lang, "frei_retry"), "KI_AGAIN")] : [];
      break;
    }
    default: break;
  }
  return { body, panel, actions: { primary, secondary: secondary.slice(0, 3) }, heading };
}
