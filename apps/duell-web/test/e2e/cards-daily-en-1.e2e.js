"use strict";
// The daily catalog card by card, en, half 1 of 2 (lib/katalog.js): one file per catalog, language and half, each well below the 300 s of a file in CI.
const { katalog } = require("./lib/katalog.js");
katalog("daily", "en-US", 1, 2);
