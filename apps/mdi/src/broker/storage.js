// Geraetespeicher (Capability-Broker): nur das eigene Salz je Link-Partie. Nie fremde Geheimnisse, nie Spielinhalte.
const PREFIX = "mdi.g.", MAX = 40;
function ls() { try { return globalThis.localStorage || null; } catch (e) { return null; } }
export function createStorage() {
  return {
    saveGame(entry) {
      const s = ls(); if (!s) return;
      try {
        // eigener Stand je Partie: Salz (nur eigener Sitz) + Hashes des zuletzt bekannten Logs (Review H1)
        s.setItem(PREFIX + entry.g, JSON.stringify({ g: entry.g, seat: entry.seat, salt: entry.salt || null, n: entry.n, lh: entry.lh, bh: entry.bh, k: entry.k, at: Date.now() }));
        const keys = []; for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
        if (keys.length > MAX) keys.map((k) => [k, JSON.parse(s.getItem(k) || "{}").at || 0]).sort((a, b) => a[1] - b[1]).slice(0, keys.length - MAX).forEach(([k]) => s.removeItem(k));
      } catch (e) { /* voller oder gesperrter Speicher: Partie geht dann nur auf diesem Bildschirm weiter */ }
    },
    loadGame(g) {
      const s = ls(); if (!s || !/^[0-9a-f]{16}$/.test(g)) return null;
      try { const v = JSON.parse(s.getItem(PREFIX + g) || "null"); return v && v.g === g ? v : null; } catch (e) { return null; }
    }
  };
}
