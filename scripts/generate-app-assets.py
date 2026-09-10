#!/usr/bin/env python3
"""Generate replaceable PWA and future Capacitor assets from one transparent icon."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


BACKGROUND = (238, 240, 236, 255)
CARD = (250, 241, 225, 255)


def first_sprite_frame(source: Path) -> Image.Image:
    strip = Image.open(source).convert("RGBA")
    frame_size = strip.height
    return strip.crop((0, 0, frame_size, frame_size))


def square_icon(frame: Image.Image, size: int, maskable: bool = False) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    inset = int(size * (0.12 if maskable else 0.18))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (inset, inset, size - inset, size - inset),
        radius=int(size * 0.18),
        fill=CARD,
    )
    pet_size = int(size * (0.68 if maskable else 0.62))
    pet = frame.resize((pet_size, pet_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(pet, ((size - pet_size) // 2, (size - pet_size) // 2 + int(size * 0.025)))
    return canvas.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("public/pet/idle.png"))
    parser.add_argument("--public-icons", type=Path, default=Path("public/icons"))
    parser.add_argument("--native-assets", type=Path, default=Path("assets"))
    args = parser.parse_args()

    frame = first_sprite_frame(args.source)
    args.public_icons.mkdir(parents=True, exist_ok=True)
    args.native_assets.mkdir(parents=True, exist_ok=True)

    for size, name in ((32, "favicon-32.png"), (180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")):
        square_icon(frame, size).save(args.public_icons / name, optimize=True)
    square_icon(frame, 512, maskable=True).save(args.public_icons / "icon-maskable-512.png", optimize=True)
    square_icon(frame, 1024, maskable=True).save(args.native_assets / "icon.png", optimize=True)

    splash = Image.new("RGB", (2732, 2732), BACKGROUND[:3])
    pet = frame.resize((820, 820), Image.Resampling.LANCZOS)
    splash.paste(pet, ((2732 - 820) // 2, (2732 - 820) // 2), pet)
    splash.save(args.native_assets / "splash.png", optimize=True)


if __name__ == "__main__":
    main()
