// GLSL ES 1.00 sources (WebGL1 and WebGL2) built from the shared tuning
// table, so the GPU fire and the CPU fallback agree on every constant.
import { FIELD_D, FIELD_IN } from "./fire-field.js";
import { FIRE_TUNING as T, RAMP_CLEAN, RAMP_HEAT, RAMP_SOOTY } from "./fire-tuning.js";

const f = (x) => {
  const s = String(x);
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const vec3 = (r, g, b) => `vec3(${f(r)}, ${f(g)}, ${f(b)})`;
const ramp = (name, stops) => {
  let body = `  vec3 c = ${vec3(stops[0][1], stops[0][2], stops[0][3])};\n`;
  for (let i = 1; i < stops.length; i += 1) {
    const [t, r, g, b] = stops[i];
    const from = stops[i - 1][0];
    body += `  c = mix(c, ${vec3(r, g, b)}, smoothstep(${f(from)}, ${f(t)}, t));\n`;
  }
  return `vec3 ${name}(float t) {\n${body}  return c;\n}\n`;
};

export const FIRE_VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// uRect: the fire rect in figure widths (x0, y0, w, h; y down).
// uLife: cover, combustion mix, burst (linear 0..1), flash.
// uClock: time (s), strength, layer (0 back / 1 front), unused.
// uRing: radius (widths), strength. uOctaves: fbm weights of the four
// noise channels (fewer high octaves on the touch tier).
export const FIRE_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uField;
uniform sampler2D uNoise;
uniform vec4 uRect;
uniform vec4 uLife;
uniform vec4 uClock;
uniform vec2 uRing;
uniform vec4 uOctaves;
${ramp("rampSooty", RAMP_SOOTY)}
${ramp("rampClean", RAMP_CLEAN)}
void main() {
  vec4 field = texture2D(uField, vUv);
  float d = field.r * ${f(FIELD_D)};
  float arrival = field.g;
  float lift = field.b * ${f(FIELD_D)};
  float din = field.a * ${f(FIELD_IN)};
  float skin = smoothstep(0.0, 0.02, field.a);
  float layer = uClock.z;
  vec2 pw = vec2(uRect.x + vUv.x * uRect.z, uRect.y + vUv.y * uRect.w);
  float t = uClock.x;
  float cover = uLife.x;
  float m = uLife.y;
  float b = uLife.z;
  // The engulf front, with a noisy branching edge that creeps upward.
  float ne = texture2D(uNoise, pw * ${f(T.edgeScale)} + vec2(0.0, t * ${f(T.edgeSpeed)})).g;
  float aEff = arrival + (ne - 0.5) * ${f(T.edgeAmp)};
  float fresh = clamp((cover - aEff) / ${f(T.frontWidth)}, 0.0, 1.0);
  float lit = fresh * fresh * (3.0 - 2.0 * fresh);
  float age = clamp((cover - aEff) / ${f(T.ageSpan)}, 0.0, 1.0);
  float mLocal = m * (age + (1.0 - age) * m * m);
  float flare = 1.0 + 6.4 * lit * (1.0 - lit) * (1.0 - mLocal);
  // The envelope: how far above the surface this pixel lies.
  vec4 na = texture2D(uNoise, pw * 0.9 + vec2(0.0, t * 0.35));
  float grow = 1.0 + ${f(T.burstReach)} * b;
  float reachS = (${f(T.reachSide)} + ${f(T.reachSideNoise)} * na.r) * grow;
  float reachU = (${f(T.reachUp)} + ${f(T.reachUpNoise)} * na.g) * grow;
  float env = clamp(max(1.0 - d / reachS, 1.0 - lift / reachU), 0.0, 1.0);
  env = max(env, skin);
  // Turbulence advected upward, faster away from the body, domain-warped.
  float speed = (${f(T.flowBase)} + ${f(T.flowAccel)} * (1.0 - env)) * (1.0 - 0.25 * mLocal);
  vec2 pwarp = pw * ${f(T.warpScale)} + vec2(0.0, t * ${f(T.warpSpeed)});
  vec2 warp = vec2(texture2D(uNoise, pwarp).r, texture2D(uNoise, pwarp + vec2(0.37, 0.61)).r) - 0.5;
  vec2 pn = (pw + warp * ${f(T.warpAmp)} * (1.0 - 0.5 * mLocal)) * ${f(T.noiseScale)}
    + vec2(0.0, t * speed * ${f(T.noiseScale)});
  vec4 s = texture2D(uNoise, pn);
  float nAll = dot(s, uOctaves);
  float nLow = s.r * 0.6667 + s.g * 0.3333;
  float n = mix(nAll, nLow, 0.6 * mLocal);
  float hi = mix(${f(T.threshHiAir)}, ${f(T.threshHiSurface)}, env);
  float shaped = n * (0.75 + 0.55 * env) - (1.0 - env) * 0.95;
  float dens = smoothstep(${f(T.threshLo)}, hi, shaped) * pow(env, 0.35);
  float dissolve = 1.0 - smoothstep(0.0, ${f(T.burstDissolve)}, b);
  dens *= lit * dissolve;
  // Flicker: a global 8–14 Hz beat and fast local intermittency.
  float nf = texture2D(uNoise, pw * ${f(T.localScale)} + vec2(0.0, t * ${f(T.localSpeed)})).b;
  float calm = 1.0 - 0.65 * mLocal;
  float flick = (1.0 + ${f(T.flickerGlobal)} * calm * (sin(t * 60.9) + 0.6 * sin(t * 83.6 + 1.7)))
    * (1.0 - ${f(T.flickerLocal)} * calm * 0.5 + ${f(T.flickerLocal)} * calm * nf);
  float rim = exp(-(din + d) / ${f(T.rim)});
  float temp = dens * (0.4 + 0.6 * env) * flare;
  temp = temp * (0.75 + 0.25 * rim) + rim * lit * dissolve * 0.35;
  temp = clamp(temp * flick, 0.0, 1.0);
  vec3 colour = mix(rampSooty(temp), rampClean(temp), mLocal);
  float emit = clamp(dens * flick, 0.0, 1.0) * (1.0 - 0.15 * mLocal);
  float share = mix(1.0 - ${f(T.frontShare)} * skin, ${f(T.frontShare)} * skin, layer);
  vec3 E = colour * emit * share;
  float absorb = dens * (${f(T.absorbSooty)} * (1.0 - mLocal) + ${f(T.absorbClean)}) * share;
  if (layer < 0.5) {
    float bloom = uLife.w * exp(-d / ${f(T.flashReach)});
    E += vec3(0.75, 0.92, 1.0) * bloom * 1.2;
    float ringW = ${f(T.ringWidth)} + ${f(T.ringWiden)} * b;
    float rd = (d - uRing.x) / ringW;
    float ring = exp(-rd * rd) * uRing.y * (0.55 + 0.6 * na.b) * step(0.001, d);
    E += mix(vec3(0.6, 0.85, 1.0), vec3(0.9, 0.97, 1.0), ring) * ring * 0.9;
  }
  E = min(E * uClock.y, vec3(1.0));
  float alpha = max(max(E.r, max(E.g, E.b)), min(1.0, absorb * uClock.y));
  gl_FragColor = vec4(E, alpha);
}
`;

// Burst fragments: quads stretched along their velocity, cooling from
// white heat into the suit's tones. uRect as above; uSpark: strength,
// stretch per unit speed.
export const SPARK_VERTEX = `
attribute vec2 aCentre;
attribute vec2 aCorner;
attribute vec4 aData;
uniform vec4 uRect;
uniform vec2 uSpark;
varying vec2 vCorner;
varying float vHeat;
void main() {
  vec2 dir = aData.zw;
  float len = length(dir);
  vec2 tdir = len > 0.00001 ? dir / len : vec2(0.0, -1.0);
  vec2 ndir = vec2(-tdir.y, tdir.x);
  float stretch = 1.0 + min(2.0, len * uSpark.y);
  vec2 offset = tdir * aCorner.x * aData.y * stretch + ndir * aCorner.y * aData.y;
  vec2 uv = aCentre + vec2(offset.x / uRect.z, offset.y / uRect.w);
  gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  vCorner = aCorner;
  vHeat = aData.x;
}
`;
export const SPARK_FRAGMENT = `
precision mediump float;
varying vec2 vCorner;
varying float vHeat;
uniform vec2 uSpark;
${ramp("rampHeat", RAMP_HEAT)}
void main() {
  float r2 = dot(vCorner, vCorner);
  float g = exp(-r2 * 2.6) * (1.0 - smoothstep(0.55, 1.0, sqrt(r2)));
  vec3 E = rampHeat(vHeat) * g * pow(vHeat, 0.6) * uSpark.x;
  E += vec3(1.0) * g * g * vHeat * vHeat * 0.6 * uSpark.x;
  E = min(E, vec3(1.0));
  gl_FragColor = vec4(E, max(E.r, max(E.g, E.b)));
}
`;
