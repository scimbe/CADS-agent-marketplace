"""Makes src/noto-stickers.png, the sheet of sticker emoji for the finished picture (src/noto.js, part "noto").

Source: googlefonts/noto-emoji, tag v2026-09-24-unicode18_0, commit e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e,
folder 2D/png/72 (SIL Open Font License 1.1, LICENSE of that commit = licenses/NotoEmoji-OFL.txt).
The downloaded files are untrusted: fetch them into a new, empty folder, then run this script from elsewhere with
python3 -I (Pillow needed). Only the pixels are taken over: each file must decode as a 72x72 image, it is pasted
into the sheet and the sheet is written anew (no metadata, chunks or anything else of the source files).

  C=e20cbc2bbec1926686be9f9bee7d1d2cfa1fea0e; mkdir dl && cd dl
  for k in <KEYS of src/noto.js>; do curl -sfLO https://raw.githubusercontent.com/googlefonts/noto-emoji/$C/2D/png/72/emoji_u$k.png; done
  python3 -I path/to/scripts/noto-sprite.py path/to/dl
"""
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "..", "src", "noto.js"), encoding="utf-8").read()
KEYS = re.findall(r'"([0-9a-f_]+)"', re.search(r"var KEYS = \[([^\]]*)\]", SRC).group(1))
TILE, PAD, COLS = (int(re.search(r"\b%s = (\d+)" % n, SRC).group(1)) for n in ("TILE", "PAD", "COLS"))
CELL = TILE + 2 * PAD


def main(folder):
    rows = (len(KEYS) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for i, k in enumerate(KEYS):
        with Image.open(os.path.join(folder, "emoji_u%s.png" % k)) as im:
            if im.format != "PNG" or im.size != (TILE, TILE):
                raise SystemExit("unexpected file for %s: %s %s" % (k, im.format, im.size))
            tile = im.convert("RGBA")
        sheet.paste(tile, ((i % COLS) * CELL + PAD, (i // COLS) * CELL + PAD))
    out = os.path.join(HERE, "..", "src", "noto-stickers.png")
    # 256 colours for the whole sheet: about a third of the size, hardly visible at sticker size.
    sheet.quantize(256, method=Image.Quantize.FASTOCTREE).save(out, "PNG", optimize=True)
    print(out, os.path.getsize(out), "bytes,", len(KEYS), "emoji")


if __name__ == "__main__":
    main(sys.argv[1])
