import type { RexonanceAssemblyNanites, RexonanceAssemblyPiece } from "./rexonance-resonance";

/** ZENITH nanites (owner, 2026-10-16: 超大幅な改善): per-plate timings. */
export const ASSEMBLY_NANITES: {
  readonly lead: number;
  readonly sweep: number;
  readonly seat: number;
  readonly overshoot: number;
  readonly seam: number;
  readonly seamGlow: number;
  readonly shock: number;
  readonly paint: number;
  readonly lacquer: number;
  readonly print: number;
  readonly recoil: number;
  readonly spark: number;
  readonly link: number;
  readonly release: number;
  readonly clampIn: number;
  readonly crown: readonly [number, number];
  readonly implode: readonly [number, number];
};
export const ASSEMBLY_SPRITE_BUDGET: number;
export const ASSEMBLY_COMET_BUDGET: number;
export const ASSEMBLY_TOUCH_HERO_BUDGET: number;

export function naniteHash(index: number, salt: number): number;

export interface NaniteRings {
  count: number;
  cy: Float64Array;
  rx: Float64Array;
  ry: Float64Array;
  cos: Float64Array;
  sin: Float64Array;
  dir: Float64Array;
  /** Radians per unit progress. */
  omega: Float64Array;
}
export function naniteRings(width: number, height: number): NaniteRings;

/** A seam's loops, figure px, as flat [x, y, …] lists. */
export function decodeNaniteSeam(base64: string | undefined): Float32Array[];

export interface NanitePlate {
  index: number;
  id: string;
  group: string;
  /** 0 armour, 1 tail, 2 ribbon, 3 helmet. */
  kind: number;
  seg: number;
  helm: boolean;
  ornament: boolean;
  srcMask: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  seatX: number;
  seatY: number;
  nx: number;
  ny: number;
  gateX: number;
  gateY: number;
  gx: number;
  gy: number;
  lift: number;
  theta: number;
  offX: number;
  offY: number;
  area: number;
  from: number;
  to: number;
  contact: number;
  stageEnd: number;
  accent: boolean;
  crest: boolean;
  reach: number;
  shock: number;
  spall: number;
  gbox: [number, number, number, number];
  hasGoldBox: boolean;
  loopFirst: number;
  loopCount: number;
  tiles: Int32Array;
  t1s: Float64Array;
  goldFirst: number;
  goldEnd: number;
  g0: number;
  g1: number;
  span: number;
  recedeEnd: number;
  releaseEnd: number;
}

export interface NanitePlan {
  count: number;
  pieces: NanitePlate[];
  T0: Float64Array;
  T1: Float64Array;
  M: Float64Array;
  CX: Float32Array;
  CY: Float32Array;
  SX: Float32Array;
  SY: Float32Array;
  TW: Float32Array;
  TH: Float32Array;
  SRC: Uint8Array;
  TONE: Uint8Array;
  COV: Float32Array;
  pieceOf: Int16Array;
  ring: Uint8Array;
  lane: Int8Array;
  th0: Float32Array;
  phi: Float32Array;
  f0: Float32Array;
  spin: Float32Array;
  r0: Float32Array;
  psi0: Float32Array;
  birth: Float64Array;
  arm: Uint8Array;
  armDir: Int8Array;
  gateJ: Float32Array;
  helmD: Float32Array;
  hsh: Float32Array;
  tp: Float64Array;
  parent: Int32Array;
  under: Int32Array;
  paintOrder: Int32Array;
  paintAt: Float64Array;
  paintRank: Int32Array;
  goldIdx: Int32Array;
  goldHash: Float32Array;
  rings: NaniteRings;
  free: {
    count: number;
    ring: Uint8Array;
    lane: Int8Array;
    th0: Float32Array;
    phi: Float32Array;
    f0: Float32Array;
    spin: Float32Array;
    birth: Float64Array;
    arm: Uint8Array;
    armDir: Int8Array;
    tone: Uint8Array;
    hsh: Float32Array;
  };
  seams: {
    x: Float32Array;
    y: Float32Array;
    cum: Float32Array;
    start: Int32Array;
    count: Int32Array;
    perimeter: Float32Array;
  };
}

export interface NanitePlanOptions {
  plan: {
    tiles: readonly {
      sx: number;
      sy: number;
      tw: number;
      th: number;
      cx: number;
      cy: number;
      m: number;
      t0: number;
      t1: number;
      beat?: number;
      tone?: number;
      src?: number;
      cov?: number;
      pieceId: string | null;
    }[];
    cols: number;
    rows: number;
    tile: number;
  };
  pieces: readonly RexonanceAssemblyPiece[];
  size: { readonly width: number; readonly height: number };
  core: readonly [number, number];
  visor?: readonly [number, number] | null;
  gold?: {
    count: number;
    x: Float32Array;
    y: Float32Array;
    w: Float32Array;
    h: Float32Array;
    lock: Float32Array;
    piece: Int16Array;
  } | null;
  seams?: Readonly<Record<string, string>> | null;
  goldBoxes?: Readonly<Record<string, readonly [number, number, number, number]>> | null;
  coarse?: boolean;
}

export function assemblyNanitePlanSteps(
  options: NanitePlanOptions,
): Generator<undefined, NanitePlan, unknown>;
export function planAssemblyNanites(options: NanitePlanOptions): NanitePlan;

export function naniteLatticeSteps(
  context: CanvasRenderingContext2D,
  nano: NanitePlan,
  tile: number,
): Generator<undefined, void, unknown>;

export interface AssemblyNanitesState {
  shakeX: number;
  shakeY: number;
  sprites: number;
  heroes: number;
  nanites: number;
  comets: number;
}

type Pass = (context: CanvasRenderingContext2D) => void;

export interface AssemblyNanites {
  state: AssemblyNanitesState;
  frame(q: number, dq: number, calm: boolean, scale: number, backRects: boolean): AssemblyNanitesState;
  view(scale: number, x: number, y: number): void;
  paintedBy(q: number): number;
  backPass: Pass;
  midPass: Pass;
  seatedPass(context: CanvasRenderingContext2D, painted: number): void;
  moltenPass: Pass;
  hologramPass: Pass;
  shadowPass: Pass;
  stagedPass: Pass;
  conduitPass: Pass;
  hardwarePass: Pass;
  flightPass: Pass;
  impactPass: Pass;
  goldPass: Pass;
  frontPass: Pass;
  freePass: Pass;
  endFrame(): void;
}

type Sheet = CanvasImageSource | null;

export function createAssemblyNanites(options: {
  nano: NanitePlan;
  size: { readonly width: number; readonly height: number };
  core: readonly [number, number];
  visor?: readonly [number, number] | null;
  coarse?: boolean;
  sprites?: { cells?: Sheet; comets?: Sheet; fx?: Sheet } | null;
  kit?: RexonanceAssemblyNanites | null;
  layers?: {
    metal?: [Sheet, Sheet];
    silhouette?: [Sheet, Sheet];
    art?: [Sheet, Sheet];
    motes?: [Sheet, Sheet];
    holo?: Sheet;
    walls?: Sheet;
    face?: Sheet;
    frame?: Sheet;
    frameDeep?: Sheet;
    molten?: Sheet;
    goldArt?: Sheet;
    lattice?: Sheet;
  };
  gold?: NanitePlanOptions["gold"] & { ux: Float32Array; uy: Float32Array };
  goldCell?: number;
  touchArtBudget?: number;
}): AssemblyNanites;
