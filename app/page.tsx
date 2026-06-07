"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, ShieldAlert, ToggleLeft } from "lucide-react";
import Navbar from "@/components/Navbar";

const FEATURES = [
  {
    icon: <Zap size={28} className="text-yellow-400" />,
    title: "Real-Time Detection",
    desc: "Detects electrical panels at 4 fps using YOLOv8n with 99.5% mAP50 accuracy.",
  },
  {
    icon: <ShieldAlert size={28} className="text-red-500" />,
    title: "Safety Warnings",
    desc: "Instant hazard level classification with AR overlays directly on each detected panel.",
  },
  {
    icon: <ToggleLeft size={28} className="text-blue-400" />,
    title: "Breaker State Analysis",
    desc: "Identifies individual MCB, RCD, RCBO states — ON or OFF — per panel.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0F172A] flex flex-col">
      <Navbar />

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center
                          px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full
                     bg-yellow-400/10 border border-yellow-400/30"
        >
          <Zap size={13} className="text-yellow-400" />
          <span className="text-yellow-400 text-xs font-mono font-semibold tracking-wide">
            YOLOv8n · mAP50 99.5%
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white
                     leading-tight max-w-3xl"
        >
          AR Electrical Panel{" "}
          <span className="text-red-500">Safety Recognition</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed"
        >
          Real-time hazard detection powered by YOLOv8n — point your camera at
          any electrical panel for instant safety analysis.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mt-10"
        >
          <Link
            href="/scan"
            className="inline-flex items-center gap-2 px-8 py-4 bg-red-500
                       hover:bg-red-600 active:bg-red-700 text-white text-base
                       font-bold rounded-xl transition-colors shadow-lg
                       shadow-red-500/25"
          >
            Launch Scanner →
          </Link>
        </motion.div>
      </section>

      {/* ── Feature Cards ──────────────────────────────────── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.45 + i * 0.1 }}
              className="bg-[#1E293B] rounded-xl p-6 border border-white/5
                         flex flex-col gap-3"
            >
              {f.icon}
              <h3 className="text-white font-bold text-sm">{f.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="py-5 text-center text-slate-600 text-xs border-t border-white/5">
        Bachelor&apos;s Thesis Project · AR Electrical Panel Safety Warning System
      </footer>
    </main>
  );
}
