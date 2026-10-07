export type UltraRendererStatus = "ready" | "unsupported" | "context-lost" | "error";
export interface UltraRendererOptions {
  onStatus?: (status: UltraRendererStatus) => void;
  maxPixels?: number;
  maxDpr?: number;
  steps?: number;
  maxFps?: number;
}
export interface UltraRenderer {
  start(): void;
  pause(): void;
  resize(): void;
  dispose(): void;
  getDiagnostics(): {
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
  /** Normalized viewport coordinates, each clamped to -1..1. */
  setPointer(x: number, y: number): void;
  /** Linear RGB accent components, each clamped to 0..1. */
  setTheme(theme?: readonly [number, number, number]): void;
}
export function createUltraRenderer(
  canvas: HTMLCanvasElement,
  options?: UltraRendererOptions,
): UltraRenderer | null;
