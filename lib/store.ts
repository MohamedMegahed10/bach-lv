import { create } from "zustand";
import { DetectionResult } from "./types";

export type ScanMode = "upload" | "camera" | "capture";

type ScanStore = {
  mode: ScanMode;
  result: DetectionResult | null;
  loading: boolean;
  error: string | null;
  uploadSrc: string | null;
  setMode: (mode: ScanMode) => void;
  setResult: (result: DetectionResult | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setUploadSrc: (src: string | null) => void;
};

export const useScanStore = create<ScanStore>((set) => ({
  mode: "upload",
  result: null,
  loading: false,
  error: null,
  uploadSrc: null,
  setMode: (mode) => set({ mode, result: null, error: null, uploadSrc: null }),
  setResult: (result) => set({ result }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setUploadSrc: (uploadSrc) => set({ uploadSrc }),
}));
