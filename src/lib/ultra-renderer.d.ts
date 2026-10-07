export type UltraRendererStatus = "ready" | "unsupported" | "context-lost" | "error";
export type UltraRendererQuality = "high" | "cinema";
export type UltraMaterialState = "pending" | "baked" | "fallback";
export interface UltraRendererOptions {
  /** Preset defaults; explicit numeric options still obey the renderer hard caps. */
  quality?: UltraRendererQuality;
  onStatus?: (status: UltraRendererStatus) => void;
  /** Separate from GPU ready: baked requires both uploaded maps and a successful draw. */
  onMaterialState?: (state: UltraMaterialState) => void;
  /** Layout-CSS gutter matching the canvas inset; a transparent inner safety gap is reserved. */
  frameWidthPx?: number;
  maxPixels?: number;
  maxDpr?: number;
  /** Legacy compatibility input; analytic frame optics have no ray-march steps. */
  steps?: number;
  maxFps?: number;
}
export interface UltraRenderer {
  /** Advance subtle gutter-only studio highlights while this local frame is active. */
  start(): void;
  pause(): void;
  resize(): void;
  dispose(): void;
  getDiagnostics(): {
    requestedQuality: UltraRendererQuality;
    /** Deterministic subpixel count; cinema backoff reduces this from two to one. */
    effectiveSamples: 1 | 2;
    /** Analytic optics, with no ray marching. */
    steps: 0;
    frameWidthPx: number;
    materialState: UltraMaterialState;
    requestedFps: number;
    /** Applied frame-rate ceiling after backoff, not measured throughput. */
    actualFps: number;
    measuredRafFps: number | null;
    resolutionScale: number;
    maxPixels: number;
    width: number;
    height: number;
    ready: boolean;
    running: boolean;
    lost: boolean;
  };
  /** Normalized coordinates within this image host, each clamped to -1..1. */
  setPointer(x: number, y: number): void;
  /** Linear RGB accent components, each clamped to 0..1. */
  setTheme(theme?: readonly [number, number, number]): void;
}
export function createUltraRenderer(
  canvas: HTMLCanvasElement,
  options?: UltraRendererOptions,
): UltraRenderer | null;
