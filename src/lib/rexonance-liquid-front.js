/* LIQUID FRONT (nano pass follow-up, 2026-11-21; owner: 「レクソナンスなど
   のナノマシンを…実際のナノマシンと同程度の大きさにして」). The classic
   engines built a plate by clipping its art to the union of its landed 9 px
   tiles, so every forming plate showed a stair of squares. A nanite is far
   below a pixel: what a viewer can see is only the collective, a sheet of
   liquid metal wetting the plate. Each plate's (or paint layer's) tile times
   are fitted once by least squares to a straight front (time ≈ a + b·x +
   c·y); the front then sweeps across the plate from its first tile's time
   to its last tile's, so the plate begins and completes exactly when its
   tiles did. Its edge is a fixed fractal raggedness (three octaves, in
   figure px, the same every frame), and the canvas antialiases the clip,
   so the lip is sub-pixel soft. Closed-form in the clock: the same time
   gives the same path whatever came before. Nothing is allocated a frame.

   A front is a Float32Array: [nx, ny, lo, hi, t0, t1, ulo, uhi, reach,
   rag × RAG]. proj = nx·x + ny·y runs lo → hi in the order the tiles set;
   u along the front's tangent (−ny, nx) spans ulo → uhi. */

/** Samples across the front's edge (its raggedness). */
export const LIQUID_RAG = 24;
const HEAD = 9;

/**
 * Fits a front to `count` tiles: `at(i, out)` writes tile i's centre x, y,
 * its half size (figure px) and its time into out[0..3]. Null without
 * tiles. `seed` picks the edge's raggedness.
 */
export function fitLiquidFront(count, at, seed = 1) {
  if (!count) return null;
  const tile = new Float64Array(4);
  let sx = 0;
  let sy = 0;
  let st = 0;
  let half = 0;
  let t0 = Infinity;
  let t1 = -Infinity;
  for (let i = 0; i < count; i += 1) {
    at(i, tile);
    sx += tile[0];
    sy += tile[1];
    st += tile[3];
    half = Math.max(half, tile[2]);
    t0 = Math.min(t0, tile[3]);
    t1 = Math.max(t1, tile[3]);
  }
  const mx = sx / count;
  const my = sy / count;
  const mt = st / count;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  let xt = 0;
  let yt = 0;
  for (let i = 0; i < count; i += 1) {
    at(i, tile);
    const dx = tile[0] - mx;
    const dy = tile[1] - my;
    const dt = tile[3] - mt;
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
    xt += dx * dt;
    yt += dy * dt;
  }
  const det = xx * yy - xy * xy;
  let nx = 0;
  let ny = -1;
  if (Math.abs(det) > 1e-9) {
    const b = (xt * yy - yt * xy) / det;
    const c = (yt * xx - xt * xy) / det;
    const length = Math.hypot(b, c);
    if (length > 1e-12) {
      nx = b / length;
      ny = c / length;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  let ulo = Infinity;
  let uhi = -Infinity;
  for (let i = 0; i < count; i += 1) {
    at(i, tile);
    const p = nx * tile[0] + ny * tile[1];
    const u = -ny * tile[0] + nx * tile[1];
    lo = Math.min(lo, p);
    hi = Math.max(hi, p);
    ulo = Math.min(ulo, u);
    uhi = Math.max(uhi, u);
  }
  // A tile reaches half its size past its centre (√2 for a diagonal front).
  const reach = half * 1.5;
  const out = new Float32Array(HEAD + LIQUID_RAG);
  out.set([nx, ny, lo - reach, hi + reach, t0, t1, ulo - reach, uhi + reach, 0]);
  // The edge's raggedness: three octaves of fixed sines, figure px, never
  // more than a fifth of the plate's width (a lip, not a tear).
  const width = uhi - ulo + 2 * reach;
  const amplitude = Math.min(3.2, 0.2 * width, 0.25 * (hi - lo + 2 * reach));
  let rag = 0;
  for (let k = 0; k < LIQUID_RAG; k += 1) {
    const v = k / (LIQUID_RAG - 1);
    const value =
      0.55 * Math.sin(v * 7.1 + seed * 1.3) +
      0.3 * Math.sin(v * 17.3 + seed * 2.9) +
      0.15 * Math.sin(v * 41.7 + seed * 5.1);
    out[HEAD + k] = value * amplitude;
    rag = Math.max(rag, Math.abs(value * amplitude));
  }
  out[8] = rag;
  return out;
}

/** How far the front has run at time t: 0 (nothing set) … 1 (all set). */
export function liquidProgress(front, t) {
  const t0 = front[4];
  const t1 = front[5];
  if (t < t0) return 0;
  if (t >= t1) return 1;
  return (t - t0) / Math.max(1e-9, t1 - t0);
}

/**
 * Adds the set region at time t (`set`: true) or the region still to set
 * (false) to the current path, as one ragged polygon. Returns 0 when that
 * region is empty, 2 when it is the whole plate, 1 otherwise (the caller
 * may skip the clip at 2). `ahead` moves the front on by that share of its
 * run (a seed condensing just ahead of its own landing); `k` scales the
 * path's coordinates (figure px to the context's units).
 */
export function liquidFrontPath(context, front, t, set = true, ahead = 0, k = 1) {
  const run = liquidProgress(front, t) + ahead;
  if (set ? run <= 0 : run >= 1) return 0;
  if (set ? run >= 1 : run <= 0) return 2;
  const nx = front[0];
  const ny = front[1];
  const rag = front[8];
  // The front runs from wholly before the plate to wholly past it.
  const lo = front[2] - rag;
  const hi = front[3] + rag;
  const s = lo + (hi - lo) * run;
  const ulo = front[6];
  const uhi = front[7];
  const back = set ? lo - 1 : hi + 1;
  // (x, y) = n·proj + τ·u, τ = (−ny, nx).
  context.moveTo(k * (nx * back - ny * ulo), k * (ny * back + nx * ulo));
  for (let i = 0; i < LIQUID_RAG; i += 1) {
    const u = ulo + ((uhi - ulo) * i) / (LIQUID_RAG - 1);
    const p = s + front[HEAD + i];
    context.lineTo(k * (nx * p - ny * u), k * (ny * p + nx * u));
  }
  context.lineTo(k * (nx * back - ny * uhi), k * (ny * back + nx * uhi));
  context.closePath();
  return 1;
}
