export type FieldTake = {
  readonly seed: number;
  readonly arms: number;
  readonly hand: 1 | -1;
  readonly twist: number;
  readonly tilt: number;
  readonly palette: number;
  readonly camera: number;
  readonly drift: 1 | -1;
  readonly phase: number;
};

export type FieldGroup = {
  x: number;
  y: number;
  sx?: number;
  sy?: number;
  from: number;
  lock: number;
  strength?: number;
  /** Where the lock's impulse strikes (its last plate's seat); x, y by default. */
  ix?: number;
  iy?: number;
};

export type FieldScore = {
  readonly wake: readonly [number, number];
  readonly collapse: readonly [number, number];
  readonly detonate: readonly [number, number] | null;
  readonly end: number;
  readonly impulse: number;
  readonly origin: readonly [number, number];
  readonly spread: readonly [number, number];
  readonly settle: number;
  readonly gather: number;
  readonly count: number;
  readonly gx: Float32Array;
  readonly gy: Float32Array;
  readonly gsx: Float32Array;
  readonly gsy: Float32Array;
  readonly gfrom: Float64Array;
  readonly glock: Float64Array;
  readonly gstrength: Float32Array;
  readonly gix: Float32Array;
  readonly giy: Float32Array;
};

/** A particle's birth: the burst fragment's handoff, x and y in figure
 * heights, its velocity in figure heights per wake, and (out[4]) its
 * stagger share of FIELD_BIRTH.stagger of the wake (left non-finite, the
 * birth's byte seeds decide). */
export type FieldFragment = (
  index: number,
  out: Float64Array | Float32Array,
) => Float64Array | Float32Array;

export type FieldLayer = {
  readonly canvases: HTMLCanvasElement[];
  readonly count: number;
  readonly lost: boolean;
  readonly ready: boolean;
  resize(width: number, height: number, devicePixelRatio?: number): void;
  render(
    state: Float32Array,
    scale: number,
    x: number,
    y: number,
    height: number,
    quality?: number,
    /** Left clear: [x0, y0, x1, y1] CSS px in the canvases' box. */
    keep?: ArrayLike<number> | null,
  ): number;
  clear(): void;
  release(): void;
};

export const FIELD_STATE: {
  readonly S: 0;
  readonly CHARGE: 1;
  readonly AX: 2;
  readonly AY: 3;
  readonly TIGHT: 4;
  readonly SPREAD_X: 5;
  readonly SPREAD_Y: 6;
  readonly COLLAPSE: 7;
  readonly DETONATE: 8;
  readonly IMPULSES: 9;
  readonly FLASH: 10;
  readonly GROUP: 11;
  readonly WAKE: 12;
  readonly WAKE_RATE: 13;
  readonly SETTLE: 14;
  readonly LOCKED: 15;
  readonly IMPULSE: 16;
  readonly IMPULSE_STRIDE: 4;
  readonly MAX_IMPULSES: 4;
  readonly LOCK: 32;
  readonly LOCK_STRIDE: 4;
  readonly MAX_LOCKED: 8;
  readonly LENGTH: 64;
};
export const FIELD_FLASH_SHARE: number;
export const FIELD_GATHER: Readonly<{ from: number; full: number; back: number }>;
export const FIELD_WAKE_RISE: number;
export const FIELD_CAMERA: {
  readonly push: readonly number[];
  readonly punch: number;
  readonly burst: number;
  readonly burstSpan: number;
  readonly attack: number;
  readonly decay: number;
  readonly follow: number;
  readonly drift: number;
  readonly pivotY: number;
  readonly maxZoom: number;
  readonly maxPan: number;
};
export const FIELD_IMPACT: {
  readonly pop: number;
  readonly discs: readonly number[];
  readonly rays: number;
  readonly reach: number;
  readonly burst: number;
};
export const FIELD_SHAPE: Readonly<Record<string, number>>;
export const FIELD_BIRTH: {
  readonly stagger: number;
  readonly drift: number;
  readonly drag: number;
  readonly sweep: readonly number[];
  readonly heat: number;
  readonly glow: number;
  readonly ignite: number;
  readonly hot: readonly number[];
  readonly fringe: readonly number[];
  readonly fringeShare: number;
};
export const FIELD_WAKE: readonly [number, number];
export const FIELD_WAKE_BIRTHS: number;
export const FIELD_FIGURE_ASPECT: number;
export const FIELD_SEEDS: {
  readonly A0: 0;
  readonly R0: 1;
  readonly YP: 2;
  readonly SPD: 3;
  readonly PICK: 4;
  readonly ARM: 5;
  readonly SIZE: 6;
  readonly MARKER: 7;
  readonly STAGGER: 8;
  readonly BX: 9;
  readonly BY: 10;
  readonly BVX: 11;
  readonly BVY: 12;
  readonly LENGTH: 13;
};
export const FIELD_GL: {
  readonly count: { readonly fine: number; readonly coarse: number };
  readonly resolution: { readonly fine: number; readonly coarse: number };
  readonly maxRatio: number;
  readonly maxCount: number;
  readonly bytesPerVertex: number;
  readonly verticesPerParticle: number;
  readonly indicesPerParticle: number;
  readonly edgeFade: number;
  readonly width: number;
  readonly minWidth: number;
  readonly alpha: { readonly fine: number; readonly coarse: number };
};
export const FIELD_TONES: {
  readonly ice: readonly number[];
  readonly pink: readonly number[];
  readonly white: readonly number[];
  readonly leads: readonly (readonly number[])[];
};
export type FieldTones = {
  readonly ice: readonly number[];
  readonly pink: readonly number[];
  readonly white: readonly number[];
  readonly leads?: readonly (readonly number[])[];
};
export const FIELD_VERTEX_SHADER: string;
export function fieldVertexShader(tones?: FieldTones): string;
export const FIELD_FRAGMENT_SHADER: string;
export const REXONANCE_SCROLL_FLAME: { readonly start: number; readonly span: number };

export function fieldHash(index: number, salt: number): number;
export function fieldVisitSeed(environment?: unknown): number;
export function fieldTake(seed: number): FieldTake;
export function fieldScore(options: {
  wake: readonly number[];
  groups: readonly FieldGroup[];
  collapse: readonly number[];
  detonate?: readonly number[] | null;
  end: number;
  impulse: number;
  origin: readonly number[];
  spread?: readonly number[];
  settle?: number;
  gather?: number;
}): FieldScore;
export function fieldStateBuffer(): Float32Array;
export function fieldState(score: FieldScore, clock: number, out: Float32Array): Float32Array;
export function fieldCameraBuffer(): Float32Array;
export function fieldPunch(age: number): number;
export function fieldCamera(
  state: Float32Array,
  take: FieldTake,
  height: number,
  out: Float32Array,
): Float32Array;
export function fieldCameraView(
  camera: Float32Array,
  width: number,
  height: number,
  scale: number,
  x: number,
  y: number,
  out: Float32Array | Float64Array,
): Float32Array | Float64Array;
export function drawFieldImpact(
  context: CanvasRenderingContext2D,
  state: Float32Array,
  width: number,
  height: number,
  hash: (index: number, salt: number) => number,
  rays?: boolean,
  additive?: boolean,
  pop?: boolean,
): boolean;
export function fieldFling(age: number): number;
export function fieldFragmentSeed(index: number): number;
export function fieldFragment(
  index: number,
  out: Float64Array | Float32Array,
): Float64Array | Float32Array;
export function fieldSeeds(
  index: number,
  arms: number,
  out: Float64Array,
  fragment?: FieldFragment,
): Float64Array;
export function fieldPose(
  seeds: ArrayLike<number>,
  s: number,
  state: Float32Array,
  take: FieldTake,
  height: number,
  out: Float32Array | Float64Array,
  wake?: number,
): Float32Array | Float64Array;
export function scrollFlamePhase(q: number): number;
export function scrollFlameAt(phase: number): number;
export function fieldContext(
  canvas: HTMLCanvasElement,
): WebGLRenderingContext | WebGL2RenderingContext | null;
export function fieldVertexBytes(count: number, arms: number, fragment?: FieldFragment): Uint8Array;
export function fieldIndices(count: number): Uint16Array;
export function createFieldLayer(options: {
  document?: Document;
  coarse?: boolean;
  take: FieldTake;
  count?: number | null;
  front?: boolean;
  className?: string;
  fragment?: FieldFragment;
  tones?: FieldTones;
}): FieldLayer | null;
