"""
Offline augmentation for small YOLO datasets.
Bachelor's Thesis — AR Recognition of Electrical Panels

Applies: brightness variation, motion blur, perspective warp,
         Gaussian noise, and horizontal flip.

Handles both YOLO detection labels (5 values) and segmentation
labels (polygon with many points). Label files are automatically
transformed for spatial augmentations and copied for pixel-only ones.

Usage:
  python augment.py --input_dir AR-electrical-panels-1/train/images \\
                    --output_dir augmented/train --multiplier 10
"""

import argparse
import os
import random
import shutil
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Label I/O
# ---------------------------------------------------------------------------

def load_labels(label_path: str) -> list:
    """Return list of rows; each row is [class_id, coord, coord, ...]."""
    labels = []
    if not os.path.exists(label_path):
        return labels
    with open(label_path) as f:
        for line in f:
            parts = line.strip().split()
            if parts:
                row = [int(parts[0])] + [float(v) for v in parts[1:]]
                labels.append(row)
    return labels


def save_labels(label_path: str, labels: list) -> None:
    with open(label_path, "w") as f:
        for row in labels:
            nums = [str(row[0])] + [f"{v:.6f}" for v in row[1:]]
            f.write(" ".join(nums) + "\n")


def find_label_path(img_path: str) -> str:
    """Locate the .txt label for an image (same dir or sibling labels/ dir)."""
    p = Path(img_path)
    same_dir = p.with_suffix(".txt")
    if same_dir.exists():
        return str(same_dir)
    # YOLO dataset structure: images/ → labels/
    sibling = Path(str(p.parent).replace("images", "labels")) / (p.stem + ".txt")
    return str(sibling)


# ---------------------------------------------------------------------------
# Label geometry helpers
# ---------------------------------------------------------------------------

def _is_detection(coords: list) -> bool:
    """True if label is detection format (x_c, y_c, w, h) — 4 values."""
    return len(coords) == 4


def _det_to_corners(xc, yc, bw, bh):
    """Detection bbox → 4 corner points (normalised)."""
    x1, y1 = xc - bw / 2, yc - bh / 2
    x2, y2 = xc + bw / 2, yc + bh / 2
    return np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)


def _corners_to_det(pts):
    """4 corner points → detection bbox (x_c, y_c, w, h)."""
    x_min, y_min = pts[:, 0].min(), pts[:, 1].min()
    x_max, y_max = pts[:, 0].max(), pts[:, 1].max()
    return [(x_min + x_max) / 2, (y_min + y_max) / 2,
            x_max - x_min, y_max - y_min]


def _warp_points(pts_norm: np.ndarray, M: np.ndarray,
                 img_w: int, img_h: int) -> np.ndarray:
    """Apply homography M to normalised (x,y) points; return normalised."""
    px = pts_norm * np.array([img_w, img_h], dtype=np.float32)
    ph = np.hstack([px, np.ones((len(px), 1), dtype=np.float32)])
    pw = (M @ ph.T).T
    px2 = pw[:, :2] / np.maximum(pw[:, 2:3], 1e-8)
    return np.clip(px2 / np.array([img_w, img_h], dtype=np.float32), 0.0, 1.0)


def transform_labels_perspective(labels: list, M: np.ndarray,
                                  img_w: int, img_h: int) -> list:
    out = []
    for row in labels:
        cls, coords = row[0], row[1:]
        if _is_detection(coords):
            corners = _det_to_corners(*coords)
            warped = _warp_points(corners, M, img_w, img_h)
            out.append([cls] + _corners_to_det(warped))
        else:
            pts = np.array(coords, dtype=np.float32).reshape(-1, 2)
            warped = _warp_points(pts, M, img_w, img_h)
            out.append([cls] + warped.flatten().tolist())
    return out


def transform_labels_flip(labels: list) -> list:
    out = []
    for row in labels:
        cls, coords = row[0], row[1:]
        new_coords = [1.0 - v if i % 2 == 0 else v for i, v in enumerate(coords)]
        out.append([cls] + new_coords)
    return out


# ---------------------------------------------------------------------------
# Augmentation functions  (img: BGR ndarray, labels: list)
# ---------------------------------------------------------------------------

def aug_brightness(img: np.ndarray, labels: list):
    """Scale pixel brightness by a random factor in [0.3, 1.8]."""
    factor = random.uniform(0.3, 1.8)
    img = np.clip(img.astype(np.float32) * factor, 0, 255).astype(np.uint8)
    return img, labels  # labels unchanged


def aug_motion_blur(img: np.ndarray, labels: list):
    """Apply directional motion blur with random angle and kernel size."""
    k = random.choice([5, 7, 9, 11, 15])
    angle = random.uniform(0, 360)
    kernel = np.zeros((k, k), dtype=np.float32)
    kernel[k // 2, :] = 1.0
    M_rot = cv2.getRotationMatrix2D((k / 2, k / 2), angle, 1)
    kernel = cv2.warpAffine(kernel, M_rot, (k, k))
    total = kernel.sum()
    if total > 0:
        kernel /= total
    img = cv2.filter2D(img, -1, kernel)
    return img, labels  # labels unchanged


def aug_gaussian_noise(img: np.ndarray, labels: list):
    """Add zero-mean Gaussian noise with a random standard deviation."""
    std = random.uniform(5.0, 30.0)
    noise = np.random.normal(0, std, img.shape).astype(np.float32)
    img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    return img, labels  # labels unchanged


def aug_horizontal_flip(img: np.ndarray, labels: list):
    """Flip image horizontally and mirror all label x-coordinates."""
    img = cv2.flip(img, 1)
    labels = transform_labels_flip(labels)
    return img, labels


def aug_perspective(img: np.ndarray, labels: list, strength: float = 0.08):
    """Apply a random perspective warp and update label coordinates."""
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    perturb = strength * min(w, h)
    dst = (src + np.random.uniform(-perturb, perturb, src.shape)).astype(np.float32)
    dst[:, 0] = np.clip(dst[:, 0], 0, w)
    dst[:, 1] = np.clip(dst[:, 1], 0, h)
    M, _ = cv2.findHomography(src, dst)
    if M is None:
        return img, labels
    warped = cv2.warpPerspective(img, M, (w, h))
    new_labels = transform_labels_perspective(labels, M, w, h)
    return warped, new_labels


# ---------------------------------------------------------------------------
# Full augmentation pipeline (one version per call)
# ---------------------------------------------------------------------------

def augment_once(img: np.ndarray, labels: list) -> tuple:
    """
    Apply all augmentations with independent random probabilities.
    Brightness is always applied; spatial/pixel augmentations are probabilistic.
    """
    img, labels = aug_brightness(img, labels)

    if random.random() < 0.75:
        img, labels = aug_motion_blur(img, labels)

    if random.random() < 0.70:
        img, labels = aug_perspective(img, labels)

    if random.random() < 0.75:
        img, labels = aug_gaussian_noise(img, labels)

    if random.random() < 0.50:
        img, labels = aug_horizontal_flip(img, labels)

    return img, labels


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Offline YOLO dataset augmentation for electrical panel detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--input_dir", required=True,
        help="Directory containing source images (.jpg/.png)",
    )
    parser.add_argument(
        "--output_dir", required=True,
        help="Directory to write augmented images and labels",
    )
    parser.add_argument(
        "--multiplier", type=int, default=10,
        help="Number of augmented copies to generate per source image (default: 10)",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in input_dir.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )

    if not images:
        print(f"[ERROR] No images found in {input_dir}")
        return

    print("=" * 52)
    print("  YOLO Dataset Augmentation")
    print("=" * 52)
    print(f"  Input dir  : {input_dir}")
    print(f"  Output dir : {output_dir}")
    print(f"  Images     : {len(images)}")
    print(f"  Multiplier : {args.multiplier}×")
    print(f"  Total out  : ~{len(images) * (args.multiplier + 1)} images")
    print()

    total_generated = 0

    for img_path in images:
        img = cv2.imread(str(img_path))
        if img is None:
            print(f"  [SKIP] Cannot read {img_path.name}")
            continue

        label_path = find_label_path(str(img_path))
        labels = load_labels(label_path)

        # Copy original as-is
        shutil.copy(img_path, output_dir / img_path.name)
        if labels:
            shutil.copy(label_path, output_dir / (img_path.stem + ".txt"))

        # Generate augmented versions
        for i in range(args.multiplier):
            aug_img, aug_labels = augment_once(
                img.copy(),
                [row[:] for row in labels],
            )
            out_name = f"{img_path.stem}_aug{i:03d}"
            cv2.imwrite(str(output_dir / f"{out_name}.jpg"), aug_img,
                        [cv2.IMWRITE_JPEG_QUALITY, 92])
            if aug_labels:
                save_labels(str(output_dir / f"{out_name}.txt"), aug_labels)
            total_generated += 1

        print(f"  {img_path.name}  →  {args.multiplier} variants")

    print()
    print(f"[DONE] {total_generated} augmented images written to {output_dir}")


if __name__ == "__main__":
    main()
