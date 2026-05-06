"""
AR Recognition of Electrical Panels — Safety Warning System
Bachelor's Thesis | Gradio Web App
Run: python src/app.py
"""

import io
import re
import cv2
import numpy as np
import gradio as gr
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO
from pathlib import Path

import pytesseract
pytesseract.pytesseract.tesseract_cmd = "/opt/homebrew/bin/tesseract"

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

WEIGHTS         = "/Users/mohamedali/Desktop/bach-lv/models/v3/best.pt"
BREAKER_WEIGHTS = "/Users/mohamedali/Desktop/bach-lv/models/breakers_v1.pt"

print("Loading panel model...")
model = YOLO(WEIGHTS)
print("Loading breaker model...")
breaker_model = YOLO(BREAKER_WEIGHTS)
print("Models ready.")

WARNING_TEXT = "⚠  DANGER: HIGH VOLTAGE"

# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------

def _load_font(size):
    for path in [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()

FONT_LABEL = _load_font(16)
FONT_WARN  = _load_font(18)
FONT_SMALL = _load_font(13)


# ---------------------------------------------------------------------------
# Bounding box refinement
# ---------------------------------------------------------------------------

def _refine_box(frame_bgr: np.ndarray, x1, y1, x2, y2, margin: int = 20):
    """
    Snap a rough bounding box tighter to the actual panel edges using
    edge detection within an expanded ROI.
    Returns refined (x1, y1, x2, y2).
    """
    h, w = frame_bgr.shape[:2]

    # Expand search region slightly beyond the rough box
    rx1 = max(0, x1 - margin)
    ry1 = max(0, y1 - margin)
    rx2 = min(w, x2 + margin)
    ry2 = min(h, y2 + margin)

    roi = frame_bgr[ry1:ry2, rx1:rx2]
    if roi.size == 0:
        return x1, y1, x2, y2

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 100)

    # Morphological close to connect nearby edges
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return x1, y1, x2, y2

    roi_area = (rx2 - rx1) * (ry2 - ry1)
    rough_area = (x2 - x1) * (y2 - y1)

    best = None
    best_score = 0
    for cnt in contours:
        cx, cy, cw, ch = cv2.boundingRect(cnt)
        area = cw * ch
        # Must be at least 30% of the rough box area and not the whole ROI
        if area < 0.3 * rough_area or area > 0.98 * roi_area:
            continue
        # Score: prefer large rectangles close to the original box center
        score = area
        if score > best_score:
            best_score = score
            best = (cx, cy, cw, ch)

    if best is None:
        return x1, y1, x2, y2

    cx, cy, cw, ch = best
    # Convert back to full-image coordinates
    nx1 = rx1 + cx
    ny1 = ry1 + cy
    nx2 = nx1 + cw
    ny2 = ny1 + ch

    # Only accept refinement if it's reasonably close to the original
    orig_cx = (x1 + x2) / 2
    orig_cy = (y1 + y2) / 2
    new_cx = (nx1 + nx2) / 2
    new_cy = (ny1 + ny2) / 2
    orig_diag = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    shift = ((new_cx - orig_cx) ** 2 + (new_cy - orig_cy) ** 2) ** 0.5

    if shift > 0.4 * orig_diag:
        return x1, y1, x2, y2

    return nx1, ny1, nx2, ny2


# ---------------------------------------------------------------------------
# Brand detection (OCR-based)
# ---------------------------------------------------------------------------

KNOWN_BRANDS = ["siemens", "schneider", "legrand", "hager", "abb",
                "eaton", "gewiss", "chint", "delta", "venus"]

def _detect_brand(panel_bgr: np.ndarray) -> str:
    """
    Run OCR on the panel ROI to detect brand name.
    Returns the brand string (title-cased) or 'Unknown'.
    """
    h, w = panel_bgr.shape[:2]
    if h < 20 or w < 20:
        return "Unknown"

    # Preprocess for better OCR — grayscale + upscale + threshold
    gray = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2GRAY)
    scale = max(1, 800 // max(h, w))
    if scale > 1:
        gray = cv2.resize(gray, (w * scale, h * scale),
                          interpolation=cv2.INTER_CUBIC)
    _, thresh = cv2.threshold(gray, 0, 255,
                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Run OCR
    try:
        text = pytesseract.image_to_string(
            thresh,
            config="--psm 11 --oem 3 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
        )
    except Exception:
        return "Unknown"

    text_lower = text.lower()
    for brand in KNOWN_BRANDS:
        if brand in text_lower:
            return brand.title()

    return "Unknown"


# ---------------------------------------------------------------------------
# Breaker detection (model-based)
# ---------------------------------------------------------------------------

# Classes that count as circuit breakers
BREAKER_CLASSES = {"MCB", "RCBO", "RCD", "TP MCB", "Main Switch", "Cut Out"}

def _detect_breakers(panel_bgr: np.ndarray):
    """
    Run the breaker model on a panel ROI and return detected components.
    ON/OFF is estimated from orange tripped-indicator color on each detection.
    Returns: (breaker_list, total, off_count)
      breaker_list items: (x, y, w, h, label, is_on) — panel-relative coords
    """
    h, w = panel_bgr.shape[:2]
    if h < 40 or w < 40:
        return [], 0, 0

    results = breaker_model(panel_bgr, conf=0.25, verbose=False)
    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return [], 0, 0

    hsv = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2HSV)
    breakers = []

    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        cls_name = breaker_model.names[int(box.cls[0])]

        # Only count actual breaker-type components
        if cls_name not in BREAKER_CLASSES:
            continue

        bw, bh = x2 - x1, y2 - y1
        roi_hsv = hsv[y1:y2, x1:x2]

        # Orange indicator = tripped/OFF
        orange_mask = cv2.inRange(
            roi_hsv,
            np.array([8, 60, 80]),
            np.array([30, 255, 255]),
        )
        orange_ratio = np.count_nonzero(orange_mask) / max(bw * bh, 1)
        is_on = orange_ratio < 0.05

        breakers.append((x1, y1, bw, bh, cls_name, is_on))

    off_count = sum(1 for *_, is_on in breakers if not is_on)
    return breakers, len(breakers), off_count


# ---------------------------------------------------------------------------
# Drawing
# ---------------------------------------------------------------------------

def draw_detections(frame_bgr: np.ndarray, result):
    """
    Returns (annotated_rgb_image, panel_stats)
    panel_stats: list of (total_breakers, off_count, is_dangerous, comp_counts)
    """
    if result.boxes is None or len(result.boxes) == 0:
        return cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB), []

    pil = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(pil, "RGBA")
    panel_stats = []

    for box in result.boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        x1, y1, x2, y2 = _refine_box(frame_bgr, x1, y1, x2, y2)
        conf = float(box.conf[0])
        cls  = int(box.cls[0])
        label = model.names[cls]

        # Closed panel detected directly by model
        is_closed = label == "panel_closed"

        # Brand detection via OCR on the panel ROI
        panel_roi = frame_bgr[y1:y2, x1:x2]
        brand = _detect_brand(panel_roi)

        # Breaker analysis only on open panels
        if not is_closed:
            breakers, total_b, off_b = _detect_breakers(panel_roi)
        else:
            breakers, total_b, off_b = [], 0, 0

        is_dangerous = off_b > 0

        # Component count for info label
        comp_counts = {}
        for (_, _, _, _, blabel, _) in breakers:
            comp_counts[blabel] = comp_counts.get(blabel, 0) + 1

        panel_stats.append((total_b, off_b, is_dangerous, comp_counts, is_closed, brand))

        # ── Panel bounding box ───────────────────────────────────────
        if is_dangerous:
            # Multi-layer red glow to signal danger
            for offset, alpha in [(8, 50), (4, 120), (0, 255)]:
                draw.rectangle(
                    [x1 - offset, y1 - offset, x2 + offset, y2 + offset],
                    outline=(220, 30, 30, alpha), width=3,
                )
        else:
            draw.rectangle([x1, y1, x2, y2], outline=(220, 30, 30), width=3)

        # ── Individual breaker boxes (green=ON, orange=OFF) ──────────
        for (bx, by, bw, bh, blabel, is_on) in breakers:
            ax1, ay1 = x1 + bx, y1 + by
            ax2, ay2 = ax1 + bw, ay1 + bh
            color = (0, 180, 0) if is_on else (255, 100, 0)
            draw.rectangle([ax1, ay1, ax2, ay2], outline=color, width=2)
            state = "ON" if is_on else "OFF"
            draw.text((ax1 + 2, ay1 + 2), f"{blabel} {state}",
                      fill=color, font=FONT_SMALL)

        # ── Confidence chip ──────────────────────────────────────────
        chip = f"{label}  {conf:.0%}"
        bb = draw.textbbox((0, 0), chip, font=FONT_LABEL)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        cy0 = max(0, y1 - th - 8)
        draw.rectangle([x1, cy0, x1 + tw + 12, cy0 + th + 6], fill=(220, 30, 30, 230))
        draw.text((x1 + 6, cy0 + 3), chip, fill=(255, 255, 255), font=FONT_LABEL)

        # ── Brand badge (next to confidence chip) ────────────────────
        if brand != "Unknown":
            brand_text = f"Brand: {brand}"
            brb = draw.textbbox((0, 0), brand_text, font=FONT_SMALL)
            brw = brb[2] - brb[0]
            brh = brb[3] - brb[1]
            bx0 = x1 + tw + 16
            draw.rectangle([bx0, cy0, bx0 + brw + 12, cy0 + brh + 6],
                           fill=(20, 60, 120, 230))
            draw.text((bx0 + 6, cy0 + 3), brand_text,
                      fill=(180, 220, 255), font=FONT_SMALL)

        # ── Panel info label (component summary, above chip) ─────────
        if comp_counts:
            parts = [f"{k}: {v}" for k, v in sorted(comp_counts.items())]
            if off_b > 0:
                parts.append(f"OFF: {off_b}")
            info_text = "  |  ".join(parts)
            itb = draw.textbbox((0, 0), info_text, font=FONT_SMALL)
            itw = itb[2] - itb[0]
            ith = itb[3] - itb[1]
            iy0 = max(0, cy0 - ith - 8)
            draw.rectangle([x1, iy0, x1 + itw + 14, iy0 + ith + 6],
                           fill=(20, 20, 80, 220))
            draw.text((x1 + 7, iy0 + 3), info_text,
                      fill=(180, 220, 255), font=FONT_SMALL)

        # ── Main status banner (top-inside) ──────────────────────────
        if is_closed:
            banner_text = "CLOSED PANEL — Do Not Open Without Isolation"
            banner_fill = (80, 60, 0, 220)
            banner_text_color = (255, 220, 80)
        else:
            banner_text = WARNING_TEXT
            banner_fill = (180, 0, 0, 210)
            banner_text_color = (255, 230, 0)

        wb = draw.textbbox((0, 0), banner_text, font=FONT_WARN)
        ww, wh = wb[2] - wb[0], wb[3] - wb[1]
        wy = max(y1 + 4, min(y2 - wh - 8, y1 + 10))
        draw.rectangle([x1, wy, x1 + ww + 14, wy + wh + 8], fill=banner_fill)
        draw.text((x1 + 7, wy + 4), banner_text, fill=banner_text_color, font=FONT_WARN)

        # ── CUT OFF POWER banner (dangerous open panels only) ─────────
        if is_dangerous and not is_closed:
            cutoff_text = "!! CUT OFF POWER BEFORE WORKING !!"
            cb = draw.textbbox((0, 0), cutoff_text, font=FONT_WARN)
            cw, ch = cb[2] - cb[0], cb[3] - cb[1]
            cy_cut = y2 + 4
            draw.rectangle([x1, cy_cut, x1 + cw + 14, cy_cut + ch + 8],
                           fill=(180, 0, 0, 230))
            draw.text((x1 + 7, cy_cut + 4), cutoff_text,
                      fill=(255, 255, 0), font=FONT_WARN)

        # ── Breaker count banner (bottom-inside) ─────────────────────
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

    return np.array(pil), panel_stats


# ---------------------------------------------------------------------------
# Inference helpers
# ---------------------------------------------------------------------------

def predict(image: np.ndarray, conf: float):
    """
    image: RGB numpy array from Gradio
    Returns: annotated RGB image, markdown summary string
    """
    if image is None:
        return None, "No image provided."

    bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    results = model(bgr, conf=conf, iou=0.4, verbose=False)
    result  = results[0]

    annotated, panel_stats = draw_detections(bgr, result)

    # Build summary
    n = len(result.boxes)
    speed = result.speed["inference"]

    if n == 0:
        summary = """## ✅ No Electrical Panel Detected
> The system did not detect any electrical panels in this image.

---
⏱ **{:.1f} ms** &nbsp;·&nbsp; YOLOv8n v3 &nbsp;·&nbsp; mAP50 99.5%""".format(speed)
    else:
        any_dangerous = any(s[2] for s in panel_stats if len(s) > 2)
        header_icon = "🚨" if any_dangerous else "🔴"
        header_text = "DANGEROUS — CUT OFF POWER" if any_dangerous else "HIGH VOLTAGE RISK"
        blocks = []
        blocks.append(f"## {header_icon} {n} Electrical Panel{'s' if n > 1 else ''} Detected — {header_text}\n")

        for i, box in enumerate(result.boxes, 1):
            c = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            stat = panel_stats[i - 1] if i - 1 < len(panel_stats) else (0, 0, False, {}, False, "Unknown")
            total_b, off_b, is_dangerous, comp_counts, is_closed, brand = stat

            if is_closed:
                status_val = "🔒 Closed"
                alert = "> ⚠️ **Do not open without proper electrical isolation.**"
            elif is_dangerous:
                status_val = "🚨 Open — DANGEROUS"
                alert = "> 🔴 **Cut off power immediately before any work.**"
            else:
                status_val = "✅ Open — Safe"
                alert = "> ℹ️ Panel is open. High voltage still present — maintain safe distance."

            brand_val = brand if brand != "Unknown" else "—"
            breaker_val = "N/A (closed)" if is_closed else (f"{total_b} detected" if total_b > 0 else "None detected")
            off_val = "N/A" if is_closed else (f"**{off_b} OFF ⚠️**" if off_b > 0 else "All ON ✅")

            comp_val = "—"
            if comp_counts:
                comp_val = " · ".join(f"{k}: {v}" for k, v in sorted(comp_counts.items()))

            blocks.append(f"### Panel {i}")
            blocks.append(alert)
            blocks.append(f"""
| Property | Value |
|---|---|
| Status | {status_val} |
| Confidence | **{c:.1%}** |
| Brand | {brand_val} |
| Breakers | {breaker_val} |
| OFF Breakers | {off_val} |
| Components | {comp_val} |
| Location | `[{x1}, {y1}, {x2}, {y2}]` |
""")

        blocks.append(f"---\n⏱ **{speed:.1f} ms** &nbsp;·&nbsp; YOLOv8n v3 &nbsp;·&nbsp; mAP50 99.5%")
        summary = "\n".join(blocks)

    return annotated, summary


# ---------------------------------------------------------------------------
# Gradio UI
# ---------------------------------------------------------------------------

CSS = """
#title { text-align: center; }
#subtitle { text-align: center; color: #888; margin-top: -10px; }
#warning_box { background: #1a0000; border: 2px solid #cc0000;
               border-radius: 8px; padding: 12px; color: #ff9999; }
#safe_box    { background: #001a00; border: 2px solid #00aa00;
               border-radius: 8px; padding: 12px; color: #99ff99; }
footer { display: none !important; }
"""

EXAMPLES = [
    "data/raw/test/images/sie5sl3032-7kl-siemens-disjoncteur-32a-courbe-c-4-v2_avif_jpg.rf.f75a92da05af300bc6cf055232f5dfb4.jpg",
    "data/raw/test/images/sief822620-f-siemens-coffret-electrique-preequipe-2-rangees-v-2_jpg.rf.06f650924b28b52d8f807b6209faa5ef.jpg",
]
EXAMPLES = [e for e in EXAMPLES if Path(e).exists()]

with gr.Blocks(css=CSS, title="AR Electrical Panel Detector") as demo:

    # ── Header ──────────────────────────────────────────────────────────────
    gr.Markdown("# ⚡ AR Electrical Panel — Safety Warning System", elem_id="title")
    gr.Markdown(
        "Bachelor's Thesis &nbsp;|&nbsp; YOLOv8n &nbsp;|&nbsp; "
        "mAP50 **99.5%** &nbsp;|&nbsp; Trained on Apple M1",
        elem_id="subtitle",
    )

    # ── Tabs ────────────────────────────────────────────────────────────────
    with gr.Tabs():

        # ── Tab 1: Image upload ─────────────────────────────────────────────
        with gr.Tab("📷  Image Detection"):
            with gr.Row():
                with gr.Column(scale=1):
                    img_input = gr.Image(
                        label="Upload image",
                        type="numpy",
                        tool="editor",
                    )
                    conf_slider = gr.Slider(
                        minimum=0.05, maximum=0.95, value=0.25, step=0.05,
                        label="Confidence threshold",
                    )
                    detect_btn = gr.Button("🔍  Detect", variant="primary")

                with gr.Column(scale=1):
                    img_output = gr.Image(label="Detection result", type="numpy")
                    result_md  = gr.Markdown(value="*Upload an image and click Detect.*")

            if EXAMPLES:
                gr.Examples(
                    examples=EXAMPLES,
                    inputs=img_input,
                    label="Example images from test set",
                )

            detect_btn.click(
                fn=predict,
                inputs=[img_input, conf_slider],
                outputs=[img_output, result_md],
            )
            # Also run on image change
            img_input.change(
                fn=predict,
                inputs=[img_input, conf_slider],
                outputs=[img_output, result_md],
            )

        # ── Tab 2: Webcam ───────────────────────────────────────────────────
        with gr.Tab("📹  Live Webcam"):
            gr.Markdown(
                "### Live detection\n"
                "Allow browser camera access, then click **Start**. "
                "Panels are highlighted with a red bounding box and safety warning."
            )
            with gr.Row():
                with gr.Column(scale=1):
                    webcam_conf = gr.Slider(
                        minimum=0.05, maximum=0.95, value=0.25, step=0.05,
                        label="Confidence threshold",
                    )
                    webcam_input = gr.Image(
                        label="Webcam feed",
                        source="webcam",
                        streaming=True,
                        type="numpy",
                    )
                with gr.Column(scale=1):
                    webcam_output = gr.Image(label="Detected output", type="numpy")
                    webcam_info   = gr.Markdown("*Waiting for webcam...*")

            webcam_input.stream(
                fn=predict,
                inputs=[webcam_input, webcam_conf],
                outputs=[webcam_output, webcam_info],
            )

        # ── Tab 3: Model info ───────────────────────────────────────────────
        with gr.Tab("📊  Model Info"):
            gr.Markdown("""
## Model Details

| Property | Value |
|---|---|
| Architecture | YOLOv8 Nano |
| Version | v2 (fine-tuned on augmented data) |
| Model size | 6.2 MB |
| Input size | 640 × 640 px |
| Classes | 1 — `electrical panel` |
| Training device | Apple M1 (MPS) |
| Inference speed | ~75 ms per image |

## Training Results

| Metric | v1 (original) | v2 (augmented) |
|---|---|---|
| Training images | 16 | 198 |
| Epochs | 24 | 28 (early stop) |
| mAP50 | 99.5% | **99.5%** |
| mAP50-95 | 77.6% | **87.5%** ↑ |
| Recall | 100% | **100%** |

## Dataset

- **Source:** Roboflow — AR Electrical Panels v1
- **Original images:** 25 (Siemens electrical panels)
- **Augmented training set:** 198 images
- **Augmentations:** brightness variation, motion blur, perspective warp, Gaussian noise, horizontal flip
- **License:** CC BY 4.0

## Safety Warning System

When an electrical panel is detected, the system overlays:
- 🔴 Red bounding box around the panel
- ⚠ **DANGER: HIGH VOLTAGE** banner on the detection
- Detection confidence and bounding box coordinates
""")

    # ── Footer ───────────────────────────────────────────────────────────────
    gr.Markdown(
        "---\n*AR Recognition of Electrical Panels for Safety Warnings — Bachelor's Thesis*",
        elem_id="subtitle",
    )

# ---------------------------------------------------------------------------

if __name__ == "__main__":
    demo.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        show_error=True,
        inbrowser=True,
    )
