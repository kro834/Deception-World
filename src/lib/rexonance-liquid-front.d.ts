export const LIQUID_RAG: number;
export function fitLiquidFront(
  count: number,
  at: (i: number, out: Float64Array) => void,
  seed?: number,
): Float32Array | null;
export function liquidProgress(front: Float32Array, t: number): number;
export function liquidFrontPath(
  context: Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "closePath">,
  front: Float32Array,
  t: number,
  set?: boolean,
  ahead?: number,
): 0 | 1 | 2;
