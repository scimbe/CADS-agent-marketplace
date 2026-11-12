// Ansicht = reine Funktion des Statechart-Zustands (gegen A2). Was sichtbar ist, entscheidet nur matches()/ctx;
// CSS kennt nur Darstellung. Je Zustand hoechstens eine Hauptaktion, hoechstens drei Nebenaktionen (04-ux/disclosure).
import { h } from "./dom.js";
import { machine } from "../app/machine.js";
import { texts, fmt } from "../app/texts.js";
import { cardOf, ORDER, modesOf } from "../cards/index.js";
import * as G from "../app/game.js";
import * as S from "../contract/session.js";
import { render } from "../render/render.js";
import { LEVELS } from "../bot/ismcts.js";
import { stilView, stilActions } from "./stil-view.js";
import { homeView, dayPrimary, meinsButton } from "./home/views.js";
import { SLOTS } from "./home/slots.js";
import { ft } from "../features/frei/texts.js";   // Strang K: Texte fuer Robot/Melden in der Kartenansicht

export function leaf(state) {
  const l = state.config.filter((s) => s.startsWith("inhalt."));
  return l[l.length - 1].slice("inhalt.".length);
}
function seatName(card, lang, seat) { const s = card.manifest.seats; return s ? (s[lang] || s.de)[seat] : String(seat + 1); }
// Eigener Titel der Karte (params.title, Strang Z2) steht vor dem Manifesttitel; leer = Manifesttitel, kein Ersatztext
function title(card, lang, params) { const t = params && typeof params.title === "string" ? params.title.trim() : ""; return t || card.manifest.title[lang] || card.manifest.title.de; }

/** Aktionen je Zustand – Grundlage fuer Knoepfe und fuer den Disclosure-Test. */
export function actionsOf(state) {
  const ctx = state.ctx, X = texts(ctx.lang, ctx.pref && ctx.pref.easy), L = leaf(state);
  if (L.startsWith("stil.")) return stilActions(state, X, L);
  if (L.startsWith("frei.") && SLOTS.freiView) return SLOTS.freiView(state, X, () => {}, L).actions; // Strang K
  const a = (id, label, ev) => ({ id, label, ev: typeof ev === "string" ? { type: ev } : ev });
  // Ohne Teilen-Menue wird Kopieren die Hauptaktion (Kritikrunde 3); nach dem Kopieren: gesendet melden
  const send = (label) => (ctx.shareFailed && !ctx.copied ? a("copy", X.copyLink, "COPY") : ctx.copied ? null : a("share", label, "SHARE"));
  switch (L) {
    // Heimseite (Strang H): eine Hauptaktion = Hauptknopf des Kalenderblatts; alles andere ist Inhalt der Seite
    case "shelf": { const p = ctx.home.at === "day" ? dayPrimary(ctx) : null; return { primary: p ? a(p.id, p.label, p.ev) : null, secondary: [] }; }
    case "card.view": {
      const c = G.card(ctx), sec = [a("customize", X.customize, "CUSTOMIZE")];
      // Strang K: Robot (eigene Karte daraus) fuer jede Karte mit Adapter; Melden fuer eine freie Karte mit Siegel
      if (typeof c.toFree === "function") sec.push(a("robot", ft(ctx.lang, "create_robot_h"), "ROBOT"));
      if (ctx.cardId === "frei" && G.paramsOf(ctx).seal) sec.push(a("melden", ft(ctx.lang, "deck_report"), "MELDEN"));
      return { primary: a("go", c.manifest.mode === "static" ? X.goSend : X.go, "GO"), secondary: sec };
    }
    case "card.customize.bubbles": return { primary: a("done", X.done, "DONE"), secondary: [] };
    case "card.customize.dialog": return { primary: a("close", X.done, "CLOSE"), secondary: [] };
    case "card.share": return ctx.link && send(X.shareLink) ? { primary: send(X.shareLink), secondary: [a("done", X.done, "DONE")] } : { primary: a("done", X.done, "DONE"), secondary: [] };
    case "card.lobby":
      if (ctx.raum && ctx.raum.error) return { primary: a("again", X.again, "AGAIN"), secondary: [] };
      return { primary: ctx.raum && ctx.raum.inviteLink ? send(X.inviteSend) : null, secondary: [] };
    case "card.play.cover": return { primary: a("cover-ok", fmt(X.coverOk, { s: seatName(G.card(ctx), ctx.lang, G.gameStatus(ctx).turn) }), "COVER_OK"), secondary: [] };
    case "card.play.send": return send(X.shareLink) ? { primary: send(X.shareLink), secondary: [a("sent", X.sentAlready, "SENT")] } : { primary: a("sent", X.sentAlready, "SENT"), secondary: [] };
    case "card.play.over":
      if (ctx.mode === "link" && ctx.link && !ctx.sent && send(X.sendResult)) return { primary: send(X.sendResult), secondary: [a("again", X.again2, "AGAIN")] };
      return { primary: a("again", X.again2, "AGAIN"), secondary: [] };
    case "card.play.error": return { primary: a("back", X.back, "BACK"), secondary: [] };
    // Echtzeit (ADR 0001 b, Strang F): Spielen ist die Handlung; nach dem Ende Nochmal und Geist teilen
    case "card.rt.over":
      if (ctx.link && !ctx.sent && send(X.ghostSend)) return { primary: a("again", X.again2, "AGAIN"), secondary: [send(X.ghostSend)] };
      return { primary: a("again", X.again2, "AGAIN"), secondary: [] };
    case "card.rt.error": return { primary: a("back", X.back, "BACK"), secondary: [] };
    // Karten duerfen ihre Empfangs-Knoepfe benennen (manifest.receive {accept, decline}, z. B. Adventstuer "Eigenes Tuerchen machen" / "Weiter", alt door.js)
    case "receive.show": { const rc = ctx.incoming && ctx.incoming.kind === "card" && cardOf(ctx.incoming.cardId) && cardOf(ctx.incoming.cardId).manifest.receive;
      // receive.after: Knoepfe erst, wenn der Entwurfsschluessel true ist (Tuer erst aufklappen, alt door.js)
      if (rc && typeof rc.after === "string" && !(ctx.draft && ctx.draft[rc.after] === true)) return { primary: null, secondary: [] };
      if (rc && rc.accept && rc.decline) return { primary: a("accept", rc.accept[ctx.lang] || rc.accept.de, "ACCEPT"), secondary: [a("decline", rc.decline[ctx.lang] || rc.decline.de, "BACK")] };
      return { primary: a("accept", ctx.incoming && ctx.incoming.kind === "card" ? X.acceptCard : ctx.incoming && ctx.incoming.kind === "ghost" ? X.ghostFor : X.acceptGame, "ACCEPT"), secondary: [a("decline", X.decline, "BACK")] }; }
    case "receive.live": return { primary: a("accept", X.acceptGame, "ACCEPT"), secondary: [a("decline", X.decline, "BACK")] };
    case "receive.reject": return { primary: a("to-shelf", X.toShelf, "DONE"), secondary: [] };
    default: return { primary: null, secondary: [] }; // hand, turn (das Spiel selbst ist die Handlung), wait
  }
}

// Seitenverhaeltnis der Buehne aus der Anzeigeliste (frame.ratio, Strang P/F); ohne Angabe 3:4 wie bisher
function arOf(tree) { const m = tree && typeof tree.ratio === "string" && /^(\d{1,2}):(\d{1,2})$/.exec(tree.ratio); return m ? String(Number(m[1]) / Number(m[2])) : null; }
function stage(node, extra = {}, tree = null) { const ar = arOf(tree); return h("div", { class: "stage", id: "stage", ...extra, ...(ar ? { style: { "--ar": ar } } : {}) }, node); }

function radios(name, label, items, value, onPick) {
  const id = label ? "lbl-" + name : "dlg-title";
  return h("div", { class: "seg", role: "radiogroup", "aria-labelledby": id, key: name },
    label ? h("p", { class: "seg-label", id }, label) : null,
    h("div", { class: "seg-row" }, items.map((it) => h("button", { type: "button", role: "radio", class: "seg-opt", key: String(it.value), "aria-checked": it.value === value ? "true" : "false", on: { click: () => onPick(it.value) } }, it.label))));
}

// Der Link selbst ist Rueckfall: zugeklappt, ausser Teilen ging nicht (dann offen mit Hinweis)
function linkBox(X, link, ctx, dispatch, suffix = "") {
  // Rueckfall ohne Teilen-Menue: ein Knopf kopiert mit einem Tipp (Kritikrunde 2); markieren nur, wenn auch das scheitert
  const url = linkUrl(link), info = ctx.copied ? X.copied : ctx.copyFailed ? X.copyFail : ctx.shareFailed ? X.shareFail : null;
  return h("div", { class: "linkbox" },
    // Schluessel: kommt das Teilen-Ergebnis nach, bleibt das (evtl. aufgeklappte) Feld derselbe Knoten statt ersetzt zu werden
    info ? h("p", { class: "hint strong", role: "status", key: "info" }, info) : null,
    h("details", { class: "linkdetails", key: "details", open: ctx.copyFailed ? true : null },
      h("summary", null, X.shareTitle),
      h("input", { id: "linkfield" + suffix, class: "linkfield", type: "text", readonly: true, "aria-label": X.shareTitle, value: url, on: { focus: (e) => e.target.select() } })));
}
export function linkUrl(fragment) {
  const loc = typeof location !== "undefined" ? location : { href: "https://example.invalid/" };
  return loc.href.split("#")[0] + fragment;
}

function fieldControls(card, part, params, X, lang, dispatch) {
  const props = card.manifest.params.properties, shown = part.params.filter((k) => props[k]["x-hidden"] !== true), single = shown.length === 1;
  // Name eines Enum-Werts: x-names der Karte (je Sprache), sonst Host-Woerter, sonst der Wert; x-icons davor (Strang P)
  // beide Formen: x-names[wert][sprache] (P) und x-names[sprache][wert] (S, FIELD_VOCAB)
  const nameOf = (p, e) => {
    const xn = p["x-names"] || {}, byVal = xn[e], byLang = xn[lang] || xn.de, ic = p["x-icons"] && p["x-icons"][e];
    const t = (byVal && typeof byVal === "object" && (byVal[lang] || byVal.de)) || (byLang && typeof byLang === "object" && byLang[e]) || X.names[e] || e;
    return ic ? ic + " " + t : t;
  };
  return shown.map((key) => {
    const p = props[key], id = "f-" + key, v = params[key];
    // ein Feld je Blase: der Dialogtitel ist die Beschriftung (nichts doppelt)
    const label = single ? null : p["x-label"][lang] || p["x-label"].de;
    const set = (value) => dispatch({ type: "PARAM", key, value });
    switch (p["x-field"]) {
      case "text":
        return h("div", { class: "field", key },
          label ? h("label", { for: id }, label) : null,
          h(p.maxLength > 40 ? "textarea" : "input", { id, class: "input", "aria-labelledby": label ? null : "dlg-title", ...(p.maxLength > 40 ? { rows: "3" } : { type: "text" }), maxlength: String(p.maxLength), value: v, on: { input: (e) => set(e.target.value) } }));
      case "color": case "choice":
        // freie Farbe ohne Liste (#rrggbb, Strang L): Farbwaehler; sonst die Wahl aus der Liste
        if (!Array.isArray(p.enum)) return h("div", { class: "field", key }, label ? h("label", { for: id }, label) : null, h("input", { id, class: "input color", type: "color", "aria-labelledby": label ? null : "dlg-title", value: /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000", on: { input: (e) => set(e.target.value.toLowerCase()) } }));
        return h("div", { class: "field", key }, radios(key, label, p.enum.map((e) => ({ value: e, label: nameOf(p, e) })), v, set));
      case "number": {
        // benannte Stufen (x-steps, alt regler-ui.js): Schieber ueber die Stufen, Name als Wert; Zwischenwerte alter Links
        // bleiben, bis man schiebt (angezeigt wird die naechste Stufe)
        const st = p["x-steps"];
        if (st && Array.isArray(st.values) && st.values.length) {
          const names = (st.names && (st.names[lang] || st.names.de)) || st.values.map(String);
          let at = 0; st.values.forEach((x, i) => { if (Math.abs(x - v) < Math.abs(st.values[at] - v)) at = i; });
          return h("div", { class: "field", key }, label ? h("label", { for: id }, label) : null,
            h("input", { id, class: "input range", type: "range", min: "0", max: String(st.values.length - 1), step: "1", value: String(at), "aria-valuetext": names[at], "aria-labelledby": label ? null : "dlg-title", on: { input: (e) => set(st.values[Number(e.target.value)]) } }),
            h("p", { class: "hint strong", "aria-hidden": "true" }, names[at]));
        }
        // kleiner Bereich: Wahl als Knoepfe; grosser Bereich (Seed, Laenge, Chancen): Schieber mit Zahl, nie tausende Knoepfe
        if (p.maximum - p.minimum <= 12) {
          const items = []; for (let n = p.minimum; n <= p.maximum; n++) items.push({ value: n, label: String(n) });
          return h("div", { class: "field", key }, radios(key, label, items, v, set));
        }
        return h("div", { class: "field", key }, label ? h("label", { for: id }, label) : null,
          h("input", { id, class: "input", type: "number", inputmode: "numeric", min: String(p.minimum), max: String(p.maximum), step: String(p.multipleOf || 1), value: String(v), "aria-labelledby": label ? null : "dlg-title",
            on: { change: (e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= p.minimum && n <= p.maximum) set(n); } } }));
      }
      case "list": {
        const max = p.maxItems, lid = label ? "lbl-" + key : "dlg-title";
        return h("div", { class: "field", key, role: "group", "aria-labelledby": lid },
          label ? h("p", { class: "seg-label", id: lid }, label) : null,
          h("div", { class: "seg-row" }, p.items.enum.map((e) => {
            const on = v.includes(e), full = !on && v.length >= max;
            return h("button", { type: "button", class: "seg-opt chip", key: e, "aria-pressed": on ? "true" : "false", disabled: full || null, on: { click: () => set(on ? v.filter((x) => x !== e) : v.concat([e])) } }, nameOf(p.items, e));
          })),
          v.length >= max ? h("p", { class: "hint" }, fmt(X.maxReached, { n: max })) : null);
      }
      default: return null;
    }
  });
}

/**
 * @param state Zustand der Statechart
 * @param dispatch Ereignis senden
 * @returns vnodes [kopf, hauptbereich, dialogebene?]
 */
/**
 * @param env optionale Geraetedienste (main.js): { stage (src/render/rt-stage.js), random(n), clock(), audio, cardSvg, images }
 */
export function view(state, dispatch, env = {}) {
  const ctx = state.ctx, X = texts(ctx.lang, ctx.pref && ctx.pref.easy), L = leaf(state), m = (p) => machine.matches(state, p);
  const acts = actionsOf(state);
  const canBack = machine.send(state, { type: "BACK" }).consumed;
  const card = ctx.cardId ? cardOf(ctx.cardId) : null;
  const homeR = L === "shelf" ? homeView(state, dispatch) : null;
  const freiR = L.startsWith("frei.") && SLOTS.freiView ? SLOTS.freiView(state, X, dispatch, L) : null;
  const heading = homeR ? homeR.heading || X.app : freiR ? freiR.heading : L === "stil.start" ? X.stil : L === "stil.daten" ? X.k.data : L === "stil.widerspruch" ? X.k.appealTitle : card && !L.startsWith("receive") && L !== "shelf" ? title(card, ctx.lang, G.paramsOf(ctx)) : X.app;
  const btn = (act, cls) => h("button", { type: "button", class: "btn " + cls, key: act.id, "data-act": act.id, on: { click: () => dispatch(act.ev) } }, act.label);

  const head = h("header", { class: "bar", key: "bar" },
    canBack ? h("button", { type: "button", class: "icon", "aria-label": X.back, "data-act": "back", on: { click: () => dispatch({ type: "BACK" }) } }, "←") : h("span", { class: "icon-gap" }),
    h("h1", { class: "brand" + (homeR && !homeR.heading ? " home" : "") }, heading),
    m("raum.verbunden") ? h("span", { class: "badge", role: "status" }, X.connected)
      : L === "shelf" ? h("span", { class: "bar-end" }, meinsButton(state, dispatch), h("button", { type: "button", class: "icon me", "aria-label": X.stilOpen, title: X.stil, "data-act": "stil", on: { click: () => dispatch({ type: "STIL" }) } }, ctx.me.emoji))
        : h("span", { class: "icon-gap" }));

  let body = [], panel = [];
  const tree = card ? G.previewNode(card, G.paramsOf(ctx), ctx.lang, G.viewCtx(ctx)) : null;
  const preview = tree ? render(tree, { onInput: () => {}, disabled: true, idp: "pv", lang: ctx.lang, high: env.high, images: env.images, cardSvg: env.cardSvg }) : null;

  if (L.startsWith("stil.")) {
    const r = stilView(state, X, dispatch, L);
    body = r.body; panel = r.panel;
  } else if (freiR) {
    body = freiR.body; panel = freiR.panel || [];
  } else if (homeR) {
    body = homeR.body;
  } else if (L === "card.view") {
    const modes = modesOf(card), isStatic = card.manifest.mode === "static";
    body = [stage(preview, {}, tree)];
    panel.push(radios("mode", isStatic ? X.send : X.mode, modes.map((x) => ({ value: x, label: X.modes[x] })), ctx.mode, (mode) => dispatch({ type: "MODE", mode })));
    panel.push(h("p", { class: "hint", key: "mode-hint" }, X.modeHint[ctx.mode]));
    if (!isStatic && ctx.mode !== "alone" && card.manifest.players.max > 1) {
      const items = []; for (let s = 0; s < card.manifest.players.max; s++) items.push({ value: s, label: seatName(card, ctx.lang, s) });
      panel.push(radios("seat", X.seat, items, ctx.seat, (seat) => dispatch({ type: "SEAT", seat })));
    }
    if (ctx.mode === "bot") panel.push(radios("level", X.level, LEVELS.map((l, i) => ({ value: l.id, label: X.levels[i] })), ctx.level, (level) => dispatch({ type: "LEVEL", level })));
    if (ctx.mode === "live") panel.push(h("p", { class: "hint", key: "ip" }, X.ipHint));
    if (ctx.note) panel.push(h("p", { class: "note", role: "status", key: "note" }, String(ctx.note).startsWith("frei-") ? freiNote(ctx) : X.note[ctx.note]));
  } else if (L.startsWith("card.customize")) {
    body = [stage(preview, { class: "stage editing" }, tree), h("p", { class: "hint center" }, X.bubblesHint)];
  } else if (L === "card.share") {
    body = [stage(preview, {}, tree)];
    panel.push(ctx.link ? linkBox(X, ctx.link, ctx, dispatch) : h("p", { class: "warn", role: "alert" }, X.linkTooLong));
    if (ctx.note === "frei-remix") panel.push(h("p", { class: "note", role: "status", key: "remix" }, freiNote(ctx)));   // Strang K
  } else if (L === "card.lobby") {
    const r = ctx.raum || {};
    body = [h("div", { class: "notice" },
      h("h2", { class: "t-title" }, X.lobbyTitle),
      r.error ? h("p", { class: "warn", role: "alert" }, X.reasons[r.error] || X.reasons.verbindung) : h("p", { role: "status" }, r.step && r.step !== "open" ? X.steps[r.step] || X.lobbyWait : (r.inviteLink ? (ctx.copied || ctx.sent ? X.lobbyWait : X.lobbySend) : X.steps.open)),
      // Gruppe: ein Einladungslink je Gastsitz (ADR 0001 f, Stufe 2)
      r.invites && Object.keys(r.invites).length > 1 && !r.error
        ? Object.keys(r.invites).sort().map((seat) => h("div", { class: "invite", key: "inv-" + seat }, h("p", { class: "seat" }, fmt(X.yourTurnAs, { s: seatName(card, ctx.lang, Number(seat)) }).replace(/^[^:]*:?/, "") || seatName(card, ctx.lang, Number(seat)), (r.up || []).includes(Number(seat)) ? " ✓" : ""), linkBox(X, r.invites[seat], ctx, dispatch, "-" + seat)))
        : r.inviteLink && !r.error ? linkBox(X, r.inviteLink, ctx, dispatch) : null,
      h("p", { class: "hint" }, X.ipHint))];
  } else if (L.startsWith("card.play")) {
    const phase = L.slice("card.play.".length);
    if (phase === "hand") body = [h("div", { class: "notice" }, h("p", { role: "status" }, ctx.mode === "bot" ? X.hand.bot : X.hand.live))];
    else if (phase === "cover") {
      const s = seatName(card, ctx.lang, G.gameStatus(ctx).turn);
      body = [h("div", { class: "notice cover" }, h("h2", { class: "t-title" }, X.coverTitle), h("p", null, fmt(X.coverText, { s })))];
    } else if (phase === "error") {
      body = [h("div", { class: "notice" }, h("h2", { class: "t-title" }, X.errTitle), h("p", { class: "warn", role: "alert" }, X.reasons[ctx.error] || X.reasons["zug-ungueltig"]))];
    } else {
      const seat = ctx.viewer, st = G.gameStatus(ctx);
      const obs = S.observe(card, ctx.session, seat);
      const node = card.view(obs, seat, G.viewCtx(ctx));
      // Widget-Host (ADR 0001 c, Strang F): Entwurf, Aktionen, Geraetedienste
      const live = render(node, { onInput: (input) => dispatch({ type: "INPUT", input }), onDraft: (draft) => dispatch({ type: "DRAFT", draft }), onDraftPatch: (patch) => dispatch({ type: "DRAFT", patch }), high: env.high, onAction: (x) => dispatch({ type: "ACT", ...x }), onMemo: (memo) => dispatch({ type: "MEMO", memo }), onPrepare: (n) => dispatch({ type: "PREPARE", draft: n && n.draft !== undefined ? n.draft : undefined }), draft: ctx.draft, lang: ctx.lang, age18: G.viewCtx(ctx).age18, nick: G.viewCtx(ctx).nick, disabled: phase !== "turn", idp: "g", random: env.random, clock: env.clock, audio: env.audio, cardSvg: env.cardSvg, images: env.images, reduced: env.reduced });
      const lines = [];
      // Wer bin ich, wie weit (13 §6.4 Punkt 7): mit Zugnummer, wenn die Karte sie meldet (Zugvertrag v0.2 status.turnNo/turns)
      if (card.manifest.players.max > 1 && ctx.mode !== "alone") lines.push(h("p", { class: "seat", key: "seat" }, fmt(X.yourSeat, { s: seatName(card, ctx.lang, seat) }) + (Number.isInteger(st.turnNo) && Number.isInteger(st.turns) ? " · " + fmt(ctx.lang === "en" ? "Turn {n} of {m}" : "Zug {n} von {m}", { n: st.turnNo, m: st.turns }) : "")));
      if (phase === "wait") lines.push(h("p", { class: "status", role: "status", key: "st" }, ctx.mode === "bot" ? X.waitBot : ctx.mode === "link" ? X.waitLink : X.waitLive));
      if (phase === "send") lines.push(h("div", { class: "notice", key: "send" }, h("h2", { class: "t-title" }, X.sendTitle), h("p", null, X.sendText)));
      if (phase === "over") {
        const me = ctx.mode === "alone" ? -2 : seat;
        const wn = st.winner >= 0 ? seatName(card, ctx.lang, st.winner) : "";
        const res = st.winner === -1 ? X.overDraw : me === -2 ? fmt(X.overWinner, { s: wn }) : st.winner === me ? X.overWin : fmt(X.overLose, { s: wn });
        // Karten ohne Wertung (score leer, z. B. Partydeck, Raumkarten) zeigen ihr Ergebnis selbst: keine Sieger-/Unentschieden-Zeile
        if (!(Array.isArray(st.score) && st.score.length === 0)) lines.push(h("p", { class: "result", role: "status", key: "res" }, res));
        if (ctx.mode === "link" && ctx.link && !ctx.sent) lines.push(h("p", { class: "hint", key: "sr" }, X.sendResultText));
      }
      // beim Senden ist der andere dran: kein Spielfeld, nur die Bitte zu senden (Kritikrunde 1)
      body = phase === "send" ? lines : [...lines, stage(live, { class: "stage play" })];
      if ((phase === "send" || phase === "over") && ctx.link) panel.push(linkBox(X, ctx.link, ctx, dispatch));
    }
  } else if (L.startsWith("card.rt")) {
    // Echtzeitkarten: Buehne mit Canvas aus src/render/rt-stage.js (Strang F); ohne Buehne ehrlich „laeuft hier nicht“
    const lines = [];
    if (L === "card.rt.over" && ctx.rtResult && ctx.rtResult.status) {
      const st = ctx.rtResult.status, seat = ctx.viewer, say = typeof st.say === "string" ? st.say : st.say && typeof st.say === "object" ? st.say[ctx.lang] || st.say.de : "";
      // Solo-Partien (status.solo oder kein Gewinner) zeigen den Stand statt einer Gewinnerzeile (Anfrage L)
      if (st.solo || !Number.isInteger(st.winner)) lines.push(h("p", { class: "result", role: "status", key: "res" }, say || X.overAll));
      else { const wn = st.winner >= 0 ? seatName(card, ctx.lang, st.winner) : ""; lines.push(h("p", { class: "result", role: "status", key: "res" }, st.winner === -1 ? X.overDraw : ctx.mode === "alone" ? fmt(X.overWinner, { s: wn }) : st.winner === seat ? X.overWin : fmt(X.overLose, { s: wn }))); }
    }
    if (ctx.ghostOf) lines.push(h("p", { class: "hint", key: "gh" }, fmt(X.ghostScore, { s: ctx.ghostOf.sc.join(" : ") })));
    if (L === "card.rt.error") lines.push(h("div", { class: "notice", key: "err" }, h("h2", { class: "t-title" }, X.errTitle), h("p", { class: "warn", role: "alert" }, X.reasons[ctx.error] || X.reasons["zug-ungueltig"])));
    body = [...lines, env.stage ? env.stage.stageNode(L, dispatch, ctx.lang) : h("p", { class: "warn", role: "alert", key: "nohost" }, X.rtNoHost)];
    if (L === "card.rt.over" && ctx.link) panel.push(linkBox(X, ctx.link, ctx, dispatch));
  } else if (L === "receive.show") {
    const inc = ctx.incoming, c = cardOf(inc.cardId);
    if (inc.kind === "ghost") body = [h("div", { class: "notice" }, h("p", { class: "lede plain" }, X.ghostText), h("h2", { class: "t-title" }, title(c, ctx.lang)), h("p", null, fmt(X.ghostScore, { s: inc.score.join(" : ") })), h("p", { class: "hint" }, X.free))];
    else if (inc.kind === "card") body = [h("p", { class: "lede plain" }, X.acceptTitle), stage(render(G.previewNode(c, inc.params, ctx.lang, G.viewCtx(ctx, { receive: true })), { onInput: () => {}, onDraft: (draft) => dispatch({ type: "DRAFT", draft }), draft: ctx.draft, disabled: true, idp: "rx", lang: ctx.lang, high: env.high, images: env.images, cardSvg: env.cardSvg })), h("p", { class: "hint" }, X.free)];
    else {
      const st = S.status(c, inc.session), seat = inc.session.mine[0];
      body = [h("div", { class: "notice" },
        h("p", { class: "lede plain" }, st.over ? X.resultFor : X.challengeFor),
        h("h2", { class: "t-title" }, title(c, ctx.lang, inc.params)),
        st.over ? null : h("p", null, c.manifest.howto ? c.manifest.howto[ctx.lang] || c.manifest.howto.de : ""),
        st.over ? null : h("p", { class: "seat" }, fmt(X.yourTurnAs, { s: seatName(c, ctx.lang, seat) })),
        h("p", { class: "hint" }, X.free))];
    }
  } else if (L === "receive.reject") {
    body = [h("div", { class: "notice" }, h("h2", { class: "t-title" }, X.rejectTitle), h("p", { class: "warn", role: "alert", "data-reason": ctx.reason }, X.reasons[ctx.reason] || (ctx.reason === "frei-gesperrt" ? ft(ctx.lang, "deck_gone") : ctx.reason === "frei-ungeprueft" ? ft(ctx.lang, "deck_nocheck") : ctx.reason === "frei-geaendert" ? ft(ctx.lang, "frei_changed") : ctx.reason)), h("p", null, X.rejectAsk))];
  } else if (L === "receive.live" || L === "receive.wait") {
    const r = ctx.raum || {};
    body = [h("div", { class: "notice" }, h("h2", { class: "t-title" }, X.liveInvite),
      h("p", { role: "status" }, L === "receive.live" ? X.liveInviteText : (r.step ? X.steps[r.step] : X.steps.join)),
      h("p", { class: "hint" }, X.free),
      h("p", { class: "hint" }, X.ipHint))];
  }

  const actions = h("div", { class: "actions", key: "actions" },
    acts.primary ? btn(acts.primary, "primary") : null,
    acts.secondary.map((s) => btn(s, "secondary")));

  const main = h("main", { id: "main", class: "main s-" + L.replace(/\./g, "-") + (homeR ? " h-at-" + homeR.cls : "") + (L === "card.view" ? " sticky-actions" + (tree && tree.t === "frame" ? " fit-card" : "") : ""), key: "main", tabindex: "-1" },
    h("div", { class: "col-a", key: "a" }, body),
    h("div", { class: "col-b", key: "b" }, panel, L === "card.customize.dialog" || L === "shelf" ? null : actions));

  const out = [head, main];
  if (m("inhalt.card.customize")) out.push(bubbleLayer(card, ctx, X, dispatch));
  if (m("inhalt.card.customize.dialog")) out.push(dialogLayer(card, ctx, X, dispatch, acts, state));
  return out;
}

// Strang K: Hinweise zur freien Karte in der Kartenansicht (uebernommen, aus dem Deck, Teilen gesperrt)
function freiNote(ctx) {
  if (ctx.note === "frei-remix") return ft(ctx.lang, "frei_remix");
  if (ctx.note === "frei-own") return ft(ctx.lang, "create_robot_kept");
  if (ctx.note === "frei-deck") return ft(ctx.lang, "deck_from");
  if (ctx.note === "frei-share-no") return ft(ctx.lang, "frei_share_no", { x: ft(ctx.lang, "frei_st_" + (ctx.frei.share || "unknown")) });
  return "";
}

function bubbleLayer(card, ctx, X, dispatch) {
  const dialog = !!ctx.part && ctx.part !== null;
  return h("div", { class: "bubbles", key: "bubbles", "aria-hidden": null },
    card.manifest.parts.map((p) => {
      const label = p.label[ctx.lang] || p.label.de;
      return h("button", { type: "button", class: "bubble", key: p.id, "data-for": p.id, "aria-label": fmt(X.bubble, { p: label }), "aria-expanded": dialog && ctx.part === p.id ? "true" : "false", on: { click: () => dispatch({ type: "BUBBLE", part: p.id }) } }, label);
    }));
}

function dialogLayer(card, ctx, X, dispatch, acts, state) {
  const part = card.manifest.parts.find((p) => p.id === ctx.part);
  const label = part.label[ctx.lang] || part.label.de;
  return h("div", { class: "layer", key: "layer" },
    h("div", { class: "scrim", "aria-hidden": "true", on: { click: () => dispatch({ type: "CLOSE" }) } }),
    h("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "dlg-title", "data-part": ctx.part, id: "dialog" },
      h("div", { class: "dlg-head" },
        h("h2", { id: "dlg-title", class: "t-label" }, label),
        h("button", { type: "button", class: "icon", "aria-label": X.close, "data-act": "close-x", on: { click: () => dispatch({ type: "CLOSE" }) } }, "✕")),
      h("p", { class: "hint" }, X.dialogHint),
      fieldControls(card, part, G.paramsOf(ctx), X, ctx.lang, dispatch),
      // Strang K: "Mit KI" fuer Teile mit KI-faehigen Feldern (x-model); schliesst den Dialog vor dem KI-Ereignis
      SLOTS.kiButton ? SLOTS.kiButton({ ctx }, X, (ev) => { dispatch({ type: "CLOSE" }); dispatch(ev); }, ctx.part) : null,
      h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", "data-act": acts.primary.id, on: { click: () => dispatch(acts.primary.ev) } }, acts.primary.label))));
}
