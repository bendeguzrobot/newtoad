#!/usr/bin/env python3
"""
Pixel-based dominant color extractor for NewToad scraper.

Usage:
    python3 extract-colors.py <path/to/screenshot.png> [--n-colors 10]

Output:
    JSON array of hex colors to stdout (most dominant first)
    Saves gradient.png in the same directory as the input image
"""

import sys
import json
import os
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.cluster import MiniBatchKMeans


def extract_dominant_colors(image_path: str, n_colors: int = 10) -> list[tuple[int, int, int, float]]:
    """
    Extract dominant colors from an image using KMeans clustering.
    Returns list of (r, g, b, fraction) sorted by frequency descending.
    """
    img = Image.open(image_path).convert("RGB")

    # Downsample large images to speed up clustering
    max_dimension = 400
    w, h = img.size
    if max(w, h) > max_dimension:
        scale = max_dimension / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    pixels = np.array(img).reshape(-1, 3).astype(np.float32)

    # Use MiniBatchKMeans for speed on large pixel arrays
    kmeans = MiniBatchKMeans(n_clusters=n_colors, random_state=42, n_init=3, max_iter=300)
    labels = kmeans.fit_predict(pixels)
    centers = kmeans.cluster_centers_

    # Count pixels per cluster
    counts = np.bincount(labels, minlength=n_colors)
    total = len(labels)

    # Sort by frequency descending
    order = np.argsort(-counts)
    results = []
    for idx in order:
        r, g, b = int(round(centers[idx][0])), int(round(centers[idx][1])), int(round(centers[idx][2]))
        fraction = counts[idx] / total
        results.append((r, g, b, fraction))

    return results


def save_gradient(colors: list[tuple[int, int, int, float]], output_path: str, height: int = 16) -> None:
    """
    Save a horizontal gradient strip where each color band width is proportional to its frequency.
    """
    total_width = 400
    img_data = []

    for r, g, b, fraction in colors:
        band_width = max(1, int(round(fraction * total_width)))
        img_data.append((r, g, b, band_width))

    # Adjust for rounding errors so total == total_width
    actual_width = sum(w for _, _, _, w in img_data)
    if actual_width != total_width and img_data:
        # Adjust the widest band
        diff = total_width - actual_width
        widest_idx = max(range(len(img_data)), key=lambda i: img_data[i][3])
        r, g, b, w = img_data[widest_idx]
        img_data[widest_idx] = (r, g, b, w + diff)

    out_img = Image.new("RGB", (total_width, height))
    x = 0
    for r, g, b, w in img_data:
        for px in range(x, x + w):
            for py in range(height):
                out_img.putpixel((px, py), (r, g, b))
        x += w

    out_img.save(output_path, "PNG")


def to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def main():
    parser = argparse.ArgumentParser(description="Extract dominant colors from a screenshot.")
    parser.add_argument("image_path", help="Path to screenshot.png")
    parser.add_argument("--n-colors", type=int, default=10, help="Number of dominant colors (default: 10)")
    args = parser.parse_args()

    image_path = args.image_path
    n_colors = args.n_colors

    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"File not found: {image_path}"}), file=sys.stderr)
        sys.exit(1)

    colors = extract_dominant_colors(image_path, n_colors=n_colors)

    # Save gradient next to the input image, name derived from screenshot name:
    # screenshot.png → gradient.png, screenshot-nav-0.png → gradient-nav-0.png
    image_dir = os.path.dirname(os.path.abspath(image_path))
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    gradient_name = base_name.replace("screenshot", "gradient") + ".png"
    gradient_path = os.path.join(image_dir, gradient_name)
    save_gradient(colors, gradient_path)

    hex_colors = [to_hex(r, g, b) for r, g, b, _ in colors]
    print(json.dumps(hex_colors))


if __name__ == "__main__":
    main()
