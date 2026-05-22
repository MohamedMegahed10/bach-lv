"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, History, Play, Square, Upload, Zap } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { useDetection } from "@/hooks/useDetection";
import ScanReticle from "@/components/ScanReticle";
import DetectionOverlay from "@/components/DetectionOverlay";
import TelemetryHUD from "@/components/TelemetryHUD";
import SafetyPanel from "@/components/SafetyPanel";
import HistoryDrawer from "@/components/HistoryDrawer";
import { PanelDetection } from "@/lib/types";
import { detect } from "@/lib/api";

export default function Home() {
  const { videoRef, ready, error, captureFrame } = useCamera();
  const { result, loading, fps, history, startLoop, stopLoop } = useDetection(0.25);

  const [running, setRunning]             = useState(false);
  const [containerSize, setSize]          = useState({ w: 1, h: 1 });
  const [selectedPanel, setPanel]         = useState<PanelDetection | null>(null);
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [uploadResult, setUploadResult]   = useState<typeof result>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [mode, setMode]                   = useState<"camera" | "upload">("camera");
  const [uploadSrc, setUploadSrc]         = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ w: el.offsetWidth, h: el.offsetHeight })
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeResult = mode === "upload" ? uploadResult : result;

  const handleToggle = useCallback(() => {
    if (running) { stopLoop(); setRunning(false); }
    else         { startLoop(captureFrame); setRunning(true); }
  }, [running, startLoop, stopLoop, captureFrame]);

  useEffect(() => {
    if (activeResult?.panels?.length) {
      const dangerous = activeResult.panels.find((p) => p.is_dangerous);
      if (dangerous) setPanel(dangerous);
    }
  }, [activeResult]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const src = ev.target?.result as string;
        setUploadSrc(src);
        setMode("upload");
        setUploadLoading(true);
        try {
          const data = await detect(src, 0.25);
          setUploadResult(data);
          if (data.panels?.length) setPanel(data.panels[0]);
        } finally {
          setUploadLoading(false);
        }
      };
      reader.readAsDataURL(file);
    }, []
  );

  return (
    <main className="relative w-screen h-screen bg-[#0a0a0f] overflow-hidden flex flex-col">

      {/* ── TOP BAR ─────────────────────────────────────── */}
      <div className="relative z-30 flex items-center justify-between px-4 py-2
                      bg-black/60 backdrop-blur-md border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-[#FACC15]" />
          <span className="font-bold text-white text-sm tracking-wide">
            AR Electrical Panel Detector
          </span>
          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
            · Bachelor&apos;s Thesis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="cursor-pointer flex items-center gap-1 text-xs font-mono
                            text-slate-400 hover:text-white px-2 py-1 rounded
                            border border-white/10 hover:border-white/30 transition">
            <Upload size={12} />
            <span className="hidden sm:inline">Upload</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-mono text-slate-400
                       hover:text-white px-2 py-1 rounded border border-white/10
                       hover:border-white/30 transition"
          >
            <History size={12} />
            <span className="hidden sm:inline">History</span>
            {history.length > 0 && (
              <span className="bg-[#3B82F6] text-white text-[9px] rounded-full px-1 ml-0.5">
                {history.length}
              </span>
            )}
          </button>
          <button
            onClick={handleToggle}
            disabled={!ready && mode === "camera"}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-bold font-mono
                        transition ${running
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-[#3B82F6] hover:bg-blue-600 text-white"
                        } disabled:opacity-40`}
          >
            {running ? <Square size={12} /> : <Play size={12} />}
            {running ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      {/* ── VIEWPORT ─────────────────────────────────────── */}
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-black">

        {mode === "camera" ? (
          <video ref={videoRef} autoPlay muted playsInline
            className="absolute inset-0 w-full h-full object-cover" />
        ) : uploadSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploadSrc} alt="uploaded"
            className="absolute inset-0 w-full h-full object-contain" />
        ) : null}

        {/* vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent
                        to-black/50 pointer-events-none" />

        {/* reticle when nothing detected */}
        {!activeResult?.total_panels && (
          <ScanReticle active={running || uploadLoading} />
        )}

        {/* AR bounding boxes */}
        {activeResult && containerSize.w > 1 && (
          <DetectionOverlay
            panels={activeResult.panels}
            imageSize={activeResult.image_size}
            containerSize={containerSize}
          />
        )}

        {/* telemetry */}
        <TelemetryHUD
          fps={fps}
          latencyMs={activeResult?.inference_ms ?? 0}
          loading={loading || uploadLoading}
        />

        {/* camera error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/60 p-6 rounded-xl border border-red-500/30">
              <Camera size={32} className="text-red-400 mx-auto mb-2" />
              <p className="text-red-400 text-sm font-mono">{error}</p>
              <p className="text-slate-500 text-xs mt-1">Upload an image instead</p>
            </div>
          </div>
        )}

        {/* idle hint */}
        {!running && !activeResult && !error && mode === "camera" && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none">
            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-slate-500 text-xs font-mono"
            >
              Press Start for live detection — or Upload an image
            </motion.p>
          </div>
        )}

        {/* detection badge */}
        {activeResult && activeResult.total_panels > 0 && (
          <div className="absolute top-4 right-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="bg-black/70 backdrop-blur-md border border-white/10
                         rounded-lg px-3 py-2 text-xs font-mono">
              <span className="text-slate-400">Detected </span>
              <span className="text-white font-bold">{activeResult.total_panels}</span>
              <span className="text-slate-400"> panel{activeResult.total_panels > 1 ? "s" : ""}</span>
              {activeResult.panels.some((p) => p.is_dangerous) && (
                <span className="ml-2 text-[#EF4444] font-bold animate-pulse">⚠ DANGER</span>
              )}
            </motion.div>
          </div>
        )}

        {/* invisible click targets on each panel */}
        {activeResult?.panels.map((p, i) => (
          <button key={i} className="absolute z-10" style={{
            left:   (p.bbox[0] / activeResult.image_size[0]) * containerSize.w,
            top:    (p.bbox[1] / activeResult.image_size[1]) * containerSize.h,
            width:  ((p.bbox[2] - p.bbox[0]) / activeResult.image_size[0]) * containerSize.w,
            height: ((p.bbox[3] - p.bbox[1]) / activeResult.image_size[1]) * containerSize.h,
            cursor: "pointer",
          }} onClick={() => setPanel(p)} />
        ))}

        <SafetyPanel panel={selectedPanel} onClose={() => setPanel(null)} />
        <HistoryDrawer open={historyOpen} entries={history} onClose={() => setHistoryOpen(false)} />
      </div>

      {/* ── BOTTOM STATUS BAR ─────────────────────────────── */}
      <div className="relative z-30 flex items-center gap-3 px-4 py-1.5
                      bg-black/60 backdrop-blur-md border-t border-white/10 shrink-0
                      text-[10px] font-mono text-slate-500">
        <span>mAP50 99.5%</span>
        <span>·</span>
        <span>YOLOv8n v3</span>
        <span>·</span>
        <span>Apple M1</span>
        <span className="ml-auto">
          {running
            ? <span className="text-green-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                Live
              </span>
            : <span className="text-slate-600">Standby</span>
          }
        </span>
      </div>
    </main>
  );
}
