"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Upload, Video, Aperture } from "lucide-react";
import Navbar from "@/components/Navbar";
import UploadMode from "@/components/UploadMode";
import CameraMode from "@/components/CameraMode";
import CaptureMode from "@/components/CaptureMode";
import ResultsSidebar from "@/components/ResultsSidebar";
import { useScanStore, ScanMode } from "@/lib/store";

const TABS: { id: ScanMode; label: string; icon: React.ReactNode }[] = [
  { id: "upload",  label: "Upload",   icon: <Upload size={14} /> },
  { id: "camera",  label: "Live Cam", icon: <Video size={14} /> },
  { id: "capture", label: "Capture",  icon: <Aperture size={14} /> },
];

export default function ScanPage() {
  const { mode, setMode, result, loading, error } = useScanStore();

  return (
    <main className="h-screen bg-[#0F172A] flex flex-col overflow-hidden">
      <Navbar />

      {/* Mode tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2
                      bg-slate-900 border-b border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs
                        font-semibold transition-colors
                        ${mode === tab.id
                          ? "bg-red-500 text-white"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 flex min-h-0">
        {/* Left 60% — viewport */}
        <div className="relative flex-[3] min-w-0 bg-black overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              {mode === "upload"  && <UploadMode />}
              {mode === "camera"  && <CameraMode />}
              {mode === "capture" && <CaptureMode />}
            </motion.div>
          </AnimatePresence>

          {/* Loading overlay for upload + capture */}
          {loading && mode !== "camera" && (
            <div className="absolute inset-0 flex items-center justify-center
                            bg-black/50 pointer-events-none">
              <div className="w-10 h-10 rounded-full border-2 border-red-500
                              border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {/* Right 40% — results sidebar */}
        <div className="flex-[2] min-w-0 min-h-0">
          <ResultsSidebar result={result} loading={loading} error={error} />
        </div>
      </div>
    </main>
  );
}
