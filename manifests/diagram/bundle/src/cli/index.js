"use strict";

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { runGenerateCommand } = require("./generateCommand");

async function main(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case "generate":
      return runGenerateCommand(rest);
    default:
      console.error(
        `diagram-cli: unknown command "${command ?? ""}"\n\n` +
          `Usage:\n` +
          `  diagram-cli generate --description "<text>" [--engine mermaid|graphviz] ` +
          `[--out <path>] [--max-attempts <n>] [--attempts-log <path>]\n` +
          `  diagram-cli generate --description-file <path> [...same flags]`
      );
      return 2;
  }
}

module.exports = { main };
