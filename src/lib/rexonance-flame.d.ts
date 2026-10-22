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
export const NANITE_FIRE_BACKING: Readonly<{
  width: number;
  height: number;
  touchWidth: number;
  touchHeight: number;
}>;
export function warmNaniteFlame(environment?: typeof globalThis): Promise<boolean>;
export function naniteFlameReady(): boolean;
/** `tone` (every draw below): the fire's end tone, fire-tuning.js
 * FIRE_TONES — 0 (the default) the clean cyan-blue combustion Rexonance
 * ends in, 1 the gold Far From ends in, between them a mix. */
export function drawNaniteFirebrand(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  strength: number,
  clock: number,
  scale?: number,
  tone?: number,
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
  tone?: number,
): void;
/** The body fire: kindles at the soles, engulfs the undersuit, turns to
 * complete combustion and detonates into the nanites by flameEnd. Phase
 * is the shared entry/scroll ignition clock; omitted, strength stands for
 * how far along a full torch is. */
export function drawBodyFlame(
  context: CanvasRenderingContext2D,
  size: { readonly width: number; readonly height: number },
  strength: number,
  clock: number,
  scale?: number,
  layer?: "back" | "front" | "all",
  phase?: number,
  tone?: number,
): void;
/** Frees the GPU objects and fallback surfaces; the next frame rebuilds. */
export function releaseBodyFlame(): void;
export function inspectBodyFlame(): {
  mode: number;
  coarse: boolean;
  field: Uint8Array | null;
  noise: Uint8Array | null;
  renderer: object | null;
  glCanvas: HTMLCanvasElement | null;
  glLost: boolean;
  rasterBack: HTMLCanvasElement | null;
  rasterFront: HTMLCanvasElement | null;
  pose: Float64Array;
  fragments: Float32Array;
  /** The end tone of the frame last rendered (FIRE_TONES). */
  tone: number;
  retained: boolean;
};
/** Retired into the body fire (its hot core, tongues and sparks): a no-op
 * kept for the scenes' existing calls. */
export function drawFlameHeat(
  context: CanvasRenderingContext2D,
  size: { readonly width: number; readonly height: number },
  strength: number,
  clock: number,
  scale?: number,
): void;
