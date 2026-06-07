"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Aperture, RotateCcw } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { detect } from "@/lib/api";
import { useScanStore } from "@/lib/store";
import DetectionOverlay from "./DetectionOverlay";
import ScanReticle from "./ScanReticle";

export default function CaptureMode() {
  const { result, setResult, setLoading, setError } = useScanStore();
  const { videoRef, ready, error, captureFrame } = useCamera();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });
  const [frozen, setFrozen] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleCapture = useCallback(() => {
    const frame = captureFrame();
    if (!frame) return;
    setFrozen(frame);
    setResult(null);
    setError(null);
  }, [captureFrame, setResult, setError]);

  const handleAnalyze = useCallback(async () => {
    if (!frozen) return;
    setAnalyzing(true);
    setLoading(true);
    setError(null);
    try {
      const data = await detect(frozen, 0.25);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setAnalyzing(false);
      setLoading(false);
    }
  }, [frozen, setLoading, setError, setResult]);

  const handleRetake = useCallback(() => {
    setFrozen(null);
    setResult(null);
    setError(null);
  }, [setResult, setError]);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black overflow-hidden">
      {frozen ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frozen} alt="captured"
            className="absolute inset-0 w-full h-full object-cover" />

          {result && containerSize.w > 1 && (
            <DetectionOverlay
              panels={result.panels}
              imageSize={result.image_size as [number, number]}
              containerSize={containerSize}
            />
          )}

          {analyzing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="w-10 h-10 rounded-full border-2 border-red-500
                              border-t-transparent animate-spin" />
            </div>
          )}

          {!analyzing && !result && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
              <button onClick={handleRetake}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm
                           font-semibold bg-white/10 hover:bg-white/20 text-white transition">
                <RotateCcw size={14} /> Retake
              </button>
              <button onClick={handleAnalyze}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm
                           font-bold bg-red-500 hover:bg-red-600 text-white
                           shadow-lg shadow-red-500/25 transition">
                Analyze →
              </button>
            </div>
          )}

          {result && (
            <button onClick={handleRetake}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center
                         gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-black/70
                         hover:bg-black/90 text-white border border-white/20 transition">
              <RotateCcw size={12} /> Capture again
            </button>
          )}
        </>
      ) : (
        <>
          <video ref={videoRef} autoPlay muted playsInline
            className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent
                          to-black/40 pointer-events-none" />
          <ScanReticle active={ready} />

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
              <button onClick={handleCapture} disabled={!ready}
                className="w-16 h-16 rounded-full bg-white hover:bg-slate-200
                           disabled:opacity-40 transition-colors flex items-center
                           justify-center shadow-xl">
                <Aperture size={28} className="text-slate-900" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
