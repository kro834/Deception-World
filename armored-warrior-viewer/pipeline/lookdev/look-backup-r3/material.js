// Painted-texture-first material. One shader for every surface of the figure.
//
// The base-colour texture is the character sheet's painting projected onto the mesh: banded bronze
// gold, near-black scaled armour, blue-to-pink crystals, inked plate lines. Shown unlit it IS the
// picture, so it is shown unlit. Everything else is a light-handed layer on top, each with its own
// strength in tunables.js that can be set to zero:
//
//   sharpen   an unsharp mask in texture space; smeared paint is softened instead
//   grade     levels and saturation towards the sheet, hues kept
//   form      a cel shade and mild AO from the smoothed normal, a rim light
//   sheen     view-dependent highlights from the Blender matcaps on gold and on dark enamel
//   glow      the authored emissive maps at a modest level, feeding a hue-preserving bloom and stars
//
// Outputs (two colour attachments):
//   0  rgb = display-referred colour, a = glow amount (feeds bloom)
//   1  rg  = smoothed view-space normal xy (debug only), b = how smeared the paint is here (steers
//            the brush pass), a = sparkle seed
import * as THREE from 'three';

export const vertexShader = /* glsl */ `
out vec2 vUv;
out vec3 vViewPos;
out vec3 vNormal;

void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}
`;

export const fragmentShader = /* glsl */ `
layout(location = 0) out highp vec4 outColor;
layout(location = 1) out highp vec4 outAux;

uniform mat3 normalMatrix;

uniform sampler2D map;            // the painting (base colour)
uniform sampler2D emissiveMap;    // authored glow of the crystals
uniform sampler2D styleMap;       // R = baked ambient occlusion
uniform sampler2D toonNormalMap;  // object-space smoothed normal
uniform sampler2D repairMap;      // optional repainted copy of the painting (mixed in by uRepair)
uniform sampler2D confMap;        // optional reliability of the painting: 1 crisp, 0 smeared
uniform sampler2D matcapGold;
uniform sampler2D matcapArmor;

uniform vec3 uBaseColor;      // base-colour factor (display colour for untextured parts)
uniform float uHasStyle;
uniform float uHasToonNormal;
uniform float uRepair;        // share of the repainted copy (0 when there is none)
uniform float uHasConf;
uniform float uSparkleCells;
uniform float uDebug;
uniform float uOpaque;

uniform vec4 uGrade;          // black point, white point, gamma, saturation
uniform vec2 uShoulder;       // knee, value of painted white after the levels
uniform vec3 uKeyDir;
uniform vec3 uRimDir;
uniform vec4 uShade;          // strength, threshold, softness, AO push on the threshold
uniform vec3 uShadeColor;
uniform vec2 uForm;           // smoothed-normal mix, AO strength
uniform vec4 uRim;            // strength, threshold, softness, how much bright paint is spared
uniform vec3 uRimColor;
uniform vec4 uSheen;          // gold strength, armour strength, gold cut, armour cut
uniform vec3 uSheenGold;
uniform vec3 uSheenArmor;
uniform vec4 uEmissive;       // brightening of glowing paint, glow fed to bloom, shade spared, white-core boost
uniform vec4 uSparkle;        // hot-point seed strength, random seed probability, size px, hot cut
uniform vec2 uSharpen;        // amount, radius (mip levels)
uniform vec4 uSmear;          // conf below x = smeared, above y = crisp; z = weight of surfaces that face neither sheet; w = blur of smeared paint (mip levels)

in vec2 vUv;
in vec3 vViewPos;
in vec3 vNormal;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
// Exact sRGB encoding: the textures are decoded to linear when sampled, and the painting must come
// back out with exactly the values that were painted (an approximate gamma lifts the blacks).
vec3 toDisplay(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float saturate(float x) { return clamp(x, 0.0, 1.0); }
float max3(vec3 c) { return max(c.r, max(c.g, c.b)); }

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

vec2 matcapUv(vec3 n, vec3 v) {
  vec3 x = normalize(vec3(v.z, 0.0, -v.x));
  vec3 y = cross(v, x);
  return vec2(dot(x, n), dot(y, n)) * 0.495 + 0.5;
}

void main() {
  vec3 V = normalize(-vViewPos);
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 Ng = normalize(vNormal) * facing;
  vec2 cell = vUv * uSparkleCells;
  float cellPixel = max(length(fwidth(cell)), 1e-5);

  // Form is read from a smoothed normal: large clean shapes instead of every lump of the mesh.
  vec3 N = Ng;
  if (uHasToonNormal > 0.5) {
    vec3 baked = normalize(normalMatrix * (texture(toonNormalMap, vUv).xyz * 2.0 - 1.0)) * facing;
    N = normalize(mix(Ng, baked, uForm.x));
  }
  float ao = mix(1.0, texture(styleMap, vUv).r, uHasStyle);

  // ---- 1. the picture: the painted base colour, unlit, with a gentle grade ---------------------
  // Where is the painting unreliable? (Stretched or invented by the projection of the two sheets.)
  // From the baked confidence map when there is one, plus surfaces that face neither sheet.
  float conf = mix(1.0, texture(confMap, vUv).r, uHasConf);
  vec3 objectNormal = normalize(N * normalMatrix);                     // back to object space (uniform scale)
  float sideways = 1.0 - smoothstep(0.25, 0.6, abs(objectNormal.z));
  float smear = max(1.0 - smoothstep(uSmear.x, uSmear.y, conf), sideways * uSmear.z);

  // The mip level the GPU would pick here, never below 0. Blurred taps are taken a fixed number of
  // levels above it with textureLod, so they have the same footprint on the texture at any zoom (a
  // plain mip bias is swallowed as soon as the texture is magnified, which is every close-up).
  vec2 texels = vec2(textureSize(map, 0));
  vec2 du = dFdx(vUv) * texels;
  vec2 dv = dFdy(vUv) * texels;
  float lod = max(0.5 * log2(max(dot(du, du), dot(dv, dv))), 0.0);

  vec3 crisp = texture(map, vUv).rgb;
  // Smeared paint is softened in the texture itself (this also reaches devices that skip the brush pass).
  vec3 paintLinear = mix(crisp, textureLod(map, vUv, lod + uSmear.w).rgb, smear * step(0.001, uSmear.w));
  if (uRepair > 0.0) paintLinear = mix(paintLinear, texture(repairMap, vUv).rgb, uRepair);
  vec3 paint = toDisplay(paintLinear * uBaseColor);
  // Crisper paint: an unsharp mask in texture space (the difference to a blurrier level). Not on smears.
  vec3 soft = toDisplay(textureLod(map, vUv, lod + uSharpen.y).rgb * uBaseColor);
  paint = clamp(paint + (toDisplay(crisp * uBaseColor) - soft) * uSharpen.x * (1.0 - smear), 0.0, 1.0);
  vec3 emis = toDisplay(texture(emissiveMap, vUv).rgb);
  float emisMax = max3(emis);
  // Levels act on luminance and scale the colour with it, so the painted hues are kept (a per-channel
  // stretch would turn the blue-black armour navy); saturation is one separate, global factor.
  float paintLuma = luma(paint);
  float gradedLuma = pow(max((paintLuma - uGrade.x) / (uGrade.y - uGrade.x), 0.0), uGrade.z);
  vec3 color = paint * (gradedLuma / max(paintLuma, 1e-4));
  color = max(mix(vec3(luma(color)), color, uGrade.w), 0.0);
  // Soft shoulder on the brightest channel, scaling the others with it: what the levels push past
  // full brightness rolls off in its own hue instead of clipping to white. uShoulder.y is where
  // painted white lands after the levels; with a neutral grade it is 1 and this is the identity.
  float top = max3(color);
  if (top > uShoulder.x) {
    float t = min((top - uShoulder.x) / (uShoulder.y - uShoulder.x), 1.0);
    float power = (uShoulder.y - uShoulder.x) / (1.0 - uShoulder.x);
    color *= (uShoulder.x + (1.0 - uShoulder.x) * (1.0 - pow(1.0 - t, power))) / top;
  }

  // What kind of paint is under this fragment? Soft gates, used only to place the sheen.
  vec3 hsv = rgb2hsv(paint);
  float lit = smoothstep(0.1, 0.24, emisMax);                         // glowing crystal
  float goldGate = smoothstep(0.012, 0.04, hsv.x) * (1.0 - smoothstep(0.145, 0.185, hsv.x))
    * smoothstep(0.15, 0.3, hsv.y) * smoothstep(0.16, 0.3, hsv.z) * (1.0 - lit);
  float armorGate = (1.0 - smoothstep(0.16, 0.34, hsv.z)) * (1.0 - lit);

  // ---- 3. form: a cel shade on the side away from the key light, mild AO, a rim light ----------
  float key = dot(N, uKeyDir) * 0.5 + 0.5;
  float edge = uShade.y + (1.0 - ao) * uShade.w;
  float shade = 1.0 - smoothstep(edge - uShade.z, edge + uShade.z, key);
  shade *= uShade.x * (1.0 - lit * uEmissive.z);
  color = mix(color, color * uShadeColor, shade);
  color *= mix(1.0, ao, uForm.y * (1.0 - lit * uEmissive.z));

  float fresnel = 1.0 - saturate(dot(N, V));
  float rimSide = smoothstep(-0.15, 0.45, dot(N, uRimDir));
  float rim = smoothstep(uRim.y - uRim.z, uRim.y + uRim.z, fresnel * (0.55 + 0.45 * rimSide)) * rimSide;
  rim *= uRim.x * (1.0 - uRim.w * smoothstep(0.15, 0.6, max3(color)));

  // ---- 4. metal that lives: highlights of the Blender matcaps, added on top --------------------
  vec2 muv = matcapUv(N, V);
  float goldGlint = smoothstep(uSheen.z, uSheen.z + 0.08, luma(toDisplay(texture(matcapGold, muv).rgb)));
  float armorGlint = smoothstep(uSheen.w, uSheen.w + 0.08, luma(toDisplay(texture(matcapArmor, muv).rgb)));
  vec3 sheen = uSheenGold * goldGlint * uSheen.x * goldGate + uSheenArmor * armorGlint * uSheen.y * armorGate;
  color += sheen + uRimColor * rim;

  // ---- 5. crystals: the authored glow, modest; bloom and stars are added by the final pass -----
  color *= 1.0 + luma(emis) * uEmissive.x;                              // brighter in its own hue, not whiter
  // Painted star centres and orb cores: paint that is nearly white (all three channels high), on
  // glowing crystal. Bright saturated paint, like the buckle's gems, is not a core.
  float hot = smoothstep(uSparkle.w, 1.0, min(paint.r, min(paint.g, paint.b))) * lit;
  color = mix(color, vec3(1.0, 0.985, 1.0), hot * uEmissive.w);
  float glow = luma(emis) * uEmissive.y;

  float sparkle = hot * uSparkle.x;
  if (lit > 0.5) {
    vec3 rnd = hash33(vec3(floor(cell), 7.0));
    if (rnd.x < uSparkle.y) {
      vec2 local = fract(cell) - 0.5 - (rnd.yz - 0.5) * 0.6;
      float distancePx = length(local) / cellPixel;
      sparkle = max(sparkle, (1.0 - smoothstep(uSparkle.z * 0.5, uSparkle.z, distancePx)) * (0.6 + 0.4 * rnd.z) * saturate(dot(Ng, V) * 2.5));
    }
  }

  if (uDebug > 0.5) {
    if (uDebug < 1.5) color = paint;
    else if (uDebug < 2.5) color = vec3(goldGate, lit, armorGate);
    else if (uDebug < 3.5) color = vec3(shade, key, ao);
    else if (uDebug < 4.5) color = N * 0.5 + 0.5;
    else if (uDebug < 5.5) color = emis;
    else if (uDebug < 6.5) color = sheen * 4.0 + uRimColor * rim;
    else if (uDebug < 7.5) color = vec3(glow, sparkle, hot);
    else color = vec3(conf, smear, sideways);
  }

  outColor = vec4(clamp(color, 0.0, 1.0), max(clamp(glow, 0.0, 1.0), uOpaque));
  outAux = vec4(N.xy * 0.5 + 0.5, clamp(smear, 0.0, 1.0), clamp(sparkle, 0.0, 1.0));
}
`;

export function hexToVec3(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function pixelTexture(r, g, b, a = 255, colorSpace = THREE.NoColorSpace) {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Uniforms shared by every material (same objects, so one assignment updates all of them).
export function createSharedUniforms(LOOK) {
  const dir = (array) => new THREE.Vector3(...array).normalize();
  const { grade, form, sheen, emissive, sparkle, paint } = LOOK;
  return {
    matcapGold: { value: null },
    matcapArmor: { value: null },
    uDebug: { value: 0 },
    uOpaque: { value: 0 },
    uGrade: { value: new THREE.Vector4(grade.blackPoint, grade.whitePoint, grade.gamma, grade.saturation) },
    uShoulder: { value: new THREE.Vector2(0.8, Math.max(1, ((1 - grade.blackPoint) / (grade.whitePoint - grade.blackPoint)) ** grade.gamma)) },
    uKeyDir: { value: dir(form.key) },
    uRimDir: { value: dir(form.rimDirection) },
    uShade: { value: new THREE.Vector4(form.shade, form.shadeThreshold, form.shadeSoftness, form.aoShade) },
    uShadeColor: { value: hexToVec3(form.shadeColor) },
    uForm: { value: new THREE.Vector2(form.smoothNormal, form.ao) },
    uRim: { value: new THREE.Vector4(form.rim, form.rimThreshold, form.rimSoftness, form.rimSpareBright) },
    uRimColor: { value: hexToVec3(form.rimColor) },
    uSheen: { value: new THREE.Vector4(sheen.gold, sheen.armor, sheen.goldCut, sheen.armorCut) },
    uSheenGold: { value: hexToVec3(sheen.goldColor) },
    uSheenArmor: { value: hexToVec3(sheen.armorColor) },
    uEmissive: { value: new THREE.Vector4(emissive.strength, emissive.glow, emissive.spareShade, emissive.whiteCore) },
    uSparkle: { value: new THREE.Vector4(sparkle.hot, sparkle.probability, sparkle.sizePx, sparkle.hotCut) },
    uSmear: { value: new THREE.Vector4(paint.confidence[0], paint.confidence[1], paint.sideways, paint.smearBlur) },
    uSharpen: { value: new THREE.Vector2(LOOK.sharpen.amount, LOOK.sharpen.radius) },
  };
}

export function createMaterialFactory(shared) {
  const white = pixelTexture(255, 255, 255, 255, THREE.SRGBColorSpace);
  const black = pixelTexture(0, 0, 0, 255, THREE.SRGBColorSpace);
  const flatNormal = pixelTexture(128, 128, 255);
  const openStyle = pixelTexture(255, 128, 0);
  const defaults = [white, black, flatNormal, openStyle];

  function create(source) {
    const color = source.color || new THREE.Color(1, 1, 1);
    const material = new THREE.ShaderMaterial({
      name: `painted:${source.name || ''}`,
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      side: source.side,
      uniforms: {
        ...shared,
        map: { value: source.map || white },
        emissiveMap: { value: source.emissiveMap || black },
        styleMap: { value: openStyle },
        toonNormalMap: { value: flatNormal },
        repairMap: { value: white },
        confMap: { value: white },
        uBaseColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
        uHasStyle: { value: 0 },
        uHasToonNormal: { value: 0 },
        uRepair: { value: 0 },
        uHasConf: { value: 0 },
        uSparkleCells: { value: 54 },
      },
    });
    material.userData.source = source;
    return material;
  }

  return {
    create,
    black,
    dispose() { for (const texture of defaults) texture.dispose(); },
  };
}
