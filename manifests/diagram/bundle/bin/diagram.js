#!/usr/bin/env node
"use strict";

const { main } = require("../src/cli/index");

main(process.argv.slice(2))
  .then((code) => process.exit(typeof code === "number" ? code : 0))
  .catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
