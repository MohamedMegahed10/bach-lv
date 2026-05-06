"""
FastAPI JSON detection endpoint for the AR frontend.
Run: python src/api.py  — serves on http://localhost:8000
"""

import base64
import io
import time

import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from ultralytics import YOLO

pytesseract.pytesseract.tesseract_cmd = "/opt/homebrew/bin/tesseract"

PANEL_WEIGHTS   = "/Users/mohamedali/Desktop/bach-lv/models/v3/best.pt"
BREAKER_WEIGHTS = "/Users/mohamedali/Desktop/bach-lv/models/breakers_v1.pt"

print("Loading models...")
panel_model   = YOLO(PANEL_WEIGHTS)
breaker_model = YOLO(BREAKER_WEIGHTS)
print("Models ready.")

BREAKER_CLASSES = {"MCB", "RCBO", "RCD", "TP MCB", "Main Switch", "Cut Out"}
KNOWN_BRANDS    = ["siemens", "schneider", "legrand", "hager", "abb",
                   "eaton", "gewiss", "chint", "delta", "venus"]


def _detect_brand(panel_bgr: np.ndarray) -> str:
    h, w = panel_bgr.shape[:2]
    if h < 20 or w < 20:
        return "Unknown"
    gray  = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2GRAY)
    scale = max(1, 800 // max(h, w))
    if scale > 1:
        gray = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
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


def _detect_breakers(panel_bgr: np.ndarray):
    h, w = panel_bgr.shape[:2]
    if h < 40 or w < 40:
        return [], 0, 0
    results = breaker_model(panel_bgr, conf=0.25, verbose=False)
    boxes   = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return [], 0, 0
    hsv      = cv2.cvtColor(panel_bgr, cv2.COLOR_BGR2HSV)
    breakers = []
    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        cls_name = breaker_model.names[int(box.cls[0])]
        if cls_name not in BREAKER_CLASSES:
            continue
        bw, bh  = x2 - x1, y2 - y1
        roi_hsv = hsv[y1:y2, x1:x2]
        orange  = cv2.inRange(roi_hsv, np.array([8, 60, 80]), np.array([30, 255, 255]))
        is_on   = np.count_nonzero(orange) / max(bw * bh, 1) < 0.05
        breakers.append({"bbox": [x1, y1, x2, y2], "label": cls_name, "is_on": bool(is_on)})
    off_count = sum(1 for b in breakers if not b["is_on"])
    return breakers, len(breakers), off_count


app = FastAPI(title="AR Panel Detector API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    image: str
    conf:  float = 0.25


@app.post("/detect")
def detect(req: DetectRequest):
    try:
        img_data = base64.b64decode(req.image.split(",")[-1])
        pil_img  = Image.open(io.BytesIO(img_data)).convert("RGB")
        bgr      = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    img_h, img_w = bgr.shape[:2]
    t0      = time.perf_counter()
    results = panel_model(bgr, conf=req.conf, iou=0.4, verbose=False)
    inf_ms  = (time.perf_counter() - t0) * 1000

    panels = []
    for box in results[0].boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
        conf      = float(box.conf[0])
        cls_name  = panel_model.names[int(box.cls[0])]
        is_closed = cls_name == "panel_closed"
        panel_roi = bgr[y1:y2, x1:x2]
        brand     = _detect_brand(panel_roi)

        if not is_closed:
            breakers, total_b, off_b = _detect_breakers(panel_roi)
        else:
            breakers, total_b, off_b = [], 0, 0

        comp_counts: dict = {}
        for b in breakers:
            comp_counts[b["label"]] = comp_counts.get(b["label"], 0) + 1

        is_dangerous = off_b > 0
        hazard_level = (
            "none"   if is_closed else
            "high"   if off_b >= 2 else
            "medium" if off_b == 1 else
            "low"
        )

        panels.append({
            "bbox":           [x1, y1, x2, y2],
            "confidence":     round(conf, 3),
            "status":         "closed" if is_closed else "open",
            "is_dangerous":   is_dangerous,
            "hazard_level":   hazard_level,
            "brand":          brand,
            "breakers_total": total_b,
            "breakers_off":   off_b,
            "components":     comp_counts,
            "breaker_list":   breakers,
        })

    return {
        "panels":       panels,
        "total_panels": len(panels),
        "inference_ms": round(inf_ms, 1),
        "image_size":   [img_w, img_h],
    }


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
