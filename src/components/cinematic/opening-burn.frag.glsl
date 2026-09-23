// The opening burn: the ice logo is consumed by red flames climbing from the
// lower left, and the prism logo emerges from the ash, ember-hot, cooling to
// its own colours. Drawn on a premultiplied transparent canvas over the title
// scene, so only light and ash are added to it: no box. Appended to
// opening-noise.glsl (precision, noise, fireRamp, emberLayer).

uniform vec2 uRes;       // drawing-buffer size (px)
uniform vec4 uLogo;      // the logo box in canvas UV (x, y, w, h), y up
uniform float uTime;     // seconds since the burn started
uniform float uHeat;     // 0..1 heat haze and scorch build-up (only rises)
uniform float uBurn;     // 0..1 burn level: the front climbs bottom-left -> top-right
uniform float uFlame;    // 0..1 flame intensity
uniform float uCool;     // 0..1 the prism logo cools to its own colours (1 = the DOM image)
uniform sampler2D uFirst; // the ice logo, premultiplied
uniform sampler2D uFinal; // the prism logo, premultiplied

float lum(vec4 c) { return max(c.r, max(c.g, c.b)); }

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 luv = (uv - uLogo.xy) / uLogo.zw;   // logo UV, y up
  vec2 lp = vec2(luv.x * 1.5, luv.y);       // isotropic (the logo is 3:2)
  float t = uTime;

  // Where fire may live: a soft ellipse around the lockup, never a rectangle.
  vec2 q = (luv - vec2(0.5, 0.46)) / vec2(0.58, 0.52);
  float env = fall(1.0, 0.42, length(q));

  // Fuel: the ice logo's own light, softened and gathered from just below, so
  // flames rise off the glyphs and streaks instead of filling empty space.
  float fuel = lum(sampleTop(uFirst, luv + vec2(0.0, -0.025)))
             + lum(sampleTop(uFirst, luv + vec2(0.03, -0.07)))
             + lum(sampleTop(uFirst, luv + vec2(-0.03, -0.07)))
             + lum(sampleTop(uFirst, luv + vec2(0.0, -0.13)))
             + lum(sampleTop(uFirst, luv + vec2(0.05, -0.01)))
             + lum(sampleTop(uFirst, luv + vec2(-0.05, -0.01)));
  fuel = clamp(fuel / 6.0 * 2.2 + env * 0.1, 0.0, 1.0);

  // ---- Burn field: torn by static noise, climbing from the lower left.
  float tear = fbm(lp * vec2(2.0, 2.4) + 7.3);
  float ragged = vnoise(lp * 24.0 + 3.1);
  float field = luv.y * 0.75 + (luv.x - 0.5) * 0.36 + (tear - 0.5) * 0.5 + (ragged - 0.5) * 0.04;
  // The front enters under the lower-left glyphs and leaves above the upper-right ones.
  float d = field - mix(-0.1, 0.72, uBurn);   // > 0 intact, < 0 burnt

  // ---- Heat haze, strongest just ahead of the front; gone once it has cooled.
  float ahead = fall(0.24, 0.0, d);
  vec2 haze = (vec2(vnoise(lp * 10.0 + vec2(0.0, -t * 2.3)),
                    vnoise(lp * 10.0 + vec2(5.3, -t * 2.3))) - 0.5)
              * (0.014 * ahead + 0.004) * uHeat * (1.0 - uCool);

  // ---- The ice logo: heated to ember orange ahead of the front, charring at it.
  vec4 first = sampleTop(uFirst, luv + haze);
  float fl = lum(first);
  float scorch = fall(0.13, 0.0, d) * uHeat;
  first.rgb = mix(first.rgb, vec3(1.0, 0.36, 0.08) * fl * 1.3, scorch * 0.85);
  first.rgb *= 1.0 - 0.55 * fall(0.035, 0.0, d) * uHeat;

  // ---- Behind the front: ash with ember veins, then the prism logo, hot, cooling.
  float age = clamp(-d / 0.3, 0.0, 1.0);
  float reveal = max(smoothstep(0.03, 0.55, age), uCool);
  float hot = (1.0 - smoothstep(0.3, 1.0, age)) * (1.0 - uCool);
  vec4 fin = sampleTop(uFinal, luv + haze * 0.6);
  float fn = lum(fin);
  fin.rgb = mix(fin.rgb, vec3(1.0, 0.34, 0.07) * fn * 1.25, hot * 0.9);
  fin *= reveal;
  float ash = lum(sampleTop(uFirst, luv));
  float veins = smoothstep(0.56, 0.68, fbm(lp * 7.0 + 3.0));
  float charA = clamp(ash * 2.2, 0.0, 1.0) * (1.0 - reveal) * 0.85;
  vec3 charC = (vec3(0.03, 0.017, 0.013) + vec3(0.9, 0.22, 0.04) * veins * (1.0 - age) * 0.7) * charA;
  vec4 behind = fin + vec4(charC, charA) * (1.0 - fin.a);

  float burnt = fall(0.0, -0.02, d);
  vec4 col = mix(first, behind, burnt);

  // ---- Flames: tongues (domain-warped, vertically stretched fbm) rising off
  // the front, bright at the base, thinning into dark red tips, with gaps.
  // Each tongue reaches its own height: a contrast-stretched turbulence field
  // that rises with time, so tongues stretch, break off and thin into dark red
  // tips, with dark gaps between them.
  float flameH = 0.32;
  vec2 fq = vec2(lp.x * 3.6, luv.y * 1.9 - t * 1.5);
  // Lateral sway grows with height, so tongues bend and lick instead of standing.
  fq.x += (vnoise(vec2(lp.x * 1.6, luv.y * 1.3 - t * 0.6)) - 0.5) * (1.1 + 1.2 * clamp(d * 3.0, 0.0, 1.0));
  float turb = fbm(fq) * 0.7 + vnoise(vec2(lp.x * 13.0, luv.y * 5.0 - t * 2.6)) * 0.3;
  float tongues = clamp((turb - 0.5) * 1.9 + 0.5, 0.0, 1.0);
  float reach = flameH * (0.12 + 1.05 * tongues);
  float core = clamp(1.0 - d / reach, 0.0, 1.0);   // 1 at the base, 0 at the tip
  float frontF = core * (0.36 + 0.86 * tongues) + 0.3 * fall(0.03, 0.0, d);
  // Low fire in the freshly burnt strip just behind the front.
  float behindF = (0.45 + 0.6 * tongues) * (1.0 - clamp(-d / 0.06, 0.0, 1.0));
  // Front and fresh-ash fire meet over a narrow band (no stepped line at d = 0).
  float heat = mix(behindF, frontF, smoothstep(-0.02, 0.02, d));
  // Fine flicker texture inside the body (it averages out over any larger area).
  heat *= 0.78 + 0.44 * vnoise(vec2(lp.x * 24.0, luv.y * 10.0 - t * 3.0));
  heat = clamp(heat * 1.15 * uFlame * mix(0.45, 1.0, smoothstep(0.03, 0.3, fuel)) * env, 0.0, 1.2);
  float fireA = smoothstep(0.08, 0.75, heat);
  vec3 fire = fireRamp(heat);

  // A thin burning edge where the front eats the glyphs.
  float rim = fall(0.012, 0.0, abs(d + 0.004)) * (0.1 + 0.9 * fuel) * env
            * max(uFlame, 0.3 * (1.0 - uCool)) * 0.8;

  // Faint smoke above the flames, and the fire's light on the air around it.
  float smokeA = smoothstep(0.46, 0.8, fbm(lp * 2.6 + vec2(0.0, -t * 0.45)))
               * smoothstep(0.05, 0.3, d) * fall(0.75, 0.3, d) * uFlame * env * 0.3;
  vec3 spill = vec3(1.0, 0.3, 0.07) * fall(0.4, 0.0, abs(d - 0.06)) * env * uFlame * 0.1;

  float embers = emberLayer(lp, t, 13.0, 0.55, 1.0) + emberLayer(lp, t, 8.0, 0.38, 5.0) * 0.9;
  // Sparks leave the fire zone and drift above it.
  embers *= fall(1.2, 0.6, length(q)) * clamp(uFlame * 1.4, 0.0, 1.0) * smoothstep(-0.12, 0.08, d) * fall(0.9, 0.3, d);

  // Premultiplied: ash and smoke cover; fire is light, added to the glyphs it
  // burns (they show through it), with a little soot in its body.
  vec4 outC = col;
  outC = vec4(vec3(0.012, 0.01, 0.01) * smokeA, smokeA) + outC * (1.0 - smokeA);
  outC.rgb = outC.rgb * (1.0 - fireA * 0.4) + fire * fireA;
  outC.a = max(outC.a, fireA * 0.6);
  outC.rgb += vec3(1.0, 0.45, 0.12) * rim * 1.2 + vec3(1.0, 0.42, 0.1) * embers * 1.4 + spill;
  outC = clamp(outC, 0.0, 1.0);
  // Light needs coverage in a premultiplied canvas (rgb <= alpha).
  outC.a = max(outC.a, max(outC.r, max(outC.g, outC.b)));
  gl_FragColor = outC;
}
