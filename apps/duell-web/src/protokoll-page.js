/* Fast Easy Protokoll: the page. Consent first, a recording sign the whole time, stop at any moment. The audio goes from the
   microphone through protokoll.js into the worker and is gone after each piece; only text is kept, on this device.
   Everything people say is put into text nodes, never into HTML. */
(function () {
  "use strict";
  var P = window.Protokoll, T = window.ProtokollTexts, test = window.ProtokollTest || null;
  var STORE = "protokoll.v1", APP = "daily.v1", AI = "/api/duell/ai", AI_MS = 50000, STALL_MS = 20000, CACHE = "protokoll-v1";
  var lang = /^en\b/i.test(new URLSearchParams(location.search).get("lang") || navigator.language || "") ? "en" : "de";
  var t = function (k, v) { var s = (T[lang] || T.de)[k] || T.de[k] || k; return v ? s.replace(/\{(\w+)\}/g, function (_, n) { return v[n]; }) : s; };
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn) { var b = el("button", cls || "btn", text); b.type = "button"; b.addEventListener("click", fn); return b; }
  function show(id) { ["intro", "rec", "review", "result"].forEach(function (s) { $(s).hidden = s !== id; }); window.scrollTo(0, 0); }
  function toast(msg) { var b = $("toast"); b.textContent = msg; b.hidden = false; clearTimeout(toast.tm); toast.tm = setTimeout(function () { b.hidden = true; }, 3500); }

  // ---- this device: what it can do --------------------------------------------------------------------------------
  var dev = {
    wasm: typeof WebAssembly === "object", worker: typeof Worker === "function", isolated: !!window.crossOriginIsolated,
    media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia), mem: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
    mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
  };
  var fit = P.pickModel(dev), model = fit.ok ? fit.model : "tiny";

  // ---- storage: own list, and the app's device id so the AI allowance is the same one ------------------------------
  function readJson(key, def) { try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? def : v; } catch (e) { return def; } }
  function writeJson(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function list() { return readJson(STORE, []); }
  function appStore() { var s = readJson(APP, {}); return s && typeof s === "object" ? s : {}; }
  function setApp(k, v) { var s = appStore(); s[k] = v; writeJson(APP, s); }
  function device() {
    var d = appStore().aiDev;
    if (typeof d !== "string" || !/^[a-f0-9]{32}$/.test(d)) { var b = new Uint8Array(16); crypto.getRandomValues(b); d = Array.from(b, function (x) { return (x + 256).toString(16).slice(1); }).join(""); setApp("aiDev", d); }
    return d;
  }
  async function proof() { var p = appStore().aiProof; if (typeof p !== "string") { p = await P.solve(device(), 16, crypto.subtle); setApp("aiProof", p); } return p; }

  // ---- recogniser: whisper.cpp in a worker; model and runtime from this domain, checked and cached -----------------
  async function sha256(buf) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)), function (x) { return (x + 256).toString(16).slice(1); }).join(""); }
  // One file: from the cache when it is there and intact, otherwise over HTTPS from this origin. A stalled download says so.
  async function fetchChecked(f, onBytes) {
    var url = P.VENDOR + f.file, cache = null;
    try { cache = await caches.open(CACHE); } catch (e) {}
    var hit = cache && await cache.match(url);
    if (hit) { var hb = await hit.arrayBuffer(); if (await sha256(hb) === f.sha256) { onBytes(f.bytes); return new Blob([hb]); } await cache.delete(url); }
    if (navigator.onLine === false) throw new Error("offline");
    var ctl = new AbortController(), stall = setTimeout(function () { ctl.abort(); }, STALL_MS);
    var res = await fetch(url, { signal: ctl.signal, credentials: "same-origin", cache: "no-store" });
    if (!res.ok || !res.body) { clearTimeout(stall); throw new Error("http-" + res.status); }
    var rd = res.body.getReader(), parts = [], got = 0;
    for (;;) {
      var r = await rd.read();
      clearTimeout(stall); if (r.done) break;
      stall = setTimeout(function () { ctl.abort(); }, STALL_MS);
      parts.push(r.value); got += r.value.length; onBytes(got);
    }
    var buf = await new Blob(parts).arrayBuffer();
    if (await sha256(buf) !== f.sha256) throw new Error("digest");
    if (cache) try { await cache.put(url, new Response(buf.slice(0), { headers: { "Content-Type": "application/octet-stream" } })); } catch (e) {}
    return new Blob([buf]);
  }
  function whisper(which) {
    var w = null, waiting = {}, n = 0;
    function answer(e) { var m = e.data, f = waiting[m.id]; if (!f) return; delete waiting[m.id]; f(m.type === "text" ? P.resultText(m.result) : ""); }
    return {
      load: async function (progress) {
        var files = [P.RUNTIME, P.MODELS[which]], total = files[0].bytes + files[1].bytes, done = [0, 0];
        var got = await Promise.all(files.map(function (f, i) { return fetchChecked(f, function (b) { done[i] = b; progress((done[0] + done[1]) / total); }); }));
        w = new Worker("/duell/protokoll-worker.js", { type: "module" });
        await new Promise(function (ok, no) {
          w.onmessage = function (e) { var m = e.data; if (m.type === "ready") { w.onmessage = answer; ok(); } else if (m.type === "error") no(new Error(m.message)); };
          w.onerror = function (e) { no(new Error(e.message || "worker")); };
          w.postMessage({ type: "init", runtime: got[0], model: got[1], threads: P.threads(dev) });
        });
      },
      transcribe: function (pcm) {
        return new Promise(function (ok) { var id = ++n; waiting[id] = ok; w.postMessage({ type: "chunk", id: id, pcm: pcm, lang: lang }, [pcm.buffer]); });
      },
      close: function () { if (w) w.terminate(); w = null; }
    };
  }

  // ---- the meeting ------------------------------------------------------------------------------------------------
  var rec = null;    // { id, at, sec, names, segs, protocol }
  var live = null;   // while the microphone is on
  function newRec(names) { return { id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), at: Date.now(), sec: 0, names: names, segs: [], protocol: null }; }

  async function start() {
    if (!$("consent").checked) { toast(t("needConsent")); return; }
    var names = P.cleanNames($("names").value), go = $("start");
    var recog = test && test.recognizer ? test.recognizer : whisper(model);
    go.disabled = true;
    try {
      $("load").hidden = false; $("loadbar").value = 0; $("loadtext").textContent = t("loading", { mb: Math.round((P.RUNTIME.bytes + P.MODELS[model].bytes) / 1e6) });
      await recog.load(function (f) { $("loadbar").value = f; });
    } catch (e) {
      go.disabled = false; $("load").hidden = true;
      toast(/offline/.test(e.message) ? t("errOffline") : /digest/.test(e.message) ? t("errDigest") : t("errLoad")); return;
    }
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { go.disabled = false; $("load").hidden = true; toast(t("errMic")); return; }
    $("load").hidden = true; go.disabled = false;
    rec = newRec(names);
    var ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream);
    var proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
    var chunker = P.Chunker(test && test.tuning), queue = Promise.resolve(), lag = 0;
    live = { stream: stream, ctx: ctx, recog: recog, paused: false, began: Date.now(), offset: 0, timer: 0, chunker: chunker, wake: null };
    function feed(pieces) {
      pieces.forEach(function (c) {
        lag += c.sec; showLag(lag);
        queue = queue.then(function () { return recog.transcribe(c.pcm); }).then(function (text) {
          lag -= c.sec; showLag(lag);
          if (text) { var s = { t: Math.round(c.start), x: text }; rec.segs.push(s); line(s); }
        }, function () { lag -= c.sec; showLag(lag); });
      });
    }
    live.feed = feed; live.queue = function () { return queue; };
    proc.onaudioprocess = function (e) {
      if (!live || live.paused) return;
      var pcm = P.resample(e.inputBuffer.getChannelData(0), ctx.sampleRate);
      $("level").value = Math.min(1, P.rms(pcm, 0, pcm.length) * 8);
      feed(chunker.push(pcm));
    };
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    try { live.wake = await navigator.wakeLock.request("screen"); } catch (e) {}
    $("lines").textContent = ""; $("lag").hidden = true;
    $("recnames").textContent = names.length ? t("recNames", { n: names.join(", ") }) : t("recNoNames");
    document.title = "● " + t("recording") + " – " + t("title");
    live.timer = setInterval(tick, 500); tick();
    show("rec");
  }
  function elapsed() { return live ? (live.offset + (live.paused ? 0 : (Date.now() - live.began))) / 1000 : 0; }
  function tick() { if (live) $("clock").textContent = P.stamp(elapsed()); }
  function showLag(s) { var b = $("lag"); b.hidden = s < 20; b.textContent = t("lag", { s: Math.round(s) }); }
  function line(s) { var li = el("li"); li.appendChild(el("time", "", P.stamp(s.t))); li.appendChild(el("span", "", s.x)); $("lines").appendChild(li); li.scrollIntoView({ block: "nearest" }); }
  function pause() {
    if (!live) return;
    var on = live.paused;
    if (on) live.began = Date.now(); else live.offset += Date.now() - live.began;
    live.paused = !on;
    live.stream.getTracks().forEach(function (k) { k.enabled = on; });
    $("pause").textContent = t(on ? "pause" : "resume"); $("rec").classList.toggle("paused", !on); $("recstate").textContent = t(on ? "recording" : "paused");
  }
  // Stop: the microphone is released at once (the browser's own sign goes out), then the last pieces are recognised.
  async function stop() {
    if (!live) return;
    var l = live; rec.sec = Math.round(elapsed()); clearInterval(l.timer);
    l.stream.getTracks().forEach(function (k) { k.stop(); }); try { await l.ctx.close(); } catch (e) {}
    try { if (l.wake) l.wake.release(); } catch (e) {}
    document.title = t("title");
    var last = l.chunker.flush(); if (last) l.feed([last]);
    live = null;
    $("finishing").hidden = false; $("transcript").value = ""; $("transcript").disabled = true; show("review");
    await l.queue();
    if (l.recog.close) l.recog.close();
    $("finishing").hidden = true; $("transcript").disabled = false;
    $("transcript").value = rec.segs.map(function (s) { return s.x; }).join("\n");
    $("rnames").value = rec.names.join(", ");
    $("aiask").hidden = true; $("aiok").checked = false;
  }
  // Lines of the edited text keep their time stamps where they still line up, otherwise the last one.
  function takeEdits() {
    var lines = $("transcript").value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean), old = rec.segs;
    rec.segs = lines.map(function (x, i) { return { t: old[i] ? old[i].t : (old.length ? old[old.length - 1].t : 0), x: x.slice(0, 2000) }; });
    rec.names = P.cleanNames($("rnames").value);
  }

  // ---- protocol -----------------------------------------------------------------------------------------------------
  function localProtocol(note) { takeEdits(); rec.protocol = P.localSummary(rec.segs, rec.names, lang); save(); result(note); }
  function askAi() {
    takeEdits();
    if (!rec.segs.length) { toast(t("empty")); return; }
    var input = P.aiInput(rec.segs, rec.names);
    $("aisize").textContent = t("aiSize", { n: Array.from(input.text).length });
    $("aipreview").textContent = input.text;
    $("aiask").hidden = false; $("aiask").scrollIntoView({ block: "nearest" });
  }
  async function sendAi() {
    if (!$("aiok").checked) { toast(t("needAiConsent")); return; }
    var go = $("aisend"), how = "local", protocol = null;
    go.disabled = true; go.textContent = t("aiBusyNow");
    try {
      if (navigator.onLine === false) throw new Error("offline");
      var body = JSON.stringify({ kind: "protokoll", input: P.aiInput(rec.segs, rec.names), device: device(), proof: await proof(), lang: lang });
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, AI_MS);
      try {
        var res = await fetch(AI, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, signal: ctl.signal, credentials: "same-origin", referrerPolicy: "no-referrer" });
        var json = null; try { json = await res.json(); } catch (e) {}
        if (json && json.meter) setApp("aiMeter", json.meter);
        var v = P.aiVerdict(res.status, json); how = v.how; protocol = v.protocol || null;
      } finally { clearTimeout(tm); }
    } catch (e) { how = "local"; }
    go.disabled = false; go.textContent = t("aiSend");
    if (how === "result") { rec.protocol = protocol; save(); result(""); return; }
    localProtocol(t("ai_" + how));
  }
  function save() { writeJson(STORE, P.keep(list(), rec)); }
  function section(title, items, fmt) {
    var s = el("section", "part"); s.appendChild(el("h3", "", title));
    if (!items.length) { s.appendChild(el("p", "none", "–")); return s; }
    var ul = el("ul"); items.forEach(function (x) { ul.appendChild(fmt(x)); }); s.appendChild(ul); return s;
  }
  function result(note) {
    var p = rec.protocol, L = P.LABELS[lang], box = $("protocol"), li = function (x) { return el("li", "", x); };
    box.textContent = "";
    box.appendChild(el("h2", "", p.title || L.head));
    box.appendChild(el("p", "meta", new Date(rec.at).toLocaleString(lang === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short" }) + " · " + L.length + " " + P.stamp(rec.sec)));
    box.appendChild(section(L.people, p.participants, li));
    box.appendChild(section(L.topics, p.topics, li));
    box.appendChild(section(L.decisions, p.decisions, li));
    box.appendChild(section(L.tasks, p.tasks, function (x) {
      var e = el("li", "task"); e.appendChild(el("b", "", x.who || L.open)); e.appendChild(el("span", "", " " + x.what)); if (x.due) e.appendChild(el("em", "", " · " + x.due)); return e;
    }));
    box.appendChild(el("p", "src", L[p.source]));
    $("todo").hidden = !p.tasks.length;
    $("note").hidden = !note; $("note").textContent = note || "";
    show("result");
  }
  function exportText() { return P.toText(rec, lang, $("withtext").checked); }
  async function copy() { try { await navigator.clipboard.writeText(exportText()); toast(t("copied")); } catch (e) { toast(t("errCopy")); } }
  function download() {
    var a = el("a"); a.href = URL.createObjectURL(new Blob([exportText()], { type: "text/markdown;charset=utf-8" }));
    a.download = "protokoll-" + new Date(rec.at).toISOString().slice(0, 10) + ".md"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  async function share() {
    if (!navigator.share) { copy(); return; }
    try { await navigator.share({ title: rec.protocol.title || t("title"), text: exportText() }); } catch (e) {}
  }
  function remove(id) {
    if (!confirm(t("confirmDelete"))) return;
    writeJson(STORE, P.drop(list(), id)); if (rec && rec.id === id) rec = null;
    toast(t("deleted")); fillList(); show("intro");
  }
  function removeAll() { if (!confirm(t("confirmDeleteAll"))) return; try { localStorage.removeItem(STORE); } catch (e) {} rec = null; toast(t("deleted")); fillList(); }

  // ---- start screen -------------------------------------------------------------------------------------------------
  function fillList() {
    var l = list(), ul = $("saved"); ul.textContent = "";
    $("savedbox").hidden = !l.length;
    l.forEach(function (r) {
      var li = el("li"), when = new Date(r.at).toLocaleString(lang === "en" ? "en-GB" : "de-DE", { dateStyle: "short", timeStyle: "short" });
      li.appendChild(btn(((r.protocol && r.protocol.title) || t("title")) + " · " + when, "link", function () { rec = r; if (r.protocol) result(""); }));
      li.appendChild(btn(t("delete"), "small danger", function () { remove(r.id); }));
      ul.appendChild(li);
    });
  }
  function intro() {
    var f = $("fit"), mb = Math.round((P.RUNTIME.bytes + P.MODELS[model].bytes) / 1e6);
    if (!fit.ok) { f.textContent = t(fit.why === "weak" ? "fitWeak" : "fitBrowser"); f.className = "warn"; $("start").disabled = true; }
    else { f.textContent = t(model === "tiny" && fit.note === "small" ? "fitSmall" : "fitOk", { mb: mb }); f.className = fit.note ? "warn" : "ok"; }
    $("model").value = model; $("model").disabled = !fit.ok;
    fillList();
  }

  document.querySelectorAll("[data-t]").forEach(function (e) { e.textContent = t(e.dataset.t); });
  document.documentElement.lang = lang; document.title = t("title");
  $("model").addEventListener("change", function () { model = $("model").value === "base" ? "base" : "tiny"; intro(); });
  $("start").addEventListener("click", start);
  $("pause").addEventListener("click", pause);
  $("stop").addEventListener("click", stop);
  $("mklocal").addEventListener("click", function () { if (!$("transcript").value.trim()) { toast(t("empty")); return; } localProtocol(""); });
  $("mkai").addEventListener("click", askAi);
  $("aisend").addEventListener("click", sendAi);
  $("discard").addEventListener("click", function () { if (confirm(t("confirmDiscard"))) { rec = null; fillList(); show("intro"); } });
  $("copy").addEventListener("click", copy);
  $("download").addEventListener("click", download);
  $("share").addEventListener("click", share);
  $("del").addEventListener("click", function () { if (rec) remove(rec.id); });
  // The tasks as a checklist to share: the app opens with them (same origin, the hash never reaches a server).
  $("todo").addEventListener("click", function () { if (rec && rec.protocol) location.href = P.todoLink(rec, lang); });
  $("again").addEventListener("click", function () { rec = null; fillList(); show("intro"); });
  $("delall").addEventListener("click", removeAll);
  // Leaving the page ends the recording: nothing goes on unseen in the background of a closed tab.
  window.addEventListener("pagehide", function () { if (live) live.stream.getTracks().forEach(function (k) { k.stop(); }); });
  intro();
  window.ProtokollDebug = { rec: function () { return rec; }, live: function () { return !!live; }, model: function () { return model; } };
})();
