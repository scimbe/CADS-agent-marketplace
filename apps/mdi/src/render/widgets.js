// Widget-Primitive fuer Zugkarten (ADR 0001 c). Jedes Widget liefert seinen Wert als Daten: der Host schickt
// { ...node.submit, a: wert }. Zwischenwerte (Auswahl, Texte) liegen im Entwurf der Statechart (ctx.draft) unter
// "w:<id>", damit sie Neuzeichnen und Zurueck ueberstehen; Zeitspiele halten ihre Uhr am Element (Anzeige, keine Regel).
// a11y: echte Buttons/Inputs mit Beschriftung, aria-pressed fuer Umschalter, Pfeiltasten in Rastern, gesperrter
// Hauptknopf nennt seinen Grund (aria-describedby). Groessen in rem (grosse Schrift skaliert alles).
import { h } from "../ui/dom.js";
import { clean, fold, utf8Bytes } from "../contract/text.js";

export const TX = {
  de: { next: "Weiter", send: "Senden", why: "Noch offen: {s}", pickN: "Wähle {n}", picked: "{k} von {n} gewählt", rankRest: "Tippe in der Reihenfolge", fill: "Bitte ausfüllen", oneWord: "Nur ein Wort", invalid: "Das geht so nicht", left: "Noch {n} übrig", less: "weniger {s}", more: "mehr {s}", copy: "Kopieren", copied: "Kopiert", file: "Datei sichern", minor: "Das geht erst ab 18.", adult: "Ich bin 18 oder älter", agePls: "Bitte bestätige zuerst, dass du 18 bist.", total: "Summe {e}", share: "je Person {e}", rest: "Rest {e} bleibt bei dir", noMoney: "Betrag zwischen {a} und {b}", required: "Pflicht", cell: "Feld {r}{c}", more2: "Mehr", ai: "Mit KI ausfüllen", openCard: "Weiter zu {s}", unknown: "Dieses Element kann hier nicht angezeigt werden" },
  en: { next: "Next", send: "Send", why: "Still open: {s}", pickN: "Choose {n}", picked: "{k} of {n} chosen", rankRest: "Tap in order", fill: "Please fill in", oneWord: "One word only", invalid: "That does not work", left: "{n} left", less: "less {s}", more: "more {s}", copy: "Copy", copied: "Copied", file: "Save file", minor: "Only from 18.", adult: "I am 18 or older", agePls: "Please confirm you are 18 first.", total: "Total {e}", share: "{e} each", rest: "{e} stays with you", noMoney: "Amount between {a} and {b}", required: "Required", cell: "Cell {r}{c}", more2: "More", ai: "Fill in with AI", openCard: "Go to {s}", unknown: "This element cannot be shown here" }
};
export const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => String(o[k]));
const txt = (s, max = 300) => String(s === undefined || s === null ? "" : s).slice(0, max);
const intOk = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** Euro aus Cent im Altcode-Format (core.js:451): ganze Euro ohne Nachkommastellen. */
export function euro(cents, lang) {
  const neg = cents < 0, c = Math.abs(cents), e = Math.floor(c / 100), r = c % 100;
  const s = r ? e + (lang === "en" ? "." : ",") + String(r).padStart(2, "0") : String(e);
  return (neg ? "−" : "") + (lang === "en" ? "€" + s : s + " €");
}
/** "37,50" | "37.5" | "37 €" -> 3750 (Altcode turns.js parseCents) oder null. */
export function parseCents(s) {
  const m = /^(\d{1,5})(?:[.,](\d{1,2}))?\s*(?:€|eur)?$/i.exec(String(s).trim());
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
}
/** PayPal.me-Link (Altcode turns.js payLink): Name ^[A-Za-z0-9]{1,20}$, Betrag in Cent > 0. */
export function payLink(name, cents) {
  if (!/^[A-Za-z0-9]{1,20}$/.test(String(name)) || !Number.isInteger(cents) || cents < 1) return null;
  const e = Math.floor(cents / 100), r = cents % 100;
  return "https://paypal.me/" + name + "/" + (r ? e + "." + String(r).padStart(2, "0") : String(e)) + "EUR";
}

/**
 * Wert-Pruefung je Widget (dieselbe Regel steht ueblicherweise in card.accepts). Liefert "" (gueltig) oder den Grund.
 * Reine Funktion, damit sie ohne DOM testbar ist.
 */
export function why(n, v, lang = "de") {
  const X = TX[lang] || TX.de;
  switch (n.t) {
    case "pick": { const k = n.n || 1, len = (n.options || []).length; return Array.isArray(v) && v.length === k && new Set(v).size === k && v.every((i) => intOk(i, 0, len - 1)) ? "" : fmt(X.pickN, { n: k }); }
    case "rank": { const len = (n.options || []).length; return Array.isArray(v) && v.length === len && new Set(v).size === len && v.every((i) => intOk(i, 0, len - 1)) ? "" : X.rankRest; }
    case "slide": return intOk(v, n.min || 0, n.max) && ((v - (n.min || 0)) % (n.step || 1) === 0) ? "" : X.invalid;
    case "input": {
      if (typeof v !== "string" || !v.trim()) return X.fill;
      if (n.oneWord && /\s/.test(v.trim())) return X.oneWord;
      if (clean(v, n.max || 60, { meet: n.meet !== false }) !== v.trim()) return X.invalid;
      return "";
    }
    case "list": {
      const k = n.n || 1;
      if (!Array.isArray(v) || v.length !== k) return X.fill;
      const filled = v.map((x) => String(x || "").trim());
      for (const x of filled) if (x && clean(x, n.max || 40, { meet: n.meet !== false }) !== x) return X.invalid;
      const nonEmpty = filled.filter(Boolean);
      if (!n.loose && nonEmpty.length !== k) return X.fill;
      if (n.loose && nonEmpty.length < (n.least || 0)) return X.fill;
      if (!n.same && new Set(nonEmpty.map(fold)).size !== nonEmpty.length) return X.invalid;
      if (n.bytes && utf8Bytes(filled.join("")) > n.bytes) return X.invalid;
      return "";
    }
    case "alloc": { const len = (n.options || []).length, st = n.step || 1; if (!Array.isArray(v) || v.length !== len || !v.every((x) => intOk(x, 0, n.sum) && x % st === 0)) return X.invalid; return v.reduce((a, b) => a + b, 0) <= n.sum ? "" : X.invalid; }
    case "grid": { const cells = (n.rows || 5) * (n.cols || 5); return Array.isArray(v) && v.length === (n.n || 1) && new Set(v).size === v.length && v.every((i) => intOk(i, 0, cells - 1)) ? "" : fmt(X.pickN, { n: n.n || 1 }); }
    case "money": { const lo = n.min || 100, hi = n.max || 5000 * (n.people || 1); return intOk(v, lo, hi) && Math.floor(v / (n.people || 1)) >= 1 ? "" : fmt(X.noMoney, { a: euro(lo, lang), b: euro(hi, lang) }); }
    case "day": return intOk(v, n.min || 20000, n.max || 30000) ? "" : X.invalid;
    case "form": { for (const f of n.fields || []) { const w = why(f, v && v[f.id], lang); if (w && !f.optional) return w; } return ""; }
    default: return "";
  }
}

// ---------- Bausteine ----------
function mainBtn(host, n, value, reason, X) {
  if (host.embedded) return []; // Feld in einem form: der Knopf gehoert dem form
  const id = (host.idp || "w") + "-" + n.id + "-why";
  return [
    h("button", { type: "button", class: "btn primary w-go", "data-act": "w-" + n.id, disabled: reason || host.disabled ? true : null, "aria-describedby": reason ? id : null, on: { click: () => !reason && host.onInput({ ...n.submit, a: value }) } }, txt(n.confirm || X.next, 40)),
    reason ? h("p", { class: "w-why", id }, fmt(X.why, { s: reason })) : null
  ];
}
function head(n, host) {
  return [
    n.peek ? h("p", { class: "w-peek" }, txt(n.peek)) : null,
    n.top ? h("p", { class: "w-top" }, txt(n.top)) : null,
    n.label ? h("h3", { class: "w-label", id: (host.idp || "w") + "-" + n.id + "-l" }, txt(n.label)) : null
  ];
}
function press(on) { return on ? "true" : "false"; }
function drafted(host, n, init) {
  const d = host.draft && typeof host.draft === "object" ? host.draft["w:" + n.id] : undefined;
  return d === undefined ? (n.value !== undefined ? n.value : init) : d;
}
// Patch statt ganzem Entwurf, wenn der Host ihn kann: zwei schnelle Aenderungen ueberschreiben sich nicht (Anfrage P)
function setDraft(host, n, v) {
  if (host.onDraftPatch) host.onDraftPatch({ ["w:" + n.id]: v });
  else if (host.onDraft) host.onDraft({ ...(host.draft && typeof host.draft === "object" ? host.draft : {}), ["w:" + n.id]: v });
}
function wrap(n, host, kids, extra = {}) {
  // Klasse wg-<typ> (nicht w-<typ>): innere Teile heissen w-draw, w-aim, w-slide … und duerfen nicht kollidieren (S)
  return h("section", { class: "widget wg-" + n.t + (extra.cls ? " " + extra.cls : ""), role: "group", "aria-labelledby": n.label ? (host.idp || "w") + "-" + n.id + "-l" : null, "data-part": typeof n.part === "string" ? n.part : null, key: "w-" + n.id }, ...head(n, host), ...kids);
}

// ---------- Widgets ----------
const W = {};

W.pick = (n, host, X) => {
  const k = n.n || 1, opts = (n.options || []).slice(0, 24), v = drafted(host, n, []);
  const choose = (i) => {
    let nv = v.includes(i) ? v.filter((x) => x !== i) : v.concat([i]);
    if (nv.length > k) nv = nv.slice(nv.length - k); // Altcode: das aelteste faellt weg
    if (n.auto && nv.length === k && !why(n, nv)) { host.onInput({ ...n.submit, a: nv }); return; }
    setDraft(host, n, nv);
  };
  const reason = why(n, v, host.lang);
  return wrap(n, host, [
    n.card ? h("div", { class: "w-card" }, host.renderChild(n.card)) : null,
    h("div", { class: "options" + (n.wrap ? " wrap" : "") }, opts.map((o, i) => h("button", { type: "button", class: "opt chip", key: i, "aria-pressed": press(v.includes(i)), disabled: host.disabled || o.disabled ? true : null, on: { click: () => choose(i) } }, txt(o.label, 80)))),
    k > 1 ? h("p", { class: "w-count", "aria-live": "polite" }, fmt(X.picked, { k: v.length, n: k })) : null,
    ...(n.auto && k === 1 ? [] : mainBtn(host, n, v, reason, X))
  ]);
};

W.rank = (n, host, X) => {
  const opts = (n.options || []).slice(0, 12), v = drafted(host, n, []);
  const tap = (i) => {
    let nv = v.includes(i) ? v.filter((x) => x !== i) : v.concat([i]);
    if (nv.length === opts.length - 1) nv = nv.concat(opts.map((_, j) => j).filter((j) => !nv.includes(j))); // das letzte stellt sich selbst
    setDraft(host, n, nv);
  };
  const move = (i, d) => { const p = v.indexOf(i), q = p + d; if (p < 0 || q < 0 || q >= v.length) return; const nv = v.slice(); nv[p] = v[q]; nv[q] = i; setDraft(host, n, nv); };
  return wrap(n, host, [
    h("ol", { class: "w-ranklist" }, opts.map((o, i) => {
      const pos = v.indexOf(i);
      return h("li", { key: i, class: pos >= 0 ? "on" : "" },
        h("button", { type: "button", class: "opt chip", "aria-pressed": press(pos >= 0), disabled: host.disabled ? true : null, on: { click: () => tap(i), keydown: (e) => { if (e.key === "ArrowUp" && pos > 0) { e.preventDefault(); move(i, -1); } if (e.key === "ArrowDown" && pos >= 0) { e.preventDefault(); move(i, 1); } } } }, (pos >= 0 ? pos + 1 + ". " : "") + txt(o.label, 80)));
    })),
    ...mainBtn(host, n, v, why(n, v, host.lang), X)
  ]);
};

W.slide = (n, host, X) => {
  const lo = n.min || 0, hi = n.max, st = n.step || 1, v = drafted(host, n, n.def !== undefined ? n.def : lo);
  const show = (x) => (n.format === "eur" ? euro(x * 100, host.lang) : n.format === "cents" ? euro(x, host.lang) : String(x)) + (n.unit ? " " + n.unit : "");
  const set = (x) => setDraft(host, n, Math.max(lo, Math.min(hi, x)));
  return wrap(n, host, [
    h("div", { class: "w-slide" },
      n.step ? h("button", { type: "button", class: "chip", "aria-label": fmt(X.less, { s: n.label || "" }), disabled: host.disabled || v <= lo ? true : null, on: { click: () => set(v - st) } }, "−") : null,
      h("input", { type: "range", min: String(lo), max: String(hi), step: String(st), value: String(v), "aria-label": txt(n.label || n.top), "aria-valuetext": show(v), disabled: host.disabled ? true : null, on: { input: (e) => set(Number(e.target.value)) } }),
      n.step ? h("button", { type: "button", class: "chip", "aria-label": fmt(X.more, { s: n.label || "" }), disabled: host.disabled || v >= hi ? true : null, on: { click: () => set(v + st) } }, "+") : null,
      h("b", { class: "w-val", "aria-hidden": "true" }, show(v))),
    ...mainBtn(host, n, v, why(n, v, host.lang), X)
  ]);
};

// input: optional timed -> Wert {text, sec} (Sekunden seit dem Anzeigen, Geraeteuhr; z. B. Ratezeit bei Malrat)
W.input = (n, host, X) => {
  const v = drafted(host, n, "");
  const t0 = n.timed ? drafted({ ...host }, { id: n.id + ":t0" }, null) : null;
  if (n.timed && t0 === null && host.clock) setDraft(host, { id: n.id + ":t0" }, host.clock());
  if (n.adult && !host.age18) return wrap(n, host, [h("p", { class: "w-note" }, X.minor)]);
  const id = (host.idp || "w") + "-" + n.id + "-in";
  return wrap(n, host, [
    h(n.multiline ? "textarea" : "input", { id, class: "field", type: n.multiline ? null : "text", maxlength: String(n.max || 60), autocomplete: "off", inputmode: n.mode === "decimal" ? "decimal" : null, enterkeyhint: "next", placeholder: n.hint ? txt(n.hint, 80) : null, "aria-label": txt(n.label || n.top), value: v, disabled: host.disabled ? true : null, on: { input: (e) => setDraft(host, n, e.target.value) } }),
    ...mainBtn(host, n, n.timed ? { text: v.trim(), sec: Math.max(0, Math.round(((host.clock ? host.clock() : 0) - (t0 || 0)) / 1000)) } : v.trim(), why(n, v, host.lang), X)
  ]);
};

W.list = (n, host, X) => {
  const k = Math.min(24, n.n || 1), v = drafted(host, n, Array.from({ length: k }, () => ""));
  const set = (i, s) => { const nv = v.slice(); nv[i] = s; setDraft(host, n, nv); };
  const val = v.map((x) => String(x || "").trim());
  return wrap(n, host, [
    h("div", { class: "w-list" }, v.map((x, i) => h("input", { key: i, class: "field tlist", type: "text", maxlength: String(n.max || 40), autocomplete: "off", "aria-label": txt(n.label || n.top) + " " + (i + 1), placeholder: n.hints && n.hints[i] ? txt(n.hints[i], 60) : null, value: x, disabled: host.disabled ? true : null, on: { input: (e) => set(i, e.target.value) } }))),
    ...mainBtn(host, n, val, why(n, val, host.lang), X)
  ]);
};

W.alloc = (n, host, X) => {
  const opts = (n.options || []).slice(0, 12), st = n.step || 1, v = drafted(host, n, opts.map(() => 0)), used = v.reduce((a, b) => a + b, 0);
  const set = (i, d) => { const nv = v.slice(); nv[i] = Math.max(0, nv[i] + d); if (nv.reduce((a, b) => a + b, 0) <= n.sum) setDraft(host, n, nv); };
  return wrap(n, host, [
    h("ul", { class: "w-alloc" }, opts.map((o, i) => h("li", { key: i },
      h("span", { class: "w-lbl" }, txt(o.label, 60) + (n.vals ? " · " + n.vals[i] : "")),
      h("button", { type: "button", class: "chip", "aria-label": fmt(X.less, { s: o.label }), disabled: host.disabled || v[i] <= 0 ? true : null, on: { click: () => set(i, -st) } }, "−"),
      h("b", { "aria-live": "polite" }, String(v[i])),
      h("button", { type: "button", class: "chip", "aria-label": fmt(X.more, { s: o.label }), disabled: host.disabled || used + st > n.sum ? true : null, on: { click: () => set(i, st) } }, "+")))),
    h("p", { class: "w-count", "aria-live": "polite" }, fmt(X.left, { n: n.sum - used })),
    ...mainBtn(host, n, v, why(n, v, host.lang), X)
  ]);
};

W.show = (n, host, X) => wrap(n, host, [
  ...(n.lines || []).slice(0, 24).map((l, i) => h("p", { class: "w-line", key: i }, txt(l))),
  n.card ? h("div", { class: "w-card" }, host.renderChild(n.card)) : null,
  ...(n.notes && n.notes.length ? [txt(n.notes.join(" ")).length > 160 ? h("details", { class: "more" }, h("summary", {}, "ⓘ " + X.more2), ...n.notes.map((x, i) => h("p", { key: i }, txt(x)))) : h("p", { class: "w-note" }, txt(n.notes.join(" ")))] : []),
  n.later ? h("p", { class: "w-note" }, txt(n.later)) : null,
  ...(n.submit ? mainBtn(host, n, 0, "", X) : [])
]);

function gridCells(n, host, X, v, onTap, marks = {}, disabledCells = []) {
  const R = n.rows || 5, C = n.cols || 5, cells = [];
  const focus = (e, i) => { const t = e.currentTarget.parentNode.children; const k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -C, ArrowDown: C }[e.key]; if (k && t[i + k]) { e.preventDefault(); t[i + k].focus(); } };
  for (let i = 0; i < R * C; i++) {
    const m = marks[i], r = String.fromCharCode(65 + Math.floor(i / C)), c = (i % C) + 1;
    cells.push(h("button", { type: "button", key: i, class: "bcell" + (v.includes(i) ? " on" : "") + (m ? " a-" + m : ""), "aria-pressed": press(v.includes(i)), "aria-label": fmt(X.cell, { r, c }) + (m ? " " + ({ far: "·", near: "~", hit: "✓" }[m] || m) : ""), disabled: host.disabled || disabledCells.includes(i) ? true : null, on: { click: () => onTap(i), keydown: (e) => focus(e, i) } }, m ? { far: "·", near: "~", hit: n.hitIcon || "✓" }[m] : ""));
  }
  return h("div", { class: "bgrid", style: { "grid-template-columns": "repeat(" + C + ", minmax(2.75rem, 1fr))" } }, cells);
}
W.grid = (n, host, X) => {
  const k = n.n || 1, v = drafted(host, n, []);
  const tap = (i) => { const nv = v.includes(i) ? v.filter((x) => x !== i) : v.length < k ? v.concat([i]) : v; setDraft(host, n, nv); };
  return wrap(n, host, [gridCells(n, host, X, v, tap), h("p", { class: "w-count", "aria-live": "polite" }, fmt(X.picked, { k: v.length, n: k })), ...mainBtn(host, n, v, why(n, v, host.lang), X)]);
};
W.probe = (n, host, X) => {
  const k = n.n || 1, before = n.before || [], v = drafted(host, n, []), ans = n.answers || [];
  const marks = {}; for (const i of [...before, ...v]) marks[i] = ["far", "near", "hit"][ans[i]] || "far";
  const tap = (i) => { if (v.length < k && !v.includes(i) && !before.includes(i)) setDraft(host, n, v.concat([i])); };
  return wrap(n, host, [gridCells(n, host, X, [], tap, marks, [...before, ...v]), h("p", { class: "w-count", "aria-live": "polite" }, fmt(X.left, { n: k - v.length })), n.legend ? h("p", { class: "w-note" }, txt(n.legend)) : null, ...mainBtn(host, n, v, v.length ? "" : fmt(X.pickN, { n: 1 }), X)]);
};

W.money = (n, host, X) => {
  const raw = drafted(host, n, ""), c = parseCents(raw), k = n.people || 1;
  const reason = c === null ? X.fill : why(n, c, host.lang);
  const e = c === null ? 0 : Math.floor(c / k), r = c === null ? 0 : c - e * k;
  return wrap(n, host, [
    h("input", { class: "field", type: "text", inputmode: "decimal", maxlength: "9", autocomplete: "off", "aria-label": txt(n.label || n.top), placeholder: n.hint ? txt(n.hint, 40) : null, value: raw, disabled: host.disabled ? true : null, on: { input: (ev) => setDraft(host, n, ev.target.value) } }),
    c !== null && !reason ? h("p", { class: "w-line", "aria-live": "polite" }, fmt(X.total, { e: euro(c, host.lang) }) + " · " + fmt(X.share, { e: euro(e, host.lang) }) + (r ? " · " + fmt(X.rest, { e: euro(r, host.lang) }) : "")) : null,
    ...mainBtn(host, n, c, reason, X)
  ]);
};
W.pay = (n, host, X) => {
  const href = typeof n.link === "string" && /^https:\/\/paypal\.me\/[A-Za-z0-9]{1,20}\/\d{1,7}(\.\d{2})?EUR$/.test(n.link) ? n.link : null;
  let gate;
  if (host.minor) gate = h("p", { class: "w-note" }, X.minor);
  else if (!host.age18) gate = [h("p", { class: "w-note" }, X.agePls), h("button", { type: "button", class: "chip", on: { click: () => host.onAction && host.onAction({ act: "age18" }) } }, X.adult)];
  else gate = href ? h("a", { class: "btn hot", href, target: "_blank", rel: "noopener noreferrer" }, txt(n.label || "PayPal", 60)) : h("p", { class: "w-note" }, X.invalid);
  return wrap(n, host, [...(n.notes || []).map((x, i) => h("p", { class: "w-note", key: i }, txt(x))), gate]);
};

W.day = (n, host, X) => {
  const iso = (d) => { const t = new Date(d * 86400000); return t.toISOString().slice(0, 10); };
  const v = drafted(host, n, n.def || n.min || 20000);
  return wrap(n, host, [h("input", { class: "field", type: "date", min: iso(n.min || 20000), value: iso(v), "aria-label": txt(n.label), disabled: host.disabled ? true : null, on: { input: (e) => { const d = Math.floor(Date.parse(e.target.value + "T00:00:00Z") / 86400000); if (Number.isInteger(d)) setDraft(host, n, d); } } }), ...mainBtn(host, n, v, why(n, v, host.lang), X)]);
};

W.form = (n, host, X) => {
  // Felder halten ihren Zwischenstand unter "~<id>", ihren fertigen Wert (onInput eines Feldes) unter "<id>"
  const fields = (n.fields || []).slice(0, 12);
  const init = {}; for (const f of fields) { const d = f.value !== undefined ? f.value : f.def !== undefined ? f.def : f.t === "slide" ? f.min || 0 : undefined; if (d !== undefined) init["~" + f.id] = d; }
  const v = drafted(host, n, init);
  const valueOf = () => { const out = {}; for (const f of fields) { const x = f.id in v ? v[f.id] : v["~" + f.id]; if (x !== undefined) out[f.id] = typeof x === "string" ? x.trim() : x; } return out; };
  const sub = (f) => ({ ...host, embedded: true, onDraftPatch: null, draft: { ["w:" + f.id]: v["~" + f.id] },
    onDraft: (d) => setDraft(host, n, { ...v, ["~" + f.id]: d["w:" + f.id] }),
    onInput: (x) => setDraft(host, n, { ...v, [f.id]: x.a }) });
  const kids = fields.map((f) => renderWidget({ ...f, submit: {}, confirm: null }, sub(f), true));
  const val = valueOf();
  return wrap(n, host, [...kids, ...mainBtn(host, n, val, why(n, val, host.lang), X)]);
};

W.ideas = (n, host, X) => {
  const ideas = (n.ideas || []).slice(0, 5), v = drafted(host, n, null);
  return wrap(n, host, [
    h("div", { class: "options gfrow", "aria-live": "polite" }, ideas.map((s, i) => h("button", { type: "button", class: "opt chip", key: i, "aria-pressed": press(v === i), disabled: host.disabled ? true : null, on: { click: () => setDraft(host, n, i) } }, txt(s, 40)))),
    ...mainBtn(host, n, [ideas, v], v === null ? fmt(X.pickN, { n: 1 }) : "", X)
  ]);
};

// Grundschicht (Z1): Entwurf und Basis-Knoten
W.field = (n, host) => {
  const v = n.value === undefined ? "" : String(n.value);
  return h("label", { class: "w-field", key: "f-" + n.key },
    h("span", { class: "w-lbl" }, txt(n.label, 80)),
    h(n.multiline ? "textarea" : "input", { class: "field", type: n.multiline ? null : "text", maxlength: String(n.max || 60), autocomplete: n.mode === "name" ? "nickname" : "off", inputmode: n.mode === "decimal" ? "decimal" : null, placeholder: n.hint ? txt(n.hint, 80) : null, value: v, disabled: host.disabled || !host.onDraft ? true : null,
      // Review L3: jede Aenderung sofort als Patch (kein Entprellen), damit ein Neuzeichnen den Wert nie zuruecksetzt
      on: { input: (e) => { const val = e.target.value; if (host.onDraftPatch) host.onDraftPatch({ [n.key]: val }); else host.onDraft({ ...(host.draft && typeof host.draft === "object" ? host.draft : {}), [n.key]: val }); } } }));
};
W.go = (n, host, X) => {
  const id = (host.idp || "w") + "-go-why";
  return h("div", { class: "w-gobox", key: "go" },
    h("button", { type: "button", class: "btn primary w-go", "data-act": "go-step", disabled: n.disabled || host.disabled ? true : null, "aria-describedby": n.disabled && n.why ? id : null, on: { click: () => { if (n.disabled) return; if (n.memo !== undefined && host.onMemo) host.onMemo(n.memo); if (n.prepare && host.onPrepare) host.onPrepare(n); else host.onInput(n.input); } } }, txt(n.label || X.next, 40)),
    n.disabled && n.why ? h("p", { class: "w-why", id }, txt(n.why)) : null);
};
W.link = (n) => {
  const ok = typeof n.href === "string" && /^https:\/\/paypal\.me\/[A-Za-z0-9]{1,20}(\/\d{1,7}(\.\d{2})?EUR)?$/.test(n.href);
  return ok ? h("a", { class: "btn hot", href: n.href, target: "_blank", rel: "noopener noreferrer", key: "link" }, txt(n.label, 60)) : null;
};
W.copy = (n, host, X) => h("button", { type: "button", class: "chip", key: "copy", on: { click: () => host.onAction && host.onAction({ act: "copy", text: txt(n.text, 4000) }) } }, txt(n.label || X.copy, 40));
W.file = (n, host, X) => (/^[a-z0-9._-]{1,40}\.(ics|txt)$/i.test(String(n.name)) && ["text/calendar", "text/plain"].includes(n.mime) ? h("button", { type: "button", class: "chip", key: "file", on: { click: () => host.onAction && host.onAction({ act: "file", name: n.name, mime: n.mime, text: txt(n.text, 20000) }) } }, txt(n.label || X.file, 40)) : null);
W.action = (n, host) => (["age18"].includes(n.act) ? h("button", { type: "button", class: "chip", key: "act-" + n.act, on: { click: () => host.onAction && host.onAction({ act: n.act }) } }, txt(n.label, 60)) : null);
W.ai = (n, host, X) => h("button", { type: "button", class: "chip", key: "ai-" + (n.into || ""), disabled: host.disabled || !host.onAction ? true : null, on: { click: () => host.onAction({ act: "ai", kind: n.kind, input: n.input, into: n.into }) } }, "✨ " + txt(n.label || X.ai, 60));
W.open = (n, host, X) => h("button", { type: "button", class: "btn", key: "open-" + n.card, on: { click: () => host.onAction && host.onAction({ act: "open", card: n.card }) } }, txt(n.label || fmt(X.openCard, { s: n.card }), 60));
W.more = (n, host, X) => h("details", { class: "more", key: "more" }, h("summary", {}, txt(n.label || X.more2, 60)), ...(n.children || []).map((c) => host.renderChild(c)));

/** Rendert einen Widget-Knoten; null, wenn der Typ hier unbekannt ist (der Aufrufer meldet das). */
export function renderWidget(n, host, embedded = false) {
  const f = W[n.t];
  if (!f || typeof n !== "object") return null;
  const X = TX[host.lang] || TX.de;
  if (embedded) return f({ ...n, id: n.id || "f" }, host, X);
  return f(n, host, X);
}
export function known() { return Object.keys(W); }
export function registerWidgets(more) { for (const [k, f] of Object.entries(more)) { if (W[k]) throw new Error("Widget doppelt: " + k); W[k] = f; } }
export const internals = { wrap, mainBtn, drafted, setDraft, press, gridCells, txt, head };
