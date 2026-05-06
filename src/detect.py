"""
AR Recognition of Electrical Panels for Safety Warnings
Bachelor's Thesis — detect.py

Usage:
  python src/detect.py                                        # Live webcam (camera 0)
  python src/detect.py --source image.jpg                     # Single image
  python src/detect.py --source video.mp4                     # Video file
  python src/detect.py --source data/raw/test/images/         # Batch folder
  python src/detect.py --conf 0.4 --weights models/v2/best.pt # Custom settings
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

DEFAULT_WEIGHTS = "/Users/mohamedali/Desktop/bach-lv/models/v2/best.pt"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}

WARNING_TEXT = "⚠ DANGER: HIGH VOLTAGE"


def _load_font(size: int):
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_LABEL = _load_font(15)
FONT_WARN = _load_font(17)
FONT_SMALL = _load_font(13)


def _detect_breakers(panel_bgr: np.ndarray):
    """
    Find individual circuit breakers inside a panel ROI and classify ON/OFF.
    Returns: (breaker_list, total, off_count)
      breaker_list items: (x, y, w, h, is_on)  — panel-relative pixel coords
    """
    h, w = panel_bgr.shape[:2]
    if h < 40 or w < 40:
        return [], 0, 0

    gray = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)

    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 15, 4,
    )
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    panel_area = h * w
    hsv = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2HSV)
    candidates = []

    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        area = bw * bh
        if not (0.002 * panel_area <= area <= 0.10 * panel_area):
            continue
        if bw < 8 or bh < 8:
            continue
        aspect = bh / max(bw, 1)
        if not (0.6 <= aspect <= 5.0):
            continue
        candidates.append((x, y, bw, bh))

    if not candidates:
        return [], 0, 0

    areas = sorted(c[2] * c[3] for c in candidates)
    median_a = areas[len(areas) // 2]
    candidates = [c for c in candidates if median_a / 4 <= c[2] * c[3] <= median_a * 4]

    def _overlap_ratio(a, b):
        ax2, ay2 = a[0] + a[2], a[1] + a[3]
        bx2, by2 = b[0] + b[2], b[1] + b[3]
        ix = max(0, min(ax2, bx2) - max(a[0], b[0]))
        iy = max(0, min(ay2, by2) - max(a[1], b[1]))
        return (ix * iy) / max(a[2] * a[3], 1)

    candidates.sort(key=lambda c: c[2] * c[3], reverse=True)
    kept = []
    for c in candidates:
        if all(_overlap_ratio(c, k) < 0.4 for k in kept):
            kept.append(c)

    breakers = []
    for (x, y, bw, bh) in kept:
        roi_hsv = hsv[y:y + bh, x:x + bw]
        roi_gray = gray[y:y + bh, x:x + bw]

        orange_mask = cv2.inRange(
            roi_hsv,
            np.array([8, 60, 80]),
            np.array([30, 255, 255]),
        )
        orange_ratio = np.count_nonzero(orange_mask) / max(bw * bh, 1)
        mean_bright = float(np.mean(roi_gray))

        is_on = (orange_ratio < 0.05) and (mean_bright > 30)
        breakers.append((x, y, bw, bh, is_on))

    off_count = sum(1 for *_, is_on in breakers if not is_on)
    return breakers, len(breakers), off_count


def draw_detections(frame: np.ndarray, result, class_names) -> np.ndarray:
    """Overlay bounding boxes, breaker analysis, and safety warnings on a BGR frame."""
    if result.boxes is None or len(result.boxes) == 0:
        return frame

    pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil_img, "RGBA")

    for box in result.boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf = float(box.conf[0])
        cls = int(box.cls[0])
        label = class_names[cls] if isinstance(class_names, (list, dict)) else str(cls)

        # Breaker analysis
        panel_roi = frame[y1:y2, x1:x2]
        breakers, total_b, off_b = _detect_breakers(panel_roi)

        # Individual breaker boxes (green = ON, orange = OFF)
        for (bx, by, bw, bh, is_on) in breakers:
            ax1, ay1 = x1 + bx, y1 + by
            ax2, ay2 = ax1 + bw, ay1 + bh
            color = (0, 180, 0) if is_on else (255, 100, 0)
            draw.rectangle([ax1, ay1, ax2, ay2], outline=color, width=1)

        # Red bounding box
        draw.rectangle([x1, y1, x2, y2], outline=(220, 30, 30), width=3)

        # Class + confidence chip above box
        chip_text = f"{label}  {conf:.0%}"
        bbox = draw.textbbox((0, 0), chip_text, font=FONT_LABEL)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        chip_y0 = max(0, y1 - th - 8)
        draw.rectangle([x1, chip_y0, x1 + tw + 10, chip_y0 + th + 6],
                       fill=(220, 30, 30, 230))
        draw.text((x1 + 5, chip_y0 + 3), chip_text,
                  fill=(255, 255, 255), font=FONT_LABEL)

        # Safety warning banner (top-inside)
        warn_bbox = draw.textbbox((0, 0), WARNING_TEXT, font=FONT_WARN)
        ww = warn_bbox[2] - warn_bbox[0]
        wh = warn_bbox[3] - warn_bbox[1]
        warn_y = min(y2 - wh - 10, y1 + 10)
        warn_y = max(warn_y, y1)
        draw.rectangle([x1, warn_y, x1 + ww + 14, warn_y + wh + 8],
                       fill=(180, 0, 0, 210))
        draw.text((x1 + 7, warn_y + 4), WARNING_TEXT,
                  fill=(255, 230, 0), font=FONT_WARN)

        # Breaker count banner (bottom-inside)
        if total_b > 0:
            off_label = f"OFF: {off_b}" if off_b > 0 else "All ON"
            count_text = f"Breakers: {total_b}  |  {off_label}"
            ctb = draw.textbbox((0, 0), count_text, font=FONT_SMALL)
            ctw = ctb[2] - ctb[0]
            cth = ctb[3] - ctb[1]
            cy_bot = y2 - cth - 8
            bg_color = (160, 60, 0, 210) if off_b > 0 else (0, 100, 0, 210)
            draw.rectangle([x1, cy_bot - 2, x1 + ctw + 14, y2 - 2], fill=bg_color)
            draw.text((x1 + 7, cy_bot), count_text, fill=(255, 255, 200), font=FONT_SMALL)

    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def _status_bar(frame: np.ndarray, text: str) -> np.ndarray:
    """Small status bar at the bottom of the frame."""
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, h - 28), (w, h), (30, 30, 30), -1)
    cv2.putText(frame, text, (8, h - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
    return frame


# ---------------------------------------------------------------------------
# Run modes
# ---------------------------------------------------------------------------

def run_webcam(model: YOLO, conf: float, cam_id: int) -> None:
    cap = cv2.VideoCapture(cam_id)
    if not cap.isOpened():
        sys.exit(f"[ERROR] Cannot open camera {cam_id}")

    print(f"[LIVE] Camera {cam_id} — press Q or ESC to quit")
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = model(frame, conf=conf, verbose=False)
        annotated = draw_detections(frame, results[0], model.names)
        n = len(results[0].boxes)
        _status_bar(annotated, f"Panels: {n}  |  conf>={conf:.2f}  |  Q=quit")
        cv2.imshow("AR Electrical Panel Detector — LIVE", annotated)
        if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q"), 27):
            break

    cap.release()
    cv2.destroyAllWindows()


def run_image(model: YOLO, path: str, conf: float) -> None:
    img = cv2.imread(path)
    if img is None:
        sys.exit(f"[ERROR] Cannot read image: {path}")

    results = model(img, conf=conf, verbose=False)
    annotated = draw_detections(img, results[0], model.names)
    n = len(results[0].boxes)

    out_path = Path(path).stem + "_detected.jpg"
    cv2.imwrite(out_path, annotated)
    print(f"[IMAGE] Detections: {n}  →  saved {out_path}")
    print("        Press any key to close.")

    cv2.imshow("AR Electrical Panel Detector — IMAGE", annotated)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


def run_video(model: YOLO, path: str, conf: float) -> None:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        sys.exit(f"[ERROR] Cannot open video: {path}")

    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    out_path = Path(path).stem + "_detected.mp4"
    writer = cv2.VideoWriter(out_path,
                             cv2.VideoWriter_fourcc(*"mp4v"),
                             fps, (w, h))

    print(f"[VIDEO] {path}  →  {out_path}  |  Q=quit")
    frames = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = model(frame, conf=conf, verbose=False)
        annotated = draw_detections(frame, results[0], model.names)
        _status_bar(annotated,
                    f"Frame {frames}  |  Detections: {len(results[0].boxes)}  |  Q=quit")
        writer.write(annotated)
        cv2.imshow("AR Electrical Panel Detector — VIDEO", annotated)
        if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q"), 27):
            break
        frames += 1

    cap.release()
    writer.release()
    cv2.destroyAllWindows()
    print(f"[VIDEO] Processed {frames} frames  →  {out_path}")


def run_folder(model: YOLO, folder: str, conf: float) -> None:
    images = sorted(
        p for p in Path(folder).iterdir()
        if p.suffix.lower() in IMAGE_EXTS
    )
    if not images:
        sys.exit(f"[ERROR] No images found in {folder}")

    print(f"[BATCH] {len(images)} images — any key=next, Q=quit")
    for img_path in images:
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        results = model(img, conf=conf, verbose=False)
        annotated = draw_detections(img, results[0], model.names)
        n = len(results[0].boxes)
        _status_bar(annotated,
                    f"{img_path.name}  |  Detections: {n}  |  any key=next  Q=quit")
        print(f"  {img_path.name}  →  {n} detection(s)")
        cv2.imshow("AR Electrical Panel Detector — BATCH", annotated)
        if cv2.waitKey(0) & 0xFF in (ord("q"), ord("Q"), 27):
            break

    cv2.destroyAllWindows()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="AR Recognition of Electrical Panels for Safety Warnings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--weights", default=DEFAULT_WEIGHTS,
        help="Path to YOLOv8 .pt weights file",
    )
    parser.add_argument(
        "--source", default="0",
        help=(
            "Input source: '0' or camera index for webcam, "
            "image path, video path, or folder path"
        ),
    )
    parser.add_argument(
        "--conf", type=float, default=0.25,
        help="Detection confidence threshold (default: 0.25)",
    )
    parser.add_argument(
        "--cam-id", type=int, default=0,
        help="Camera device index when --source is a digit (default: 0)",
    )
    return parser.parse_args()


def main():
    args = parse_args()

    print("=" * 58)
    print("  AR Electrical Panel Detector — Safety Warning System")
    print("=" * 58)
    print(f"  Weights : {args.weights}")
    print(f"  Source  : {args.source}")
    print(f"  Conf    : {args.conf}")
    print()

    if not Path(args.weights).exists():
        sys.exit(f"[ERROR] Weights not found: {args.weights}")

    print("[INFO] Loading model...")
    model = YOLO(args.weights)
    print("[INFO] Model ready.\n")

    src = args.source
    src_path = Path(src)

    if src.isdigit():
        run_webcam(model, args.conf, int(src))
    elif src_path.is_dir():
        run_folder(model, src, args.conf)
    elif src_path.suffix.lower() in VIDEO_EXTS:
        run_video(model, src, args.conf)
    elif src_path.suffix.lower() in IMAGE_EXTS:
        run_image(model, src, args.conf)
    else:
        # Fallback: try as camera index
        try:
            run_webcam(model, args.conf, int(src))
        except ValueError:
            sys.exit(f"[ERROR] Unrecognised source: '{src}'")


if __name__ == "__main__":
    main()
