// KI-Bild auf Wunsch (Strang K): Bild fuer eine Karte, ein Logo oder das Kontobild, mit Kontingent.
// Server: CADS-DEMO-wrapper lib/duell-bild.mjs. Altcode (Untergrenze): kibild.js. Preis (Entscheidung): 3 Bilder im Monat
// gratis, danach 1 Guthaben je Bild; Kontobild nur mit Guthaben. Abbrechen gibt nur in der Schlange zurueck.
//
//   POST /api/duell/bild/status  -> { on, login, age16, free:{left,size,period}, credit, perDay:{left,size}, can, why, avatar, estS, deadlineS }
//   POST /api/duell/bild         { use, text, style, lang } -> 202 { job, state, position, etaS, paid } | 401 | 402 quota|credit | 403 age16|account-paused
//                                | 422 refused{reason} | blocked{reason|why:crisis} | 429 busy{position,etaS,retryS}|daily-cap|throttled | 503 off|check-off
//   POST /api/duell/bild/job     { job } -> { state: queued|generating|checking, position?, etaS? } | { state:"done", id, url, seal } | { state:"failed", error, refunded }
//   POST /api/duell/bild/cancel  { job } -> { cancelled, refunded }
//   POST /api/duell/bild/keep    { id } -> { kept }
//   POST /api/duell/bild/avatar  { id|null } -> { avatar }
//   GET  /duell/bild/<id>.<jpg|png>  das Bild (hier als data:-URL ueber api.image, img-src bleibt data:)
import { crisis } from "./ai.js";

export const USES = ["card", "logo", "avatar"];
export const STYLES = ["foto", "comic", "aquarell", "pixel", "sticker"];
const JOB = /^[A-Za-z0-9_-]{8,40}$/, ID = /^[A-Za-z0-9_-]{22}$/, URL_RE = /^\/duell\/bild\/[A-Za-z0-9_-]{22}\.(jpg|png)$/;
const int = (x) => (Number.isSafeInteger(x) && x >= 0 ? x : 0);

/** Antwort von /bild auf einen Grund abbilden (fester Text beim Client, nie Servertext). */
export function bildVerdict(status, b) {
  b = b && typeof b === "object" ? b : {};
  if (status === 202 && typeof b.job === "string" && JOB.test(b.job)) return "queued";
  if (status === 401) return "login";
  if (status === 402) return b.error === "credit" ? "credit" : "quota";
  if (status === 403) return b.error === "age16" ? "age16" : "modpause";
  if (status === 422) return b.why === "crisis" ? "crisis" : b.error === "refused" ? "refused" : "blocked";
  if (status === 429) return b.error === "daily-cap" ? "daily" : b.error === "throttled" ? "paused" : "busy";
  return "off";
}

/** @param {{api:{raw:Function, image:Function}, sleep?:Function, now?:Function}} deps */
export function createBild(deps) {
  const api = deps.api, sleep = deps.sleep || ((ms) => new Promise((ok) => setTimeout(ok, ms))), now = deps.now || (() => Date.now());
  async function status() {
    const r = await api.raw("POST", "/api/duell/bild/status", {});
    if (!r.status) return { ok: false, error: r.error || "netz" };
    const b = r.body;
    if (r.status !== 200 || !b || typeof b.on !== "boolean") return { ok: false, error: "server" };
    if (b.login !== true) return { ok: true, on: b.on, login: false };
    const why = (u) => (b.why && typeof b.why[u] === "string" ? b.why[u] : "");
    return { ok: true, on: b.on, login: true, age16: b.age16 === true, free: { left: int(b.free && b.free.left), size: int(b.free && b.free.size) }, credit: int(b.credit), perDay: { left: int(b.perDay && b.perDay.left), size: int(b.perDay && b.perDay.size) },
      can: Object.fromEntries(USES.map((u) => [u, !!(b.can && b.can[u] === true)])), why: Object.fromEntries(USES.map((u) => [u, why(u)])), avatar: typeof b.avatar === "string" && URL_RE.test(b.avatar) ? b.avatar : null };
  }
  /**
   * Ein Bild bis zum Ende. onPhase(state, position). alive() false -> cancel (gibt in der Schlange zurueck).
   * -> { how:"done", id, url, dataUrl, seal } | { how, reason?, position?, refunded? }
   */
  async function make({ use, text, style, lang }, onPhase = () => {}, alive = () => true) {
    if (!USES.includes(use)) return { how: "off" };
    const t = String(text || "").trim();
    if ([...t].length < 3 || [...t].length > 200) return { how: "kurz" };
    if (crisis(t)) return { how: "crisis" };   // nichts gesendet
    onPhase("send", 0);
    const r = await api.raw("POST", "/api/duell/bild", { use, text: t, style: STYLES.includes(style) ? style : "comic", lang: lang === "en" ? "en" : "de" });
    if (!r.status) return { how: "off" };
    const how = bildVerdict(r.status, r.body);
    if (how !== "queued") return { how, reason: r.body && typeof r.body.reason === "string" ? r.body.reason.slice(0, 20) : "", position: int(r.body && r.body.position), etaS: int(r.body && r.body.etaS), retryS: int(r.body && r.body.retryS) };
    const job = r.body.job, started = now();
    for (;;) {
      if (!alive()) { const c = await api.raw("POST", "/api/duell/bild/cancel", { job }); return { how: "gone", refunded: !!(c.body && c.body.refunded) }; }
      const p = await api.raw("POST", "/api/duell/bild/job", { job });
      const b = p.status === 200 && p.body ? p.body : null;
      if (now() - started > 60000) { await api.raw("POST", "/api/duell/bild/cancel", { job }); return { how: "failed", reason: "timeout", refunded: false }; }   // harte Grenze (Server: 30 s)
      if (!b) { await sleep(1000); continue; }
      if (b.state === "done") {
        if (typeof b.id !== "string" || !ID.test(b.id) || typeof b.url !== "string" || !URL_RE.test(b.url)) return { how: "off" };
        const img = await api.image(b.url);
        return img.ok ? { how: "done", id: b.id, url: b.url, dataUrl: img.url, seal: typeof b.seal === "string" ? b.seal : "" } : { how: "off" };
      }
      if (b.state === "failed") return { how: "failed", refunded: b.refunded === true, reason: typeof b.error === "string" ? b.error.slice(0, 20) : "" };
      onPhase(b.state, int(b.position));
      await sleep(1000);
    }
  }
  const keep = async (id) => (ID.test(id) ? (await api.raw("POST", "/api/duell/bild/keep", { id })).status === 200 : false);
  async function avatar(id) {
    const r = await api.raw("POST", "/api/duell/bild/avatar", { id: id === null ? null : id });
    return r.status === 200 ? { ok: true, avatar: r.body && typeof r.body.avatar === "string" && URL_RE.test(r.body.avatar) ? r.body.avatar : null } : { ok: false };
  }
  return { status, make, keep, avatar };
}
