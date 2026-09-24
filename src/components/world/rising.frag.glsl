// RISING THE WORLD — one full-screen pass: the dive, then the image burning
// like a print held over a fire (scorch, blisters, an ember edge eating
// inward, char with cooling cracks and ash), flames, smoke, heat haze, sparks.
// GLSL ES 1.00 (WebGL 1 and 2). OCTAVES / BLUR_TAPS are injected as #defines
// so the adaptive quality ladder can recompile a cheaper variant:
//   OCTAVES 4  everything
//   OCTAVES 3  no smoke detail or self-shadow, no ash, no haze, no large
//              blisters, one spark layer and no drifting embers
//   OCTAVES 2  also no smoke, no sparks, no small flame eddies, no crack
//              breaks or ember specks, and the firelight flickers with the tongues
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
uniform float uZoom;        // the dive's world UV scale: 1 = cover fit, <1 = closer
uniform float uArrive;      // the scale on the far side of the breakthrough
uniform float uOpen;        // radius of the breakthrough opening (0: not yet)
uniform float uBlur;        // radial zoom-blur length (0..0.5)
uniform float uDive;        // 0..1 dive progress (speed lines, tunnel, grade)
uniform float uWarp;        // 0..1 amber light when the camera breaks through
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
uniform sampler2D uNoise;   // r, g: fbm; b: cell edge distance (F2 - F1); a: fine fbm. Tileable, mipmapped.

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

// Rising particles: at most one per grid cell, on a grid that scrolls up. The
// scroll wraps every 16 rows and the hash wraps with it, so the wrap is
// seamless and the numbers stay small at FP16. The lookup is warped sideways
// by a wind that changes with height and time: every path wanders, and the
// motion trail below the head bends along it. q is aspect-correct (screen
// heights); radius and tail are in screen heights. keep is the share of
// cells holding a live particle here; it falls with the height above the
// fire, so particles crowd over the flames and go out one by one as they
// climb (each keeps its hash, and dies where the share drops below it).
// Returns (head, trail).
vec2 sparkLayer(vec2 q, vec2 cells, float speed, float seed, float radius, float tail, float wind, float keep) {
  vec2 g = q * cells;
  float wy = q.y * 8.0 + seed * 1.7;
  g.x += (sin(wy + uTime * 1.3 + q.x * 2.0) * 0.6 + sin(wy * 2.3 - uTime * 2.1 + q.x * 6.0) * 0.28) * wind;
  g.y -= fract(uTime * speed * cells.y / 16.0) * 16.0;
  vec2 id = floor(g);
  id.y = mod(id.y, 16.0);
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5) * vec2(0.5, 0.36);
  // Isotropic, in cell widths (not screen heights: squares stay FP16-normal).
  vec2 r = (fract(g) - 0.5 - o) * vec2(1.0, cells.x / cells.y);
  float rad = radius * cells.x;
  // A hot point with a short tail that thins and dims as it trails off.
  float t = clamp(-r.y / (tail * cells.x), 0.0, 1.0);
  float w = rad * (1.0 - 0.6 * t);
  float trail = fall(1.0, 0.0, t) * step(r.y, 0.0) * exp(-(r.x * r.x) / (w * w));
  float head = exp(-dot(r, r) / (rad * rad));
  float twinkle = 0.7 + 0.3 * sin(uTime * (6.0 + 5.0 * h) + h * 40.0);
  float alive = smoothstep(0.0, 0.05, h - (1.0 - keep)) * twinkle;
  return vec2(head, trail * 0.7) * alive;
}

// Drifting ash: small torn flakes that tumble (their width swings with the
// turn), grey where the light catches them, some still burning at the rim.
vec2 ashLayer(vec2 q, vec2 cells, float speed, float seed) {
  vec2 g = q * cells;
  g.x += sin(q.y * 5.0 + seed + uTime * 0.6) * 0.3;
  g.y -= fract(uTime * speed * cells.y / 8.0) * 8.0;
  vec2 id = floor(g);
  id.y = mod(id.y, 8.0);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 5.3), hash12(id + seed + 1.9)) - 0.5) * 0.45;
  float turn = abs(sin(uTime * (1.1 + 1.6 * h) + h * 31.0));
  vec2 r = (f - o) / vec2(0.03 + 0.1 * turn, 0.065 + 0.03 * h);
  // A torn, irregular flake rather than a disc.
  float torn = dot(r, r) + 0.45 * sin(r.x * 3.1 + h * 40.0) * cos(r.y * 2.3 + h * 17.0);
  float flake = fall(1.0, 0.8, torn) * step(0.8, h);
  float rim = flake * smoothstep(0.55, 0.95, torn);
  return vec2(flake, rim * step(0.9, h));
}

// Sheets of ash lifting off the front: torn, curled (one side lit by the
// fire, the other in shadow), turning as they rise, with a burning rim on the
// edge turned to the fire. q is aspect-correct, so they keep their shape on
// any screen. Returns (cover, lit side 0..1, rim).
vec3 ashSheet(vec2 q, vec2 cells, float speed, float seed) {
  vec2 g = q * cells;
  g.x += sin(q.y * 2.4 + seed + uTime * 0.45) * 0.22;
  g.y -= fract(uTime * speed * cells.y / 8.0) * 8.0;
  vec2 id = floor(g);
  id.y = mod(id.y, 8.0);
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 5.3), hash12(id + seed + 1.9)) - 0.5) * vec2(0.2, 0.3);
  vec2 r = (fract(g) - 0.5 - o) / cells;              // screen heights
  float spin = uTime * (0.5 + 0.7 * h) + h * 20.0;
  float cs = cos(spin);
  float sn = sin(spin);
  r = vec2(cs * r.x - sn * r.y, sn * r.x + cs * r.y);
  float turn = sin(uTime * (0.9 + 0.8 * h) + h * 9.0);
  // Foreshortened as it turns, and bowed: curled paper.
  vec2 s = r / ((0.02 + 0.02 * hash12(id + seed + 9.1)) * vec2(0.3 + 0.7 * abs(turn), 1.0));
  s.y += 0.35 * s.x * s.x * sign(turn);
  float ang = atan(s.y, s.x);
  float torn = length(s) / (1.0 + 0.26 * sin(3.0 * ang + h * 20.0) + 0.13 * sin(7.0 * ang + h * 7.0));
  float cover = fall(1.0, 0.86, torn) * step(0.5, h);
  float lit = clamp(0.5 + 0.5 * s.x * sign(turn) - 0.35 * s.y, 0.0, 1.0);
  float rim = cover * smoothstep(0.6, 0.98, torn) * smoothstep(0.25, 0.75, lit);
  return vec3(cover, lit, rim);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;                 // 0..1, y up
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);          // centred, aspect-correct
  float r = length(p);
  float T = uTime;
  // Interleaved gradient noise: dithers the blur taps and the breakthrough edge.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));

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
  float lowN = 0.5;
  if (burning > 0.5) {
    vec2 bq = uv * vec2(max(aspect, 0.7), 1.0);
    lowN = nz(bq * 0.36 + vec2(0.17, 0.53)).r;
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
    // A soft step (a couple of pixels even when the canvas is upscaled), under the lip.
    burnt = fall(0.0, -0.02, d);
  }
  float hy = d / 0.8;                                // height above the front (screen heights)
  float hyc = max(hy, 0.0);
  // The front climbs about 0.23 field units a second: seconds since it passed here.
  float since = max(-d, 0.0) * 4.3;

  // ---- Flames: domain-warped, upward-advected turbulence rising off the front.
  // Big eddies rise slower than small ones; the sway bends the tips most and
  // pinches them off. A tongue is wherever the turbulence beats a threshold
  // that climbs with the height above the front: a continuous sheet at the
  // lip, tongues of mixed height above it, and detached flamelets at the tips.
  vec3 emit = vec3(0.0);
  float flameA = 0.0;
  float light = 0.0;
  float hazeAmt = 0.0;
  float smoke = 0.0;
  vec3 smokeCol = vec3(0.0);
  float hot = 0.9;
  if (burning > 0.5) {
    vec2 sway = nz(fq * vec2(0.42, 0.3) + vec2(0.13, -fract(T * 0.17))).rg - 0.5;
    float tall = nz(vec2(fq.x * 0.31 + 0.71, 0.37 + fract(T * 0.043))).g;   // tongue height along the front
    // Each tongue swells and sinks on its own slow beat (about once a second),
    // never all together: no global brightness pulse.
    float pulse = nz(vec2(fq.x * 0.83 + 0.33, 0.61 + fract(T * 0.21))).r;
    float H = (0.2 + 0.32 * smoothstep(0.25, 0.8, tall)) * (0.45 + 0.55 * uFlame) * (0.78 + 0.44 * pulse);
    float h = hyc / H;
    // The sway bends the tips far more than the roots: the tongues lick, and
    // the vertical warp pinches their tips off into flamelets.
    float bend = 0.1 + 0.42 * min(h, 1.8) * min(h, 1.8);
    vec2 q = fq * vec2(1.5, 0.72) + sway * vec2(0.34, 0.15) * bend;
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
    // No holes in the sheet at the root: the threshold only bites above it.
    float dens = (turb - th + 0.3 * fall(0.45, 0.1, h)) * fuel - (1.0 - fuel) * 0.3;
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
    float core = smoothstep(0.0, 0.32, max((turb - th) * fuel, resDens)) * (0.8 + 0.4 * n2);
    float temp = (0.38 + 0.46 * core) * (1.0 - 0.46 * smoothstep(0.0, 1.35, h))
               + 0.1 * exp(-h * 6.0) * fuel;
    emit += blackbody(temp) * body * uFlame;
    // The glow a lens sees around a fire.
    emit += vec3(0.5, 0.12, 0.02) * exp(-hyc / 0.07) * fuel * uFlame * 0.35;
    hot = 0.84 + 0.4 * sway.y;

    // Warm, flickering light from the fire on what is left of the print.
#if OCTAVES >= 3
    float flick = nz(vec2(fq.x * 0.22 + 0.4, fract(T * 0.31))).r;
#else
    float flick = pulse;
#endif
    light = uFlame * exp(-hyc / 0.24) * (0.86 + 0.3 * (flick - 0.5)) * (1.0 - burnt * 0.6);

    // Heat haze: shimmer in a narrow band of hot air just above the flame bodies.
    hazeAmt = uFlame * exp(-((hy - 0.08) * (hy - 0.08)) / 0.0128) * step(-0.02, hy);

    // Smoke: a lit medium, not a darkener. Billows rise faster than the front
    // climbs and spread as they go; they thicken above the tongue tips and
    // collect towards the top of the frame. Grey-brown in the dark, warm on
    // the underside the fire lights, shadowed on top (one more fetch towards
    // the fire gives the self-shadow).
#if OCTAVES >= 3
    float sh = hy - 0.1;
    float widen = 1.0 / (1.0 + 0.9 * max(sh, 0.0));
    vec2 sq = vec2(p.x * kx * 0.8 * widen, uv.y * 0.7);
    vec2 sw = nz(sq * 0.6 + vec2(0.71, -fract(T * 0.11))).gr - 0.5;
    vec2 sp0 = sq + sw * 0.3 + vec2(0.29, -fract(T * 0.3));
    float s1 = nz(sp0).r;
#if OCTAVES >= 4
    float s2 = nz(sq * 2.3 + sw * 0.2 + vec2(0.55, -fract(T * 0.5))).g;
    float below = nz(sp0 - vec2(0.0, 0.04)).r;
    float sn = s1 * 0.7 + s2 * 0.3;
#else
    float below = s1 - 0.02;
    float sn = s1;
#endif
    // Plumes rise off the tallest tongues and merge higher up.
    float plume = mix(smoothstep(0.35, 0.7, tall), 1.0, smoothstep(0.1, 0.6, sh));
    float envelope = smoothstep(0.02, 0.2, sh) * (0.5 + 0.5 * smoothstep(0.35, 0.95, uv.y)) * plume;
    smoke = smoothstep(0.48, 0.66, sn) * envelope * uFlame;
    float facing = clamp(0.5 + (s1 - below) * 7.0, 0.0, 1.0);
    float warm = exp(-max(sh, 0.0) / 0.4) * uFlame;
    // Brighter than the night road, darker than the lit armour; denser cores
    // and the tops (turned away from the fire) darker, the underside warm.
    smokeCol = vec3(0.27, 0.25, 0.23) * (0.55 + 0.45 * facing) * (1.0 - 0.3 * smoothstep(0.62, 0.8, sn))
             + vec3(0.6, 0.23, 0.07) * warm * (0.2 + 0.8 * facing);
#endif
  }

  // ---- The print: cover fit, dive zoom, radial blur. At zoom 1 the frame is
  // the plain cover fit, identical to the DOM portal image; the focal point is
  // reached as the camera closes in and never shows past the image edge.
  // The breakthrough: an opening tears out from the core (its edge dithered),
  // and inside it the camera is already through, on the far side (uArrive).
  float opened = step(0.001, uOpen);
  float zoom = mix(uZoom, uArrive, opened * step(r, uOpen));
  vec2 win = 0.5 * uWorldScale * zoom;
  vec2 focus = clamp(mix(uFrame, uFocus, clamp((1.0 - zoom) * 5.0, 0.0, 1.0)), win, 1.0 - win);
  vec2 haze = vec2(0.0);
#if OCTAVES >= 4
  if (burning > 0.5) {
    // Mostly vertical, low across: shimmer, not a liquified print.
    vec2 hn = nz(vec2(p.x * 1.4, uv.y * 2.2) + vec2(0.5, -fract(T * 0.62))).rg - 0.5;
    haze = hn * vec2(0.006, 0.01) * hazeAmt;
  }
#endif
  vec2 wuv = (uv + haze - 0.5) * uWorldScale * zoom + focus;
  vec3 world;
  if (uBlur > 0.002) {
    // Taps jittered per pixel: the ghost copies become fine grain. Around the
    // opening's edge each tap picks its side by its own jitter, so the two
    // views cross-dissolve over a soft ring instead of a seam.
    world = vec3(0.0);
    for (int i = 0; i < BLUR_TAPS; i++) {
      float jitter = fract(ign + float(i) * 0.618034);
      float k = (float(i) + ign) / float(BLUR_TAPS);
      float z = mix(uZoom, uArrive, opened * step(r, uOpen + (jitter - 0.5) * 0.36));
      vec2 w = 0.5 * uWorldScale * z;
      vec2 fc = clamp(mix(uFrame, uFocus, clamp((1.0 - z) * 5.0, 0.0, 1.0)), w, 1.0 - w);
      vec2 tuv = (uv + haze - 0.5) * uWorldScale * z + fc;
      world += tex(uWorld, fc + (tuv - fc) * (1.0 - uBlur * k));
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
  float lum0 = dot(world, vec3(0.299, 0.587, 0.114));
  world = world * (1.0 + light * vec3(1.25, 0.55, 0.22)) + light * vec3(0.055, 0.016, 0.003);

  // ---- Scorch ahead of the front: the emulsion yellows, browns, blisters and
  // blackens at the lip before it catches.
  float cells = 0.5;
  if (burning > 0.5) {
    cells = nz(uv * vec2(3.4 * aspect, 3.4) + vec2(0.3, 0.8)).b;
#if OCTAVES >= 4
    float cellsL = nz(uv * vec2(1.6 * aspect, 1.6) + vec2(0.62, 0.21)).b;
#else
    float cellsL = cells;
#endif
    float lum = dot(world, vec3(0.299, 0.587, 0.114));
    vec3 sepia = lum * vec3(1.16, 0.8, 0.5) + vec3(0.018, 0.007, 0.0);
    world = mix(world, sepia, smoothstep(0.0, 0.45, scorch) * 0.9);
    vec3 brown = vec3(0.15, 0.065, 0.024) * (0.3 + lum * 1.4);
    world = mix(world, brown, smoothstep(0.35, 0.85, scorch));
    // Blisters: raised bubbles catch the firelight, their rims stay dark. They
    // come in patches, small here and large there, and the rims melt under
    // the flames instead of speckling through them.
    float band = smoothstep(0.2, 0.45, scorch) * fall(0.95, 0.75, scorch);
    float patchy = smoothstep(0.4, 0.62, midN);
    float large = smoothstep(0.35, 0.55, lowN) * (1.0 - patchy);
    float bubble = max(smoothstep(0.42, 0.62, cells) * patchy, smoothstep(0.4, 0.6, cellsL) * large);
    float rim = smoothstep(0.3, 0.38, cells) * fall(0.46, 0.38, cells) * patchy;
    world = mix(world, world * 1.7 + vec3(0.05, 0.02, 0.004) * (0.4 + light), bubble * band * 0.7);
    world *= 1.0 - rim * band * 0.4 * (1.0 - flameA);
    world = mix(world, vec3(0.014, 0.007, 0.004), smoothstep(0.72, 1.0, scorch));
  }

  // ---- Char: carbon that keeps a ghost of the print, plates split by
  // fissures whose edges curl up grey-white, greying to ash where it has burned
  // longest; the fissures and ember specks glow and cool slowly (breathing
  // locally); the rider emerges from the ash.
  vec3 col = world;
  if (burning > 0.5) {
#if OCTAVES >= 3
    vec4 cf = nz(uv * vec2(4.1 * aspect, 4.1) + vec2(0.71, 0.43));   // fine: fibres, crazing, specks
    float breathe = nz(uv * vec2(2.3 * aspect, 2.3) + vec2(0.13, fract(T * 0.23))).r;
#else
    vec4 cf = vec4(0.5, 0.5, 0.3, 0.5);
    float breathe = 0.6;
#endif
    // Plates about 40 px across, their outlines wobbled by the fine field.
    vec4 ch = nz(uv * vec2(1.45 * aspect, 1.45) + (cf.rg - 0.5) * 0.035 + vec2(0.37, 0.19));
    // Everything below only shows on the char: skipped above the front. The
    // noise fetches stay outside, in uniform control flow for the mipmaps;
    // the rider art inside has no mipmaps.
    if (burnt > 0.001) {
      float cool = exp(-since * 0.55);                    // 1 at the front, a third after 2 s
      float lingering = smoothstep(0.28, 0.7, uFlame);    // everything goes out as the fire dies
      float ashN = ch.a;
      // Each plate domes a little (its middle catches more light), and keeps a
      // ghost of the print: the emulsion chars unevenly.
      float dome = smoothstep(0.05, 0.5, ch.b);
      vec3 charCol = vec3(0.018, 0.015, 0.013) * (0.6 + 0.5 * ashN + 0.4 * dome)
                   + lum0 * vec3(0.05, 0.046, 0.043);
      float greyAsh = smoothstep(0.58, 0.8, ashN * 0.55 + cf.a * 0.45) * smoothstep(0.4, 2.2, since);
      charCol = mix(charCol, vec3(0.1, 0.094, 0.088) * (0.7 + 0.5 * dome), greyAsh * 0.6);
      // Cracks: the char shrinks into plates (the edges of a Voronoi net), a
      // finer crazing inside them; a few gaps stay shut. The plates' edges curl
      // up and whiten to ash, lit warm by the glow in the crack while it lasts.
      // Cracks run everywhere, but only gape (and glow) in some stretches.
      float open = smoothstep(0.38, 0.62, ch.r) * smoothstep(0.3, 0.5, cf.r);
      float crack = fall(0.05, 0.012, ch.b) * (0.45 + 0.55 * open);
      float lip = smoothstep(0.03, 0.07, ch.b) * fall(0.15, 0.07, ch.b) * (0.3 + 0.7 * open);
      float craze = fall(0.06, 0.02, cf.b) * (1.0 - crack);
      vec3 ashRim = vec3(0.17, 0.16, 0.15) + blackbody(0.5) * 0.14 * cool * lingering;
      float whiten = smoothstep(0.02, 0.4, since);
      charCol = mix(charCol, ashRim, (lip * 0.7 + craze * 0.22) * whiten);
      charCol = mix(charCol, vec3(0.006, 0.004, 0.004), crack * 0.8);
      charCol += light * vec3(0.12, 0.04, 0.01) * cool;
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
      float emerge = uReveal * smoothstep(0.05, 0.65, since);
      charCol = max(charCol, rider * emerge * (0.88 + 0.24 * ashN));
      col = mix(world, charCol, burnt);

      // The fissures cool from orange to dull red over a couple of seconds, each
      // patch breathing on its own slow beat (local and gentle: no strobe).
      float crackGlow = crack * open * (0.2 + 0.8 * cool) * (0.78 + 0.44 * breathe) * lingering;
      emit += blackbody(mix(0.35, 0.6, cool) * hot) * crackGlow * burnt * 1.3;
      // Ember speckles in the char, each breathing on its own beat as it cools.
      float speck = smoothstep(0.6, 0.78, cf.b) * smoothstep(0.56, 0.8, breathe) * smoothstep(0.5, 0.7, ch.r);
      emit += blackbody(mix(0.4, 0.62, cool) * hot) * speck * exp(-since * 0.7) * burnt * lingering;
    }

    // Ember edge: an incandescent lip with a fractal edge over the soft step
    // to char, and the ember bed behind it cooling from orange to dull red.
    float w = 0.006 + 0.009 * edgeFine;
    float lipGlow = exp(-(d + 0.009) * (d + 0.009) / (w * w));
    float bed = exp(min(d, 0.0) / 0.05) * burnt * (0.35 + 0.65 * smoothstep(0.04, 0.3, cells));
    emit += blackbody(0.92 * hot) * lipGlow * 0.9 * smoothstep(0.0, 0.25, uFlame + uBurn * 2.0);
    emit += blackbody(0.55 * hot) * bed * 0.8;

    // Smoke over the print: it lifts the dark road into a grey-brown haze and
    // veils the bright armour (at most 0.6), lit warm from below.
    col = mix(col, smokeCol, smoke * 0.62);
    // Soot in the flame bodies dims what is behind them.
    col *= 1.0 - flameA * 0.3;

    // Ash lifting off the fire in front of everything: large curled sheets
    // with a lit face and a burning rim near the front, small flakes higher up.
    // Both hide the flames behind them.
    // Both are hash-only (no texture fetches), so they are skipped where no
    // ash can be.
    float ashNear = uFlame * exp(-max(hy, 0.0) / 0.45) * smoothstep(-0.03, 0.03, hy);
#if OCTAVES >= 4
    if (ashNear > 0.01) {
      vec3 sheet = ashSheet(p + vec2(0.37, 0.0), vec2(7.0, 5.0), 0.36, 23.0);
      float sheetEnv = uFlame * fall(0.3, 0.12, hy) * smoothstep(-0.02, 0.03, hy);
      float sheetA = sheet.x * sheetEnv;
      vec3 sheetCol = mix(vec3(0.03, 0.026, 0.024), vec3(0.26, 0.245, 0.23), sheet.y * sheet.y)
                    + vec3(0.32, 0.12, 0.03) * sheet.y * light;
      col = mix(col, sheetCol, sheetA);
      emit *= 1.0 - sheetA;
      emit += blackbody(0.62 * hot) * sheet.z * sheetEnv * 1.4;
      vec2 ash = ashLayer(fq + vec2(0.2, 0.1), vec2(9.0, 6.0), 0.2, 13.0);
      float flakeA = ash.x * ashNear * 0.9;
      col = mix(col, vec3(0.15, 0.14, 0.13) + light * vec3(0.4, 0.16, 0.05), flakeA);
      emit *= 1.0 - flakeA * 0.8;
      emit += blackbody(0.55) * ash.y * ashNear * 1.2;
    }
#endif

    // Sparks: orange-yellow points with short curved trails, dense near the
    // flames and burning out as they climb; embers drift up slower and cool.
    float rise = max(hy, 0.0);
    float near = uFlame * exp(-rise / 0.55) * smoothstep(-0.05, 0.02, hy);
#if OCTAVES >= 3
    if (near > 0.02) {
      // At least about 1.3 drawing-buffer pixels across, whatever the ladder's scale.
      float px = 1.3 / uRes.y;
      // Half the cells hold a spark just over the flames, a tenth higher up.
      float keep = 0.08 + 0.42 * exp(-rise / 0.2);
      vec2 sp = sparkLayer(p, vec2(22.0, 5.0), 0.62, 1.0, max(px, 0.0017), 0.022, 1.0, keep);
#if OCTAVES >= 4
      sp += sparkLayer(p + vec2(0.31, 0.0), vec2(15.0, 3.6), 0.48, 5.0, max(px, 0.0021), 0.028, 1.4, keep) * 0.8;
      // Embers: larger, slower, fewer, cooling from orange to dull red as
      // they climb until they go out.
      vec2 em = sparkLayer(p + vec2(0.13, 0.4), vec2(9.0, 4.0), 0.22, 9.0, max(px * 1.6, 0.0045), 0.012, 1.8,
                           0.06 + 0.3 * exp(-rise / 0.35));
      float emberT = mix(0.74, 0.42, clamp(rise / 0.6, 0.0, 1.0));
      emit += blackbody(emberT) * (em.x + em.y * 0.5) * near * 1.5;
#endif
      // Sparks cool as they climb: yellow-white heads over the flames, orange higher up.
      float sparkT = mix(0.9, 0.74, smoothstep(0.0, 0.5, rise));
      emit += (blackbody(sparkT) * sp.x + blackbody(sparkT - 0.12) * sp.y) * near * 2.8;
    }
#endif
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
                       vec3(1.0, 0.62, 0.3), smoothstep(0.6, 1.0, uDive));
    col = col * mix(1.0, fall(1.15, 0.15, r), uDive * 0.75);
    col += lineCol * streak * 1.1;
  }

  // Breakthrough: one slow swell of saturated amber light from the core. It
  // multiplies what is lit, so the blacks stay black; never a strobe.
  float bloom = uWarp * exp(-r * r / 0.22);
  col *= 1.0 + vec3(1.1, 0.5, 0.14) * bloom;
  col += vec3(0.5, 0.2, 0.05) * bloom * 0.12;

  // Everything incandescent, tone-mapped once: overlapping orange saturates
  // towards yellow-white the way film does, never past it.
  col += 1.0 - exp(-emit);

  // Vignette keeps the frame edges dark (settling in with the grade).
  col *= 1.0 - 0.45 * smoothstep(0.55, 1.25, r) * settle;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
