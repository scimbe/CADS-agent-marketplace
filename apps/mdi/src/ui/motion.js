// Bewegung: FLIP (First, Last, Invert, Play; P. Lewis 2015) fuer den Dialog, der aus der Blase waechst und dorthin
// zurueckschrumpft. prefers-reduced-motion -> nur Blende. Nur Darstellung; der Zustand liegt in der Statechart.
export function reduced() { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } }
const MS = 240, EASE = "cubic-bezier(.2,.8,.2,1)";

function invert(from, to) {
  const sx = from.width / Math.max(1, to.width), sy = from.height / Math.max(1, to.height);
  return "translate(" + (from.left - to.left) + "px," + (from.top - to.top) + "px) scale(" + sx + "," + sy + ")";
}
export function grow(dialog, fromRect) {
  if (!dialog.animate) return;
  if (reduced() || !fromRect) { dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); return; }
  const to = dialog.getBoundingClientRect();
  dialog.style.setProperty("transform-origin", "0 0");
  dialog.animate([{ transform: invert(fromRect, to), opacity: 0.4 }, { transform: "none", opacity: 1 }], { duration: MS, easing: EASE });
}
/** Schrumpfen: eine inerte Kopie des alten Dialogs fliegt zur Blase; das Original ist schon weg. */
export function shrink(oldDialog, oldRect, toRect) {
  if (!oldDialog || !oldRect || !document.body.animate) return;
  const ghost = oldDialog.cloneNode(true);
  ghost.removeAttribute("style"); ghost.setAttribute("aria-hidden", "true"); ghost.setAttribute("inert", ""); ghost.removeAttribute("id"); ghost.removeAttribute("role");
  ghost.classList.add("ghost");
  for (const [k, v] of [["position", "fixed"], ["left", oldRect.left + "px"], ["top", oldRect.top + "px"], ["width", oldRect.width + "px"], ["height", oldRect.height + "px"], ["margin", "0"], ["transform-origin", "0 0"], ["pointer-events", "none"]]) ghost.style.setProperty(k, v);
  document.body.appendChild(ghost);
  const frames = reduced() || !toRect ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "none", opacity: 1 }, { transform: invert(toRect, oldRect), opacity: 0 }];
  const a = ghost.animate(frames, { duration: reduced() ? 100 : 200, easing: EASE });
  a.onfinish = a.oncancel = () => ghost.remove();
}
