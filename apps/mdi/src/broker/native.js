// Konto-Bruecke der App-Huellen (iOS WKWebView, Android WebView), Vertrag v1. Die Seite bekommt NIE ein Token: die Huelle
// meldet an (OIDC + PKCE im System-Browser), haelt die Tokens im Keychain/Keystore und fuehrt die Server-Aufrufe selbst
// aus (Authorization: Bearer). Hier wird nur der Kanal in eine Funktion call(req) -> Promise<Antwort> uebersetzt.
//
// Anfragen:  { v:1, op:"state" }                      -> { v:1, ok:true, available, signedIn }
//            { v:1, op:"login" } | { v:1, op:"logout" } -> { v:1, ok:true, signedIn }
//            { v:1, op:"api", method, path, body? }    -> { v:1, ok:true, status, body:string } | { ok:false, error }
// Kanaele:   iOS     window.DuellHost.account(req) -> Promise (WKScriptMessageHandlerWithReply "account")
//            Android window.MdiAccount (WebMessageListener, nur fuer die eigene Asset-Herkunft): postMessage(JSON mit id),
//                    Antwort als message-Ereignis mit derselben id.
// Ohne einen der beiden Kanaele: null (Web: Konto ueber das Gate-Cookie, wie bisher).

const LONG = { login: 600000, logout: 60000 };   // Anmelden wartet auf die Person im Browser

/**
 * @param {object} win   das globale Objekt der Seite (nur main.js reicht es herein)
 * @param {{timeout?:number}} [o]
 * @returns {{call:(req:object)=>Promise<object>}|null}
 */
export function nativeAccount(win, o = {}) {
  if (!win || typeof win !== "object") return null;
  const timeout = o.timeout || 30000;
  const host = win.DuellHost;
  const withTimeout = (p, ms) => new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: "netz" }), ms);
    Promise.resolve(p).then((r) => { clearTimeout(t); resolve(r); }, () => { clearTimeout(t); resolve({ ok: false, error: "refused" }); });
  });
  const shape = (r) => (r && typeof r === "object" && !Array.isArray(r) ? r : { ok: false, error: "refused" });

  if (host && typeof host.account === "function") {
    return { call: (req) => withTimeout(Promise.resolve().then(() => host.account({ v: 1, ...req })).then(shape), LONG[req.op] || timeout) };
  }
  const ch = win.MdiAccount;
  if (ch && typeof ch.postMessage === "function") {
    const pending = new Map();
    let seq = 0;
    const onMsg = (e) => {
      let m = null;
      try { m = JSON.parse(typeof e === "string" ? e : e && e.data); } catch (x) { m = null; }
      if (!m || typeof m !== "object" || typeof m.id !== "number" || !pending.has(m.id)) return;
      const f = pending.get(m.id); pending.delete(m.id); f(m);
    };
    if (typeof ch.addEventListener === "function") ch.addEventListener("message", onMsg); else ch.onmessage = onMsg;
    return {
      call: (req) => {
        const id = ++seq;
        const p = new Promise((resolve) => { pending.set(id, resolve); });
        try { ch.postMessage(JSON.stringify({ v: 1, ...req, id })); } catch (x) { pending.delete(id); return Promise.resolve({ ok: false, error: "refused" }); }
        return withTimeout(p.then(shape), LONG[req.op] || timeout).then((r) => { pending.delete(id); return r; });
      }
    };
  }
  return null;
}
