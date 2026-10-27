/** Shared CPU/GPU spring constants. CPU samples only when a brush retargets
 * a tile; normal animation is evaluated per instance in the vertex shader. */
export const SEQUIN_SPRING = Object.freeze({ omega: 16, damping: 0.43, settle: 1.8 });
export type SequinFit = "cover" | "contain";
export type SequinGrid = {
  width: number;
  height: number;
  pitch: number;
  cols: number;
  rows: number;
  count: number;
};

export function sequinGrid(width: number, height: number, coarse = false): SequinGrid {
  const w = Math.max(1, width),
    h = Math.max(1, height);
  const budget = coarse ? 6200 : 14000;
  let pitch = Math.max(coarse ? 12 : 10, Math.sqrt((w * h) / (budget * 0.9)));
  let cols = Math.ceil(w / pitch),
    rows = Math.ceil(h / pitch);
  while (cols * rows > budget) {
    pitch *= 1.02;
    cols = Math.ceil(w / pitch);
    rows = Math.ceil(h / pitch);
  }
  return { width: w, height: h, pitch, cols, rows, count: cols * rows };
}

/** Writes angle and velocity into caller-owned scratch, with no allocation. */
export function sampleSequinSpring(
  angle: number,
  velocity: number,
  target: number,
  elapsed: number,
  out: Float64Array,
) {
  if (elapsed >= SEQUIN_SPRING.settle) {
    out[0] = target;
    out[1] = 0;
    return out;
  }
  const t = Math.max(0, elapsed),
    d = SEQUIN_SPRING.omega * SEQUIN_SPRING.damping;
  const w = SEQUIN_SPRING.omega * Math.sqrt(1 - SEQUIN_SPRING.damping ** 2);
  const a = angle - target,
    b = (velocity + d * a) / w,
    e = Math.exp(-d * t),
    c = Math.cos(w * t),
    s = Math.sin(w * t);
  out[0] = target + e * (a * c + b * s);
  out[1] = e * ((-d * a + w * b) * c + (-d * b - w * a) * s);
  return out;
}

/** CSS object-position equivalent; cover keeps the upper face in view. */
export function sequinImageRect(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  fit: SequinFit,
) {
  const scale = (fit === "contain" ? Math.min : Math.max)(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale,
    h = imageHeight * scale;
  return {
    x: (width - w) / 2,
    y: (height - h) * (fit === "cover" ? 0.35 : 0.5),
    width: w,
    height: h,
  };
}

/** Swept capsule, not isolated event circles: fast swipes cannot leave gaps.
 * Visits only the grid's bounding rows/columns. Coordinates use CSS pixels. */
export function brushSequinGrid(
  grid: SequinGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  visit: (index: number, weight: number) => void,
) {
  const { pitch, cols, rows } = grid,
    dx = x1 - x0,
    dy = y1 - y0,
    len = dx * dx + dy * dy;
  const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - radius) / pitch));
  const c1 = Math.min(cols - 1, Math.floor((Math.max(x0, x1) + radius) / pitch));
  const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - radius) / pitch));
  const r1 = Math.min(rows - 1, Math.floor((Math.max(y0, y1) + radius) / pitch));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const x = (c + 0.5) * pitch,
        y = (r + 0.5) * pitch;
      const u = len ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len)) : 0;
      const distance = Math.hypot(x - x0 - u * dx, y - y0 - u * dy);
      if (distance < radius) visit(r * cols + c, 1 - distance / radius);
    }
}

/** Opposite strokes undo one another; horizontal and vertical both work. */
export function sequinStrokeTarget(dx: number, dy: number) {
  return (Math.abs(dx) > Math.abs(dy) ? dx : -dy) >= 0 ? Math.PI : 0;
}
