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
): void;
