#!/usr/bin/env python3
"""Render the extension's toolbar and store icons.

Draws the same command-prompt mark the page uses for its favicon, so the
extension and the home page read as one thing. The shapes are supersampled 8x
and scaled down, which is what keeps the chevron clean at 16px.

    pip install Pillow
    cd extension && python3 build-icons.py

The PNGs are committed; this only needs running if the mark changes.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT_DIR = Path(__file__).resolve().parent / "icons"
SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 8

BACKGROUND = "#0a0606"
MARK = "#e0362b"
ACCENT = "#ff8552"

# The mark from index.html on its 64x64 grid: a chevron drawn as a round-capped
# stroke, plus the cursor block. Pillow has no round line caps, so the ends are
# capped with circles by hand.
CHEVRON = [(19, 21), (32, 32), (19, 43)]
CHEVRON_WIDTH = 7
CURSOR = (35, 37, 49, 43.5)  # x0, y0, x1, y1
CURSOR_RADIUS = 3.25
GRID = 64
CORNER_RADIUS = 14  # matches the favicon's rx


def render(size: int) -> Image.Image:
    canvas = size * SUPERSAMPLE
    scale = canvas / GRID

    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (0, 0, canvas - 1, canvas - 1),
        radius=CORNER_RADIUS * scale,
        fill=BACKGROUND,
    )
    points = [(x * scale, y * scale) for x, y in CHEVRON]
    draw.line(points, fill=MARK, width=round(CHEVRON_WIDTH * scale), joint="curve")
    radius = CHEVRON_WIDTH * scale / 2
    for x, y in (points[0], points[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=MARK)

    x0, y0, x1, y1 = (v * scale for v in CURSOR)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=CURSOR_RADIUS * scale, fill=ACCENT)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        render(size).save(path, "PNG", optimize=True)
        print(f"{path.name:<14} {path.stat().st_size:>6,} bytes")


if __name__ == "__main__":
    main()
