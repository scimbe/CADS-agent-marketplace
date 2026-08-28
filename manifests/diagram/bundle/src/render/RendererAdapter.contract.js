"use strict";

/**
 * RendererAdapter contract (documentation-only module — nothing here is imported for
 * behavior, only for the shape it documents).
 *
 * A renderer adapter is a plain object:
 *
 *   {
 *     name: string,            // human-readable, e.g. "Mermaid (mmdc)"
 *     engine: string,          // "mermaid" | "graphviz" — matches registry.js keys
 *     fileExtension: string,   // extension for the temp DSL source file, e.g. ".mmd", ".dot"
 *
 *     isAvailable(): Promise<boolean>
 *       // True if the underlying binary can actually be invoked on this host right now.
 *       // Used to skip/soft-fail engines whose tool isn't installed (e.g. `dot` when
 *       // graphviz wasn't apt-installed) rather than crash.
 *
 *     render(dslSource: string, outImagePath: string): Promise<
 *       | { ok: true, imagePath: string }
 *       | { ok: false, error: string }
 *     >
 *       // Writes dslSource to a temp file, invokes the real deterministic renderer
 *       // binary against it, and either produces a real image at outImagePath (ok:true)
 *       // or returns the renderer's own error text verbatim, trimmed of any stack trace
 *       // (ok:false). Never throws for a syntax error in dslSource — that is an expected,
 *       // ok:false outcome the retry loop is built to handle. May reject/throw only for
 *       // genuinely exceptional conditions (e.g. exec timeout).
 *   }
 */

module.exports = {};
