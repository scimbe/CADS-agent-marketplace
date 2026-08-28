"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { exec } = require("../util/exec");
const { isValidPng } = require("../util/pngCheck");

const MMDC_BIN = path.join(__dirname, "..", "..", "node_modules", ".bin", "mmdc");
const PUPPETEER_CONFIG = path.join(__dirname, "..", "..", "config", "puppeteer-config.json");
const RENDER_TIMEOUT_MS = 60000; // Chromium cold-start is slow — verified needed on this host.

// A real stack-trace frame looks like "...(file:line:col)" — e.g.
//   "    at #evaluate (file:///.../ExecutionContext.js:402:19)"
//   "Parser.parseError (https://.../chunk-6HLVECFW.mjs:1523:21)"
// Neither the parse-error message, the source snippet line, nor the "^" caret line that
// mmdc prints ever contain a ":<digits>:<digits>)" sequence, so cutting at the first line
// that does reliably separates the human-readable error from the JS stack trace, without
// depending on exact indentation (verified against a live capture — see mermaidRenderer.test.js
// for the frozen sample).
const STACK_FRAME_RE = /:\d+:\d+\)/;

function extractMermaidError(stderr) {
  const lines = String(stderr ?? "").split("\n");
  let cut = lines.findIndex((line) => STACK_FRAME_RE.test(line));
  if (cut === -1) cut = lines.length;
  return lines
    .slice(0, cut)
    .join("\n")
    .trim();
}

async function isAvailable() {
  return fs.existsSync(MMDC_BIN);
}

/**
 * render(dslSource, outImagePath) -> Promise<{ok:true, imagePath} | {ok:false, error}>
 * Writes dslSource to a temp .mmd file, runs mmdc against it, and reports the outcome.
 * Detection is by exit code + output-file validity, NOT by stdout — mmdc always prints
 * "Generating single mermaid chart" to stdout regardless of success or failure (verified
 * live on this host).
 */
async function render(dslSource, outImagePath) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "diagram-mmd-"));
  const tmpDsl = path.join(tmpDir, `${randomUUID()}.mmd`);
  try {
    await fs.promises.writeFile(tmpDsl, dslSource, "utf8");

    const { stderr, exitCode } = await exec(
      MMDC_BIN,
      ["-i", tmpDsl, "-o", outImagePath, "-p", PUPPETEER_CONFIG],
      { timeoutMs: RENDER_TIMEOUT_MS }
    );

    if (exitCode === null) {
      return { ok: false, error: `mmdc binary not found or failed to start: ${stderr}` };
    }
    if (exitCode !== 0 || !isValidPng(outImagePath)) {
      const error = extractMermaidError(stderr) || `mmdc exited with code ${exitCode}`;
      return { ok: false, error };
    }
    return { ok: true, imagePath: outImagePath };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  name: "Mermaid (mmdc)",
  engine: "mermaid",
  fileExtension: ".mmd",
  isAvailable,
  render,
  extractMermaidError, // exported for direct unit testing
};
