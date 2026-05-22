"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, CheckCircle, Lock } from "lucide-react";
import { HistoryEntry } from "@/lib/types";

interface Props {
  open: boolean;
  entries: HistoryEntry[];
  onClose: () => void;
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function HistoryDrawer({ open, entries, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="absolute inset-x-0 bottom-0 z-20 bg-black/90 backdrop-blur-md
                     border-t border-white/10 max-h-72 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5
                          border-b border-white/10 shrink-0">
            <span className="text-xs font-bold font-mono text-white tracking-wide">
              Detection History
              <span className="ml-2 text-slate-500 font-normal">({entries.length})</span>
            </span>
            <button onClick={onClose}
              className="text-slate-500 hover:text-white transition p-1 rounded">
              <X size={14} />
            </button>
          </div>

          {/* Entries */}
          <div className="flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="text-xs font-mono text-slate-600 text-center py-8">
                No detections yet
              </p>
            ) : (
              entries.map((entry, i) => {
                const hasDanger = entry.result.panels.some((p) => p.is_dangerous);
                const hasClosed = entry.result.panels.some((p) => p.status === "closed");
                const Icon = hasDanger ? AlertTriangle : hasClosed ? Lock : CheckCircle;
                const iconColor = hasDanger ? "#EF4444" : hasClosed ? "#3B82F6" : "#22C55E";

                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2.5
                               border-b border-white/5 hover:bg-white/5 transition"
                  >
                    {/* Thumbnail */}
                    {entry.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.thumbnail}
                        alt="frame"
                        className="w-12 h-8 object-cover rounded border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-8 bg-white/5 rounded border border-white/10 shrink-0" />
                    )}

                    {/* Icon */}
                    <Icon size={14} style={{ color: iconColor }} className="shrink-0" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-white truncate">
                        {entry.result.total_panels} panel{entry.result.total_panels !== 1 ? "s" : ""}
                        {hasDanger && (
                          <span className="ml-1.5 text-red-400 font-bold">⚠ Danger</span>
                        )}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {fmt(entry.timestamp)} · {entry.result.inference_ms.toFixed(0)} ms
                      </p>
                    </div>

                    {/* Panel summaries */}
                    <div className="shrink-0 text-right">
                      {entry.result.panels.map((p, j) => (
                        <p key={j} className="text-[10px] font-mono text-slate-400">
                          {p.breakers_total > 0
                            ? `${p.breakers_total}B ${p.breakers_off > 0 ? `${p.breakers_off}↓` : "✓"}`
                            : p.status}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
