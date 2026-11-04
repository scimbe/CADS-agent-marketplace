/* My Daily Idea: the AI actions in the page. The server counts, queues and decides; this file shows the count, asks and
   says honestly what came back: a result, "AI busy (place N)", "not reachable", "used up" or "blocked". It never dresses a
   local suggestion up as an AI answer. Only typed text leaves the device, never a photo. */
(function (root) {
  "use strict";
  var TIMEOUT = 25000, WAIT_MAX = 60000, PROOF_BITS = 16;
  // What the server's answer means for the page.
  function verdict(status, json) {
    if (status === 200 && json && Array.isArray(json.options) && json.options.length) return "result";
    if (status === 202 && json && ticket(json)) return "queued";
    if (status === 429 && json && json.error === "quota") return "quota";
    if (status === 422) return "blocked";
    if (status === 429) return "busy";      // the AI is there but full
    return "off";                           // gone, broken or offline: said as such, nothing is made up
  }
  function place(json) { var n = Number(json && (json.position != null ? json.position : json.queue && json.queue.position)); return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : 0; }
  function ticket(json) { return json && typeof json.ticket === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(json.ticket) ? json.ticket : ""; }
  function seal(json) { return json && typeof json.seal === "string" && /^[A-Za-z0-9._~-]{8,200}$/.test(json.seal) ? json.seal : ""; }
  function pause(json) { var w = Number(json && json.wait); return Number.isFinite(w) ? Math.max(500, Math.min(5000, w)) : 1500; }

  /* The client adapter: one place that speaks the server's protocol. send(path, body) -> { status, json }.
       POST ""         { v: 2, kind, input, device, proof, lang }
         200 { options, meter, seal?, ticket? }   result; with a ticket the action is only charged on /confirm
         202 { ticket, position, wait? }          queued: the page asks "/wait" { device, ticket } until it is something else
         429 { error: "busy", position? } | { error: "quota" } · 422 blocked · anything else: off
       POST "/wait"    { device, ticket }        -> same answers as above
       POST "/confirm" { device, ticket }        the person took an option -> { meter, seal? }
       POST "/cancel"  { device, ticket }        the page stopped waiting (best effort)
     A server without the queue (v1) never sends a ticket: the same states, no waiting, nothing to confirm. */
  function client(o) {
    var sleep = o.sleep || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }, now = o.now || Date.now, max = o.waitMax || WAIT_MAX;
    function keep(json) { if (o.keep) o.keep(json); }
    async function ask(body, onWait) {
      var r, how, started = now(), last = 0;
      try { r = await o.send("", Object.assign({ v: 2 }, body)); } catch (e) { return { how: "off", options: [], position: 0 }; }
      for (;;) {
        keep(r.json); how = verdict(r.status, r.json);
        if (how !== "queued") break;
        var tk = ticket(r.json); last = place(r.json) || last; if (onWait) onWait(last);
        await sleep(pause(r.json));
        if (now() - started >= max) { o.send("/cancel", { device: body.device, ticket: tk }).catch(function () {}); how = "busy"; break; }
        try { r = await o.send("/wait", { device: body.device, ticket: tk }); } catch (e) { return { how: "off", options: [], position: 0 }; }
      }
      return { how: how, options: how === "result" ? r.json.options : [], seal: how === "result" ? seal(r.json) : "", ticket: how === "result" ? ticket(r.json) : "", position: how === "busy" || how === "queued" ? place(r.json) || last : 0 };
    }
    // -> the server's seal for the taken option, or "" (old server, offline: the action simply stays as it was answered)
    async function confirm(device, tk) {
      if (!tk) return "";
      try { var r = await o.send("/confirm", { device: device, ticket: tk }); keep(r.json); return r.status === 200 ? seal(r.json) : ""; } catch (e) { return ""; }
    }
    return { ask: ask, confirm: confirm };
  }
  // What a report carries: the sheet's own texts, its type and its seal. Never a photo, never the trail of nicknames,
  // never a channel's riddles or answers.
  function reportBody(doc, lang) {
    var c = {};
    ["t", "s", "x", "y", "w"].forEach(function (k) { if (typeof doc[k] === "string" && doc[k]) c[k] = doc[k]; });
    if (doc.g && typeof doc.g.title === "string") c.title = doc.g.title;
    if (doc.b && typeof doc.b.n === "string") c.rival = doc.b.n;
    return { v: 1, type: doc.k, kind: doc.ki ? doc.ki.k : "", seal: (doc.ki && doc.ki.s) || "", lang: lang === "en" ? "en" : "de", content: c };
  }
  // The small proof of work a new device shows once: a number whose SHA-256 with the device id starts with `bits` zero bits.
  async function solve(device, bits, subtle) {
    var enc = new TextEncoder();
    for (var n = 0; ; n++) {
      var h = new Uint8Array(await subtle.digest("SHA-256", enc.encode(device + ":" + n.toString(36)))), ok = true;
      for (var i = 0, left = bits; left > 0 && ok; i++, left -= 8) ok = !(h[i] >> Math.max(0, 8 - left));
      if (ok) return n.toString(36);
    }
  }
  // The count as one line, always visible: what is left and of how much. No streak, no countdown.
  function count(meter, t) {
    if (!meter) return t("aiCountNew");
    if (meter.abo) return t("aiCountAbo", { n: meter.remaining });
    return t(meter.period === "week" ? "aiCountWeek" : "aiCount", { n: meter.remaining, m: meter.free });
  }
  var api = { verdict: verdict, place: place, client: client, reportBody: reportBody, solve: solve, count: count };

  if (typeof window === "undefined") { if (typeof module !== "undefined" && module.exports) module.exports = api; return; }

  var Kit = window.Kit, C = window.DuellCore, t = Kit.t, meter = Kit.store.aiMeter || null, busy = false;
  function device() {
    var s = Kit.store;
    if (typeof s.aiDev !== "string" || !/^[a-f0-9]{32}$/.test(s.aiDev)) {
      var b = new Uint8Array(16); crypto.getRandomValues(b);
      s.aiDev = Array.from(b).map(function (x) { return (x + 256).toString(16).slice(1); }).join(""); Kit.save();
    }
    return s.aiDev;
  }
  async function proof() {
    if (typeof Kit.store.aiProof !== "string") { Kit.store.aiProof = await solve(device(), PROOF_BITS, crypto.subtle); Kit.save(); }
    return Kit.store.aiProof;
  }
  function api0() { return window.DUELL_API || C.DEFAULT_API; }
  function base() { return api0().replace(/\/config$/, "/ai"); }
  // iOS loads the page from a file and blocks its network; there the shell makes this one call. Everywhere else: plain fetch.
  async function post(path, body) {
    var H = window.DuellHost, text = JSON.stringify(body);
    if (H && typeof H.ai === "function") { var r = await H.ai(path, text); return { status: r.status, json: JSON.parse(r.body) }; }
    if (navigator.onLine === false) throw new Error("offline");
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, TIMEOUT);
    try {
      var res = await fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: text, signal: ctl.signal, credentials: "same-origin", referrerPolicy: "no-referrer" });
      var json = null; try { json = await res.json(); } catch (e) { json = null; }
      return { status: res.status, json: json };
    } finally { clearTimeout(tm); }
  }
  // Nothing leaves the device before the first tap on an AI button, so the count shown until then is the last one this device saw.
  function keep(json) { if (json && json.meter) { meter = json.meter; Kit.store.aiMeter = meter; Kit.save(); } }
  var cl = client({ send: post, keep: keep });
  async function run(kind, input, onWait) {
    return cl.ask({ kind: kind, input: input, device: device(), proof: await proof(), lang: Kit.lang }, onWait);
  }
  function line() { return count(meter, t); }
  function stateText(r) {
    if (r.how === "blocked") return t("aiBlocked");
    if (r.how === "quota") return t("aiQuota");
    if (r.how === "busy") return r.position ? t("aiBusyAt", { n: r.position }) : t("aiBusy");
    return t("aiOff");
  }

  /* One AI action in a panel. o: { kind, label, el, input(), show(option) -> label, apply(option, ki), wall(), noteLast?,
       auto?(option, ki | null, res), local?(input) -> option | null, reseal?(ki) }
     ki = { k: kind, s: seal } marks what the AI made; apply/auto get null for the rule-based way, which is labelled "without AI".
     Returns the action itself, so a suggestion can start it with one tap. noteLast: the caller puts the privacy note at the end. */
  function block(p, o) {
    var el = o.el, box = el("div", o.noteLast ? "aibox flat" : "aibox"), cnt = el("p", "aicount", line()), res = el("div", "chips");
    var go = el("button", "chip" + (o.noteLast ? " hot" : ""), "✨ " + o.label, act);
    cnt.setAttribute("aria-live", "polite");
    async function act() {
      if (busy) return;
      var input = o.input(); if (!input) { Kit.toast(t("filter")); return; }
      busy = true; go.disabled = true; go.textContent = "… " + t("aiThinking"); res.textContent = "";
      var r = await run(o.kind, input, function (n) { go.textContent = "… " + (n ? t("aiWait", { n: n }) : t("aiThinking")); });
      busy = false; go.disabled = false; go.textContent = "✨ " + o.label; cnt.textContent = line();
      if (r.how === "result") {
        var took = function (opt) {
          var ki = { k: o.kind, s: r.seal };
          if (o.auto) o.auto(opt, ki, res); else o.apply(opt, ki);
          cl.confirm(device(), r.ticket).then(function (s) { cnt.textContent = line(); if (s && o.reseal) { ki.s = s; o.reseal(ki); } });
        };
        if (o.auto) took(r.options[0]);
        else r.options.forEach(function (opt) { res.appendChild(el("button", "chip aiopt", o.show(opt), function () { Kit.sfx.pop(); took(opt); })); });
        Kit.sfx.pop(); return;
      }
      res.appendChild(el("p", "note aistate", stateText(r)));
      if (r.how === "quota") res.appendChild(el("button", "chip", "ⓘ " + t("aiTitle"), o.wall));
      var own = (r.how === "off" || r.how === "quota") && o.local ? o.local(input) : null;      // the marked way without AI; busy: just try again
      if (own && o.auto) o.auto(own, null, res);
    }
    var row = el("div", "airow");
    row.appendChild(go); row.appendChild(cnt);
    if (!o.noteLast) box.appendChild(el("p", "note", t("aiNote")));
    box.appendChild(row); box.appendChild(res);
    p.appendChild(box);
    return act;
  }
  // The honest wall: no price, no countdown, nothing to buy yet.
  function wall(b, el) {
    b.appendChild(el("div", "empty", t("aiSoon")));
    b.appendChild(el("p", "note", t("aiUsed", { m: meter ? meter.free : 3 })));
    b.appendChild(el("p", "note", t("aiNoBuy")));
    var ok = el("button", "btn", meter && meter.interest ? t("aiNoted") : t("aiWant"), async function () {
      ok.disabled = true;
      try { var r = await post("/interest", { device: device() }); keep(r.json); ok.textContent = t("aiNoted"); } catch (e) { ok.disabled = false; Kit.toast(t("aiNet")); }
    });
    ok.disabled = !!(meter && meter.interest); b.appendChild(ok);
    b.appendChild(el("p", "note", t("aiWantNote")));
    if (meter && meter.canLogin && !window.DuellHost) {
      var a = el("a", "btn", t("aiLogin")); a.href = "/auth/login?return=" + encodeURIComponent("/duell"); b.appendChild(a);
    }
  }
  // Report an AI sheet: only after the person said yes in the dialog. -> true when the server took it.
  async function report(doc) {
    var H = window.DuellHost, text = JSON.stringify(reportBody(doc, Kit.lang));
    try {
      if (H && typeof H.report === "function") { var h = await H.report(text); return h.status >= 200 && h.status < 300; }
      if (navigator.onLine === false) return false;
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, TIMEOUT);
      try {
        var res = await fetch(api0().replace(/\/config$/, "/report"), { method: "POST", headers: { "Content-Type": "application/json" }, body: text, signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
        return res.status >= 200 && res.status < 300;
      } finally { clearTimeout(tm); }
    } catch (e) { return false; }
  }
  window.Ai = { block: block, wall: wall, count: line, post: post, report: report };
})(typeof globalThis !== "undefined" ? globalThis : this);
