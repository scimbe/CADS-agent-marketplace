"use strict";

const { execFile } = require("child_process");

const MAX_BUFFER = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

class ExecTimeoutError extends Error {}

/**
 * exec(cmd, args, { cwd, timeoutMs = 30000 } = {})
 *   -> Promise<{ stdout: string, stderr: string, exitCode: number | null }>
 *
 * Never rejects on a nonzero exit — mmdc/dot both use nonzero exit to mean
 * "syntax error in the DSL", not "tool broken".
 *   - process ran, exited nonzero  -> resolves { stdout, stderr, exitCode: <that code> }
 *   - spawn failure (binary not found, error.code === "ENOENT")
 *                                  -> resolves { stdout: "", stderr: error.message, exitCode: null }
 *   - genuine timeout (error.killed === true)
 *                                  -> REJECTS with ExecTimeoutError
 *
 * Copied verbatim from CADS-DEMO-codereview's src/util/exec.js (already
 * correctness-hardened: fail-fast env validation upstream, execFile-based, no shell).
 */
function exec(cmd, args = [], opts = {}) {
  const { cwd, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 });
          return;
        }

        if (error.killed) {
          reject(new ExecTimeoutError(`${cmd} timed out after ${timeoutMs}ms`));
          return;
        }

        if (error.code === "ENOENT") {
          resolve({ stdout: "", stderr: error.message, exitCode: null });
          return;
        }

        // Nonzero exit — this is a normal outcome for the tools this wraps.
        const exitCode = typeof error.code === "number" ? error.code : (error.errno ?? null);
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode });
      }
    );
  });
}

module.exports = { exec, ExecTimeoutError };
