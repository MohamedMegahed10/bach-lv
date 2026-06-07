"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck, Lock, ChevronDown } from "lucide-react";
import { DetectionResult, PanelDetection } from "@/lib/types";

const HAZARD_COLOR: Record<string, string> = {
  high:   "text-red-400 border-red-500/40 bg-red-500/10",
  medium: "text-orange-400 border-orange-500/40 bg-orange-500/10",
  low:    "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  none:   "text-green-400 border-green-500/40 bg-green-500/10",
};

const SAFETY_ADVICE: Record<string, { color: string; items: string[] }> = {
  high: {
    color: "#EF4444",
    items: [
      "Cut off mains power before approaching.",
      "Do NOT touch any internal components.",
      "Call a licensed electrician immediately.",
      "Keep a 1-metre safety distance.",
    ],
  },
  medium: {
    color: "#F97316",
    items: [
      "Identify the tripped breaker before resetting.",
      "Investigate the cause of the trip first.",
      "Do not repeatedly reset a tripping breaker.",
      "Wear insulated gloves when working.",
    ],
  },
  low: {
    color: "#FACC15",
    items: [
      "Maintain safe distance from live terminals.",
      "Verify isolation before any maintenance.",
      "Ensure no loose wiring is exposed.",
    ],
  },
  none: {
    color: "#3B82F6",
    items: [
      "Do not open without proper isolation.",
      "Confirm power is OFF before unlocking.",
      "Use appropriate PPE when opening.",
    ],
  },
};

function PanelCard({ panel, index }: { panel: PanelDetection; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const hazardCls = HAZARD_COLOR[panel.hazard_level] ?? HAZARD_COLOR.none;
  const safety = SAFETY_ADVICE[panel.hazard_level] ?? SAFETY_ADVICE.none;

  return (
    <div className="bg-slate-800 rounded-xl border border-white/5 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer
                   hover:bg-white/5 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {panel.is_dangerous
            ? <AlertTriangle size={15} className="text-red-400" />
            : panel.status === "closed"
            ? <Lock size={15} className="text-slate-400" />
            : <ShieldCheck size={15} className="text-green-400" />
          }
          <span className="text-white text-sm font-semibold">Panel {index + 1}</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${hazardCls}`}>
            {panel.hazard_level.toUpperCase()}
          </span>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} className="text-slate-500" />
        </motion.span>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-3">
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Confidence", `${(panel.confidence * 100).toFixed(1)}%`],
                  ["Status",     panel.status === "closed" ? "Closed" : "Open"],
                  ["Brand",      panel.brand !== "Unknown" ? panel.brand : "—"],
                  ["Breakers",   panel.status === "closed" ? "N/A" : String(panel.breakers_total)],
                  ["OFF",        panel.status === "closed" ? "N/A" : String(panel.breakers_off)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-slate-900/60 rounded-lg px-3 py-2">
                    <div className="text-slate-500 text-[9px] uppercase tracking-wide mb-0.5">{k}</div>
                    <div className={`font-mono font-bold ${k === "OFF" && panel.breakers_off > 0 ? "text-red-400" : "text-white"}`}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Component breakdown */}
              {Object.keys(panel.components).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(panel.components).map(([cls, count]) => (
                    <span key={cls}
                      className="text-[10px] font-mono px-2 py-0.5 rounded
                                 bg-slate-700 text-slate-300 border border-white/5">
                      {cls}: {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Safety guidelines accordion */}
              <div className="rounded-lg border border-white/10 overflow-hidden">
                <button
                  onClick={() => setGuidelinesOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2
                             text-xs font-semibold bg-slate-700/50 hover:bg-slate-700
                             transition-colors"
                  style={{ color: safety.color }}
                >
                  <span>Safety Guidelines</span>
                  <motion.span
                    animate={{ rotate: guidelinesOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={14} />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {guidelinesOpen && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden px-3 py-2 space-y-1.5 bg-slate-900/60"
                    >
                      {safety.items.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="shrink-0 w-1 h-1 rounded-full mt-1.5"
                                style={{ background: safety.color }} />
                          <span className="text-[11px] font-mono text-slate-300 leading-snug">
                            {tip}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface Props {
  result: DetectionResult | null;
  loading: boolean;
  error: string | null;
}

export default function ResultsSidebar({ result, loading, error }: Props) {
  return (
    <div className="h-full flex flex-col bg-slate-900 border-l border-white/10 overflow-y-auto">
      <div className="px-5 py-4 border-b border-white/10 shrink-0">
        <h2 className="text-white font-bold text-sm">Detection Results</h2>
        {result && (
          <p className="text-slate-500 text-xs mt-0.5">
            {result.total_panels} panel{result.total_panels !== 1 ? "s" : ""} ·{" "}
            {result.inference_ms.toFixed(0)} ms
          </p>
        )}
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {loading && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
            <p className="text-slate-400 text-xs font-mono">Analyzing…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-xs font-mono">{error}</p>
          </div>
        )}

        {!loading && !error && !result && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-600 text-xs text-center leading-relaxed px-4">
              Point your camera at an electrical panel<br />or upload an image
            </p>
          </div>
        )}

        {!loading && result && result.total_panels === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 text-xs text-center">No panels detected</p>
          </div>
        )}

        {!loading && result && result.panels.map((p, i) => (
          <PanelCard key={i} panel={p} index={i} />
        ))}
      </div>
    </div>
  );
}
