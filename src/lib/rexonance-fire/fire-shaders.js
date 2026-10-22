// GLSL ES 1.00 sources (WebGL1 and WebGL2) built from the shared tuning
// table, so the GPU fire and the CPU fallback agree on every constant.
import { BODY_ASPECT, FIELD_D, FIELD_IN, FIELD_LIFT, TEAR_LINES } from "./fire-field.js";
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

// The tears' distance (fire-raster.js tearGap), one call per path.
const tearGaps = () => {
  let body = "";
  for (let k = 0; k < TEAR_LINES.length; k += 4) {
    const line = `vec4(${f(TEAR_LINES[k])}, ${f(TEAR_LINES[k + 1])}, ${f(TEAR_LINES[k + 2])}, ${f(TEAR_LINES[k + 3])})`;
    body += k
      ? `    gap = min(gap, tearGap(bp, ${line}, jag));\n`
      : `    float gap = tearGap(bp, ${line}, jag);\n`;
  }
  return body;
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
// uClock: global flicker, strength, layer (0 back / 1 front), detail.
// uRing: radius (widths), strength; the tears' opening and glow.
// uView: the part of the rect the canvas shows (x0, y0, x1, y1; rect uv).
// uFlow / uDrift: the clock's drifts, already wrapped into the noise's
// period on the CPU (fire-pose.js): tongues, turbulence, flutter, reach /
// front edge, local flicker, hot patches.
// The CPU kernel (fire-raster.js) is this function line for line.
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
uniform vec4 uRing;
uniform vec4 uView;
uniform vec4 uFlow;
uniform vec4 uDrift;
${ramp("rampSooty", RAMP_SOOTY)}
${ramp("rampClean", RAMP_CLEAN)}
// The distance (figure widths) from p to one tear's line (start, run),
// moved across by jag, tapering to nothing over its ends.
float tearGap(vec2 p, vec4 line, float jag) {
  vec2 q = p - line.xy;
  float length2 = dot(line.zw, line.zw);
  float along = dot(q, line.zw) / length2;
  float across = (q.x * line.w - q.y * line.z) / sqrt(length2);
  float ends = smoothstep(-0.02, ${f(T.tearEnds)}, along) * (1.0 - smoothstep(${f(1 - T.tearEnds)}, 1.02, along));
  return abs(across + jag) / max(ends, 0.001);
}
void main() {
  // 爆散: the fire is sampled ever closer to the body's middle, so its
  // envelope is thrown outward off the skin (fastest at the detonation,
  // wider than tall) while it dissolves.
  vec2 centre = vec2(${f(T.burstCentreU)}, ${f(T.burstCentreV)});
  float thrownAt = clamp(uLife.z / ${f(T.burstDissolve)}, 0.0, 1.0);
  float thrown = 1.0 - (1.0 - thrownAt) * (1.0 - thrownAt);
  vec2 uv = centre + (vUv - centre) / (1.0 + vec2(${f(T.burstExpand)}, ${f(T.burstExpandY)}) * thrown);
  vec4 field = texture2D(uField, uv);
  float d = field.r * ${f(FIELD_D)};
  float arrival = field.g;
  float lift = field.b * ${f(FIELD_LIFT)};
  float din = field.a * ${f(FIELD_IN)};
  // The smooth signed distance anti-aliases the skin/air split.
  float skin = 1.0 - smoothstep(${f(-T.edgeSoft)}, ${f(T.edgeSoft)}, d - din);
  float air = 1.0 - skin;
  float layer = uClock.z;
  vec2 pw = vec2(uRect.x + uv.x * uRect.z, uRect.y + uv.y * uRect.w);
  float cover = uLife.x;
  float m = uLife.y;
  float b = uLife.z;
  // The rising turbulence that rags the envelope and carries the tips.
  vec4 nw = texture2D(uNoise, vec2(pw.x * ${f(T.warpScale)}, pw.y * ${f(T.warpScale * 0.5)} + uFlow.z));
  // The plume's reach drifts with a large slow noise.
  vec4 nr = texture2D(uNoise, vec2(pw.x * ${f(T.reachScale)}, pw.y * ${f(T.reachScale * 0.5)} + uFlow.w));
  float column = (pw.x - 0.5) * ${f(1 / T.columnWidth)};
  float reach = (${f(T.reachBase)} + ${f(T.reachVar)} * nr.r) * (1.0 + ${f(T.columnBoost)} * exp(-column * column));
  // Height above the burning surface: straight up off the body below, or
  // (weighted) sideways off a limb; the skin is height zero. The rising
  // turbulence moves its outline in and out (nothing at the skin, less
  // toward the tips, so no tip breaks off as a round bead), so no envelope
  // stands as a straight wall beside a limb or over the crown.
  float depth = pw.y - ${f(BODY_ASPECT)};
  float surface = min(lift, d * ${f(T.sideWeight)});
  float rag = (nw.b * 0.55 + nw.g * 0.3 + nw.a * 0.15 - 0.5) * ${f(T.ragAmp)} * smoothstep(0.0, ${f(T.ragRoot)}, surface)
    * (1.0 - smoothstep(${f(T.ragTop)}, 1.0, surface / reach));
  float height = max(0.0, surface + rag) * air;
  // Under the soles the floor only thins the plume (its threshold); it
  // never enters the rise, so it never squeezes the turbulence into bands.
  float fall = clamp((height + max(0.0, depth) * ${f(T.floorWeight)} * air) / reach, 0.0, 1.0);
  // The rise: two layers of turbulence flowing up at different speeds (so
  // a tongue's shape never translates rigidly), accelerating with height
  // through a static remapping (no shear however long the clock runs),
  // with a lateral flutter that grows toward the tips.
  float flutter = (nw.r - 0.5 + (nw.b - 0.5) * ${f(T.warpFine)}) * ${f(T.warpAmp)} * (${f(T.warpBase)} + fall);
  float rise = pw.y + height - log(1.0 + ${f(T.accel)} * height) * ${f(1 / T.accel)} + (nw.g - 0.5) * ${f(T.warpLift)};
  vec4 sa = texture2D(uNoise, vec2((pw.x + flutter) * ${f(T.scaleA)}, rise * ${f(T.scaleA / T.stretchA)} + uFlow.x));
  vec4 sb = texture2D(uNoise, vec2((pw.x + flutter * 1.4) * ${f(T.scaleB)} + 0.31, rise * ${f(T.scaleB / T.stretchB)} + uFlow.y));
  float nB = uClock.w > 0.5 ? sb.g * 0.55 + sb.b * 0.45 : sb.g;
  float n = ((sa.r * 0.62 + sa.g * 0.38) * 0.68 + nB * 0.32 - 0.5) * ${f(T.gain)} + 0.5;
  // The sheet's own streaks: the flames racing up the skin.
  vec4 ss = texture2D(uNoise, vec2(pw.x * ${f(T.scaleS)} + 0.53, pw.y * ${f(T.scaleS / T.stretchS)} + uDrift.w));
  float nS = ((ss.g * 0.6 + ss.b * 0.4) * ${f(T.sheetStreak)} + (sa.r * 0.62 + sa.g * 0.38) * ${f(1 - T.sheetStreak)} - 0.5) * ${f(T.gain)} + 0.5;
  // The engulf front: a noisy branching edge, drawn out along the rise,
  // that the tongues of the fire below lick up past and the sheet's
  // streaks race ahead of; the freshly lit band flares, and the oldest
  // fire burns clean first.
  vec4 ne = texture2D(uNoise, vec2(pw.x * ${f(T.edgeScale)}, pw.y * ${f(T.edgeScale * T.edgeStretch)} + uDrift.x));
  float edge = ne.r * 0.5 + ne.g * 0.3 + ne.b * 0.2 - 0.5;
  float aEff = arrival + edge * ${f(T.edgeAmp)} - max(0.0, n - 0.5) * ${f(T.tongueRise)} - max(0.0, nS - 0.5) * ${f(T.frontLick)} + height * ${f(T.climb)};
  float fresh = clamp((cover - aEff) / ${f(T.frontWidth)}, 0.0, 1.0);
  float lit = fresh * fresh * (3.0 - 2.0 * fresh);
  float age = clamp((cover - aEff) / ${f(T.ageSpan)}, 0.0, 1.0);
  float mLocal = m * (age + (1.0 - age) * m * m);
  float flare = 1.0 + ${f(T.flareGain)} * lit * (1.0 - lit) * (1.0 - mLocal);
  // Where the front is still kindling only the turbulence's peaks burn,
  // so it advances as ragged tongues, never as a soft rounded blot.
  float kindling = (1.0 - fresh) * (1.0 - fresh) * ${f(T.frontThr)};
  // Flicker: a global 8–14 Hz beat and local intermittency, calmer clean.
  vec4 nf = texture2D(uNoise, pw * ${f(T.localScale)} + vec2(0.0, uDrift.y));
  float calm = 1.0 - 0.6 * mLocal;
  float flick = (1.0 + calm * uClock.x) * (1.0 - ${f(T.flickerLocal * 0.5)} * calm + ${f(T.flickerLocal)} * calm * nf.g);
  // Three parts of one fire. Plume: with height only the turbulence's
  // peaks survive, as tongues that narrow, tear and vanish; a crisp core
  // in a soft halo, hottest where the turbulence is strongest. Rim: the
  // sheet seen edge-on along the skin's inner edge. Sheet: the translucent
  // fire flowing up over the skin.
  float thr = mix(${f(T.thrBase)}, ${f(T.thrTop)}, pow(fall, ${f(T.thrCurve)})) + kindling;
  float core = smoothstep(thr, thr + ${f(T.coreSoft)}, n);
  float halo = smoothstep(thr - ${f(T.haloSoft)}, thr + ${f(T.coreSoft)}, n);
  // The blast tears the tongues' roots off the skin, ragged and soft.
  float tear = smoothstep(0.0, ${f(T.burstTear)}, b);
  float torn = smoothstep(0.0, ${f(T.burstTearDepth)}, d - din + (n - 0.5) * ${f(T.burstTearJag)});
  float rooted = air * (1.0 + (torn - 1.0) * tear);
  // Nothing hangs under the soles: the floor fades the plume out, soft
  // and a little ragged, over a few pixels of any backing (an analytic
  // edge, never the field's texel rows).
  float ground = 1.0 - smoothstep(${f(T.floorFrom)}, ${f(T.floorTo)}, depth + (ne.b - 0.5) * ${f(T.floorJag)});
  float plume = (core * ${f(T.coreWeight)} + halo * ${f(1 - T.coreWeight)}) * rooted * ground
    * (1.0 - smoothstep(${f(T.tipFade)}, 1.0, fall));
  float plumeHeat = (0.4 + 0.6 * clamp((n - thr) / ${f(T.hotSpan)}, 0.0, 1.0)) * (1.0 - ${f(T.tipCool)} * fall);
  float rim = exp(-din / ${f(T.rimWidth)}) * skin * (0.3 + 0.7 * smoothstep(0.3, 0.75, n));
  float sheet = (${f(T.sheetHaze)} + ${f(1 - T.sheetHaze)} * smoothstep(${f(T.sheetThr)} + kindling, ${f(T.sheetThr + T.sheetSoft)} + kindling, nS)) * skin;
  // The thrown fire fades before whichever edge of the drawing clips first.
  float sideIn = min(vUv.x - uView.x, uView.z - vUv.x) * uRect.z;
  float topIn = (vUv.y - uView.y) * uRect.w;
  float bottomIn = (uView.w - vUv.y) * uRect.w;
  float inView = smoothstep(0.0, ${f(T.throwFadeSide)}, sideIn)
    * smoothstep(0.0, ${f(T.throwFadeTop)}, topIn)
    * smoothstep(0.0, ${f(T.throwFadeBottom)}, bottomIn);
  // The detonation thins the fire away without cooling it: it blows out
  // bright, never as a dull cloud.
  float dissolve = (1.0 - smoothstep(0.0, ${f(T.burstDissolve)}, b)) * (1.0 + (inView - 1.0) * tear);
  // The sheet on the skin is torn off first; the tongues fly on.
  float bare = 1.0 - smoothstep(0.0, ${f(T.burstSkin)}, b);
  rim *= bare;
  sheet *= bare;
  float dens = min(1.0, plume + rim * ${f(T.rimGain)} + sheet * ${f(T.sheetGain)}) * lit * dissolve;
  // Temperature: hot at the base, along the rim and in slow drifting
  // patches; cool at the tips and across the sheet.
  float np = texture2D(uNoise, pw * ${f(T.patchScale)} + vec2(0.0, uDrift.z)).r;
  float patch = ${f(1 - T.patchAmp)} + ${f(T.patchAmp)} * np;
  float temp = clamp((plume * plumeHeat + rim * ${f(T.rimHeat)} + sheet * ${f(T.sheetHeat)})
    * lit * flare * flick * patch, 0.0, 1.0);
  vec3 colour = mix(rampSooty(temp), rampClean(temp), mLocal);
  float emit = clamp(dens * flick, 0.0, 1.0);
  float share = mix(1.0 - ${f(T.frontShare)} * skin, ${f(T.frontShare)} * skin, layer);
  vec3 E = colour * emit * share;
  float absorb = dens * (1.0 - 0.5 * temp) * (${f(T.absorbSooty)} * (1.0 - mLocal) + ${f(T.absorbClean)}) * share;
  if (layer < 0.5) {
    float edgeWindow = smoothstep(0.0, ${f(T.edgeFadeSide)}, sideIn)
      * smoothstep(0.0, ${f(T.edgeFadeTop)}, topIn)
      * smoothstep(0.0, ${f(T.edgeFadeBottom)}, bottomIn);
    float bloom = uLife.w * exp(-d / ${f(T.flashReach)}) * ${f(T.flashGain)} * edgeWindow;
    E += vec3(0.75, 0.92, 1.0) * bloom;
    float ringW = ${f(T.ringWidth)} + ${f(T.ringWiden)} * b;
    float rd = (d - uRing.x) / ringW;
    float ring = exp(-rd * rd) * uRing.y * (0.3 + 0.9 * nr.b) * step(0.001, d) * edgeWindow;
    E += mix(vec3(0.6, 0.85, 1.0), vec3(0.9, 0.97, 1.0), ring) * ring * ${f(T.ringGain)};
  } else if (uRing.w > 0.0) {
    // The tears of the 爆散, on the body itself (never thrown outward):
    // white-hot ragged lines along the fragments' birth paths, their
    // shape fixed on the body (noise at its own coordinates, no drift),
    // so a tear never writhes as it opens.
    vec4 body = texture2D(uField, vUv);
    float bodySkin = 1.0 - smoothstep(${f(-T.edgeSoft)}, ${f(T.edgeSoft)}, body.r * ${f(FIELD_D)} - body.a * ${f(FIELD_IN)});
    vec2 bp = vec2(uRect.x + vUv.x * uRect.z, uRect.y + vUv.y * uRect.w);
    vec4 nt = texture2D(uNoise, vec2(bp.x * ${f(T.tearScale)}, bp.y * ${f(T.tearScale * T.tearStretch)}));
    float jag = (nt.r - 0.5) * ${f(T.tearMeander)} + (nt.b - 0.5) * ${f(T.tearJag)} + (nt.a - 0.5) * ${f(T.tearJag * 0.5)};
${tearGaps()}    float width = (${f(T.tearHair)} + ${f(T.tearWidth - T.tearHair)} * uRing.z) * (${f(1 - T.tearPinch * 0.5)} + ${f(T.tearPinch)} * nt.g);
    float r = gap / width;
    float h = gap / ${f(T.tearHalo)};
    float glow = uRing.w * bodySkin;
    float white = exp(-r * r) * glow * ${f(T.tearGain)};
    float cyan = exp(-h * h) * glow * ${f(T.tearHaloGain)};
    E += vec3(0.92, 0.98, 1.0) * white + vec3(0.42, 0.8, 1.0) * cyan;
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
uniform mediump vec2 uSpark;
varying vec2 vCorner;
varying float vHeat;
void main() {
  vec2 dir = aData.zw;
  float len = length(dir);
  vec2 tdir = len > 0.00001 ? dir / len : vec2(0.0, -1.0);
  vec2 ndir = vec2(-tdir.y, tdir.x);
  float stretch = 1.0 + min(${f(T.sparkMaxStretch)}, len * uSpark.y);
  vec2 offset = tdir * aCorner.x * aData.y * stretch + ndir * aCorner.y * aData.y * ${f(T.sparkWidth)};
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
uniform mediump vec2 uSpark;
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
