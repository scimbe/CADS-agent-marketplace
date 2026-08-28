"use strict";

const fs = require("fs");

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * isValidPng(path) -> boolean
 * Checks the file exists, is nonzero size, and its first 8 bytes match the PNG magic
 * number. Deliberately cheap and dependency-free — this is a smoke check that the
 * renderer actually wrote real image bytes, not a full PNG validator.
 */
function isValidPng(path) {
  let stat;
  try {
    stat = fs.statSync(path);
  } catch {
    return false;
  }
  if (!stat.isFile() || stat.size === 0) return false;

  const fd = fs.openSync(path, "r");
  try {
    const header = Buffer.alloc(8);
    const bytesRead = fs.readSync(fd, header, 0, 8, 0);
    return bytesRead === 8 && header.equals(PNG_MAGIC);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { isValidPng, PNG_MAGIC };
