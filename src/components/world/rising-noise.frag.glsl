// RISING THE WORLD — bakes the tileable noise texture the sequence samples.
// Drawn once per run into a 256x256 RGBA texture (mipmapped, REPEAT), so the
// main pass reads turbulence with a few texture fetches instead of evaluating
// value noise per pixel (rising.frag.glsl). GLSL ES 1.00.
//   r, g: independent fbm (gradient noise, 5 octaves, periods 4..64)
//   b:    cell edge distance (Worley F2 - F1, 16 cells a side): 0 on the
//         edges of a Voronoi net, high in the middle of each cell: the
//         cracks between char plates, blisters, ember specks
//   a:    fine fbm (4 octaves, periods 16..128): edge detail, sparkle
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float uSize;

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Gradient noise that repeats every `period` lattice cells (period divides the tile).
float gnoise(vec2 p, float period, float seed) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i00 = mod(i, period) + seed;
  vec2 i10 = mod(i + vec2(1.0, 0.0), period) + seed;
  vec2 i01 = mod(i + vec2(0.0, 1.0), period) + seed;
  vec2 i11 = mod(i + vec2(1.0, 1.0), period) + seed;
  float a = dot(hash22(i00) * 2.0 - 1.0, f);
  float b = dot(hash22(i10) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i01) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i11) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 t, float period, float seed, int octaves) {
  float v = 0.0;
  float a = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += a * gnoise(t * period, period, seed + float(i) * 7.13);
    norm += a;
    period *= 2.0;
    a *= 0.5;
  }
  // Gradient noise stays within about +-0.5; stretch the fbm to use the 8 bits
  // (5th-95th percentile about 0.2-0.8).
  return clamp(0.5 + v / norm * 1.9, 0.0, 1.0);
}

// F2 - F1: grows linearly away from every cell edge, so a threshold near 0
// draws a crack net of even width. 5 x 5 neighbours, so F2 is always found.
float worleyEdge(vec2 t, float period) {
  vec2 p = t * period;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = hash22(mod(i + o, period) + 91.7);
      float dist = length(o + c - f);
      f2 = min(f2, max(f1, dist));
      f1 = min(f1, dist);
    }
  }
  return clamp((f2 - f1) * 0.9, 0.0, 1.0);
}

void main() {
  vec2 t = gl_FragCoord.xy / uSize;
  gl_FragColor = vec4(
    fbm(t, 4.0, 0.0, 5),
    fbm(t, 4.0, 131.0, 5),
    worleyEdge(t, 16.0),
    fbm(t, 16.0, 257.0, 4)
  );
}
