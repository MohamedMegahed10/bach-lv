"use client";

import { motion } from "framer-motion";
import { PanelDetection } from "@/lib/types";

interface Props {
  panels: PanelDetection[];
  imageSize: [number, number]; // [width, height] of the source image
  containerSize: { w: number; h: number }; // rendered size of the video/image element
}

function scaleBox(
  bbox: [number, number, number, number],
  imgW: number,
  imgH: number,
  cW: number,
  cH: number
) {
  const scaleX = cW / imgW;
  const scaleY = cH / imgH;
  return {
    left:   bbox[0] * scaleX,
    top:    bbox[1] * scaleY,
    width:  (bbox[2] - bbox[0]) * scaleX,
    height: (bbox[3] - bbox[1]) * scaleY,
  };
}

const HAZARD_COLORS: Record<string, string> = {
  high:   "#EF4444",
  medium: "#F97316",
  low:    "#FACC15",
  none:   "#3B82F6",
};

export default function DetectionOverlay({ panels, imageSize, containerSize }: Props) {
  const [imgW, imgH] = imageSize;
  const { w: cW, h: cH } = containerSize;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {panels.map((panel, i) => {
        const { left, top, width, height } = scaleBox(panel.bbox, imgW, imgH, cW, cH);
        const color = HAZARD_COLORS[panel.hazard_level] ?? "#3B82F6";
        const isDangerous = panel.is_dangerous;

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15 }}
            className="absolute"
            style={{ left, top, width, height }}
          >
            {/* Main bounding box */}
            <div
              className="absolute inset-0 rounded-sm"
              style={{
                border: `2px solid ${color}`,
                boxShadow: isDangerous
                  ? `0 0 0 4px ${color}33, 0 0 16px ${color}55`
                  : `0 0 0 2px ${color}33`,
              }}
            />

            {/* Pulsing glow for dangerous panels */}
            {isDangerous && (
              <motion.div
                className="absolute inset-0 rounded-sm"
                animate={{ opacity: [0.15, 0.4, 0.15] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                style={{ background: `${color}22` }}
              />
            )}

            {/* Top-left chip: status badge */}
            <div
              className="absolute -top-6 left-0 px-2 py-0.5 rounded text-[10px]
                         font-bold font-mono whitespace-nowrap"
              style={{ background: color, color: "#000" }}
            >
              {panel.status === "closed"
                ? "🔒 CLOSED"
                : isDangerous
                ? "⚠ DANGER"
                : "✓ OPEN"}
            </div>

            {/* Confidence + brand */}
            <div
              className="absolute -top-6 right-0 px-2 py-0.5 rounded text-[10px]
                         font-mono whitespace-nowrap bg-black/70 text-slate-300"
            >
              {(panel.confidence * 100).toFixed(0)}%
              {panel.brand !== "Unknown" && (
                <span className="ml-1 text-blue-300">· {panel.brand}</span>
              )}
            </div>

            {/* Bottom bar: breaker summary */}
            {panel.breakers_total > 0 && (
              <div
                className="absolute -bottom-6 left-0 right-0 flex justify-center"
              >
                <div
                  className="px-2 py-0.5 rounded text-[10px] font-mono
                             bg-black/80 whitespace-nowrap"
                  style={{ color }}
                >
                  {panel.breakers_total} breaker{panel.breakers_total > 1 ? "s" : ""}
                  {panel.breakers_off > 0 && (
                    <span className="text-red-400 ml-1">
                      · {panel.breakers_off} OFF
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Individual breaker boxes (relative to panel) */}
            {panel.breaker_list.map((b, j) => {
              const [bx1, by1, bx2, by2] = b.bbox;
              const bScaleX = width / (panel.bbox[2] - panel.bbox[0]);
              const bScaleY = height / (panel.bbox[3] - panel.bbox[1]);
              return (
                <div
                  key={j}
                  className="absolute rounded-sm"
                  style={{
                    left:   bx1 * bScaleX,
                    top:    by1 * bScaleY,
                    width:  (bx2 - bx1) * bScaleX,
                    height: (by2 - by1) * bScaleY,
                    border: `1px solid ${b.is_on ? "#22C55E" : "#F97316"}`,
                  }}
                />
              );
            })}
          </motion.div>
        );
      })}
    </div>
  );
}
