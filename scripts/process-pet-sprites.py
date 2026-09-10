#!/usr/bin/env python3
"""Split the supplied 8x11 JPEG atlas into transparent, aligned PNG strips."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


ANIMATIONS = [
    ("idle", 6),
    ("running-right", 8),
    ("running-left", 8),
    ("waving", 4),
    ("jumping", 5),
    ("failed", 8),
    ("waiting", 6),
    ("running", 6),
    ("review", 6),
    ("look-000-157_5", 8),
    ("look-180-337_5", 8),
]

ROW_BANDS = [
    (24, 140),
    (164, 279),
    (304, 419),
    (443, 559),
    (583, 698),
    (723, 838),
    (862, 977),
    (1002, 1117),
    (1141, 1257),
    (1281, 1396),
    (1421, 1536),
]

X_EDGES = [0, 106, 212, 319, 425, 532, 638, 744, 851]
CELL_SIZE = 128


def connected_background(rgb: np.ndarray) -> np.ndarray:
    high = rgb.max(axis=2)
    low = rgb.min(axis=2)
    candidate = (low > 178) & ((high - low) < 34)
    height, width = candidate.shape
    mask = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if candidate[0, x]:
            queue.append((0, x))
        if candidate[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if candidate[y, 0]:
            queue.append((y, 0))
        if candidate[y, width - 1]:
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if mask[y, x] or not candidate[y, x]:
            continue
        mask[y, x] = True
        if y:
            queue.append((y - 1, x))
        if y + 1 < height:
            queue.append((y + 1, x))
        if x:
            queue.append((y, x - 1))
        if x + 1 < width:
            queue.append((y, x + 1))

    return mask


def make_frame(source: Image.Image, row: int, column: int) -> Image.Image:
    top, bottom = ROW_BANDS[row]
    left = X_EDGES[column]
    right = X_EDGES[column + 1]
    crop = source.crop((left + 2, top + 1, right - 2, bottom - 1)).convert("RGBA")
    pixels = np.array(crop)
    background = connected_background(pixels[:, :, :3])
    pixels[background, 3] = 0

    # Frame indices live only in the upper-left corner and are not artwork.
    pixels[:16, :14, 3] = 0
    # Remove any compressed remnants of the source grid at cell edges.
    pixels[:4, :, 3] = 0
    pixels[-4:, :, 3] = 0
    pixels[:, :4, 3] = 0
    pixels[:, -4:, 3] = 0
    frame = Image.fromarray(pixels, "RGBA")
    canvas = Image.new("RGBA", (CELL_SIZE, CELL_SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(frame, ((CELL_SIZE - frame.width) // 2, (CELL_SIZE - frame.height) // 2))
    return canvas


def save_strip(frames: list[Image.Image], destination: Path) -> None:
    strip = Image.new("RGBA", (CELL_SIZE * len(frames), CELL_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * CELL_SIZE, 0))
    strip.save(destination, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    source = Image.open(args.source).convert("RGB")
    if source.size != (851, 1536):
        raise ValueError(f"Unexpected source size: {source.size}")
    args.output.mkdir(parents=True, exist_ok=True)

    rows: list[list[Image.Image]] = []
    for row_index, (name, frame_count) in enumerate(ANIMATIONS):
        frames = [make_frame(source, row_index, column) for column in range(frame_count)]
        rows.append(frames)
        save_strip(frames, args.output / f"{name}.png")

    save_strip(rows[9] + rows[10], args.output / "look.png")


if __name__ == "__main__":
    main()
