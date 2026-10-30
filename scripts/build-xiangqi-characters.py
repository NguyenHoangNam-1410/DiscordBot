"""Extract the twelve Chinese Xiangqi glyph outlines; Python/fontTools are build-only.

Usage: python scripts/build-xiangqi-characters.py /path/to/NotoSerifCJKtc-Regular.otf
The game reads characters.json directly and never loads a font or Python at runtime.
"""
import hashlib
import json
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

FONT_URL = (
    "https://raw.githubusercontent.com/notofonts/noto-cjk/main/"
    "Serif/OTF/TraditionalChinese/NotoSerifCJKtc-Regular.otf"
)
CHARACTERS = "帥將仕士相象馬車炮砲兵卒"


def number(value):
    return f"{value:.3f}".rstrip("0").rstrip(".") or "0"


def build(font_path):
    font_path = Path(font_path)
    with TTFont(font_path) as font:
        glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
        outlines = {}
        for character in CHARACTERS:
            name = cmap.get(ord(character))
            if not name or name == ".notdef":
                raise ValueError(f"Missing glyph U+{ord(character):04X}")
            path_pen = SVGPathPen(glyphs, ntos=number)
            bounds_pen = BoundsPen(glyphs)
            glyphs[name].draw(path_pen)
            glyphs[name].draw(bounds_pen)
            if bounds_pen.bounds is None:
                raise ValueError("Empty Xiangqi glyph")
            outlines[character] = {
                "bounds": bounds_pen.bounds,
                "path": path_pen.getCommands(),
            }
        return {
            "version": 1,
            "source": {
                "font": font["name"].getDebugName(4),
                "url": FONT_URL,
                "sha256": hashlib.sha256(font_path.read_bytes()).hexdigest(),
                "copyright": font["name"].getDebugName(0),
                "license": "SIL Open Font License 1.1; see OFL.txt",
            },
            "characters": outlines,
        }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    result = build(sys.argv[1])
    target = Path(__file__).resolve().parents[1] / "assets/xiangqi/characters.json"
    if not target.is_file():
        raise SystemExit("Pre-create the output file under the repository owner's account")
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "characters": len(result["characters"]), "bytes": target.stat().st_size}))
