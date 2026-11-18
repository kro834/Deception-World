import { NANITE_FORGE_SHEETS } from "./nanite-surface-assets.js";
import { REXONANCE_NANITE_CELLS } from "./rexonance-nanites.ts";

const { cell, frames, width, height, unfold, lockFrame } = REXONANCE_NANITE_CELLS;
const unfoldStart = [...unfold.x, null] as const;

export function loadAssemblyCells(
  document: Document,
  alloy: "far-from" | "illusionculum" | "meta-unitas" | undefined,
) {
  if (!alloy) return null;
  const image = document.createElement("img");
  image.decoding = "async";
  image.src = NANITE_FORGE_SHEETS[alloy === "meta-unitas" ? "rexonance" : alloy];
  return image;
}

export function drawAssemblyCell(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  progress: number,
  seed: number,
  warm: boolean,
) {
  // First catch the light on the tumbling profile, then align face-on and
  // unfold into the lip. The cell's center stays on the same path throughout.
  const turn = 0.56;
  const row = seed < 0.54 ? 0 : seed < 0.86 ? (warm ? 3 : 1) : 2;
  const opened = Math.max(0, (progress - turn) / (1 - turn));
  const start = unfoldStart[row];
  const deployed = start !== null && opened > 0;
  const incoming = Math.round((8 + 9 * seed) * Math.max(0, 1 - progress / turn));
  const frame = deployed
    ? Math.min(unfold.frames - 1, Math.floor(opened * unfold.frames))
    : (lockFrame + frames - incoming) % frames;
  const sx = (deployed ? start : 0) + frame * cell;
  const sy = deployed ? unfold.y : row * cell;
  context.globalAlpha = Math.min(0.9, progress * 6, (1 - progress) * 5);
  context.drawImage(image, sx, sy, cell, cell, x - size * 0.5, y - size * 0.5, size, size);
}

export function assemblyCellsReady(image: HTMLImageElement | null): image is HTMLImageElement {
  return image?.complete === true && image.naturalWidth === width && image.naturalHeight === height;
}
