"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Camera } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { useDetection } from "@/hooks/useDetection";
import { useScanStore } from "@/lib/store";
import DetectionOverlay from "./DetectionOverlay";
import TelemetryHUD from "./TelemetryHUD";
import ScanReticle from "./ScanReticle";

export default function CameraMode() {
  const { setResult, setLoading, setError } = useScanStore();
  const { videoRef, ready, error, captureFrame } = useCamera();
  const { result, loading, fps, startLoop, stopLoop } = useDetection(0.25);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });
  const [running, setRunning] = useState(false);

  useEffect(() => { setResult(result); }, [result, setResult]);
  useEffect(() => { setLoading(loading); }, [loading, setLoading]);
  useEffect(() => { if (error) setError(error); }, [error, setError]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => stopLoop(), [stopLoop]);

  const handleToggle = useCallback(() => {
    if (running) { stopLoop(); setRunning(false); }
    else { startLoop(captureFrame); setRunning(true); }
  }, [running, startLoop, stopLoop, captureFrame]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover" />

      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent
                      to-black/40 pointer-events-none" />

      {!result?.total_panels && <ScanReticle active={running} />}

      {result && containerSize.w > 1 && (
        <DetectionOverlay
          panels={result.panels}
          imageSize={result.image_size as [number, number]}
          containerSize={containerSize}
        />
      )}

      <TelemetryHUD fps={fps} latencyMs={result?.inference_ms ?? 0} loading={loading} />

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/70 p-6 rounded-xl border border-red-500/30 text-center">
            <Camera size={28} className="text-red-400 mx-auto mb-2" />
            <p className="text-red-400 text-sm font-mono">{error}</p>
            <p className="text-slate-500 text-xs mt-1">Use Upload mode instead</p>
          </div>
        </div>
      )}

      {!error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button
            onClick={handleToggle}
            disabled={!ready}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                        transition-colors disabled:opacity-40 shadow-lg
                        ${running
                          ? "bg-red-600 hover:bg-red-700 text-white shadow-red-500/25"
                          : "bg-white/10 hover:bg-white/20 text-white"
                        }`}
          >
            {running ? <Square size={14} /> : <Play size={14} />}
            {running ? "Stop" : "Start"}
          </button>
        </div>
      )}
    </div>
  );
}
