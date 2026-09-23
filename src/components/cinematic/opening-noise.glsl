// Shared by the opening's shaders (burn and dive), prepended after the quality
// #defines. GLSL ES 1.00 (WebGL 1 and 2). The noise follows RISING THE WORLD
// (rising.frag.glsl): high precision where the GPU has it (Mali and Adreno
// run mediump as FP16, which collapses fract() on large hash inputs into
// blocky noise), no reversed smoothstep, textures uploaded top-down.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

#ifndef OCTAVES
#define OCTAVES 4
#endif
#ifndef BLUR_TAPS
#define BLUR_TAPS 8
#endif

// smoothstep(e0, e1, x) is undefined for e0 >= e1 in ES 1.00; falling edges use this.
float fall(float e0, float e1, float x) { return 1.0 - smoothstep(e1, e0, x); }

// Top-down uploads: V is flipped here.
vec4 sampleTop(sampler2D s, vec2 t) { return texture2D(s, vec2(t.x, 1.0 - t.y)); }

// Hoskins hashes: no sin(), stable on FP16-less mobile GPUs.
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  float norm = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < OCTAVES; i++) {
    v += a * vnoise(p);
    norm += a;
    p = m * p;
    a *= 0.5;
  }
  return v / norm;
}

// Red-biased flame ramp: orange only near the base, yellow-white only in rare
// cores, so most burning area stays a deep red of moderate luminance.
vec3 fireRamp(float h) {
  vec3 c = mix(vec3(0.0), vec3(0.36, 0.012, 0.006), smoothstep(0.02, 0.22, h));
  c = mix(c, vec3(0.86, 0.07, 0.015), smoothstep(0.2, 0.5, h));
  c = mix(c, vec3(1.0, 0.24, 0.035), smoothstep(0.6, 0.88, h));
  c = mix(c, vec3(1.0, 0.5, 0.13), smoothstep(0.9, 1.06, h));
  c = mix(c, vec3(1.0, 0.78, 0.48), smoothstep(1.08, 1.2, h));
  return c;
}

// One layer of rising sparks on a hashed grid (sparse: one cell in five).
float emberLayer(vec2 q, float t, float scale, float speed, float seed) {
  vec2 g = q * scale;
  g.y -= t * speed;
  g.x += sin(g.y * 0.7 + seed + t * 0.8) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5) * 0.6;
  float spark = fall(0.075, 0.0, length(f - o));
  return spark * step(0.8, h) * (h - 0.8) * 5.0;
}
