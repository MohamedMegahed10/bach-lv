"use client";

import { motion } from "framer-motion";

interface ScanReticleProps {
  active: boolean;
}

export default function ScanReticle({ active }: ScanReticleProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-64 h-64">
        {/* Corner brackets */}
        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
          <span
            key={corner}
            className={[
              "absolute w-8 h-8 border-[#3B82F6]",
              corner === "tl" ? "top-0 left-0 border-t-2 border-l-2" : "",
              corner === "tr" ? "top-0 right-0 border-t-2 border-r-2" : "",
              corner === "bl" ? "bottom-0 left-0 border-b-2 border-l-2" : "",
              corner === "br" ? "bottom-0 right-0 border-b-2 border-r-2" : "",
            ].join(" ")}
          />
        ))}

        {/* Scan line */}
        {active && (
          <motion.div
            className="absolute left-1 right-1 h-px bg-[#3B82F6]/70"
            initial={{ top: 0 }}
            animate={{ top: ["4px", "252px", "4px"] }}
            transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }}
          />
        )}

        {/* Centre dot */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-1.5 h-1.5 rounded-full ${active ? "bg-[#3B82F6] animate-pulse" : "bg-slate-600"}`}
        />

        {/* Label */}
        <motion.p
          animate={active ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.3 }}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className="absolute -bottom-8 left-0 right-0 text-center text-[10px]
                     font-mono text-[#3B82F6] tracking-widest uppercase"
        >
          {active ? "Scanning…" : "Aim at panel"}
        </motion.p>
      </div>
    </div>
  );
}
