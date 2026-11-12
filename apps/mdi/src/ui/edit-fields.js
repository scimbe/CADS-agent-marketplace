// Editor-Felder fuer Strang P und L (Folge-PR 2): pair, slide, steps, stickers, weather, kibild, media.local, spiel und
// Listen/Objekte aus dem Schema. Jedes Feld ist eine reine Funktion (Schema, Wert, set) -> vnode; Aenderungen gehen nur
// ueber PARAM (der Host prueft gegen das Schema, validParams). Altcode-Untergrenze: app.js colors(), steps/slide (klang),
// stickers.js (Sticker setzen, loeschen, Rueckgaengig), wetter.js (Ort + Tag, echte Zahlen oder keine).
import { h } from "./dom.js";

const T = {
  de: { add: "Hinzufügen", remove: "Entfernen", on: "An", off: "Aus", up: "Nach oben", down: "Nach unten", left: "Nach links", right: "Nach rechts", bigger: "Größer", smaller: "Kleiner", turnL: "Links drehen", turnR: "Rechts drehen",
    skFull: "Mehr Sticker passen nicht drauf.", skDelete: "Sticker löschen", skUndo: "Rückgängig", skPick: "Sticker dazulegen", skChosen: "Sticker {n} von {m}", skHint: "Wähle einen Sticker, dann schieben, drehen oder größer machen.",
    wxPlace: "Ort", wxToday: "Heute", wxTomorrow: "Morgen", wxAfter: "Übermorgen", wxGo: "Wetter holen", wxOff: "Wetter weg", wxBusy: "Wetter wird geholt …",
    wxNote: "Der Ort geht an unseren Server. Zahlen von open-meteo.com (CC BY 4.0, gerundet), nie von der KI. Kostet keinen Versuch.", wxFail: "Gerade keine Wetterdaten. Ohne echte Zahlen kein Wetterbericht.", wxNoPlace: "Diesen Ort finden wir nicht.", wxFilter: "Das lassen wir lieber weg.", wxLogin: "Für das Wetter bitte anmelden.", wxRange: "Wetter gibt es für heute und die nächsten 7 Tage.", wxLimit: "Gerade zu viele Wetter-Anfragen. Bitte später noch einmal.",
    wxShow: "{p}: {lo} bis {hi} °C, Regen {rn} %", dice: "Würfeln", diceNote: "Nächster Vorschlag",
    photoPick: "Foto wählen", photoOther: "Anderes Foto", photoOff: "Foto weg", photoBusy: "Foto wird gespeichert …", photoSet: "Foto gewählt ✓", photoNote: "Dein Foto bleibt auf diesem Gerät. Im Link reist es nicht mit.", photoErr: { "nicht-verfuegbar": "Hier kann die App keine Fotos speichern (zum Beispiel im privaten Fenster).", "kein-bild": "Das ist kein Bild.", "zu-gross": "Das Foto ist zu groß.", fehler: "Das Foto ließ sich nicht speichern." }, kibildSoon: "KI-Bilder für diese Karte kommen mit der freien Karte.", rows: "Reihe {r}, Schritt {s}" },
  en: { add: "Add", remove: "Remove", on: "On", off: "Off", up: "Up", down: "Down", left: "Left", right: "Right", bigger: "Bigger", smaller: "Smaller", turnL: "Turn left", turnR: "Turn right",
    skFull: "No room for more stickers.", skDelete: "Delete sticker", skUndo: "Undo", skPick: "Add a sticker", skChosen: "Sticker {n} of {m}", skHint: "Pick a sticker, then move, turn or resize it.",
    wxPlace: "Place", wxToday: "Today", wxTomorrow: "Tomorrow", wxAfter: "Day after", wxGo: "Get weather", wxOff: "Remove weather", wxBusy: "Getting the weather …",
    wxNote: "The place goes to our server. Figures from open-meteo.com (CC BY 4.0, rounded), never from the AI. Costs no try.", wxFail: "No weather data right now. No real figures, no report.", wxNoPlace: "We can't find that place.", wxFilter: "Let's skip that one.", wxLogin: "Please sign in for the weather.", wxRange: "Weather is available for today and the next 7 days.", wxLimit: "Too many weather requests right now. Please try again later.",
    wxShow: "{p}: {lo} to {hi} °C, rain {rn} %", dice: "Roll", diceNote: "Next suggestion",
    photoPick: "Pick a photo", photoOther: "Other photo", photoOff: "Remove photo", photoBusy: "Saving photo …", photoSet: "Photo chosen ✓", photoNote: "Your photo stays on this device. It never travels in the link.", photoErr: { "nicht-verfuegbar": "The app can't store photos here (for example in a private window).", "kein-bild": "That is not a picture.", "zu-gross": "The photo is too big.", fehler: "The photo could not be saved." }, kibildSoon: "AI pictures for this card come with the free card.", rows: "Row {r}, step {s}" }
};
const tx = (lang) => T[lang === "en" ? "en" : "de"];
const fmt = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
const L = (o, lang) => (o && typeof o === "object" ? o[lang] || o.de : o);
const typesOf = (s) => (Array.isArray(s.type) ? s.type : [s.type]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Standardwert eines Schemas (fuer "Hinzufuegen" und An-Schalter). */
export function blank(s) {
  if (s.default !== undefined && s.default !== null) return structuredClone(s.default);
  const t = typesOf(s).filter((x) => x !== "null")[0];
  if (Array.isArray(s.enum)) return s.enum.find((x) => x !== null);
  if (t === "object") { const o = {}; for (const [k, c] of Object.entries(s.properties || {})) if ((s.required || []).includes(k) || c.default !== undefined) o[k] = blank(c); return o; }
  if (t === "array") { const n = s.minItems || 0, out = []; for (let i = 0; i < n; i++) out.push(blank(s.items || {})); return out; }
  if (t === "integer" || t === "number") return s.minimum !== undefined ? Math.max(0, s.minimum) : 0;
  if (t === "boolean") return false;
  if (t === "string") return s.pattern && /#\[0-9a-fA-F\]\{6\}/.test(s.pattern) ? "#ffd400" : s.minLength ? "x".repeat(s.minLength) : "";
  return null;
}

function seg(id, label, items, value, pick) {
  return h("div", { class: "seg", role: "radiogroup", "aria-labelledby": id, key: id },
    h("p", { class: "seg-label", id }, label),
    h("div", { class: "seg-row" }, items.map((it) => h("button", { type: "button", role: "radio", class: "seg-opt", key: String(it.value), "aria-checked": it.value === value ? "true" : "false", on: { click: () => pick(it.value) } }, it.label))));
}

/** Allgemeiner Editor aus dem Schema: Objekte, Listen (auch von Objekten), Zahlen, Text, Farben, Wahrheitswerte. */
export function schemaEditor(s, v, set, id, label, lang) {
  const X = tx(lang), t = typesOf(s), nullable = t.includes("null");
  const lab = label ? h("p", { class: "seg-label", id: id + "-l" }, label) : null;
  if (nullable && (v === null || v === undefined)) {
    return h("div", { class: "field", key: id, role: "group", "aria-labelledby": label ? id + "-l" : null }, lab,
      h("button", { type: "button", role: "switch", "aria-checked": "false", class: "seg-opt", "data-act": id + "-an", on: { click: () => set(blank({ ...s, type: t.filter((x) => x !== "null") })) } }, X.off));
  }
  const off = nullable ? h("button", { type: "button", role: "switch", "aria-checked": "true", class: "seg-opt", "data-act": id + "-aus", on: { click: () => set(null) } }, X.on) : null;
  if (t.includes("object") && s.properties) {
    return h("fieldset", { class: "field ef-obj", key: id }, label ? h("legend", null, label) : null, off,
      Object.entries(s.properties).map(([k, c]) => schemaEditor(c, v && v[k], (nv) => set({ ...(v || {}), [k]: nv }), id + "-" + k, L(c["x-label"], lang) || k, lang)));
  }
  if (t.includes("array")) {
    const items = s.items || {}, arr = Array.isArray(v) ? v : [];
    if (Array.isArray(items.enum)) {
      return h("div", { class: "field", key: id, role: "group", "aria-labelledby": label ? id + "-l" : null }, lab, off,
        h("div", { class: "seg-row" }, items.enum.map((e) => { const on = arr.includes(e); return h("button", { type: "button", class: "seg-opt chip", key: String(e), "aria-pressed": on ? "true" : "false", disabled: (!on && s.maxItems && arr.length >= s.maxItems) || null, on: { click: () => set(on ? arr.filter((x) => x !== e) : arr.concat([e])) } }, String(e)); })));
    }
    const max = s.maxItems || 20, min = s.minItems || 0;
    return h("fieldset", { class: "field ef-list", key: id }, label ? h("legend", null, label) : null, off,
      arr.map((it, i) => h("div", { class: "ef-item", key: String(i) },
        schemaEditor(items, it, (nv) => set(arr.map((x, j) => (j === i ? nv : x))), id + "-" + i, (label || "") + " " + (i + 1), lang),
        arr.length > min ? h("button", { type: "button", class: "btn secondary h-small", "data-act": id + "-weg-" + i, on: { click: () => set(arr.filter((x, j) => j !== i)) } }, X.remove) : null)),
      arr.length < max ? h("button", { type: "button", class: "btn secondary h-small", "data-act": id + "-neu", on: { click: () => set(arr.concat([blank(items)])) } }, X.add) : null);
  }
  if (Array.isArray(s.enum)) return h("div", { class: "field", key: id }, off, seg(id + "-l", label || "", s.enum.filter((e) => e !== null).map((e) => ({ value: e, label: String(e) })), v, set));
  if (t.includes("integer") || t.includes("number")) {
    const lo = s.minimum ?? 0, hi = s.maximum ?? 100, step = t.includes("integer") ? 1 : (hi - lo) / 100;
    return h("div", { class: "field", key: id }, label ? h("label", { for: id }, label) : null, off,
      h("div", { class: "ef-range" }, h("input", { id, class: "input range", type: "range", min: String(lo), max: String(hi), step: String(step), value: String(v ?? lo), on: { input: (e) => set(t.includes("integer") ? Math.round(Number(e.target.value)) : Number(e.target.value)) } }), h("output", { for: id }, String(v ?? lo))));
  }
  if (t.includes("boolean")) return h("div", { class: "field", key: id }, lab, h("button", { type: "button", role: "switch", "aria-checked": v ? "true" : "false", class: "seg-opt", on: { click: () => set(!v) } }, v ? X.on : X.off));
  if (t.includes("string") && s.pattern && s.pattern.includes("[0-9a-fA-F]{6}")) {
    return h("div", { class: "field", key: id }, label ? h("label", { for: id }, label) : null, off, h("input", { id, class: "input color", type: "color", value: /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000", on: { input: (e) => set(e.target.value.toLowerCase()) } }));
  }
  return h("div", { class: "field", key: id }, label ? h("label", { for: id }, label) : null, off,
    h("input", { id, class: "input", type: "text", maxlength: String(s.maxLength || 80), value: v ?? "", on: { input: (e) => set(e.target.value) } }));
}

/** Farbpaare (alt app.js colors()): zweifarbige Kachel je Paar aus x-pairs, Auswahl wie eine Wahl. */
function pairField(p, key, v, set, label, lang) {
  const id = "lbl-" + key, pairs = p["x-pairs"] || {};
  return h("div", { class: "field", key }, h("div", { class: "seg", role: "radiogroup", "aria-labelledby": label ? id : "dlg-title" },
    label ? h("p", { class: "seg-label", id }, label) : null,
    h("div", { class: "seg-row" }, p.enum.map((e, i) => {
      const c = pairs[e] || ["#ffffff", "#000000"];
      return h("button", { type: "button", role: "radio", class: "seg-opt swatch", key: e, "aria-checked": v === e ? "true" : "false", "aria-label": (lang === "en" ? "Colour pair " : "Farbpaar ") + (i + 1), on: { click: () => set(e) } },
        h("span", { class: "sw", style: { background: c[0] } }), h("span", { class: "sw", style: { background: c[1] } }));
    }))));
}

/** Schritte (Beat): Reihen aus x-rows, je 16 Schritte "x"/"-"; jeder Schritt ein Schalter (alt klang-ui). */
function stepsField(p, key, v, set, label, lang) {
  const X = tx(lang), rows = L(p["x-rows"], lang) || {}, val = v && typeof v === "object" ? v : {};
  return h("fieldset", { class: "field ef-steps", key }, label ? h("legend", null, label) : null,
    Object.keys(p.properties || rows).map((r) => {
      const line = typeof val[r] === "string" && /^[x-]{16}$/.test(val[r]) ? val[r] : "----------------";
      return h("div", { class: "ef-steprow", key: r, role: "group", "aria-label": rows[r] || r },
        h("span", { class: "ef-steplbl", "aria-hidden": "true" }, rows[r] || r),
        h("div", { class: "ef-stepcells" }, [...line].map((c, i) => h("button", { type: "button", key: String(i), class: "ef-step" + (i % 4 === 0 ? " beat" : ""), "aria-pressed": c === "x" ? "true" : "false", "aria-label": fmt(X.rows, { r: rows[r] || r, s: i + 1 }),
          on: { click: () => set({ ...val, [r]: line.slice(0, i) + (c === "x" ? "-" : "x") + line.slice(i + 1) }) } }))));
    }));
}

/** Schieber mit Einheit (Tempo in BPM). */
function slideField(p, key, v, set, label, id) {
  const unit = p["x-unit"] || "";
  return h("div", { class: "field", key }, label ? h("label", { for: id }, label) : null,
    h("div", { class: "ef-range" }, h("input", { id, class: "input range", type: "range", min: String(p.minimum), max: String(p.maximum), step: "1", value: String(v), "aria-labelledby": label ? null : "dlg-title", "aria-valuetext": v + (unit ? " " + unit : ""), on: { input: (e) => set(Math.round(Number(e.target.value))) } }),
      h("output", { for: id }, String(v) + (unit ? " " + unit : ""))));
}

/** Sticker (alt stickers.js): dazulegen aus x-set (+ Mein-Stil-Emoji), auswaehlen, schieben, drehen, groesser, loeschen.
 *  Ziehen auf der Buehne kommt dazu; diese Knoepfe sind die Bedienung ohne Ziehen (WCAG 2.5.7). Auswahl = letzter Sticker. */
function stickersField(p, key, v, set, label, lang, ctx) {
  const X = tx(lang), list = Array.isArray(v) ? v : [], max = p.maxItems || 8, it = p.items || {}, pr = it.properties || {};
  const allowed = (pr.e && pr.e.enum) || [], z = pr.z || { minimum: 0.5, maximum: 2.5 };
  const add = (e) => set(list.concat([{ e, x: 0.5, y: 0.5, r: 0, z: clamp(1, z.minimum ?? 0.3, z.maximum ?? 3) }]));
  const sel = list.length - 1, cur = list[sel];
  const upd = (f) => set(list.map((s, i) => (i === sel ? f(s) : s)));
  const nudge = (dx, dy) => upd((s) => ({ ...s, x: clamp(Math.round((s.x + dx) * 100) / 100, 0, 1), y: clamp(Math.round((s.y + dy) * 100) / 100, 0, 1) }));
  const turn = (d) => upd((s) => ({ ...s, r: clamp(Math.round((s.r + d) * 100) / 100, -3.14, 3.14) }));
  const size = (d) => upd((s) => ({ ...s, z: clamp(Math.round((s.z + d) * 10) / 10, z.minimum ?? 0.3, z.maximum ?? 3) }));
  const btn = (act, l, f, dis) => h("button", { type: "button", class: "seg-opt", "data-act": "sk-" + act, "aria-label": l, disabled: dis || null, on: { click: f } }, ({ up: "↑", down: "↓", left: "←", right: "→", bigger: "+", smaller: "−", turnL: "↺", turnR: "↻" })[act] || l);
  const setEmoji = (ctx && ctx.me && ctx.me.emoji) || null;
  const palette = allowed.filter((e) => e !== setEmoji).slice(0, 12).concat(setEmoji && allowed.includes(setEmoji) ? [setEmoji] : []);
  return h("fieldset", { class: "field ef-sk", key }, label ? h("legend", null, label) : null,
    h("p", { class: "hint" }, X.skHint),
    h("div", { class: "seg-row", role: "group", "aria-label": X.skPick }, palette.map((e) => h("button", { type: "button", class: "seg-opt emo", key: e, disabled: list.length >= max || null, "aria-label": X.skPick + " " + e, on: { click: () => add(e) } }, e))),
    list.length >= max ? h("p", { class: "hint", role: "status" }, X.skFull) : null,
    cur ? h("div", { class: "ef-skcur", role: "group", "aria-label": fmt(X.skChosen, { n: sel + 1, m: list.length }) },
      h("span", { class: "ef-skemo", "aria-hidden": "true" }, cur.e),
      btn("left", X.left, () => nudge(-0.05, 0), cur.x <= 0), btn("up", X.up, () => nudge(0, -0.05), cur.y <= 0), btn("down", X.down, () => nudge(0, 0.05), cur.y >= 1), btn("right", X.right, () => nudge(0.05, 0), cur.x >= 1),
      btn("smaller", X.smaller, () => size(-0.1)), btn("bigger", X.bigger, () => size(0.1)), btn("turnL", X.turnL, () => turn(-0.26)), btn("turnR", X.turnR, () => turn(0.26)),
      h("button", { type: "button", class: "btn secondary h-small h-danger", "data-act": "sk-del", on: { click: () => set(list.slice(0, -1)) } }, X.skDelete)) : null);
}

/** Wetter (alt wetter.js): Ort + Tag, "Wetter holen" fragt den Server (echte Zahlen oder keine), "Wetter weg". */
function weatherField(p, key, v, set, label, lang, ctx, dispatch) {
  const X = tx(lang), w = ctx.wx || {}, st = w.key === key ? w.st : null;
  return h("fieldset", { class: "field ef-wx", key }, label ? h("legend", null, label) : null,
    v && v.p ? h("p", { class: "hint strong", role: "status" }, fmt(X.wxShow, { p: v.p, lo: v.lo, hi: v.hi, rn: v.rn })) : null,
    h("form", { class: "ef-wxform", on: { submit: (e) => { e.preventDefault(); const f = e.target.elements; dispatch({ type: "WX_GET", key, place: String(f.namedItem("wx-place").value || "").trim().slice(0, 40), day: Number(f.namedItem("wx-day").value || 0) }); } } },
      h("label", { for: "wx-place-" + key }, X.wxPlace),
      h("input", { id: "wx-place-" + key, name: "wx-place", class: "input", type: "text", maxlength: "40", autocomplete: "off" }),
      h("fieldset", { class: "ef-wxday" }, h("legend", { class: "visually-hidden" }, label || ""),
        [X.wxToday, X.wxTomorrow, X.wxAfter].map((l, i) => h("label", { key: String(i), class: "check" }, h("input", { type: "radio", name: "wx-day", value: String(i), checked: i === 0 || null }), l))),
      h("button", { type: "submit", class: "btn secondary", "data-act": "wx-go", disabled: st === "busy" || null }, st === "busy" ? X.wxBusy : X.wxGo)),
    v ? h("button", { type: "button", class: "btn secondary h-small", "data-act": "wx-off", on: { click: () => set(null) } }, X.wxOff) : null,
    st && st !== "busy" && st !== "ok" ? h("p", { class: "warn", role: "alert" }, st === "no-place" ? X.wxNoPlace : st === "blocked" ? X.wxFilter : st === "login" ? X.wxLogin : st === "date-range" ? X.wxRange : st === "limit" ? X.wxLimit : X.wxFail) : null,
    h("p", { class: "hint" }, X.wxNote));
}

/** Foto auf dem Geraet (media.local, broker/media.js): Auswahl -> PHOTO_PUT (Effekt speichert, setzt "local:<id>" per PARAM).
 *  Das Foto selbst bleibt in IndexedDB; Fehler werden ehrlich genannt, ohne stillen Ersatz. */
function photoField(p, key, v, set, label, lang, ctx, dispatch) {
  const X = tx(lang), ph = ctx.photo || {}, st = ph.key === key ? ph.st : null, id = "ph-" + key, has = typeof v === "string" && /^local:[0-9a-f]{32}$/.test(v);
  return h("fieldset", { class: "field ef-photo", key }, label ? h("legend", null, label) : null,
    has ? h("p", { class: "hint strong", role: "status" }, X.photoSet) : null,
    h("label", { class: "btn secondary ef-photo-pick", for: id, "data-act": "photo-pick" }, st === "busy" ? X.photoBusy : has ? X.photoOther : X.photoPick),
    h("input", { id, class: "visually-hidden", type: "file", accept: "image/*", disabled: st === "busy" || null,
      on: { change: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) dispatch({ type: "PHOTO_PUT", key, file: f }); } } }),
    has ? h("button", { type: "button", class: "btn secondary h-small", "data-act": "photo-off", on: { click: () => set(null) } }, X.photoOff) : null,
    st && st !== "busy" && st !== "ok" ? h("p", { class: "warn", role: "alert" }, X.photoErr[st] || X.photoErr.fehler) : null,
    h("p", { class: "hint" }, L(p["x-note"], lang) ? L(p["x-note"], lang) + " " : "", X.photoNote));
}

/**
 * Feld fuer einen Editor-Typ jenseits von text/choice/color/number (Folge-PR 2). Liefert null fuer unbekannte Typen.
 * @param ctx { lang, me, wx, photo, slots } ; dispatch fuer Ereignisse (PARAM ueber set, WX_GET, PHOTO_PUT)
 */
export function extraField(p, key, v, set, label, ctx, dispatch) {
  const lang = ctx.lang, id = "f-" + key, X = tx(lang);
  switch (p["x-field"]) {
    case "pair": return pairField(p, key, v, set, label, lang);
    case "slide": return slideField(p, key, v, set, label, id);
    case "steps": return stepsField(p, key, v, set, label, lang);
    case "stickers": return stickersField(p, key, v, set, label, lang, ctx);
    case "weather": return weatherField(p, key, v, set, label, lang, ctx, dispatch);
    case "kibild": return ctx.slots && ctx.slots.kibildField ? ctx.slots.kibildField(p, key, v, set, label, ctx, dispatch) : h("p", { class: "hint", key }, (label ? label + ": " : "") + X.kibildSoon);
    case "media.local": return photoField(p, key, v, set, label, lang, ctx, dispatch);
    case "spiel": case "list": return schemaEditor(p, v, set, id, label, lang);
    default: return null;
  }
}

/** "Wuerfeln" fuer Textfelder mit x-suggest (alt Blase "Wuerfel"): naechster Vorschlag nach dem aktuellen, ohne Zufall. */
export function suggestButton(p, v, set, lang) {
  const list = L(p["x-suggest"], lang);
  if (!Array.isArray(list) || !list.length) return null;
  const X = tx(lang), i = list.indexOf(v), next = list[(i + 1) % list.length];
  return h("button", { type: "button", class: "btn secondary h-small", "data-act": "dice", title: X.diceNote, on: { click: () => set(next) } }, "🎲 " + X.dice);
}
