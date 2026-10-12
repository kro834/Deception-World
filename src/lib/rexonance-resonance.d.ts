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
  readonly tiles?: string;
  /** Its cell in the plates' atlas (and in the gold atlas). */
  readonly ax?: number;
  readonly ay?: number;
  /** On the body, finished, from the start (the driver). */
  readonly preset?: boolean;
}

export interface RexonanceAssemblyGold {
  /** The gold atlas: each plate's raw gunmetal channel, alpha the trims' mask. */
  atlas: string;
  cell: number;
  cells: Readonly<Record<string, string>>;
}

export const ASSEMBLY_GOLD: {
  delay: number;
  form: number;
  helm: number;
  approach: number;
  cool: number;
  glint: number;
};

export function planAssemblyGold(options: {
  pieces: readonly RexonanceAssemblyPiece[];
  gold: RexonanceAssemblyGold | undefined;
  landed: Map<string, number>;
}): {
  count: number;
  x: Float32Array;
  y: Float32Array;
  w: Float32Array;
  h: Float32Array;
  lock: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  overlaps: Int32Array[];
} | null;

export function assemblyGoldPlanSteps(
  options: {
    pieces: readonly RexonanceAssemblyPiece[];
    gold: RexonanceAssemblyGold | undefined;
  } & (
    | { landed: Map<string, number>; tiles?: never }
    | { landed?: never; tiles: readonly Pick<RexonanceAssemblyTile, "pieceId" | "t1">[] }
  ),
): Generator<undefined, ReturnType<typeof planAssemblyGold>, unknown>;

export function rewindAssemblyGold(
  context: Pick<CanvasRenderingContext2D, "clearRect" | "drawImage">,
  art: CanvasImageSource,
  gold: {
    x: Float32Array;
    y: Float32Array;
    w: Float32Array;
    h: Float32Array;
    overlaps: Int32Array[];
  },
  state: { count: number; dirty: number; at: number },
  target: number,
  budget: number,
): number;

export interface RexonanceAssemblyConfig {
  figure: string;
  undersuit: string;
  size: { readonly width: number; readonly height: number };
  pieces: readonly RexonanceAssemblyPiece[];
  maskTile?: number;
  core: readonly [number, number];
  visor: readonly [number, number];
  glow: readonly (readonly [number, number])[];
  gold?: RexonanceAssemblyGold;
  /** The plates' atlas (art | mosaic), for the driver's cut-outs. */
  atlas?: string;
  /** The MAX and ULTRA figures (same frame): the suit-up ends on the form
   * named by the runway's data-form. */
  forms?: {
    readonly max: string;
    readonly ultra: string;
    readonly excelsior?: string;
    /** How much wider either side the EXCELSIOR picture is than the frame. */
    readonly pad?: number;
  };
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
  depth: number;
  curveX: number;
  curveY: number;
  pieceId: string | null;
}

export const ASSEMBLY_BEATS: {
  scan: [number, number];
  motes: [number, number];
  deus: [number, number];
  rexonance: [number, number];
  clamp: number;
  seal: [number, number];
  light: [number, number];
  form: [number, number];
  pixels: [number, number];
  rings: [number, number];
  complete: number;
};

export const ASSEMBLY_PARTS: readonly string[];
export const ASSEMBLY_TOUCH_ART_BUDGET: number;

export function assemblyCacheStep(
  current: number,
  target: number,
  budget: number,
): {
  reset: boolean;
  start: number;
  end: number;
  remove: number;
  pending: boolean;
};
export function assemblyPhase(
  progress: number,
  form?: string,
  ready?: boolean,
): {
  phase: "prepare" | "assemble" | "seal" | "ignite" | "evolve" | "complete";
  complete: boolean;
};
export function assemblyTilePose(
  item: RexonanceAssemblyTile,
  progress: number,
  out?: Float32Array,
  offset?: number,
): Float32Array;

export function planAssembly(options: {
  size: { readonly width: number; readonly height: number };
  pieces: readonly RexonanceAssemblyPiece[];
  core: readonly [number, number];
  tile: number;
  maskTile?: number;
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
