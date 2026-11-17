// Freie Karte 2, Klaerungsdialog (P1) als Teil des Features "frei" (ADR 0001 (g)): Zustaende unter inhalt.frei, Wachen,
// Aktionen, Kontext (ctx.frei.k) und ein Effekt. Alle Sichtbarkeit folgt aus diesem Zustand; das Netz nur ueber den Effekt
// "frei.k" (src/broker/klaerung.js). Keine Policy hier: was erlaubt ist, wie oft nachgebessert werden darf und was eine
// Karte kostet, sagt allein der Server (CADS-DEMO-wrapper lib/duell-klaerung.mjs); die App zeigt es ehrlich an.
//
// Zustaende (Design-Canvas "Freie Karte 2 – Klaerungsdialog"):
//   klaeren     1 Ein Satz, mit Mikrofon und Beispielen; nichts wird gebaut oder abgebucht
//   kwarten     die Fragen kommen (Abbrechen immer)
//   kfrage      2 Frage i von n: Kacheln, "Egal, ueberrasch mich", gleichwertig "Oder sag es selbst" (Pruefung im Server);
//               abgelehnte eigene Worte: ehrlicher Grund, Vorschlaege gelten erst nach Antippen (FreiAbsage)
//   klwarten    die Haekchenliste kommt
//   kliste      3 "So bauen wir es": Punkte (Bauauftrag = Abnahmemassstab), was nicht dabei ist, Dauer, Kosten, "Ja, so bauen"
//   kbauen      4 der bestaetigte Auftrag liegt beim Server; Mitteilung/E-Mail nur per Haekchen (gespeichert, kein Versand)
//   kfertig     5 Stand des Auftrags (baut | nachbessern | fertig | gescheitert); fertig: erfuellt/fehlt je Punkt mit
//               "gespielt" bzw. "nicht automatisch pruefbar", "Probe spielen" (Spiel vom eigenen Ursprung, Hash geprueft),
//               "Nachbessern (kostenlos) · noch n×" (optional mit eigenen Worten) bzw. "Melden", "So behalten (1 Guthaben)"
//   kmelden     nach dreimal Nachbessern: Entschuldigung, Freitext (optional), Melden; "Trotzdem so behalten" bleibt
// Gebaut wird im Bau-Worker (P3); kfertig zeigt, was der Server zu einem Auftrag meldet (K_FERTIG {auftrag}, ?go=fertig).
// Abnahme und Guthaben entscheidet nur der Server-Lauf; was die Probe im Browser tut, entscheidet nichts.
import * as K from "./klaerung.js";

const T = (p) => p;
const KF = (ctx, o) => ({ ...ctx, frei: { ...ctx.frei, k: { ...ctx.frei.k, ...o } } });
/** frischer Dialog, aber req laeuft weiter: eine spaete Antwort eines frueheren Dialogs passt nie zu einer neuen Anfrage */
const fresh = (ctx, o = {}) => KF(ctx, { ...freshK(), req: ctx.frei.k.req, ...o });
const cut = (v, n) => [...String(v == null ? "" : v)].slice(0, n).join("");
export const freshK = () => ({ satz: "", req: 0, busy: null, err: null, id: null, verstehe: "", fragen: [], i: 0, antworten: [], eigen: [], pruef: null,
  liste: null, auftrag: null, optin: { push: false, mail: false }, kanaele: { push: false, mail: false }, optErr: null, fertig: null, meldText: "", meld: null, note: null, mic: null,
  nachText: "", probe: null,
  // Push-Abo dieses Geraets (Marke aus /api/duell/push/subscribe); der Neuentwurf hat noch keins, darum bietet die App keine
  // Mitteilung an (nichts anbieten, was es nicht gibt) – der Server koennte sie zustellen (Kanal "push")
  pushMark: null });

export const KLAEREN_STATES = {
  klaeren: {
    on: {
      K_TEXT: { actions: ["kSatz"] },
      K_EXAMPLE: { actions: ["kSatz"] },
      K_MIC: { actions: ["kMic"] },
      K_GO: { target: T("inhalt.frei.kwarten"), cond: "kSatzOk", actions: ["kFragenFx"] },
      BACK: { target: T("inhalt.frei.start"), actions: ["kClear"] }
    }
  },
  kwarten: {
    on: {
      K_R: [
        { target: T("inhalt.frei.kfrage"), cond: "kFragenOk", actions: ["kTakeFragen"] },
        { target: T("inhalt.frei.klaeren"), cond: "kCur", actions: ["kFail"] }
      ],
      CANCEL: { target: T("inhalt.frei.klaeren"), actions: ["kCancel"] },
      BACK: { target: T("inhalt.frei.klaeren"), actions: ["kCancel"] }
    }
  },
  kfrage: {
    on: {
      K_PICK: { cond: "kPickOk", actions: ["kPick"] },
      K_EGAL: { actions: ["kEgal"] },
      K_EIGEN_TEXT: { actions: ["kEigenText"] },
      K_MIC: { actions: ["kMic"] },
      K_EIGEN_GO: { cond: "kEigenOk", actions: ["kEigenFx"] },
      K_VORSCHLAG: { cond: "kVorschlagOk", actions: ["kVorschlag"] },
      K_R: [{ cond: "kAntwortR", actions: ["kTakeAntwort"] }],
      K_WEITER: [
        { cond: "kWeiterNext", actions: ["kNext"] },
        { target: T("inhalt.frei.klwarten"), cond: "kWeiterLast", actions: ["kListeFx"] }
      ],
      K_AENDERN: { target: T("inhalt.frei.klaeren"), actions: ["kReset"] },
      BACK: [{ cond: "kNotFirst", actions: ["kPrev"] }, { target: T("inhalt.frei.klaeren"), actions: ["kReset"] }]
    }
  },
  klwarten: {
    on: {
      K_R: [
        { target: T("inhalt.frei.kliste"), cond: "kListeOk", actions: ["kTakeListe"] },
        { target: T("inhalt.frei.kfrage"), cond: "kCur", actions: ["kListeFail"] }
      ],
      CANCEL: { target: T("inhalt.frei.kfrage"), actions: ["kCancel"] },
      BACK: { target: T("inhalt.frei.kfrage"), actions: ["kCancel"] }
    }
  },
  kliste: {
    on: {
      K_JA: { cond: "kIdle", actions: ["kAuftragFx"] },
      K_R: [{ target: T("inhalt.frei.kbauen"), cond: "kAuftragOk", actions: ["kTakeAuftrag"] }, { cond: "kCur", actions: ["kFail"] }],
      K_AENDERN: { target: T("inhalt.frei.kfrage"), cond: "kIdle", actions: ["kFirst"] },
      BACK: { target: T("inhalt.frei.kfrage"), cond: "kIdle" }
    }
  },
  kbauen: {
    on: {
      K_OPTIN: { cond: "kOptinOk", actions: ["kOptinFx"] },
      K_R: [{ cond: "kOptinR", actions: ["kTakeOptin"] }],
      K_HOME: { target: T("inhalt.shelf"), actions: ["kClear"] },
      BACK: { target: T("inhalt.shelf"), actions: ["kClear"] }
    }
  },
  kfertig: {
    on: {
      K_R: [{ cond: "kStatusR", actions: ["kTakeStatus"] }, { cond: "kNachR", actions: ["kTakeNach"] }, { cond: "kBehaltenR", actions: ["kTakeBehalten"] }],
      K_STATUS: { cond: "kIdle", actions: ["kStatusFx"] },
      K_PROBE: { cond: "kProbeOk", actions: ["kProbeFx"] },
      K_PROBE_R: { cond: "kProbeR", actions: ["kTakeProbe"] },
      K_PROBE_ZU: { actions: ["kProbeZu"] },
      K_NACH_TEXT: { actions: ["kNachText"] },
      K_NACHBESSERN: { cond: "kNachOk", actions: ["kNachFx"] },
      K_MELDEN_OPEN: { target: T("inhalt.frei.kmelden"), cond: "kMeldenOk" },
      K_BEHALTEN: { cond: "kBehaltenOk", actions: ["kBehaltenFx"] },
      BACK: { target: T("inhalt.shelf"), actions: ["kClear"] }
    }
  },
  kmelden: {
    on: {
      K_MELD_TEXT: { actions: ["kMeldText"] },
      K_MELDEN: { cond: "kMeldenSend", actions: ["kMeldenFx"] },
      K_BEHALTEN: { cond: "kBehaltenOk", actions: ["kBehaltenFx"] },
      K_R: [{ cond: "kMeldenR", actions: ["kTakeMelden"] }, { cond: "kBehaltenR", actions: ["kTakeBehalten"] }],
      BACK: { target: T("inhalt.frei.kfertig"), cond: "kIdle" }
    }
  }
};

const k = (ctx) => ctx.frei.k;
const isR = (op) => (ctx, ev) => ev.op === op && ev.req === k(ctx).req && k(ctx).busy === op;
const pos = (n) => (Number.isInteger(n) && n > 0 ? n : null);
const ok = (ev) => !!ev.r && ev.r.how === "ok";
const answered = (ctx) => !!k(ctx).antworten[k(ctx).i];
const last = (ctx) => k(ctx).i === k(ctx).fragen.length - 1;
const eigene = (ks) => ks.antworten.filter((a) => a && a.art === "eigen").map((a) => a.text);
/** Ergebnis-Antwort des Servers (status) -> Sicht oder null (wie ein fremder Link: nur bekannte Felder) */
export function fertigOf(b) {
  if (!b || typeof b !== "object") return null;
  // baut (erster Bau) bzw. nachbessern (der Server hat das alte Ergebnis weggenommen): P3 schreibt das naechste
  const wartet = (b.status === "baut" || b.status === "nachbessern") && b.ergebnis === null;
  const gescheitert = b.status === "gescheitert" && b.ergebnis === null ? (K.BAU_GRUENDE.includes(b.grund) ? b.grund : null) : null;
  if (b.status === "gescheitert" && !gescheitert) return null;
  const fertig = !wartet && !gescheitert;
  if (fertig && (b.status !== "fertig" || !b.ergebnis || !Array.isArray(b.ergebnis.punkte))) return null;
  const titel = K.line(b.titel), punkte = [];
  for (const p of fertig ? b.ergebnis.punkte : []) {
    if (!p || typeof p.id !== "string" || typeof p.erfuellt !== "boolean" || !K.line(p.text) || !K.GEPRUEFT.includes(p.geprueft)) return null;
    punkte.push({ id: p.id, text: cut(K.line(p.text), K.LEN.punkt), erfuellt: p.erfuellt, notiz: cut(K.line(p.notiz), K.LEN.punkt), geprueft: p.geprueft });
  }
  const spiel = fertig ? K.checkSpielRef(b.spiel) : null;
  const left = Number.isInteger(b.nachbessernLeft) && b.nachbessernLeft >= 0 && b.nachbessernLeft <= K.NACHBESSERN_MAX ? b.nachbessernLeft : null;
  const kosten = pos(b.kosten);   // Preis kommt vom Server, nie aus der App
  if (!titel || (fertig && (!punkte.length || !spiel)) || left === null || !kosten || typeof b.abgebucht !== "boolean") return null;
  return { titel: cut(titel, K.LEN.titel), punkte, fehlt: punkte.filter((p) => !p.erfuellt).length, left, wartet, baut: wartet && b.status === "baut", gescheitert, spiel,
    hinweis: K.HINWEISE.includes(b.hinweis) ? b.hinweis : null, kosten, abgebucht: b.abgebucht, gemeldet: b.gemeldet === true, behalten: b.behalten === true };
}

/** Antwort von auftrag/optin: welche Benachrichtigung der Server wirklich zustellen kann (nichts anbieten, was es nicht gibt) */
const kanaeleOf = (b) => ({ push: !!b && !!b.kanaele && b.kanaele.push === true, mail: !!b && !!b.kanaele && b.kanaele.mail === true });

export const klaerenGuards = {
  kSatzOk: (ctx) => { const n = [...K.line(k(ctx).satz)].length; return n >= K.SATZ_MIN && n <= K.SATZ_MAX; },
  kCur: (ctx, ev) => ev.req === k(ctx).req && ev.op === k(ctx).busy,
  kIdle: (ctx) => !k(ctx).busy,
  // die Antwort des Servers wird wie ein fremder Link geprueft (gleicher Vertrag wie im Server)
  kFragenOk: (ctx, ev) => isR("fragen")(ctx, ev) && ok(ev) && typeof ev.r.body.id === "string" && /^[A-Za-z0-9_-]{22}$/.test(ev.r.body.id) && K.checkFragen({ ok: true, verstehe: ev.r.body.verstehe, fragen: ev.r.body.fragen }).ok,
  kPickOk: (ctx, ev) => { const f = k(ctx).fragen[k(ctx).i]; return !!f && Number.isInteger(ev.kachel) && ev.kachel >= 0 && ev.kachel < f.kacheln.length; },
  kEigenOk: (ctx) => { const t = K.line(k(ctx).eigen[k(ctx).i]); return !!t && [...t].length <= K.EIGEN_MAX && !k(ctx).busy; },
  kVorschlagOk: (ctx, ev) => { const p = k(ctx).pruef; return !!p && p.how === "refused" && Array.isArray(p.vorschlaege) && p.vorschlaege.includes(ev.kachel); },
  kAntwortR: isR("antwort"),
  kWeiterNext: (ctx) => answered(ctx) && !k(ctx).busy && !last(ctx),
  kWeiterLast: (ctx) => answered(ctx) && !k(ctx).busy && last(ctx),
  kNotFirst: (ctx) => k(ctx).i > 0,
  kListeOk: (ctx, ev) => isR("liste")(ctx, ev) && ok(ev) && K.checkListe({ ok: true, titel: ev.r.body.titel, verstehe: ev.r.body.verstehe, punkte: (ev.r.body.punkte || []).map((p) => ({ text: p && p.text, pruefung: p && p.pruefung })), nicht: ev.r.body.nicht }, eigene(k(ctx))).ok
    && !!pos(ev.r.body.dauerMaxMin) && !!ev.r.body.kosten && !!pos(ev.r.body.kosten.guthaben),
  kAuftragOk: (ctx, ev) => isR("auftrag")(ctx, ev) && ok(ev) && /^[A-Za-z0-9_-]{22}$/.test(String(ev.r.body.auftrag)),
  kOptinOk: (ctx, ev) => ["push", "mail"].includes(ev.kanal) && typeof ev.on === "boolean" && !k(ctx).busy,
  kOptinR: isR("optin"),
  kStatusR: isR("status"),
  kProbeOk: (ctx) => { const f = k(ctx).fertig; return !!f && !!f.spiel && !f.wartet && !(k(ctx).probe && k(ctx).probe.how === "busy"); },
  kProbeR: (ctx, ev) => { const p = k(ctx).probe, f = k(ctx).fertig; return !!p && p.how === "busy" && !!f && !!f.spiel && ev.sha256 === f.spiel.sha256; },
  kNachR: isR("nachbessern"),
  kBehaltenR: isR("behalten"),
  kMeldenR: isR("melden"),
  // was der Server zuletzt sagte: Nachbessern solange er noch welche zaehlt, danach Melden an seiner Stelle
  kNachOk: (ctx) => { const f = k(ctx).fertig; return !!f && !f.wartet && f.fehlt > 0 && f.left > 0 && !f.gemeldet && !f.behalten && !k(ctx).busy && [...K.line(k(ctx).nachText)].length <= K.NACHBESSERN_TEXT_MAX; },
  kMeldenOk: (ctx) => { const f = k(ctx).fertig; return !!f && !f.wartet && f.fehlt > 0 && f.left === 0 && !f.behalten; },
  kMeldenSend: (ctx) => { const f = k(ctx).fertig; return !!f && !f.gemeldet && !k(ctx).busy && [...K.line(k(ctx).meldText)].length <= K.MELDUNG_MAX; },
  kBehaltenOk: (ctx) => { const f = k(ctx).fertig; return !!f && !f.wartet && !f.gescheitert && f.fehlt > 0 && !f.behalten && !k(ctx).busy; },
  kAnR: (ctx, ev) => ev.op === "an",
  kAn: (ctx) => ctx.frei.kan === true,
  kFertigOk: (ctx, ev) => typeof ev.auftrag === "string" && /^[A-Za-z0-9_-]{22}$/.test(ev.auftrag)
};

function call(ctx, emit, op, body, o = {}) {
  const req = k(ctx).req + 1;
  emit({ type: "frei.k", op, req, body });
  return KF(ctx, { req, busy: op, err: null, ...o });
}
const errOf = (r) => (r && r.how && r.how !== "ok" ? { how: r.how, reason: r.reason || "", help: r.help || "" } : { how: "off" });

export const klaerenActions = {
  kClear: (ctx) => fresh(ctx),
  // der Schalter des Servers (POST /api/duell/klaerung/an); ohne klare Antwort bleibt der Einstieg weg (aus ist der Standard)
  kAnFx: (ctx, ev, emit) => { emit({ type: "frei.k", op: "an", req: 0, body: {} }); return ctx; },
  kTakeAn: (ctx, ev) => ({ ...ctx, frei: { ...ctx.frei, kan: !!ev.r && ev.r.how === "ok" && !!ev.r.body && ev.r.body.on === true } }),
  kStart: (ctx) => fresh(ctx, { satz: cut(ctx.frei.text, K.SATZ_MAX) }),   // ein schon getippter Satz der freien Karte kommt mit
  kSatz: (ctx, ev) => KF(ctx, { satz: cut(ev.value, K.SATZ_MAX), err: null }),
  kMic: (ctx, ev) => KF(ctx, { mic: ["hoert", "nein", "fehler"].includes(ev.st) ? ev.st : null }),
  kFragenFx: (ctx, ev, emit) => call(ctx, emit, "fragen", { satz: K.line(k(ctx).satz), lang: ctx.lang }),
  kCancel: (ctx) => KF(ctx, { req: k(ctx).req + 1, busy: null, note: "cancelled" }),
  kFail: (ctx, ev) => KF(ctx, { busy: null, err: errOf(ev.r) }),
  kTakeFragen: (ctx, ev) => {
    const v = K.checkFragen({ ok: true, verstehe: ev.r.body.verstehe, fragen: ev.r.body.fragen }).value;
    return KF(ctx, { busy: null, err: null, note: null, id: ev.r.body.id, verstehe: v.verstehe, fragen: v.fragen, i: 0, antworten: v.fragen.map(() => null), eigen: v.fragen.map(() => ""), pruef: null, liste: null });
  },
  kReset: (ctx) => fresh(ctx, { satz: k(ctx).satz }),
  kPick: (ctx, ev) => setAnswer(ctx, { art: "kachel", kachel: ev.kachel }, ""),
  kEgal: (ctx) => setAnswer(ctx, { art: "egal" }, ""),
  // neue eigene Worte gelten erst nach der Pruefung im Server: bis dahin keine Antwort (Weiter gesperrt)
  kEigenText: (ctx, ev) => {
    const ks = k(ctx), eigen = ks.eigen.slice(), ant = ks.antworten.slice();
    eigen[ks.i] = cut(ev.value, K.EIGEN_MAX);
    if (ant[ks.i] && ant[ks.i].art === "eigen") ant[ks.i] = null;
    return KF(ctx, { eigen, antworten: ant, pruef: null });
  },
  kEigenFx: (ctx, ev, emit) => { const ks = k(ctx), text = K.line(ks.eigen[ks.i]); return call(ctx, emit, "antwort", { id: ks.id, frage: ks.i, text }, { pruef: { i: ks.i, text, how: "busy" } }); },
  kTakeAntwort: (ctx, ev) => {
    const ks = k(ctx), p = ks.pruef;
    if (!p) return KF(ctx, { busy: null });
    if (ok(ev) && K.line(ev.r.body.text) === p.text) { const ant = ks.antworten.slice(); ant[p.i] = { art: "eigen", text: p.text }; return KF(ctx, { busy: null, antworten: ant, pruef: { ...p, how: "ok" } }); }
    const r = ev.r || {}, f = ks.fragen[p.i];
    const vorschlaege = Array.isArray(r.vorschlaege) ? r.vorschlaege.filter((j) => Number.isInteger(j) && j >= 0 && j < f.kacheln.length).slice(0, 2) : [];
    return KF(ctx, { busy: null, pruef: { ...p, how: r.how === "refused" || r.how === "blocked" ? "refused" : r.how || "off", reason: r.reason || "", help: r.help || "", vorschlaege } });
  },
  kVorschlag: (ctx, ev) => setAnswer(ctx, { art: "kachel", kachel: ev.kachel }, ""),
  kNext: (ctx) => KF(ctx, { i: k(ctx).i + 1, pruef: null, err: null }),
  kPrev: (ctx) => KF(ctx, { i: k(ctx).i - 1, pruef: null, err: null }),
  kFirst: (ctx) => KF(ctx, { i: 0, pruef: null, err: null }),
  kListeFx: (ctx, ev, emit) => call(ctx, emit, "liste", { id: k(ctx).id, antworten: k(ctx).antworten }),
  // eine im Server abgelehnte eigene Antwort: zurueck zu dieser Frage, die Antwort gilt nicht mehr
  kListeFail: (ctx, ev) => {
    const ks = k(ctx), r = ev.r || {}, i = Number.isInteger(r.frage) && r.frage >= 0 && r.frage < ks.fragen.length ? r.frage : ks.i;
    if (r.how === "refused" || r.how === "blocked") {
      const ant = ks.antworten.slice(), text = ant[i] && ant[i].art === "eigen" ? ant[i].text : "";
      ant[i] = null;
      return KF(ctx, { busy: null, i, antworten: ant, pruef: { i, text, how: "refused", reason: r.reason || "", vorschlaege: (r.vorschlaege || []).filter((j) => Number.isInteger(j) && j >= 0 && j < ks.fragen[i].kacheln.length) } });
    }
    return KF(ctx, { busy: null, err: errOf(r) });
  },
  kTakeListe: (ctx, ev) => {
    const b = ev.r.body, v = K.checkListe({ ok: true, titel: b.titel, verstehe: b.verstehe, punkte: b.punkte.map((p) => ({ text: p.text, pruefung: p.pruefung })), nicht: b.nicht }, eigene(k(ctx))).value;
    return KF(ctx, { busy: null, err: null, liste: { ...v, dauerMaxMin: b.dauerMaxMin, kosten: b.kosten.guthaben } });
  },
  kAuftragFx: (ctx, ev, emit) => call(ctx, emit, "auftrag", { id: k(ctx).id }),
  kTakeAuftrag: (ctx, ev) => KF(ctx, { busy: null, auftrag: ev.r.body.auftrag, optin: { push: false, mail: false }, kanaele: kanaeleOf(ev.r.body) }),
  kOptinFx: (ctx, ev, emit) => { const o = { ...k(ctx).optin, [ev.kanal]: ev.on }; return call(ctx, emit, "optin", { auftrag: k(ctx).auftrag, ...o }, { optErr: null }); },
  // angezeigt wird, was der Server gespeichert hat; scheitert es, bleibt der alte Stand mit ehrlichem Hinweis
  kTakeOptin: (ctx, ev) => (ok(ev) && ev.r.body.optin ? KF(ctx, { busy: null, optin: { push: ev.r.body.optin.push === true, mail: ev.r.body.optin.mail === true }, ...(ev.r.body.kanaele ? { kanaele: kanaeleOf(ev.r.body) } : {}) }) : KF(ctx, { busy: null, optErr: errOf(ev.r) })),
  kFertigOpen: (ctx, ev, emit) => call(fresh(ctx, { auftrag: ev.auftrag }), emit, "status", { auftrag: ev.auftrag }),
  kStatusFx: (ctx, ev, emit) => call(ctx, emit, "status", { auftrag: k(ctx).auftrag }),
  // ein neuer Stand ersetzt die Probe nur, wenn sich das Spiel geaendert hat (Nachbessern liefert ein neues Modul)
  kTakeStatus: (ctx, ev) => {
    const f = ok(ev) ? fertigOf(ev.r.body) : null, p = k(ctx).probe;
    const probe = p && f && f.spiel && p.sha256 === f.spiel.sha256 ? p : null;
    return f ? KF(ctx, { busy: null, fertig: f, err: null, probe }) : KF(ctx, { busy: null, err: errOf(ok(ev) ? { how: "bad" } : ev.r) });
  },
  // Probe spielen: das Modul kommt vom Spiel-Ursprung, der Effekt prueft den sha256 aus dem Server-Stand
  kProbeFx: (ctx, ev, emit) => { const s = k(ctx).fertig.spiel; emit({ type: "frei.probe", modul: s.modul, sha256: s.sha256 }); return KF(ctx, { probe: { how: "busy", sha256: s.sha256 } }); },
  kTakeProbe: (ctx, ev) => KF(ctx, { probe: ev.r && ev.r.how === "ok" && typeof ev.r.code === "string" ? { how: "ok", sha256: ev.sha256, code: ev.r.code } : { how: ev.r && typeof ev.r.how === "string" ? ev.r.how : "netz", sha256: ev.sha256 } }),
  kProbeZu: (ctx) => KF(ctx, { probe: null }),
  kNachText: (ctx, ev) => KF(ctx, { nachText: cut(ev.value, K.NACHBESSERN_TEXT_MAX) }),
  kNachFx: (ctx, ev, emit) => { const t = K.line(k(ctx).nachText); return call(ctx, emit, "nachbessern", { auftrag: k(ctx).auftrag, ...(t ? { text: t } : {}) }); },
  kTakeNach: (ctx, ev) => {
    const f = k(ctx).fertig, r = ev.r || {};
    // angenommen: der Server baut neu; bis zum neuen Ergebnis gibt es hier nichts zu tun
    if (ok(ev) && Number.isInteger(r.body.nachbessernLeft)) return KF(ctx, { busy: null, note: "nachbessern", nachText: "", probe: null, fertig: { ...f, left: r.body.nachbessernLeft, wartet: true, baut: false } });
    if (r.how === "limit") return KF(ctx, { busy: null, note: null, fertig: { ...f, left: 0 } });
    return KF(ctx, { busy: null, err: errOf(r) });
  },
  kMeldText: (ctx, ev) => KF(ctx, { meldText: cut(ev.value, K.MELDUNG_MAX), meld: null }),
  kMeldenFx: (ctx, ev, emit) => { const t = K.line(k(ctx).meldText); return call(ctx, emit, "melden", { auftrag: k(ctx).auftrag, ...(t ? { text: t } : {}) }, { meld: null }); },
  kTakeMelden: (ctx, ev) => (ok(ev) && ev.r.body.gemeldet === true ? KF(ctx, { busy: null, meld: { how: "ok" }, fertig: { ...k(ctx).fertig, gemeldet: true } }) : KF(ctx, { busy: null, meld: errOf(ev.r) })),
  kBehaltenFx: (ctx, ev, emit) => call(ctx, emit, "behalten", { auftrag: k(ctx).auftrag }),
  kTakeBehalten: (ctx, ev) => (ok(ev) && ev.r.body.behalten === true ? KF(ctx, { busy: null, note: ev.r.body.abgebucht === true ? "behalten" : "behalten-frei", fertig: { ...k(ctx).fertig, behalten: true, abgebucht: ev.r.body.abgebucht === true } }) : KF(ctx, { busy: null, err: errOf(ev.r) }))
};
function setAnswer(ctx, a, eigenText) {
  const ks = k(ctx), ant = ks.antworten.slice(), eigen = ks.eigen.slice();
  ant[ks.i] = a; eigen[ks.i] = eigenText;
  return KF(ctx, { antworten: ant, eigen, pruef: null });
}

/** Effekte: ein Aufruf des Klaerungsdienstes (K_R {op, req, r}, gilt nur fuer req); das Spielmodul fuer die Probe (K_PROBE_R) */
export const klaerenEffects = {
  "frei.probe": (fx, env) => {
    const svc = env.deps.spielModul;
    const run = async () => {
      const r = svc && typeof svc.laden === "function" ? await svc.laden(fx.modul, fx.sha256) : { how: "nicht-hier" };
      env.dispatch({ type: "K_PROBE_R", sha256: fx.sha256, r });
    };
    run().catch((e) => setTimeout(() => { throw e; }, 0));
  },
  "frei.k": (fx, env) => {
    const svc = env.deps.klaerung;
    const run = async () => {
      const r = svc && typeof svc[fx.op] === "function" ? await svc[fx.op](fx.body) : { how: "nicht-hier" };
      env.dispatch({ type: "K_R", op: fx.op, req: fx.req, r });
    };
    run().catch((e) => setTimeout(() => { throw e; }, 0));
  }
};
