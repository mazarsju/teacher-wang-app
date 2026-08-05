#!/usr/bin/env python3
"""Post-process a DiceBear Notionists SVG: circular colored background + clip.

Matches frontend/src/assets/avatars/teacher.svg:
- Keep character defs/<use> unchanged
- Replace rectangular clipPath with a full-viewBox circle
- Insert a filled background circle behind the clipped character group
- Drop geometry outside the circle via the clipPath
"""

from __future__ import annotations

import argparse
import colorsys
import random
import re
import sys
from pathlib import Path


HEX_RE = re.compile(r"^#?[0-9A-Fa-f]{6}$")
VIEWBOX_RE = re.compile(
    r'viewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"'
)
CLIP_RECT_RE = re.compile(
    r'(<clipPath\b[^>]*>)\s*<rect\b[^/]*/>\s*(</clipPath>)',
    re.IGNORECASE,
)
CLIP_CIRCLE_RE = re.compile(
    r'(<clipPath\b[^>]*>)\s*<circle\b[^/]*/>\s*(</clipPath>)',
    re.IGNORECASE,
)
DEFS_CLOSE_RE = re.compile(r"</defs>", re.IGNORECASE)
BG_CIRCLE_RE = re.compile(
    r'<circle\b[^>]*\bfill="(#[0-9A-Fa-f]{6})"[^>]*/?>',
    re.IGNORECASE,
)


def normalize_hex(color: str) -> str:
    color = color.strip()
    if not HEX_RE.match(color):
        raise ValueError(f"Invalid hex color: {color!r} (expected #RRGGBB)")
    if not color.startswith("#"):
        color = f"#{color}"
    return color.lower()


def random_pastel_hex(rng: random.Random) -> str:
    """Soft saturated pastels similar to teacher.svg's #dbeafe."""
    h = rng.random()
    s = rng.uniform(0.35, 0.55)
    l = rng.uniform(0.78, 0.90)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def parse_viewbox(svg: str) -> tuple[float, float, float, float]:
    match = VIEWBOX_RE.search(svg)
    if not match:
        raise ValueError("SVG is missing a viewBox attribute")
    return tuple(float(x) for x in match.groups())  # type: ignore[return-value]


def apply_circle_background(
    svg: str,
    *,
    fill: str,
    width: int | None = 512,
    height: int | None = 512,
) -> str:
    fill = normalize_hex(fill)
    min_x, min_y, vb_w, vb_h = parse_viewbox(svg)
    cx = min_x + vb_w / 2
    cy = min_y + vb_h / 2
    # Full inscribed circle for square Notionists canvases (1744×1744).
    radius = min(vb_w, vb_h) / 2

    def fmt(n: float) -> str:
        return str(int(n)) if n == int(n) else f"{n:g}"

    circle = (
        f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(radius)}"/>'
    )
    bg = (
        f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(radius)}" fill="{fill}"/>'
    )

    if CLIP_RECT_RE.search(svg):
        svg = CLIP_RECT_RE.sub(rf"\1{circle}\2", svg, count=1)
    elif CLIP_CIRCLE_RE.search(svg):
        svg = CLIP_CIRCLE_RE.sub(rf"\1{circle}\2", svg, count=1)
    else:
        raise ValueError("SVG has no clipPath with rect/circle to convert")

    # Remove a previous background circle immediately after </defs>, if any.
    svg = re.sub(
        r"(</defs>)\s*<circle\b[^>]*\bfill=\"#[0-9A-Fa-f]{6}\"[^>]*/?>\s*",
        r"\1",
        svg,
        count=1,
        flags=re.IGNORECASE,
    )

    if not DEFS_CLOSE_RE.search(svg):
        raise ValueError("SVG is missing </defs>")
    svg = DEFS_CLOSE_RE.sub(f"</defs>{bg}", svg, count=1)

    # Optional display size like teacher.svg (does not change character paths).
    if width is not None and height is not None:
        if re.search(r"\bwidth=", svg):
            svg = re.sub(r'\bwidth="[^"]*"', f'width="{width}"', svg, count=1)
        else:
            svg = svg.replace("<svg ", f'<svg width="{width}" height="{height}" ', 1)
        if re.search(r"\bheight=", svg):
            svg = re.sub(r'\bheight="[^"]*"', f'height="{height}"', svg, count=1)

    return svg


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Add a circular colored background to a DiceBear Notionists SVG."
    )
    parser.add_argument("input", type=Path, help="Source SVG (DiceBear download)")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output path (default: overwrite input)",
    )
    parser.add_argument(
        "--color",
        help="Background fill as #RRGGBB. If omitted, a random pastel is chosen.",
    )
    parser.add_argument(
        "--seed",
        help="Optional RNG seed for reproducible random colors.",
    )
    parser.add_argument(
        "--no-size",
        action="store_true",
        help="Do not set width/height=\"512\" on the root <svg>.",
    )
    args = parser.parse_args()

    src = args.input.read_text(encoding="utf-8")
    rng = random.Random(args.seed)
    fill = normalize_hex(args.color) if args.color else random_pastel_hex(rng)

    out_svg = apply_circle_background(
        src,
        fill=fill,
        width=None if args.no_size else 512,
        height=None if args.no_size else 512,
    )
    dest = args.output or args.input
    dest.write_text(out_svg, encoding="utf-8")
    print(f"Wrote {dest}")
    print(f"backgroundColor={fill}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 — CLI surface
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1)
