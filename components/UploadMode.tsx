"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { Upload, X } from "lucide-react";
import { detect } from "@/lib/api";
import { useScanStore } from "@/lib/store";
import DetectionOverlay from "./DetectionOverlay";

export default function UploadMode() {
  const { result, uploadSrc, setResult, setLoading, setError, setUploadSrc } = useScanStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [uploadSrc]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    const toJpeg = (src: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext("2d")!.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = reject;
        img.src = src;
      });

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string;
        const jpeg = await toJpeg(raw);
        setUploadSrc(jpeg);
        setLoading(true);
        setError(null);
        const data = await detect(jpeg, 0.25);
        setResult(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Detection failed");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }, [setUploadSrc, setLoading, setError, setResult]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {uploadSrc ? (
        <>
          {/* Wrapper sized to rendered image — overlay is relative to this */}
          <div ref={containerRef} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uploadSrc} alt="uploaded"
              className="block max-w-full max-h-full object-contain" />

            {result && containerSize.w > 1 && (
              <DetectionOverlay
                panels={result.panels}
                imageSize={result.image_size as [number, number]}
                containerSize={containerSize}
              />
            )}
          </div>

          {/* Clear button */}
          <button
            onClick={() => { setUploadSrc(null); setResult(null); setError(null); }}
            className="absolute top-3 right-3 flex items-center justify-center
                       w-8 h-8 rounded-full bg-black/70 hover:bg-red-600
                       text-white border border-white/20 transition-colors"
            title="Clear image"
          >
            <X size={14} />
          </button>

          {/* Re-upload button */}
          <label className="absolute bottom-4 left-1/2 -translate-x-1/2 cursor-pointer
                            px-4 py-2 bg-black/70 hover:bg-black/90 text-white text-xs
                            font-mono rounded-lg border border-white/20 transition-colors">
            Upload another
            <input type="file" accept="image/*" className="hidden" onChange={onInputChange} />
          </label>
        </>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-4 w-full h-full
                      cursor-pointer border-2 border-dashed rounded-2xl transition-colors
                      ${dragging
                        ? "border-red-500 bg-red-500/5"
                        : "border-white/10 hover:border-white/25 bg-slate-800/30"
                      }`}
        >
          <Upload size={36} className={dragging ? "text-red-400" : "text-slate-600"} />
          <div className="text-center">
            <p className="text-slate-300 text-sm font-semibold">Drop an image here</p>
            <p className="text-slate-500 text-xs mt-1">or click to browse — JPG, PNG</p>
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={onInputChange} />
        </label>
      )}
    </div>
  );
}
