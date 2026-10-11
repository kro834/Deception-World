export interface RexonanceCountTemplate {
  prefix: string;
  suffix: string;
  width: number;
  decimals: number;
  grouped: boolean;
  value: number;
}

export function countTemplate(text: string): RexonanceCountTemplate | null;

export function formatCount(template: RexonanceCountTemplate, current: number): string;

export function mountRexonanceResonance(
  page: HTMLElement | null,
  environment?: typeof globalThis,
): () => void;

export interface RexonanceAssemblyPiece {
  readonly id: string;
  readonly group: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly seat: readonly [number, number];
}

export interface RexonanceAssemblyConfig {
  figure: string;
  undersuit: string;
  size: { readonly width: number; readonly height: number };
  pieces: readonly RexonanceAssemblyPiece[];
  core: readonly [number, number];
  visor: readonly [number, number];
  glow: readonly (readonly [number, number])[];
}

export interface RexonanceAssemblyTile {
  sx: number;
  sy: number;
  tw: number;
  th: number;
  cx: number;
  cy: number;
  ox: number;
  oy: number;
  m: number;
  t0: number;
  t1: number;
  hover: number;
  beat: number;
  tone: number;
  fill: string;
  spin: number;
}

export const ASSEMBLY_BEATS: {
  scan: [number, number];
  motes: [number, number];
  deus: [number, number];
  rexonance: [number, number];
  clamp: number;
  seal: [number, number];
  pixels: [number, number];
  rings: [number, number];
  complete: number;
};

export const ASSEMBLY_PARTS: readonly string[];

export function planAssembly(options: {
  size: { readonly width: number; readonly height: number };
  pieces: readonly RexonanceAssemblyPiece[];
  core: readonly [number, number];
  tile: number;
  sample?: { data: ArrayLike<number> } | null;
  seed?: number;
}): {
  tiles: RexonanceAssemblyTile[];
  cols: number;
  rows: number;
  tile: number;
  partDone: number[];
  centroids: [number, number][];
};

export function mountRexonanceAssembly(
  runway: HTMLElement | null,
  config: RexonanceAssemblyConfig | null,
  environment?: typeof globalThis,
): () => void;
