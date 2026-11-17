// Hinweis „Demo – Testinstallation“ und die Seite „Ueber diese Demo“ (Auftrag 17.11.: klar machen, dass es eine
// Testinstallation ist). Reine Funktionen des Zustands wie view.js; Texte in src/app/texts.js (demo).
// Der Hinweis steht im Fluss unter der Kopfzeile, auf jeder Seite, nie ueber dem Inhalt. Er ist ein echter Link auf
// ?go=demo in einem neuen Tab: eine laufende Partie, ein empfangener Link oder ein offener Entwurf bleiben so stehen
// (die Statechart hat keine History, ein Sprung im selben Tab wuerde sie verwerfen).
import { h } from "./dom.js";

export const DEMO_HREF = "?go=demo";

/** Leiste unter der Kopfzeile. Auf der Info-Seite selbst nur der Text (sie ist ja schon offen). */
export function demoBar(X, here) {
  const D = X.demo;
  if (here) return h("div", { class: "demo-bar", key: "demo" }, h("p", { class: "demo-link", "data-demo": "hier" }, h("span", { class: "demo-tag" }, D.bar)));
  return h("div", { class: "demo-bar", key: "demo" },
    h("a", { class: "demo-link", href: DEMO_HREF, target: "_blank", rel: "noopener", "data-act": "demo-info" },
      h("span", { class: "demo-tag" }, D.bar), h("span", { class: "demo-more" }, D.more), h("span", { class: "visually-hidden" }, " " + D.newTab)));
}

function contactLine(D, c) {
  if (!c) return h("p", { key: "c0" }, D.contactNone);
  const href = c.kind === "mail" ? "mailto:" + c.value : c.value;
  return h("p", { key: "c1" }, D.contactIs + " ", h("a", { href, ...(c.kind === "web" ? { target: "_blank", rel: "noopener" } : {}), "data-act": "demo-contact" }, c.value));
}

/** Seite „Ueber diese Demo“ -> { heading, body }. Kontakt nur, wenn der Server einen meldet (Status-API, contact). */
export function demoView(state, X) {
  const D = X.demo, st = state.ctx.konto && state.ctx.konto.st;
  const list = (items, k) => h("ul", { class: "demo-list", key: k }, items.map((t, i) => h("li", { key: String(i) }, t)));
  return {
    heading: D.title,
    body: [h("article", { class: "demo-page", key: "demo-page" },
      h("p", { class: "lede plain", key: "lede" }, D.lede),
      h("h2", { class: "t-title", key: "h-test" }, D.testH), list(D.test, "l-test"),
      h("h2", { class: "t-title", key: "h-data" }, D.dataH), list(D.data, "l-data"),
      h("h2", { class: "t-title", key: "h-contact" }, D.contactH), contactLine(D, st && st.contact))]
  };
}
