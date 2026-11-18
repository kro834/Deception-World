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
