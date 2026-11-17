// Freie Karte 2, P3 (Prototyp): Hintergrund-Pipeline Wunsch -> Haekchenliste/Plan -> Spielcode -> Pruefung -> Reparatur
// -> Abnahme -> Karte mit ehrlichem "fehlt". Dazu der Einstieg Nachbesserung (bestehendes Spiel + Haekchenliste +
// fehlt-Punkte + optional Kundentext -> gezielte Reparatur ohne Neubau; hoechstens 3x kostenlos, danach "Melden").
//
// Modell je Rolle umschaltbar (planer, bauer, abnahme). Der Klaerungsdialog P1 ist hier NICHT simuliert: die Pipeline
// startet direkt mit Wunsch + Knoepfen, der Planer erzeugt die Haekchenliste selbst (Variante "direkt").
import { praefix, ROLLEN, SCHEMA_PLAN, SCHEMA_ABNAHME } from "./doku.mjs";
import { repairNotes, errorKinds, extractCode } from "./befund.mjs";
import { BudgetAbbruch } from "./llm.mjs";

export const MODELLE = Object.freeze({ haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5" });
/** Rollen-Varianten der Messung. */
export const VARIANTEN = Object.freeze({
  A: { planer: MODELLE.haiku, bauer: MODELLE.haiku, abnahme: MODELLE.haiku },
  B: { planer: MODELLE.haiku, bauer: MODELLE.haiku, abnahme: MODELLE.sonnet },
  C: { planer: MODELLE.sonnet, bauer: MODELLE.haiku, abnahme: MODELLE.sonnet }
});
export const GRENZEN = Object.freeze({ reparaturen: 3, bauzeitMs: 15 * 60 * 1000, nachbesserungen: 3, maxTokensBau: 16000, maxTokensPlan: 8000, maxTokensAbnahme: 8000 });

const GENRE = { G1: "Spiel / Fliegen", G2: "Spiel / Jump & Run", G3: "Spiel / Neues Spiel" };
const numbered = (code) => code.split("\n").map((l, i) => String(i + 1).padStart(3) + "  " + l).join("\n");

/**
 * @param {{llm:ReturnType<import("./llm.mjs").createLlm>, pruef:Awaited<ReturnType<import("./pruefen.mjs").createPruefstand>>,
 *          rollen:{planer:string,bauer:string,abnahme:string}, effort?:string, now?:()=>number}} deps
 */
export function createPipeline(deps) {
  const PRAEFIX = praefix();
  const now = deps.now || Date.now;
  const effort = deps.effort || "medium";
  const system = (rolle) => [{ type: "text", text: PRAEFIX, cache_control: { type: "ephemeral" } }, { type: "text", text: ROLLEN[rolle] }];

  async function ask(rolle, content, extra, tag) {
    const model = deps.rollen[rolle];
    const req = { max_tokens: extra.max_tokens, system: system(rolle), messages: [{ role: "user", content }], output_config: { effort, ...(extra.schema ? { format: { type: "json_schema", schema: extra.schema } } : {}) } };
    return deps.llm.call({ role: rolle, model, req, tag });
  }

  function auftrag(plan) {
    const ok = plan.haekchen.filter((h) => h.machbar), nein = plan.haekchen.filter((h) => !h.machbar);
    return "Titel: " + plan.titel + "\n\nHaekchenliste (alle umsetzen):\n" + ok.map((h) => "- [" + h.id + "] " + h.punkt).join("\n") +
      (nein.length ? "\n\nNicht machbar (nicht vortaeuschen, nicht als erfuellt darstellen):\n" + nein.map((h) => "- [" + h.id + "] " + h.punkt + " – " + h.grund).join("\n") : "") +
      "\n\nSpielplan:\n" + plan.spielplan;
  }

  /** Bauen bzw. gezielt aendern, dann pruefen und reparieren, bis gruen oder Grenze. */
  async function bauBisGruen(ctx, erstAuftrag, t0) {
    const versuche = [];
    let text = erstAuftrag, code = null, last = null;
    for (let runde = 0; runde <= GRENZEN.reparaturen; runde++) {
      if (now() - t0 > GRENZEN.bauzeitMs) { versuche.push({ runde, abbruch: "bauzeit" }); break; }
      const r = await ask("bauer", text, { max_tokens: GRENZEN.maxTokensBau }, ctx.tag + (runde ? ":rep" + runde : ":bau"));
      const neu = extractCode(r.text);
      const v = { runde, usd: r.usd, ms: r.ms, stop: r.stop, usage: r.usage };
      if (!neu) {
        v.fehlerarten = [r.stop === "max_tokens" ? "format:abgeschnitten" : "format:kein-code"]; v.ok = false; versuche.push(v);
        text = erstAuftrag + "\n\nDeine letzte Antwort enthielt keinen vollstaendigen ```js-Block mit export default. Liefere genau einen vollstaendigen ```js-Block.";
        continue;
      }
      code = neu;
      const p = await deps.pruef.pruefe(code, { name: ctx.tag });
      v.ok = p.ok; v.fehlerarten = errorKinds(p.report, p.policy); v.bots = kurz(p.report); v.policy = p.policy; v.codeBytes = Buffer.byteLength(code);
      if (r.stop === "max_tokens") v.fehlerarten.push("format:abgeschnitten");
      v.code = code;
      versuche.push(v);
      last = { code, report: p.report, policy: p.policy };
      if (p.ok) return { ok: true, code, report: p.report, versuche };
      const notes = repairNotes(p.report, p.policy);
      text = erstAuftrag + "\n\nBisheriger Code:\n```js\n" + code + "```\n\nBefunde der Pruefung:\n" + notes.map((n) => "- " + n).join("\n") +
        "\n\nBehebe alle Befunde, ohne die umgesetzten Haken zu verlieren. Liefere die vollstaendige Datei.";
    }
    return { ok: false, code: last && last.code, report: last && last.report, versuche };
  }

  async function abnahme(ctx, plan, code, report, fotos) {
    const liste = plan.haekchen.filter((h) => h.machbar);
    if (!liste.length) return { punkte: [], nachbessern: "", usd: 0, ms: 0 };
    const b = report.bots || {}, c = report.checks || {};
    const bericht = "Bot-Bericht (je 60 s): controls " + JSON.stringify(report.controls) + ", wirksam " + JSON.stringify((c.inputsEffective || {}).perControl) +
      ", Bestwert Nichtstun/Zufall/Vorausplanung " + ["idle", "random", "greedy"].map((k) => b[k] && b[k].bestScore).join("/") +
      ", Spielenden " + ["idle", "random", "greedy"].map((k) => b[k] && b[k].overs).join("/") + ", Siege " + ["idle", "random", "greedy"].map((k) => b[k] && b[k].wins).join("/") +
      ", hoechstes Level " + Math.max(...["idle", "random", "greedy"].map((k) => (b[k] && b[k].maxLevel) || 1)) +
      (fotos.status ? ". Spielmodus nach Fotos: " + JSON.stringify(fotos.status) : "");
    const content = [
      { type: "text", text: "Wunsch der Person: " + ctx.wunsch + "\n\nHaekchenliste:\n" + liste.map((h) => "- [" + h.id + "] " + h.punkt).join("\n") + "\n\n" + bericht + "\n\nCode mit Zeilennummern:\n```\n" + numbered(code) + "\n```\n\nBildschirmfotos aus dem echten Spiel folgen (nach ca. 1 s und 4 s Zufallseingabe)." },
      ...fotos.shots.map((buf) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: buf.toString("base64") } }))
    ];
    const r = await ask("abnahme", content, { max_tokens: GRENZEN.maxTokensAbnahme, schema: SCHEMA_ABNAHME }, ctx.tag + ":abnahme");
    const j = r.json || { punkte: [], nachbessern: "" };
    // Jeder Haken bekommt genau ein Urteil; fehlende Urteile zaehlen als fehlt (kein stilles Durchwinken).
    const punkte = liste.map((h) => { const u = (j.punkte || []).find((x) => x.id === h.id); return { id: h.id, urteil: u ? u.urteil : "fehlt", beleg: u ? u.beleg : "kein Urteil der Abnahme" }; });
    return { punkte, nachbessern: j.nachbessern || "", usd: r.usd, ms: r.ms, kaputt: !r.json };
  }

  function anzeige(plan, v) {
    if (!v) return null;
    const kann = [], fehlt = [];
    for (const h of plan.haekchen) {
      if (!h.machbar) { fehlt.push({ id: h.id, punkt: h.punkt, grund: h.grund, quelle: "planer" }); continue; }
      const u = v.abnahme.punkte.find((x) => x.id === h.id);
      if (u && u.urteil === "erfuellt") kann.push({ id: h.id, punkt: h.punkt }); else fehlt.push({ id: h.id, punkt: h.punkt, grund: u ? u.beleg : "", quelle: "abnahme" });
    }
    return { ergebnis: "karte", titel: plan.titel, kann, fehlt, hinweise: plan.hinweise || [] };
  }

  async function version(ctx, plan, gebaut, runde) {
    const fotos = await deps.pruef.fotos(gebaut.code, { seed: "p3foto" + runde });
    const ab = await abnahme(ctx, plan, gebaut.code, gebaut.report, fotos);
    return { runde, code: gebaut.code, bots: kurz(gebaut.report), fotos: fotos.shots, fotoStatus: fotos.status, fotoFehler: fotos.errs, abnahme: ab };
  }

  return {
    /**
     * Neue Karte aus einem Wunsch.
     * @param {{id:string, wunsch:string, genre?:string, wer_spielt?:string|null, tag:string}} w
     */
    async neu(w) {
      const t0 = now(), ctx = { wunsch: w.wunsch, tag: w.tag };
      const karte = { id: w.tag, wunsch_id: w.id, rollen: deps.rollen, start: new Date(t0).toISOString(), schritte: [] };
      try {
        const knoepfe = "Knoepfe: " + (GENRE[w.genre] || "Spiel") + (w.wer_spielt ? ", wer spielt: " + w.wer_spielt : "");
        const pr = await ask("planer", "Wunsch: " + w.wunsch + "\n" + knoepfe, { max_tokens: GRENZEN.maxTokensPlan, schema: SCHEMA_PLAN }, w.tag + ":plan");
        karte.schritte.push({ rolle: "planer", usd: pr.usd, ms: pr.ms, stop: pr.stop });
        if (!pr.json) { karte.ende = "plan-kaputt"; karte.anzeige = { ergebnis: "keine_karte", meldung: "Das hat gerade nicht geklappt. Dafuer wird nichts abgebucht." }; return fertig(karte, t0); }
        const plan = pr.json; karte.plan = plan;
        plan.haekchen = (plan.haekchen || []).map((h, i) => ({ ...h, id: h.id || "h" + (i + 1) }));
        if (plan.entscheidung === "absagen") { karte.ende = "abgesagt"; karte.anzeige = { ergebnis: "keine_karte", meldung: plan.absage_grund, hinweise: plan.hinweise || [] }; return fertig(karte, t0); }
        const g = await bauBisGruen(ctx, auftrag(plan), t0);
        karte.versuche = g.versuche;
        if (!g.ok) { karte.ende = "nicht-geschafft"; karte.anzeige = { ergebnis: "keine_karte", meldung: "Das Spiel hat unsere Pruefung nicht bestanden. Wir zeigen kein halb funktionierendes Spiel. Dafuer wird nichts abgebucht.", hinweise: [] }; return fertig(karte, t0); }
        const v = await version(ctx, plan, g, 0);
        karte.versionen = [v]; karte.ende = "geliefert"; karte.anzeige = anzeige(plan, v);
        return fertig(karte, t0);
      } catch (e) {
        if (e instanceof BudgetAbbruch) throw e;
        karte.ende = "fehler"; karte.fehler = String(e.message).slice(0, 300); karte.anzeige = { ergebnis: "keine_karte", meldung: "Das hat gerade nicht geklappt. Dafuer wird nichts abgebucht." };
        return fertig(karte, t0);
      }
    },

    /**
     * Nachbesserung: bestehendes Spiel + Haekchenliste + fehlt-Punkte (+ Kundentext) -> gezielte Reparatur ohne Neubau.
     * Hoechstens GRENZEN.nachbesserungen kostenlos; danach liefert die Funktion { melden: true } (Melden mit Begruendung).
     * Schlaegt die Pruefung fehl, bleibt die alte Version (ehrlich: "Nachbesserung nicht geschafft").
     */
    async nachbessern(karte, { kundentext = "" } = {}) {
      const done = (karte.nachbesserungen || []).length;
      if (done >= GRENZEN.nachbesserungen) return { melden: true, grund: "Drei kostenlose Nachbesserungen sind verbraucht. Du kannst die Karte mit Begruendung melden." };
      const plan = karte.plan, alt = karte.versionen[karte.versionen.length - 1];
      const offen = karte.anzeige.fehlt.filter((f) => f.quelle === "abnahme");
      const t0 = now(), ctx = { wunsch: karte.wunsch, tag: karte.id + ":nb" + (done + 1) };
      const nb = { nr: done + 1, offen_vorher: karte.anzeige.fehlt.length, offen_vorher_abnahme: offen.length, kundentext };
      karte.nachbesserungen = [...(karte.nachbesserungen || []), nb];
      try {
        if (!offen.length && !kundentext) { nb.ergebnis = "nichts-zu-tun"; nb.offen_nachher = karte.anzeige.fehlt.length; return nb; }
        const text = auftrag(plan) + "\n\nBestehendes Spiel (gezielt aendern, nicht neu bauen):\n```js\n" + alt.code + "```\n\nFehlt laut Abnahme:\n" +
          (offen.length ? offen.map((f) => "- [" + f.id + "] " + f.punkt + " – Befund: " + f.grund).join("\n") : "- (keine)") +
          (alt.abnahme.nachbessern ? "\n\nHinweis der Abnahme: " + alt.abnahme.nachbessern : "") +
          "\n\nWunsch der Person zur Nachbesserung: " + (kundentext || "(kein Text, nur die fehlt-Punkte)") +
          "\n\nAendere nur, was fuer diese Punkte noetig ist; alles, was schon geht, bleibt gleich. Liefere die vollstaendige Datei.";
        const g = await bauBisGruen(ctx, text, t0);
        nb.versuche = g.versuche;
        if (!g.ok) { nb.ergebnis = "nicht-geschafft"; nb.offen_nachher = karte.anzeige.fehlt.length; nb.ms = now() - t0; return nb; }
        const v = await version(ctx, plan, g, done + 1);
        karte.versionen.push(v);
        karte.anzeige = anzeige(plan, v);
        nb.ergebnis = "geliefert"; nb.offen_nachher = karte.anzeige.fehlt.length; nb.offen_nachher_abnahme = karte.anzeige.fehlt.filter((f) => f.quelle === "abnahme").length;
        nb.ms = now() - t0;
        return nb;
      } catch (e) {
        if (e instanceof BudgetAbbruch) throw e;
        nb.ergebnis = "fehler"; nb.fehler = String(e.message).slice(0, 300); nb.offen_nachher = karte.anzeige.fehlt.length; return nb;
      }
    }
  };
}

function fertig(karte, t0) { karte.ms = Date.now() - t0; return karte; }

/** Bot-Bericht ohne Zeitreihen (fuer Rohdaten). */
export function kurz(r) {
  if (!r) return null;
  const c = r.checks || {}, b = r.bots || {};
  return {
    ok: r.ok, title: r.title, controls: r.controls, error: r.error || null,
    failed: Object.entries(c).filter(([, v]) => v && v.ok === false).map(([k]) => k),
    perControl: (c.inputsEffective || {}).perControl || null,
    best: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.bestScore])), overs: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.overs])),
    wins: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.wins])), maxLevel: Math.max(1, ...Object.values(b).map((v) => v.maxLevel || 1)),
    p95Ms: (c.performance || {}).p95Ms, wallMs: (r.sandbox || {}).wallMs
  };
}
