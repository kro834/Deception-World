// RISING THE WORLD — one full-screen pass: dive, burn, flames, embers, shockwave.
// GLSL ES 1.00 (WebGL 1 and 2). OCTAVES / BLUR_TAPS are injected as #defines
// so the adaptive quality ladder can recompile a cheaper variant.
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

uniform vec2 uRes;          // drawing-buffer size (px)
uniform float uTime;        // seconds since the sequence started
uniform float uZoom;        // world UV scale: 1 = cover fit, <1 = closer
uniform float uBlur;        // radial zoom-blur length (0..0.5)
uniform float uDive;        // 0..1 dive progress (speed lines, tunnel, grade)
uniform float uWarp;        // 0..1 warm bloom when the camera breaks through
uniform float uBurn;        // 0..1 burn level (front climbs bottom -> top)
uniform float uFlame;       // 0..1 flame intensity
uniform float uShock;       // seconds since the title cut (< 0: none)
uniform float uReveal;      // 0..1 rider emerging from the ash
uniform float uHeat;        // 0..1 colour temperature: Mirage ice -> ember (monotonic)
uniform vec2 uWorldScale;   // cover-fit factors for the key visual
uniform vec2 uRiderScale;   // cover-fit factors for the rider art
uniform vec2 uFocus;        // dive focal point in world UV (reached as the zoom closes in)
uniform sampler2D uWorld;
uniform sampler2D uRider;

// GLSL ES 1.00 leaves smoothstep(e0, e1, x) undefined for e0 >= e1 (some mobile drivers
// return garbage), so falling edges use this instead.
float fall(float e0, float e1, float x) { return 1.0 - smoothstep(e1, e0, x); }

vec3 tex(sampler2D s, vec2 t) { return texture2D(s, vec2(t.x, 1.0 - t.y)).rgb; }

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

// Flame noise: each octave drifts upward at the same rate in its own lattice
// units (finer octaves move proportionally slower on screen), so fine detail
// never flickers faster than the large tongues. Fewer opposing luminance and
// red transitions per second (WCAG 2.3.1), same silhouette.
float flameFbm(vec2 q, float drift) {
  float v = 0.0;
  float a = 0.5;
  float norm = 0.0;
  float s = 1.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  mat2 acc = mat2(1.0);
  for (int i = 0; i < OCTAVES; i++) {
    v += a * vnoise(acc * (q - vec2(0.0, drift * s)));
    norm += a;
    acc = m * acc;
    a *= 0.5;
    s *= 0.5;
  }
  return v / norm;
}

// Red-biased flame ramp: orange only near the base, yellow-white only in rare cores.
vec3 fireRamp(float h) {
  vec3 c = mix(vec3(0.0), vec3(0.36, 0.012, 0.006), smoothstep(0.02, 0.22, h));
  c = mix(c, vec3(0.86, 0.07, 0.015), smoothstep(0.2, 0.5, h));
  c = mix(c, vec3(1.0, 0.24, 0.035), smoothstep(0.6, 0.88, h));
  c = mix(c, vec3(1.0, 0.5, 0.13), smoothstep(0.9, 1.06, h));
  c = mix(c, vec3(1.0, 0.78, 0.48), smoothstep(1.08, 1.2, h));
  return c;
}

float emberLayer(vec2 q, float scale, float speed, float seed) {
  vec2 g = q * scale;
  g.y -= uTime * speed;
  g.x += sin(g.y * 0.7 + seed + uTime * 0.8) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5) * 0.6;
  float spark = fall(0.075, 0.0, length(f - o));
  return spark * step(0.8, h) * (h - 0.8) * 5.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;                 // 0..1, y up
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);          // centred, aspect-correct
  float r = length(p);

  // ---- Shockwave: a refractive ring after the title cut (no brightness strobe).
  // Kept gentle: a stronger push drags the flame pattern back and forth across a
  // cell right after the cut, which the 60 fps flash audit counts as a red flash.
  if (uShock >= 0.0) {
    float ringR = uShock * 1.45;
    float ringD = r - ringR;
    float fade = 1.0 - smoothstep(0.0, 0.95, uShock);
    float push = exp(-(ringD * ringD) / 0.0045) * 0.012 * fade;
    uv += (p / max(r, 0.001)) * push / vec2(aspect, 1.0);
    p = (uv - 0.5) * vec2(aspect, 1.0);
    r = length(p);
  }

  // ---- Burn field: bottom first, torn by static noise (large tears + ragged rim).
  float burnNoise = fbm(uv * vec2(2.2 * max(aspect, 0.8), 1.8) + 11.0);
  float rim = vnoise(uv * vec2(16.0 * aspect, 16.0) + 4.0);
  float field = uv.y * 0.82 + (burnNoise - 0.5) * 0.74 + (rim - 0.5) * 0.05;
  float level = mix(-0.5, 1.3, uBurn);
  float d = field - level;                          // > 0 intact, < 0 burnt
  float scorch = fall(0.2, 0.0, d);
  float burnt = fall(0.0, -0.02, d);

  // ---- Flames: vertical tongues (domain-warped, stretched fbm) rising off the front.
  float flameH = 0.42;
  float hN = clamp(d / flameH, 0.0, 1.0);             // 0 at the front, 1 at the tips
  // Tongue density follows the screen width, so a portrait phone gets as many
  // tongues across as a desktop instead of two giant blobs.
  float kx = max(1.0, 0.8 / aspect);
  vec2 fq = vec2(p.x * 5.0 * kx, uv.y * 1.5 - uTime * 1.25);
  fq.x += (vnoise(vec2(p.x * 2.0 * kx, uv.y * 1.2 - uTime * 0.6)) - 0.5) * 1.4;
  float turb = fbm(fq);
  float lick = vnoise(vec2(p.x * 14.0 * kx, uv.y * 3.2 - uTime * 2.6));
  float tongues = turb * 0.66 + lick * 0.34;
  float taper = 1.0 - hN;
  float front = tongues * taper * 1.9 - hN * 0.35;   // tongues thin out with height
  float behind = tongues * 1.3 * (1.0 - clamp(-d / 0.3, 0.0, 1.0)); // low fire in the fresh char
  // Front and fresh-char fire meet over a narrow band instead of a per-pixel
  // switch at d = 0, which aliased into a stepped line at the low render scale.
  float heat = smoothstep(0.16, 0.9, mix(behind * 0.85, front, smoothstep(-0.035, 0.035, d))) * 1.12;
  heat = clamp(heat * uFlame, 0.0, 1.2);
  // Residual low fire along the bottom edge once the world is consumed.
  float residual = smoothstep(0.12, 0.95, tongues * 1.7 * fall(0.2, 0.0, uv.y) - uv.y) * smoothstep(0.75, 1.0, uBurn);
  heat = max(heat, clamp(residual * uFlame, 0.0, 0.85));
  float fireA = smoothstep(0.04, 0.36, heat);

  // ---- Heat haze on the world sample (strongest just above the flames).
  vec2 haze = (vec2(vnoise(uv * 9.0 + vec2(0.0, -uTime * 2.2)),
                    vnoise(uv * 9.0 + vec2(5.2, -uTime * 2.2))) - 0.5)
              * 0.016 * clamp(scorch + fireA, 0.0, 1.0);

  // ---- World sample: cover fit, dive zoom, radial blur. At zoom 1 the frame is
  // the plain centred cover fit, identical to the DOM portal image, and the
  // focal point is reached as the camera closes in (never past the image edge).
  vec2 focus = mix(vec2(0.5), uFocus, clamp((1.0 - uZoom) * 5.0, 0.0, 1.0));
  vec2 wuv = (uv + haze - 0.5) * uWorldScale * uZoom + focus;
  vec3 world;
  if (uBlur > 0.002) {
    world = vec3(0.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float k = float(i) / float(BLUR_TAPS);
      world += tex(uWorld, focus + (wuv - focus) * (1.0 - uBlur * k));
    }
    world /= float(BLUR_TAPS);
  } else {
    world = tex(uWorld, wuv);
  }

  // Grade: neutral at the first frame (it continues the DOM portal image), Mirage
  // ice during the dive, warming to ember as the burn nears. Both steps only
  // move forward in time.
  float settle = smoothstep(0.0, 0.6, uTime);
  vec3 grade = mix(vec3(0.78, 0.96, 1.08), vec3(1.08, 0.66, 0.5), uHeat);
  world *= mix(vec3(1.0), grade, settle);
  world = mix(world, world * vec3(1.0, 0.42, 0.28) * 0.72, scorch * 0.85);

  // ---- Char and the rider in the ash.
  float veins = smoothstep(0.58, 0.66, fbm(uv * vec2(6.5 * aspect, 6.5) + 3.0));
  float age = clamp(-d / 0.3, 0.0, 1.0);
  vec3 charCol = vec3(0.03, 0.017, 0.014) + vec3(0.85, 0.2, 0.04) * veins * (1.0 - age) * 0.55;
  vec2 ruv = (uv - 0.5) * uRiderScale + vec2(0.5, 0.5);
  float inFrame = step(0.0, ruv.x) * step(ruv.x, 1.0) * smoothstep(0.0, 0.08, ruv.x) * fall(1.0, 0.92, ruv.x);
  vec3 rider = tex(uRider, ruv) * vec3(1.0, 0.58, 0.46) * 0.58 * inFrame;
  charCol = max(charCol, rider * uReveal);

  vec3 col = mix(world, charCol, burnt);

  // Burning edge of the world itself.
  float edge = fall(0.022, 0.0, abs(d + 0.008));
  col += vec3(1.0, 0.42, 0.1) * edge * 1.1 * uFlame;

  // ---- Dive: speed lines and tunnel.
  if (uDive > 0.001) {
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
    float lanes = 110.0;
    float lane = floor(ang * lanes);
    float rnd = hash11(lane + 1.7);
    float across = abs(fract(ang * lanes) - 0.5) * 2.0;
    float seg = fract(log(r + 0.02) * 1.4 - uTime * (0.9 + rnd * 1.4) * (0.6 + uDive * 1.8) + rnd * 9.0);
    float streak = step(0.5, rnd) * smoothstep(0.0, 0.12, seg) * fall(0.7, 0.12, seg);
    streak *= pow(1.0 - across, 3.0) * smoothstep(0.05, 0.5, r) * smoothstep(0.0, 0.35, uDive);
    vec3 lineCol = mix(mix(vec3(0.48, 0.91, 1.0), vec3(0.94, 0.81, 0.53), step(0.85, rnd)),
                       vec3(1.0, 0.7, 0.4), smoothstep(0.6, 1.0, uDive));
    col = col * mix(1.0, fall(1.15, 0.15, r), uDive * 0.75);
    col += lineCol * streak * 1.1;
  }

  // Breakthrough bloom: one slow warm swell, never a strobe.
  col += vec3(1.0, 0.8, 0.56) * uWarp * 0.42 * fall(1.1, 0.0, r);

  // ---- Flames over everything, then embers.
  vec3 fire = fireRamp(heat);
  col = mix(col, fire, fireA) + fire * fireA * 0.25;
  float embers = emberLayer(p, 18.0, 0.55, 1.0) + emberLayer(p, 11.0, 0.38, 5.0) * 0.8;
  col += vec3(1.0, 0.4, 0.1) * embers * 1.5 * clamp(uFlame * 1.2 + uReveal * 0.4, 0.0, 1.0);

  // Vignette keeps the frame edges dark (settling in with the grade).
  col *= 1.0 - 0.45 * smoothstep(0.55, 1.25, r) * settle;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
