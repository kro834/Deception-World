// RISING THE WORLD — one full-screen pass: the dive, then the image burning
// like a print held over a fire (scorch, blisters, an ember edge eating
// inward, char with cooling cracks), flames, smoke, heat haze, sparks, ash.
// GLSL ES 1.00 (WebGL 1 and 2). OCTAVES / BLUR_TAPS are injected as #defines
// so the adaptive quality ladder can recompile a cheaper variant.
//
// Turbulence comes from uNoise, a tileable noise texture baked once per run
// (rising-noise.frag.glsl), so the burn costs texture fetches, not per-pixel
// value noise. Every fetch sits in uniform control flow (mipmaps need it).
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
uniform vec2 uWorldScale;   // cover-fit factors for the burning image
uniform vec2 uRiderScale;   // fit factors for the rider art
uniform vec2 uFrame;        // centre of the cover crop in world UV (matches the DOM object-position)
uniform vec2 uFocus;        // dive focal point in world UV (reached as the zoom closes in)
uniform sampler2D uWorld;
uniform sampler2D uRider;
uniform sampler2D uNoise;   // r, g: fbm; b: cells (F1); a: fine fbm. Tileable, mipmapped.

// GLSL ES 1.00 leaves smoothstep(e0, e1, x) undefined for e0 >= e1 (some mobile drivers
// return garbage), so falling edges use this instead.
float fall(float e0, float e1, float x) { return 1.0 - smoothstep(e1, e0, x); }

vec3 tex(sampler2D s, vec2 t) { return texture2D(s, vec2(t.x, 1.0 - t.y)).rgb; }
vec4 nz(vec2 q) { return texture2D(uNoise, q); }

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

// Incandescence for a normalised temperature (0 ~ 800 K, 1 ~ 2400 K): the hue
// runs deep red -> orange -> yellow, and the radiance climbs steeply with it,
// so red only ever shows dim and yellow-white only in the hottest cores. HDR:
// the result is tone-mapped (1 - exp(-x)) after everything has been added up.
vec3 blackbody(float t) {
  t = clamp(t, 0.0, 1.15);
  vec3 hue = vec3(1.0, 0.035, 0.006);
  hue = mix(hue, vec3(1.0, 0.2, 0.03), smoothstep(0.25, 0.55, t));
  hue = mix(hue, vec3(1.0, 0.46, 0.1), smoothstep(0.5, 0.8, t));
  hue = mix(hue, vec3(1.0, 0.7, 0.36), smoothstep(0.78, 1.05, t));
  return hue * (3.4 * t * t * t + 0.35 * t);
}

// Rising sparks: one per grid cell at most, streaked along their path (a
// motion-blurred head with a tail below it). Cells are tall so a streak
// never crosses a cell edge.
float sparkLayer(vec2 q, vec2 cells, float speed, float seed, float tail) {
  vec2 g = q * cells;
  g.y -= uTime * speed * cells.y;
  float sway = sin(g.y * 0.55 + seed * 3.0) * 0.28;
  g.x += sway;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5) * vec2(0.55, 0.3);
  vec2 r = f - o;
  // Lean the streak with the sway (its local slope), so a curving path reads as motion.
  r.x -= r.y * cos(g.y * 0.55 + seed * 3.0) * 0.15;
  float across = exp(-(r.x * r.x) / 0.0012);
  float along = exp(min(r.y, 0.0) * tail) * exp(-max(r.y, 0.0) * max(r.y, 0.0) / 0.002);
  along += exp(-r.y * r.y / 0.0008) * 0.7;   // the hot head
  float twinkle = 0.62 + 0.38 * sin(uTime * (7.0 + 5.0 * h) + h * 40.0);
  return across * along * step(0.86, h) * (h - 0.8) * 5.5 * twinkle;
}

// Drifting ash: dark flakes that tumble (their width swings with the turn),
// some still burning at the rim.
vec2 ashLayer(vec2 q, vec2 cells, float speed, float seed) {
  vec2 g = q * cells;
  g.y -= uTime * speed * cells.y;
  g.x += sin(g.y * 0.8 + seed + uTime * 0.6) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 5.3), hash12(id + seed + 1.9)) - 0.5) * 0.45;
  float turn = abs(sin(uTime * (1.1 + 1.6 * h) + h * 31.0));
  vec2 r = (f - o) / vec2(0.03 + 0.1 * turn, 0.065 + 0.03 * h);
  // A torn, irregular flake rather than a disc.
  float torn = dot(r, r) + 0.45 * sin(r.x * 3.1 + h * 40.0) * cos(r.y * 2.3 + h * 17.0);
  float flake = fall(1.0, 0.8, torn) * step(0.8, h);
  float rim = flake * (1.0 - smoothstep(0.1, 0.75, torn));
  return vec2(flake, (flake - rim) * step(0.92, h));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;                 // 0..1, y up
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);          // centred, aspect-correct
  float r = length(p);
  float T = uTime;

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

  // Flame space: tongue density follows the screen width, so a portrait phone
  // gets as many tongues across as a desktop instead of two giant blobs.
  float kx = max(1.0, 0.75 / aspect);
  vec2 fq = vec2(p.x * kx, uv.y);
  float burning = step(0.0001, uFlame + uBurn);     // uniform: off during the dive

  // ---- Burn field: the print burns from the bottom edge. A low octave tears
  // the front into tongues and islands, finer octaves fray the edge.
  float d = 1.0;          // > 0 intact (height of the front below, in field units), < 0 burnt
  float scorch = 0.0;
  float burnt = 0.0;
  float edgeFine = 0.5;
  float midN = 0.5;
  if (burning > 0.5) {
    vec2 bq = uv * vec2(max(aspect, 0.7), 1.0);
    float lowN = nz(bq * 0.36 + vec2(0.17, 0.53)).r;
    midN = nz(bq * 1.3 + vec2(0.61, 0.07)).g;
    edgeFine = nz(bq * 5.2 + vec2(0.23, 0.91)).a;
    // The fine octave as turbulence (|n|): sharp notches, so the edge frays
    // into fibres instead of rounding off like a cloud.
    float fibre = abs(edgeFine - 0.5) * 2.0;
    float field = uv.y * 0.8 + (lowN - 0.5) * 0.5 + (midN - 0.5) * 0.2 + (fibre - 0.4) * 0.028 + (edgeFine - 0.5) * 0.02;
    float level = mix(-0.3, 1.12, uBurn);
    d = field - level;
    // Browning creeps ahead of the front, unevenly (hot spots scorch first).
    float reach = max(0.004, (0.08 + 0.12 * midN) * smoothstep(0.0, 0.6, uFlame + uBurn * 4.0));
    scorch = fall(reach, 0.0, d);
    burnt = fall(0.0, -0.012, d);
  }
  float hy = d / 0.8;                                // height above the front (screen heights)
  float hyc = max(hy, 0.0);
  float age = clamp(-d / 0.32, 0.0, 1.0);            // 0 at the front .. 1 long burnt

  // ---- Flames: domain-warped, upward-advected turbulence rising off the front.
  // Big eddies rise slower than small ones; the sway bends the tips most. A
  // tongue is wherever the turbulence beats a threshold that climbs with the
  // height above the front: a continuous sheet at the lip, tongues of mixed
  // height above it, and detached wisps at the tips.
  vec3 emit = vec3(0.0);
  float flameA = 0.0;
  float light = 0.0;
  float hazeAmt = 0.0;
  float smoke = 0.0;
  float smokeLit = 0.0;
  if (burning > 0.5) {
    vec2 sway = nz(fq * vec2(0.42, 0.3) + vec2(0.13, -fract(T * 0.17))).rg - 0.5;
    float tall = nz(vec2(fq.x * 0.31 + 0.71, 0.37 + fract(T * 0.043))).g;   // tongue height along the front
    // Each tongue swells and sinks on its own slow beat (about once a second),
    // never all together: no global brightness pulse.
    float pulse = nz(vec2(fq.x * 0.83 + 0.33, 0.61 + fract(T * 0.21))).r;
    float H = (0.2 + 0.32 * smoothstep(0.25, 0.8, tall)) * (0.45 + 0.55 * uFlame) * (0.78 + 0.44 * pulse);
    float h = hyc / H;
    // The sway bends the tips far more than the roots: the tongues lick.
    float bend = 0.1 + 0.42 * min(h, 1.8) * min(h, 1.8);
    vec2 q = fq * vec2(1.5, 0.72) + sway * vec2(0.34 * bend, 0.1);
    float n1 = nz(q + vec2(0.0, -fract(T * 0.44))).r;
#if OCTAVES >= 3
    // Small eddies stretched upright: they split the sheet into separate tongues.
    float n2 = nz(q * vec2(2.4, 1.6) + vec2(0.37, -fract(T * 0.95))).g;
    float turb = n1 * 0.55 + n2 * 0.45;
#else
    float n2 = n1;
    float turb = n1;
#endif
    // Only the freshest char still feeds the flames.
    float fuel = exp(min(hy, 0.0) / 0.04);
    float th = 0.12 + 0.74 * (1.0 - exp(-1.2 * h)) + 0.3 * smoothstep(1.6, 2.6, h);
    float dens = (turb - th) * fuel - (1.0 - fuel) * 0.3;
    // After the image is gone, low fire keeps licking along the bottom edge.
    // Patchy: it keeps burning only where the last fuel lies along the edge.
    float resH = uv.y / (0.05 + 0.08 * tall);
    float resDens = (turb - min(0.36 + 0.6 * resH, 0.95)) * smoothstep(0.72, 0.97, uBurn)
                  * smoothstep(0.3, 0.6, tall);
    dens = max(dens, resDens);
    // A crisp edge (a flame is a thin reaction sheet), a translucent body.
    float body = smoothstep(0.0, 0.06, dens);
    flameA = body * uFlame;
    // Blackbody: the soot is hottest at the root and cools as it rises, so the
    // tongues run yellow-white at the base, orange in the body and dim deep red
    // at the tips; the folds of the flame (small eddies) glow brighter.
    float core = smoothstep(0.0, 0.32, dens) * (0.8 + 0.4 * n2);
    float temp = (0.38 + 0.46 * core) * (1.0 - 0.46 * smoothstep(0.0, 1.35, h))
               + 0.1 * exp(-h * 6.0) * fuel;
    emit += blackbody(temp) * body * uFlame;
    // The glow a lens sees around a fire.
    emit += vec3(0.5, 0.12, 0.02) * exp(-hyc / 0.07) * fuel * uFlame * 0.35;

    // Warm, flickering light from the fire on what is left of the print.
    float flick = nz(vec2(fq.x * 0.22 + 0.4, fract(T * 0.31))).r;
    light = uFlame * exp(-hyc / 0.24) * (0.86 + 0.3 * (flick - 0.5)) * (1.0 - burnt * 0.6);

    // Heat haze: shimmer in the hot air just above the flame bodies.
    hazeAmt = uFlame * exp(-((hy - 0.16) * (hy - 0.16)) / 0.035) * step(-0.02, hy);

    // Smoke: slow, broad billows curling up off the tongue tips. It thickens
    // just above the fire, thins as it climbs, and veils and darkens the print
    // before the flames reach it. Screen-anchored noise, so it rises at its
    // own pace instead of riding the front.
    vec2 sq = vec2(p.x * kx * 0.7, uv.y * 0.62);
    vec2 sw = nz(sq * 0.7 + vec2(0.71, -fract(T * 0.07))).gr - 0.5;
    float s1 = nz(sq + sw * 0.8 + vec2(0.29, -fract(T * 0.12))).r;
#if OCTAVES >= 3
    float s2 = nz(sq * 2.3 + sw * 0.5 + vec2(0.55, -fract(T * 0.21))).g;
    float sn = s1 * 0.72 + s2 * 0.28;
#else
    float sn = s1;
#endif
    float sh = hy - 0.05;
    smoke = smoothstep(0.3, 0.62, sn) * smoothstep(0.0, 0.14, sh) * exp(-max(sh, 0.0) * 0.9) * uFlame;
    // Firelight scatters in the underside of the billows, so the smoke glows
    // brown-orange low down, and the thin edges of each billow catch it most.
    smokeLit = exp(-max(sh, 0.0) / 0.3) * (0.55 + 0.45 * fall(0.62, 0.36, sn));
  }

  // ---- The print: cover fit, dive zoom, radial blur. At zoom 1 the frame is
  // the plain cover fit, identical to the DOM portal image; the focal point is
  // reached as the camera closes in and never shows past the image edge.
  vec2 win = 0.5 * uWorldScale * uZoom;
  vec2 focus = clamp(mix(uFrame, uFocus, clamp((1.0 - uZoom) * 5.0, 0.0, 1.0)), win, 1.0 - win);
  vec2 haze = vec2(0.0);
#if OCTAVES >= 3
  if (burning > 0.5) {
    vec2 hn = nz(vec2(p.x * 2.6, uv.y * 1.6) + vec2(0.5, -fract(T * 0.62))).ga - 0.5;
    haze = hn * vec2(0.017, 0.024) * hazeAmt;
  }
#endif
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
  // ice during the dive, a warmer print as the fire takes hold. Both steps only
  // move forward in time; the fire's own light does the rest.
  float settle = smoothstep(0.0, 0.6, T);
  vec3 grade = mix(vec3(0.78, 0.96, 1.08), vec3(1.04, 0.9, 0.84), uHeat);
  world *= mix(vec3(1.0), grade, settle);
  world = world * (1.0 + light * vec3(1.25, 0.55, 0.22)) + light * vec3(0.055, 0.016, 0.003);

  // ---- Scorch ahead of the front: the emulsion yellows, browns, blisters and
  // blackens at the lip before it catches.
  float cells = 0.5;
  if (burning > 0.5) {
    cells = nz(uv * vec2(3.4 * aspect, 3.4) + vec2(0.3, 0.8)).b;
    float lum = dot(world, vec3(0.299, 0.587, 0.114));
    vec3 sepia = lum * vec3(1.16, 0.8, 0.5) + vec3(0.018, 0.007, 0.0);
    world = mix(world, sepia, smoothstep(0.0, 0.45, scorch) * 0.9);
    vec3 brown = vec3(0.15, 0.065, 0.024) * (0.3 + lum * 1.4);
    world = mix(world, brown, smoothstep(0.35, 0.85, scorch));
    // Blisters: raised bubbles catch the firelight, their rims stay dark.
    float band = smoothstep(0.2, 0.45, scorch) * fall(0.95, 0.75, scorch);
    float bubble = fall(0.3, 0.08, cells);
    float rim = smoothstep(0.26, 0.34, cells) * fall(0.46, 0.34, cells);
    world = mix(world, world * 1.7 + vec3(0.05, 0.02, 0.004) * (0.4 + light), bubble * band * 0.7);
    world *= 1.0 - rim * band * 0.45;
    world = mix(world, vec3(0.014, 0.007, 0.004), smoothstep(0.72, 1.0, scorch));
  }

  // ---- Char: near-black carbon that greys to ash where it has burned
  // longest, a glowing ember bed and fissures that cool within about a second,
  // and the rider emerging from the ash.
  vec3 col = world;
  if (burning > 0.5) {
    vec4 ch = nz(uv * vec2(1.6 * aspect, 1.6) + vec2(0.37, 0.19));
    vec4 cf = nz(uv * vec2(4.1 * aspect, 4.1) + vec2(0.71, 0.43));   // fine: fibres, speckles
    float ashN = ch.a;
    vec3 charCol = vec3(0.017, 0.013, 0.011) * (0.75 + 0.5 * ashN);
    float greyAsh = smoothstep(0.6, 0.84, ashN * 0.55 + cf.a * 0.45) * smoothstep(0.3, 1.0, age);
    charCol = mix(charCol, vec3(0.06, 0.056, 0.053), greyAsh * 0.5);
    charCol += light * vec3(0.12, 0.04, 0.01) * (1.0 - age);
    vec2 ruv = (uv + haze * 0.5 - 0.5) * uRiderScale + vec2(0.5, 0.5);
    float inFrame = step(0.0, ruv.x) * step(ruv.x, 1.0) * smoothstep(0.0, 0.08, ruv.x) * fall(1.0, 0.92, ruv.x);
    // Landscape (fitted by height): the art's top melts into the dark, as in the end still.
    inFrame *= mix(1.0, fall(1.0, 0.84, ruv.y), step(0.75, aspect));
    // Ember-lit while the fire burns; as it dies down the grade settles into
    // the end still's (.rw-end: the art at 0.56 under a faint ember wash), so
    // the canvas cross-fades into a picture of the same colour.
    vec3 rtex = tex(uRider, ruv);
    float settled = clamp((1.0 - uFlame) / 0.72, 0.0, 1.0) * uReveal;
    vec3 rider = mix(rtex * vec3(1.0, 0.58, 0.46) * 0.58, rtex * 0.448 + vec3(0.066, 0.014, 0.005), settled) * inFrame;
    charCol += vec3(0.066, 0.014, 0.005) * settled;
    float emerge = uReveal * smoothstep(0.02, 0.45, age);
    charCol = max(charCol, rider * emerge * (0.88 + 0.24 * ashN));
    col = mix(world, charCol, burnt);

    // Ember edge: a thin incandescent lip with a fractal edge, and the ember bed
    // behind it cooling from orange to dull red to black.
    float w = 0.004 + 0.009 * edgeFine;
    float lip = exp(-(d + 0.004) * (d + 0.004) / (w * w));
    float bed = exp(min(d, 0.0) / 0.035) * burnt * (0.35 + 0.65 * smoothstep(0.1, 0.5, cells));
    float hot = 0.78 + 0.22 * nz(fq * vec2(2.2, 1.0) + vec2(0.9, fract(T * 0.09))).g;
    emit += blackbody(0.92 * hot) * lip * 0.9 * smoothstep(0.0, 0.25, uFlame + uBurn * 2.0);
    emit += blackbody(0.55 * hot) * bed * 0.8;
    // Fissures: the zero contour of a smooth field is a connected network; a
    // finer field breaks it into separate cracks. They cool from the front back.
    float crackLine = smoothstep(0.86, 0.97, 1.0 - abs(ch.g - 0.5) * 2.0);
    float broken = smoothstep(0.38, 0.58, cf.r);
    float glowAge = max(exp(-age * 4.2) - 0.02, 0.0);
    emit += blackbody(0.52 * hot) * crackLine * broken * glowAge * burnt * 1.2;
    // Ember speckles in the fresh char, each breathing on its own slow beat.
    float breathe = nz(uv * vec2(2.3 * aspect, 2.3) + vec2(0.13, fract(T * 0.23))).r;
    float speck = fall(0.18, 0.04, cf.b) * smoothstep(0.56, 0.8, breathe) * smoothstep(0.5, 0.7, ch.r);
    emit += blackbody(0.6 * hot) * speck * exp(-age * 2.6) * burnt * 0.9;

    // Sparks with motion streaks and embers, thrown up from the fire.
    float near = uFlame * exp(-max(hy, 0.0) / 0.42) * smoothstep(-0.05, 0.02, hy);
    float sp = sparkLayer(p, vec2(22.0, 5.0), 0.62, 1.0, 20.0)
             + sparkLayer(p + vec2(0.31, 0.0), vec2(14.0, 3.6), 0.46, 5.0, 16.0) * 0.85;
    emit += blackbody(0.97) * sp * near * 2.4;
    float ember = sparkLayer(p + vec2(0.13, 0.4), vec2(9.0, 5.0), 0.2, 9.0, 60.0);
    emit += blackbody(0.62) * ember * (near + 0.15 * uFlame * burnt * (1.0 - age)) * 0.9;

    // Smoke over the print, lit from below by the flames.
    // Smoke scatters the firelight: it lifts the dark road into a brown haze
    // and veils the bright armour, instead of simply darkening.
    vec3 smokeCol = vec3(0.03, 0.027, 0.025) + smokeLit * uFlame * vec3(0.2, 0.075, 0.025);
    col = mix(col, smokeCol, smoke * 0.86);

    // Ash flakes lifting off the fire, tumbling; some still glowing at the rim.
    vec2 ash = ashLayer(p + vec2(0.2, 0.1), vec2(9.0, 6.0), 0.15, 13.0);
    float ashNear = uFlame * exp(-max(hy, 0.0) / 0.7) * smoothstep(-0.06, 0.0, hy);
    // Grey paper ash, lit orange from below; black against the flames.
    vec3 ashCol = mix(vec3(0.14, 0.13, 0.12) + light * vec3(0.5, 0.2, 0.07), vec3(0.02), flameA);
    col = mix(col, ashCol, ash.x * ashNear * 0.9);
    emit += blackbody(0.55) * ash.y * ashNear * 1.2;

    // Soot in the flame bodies dims what is behind them.
    col *= 1.0 - flameA * 0.3;
  }

  // ---- Dive: speed lines and tunnel.
  if (uDive > 0.001) {
    float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
    float lanes = 110.0;
    float lane = floor(ang * lanes);
    float rnd = hash11(lane + 1.7);
    float across = abs(fract(ang * lanes) - 0.5) * 2.0;
    float seg = fract(log(r + 0.02) * 1.4 - T * (0.9 + rnd * 1.4) * (0.6 + uDive * 1.8) + rnd * 9.0);
    float streak = step(0.5, rnd) * smoothstep(0.0, 0.12, seg) * fall(0.7, 0.12, seg);
    streak *= pow(1.0 - across, 3.0) * smoothstep(0.05, 0.5, r) * smoothstep(0.0, 0.35, uDive);
    vec3 lineCol = mix(mix(vec3(0.48, 0.91, 1.0), vec3(0.94, 0.81, 0.53), step(0.85, rnd)),
                       vec3(1.0, 0.7, 0.4), smoothstep(0.6, 1.0, uDive));
    col = col * mix(1.0, fall(1.15, 0.15, r), uDive * 0.75);
    col += lineCol * streak * 1.1;
  }

  // Breakthrough bloom: one slow warm swell, never a strobe.
  col += vec3(1.0, 0.8, 0.56) * uWarp * 0.42 * fall(1.1, 0.0, r);

  // Everything incandescent, tone-mapped once: overlapping orange saturates
  // towards yellow-white the way film does, never past it.
  col += 1.0 - exp(-emit);

  // Vignette keeps the frame edges dark (settling in with the grade).
  col *= 1.0 - 0.45 * smoothstep(0.55, 1.25, r) * settle;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
