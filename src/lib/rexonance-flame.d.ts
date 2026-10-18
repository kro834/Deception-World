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
): void;
