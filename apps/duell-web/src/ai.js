/* My Daily Idea: the AI actions in the page. The server counts, queues and decides; this file shows the count, asks and
   says honestly what came back: a result, "AI busy (place N)", "not reachable", "used up" or "blocked". It never dresses a
   local suggestion up as an AI answer. Only typed text leaves the device, never a photo. */
(function (root) {
  "use strict";
  var TIMEOUT = 25000, WAIT_MAX = 60000, PAUSE = 500, PROOF_BITS = 16;
  var REASONS = ["harm", "sex", "hate", "private", "wrong", "other"];
  // A crisis is nobody's to answer, least of all a model's. The one place for it in the page: the same unambiguous words
  // as CRISIS in CADS-DEMO-wrapper lib/duell-ai.mjs (folded like foldForFilter there), checked before anything is sent,
  // so such a text never leaves the device and the help shows at once, also offline and on the way without AI. Only for
  // the kinds the server checks too ("lach mich tot" on a meme is a joke). Whether a bare "ritzen" means a cut needs the
  // context around it; that stays with the server (selfCut). The page adds a few frequent words of young people the server
  // list lacks ("ich ritze mich", "keinen Bock mehr zu leben", "hasse mein Leben"): stricter here only means the help comes
  // sooner and nothing is sent. The help is always our own text aiCrisis, never the server's.
  var CRISIS_KINDS = ["plan", "liste", "quiz", "welt", "text"];
  var CRISIS = /suizid|selbstmord|selbstverletz|umbring|umzubring|nicht mehr leben|will sterben|sterben will|lebensmud|\bbringe? mich um\b|\b(will|mochte|ware|war) (einfach |lieber )?tot( sein)?\b|\britz(e|te)? mich\b|\b(lust|bock|sinn|grund) mehr (zu|auf|aufs) leben\b|\bhasse mein leben\b|\btu(e|n)? mir (was|etwas) an\b|\bmir (was|etwas) (an ?tun|anzutun)\b|\bkys\b|kill myself|suicid|self.?harm|want to die|end my life/;
  var LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "\u20ac": "e", "!": "i" };
  function crisis(text) {
    var f = String(text == null ? "" : text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\u00df/g, "ss");
    return CRISIS.test(f.replace(/[0134578@$\u20ac!]/g, function (c) { return LEET[c]; }).replace(/\s+/g, " "));
  }
  // Every text in a request, joined: what crisis() looks at.
  function texts(v) { return typeof v === "string" ? v : v && typeof v === "object" ? Object.keys(v).map(function (k) { return texts(v[k]); }).join(" ") : ""; }
  // What the server's answer means for the page.
  function verdict(status, json) {
    if (status === 200 && json && Array.isArray(json.options) && json.options.length) return "result";
    if (status === 202 && json && ticket(json)) return "queued";
    if (status === 429 && json && json.error === "quota") return "quota";
    if (status === 422) return "blocked";
    if (status === 429 || status === 409) return "busy";      // the AI is there but full, or this person already waits
    return "off";                           // gone, broken, ticket lapsed or offline: said as such, nothing is made up
  }
  // The queue counts from 0 (running now) and 1 (next); 0 shows as "thinking", so only a real place in line is a number.
  function place(json) { var n = Number(json && (json.position != null ? json.position : json.queue && json.queue.position)); return Number.isInteger(n) && n >= 1 && n <= 9999 ? n : 0; }
  function ticket(json) { return json && typeof json.ticket === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(json.ticket) ? json.ticket : ""; }
  function okSeal(x) { return typeof x === "string" && /^[A-Za-z0-9._~-]{8,200}$/.test(x) ? x : ""; }
  function receipt(json) { return json && typeof json.receipt === "string" && /^[A-Za-z0-9._~:-]{4,400}$/.test(json.receipt) ? json.receipt : ""; }
  function okHash(x) { return typeof x === "string" && /^[A-Za-z0-9_-]{43}$/.test(x) ? x : ""; }
  /* The option as one exact text, the same rule as canonical() in CADS-DEMO-wrapper lib/duell-seal.mjs: JSON without
     spaces, object keys sorted like Array.prototype.sort (UTF-16 code units), array order kept, undefined left out of an
     object and null in an array, strings and numbers exactly as JSON.stringify writes them. */
  function canonical(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return "[" + v.map(function (x) { return canonical(x === undefined ? null : x); }).join(",") + "]";
    return "{" + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
  }
  /* h: base64url(SHA-256(UTF-8(canonical(option)))) without padding, 43 characters. It travels in the sheet next to the
     seal (doc.ki.h), so a report can name the option the seal was made for without carrying the option itself.
     "" when this device cannot hash (no crypto.subtle): the sheet then simply has no h, like every sheet before it. */
  async function optionHash(opt, subtle) {
    try {
      var d = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(canonical(opt)))), s = "";
      for (var i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
      return okHash(btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    } catch (e) { return ""; }
  }
  // One seal per option (seals[i] belongs to options[i]); a bad one is simply left out.
  function seals(json) { var a = json && Array.isArray(json.seals) ? json.seals : []; return json.options.map(function (x, i) { return okSeal(a[i]); }); }
  // The page names a path; queue and report sit next to the AI on the server, the rest below it. iOS maps the same names.
  var ROOT = { "/queue": 1, "/report": 1 };
  function endpoint(api, path) { var r = String(api).replace(/\/(config|ai)$/, ""); return r + (ROOT[path] ? path : "/ai" + path); }

  /* The client adapter: one place that speaks the server's protocol (CADS-DEMO-wrapper, "Schnittstellen fuer die App").
     send(path, body) -> { status, json }; the path is one of the page's names, endpoint() turns it into the URL.
       POST ""         { kind, input, device, proof, lang, queue: "ticket" }     -> /api/duell/ai
         200 { options, seals[], cost, receipt?, meter }   result; charged when it is handed out
         202 { queued, ticket, position, etaS }            queued: the page asks "/queue" { ticket } until it is something else
         429 { error: "busy" | "quota" | ... } · 409 pending · 422 blocked · anything else: off
       POST "/queue"   { ticket }                 -> /api/duell/queue: the same answers, 404 when the ticket lapsed
       POST "/accept"  { device, receipt }        -> /api/duell/ai/accept: the person took an option, the charge is final
       POST "/discard" { device, receipt }        -> /api/duell/ai/discard: nothing taken or nothing changed, refund
     There is no cancel: a ticket nobody asks about for 15 s lapses on the server and costs nothing.
     A server without the queue never sends a ticket or a receipt: the same states, no waiting, nothing to settle.
     alive() (optional): false once the page left the sheet the action was for; the waiting then stops at once. */
  function client(o) {
    var sleep = o.sleep || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }, now = o.now || Date.now, max = o.waitMax || WAIT_MAX;
    function keep(json) { if (o.keep) o.keep(json); }
    var none = function (how, n, json) { return { how: how, options: [], seals: [], receipt: "", position: n || 0, why: json && typeof json.why === "string" ? json.why : "" }; };
    async function ask(body, onWait, alive) {
      var r, how, started = now(), last = 0, tk = "";
      try { r = await o.send("", Object.assign({}, body, { queue: "ticket" })); } catch (e) { return none("off"); }
      for (;;) {
        keep(r.json); how = verdict(r.status, r.json);
        if (how !== "queued") break;
        tk = ticket(r.json) || tk; last = place(r.json); if (onWait) onWait(last);
        await sleep(PAUSE);
        if (alive && !alive()) return none("gone");
        if (now() - started >= max) return none("busy", last);
        try { r = await o.send("/queue", { ticket: tk }); } catch (e) { return none("off"); }
      }
      if (how !== "result") { var no = none(how, how === "busy" ? place(r.json) || last : 0); no.why = how === "blocked" && r.json && (r.json.why === "crisis" || r.json.why === "kind_ok") ? r.json.why : ""; return no; }
      return { how: how, options: r.json.options, seals: seals(r.json), receipt: receipt(r.json), position: 0 };
    }
    // Settle a handed-out result once: accept (taken) or discard (nothing taken, nothing changed). -> true when the server said yes.
    async function settle(path, device, rc) {
      if (!rc) return false;
      try { var r = await o.send(path, { device: device, receipt: rc }); keep(r.json); return r.status === 200; } catch (e) { return false; }
    }
    return { ask: ask, accept: function (d, rc) { return settle("/accept", d, rc); }, discard: function (d, rc) { return settle("/discard", d, rc); } };
  }
  // What a report carries (POST /api/duell/report): the reason, the sheet's own texts and type, its seal (with the
  // option's hash as optionHash) and short link when it has them. Never a photo, never the trail of nicknames, never a channel's riddles or answers. consent: the
  // person said yes in the dialog, which names what goes out. null when the reason is not one the server knows.
  function reportBody(doc, reason, link) {
    if (REASONS.indexOf(reason) < 0) return null;
    var c = { type: doc.k };
    ["t", "s", "x", "y", "w"].forEach(function (k) { if (typeof doc[k] === "string" && doc[k]) c[k] = doc[k]; });
    if (doc.g && typeof doc.g.title === "string") c.title = doc.g.title;
    if (doc.b && typeof doc.b.n === "string") c.rival = doc.b.n;
    if (Array.isArray(doc.ly) && doc.ly.length) c.ly = doc.ly.join(" / ");      // a song's hook
    if (doc.pk && typeof doc.pk === "object") c.quiz = doc.pk;      // a question pack: the questions are what is reported
    var b = { reason: reason, consent: true, content: c };
    if (doc.ki && doc.ki.k) b.kind = doc.ki.k;
    if (doc.ki && okSeal(doc.ki.s)) b.seal = doc.ki.s;
    if (b.seal && okHash(doc.ki.h)) b.optionHash = doc.ki.h;      // seal version s2 is checked against this hash
    if (typeof link === "string" && /^[A-Za-z0-9_-]{3,40}$/.test(link)) b.link = link;
    return b;
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
  var api = { verdict: verdict, place: place, endpoint: endpoint, client: client, reportBody: reportBody, REASONS: REASONS, solve: solve, count: count, canonical: canonical, optionHash: optionHash, crisis: crisis, texts: texts, CRISIS_KINDS: CRISIS_KINDS };

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
  // iOS loads the page from a file and blocks its network; there the shell makes these calls (same path names, its own
  // fixed list). Everywhere else: plain fetch. A report never carries a cookie.
  async function post(path, body) {
    var H = window.DuellHost, text = JSON.stringify(body);
    if (H && typeof H.ai === "function") { var r = await H.ai(path, text); var j = null; try { j = JSON.parse(r.body); } catch (e) { j = null; } return { status: r.status, json: j }; }
    if (navigator.onLine === false) throw new Error("offline");
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, TIMEOUT);
    try {
      var res = await fetch(endpoint(api0(), path), { method: "POST", headers: { "Content-Type": "application/json" }, body: text, signal: ctl.signal, credentials: path === "/report" ? "omit" : "same-origin", referrerPolicy: "no-referrer" });
      var json = null; try { json = await res.json(); } catch (e) { json = null; }
      return { status: res.status, json: json };
    } finally { clearTimeout(tm); }
  }
  // Nothing leaves the device before the first tap on an AI button, so the count shown until then is the last one this device saw.
  function keep(json) { if (json && json.meter) { meter = json.meter; Kit.store.aiMeter = meter; Kit.save(); } }
  var cl = client({ send: post, keep: keep });
  async function run(kind, input, onWait, alive) {
    return cl.ask({ kind: kind, input: input, device: device(), proof: await proof(), lang: Kit.lang }, onWait, alive);
  }
  // Results handed out but not settled yet (options nobody tapped). They go back when the person asks again or leaves.
  var open = [];
  function settle(rc, took) { var i = open.indexOf(rc); if (i < 0) return; open.splice(i, 1); (took ? cl.accept : cl.discard)(device(), rc).then(function () { refresh(); }); }
  function drop() { open.slice().forEach(function (rc) { settle(rc, false); }); }
  var shown = [];
  function refresh() { shown = shown.filter(function (c) { return c.isConnected; }); shown.forEach(function (c) { c.textContent = line(); }); }
  function line() { return count(meter, t); }
  function stateText(r) {
    if (r.how === "blocked") return t(r.why === "crisis" ? "aiCrisis" : r.why === "kind_ok" ? "aiKind" : "aiBlocked");   // crisis: the help line is our own text, never the server's
    if (r.how === "quota") return t("aiQuota");
    if (r.how === "busy") return r.position ? t("aiBusyAt", { n: r.position }) : t("aiBusy");
    return t("aiOff");
  }

  /* One AI action in a panel. o: { kind, label, el, input(), show(option) -> label, apply(option, ki), wall(), noteLast?,
       auto?(option, ki | null, res) -> false (or a promise of it) when it changed nothing, local?(input) -> option | null, alive?(), raw?(),
       crisis?(), reject?(option) }
     raw(): the typed text as it is, looked at for a crisis before input() runs its word filter over it.
     crisis(): true when the panel's own rule sees a crisis in what would be sent (as crisis() above: help, nothing sent).
     reject(option) -> "" or why it cannot be taken: shown as a note, not as a button; when no option can be taken, the
     answer goes back at once (discard), not only after a tap, a new ask or leaving.
     ki = { k: kind, s: seal, h: option hash } marks what the AI made; apply/auto get null for the rule-based way, which is labelled "without AI".
     auto may return a Promise: the result is then settled once the person decided (true taken, false given back).
     alive(): false once the sheet this panel was made for is gone; a late answer is then dropped (and refunded), never
     applied to whatever is open now. A result is settled once: accepted on the first take, refunded when nothing was
     taken or nothing changed. Returns the action itself, so a suggestion can start it with one tap. */
  function block(p, o) {
    var el = o.el, box = el("div", o.noteLast ? "aibox flat" : "aibox"), cnt = el("p", "aicount", line()), res = el("div", "chips");
    var go = el("button", "chip" + (o.noteLast ? " hot" : ""), "✨ " + o.label, act), mine = null, alive = o.alive || function () { return true; };
    cnt.setAttribute("aria-live", "polite"); shown.push(cnt);
    async function act() {
      if (busy) return;
      var crisisKind = CRISIS_KINDS.indexOf(o.kind) >= 0;
      if (crisisKind && o.raw && crisis(o.raw())) { help(res); return; }   // the typed text before input() filters words out of it
      var input = o.input(); if (!input) { if (!o.raw) Kit.toast(t("filter")); return; }
      if (crisisKind && (crisis(texts(input)) || (o.crisis && o.crisis()))) { help(res); return; }   // nothing sent, nothing charged
      if (mine) { settle(mine, false); mine = null; }      // the options of the last answer were left untouched
      busy = true; go.disabled = true; go.textContent = "… " + t("aiThinking"); res.textContent = "";
      var r = await run(o.kind, input, function (n) { go.textContent = "… " + (n ? t("aiWait", { n: n }) : t("aiThinking")); }, alive);
      // Hashed while the button is still locked, so taking an option stays one synchronous step and a second tap cannot
      // hand back this answer's receipt before its options are shown. Only sealed options need a hash.
      var sub = window.crypto && window.crypto.subtle;
      var hs = r.how === "result" ? await Promise.all(r.options.map(function (opt, i) { return r.seals[i] ? optionHash(opt, sub) : ""; })) : [];
      busy = false; go.disabled = false; go.textContent = "✨ " + o.label; cnt.textContent = line();
      if (r.receipt) open.push(r.receipt);
      if (!alive()) { if (r.receipt) settle(r.receipt, false); return; }
      if (r.how === "gone") return;
      if (r.how === "result") {
        var rc = mine = r.receipt;
        var took = function (opt, i) {
          if (!alive()) return;
          var ki = { k: o.kind, s: r.seals[i] || "", h: hs[i] };
          var did = o.auto ? o.auto(opt, ki, res) : o.apply(opt, ki);
          if (did && typeof did.then === "function") { did.then(function (x) { if (mine === rc) mine = null; settle(rc, x !== false); }, function () { if (mine === rc) mine = null; settle(rc, false); }); return; }
          if (mine === rc) mine = null;
          settle(rc, did !== false);
        };
        if (o.auto) took(r.options[0], 0);
        else {
          var can = 0;
          r.options.forEach(function (opt, i) {
            var no = o.reject ? o.reject(opt) : "";
            if (no) { res.appendChild(el("p", "note aistate", no)); return; }
            can++; res.appendChild(el("button", "chip aiopt", o.show(opt), function () { Kit.sfx.pop(); took(opt, i); }));
          });
          if (!can) { mine = null; settle(rc, false); }      // nothing here can be taken: given back now, nothing used
        }
        Kit.sfx.pop(); return;
      }
      if (r.how === "blocked" && r.why === "crisis") { help(res); return; }
      res.appendChild(el("p", "note aistate", stateText(r)));
      if (r.how === "quota") res.appendChild(el("button", "chip", "ⓘ " + t("aiTitle"), o.wall));
      var own = (r.how === "off" || r.how === "quota") && o.local ? o.local(input) : null;      // the marked way without AI; busy: just try again
      if (own && o.auto) o.auto(own, null, res);
    }
    // Help instead of an answer: the one crisis line aiCrisis (as for every kind), shown from the page's own words, offline too.
    // Scrolled to the middle, so the numbers in it are not left under the sheet's buttons below.
    function help(r) {
      if (mine) { settle(mine, false); mine = null; }
      r.textContent = "";
      var hb = el("p", "note aistate", t("aiCrisis")); hb.setAttribute("role", "alert");
      r.appendChild(hb);
      try { hb.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
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
      var a = el("a", "btn", t("aiLogin")); a.href = "/auth/login?return=" + encodeURIComponent("/duell"); a.addEventListener("click", Kit.look); b.appendChild(a);
    }
  }
  // Report a shared sheet: only after the person chose a reason and said yes in the dialog. -> true when the server took it.
  async function report(doc, reason, link) {
    var body = reportBody(doc, reason, link);
    if (!body) return false;
    try { var r = await post("/report", body); return r.status >= 200 && r.status < 300; } catch (e) { return false; }
  }
  window.Ai = { block: block, wall: wall, count: line, post: post, report: report, drop: drop, crisis: crisis, REASONS: REASONS };
})(typeof globalThis !== "undefined" ? globalThis : this);
