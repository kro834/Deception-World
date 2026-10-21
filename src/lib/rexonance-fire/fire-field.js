// The body field: one small RGBA texture, built once on the CPU from the
// undersuit's alpha silhouette, that lets every fire pixel know where it is
// relative to the figure without any per-frame geometry:
//   R  distance outside the body (chamfer, in widths of the figure / FIELD_D)
//   G  arrival: geodesic climb from the soles over the body (0 soles, 1 the
//      farthest point: crown and hands); outside the body the nearest body
//      texel's arrival, so a plume above a shoulder lights with the shoulder
//   B  lift: distance straight down to the body top below (/ FIELD_LIFT), so
//      heat rises above surfaces that face up; 1 where nothing lies below
//   A  distance inside the body (/ FIELD_IN), 0 outside: silhouette rim.
// R and A are the two halves of one smoothed signed distance, so the skin
// can be anti-aliased at sub-texel precision.
// Both the WebGL fire and the CPU fallback sample exactly this texture.

/** The fire's drawing rectangle in normalized body units (x over the
 * figure's width, y over its height): air for plumes above the crown,
 * licks past the hands and the detonation's ring and fragments. */
export const FIRE_RECT = Object.freeze({ x: -0.35, y: -0.36, width: 1.7, height: 1.46 });
export const FIELD_W = 192;
export const FIELD_H = 300;
export const BODY_ASPECT = 1040 / 571;
/** Normalizers of the packed distances, in figure widths. */
export const FIELD_D = 0.6;
/** The lift's normalizer: beyond every plume's reach, so air with no body
 * below it is always too high to burn. */
export const FIELD_LIFT = 1.5;
export const FIELD_IN = 0.12;
/** Texels per figure width (square texels: the rect's aspect matches). */
export const FIELD_TEXELS_PER_WIDTH = FIELD_W / FIRE_RECT.width;
/** The figure's rectangle inside the field, in texels. */
export const FIELD_BODY = Object.freeze({
  x: (-FIRE_RECT.x / FIRE_RECT.width) * FIELD_W,
  y: (-FIRE_RECT.y / FIRE_RECT.height) * FIELD_H,
  width: FIELD_W / FIRE_RECT.width,
  height: FIELD_H / FIRE_RECT.height,
});

const INSIDE_ALPHA = 96;
const LIFT_BLUR = 4;
const AIR_BLUR = 4;
const AIR_BLUR_PASSES = 3;
const SQRT2 = Math.SQRT2;
const INF = 1e9;

// Binary heap of (key, id) pairs for one Dijkstra over the body's texels.
function heapPush(keys, ids, size, key, id) {
  let i = size;
  keys[i] = key;
  ids[i] = id;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (keys[parent] <= keys[i]) break;
    const k = keys[parent];
    keys[parent] = keys[i];
    keys[i] = k;
    const d = ids[parent];
    ids[parent] = ids[i];
    ids[i] = d;
    i = parent;
  }
  return size + 1;
}
function heapPop(keys, ids, size) {
  const last = size - 1;
  keys[0] = keys[last];
  ids[0] = ids[last];
  let i = 0;
  for (;;) {
    const left = i * 2 + 1;
    const right = left + 1;
    let smallest = i;
    if (left < last && keys[left] < keys[smallest]) smallest = left;
    if (right < last && keys[right] < keys[smallest]) smallest = right;
    if (smallest === i) break;
    const k = keys[smallest];
    keys[smallest] = keys[i];
    keys[i] = k;
    const d = ids[smallest];
    ids[smallest] = ids[i];
    ids[i] = d;
    i = smallest;
  }
  return last;
}

// Two-pass chamfer (1, √2) distance from the seeded texels, carrying each
// seed's label to the texels it is nearest to.
function chamfer(seed, label, w, h, dist, carried) {
  const n = w * h;
  for (let i = 0; i < n; i += 1) {
    dist[i] = seed[i] ? 0 : INF;
    carried[i] = seed[i] ? label[i] : 0;
  }
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const i = row + x;
      let best = dist[i];
      let from = -1;
      let d;
      if (x > 0 && (d = dist[i - 1] + 1) < best) {
        best = d;
        from = i - 1;
      }
      if (y > 0) {
        if ((d = dist[i - w] + 1) < best) {
          best = d;
          from = i - w;
        }
        if (x > 0 && (d = dist[i - w - 1] + SQRT2) < best) {
          best = d;
          from = i - w - 1;
        }
        if (x < w - 1 && (d = dist[i - w + 1] + SQRT2) < best) {
          best = d;
          from = i - w + 1;
        }
      }
      if (from >= 0) {
        dist[i] = best;
        carried[i] = carried[from];
      }
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    const row = y * w;
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = row + x;
      let best = dist[i];
      let from = -1;
      let d;
      if (x < w - 1 && (d = dist[i + 1] + 1) < best) {
        best = d;
        from = i + 1;
      }
      if (y < h - 1) {
        if ((d = dist[i + w] + 1) < best) {
          best = d;
          from = i + w;
        }
        if (x < w - 1 && (d = dist[i + w + 1] + SQRT2) < best) {
          best = d;
          from = i + w + 1;
        }
        if (x > 0 && (d = dist[i + w - 1] + SQRT2) < best) {
          best = d;
          from = i + w - 1;
        }
      }
      if (from >= 0) {
        dist[i] = best;
        carried[i] = carried[from];
      }
    }
  }
}

// Separable box blur of the air texels only (the body keeps its own values
// and still feeds the blur, so the rim stays continuous).
function blurAir(values, inside, w, h, scratch, radius, passes) {
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        const i = row + x;
        if (inside[i]) {
          scratch[i] = values[i];
          continue;
        }
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          sum += values[row + xx];
          count += 1;
        }
        scratch[i] = sum / count;
      }
    }
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (inside[i]) continue;
        let sum = 0;
        let count = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          sum += scratch[yy * w + x];
          count += 1;
        }
        values[i] = sum / count;
      }
  }
}

/**
 * Builds the packed field from a silhouette alpha grid of w×h texels into
 * `out` (RGBA bytes, w*h*4). Returns false when the grid holds no body.
 * Pure and deterministic: the same silhouette always yields the same bytes.
 */
export function buildFireField(alpha, w, h, out) {
  const n = w * h;
  if (!alpha || alpha.length < n || !out || out.length < n * 4 || w < 2 || h < 2) return false;
  const inside = new Uint8Array(n);
  let count = 0;
  let bottom = -1;
  let top = h;
  for (let i = 0; i < n; i += 1)
    if (alpha[i] > INSIDE_ALPHA) {
      inside[i] = 1;
      count += 1;
      const y = (i / w) | 0;
      if (y > bottom) bottom = y;
      if (y < top) top = y;
    }
  if (count < 16) return false;

  // Geodesic climb over the body from the soles (the lowest 2.5% of it).
  const arrival = new Float32Array(n).fill(INF);
  const keys = new Float32Array(n * 3);
  const ids = new Int32Array(n * 3);
  let size = 0;
  const soles = bottom - Math.max(1, Math.round((bottom - top) * 0.025));
  for (let i = 0; i < n; i += 1)
    if (inside[i] && ((i / w) | 0) >= soles) {
      arrival[i] = 0;
      size = heapPush(keys, ids, size, 0, i);
    }
  while (size > 0) {
    const key = keys[0];
    const i = ids[0];
    size = heapPop(keys, ids, size);
    if (key > arrival[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        if (nx < 0 || nx >= w) continue;
        const j = ny * w + nx;
        if (!inside[j]) continue;
        const d = key + (dx && dy ? SQRT2 : 1);
        if (d < arrival[j]) {
          arrival[j] = d;
          if (size < keys.length) size = heapPush(keys, ids, size, d, j);
        }
      }
    }
  }
  let farthest = 0;
  for (let i = 0; i < n; i += 1)
    if (inside[i] && arrival[i] < INF && arrival[i] > farthest) farthest = arrival[i];
  if (farthest <= 0) farthest = 1;
  for (let i = 0; i < n; i += 1)
    arrival[i] = inside[i] ? (arrival[i] < INF ? arrival[i] / farthest : 1) : 0;

  // Outside distance carrying the nearest body texel's arrival; inside
  // distance from the air (the silhouette's rim).
  const outsideDist = new Float32Array(n);
  const outsideArrival = new Float32Array(n);
  chamfer(inside, arrival, w, h, outsideDist, outsideArrival);
  const air = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) air[i] = inside[i] ? 0 : 1;
  const insideDist = new Float32Array(n);
  const unused = new Float32Array(n);
  chamfer(air, unused, w, h, insideDist, unused);
  // The carried arrival is piecewise constant over the air (each texel
  // takes its nearest body texel's), so a tongue rising between the head
  // and a shoulder would be cut along their boundary: blur it over the air.
  blurAir(outsideArrival, inside, w, h, unused, AIR_BLUR, AIR_BLUR_PASSES);

  // Lift: the distance straight down to the first body texel below, then
  // blurred sideways so a plume's column has no hard edges.
  // Capped at the normalizer first, so the sideways blur of a column with
  // nothing below it never swamps its neighbours above a body edge.
  const liftCap = FIELD_LIFT * (w / FIRE_RECT.width);
  const lift = new Float32Array(n);
  for (let x = 0; x < w; x += 1) {
    let below = INF;
    for (let y = h - 1; y >= 0; y -= 1) {
      const i = y * w + x;
      if (inside[i]) below = y;
      lift[i] = inside[i] ? 0 : Math.min(below - y, liftCap);
    }
  }
  const blurred = new Float32Array(n);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let count = 0;
      for (let k = -LIFT_BLUR; k <= LIFT_BLUR; k += 1) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        sum += lift[y * w + xx];
        count += 1;
      }
      blurred[y * w + x] = sum / count;
    }
  // The silhouette as one signed distance (texels, the boundary halfway
  // between the last body texel and the first air texel), smoothed so the
  // texel staircase of a diagonal edge never shows when the field is
  // magnified: R and A are its two halves, so their bilinear difference is
  // the smooth signed distance the kernels anti-alias against.
  const signed = new Float32Array(n);
  for (let i = 0; i < n; i += 1) signed[i] = inside[i] ? 0.5 - insideDist[i] : outsideDist[i] - 0.5;
  smoothSigned(signed, w, h, unused);
  const scaleD = 255 / (FIELD_D * (w / FIRE_RECT.width));
  const scaleLift = 255 / (FIELD_LIFT * (w / FIRE_RECT.width));
  const scaleIn = 255 / (FIELD_IN * (w / FIRE_RECT.width));
  for (let i = 0; i < n; i += 1) {
    const k = i * 4;
    const sd = signed[i];
    out[k] = sd > 0 ? Math.min(255, Math.round(sd * scaleD)) : 0;
    out[k + 1] = Math.round(outsideArrival[i] * 255);
    out[k + 2] = Math.min(255, Math.round(blurred[i] * scaleLift));
    out[k + 3] = sd < 0 ? Math.min(255, Math.round(-sd * scaleIn)) : 0;
  }
  return true;
}

// Two passes of a separable 3-tap box (a 5-texel tent) over the signed
// distance: rounds the staircase off the silhouette, keeps its position.
function smoothSigned(values, w, h, scratch) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        const a = values[row + Math.max(0, x - 1)];
        const c = values[row + Math.min(w - 1, x + 1)];
        scratch[row + x] = (a + values[row + x] + c) / 3;
      }
    }
    for (let y = 0; y < h; y += 1) {
      const up = Math.max(0, y - 1) * w;
      const down = Math.min(h - 1, y + 1) * w;
      for (let x = 0; x < w; x += 1)
        values[y * w + x] = (scratch[up + x] + scratch[y * w + x] + scratch[down + x]) / 3;
    }
  }
}

/** Bilinear read of the packed field at texture coordinates (u, v in 0..1,
 * v down), clamped at the edges like the GPU's CLAMP_TO_EDGE sampling.
 * Writes [d, arrival, lift, inside] as 0..1 into `out` (offset `at`). */
export function sampleFireField(bytes, w, h, u, v, out, at) {
  const fx = Math.min(Math.max(u * w - 0.5, 0), w - 1);
  const fy = Math.min(Math.max(v * h - 0.5, 0), h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = (y0 * w + x0) * 4;
  const b = (y0 * w + x1) * 4;
  const c = (y1 * w + x0) * 4;
  const d = (y1 * w + x1) * 4;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  for (let k = 0; k < 4; k += 1)
    out[at + k] =
      (bytes[a + k] * w00 + bytes[b + k] * w10 + bytes[c + k] * w01 + bytes[d + k] * w11) / 255;
}
