import type { FAR_FROM_ENTRY_SWARM } from "./far-from-entry-calls";

export function chipHash(c: number, salt: number): number;

export const CHIP_X: 0;
export const CHIP_Y: 1;
export const CHIP_SIZE: 2;
export const CHIP_FRAME: 3;
export const CHIP_ALPHA: 4;
export const CHIP_DEPTH: 5;
export const CHIP_STATE: 6;
export const CHIP_SLOTS: 7;

export type FarFromSwarmTiles = {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly start: Float32Array;
};
export type FarFromSwarmPlan = {
  readonly count: number;
  readonly free: number;
  readonly bound: number;
  readonly seed: Float32Array;
  readonly born: Float32Array;
  readonly ring: Uint8Array;
  readonly angle: Float32Array;
  readonly omega: Float32Array;
  readonly radius: Float32Array;
  readonly height: Float32Array;
  readonly hover: Float32Array;
  readonly size: Float32Array;
  readonly tone: Uint8Array;
  readonly kit: Uint8Array;
  readonly tumble: Float32Array;
  readonly rate: Float32Array;
  readonly plate: Int16Array;
  readonly drainAt: Float32Array;
  readonly arriveAt: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly under: Float64Array;
  readonly centre: Float64Array;
  readonly figW: number;
  readonly figH: number;
  readonly swarm: typeof FAR_FROM_ENTRY_SWARM;
  readonly reactor: Float64Array;
};
export function planFarFromSwarm(options: {
  count: number;
  free: number;
  tiles: FarFromSwarmTiles;
  plateTiles: Int32Array;
  under: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  figure: {
    readonly width: number;
    readonly height: number;
    readonly core: readonly [number, number];
  };
  swarm: typeof FAR_FROM_ENTRY_SWARM;
  kitB: number;
}): FarFromSwarmPlan;
export function farFromChipPose(
  plan: FarFromSwarmPlan,
  c: number,
  t: number,
  out: Float64Array,
): Float64Array;
export const FAR_FROM_FIREBRAND_FROM: number;
