// Ansicht „Mein Stil“, „Konto & Daten“ und „Widerspruch“: reine Funktion des Zustands (gegen A2). Was angeboten wird,
// folgt der Konto-Region (pruefen/anonym/anmelden/angemeldet/abmelden/fehler) und dem, was der Server gemeldet hat.
import { h } from "./dom.js";
import { machine } from "../app/machine.js";
import { fmt } from "../app/texts.js";
import { PAIRS, EMOJI, SETS, FONT, fmtCode } from "../app/konto.js";

const kState = (state) => ["pruefen", "anonym", "anmelden", "angemeldet", "abmelden", "fehler"].find((s) => machine.matches(state, "konto." + s));
const date = (iso, lang) => { try { return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return iso; } };
const time = (t, lang) => { try { return new Date(t).toLocaleTimeString(lang === "en" ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
// Schriftfarbe auf der eigenen Hintergrundfarbe: die mit dem hoeheren Kontrast (WCAG relative Leuchtdichte)
function ink(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#111111" : "#ffffff";
}
const name = (me, X) => ((me.emoji || "") + " " + (me.nick || X.k.noName)).trim();

/** Aktionen je Zustand (Hauptaktion + hoechstens drei Nebenaktionen), Grundlage fuer Knoepfe und Disclosure-Test. */
export function stilActions(state, X, L) {
  const ctx = state.ctx, K = X.k, ks = kState(state), p = ctx.profil;
  const a = (id, label, ev) => ({ id, label, ev: typeof ev === "string" ? { type: ev } : ev });
  if (L === "stil.start") {
    const daten = a("daten", K.data, "DATEN"), done = a("done", X.done, "DONE");
    if (ks === "anonym" && ctx.konto.st && ctx.konto.st.canLogin) return { primary: a("login", K.login, "LOGIN"), secondary: [daten, done] };
    if (ks === "fehler" && ctx.konto.err !== "nicht-hier") return { primary: a("retry", K.retry, "CHECK"), secondary: [daten, done] };
    if (ks === "angemeldet" && p.via === "account" && !p.exists && p.sync !== "busy") return { primary: a("create", K.create, "PROFIL_NEU"), secondary: [daten, done] };
    if (ks === "angemeldet" && !p.via) return { primary: a("link-account", K.linkAcc, "LINK_ACCOUNT"), secondary: [daten, done] };
    return { primary: done, secondary: [daten] };
  }
  if (L === "stil.daten") {
    const sec = [a("export", K.export, "EXPORT")];
    if (p.via && p.exists) sec.push(a("delete", ctx.konto.sure ? K.sure : K.del, "DELETE"));
    if (ks === "angemeldet" && ctx.konto.logout) sec.push(a("logout", K.logout, "LOGOUT"));
    return { primary: a("done", X.done, "DONE"), secondary: sec };
  }
  if (L === "stil.widerspruch") return { primary: a("appeal-send", K.appealSend, "APPEAL_SEND"), secondary: [a("cancel", K.cancel, "BACK")] };
  return { primary: null, secondary: [] };
}

function radios(id, label, items, value, onPick, cls = "") {
  return h("div", { class: "seg " + cls, role: "radiogroup", "aria-labelledby": "lbl-" + id, key: id },
    h("p", { class: "seg-label", id: "lbl-" + id }, label),
    h("div", { class: "seg-row" }, items.map((it) => h("button", { type: "button", role: "radio", class: "seg-opt " + (it.cls || ""), key: String(it.value), "aria-checked": it.value === value ? "true" : "false", "aria-label": it.aria || null, "data-v": String(it.value), on: { click: () => onPick(it.value) } }, it.label))));
}

function preview(ctx, X) {
  const me = ctx.me, K = X.k, set = SETS[me.set] || SETS.tiere;
  const pairIdx = PAIRS.findIndex((q) => q[0] === me.colors[0] && q[1] === me.colors[1]);
  const label = fmt(K.previewLabel, { n: me.nick || K.noName, e: me.emoji, c: pairIdx >= 0 ? fmt(K.pair, { n: pairIdx + 1 }) : me.colors.join(", "), s: K.sets[me.set] || me.set });
  return h("section", { class: "mystil", key: "pv", "aria-labelledby": "pv-h" },
    h("h2", { class: "t-label", id: "pv-h" }, K.preview),
    h("div", { class: "mystil-card", role: "img", "aria-label": label, id: "mystil-card", style: { background: me.colors[0], color: ink(me.colors[0]) } },
      h("span", { class: "mystil-stickers", "aria-hidden": "true" }, set.join(" ")),
      h("span", { class: "mystil-emoji", "aria-hidden": "true" }, me.emoji),
      h("span", { class: "mystil-nick", "aria-hidden": "true" }, me.nick || K.noName),
      h("i", { class: "mystil-bar", "aria-hidden": "true", style: { background: me.colors[1] } })));
}

function styleForm(ctx, X, dispatch) {
  const K = X.k, me = ctx.me, set = (key) => (value) => dispatch({ type: "ME", key, value });
  return [
    h("div", { class: "field", key: "nick" },
      h("label", { for: "k-nick" }, K.nick),
      h("input", { id: "k-nick", class: "input", type: "text", maxlength: "16", autocomplete: "nickname", placeholder: K.nickPh, "aria-describedby": "k-nick-note", value: me.nick, on: { input: (e) => set("nick")(e.target.value) } }),
      ctx.konto.nickErr ? h("p", { class: "warn", role: "alert" }, K.nickErr) : null,
      h("p", { class: "hint", id: "k-nick-note" }, K.nickNote)),
    radios("emoji", K.emoji, EMOJI.map((e) => ({ value: e, label: e, cls: "emo" })), me.emoji, set("emoji"), "emos"),
    radios("colors", K.colors, PAIRS.map((q, i) => ({ value: q.join(","), aria: fmt(K.pair, { n: i + 1 }), cls: "swatch", label: [h("i", { class: "sw", "aria-hidden": "true", style: { background: q[0] } }), h("i", { class: "sw", "aria-hidden": "true", style: { background: q[1] } })] })), me.colors.join(","), (v) => set("colors")(v.split(","))),
    radios("set", K.set, Object.keys(SETS).map((s) => ({ value: s, label: [K.sets[s] + " ", h("span", { "aria-hidden": "true" }, SETS[s].join(""))] })), me.set, set("set")),
    h("section", { class: "notice read", key: "read", "aria-labelledby": "read-h" },
      h("h2", { class: "t-label", id: "read-h" }, K.read),
      radios("fs", K.fs, FONT.map((f) => ({ value: f, label: K.fsOpt[f] })), ctx.pref.fs, (v) => dispatch({ type: "PREF", key: "fs", value: v })),
      h("div", { class: "seg-row" }, h("button", { type: "button", class: "seg-opt", "aria-pressed": ctx.pref.easy ? "true" : "false", "aria-describedby": "easy-note", "data-act": "easy", on: { click: () => dispatch({ type: "PREF", key: "easy", value: !ctx.pref.easy }) } }, K.easy)),
      h("p", { class: "hint", id: "easy-note" }, K.easyNote))
  ];
}

function check16(ctx, K, dispatch) {
  return [
    h("label", { class: "check", key: "c16", for: "k-age16" },
      h("input", { type: "checkbox", id: "k-age16", checked: ctx.konto.age16, on: { change: (e) => dispatch({ type: "AGE16", on: e.target.checked }) } }),
      h("span", null, K.age16)),
    h("p", { class: "warn", role: "alert", key: "n16" }, ctx.konto.need16 ? K.need16 : "")
  ];
}

function counters(ctx, K, lang) {
  const st = ctx.konto.st, out = [];
  if (!st) return out;
  out.push(h("p", { class: "meter", key: "ki", "data-k": "ki" }, st.ki.enabled ? fmt(st.ki.period === "month" ? K.kiMonth : K.ki, { n: st.ki.remaining, m: st.ki.size }) : K.kiOff));
  if (st.karte) {
    const c = st.karte.credit;
    out.push(h("p", { class: "meter", key: "karte", "data-k": "karte" }, fmt(K.karte, { n: st.karte.remaining, m: st.karte.size })));
    out.push(h("p", { class: "meter strong", key: "credit", "data-k": "credit" }, c === 0 ? K.credit0 : c === 1 ? K.credit1 : fmt(K.credit, { n: c })));
    if (st.karte.paused) out.push(h("p", { class: "warn", key: "paused" }, K.paused));
  }
  return out;
}

function topup(ctx, K, dispatch) {
  const st = ctx.konto.st, r = ctx.konto.redeem;
  if (!st || !st.karte || !st.karte.voucher) return null;
  const msg = ctx.konto.redeeming ? K.topBusy : r ? (r.ok ? fmt(K.topOk, { n: r.added }) : K.topErr[r.error] || K.topErr.server) : "";
  return h("form", { class: "topup", key: "topup", role: "group", "aria-labelledby": "top-h", on: { submit: (e) => { e.preventDefault(); dispatch({ type: "REDEEM" }); } } },
    h("h3", { class: "t-label", id: "top-h" }, K.top),
    h("label", { for: "k-voucher" }, K.topCode),
    h("div", { class: "inline" },
      h("input", { id: "k-voucher", class: "input", type: "text", maxlength: "64", autocomplete: "off", spellcheck: "false", autocapitalize: "characters", value: ctx.konto.voucher, on: { input: (e) => dispatch({ type: "VOUCHER_TEXT", value: e.target.value }) } }),
      h("button", { type: "submit", class: "btn secondary small", "data-act": "redeem", disabled: ctx.konto.redeeming ? true : null }, K.topGo)),
    h("p", { class: r && !r.ok ? "warn" : "hint strong", role: "status", id: "top-msg" }, msg),
    h("p", { class: "hint" }, K.creditNote));
}

function syncLine(ctx, K, lang) {
  const p = ctx.profil;
  if (!p.via || !p.sync) return null;
  const s = p.sync === "ok" ? (p.at ? fmt(K.sync.ok, { time: time(p.at, lang) }) : "") : K.sync[p.sync] || K.sync.other;
  return s ? h("p", { class: p.sync === "ok" || p.sync === "busy" ? "hint" : "warn", role: "status", key: "sync", "data-sync": p.sync }, s) : null;
}

function kontoCard(state, X, dispatch) {
  const ctx = state.ctx, K = X.k, ks = kState(state), p = ctx.profil, st = ctx.konto.st, lang = ctx.lang;
  const kids = [];
  const head = (t) => h("h2", { class: "t-label", id: "konto-h", key: "kh" }, t);
  if (ks === "pruefen" || ks === "anmelden" || ks === "abmelden") kids.push(head(K.title), h("p", { role: "status", key: "chk" }, K.checking));
  else if (ks === "fehler") kids.push(head(K.title), h("p", { class: ctx.konto.err === "nicht-hier" ? "hint strong" : "warn", role: "status", key: "err", "data-err": ctx.konto.err }, K.err[ctx.konto.err] || K.err.other));
  else if (ks === "anonym") {
    kids.push(head(K.title));
    if (ctx.konto.note === "pending") kids.push(h("p", { class: "warn", role: "status", key: "pend" }, K.notes.pending));
    if (p.via === "code") kids.push(h("p", { class: "ok", key: "on" }, fmt(K.onCode, { n: name(ctx.me, X) })), syncLine(ctx, K, lang));
    kids.push(...counters(ctx, K, lang));
    if (st && st.canLogin) {
      kids.push(h("ul", { class: "why", key: "why" }, [K.b1, K.b2, K.b3].map((b, i) => h("li", { key: "b" + i }, b))));
      kids.push(...check16(ctx, K, dispatch));
      kids.push(h("p", { class: "hint", key: "where" }, K.where));
      if (ctx.konto.attempt) kids.push(h("button", { type: "button", class: "linkbtn", "data-act": "cancel-login", key: "cl", on: { click: () => dispatch({ type: "CANCEL_LOGIN" }) } }, K.cancel));
    } else kids.push(h("p", { class: "hint strong", key: "nl" }, K.noLogin));
    if (st && st.karte === null && st.canLogin) kids.push(h("p", { class: "hint", key: "tl" }, K.topLogin));
    kids.push(h("p", { class: "hint", key: "local" }, K.local));
  } else if (ks === "angemeldet") {
    kids.push(head(K.titleOn));
    if (p.via === "account" && p.exists) kids.push(h("p", { class: "ok", key: "on", "data-k": "on" }, fmt(K.onAcc, { n: name(ctx.me, X) })));
    else if (p.via === "code") kids.push(h("p", { class: "ok", key: "on", "data-k": "on" }, fmt(K.onCode, { n: name(ctx.me, X) })));
    else kids.push(h("p", { class: "ok", key: "on", "data-k": "on" }, K.onAccNoProfile));
    kids.push(syncLine(ctx, K, lang));
    if (p.via === "account" && !p.exists) kids.push(...check16(ctx, K, dispatch), h("p", { class: "hint", key: "cn" }, K.createNote));
    if (p.via === "account" && p.exists) kids.push(h("div", { class: "seg-row", key: "a18" }, h("button", { type: "button", class: "seg-opt", "aria-pressed": p.age18 ? "true" : "false", "aria-describedby": "a18-note", "data-act": "age18", disabled: p.sync === "busy" ? true : null, on: { click: () => dispatch({ type: "AGE18", on: !p.age18 }) } }, K.age18)), h("p", { class: "hint", id: "a18-note", key: "a18n" }, K.age18Note));
    kids.push(...counters(ctx, K, lang));
    kids.push(topup(ctx, K, dispatch));
  }
  if (ctx.konto.note && ctx.konto.note !== "pending") kids.push(h("p", { class: "hint strong", role: "status", key: "note" }, K.notes[ctx.konto.note]));
  return h("section", { class: "notice konto", key: "konto", "aria-labelledby": "konto-h", "data-konto": ks }, kids);
}

function row(k, v) { return [h("dt", { key: "t" + k }, k), h("dd", { key: "d" + k }, v)]; }

function datenBody(state, X, dispatch) {
  const ctx = state.ctx, K = X.k, ks = kState(state), p = ctx.profil, lang = ctx.lang, me = ctx.me;
  const remote = p.remote || {}, R = K.rows;
  const stored = h("section", { class: "notice", key: "stored", "aria-labelledby": "st-h" },
    h("h2", { class: "t-label", id: "st-h" }, K.dataTitle),
    h("p", { "data-k": "where" }, p.via === "account" && p.exists ? K.whereAcc : p.via === "code" && p.exists ? K.whereCode : K.where0),
    h("dl", { class: "rows" },
      row(R.nick, me.nick || "–"), row(R.emoji, me.emoji), row(R.colors, me.colors.join(", ")), row(R.set, K.sets[me.set] || me.set),
      p.exists ? row(R.wall, fmt(R.n, { n: (remote.wall || []).length })) : null,
      p.exists ? row(R.saved, fmt(R.n, { n: (remote.saved || []).length })) : null,
      p.exists && p.via === "account" ? row(R.age18, p.age18 ? R.yes : R.no) : null,
      p.exists ? row(R.rev, String(p.rev)) : null),
    h("p", { class: "hint" }, K.what),
    syncLine(ctx, K, lang),
    p.via ? h("div", { class: "seg-row" },
      p.exists ? h("button", { type: "button", class: "seg-opt", "data-act": "sync", on: { click: () => dispatch({ type: "SYNC" }) } }, K.syncNow) : null,
      h("button", { type: "button", class: "seg-opt", "data-act": "unlink", on: { click: () => dispatch({ type: "UNLINK" }) } }, K.unlink)) : null,
    ctx.konto.note ? h("p", { class: "hint strong", role: "status" }, K.notes[ctx.konto.note] || "") : null);

  const code = h("section", { class: "notice", key: "code", "aria-labelledby": "code-h" },
    h("h2", { class: "t-label", id: "code-h" }, K.code),
    p.via === "code" ? [h("p", null, K.codeShow), h("p", { class: "code", id: "k-code" }, fmtCode(p.code)), h("p", { class: "hint" }, K.codeSecret)] : h("p", { class: "hint" }, K.codeNote),
    p.via !== "code" && ks === "angemeldet" ? h("button", { type: "button", class: "seg-opt", "data-act": "code-new", on: { click: () => dispatch({ type: "CODE_NEW" }) } }, K.codeNew) : null,
    p.via !== "code" ? h("p", { class: "hint" }, K.codeNewNote) : null,
    p.via !== "code" ? h("form", { class: "inline", on: { submit: (e) => { e.preventDefault(); dispatch({ type: "CODE_JOIN" }); } } },
      h("label", { for: "k-code-in", class: "visually-hidden" }, K.codeIn),
      h("input", { id: "k-code-in", class: "input", type: "text", maxlength: "64", autocomplete: "off", spellcheck: "false", placeholder: K.codeIn, value: ctx.konto.codeIn, on: { input: (e) => dispatch({ type: "CODE_TEXT", value: e.target.value }) } }),
      h("button", { type: "submit", class: "btn secondary small", "data-act": "code-join" }, K.codeJoin)) : null,
    h("p", { class: "warn", role: "alert" }, ctx.konto.codeErr ? K.codeErr[ctx.konto.codeErr] : ""));

  let mod;
  if (ks !== "angemeldet") mod = h("p", { class: "hint" }, K.modLogin);
  else if (ctx.mod.load === "busy" || ctx.mod.load === null) mod = h("p", { role: "status" }, K.modLoad);
  else if (ctx.mod.load !== "ok") mod = h("p", { class: "warn", role: "status" }, K.modErr);
  else mod = [
    ctx.mod.st !== "ok" ? h("p", { class: "warn" }, fmt(K.modSt[ctx.mod.st], { d: ctx.mod.until ? date(ctx.mod.until, lang) : "" })) : null,
    ctx.mod.notices.length ? h("ul", { class: "notices" }, ctx.mod.notices.map((n) => noticeItem(n, ctx, X, dispatch))) : h("p", { "data-k": "mod-none" }, K.modNone)
  ];
  const modSec = h("section", { class: "notice", key: "mod", "aria-labelledby": "mod-h" }, h("h2", { class: "t-label", id: "mod-h" }, K.mod), mod);
  const out = h("p", { class: "hint", key: "lo" }, ks === "angemeldet" ? (ctx.konto.logout ? K.logoutNote : K.logoutNone) : "");
  return { body: [stored, code], panel: [modSec, ks === "angemeldet" ? out : null] };
}

function noticeItem(n, ctx, X, dispatch) {
  const K = X.k, lang = ctx.lang, f = n.facts;
  const canAppeal = !n.appeal && n.type !== "lift" && n.appealUntil;
  return h("li", { class: "mod-item", key: n.nid, "data-nid": n.nid },
    h("p", { class: "t-label" }, K.modType[n.type] || K.modType.other),
    h("p", { class: "hint" }, date(n.at, lang)),
    f.down !== null && f.share !== null ? h("p", null, fmt(K.modThumbs, { n: f.down, p: f.share })) : null,
    n.ground ? h("p", null, K.modGround[n.ground] || K.modGround.other) : null,
    f.lapses ? h("p", null, fmt(K.modLapses, { d: date(f.lapses, lang) })) : null,
    n.until ? h("p", null, fmt(K.modUntil, { d: date(n.until, lang) })) : null,
    h("p", { class: "hint" }, (n.automated ? K.modAuto : K.modManual) + " " + K.modBasis),
    n.appeal ? h("p", { class: "hint strong", "data-k": "appeal-state" }, K.modA[n.appeal.state]) : null,
    ctx.mod.sent === n.nid ? h("p", { class: "hint strong", role: "status" }, K.appealOk) : null,
    canAppeal ? h("p", { class: "hint" }, fmt(K.modAppealUntil, { d: date(n.appealUntil, lang) }) + (n.court ? " " + K.modCourt : "")) : null,
    canAppeal ? h("button", { type: "button", class: "seg-opt", "data-act": "appeal-" + n.nid, on: { click: () => dispatch({ type: "APPEAL", nid: n.nid }) } }, K.appeal) : null);
}

function appealBody(state, X, dispatch) {
  const ctx = state.ctx, K = X.k, n = ctx.mod.notices.find((x) => x.nid === ctx.mod.nid);
  const err = ctx.mod.err ? K.appealErr[ctx.mod.err] || K.appealErr.other : "";
  return { body: [h("section", { class: "notice", key: "ap", "aria-labelledby": "ap-h" },
    h("h2", { class: "t-label", id: "ap-h" }, K.appealTitle + (n ? ": " + (K.modType[n.type] || K.modType.other) : "")),
    h("label", { for: "k-appeal" }, K.appealLabel),
    h("textarea", { id: "k-appeal", class: "input", rows: "5", maxlength: "1000", value: ctx.mod.text, on: { input: (e) => dispatch({ type: "APPEAL_TEXT", value: e.target.value }) } }),
    h("p", { class: "warn", role: "alert" }, err))], panel: [] };
}

/** -> { body, panel } fuer die Stil-Bildschirme */
export function stilView(state, X, dispatch, L) {
  if (L === "stil.daten") return datenBody(state, X, dispatch);
  if (L === "stil.widerspruch") return appealBody(state, X, dispatch);
  return { body: [preview(state.ctx, X), ...styleForm(state.ctx, X, dispatch)], panel: [kontoCard(state, X, dispatch)] };
}
