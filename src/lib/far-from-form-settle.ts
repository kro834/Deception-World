/** FAR FROM SAGA — the finished form's flash, the form change's last beat
 * (far-from-form-shift.ts; owner, 2026-11-11). */

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const WHITE = "rgb(244 251 255)";

/** The finished form's flash (the change's last beat), on a context in
 * figure px over the finished figure: `canvas` (the scene's own, already
 * drawn) lit over itself, a ring leaving the reactor and a line of light
 * crossing the body, all easing out. `s` 0–1. */
export function drawFarFromSettle(
  context: CanvasRenderingContext2D,
  canvas: CanvasImageSource,
  s: number,
  size: { readonly width: number; readonly height: number },
  core: readonly [number, number],
  tone: string,
  px: number,
) {
  if (s < 0 || s >= 1) return;
  const out = 1 - (1 - s) * (1 - s) * (1 - s);
  const flash = (1 - s) * (1 - s);
  context.globalCompositeOperation = "lighter";
  // The armour itself, brighter for a moment.
  const matrix = context.getTransform();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 0.5 * flash * clamp01(s / 0.08 + 0.35);
  context.drawImage(canvas, 0, 0);
  context.setTransform(matrix);
  // The ring from the reactor.
  const radius = 26 + size.height * 0.62 * out;
  context.beginPath();
  context.ellipse(core[0], core[1], radius, radius * 0.94, 0, 0, Math.PI * 2);
  context.strokeStyle = tone;
  context.globalAlpha = 0.16 * flash;
  context.lineWidth = 14 * px;
  context.stroke();
  context.globalAlpha = 0.85 * flash;
  context.lineWidth = 1.4 * px;
  context.stroke();
  // The line of light, crown to soles.
  const y = size.height * (0.04 + 0.96 * out);
  context.fillStyle = WHITE;
  context.globalAlpha = 0.5 * flash;
  context.fillRect(size.width * 0.08, y - 0.8 * px, size.width * 0.84, 1.6 * px);
  context.globalAlpha = 0.1 * flash;
  context.fillRect(size.width * 0.08, y - 16 * px, size.width * 0.84, 16 * px);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
}
