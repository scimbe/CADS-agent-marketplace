"use strict";

const mermaidRenderer = require("./mermaidRenderer");
const graphvizRenderer = require("./graphvizRenderer");

const REGISTRY = {
  mermaid: mermaidRenderer,
  graphviz: graphvizRenderer,
};

/**
 * getRenderer(engine) -> RendererAdapter
 * Throws a plain Error listing valid engine names if `engine` isn't registered.
 */
function getRenderer(engine) {
  const adapter = REGISTRY[engine];
  if (!adapter) {
    throw new Error(
      `getRenderer: unknown engine "${engine}" (valid: ${Object.keys(REGISTRY).join(", ")})`
    );
  }
  return adapter;
}

module.exports = { getRenderer, REGISTRY };
