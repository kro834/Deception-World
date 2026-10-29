import * as THREE from "three";

/** One tileable value-noise volume shared by the fire, backdrop and surface shaders.
 * R and G hold a four-octave fbm (two seeds), B one coarse octave and A one mid octave,
 * so a single trilinear fetch replaces dozens of hash evaluations per sample. The bake is
 * about 262k texels and runs while the model request is in flight. */
export const NOISE_VOLUME_SIZE = 64;

type Octave = { cells: number; amplitude: number };

function lattice(cells: number, seed: number) {
  const values = new Float32Array(cells * cells * cells);
  let state = (seed * 2654435761) >>> 0;
  for (let i = 0; i < values.length; i++) {
    // xorshift32: deterministic, cheap and good enough for a texture lattice.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    values[i] = (state & 0xffffff) / 0xffffff;
  }
  return values;
}

function bakeChannel(target: Uint8Array, channel: number, octaves: Octave[], seed: number) {
  const size = NOISE_VOLUME_SIZE;
  const amplitudeSum = octaves.reduce((sum, octave) => sum + octave.amplitude, 0);
  const sum = new Float32Array(size * size * size);
  octaves.forEach((octave, octaveIndex) => {
    const cells = octave.cells;
    const grid = lattice(cells, seed * 31 + octaveIndex * 7 + 1);
    const scale = cells / size;
    const fade = new Float32Array(size),
      i0s = new Int32Array(size),
      i1s = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      const u = i * scale;
      const cell = Math.floor(u);
      const t = u - cell;
      fade[i] = t * t * t * (t * (t * 6 - 15) + 10);
      i0s[i] = cell % cells;
      i1s[i] = (cell + 1) % cells;
    }
    const cc = cells * cells;
    let index = 0;
    for (let z = 0; z < size; z++) {
      const z0 = i0s[z] * cc,
        z1 = i1s[z] * cc,
        fz = fade[z];
      for (let y = 0; y < size; y++) {
        const y0 = i0s[y] * cells,
          y1 = i1s[y] * cells,
          fy = fade[y];
        for (let x = 0; x < size; x++) {
          const x0 = i0s[x],
            x1 = i1s[x],
            fx = fade[x];
          const c00 = grid[z0 + y0 + x0] + (grid[z0 + y0 + x1] - grid[z0 + y0 + x0]) * fx;
          const c10 = grid[z0 + y1 + x0] + (grid[z0 + y1 + x1] - grid[z0 + y1 + x0]) * fx;
          const c01 = grid[z1 + y0 + x0] + (grid[z1 + y0 + x1] - grid[z1 + y0 + x0]) * fx;
          const c11 = grid[z1 + y1 + x0] + (grid[z1 + y1 + x1] - grid[z1 + y1 + x0]) * fx;
          const c0 = c00 + (c10 - c00) * fy;
          const c1 = c01 + (c11 - c01) * fy;
          sum[index++] += (c0 + (c1 - c0) * fz) * octave.amplitude;
        }
      }
    }
  });
  for (let i = 0; i < sum.length; i++)
    target[i * 4 + channel] = Math.round(THREE.MathUtils.clamp(sum[i] / amplitudeSum, 0, 1) * 255);
}

export function bakeNoiseVolumeData() {
  const size = NOISE_VOLUME_SIZE;
  const data = new Uint8Array(size * size * size * 4);
  const fbm: Octave[] = [
    { cells: 4, amplitude: 0.5 },
    { cells: 8, amplitude: 0.25 },
    { cells: 16, amplitude: 0.125 },
    { cells: 32, amplitude: 0.0625 },
  ];
  bakeChannel(data, 0, fbm, 11);
  bakeChannel(data, 1, fbm, 29);
  bakeChannel(data, 2, [{ cells: 4, amplitude: 1 }], 47);
  bakeChannel(data, 3, [{ cells: 8, amplitude: 1 }], 83);
  return data;
}

export function createNoiseVolume() {
  const size = NOISE_VOLUME_SIZE;
  const texture = new THREE.Data3DTexture(bakeNoiseVolumeData(), size, size, size);
  texture.name = "GuardianNoiseVolume";
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** GPU memory of the volume: RGBA8, no mipmaps. */
export const NOISE_VOLUME_BYTES = NOISE_VOLUME_SIZE ** 3 * 4;
