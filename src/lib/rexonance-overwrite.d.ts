export interface RexonanceOverwritePlan {
  cols: number;
  rows: number;
  cell: number;
  width: number;
  height: number;
  key: Float32Array;
  extra: Uint8Array;
  gone: Uint8Array;
  flight: Float32Array;
}
export function planOverwrite(options: {
  width: number;
  height: number;
  cell: number;
  origin: readonly [number, number];
  seed?: number;
  samples?: { from: Uint8ClampedArray; to: Uint8ClampedArray } | null;
  order?: "radial" | "descend";
  extraBy?: "emerald" | "difference";
}): RexonanceOverwritePlan;
export function drawOverwrite(
  context: CanvasRenderingContext2D,
  plan: RexonanceOverwritePlan,
  from: CanvasImageSource,
  to: CanvasImageSource,
  u: number,
  v?: number,
  tone?: string,
  calm?: boolean,
  style?: "square" | "shard",
): void;
export function sampleCells(
  picture: CanvasImageSource,
  plan: { cols: number; rows: number },
  document?: Document,
): Uint8ClampedArray | null;
export const FORM_TONES: { standard: string; max: string; ultra: string; excelsior: string };
export const FORM_CHANGE_MS: {
  max: number;
  quick: number;
  ultra: number;
  extra: number;
  excelsior: number;
};
export function warpPicture(
  context: CanvasRenderingContext2D,
  picture: CanvasImageSource & { width?: number; height?: number },
  box: { x: number; y: number; w: number; h: number },
  own: readonly (readonly [number, number])[],
  target: readonly (readonly [number, number])[],
): void;
export const FORM_LANDMARKS: {
  panel: { ultra: [number, number][]; excelsior: [number, number][] };
  figure: { ultra: [number, number][]; excelsior: [number, number][] };
};
export const EXCELSIOR_LANDMARK_REFERENCE: {
  width: number;
  height: number;
  fit: {
    left: number;
    top: number;
    width: number;
    height: number;
    originX: number;
    frameWidth: number;
    frameHeight: number;
  };
  points: Readonly<Record<string, readonly [number, number]>>;
};
