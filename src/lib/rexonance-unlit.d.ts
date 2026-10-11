export function splitLights(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
  document?: Document,
): { unlit: HTMLCanvasElement; lights: HTMLCanvasElement } | null;
