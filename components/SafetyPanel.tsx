"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, ShieldCheck, Lock } from "lucide-react";
import { PanelDetection } from "@/lib/types";

interface Props {
  panel: PanelDetection | null;
  onClose: () => void;
}

const HAZARD_CONFIG = {
  high: {
    icon: AlertTriangle,
    color: "#EF4444",
    bg: "bg-red-950/90",
    border: "border-red-500/50",
    title: "HIGH VOLTAGE — DANGER",
    advice: [
      "Cut off mains power before approaching.",
      "Do NOT touch any internal components.",
      "Call a licensed electrician immediately.",
      "Keep a 1-metre safety distance.",
    ],
  },
  medium: {
    icon: AlertTriangle,
    color: "#F97316",
    bg: "bg-orange-950/90",
    border: "border-orange-500/50",
    title: "CAUTION — TRIPPED BREAKER",
    advice: [
      "Identify the tripped breaker before resetting.",
      "Investigate the cause of the trip first.",
      "Do not repeatedly reset a tripping breaker.",
      "Wear insulated gloves when working.",
    ],
  },
  low: {
    icon: AlertTriangle,
    color: "#FACC15",
    bg: "bg-yellow-950/90",
    border: "border-yellow-500/50",
    title: "LOW RISK — PANEL OPEN",
    advice: [
      "Maintain safe distance from live terminals.",
      "Verify isolation before any maintenance.",
      "Ensure no loose wiring is exposed.",
    ],
  },
  none: {
    icon: Lock,
    color: "#3B82F6",
    bg: "bg-blue-950/90",
    border: "border-blue-500/50",
    title: "PANEL CLOSED",
    advice: [
      "Do not open without proper isolation.",
      "Confirm power is OFF before unlocking.",
      "Use appropriate PPE when opening.",
    ],
  },
};

export default function SafetyPanel({ panel, onClose }: Props) {
  const cfg = panel ? HAZARD_CONFIG[panel.hazard_level] : null;
  const Icon = cfg?.icon ?? ShieldCheck;

  return (
    <AnimatePresence>
      {panel && cfg && (
        <motion.div
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`absolute top-0 right-0 bottom-0 w-72 z-20 flex flex-col
                      ${cfg.bg} backdrop-blur-md border-l ${cfg.border}`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3
                          border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Icon size={16} style={{ color: cfg.color }} />
              <span className="text-xs font-bold font-mono tracking-wide"
                    style={{ color: cfg.color }}>
                {cfg.title}
              </span>
            </div>
            <button onClick={onClose}
              className="text-slate-500 hover:text-white transition p-1 rounded">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Status",    value: panel.status === "closed" ? "Closed" : "Open" },
                { label: "Conf.",     value: `${(panel.confidence * 100).toFixed(0)}%` },
                { label: "Brand",     value: panel.brand !== "Unknown" ? panel.brand : "—" },
                { label: "Breakers",  value: panel.breakers_total > 0 ? String(panel.breakers_total) : "—" },
                { label: "OFF",       value: panel.breakers_off > 0 ? String(panel.breakers_off) : "All ON" },
                { label: "Risk",      value: panel.hazard_level.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label}
                  className="bg-black/40 rounded px-2.5 py-2 border border-white/5">
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                    {label}
                  </p>
                  <p className="text-xs font-bold font-mono text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Component breakdown */}
            {Object.keys(panel.components).length > 0 && (
              <div>
                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                  Components
                </p>
                <div className="space-y-1">
                  {Object.entries(panel.components).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center
                                            bg-black/30 rounded px-2.5 py-1.5">
                      <span className="text-xs font-mono text-slate-300">{k}</span>
                      <span className="text-xs font-bold font-mono text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Safety advice */}
            <div>
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Safety Guidelines
              </p>
              <ul className="space-y-1.5">
                {cfg.advice.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 w-1 h-1 rounded-full mt-1.5"
                          style={{ background: cfg.color }} />
                    <span className="text-[11px] font-mono text-slate-300 leading-snug">
                      {tip}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-white/10 shrink-0">
            <p className="text-[9px] font-mono text-slate-600 text-center">
              YOLOv8n · mAP50 99.5% · Bachelor&apos;s Thesis
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
