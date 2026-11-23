// A periodic texture gives the noise continuous derivatives without hashing
// corners or allocating vectors for each pixel. Every octave advects upwards.
const noiseMap = new Float32Array(256 * 256);
let state = 0x79d38261;
for (let i = 0; i < noiseMap.length; i++) {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  noiseMap[i] = (state >>> 0) / 4294967296;
}
export function sampleNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy);
  const a = (iy & 255) << 8, b = ((iy + 1) & 255) << 8;
  const l = ix & 255, r = (ix + 1) & 255;
  const v = noiseMap[a + l] * (1 - fx) + noiseMap[a + r] * fx;
  return v + fy * (noiseMap[b + l] * (1 - fx) + noiseMap[b + r] * fx - v);
}

/* The fire rasters' governor (2026-11-23). In high quality a touch screen
   rasters the desktop grid (owner: a phone draws what a desktop draws). The
   kernel runs on the CPU, about 55,000 texels a frame, so a slow phone could
   not keep the frame rate there. This steps such a device, and only such a
   device, down to the touch grid: after FIRE_RASTER_SLOW_RUN rasters in a row
   over FIRE_RASTER_SLOW_MS it holds the smaller grid for the rest of the
   visit (never back up: a grid that changed again and again would show).
   Fine pointers are left as they were. The fires of FAR FROM and
   ILLUSIONCULUM share it (both already import this module). */
export const FIRE_RASTER_SLOW_MS = 11;
export const FIRE_RASTER_SLOW_RUN = 4;
const governor = { touch: undefined as boolean | undefined, run: 0, stepped: false };

type GovernorView = { matchMedia?: (query: string) => { matches: boolean } } | null | undefined;

/** Whether this touch screen has shown it cannot hold the desktop grid. */
export function fireGridStepped(view: GovernorView): boolean {
  if (governor.touch === undefined) {
    try {
      governor.touch = Boolean(view?.matchMedia?.("(pointer: coarse)").matches);
    } catch {
      governor.touch = false;
    }
  }
  return governor.touch && governor.stepped;
}

/** One desktop-grid raster's time (ms). */
export function fireRasterTook(ms: number): void {
  if (governor.stepped || !(ms >= 0)) return;
  governor.run = ms > FIRE_RASTER_SLOW_MS ? governor.run + 1 : 0;
  if (governor.run >= FIRE_RASTER_SLOW_RUN) governor.stepped = true;
}

/** For tests: a new visit. */
export function resetFireGovernor(): void {
  governor.touch = undefined;
  governor.run = 0;
  governor.stepped = false;
}
