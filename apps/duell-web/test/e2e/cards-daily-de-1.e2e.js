"use strict";
// The daily catalog card by card, de, half 1 of 2 (lib/katalog.js): one file per catalog, language and half, each well below the 300 s of a file in CI.
const { katalog } = require("./lib/katalog.js");
katalog("daily", "de-DE", 1, 2);
