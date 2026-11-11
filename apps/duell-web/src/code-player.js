/* My Daily Idea, Code-Modus: the player of a code game (part "code", on demand). A code game was written by the model
   inside the server's harness, checked, playtested, and signed there (CADS-DEMO-wrapper lib/duell-code.mjs). Here:

   1. verify   a card or link carries only "<id>.<hash>.<signature>". The code is fetched from our server and runs only when
               the body's id/hash/signature are the link's, SHA-256(code) is the hash, and the Ed25519 signature verifies
               against a key built into this app (CodeKeys). Anything else (a changed link, a changed body, an old id with
               another hash, a pulled game: 410) is refused. Fail closed: no WebCrypto Ed25519, no game.
   2. sandbox  the code runs in a hidden iframe: sandbox="allow-scripts" (opaque origin: no cookies, no storage, no DOM of
               ours), its own CSP default-src 'none' (no network, no eval), next to the app's CSP. Only JSON text crosses,
               only from that frame (event.source), and every display list is cleaned again here (CodeSDK.cleanView).
   3. play     Allein · Bot · Duell per Link (ghost: seed + inputs, the receiver replays them and checks the score) · Live
               (window.Live: ct-agent WASM, Noise, WebRTC data channel; both sides first show each other the same signed
               id+hash, then CodeSDK.Lockstep; a hash mismatch ends the match honestly).
   The person never sees the code: there is no view, no edit, no paste. */
(function (root) {
  "use strict";
  var SDK = root.CodeSDK, TX = root.CodeTexts || {}, KEYS = root.CodeKeys || [];
  var LINK_RE = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{86})$/;
  function api() { return root.DuellCodeApi || ((root.DuellCore && root.DuellCore.DEFAULT_API) || "https://demos-34a13a96.bunsenbrenner.org/api/duell/config").replace(/\/config$/, ""); }
  function lang() { try { return (root.Kit && root.Kit.lang && root.Kit.lang()) || (document.documentElement.lang === "en" ? "en" : "de"); } catch (e) { return "de"; } }
  function t(k, v) { var d = TX[lang()] || TX.de || {}; var s = d[k] || (TX.de && TX.de[k]) || k; return v === undefined ? s : s.replace("{v}", v); }

  // ---- 1. verify ------------------------------------------------------------------------------------------------------------
  function unb64u(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  function b64u(buf) { var b = "", a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) b += String.fromCharCode(a[i]); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function signedText(r) { return "mdi-code-v1\n" + SDK.canonical({ v: r.v, id: r.id, h: r.h, meta: r.meta, params: r.params, title: r.title, genre: r.genre, at: r.at }); }
  function parse(link) { var m = LINK_RE.exec(String(link || "")); return m ? { link: m[0], id: m[1], h: m[2], sig: m[3] } : null; }
  async function edOk(text, sig) {
    var enc = new TextEncoder().encode(text), s = unb64u(sig);
    for (var i = 0; i < KEYS.length; i++) {
      try {
        var k = await crypto.subtle.importKey("raw", unb64u(KEYS[i]), { name: "Ed25519" }, false, ["verify"]);
        if (await crypto.subtle.verify({ name: "Ed25519" }, k, s, enc)) return true;
      } catch (e) { /* no Ed25519 here: not verified */ }
    }
    return false;
  }
  /** -> the verified record { id, h, meta, params, title, genre, code } or throws Error(why): link | net | pulled | unknown | tampered */
  async function verify(link) {
    var p = parse(link); if (!p) throw new Error("link");
    var r;
    try { r = await fetch(api() + "/code/" + p.id + "?h=" + p.h, { credentials: "omit", cache: "no-cache", referrerPolicy: "no-referrer" }); }
    catch (e) { throw new Error("net"); }
    if (r.status === 410) throw new Error("pulled");
    if (r.status === 404 || r.status === 409) throw new Error("unknown");
    if (!r.ok) throw new Error("net");
    var b; try { b = await r.json(); } catch (e) { throw new Error("tampered"); }
    if (!b || b.id !== p.id || b.h !== p.h || b.sig !== p.sig || typeof b.code !== "string" || b.code.length > 64 * 1024) throw new Error("tampered");
    var dig = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b.code)));
    if (dig !== p.h) throw new Error("tampered");
    if (!(await edOk(signedText(b), p.sig))) throw new Error("tampered");
    var meta = SDK.cleanMeta(b.meta); if (!meta) throw new Error("tampered");
    return { link: p.link, id: b.id, h: b.h, meta: meta, params: b.params && typeof b.params === "object" ? b.params : {}, title: String(b.title || meta.title).slice(0, 40), genre: b.genre, code: b.code };
  }

  // ---- 2. sandbox -----------------------------------------------------------------------------------------------------------
  var BRIDGE = "addEventListener('message', function (e) {" +
    " if (e.source !== parent || !e.data || e.data.cg !== 1) return; var m = e.data, ok = true, r;" +
    " try { var a = JSON.parse(m.a);" +
    "  if (m.op === 'peek') { var s = __H.snapshot(); try { r = __H.apply(a[0]).status.score[a[1]]; } finally { __H.restore(s); } }" +
    "  else if (m.op === 'meta') r = __H.meta; else if (['start','apply','view','status','moves','hash','snapshot','restore'].indexOf(m.op) >= 0) r = __H[m.op].apply(__H, a); else throw new Error('op'); }" +
    " catch (x) { ok = false; r = String((x && x.message) || x).slice(0, 140); }" +
    " parent.postMessage({ cg: 2, id: m.id, ok: ok, r: JSON.stringify(r === undefined ? null : r) }, '*'); });" +
    "parent.postMessage({ cg: 2, id: 0, ok: true, r: 'null' }, '*');";
  function Sandbox(code) {
    var f = document.createElement("iframe"), seq = 0, wait = {}, gone = false, ready;
    f.setAttribute("sandbox", "allow-scripts");
    f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
    f.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
    var script = (SDK.selfSource() + "\n" + SDK.wrapGame(code) + "\n" + BRIDGE).replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
    f.srcdoc = "<!doctype html><meta charset=utf-8><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'\"><script>" + script + "</script>";
    ready = new Promise(function (ok, no) { wait[0] = { ok: ok, no: no }; setTimeout(function () { if (wait[0]) { delete wait[0]; no(new Error("sandbox")); } }, 8000); });
    function onMsg(e) {
      if (e.source !== f.contentWindow || !e.data || e.data.cg !== 2) return;
      var w = wait[e.data.id]; if (!w) return; delete wait[e.data.id];
      var v; try { v = JSON.parse(e.data.r); } catch (x) { return w.no(new Error("bad")); }
      if (e.data.ok) w.ok(v); else w.no(new Error(String(v).slice(0, 140)));
    }
    root.addEventListener("message", onMsg);
    document.body.appendChild(f);
    function call(op) {
      var a = Array.prototype.slice.call(arguments, 1);
      if (gone) return Promise.reject(new Error("closed"));
      return ready.then(function () {
        return new Promise(function (ok, no) {
          var id = ++seq; wait[id] = { ok: ok, no: no };
          f.contentWindow.postMessage({ cg: 1, id: id, op: op, a: JSON.stringify(a) }, "*");
          setTimeout(function () { if (wait[id]) { delete wait[id]; no(new Error("slow")); } }, 4000);
        });
      });
    }
    return {
      call: call,
      view: function (seat) { return call("view", seat).then(function (v) { return SDK.cleanView(v) || []; }); },
      close: function () { gone = true; root.removeEventListener("message", onMsg); f.remove(); }
    };
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------------
  function draw(cv, ops) {
    var dpr = Math.min(3, root.devicePixelRatio || 1), cw = cv.clientWidth || SDK.W, ch = cv.clientHeight || SDK.H;
    if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    var g = cv.getContext("2d"), s = Math.min(cw / SDK.W, ch / SDK.H) * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(s, 0, 0, s, (cv.width - SDK.W * s) / 2, (cv.height - SDK.H * s) / 2);
    (ops || []).forEach(function (o) {
      g.globalAlpha = o.a === undefined ? 1 : o.a;
      g.fillStyle = g.strokeStyle = o.c || "#111";
      if (o.o === "bg") { g.fillRect(0, 0, SDK.W, SDK.H); }
      else if (o.o === "rect") { g.beginPath(); if (o.r && g.roundRect) g.roundRect(o.x, o.y, o.w, o.h, Math.min(o.r, o.w / 2, o.h / 2)); else g.rect(o.x, o.y, o.w, o.h); g.fill(); }
      else if (o.o === "circle") { g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.fill(); }
      else if (o.o === "line") { g.lineWidth = o.w; g.lineCap = "round"; g.beginPath(); g.moveTo(o.x1, o.y1); g.lineTo(o.x2, o.y2); g.stroke(); }
      else if (o.o === "text") { g.font = (o.b ? "900 " : "700 ") + o.z + "px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"; g.textAlign = o.al === "l" ? "left" : o.al === "r" ? "right" : "center"; g.textBaseline = "alphabetic"; g.fillText(o.s, o.x, o.y); }
      else if (o.o === "emoji") { g.font = o.z + "px 'Apple Color Emoji','Noto Color Emoji','Segoe UI Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillText(o.e, o.x, o.y); }
    });
    g.globalAlpha = 1;
  }

  // ---- the overlay -------------------------------------------------------------------------------------------------------------
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  var CSS = ".cgov{position:fixed;inset:0;z-index:60;background:var(--a,#ffd400);display:flex;flex-direction:column;align-items:center;padding:8px 8px 10px;box-sizing:border-box;touch-action:none}" +
    ".cgbar{display:flex;align-items:center;width:100%;max-width:420px;gap:8px;min-height:44px}.cgbar b{flex:1;font:900 22px/1 var(--disp,Impact,sans-serif);text-transform:uppercase;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
    ".cgx{min-width:44px;min-height:44px;border:3px solid var(--ink,#111);border-radius:6px;background:var(--paper,#fff6dc);font:900 20px/1 system-ui}" +
    ".cgcv{flex:1;min-height:0;width:100%;max-width:420px;border:3px solid var(--ink,#111);border-radius:6px;background:var(--paper,#fff6dc);touch-action:none}" +
    ".cgnote{font:700 14px/1.3 var(--ui,system-ui);margin:6px 0;text-align:center;max-width:420px}.cgbtns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;width:100%;max-width:420px}" +
    ".cgbtns button{flex:1 1 45%;min-height:48px;border:3px solid var(--ink,#111);border-radius:6px;background:var(--ink,#111);color:var(--btn,#ffd400);font:900 18px/1 var(--disp,Impact,sans-serif);text-transform:uppercase}" +
    ".cgbtns button.sec{background:var(--paper,#fff6dc);color:var(--ink,#111)}";
  var ov = null, cur = null;
  function overlay(title) {
    close();
    if (!document.getElementById("cgcss")) { var st = el("style"); st.id = "cgcss"; st.textContent = CSS; document.head.appendChild(st); }
    ov = el("div", "cgov"); ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", title);
    var bar = el("div", "cgbar"), x = el("button", "cgx", "✕"); x.setAttribute("aria-label", t("close")); x.onclick = close;
    bar.appendChild(el("b", "", title)); bar.appendChild(x);
    var cv = el("canvas", "cgcv"); cv.setAttribute("aria-label", t("canvas"));
    var note = el("p", "cgnote"); note.setAttribute("aria-live", "polite");
    var btns = el("div", "cgbtns");
    ov.appendChild(bar); ov.appendChild(cv); ov.appendChild(note); ov.appendChild(btns);
    document.body.appendChild(ov);
    return { cv: cv, note: note, btns: btns };
  }
  function close() {
    if (cur) { try { cur.stop(); } catch (e) {} cur = null; }
    if (ov) { ov.remove(); ov = null; }
  }
  function buttons(box, list) { box.btns.textContent = ""; list.forEach(function (b) { var e = el("button", b[2] ? "sec" : "", b[0]); e.onclick = b[1]; box.btns.appendChild(e); }); }
  function say(box, k, v) { box.note.textContent = k ? t(k, v) : ""; }

  // ---- 3. play ---------------------------------------------------------------------------------------------------------------------
  /** One match. o: { rec, box, seat, players, seed, bots: [seat...], conn (live), onEnd(status, log) } */
  function Match(o) {
    var sb = Sandbox(o.rec.code), meta = o.rec.meta, rt = meta.mode === "realtime", st = null, tick = 0, log = [], queue = [], busy = false, timer = null, done = false;
    var botR = SDK.rngOf(SDK.seedState((o.seed ^ 0xb07) >>> 0), o.seed), ls = null, peerOk = !o.conn, started = false, goSeed = null, early = [];
    function show() { return sb.view(o.seat).then(function (v) { draw(o.box.cv, v); }); }
    function end(why) {
      if (done) return; done = true; clearInterval(timer);
      log.push([tick, "."]);   // the end: a ghost replay ticks up to here (realtime games score after the last input too)
      if (o.onEnd) o.onEnd(st, log, why);
    }
    function applyAll(list) {
      return list.reduce(function (p, i) { return p.then(function () { return sb.call("apply", i, false).then(function (r) { st = r.status; }); }); }, Promise.resolve());
    }
    function botMove(seat) {
      return sb.call("moves", seat).then(function (mv) {
        if (mv && mv.length) {
          var best = null, bs = -Infinity;
          return mv.slice(0, 40).reduce(function (p, m) { return p.then(function () { return sb.call("peek", m, seat).then(function (s) { s += botR.float() * 0.5; if (s > bs) { bs = s; best = m; } }); }); }, Promise.resolve()).then(function () { return best; });
        }
        return SDK.botInput(meta, mv, seat, botR, null);
      });
    }
    // local play (Allein, Bot, ghost): realtime ticks every TICK_MS, a turn game moves on each input
    function stepLocal() {
      if (busy || done) return; busy = true;
      var ins = queue.splice(0, 4).map(function (i) { log.push([tick, SDK.packInput(i)]); return i; });
      var bots = rt ? o.bots.filter(function () { return botR.chance(0.22); }) : [];
      Promise.all(bots.map(botMove)).then(function (bi) {
        bi.forEach(function (i) { if (i) ins.push(i); });
        if (rt) ins.push({ seat: -1, t: "tick" });
        return applyAll(ins);
      }).then(function () {
        tick++;
        // a turn game: the bots move while it is their turn (also twice in a row when the person has no move)
        function bots(n) {
          if (rt || !st || st.over || o.bots.indexOf(st.turn) < 0 || n > 50) return null;
          return show().then(function () { return new Promise(function (ok) { setTimeout(ok, 350); }); }).then(function () { return botMove(st.turn); })
            .then(function (i) { if (!i) return null; log.push([tick, SDK.packInput(i)]); return applyAll([i]).then(function () { return bots(n + 1); }); });
        }
        return bots(0);
      }).then(show).then(function () { busy = false; if (st && st.over) end(); else if (!rt && queue.length) stepLocal(); }, function (e) { busy = false; say(o.box, "broken"); end("error"); });
    }
    // live: lockstep over the channel (Live: WebRTC data channel)
    function stepLive() {
      if (busy || done || !ls) { if (ls && rt) tick++; return; }
      busy = true; if (rt) tick++;
      if (rt) queue.splice(0, 4).forEach(function (i) { ls.local(i); });
      else if (queue.length) { var i = queue.shift(); if (st && st.turn === o.seat) ls.local(i); queue.length = 0; }
      if (rt) ls.pump();
      ls.out().forEach(function (m) { o.conn.send(m); });
      var steps = ls.ready(function () { return st ? st.turn : null; }, rt ? (ls.at() + 3 < tick ? 2 : 1) : 1);
      steps.reduce(function (p, s) {
        return p.then(function () { return applyAll(s.inputs); }).then(function () {
          if (s.k % (rt ? 20 : 1) === 0) return sb.call("hash").then(function (h) { ls.applied(s.k, h); });
        });
      }, Promise.resolve()).then(function () {
        ls.out().forEach(function (m) { o.conn.send(m); });
        if (ls.desync()) { say(o.box, "desync"); end("desync"); return; }
        return steps.length ? show() : null;
      }).then(function () { busy = false; if (st && st.over && !done) { say(o.box, ""); end(); } }, function () { busy = false; say(o.box, "broken"); end("error"); });
    }
    function begin(seed) {
      started = true;
      return sb.call("start", seed >>> 0, o.rec.params, o.players).then(function (r) {
        st = r.status; return show();
      }).then(function () {
        if (o.conn) { ls = SDK.Lockstep({ seat: o.seat, seats: o.players, mode: meta.mode, delay: 3, hashEvery: rt ? 20 : 1 }); early.splice(0).forEach(function (m) { ls.receive(m); }); timer = setInterval(stepLive, SDK.TICK_MS); }
        else if (rt) timer = setInterval(stepLocal, SDK.TICK_MS);
        else if (o.bots.indexOf(st.turn) >= 0) stepLocal();
        if (o.onStart) o.onStart();
      });
    }
    // live handshake: both show the same signed game (id, hash, signature) before the match; seat 0 picks the seed
    if (o.conn) {
      o.conn.on(function (m) {
        if (!m || typeof m !== "object") return;
        if (m.t === "cg-hello") {
          if (m.c !== o.rec.link) { say(o.box, "otherGame"); end("other"); o.conn.send({ t: "cg-bye" }); return; }
          if (!peerOk) {
            peerOk = true; o.conn.send({ t: "cg-hello", c: o.rec.link });
            if (o.seat === 0 && !started) { o.conn.send({ t: "cg-go", s: o.seed >>> 0 }); begin(o.seed); }
            else if (goSeed !== null && !started) begin(goSeed);   // the go came before the hello (a channel may reorder)
          }
        }
        else if (m.t === "cg-go" && o.seat !== 0 && !started && (m.s >>> 0) === m.s) { if (peerOk) begin(m.s); else goSeed = m.s; }
        else if (!ls && /^cg-[ihm]$/.test(m.t)) early.push(m);   // lockstep traffic before this side began: kept for it
        else if (m.t === "cg-bye") { say(o.box, "left"); end("left"); }
        else if (ls) ls.receive(m);
      });
      if (o.conn.onClose) o.conn.onClose(function () { if (!done) { say(o.box, "left"); end("left"); } });
      o.conn.send({ t: "cg-hello", c: o.rec.link });
    } else begin(o.seed);
    // input: a short touch is a tap, a longer stroke a swipe; arrow keys swipe, space/enter is key a
    var down = null, cv = o.box.cv;
    function logical(e) { var r = cv.getBoundingClientRect(), s = Math.min(r.width / SDK.W, r.height / SDK.H); return { x: (e.clientX - r.left - (r.width - SDK.W * s) / 2) / s, y: (e.clientY - r.top - (r.height - SDK.H * s) / 2) / s }; }
    function push(i) { if (done || !st) return; i.seat = o.seat; var c = SDK.cleanInput(i, o.players); if (!c || meta.inputs.indexOf(c.t) < 0 && !(c.t === "tap" && meta.inputs.indexOf("move") >= 0)) return; queue.push(c); if (!o.conn && !rt) stepLocal(); }
    cv.onpointerdown = function (e) { down = { x: e.clientX, y: e.clientY, e: e }; };
    cv.onpointerup = function (e) {
      if (!down) return; var dx = e.clientX - down.x, dy = e.clientY - down.y, d = down; down = null;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) { var p = logical(d.e); push({ t: "tap", x: p.x, y: p.y }); }
      else push({ t: "swipe", d: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "r" : "l") : (dy > 0 ? "d" : "u") });
    };
    function key(e) { var d = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d" }[e.key]; if (d) { e.preventDefault(); push({ t: "swipe", d: d }); } else if (e.key === " " || e.key === "Enter") { e.preventDefault(); push({ t: "key", k: "a" }); } }
    document.addEventListener("keydown", key);
    return {
      stop: function () { done = true; clearInterval(timer); document.removeEventListener("keydown", key); sb.close(); if (o.conn && o.conn.close) try { o.conn.close(); } catch (e) {} },
      input: push, status: function () { return st; }, log: function () { return log; }, hash: function () { return sb.call("hash"); }, sandbox: sb
    };
  }

  // ---- ghost links: "#cg=<link>~<seed>~<score>~<inputs>" -----------------------------------------------------------------
  function packLog(log) { var last = 0, out = []; log.forEach(function (e) { out.push((e[0] - last).toString(36) + ":" + e[1]); last = e[0]; }); return b64u(new TextEncoder().encode(out.join("|"))); }
  function unpackLog(s) {
    var txt; try { txt = new TextDecoder().decode(unb64u(s)); } catch (e) { return null; }
    if (!txt) return [];
    var at = 0, out = [];
    var parts = txt.split("|"); if (parts.length > 5000) return null;
    for (var i = 0; i < parts.length; i++) { var m = /^([0-9a-z]{1,6}):(.{1,210})$/.exec(parts[i]); if (!m) return null; at += parseInt(m[1], 36); out.push([at, m[2]]); }
    return out;
  }
  function ghostLink(rec, seed, score, log) { return (root.DuellCore ? root.DuellCore.SHARE_BASE : location.origin + location.pathname) + "#cg=" + rec.link + "~" + seed.toString(36) + "~" + score + "~" + packLog(log); }
  /** Replays a ghost in a sandbox of its own: -> the score those inputs really give (never the score the link claims) */
  function replay(rec, seed, log) {
    var sb = Sandbox(rec.code), rt = rec.meta.mode === "realtime";
    return sb.call("start", seed, rec.params, 1).then(function () {
      var tick = 0, p = Promise.resolve(), i = 0;
      function upTo(k) { var q = Promise.resolve(); while (tick < k) { q = q.then(function () { return sb.call("apply", { seat: -1, t: "tick" }, false); }); tick++; } return q; }
      log.forEach(function (e) { p = p.then(function () { return rt ? upTo(e[0]) : null; }).then(function () { var inp = SDK.unpackInput(e[1], 0); return inp ? sb.call("apply", inp, false) : null; }); i++; });
      return p.then(function () { return sb.call("status"); });
    }).then(function (s) { sb.close(); return s; }, function (e) { sb.close(); throw e; });
  }

  // ---- entry points ---------------------------------------------------------------------------------------------------------------
  function failed(box, e) { say(box, { pulled: "pulled", tampered: "tampered", unknown: "unknown", link: "tampered", net: "net" }[e && e.message] || "broken"); buttons(box, [[t("close"), close, true]]); }
  function menu(rec, box) {
    var m = rec.meta, list = [];
    say(box, "pick");
    function solo(bot) {
      return function () {
        var players = bot || m.players.min > 1 ? Math.max(2, m.players.min) : 1, seed = (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;
        say(box, m.mode === "realtime" ? "goRt" : "goTurn");
        buttons(box, []);
        cur = Match({ rec: rec, box: box, seat: 0, players: players, seed: seed, bots: players > 1 ? [1] : [], onEnd: function (st, log) { result(rec, box, st, 0, players, function () { return players === 1 ? ghostLink(rec, seed, st.score[0], log) : null; }); } });
      };
    }
    if (m.players.min === 1) list.push([t("solo"), solo(false)]);
    if (m.players.max >= 2) list.push([t("bot"), solo(true)]);
    if (m.players.max >= 2 && root.Live) list.push([t("live"), function () { live(rec, box); }, true]);
    buttons(box, list);
    draw(box.cv, [{ o: "bg", c: "#fff6dc" }, { o: "text", x: 180, y: 280, s: rec.title, z: 34, b: true, c: "#111111" }, { o: "text", x: 180, y: 320, s: t("checked"), z: 15, c: "#111111" }]);
  }
  function result(rec, box, st, seat, players, ghost) {
    if (!st) return;
    var w = st.winner, k = players === 1 ? (w === 0 ? "won" : "over") : w === -1 ? "draw" : w === seat ? "won" : "lost";
    say(box, k, st.score[seat]);
    var list = [[t("again"), function () { menu(rec, box); }]];
    var g = ghost && ghost();
    if (g) list.push([t("duel"), function () { share(g, box); }, true]);
    buttons(box, list);
  }
  function share(url, box) {
    if (navigator.share) navigator.share({ title: t("duelTitle"), url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { say(box, "copied"); }, function () {});
    box.btns.setAttribute("data-link", url);
  }
  function live(rec, box) {
    say(box, "liveWait"); buttons(box, [[t("close"), close, true]]);
    root.Live.invite(function () {}).then(function (inv) {
      var url = (root.DuellCore ? root.DuellCore.SHARE_BASE : "") + "#cglive=" + inv.token + "." + rec.link;
      share(url, box); say(box, "liveInvite");
      return inv.ready;
    }).then(function (conn) { playLive(rec, box, conn, 0); }, function () { say(box, "net"); });
  }
  function playLive(rec, box, conn, seat) {
    say(box, "liveGo"); buttons(box, []);
    cur = Match({ rec: rec, box: box, seat: seat, players: 2, seed: (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0, bots: [], conn: conn, onEnd: function (st, log, why) { if (!why) result(rec, box, st, seat, 2, null); else buttons(box, [[t("close"), close, true]]); } });
    return cur;
  }
  /** a card's doc { k: 'code', c: link, t: title } (app.js openEditor) */
  function open(doc) {
    var box = overlay(doc && doc.t ? doc.t : t("game"));
    say(box, "loading");
    return verify(doc && doc.c).then(function (rec) { menu(rec, box); return rec; }, function (e) { failed(box, e); throw e; });
  }
  /** "#cg=<link>~<seed>~<score>~<inputs>" (ghost duel) or "#cglive=<token>.<link>" (live invite) */
  function fromHash(hash) {
    var g = /^#cg=([A-Za-z0-9_.-]{147})~([0-9a-z]{1,7})~(-?\d{1,9})~([A-Za-z0-9_-]{0,12000})$/.exec(hash || "");
    var l = /^#cglive=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_.-]{147})$/.exec(hash || "");
    if (!g && !l) return false;
    var box = overlay(t("game")); say(box, "loading");
    if (l) {
      verify(l[2]).then(function (rec) {
        say(box, "liveJoin");
        return root.Live.accept(l[1], function () {}).then(function (conn) { playLive(rec, box, conn, 1); });
      }).catch(function (e) { failed(box, e); });
      return true;
    }
    var seed = parseInt(g[2], 36) >>> 0, claim = Number(g[3]), log = unpackLog(g[4]);
    verify(g[1]).then(function (rec) {
      if (!log || rec.meta.players.min !== 1) throw new Error("tampered");
      return replay(rec, seed, log).then(function (st) {
        // the score of the link is only believed when the inputs give it
        if (!st || st.score[0] !== claim) throw new Error("tampered");
        say(box, "beat", claim);
        buttons(box, [[t("play"), function () {
          say(box, rec.meta.mode === "realtime" ? "goRt" : "goTurn"); buttons(box, []);
          cur = Match({ rec: rec, box: box, seat: 0, players: 1, seed: seed, bots: [], onEnd: function (st2, log2) {
            var mine = st2 ? st2.score[0] : 0;
            say(box, mine > claim ? "ghostWon" : mine === claim ? "draw" : "ghostLost", mine + " : " + claim);
            buttons(box, [[t("duel"), function () { share(ghostLink(rec, seed, mine, log2), box); }], [t("close"), close, true]]);
          } });
        }]]);
      });
    }).catch(function (e) { failed(box, e); });
    return true;
  }
  /** the sheet's preview: title on the app's colours, no network (the code is loaded only to play) */
  function preview(cv, doc) {
    draw(cv, [{ o: "bg", c: "#fff6dc" }, { o: "rect", x: 40, y: 200, w: 280, h: 200, c: "#111111", r: 12 },
      { o: "text", x: 180, y: 290, s: String((doc && doc.t) || t("game")).slice(0, 24), z: 30, b: true, c: "#ffd400" },
      { o: "text", x: 180, y: 336, s: t("checked"), z: 15, c: "#fff6dc" }, { o: "emoji", x: 180, y: 180, e: "🧩", z: 64 }]);
  }

  root.CodeUI = { open: open, fromHash: fromHash, preview: preview, close: close, verify: verify, playLive: function (link, conn, seat) {
    var box = overlay(t("game")); return verify(link).then(function (rec) { return playLive(rec, box, conn, seat); });
  }, current: function () { return cur; }, _ghostLink: ghostLink, _unpackLog: unpackLog };
})(window);
