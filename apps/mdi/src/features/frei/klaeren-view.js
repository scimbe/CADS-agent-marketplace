// Ansichten des Klaerungsdialogs (Freie Karte 2, P1), Teil "frei-ui". Reine Funktion des Statechart-Zustands
// (ctx.frei.k, ./klaeren.js): je Blatt eine Hauptaktion; Knoepfe sind echte Buttons mit Beschriftung, Felder haben Labels.
// Look: Design-System "My Daily Idea" (Klassen k-* in src/ui/tokens.css). Bilder der Kacheln sind Emoji aus der festen
// Liste des Vertrags (keine Bilder aus dem Netz). Das Mikrofon nutzt die Spracherkennung des Browsers, wenn es sie gibt,
// und sagt sonst ehrlich, dass es hier nicht geht; was gehoert wurde, steht danach im Feld wie getippt.
import { kt } from "./klaeren-texts.js";
import { createSpielHost } from "../../broker/spiel-host.js";

/** D: { h, K } (K: ./klaerung.js, der Vertrag) */
export function makeKlaerenView(D) {
  const { h, K } = D;
  const a = (id, label, ev, o = {}) => ({ id, label, ev: typeof ev === "string" ? { type: ev } : ev, ...o });
  const status = (text, cls, key) => h("p", { class: cls || "hint", role: "status", key: key || "st" }, text);
  const errKey = (how) => "k_e_" + String(how || "off").replace(/-/g, "_");
  function errLine(lang, e, key = "err") {
    if (!e) return null;
    if (e.how === "crisis") return h("p", { class: "warn strong", role: "alert", key }, e.help || kt(lang, "k_e_off"));
    if (e.how === "refused" || e.how === "blocked") return h("p", { class: "warn", role: "alert", key }, noText(lang, e.reason));
    return h("p", { class: "warn", role: "alert", key, "data-how": e.how }, kt(lang, errKey(e.how)));
  }
  const noText = (lang, reason) => { const t = kt(lang, "k_no_" + reason); return t.startsWith("[") ? kt(lang, "k_no_other") : t; };

  const svg = (d, size = 24) => h("svg", { class: "k-ico", width: String(size), height: String(size), viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" }, d.map((x, i) => (x.r ? h("rect", { key: i, ...x.r }) : h("path", { key: i, d: x }))));
  const MIC = [{ r: { x: "9", y: "3", width: "6", height: "11", rx: "3" } }, "M5 11a7 7 0 0 0 14 0", "M12 18v3"];
  const CHECK = ["M4 12l5 5L20 6"];
  const DICE = [{ r: { x: "4", y: "4", width: "16", height: "16", rx: "3" } }, "M9 9h.01", "M15 9h.01", "M12 12h.01", "M9 15h.01", "M15 15h.01"];

  /** Spracherkennung des Browsers (einmal hoeren); ohne sie ein ehrlicher Hinweis */
  function listen(lang, dispatch, onText) {
    const W = typeof window !== "undefined" ? window : null, SR = W && (W.SpeechRecognition || W.webkitSpeechRecognition);
    if (!SR) { dispatch({ type: "K_MIC", st: "nein" }); return; }
    let r;
    try { r = new SR(); } catch (e) { dispatch({ type: "K_MIC", st: "nein" }); return; }
    r.lang = lang === "en" ? "en-GB" : "de-DE"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = e.results && e.results[0] && e.results[0][0] ? String(e.results[0][0].transcript || "") : ""; dispatch({ type: "K_MIC", st: null }); if (t) onText(t); };
    r.onerror = () => dispatch({ type: "K_MIC", st: "fehler" });
    dispatch({ type: "K_MIC", st: "hoert" });
    try { r.start(); } catch (e) { dispatch({ type: "K_MIC", st: "fehler" }); }
  }
  const micBtn = (lang, dispatch, onText, id) => h("button", { type: "button", class: "k-mic", key: "mic-" + id, "aria-label": kt(lang, "k_mic"), "data-act": "mic-" + id, on: { click: () => listen(lang, dispatch, onText) } }, svg(MIC));
  const micLine = (lang, k) => (k.mic ? status(kt(lang, "k_mic_" + k.mic), k.mic === "hoert" ? "hint strong" : "warn", "micst") : null);

  // ---- 1 Ein Satz -------------------------------------------------------------------------------------------------
  function satzView(ctx, dispatch) {
    const lang = ctx.lang, k = ctx.frei.k;
    const ex = ["k_bsp_1", "k_bsp_2", "k_bsp_3"].map((x) => kt(lang, x));
    const body = [
      h("h2", { class: "k-h", key: "h" }, kt(lang, "k_satz_h")),
      h("p", { class: "k-lede", key: "l" }, kt(lang, "k_satz_lede")),
      h("div", { class: "k-field", key: "f" },
        h("label", { for: "k-satz" }, kt(lang, "k_satz_label")),
        h("div", { class: "k-row" },
          h("textarea", { id: "k-satz", class: "k-input", rows: "3", maxlength: String(K.SATZ_MAX), value: k.satz, on: { input: (e) => dispatch({ type: "K_TEXT", value: e.target.value }) } }),
          micBtn(lang, dispatch, (t) => dispatch({ type: "K_TEXT", value: t }), "satz"))),
      micLine(lang, k),
      h("div", { class: "k-ex", key: "ex", role: "group", "aria-labelledby": "k-bsp" },
        h("p", { class: "k-label", id: "k-bsp" }, kt(lang, "k_bsp")),
        h("div", { class: "k-chips" }, ex.map((s, i) => h("button", { type: "button", class: "k-chip", key: "e" + i, "data-act": "k-bsp-" + i, on: { click: () => dispatch({ type: "K_EXAMPLE", value: s }) } }, s)))),
      k.note === "cancelled" ? status(kt(lang, "k_cancelled"), "hint strong", "nc") : null,
      errLine(lang, k.err),
      h("p", { class: "k-note", key: "nt" }, kt(lang, "k_satz_note")),
      h("p", { class: "hint", key: "mn" }, kt(lang, "k_mic_note"))];
    const n = [...K.line(k.satz)].length;
    return { body, primary: a("k-go", kt(lang, "k_weiter"), "K_GO", { cls: "k-go", disabled: n < K.SATZ_MIN }), secondary: [] };
  }

  // ---- 2 Fragen (mit FreiAbsage) ------------------------------------------------------------------------------------
  function verstehe(lang, k, dispatch) {
    const extra = k.antworten.map((x) => (x && x.art === "eigen" ? "„" + x.text + "“" : null)).filter(Boolean);
    return h("div", { class: "k-verstehe", key: "vs" },
      h("p", null, h("strong", null, kt(lang, "k_verstehe")), " ", k.verstehe, extra.length ? " " + extra.join(" · ") : ""),
      h("button", { type: "button", class: "k-link", "data-act": "k-aendern", on: { click: () => dispatch({ type: "K_AENDERN" }) } }, kt(lang, "k_aendern")));
  }
  function frageView(ctx, dispatch) {
    const lang = ctx.lang, k = ctx.frei.k, i = k.i, f = k.fragen[i], cur = k.antworten[i], p = k.pruef && k.pruef.i === i ? k.pruef : null;
    const refused = p && p.how === "refused";
    const vs = verstehe(lang, k, dispatch);
    const tile = (j, kc) => h("button", { type: "button", class: "k-tile", key: "t" + j, "data-act": "k-kachel-" + j, "aria-pressed": cur && cur.art === "kachel" && cur.kachel === j ? "true" : "false", on: { click: () => dispatch({ type: "K_PICK", kachel: j }) } },
      h("span", { class: "k-emoji", "aria-hidden": "true" }, kc.emoji), h("span", { class: "k-tile-t" }, kc.label), kc.sub ? h("span", { class: "k-tile-s" }, kc.sub) : null);
    const eigenId = "k-eigen-" + i, eigenVal = k.eigen[i] || "";
    const body = [
      h("p", { class: "k-step", key: "step" }, kt(lang, "k_von", { n: i + 1, m: k.fragen.length })),
      vs,
      h("h2", { class: "k-h", key: "h", id: "k-frage-h" }, f.frage),
      h("p", { class: "k-lede", key: "hint" }, f.hinweis || kt(lang, "k_tipp")),
      refused ? null : h("div", { class: "k-tiles", key: "tiles", role: "group", "aria-labelledby": "k-frage-h" },
        f.kacheln.map((kc, j) => tile(j, kc)),
        h("button", { type: "button", class: "k-tile k-egal", key: "egal", "data-act": "k-egal", "aria-pressed": cur && cur.art === "egal" ? "true" : "false", on: { click: () => dispatch({ type: "K_EGAL" }) } },
          h("span", { class: "k-emoji", "aria-hidden": "true" }, svg(DICE, 40)), h("span", { class: "k-tile-t" }, kt(lang, "k_egal")))),
      h("div", { class: "k-field", key: "eigen" },
        h("label", { for: eigenId }, kt(lang, "k_eigen")),
        h("div", { class: "k-row" },
          h("input", { id: eigenId, class: "k-input" + (cur && cur.art === "eigen" ? " on" : ""), type: "text", maxlength: String(K.EIGEN_MAX), placeholder: kt(lang, "k_eigen_ph"), value: eigenVal, "aria-invalid": refused ? "true" : null, "aria-describedby": refused ? "k-absage" : "k-eigen-hint",
            on: { input: (e) => dispatch({ type: "K_EIGEN_TEXT", value: e.target.value }), keydown: (e) => { if (e.key === "Enter") { e.preventDefault(); dispatch({ type: "K_EIGEN_GO" }); } } } }),
          micBtn(lang, dispatch, (t) => dispatch({ type: "K_EIGEN_TEXT", value: t }), "eigen")),
        h("p", { class: "hint", id: "k-eigen-hint" }, kt(lang, "k_eigen_hint")),
        K.line(eigenVal) && !(cur && cur.art === "eigen") && !(p && p.how === "busy") && !(refused && K.line(eigenVal) === p.text) ? h("button", { type: "button", class: "btn secondary k-eigen-go", "data-act": "k-eigen-go", on: { click: () => dispatch({ type: "K_EIGEN_GO" }) } }, kt(lang, "k_eigen_go")) : null),
      micLine(lang, k)];
    if (p && p.how === "busy") body.push(status(kt(lang, "k_eigen_busy"), "hint strong", "pb"));
    else if (cur && cur.art === "eigen") body.push(status(kt(lang, "k_eigen_ok", { x: cur.text }), "k-ok", "po"));
    else if (K.line(eigenVal) && !p) body.push(status(kt(lang, "k_eigen_pending"), "hint", "pp"));
    if (refused) {
      body.push(h("div", { class: "k-absage", id: "k-absage", role: "status", key: "abs" },
        h("strong", null, kt(lang, "k_no_h")), h("span", null, noText(lang, p.reason)), h("span", null, kt(lang, "k_no_keep"))));
      if (p.vorschlaege.length) body.push(h("div", { class: "k-vor", key: "vor", role: "group", "aria-label": kt(lang, "k_no_keep") },
        p.vorschlaege.map((j) => h("button", { type: "button", class: "k-vor-b", key: "v" + j, "data-act": "k-vorschlag-" + j, on: { click: () => dispatch({ type: "K_VORSCHLAG", kachel: j }) } }, f.kacheln[j].emoji + " " + f.kacheln[j].label))));
      body.push(h("p", { class: "hint", key: "vh" }, kt(lang, "k_no_vor")));
    } else if (p && p.how === "crisis") body.push(h("p", { class: "warn strong", role: "alert", key: "cr" }, p.help || kt(lang, "k_e_off")));
    else if (p && p.how !== "ok" && p.how !== "busy") body.push(errLine(lang, { how: p.how }, "pe"));
    // Bisher gewaehlt (ab der zweiten Frage): eigene Worte woertlich und als solche markiert
    if (i > 0) body.push(h("div", { class: "k-bisher", key: "bisher" }, h("p", { class: "k-label" }, kt(lang, "k_bisher")),
      h("p", null, k.fragen.slice(0, i).map((q, n) => { const x = k.antworten[n]; return q.frage.replace(/\?$/, "") + ": " + (x.art === "eigen" ? "„" + x.text + "“ " + kt(lang, "k_deine") : x.art === "egal" ? kt(lang, "k_egal_kurz") : q.kacheln[x.kachel].label); }).join(" · "))));
    body.push(errLine(lang, k.err));
    const lastQ = i === k.fragen.length - 1;
    return { body, primary: a("k-weiter", kt(lang, lastQ ? "k_zusammen" : "k_weiter"), "K_WEITER", { cls: "k-go", disabled: !cur || !!k.busy }), secondary: [] };
  }

  // ---- 3 So bauen wir es ----------------------------------------------------------------------------------------------
  function listeView(ctx) {
    const lang = ctx.lang, k = ctx.frei.k, l = k.liste;
    const body = [
      h("h2", { class: "k-h", key: "h" }, kt(lang, "k_liste_h")),
      h("p", { class: "k-lede", key: "l" }, kt(lang, "k_liste_lede")),
      h("p", { class: "k-titel", key: "t" }, l.titel),
      h("ul", { class: "k-haken", key: "ul" }, l.punkte.map((p) => h("li", { key: p.id, "data-punkt": p.id }, svg(CHECK, 22),
        h("span", null, p.text, h("span", { class: "k-pruef" }, kt(lang, "k_pruefung") + " " + p.pruefung))))),
      l.nicht.length ? h("div", { class: "k-ehrlich", key: "n" }, h("strong", null, kt(lang, "k_ehrlich")), " ", l.nicht.join(" ")) : null,
      h("p", { class: "k-kosten", key: "k" }, kt(lang, "k_kosten", { n: l.dauerMaxMin, m: l.kosten })),
      k.busy === "auftrag" ? status("…", "hint", "busy") : null,
      errLine(lang, k.err)];
    return { body, primary: a("k-ja", kt(lang, "k_ja"), "K_JA", { cls: "k-go", disabled: !!k.busy }), secondary: [a("k-etwas", kt(lang, "k_etwas"), "K_AENDERN")] };
  }

  // ---- 4 Wir bauen ----------------------------------------------------------------------------------------------------
  function bauenView(ctx, dispatch) {
    const lang = ctx.lang, k = ctx.frei.k, n = k.liste ? k.liste.punkte.length : 0;
    const step = (key, label, st, done) => h("li", { key, class: done ? "done" : "" }, h("span", { class: "k-dot", "aria-hidden": "true" }, done ? svg(CHECK, 18) : null), h("span", { class: "k-s-t" }, label), h("span", { class: "k-s-st" }, st));
    // nur Kanaele, die der Server zustellen kann; ein Haekchen zeigt immer, was der Server gespeichert hat (der Klick setzt es
    // nicht selbst): das Push-Haekchen also erst nach Erlaubnis des Browsers, Abo und Opt-in
    const kanaele = ["mail", "push"].filter((x) => k.kanaele[x]);
    const box = (kanal, label) => h("label", { class: "k-check", key: kanal },
      h("input", { type: "checkbox", "data-act": "k-optin-" + kanal, checked: k.optin[kanal], disabled: k.busy || k.pushSt === "frage" ? true : null, on: { change: (e) => { const on = e.target.checked; e.target.checked = k.optin[kanal]; dispatch({ type: "K_OPTIN", kanal, on }); } } }), h("span", null, label));
    const pushLine = k.pushSt && k.pushSt !== "ok" ? h("p", { class: k.pushSt === "frage" ? "hint" : "warn", role: "status", key: "ps", "data-push": k.pushSt }, kt(lang, "k_push_" + k.pushSt.replace("-", "_"))) : null;
    const optin = kanaele.length ? h("fieldset", { class: "k-optin", key: "o" }, h("legend", null, kt(lang, "k_optin_h")), kanaele.map((x) => box(x, kt(lang, "k_optin_" + x))), pushLine, h("p", { class: "hint" }, kt(lang, "k_optin_note")))
      : h("p", { class: "hint", key: "o0" }, kt(lang, "k_optin_keins"));
    const optErr = k.optErr ? h("p", { class: "warn", role: "alert", key: "oe" }, kt(lang, "k_optin_err")) : null;
    // ohne Bau-Worker (der Server sagt bau: "nicht-verfuegbar") kein Fortschritt, keine Dauer: nur ehrlich, was ist
    const body = k.bau === "nicht-verfuegbar" ? [
      h("h2", { class: "k-h", key: "h" }, kt(lang, "k_gespeichert_h")),
      h("p", { class: "k-note", role: "status", key: "nv", "data-bau": "nicht-verfuegbar" }, kt(lang, "k_bau_nv")),
      h("p", { class: "hint", key: "nk" }, kt(lang, "k_bau_nv_kosten")),
      optin, optErr] : [
      h("h2", { class: "k-h", key: "h" }, kt(lang, "k_bauen_h")),
      h("p", { class: "k-lede", key: "l" }, kt(lang, "k_bauen_lede")),
      h("ol", { class: "k-steps", key: "s" },
        step("plan", kt(lang, "k_s_plan"), kt(lang, "k_st_fertig"), true),
        step("bau", kt(lang, "k_s_bau"), kt(lang, "k_st_wartet"), false),
        step("probe", kt(lang, "k_s_probe"), kt(lang, "k_st_danach"), false),
        step("pruef", kt(lang, "k_s_pruef", { n }), kt(lang, "k_st_danach"), false)),
      status(kt(lang, "k_bauen_p3"), "hint strong", "p3"),
      h("p", { class: "hint", key: "d" }, kt(lang, "k_dauer")),
      optin, optErr];
    return { body, primary: a("k-home", kt(lang, "k_home"), "K_HOME", { cls: "k-go" }), secondary: k.bau === "wartet" ? [a("k-stand", kt(lang, "k_stand"), { type: "K_FERTIG", auftrag: k.auftrag })] : [] };
  }

  // ---- 5 Fertig / Melden --------------------------------------------------------------------------------------------
  const resultList = (lang, f, only) => h("ul", { class: "k-result", key: "res" }, (only ? f.punkte.filter((p) => !p.erfuellt) : f.punkte).map((p) => h("li", { key: p.id, "data-punkt": p.id, "data-ok": p.erfuellt ? "1" : "0", "data-geprueft": p.geprueft },
    h("span", { class: p.erfuellt ? "k-yes" : "k-no" }, kt(lang, p.erfuellt ? "k_erfuellt" : "k_fehlt")),
    h("span", null, p.text + (p.notiz ? " – " + p.notiz : ""), h("span", { class: "k-pruef" }, kt(lang, p.geprueft === "gespielt" ? "k_gespielt" : "k_gelesen"))))));
  const kostenLine = (lang, f) => status(f.abgebucht ? kt(lang, "k_ab", { n: f.kosten }) : kt(lang, "k_nichts_ab"), "hint", "ab");

  /** Probe: das gepruefte Modul im Sandbox-Rahmen vom Spiel-Ursprung (Spielmodus; entscheidet nichts) */
  function probe(lang, f, k) {
    const p = k.probe;
    if (!p) return null;
    if (p.how === "busy") return status(kt(lang, "k_probe_lade"), "hint", "pl");
    if (p.how !== "ok") return h("p", { class: "warn", role: "alert", key: "pe", "data-how": p.how }, kt(lang, "k_probe_e_" + (["hash", "nicht-hier", "ursprung"].includes(p.how) ? p.how.replace("-", "_") : "netz")));
    return h("div", { class: "k-probe", key: "probe-" + p.sha256, ref: (el) => {
      const host = createSpielHost({ doc: el.ownerDocument, win: el.ownerDocument.defaultView, mount: el, frameUrl: f.spiel.rahmen, onEvent: () => {} });
      host.start({ mode: "play", code: p.code, seed: "probe", lang: lang === "en" ? "en" : "de" });
    } });
  }

  function fertigView(ctx, dispatch) {
    const lang = ctx.lang, k = ctx.frei.k, f = k.fertig;
    if (!f) return { body: [k.err ? errLine(lang, k.err) : status(kt(lang, "k_fertig_lade"))], primary: null, secondary: [] };
    const neu = a("k-neu", kt(lang, "k_neu_laden"), "K_STATUS", { disabled: !!k.busy });
    if (f.gescheitert) return { body: [h("h2", { class: "k-h", key: "h" }, f.titel), status(kt(lang, "k_gescheitert_" + f.gescheitert), "warn", "gs"), errLine(lang, k.err)], primary: a("k-home", kt(lang, "k_home"), "BACK", { cls: "k-go" }), secondary: [] };
    if (f.wartet && f.baut) return { body: [h("h2", { class: "k-h", key: "h" }, kt(lang, "k_baut_h")), h("p", { class: "k-titel", key: "t" }, f.titel), status(kt(lang, "k_baut"), "hint strong", "bt"), errLine(lang, k.err)], primary: neu, secondary: [] };
    if (f.wartet) return { body: [h("h2", { class: "k-h", key: "h" }, f.titel), status(kt(lang, "k_nach_ok", { n: f.left }), "k-ok", "nb"), h("p", { class: "hint", key: "wt" }, kt(lang, "k_nach_wartet")), errLine(lang, k.err)], primary: neu, secondary: [] };
    const body = [h("h2", { class: "k-h", key: "h" }, f.titel),
      f.hinweis ? status(kt(lang, f.hinweis === "guthaben_fehlt" ? "k_nach_guthaben" : "k_nach_alt"), "warn", "hw") : null,
      resultList(lang, f, false),
      status(f.fehlt === 0 ? kt(lang, "k_alles") : f.fehlt === 1 ? kt(lang, "k_fehlt_1") : kt(lang, "k_fehlt_n", { n: f.fehlt }), "hint strong", "fs"),
      f.punkte.some((p) => p.geprueft === "gelesen") ? h("p", { class: "hint", key: "gl" }, kt(lang, "k_gelesen_hint")) : null,
      f.fehlt === 0 || f.behalten ? kostenLine(lang, f) : f.vorgemerkt ? status(kt(lang, "k_vorgemerkt", { n: f.kosten }), "hint", "vm") : null,
      probe(lang, f, k)];
    if (f.gemeldet) body.push(status(kt(lang, "k_meld_frei"), "k-ok", "gm"));
    if (f.behalten) body.push(status(f.abgebucht ? kt(lang, "k_behalten_ab", { n: f.kosten }) : kt(lang, "k_behalten_frei"), "k-ok", "bh"));
    const nachOk = f.fehlt > 0 && !f.behalten && !f.gemeldet && f.left > 0;
    if (nachOk) body.push(h("div", { class: "k-field", key: "nt" },
      h("label", { for: "k-nachtext" }, kt(lang, "k_nach_label")),
      h("textarea", { id: "k-nachtext", class: "k-input", rows: "2", maxlength: String(K.NACHBESSERN_TEXT_MAX), placeholder: kt(lang, "k_nach_ph"), value: k.nachText, on: { input: (e) => dispatch({ type: "K_NACH_TEXT", value: e.target.value }) } })));
    body.push(errLine(lang, k.err));
    const sec = [];
    // Nachbessern, solange der Server noch welche zaehlt; danach steht "Melden" an seiner Stelle
    if (f.fehlt > 0 && !f.behalten && !f.gemeldet) sec.push(f.left > 0 ? a("k-nach", kt(lang, "k_nach"), "K_NACHBESSERN", { sub: kt(lang, "k_nach_sub", { n: f.left }), disabled: !!k.busy }) : a("k-melden-open", kt(lang, "k_melden"), "K_MELDEN_OPEN"));
    if (!f.behalten && f.fehlt > 0) sec.push(a("k-behalten", kt(lang, "k_behalten"), "K_BEHALTEN", { sub: kt(lang, "k_behalten_sub", { n: f.kosten }), disabled: !!k.busy }));
    const primary = k.probe && k.probe.how === "ok" ? a("k-probe-zu", kt(lang, "k_probe_zu"), "K_PROBE_ZU") : a("k-probe", kt(lang, "k_probe"), "K_PROBE", { cls: "k-go", disabled: !!(k.probe && k.probe.how === "busy") });
    return { body, primary, secondary: sec };
  }
  function meldenView(ctx, dispatch) {
    const lang = ctx.lang, k = ctx.frei.k, f = k.fertig, n = f.punkte.length;
    const body = [h("h2", { class: "k-h", key: "h" }, f.titel),
      h("p", { class: "k-lede", key: "n" }, kt(lang, "k_meld_n", { n: K.NACHBESSERN_MAX, m: K.NACHBESSERN_MAX })),
      h("ul", { class: "k-result", key: "sum" }, h("li", { key: "ok" }, h("span", { class: "k-yes" }, kt(lang, "k_erfuellt")), h("span", null, kt(lang, "k_meld_punkte", { n: n - f.fehlt, m: n })))),
      resultList(lang, f, true)];
    if (f.gemeldet) body.push(status(kt(lang, "k_meld_ok"), "k-ok", "ok"));
    else {
      body.push(h("div", { class: "k-absage", key: "sorry" }, h("p", null, h("strong", null, kt(lang, "k_meld_sorry")), " ", kt(lang, "k_meld_text"))),
        h("div", { class: "k-field", key: "f" },
          h("label", { for: "k-meldung" }, kt(lang, "k_meld_label")),
          h("textarea", { id: "k-meldung", class: "k-input", rows: "3", maxlength: String(K.MELDUNG_MAX), placeholder: kt(lang, "k_meld_ph"), value: k.meldText, "aria-describedby": "k-meld-hint", on: { input: (e) => dispatch({ type: "K_MELD_TEXT", value: e.target.value }) } }),
          h("p", { class: "hint", id: "k-meld-hint" }, kt(lang, "k_meld_hint"))));
      if (k.meld && k.meld.how !== "ok") body.push(errLine(lang, k.meld, "me"));
    }
    if (f.behalten) body.push(status(f.abgebucht ? kt(lang, "k_behalten_ab", { n: f.kosten }) : kt(lang, "k_behalten_frei"), "k-ok", "bh"));
    body.push(errLine(lang, k.err));
    return { body, primary: f.gemeldet ? null : a("k-melden", kt(lang, "k_melden"), "K_MELDEN", { cls: "k-go", disabled: !!k.busy }),
      secondary: f.behalten ? [] : [a("k-behalten", kt(lang, "k_trotzdem"), "K_BEHALTEN", { sub: kt(lang, "k_behalten_sub", { n: f.kosten }), disabled: !!k.busy })] };
  }

  function waitView(ctx, key) {
    return { body: [h("div", { class: "notice k-wait", key: "w" }, status(kt(ctx.lang, key), "hint strong", "ws"))], primary: a("cancel", kt(ctx.lang, "k_abbrechen"), "CANCEL"), secondary: [] };
  }

  /** Blatt (ohne "frei.") -> { body, panel, actions, heading } oder null */
  function klaerenView(state, dispatch, leaf) {
    const ctx = state.ctx, lang = ctx.lang;
    const r = leaf === "klaeren" ? satzView(ctx, dispatch) : leaf === "kwarten" ? waitView(ctx, "k_warten") : leaf === "kfrage" ? frageView(ctx, dispatch)
      : leaf === "klwarten" ? waitView(ctx, "k_warten_liste") : leaf === "kliste" ? listeView(ctx) : leaf === "kbauen" ? bauenView(ctx, dispatch)
        : leaf === "kfertig" ? fertigView(ctx, dispatch) : leaf === "kmelden" ? meldenView(ctx, dispatch) : null;
    if (!r) return null;
    const mine = leaf === "kfertig" || leaf === "kmelden";
    return { body: r.body.filter(Boolean), panel: [], actions: { primary: r.primary, secondary: r.secondary }, heading: kt(lang, mine ? "k_head_mine" : "k_head"), cls: "k-screen" };
  }
  return { klaerenView, entryLabel: (lang) => kt(lang, "k_entry") };
}
