/* LIQUID FRONT (nano pass follow-up, 2026-11-21; owner: 「レクソナンスなど
   のナノマシンを…実際のナノマシンと同程度の大きさにして」). The classic
   engines built a plate by clipping its art to the union of its landed 9 px
   tiles, so every forming plate showed a stair of squares. A nanite is far
   below a pixel: what a viewer can see is only the collective, a sheet of
   liquid metal wetting the plate. Each plate's (or paint layer's) tile times
   are fitted once by least squares to a straight front (time ≈ a + b·x +
   c·y) for its direction; along it, the front is never behind a tile that
   has landed (it advances between landings, continuously), so the plate
   begins with its first tile and is whole exactly at its last. Its edge is a fixed fractal raggedness (three octaves, in
   figure px, the same every frame), and the canvas antialiases the clip,
   so the lip is sub-pixel soft. Closed-form in the clock: the same time
   gives the same path whatever came before. Nothing is allocated a frame.

   A front is a Float32Array: [nx, ny, lo, hi, t0, t1, ulo, uhi, rag,
   raggedness × RAG, then (time, place) rows of its run]. proj = nx·x + ny·y
   runs lo → hi; u along the front's tangent (−ny, nx) spans ulo → uhi. */

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
  // The edge's raggedness: three octaves of fixed sines, figure px, never
  // more than a fifth of the plate's width (a lip, not a tear).
  const width = uhi - ulo + 2 * reach;
  const amplitude = Math.min(3.2, 0.2 * width, 0.25 * (hi - lo + 2 * reach));
  const out = new Float32Array(HEAD + LIQUID_RAG + 2 * count + 2);
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
  // The run: the front is never behind a tile that has landed. Sorted by
  // time, each tile's far edge (plus the lip's raggedness) raises the
  // front's floor; between two landings it moves on linearly, so it is
  // continuous and only advances. It starts from wholly before the plate a
  // short lead before the first landing (no jump at the first tile).
  const order = Array.from({ length: count }, (_, i) => i);
  const times = new Float64Array(count);
  const far = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    at(i, tile);
    times[i] = tile[3];
    far[i] = nx * tile[0] + ny * tile[1] + reach + rag;
  }
  order.sort((a, b) => times[a] - times[b]);
  const start = lo - reach - rag - 1;
  const lead = Math.max(1e-6, 0.12 * (t1 - t0));
  const table = HEAD + LIQUID_RAG;
  out[table] = t0 - lead;
  out[table + 1] = start;
  let floor = start;
  for (let k = 0; k < count; k += 1) {
    const i = order[k];
    floor = Math.max(floor, far[i]);
    out[table + 2 + 2 * k] = times[i];
    out[table + 3 + 2 * k] = floor;
  }
  out.set([nx, ny, start, hi + reach + rag + 1, t0 - lead, t1, ulo - reach, uhi + reach, rag]);
  return out;
}

/** The front's place at time t (proj, figure px), from its run's table. */
function frontAt(front, t) {
  const table = HEAD + LIQUID_RAG;
  const rows = (front.length - table) >> 1;
  if (t <= front[table]) return front[2];
  if (t >= front[table + 2 * (rows - 1)]) return front[3];
  let low = 0;
  let high = rows - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (front[table + 2 * mid] <= t) low = mid;
    else high = mid;
  }
  const ta = front[table + 2 * low];
  const tb = front[table + 2 * high];
  const sa = front[table + 2 * low + 1];
  const sb = front[table + 2 * high + 1];
  return tb > ta ? sa + ((sb - sa) * (t - ta)) / (tb - ta) : sb;
}

/** How far the front has run at time t: 0 (nothing set) … 1 (all set). */
export function liquidProgress(front, t) {
  if (t < front[4]) return 0;
  if (t >= front[5]) return 1;
  const k = (frontAt(front, t) - front[2]) / Math.max(1e-9, front[3] - front[2]);
  return k <= 0 ? 0 : k >= 1 ? 1 : k;
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
  const run = liquidProgress(front, t);
  if (set ? run + ahead <= 0 : run >= 1) return 0;
  if (set ? run >= 1 : run + ahead <= 0) return 2;
  const nx = front[0];
  const ny = front[1];
  const lo = front[2];
  const hi = front[3];
  // (The lip's floor already holds its raggedness: the bites never uncover
  // a landed tile.)
  const s = frontAt(front, t) + ahead * (hi - lo);
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
