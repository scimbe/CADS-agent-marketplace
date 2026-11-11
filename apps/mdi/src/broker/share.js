// Teilen (Capability-Broker): Systemblatt, wenn vorhanden (plattformtreu), sonst Zwischenablage. Kein Server.
// Ergebnis: "shared" | "copied" | false.
export async function copy(url) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); return true; } } catch (e) { /* kein Zugriff */ }
  return false;
}
export async function share(url, title) {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ url, title }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return false; }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(url); return "copied"; } } catch (e) { /* kein Zugriff */ }
  return false;
}
/** Datei auf dem Geraet speichern („Daten herunterladen“): JSON als Blob, kein Server. */
export function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
