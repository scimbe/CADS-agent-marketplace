// Server-API fuer Konto, Profil, Guthaben und Moderation: der EINZIGE Ort mit fetch im App-Realm (Pruefung in
// test/build.test.js). Gleiche Herkunft wie die Seite (/duell auf dem Wrapper), Cookie nur same-origin, CSP
// connect-src 'self'. Jede Antwort wird hier auf eine feste Form geprueft und auf ein Ergebnis abgebildet; was nicht
// passt, ist ein Fehler mit Namen – nie ein stiller Rueckfall (A4). Entscheidungen trifft der Server (A5): die Seite
// zeigt nur, was er sagt.
// Server: CADS-DEMO-wrapper lib/auth.mjs (/auth/login, /auth/me), lib/duell-ai.mjs (/api/duell/ai/status),
// lib/duell-profile.mjs (/api/duell/profile/*), lib/duell-voucher.mjs (/api/duell/credit/redeem),
// lib/duell-deck.mjs + duell-mod.mjs (/api/duell/mod/me, /api/duell/mod/appeal). Antworten: test/fixtures/wrapper-konto.json.

/**
 * @typedef {{ok:false, error:string, status?:number}} Fehler
 *   error: "nicht-hier" (keine Seite vom Server, z. B. file:// oder App-Huelle) | "netz" (offline, Zeitueberschreitung) |
 *   "anmeldung-weg" (Gate nicht erreichbar, 503) | "login" (nicht angemeldet) | "limit" (429) | "aus" (abgeschaltet) |
 *   "server" (unerwartete Antwort) | fachliche Codes je Aufruf (siehe unten)
 * @typedef {{enabled:boolean, remaining:number, size:number, period:string, resetAt:string|null}} Topf
 * @typedef {{ok:true, account:boolean, canLogin:boolean, ki:Topf, karte:(Topf & {credit:number, voucher:boolean, age16:boolean, age18:boolean, paused:boolean, off:boolean})|null}} Status
 * @typedef {{me:object, wall:object[], saved:object[], ai?:object}} Profil
 * @typedef {{via:"account"}|{via:"code", code:string}} Wer
 */

const P = "/api/duell";
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const int = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : null);
const fail = (error, status) => ({ ok: false, error, ...(status ? { status } : {}) });

function topf(m) {
  if (!isObj(m) || int(m.remaining) === null || int(m.size) === null || typeof m.period !== "string") return null;
  return { enabled: m.enabled !== false, remaining: m.remaining, size: m.size, period: m.period, resetAt: typeof m.resetAt === "string" ? m.resetAt : null };
}
/** Allgemeine Fehlerabbildung nach HTTP-Status und Fehlercode des Servers. */
function common(status, body) {
  const e = isObj(body) ? body.error : null;
  if (status === 401) return fail("login", status);
  if (status === 429) return fail("limit", status);
  if (status === 503) return fail(e === "auth-unavailable" ? "anmeldung-weg" : "aus", status);
  return fail("server", status);
}
/** Prueft den Ruecksprungpfad wie das Gate (lib/auth.mjs safeReturn): nur ein Pfad dieser Seite, nie ein anderer Host. */
export function safeReturn(p) { return typeof p === "string" && /^\/[\x21-\x7e]*$/.test(p) && !p.startsWith("//") && !/[;,\\]/.test(p) ? p : "/duell"; }

/**
 * @param {object} deps
 * @param {(url:string, init:object)=>Promise<Response>} [deps.fetch]
 * @param {{protocol:string, host:string}} deps.location   Ort der Seite (nur http(s) hat einen Server)
 * @param {number} [deps.timeout]
 */
export function createApi(deps) {
  const loc = deps.location || { protocol: "file:", host: "" };
  const here = (loc.protocol === "https:" || loc.protocol === "http:") && typeof (deps.fetch || globalThis.fetch) === "function";
  const doFetch = deps.fetch || ((u, o) => globalThis.fetch(u, o));
  const timeout = deps.timeout || 20000;

  /** -> {status, body} | Fehler "nicht-hier"/"netz" */
  async function call(method, path, body) {
    if (!here) return fail("nicht-hier");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try {
      const r = await doFetch(path, { method, credentials: "same-origin", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error",
        headers: body !== undefined ? { "Content-Type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined });
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, body: j };
    } catch (e) { return fail("netz"); }
    finally { if (t) clearTimeout(t); }
  }
  const post = (path, body) => call("POST", P + path, body);

  /** POST /api/duell/ai/status { device } -> Status. Quelle der Konto-Region (angemeldet ja/nein, Anmelden moeglich). */
  async function status(device) {
    const r = await post("/ai/status", { device });
    if (!r.status) return r;
    if (r.status === 400) return fail("geraet", 400);
    if (r.status !== 200) return common(r.status, r.body);
    const m = isObj(r.body) ? r.body.meter : null, ki = topf(m);
    if (!ki || typeof m.account !== "boolean" || typeof m.canLogin !== "boolean") return fail("server", 200);
    let karte = null;
    const c = r.body.create;
    if (c !== undefined) {
      const k = topf(c);
      if (!k) return fail("server", 200);
      karte = { ...k, credit: int(c.credit) || 0, voucher: c.voucher === true, age16: c.age16 === true, age18: c.age18 === true, paused: c.paused === true, off: c.off === true };
    }
    return { ok: true, account: m.account, canLogin: m.canLogin, ki, karte };
  }

  /** GET /auth/me -> { ok, authenticated, logoutUrl } ; logoutUrl aus der Gate-Adresse des Servers abgeleitet (gleiche Herkunft wie login_url). */
  async function me(ret, lang) {
    const r = await call("GET", "/auth/me?return=" + encodeURIComponent(safeReturn(ret)) + (lang === "de" || lang === "en" ? "&lang=" + lang : ""));
    if (!r.status) return r;
    if (r.status !== 200 || !isObj(r.body) || typeof r.body.authenticated !== "boolean") return common(r.status, r.body);
    return { ok: true, authenticated: r.body.authenticated, logoutUrl: logoutFrom(r.body.login_url, ret) };
  }
  /** Gate-Abmeldung (CADS-Tunnel GET /gate/logout?host=&return=): nur ueber https und nur fuer den Host, den der Server nennt. */
  function logoutFrom(loginUrl, ret) {
    try {
      const u = new URL(loginUrl);
      const host = u.searchParams.get("host");
      if (u.protocol !== "https:" || u.pathname !== "/gate/start" || !host || !/^[a-z0-9.-]{1,253}$/.test(host)) return null;
      return u.origin + "/gate/logout?host=" + encodeURIComponent(host) + "&return=" + encodeURIComponent(safeReturn(ret));
    } catch (e) { return null; }
  }
  /** Anmelden: der Server leitet zum Gate weiter (lib/auth.mjs /auth/login). Relativ, also immer dieser Host. */
  function loginHref(ret, lang) { return "/auth/login?return=" + encodeURIComponent(safeReturn(ret)) + (lang === "de" || lang === "en" ? "&lang=" + lang : ""); }

  const whoBody = (w) => (w && w.via === "code" ? { via: "code", code: w.code } : { via: "account" });
  function profil(p) { return isObj(p) && isObj(p.me) ? { me: p.me, wall: Array.isArray(p.wall) ? p.wall : [], saved: Array.isArray(p.saved) ? p.saved : [], ...(isObj(p.ai) ? { ai: p.ai } : {}) } : null; }

  /** POST /api/duell/profile/get -> { ok, profile|null, rev, gone, age18 } */
  async function profileGet(w) {
    const r = await post("/profile/get", whoBody(w));
    if (!r.status) return r;
    if (r.status === 400) return fail("code", 400);
    if (r.status !== 200) return common(r.status, r.body);
    const b = r.body;
    if (!isObj(b) || int(b.rev) === null || (b.profile !== null && !profil(b.profile))) return fail("server", 200);
    return { ok: true, profile: b.profile === null ? null : profil(b.profile), rev: b.rev, gone: b.gone === true, age18: b.age18 === true };
  }
  /** POST /api/duell/profile/put -> { ok, rev } | Fehler veraltet(rev) | geloescht | age16 | code-login | zu-gross | ... */
  async function profilePut(w, { rev, profile, age16, age18, fresh }) {
    const body = { ...whoBody(w), rev, profile };
    if (age16 === true) body.age16 = true;
    if (age18 === true || age18 === false) body.age18 = age18;
    if (fresh === true) body.fresh = true;
    const r = await post("/profile/put", body);
    if (!r.status) return r;
    const e = isObj(r.body) ? r.body.error : null;
    if (r.status === 200) return isObj(r.body) && int(r.body.rev) !== null ? { ok: true, rev: r.body.rev } : fail("server", 200);
    if (r.status === 409) return isObj(r.body) && int(r.body.rev) !== null ? { ok: false, error: "veraltet", rev: r.body.rev, status: 409 } : fail("server", 409);
    if (r.status === 410) return fail("geloescht", 410);
    if (r.status === 403 && e === "age16") return fail("age16", 403);
    if (r.status === 403 && e === "code-needs-login") return fail("code-login", 403);
    if (r.status === 413) return fail("zu-gross", 413);
    if (r.status === 400) return fail("code", 400);
    return common(r.status, r.body);
  }
  /** POST /api/duell/profile/delete -> { ok } */
  async function profileDelete(w) {
    const r = await post("/profile/delete", whoBody(w));
    if (!r.status) return r;
    if (r.status === 200 && isObj(r.body) && r.body.deleted === true) return { ok: true };
    return r.status === 200 ? fail("server", 200) : common(r.status, r.body);
  }

  /** POST /api/duell/credit/redeem { code } -> { ok, added, credit } | Fehler off|login|unknown|limit */
  async function redeem(code) {
    const r = await post("/credit/redeem", { code: String(code || "").trim() });
    if (!r.status) return r;
    const b = isObj(r.body) ? r.body : {};
    if (r.status === 200 && b.ok === true && int(b.added) !== null && int(b.credit) !== null) return { ok: true, added: b.added, credit: b.credit };
    if (["off", "login", "unknown", "limit"].includes(b.error)) return fail(b.error, r.status);
    return fail("server", r.status);
  }

  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const TYPES = ["card-hidden", "card-held", "card-removed", "strike", "pause", "ban", "lift"];
  /** Ein Hinweis (DSA Art. 17), nur bekannte Felder; unbekannte Arten bleiben als "other" sichtbar statt zu verschwinden. */
  function notice(n) {
    if (!isObj(n) || typeof n.nid !== "string" || !/^[A-Za-z0-9_-]{4,40}$/.test(n.nid) || typeof n.at !== "string" || !ISO.test(n.at)) return null;
    const f = isObj(n.facts) ? n.facts : {};
    const a = isObj(n.appeal) && ["open", "upheld", "lifted"].includes(n.appeal.state) ? { state: n.appeal.state } : null;
    return {
      nid: n.nid, at: n.at, type: TYPES.includes(n.type) ? n.type : "other",
      automated: isObj(n.automated) && n.automated.decided === true,
      ground: typeof f.ground === "string" && /^[a-z]{1,12}$/.test(f.ground) ? f.ground : null,
      facts: { down: int(f.down), share: int(f.share), n: int(f.n), lapses: typeof f.lapses === "string" && ISO.test(f.lapses) ? f.lapses : null },
      until: typeof n.until === "string" && ISO.test(n.until) ? n.until : null,
      appealUntil: typeof n.appealUntil === "string" && ISO.test(n.appealUntil) ? n.appealUntil : null,
      court: Array.isArray(n.redress) && n.redress.includes("court"),
      appeal: a
    };
  }
  /** POST /api/duell/mod/me {} -> { ok, st, until, notices } */
  async function modMe() {
    const r = await post("/mod/me", {});
    if (!r.status) return r;
    if (r.status !== 200) return common(r.status, r.body);
    const b = r.body;
    if (!isObj(b) || typeof b.st !== "string" || !Array.isArray(b.notices)) return fail("server", 200);
    const notices = b.notices.map(notice);
    if (notices.some((n) => !n)) return fail("server", 200);
    return { ok: true, st: ["ok", "paused", "banned"].includes(b.st) ? b.st : "ok", until: typeof b.until === "string" && ISO.test(b.until) ? b.until : null, notices: notices.slice().reverse() };
  }
  /** POST /api/duell/mod/appeal { nid, text } -> { ok } | Fehler leer|doppelt|zu-spaet|unbekannt */
  async function appeal(nid, text) {
    const r = await post("/mod/appeal", { nid, text });
    if (!r.status) return r;
    const e = isObj(r.body) ? r.body.error : null;
    if (r.status === 202) return { ok: true };
    if (r.status === 400 && e === "bad-text") return fail("leer", 400);
    if (r.status === 409) return fail("doppelt", 409);
    if (r.status === 410) return fail("zu-spaet", 410);
    if (r.status === 404) return fail("unbekannt", 404);
    return common(r.status, r.body);
  }

  return { here, status, me, loginHref, logoutFrom, profileGet, profilePut, profileDelete, redeem, modMe, appeal };
}
