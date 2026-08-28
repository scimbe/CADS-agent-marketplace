"use strict";

const fs = require("fs");
const path = require("path");
const { createLlmClient } = require("../llm/llmClient");
const { getRenderer } = require("../render/registry");
const { generateAndRender } = require("../engine/retryLoop");

function parseArgs(argv) {
  const opts = { engine: "mermaid", maxAttempts: 3, out: "diagram.png" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--description":
        opts.description = argv[++i];
        break;
      case "--description-file":
        opts.descriptionFile = argv[++i];
        break;
      case "--engine":
        opts.engine = argv[++i];
        break;
      case "--out":
        opts.out = argv[++i];
        break;
      case "--max-attempts":
        opts.maxAttempts = Number(argv[++i]);
        break;
      case "--attempts-log":
        opts.attemptsLog = argv[++i];
        break;
      default:
        throw new Error(`generate: unknown argument "${arg}"`);
    }
  }
  return opts;
}

/**
 * runGenerateCommand(argv, env = process.env) -> Promise<number> (process exit code)
 * Thin CLI wrapper around engine/retryLoop.generateAndRender — parses args, wires up the
 * real llmClient + a real renderer adapter, runs the loop, prints a human-readable summary
 * of every attempt (including the exact renderer error on failed attempts), and optionally
 * writes the full attempt transcript to JSON via --attempts-log.
 */
async function runGenerateCommand(argv, env = process.env) {
  const opts = parseArgs(argv);

  let description = opts.description;
  if (opts.descriptionFile) {
    description = await fs.promises.readFile(opts.descriptionFile, "utf8");
  }
  if (!description || !description.trim()) {
    console.error("generate: --description or --description-file is required");
    return 2;
  }

  const renderer = getRenderer(opts.engine);
  const available = await renderer.isAvailable();
  if (!available) {
    console.error(
      `generate: renderer for engine "${opts.engine}" (${renderer.name}) is not available on this host`
    );
    return 2;
  }

  const llmClient = createLlmClient(env);

  console.log(`Generating a ${opts.engine} diagram (max ${opts.maxAttempts} attempt(s))...`);
  const result = await generateAndRender({
    description,
    engine: opts.engine,
    llmClient,
    renderer,
    outImagePath: opts.out,
    maxAttempts: opts.maxAttempts,
  });

  for (const a of result.attempts) {
    if (a.renderer.ok) {
      console.log(`  attempt ${a.attempt} [${a.promptKind}]: OK -> ${a.renderer.imagePath}`);
    } else {
      console.log(`  attempt ${a.attempt} [${a.promptKind}]: FAILED`);
      console.log(
        a.renderer.error
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n")
      );
    }
  }

  if (opts.attemptsLog) {
    await fs.promises.mkdir(path.dirname(opts.attemptsLog), { recursive: true });
    await fs.promises.writeFile(opts.attemptsLog, JSON.stringify(result, null, 2), "utf8");
    console.log(`Wrote attempt transcript to ${opts.attemptsLog}`);
  }

  if (result.success) {
    console.log(`Success after ${result.attempts.length} attempt(s): ${opts.out}`);
    return 0;
  }
  console.error(`Failed after ${result.attempts.length} attempt(s) — no valid render produced.`);
  return 1;
}

module.exports = { runGenerateCommand, parseArgs };
