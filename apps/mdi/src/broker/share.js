// Teilen (Capability-Broker): Systemblatt, wenn vorhanden (plattformtreu), sonst Zwischenablage. Kein Server.
// Ergebnis: "shared" | "copied" | false.
export async function share(url, title) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ url, title }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return false; }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); return "copied"; } } catch (e) { /* kein Zugriff */ }
  return false;
}
