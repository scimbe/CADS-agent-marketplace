// Geraetespeicher (Capability-Broker): je Link-Partie das eigene Salz, die Hashes des zuletzt bekannten Stands, bei
// Snapshot-Karten der eigene oeffentliche Stand (pub, zum Vereinigen) und der Merkzettel der Partie (memo, ADR 0001
// Nachtrag 1). Nie fremde Geheimnisse. Zu grosse Teile werden nicht still gekuerzt, sondern weggelassen; der Empfang
// meldet dann ehrlich „manipuliert/veraltet“.
const PREFIX = "mdi.g.", MAX = 40, MAX_PUB = 16384, MAX_MEMO = 512;
function ls() { try { return globalThis.localStorage || null; } catch (e) { return null; } }
export function createStorage() {
  return {
    ...homeStorage(),
    saveGame(entry) {
      const s = ls(); if (!s) return;
      try {
        // eigener Stand je Partie: Salz (nur eigener Sitz) + Hashes des zuletzt bekannten Logs (Review H1)
        const v = { g: entry.g, seat: entry.seat, salt: entry.salt || null, n: entry.n, lh: entry.lh, bh: entry.bh, k: entry.k, at: Date.now() };
        if (entry.pub !== undefined && JSON.stringify(entry.pub).length <= MAX_PUB) v.pub = entry.pub;
        if (entry.memo !== undefined && (entry.memo === null || JSON.stringify(entry.memo).length <= MAX_MEMO)) v.memo = entry.memo;
        s.setItem(PREFIX + entry.g, JSON.stringify(v));
        const keys = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
        if (keys.length > MAX) keys.map((k) => [k, JSON.parse(s.getItem(k) || "{}").at || 0]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - MAX).forEach(([k]) => s.removeItem(k));
      } catch (e) { /* voller oder gesperrter Speicher: Partie geht dann nur auf diesem Bildschirm weiter */ }
    },
    loadGame(g) {
      const s = ls(); if (!s || !/^[0-9a-f]{16}$/.test(g)) return null;
      try { const v = JSON.parse(s.getItem(PREFIX + g) || "null"); return v && v.g === g ? v : null; } catch (e) { return null; }
    },
    // Konto auf diesem Geraet: Geraete-id (fuer den KI-Zaehler), Mein Stil, Lesen-Einstellungen, Verknuepfung (Konto oder
    // Geraete-Code mit Revision), ein offener Anmeldeversuch. Nie E-Mail, nie Fotos. Pruefen und Bereinigen macht der Aufrufer.
    loadKonto() {
      const s = ls(); if (!s) return null;
      try { const v = JSON.parse(s.getItem(KONTO) || "null"); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch (e) { return null; }
    },
    // Strang K: zuletzt gewaehlte Kategorie/Genre der freien Karte (nur markierter Vorschlag, nie stille Auswahl)
    loadFrei() {
      const s = ls(); if (!s) return null;
      try { const v = JSON.parse(s.getItem(FREI) || "null"); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch (e) { return null; }
    },
    saveFrei(v) {
      const s = ls(); if (!s) return false;
      try { s.setItem(FREI, JSON.stringify({ freiLast: v && v.freiLast })); return true; } catch (e) { return false; }
    },
    saveKonto(v) {
      const s = ls(); if (!s) return false;
      try { s.setItem(KONTO, JSON.stringify(v)); return true; } catch (e) { return false; }
    }
  };
}
const KONTO = "mdi.konto", FREI = "mdi.frei";
// Meins (Strang H): Wand (Werke ohne Fotos), gemerkte Karten, Archiv versendeter Links mit Kurzlink-Token. Pruefen macht der
// Aufrufer (src/ui/home/store.js clean*).
const HOME = "mdi.home.v1";
export function homeStorage() {
  return {
    loadHome() { const s = ls(); if (!s) return null; try { const v = JSON.parse(s.getItem(HOME) || "null"); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch (e) { return null; } },
    saveHome(v) { const s = ls(); if (!s) return false; try { s.setItem(HOME, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
}
