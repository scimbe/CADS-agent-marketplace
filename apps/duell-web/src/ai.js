/* My Daily Idea: the AI actions in the page. The server counts and decides; this file shows the count, asks, and falls back
   to local suggestions at once whenever the answer is anything but a result. Only typed text leaves the device, never a photo. */
(function (root) {
  "use strict";
  var TIMEOUT = 25000;
  var HOOKS = {
    de: [["Beat läuft, ich bleib dran", "Heute fängt was Neues an", "Hände hoch, wer das kann", "Mein Tag, mein Plan"], ["Kick und Snare, ich bin da", "Alles klar, alles wahr", "Einmal hin und wieder her", "Noch ein Takt, ich will mehr"]],
    en: [["Beat is on, I'm feeling right", "Got my plan for day and night", "Hands up if you know the line", "This one here is mine"], ["Kick and snare, I'm on my way", "Nothing stops me here today", "One more round and one more try", "Watch this little rhythm fly"]]
  };
  // Suggestions from the app's own ideas. pick(n) -> random index. No network, no count.
  function local(kind, ideas, lang, pick, topic) {
    var pool = ideas.filter(function (i) { return i.kind === (kind === "line" ? "card" : kind === "meme" ? "photo" : "none"); });
    var three = function (a) { var o = a.slice(), out = []; while (o.length && out.length < 3) out.push(o.splice(pick(o.length), 1)[0]); return out; };
    if (kind === "line") {
      var lines = []; pool.forEach(function (i) { lines = lines.concat((i[lang] || i.de).lines || []); });
      return three(lines.filter(function (l) { return Array.from(l).length <= 90; }));
    }
    if (kind === "meme") return three(pool.map(function (i) { var L = i[lang] || i.de; return { top: L.top, bottom: L.bottom }; }).filter(function (o) { return o.top && o.bottom; }));
    var set = HOOKS[lang] || HOOKS.de;
    return [{ title: Array.from(topic || "Mein Beat").slice(0, 28).join(""), lines: set[pick(set.length)] }];
  }
  // What the server's answer means for the page.
  function verdict(status, json) {
    if (status === 200 && json && Array.isArray(json.options) && json.options.length) return "result";
    if (status === 429 && json && json.error === "quota") return "quota";
    if (status === 422) return "blocked";
    return "local";
  }
  var api = { local: local, verdict: verdict, HOOKS: HOOKS };

  if (typeof window === "undefined") { if (typeof module !== "undefined" && module.exports) module.exports = api; return; }

  var Kit = window.Kit, C = window.DuellCore, D = window.Daily, t = Kit.t, meter = Kit.store.aiMeter || null, busy = false;
  function device() {
    var s = Kit.store;
    if (typeof s.aiDev !== "string" || !/^[a-f0-9]{32}$/.test(s.aiDev)) {
      var b = new Uint8Array(16); crypto.getRandomValues(b);
      s.aiDev = Array.from(b).map(function (x) { return (x + 256).toString(16).slice(1); }).join(""); Kit.save();
    }
    return s.aiDev;
  }
  function base() { return (window.DUELL_API || C.DEFAULT_API).replace(/\/config$/, "/ai"); }
  // iOS loads the page from a file and blocks its network; there the shell makes this one call. Everywhere else: plain fetch.
  async function post(path, body) {
    var H = window.DuellHost, text = JSON.stringify(body);
    if (H && typeof H.ai === "function") { var r = await H.ai(path, text); return { status: r.status, json: JSON.parse(r.body) }; }
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, TIMEOUT);
    try {
      var res = await fetch(base() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: text, signal: ctl.signal, credentials: "same-origin", referrerPolicy: "no-referrer" });
      return { status: res.status, json: await res.json() };
    } finally { clearTimeout(tm); }
  }
  // Nothing leaves the device before the first tap on an AI button, so the count shown until then is the last one this device saw.
  function keep(json) { if (json && json.meter) { meter = json.meter; Kit.store.aiMeter = meter; Kit.save(); } }
  function randomPick(n) { return Math.floor(Math.random() * n); }
  // -> { how: result|local|quota|blocked, options }
  async function run(kind, input) {
    var lang = Kit.lang, how = "local", options = null;
    try {
      if (navigator.onLine === false) throw new Error("offline");
      var r = await post("", { kind: kind, input: input, device: device(), lang: lang });
      keep(r.json);
      how = verdict(r.status, r.json);
      if (how === "result") options = r.json.options;
    } catch (e) { how = "local"; }
    if (how === "blocked") return { how: how, options: [] };
    return { how: how, options: options || local(kind, D.IDEAS, lang, randomPick, input.topic) };
  }
  function line() {
    if (!meter) return t("aiCountNew");
    if (meter.abo) return t("aiCountAbo", { n: meter.remaining });
    return t("aiCount", { n: meter.remaining, m: meter.free });
  }

  // One AI action in a panel. o: { kind, label, el, input(), show(option) -> label, apply(option), wall(), hint? }
  function block(p, o) {
    var el = o.el, box = el("div", "aibox"), count = el("p", "aicount", line()), res = el("div", "chips");
    var go = el("button", "chip", "✨ " + o.label, async function () {
      if (busy) return;
      var input = o.input(); if (!input) { Kit.toast(t("filter")); return; }
      busy = true; go.disabled = true; go.textContent = "… " + t("aiThinking"); res.textContent = ""; src.hidden = true;
      var r = await run(o.kind, input);
      busy = false; go.disabled = false; go.textContent = "✨ " + o.label; count.textContent = line();
      if (r.how === "blocked") { Kit.toast(t("filter")); return; }
      if (r.how === "quota") o.wall();
      src.textContent = t("aiLocal"); src.hidden = r.how === "result";
      r.options.forEach(function (opt) {
        res.appendChild(el("button", "chip aiopt", o.show(opt), function () { Kit.sfx.pop(); o.apply(opt); }));
      });
      Kit.sfx.pop();
    }), src = el("p", "note", null);
    src.hidden = true;
    var row = el("div", "airow"); row.appendChild(go); row.appendChild(count);
    box.appendChild(el("p", "note", t("aiNote"))); box.appendChild(row); box.appendChild(src); box.appendChild(res);
    p.appendChild(box);
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
  window.Ai = { block: block, wall: wall, count: line };
})(typeof globalThis !== "undefined" ? globalThis : this);
