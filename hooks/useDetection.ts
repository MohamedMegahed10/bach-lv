"use client";

import { useCallback, useRef, useState } from "react";
import { detect } from "@/lib/api";
import { DetectionResult, HistoryEntry } from "@/lib/types";

const MAX_HISTORY = 50;

export interface UseDetectionReturn {
  result: DetectionResult | null;
  loading: boolean;
  fps: number;
  history: HistoryEntry[];
  startLoop: (captureFrame: () => string | null) => void;
  stopLoop: () => void;
}

export function useDetection(conf: number = 0.25): UseDetectionReturn {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const runningRef = useRef(false);
  const frameTimesRef = useRef<number[]>([]);

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    setLoading(false);
    setFps(0);
  }, []);

  const startLoop = useCallback(
    (captureFrame: () => string | null) => {
      if (runningRef.current) return;
      runningRef.current = true;

      async function loop() {
        if (!runningRef.current) return;

        const frame = captureFrame();
        if (!frame) {
          // No frame yet — retry shortly
          if (runningRef.current) setTimeout(loop, 200);
          return;
        }

        setLoading(true);
        const t0 = performance.now();

        try {
          const data = await detect(frame, conf);

          if (!runningRef.current) return;

          setResult(data);

          // FPS calculation — track last 10 frame deltas
          const now = performance.now();
          frameTimesRef.current.push(now);
          if (frameTimesRef.current.length > 10) frameTimesRef.current.shift();
          if (frameTimesRef.current.length >= 2) {
            const span =
              frameTimesRef.current[frameTimesRef.current.length - 1] -
              frameTimesRef.current[0];
            const avgInterval = span / (frameTimesRef.current.length - 1);
            setFps(Math.round(1000 / avgInterval));
          }

          // Append to history if panels detected
          if (data.total_panels > 0) {
            setHistory((prev) => {
              const entry: HistoryEntry = {
                timestamp: Date.now(),
                result: data,
                thumbnail: frame,
              };
              return [entry, ...prev].slice(0, MAX_HISTORY);
            });
          }
        } catch {
          // Silently ignore network errors during live loop
        } finally {
          if (runningRef.current) setLoading(false);
        }

        // Throttle: aim for ~4 fps to avoid hammering the Python API
        const elapsed = performance.now() - t0;
        const delay = Math.max(0, 250 - elapsed);
        if (runningRef.current) setTimeout(loop, delay);
      }

      loop();
    },
    [conf]
  );

  return { result, loading, fps, history, startLoop, stopLoop };
}
