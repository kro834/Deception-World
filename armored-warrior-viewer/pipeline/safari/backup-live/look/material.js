// Painted-texture-first material. One shader for every surface of the figure.
//
// The base-colour texture is the character sheet's painting projected onto the mesh: banded bronze
// gold, near-black scaled armour, blue-to-pink crystals, inked plate lines. Shown unlit it IS the
// picture, so it is shown unlit. Everything else is a layer on top, each with its own strength in
// tunables.js that can be set to zero:
//
//   sharpen   an unsharp mask in texture space, on real edges only; smeared paint is softened instead
//   grade     levels and saturation towards the sheet, hues kept
//   shadow    one cel shadow from one light: a band on the side away from the light (smoothed
//             normal), shadows cast by one part on another (shadow map), deep creases (baked AO);
//             hard-edged, and answered per paint: armour swaps between two planes, gold goes dark
//             bronze, crystal dark violet
//   sheen     small view-dependent glints from the Blender matcaps on gold and on dark enamel
//   glow      the authored emissive maps at a modest level, feeding a hue-preserving bloom and stars
//
// Outputs (two colour attachments):
//   0  rgb = display-referred colour, a = glow amount (feeds bloom)
//   1  rg  = smoothed view-space normal xy (debug only), b = how much the finish pass should flatten
//            here (smeared paint, crystal interiors), a = sparkle seed
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
uniform highp sampler2D shadowMap; // depth of the figure seen from the key light

uniform vec3 uBaseColor;      // base-colour factor (paint colour for untextured parts)
uniform float uHasStyle;
uniform float uHasToonNormal;
uniform float uRepair;        // share of the repainted copy (0 when there is none)
uniform float uHasConf;
uniform float uDevice;        // 1 on the belt hardware (buckle, clasp, strap): it keeps its own colours, no armour planes
uniform float uSparkleCells;
uniform float uDebug;
uniform float uOpaque;

uniform vec4 uGrade;          // black point, white point, gamma, saturation
uniform vec2 uShoulder;       // knee, value of painted white after the levels
uniform vec4 uSharpen;        // amount, radius (mip levels), local contrast below z = none, above w = all of it
uniform float uSharpenCrystal; // share of the sharpening that glowing crystal gets
uniform vec4 uSmear;          // conf below x = smeared, above y = crisp; z = weight of surfaces that face neither sheet; w = blur of smeared paint (mip levels)
uniform vec2 uCalm;           // how much the finish pass flattens smeared paint, and crystal interiors

uniform vec3 uKeyDir;         // towards the key light, view space
uniform float uSmoothNormal;  // share of the baked smoothed normal in the form
uniform vec4 uShadow;         // amount of the whole layer, band threshold, crease pull on the band, crease cut
uniform mat4 uShadowMatrix;   // view space -> shadow map (xy = uv, z = depth)
uniform vec4 uCast;           // cast strength (0 = no map), normal offset (world units), depth bias, 1 / map size
uniform vec3 uArmorLit;       // armour plane on the lit side
uniform vec3 uArmorShadow;    // armour plane in shadow
uniform vec2 uArmorPaint;     // how dark the drawn lines stay, how light the small painted highlights get
uniform vec3 uGoldShade;      // multiplied into gold in shadow
uniform vec3 uCrystalShade;   // multiplied into crystal in shadow
uniform vec3 uOtherShade;     // multiplied into everything else in shadow
uniform vec3 uCrystalShadow;  // cast-shadow share on crystal, emissive level where sparing starts, and where it is complete
uniform vec4 uSheen;          // gold strength, armour strength, gold cut, armour cut
uniform vec3 uSheenGold;
uniform vec3 uSheenArmor;
uniform vec4 uEmissive;       // brightening of glowing paint, glow fed to bloom, unused, white-core boost
uniform vec4 uSparkle;        // hot-point seed strength, random seed probability, size px, hot cut

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

// A hard step, one pixel wide at any zoom.
float aastep(float threshold, float value) {
  float w = fwidth(value) * 0.7 + 1e-5;
  return smoothstep(threshold - w, threshold + w, value);
}

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

float warmHue(float h) { return smoothstep(0.012, 0.04, h) * (1.0 - smoothstep(0.145, 0.185, h)); }

// How much of this point is hidden from the key light by another part of the figure: 0 none, 1 all.
// Nine depth taps weighted as a box two texels wide centred on the point, so the value changes
// smoothly across a shadow edge and one threshold on it gives a clean contour. (Plain texture reads
// and a comparison in the shader: no shadow sampler, no linear filtering of depth.)
float occlusion(vec3 viewPos, vec3 normal) {
  vec3 sc = (uShadowMatrix * vec4(viewPos + normal * uCast.y, 1.0)).xyz;
  vec2 q = sc.xy / uCast.w;
  vec2 f = fract(q);
  vec2 centre = (floor(q) + 0.5) * uCast.w;
  float reference = sc.z - uCast.z;
  float sum = 0.0;
  for (int y = -1; y <= 1; y++) {
    float wy = y == -1 ? 1.0 - f.y : (y == 0 ? 1.0 : f.y);
    for (int x = -1; x <= 1; x++) {
      float wx = x == -1 ? 1.0 - f.x : (x == 0 ? 1.0 : f.x);
      float nearest = textureLod(shadowMap, centre + vec2(float(x), float(y)) * uCast.w, 0.0).r;
      sum += step(nearest, reference) * wx * wy;
    }
  }
  return sum * 0.25;
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
    N = normalize(mix(Ng, baked, uSmoothNormal));
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
  // Smeared paint is softened in the texture itself.
  vec3 paintLinear = mix(crisp, textureLod(map, vUv, lod + uSmear.w).rgb, smear * step(0.001, uSmear.w));
  if (uRepair > 0.0) paintLinear = mix(paintLinear, texture(repairMap, vUv).rgb, uRepair);
  vec3 paint = toDisplay(paintLinear * uBaseColor);
  vec3 emis = toDisplay(texture(emissiveMap, vUv).rgb);
  float emisMax = max3(emis);
  float lit = smoothstep(0.1, 0.24, emisMax);                         // glowing crystal
  // Crisper paint: an unsharp mask in texture space (the difference to a blurrier level), gated by
  // local contrast so that it steepens real edges and leaves grain and soft gradients alone. Not on
  // smeared paint, and held back on glowing crystal, whose fine streaks it would only harden.
  vec3 detail = toDisplay(crisp * uBaseColor) - toDisplay(textureLod(map, vUv, lod + uSharpen.y).rgb * uBaseColor);
  float realEdge = smoothstep(uSharpen.z, uSharpen.w, max3(abs(detail)));
  paint = clamp(paint + detail * uSharpen.x * realEdge * (1.0 - smear) * mix(1.0, uSharpenCrystal, lit), 0.0, 1.0);
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

  // ---- what kind of paint is this? Soft gates; they decide how the paint answers shadow and sheen.
  //   crystal  glowing paint, and saturated blue-to-pink paint
  //   gold     warm paint down to dark brown, and pale highlights that sit in warm paint
  //   armour   dark colourless paint, and pale gloss that sits in dark colourless paint
  //   other    everything else (steel, emblems, deep blue): keeps its painted colour
  // "Sits in" is read from a much blurrier tap of the painting around the fragment.
  vec3 hsv = rgb2hsv(paint);
  vec3 around = rgb2hsv(toDisplay(textureLod(map, vUv, lod + 4.5).rgb * uBaseColor));
  float cool = smoothstep(0.55, 0.6, hsv.x) * (1.0 - smoothstep(0.93, 0.98, hsv.x)) * smoothstep(0.3, 0.45, hsv.y) * smoothstep(0.2, 0.35, hsv.z);
  float crystalGate = max(lit, cool) * (1.0 - uDevice);
  float goldPaint = warmHue(hsv.x) * smoothstep(0.15, 0.3, hsv.y) * smoothstep(0.08, 0.16, hsv.z);
  float pale = 1.0 - smoothstep(0.22, 0.4, hsv.y);
  float warmAround = warmHue(around.x) * smoothstep(0.1, 0.2, around.y) * smoothstep(0.15, 0.3, around.z);
  float goldGate = max(goldPaint, pale * warmAround * smoothstep(0.3, 0.5, hsv.z)) * (1.0 - crystalGate) * (1.0 - uDevice);
  // Dark and colourless (below a value of about 0.12 the hue of the paint means nothing: all armour).
  float dark = (1.0 - smoothstep(0.3, 0.45, hsv.z)) * max(1.0 - smoothstep(0.4, 0.6, hsv.y), 1.0 - smoothstep(0.1, 0.16, hsv.z));
  float gloss = pale * (1.0 - smoothstep(0.25, 0.4, around.y)) * (1.0 - smoothstep(0.4, 0.6, around.z));
  float armorGate = max(dark, gloss) * (1.0 - crystalGate) * (1.0 - goldGate) * (1.0 - uDevice);
  float otherGate = saturate(1.0 - crystalGate - goldGate - armorGate);

  // ---- 3. shadow: one light, hard edges -----------------------------------------------------------
  // band   the side of every form that turns away from the light (creases pull it further in)
  // cast   what another part of the figure hides from the light
  // inner  deep creases
  float key = dot(N, uKeyDir) * 0.5 + 0.5;
  float band = 1.0 - aastep(uShadow.y + (1.0 - ao) * uShadow.z, key);
  float hidden = uCast.x > 0.0 ? occlusion(vViewPos, Ng) : 0.0;
  float castMask = aastep(0.5, hidden) * uCast.x;
  float inner = (1.0 - aastep(uShadow.w, ao)) * uHasStyle;
  float shadow = max(band, max(castMask, inner)) * uShadow.x;
  // Crystal takes the band and only part of the cast shadows; its glowing cores take none.
  float crystalShadow = max(band, castMask * uCrystalShadow.x) * (1.0 - smoothstep(uCrystalShadow.y, uCrystalShadow.z, emisMax)) * uShadow.x;

  // Armour: two planes with a hard border, lit navy-grey and blue-black, so that the shadow shapes
  // can be seen on black at all. The painted light survives only as local contrast against the
  // paint just around it: darker is a drawn line (or a thin gap between other paints) and stays
  // dark, lighter is a small highlight. Broad painted gloss and broad dark patches become the plane.
  float nearLuma = luma(toDisplay(textureLod(map, vUv, lod + 3.0).rgb * uBaseColor));
  float against = (paintLuma - nearLuma) / max(nearLuma, 0.05);
  float tone = 1.0 - uArmorPaint.x * smoothstep(0.05, 0.45, -against) + uArmorPaint.y * smoothstep(0.1, 0.9, against);
  vec3 armor = mix(uArmorLit, uArmorShadow, shadow) * tone;
  color = mix(color, armor, armorGate * uShadow.x);
  color *= mix(vec3(1.0), uGoldShade, shadow * goldGate);
  color *= mix(vec3(1.0), uCrystalShade, crystalShadow * crystalGate);
  color *= mix(vec3(1.0), uOtherShade, shadow * otherGate);

  // ---- 4. metal that lives: small, sharp glints of the Blender matcaps, on the lit side only ------
  vec2 muv = matcapUv(N, V);
  float goldGlint = smoothstep(uSheen.z, uSheen.z + 0.03, luma(toDisplay(texture(matcapGold, muv).rgb)));
  float armorGlint = smoothstep(uSheen.w, uSheen.w + 0.03, luma(toDisplay(texture(matcapArmor, muv).rgb)));
  vec3 sheen = (uSheenGold * goldGlint * uSheen.x * goldGate + uSheenArmor * armorGlint * uSheen.y * armorGate) * (1.0 - shadow);
  color += sheen;

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
    else if (uDebug < 2.5) color = vec3(goldGate, crystalGate, armorGate);
    else if (uDebug < 3.5) color = vec3(key);
    else if (uDebug < 4.5) color = N * 0.5 + 0.5;
    else if (uDebug < 5.5) color = emis;
    else if (uDebug < 6.5) color = sheen * 4.0;
    else if (uDebug < 7.5) color = vec3(glow, sparkle, hot);
    else if (uDebug < 8.5) color = vec3(conf, smear, sideways);
    else if (uDebug < 9.5) color = vec3(0.93 - 0.7 * max(band, max(castMask, inner)));   // the shadow mask alone
    else color = vec3(0.12) + vec3(band, castMask, inner) * 0.85;                         // its three parts
    glow = 0.0;
    sparkle = 0.0;
  }

  outColor = vec4(clamp(color, 0.0, 1.0), max(clamp(glow, 0.0, 1.0), uOpaque));
  // Where the finish pass should flatten whatever it finds: smeared paint, and the inside of glowing
  // crystal (its fine streaks), but never the painted star centres and orb cores.
  float flatten = max(smear * uCalm.x, lit * (1.0 - hot) * uCalm.y);
  outAux = vec4(N.xy * 0.5 + 0.5, clamp(flatten, 0.0, 1.0), clamp(sparkle, 0.0, 1.0));
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
  const { grade, shadow, armor, sheen, emissive, sparkle, paint } = LOOK;
  // Stand-in shadow map: a depth of 1 everywhere, so nothing is ever nearer the light.
  const noShadow = pixelTexture(255, 255, 255, 255);
  return {
    matcapGold: { value: null },
    matcapArmor: { value: null },
    shadowMap: { value: noShadow },
    uDebug: { value: 0 },
    uOpaque: { value: 0 },
    uGrade: { value: new THREE.Vector4(grade.blackPoint, grade.whitePoint, grade.gamma, grade.saturation) },
    uShoulder: { value: new THREE.Vector2(0.8, Math.max(1, ((1 - grade.blackPoint) / (grade.whitePoint - grade.blackPoint)) ** grade.gamma)) },
    uSharpen: { value: new THREE.Vector4(LOOK.sharpen.amount, LOOK.sharpen.radius, LOOK.sharpen.edge[0], LOOK.sharpen.edge[1]) },
    uSharpenCrystal: { value: LOOK.sharpen.crystal },
    uSmear: { value: new THREE.Vector4(paint.confidence[0], paint.confidence[1], paint.sideways, paint.smearBlur) },
    uCalm: { value: new THREE.Vector2(paint.smeared, paint.crystal) },
    uKeyDir: { value: dir(shadow.key) },
    uSmoothNormal: { value: shadow.smoothNormal },
    uShadow: { value: new THREE.Vector4(shadow.amount, shadow.band, shadow.creasePull, shadow.creaseCut) },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uCast: { value: new THREE.Vector4(0, shadow.castOffset, 0.001, 1) },
    uArmorLit: { value: hexToVec3(armor.lit) },
    uArmorShadow: { value: hexToVec3(armor.shadow) },
    uArmorPaint: { value: new THREE.Vector2(armor.lines, armor.gloss) },
    uGoldShade: { value: hexToVec3(shadow.gold) },
    uCrystalShade: { value: hexToVec3(shadow.crystal) },
    uOtherShade: { value: hexToVec3(shadow.other) },
    uCrystalShadow: { value: new THREE.Vector3(shadow.crystalCast, shadow.crystalSpare[0], shadow.crystalSpare[1]) },
    uSheen: { value: new THREE.Vector4(sheen.gold, sheen.armor, sheen.goldCut, sheen.armorCut) },
    uSheenGold: { value: hexToVec3(sheen.goldColor) },
    uSheenArmor: { value: hexToVec3(sheen.armorColor) },
    uEmissive: { value: new THREE.Vector4(emissive.strength, emissive.glow, 0, emissive.whiteCore) },
    uSparkle: { value: new THREE.Vector4(sparkle.hot, sparkle.probability, sparkle.sizePx, sparkle.hotCut) },
  };
}

export function createMaterialFactory(shared) {
  const white = pixelTexture(255, 255, 255, 255, THREE.SRGBColorSpace);
  const black = pixelTexture(0, 0, 0, 255, THREE.SRGBColorSpace);
  const flatNormal = pixelTexture(128, 128, 255);
  const openStyle = pixelTexture(255, 128, 0);
  const noShadow = shared.shadowMap.value;
  const defaults = [white, black, flatNormal, openStyle, noShadow];

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
        uDevice: { value: 0 },
        uSparkleCells: { value: 54 },
      },
    });
    material.userData.source = source;
    return material;
  }

  return {
    create,
    black,
    noShadow,
    dispose() { for (const texture of defaults) texture.dispose(); },
  };
}
