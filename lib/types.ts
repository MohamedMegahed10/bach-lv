export interface Breaker {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] relative to panel ROI
  label: string;
  is_on: boolean;
}

export interface PanelDetection {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] in image coords
  confidence: number;
  status: "open" | "closed";
  is_dangerous: boolean;
  hazard_level: "none" | "low" | "medium" | "high";
  brand: string;
  breakers_total: number;
  breakers_off: number;
  components: Record<string, number>;
  breaker_list: Breaker[];
}

export interface DetectionResult {
  panels: PanelDetection[];
  total_panels: number;
  inference_ms: number;
  image_size: [number, number]; // [width, height]
}

export interface HistoryEntry {
  timestamp: number;
  result: DetectionResult;
  thumbnail?: string; // base64 frame snapshot
}
