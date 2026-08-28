"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { exec } = require("../util/exec");
const { isValidPng } = require("../util/pngCheck");

const DOT_BIN = "dot";
const RENDER_TIMEOUT_MS = 15000; // No browser involved — much faster than mmdc.

/**
 * KNOWN LIMITATION (documented honestly, not guessed around): graphviz's `dot` binary is
 * NOT installed on the build host this demo was developed on, and installing it requires
 * `sudo apt-get install -y graphviz`, which needs a password this session doesn't have.
 * Because of that, the exact stderr format `dot` produces for a syntax error has NOT been
 * verified live the way mermaidRenderer's format was (see mermaidRenderer.js and
 * fixtures/broken-flow/attempts.log.json for that live verification). Graphviz's error
 * format is well-documented upstream (Graphviz prints e.g.
 * `Error: <file>: syntax error in line <N> near '<token>'` from its own parser, on stderr,
 * nonzero exit, no output file — see https://graphviz.org/doc/info/command.html), and this
 * adapter is written against that documented shape, but treat extractGraphvizError's exact
 * cut points as UNVERIFIED until someone with sudo runs the same live-capture method used
 * for mmdc (write a deliberately broken .dot file, run `dot -Tpng`, capture stderr, adjust
 * the regex to match). isAvailable() honestly reports "no" on hosts without the binary
 * rather than pretending this engine works — the CLI and test suite both skip graphviz
 * gracefully when that's the case; the Mermaid path alone carries the acceptance bar.
 */

// Graphviz's own parser error format (per upstream docs/source, NOT independently
// live-verified on this host — see limitation note above):
//   "Error: <file>: syntax error in line <N> near '<token>'"
// optionally followed by a "context: ...<caret>" pointer line. No JS-style stack trace to
// strip (dot is a C binary), so this only trims whitespace.
function extractGraphvizError(stderr) {
  return String(stderr ?? "").trim();
}

async function isAvailable() {
  const { exitCode } = await exec(DOT_BIN, ["-V"], { timeoutMs: 5000 }).catch(() => ({
    exitCode: null,
  }));
  return exitCode === 0;
}

/**
 * render(dslSource, outImagePath) -> Promise<{ok:true, imagePath} | {ok:false, error}>
 * Writes dslSource to a temp .dot file, runs `dot -Tpng` against it.
 */
async function render(dslSource, outImagePath) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "diagram-dot-"));
  const tmpDot = path.join(tmpDir, `${randomUUID()}.dot`);
  try {
    await fs.promises.writeFile(tmpDot, dslSource, "utf8");

    const { stderr, exitCode } = await exec(DOT_BIN, ["-Tpng", "-o", outImagePath, tmpDot], {
      timeoutMs: RENDER_TIMEOUT_MS,
    });

    if (exitCode === null) {
      return {
        ok: false,
        error: `dot binary not found on PATH (graphviz not installed): ${stderr}`,
      };
    }
    if (exitCode !== 0 || !isValidPng(outImagePath)) {
      const error = extractGraphvizError(stderr) || `dot exited with code ${exitCode}`;
      return { ok: false, error };
    }
    return { ok: true, imagePath: outImagePath };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  name: "Graphviz (dot)",
  engine: "graphviz",
  fileExtension: ".dot",
  isAvailable,
  render,
  extractGraphvizError,
};
