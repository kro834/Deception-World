// One tileable noise texture, built once: four channels of gradient
// (Perlin) noise at 4, 8, 16 and 32 lattice cells per tile, so a single
// bilinear read yields four octaves. Deterministic: the same bytes every
// time, on the GPU and in the CPU fallback alike.
export const NOISE_SIZE = 256;
export const NOISE_PERIODS = Object.freeze([4, 8, 16, 32]);

const hash = (x, y, salt) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Builds the RGBA noise bytes (size*size*4). */
export function buildNoiseTable(size = NOISE_SIZE) {
  const out = new Uint8Array(size * size * 4);
  for (let channel = 0; channel < 4; channel += 1) {
    const period = NOISE_PERIODS[channel];
    const salt = 3.7 + channel * 11.3;
    // The lattice's unit gradients, once per cell corner.
    const gx = new Float64Array(period * period);
    const gy = new Float64Array(period * period);
    for (let iy = 0; iy < period; iy += 1)
      for (let ix = 0; ix < period; ix += 1) {
        const angle = hash(ix, iy, salt) * Math.PI * 2;
        gx[iy * period + ix] = Math.cos(angle);
        gy[iy * period + ix] = Math.sin(angle);
      }
    const cell = size / period;
    for (let y = 0; y < size; y += 1) {
      const iy = Math.floor(y / cell);
      const fy = (y - iy * cell) / cell;
      const vy = fade(fy);
      const row0 = iy * period;
      const row1 = ((iy + 1) % period) * period;
      for (let x = 0; x < size; x += 1) {
        const ix = Math.floor(x / cell);
        const fx = (x - ix * cell) / cell;
        const vx = fade(fx);
        const ix1 = (ix + 1) % period;
        const n00 = gx[row0 + ix] * fx + gy[row0 + ix] * fy;
        const n10 = gx[row0 + ix1] * (fx - 1) + gy[row0 + ix1] * fy;
        const n01 = gx[row1 + ix] * fx + gy[row1 + ix] * (fy - 1);
        const n11 = gx[row1 + ix1] * (fx - 1) + gy[row1 + ix1] * (fy - 1);
        const nx0 = n00 + (n10 - n00) * vx;
        const nx1 = n01 + (n11 - n01) * vx;
        const value = nx0 + (nx1 - nx0) * vy;
        // Gradient noise spans about ±0.71: centre it on mid-grey.
        out[(y * size + x) * 4 + channel] = Math.max(
          0,
          Math.min(255, Math.round((value / 0.71) * 127 + 128)),
        );
      }
    }
  }
  return out;
}

/** Bilinear, repeating read of the four channels at (u, v) into out[at..at+3]
 * as 0..1, matching the GPU's REPEAT + LINEAR sampling. */
export function sampleNoise(bytes, size, u, v, out, at) {
  let fx = (u - Math.floor(u)) * size - 0.5;
  let fy = (v - Math.floor(v)) * size - 0.5;
  if (fx < 0) fx += size;
  if (fy < 0) fy += size;
  const x0 = Math.floor(fx) % size;
  const y0 = Math.floor(fy) % size;
  const x1 = (x0 + 1) % size;
  const y1 = (y0 + 1) % size;
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);
  const a = (y0 * size + x0) * 4;
  const b = (y0 * size + x1) * 4;
  const c = (y1 * size + x0) * 4;
  const d = (y1 * size + x1) * 4;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  for (let k = 0; k < 4; k += 1)
    out[at + k] =
      (bytes[a + k] * w00 + bytes[b + k] * w10 + bytes[c + k] * w01 + bytes[d + k] * w11) / 255;
}
