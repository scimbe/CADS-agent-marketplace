// Konto-Region der App-Statechart (KONZEPT §2 „Konto: wer bin ich, was darf ich“) und die Bildschirme „Mein Stil“ in
// der Inhalt-Region. Die Konto-Region kennt: pruefen -> anonym | angemeldet | fehler; anonym -> anmelden (Seite geht
// zum Gate); angemeldet -> abmelden. Quelle ist der Server (/api/duell/ai/status, profile/*), nie eine Annahme der Seite.
// Ergebnisse kommen als Ereignisse zurueck (STATUS, PROFIL, REDEEMED, MOD, APPEALED); Aktionen geben nur Effekte aus.
import { cleanMe, cleanPref, pack, meFrom, parseCode, attemptFresh, nickOk } from "./konto.js";
import { FEATURES } from "./features.js";

/** Lokale Profilteile der Features (Wand, Gemerkt – Strang H): feature.profileLocal(ctx) -> {wall?, saved?} (ADR 0001 g). */
function profileLocal(ctx) {
  let out = null;
  for (const f of FEATURES) if (typeof f.profileLocal === "function") { const l = f.profileLocal(ctx); if (l) out = { ...(out || {}), ...l }; }
  return out;
}

const T = (p) => p;
export const kontoRegion = {
  initial: "pruefen",
  on: {
    STATUS: [
      { target: T("konto.angemeldet"), cond: "stAccount", actions: ["takeStatus", "afterSignIn"] },
      { target: T("konto.anonym"), cond: "stOk", actions: ["takeStatus", "afterAnon"] },
      { target: T("konto.fehler"), actions: ["takeStatusError"] }
    ],
    REFRESH: { actions: ["fxStatus"] },
    AGE16: { actions: ["setAge16"] },
    ME: { actions: ["setMe", "fxDevice"] },
    PREF: { actions: ["setPref", "fxDevice"] },
    PROFIL: { actions: ["takeProfil"] },
    SAVE: { cond: "dirtyLinked", actions: ["fxPut"] },
    SYNC: { cond: "linked", actions: ["fxGet"] },
    UNLINK: { cond: "linked", actions: ["unlink", "fxDevice"] },
    CODE_TEXT: { actions: ["setCodeText"] },
    CODE_JOIN: [{ cond: "codeOk", actions: ["joinCode"] }, { actions: ["badCode"] }],
    DELETE: [{ cond: "sure", actions: ["fxDelete"] }, { cond: "linkedExists", actions: ["askSure"] }],
    VOUCHER_TEXT: { actions: ["setVoucher"] },
    REDEEMED: { actions: ["takeRedeem"], raise: (ctx, ev) => (ev.result && ev.result.ok ? { type: "REFRESH" } : null) },
    CANCEL_LOGIN: { cond: "attempt", actions: ["dropAttempt", "fxDevice"] }
  },
  states: {
    pruefen: { entry: ["fxStatus"] },
    anonym: {
      on: {
        LOGIN: [{ target: T("konto.anmelden"), cond: "canLogin16", actions: ["fxLogin"] }, { cond: "canLogin", actions: ["need16"] }],
        CHECK: T("konto.pruefen")
      }
    },
    // APP_DONE: die App-Huelle hat angemeldet (oder die Person hat abgebrochen) – der Server sagt, was gilt
    anmelden: { on: { NAV_FAIL: { target: T("konto.fehler"), actions: ["navFailed"] }, APP_DONE: T("konto.pruefen") } },
    angemeldet: {
      on: {
        LOGOUT: { target: T("konto.abmelden"), cond: "hasLogout", actions: ["unlinkAccount", "fxLogout"] },
        PROFIL_NEU: [{ cond: "neu16", actions: ["fxCreate"] }, { cond: "neu", actions: ["need16"] }],
        AGE18: { cond: "linkedAccount", actions: ["fxAge18"] },
        CODE_NEW: { cond: "notCode", actions: ["newCode"] },
        LINK_ACCOUNT: { cond: "noLink", actions: ["linkAccount"] },
        REDEEM: [{ cond: "voucherOk", actions: ["fxRedeem"] }, { actions: ["voucherShort"] }],
        CHECK: T("konto.pruefen")
      }
    },
    abmelden: { on: { NAV_FAIL: { target: T("konto.fehler"), actions: ["navFailed"] }, APP_DONE: T("konto.pruefen") } },
    fehler: { on: { CHECK: { target: T("konto.pruefen"), cond: "retryable" } } }
  }
};

/** Bildschirme in der Inhalt-Region: Mein Stil, Konto & Daten, Widerspruch. */
export const stilState = {
  initial: "start",
  on: { MOD: { actions: ["takeMod"] }, APPEALED: [{ target: T("inhalt.stil.daten"), cond: "resultOk", actions: ["takeAppeal", "fxModMe"] }, { actions: ["takeAppeal"] }] },
  states: {
    start: {
      on: {
        DATEN: [{ target: T("inhalt.stil.daten"), cond: "signedIn", actions: ["fxModMe"] }, { target: T("inhalt.stil.daten") }],
        DONE: { target: T("inhalt.shelf"), actions: ["clearNotes"], raise: "SAVE" },
        BACK: { target: T("inhalt.shelf"), actions: ["clearNotes"], raise: "SAVE" }
      }
    },
    daten: {
      on: {
        EXPORT: { actions: ["fxExport"] },
        APPEAL: { target: T("inhalt.stil.widerspruch"), cond: "appealable", actions: ["openAppeal"] },
        DONE: T("inhalt.stil.start"), BACK: T("inhalt.stil.start")
      }
    },
    widerspruch: {
      on: {
        APPEAL_TEXT: { actions: ["setAppealText"] },
        APPEAL_SEND: [{ cond: "appealText", actions: ["fxAppeal"] }, { actions: ["appealEmpty"] }],
        BACK: T("inhalt.stil.daten")
      }
    }
  }
};

const R = (ev) => (ev && ev.result) || { ok: false, error: "server" };
const linkOf = (p) => (p.via === "code" ? { via: "code", code: p.code } : p.via === "account" ? { via: "account" } : null);
const sameWho = (p, w) => !!w && p.via === w.via && (w.via !== "code" || p.code === w.code);
const emptyLink = (extra = {}) => ({ via: null, code: null, rev: 0, remote: null, exists: false, dirty: false, sync: null, at: null, age18: false, retry: 0, make: false, off: false, ...extra });
const K = (ctx, o) => ({ ...ctx, konto: { ...ctx.konto, ...o } });
const PR = (ctx, o) => ({ ...ctx, profil: { ...ctx.profil, ...o } });

export const kontoGuards = {
  stAccount: (ctx, ev) => R(ev).ok === true && R(ev).account === true,
  stOk: (ctx, ev) => R(ev).ok === true,
  canLogin: (ctx) => !!(ctx.konto.st && ctx.konto.st.canLogin),
  canLogin16: (ctx) => !!(ctx.konto.st && ctx.konto.st.canLogin) && ctx.konto.age16 === true,
  retryable: (ctx) => ctx.konto.err !== "nicht-hier",
  hasLogout: (ctx) => typeof ctx.konto.logout === "string" || !!(ctx.konto.st && ctx.konto.st.app),
  signedIn: (ctx, ev, inState) => inState("konto.angemeldet"),
  linked: (ctx) => !!ctx.profil.via,
  noLink: (ctx) => !ctx.profil.via,
  notCode: (ctx) => ctx.profil.via !== "code",
  linkedExists: (ctx) => !!ctx.profil.via && ctx.profil.exists,
  linkedAccount: (ctx) => ctx.profil.via === "account" && ctx.profil.exists,
  dirtyLinked: (ctx) => !!ctx.profil.via && ctx.profil.exists && ctx.profil.dirty,
  sure: (ctx) => ctx.konto.sure === true && !!ctx.profil.via && ctx.profil.exists,
  neu: (ctx) => ctx.profil.via === "account" && !ctx.profil.exists,
  neu16: (ctx) => ctx.profil.via === "account" && !ctx.profil.exists && ctx.konto.age16 === true,
  codeOk: (ctx) => !!parseCode(ctx.konto.codeIn),
  voucherOk: (ctx) => String(ctx.konto.voucher || "").trim().length >= 4 && !ctx.konto.redeeming,
  attempt: (ctx) => !!ctx.konto.attempt,
  appealable: (ctx, ev) => !!(ctx.mod && ctx.mod.notices.find((n) => n.nid === ev.nid && !n.appeal && n.type !== "lift" && n.appealUntil && Date.parse(n.appealUntil) > (ev.at || 0))),
  appealText: (ctx) => String(ctx.mod.text || "").trim().length > 0 && [...String(ctx.mod.text)].length <= 1000 && !ctx.mod.sending,
  resultOk: (ctx, ev) => R(ev).ok === true
};

function put(ctx, emit, extra = {}) {
  const p = ctx.profil, w = linkOf(p);
  const body = { rev: p.rev, profile: pack(ctx.me, p.remote, profileLocal(ctx)), ...extra };
  emit({ type: "profil.put", who: w, body });
  return PR(ctx, { sync: "busy" });
}
function getNow(ctx, emit) { emit({ type: "profil.get", who: linkOf(ctx.profil) }); return PR(ctx, { sync: "busy" }); }

export const kontoActions = {
  fxStatus: (ctx, ev, emit) => { emit({ type: "konto.status" }); return K(ctx, { err: null }); },
  takeStatus: (ctx, ev) => K(ctx, { st: { account: R(ev).account, canLogin: R(ev).canLogin, ki: R(ev).ki, karte: R(ev).karte, app: R(ev).app === true }, logout: ev.logout || null, err: null }),
  takeStatusError: (ctx, ev) => K(ctx, { st: null, err: R(ev).error || "server" }),
  // angemeldet: Profil des Kontos lesen (Lesen legt nichts an). Ein Geraete-Code bleibt, wenn er verbunden ist.
  afterSignIn: (ctx, ev, emit) => {
    let c = ctx;
    if (!c.profil.via && !c.profil.off) c = { ...c, profil: emptyLink({ via: "account" }) };
    if (c.profil.via) c = getNow(c, emit);
    return c;
  },
  // nicht angemeldet: ein frischer Versuch heisst „Anmeldung nicht abgeschlossen“; ein Konto-Link ohne Anmeldung ist abgelaufen
  afterAnon: (ctx, ev, emit) => {
    let c = ctx;
    if (attemptFresh(c.konto.attempt, ev.at)) c = K(c, { note: "pending" });
    else if (c.konto.attempt) { c = K(c, { attempt: null }); emit({ type: "device.save" }); }
    if (c.profil.via === "account") c = PR(c, { sync: "login" });
    if (c.profil.via === "code") c = getNow(c, emit);
    return c;
  },
  setAge16: (ctx, ev) => K(ctx, { age16: ev.on === true, need16: ev.on === true ? false : ctx.konto.need16 }),
  need16: (ctx) => K(ctx, { need16: true }),
  fxLogin: (ctx, ev, emit) => {
    const c = K(ctx, { attempt: { age16: true, t0: ev.at || 0 }, need16: false, note: null });
    emit({ type: "device.save" }); emit({ type: "konto.login" });
    return c;
  },
  navFailed: (ctx, ev) => K(ctx, { err: ev.reason || "nicht-hier" }),
  dropAttempt: (ctx) => K(ctx, { attempt: null, note: null }),
  unlinkAccount: (ctx, ev, emit) => { emit({ type: "device.save" }); return ctx.profil.via === "account" ? { ...ctx, profil: emptyLink() } : ctx; },
  fxLogout: (ctx, ev, emit) => { emit({ type: "konto.logout", url: ctx.konto.logout }); return ctx; },
  setMe: (ctx, ev) => {
    if (!["nick", "emoji", "colors", "set"].includes(ev.key)) return ctx;
    if (ev.key === "nick" && !nickOk(ev.value)) return K(ctx, { nickErr: true });
    const me = cleanMe({ ...ctx.me, [ev.key]: ev.value });
    return { ...ctx, me, konto: { ...ctx.konto, nickErr: false }, profil: { ...ctx.profil, dirty: !!ctx.profil.via } };
  },
  setPref: (ctx, ev) => ({ ...ctx, pref: cleanPref({ ...ctx.pref, [ev.key]: ev.value }) }),
  fxDevice: (ctx, ev, emit) => { emit({ type: "device.save" }); return ctx; },
  fxPut: (ctx, ev, emit) => put(ctx, emit),
  fxGet: (ctx, ev, emit) => getNow(PR(ctx, { retry: 0 }), emit),
  fxCreate: (ctx, ev, emit) => put(K(ctx, { need16: false }), emit, { age16: true, fresh: true }),
  fxAge18: (ctx, ev, emit) => put(ctx, emit, { age18: ev.on === true }),
  fxDelete: (ctx, ev, emit) => { emit({ type: "profil.delete", who: linkOf(ctx.profil) }); return { ...K(ctx, { sure: false }), profil: { ...ctx.profil, sync: "busy" } }; },
  askSure: (ctx) => K(ctx, { sure: true }),
  unlink: (ctx) => ({ ...K(ctx, { note: "unlinked", sure: false }), profil: emptyLink({ off: ctx.profil.via === "account" }) }),
  linkAccount: (ctx, ev, emit) => getNow({ ...ctx, profil: emptyLink({ via: "account" }) }, emit),
  setCodeText: (ctx, ev) => K(ctx, { codeIn: String(ev.value || "").slice(0, 64), codeErr: null }),
  badCode: (ctx) => K(ctx, { codeErr: "bad" }),
  joinCode: (ctx, ev, emit) => getNow({ ...K(ctx, { codeIn: "", codeErr: null }), profil: emptyLink({ via: "code", code: parseCode(ctx.konto.codeIn) }) }, emit),
  // ein neuer Code: 128 Zufallsbits aus der Laufzeit (ev.rand), angelegt beim ersten put (Server verlangt dafuer Anmeldung)
  newCode: (ctx, ev, emit) => getNow({ ...K(ctx, { codeErr: null }), profil: emptyLink({ via: "code", code: String(ev.rand && ev.rand[0] || ""), make: true }) }, emit),
  setVoucher: (ctx, ev) => K(ctx, { voucher: String(ev.value || "").slice(0, 64), redeem: null }),
  voucherShort: (ctx) => K(ctx, { redeem: { ok: false, error: "kurz" } }),
  fxRedeem: (ctx, ev, emit) => { emit({ type: "redeem", code: ctx.konto.voucher }); return K(ctx, { redeeming: true, redeem: null }); },
  takeRedeem: (ctx, ev) => K(ctx, { redeeming: false, redeem: R(ev), voucher: R(ev).ok ? "" : ctx.konto.voucher }),
  clearNotes: (ctx) => K(ctx, { note: null, need16: false, sure: false, redeem: null, codeErr: null }),

  /** Ergebnis eines Profil-Aufrufs. Gehoert es nicht mehr zur aktuellen Verknuepfung (inzwischen getrennt), zaehlt es nicht. */
  takeProfil: (ctx, ev, emit) => {
    const p = ctx.profil, r = R(ev);
    if (!sameWho(p, ev.who)) return ctx;
    const done = (o) => { emit({ type: "device.save" }); return PR(ctx, { sync: "ok", at: ev.at || null, retry: 0, ...o }); };
    const gone = (note) => { emit({ type: "device.save" }); return { ...K(ctx, { note }), profil: emptyLink({ off: p.via === "account" }) }; };
    if (ev.op === "delete") return r.ok ? gone("deleted") : PR(ctx, { sync: r.error });
    if (ev.op === "get") {
      if (!r.ok) return PR(ctx, { sync: r.error });
      if (r.gone && p.exists) return gone("gone");
      if (!r.profile) {
        if (p.via === "code" && !p.make) { emit({ type: "device.save" }); return { ...K(ctx, { codeErr: "unknown" }), profil: emptyLink() }; }
        const c = PR(ctx, { rev: r.rev, exists: false, remote: null });
        if (p.via === "code") return put(c, emit, { fresh: true });
        // Konto ohne Profil: anlegen nur mit der 16+-Aussage dieses Tipps (Versuch), sonst fragt die Seite
        if (attemptFresh(ctx.konto.attempt, ev.at)) return put(c, emit, { age16: true, fresh: true });
        return PR(c, { sync: "need16" });
      }
      const c = PR(ctx, { rev: r.rev, remote: r.profile, exists: true, age18: r.age18 === true });
      if (p.dirty) return put(c, emit);
      emit({ type: "device.save" });
      return { ...c, me: meFrom(r.profile, ctx.me), profil: { ...c.profil, sync: "ok", at: ev.at || null, retry: 0 } };
    }
    // put
    if (r.ok) {
      const body = ev.body || {};
      return { ...done({ rev: r.rev, remote: body.profile || p.remote, exists: true, dirty: false, make: false, age18: body.age18 === true || body.age18 === false ? body.age18 : p.age18 }), konto: { ...ctx.konto, attempt: null, note: null } };
    }
    if (r.error === "veraltet" && p.retry < 1) return getNow(PR(ctx, { retry: p.retry + 1, rev: r.rev }), emit);
    if (r.error === "geloescht") return gone("gone");
    if (r.error === "code-login") { emit({ type: "device.save" }); return { ...K(ctx, { codeErr: "codeLogin" }), profil: emptyLink() }; }
    if (r.error === "age16") return PR(ctx, { sync: "need16", exists: false });
    return PR(ctx, { sync: r.error || "server" });
  },

  fxModMe: (ctx, ev, emit) => { emit({ type: "mod.me" }); return { ...ctx, mod: { ...ctx.mod, load: "busy" } }; },
  takeMod: (ctx, ev) => { const r = R(ev); return { ...ctx, mod: r.ok ? { ...ctx.mod, load: "ok", st: r.st, until: r.until, notices: r.notices } : { ...ctx.mod, load: r.error } }; },
  openAppeal: (ctx, ev) => ({ ...ctx, mod: { ...ctx.mod, nid: ev.nid, text: "", sending: false, err: null, sent: null } }),
  setAppealText: (ctx, ev) => ({ ...ctx, mod: { ...ctx.mod, text: String(ev.value || "").slice(0, 1200), err: null } }),
  appealEmpty: (ctx) => ({ ...ctx, mod: { ...ctx.mod, err: ctx.mod.sending ? ctx.mod.err : "leer" } }),
  fxAppeal: (ctx, ev, emit) => { emit({ type: "mod.appeal", nid: ctx.mod.nid, text: String(ctx.mod.text).trim() }); return { ...ctx, mod: { ...ctx.mod, sending: true, err: null } }; },
  takeAppeal: (ctx, ev) => { const r = R(ev); return { ...ctx, mod: { ...ctx.mod, sending: false, err: r.ok ? null : r.error, sent: r.ok ? ctx.mod.nid : null } }; },
  fxExport: (ctx, ev, emit) => {
    emit({ type: "download", name: "my-daily-idea-daten.json", data: {
      erstellt: ev.at ? new Date(ev.at).toISOString() : null,
      geraet: { meinStil: ctx.me, lesen: ctx.pref, gesichert: ctx.profil.via ? (ctx.profil.via === "code" ? "geraete-code" : "konto") : "nur-dieses-geraet", ...(ctx.profil.via === "code" ? { geraeteCode: ctx.profil.code } : {}) },
      server: ctx.profil.exists ? { profil: ctx.profil.remote, revision: ctx.profil.rev, ab18: ctx.profil.via === "account" ? ctx.profil.age18 : undefined } : null,
      moderation: ctx.mod && ctx.mod.load === "ok" ? { st: ctx.mod.st, hinweise: ctx.mod.notices } : null
    } });
    return K(ctx, { note: "exported" });
  }
};

/** Konto-Teil des Anfangskontexts aus dem Geraetespeicher (bereinigt). */
export function kontoContext(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const l = s.link && typeof s.link === "object" ? s.link : {};
  const via = l.via === "account" || (l.via === "code" && /^[a-f0-9]{32}$/.test(l.code)) ? l.via : null;
  return {
    device: typeof s.device === "string" && /^[a-f0-9]{32}$/.test(s.device) ? s.device : null,
    me: cleanMe(s.me), pref: cleanPref(s.pref),
    profil: emptyLink(via ? { via, code: via === "code" ? l.code : null, rev: Number.isSafeInteger(l.rev) && l.rev >= 0 ? l.rev : 0, exists: l.exists === true, remote: l.remote && typeof l.remote === "object" ? l.remote : null, dirty: l.dirty === true, at: Number.isFinite(l.at) ? l.at : null, age18: l.age18 === true } : { off: l.off === true }),
    konto: { st: null, err: null, age16: false, need16: false, note: null, attempt: s.attempt && s.attempt.age16 === true && Number.isFinite(s.attempt.t0) ? { age16: true, t0: s.attempt.t0 } : null, logout: null, sure: false, voucher: "", redeem: null, redeeming: false, codeIn: "", codeErr: null, nickErr: false },
    mod: { load: null, st: "ok", until: null, notices: [], nid: null, text: "", sending: false, err: null, sent: null }
  };
}
/** Was vom Konto auf dem Geraet bleibt (Gegenstueck zu kontoContext). */
export function kontoSaved(ctx) {
  const p = ctx.profil;
  return { device: ctx.device, me: ctx.me, pref: ctx.pref, attempt: ctx.konto.attempt,
    link: p.via ? { via: p.via, code: p.via === "code" ? p.code : undefined, rev: p.rev, exists: p.exists, remote: p.remote, dirty: p.dirty, at: p.at, age18: p.age18 } : { off: p.off } };
}
