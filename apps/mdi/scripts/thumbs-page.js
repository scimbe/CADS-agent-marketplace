// Testseite fuer scripts/thumbs.js (wird gebuendelt, nie ausgeliefert): Vorschau jeder Karte mit dem echten Renderer.
import { ORDER, cardOf } from "../src/cards/index.js";
import { defaults } from "../src/contract/fields.js";
import { previewNode } from "../src/app/game.js";
import { render } from "../src/render/render.js";
import { patch } from "../src/ui/dom.js";
import { featureEnv } from "../src/app/features.js";

// dieselben Geraetedienste wie die App (hohe Poster-Ops, Kartenbilder, Bilder), damit Thumbnail = Vorschau
const env = featureEnv(window);

const root = document.getElementById("t"), unknown = [];
window.__thumbs = {
  ready: true, unknown,
  list: () => ORDER.map((id) => ({ id, variants: (cardOf(id).manifest.variants || []).map((v) => v.id) })),
  show(id, variant) {
    const c = cardOf(id), base = defaults(c.manifest.params);
    const v = variant ? (c.manifest.variants || []).find((x) => x.id === variant) : null;
    const node = previewNode(c, v ? { ...base, ...v.params } : base, "de", { today: 20767, thumb: true });
    root.__v = null; while (root.firstChild) root.removeChild(root.firstChild);
    patch(root, [render(node, { onInput: () => {}, disabled: true, idp: "th", lang: "de", high: env.high || null, images: env.images || null, cardSvg: env.cardSvg || null, onUnknown: (t) => unknown.push(t) })]);
  }
};
