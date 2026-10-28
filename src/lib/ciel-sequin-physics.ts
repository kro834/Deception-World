/** Shared CPU/GPU spring constants. CPU samples only when a brush retargets
 * a tile; normal animation is evaluated per instance in the vertex shader. */
export const SEQUIN_SPRING = Object.freeze({ omega: 16, damping: 0.43, settle: 1.8 });
export type SequinFit = "cover" | "contain";
export type SequinGrid = {
  width: number;
  height: number;
  pitch: number;
  rowPitch: number;
  cols: number;
  rows: number;
  count: number;
};
// A 16-sided back cap has radius .94 of the body. This still covers the
// hexagonal cell's .5774*pitch circumradius, including polygon inradius loss.
export const SEQUIN_RADIUS_RATIO = 0.63;
const HEX_ROW = Math.sqrt(3) / 2;

export function sequinGrid(width: number, height: number, coarse = false): SequinGrid {
  const w = Math.max(1, width),
    h = Math.max(1, height);
  const budget = coarse ? 6200 : 14000;
  let pitch = Math.max(coarse ? 16 : 14, Math.sqrt((w * h) / (budget * 0.9 * HEX_ROW)));
  let cols = Math.ceil(w / pitch) + 1,
    rows = Math.ceil(h / (pitch * HEX_ROW)) + 1;
  while (cols * rows > budget) {
    pitch *= 1.02;
    cols = Math.ceil(w / pitch) + 1;
    rows = Math.ceil(h / (pitch * HEX_ROW)) + 1;
  }
  return { width: w, height: h, pitch, rowPitch: pitch * HEX_ROW, cols, rows, count: cols * rows };
}

/** Shared staggered centres; an extra outer row/column covers all viewport edges. */
export function sequinGridCenter(grid: SequinGrid, index: number, out: Float64Array) {
  const row = Math.floor(index / grid.cols);
  out[0] = ((index % grid.cols) + (row % 2) * 0.5) * grid.pitch;
  out[1] = row * grid.rowPitch;
  return out;
}

/** Nearest hex centre, also used to preserve revealed cells on normalized resize. */
export function sequinGridIndexAt(grid: SequinGrid, x: number, y: number) {
  const row = Math.max(0, Math.min(grid.rows - 1, Math.round(y / grid.rowPitch)));
  let best = 0,
    distance = Infinity;
  for (let r = Math.max(0, row - 1); r <= Math.min(grid.rows - 1, row + 1); r++) {
    const c = Math.max(0, Math.min(grid.cols - 1, Math.round(x / grid.pitch - (r % 2) * 0.5)));
    const dx = (c + (r % 2) * 0.5) * grid.pitch - x,
      dy = r * grid.rowPitch - y;
    if (dx * dx + dy * dy < distance) {
      best = r * grid.cols + c;
      distance = dx * dx + dy * dy;
    }
  }
  return best;
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
  const { pitch, rowPitch, cols, rows } = grid,
    dx = x1 - x0,
    dy = y1 - y0,
    len = dx * dx + dy * dy;
  const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - radius) / pitch) - 1);
  const c1 = Math.min(cols - 1, Math.ceil((Math.max(x0, x1) + radius) / pitch));
  const r0 = Math.max(0, Math.floor((Math.min(y0, y1) - radius) / rowPitch));
  const r1 = Math.min(rows - 1, Math.ceil((Math.max(y0, y1) + radius) / rowPitch));
  const center = new Float64Array(2);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      sequinGridCenter(grid, r * cols + c, center);
      const x = center[0],
        y = center[1];
      const u = len ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len)) : 0;
      const distance = Math.hypot(x - x0 - u * dx, y - y0 - u * dy);
      if (distance < radius) visit(r * cols + c, 1 - distance / radius);
    }
}

/** Opposite strokes undo one another; horizontal and vertical both work. */
export function sequinStrokeTarget(dx: number, dy: number) {
  return (Math.abs(dx) > Math.abs(dy) ? dx : -dy) >= 0 ? Math.PI : 0;
}

/** A small wave reaches the brush fringe after its centre, never a timer per tile. */
export function sequinBrushDelay(weight: number) {
  return 0.065 * (1 - Math.max(0, Math.min(1, weight))) ** 2;
}
