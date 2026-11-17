// Freie Karte 2, P3: Bau-Worker. Eigener Prozess bzw. Container, getrennt vom Produktions-Wrapper: hier laeuft fremder
// (vom Modell geschriebener) Code in Playwright, dort nie. Der Worker holt Auftraege aus der internen Warteschlange des
// Wrappers (POST /api/intern/fk2/holen, Bearer-Token aus einer Datei), baut sie mit der Pipeline und meldet das Ergebnis
// (POST /api/intern/fk2/ergebnis). Ueber Abnahme und Guthaben entscheidet dieser Server-Lauf (runGame), nie ein Browser.
//
// Je Auftrag: harte Gesamtzeit GRENZEN.bauzeitMs (AbortSignal), Kostengrenze KOSTEN.jeAuftragUsd unter der Tagesgrenze
// KOSTEN.jeTagUsd. Ist die Tagesgrenze erreicht, holt der Worker nichts mehr bis zum naechsten UTC-Tag.
// Ein Auftrag nach dem anderen (die Bot-Laeufe brauchen die Zeitmessung ohne Parallellast).
import fs from "node:fs";
import { createLedger } from "./llm.mjs";
import { GRENZEN } from "./pipeline.mjs";
import { KOSTEN } from "./konfig.mjs";
import { PAUSE_MS } from "./ki-klasse.mjs";

/** Client der internen Warteschlange. Das Token wird bei jedem Aufruf aus der Datei gelesen (Rotation ohne Neustart). */
export function createQueueClient({ base, tokenFile, fetchImpl = fetch, timeoutMs = 30000 }) {
  const token = () => fs.readFileSync(tokenFile, "utf8").trim();
  async function post(path, body) {
    // feste Frist: ein haengender Wrapper haelt den Worker nicht auf (Review S4)
    const res = await fetchImpl(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, body: json };
  }
  return {
    /** -> Auftrag mit lease, oder null (leer) */
    async holen() {
      const r = await post("/api/intern/fk2/holen", {});
      if (r.status === 204) return null;
      if (r.status !== 200 || !r.body || !r.body.auftrag) throw new Error("holen: HTTP " + r.status);
      return r.body;
    },
    async ergebnis(body) {
      const r = await post("/api/intern/fk2/ergebnis", body);
      if (r.status !== 200) throw Object.assign(new Error("ergebnis: HTTP " + r.status + " " + JSON.stringify(r.body).slice(0, 120)), { status: r.status });
      return r.body;
    }
  };
}

/** Was an den Wrapper geht: nur Ergebnis, Spiel, Plan und Kennzahlen; keine Fotos, keine Belege des Modells. */
export function meldung(job, e) {
  const base = { auftrag: job.auftrag.id, lease: job.lease, art: job.art, ms: e.ms, usd: Math.round(e.usd * 1e6) / 1e6 };
  if (!e.ok) return { ...base, ok: false, grund: e.grund, alt: e.alt === true, ...(e.ki ? { ki: e.ki } : {}) };
  return {
    ...base, ok: true, titel: e.titel, punkte: e.punkte.map((p) => ({ id: p.id, erfuellt: p.erfuellt, notiz: p.notiz, geprueft: p.geprueft })),
    spiel: e.spiel, plan: e.plan, ersetzt: e.ersetzt, versuche: (e.versuche || []).map((v) => ({ runde: v.runde, ok: v.ok, fehlerarten: v.fehlerarten, szenarien: v.szenarien || null }))
  };
}

/**
 * @param {{queue:ReturnType<typeof createQueueClient>, pipeline:ReturnType<import("./pipeline.mjs").createBauPipeline>,
 *          tagesbuch:() => ReturnType<typeof createLedger>, log?:(o:object)=>void, sleep?:(ms:number)=>Promise<void>, bauzeitMs?:number}} o
 */
export function createWorker(o) {
  const log = o.log || ((x) => console.log(JSON.stringify(x)));
  const bauzeitMs = o.bauzeitMs || GRENZEN.bauzeitMs;
  let pauseBis = 0;
  const jetzt = o.now || Date.now;
  /** Einen Auftrag holen und bauen. -> "leer" | "tagesgrenze" | "ki-pause" | "gebaut" */
  async function einmal() {
    if (jetzt() < pauseBis) return "ki-pause";   // nach einer KI-Stoerung keine weiteren Auftraege verbrennen
    const tag = o.tagesbuch();
    if (tag.spent >= tag.cap) return "tagesgrenze";
    const job = await o.queue.holen();
    if (!job) return "leer";
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), bauzeitMs);
    const ledger = createLedger({ cap: KOSTEN.jeAuftragUsd, parent: tag, name: "Auftragsgrenze" });
    const t0 = Date.now();
    let e;
    try { e = job.art === "nachbessern" ? await o.pipeline.nachbessern(job.auftrag, { signal: ac.signal, ledger }) : await o.pipeline.bauen(job.auftrag, { signal: ac.signal, ledger }); }
    finally { clearTimeout(timer); }
    const m = meldung(job, e);
    await o.queue.ergebnis(m);
    if (e.ki) pauseBis = jetzt() + PAUSE_MS[e.ki];
    log({ event: "fk2-bau", art: job.art, ok: e.ok, grund: e.grund || null, ki: e.ki || null, fehlt: e.ok ? e.fehlt : null, ersetzt: e.ersetzt || 0, ms: Date.now() - t0, usd: m.usd });
    return "gebaut";
  }
  return {
    einmal,
    /** Schleife bis signal.aborted; Fehler der Warteschlange werden geloggt, dann wird spaeter neu versucht. */
    async laufen({ signal, pollMs }) {
      const sleep = o.sleep || ((ms) => new Promise((r) => { const t = setTimeout(r, ms); signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); }));
      while (!signal.aborted) {
        let r;
        try { r = await einmal(); } catch (err) { log({ event: "fk2-bau-queue", ok: false, msg: String(err && err.message || err).slice(0, 200) }); r = "fehler"; }
        if (r !== "gebaut") await sleep(r === "tagesgrenze" || r === "ki-pause" ? 60000 : pollMs);
      }
    }
  };
}
