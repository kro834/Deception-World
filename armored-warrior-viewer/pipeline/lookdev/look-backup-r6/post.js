// Frame pipeline: geometry pass into two colour attachments + depth, then 2D passes.
//
//   G        scene (painted materials) over the stage backdrop  full res, 2 x RGBA8 + depth24
//   bloom    glow-weighted colour, 4 to 6 levels down / up      1/2 .. 1/64
//   star     sparkle seeds stretched into a cross               1/4
//   tensor   structure tensor of the colour, blurred            1/2      } only for the settled,
//   paint    Kuwahara flattening pass                           full or 1/2 } full-quality frame
//   final    picture (flattened where the paint is flat, smeared or crystal) + edge light + outline
//            + bloom + stars + grain → canvas
//
// While the camera moves the tensor and paint passes are skipped; the final pass then reads the raw
// frame. All targets are 8-bit, so nothing here depends on float render-target support.
import * as THREE from '../vendor/three/build/three.module.min.js';
import { hexToVec3 } from './material.js';

const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const backdropFragment = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
layout(location = 1) out highp vec4 outAux;
uniform vec3 uEdge;
uniform vec3 uCenter;
uniform vec3 uFloor;
uniform vec2 uPoolRadius;
uniform vec2 uPoolCenter;
uniform vec2 uFloorParams;   // strength, contact shadow
uniform mat4 uInvProjection;
uniform mat4 uCameraWorld;
uniform vec4 uGround;        // xyz = point on the ground under the figure, w = figure radius
uniform float uOpaque;
in vec2 vUv;

void main() {
  // Same shape as the page: radial-gradient(ellipse 62% 56% at 50% 46%, center, edge).
  float t = clamp(length((vUv - uPoolCenter) / uPoolRadius), 0.0, 1.0);
  vec3 color = mix(uCenter, uEdge, t);

  // A soft pool of light and a contact shadow on the ground plane, in perspective.
  vec4 view = uInvProjection * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 direction = normalize((uCameraWorld * vec4(view.xyz / view.w, 0.0)).xyz);
  vec3 origin = uCameraWorld[3].xyz;
  if (direction.y < -1e-4) {
    vec3 hit = origin + direction * ((uGround.y - origin.y) / direction.y);
    float r = length(hit.xz - uGround.xz) / uGround.w;
    float pool = exp(-r * r * 1.5) * (1.0 - smoothstep(1.1, 2.4, r));
    color = mix(color, uFloor, pool * uFloorParams.x);
    color *= 1.0 - uFloorParams.y * exp(-r * r * 11.0);
  }
  outColor = vec4(color, uOpaque);
  outAux = vec4(0.5, 0.5, 0.0, 0.0);
}
`;

// Glow-weighted colour → half res. Alpha carries the sparkle seeds (max, so single pixels survive).
const bloomPrefilterFragment = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tAux;
uniform vec2 uTexel;       // texel of the full-res source
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  float seed = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i == 0 || i == 2 ? -0.5 : 0.5, i < 2 ? -0.5 : 0.5) * uTexel * 2.0;
    vec4 c = texture2D(tColor, vUv + o);
    sum += c.rgb * c.a;
    seed = max(seed, texture2D(tAux, vUv + o).a);
  }
  gl_FragColor = vec4(sum * 0.25, seed);
}
`;

const bloomDownFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;       // texel of the source
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSource, vUv).rgb * 4.0;
  sum += texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  sum += texture2D(tSource, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  sum += texture2D(tSource, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  sum += texture2D(tSource, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  gl_FragColor = vec4(sum / 8.0, 1.0);
}
`;

const bloomUpFragment = /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;       // texel of the low-res source
uniform float uSpread;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uSpread;
  vec3 sum = texture2D(tLow, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  sum += texture2D(tLow, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  sum += texture2D(tLow, vUv + vec2(0.0, o.y * 2.0)).rgb;
  sum += texture2D(tLow, vUv + vec2(o.x, o.y)).rgb * 2.0;
  sum += texture2D(tLow, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  sum += texture2D(tLow, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  sum += texture2D(tLow, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  sum += texture2D(tLow, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(sum / 12.0 * 0.62 + texture2D(tHigh, vUv).rgb * 0.5, 1.0);
}
`;

// Sparkle seeds for the cross filter, at the resolution the cross is drawn at: the strongest of the
// seeds (alpha of the half-res prefilter) under each pixel, so that single-pixel seeds survive.
const seedFragment = /* glsl */ `
uniform sampler2D tSource;   // half-res prefilter, seeds in alpha
uniform vec2 uTexel;         // one pixel of this target, in uv
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.25;
  float seed = max(max(texture2D(tSource, vUv + vec2(-o.x, -o.y)).a, texture2D(tSource, vUv + vec2(o.x, -o.y)).a),
                   max(texture2D(tSource, vUv + vec2(-o.x, o.y)).a, texture2D(tSource, vUv + vec2(o.x, o.y)).a));
  gl_FragColor = vec4(vec3(seed), 1.0);
}
`;

// One arm pair of the cross filter: seeds smeared along one axis with an exponential tail.
const starFragment = /* glsl */ `
uniform sampler2D tSource;   // the seeds
uniform vec2 uStep;          // one pixel of this target along the axis, in uv
uniform float uLength;       // arm length in pixels of this target
uniform float uFalloff;
varying vec2 vUv;
void main() {
  float sum = texture2D(tSource, vUv).r;
  int n = int(clamp(uLength, 1.0, 48.0));
  for (int i = 1; i <= n; i++) {
    float f = float(i) / float(n);
    float w = exp(-f * 4.2 * uFalloff) * (1.0 - f);
    vec2 o = uStep * float(i);
    sum += (textureLod(tSource, vUv + o, 0.0).r + textureLod(tSource, vUv - o, 0.0).r) * w;
  }
  gl_FragColor = vec4(vec3(sum), 1.0);
}
`;

// Structure tensor (Sobel on colour), square-root companded into 8 bits.
const tensorFragment = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uTexel;         // texel of this (half-res) target
varying vec2 vUv;
void main() {
  vec3 tl = texture2D(tColor, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 tc = texture2D(tColor, vUv + uTexel * vec2( 0.0,  1.0)).rgb;
  vec3 tr = texture2D(tColor, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 ml = texture2D(tColor, vUv + uTexel * vec2(-1.0,  0.0)).rgb;
  vec3 mr = texture2D(tColor, vUv + uTexel * vec2( 1.0,  0.0)).rgb;
  vec3 bl = texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 bc = texture2D(tColor, vUv + uTexel * vec2( 0.0, -1.0)).rgb;
  vec3 br = texture2D(tColor, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 sx = (tr + 2.0 * mr + br - tl - 2.0 * ml - bl) * 0.25;
  vec3 sy = (tl + 2.0 * tc + tr - bl - 2.0 * bc - br) * 0.25;
  float e = dot(sx, sx);
  float g = dot(sy, sy);
  float f = dot(sx, sy);
  gl_FragColor = vec4(sqrt(min(e / 3.0, 1.0)), sqrt(min(g / 3.0, 1.0)), 0.5 + 0.5 * sign(f) * sqrt(min(abs(f) / 3.0, 1.0)), 1.0);
}
`;

const tensorBlurFragment = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uStep;
varying vec2 vUv;
vec3 decode(vec4 t) {
  float f = t.z * 2.0 - 1.0;
  return vec3(t.x * t.x, t.y * t.y, sign(f) * f * f) * 3.0;
}
void main() {
  vec3 sum = decode(texture2D(tSource, vUv)) * 0.227027;
  sum += (decode(texture2D(tSource, vUv + uStep * 1.384615)) + decode(texture2D(tSource, vUv - uStep * 1.384615))) * 0.316216;
  sum += (decode(texture2D(tSource, vUv + uStep * 3.230769)) + decode(texture2D(tSource, vUv - uStep * 3.230769))) * 0.070270;
  gl_FragColor = vec4(sqrt(min(sum.x / 3.0, 1.0)), sqrt(min(sum.y / 3.0, 1.0)), 0.5 + 0.5 * sign(sum.z) * sqrt(min(abs(sum.z) / 3.0, 1.0)), 1.0);
}
`;

// Kuwahara filter with polynomial weights (Kyprianidis et al. 2010): eight sectors around each pixel,
// the least-varied ones win. It flattens what lies inside a colour area and keeps the borders
// between areas crisp. With anisotropy above 0 the kernel becomes an ellipse along the local
// structure, which reads as brush strokes (and turns streaky paint into frayed strokes).
const paintFragment = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tTensor;
uniform vec2 uTexel;         // one pixel of this pass's target, in uv
uniform vec4 uPaintParams;   // radius in target pixels, sharpness q, hardness, anisotropy (0 = round kernel)
varying vec2 vUv;

void main() {
  vec4 enc = texture2D(tTensor, vUv);
  float fz = enc.z * 2.0 - 1.0;
  float E = enc.x * enc.x * 3.0;
  float G = enc.y * enc.y * 3.0;
  float F = sign(fz) * fz * fz * 3.0;
  float root = sqrt(max((E - G) * (E - G) + 4.0 * F * F, 0.0));
  float l1 = 0.5 * (E + G + root);
  float l2 = 0.5 * (E + G - root);
  vec2 v = vec2(l1 - E, -F);
  vec2 dir = dot(v, v) > 1e-10 ? normalize(v) : vec2(0.0, 1.0);
  float phi = -atan(dir.y, dir.x);
  float A = (l1 + l2 > 1e-7) ? (l1 - l2) / (l1 + l2) : 0.0;

  float radius = uPaintParams.x;
  float stretch = clamp(1.0 + A * uPaintParams.w, 1.0, 2.0);
  float a = radius * stretch;
  float b = radius / stretch;
  float cosPhi = cos(phi);
  float sinPhi = sin(phi);
  mat2 R = mat2(cosPhi, -sinPhi, sinPhi, cosPhi);
  mat2 S = mat2(0.5 / a, 0.0, 0.0, 0.5 / b);
  mat2 SR = S * R;
  int maxX = int(sqrt(a * a * cosPhi * cosPhi + b * b * sinPhi * sinPhi));
  int maxY = int(sqrt(a * a * sinPhi * sinPhi + b * b * cosPhi * cosPhi));

  float zeta = 2.0 / radius;
  float zeroCross = 0.58;
  float sinZero = sin(zeroCross);
  float eta = (zeta + cos(zeroCross)) / (sinZero * sinZero);

  vec4 m[8];
  vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }

  for (int y = -maxY; y <= maxY; y++) {
    for (int x = -maxX; x <= maxX; x++) {
      vec2 p = SR * vec2(float(x), float(y));
      if (dot(p, p) <= 0.25) {
        vec3 c = textureLod(tColor, vUv + vec2(float(x), float(y)) * uTexel, 0.0).rgb;
        float w[8];
        float sum = 0.0;
        float z;
        float vxx = zeta - eta * p.x * p.x;
        float vyy = zeta - eta * p.y * p.y;
        z = max(0.0,  p.y + vxx); w[0] = z * z; sum += w[0];
        z = max(0.0, -p.x + vyy); w[2] = z * z; sum += w[2];
        z = max(0.0, -p.y + vxx); w[4] = z * z; sum += w[4];
        z = max(0.0,  p.x + vyy); w[6] = z * z; sum += w[6];
        vec2 d = 0.70710678 * vec2(p.x - p.y, p.x + p.y);
        vxx = zeta - eta * d.x * d.x;
        vyy = zeta - eta * d.y * d.y;
        z = max(0.0,  d.y + vxx); w[1] = z * z; sum += w[1];
        z = max(0.0, -d.x + vyy); w[3] = z * z; sum += w[3];
        z = max(0.0, -d.y + vxx); w[5] = z * z; sum += w[5];
        z = max(0.0,  d.x + vyy); w[7] = z * z; sum += w[7];
        float g = exp(-3.125 * dot(d, d)) / max(sum, 1e-6);
        for (int k = 0; k < 8; k++) {
          float wk = w[k] * g;
          m[k] += vec4(c * wk, wk);
          s[k] += c * c * wk;
        }
      }
    }
  }

  vec4 result = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    float weight = max(m[k].w, 1e-6);
    vec3 mean = m[k].rgb / weight;
    vec3 variance = abs(s[k] / weight - mean * mean);
    float sigma2 = variance.r + variance.g + variance.b;
    float wk = 1.0 / (1.0 + pow(min(uPaintParams.z * 1000.0 * sigma2, 300.0), 0.5 * uPaintParams.y));
    result += vec4(mean * wk, wk);
  }
  gl_FragColor = vec4(result.rgb / max(result.w, 1e-24), texture2D(tColor, vUv).a);
}
`;

const finalFragment = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tPaint;
uniform sampler2D tTensor;
uniform sampler2D tAux;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform sampler2D tStarH;
uniform sampler2D tStarV;
uniform vec2 uTexel;         // texel of the full-res targets
uniform vec2 uNearFar;
uniform float uPaint;        // 0 raw frame … 1 brushed frame (where the paint is not crisp)
uniform vec2 uProtect;       // local edge strength: below x = flat (brushed), above y = crisp detail (left as painted)
uniform float uFlatCalm;     // strength of the flattening on flat or merely noisy paint
uniform vec2 uInkPx;         // half-width in device pixels: outline, inner ink
uniform vec4 uInkParams;     // outline strength, inner strength, depth threshold of the inner ink, tint
uniform vec3 uInk;
uniform vec2 uLight;         // bloom strength, star strength
uniform vec3 uStarColor;
uniform float uGrain;
uniform float uView;         // look-dev: 1 = where the flattening applies, 2 = ink only
varying vec2 vUv;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float viewZ(vec2 uv) {
  float ndc = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0 * uNearFar.x * uNearFar.y / (uNearFar.y + uNearFar.x - ndc * (uNearFar.y - uNearFar.x));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 color = texture2D(tColor, vUv).rgb;
  float figure = step(texture2D(tDepth, vUv).x, 0.99999);

  // ---- brush: only where the picture has no crisp painted detail (smears, JPEG noise) ---------
  float calm = 0.0;
  if (uPaint > 0.001) {
    vec4 t = texture2D(tTensor, vUv);
    float edge = sqrt(t.x * t.x + t.y * t.y);                  // local colour step, blurred
    float flatness = 1.0 - smoothstep(uProtect.x, uProtect.y, edge);
    float asked = texture2D(tAux, vUv).b;                      // from the material: smeared paint, crystal interiors
    calm = uPaint * max(flatness * uFlatCalm, asked) * figure;
    color = mix(color, texture2D(tPaint, vUv).rgb, calm);
  }

  // ---- ink. The outline is the border between the figure and the stage, drawn on both sides of it
  // and clearly heavier than the inner ink, which marks real depth breaks inside the figure (one part
  // in front of another).
  float zc = viewZ(vUv);
  float ink = 0.0;
  if (uInkParams.x > 0.0) {
    float covered = 0.0;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * 0.7853982;
      covered += step(texture2D(tDepth, vUv + vec2(cos(angle), sin(angle)) * uInkPx.x * uTexel).x, 0.99999);
    }
    covered /= 8.0;
    ink = (figure > 0.5 ? smoothstep(0.0, 0.3, 1.0 - covered) : smoothstep(0.0, 0.3, covered)) * uInkParams.x;
  }
  if (uInkParams.y > 0.0 && figure > 0.5) {
    float strongest = 0.0;
    float total = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 axis = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(0.0, 1.0) : i == 2 ? vec2(0.7071, 0.7071) : vec2(-0.7071, 0.7071);
      vec2 o = axis * uInkPx.y * uTexel;
      float za = viewZ(vUv + o);
      float zb = viewZ(vUv - o);
      float bend = abs(za + zb - 2.0 * zc) / min(zc, min(za, zb));
      float e = smoothstep(uInkParams.z, uInkParams.z * 2.4, bend);
      strongest = max(strongest, e);
      total += e;
    }
    ink = max(ink, clamp(strongest * 0.55 + total * 0.2, 0.0, 1.0) * uInkParams.y);
  }
  color = mix(color, mix(uInk, color * 0.3, uInkParams.w), ink);
  if (uView > 0.5) { gl_FragColor = vec4(uView < 1.5 ? vec3(calm) : vec3(1.0 - ink), 1.0); return; }

  // ---- light: coloured bloom and cross stars ---------------------------------------------------
  float before = max(max(color.r, color.g), color.b);
  color += texture2D(tBloom, vUv).rgb * uLight.x;
  float star = texture2D(tStarH, vUv).r + texture2D(tStarV, vUv).r;
  color += uStarColor * star * uLight.y;

  // Soft shoulder on the brightest channel, for the added light only: a strong glow stays coloured
  // instead of clipping to white, and a pixel that received no light is left exactly as it was.
  float peak = max(max(color.r, color.g), color.b);
  float knee = max(before, 0.86);
  if (peak > knee) {
    float room = max(1.0 - knee, 0.001);
    color *= (knee + room * (1.0 - exp(-(peak - knee) / room))) / peak;
  }

  // ---- paper grain; the last term dithers the dark backdrop gradient (never the figure) -------
  float l = dot(color, LUMA);
  float grain = hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 17.0) - 1.0;
  color += grain * uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.5, l));
  color += (hash12(gl_FragCoord.xy + 5.3) - 0.5) / 255.0 * (1.0 - figure);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

function makeTarget(width, height, options = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    ...options,
  });
}

export function createPipeline({ renderer, LOOK, brushEnabled = () => true, brushScale = () => 1 }) {
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeometry = new THREE.BufferGeometry();
  quadGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(quadGeometry);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const pass = (fragmentShader, uniforms, glsl3 = false) => new THREE.ShaderMaterial({
    vertexShader: glsl3 ? fullscreenVertex.replace(/varying/g, 'out') : fullscreenVertex,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    glslVersion: glsl3 ? THREE.GLSL3 : null,
  });
  const texel = () => ({ value: new THREE.Vector2(1, 1) });

  const { stage, ink, sparkle, paint, bloom } = LOOK;
  const backdrop = pass(backdropFragment, {
    uEdge: { value: hexToVec3(stage.edge) },
    uCenter: { value: hexToVec3(stage.center) },
    uFloor: { value: hexToVec3(stage.floor) },
    uPoolRadius: { value: new THREE.Vector2(...stage.poolRadius) },
    uPoolCenter: { value: new THREE.Vector2(...stage.poolCenter) },
    uFloorParams: { value: new THREE.Vector2(stage.floorStrength, stage.contactShadow) },
    uInvProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uGround: { value: new THREE.Vector4(0, 0, 0, 1) },
    uOpaque: { value: 0 },
  }, true);
  const prefilter = pass(bloomPrefilterFragment, { tColor: { value: null }, tAux: { value: null }, uTexel: texel(), });
  const down = pass(bloomDownFragment, { tSource: { value: null }, uTexel: texel() });
  const up = pass(bloomUpFragment, { tLow: { value: null }, tHigh: { value: null }, uTexel: texel(), uSpread: { value: bloom.radius } });
  const seed = pass(seedFragment, { tSource: { value: null }, uTexel: texel() });
  const star = pass(starFragment, { tSource: { value: null }, uStep: texel(), uLength: { value: 8 }, uFalloff: { value: sparkle.falloff } });
  const tensor = pass(tensorFragment, { tColor: { value: null }, uTexel: texel() });
  const tensorBlur = pass(tensorBlurFragment, { tSource: { value: null }, uStep: texel() });
  const brush = pass(paintFragment, {
    tColor: { value: null },
    tTensor: { value: null },
    uTexel: texel(),
    uPaintParams: { value: new THREE.Vector4(4, paint.sharpness, paint.hardness, paint.anisotropy) },
  });
  const final = pass(finalFragment, {
    tColor: { value: null },
    tPaint: { value: null },
    tTensor: { value: null },
    tAux: { value: null },
    tDepth: { value: null },
    tBloom: { value: null },
    tStarH: { value: null },
    tStarV: { value: null },
    uTexel: texel(),
    uNearFar: { value: new THREE.Vector2(0.1, 10) },
    uPaint: { value: 0 },
    uProtect: { value: new THREE.Vector2(...paint.protect) },
    uFlatCalm: { value: paint.flat },
    uInkPx: { value: new THREE.Vector2(1, 1) },
    uInkParams: { value: new THREE.Vector4(ink.outline, ink.inner, ink.depthThreshold, ink.tint) },
    uInk: { value: hexToVec3(ink.color) },
    uLight: { value: new THREE.Vector2(bloom.strength, sparkle.strength) },
    uStarColor: { value: hexToVec3(sparkle.color) },
    uGrain: { value: LOOK.grain },
    uView: { value: Number(new URLSearchParams(location.search).get('view') || 0) },
  });
  const materials = [backdrop, prefilter, down, up, seed, star, tensor, tensorBlur, brush, final];
  // Passes whose program failed to compile or link are switched off for good (see checkPrograms).
  const kinds = new Map([[backdrop, 'backdrop'], [prefilter, 'prefilter'], [down, 'bloom'], [up, 'bloom'], [seed, 'stars'], [star, 'stars'], [tensor, 'paint'], [tensorBlur, 'paint'], [brush, 'paint'], [final, 'final']]);
  const off = { backdrop: false, bloom: false, stars: false };

  let targets = null;
  let size = { width: 0, height: 0, pixelRatio: 1 };
  let hasPaint = false;

  function disposeTargets() {
    if (!targets) return;
    targets.g.depthTexture?.dispose();
    for (const target of targets.all) target.dispose();
    targets = null;
    hasPaint = false;
  }

  function allocate() {
    disposeTargets();
    const { width, height } = size;
    const depthTexture = new THREE.DepthTexture(width, height);
    const g = makeTarget(width, height, { count: 2, depthBuffer: true, depthTexture });
    const half = [Math.ceil(width / 2), Math.ceil(height / 2)];
    // Bloom reaches the same distance on screen at any pixel ratio: one more level per doubling.
    const count = Math.min(6, Math.max(4, 4 + Math.round(Math.log2(size.pixelRatio / 1.5))));
    const levels = [];
    for (let i = 1; i <= count; i++) levels.push([Math.ceil(width / 2 ** i), Math.ceil(height / 2 ** i)]);
    const downs = levels.map(([w, h]) => makeTarget(w, h));
    const ups = levels.slice(0, -1).map(([w, h]) => makeTarget(w, h));
    // The cross stars are drawn small (a quarter of the frame each way by default) and magnified.
    const starSize = [Math.ceil(width / sparkle.divisor), Math.ceil(height / sparkle.divisor)];
    const seeds = makeTarget(starSize[0], starSize[1]);
    const starH = makeTarget(starSize[0], starSize[1]);
    const starV = makeTarget(starSize[0], starSize[1]);
    // The brush pass needs three more targets; devices that skip the pass do not get them.
    const brush = brushEnabled();
    const tensorA = brush ? makeTarget(half[0], half[1]) : null;
    const tensorB = brush ? makeTarget(half[0], half[1]) : null;
    // … and the flattened picture itself may be smaller than the frame: its content is low-frequency by
    // construction, and the final pass takes crisp borders from the full-size frame.
    const scale = Math.min(1, Math.max(0.25, brushScale()));
    const painted = brush ? makeTarget(Math.ceil(width * scale), Math.ceil(height * scale)) : null;
    targets = { g, downs, ups, seeds, starH, starV, starSize, tensorA, tensorB, painted, levels, all: [g, ...downs, ...ups, seeds, starH, starV, tensorA, tensorB, painted].filter(Boolean) };
  }

  function draw(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCamera);
  }

  function setSize(width, height, pixelRatio) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    if (targets && w === size.width && h === size.height) { size.pixelRatio = pixelRatio; return; }
    size = { width: w, height: h, pixelRatio };
    disposeTargets();
  }

  // The backdrop on its own (forward tier, and inside the G pass).
  function drawBackdrop(camera, ground) {
    if (off.backdrop) return; // the clear colour stands in for it
    backdrop.uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    backdrop.uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    backdrop.uniforms.uGround.value.copy(ground);
    quad.material = backdrop;
    renderer.render(quadScene, quadCamera);
  }

  // Returns false when the geometry target cannot be used (the caller drops to the forward tier).
  function renderGeometry(scene, camera, ground) {
    if (!targets) allocate();
    const gl = renderer.getContext();
    renderer.setRenderTarget(targets.g);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    drawBackdrop(camera, ground);
    renderer.render(scene, camera);
    hasPaint = false;
    return true;
  }

  function renderLight() {
    const { g, downs, ups, seeds, starH, starV, starSize, levels } = targets;
    const [color, aux] = g.textures;
    prefilter.uniforms.tColor.value = color;
    prefilter.uniforms.tAux.value = aux;
    prefilter.uniforms.uTexel.value.set(1 / size.width, 1 / size.height);
    if (off.bloom && off.stars) return;
    draw(prefilter, downs[0]);
    for (let i = 1; i < downs.length && !off.bloom; i++) {
      down.uniforms.tSource.value = downs[i - 1].texture;
      down.uniforms.uTexel.value.set(1 / levels[i - 1][0], 1 / levels[i - 1][1]);
      draw(down, downs[i]);
    }
    let low = downs[downs.length - 1];
    up.uniforms.uSpread.value = bloom.radius * (size.pixelRatio / 1.5) / 2 ** (downs.length - 4);
    for (let i = downs.length - 2; i >= 0 && !off.bloom; i--) {
      up.uniforms.tLow.value = low.texture;
      up.uniforms.tHigh.value = downs[i].texture;
      up.uniforms.uTexel.value.set(1 / levels[i + 1][0], 1 / levels[i + 1][1]);
      draw(up, ups[i]);
      low = ups[i];
    }
    if (off.stars) return;
    seed.uniforms.tSource.value = downs[0].texture;
    seed.uniforms.uTexel.value.set(1 / starSize[0], 1 / starSize[1]);
    draw(seed, seeds);
    star.uniforms.tSource.value = seeds.texture;
    star.uniforms.uLength.value = (sparkle.length * size.pixelRatio) / sparkle.divisor;
    star.uniforms.uStep.value.set(1 / starSize[0], 0);
    draw(star, starH);
    star.uniforms.uStep.value.set(0, 1 / starSize[1]);
    draw(star, starV);
  }

  function renderPaint() {
    const { g, tensorA, tensorB, painted, levels } = targets;
    if (!painted) return;
    const color = g.textures[0];
    const [hw, hh] = levels[0];
    tensor.uniforms.tColor.value = color;
    tensor.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    draw(tensor, tensorA);
    tensorBlur.uniforms.tSource.value = tensorA.texture;
    tensorBlur.uniforms.uStep.value.set(1 / hw, 0);
    draw(tensorBlur, tensorB);
    tensorBlur.uniforms.tSource.value = tensorB.texture;
    tensorBlur.uniforms.uStep.value.set(0, 1 / hh);
    draw(tensorBlur, tensorA);
    brush.uniforms.tColor.value = color;
    brush.uniforms.tTensor.value = tensorA.texture;
    brush.uniforms.uTexel.value.set(1 / painted.width, 1 / painted.height);
    brush.uniforms.uPaintParams.value.x = Math.min(paint.maxRadiusPx, Math.max(1.5, paint.radiusCss * size.pixelRatio * (painted.width / size.width)));
    draw(brush, painted);
    hasPaint = true;
  }

  function renderFinal(camera, paintMix) {
    const { g, ups, starH, starV, painted } = targets;
    const u = final.uniforms;
    u.tColor.value = g.textures[0];
    u.tPaint.value = hasPaint ? painted.texture : g.textures[0];
    u.tAux.value = g.textures[1];
    u.tDepth.value = g.depthTexture;
    u.tBloom.value = ups[0].texture;
    u.tStarH.value = starH.texture;
    u.tStarV.value = starV.texture;
    u.uTexel.value.set(1 / size.width, 1 / size.height);
    u.uNearFar.value.set(camera.near, camera.far);
    u.tTensor.value = hasPaint ? targets.tensorA.texture : g.textures[0];
    u.uPaint.value = hasPaint ? paintMix * paint.amount : 0;
    u.uLight.value.set(off.bloom ? 0 : bloom.strength, off.stars ? 0 : sparkle.strength);
    u.uInkPx.value.set(Math.max(0.75, ink.outlineCss * size.pixelRatio * 0.5), Math.max(0.75, ink.innerCss * size.pixelRatio * 0.5));
    draw(final, null);
  }

  return {
    setSize,
    setOpaqueBackdrop(value) { backdrop.uniforms.uOpaque.value = value ? 1 : 0; },
    // Centre of the backdrop gradient in uv (y up); null puts back the tunable's value.
    setPoolCenter(x, y) {
      if (x === null) backdrop.uniforms.uPoolCenter.value.set(...stage.poolCenter);
      else backdrop.uniforms.uPoolCenter.value.set(x, y);
    },
    drawBackdrop,
    renderGeometry,
    renderLight,
    renderPaint,
    renderFinal,
    // Marks passes whose program failed (test(material) is true once per newly failed material) and
    // switches them off. Returns the newly failed kinds: backdrop, prefilter, bloom, stars, paint, final.
    checkPrograms(test) {
      const failed = [];
      for (const [material, kind] of kinds) {
        if (!test(material)) continue;
        failed.push(kind);
        if (kind === 'backdrop') off.backdrop = true;
        if (kind === 'prefilter' || kind === 'bloom') off.bloom = true;
        if (kind === 'prefilter' || kind === 'stars') off.stars = true;
      }
      return failed;
    },
    resetPrograms() { off.backdrop = off.bloom = off.stars = false; },
    get off() { return Object.keys(off).filter((key) => off[key]); },
    // For ?diag=1: render targets now allocated, and their estimated size (RGBA8; depth as 4 B/px).
    get targetCount() { return targets ? targets.all.length : 0; },
    targetBytes() {
      if (!targets) return 0;
      let bytes = 0;
      for (const target of targets.all) bytes += target.width * target.height * 4 * (target.textures?.length || 1);
      if (targets.g.depthTexture) bytes += targets.g.width * targets.g.height * 4;
      return bytes;
    },
    get hasPaint() { return hasPaint; },
    get size() { return size; },
    reset: disposeTargets,
    dispose() {
      disposeTargets();
      for (const material of materials) material.dispose();
      quadGeometry.dispose();
    },
  };
}
