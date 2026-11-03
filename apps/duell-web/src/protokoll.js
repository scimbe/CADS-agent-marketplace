/* Fast Easy Protokoll: the rules, without DOM. A meeting is written down on this device and turned into a short protocol.

   Data flow (nothing else leaves the device):

     microphone ──PCM──▶ resample 16 kHz ──▶ Chunker (cuts at pauses) ──▶ whisper.cpp in a Worker ──text──▶ transcript
         │                                                                     ▲
         └─ audio stays in memory and is dropped after each piece              model + runtime: own domain, HTTPS, cached
     transcript ──▶ summary on the device (rules, always possible, also offline)
               └──▶ only after an explicit "yes": redacted TEXT ──HTTPS──▶ /api/duell/ai kind "protokoll"
                                                          (own local model, no cache, the text is not logged) ──▶ protocol JSON, checked here
     protocol ──▶ this device's storage (delete any time) ──▶ text export, share sheet

   Everything here is pure so node can test it; protokoll-page.js does the DOM, the microphone and the worker. */
(function (root) {
  "use strict";
  var RATE = 16000;
  // The same files and digests as the gallery's /d/untertitel (CADS-DEMO-wrapper static/vendor/untertitel/PROVENANCE.json):
  // whisper.cpp v1.8.2 as wasm (@transcribe/shout 1.0.7, MIT) and the OpenAI Whisper weights (MIT), quantised by whisper.cpp.
  var VENDOR = "/static/vendor/untertitel/";
  var RUNTIME = { file: "shout.wasm.js", sha256: "e6aaa9c243013518393410d48a8930c9b98b17719baafb4dfd307a6ff9c45866", bytes: 1547886 };
  var MODELS = {
    tiny: { file: "ggml-tiny-q5_1.bin", sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7", bytes: 32152673 },
    base: { file: "ggml-base-q5_1.bin", sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898", bytes: 59707625 }
  };
  var MAX_TEXT = 12000, MAX_NAMES = 12, MAX_NAME = 40, MAX_KEEP = 50;

  // Which model this device can carry, or an honest no. dev: { wasm, worker, isolated, media, mem (GB, often missing), cores, mobile }
  function pickModel(dev) {
    if (!dev.wasm || !dev.worker || !dev.isolated || !dev.media) return { ok: false, why: "browser" };
    if (typeof dev.mem === "number" && dev.mem < 2) return { ok: false, why: "weak" };
    var cores = dev.cores || 2;
    if ((typeof dev.mem === "number" && dev.mem < 4) || cores < 4 || (dev.mobile && cores < 6)) return { ok: true, model: "tiny", note: "small" };
    return { ok: true, model: "base", note: "" };
  }
  function threads(dev) { return Math.min(dev.mobile ? 4 : 8, Math.max(1, (dev.cores || 2) - 1)); }

  // Linear resampling to 16 kHz. Not studio quality, enough for speech recognition.
  function resample(input, from) {
    if (from === RATE) return Float32Array.from(input);
    var ratio = from / RATE, n = Math.floor(input.length / ratio), out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i * ratio, a = Math.floor(x), b = Math.min(a + 1, input.length - 1), f = x - a;
      out[i] = input[a] * (1 - f) + input[b] * f;
    }
    return out;
  }
  function rms(pcm, from, to) {
    var s = 0, n = 0;
    for (var i = Math.max(0, from); i < Math.min(to, pcm.length); i++) { s += pcm[i] * pcm[i]; n++; }
    return n ? Math.sqrt(s / n) : 0;
  }

  // Collects 16 kHz audio and cuts it into pieces for the recogniser: at a pause once minSec are there, at the latest at maxSec.
  // A piece without speech (quiet throughout) is dropped, so whisper never gets silence to invent text from.
  function Chunker(o) {
    o = o || {};
    var minSec = o.minSec || 8, maxSec = o.maxSec || 25, pauseSec = o.pauseSec || 0.6, quiet = o.quiet || 0.012;
    var buf = [], len = 0, at = 0;      // at: start of the buffered audio, in samples since the start
    function flat() { var out = new Float32Array(len), p = 0; buf.forEach(function (b) { out.set(b, p); p += b.length; }); return out; }
    function cut(n) {
      var all = flat(), piece = all.slice(0, n), rest = all.slice(n), start = at;
      buf = rest.length ? [rest] : []; len = rest.length; at += n;
      return rms(piece, 0, piece.length) < quiet ? null : { pcm: piece, start: start / RATE, sec: piece.length / RATE };
    }
    return {
      push: function (pcm) {
        buf.push(pcm); len += pcm.length;
        var out = [];
        while (len >= maxSec * RATE) { var c = cut(maxSec * RATE); if (c) out.push(c); }
        if (len >= minSec * RATE) {
          var all = flat(), p = Math.floor(pauseSec * RATE);
          if (rms(all, all.length - p, all.length) < quiet) { var d = cut(len); if (d) out.push(d); }
        }
        return out;
      },
      flush: function () { return len ? cut(len) : null; },
      buffered: function () { return len / RATE; }
    };
  }

  // whisper fills silence and noise with lines it learned from subtitles. These never belong in a protocol.
  var NOISE = [/untertitel(ung)?\s+(im\s+auftrag\s+)?(des|der|von)\b/i, /^\s*(vielen\s+)?dank\s+f(ü|ue)r(s|'s)?\s+(das\s+)?zu(schauen|sehen|h(ö|oe)ren)/i,
    /copyright\s+(wdr|zdf|ard|swr|ndr)/i, /amara\.org/i, /^\s*thanks?\s+(you\s+)?for\s+watching/i, /subtitles?\s+by\b/i];
  function cleanSegment(s) {
    var t = String(s == null ? "" : s).replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!/[\p{L}\p{N}]/u.test(t)) return "";
    return NOISE.some(function (r) { return r.test(t); }) ? "" : t;
  }
  // A recogniser result (whisper.cpp: { transcription: [{ text }] } or plain text) -> one clean line, "" when nothing was said.
  function resultText(r) {
    var parts = typeof r === "string" ? [r] : (r && Array.isArray(r.transcription) ? r.transcription.map(function (x) { return x && x.text; }) : []);
    return parts.map(cleanSegment).filter(Boolean).join(" ").trim();
  }
  function stamp(sec) { sec = Math.max(0, Math.floor(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }

  // Names typed in before the start: besides what the AI reads from the text, the only way people get into the list.
  function cleanNames(s) {
    var seen = {};
    return String(s == null ? "" : s).split(/[,;\n]+/).map(function (n) { return n.replace(/[^\p{L}\p{N} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME); })
      .filter(function (n) { var k = n.toLowerCase(); if (!n || seen[k]) return false; seen[k] = 1; return true; }).slice(0, MAX_NAMES);
  }

  // Contact data and account numbers have no business in the text that leaves the device; the page shows what goes out.
  function redact(text) {
    return String(text)
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[E-Mail]")
      .replace(/https?:\/\/\S+|www\.\S+/gi, "[Link]")
      .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, "[IBAN]")
      .replace(/(?:\+|\b00)?\d[\d\s\/().-]{5,}\d/g, function (m) { return m.replace(/\D/g, "").length >= 7 ? "[Nummer]" : m; });
  }
  function transcriptText(segs) { return segs.map(function (s) { return s.x; }).join("\n"); }

  // ---- summary on the device: plain rules, no model. Always available, also offline. ------------------------------
  var CUES = {
    de: { decision: /(beschlossen|beschließen|entschieden|entscheiden uns|einigen uns|geeinigt|vereinbart|machen wir so|abgestimmt)/i,
      task: /(übernimmt|übernehme|kümmert sich|kümmere mich|erledigt|schickt|schicke|bereitet .+ vor|klärt|kläre|meldet sich|\bbis (montag|dienstag|mittwoch|donnerstag|freitag|morgen|nächste woche|ende|zum|\d))/i,
      topic: /^(thema|punkt|top \d+|als nächstes|nächster punkt|zum thema|es geht um)\b[:\s]*/i,
      due: /\bbis\s+((zum\s+)?\d{1,2}\.\s?\d{1,2}\.?(\d{2,4})?|montag|dienstag|mittwoch|donnerstag|freitag|morgen|übermorgen|nächste woche|ende der woche|monatsende)/i },
    en: { decision: /\b(decided|we agree|agreed|let'?s go with|we will go with|settled on|voted)\b/i,
      task: /\b(will (send|prepare|check|do|write|call|update)|takes care of|is going to|by (monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end))\b/i,
      topic: /^(topic|item|next( item| point)?|moving on to)\b[:\s]*/i,
      due: /\bby\s+(\d{1,2}[./]\d{1,2}|monday|tuesday|wednesday|thursday|friday|tomorrow|next week|end of (the )?(week|month))\b/i }
  };
  function sentences(text) { return String(text).split(/(?<=[.!?])\s+|\n+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 3; }); }
  function short(s, n) { s = s.replace(/\s+/g, " ").trim(); var a = Array.from(s); return a.length > n ? a.slice(0, n - 1).join("") + "…" : s; }
  function localSummary(segs, names, lang) {
    var cue = CUES[lang] || CUES.de, decisions = [], tasks = [], topics = [];
    var all = sentences(transcriptText(segs));
    all.forEach(function (s) {
      var low = s.toLowerCase(), who = "";
      names.forEach(function (n) { if (!who && low.indexOf(n.toLowerCase()) >= 0) who = n; });
      if (cue.topic.test(s)) topics.push(short(s.replace(cue.topic, ""), 120));
      if (cue.decision.test(s)) decisions.push(short(s, 160));
      else if (cue.task.test(s)) tasks.push({ who: who, what: short(s, 160), due: short((s.match(cue.due) || [""])[0], 40) });
    });
    if (!topics.length && all.length) topics.push(short(all[0], 120));
    return check({ title: "", participants: names, topics: topics.slice(0, 8), decisions: decisions.slice(0, 8), tasks: tasks.slice(0, 10) }, "local");
  }

  // ---- the protocol: one shape from the AI and from the rules above. Everything is checked again here. ----------------
  function str(v, n) { return typeof v === "string" ? short(v.replace(/[<>\u0000-\u001f\u007f]/g, " "), n) : ""; }
  function check(o, source) {
    if (!o || typeof o !== "object") o = {};
    var list = function (a, max, n) { return (Array.isArray(a) ? a : []).map(function (x) { return str(x, n); }).filter(Boolean).slice(0, max); };
    return {
      title: str(o.title, 60), participants: list(o.participants, MAX_NAMES, MAX_NAME), topics: list(o.topics, 8, 120), decisions: list(o.decisions, 8, 160),
      tasks: (Array.isArray(o.tasks) ? o.tasks : []).map(function (t) { return t && typeof t === "object" ? { who: str(t.who, 40), what: str(t.what, 160), due: str(t.due, 40) } : null; })
        .filter(function (t) { return t && t.what; }).slice(0, 10),
      source: source === "ai" ? "ai" : "local"
    };
  }
  function isEmpty(p) { return !p || (!p.topics.length && !p.decisions.length && !p.tasks.length); }

  var LABELS = {
    de: { head: "Protokoll", length: "Dauer", people: "Teilnehmende", topics: "Themen", decisions: "Entscheidungen", tasks: "Aufgaben", open: "offen", due: "bis", transcript: "Mitschrift",
      ai: "Zusammengefasst mit KI (eigener Server, ohne Speicherung). Bitte gegenlesen.", local: "Zusammengefasst auf dem Gerät nach einfachen Regeln. Bitte gegenlesen." },
    en: { head: "Minutes", length: "Length", people: "Participants", topics: "Topics", decisions: "Decisions", tasks: "Action items", open: "open", due: "by", transcript: "Transcript",
      ai: "Summarised with AI (own server, nothing stored). Please check.", local: "Summarised on this device with simple rules. Please check." }
  };
  function bullets(a, f) { return a.length ? a.map(function (x) { return "- " + f(x); }).join("\n") : "–"; }
  // Plain text that reads well in a mail, a chat or a wiki (Markdown-compatible).
  function toText(rec, lang, withTranscript) {
    var L = LABELS[lang] || LABELS.de, p = rec.protocol || check({}, "local"), d = new Date(rec.at), out = [];
    var date = isNaN(d) ? "" : d.toISOString().slice(0, 16).replace("T", " "), id = function (x) { return x; };
    out.push("# " + (p.title || L.head) + (date ? " – " + date : ""), L.length + ": " + stamp(rec.sec || 0));
    out.push("", "## " + L.people, bullets(p.participants, id));
    out.push("", "## " + L.topics, bullets(p.topics, id));
    out.push("", "## " + L.decisions, bullets(p.decisions, id));
    out.push("", "## " + L.tasks, bullets(p.tasks, function (t) { return "[ ] " + (t.who || L.open) + ": " + t.what + (t.due ? " (" + L.due + " " + t.due.replace(/^(bis|by)\s+/i, "") + ")" : ""); }));
    out.push("", "_" + L[p.source] + "_");
    if (withTranscript && rec.segs && rec.segs.length) out.push("", "## " + L.transcript, rec.segs.map(function (s) { return "[" + stamp(s.t) + "] " + s.x; }).join("\n"));
    return out.join("\n") + "\n";
  }
  // The short result that may travel in an app link (about 1100 characters there): no transcript, cut to fit.
  function brief(rec, lang, max) {
    var t = toText(rec, lang, false), a = Array.from(t); max = max || 900;
    return a.length > max ? a.slice(0, max - 1).join("") + "…" : t;
  }

  // ---- this device's protocols. They belong to the person: kept until deleted, never synced. --------------------------
  function keep(list, rec) { var l = (Array.isArray(list) ? list : []).filter(function (r) { return r && r.id !== rec.id; }); l.unshift(rec); return l.slice(0, MAX_KEEP); }
  function drop(list, id) { return (Array.isArray(list) ? list : []).filter(function (r) { return r && r.id !== id; }); }

  // What goes to the AI, and nothing more: redacted text, the names typed in and the consent.
  function aiInput(segs, names) {
    var text = redact(transcriptText(segs)), a = Array.from(text);
    if (a.length > MAX_TEXT) text = a.slice(-MAX_TEXT).join("");
    return { text: text, names: names.slice(0, MAX_NAMES), consent: true };
  }
  // The server's answer -> { how: result|quota|busy|blocked|local, protocol? }
  function aiVerdict(status, json) {
    if (status === 200 && json && Array.isArray(json.options) && json.options.length) {
      var p = check(json.options[0], "ai");
      return isEmpty(p) ? { how: "local" } : { how: "result", protocol: p };
    }
    if (status === 429 && json && json.error === "quota") return { how: "quota" };
    if (status === 429) return { how: "busy" };
    if (status === 422) return { how: "blocked" };
    return { how: "local" };
  }
  // The small proof of work a new device shows once (the same rule as the app's ai.js and the server).
  async function solve(device, bits, subtle) {
    var enc = new TextEncoder();
    for (var n = 0; ; n++) {
      var h = new Uint8Array(await subtle.digest("SHA-256", enc.encode(device + ":" + n.toString(36)))), ok = true;
      for (var i = 0, left = bits; left > 0 && ok; i++, left -= 8) ok = !(h[i] >> Math.max(0, 8 - left));
      if (ok) return n.toString(36);
    }
  }

  var api = { RATE: RATE, VENDOR: VENDOR, RUNTIME: RUNTIME, MODELS: MODELS, MAX_TEXT: MAX_TEXT, pickModel: pickModel, threads: threads, resample: resample, rms: rms, Chunker: Chunker,
    cleanSegment: cleanSegment, resultText: resultText, stamp: stamp, cleanNames: cleanNames, redact: redact, transcriptText: transcriptText, localSummary: localSummary,
    check: check, isEmpty: isEmpty, toText: toText, brief: brief, keep: keep, drop: drop, aiInput: aiInput, aiVerdict: aiVerdict, solve: solve, LABELS: LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Protokoll = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
