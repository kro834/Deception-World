// The opening trace (2026-10-21): the title logo is one picture now, so the
// burn that turned one logo into another became the key visual's light
// scanning it. The streamline front (ice high, pink in the middle, gold low,
// tilted like the wordmark) travels the lockup from the lower left to the
// upper right. Ahead of it the logo waits, a shade darker as the charge
// builds, its red and blue split by the nearing light. At the front a thin
// bar of light with a bright core where it crosses the glyphs; the glyph
// edges it passes flare and stream back behind it as light trails. Behind
// it the logo stands charged, with a prism sheen, and settles to its own
// colours. Sparks, pink bokeh and motes of light ride the front.
//
// Drawn on a premultiplied transparent canvas over the title scene, so only
// light is added: no box. Appended to opening-noise.glsl (precision, noise,
// emberLayer). Frame 0 is the first logo; the hand-off frame (uCool 1,
// uFlame 0) is the final logo.

uniform vec2 uRes;       // drawing-buffer size (px)
uniform vec4 uLogo;      // the logo box in canvas UV (x, y, w, h), y up
uniform float uTime;     // seconds since the trace started
uniform float uHeat;     // 0..1 the charge: the waiting logo dims, the air bends (only rises)
uniform float uBurn;     // 0..1 the front's travel: lower left -> upper right
uniform float uFlame;    // 0..1 the light's intensity (one swell)
uniform float uCool;     // 0..1 the charged logo settles to its own colours (1 = the DOM image)
uniform sampler2D uFirst; // the logo, premultiplied
uniform sampler2D uFinal; // the same logo, premultiplied (the hand-off frame)

const vec3 ICE = vec3(0.48, 0.91, 1.0);
const vec3 PINK = vec3(1.0, 0.31, 0.76);
const vec3 GOLD = vec3(0.94, 0.81, 0.53);
const vec3 CORE = vec3(0.92, 0.97, 1.0);
// The front's normal in logo UV (its direction of travel), and one step of
// a trail back along it (isotropic: the logo is 3:2).
const vec2 GRAD = vec2(1.0, 0.42);
const vec2 TRAIL = vec2(0.0096, 0.006);
// Across the trail: each tap steps to one side or the other, so a trail
// opens into a soft cone instead of a copy of the glyph.
const vec2 ACROSS = vec2(-0.0024, 0.0057);

float lum(vec4 c) { return max(c.r, max(c.g, c.b)); }

// The streamline's colour along the front: gold low, pink, ice high.
vec3 streamTint(float s) {
  return mix(mix(GOLD, PINK, smoothstep(0.02, 0.38, s)), ICE, smoothstep(0.46, 0.84, s));
}

// Near-plane bokeh: a sparse layer of large soft discs, slower than the
// sparks, so the light has depth. One hash per pixel, as emberLayer.
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

// Motes: small tilted flecks of light that lift off the traced glyphs and
// drift up behind the front.
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

  // Where the light may live: a soft ellipse around the lockup, never a rectangle.
  vec2 q = (luv - vec2(0.5, 0.46)) / vec2(0.58, 0.52);
  float env = fall(1.0, 0.42, length(q));

  // Fuel: the logo's own light, gathered, so the bar's core and the sparks
  // live on the glyphs and streaks instead of filling empty space.
  float fuel = lum(sampleTop(uFirst, luv))
             + lum(sampleTop(uFirst, luv + vec2(0.02, 0.0)))
             + lum(sampleTop(uFirst, luv - vec2(0.02, 0.0)))
             + lum(sampleTop(uFirst, luv + vec2(0.0, 0.03)))
             + lum(sampleTop(uFirst, luv - vec2(0.0, 0.03)));
  fuel = clamp(fuel / 5.0 * 2.0, 0.0, 1.0);

  // ---- The front: one tilted line, barely torn, travelling with uBurn. It
  // enters under the lower-left corner and leaves past the upper-right one.
  float tear = fbm(lp * vec2(1.6, 2.0) + 7.3);
  float field = dot(luv - 0.5, GRAD) + (tear - 0.5) * 0.09;
  float d = field - mix(-0.82, 0.84, uBurn);   // > 0 waiting, < 0 traced
  // The bar's own coordinate (along the front) picks its colour.
  float s = luv.y - 0.42 * (luv.x - 0.5);
  vec3 tint = streamTint(s);
  // Nothing of the trace survives the hand-off.
  float live = uFlame * (1.0 - uCool);

  // ---- The air bends ahead of the front; still once the logo has settled.
  float ahead = fall(0.22, 0.0, d);
  vec2 haze = (vec2(vnoise(lp * 9.0 + vec2(-t * 1.8, 0.0)),
                    vnoise(lp * 9.0 + vec2(5.3, -t * 1.8))) - 0.5)
              * (0.011 * ahead + 0.003) * uHeat * (1.0 - uCool);

  // ---- Ahead: the waiting logo, a shade darker as the charge builds, its
  // red and blue split a little to either side by the nearing light.
  vec4 first = sampleTop(uFirst, luv + haze);
  float fringeA = fall(0.09, 0.0, d) * uHeat * (1.0 - uCool) * env;
  vec2 fx = vec2(0.0072, 0.0) * fringeA;
  first.r = mix(first.r, sampleTop(uFirst, luv + haze + fx).r, fringeA * 0.86);
  first.b = mix(first.b, sampleTop(uFirst, luv + haze - fx).b, fringeA * 0.86);
  first.rgb *= 1.0 - 0.3 * uHeat * (1.0 - uCool) * smoothstep(0.0, 0.1, d);

  // ---- Behind: the traced logo, charged with a prism sheen, cooling to itself.
  float age = clamp(-d / 0.5, 0.0, 1.0);
  float charged = (1.0 - smoothstep(0.1, 1.0, age)) * (1.0 - uCool);
  vec4 fin = sampleTop(uFinal, luv + haze * 0.5);
  float fn = lum(fin);
  fin.rgb *= 1.0 + 0.3 * charged;
  fin.rgb += tint * fn * charged * 0.42;
  fin.rgb = min(fin.rgb, vec3(1.0));

  float traced = fall(0.0, -0.016, d);
  vec4 col = mix(first, fin, traced);

  // ---- Light trails: the glyph light the front has crossed streams back
  // along the sweep, from each glyph towards the lower left, and lingers.
  float trail = 0.0;
  for (int k = 1; k <= 14; k += 1) {
    float fk = float(k);
    float w = 1.0 - fk / 15.0;
    float side = mod(fk, 2.0) * 2.0 - 1.0;
    // That sample's own distance to the front (dot(TRAIL, GRAD) per step).
    float dk = d + fk * 0.0121;
    vec2 at = luv + TRAIL * fk + ACROSS * side * (0.2 + 0.8 * fk / 14.0);
    trail += lum(sampleTop(uFinal, at)) * w * w * w * fall(0.0, -0.01, dk);
  }
  trail = clamp(trail * 0.46, 0.0, 1.0) * fall(0.66, 0.04, -d) * env * live;

  // The glyph edges flare as the front crosses them.
  float edge = abs(fn - lum(sampleTop(uFinal, luv - TRAIL * 1.6)));
  float flare = clamp(edge * 2.6, 0.0, 1.0) * fall(0.08, 0.0, abs(d)) * env * live;

  // ---- The bar: the streamline across the lockup, a bright core on the
  // glyphs, a slow shimmer along it, and its wider glow in the air.
  float band = fall(0.07, 0.0, abs(d)) * env * live;
  float core = fall(0.011, 0.0, abs(d)) * env * live;
  float shimmer = 0.78 + 0.44 * vnoise(vec2(s * 9.0, t * 2.2));
  // Two fainter lines run with it, one ahead and one behind: the key
  // visual's parallel streaks.
  float echo = (fall(0.016, 0.0, abs(d + 0.1)) * 0.55 + fall(0.012, 0.0, abs(d - 0.07)) * 0.35) * env * live;
  vec3 bar = tint * band * (0.3 + 0.7 * fuel) * shimmer + CORE * core * (0.3 + 0.7 * fuel)
           + tint * echo * (0.25 + 0.75 * fuel);
  float glow = fall(0.26, 0.0, abs(d)) * env * live * 0.22;

  // ---- Sparks ride just ahead of the front and drift up; pink bokeh in
  // the near plane; motes lift off the glyphs the front has passed.
  float embers = emberLayer(lp, t, 13.0, 0.55, 1.0) + emberLayer(lp, t, 8.0, 0.38, 5.0) * 0.95;
  float sparkZone = fall(1.2, 0.6, length(q)) * clamp(uFlame * 1.4, 0.0, 1.0) * smoothstep(-0.12, 0.08, d) * fall(0.9, 0.3, d);
  embers *= sparkZone;
  float bokeh = bokehLayer(lp, t, 4.5, 0.26, 11.0) * sparkZone;
  float flakes = ashLayer(lp, t, 4.0) * clamp(-d / 0.18, 0.0, 1.0) * fall(0.9, 0.25, -d) * uFlame * env;
  vec3 sparkC = mix(ICE, PINK, smoothstep(0.35, 0.65, vnoise(lp * 5.0 + t * 0.7)));

  // Premultiplied: everything here is light, added to the logo it traces.
  vec4 outC = col;
  outC.rgb += bar + tint * glow + CORE * flare * 0.9;
  outC.rgb += tint * trail * 1.2;
  outC.rgb += sparkC * embers * 1.7 + PINK * bokeh * 0.55;
  outC.rgb += mix(ICE, GOLD, 0.4) * clamp(flakes, 0.0, 1.0) * 0.6;
  outC = clamp(outC, 0.0, 1.0);
  // Light needs coverage in a premultiplied canvas (rgb <= alpha).
  outC.a = max(outC.a, max(outC.r, max(outC.g, outC.b)));
  gl_FragColor = outC;
}
