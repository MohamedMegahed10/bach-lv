"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  fps: number;
  latencyMs: number;
  loading: boolean;
}

export default function TelemetryHUD({ fps, latencyMs, loading }: Props) {
  return (
    <div className="absolute top-3 left-3 flex flex-col gap-1 pointer-events-none">
      {/* FPS */}
      <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm
                      rounded px-2 py-1 border border-white/10">
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">FPS</span>
        <span className="text-xs font-mono font-bold text-green-400">
          {fps > 0 ? fps : "—"}
        </span>
      </div>

      {/* Latency */}
      <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm
                      rounded px-2 py-1 border border-white/10">
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">MS</span>
        <span
          className="text-xs font-mono font-bold"
          style={{
            color:
              latencyMs === 0 ? "#64748B"
              : latencyMs < 150 ? "#22C55E"
              : latencyMs < 400 ? "#FACC15"
              : "#EF4444",
          }}
        >
          {latencyMs > 0 ? latencyMs.toFixed(0) : "—"}
        </span>
      </div>

      {/* Inference spinner */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm
                       rounded px-2 py-1 border border-blue-500/30"
          >
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              className="block w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full"
            />
            <span className="text-[9px] font-mono text-blue-400 uppercase tracking-wider">
              Inferring
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
