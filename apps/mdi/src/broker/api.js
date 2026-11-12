// Server-API fuer Konto, Profil, Guthaben und Moderation: der EINZIGE Ort mit fetch im App-Realm (Pruefung in
// test/build.test.js). Gleiche Herkunft wie die Seite (/duell auf dem Wrapper), Cookie nur same-origin, CSP
// connect-src 'self'. Jede Antwort wird hier auf eine feste Form geprueft und auf ein Ergebnis abgebildet; was nicht
// passt, ist ein Fehler mit Namen – nie ein stiller Rueckfall (A4). Entscheidungen trifft der Server (A5): die Seite
// zeigt nur, was er sagt.
// Server: CADS-DEMO-wrapper lib/auth.mjs (/auth/login, /auth/me), lib/duell-ai.mjs (/api/duell/ai/status),
// lib/duell-profile.mjs (/api/duell/profile/*), lib/duell-voucher.mjs (/api/duell/credit/redeem),
// lib/duell-deck.mjs + duell-mod.mjs (/api/duell/mod/me, /api/duell/mod/appeal). Antworten: test/fixtures/wrapper-konto.json.
// In den App-Huellen (iOS/Android) laufen dieselben Aufrufe ueber die Konto-Bruecke (src/broker/native.js): die Huelle
// meldet per OIDC + PKCE an und ruft den Server selbst mit Bearer auf; der Server loest Cookie ODER Bearer zur selben
// Identitaet auf (lib/auth.mjs identify). Die Seite sieht kein Token und trifft keine Entscheidung anders als im Web.

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
/** Look der Anmeldeseiten (Keycloak/Gate, CADS-Tunnel #890): Cookie ct_look = "daily.<hintergrund>.<akzent>" fuer
 *  bunsenbrenner.org, direkt vor dem Sprung zum Gate gesetzt (wie die alte App, profile.js lookCookie). Nur die zwei Farben
 *  reisen. Abseits von bunsenbrenner.org (file:, App-Huellen, Tests) -> null, es wird nichts gesetzt. */
export function lookCookie(colors, host) {
  host = String(host || "").toLowerCase();
  if (host !== "bunsenbrenner.org" && !/\.bunsenbrenner\.org$/.test(host)) return null;
  let c = Array.isArray(colors) ? colors.map((x) => String(x || "").toLowerCase()) : [];
  if (!/^#[0-9a-f]{6}$/.test(c[0]) || !/^#[0-9a-f]{6}$/.test(c[1])) c = ["#ffd400", "#ff3b1d"];
  return "ct_look=daily." + c[0].slice(1) + "." + c[1].slice(1) + "; Domain=bunsenbrenner.org; Path=/; Max-Age=86400; Secure; SameSite=Lax";
}

/**
 * Weg eines Aufrufs durch die App-Bruecke (exakte Pfade, bridge-account-v1.json). -> { method, path, body } | null
 *   GET /api/duell/deck/status?c=&d=     -> POST /api/duell/deck/status { c, d? }
 *   GET /api/s/<id>                      -> POST /api/s/get { id }
 *   DELETE /api/s/<id> (Bearer <token>)  -> POST /api/s/delete { id, token }
 *   GET /auth/me?return=&lang=           -> GET /auth/me (return/lang bilden nur die Gate-Adressen des Webs; die Huelle meldet
 *                                           selbst an und ab, me() nimmt in der App nur authenticated und app_login)
 *   jeder andere Pfad: unveraendert, aber ohne "?" und ohne eigene Koepfe (sonst null)
 */
export function appRoute(method, path, body, opt) {
  const st = /^\/api\/duell\/deck\/status\?c=([A-Za-z0-9_-]{22})(?:&d=([A-Za-z0-9_-]{43}))?$/.exec(path);
  if (method === "GET" && st) return { method: "POST", path: "/api/duell/deck/status", body: { c: st[1], ...(st[2] ? { d: st[2] } : {}) } };
  const sid = /^\/api\/s\/([2-9a-km-np-zA-HJ-NP-Z]{8})$/.exec(path);
  if (sid && method === "GET") return { method: "POST", path: "/api/s/get", body: { id: sid[1] } };
  const auth = opt && opt.headers && opt.headers.Authorization, tok = typeof auth === "string" ? /^Bearer ([A-Za-z0-9_-]{1,64})$/.exec(auth) : null;
  if (method === "GET" && /^\/auth\/me(\?return=[^&#]*(&lang=(de|en))?)?$/.test(path)) return { method, path: "/auth/me", body };
  if (sid && method === "DELETE" && tok) return { method: "POST", path: "/api/s/delete", body: { id: sid[1], token: tok[1] } };
  if (path.includes("?") || (opt && opt.headers && Object.keys(opt.headers).length)) return null;
  return { method, path, body };
}

export function createApi(deps) {
  const loc = deps.location || { protocol: "file:", host: "" };
  const native = deps.native || null;   // Konto-Bruecke der App-Huelle (src/broker/native.js) oder null
  const here = !!native || ((loc.protocol === "https:" || loc.protocol === "http:") && typeof (deps.fetch || globalThis.fetch) === "function");
  const doFetch = deps.fetch || ((u, o) => globalThis.fetch(u, o));
  const timeout = deps.timeout || 20000;

  /** App-Huelle: derselbe Aufruf, ausgefuehrt von der Huelle (mit Bearer, ohne Cookie). -> {status, body} | Fehler */
  async function viaApp(method, path, body, opt) {
    // Die Huellen leiten nur EXAKTE Pfade weiter und senden ihren eigenen Bearer (Konto). Was eine Abfrage, einen variablen
    // Pfad oder einen eigenen Kopf braucht, geht ueber den festen Pfad mit Body (Security-Review M6, Server additiv);
    // alles andere mit "?" wird abgelehnt statt still gekuerzt.
    const to = appRoute(method, path, body, opt);
    if (!to) return fail("pfad");
    const r = await native.call({ op: "api", method: to.method, path: to.path, ...(to.body !== undefined ? { body: JSON.stringify(to.body) } : {}) });
    if (!r || r.ok !== true || !Number.isSafeInteger(r.status)) return fail(r && r.error === "netz" ? "netz" : "server");
    let j = null; try { j = JSON.parse(r.body); } catch (e) { j = null; }
    return { status: r.status, body: j };
  }

  /** -> {status, body} | Fehler "nicht-hier"/"netz" */
  async function call(method, path, body, opt) {   // opt: { headers?, zeit? }
    if (native) return viaApp(method, path, body, opt);
    if (!here) return fail("nicht-hier");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), timeout) : null;
    try {
      const r = await doFetch(path, { method, credentials: "same-origin", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error",
        headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...((opt && opt.headers) || {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined });
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      return { status: r.status, body: j };
    } catch (e) { return fail(opt && opt.zeit && e && e.name === "AbortError" ? "zeit" : "netz"); }   // zeit: Strang K, nur raw()
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
      karte = { ...k, credit: int(c.credit) || 0, voucher: c.voucher === true, age16: c.age16 === true, age18: c.age18 === true, paused: c.paused === true, off: c.off === true, refundsLeft: int(c.refundsLeft) || 0 };   // refundsLeft: Strang K, additiv
    }
    if (!native) return { ok: true, account: m.account, canLogin: m.canLogin, ki, karte };
    // App: Anmelden geht, wenn der Server Bearer annimmt (app_login) UND die Huelle angemeldet werden kann
    const s = await native.call({ op: "state" }), me0 = await me();
    const appLogin = !!(s && s.ok === true && s.available === true && me0.ok && me0.appLogin);
    return { ok: true, account: m.account, canLogin: m.canLogin && appLogin, ki, karte, app: true };
  }

  /** GET /auth/me -> { ok, authenticated, logoutUrl } ; logoutUrl aus der Gate-Adresse des Servers abgeleitet (gleiche Herkunft wie login_url). */
  async function me(ret, lang) {
    const r = await call("GET", "/auth/me?return=" + encodeURIComponent(safeReturn(ret)) + (lang === "de" || lang === "en" ? "&lang=" + lang : ""));
    if (!r.status) return r;
    if (r.status !== 200 || !isObj(r.body) || typeof r.body.authenticated !== "boolean") return common(r.status, r.body);
    if (native) return { ok: true, authenticated: r.body.authenticated, logoutUrl: null, appLogin: r.body.app_login === true };
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

  /** App: Anmelden/Abmelden fuehrt die Huelle aus (System-Browser bzw. Tokens loeschen und widerrufen). -> {ok} */
  const appOp = async (op) => { const r = await native.call({ op }); return r && r.ok === true ? { ok: true, signedIn: r.signedIn === true } : fail("nicht-hier"); };
  const app = native ? { login: () => appOp("login"), logout: () => appOp("logout") } : null;

  // ---- Kurzlinks (Strang H; Server: CADS-DEMO-wrapper lib/shortlink.mjs) ----
  // POST /api/s { f, k, l } -> 201 { id, url, token, exp }. f ist das Fragment ohne "#", nur v2.card./v2.challenge.
  // (src/ui/home/shortlink.js SAFE; Live-Einladungen tragen ein Einmal-Token und gehen nie an den Server).
  const SHORT_ID = /^[2-9a-km-np-zA-HJ-NP-Z]{8}$/;
  /** -> { ok:true, s:{id, token, exp, url} } | Fehler form (Server kennt die Form nicht, 400) | limit | aus | server | netz | nicht-hier */
  // ohne Anmeldung: Geraete-Kennung + Arbeitsnachweis wie bei der KI (wrapper #136, Security-Review M2); angemeldet ignoriert der Server beides
  async function shortCreate(f, k, l, device, proof) {
    const r = await call("POST", "/api/s", { f, k, l, ...(device && proof ? { device, proof } : {}) });
    if (!r.status) return r;
    if (r.status === 400) return fail("form", 400);
    if (r.status !== 201) return common(r.status, r.body);
    const j = r.body;
    if (!isObj(j) || !SHORT_ID.test(j.id) || typeof j.token !== "string" || !Number.isSafeInteger(j.exp) || typeof j.url !== "string" || !/^https?:\/\/[^\s#]+\/s\/[2-9a-km-np-zA-HJ-NP-Z]{8}$/.test(j.url) || !j.url.endsWith("/s/" + j.id)) return fail("server", 201);
    return { ok: true, s: { id: j.id, token: j.token, exp: j.exp, url: j.url } };
  }
  /** DELETE /api/s/<id> mit Bearer-Token -> { ok:true } (204, oder 404/410: schon weg) | Fehler */
  async function shortDelete(id, token) {
    if (!SHORT_ID.test(id)) return fail("server");
    const r = await call("DELETE", "/api/s/" + id, undefined, { headers: { Authorization: "Bearer " + token } });
    if (!r.status) return r;
    return r.status === 204 || r.status === 404 || r.status === 410 ? { ok: true } : common(r.status, r.body);
  }
  /** GET /api/s/<id> -> { ok:true, f, exp } | Fehler weg (404/410) */
  async function shortResolve(id) {
    if (!SHORT_ID.test(id)) return fail("server");
    const r = await call("GET", "/api/s/" + id);
    if (!r.status) return r;
    if (r.status === 404 || r.status === 410) return fail("weg", r.status);
    if (r.status !== 200 || !isObj(r.body) || typeof r.body.f !== "string" || !Number.isSafeInteger(r.body.exp)) return fail("server", r.status);
    return { ok: true, f: r.body.f, exp: r.body.exp };
  }

  // ---- Strang K (freie Karte, KI, Deck, KI-Bild): additiv. Die Dienste in src/broker/ai.js, deck.js, bild.js bilden die
  // Antworten selbst ab; hier steht nur der Transport, damit fetch weiter genau an dieser Stelle steht (build.test). ----
  const RAW_PATHS = /^\/api\/duell\/(ai(\/(status|accept|discard))?|queue|report|deck(\/(key|use|vote|me))?|deck\/status\?c=[A-Za-z0-9_-]{22}(&d=[A-Za-z0-9_-]{43})?|bild(\/(status|job|cancel|keep|avatar))?)$/;
  /** Roher Aufruf eines erlaubten Pfads (nur diese Liste, nur gleiche Herkunft) -> {status, body} | Fehler nicht-hier/netz/pfad */
  async function raw(method, path, body) {
    if ((method !== "GET" && method !== "POST") || !RAW_PATHS.test(path)) return fail("pfad");
    return call(method, path, body, { zeit: true });   // "zeit" (Zeitueberschreitung) getrennt von "netz"
  }
  /** Ein KI-Bild als data:-URL (img-src bleibt data:, CSP unveraendert). Nur Web; die App-Bruecke reicht keine Binaerdaten. */
  async function image(path) {
    if (!/^\/duell\/bild\/[A-Za-z0-9_-]{22}\.(jpg|png)$/.test(path)) return fail("pfad");
    if (native || !here) return fail("nicht-hier");
    try {
      const r = await doFetch(path, { method: "GET", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" });
      if (r.status !== 200) return fail(r.status === 404 ? "weg" : "server", r.status);
      const type = String(r.headers.get("content-type") || "");
      if (type !== "image/jpeg" && type !== "image/png") return fail("server", 200);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 3e6) return fail("zu-gross");
      let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { ok: true, url: "data:" + type + ";base64," + btoa(s) };
    } catch (e) { return fail("netz"); }
  }

  // ---- Wetter (Strang H fuer P: Feld weather; Server CADS-DEMO-wrapper lib/duell-weather.mjs, echte Zahlen oder keine) ----
  /** POST /api/duell/weather { place, date } -> { ok:true, body:{place,date,hi,lo,rain,code} } | Fehler no-place|blocked|date-range|limit|server|netz|nicht-hier */
  async function weather(place, date) {
    const r = await call("POST", P + "/weather", { place, date });
    if (!r.status) return r;
    if (r.status === 404) return fail("no-place", 404);
    if (r.status === 422) return fail(isObj(r.body) && r.body.error === "date-range" ? "date-range" : "blocked", 422);
    if (r.status !== 200) return common(r.status, r.body);
    return isObj(r.body) ? { ok: true, body: r.body } : fail("server", 200);
  }

  return { here, app, status, me, loginHref, logoutFrom, profileGet, profilePut, profileDelete, redeem, modMe, appeal, raw, image, shortCreate, shortDelete, shortResolve, weather };
}
