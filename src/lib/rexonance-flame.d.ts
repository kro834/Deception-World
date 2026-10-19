export const NANITE_FLAME_ATLAS: Readonly<{
  src: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  frames: number;
  tileWidth: number;
  tileHeight: number;
  fps: number;
}>;
export function warmNaniteFlame(environment?: typeof globalThis): Promise<boolean>;
export function naniteFlameReady(): boolean;
export function drawNaniteFirebrand(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  strength: number,
  clock: number,
  scale?: number,
): void;
export function prepareBodyFlame(
  source: CanvasImageSource,
  size: { readonly width: number; readonly height: number },
  environment?: typeof globalThis,
): boolean;
export function drawNaniteFlame(
  context: CanvasRenderingContext2D,
  core: readonly [number, number],
  strength: number,
  clock: number,
  scale?: number,
): void;
export function drawBodyFlame(
  context: CanvasRenderingContext2D,
  size: { readonly width: number; readonly height: number },
  strength: number,
  clock: number,
  scale?: number,
  layer?: "back" | "front" | "all",
  phase?: number,
): void;
