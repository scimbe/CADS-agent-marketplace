"use strict";

const fsp = require("node:fs/promises");

/**
 * Resolves a font ImageMagick's `-annotate` can render text with, without relying on IM having
 * a configured default (see watermark.js/fixtures/generate.js callers for why this exists --
 * live-reproduced 2026-08-29: Homebrew ImageMagick 7 on macOS ships with no default font
 * configured at all, so `-annotate` without an explicit `-font` fails with
 * "unable to read font '' @ RenderFreetype" before any tool logic runs. Linux hosts with
 * fontconfig set up (the environment this demo was originally verified on) don't hit this,
 * which is why it went unnoticed until a second-platform run).
 *
 * Resolution order: an explicit IMAGEMAGICK_FONT env var override, then the first common
 * TrueType font file found at a known path on macOS/Debian/Ubuntu/Fedora/Arch, then a short
 * list of IM "type name" aliases (only work if a type.xml happens to map them -- a weaker,
 * best-effort fallback), then null (caller proceeds without -font, matching prior behavior,
 * so a host that already worked keeps working).
 */
const CANDIDATE_PATHS = [
  // macOS
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/Library/Fonts/Arial.ttf",
  // Debian/Ubuntu
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
  // Fedora/RHEL
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
  // Arch
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
];

const NAME_FALLBACKS = ["DejaVu-Sans-Bold", "Helvetica", "Arial"];

let fontPromise = null;

async function firstExisting(paths) {
  for (const p of paths) {
    try {
      await fsp.access(p);
      return p;
    } catch {
      // not present, try next
    }
  }
  return null;
}

async function detectFont() {
  if (process.env.IMAGEMAGICK_FONT) return process.env.IMAGEMAGICK_FONT;
  const found = await firstExisting(CANDIDATE_PATHS);
  if (found) return found;
  // Best-effort name alias -- only helps if IM's own type.xml already maps one of these;
  // harmless to pass through if not (IM reports the same "unable to read font" it would have
  // without this fallback either way).
  return NAME_FALLBACKS[0];
}

/** resolveFont() -> Promise<string | null>, cached per process. */
function resolveFont() {
  if (!fontPromise) fontPromise = detectFont();
  return fontPromise;
}

/** Test-only escape hatch to force re-detection. */
function _resetFontCache() {
  fontPromise = null;
}

module.exports = { resolveFont, _resetFontCache };
