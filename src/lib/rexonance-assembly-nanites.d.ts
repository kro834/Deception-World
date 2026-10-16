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
  readonly clampHold: number;
  readonly crown: readonly [number, number];
  readonly implode: readonly [number, number];
};
/** The gold guideway's build (owner, 2026-10-16: built smoothly from the
 * toe tips upward along the trims, never laid over from above). */
export const ASSEMBLY_GUIDEWAY: {
  /** The front's speed, figure px per unit progress. */
  readonly climb: number;
  /** The least time between a conduit's completion and its plate's contact. */
  readonly ready: number;
  /** The most a beat's climb runs ahead of its first fitting. */
  readonly early: number;
  /** How far the ice hologram runs ahead of the solid conduit. */
  readonly holo: number;
  /** The weld head's length. */
  readonly head: number;
  /** The sparks' life behind the head. */
  readonly ember: number;
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
  /** Formed in place, never staged: the helmet and the narrow hanging plates. */
  fixed: boolean;
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
  /** The guideway's build window: from its lowest cell to its last. */
  buildStart: number;
  buildEnd: number;
  /** Its climb (the beat; the ribbons climb on their own). */
  climb: number;
  /** One cell step of its front (progress): the time a cell takes to fill. */
  cellT: number;
  /** Its clamps: size (× the sprite), corners drawn (bits tl, tr, bl, br),
   * and each corner's anchor [x0, y0, … x3, y3] (figure px). */
  clampK: number;
  clampMask: number;
  clamp: Float32Array | null;
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
  /** How far past q (progress) the seated pass looks along the paint order:
   * the longest a landed tile waits for its paint with no stage holding it. */
  seatLag: number;
  goldIdx: Int32Array;
  goldHash: Float32Array;
  /** Per gold cell: its place along its plate's guideway, 0 at the entry. */
  buildB: Float32Array;
  /** Per plate (its gold range), its cells and their build times, sorted. */
  buildAt: Float64Array;
  buildIdx: Int32Array;
  /** Per gold cell: the step the front reached it by (−1, 0, 1 per axis). */
  buildDX: Int8Array;
  buildDY: Int8Array;
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
  /** The gold cells' size, figure px (4). */
  goldCell?: number;
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
  frame(
    q: number,
    dq: number,
    calm: boolean,
    scale: number,
    backRects: boolean,
  ): AssemblyNanitesState;
  view(scale: number, x: number, y: number): void;
  paintedBy(q: number): number;
  backPass: Pass;
  midPass: Pass;
  seatedPass(context: CanvasRenderingContext2D, painted: number): void;
  moltenPass: Pass;
  /** `covered`: the guideways under staged plates (drawn after the shells). */
  hologramPass(context: CanvasRenderingContext2D, covered?: boolean): void;
  shadowPass: Pass;
  stagedPass: Pass;
  conduitPass: Pass;
  lacquerPass: Pass;
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
    holo?: Sheet;
    walls?: Sheet;
    face?: Sheet;
    /** Touch: the conduits' faces laid in the figure, [armour, ornaments]. */
    figFace?: [Sheet, Sheet] | null;
    /** One byte per gold cell: 1 where the finished art shows gold. */
    goldVisible?: Uint8Array | null;
    frame?: Sheet;
    frameDeep?: Sheet;
    molten?: Sheet;
    goldArt?: Sheet;
    lattice?: Sheet;
  };
  gold?: NanitePlanOptions["gold"] & { ux: Float32Array; uy: Float32Array };
  goldCell?: number;
  touchArtBudget?: number;
  /** For the swarm's own small sheets (the tinted shock rings). */
  document?: Document;
}): AssemblyNanites;

/** How much a pixel of the finished art reads as gold, 0–1. */
export function naniteGoldTone(r: number, g: number, b: number): number;

export interface NaniteConduitCell {
  w: number;
  h: number;
  fx: number;
  fy: number;
  /** How far before a cut the conduit fades out (px, default 5). */
  fade?: number;
}
export interface NaniteConduitIO {
  guide: Uint8ClampedArray;
  gold: Uint8ClampedArray;
  art: Uint8ClampedArray;
  m: Float32Array;
  tn: Float32Array;
  hm: Float32Array;
  d: Uint16Array;
  dc: Uint16Array;
  face: Uint8ClampedArray;
  holo?: Uint8ClampedArray | null;
  walls?: Uint8ClampedArray | null;
  mask: Uint8ClampedArray;
  figFace?: Uint8ClampedArray | null;
  W: number;
  H: number;
}
/** One plate's conduit, row by row (yields after every row). */
export function naniteConduitRows(cell: NaniteConduitCell, io: NaniteConduitIO): Generator<void, void, void>;

export interface AssemblyConduitResult {
  face: HTMLCanvasElement;
  holo: HTMLCanvasElement | null;
  walls: HTMLCanvasElement | null;
  mask: HTMLCanvasElement;
  figFace: [HTMLCanvasElement, HTMLCanvasElement] | null;
  vis: Uint8Array;
}
export interface AssemblyConduitJob {
  step(until: number, idleDeadline?: { timeRemaining(): number } | null): boolean;
  commit(): AssemblyConduitResult | null;
  cancel(): void;
}
/** The conduit's layers for every plate, as an idle job (the pixel jobs' contract). */
export function createAssemblyConduitJob(options: {
  guide: CanvasImageSource & { width: number; height: number };
  gold: CanvasImageSource;
  art: CanvasImageSource;
  pieces: readonly {
    x: number;
    y: number;
    w: number;
    h: number;
    ax: number;
    ay: number;
    layer: number;
    fade?: number;
  }[];
  size: { readonly width: number; readonly height: number };
  goldPlan?: { count: number; x: ArrayLike<number>; y: ArrayLike<number>; w: ArrayLike<number>; h: ArrayLike<number> } | null;
  holo?: boolean;
  walls?: boolean;
  figureFace?: boolean;
  document?: Document;
}): AssemblyConduitJob | null;

export interface AssemblyLayerJob<R> {
  step(until: number, idleDeadline?: { timeRemaining(): number } | null): boolean;
  commit(): R | null;
  cancel(): void;
}
/** The raw nanite metal or the molten gold for the whole figure, a band of
 * rows at a time (the formulas of createNaniteMetalJob and
 * createNaniteMoltenJob). */
export function createAssemblyLayerJob(options: {
  source: CanvasImageSource;
  width: number;
  height: number;
  kind: "metal" | "molten";
  silhouette?: boolean;
  pitch?: number;
  mask?: CanvasImageSource | null;
  document?: Document;
}): AssemblyLayerJob<{
  metal?: HTMLCanvasElement;
  silhouette?: HTMLCanvasElement;
  molten?: HTMLCanvasElement;
}> | null;
