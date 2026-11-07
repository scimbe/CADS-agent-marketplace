"use strict";
// The business catalog card by card, de and en (lib/katalog.js): one file per catalog and language, each well below the 300 s of a file in CI.
const { katalog } = require("./lib/katalog.js");
katalog("business", "de-DE");
katalog("business", "en-US");
