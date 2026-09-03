#!/usr/bin/env python3
"""Render the extension's toolbar and store icons.

Draws the same house mark the page uses for its favicon, so the extension and
the home page read as one thing. The shapes are supersampled 8x and scaled down,
which is what keeps the roofline clean at 16px.

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

# The favicon path from index.html, flattened to a polygon on its 64x64 grid.
# The 2px corner radii at the bottom of the walls are dropped: they are well
# under a pixel at every size rendered here.
HOUSE = [
    (16, 34), (32, 20), (48, 34), (48, 48), (46, 50),
    (34, 50), (34, 40), (30, 40), (30, 50), (18, 50), (16, 48),
]
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
    draw.polygon([(x * scale, y * scale) for x, y in HOUSE], fill=MARK)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    for size in SIZES:
        path = OUT_DIR / f"icon{size}.png"
        render(size).save(path, "PNG", optimize=True)
        print(f"{path.name:<14} {path.stat().st_size:>6,} bytes")


if __name__ == "__main__":
    main()
