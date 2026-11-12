// Weitere Widget-Primitive (ADR 0001 c): Zeitspiele, Ton, Raster-Spiele, Listen-Editoren, Termine, Tueren, Spielkarten,
// Zielen/Kraft/Zeichnen. Zeit und Ton sind Geraetesache (Anzeige und Messung); die Karte bekommt nur die Zahl.
// Jedes Zeiger- oder Mikrofon-Widget hat einen Tastatur- bzw. Tipp-Ersatz (Altcode-Luecke touch/react/blow).
// Uhr und Ton kommen ueber host.clock()/host.audio (testbar), Zustand am Element (el.__w), nie global.
import { h } from "../ui/dom.js";
import { registerWidgets, internals, fmt, euro, why as whyBase } from "./widgets.js";
import { clean, fold } from "../contract/text.js";

const { wrap, mainBtn, drafted, setDraft, press, gridCells, txt } = internals;
const T2 = {
  de: { ready: "Bereit?", go: "Los", stop: "Stopp", start: "Start", done: "Fertig", hit: "Erraten", skip: "Weiter", out: "Raus", inn: "Rein", buy: "Kaufen", price: "Preis {v}", rec: "Aufnehmen", recOn: "Nimmt auf …", play: "Abspielen", playOnce: "Einmal abspielen", back: "Rückwärts abspielen", gone: "Die Aufnahme ist nicht mehr da.", end: "Ende", round: "Runde {n} von {m}", next: "Nächste", draw: "Ziehen", tapPick: "Zufall ziehen", candle: "Kerze {n}", blow: "Ins Mikro pusten", noMic: "Kein Mikrofon – tippe die Kerzen an.", take: "Nehmen", mark: "Markieren", undo: "Rückgängig", clear: "Löschen", color: "Farbe {n}", width: "Breite {n}", aimHint: "Pfeiltasten bewegen, Enter wählt", power: "Kraft {n} von {m}", hold: "Halten für Kraft", door: "Tür {n}", closed: "zu", openD: "Aufklappen", star: "Stern antippen (Leertaste)", time: "{s} s", pressed: "gewählt", yes: "Ja", maybe: "Vielleicht", no: "Nein", allYes: "Überall ja", name: "Dein Name", add: "Hinzufügen", del: "Löschen", bring: "bringe ich", got: "gekauft", needName: "Bitte zuerst deinen Namen eingeben.", have: "Steht schon drauf.", full: "Die Liste ist voll.", taken: "Schon vergeben", mine: "Meins", step: "Schritt {n}", blocks: "Punkte {n}", score: "Treffer {n}" },
  en: { ready: "Ready?", go: "Go", stop: "Stop", start: "Start", done: "Done", hit: "Got it", skip: "Skip", out: "Out", inn: "In", buy: "Buy", price: "Price {v}", rec: "Record", recOn: "Recording …", play: "Play", playOnce: "Play once", back: "Play backwards", gone: "The recording is gone.", end: "End", round: "Round {n} of {m}", next: "Next", draw: "Draw", tapPick: "Pick at random", candle: "Candle {n}", blow: "Blow into the mic", noMic: "No microphone – tap the candles.", take: "Take", mark: "Mark", undo: "Undo", clear: "Clear", color: "Colour {n}", width: "Width {n}", aimHint: "Arrow keys move, Enter picks", power: "Power {n} of {m}", hold: "Hold for power", door: "Door {n}", closed: "closed", openD: "Open", star: "Tap the star (Space)", time: "{s} s", pressed: "chosen", yes: "Yes", maybe: "Maybe", no: "No", allYes: "Yes everywhere", name: "Your name", add: "Add", del: "Delete", bring: "I'll bring it", got: "bought", needName: "Please enter your name first.", have: "Already on the list.", full: "The list is full.", taken: "Already taken", mine: "Mine", step: "Step {n}", blocks: "Points {n}", score: "Hits {n}" }
};
const Y = (host) => T2[host.lang] || T2.de;
const now = (host) => (host.clock ? host.clock() : Date.now());
const sfx = (host, k) => host.sound && host.sound(k);
function local(el, init) { if (!el.__w) el.__w = init(); return el.__w; }
function send(host, n, a) { host.onInput({ ...n.submit, a }); }

// ---------- Countdown-Tor (Altcode turn2.js gate) ----------
// Die Startzeit liegt unter eigenem Schluessel "w:<id>:t0"; "w:<id>" gehoert dem Zustand des Koerpers (react/explain/tuer).
function gate(n, host, body) {
  const key = { id: n.id + ":t0" }, Z = Y(host), started = drafted(host, key, null);
  if (typeof started !== "number") return [h("p", { class: "w-note" }, Z.ready), h("button", { type: "button", class: "btn primary big", "data-act": "w-ready", disabled: host.disabled ? true : null, on: { click: () => setDraft(host, key, now(host)) } }, Z.go)];
  return body(started);
}
function ticker(el, host, ms, f) { const s = local(el, () => ({})); if (s.t) return; const loop = () => { if (!el.isConnected) { s.t = null; return; } f(); s.t = setTimeout(loop, ms); }; s.t = setTimeout(loop, ms); }

const M = {};

M.clock = (n, host, X) => wrap(n, host, [n.text ? h("p", { class: "w-line" }, txt(n.text)) : null, ...gate(n, host, (t0) => {
  const left = Math.max(0, (n.secs || 30) - Math.floor((now(host) - t0) / 1000));
  return [h("p", { class: "w-big", "aria-live": "polite", ref: (el) => ticker(el, host, 250, () => { const l = Math.max(0, (n.secs || 30) - Math.floor((now(host) - t0) / 1000)); if (el.textContent !== fmt(Y(host).time, { s: l })) el.textContent = fmt(Y(host).time, { s: l }); }) }, fmt(Y(host).time, { s: left })), ...mainBtn(host, n, 0, "", { ...X, next: Y(host).done })];
})]);

M.explain = (n, host, X) => wrap(n, host, gate(n, host, (t0) => {
  const Z = Y(host), words = n.words || [], st = drafted(host, n, { i: 0, hits: 0, t0 })
  const left = Math.max(0, (n.secs || 60) - Math.floor((now(host) - t0) / 1000));
  const finish = (hits) => send(host, n, Math.min(n.max || 99, hits));
  if (left <= 0 || st.i >= words.length) return [h("p", { class: "w-big" }, fmt(Z.score, { n: st.hits })), ...mainBtn(host, n, Math.min(n.max || 99, st.hits), "", X)];
  return [
    h("p", { class: "w-big", "aria-live": "polite" }, txt(words[st.i], 60)),
    h("p", { class: "w-count", ref: (el) => ticker(el, host, 250, () => { const l = Math.max(0, (n.secs || 60) - Math.floor((now(host) - t0) / 1000)); el.textContent = fmt(Z.time, { s: l }); if (!l) finish(st.hits); }) }, fmt(Z.time, { s: left })),
    h("div", { class: "options" }, h("button", { type: "button", class: "chip", on: { click: () => setDraft(host, n, { ...st, i: st.i + 1, hits: st.hits + 1 }) } }, Z.hit), h("button", { type: "button", class: "chip", on: { click: () => setDraft(host, n, { ...st, i: st.i + 1 }) } }, Z.skip))
  ];
}));

// Zeit-Schaetzen: inner (5 Ziele, Abweichung), blind (bester von n, ohne Uhr)
M.inner = (n, host, X) => {
  const Z = Y(host), targets = (n.targets || []).slice(0, 5), st = drafted(host, n, { r: [], t0: null });
  if (st.r.length >= targets.length) return wrap(n, host, [h("p", { class: "w-line" }, st.r.map((d) => (d > 0 ? "+" : "") + Math.round(d / 100) / 10 + " s").join(" · ")), ...mainBtn(host, n, st.r, "", X)]);
  const i = st.r.length;
  return wrap(n, host, [h("p", { class: "w-big" }, fmt(Z.time, { s: Math.round(targets[i] / 100) / 10 })),
    st.t0 === null ? h("button", { type: "button", class: "btn primary big", on: { click: () => setDraft(host, n, { ...st, t0: now(host) }) } }, Z.start)
      : h("button", { type: "button", class: "btn primary big", on: { click: () => { const el = now(host) - st.t0; if (el < 500) return; setDraft(host, n, { r: st.r.concat([Math.max(-20000, Math.min(20000, el - targets[i]))]), t0: null }); } } }, Z.stop)]);
};
M.blind = (n, host, X) => {
  const Z = Y(host), tries = n.tries || 3, st = drafted(host, n, { r: [], t0: null });
  const best = st.r.length ? st.r.reduce((a, b) => (Math.abs(b - (n.goal || 10000)) < Math.abs(a - (n.goal || 10000)) ? b : a)) : 0;
  if (st.r.length >= tries) return wrap(n, host, [h("p", { class: "w-big" }, fmt(Z.time, { s: Math.round(best / 10) / 100 })), ...mainBtn(host, n, Math.max(2000, Math.min(30000, best)), "", X)]);
  return wrap(n, host, [h("p", { class: "w-note" }, fmt(Z.round, { n: st.r.length + 1, m: tries })),
    st.t0 === null ? h("button", { type: "button", class: "btn primary big", on: { click: () => setDraft(host, n, { ...st, t0: now(host) }) } }, Z.start)
      : h("button", { type: "button", class: "btn primary big", on: { click: () => { const el = now(host) - st.t0; if (el < 2000) return; setDraft(host, n, { r: st.r.concat([el]), t0: null }); } } }, Z.stop)]);
};

// Reaktion: Koeder ●▲■, dann ★; Fehltipp +500 ms, verpasst +2000 ms (Altcode turn2.js:344)
M.react = (n, host, X) => wrap(n, host, gate(n, host, () => {
  const Z = Y(host), plan = (n.plan || []).slice(0, 8), st = drafted(host, n, { i: 0, sum: 0 });
  if (st.i >= plan.length) return [h("p", { class: "w-big" }, Math.round(st.sum) + " ms"), ...mainBtn(host, n, Math.min(60000, Math.round(st.sum)), "", X)];
  const step = plan[st.i];
  const padRef = (el) => {
    const s = local(el, () => ({ phase: "wait", shown: 0, k: 0 }));
    if (s.started === st.i) return; s.started = st.i; s.phase = "wait"; s.k = 0;
    const decoys = step.decoys || 0, pause = step.pause || 800;
    const showNext = () => {
      if (!el.isConnected) return;
      if (s.k < decoys) { el.textContent = "●▲■"[s.k % 3]; el.dataset.sig = "decoy"; s.k++; setTimeout(showNext, pause); }
      else { el.textContent = "★"; el.dataset.sig = "star"; s.shown = now(host); s.phase = "star"; s.miss = setTimeout(() => { if (s.phase === "star") { s.phase = "done"; setDraft(host, n, { i: st.i + 1, sum: st.sum + 2000 }); } }, 3000); }
    };
    setTimeout(showNext, pause);
  };
  const tap = (e) => {
    const el = e.currentTarget, s = el.__w; if (!s) return;
    if (s.phase === "star") { s.phase = "done"; clearTimeout(s.miss); setDraft(host, n, { i: st.i + 1, sum: st.sum + (now(host) - s.shown) }); }
    else if (s.phase === "wait") setDraft(host, n, { ...st, sum: st.sum + 500 });
  };
  return [h("button", { type: "button", class: "w-pad", key: "pad-" + st.i, "aria-label": Z.star, ref: padRef, on: { pointerdown: tap, keydown: (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tap(e); } } } }, "")];
}));

// Preis faellt alle 80 ms um 1 (Altcode turn-ui.js:345)
M.drop = (n, host, X) => {
  const Z = Y(host), t0 = drafted(host, n, null), max = n.max || 100, ms = n.msPerStep || 80;
  const price = () => Math.max(0, max - Math.floor((now(host) - t0) / ms));
  return wrap(n, host, [h("p", { class: "w-line" }, txt(n.item) + (n.worth !== undefined ? " · " + n.worth : "")),
    t0 === null ? h("button", { type: "button", class: "btn primary big", on: { click: () => setDraft(host, n, now(host)) } }, Z.start)
      : [h("p", { class: "w-big", "aria-live": "off", ref: (el) => ticker(el, host, ms, () => { const p = price(); el.textContent = fmt(Z.price, { v: p }); if (p <= 0) send(host, n, 0); }) }, fmt(Z.price, { v: price() })),
        h("button", { type: "button", class: "btn primary big", on: { click: () => send(host, n, price()) } }, Z.buy)]]);
};

// Suchzettel mit Stoppuhr (Altcode turn-ui.js:400)
M.hunt = (n, host, X) => {
  const Z = Y(host), words = (n.words || []).slice(0, 12), st = drafted(host, n, { i: 0, t0: null });
  if (st.t0 === null) return wrap(n, host, [h("button", { type: "button", class: "btn primary big", on: { click: () => setDraft(host, n, { i: 0, t0: now(host) }) } }, Z.start)]);
  if (st.i >= words.length) { const s = Math.max(1, Math.min(n.max || 3600, Math.round((now(host) - st.t0) / 1000))); return wrap(n, host, [h("p", { class: "w-big" }, fmt(Z.time, { s })), ...mainBtn(host, n, s, "", X)]); }
  return wrap(n, host, [h("p", { class: "w-line" }, txt(words[st.i].hint, 80)),
    h("input", { class: "field", type: "text", maxlength: "30", autocomplete: "off", "aria-label": txt(words[st.i].hint, 80), key: "h" + st.i, on: { input: (e) => { if (fold(e.target.value) === fold(words[st.i].w)) { sfx(host, "pop"); setDraft(host, n, { ...st, i: st.i + 1 }); } } } })]);
};

// Tuersteher (Altcode turn2.js:364-392): n.rules[k].beings[i]; streak richtige in Folge = naechste Regel (i von vorn)
M.tuer = (n, host, X) => wrap(n, host, gate(n, host, (t0) => {
  const Z = Y(host), rules = (n.rules || []).slice(0, 10), streak = n.streak || 4;
  const st = drafted(host, n, { k: 0, i: 0, run: 0, right: 0, total: 0, fresh: false });
  const left = Math.max(0, (n.secs || 60) - Math.floor((now(host) - t0) / 1000));
  const val = [Math.min(10, st.k), st.right, Math.min(999, st.total)];
  const rule = rules[st.k], b = rule && rule.beings ? rule.beings[st.i] : null;
  if (left <= 0 || !b) return [h("p", { class: "w-big" }, fmt(Z.score, { n: st.right })), ...mainBtn(host, n, val, "", X)];
  const answer = (inn) => {
    const ok = inn === !!b.in, run = ok ? st.run + 1 : 0, next = run >= streak;
    setDraft(host, n, next ? { k: st.k + 1, i: 0, run: 0, right: st.right + 1, total: st.total + 1, fresh: true } : { ...st, i: st.i + 1, run, right: st.right + (ok ? 1 : 0), total: st.total + 1, fresh: false });
    sfx(host, ok ? "pop" : "thud");
  };
  return [
    st.fresh ? h("p", { class: "w-note", role: "status" }, host.lang === "en" ? "New rule!" : "Neue Regel!") : null,
    h("p", { class: "w-big", role: "img", "aria-label": txt(b.a11y || (b.look || []).join(" "), 120) }, txt((b.look || []).join(" "), 40)),
    h("p", { class: "w-count", ref: (el) => ticker(el, host, 250, () => { el.textContent = fmt(Z.time, { s: Math.max(0, (n.secs || 60) - Math.floor((now(host) - t0) / 1000)) }); }) }, fmt(Z.time, { s: left })),
    h("div", { class: "options" }, h("button", { type: "button", class: "btn", on: { click: () => answer(false) } }, Z.out), h("button", { type: "button", class: "btn", on: { click: () => answer(true) } }, Z.inn)),
    h("p", { class: "w-note", "aria-hidden": "true" }, "●".repeat(st.run) + "○".repeat(Math.max(0, streak - st.run)))
  ];
}));

// Finger auf den Bildschirm, nach 3 s Ruhe wird einer gewaehlt (Altcode turn-ui.js:234); Tastatur: Zufall ziehen
M.touch = (n, host, X) => {
  const Z = Y(host), picked = drafted(host, n, null);
  // Zufall nur ueber host.random (Kryptozufall des Geraets); ohne ihn ist das Widget ehrlich gesperrt
  if (typeof host.random !== "function") return wrap(n, host, [h("p", { class: "w-note" }, (internals.txt)(X.invalid))]);
  if (picked !== null) return wrap(n, host, [h("p", { class: "w-big" }, "☝ " + (picked + 1)), ...mainBtn(host, n, 0, "", X)]);
  const pad = (el) => {
    const s = local(el, () => ({ f: new Map(), t: null }));
    const arm = () => { clearTimeout(s.t); if (s.f.size >= 2) s.t = setTimeout(() => { const ids = [...s.f.keys()]; setDraft(host, n, host.random(ids.length)); }, 3000); };
    if (s.bound) return; s.bound = true;
    el.addEventListener("pointerdown", (e) => { if (s.f.size < (n.max || 5)) { s.f.set(e.pointerId, true); arm(); } });
    for (const t of ["pointerup", "pointercancel"]) el.addEventListener(t, (e) => { s.f.delete(e.pointerId); arm(); });
  };
  return wrap(n, host, [h("div", { class: "touchpad", ref: pad, role: "application", "aria-label": txt(n.label) }), h("button", { type: "button", class: "chip", on: { click: () => setDraft(host, n, host.random(n.people || 2)) } }, Z.tapPick)]);
};

// Nim / Pommes (Altcode turn-ui.js:281): Missere – wer die letzte nimmt, verliert. Der Bot ist Sache der Karte:
// sie liest den Entwurf (ctx.draft["w:<id>"]) und liefert n.botMove = [stapel, neueHoehe] als Daten.
M.nim = (n, host, X) => {
  const Z = Y(host), st = drafted(host, n, { heaps: (n.heaps || [3, 4, 5]).slice(), mark: null, turn: 0 });
  const total = st.heaps.reduce((a, b) => a + b, 0);
  if (total === 0) return wrap(n, host, [h("p", { class: "w-big" }, st.turn === 0 ? "🏆" : "🍟"), ...mainBtn(host, n, st.turn === 0 ? 1 : 0, "", X)]);
  const take = (hp, from) => { const heaps = st.heaps.slice(); heaps[hp] = from; setDraft(host, n, { heaps, mark: null, turn: heaps.some((x) => x > 0) ? 1 : 1, lastBy: 0 }); };
  const botRef = (el) => {
    if (st.turn !== 1 || !Array.isArray(n.botMove)) return;
    const s2 = local(el, () => ({})); if (s2.for === JSON.stringify(st.heaps)) return; s2.for = JSON.stringify(st.heaps);
    setTimeout(() => { if (!el.isConnected) return; const heaps = st.heaps.slice(), [i, to] = n.botMove; if (Number.isInteger(i) && heaps[i] > to && to >= 0) heaps[i] = to; setDraft(host, n, { heaps, mark: null, turn: 0, lastBy: 1 }); }, 600);
  };
  // Ende: wer die letzte nahm (lastBy) verliert
  if (st.heaps.every((x) => x === 0)) return wrap(n, host, [h("p", { class: "w-big" }, st.lastBy === 1 ? "🏆" : "🍟"), ...mainBtn(host, n, st.lastBy === 1 ? 1 : 0, "", X)]);
  return wrap(n, host, [h("div", { class: "w-heaps", "data-busy": st.turn === 1 ? "true" : null, ref: botRef }, st.heaps.map((c, hp) => h("div", { key: hp, class: "w-heap", role: "group", "aria-label": (host.lang === "en" ? "Pile " : "Stapel ") + (hp + 1) },
    Array.from({ length: c }, (_, i) => h("button", { type: "button", key: i, class: "chip fry" + (st.mark && st.mark[0] === hp && i >= st.mark[1] ? " on" : ""), "aria-pressed": press(!!(st.mark && st.mark[0] === hp && i >= st.mark[1])), "aria-label": (st.mark && st.mark[0] === hp && i === st.mark[1] ? Z.take : Z.mark) + " " + (c - i), disabled: st.turn === 1 || host.disabled ? true : null,
      on: { click: () => (st.mark && st.mark[0] === hp && st.mark[1] === i ? take(hp, i) : setDraft(host, n, { ...st, mark: [hp, i] })) } }, "🍟")))))]);
};

// Bloecke 8x8 (Altcode turn-ui.js:411): Steine legen; die Karte prueft die Liste per Nachspielen
M.blocks = (n, host, X) => {
  const Z = Y(host), size = n.size || 8, v = drafted(host, n, []), max = n.max || 40;
  // Belegung und Punkte rechnet die Karte aus dem Entwurf und gibt sie als Daten: n.board = {cells, score, next, after}
  const fill = n.board && typeof n.board === "object" ? n.board : null;
  const tap = (i) => { if (v.length < max) setDraft(host, n, v.concat([i])); };
  const cells = [];
  for (let i = 0; i < size * size; i++) cells.push(h("button", { type: "button", key: i, class: "bcell" + (fill && fill.cells && fill.cells[i] ? " on" : ""), "aria-label": String(i + 1) + (fill && fill.cells && fill.cells[i] ? " " + Z.pressed : ""), disabled: host.disabled ? true : null, on: { click: () => tap(i) } }));
  return wrap(n, host, [h("div", { class: "bgrid", style: { "grid-template-columns": "repeat(" + size + ", minmax(2.2rem, 1fr))" } }, cells), fill && fill.score !== undefined ? h("p", { class: "w-count", "aria-live": "polite" }, fmt(Z.blocks, { n: fill.score })) : null, h("button", { type: "button", class: "chip", disabled: !v.length ? true : null, on: { click: () => setDraft(host, n, v.slice(0, -1)) } }, Z.undo), ...mainBtn(host, n, v, v.length ? "" : X.fill, X)]);
};

// Kerzen auspusten (Altcode turn-ui.js:379): Mikro optional, Tippen immer
M.blow = (n, host, X) => {
  const Z = Y(host), k = n.n || 5, out = drafted(host, n, []);
  if (out.length >= k) return wrap(n, host, [h("p", { class: "w-big" }, "🎂"), ...mainBtn(host, n, 0, "", X)]);
  return wrap(n, host, [h("div", { class: "options" }, Array.from({ length: k }, (_, i) => h("button", { type: "button", key: i, class: "chip", "aria-label": fmt(Z.candle, { n: i + 1 }), "aria-pressed": press(out.includes(i)), disabled: out.includes(i) ? true : null, on: { click: () => setDraft(host, n, out.concat([i])) } }, out.includes(i) ? "·" : "🕯️"))),
    host.audio && host.audio.listenBlow ? h("button", { type: "button", class: "chip", on: { click: () => host.audio.listenBlow(() => { const i = Array.from({ length: k }, (_, j) => j).find((j) => !out.includes(j)); if (i !== undefined) setDraft(host, n, out.concat([i])); }) } }, Z.blow) : h("p", { class: "w-note" }, Z.noMic)]);
};

// Ton (uses voice / audio-out): Aufnahme bleibt im Speicher des Geraets (host.audio), nie im Link
function audioBtn(host, label, f) { return h("button", { type: "button", class: "btn", disabled: !host.audio ? true : null, on: { click: f } }, label); }
M.rec = (n, host, X) => { const Z = Y(host), done = drafted(host, n, false); return wrap(n, host, [done ? h("p", { class: "w-big" }, "✓") : audioBtn(host, "🎙 " + Z.rec, () => host.audio.record(n.slot, n.ms || 3000).then(() => setDraft(host, n, true))), ...(done ? mainBtn(host, n, 0, "", X) : [])]); };
M.record = M.rec;
M.once = (n, host, X) => { const Z = Y(host), done = drafted(host, n, false); return wrap(n, host, [done ? h("p", { class: "w-note" }, "✓") : audioBtn(host, "▶ " + Z.playOnce, () => host.audio.playOnce(n.slot, n.fx).then((ok) => setDraft(host, n, ok ? true : "gone"))), done === "gone" ? h("p", { class: "w-note" }, Z.gone) : null, ...(done ? mainBtn(host, n, 0, "", X) : [])]); };
M.parrot = (n, host, X) => { const Z = Y(host), st = drafted(host, n, 0); return wrap(n, host, [audioBtn(host, "▶ " + Z.back, () => host.audio.playReversed(n.from).then(() => setDraft(host, n, Math.max(st, 1)))), st >= 1 ? audioBtn(host, "🎙 " + Z.rec, () => host.audio.record(n.slot, 2500).then(() => host.audio.playReversed(n.slot)).then(() => setDraft(host, n, 2))) : null, ...(st >= 2 ? mainBtn(host, n, 0, "", X) : [])]); };
M.whose = (n, host, X) => { const Z = Y(host), played = drafted(host, n, false); return wrap(n, host, [audioBtn(host, "▶ " + Z.play, () => host.audio.playOnce(n.slot, n.fx).then(() => setDraft(host, n, true))), played ? h("div", { class: "options" }, (n.options || []).slice(0, 3).map((o, i) => h("button", { type: "button", class: "chip", key: i, on: { click: () => send(host, n, i) } }, txt(o.label, 40)))) : null]); };
M.audio = (n, host) => wrap(n, host, [audioBtn(host, "▶ " + txt(n.label || Y(host).play, 40), () => host.audio.play(n.src))]);
M.freeze = (n, host, X) => {
  const Z = Y(host), st = drafted(host, n, { r: 0, stopped: false });
  return wrap(n, host, [st.stopped ? h("p", { class: "w-big", "aria-live": "assertive" }, txt(n.statues && n.statues[st.r % n.statues.length], 60)) : null,
    audioBtn(host, "▶ " + Z.play, () => host.audio.playUntil(n.beat, (n.pauses || [8])[st.r % (n.pauses || [8]).length]).then(() => { host.vibrate && host.vibrate(80); setDraft(host, n, { r: st.r + 1, stopped: true }); })),
    h("button", { type: "button", class: "btn", on: { click: () => send(host, n, Math.min(n.max || 99, st.r)) } }, Z.end)]);
};
M.voices = (n, host, X) => {
  const Z = Y(host), data = n.data || [], st = drafted(host, n, { i: 0, hits: 0 });
  if (st.i >= (n.rounds || data.length)) return wrap(n, host, [h("p", { class: "w-big" }, fmt(Z.score, { n: st.hits })), ...mainBtn(host, n, st.hits, "", X)]);
  const d = data[st.i] || {};
  return wrap(n, host, [h("p", { class: "w-note" }, fmt(Z.round, { n: st.i + 1, m: n.rounds || data.length })),
    n.role === "speak" ? [h("p", { class: "w-big" }, txt(d.figure, 40)), h("button", { type: "button", class: "btn", on: { click: () => setDraft(host, n, { ...st, i: st.i + 1 }) } }, Z.next)]
      : h("div", { class: "options wrap" }, (d.options || []).slice(0, 6).map((o, j) => h("button", { type: "button", class: "chip", key: j, "aria-pressed": "false", on: { click: () => { sfx(host, j === d.right ? "pop" : "thud"); setDraft(host, n, { i: st.i + 1, hits: st.hits + (j === d.right ? 1 : 0) }); } } }, txt(o, 30))))]);
};

// Tueren: 24 Tueren (Anzeige, Anzahl offener aus ctx.today), einzelne Adventstuer (Aufklappen)
M.doors = (n, host) => {
  const Z = Y(host), open = Math.max(0, Math.min(24, n.open || 0)), seen = drafted(host, n, null);
  return wrap(n, host, [h("div", { class: "bgrid doors", style: { "grid-template-columns": "repeat(6, minmax(2.75rem, 1fr))" } }, Array.from({ length: 24 }, (_, i) => h("button", { type: "button", key: i, class: "bcell" + (seen === i ? " on" : ""), "aria-label": fmt(Z.door, { n: i + 1 }) + (i < open ? "" : ", " + Z.closed), "aria-pressed": press(seen === i), disabled: i >= open ? true : null, on: { click: () => setDraft(host, n, i) } }, String(i + 1)))),
    seen !== null ? h("p", { class: "w-big", "aria-live": "polite" }, txt((n.texts || [])[seen], 120)) : null]);
};
M.door = (n, host, X) => {
  const Z = Y(host), opened = drafted(host, n, !n.closed);
  if (!opened) return wrap(n, host, [h("button", { type: "button", class: "w-door", "data-act": "w-door", "aria-label": txt(n.label || fmt(Z.door, { n: n.nr })), on: { click: () => { setDraft(host, n, true); if (n.submit) send(host, n, 0); } } }, h("span", { class: "w-door-nr", "aria-hidden": "true" }, String(n.nr || "")), h("span", { class: "w-door-hint" }, txt(n.hint || Z.openD, 40)))], { cls: "closed" });
  return wrap(n, host, [...(n.children || []).map((c) => host.renderChild(c))], { cls: "open" });
};

// Termine: slots (Tage x Uhrzeiten), vote (ja/vielleicht/nein je Termin)
const HOURS = [10, 12, 14, 15, 16, 17, 18, 19, 20];
function slotText(x, lang, day0) { const d = Math.floor(x / 10), hr = HOURS[x % 10]; const dt = new Date(d * 86400000); const wd = dt.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }); return wd + " " + (lang === "en" ? (hr > 12 ? hr - 12 + " pm" : hr === 12 ? "12 pm" : hr + " am") : hr + " Uhr"); }
M.slots = (n, host, X) => {
  const Z = Y(host), st = drafted(host, n, { name: host.nick || "", hour: null, sel: [] }), days = n.days || 14, d0 = n.from || 20000, hol = new Set(n.holidays || []);
  const valid = st.sel.length >= 2 && st.sel.length <= (n.max || 5) && clean(st.name, 12) === st.name.trim() && st.name.trim();
  const val = [st.name.trim(), st.sel.slice().sort((a, b) => a - b)];
  return wrap(n, host, [
    h("input", { class: "field", type: "text", maxlength: "12", "aria-label": Z.name, placeholder: Z.name, value: st.name, on: { input: (e) => setDraft(host, n, { ...st, name: e.target.value }) } }),
    h("div", { class: "options wrap", role: "group", "aria-label": "Uhrzeit" }, HOURS.map((hr, i) => h("button", { type: "button", class: "chip", key: i, "aria-pressed": press(st.hour === i), on: { click: () => setDraft(host, n, { ...st, hour: i }) } }, host.lang === "en" ? (hr > 12 ? hr - 12 + " pm" : hr + (hr === 12 ? " pm" : " am")) : hr + " Uhr"))),
    h("div", { class: "options wrap", role: "group", "aria-label": "Tag" }, Array.from({ length: days }, (_, i) => { const d = d0 + i, x = d * 10 + (st.hour === null ? 0 : st.hour), on = st.sel.includes(x); return h("button", { type: "button", class: "chip", key: i, "aria-pressed": press(on), disabled: st.hour === null || hol.has(d) || (!on && st.sel.length >= (n.max || 5)) ? true : null, on: { click: () => setDraft(host, n, { ...st, sel: on ? st.sel.filter((y) => y !== x) : st.sel.concat([x]) }) } }, new Date(d * 86400000).toLocaleDateString(host.lang === "en" ? "en-GB" : "de-DE", { weekday: "short", day: "numeric", timeZone: "UTC" })); })),
    h("div", { class: "options wrap" }, st.sel.map((x) => h("button", { type: "button", class: "chip on", key: x, "aria-label": slotText(x, host.lang) + " " + Z.del, on: { click: () => setDraft(host, n, { ...st, sel: st.sel.filter((y) => y !== x) }) } }, slotText(x, host.lang) + " ✕"))),
    ...mainBtn(host, n, val, valid ? "" : X.fill, X)
  ]);
};
M.vote = (n, host, X) => {
  const Z = Y(host), dates = n.dates || [], st = drafted(host, n, { name: host.nick || "", v: dates.map(() => -1) });
  const taken = (n.taken || []).map(fold).includes(fold(st.name));
  const ok = st.name.trim() && !taken && clean(st.name, 12) === st.name.trim() && st.v.every((x) => x >= 0);
  return wrap(n, host, [
    h("input", { class: "field", type: "text", maxlength: "12", "aria-label": Z.name, placeholder: Z.name, value: st.name, on: { input: (e) => setDraft(host, n, { ...st, name: e.target.value }) } }),
    taken ? h("p", { class: "w-note" }, Z.taken) : null,
    h("button", { type: "button", class: "chip", on: { click: () => setDraft(host, n, { ...st, v: dates.map(() => 0) }) } }, Z.allYes),
    ...dates.map((x, i) => h("div", { class: "w-vote", role: "group", "aria-label": slotText(x, host.lang), key: x }, h("span", { class: "w-lbl" }, slotText(x, host.lang)),
      ...[Z.yes, Z.maybe, Z.no].map((lbl, k) => h("button", { type: "button", class: "chip", key: k, "aria-pressed": press(st.v[i] === k), on: { click: () => { const v = st.v.slice(); v[i] = k; setDraft(host, n, { ...st, v }); } } }, lbl)))),
    ...mainBtn(host, n, [st.name.trim(), st.v], ok ? "" : X.fill, X)
  ]);
};

// Listen-Editoren (Altcode turn-ui.js:450 shop, turn2.js:68 wish): die Liste selbst ist der Wert
const FACES = ["🙂", "😎", "🤓", "🥳", "😺", "🐶", "🦊", "🐼", "🐸", "🐵", "🦄", "🐙"];
function listEditor(n, host, X, kind) {
  const Z = Y(host), cfg = n.cfg || { items: 20, text: 24, people: 8 }, base = n.list || [[], []];
  const st = drafted(host, n, { list: base, name: host.nick || "", text: "", note: null });
  const [people, items] = st.list, meIdx = people.findIndex((p) => fold(p[0]) === fold(st.name));
  const own = kind === "wish" && n.role === "own";
  const add = () => {
    const m = kind === "shop" && !cfg.due ? /^(\d{1,2})\s*[x×]?\s+(.+)$/i.exec(st.text.trim()) : null;
    const qty = m ? Math.max(1, Math.min(99, Number(m[1]))) : 1, t = clean(m ? m[2] : st.text, cfg.text);
    if (!t) return setDraft(host, n, { ...st, note: X.invalid });
    if (items.some((x) => fold(x[0]) === fold(t) && x[2] >= qty)) return setDraft(host, n, { ...st, note: Z.have });
    if (items.length >= cfg.items) return setDraft(host, n, { ...st, note: Z.full });
    setDraft(host, n, { ...st, text: "", note: null, list: [people, items.concat([[t, 0, kind === "wish" ? 1 : qty, []]])] });
  };
  const mark = (i, s) => {
    if (!st.name.trim() || clean(st.name, 12) !== st.name.trim()) return setDraft(host, n, { ...st, note: Z.needName });
    let ppl = people, me = meIdx;
    if (me < 0) { if (ppl.length >= cfg.people) return setDraft(host, n, { ...st, note: Z.full }); ppl = ppl.concat([[st.name.trim(), ppl.length % FACES.length]]); me = ppl.length - 1; }
    const it = items.map((x, j) => (j !== i ? x : [x[0], x[1], x[2], x[3].some((m) => m[0] === me && m[1] % 3 === s) ? x[3].filter((m) => m[0] !== me) : x[3].filter((m) => m[0] !== me).concat([[me, s]])]));
    setDraft(host, n, { ...st, note: null, list: [ppl, it] });
  };
  const changed = JSON.stringify(st.list) !== JSON.stringify(base);
  return wrap(n, host, [
    own || kind === "shop" ? h("form", { class: "w-add", on: { submit: (e) => { e.preventDefault(); add(); } } },
      h("input", { class: "field", type: "text", maxlength: String(cfg.text + 4), enterkeyhint: "enter", "aria-label": txt(n.label), value: st.text, on: { input: (e) => setDraft(host, n, { ...st, text: e.target.value }) } }),
      h("button", { type: "submit", class: "chip", "aria-label": Z.add }, "+")) : null,
    st.note ? h("p", { class: "w-note", role: "status" }, st.note) : null,
    h("ul", { class: "w-items" }, items.map((x, i) => {
      const marks = x[3] || [], by = (s) => marks.filter((m) => m[1] % 3 === s).map((m) => people[m[0]] ? FACES[people[m[0]][1] % FACES.length] + " " + people[m[0]][0] : "");
      const mineS = (s) => marks.some((m) => m[0] === meIdx && m[1] % 3 === s);
      return h("li", { key: i }, h("b", {}, (x[2] > 1 ? x[2] + "× " : "") + txt(x[0], 48)),
        own ? null : h("small", {}, [by(1).length ? "🙋 " + by(1).join(", ") : "", by(2).length ? "✓ " + by(2).join(", ") : ""].filter(Boolean).join(" · ")),
        own ? null : h("button", { type: "button", class: "chip", "aria-pressed": press(mineS(1)), "aria-label": Z.bring + ": " + x[0], on: { click: () => mark(i, 1) } }, kind === "wish" ? "🎁" : "🙋"),
        own || kind === "wish" ? null : h("button", { type: "button", class: "chip", "aria-pressed": press(mineS(2)), "aria-label": Z.got + ": " + x[0], on: { click: () => mark(i, 2) } }, "✓"),
        (own || kind === "shop") && i >= (base[1] || []).length ? h("button", { type: "button", class: "chip", "aria-label": Z.del + ": " + x[0], on: { click: () => setDraft(host, n, { ...st, list: [people, items.filter((_, j) => j !== i)] }) } }, "✕") : null);
    })),
    own ? null : h("input", { class: "field", type: "text", maxlength: "12", "aria-label": Z.name, placeholder: Z.name, value: st.name, on: { input: (e) => setDraft(host, n, { ...st, name: e.target.value }) } }),
    ...mainBtn(host, n, st.list, changed ? "" : X.fill, X)
  ], { cls: "big" });
}
M.shop = (n, host, X) => listEditor(n, host, X, "shop");
M.wish = (n, host, X) => listEditor(n, host, X, "wish");

// Buero-Wichteln (Altcode turn2.js:184): Anmelden; Ziehen und Siegel liefert die Karte als Daten
M.bw = (n, host, X) => {
  const Z = Y(host), st = drafted(host, n, { name: host.nick || "" }), names = n.names || [];
  if (n.phase === "drawn") return wrap(n, host, [h("div", { class: "options wrap" }, names.map((nm, i) => h("button", { type: "button", class: "chip", key: i, on: { click: () => setDraft(host, n, { ...st, open: i }) } }, txt(nm, 12)))), st.open !== undefined && n.slips ? h("div", { class: "bwslip", "aria-live": "polite" }, txt(n.slips[st.open], 60)) : null]);
  const ok = clean(st.name, 12) === st.name.trim() && st.name.trim() && !names.map(fold).includes(fold(st.name));
  return wrap(n, host, [h("p", { class: "w-note", role: "status" }, names.join(", ")),
    h("input", { class: "field", type: "text", maxlength: "12", "aria-label": Z.name, value: st.name, on: { input: (e) => setDraft(host, n, { ...st, name: e.target.value }) } }),
    ...mainBtn(host, n, { add: st.name.trim() }, ok ? "" : X.fill, X),
    n.org ? h("button", { type: "button", class: "btn", disabled: names.length < 3 ? true : null, "aria-disabled": names.length < 3 ? "true" : null, on: { click: () => send(host, n, { draw: true }) } }, Z.draw + " (" + names.length + ")") : null]);
};

// Spielkarten (Strang T): Bild ueber cardSvg der Karte (host.cardSvg), Auswahl mehrerer Karten
function svgNode(d) { if (typeof d === "string") return d; return h(d.tag, d.attrs || {}, ...(d.children || []).map(svgNode)); }
function pcardView(n, host, sel = null, onTap = null) {
  const pic = host.cardSvg ? svgNode(host.cardSvg(n.code === undefined ? null : n.code, { lang: host.lang })) : txt(n.code || "🂠", 4);
  const cls = "pcard size-" + (["s", "m", "l"].includes(n.size) ? n.size : "m") + " st-" + (["ok", "no", "sel", "none"].includes(n.state) ? n.state : "none");
  if (onTap) return h("button", { type: "button", class: cls, "aria-label": txt(n.a11y, 60), "aria-pressed": sel === null ? null : press(sel), disabled: host.disabled || n.state === "no" ? true : null, on: { click: onTap } }, pic);
  return h("span", { class: cls, role: "img", "aria-label": txt(n.a11y, 60) }, pic);
}
M.pcard = (n, host) => pcardView(n, host, null, n.submit ? () => send(host, n, 0) : null);
M.pickn = (n, host, X) => {
  const items = (n.items || []).slice(0, 16), k = n.n || 2, v = drafted(host, n, []);
  const opt = (n.options || []).find((o) => Array.isArray(o.sel) && o.sel.length === v.length && o.sel.slice().sort().join() === v.slice().sort().join());
  return h("section", { class: "widget pickn", role: "group", "aria-label": txt(n.label), key: "pickn-" + n.id }, n.label ? h("h3", { class: "w-label" }, txt(n.label)) : null,
    h("div", { class: "pcards", "data-part": n.part || null }, items.map((c, i) => pcardView(c, host, v.includes(i), () => setDraft(host, n, v.includes(i) ? v.filter((x) => x !== i) : v.length < k ? v.concat([i]) : v)))),
    h("button", { type: "button", class: "btn primary", disabled: !opt || host.disabled ? true : null, on: { click: () => opt && host.onInput(opt.input) } }, txt(n.confirm || X.next, 40)));
};

// Zielen (Strang S): Punkt auf der Flaeche per Zeiger oder Pfeiltasten -> Ganzzahlraster
M.aim = (n, host, X) => {
  const Z = Y(host), g = n.grid || 4096, v = drafted(host, n, [g >> 1, g >> 1]), stepK = Math.max(1, g >> 6);
  const set = (x, y) => setDraft(host, n, [Math.max(0, Math.min(g - 1, Math.round(x))), Math.max(0, Math.min(g - 1, Math.round(y)))]);
  return wrap(n, host, [h("div", { class: "w-aim", tabindex: "0", role: "slider", "aria-label": txt(n.label) + " – " + Z.aimHint, "aria-valuetext": v[0] + ", " + v[1],
    on: { pointerdown: (e) => { const r = e.currentTarget.getBoundingClientRect(); set((e.clientX - r.left) / r.width * g, (e.clientY - r.top) / r.height * g); },
      keydown: (e) => { const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (d) { e.preventDefault(); set(v[0] + d[0] * stepK, v[1] + d[1] * stepK); } if (e.key === "Enter") send(host, n, v); } } },
    n.card ? host.renderChild(n.card) : null,
    h("span", { class: "w-cross", "aria-hidden": "true", style: { left: (v[0] / g * 100) + "%", top: (v[1] / g * 100) + "%" } }, "✛")), ...mainBtn(host, n, v, "", X)]);
};
// Kraft: Pendel (zeitgetrieben) oder Schieber; Leertaste halten
M.power = (n, host, X) => {
  const Z = Y(host), L = n.levels || 9, v = drafted(host, n, null);
  if (n.mode === "schieber" || host.reduced) return M.slide({ ...n, t: "slide", min: 0, max: L - 1, step: 1, def: L >> 1, label: n.label || Z.hold }, host, X);
  const level = (t0) => { const p = ((now(host) - t0) / (n.period || 1200)) % 2; return Math.min(L - 1, Math.floor((p < 1 ? p : 2 - p) * L)); };
  return wrap(n, host, [h("button", { type: "button", class: "btn primary big", "aria-label": Z.hold,
    on: { pointerdown: () => setDraft(host, n, now(host)), pointerup: () => v !== null && send(host, n, level(v)), keydown: (e) => { if (e.key === " " && v === null) { e.preventDefault(); setDraft(host, n, now(host)); } }, keyup: (e) => { if (e.key === " " && v !== null) send(host, n, level(v)); } } },
    v === null ? Z.hold : h("span", { ref: (el) => ticker(el, host, 50, () => { el.textContent = fmt(Z.power, { n: level(v) + 1, m: L }); }) }, fmt(Z.power, { n: level(v) + 1, m: L })))]);
};
// Zeichnen (Strang S, Malrat): Striche in 0..1000, Farben/Breiten, Rueckgaengig/Loeschen
M.draw = (n, host, X) => {
  const Z = Y(host), colors = (n.colors || ["#111111"]).slice(0, 8), widths = (n.widths || [4]).slice(0, 3), st = drafted(host, n, { c: 0, w: 0, s: [] });
  const pts = st.s.reduce((a, s) => a + s[2].length / 2, 0), maxPts = n.maxPts || 600;
  const surf = (el) => {
    const loc = local(el, () => ({ cur: null }));
    if (loc.bound) return; loc.bound = true;
    const P = (e) => { const r = el.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000), Math.round((e.clientY - r.top) / r.height * 1000)]; };
    el.addEventListener("pointerdown", (e) => { el.setPointerCapture && el.setPointerCapture(e.pointerId); loc.cur = P(e); });
    el.addEventListener("pointermove", (e) => { if (loc.cur && loc.cur.length < 400) loc.cur.push(...P(e)); });
    el.addEventListener("pointerup", () => { const d = el.__d(); if (loc.cur && d.pts + loc.cur.length / 2 <= maxPts) d.commit(loc.cur); loc.cur = null; });
  };
  return wrap(n, host, [
    h("div", { class: "options", role: "radiogroup", "aria-label": "Farbe" }, colors.map((c, i) => h("button", { type: "button", key: i, class: "chip swatch", role: "radio", "aria-checked": st.c === i ? "true" : "false", "aria-label": fmt(Z.color, { n: i + 1 }), style: { background: /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#111111" }, on: { click: () => setDraft(host, n, { ...st, c: i }) } }))),
    h("div", { class: "options", role: "radiogroup", "aria-label": "Breite" }, widths.map((w, i) => h("button", { type: "button", key: i, class: "chip", role: "radio", "aria-checked": st.w === i ? "true" : "false", on: { click: () => setDraft(host, n, { ...st, w: i }) } }, fmt(Z.width, { n: i + 1 })))),
    h("div", { class: "w-draw", role: "img", "aria-label": txt(n.label), ref: (el) => { el.__d = () => ({ pts, commit: (p) => setDraft(host, n, { ...st, s: st.s.concat([[st.c, st.w, p]]) }) }); surf(el); } },
      h("svg", { viewBox: "0 0 1000 1000", "aria-hidden": "true" }, st.s.map((s, i) => h("polyline", { key: i, points: s[2].join(" "), fill: "none", stroke: colors[s[0]] || "#111111", "stroke-width": String(widths[s[1]] * 4 || 8), "stroke-linecap": "round" })))),
    h("div", { class: "options" }, h("button", { type: "button", class: "chip", disabled: !st.s.length ? true : null, on: { click: () => setDraft(host, n, { ...st, s: st.s.slice(0, -1) }) } }, Z.undo), h("button", { type: "button", class: "chip", disabled: !st.s.length ? true : null, on: { click: () => setDraft(host, n, { ...st, s: [] }) } }, Z.clear)),
    ...mainBtn(host, n, st.s, st.s.length ? "" : X.fill, X)
  ]);
};
M.strokes = (n, host) => {
  const colors = n.colors || ["#111111"], widths = n.widths || [4], all = n.strokes || [];
  const shown = host.reduced ? all.length : drafted(host, n, 0);
  return wrap(n, host, [h("div", { class: "w-draw", role: "img", "aria-label": txt(n.label), ref: (el) => { if (!host.reduced && shown < all.length) { const s = local(el, () => ({})); clearTimeout(s.t); s.t = setTimeout(() => el.isConnected && setDraft(host, n, shown + 1), n.ms || 600); } } },
    h("svg", { viewBox: "0 0 1000 1000", "aria-hidden": "true" }, all.slice(0, shown).map((s, i) => h("polyline", { key: i, points: s[2].join(" "), fill: "none", stroke: colors[s[0]] || "#111111", "stroke-width": String(widths[s[1]] * 4 || 8), "stroke-linecap": "round" }))))]);
};
// 16-Schritt-Raster (Strang P, Beat): jeder Tipp ist eine Eingabe {row, i}
M.steps = (n, host) => wrap(n, host, [h("div", { class: "w-steps" }, (n.rows || []).slice(0, 8).map((r) => h("div", { class: "w-steprow", role: "group", "aria-label": txt(r.label, 30), key: r.id }, h("span", { class: "w-lbl" }, txt(r.label, 30)),
  ...Array.from({ length: 16 }, (_, i) => { const on = (r.cells || "")[i] === "x"; return h("button", { type: "button", key: i, class: "bcell step" + (on ? " on" : "") + (i % 4 === 0 ? " beat" : ""), "aria-pressed": press(on), "aria-label": txt(r.label, 30) + " " + fmt(Y(host).step, { n: i + 1 }), disabled: host.disabled ? true : null, on: { click: () => send(host, n, { row: r.id, i }) } }); }))))]);

registerWidgets(M);
export { whyBase as why };
