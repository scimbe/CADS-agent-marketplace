// Feste UX-Messung je Bildschirm (Bericht docs/greenfield/08-forschung/usability-automatisiert.md, Massnahme 2, M1–M12).
// Deterministisch, ohne Netz, ohne neue Abhaengigkeit: Woerter, Saetze und LIX hier selbst gezaehlt, axe-core liegt schon bei.
//
// Gate-Modus ueber UX_GATE:
//   bericht (Standard)  misst und berichtet, blockiert nichts (nur: jeder Bildschirm wurde erreicht und gemessen)
//   streng              jede Messgroesse muss ihr Ziel (ZIELE) erreichen
// Ein anderer Wert bricht ab (kein stiller Rueckfall). UX_BERICHT=<datei> schreibt die Messung zusaetzlich als JSON.
//
// Definitionen (gelten fuer Bericht und Gate gleich):
//   Bereich        Woerter, LIX und Entscheidungen zaehlen im Hauptbereich (main), also im Inhalt des Bildschirms. Der Rahmen
//                  (Kopfzeile mit Zurueck, Demo-Leiste) ist auf jedem Bildschirm gleich und zaehlt dort nicht; Tippflaechen und
//                  axe pruefen die ganze Seite.
//   Woerter        sichtbare Woerter ohne Kacheltexte (Selektor je Bildschirm), ohne visuell versteckten Text, ohne Eingaben
//                  des Nutzers. Wort = Folge aus Buchstaben/Ziffern.
//   LIX            Bjoernsson: Woerter/Saetze + 100 * lange Woerter/Woerter; lang = mehr als 6 Buchstaben. Satzende = . ! ? : ;
//                  oder das Ende eines Textblocks (Ueberschrift, Knopf, Absatz), weil UI-Text oft ohne Punkt endet.
//   Entscheidungen Gruppen von Bedienelementen, zwischen denen der Nutzer waehlen kann. Eine Gruppe ist ein role=group/
//                  radiogroup, fieldset, nav, form, Liste, Eingabefeld samt Mikrofon oder ein einzelnes Bedienelement.
//                  Nicht gezaehlt: der Rahmen (Zurueck, Kopfknoepfe, Demo-Leiste), das Mikrofon (andere Eingabeart desselben Felds) und die
//                  Aktionsleiste, wenn sie nur den Hauptknopf hat (Weiter ist keine Wahl). Aktionsleiste mit mehreren
//                  Knoepfen = 1 Entscheidung.
//   Tippflaeche    kleinste Seite des Rechtecks jedes sichtbaren Bedienelements (Checkbox/Radio: ihr Label), in CSS-px.
//   Vorlesen       Knopf mit data-vorlesen, data-act *vorlesen* oder aria-label "vorlesen"/"anhören"/"read aloud" je Kachel
//                  bzw. fuer die Frage (irgendwo im Hauptbereich).
//   Taps           zaehlt der Fahrer im Test (Klicks nach dem getippten Satz bis einschliesslich "Ja, so bauen").

export const ZIELE = Object.freeze({ taps: 3, entscheidungen: 1, woerter: 12, lix: 30, tippflaeche: 44, axe: 0, vorlesen: 1 });

export function gateModus(env = process.env) {
  const v = env.UX_GATE === undefined || env.UX_GATE === "" ? "bericht" : env.UX_GATE;
  if (v !== "bericht" && v !== "streng") throw new Error("UX_GATE muss bericht oder streng sein, nicht: " + v);
  return v;
}

const WORT = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
export const woerter = (text) => String(text || "").match(WORT) || [];
/** Saetze eines Textblocks: Satzzeichen, dazu das Blockende, wenn der Block nicht mit einem Satzzeichen endet */
export function saetze(block) {
  const t = String(block || "").trim();
  if (!woerter(t).length) return 0;
  const n = (t.match(/[.!?:;…]+(?=\s|$|["“”„»«)])/g) || []).length;
  return /[.!?:;…]["“”„»«)]*$/.test(t) ? n : n + 1;
}
/** LIX ueber Textbloecke; null, wenn kein Wort da ist */
export function lix(blocks) {
  const list = Array.isArray(blocks) ? blocks : [blocks];
  let w = 0, s = 0, lang = 0;
  for (const b of list) {
    const ws = woerter(b);
    w += ws.length; s += saetze(b);
    lang += ws.filter((x) => (x.match(/\p{L}/gu) || []).length > 6).length;
  }
  if (!w) return null;
  return Math.round((w / s + (100 * lang) / w) * 10) / 10;
}

/**
 * Misst den aktuellen Bildschirm im Browser.
 * @param o.kacheln  Selektor der Kacheln (ihre Texte zaehlen nicht als Woerter; Vorlesen wird je Kachel geprueft)
 * @param o.gruppen  weitere Selektoren, die je eine Entscheidung bilden (z. B. ein Raster aus Karten)
 * @param o.aktionen Selektor der Aktionsleiste (Haupt- und Nebenknoepfe)
 * @param o.haupt    Selektor des Hauptknopfs
 */
export async function messeBildschirm(p, { kacheln = ".k-tile", gruppen = [], aktionen = ".actions", haupt = ".btn.primary" } = {}) {
  const roh = await p.evaluate(({ kacheln, gruppen, aktionen, haupt }) => {
    const sichtbar = (el) => {
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const versteckt = (el) => !!el.closest(".visually-hidden, [aria-hidden=true], .liveframe, script, style, template");
    const inhalt = [document.querySelector("main")], seite = [...document.querySelectorAll("header.bar, .demo-bar, main")];
    // Textbloecke: naechster nicht-inline Vorfahr je Textknoten
    const blockOf = (el) => { let e = el; while (e && e !== document.body) { const d = getComputedStyle(e).display; if (!d.startsWith("inline") || d === "inline-block" || d === "inline-flex" || d === "inline-grid") return e; e = e.parentElement; } return document.body; };
    const blocks = new Map();
    for (const root of inhalt) {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const el = n.parentElement;
        if (!el || versteckt(el) || el.closest(kacheln) || !sichtbar(el)) continue;
        if (el.closest("textarea, input, select, option")) continue;
        const b = blockOf(el);
        blocks.set(b, (blocks.get(b) || "") + n.nodeValue);
      }
    }
    // Bedienelemente
    const SEL = "button, a[href], input:not([type=hidden]), textarea, select, summary, [role=button], [role=radio], [role=switch], [role=checkbox]";
    const bed = seite.flatMap((r) => [...r.querySelectorAll(SEL)]).filter((e) => !e.closest(".liveframe") && sichtbar(e.matches("input[type=checkbox], input[type=radio]") && e.closest("label") ? e.closest("label") : e));
    const name = (e) => (e.getAttribute("aria-label") || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent || e.getAttribute("placeholder") || e.tagName).replace(/\s+/g, " ").trim().slice(0, 40);
    const ziel = (e) => (e.matches("input[type=checkbox], input[type=radio]") && e.closest("label")) || e;
    const flaechen = bed.map((e) => { const r = ziel(e).getBoundingClientRect(); return { name: name(e), act: e.dataset.act || null, b: Math.round(r.width), h: Math.round(r.height), min: Math.round(Math.min(r.width, r.height)) }; });
    // Entscheidungen
    const GRUPPE = ["[role=group]", "[role=radiogroup]", "fieldset", "nav", "form", "ul", "ol", ".k-field", aktionen, ...gruppen].join(", ");
    const wahl = bed.filter((e) => e.closest("main") && !/^mic-/.test(e.dataset.act || ""));
    const keys = new Map();
    for (const e of wahl) {
      const g = e.closest(GRUPPE) || e;
      if (!keys.has(g)) keys.set(g, []);
      keys.get(g).push(e);
    }
    const gruppenOut = [];
    for (const [g, els] of keys) {
      if (g.matches(aktionen) && els.length === 1 && els[0].matches(haupt)) continue;   // nur "Weiter": keine Wahl
      const lbl = g.getAttribute("aria-label") || (g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")) && document.getElementById(g.getAttribute("aria-labelledby")).textContent) || (g.querySelector("legend") && g.querySelector("legend").textContent) || (g.querySelector("label") && g.querySelector("label").textContent) || els.map(name).join(" / ");
      gruppenOut.push({ name: lbl.replace(/\s+/g, " ").trim().slice(0, 50), optionen: els.length });
    }
    // Vorlesen
    const VOR = "[data-vorlesen], [data-act*=vorlesen], [aria-label*=vorlesen i], [aria-label*=anhören i], [aria-label*='read aloud' i]";
    const ks = [...document.querySelectorAll("main " + kacheln.split(",").join(", main "))].filter(sichtbar);
    const kMit = ks.filter((k) => k.matches(VOR) || k.querySelector(VOR) || (k.parentElement && [...k.parentElement.children].some((s) => s !== k && s.matches(VOR) && s.dataset.fuer === k.dataset.act))).length;
    const main = document.querySelector("main");
    return {
      screen: (main.className.split(" ").find((x) => x.startsWith("s-")) || "").slice(2),
      blocks: [...blocks.values()].map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean),
      flaechen, gruppen: gruppenOut,
      kacheln: ks.length, kachelnVorlesen: kMit, vorlesenIrgendwo: !!main.querySelector(VOR)
    };
  }, { kacheln, gruppen, aktionen, haupt });
  const text = roh.blocks.join(" | ");
  const klein = roh.flaechen.reduce((m, f) => (m && m.min <= f.min ? m : f), null);
  return {
    screen: roh.screen,
    woerter: roh.blocks.reduce((n, b) => n + woerter(b).length, 0),
    lix: lix(roh.blocks),
    entscheidungen: roh.gruppen.length,
    gruppen: roh.gruppen,
    kacheln: roh.kacheln, kachelnVorlesen: roh.kachelnVorlesen, vorlesen: roh.vorlesenIrgendwo,
    tippflaeche: klein ? klein.min : null, kleinste: klein,
    zuKlein: roh.flaechen.filter((f) => f.min < ZIELE.tippflaeche),
    text
  };
}

/** Verstoesse einer Zeile gegen ZIELE (Text je Verstoss) */
export function verstoesse(z) {
  const v = [];
  if (z.taps != null && z.taps > ZIELE.taps) v.push(`Taps ${z.taps} > ${ZIELE.taps}`);
  if (z.entscheidungen > ZIELE.entscheidungen) v.push(`Entscheidungen ${z.entscheidungen} > ${ZIELE.entscheidungen}`);
  if (z.woerter > ZIELE.woerter) v.push(`Woerter ${z.woerter} > ${ZIELE.woerter}`);
  if (z.lix != null && z.lix > ZIELE.lix) v.push(`LIX ${z.lix} > ${ZIELE.lix}`);
  if (z.tippflaeche != null && z.tippflaeche < ZIELE.tippflaeche) v.push(`Tippflaeche ${z.tippflaeche} px < ${ZIELE.tippflaeche} (${z.zuKlein.map((f) => f.act || f.name).join(", ")})`);
  if (z.axe.length > ZIELE.axe) v.push(`axe ${z.axe.length}: ${z.axe.join("; ")}`);
  if (z.kacheln && z.kachelnVorlesen < z.kacheln) v.push(`Vorlesen ${z.kachelnVorlesen}/${z.kacheln} Kacheln`);
  if (z.frage && !z.vorlesen) v.push("Vorlesen fuer die Frage fehlt");
  return v;
}

/** Markdown-Tabelle der Messung */
export function tabelle(zeilen) {
  const kopf = "| Bildschirm | Taps | Entscheidungen | Wörter | LIX | Vorlesen | kleinste Tippfläche | axe |\n|---|---|---|---|---|---|---|---|";
  const vor = (z) => (z.kacheln ? `${z.kachelnVorlesen}/${z.kacheln} Kacheln` : "–") + (z.frage ? (z.vorlesen ? ", Frage ja" : ", Frage nein") : "");
  return kopf + "\n" + zeilen.map((z) => `| ${z.name} | ${z.taps ?? "–"} | ${z.entscheidungen} | ${z.woerter} | ${z.lix ?? "–"} | ${vor(z)} | ${z.tippflaeche ?? "–"} px${z.kleinste && z.tippflaeche < ZIELE.tippflaeche ? " (" + (z.kleinste.act || z.kleinste.name) + ")" : ""} | ${z.axe.length} |`).join("\n");
}
