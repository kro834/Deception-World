// The opening trace (2026-10-21; its fire forest green again, 2026-10-22).
// The title logo is one picture now, so the burn no longer turns one logo
// into another: it traces the one logo with the owner's forest-green fire
// (docs/forest-green-fire-20261019.md; fireRamp in opening-noise.glsl). A
// torn front climbs the lockup from the lower left to the upper right.
// Ahead of it the logo waits, scorched green as the heat builds, its red and
// blue split a little by the hot air. At the front green tongues lick up off
// the glyphs, a green burning edge runs along it and the glyph faces it
// meets flare. Behind it the logo stands green-hot, takes a prism sheen and
// settles to its own colours. Green sparks, near embers and ash ride it.
//
// Drawn on a premultiplied transparent canvas over the title scene, so only
// light, smoke and ash are added: no box. Appended to opening-noise.glsl
// (precision, noise, fireRamp, emberLayer). Frame 0 is the first logo; the
// hand-off frame (uCool 1, uFlame 0) is the final logo.

uniform vec2 uRes;       // drawing-buffer size (px)
uniform vec4 uLogo;      // the logo box in canvas UV (x, y, w, h), y up
uniform float uTime;     // seconds since the trace started
uniform float uHeat;     // 0..1 heat haze and scorch build-up (only rises)
uniform float uBurn;     // 0..1 the front's travel: lower left -> upper right
uniform float uFlame;    // 0..1 flame intensity (one swell)
uniform float uCool;     // 0..1 the hot logo settles to its own colours (1 = the DOM image)
uniform sampler2D uFirst; // the logo, premultiplied
uniform sampler2D uFinal; // the same logo, premultiplied (the hand-off frame)

// The owner's forest green (#228b22) and the lit greens of the 2026-10-19 burn.
const vec3 FOREST = vec3(0.1333, 0.5451, 0.1333);
const vec3 SCORCH = vec3(0.19, 0.72, 0.185);
const vec3 RIM = vec3(0.26, 0.72, 0.29);
const vec3 SPARK = vec3(0.23, 0.72, 0.235);
const vec3 SPILL = vec3(0.17, 0.72, 0.165);
const vec3 NEAR = vec3(0.27, 0.72, 0.315);
// The front's normal in logo UV (its direction of travel): it climbs from
// the lower left, tilted towards the wordmark's own lean.
const vec2 GRAD = vec2(0.5, 0.75);

float lum(vec4 c) { return max(c.r, max(c.g, c.b)); }

// Near-plane embers: a sparse layer of large soft discs (bokeh), slower than
// the sparks, so the fire has depth. One hash per pixel, as emberLayer.
float bokehLayer(vec2 q, float t, float scale, float speed, float seed) {
  vec2 g = q * scale;
  g.y -= t * speed;
  g.x += sin(g.y * 0.5 + seed + t * 0.5) * 0.25;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5) * 0.5;
  float r = length(f - o);
  float disc = fall(0.2, 0.04, r) * 0.55 + fall(0.08, 0.0, r) * 0.45;
  return disc * step(0.86, h) * (h - 0.86) * 7.0;
}

// Ash flakes: small tilted flecks that lift off the traced glyphs and drift,
// lit on one edge by the fire below them.
float ashLayer(vec2 q, float t, float seed) {
  vec2 g = q * 11.0;
  g.y -= t * 0.24;
  g.x += sin(g.y * 1.3 + seed + t * 0.9) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = (vec2(hash12(id + seed + 1.3), hash12(id + seed + 9.1)) - 0.5) * 0.6;
  vec2 e = f - o;
  e.x *= 1.0 + 1.6 * hash12(id + seed + 2.2);
  return fall(0.1, 0.035, length(e)) * step(0.8, h);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 luv = (uv - uLogo.xy) / uLogo.zw;   // logo UV, y up
  vec2 lp = vec2(luv.x * 1.5, luv.y);       // isotropic (the logo is 3:2)
  float t = uTime;
  // One drawing-buffer pixel in logo UV.
  vec2 px = 1.0 / max(uRes * uLogo.zw, vec2(1.0));

  // Where fire may live: a soft ellipse around the lockup, never a rectangle.
  vec2 q = (luv - vec2(0.5, 0.46)) / vec2(0.58, 0.52);
  float env = fall(1.0, 0.42, length(q));

  // Fuel: the logo's own light, softened and gathered from just below, so
  // the tongues rise off the glyphs and streaks instead of filling empty space.
  float fuel = lum(sampleTop(uFirst, luv + vec2(0.0, -0.025)))
             + lum(sampleTop(uFirst, luv + vec2(0.03, -0.07)))
             + lum(sampleTop(uFirst, luv + vec2(-0.03, -0.07)))
             + lum(sampleTop(uFirst, luv + vec2(0.0, -0.13)))
             + lum(sampleTop(uFirst, luv + vec2(0.05, -0.01)))
             + lum(sampleTop(uFirst, luv + vec2(-0.05, -0.01)));
  fuel = clamp(fuel / 6.0 * 2.2 + env * 0.1, 0.0, 1.0);

  // ---- The front: torn by static noise, climbing from the lower left. It
  // enters under the lower-left glyphs and leaves past the upper-right ones.
  float tear = fbm(lp * vec2(1.8, 2.2) + 7.3);
  float ragged = vnoise(lp * 24.0 + 3.1);
  float field = dot(luv - 0.5, GRAD) + (tear - 0.5) * 0.2 + (ragged - 0.5) * 0.03;
  float d = field - mix(-0.86, 0.8, uBurn);   // > 0 waiting, < 0 traced
  // Nothing of the fire's light survives the hand-off.
  float live = uFlame * (1.0 - uCool);

  // ---- Heat haze, strongest just ahead of the front; gone once it has cooled.
  float ahead = fall(0.24, 0.0, d);
  vec2 haze = (vec2(vnoise(lp * 10.0 + vec2(0.0, -t * 2.3)),
                    vnoise(lp * 10.0 + vec2(5.3, -t * 2.3))) - 0.5)
              * (0.012 * ahead + 0.003) * uHeat * (1.0 - uCool);

  // ---- Ahead: the waiting logo. The heated air splits its red and blue a
  // little to either side; at the front it scorches green and darkens.
  vec4 first = sampleTop(uFirst, luv + haze);
  float fringeA = fall(0.09, 0.0, d) * uHeat * (1.0 - uCool) * env;
  vec2 fx = vec2(0.0058, 0.0) * fringeA;
  first.r = mix(first.r, sampleTop(uFirst, luv + haze + fx).r, fringeA * 0.8);
  first.b = mix(first.b, sampleTop(uFirst, luv + haze - fx).b, fringeA * 0.8);
  float fl = lum(first);
  float scorch = fall(0.13, 0.0, d) * uHeat * (1.0 - uCool);
  first.rgb = mix(first.rgb, SCORCH * fl * 1.34, scorch * 0.78);
  first.rgb *= 1.0 - 0.42 * fall(0.034, 0.0, d) * uHeat * (1.0 - uCool);

  // ---- Behind: the traced logo, green-hot, then a prism sheen, settling to
  // its own colours (no ash phase: the one logo is never lost to char).
  float age = clamp(-d / 0.36, 0.0, 1.0);
  float hot = (1.0 - smoothstep(0.0, 0.7, age)) * (1.0 - uCool);
  float sheen = smoothstep(0.18, 0.5, age) * fall(0.95, 0.5, age) * (1.0 - uCool);
  vec4 fin = sampleTop(uFinal, luv + haze * 0.6);
  float fn = lum(fin);
  vec3 prismTint = mix(
    mix(vec3(0.46, 0.91, 1.0), vec3(0.96, 0.84, 0.52), smoothstep(0.15, 0.55, luv.x)),
    vec3(0.96, 0.5, 0.88),
    smoothstep(0.48, 0.92, luv.x)
  );
  fin.rgb = mix(fin.rgb, FOREST * fn * 1.32, hot * 0.82);
  fin.rgb += prismTint * fn * sheen * 0.34;
  fin.rgb = min(fin.rgb, vec3(1.0));

  float traced = fall(0.0, -0.018, d);
  vec4 col = mix(first, fin, traced);

  // ---- Flames: forest-green tongues (domain-warped, vertically stretched
  // fbm) licking up off the front, bright at the base, thinning into dark
  // green tips, with dark gaps between them. Each tongue reaches its own
  // height: a contrast-stretched turbulence field that rises with time.
  float flameH = 0.26;
  vec2 fq = vec2(lp.x * 3.6, luv.y * 1.9 - t * 1.56);
  // Lateral sway grows with height, so tongues bend and lick instead of standing.
  fq.x += (vnoise(vec2(lp.x * 1.6, luv.y * 1.3 - t * 0.64)) - 0.5) * (1.14 + 1.25 * clamp(d * 3.0, 0.0, 1.0));
  float turb = fbm(fq) * 0.7 + vnoise(vec2(lp.x * 13.0, luv.y * 5.0 - t * 2.7)) * 0.3;
  float tongues = clamp((turb - 0.5) * 1.95 + 0.5, 0.0, 1.0);
  float reach = flameH * (0.13 + 1.08 * tongues);
  float root = clamp(1.0 - d / reach, 0.0, 1.0);   // 1 at the base, 0 at the tip
  float frontF = root * (0.38 + 0.88 * tongues) + 0.34 * fall(0.032, 0.0, d);
  // Low fire on the freshly traced strip just behind the front.
  float behindF = (0.48 + 0.62 * tongues) * (1.0 - clamp(-d / 0.065, 0.0, 1.0));
  // Front and fresh fire meet over a narrow band (no stepped line at d = 0).
  float heat = mix(behindF, frontF, smoothstep(-0.02, 0.02, d));
  // Fine flicker texture inside the body (it averages out over any larger area).
  heat *= 0.78 + 0.46 * vnoise(vec2(lp.x * 24.0, luv.y * 10.0 - t * 3.1));
  heat = clamp(heat * 1.2 * uFlame * mix(0.42, 1.0, smoothstep(0.03, 0.3, fuel)) * env, 0.0, 1.25);
  float fireA = smoothstep(0.07, 0.74, heat);
  vec3 fire = fireRamp(heat);

  // A thin burning edge where the front eats the glyphs.
  float rim = fall(0.014, 0.0, abs(d + 0.004)) * (0.12 + 0.92 * fuel) * env
            * max(uFlame, 0.34 * (1.0 - uCool)) * 0.92;
  // The glyph faces the front meets flare. One-sided and local: a face
  // lights only on the glyph itself, against the pixel 2px behind it (lower
  // left), so the flare never draws a displaced copy of a letter.
  float face = max(fn - lum(sampleTop(uFinal, luv - px * 2.0)), 0.0);
  float flare = clamp(face * 2.4, 0.0, 1.0) * fall(0.07, 0.0, abs(d)) * env * live;

  // Faint smoke above the flames, and the fire's light on the air around it.
  float smokeA = smoothstep(0.46, 0.8, fbm(lp * 2.6 + vec2(0.0, -t * 0.45)))
               * smoothstep(0.05, 0.3, d) * fall(0.7, 0.3, d) * uFlame * env * 0.24;
  vec3 spill = SPILL * fall(0.42, 0.0, abs(d - 0.06)) * env * uFlame * 0.14;

  float embers = emberLayer(lp, t, 13.0, 0.55, 1.0) + emberLayer(lp, t, 8.0, 0.38, 5.0) * 0.95;
  // Sparks leave the fire zone and drift above it.
  float sparkZone = fall(1.2, 0.6, length(q)) * clamp(uFlame * 1.4, 0.0, 1.0) * smoothstep(-0.12, 0.08, d) * fall(0.9, 0.3, d);
  embers *= sparkZone;
  // The near plane: a few large soft embers crossing in front, slower.
  float bokeh = bokehLayer(lp, t, 4.5, 0.26, 11.0) * sparkZone;
  // Ash lifts off the glyphs the front has passed and drifts up through the
  // flames; a cover, lit from below.
  float flakes = ashLayer(lp, t, 4.0) * clamp(-d / 0.18, 0.0, 1.0) * fall(0.9, 0.25, -d) * uFlame * env;

  // Premultiplied: smoke and ash cover; fire is light, added to the glyphs it
  // traces (they show through it), with a little soot in its body.
  vec4 outC = col;
  outC = vec4(vec3(0.012, 0.01, 0.01) * smokeA, smokeA) + outC * (1.0 - smokeA);
  outC.rgb = outC.rgb * (1.0 - fireA * 0.32) + fire * fireA;
  outC.a = max(outC.a, fireA * 0.62);
  outC.rgb += RIM * (rim * 1.42 + flare * 0.8) + SPARK * embers * 1.58 + spill;
  float flakeA = clamp(flakes, 0.0, 1.0) * 0.8;
  vec3 flakeC = vec3(0.0375, 0.072, 0.0838) + SPARK * fall(0.13, 0.0, -d) * 0.58;
  outC = vec4(flakeC * flakeA, flakeA) + outC * (1.0 - flakeA);
  outC.rgb += NEAR * bokeh * 0.68;
  outC = clamp(outC, 0.0, 1.0);
  // Light needs coverage in a premultiplied canvas (rgb <= alpha).
  outC.a = max(outC.a, max(outC.r, max(outC.g, outC.b)));
  gl_FragColor = outC;
}
