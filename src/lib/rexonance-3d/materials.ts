import * as THREE from "three";
import type { RexonanceFamily } from "./contract.ts";

/** Uniforms every Rexonance material shares (one object each, updated once per frame). */
export type RexonanceUniforms = {
  rxTime: { value: number };
  /** -1..1 breathing phase times the motion amount. */
  rxBreath: { value: number };
  /** 0 with reduced motion or paused: no flutter, no twinkle. */
  rxMotion: { value: number };
  /** -1..1, the core's slow pulse. */
  rxPulse: { value: number };
  /** The model root's world matrix, its inverse, and root -> view rotation. */
  rxRootMatrix: { value: THREE.Matrix4 };
  rxRootInverse: { value: THREE.Matrix4 };
  rxRootToView: { value: THREE.Matrix3 };
  /** Model height (metres) and chest centre (root space), for the breathing band. */
  rxHeight: { value: number };
  rxChest: { value: THREE.Vector3 };
  /** The tileable scale normal map (RGB normal, A cavity) and its tile size in metres. */
  rxScaleMap: { value: THREE.Texture | null };
  rxScaleTile: { value: number };
};

export function createRexonanceUniforms(): RexonanceUniforms {
  return {
    rxTime: { value: 0 },
    rxBreath: { value: 0 },
    rxMotion: { value: 1 },
    rxPulse: { value: 0 },
    rxRootMatrix: { value: new THREE.Matrix4() },
    rxRootInverse: { value: new THREE.Matrix4() },
    rxRootToView: { value: new THREE.Matrix3() },
    rxHeight: { value: 2 },
    rxChest: { value: new THREE.Vector3(0, 1.36, 0.02) },
    rxScaleMap: { value: null },
    // Five scales across a tile: about 2 cm wide and 3.5 cm tall, as on the sheet's legs.
    rxScaleTile: { value: 0.11 },
  };
}

export type RexonanceMaterialOptions = {
  /** RX_Ribbon_* meshes: flutter in the vertex shader, growing toward uv.y = 1. */
  ribbon?: boolean;
  /** Per-mesh phase so neighbouring ribbons do not move as one sheet. */
  phase?: number;
  /** 2 adds the crystals' star specks under the surface; 1 keeps shards and sparkles only. */
  crystalDetail?: 1 | 2;
  /** The scale map is bound (otherwise the suit is smooth lacquer). */
  scales?: boolean;
};

// ------------------------------------------------------------------ shared GLSL
const COMMON_PARS = /* glsl */ `
uniform mat4 rxRootMatrix;
uniform mat4 rxRootInverse;
uniform mat3 rxRootToView;
uniform float rxTime;
uniform float rxBreath;
uniform float rxMotion;
uniform float rxPulse;
uniform float rxHeight;
uniform vec3 rxChest;
varying vec3 vRxRoot;
varying vec3 vRxRootNormal;
`;

const HASH = /* glsl */ `
float rxHash13( vec3 p3 ) {
  p3 = fract( p3 * 0.1031 );
  p3 += dot( p3, p3.zyx + 31.32 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
vec3 rxHash33( vec3 p3 ) {
  p3 = fract( p3 * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yxz + 33.33 );
  return fract( ( p3.xxy + p3.yxx ) * p3.zyx );
}
float rxHash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
vec2 rxHash22( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.xx + p3.yz ) * p3.zy );
}
vec3 rxHash32( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  p3 += dot( p3, p3.yxz + 33.33 );
  return fract( ( p3.xxy + p3.yzz ) * p3.zyx );
}
float rxNoise3( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( rxHash13( i ), rxHash13( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
         mix( rxHash13( i + vec3( 0.0, 1.0, 0.0 ) ), rxHash13( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
    mix( mix( rxHash13( i + vec3( 0.0, 0.0, 1.0 ) ), rxHash13( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
         mix( rxHash13( i + vec3( 0.0, 1.0, 1.0 ) ), rxHash13( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
    f.z );
}
// F1 and F2 of a jittered 2D cell grid, and the nearest cell.
vec2 rxVoronoi2( vec2 p, out vec2 nearest ) {
  vec2 b = floor( p );
  vec2 f = fract( p );
  float f1 = 8.0;
  float f2 = 8.0;
  nearest = b;
  for ( int j = -1; j <= 1; j++ )
  for ( int i = -1; i <= 1; i++ ) {
    vec2 o = vec2( float( i ), float( j ) );
    vec2 r = o + 0.1 + 0.8 * rxHash22( b + o ) - f;
    float d = dot( r, r );
    if ( d < f1 ) { f2 = f1; f1 = d; nearest = b + o; }
    else if ( d < f2 ) { f2 = d; }
  }
  return vec2( sqrt( f1 ), sqrt( f2 ) );
}
// One point per cell (kept off the cell's faces): 1 at the point, 0 beyond radius.
float rxStar( vec3 p, float density, float radius, out float seed ) {
  vec3 cell = floor( p );
  seed = rxHash13( cell + 17.0 );
  if ( rxHash13( cell ) > density ) return 0.0;
  vec3 c = 0.25 + 0.5 * rxHash33( cell + 3.0 );
  float d = length( fract( p ) - c );
  return 1.0 - smoothstep( 0.0, radius, d );
}
`;

// Replaces project_vertex: root-space varyings, ribbon flutter and breathing, all as smooth
// functions of the undeformed root-space position, so shared edges never open.
const PROJECT_VERTEX = /* glsl */ `
vec4 rxWorld = modelMatrix * vec4( transformed, 1.0 );
vec3 rxRoot = ( rxRootInverse * rxWorld ).xyz;
vRxRoot = rxRoot;
vRxRootNormal = normalize( mat3( rxRootInverse ) * inverseTransformDirection( transformedNormal, viewMatrix ) );
vec3 rxShift = vec3( 0.0 );
#ifdef RX_RIBBON
  float rxV = clamp( uv.y, 0.0, 1.0 );
  float rxW = rxV * rxV * ( 3.0 - 2.0 * rxV );
  rxShift += vec3(
    sin( rxTime * 1.37 + rxRoot.y * 5.1 + rxRibbonPhase ) * 0.026,
    sin( rxTime * 0.83 + rxRoot.y * 3.3 + rxRibbonPhase * 2.1 ) * 0.005,
    sin( rxTime * 1.11 + rxRoot.y * 4.3 + rxRibbonPhase * 1.7 ) * 0.038 ) * rxW * rxMotion;
#endif
float rxH = rxRoot.y / max( rxHeight, 0.01 );
float rxBand = smoothstep( 0.49, 0.62, rxH ) * ( 1.0 - smoothstep( 0.75, 0.87, rxH ) );
vec3 rxFromChest = rxRoot - rxChest;
float rxInside = ( 1.0 - smoothstep( 0.17, 0.33, abs( rxFromChest.x ) ) )
  * ( 1.0 - smoothstep( 0.14, 0.3, abs( rxFromChest.z ) ) );
rxShift += vec3( rxFromChest.x * 0.012, 0.0, rxFromChest.z * 0.03 ) * rxBand * rxInside * rxBreath;
rxShift.y += 0.0032 * smoothstep( 0.52, 0.8, rxH ) * rxBreath;
rxWorld.xyz += mat3( rxRootMatrix ) * rxShift;
vec4 mvPosition = viewMatrix * rxWorld;
gl_Position = projectionMatrix * mvPosition;
`;

// The triplanar scale normal: the tile is projected along the root X, Y and Z axes (v up
// the suit on the side projections, so every scale points down), each projection's
// tangent frame built so no side shows the pattern mirrored, blended by |N|^4.
const SCALE_FRAGMENT = /* glsl */ `
#ifdef RX_SCALES
{
  vec3 rxN = normalize( vRxRootNormal );
  vec3 rxW = pow( abs( rxN ), vec3( 4.0 ) );
  rxW /= max( dot( rxW, vec3( 1.0 ) ), 1e-4 );
  vec3 rxS = vec3( rxN.x < 0.0 ? -1.0 : 1.0, rxN.y < 0.0 ? -1.0 : 1.0, rxN.z < 0.0 ? -1.0 : 1.0 );
  vec3 rxP = vRxRoot / rxScaleTile;
  vec4 rxTX = texture2D( rxScaleMap, vec2( -rxP.z * rxS.x, rxP.y ) );
  vec4 rxTY = texture2D( rxScaleMap, vec2( rxP.x, -rxP.z * rxS.y ) );
  vec4 rxTZ = texture2D( rxScaleMap, vec2( rxP.x * rxS.z, rxP.y ) );
  vec2 rxDX = ( rxTX.xy * 2.0 - 1.0 ) * rxScaleStrength;
  vec2 rxDY = ( rxTY.xy * 2.0 - 1.0 ) * rxScaleStrength;
  vec2 rxDZ = ( rxTZ.xy * 2.0 - 1.0 ) * rxScaleStrength;
  vec3 rxPert = rxW.x * ( rxDX.x * vec3( 0.0, 0.0, -rxS.x ) + rxDX.y * vec3( 0.0, 1.0, 0.0 ) )
    + rxW.y * ( rxDY.x * vec3( 1.0, 0.0, 0.0 ) + rxDY.y * vec3( 0.0, 0.0, -rxS.y ) )
    + rxW.z * ( rxDZ.x * vec3( rxS.z, 0.0, 0.0 ) + rxDZ.y * vec3( 0.0, 1.0, 0.0 ) );
  normal = normalize( normal + rxRootToView * rxPert );
  rxCavity = rxTX.a * rxW.x + rxTY.a * rxW.y + rxTZ.a * rxW.z;
  diffuseColor.rgb *= mix( 0.35, 1.0, rxCavity );
}
#endif
`;

// Fine shards in the blade's own (u, v): about seven across and two dozen along, skewed so
// the cells run as long diagonal splinters down the blade.
const CRYSTAL_NORMAL = /* glsl */ `
vec2 rxShardCell;
vec2 rxShardF = rxVoronoi2( vec2( vRxUv.x * 7.0 + vRxUv.y * 5.0, vRxUv.y * 24.0 ), rxShardCell );
float rxShard = rxHash12( rxShardCell );
// Each shard leans a little its own way, so the room's strips break across them.
normal = normalize( normal + rxRootToView * ( rxHash32( rxShardCell ) - 0.5 ) * 0.32 );
`;

// The sheet's crystal: a cobalt and royal blue body that deepens to navy down its middle
// (with fine star specks there), luminous blue toward its edges, a thin bright rim, cut
// edges that catch light, and pink only toward the tip and in the rim. COLOR_0: r pink
// bias (0 keeps the blue, 1 is pink throughout), g sparkle density, b edge glow.
const CRYSTAL_EMISSIVE = /* glsl */ `
{
  vec3 RX_ROYAL = vec3( 0.022, 0.09, 1.0 );
  vec3 RX_COBALT = vec3( 0.07, 0.2, 1.0 );
  vec3 RX_NAVY = vec3( 0.0033, 0.008, 0.08 );
  vec3 RX_CYAN = vec3( 0.52, 0.79, 1.0 );
  vec3 RX_PINK = vec3( 1.0, 0.114, 0.63 );
  vec3 RX_VIOLET = vec3( 0.32, 0.07, 1.0 );
  float rxU = clamp( vRxUv.x, 0.0, 1.0 );
  float rxVv = clamp( vRxUv.y, 0.0, 1.0 );
  // The pink bias only shows past the middle of its range: the authored 0.25-0.5 stay blue.
  float rxBias = smoothstep( 0.55, 1.0, vRxTint.r );
  float rxSparkle = vRxTint.g;
  float rxEdgeGlow = vRxTint.b;
  float rxAcross = min( rxU, 1.0 - rxU ) * 2.0;
  float rxRim = 1.0 - smoothstep( 0.0, 0.08, rxAcross );
  float rxBand = 1.0 - smoothstep( 0.04, 0.42, rxAcross );
  float rxInterior = smoothstep( 0.3, 0.92, rxAcross );
  float rxTip = max( smoothstep( 0.74, 0.98, rxVv ), rxBias * 0.9 );
  float rxViolet = smoothstep( 0.6, 0.76, rxVv ) * ( 1.0 - rxTip );
  vec3 rxCol = mix( RX_ROYAL, RX_COBALT, rxBand * 0.7 );
  rxCol = mix( rxCol, RX_NAVY, rxInterior * 0.55 );
  rxCol = mix( rxCol, RX_VIOLET, rxViolet * 0.5 );
  rxCol = mix( rxCol, RX_PINK, rxTip * ( 0.55 + 0.4 * rxBand ) );
  rxCol *= 0.92 + 0.16 * rxShard;
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  float rxFres = pow( 1.0 - rxNdV, 3.0 );
  // Cut edges: light refracting at each shard's edge, soft and bright, never a dark line.
  float rxEdgeD = rxShardF.y - rxShardF.x;
  float rxAA = fwidth( rxEdgeD ) + 1e-4;
  float rxCut = 1.0 - smoothstep( 0.0, 0.07 + rxAA, rxEdgeD );
  vec3 rxEmit = rxCol * 0.5;
  rxEmit += RX_CYAN * rxCut * ( 0.1 + 0.26 * rxBand );
  // Long cyan-white streaks down the blade.
  float rxStreak = smoothstep( 0.66, 0.86, rxNoise3( vec3( rxU * 8.0, rxVv * 1.4, 11.0 ) ) );
  rxEmit += mix( RX_CYAN, RX_PINK, rxTip * 0.7 ) * rxStreak * ( 0.2 + 0.45 * rxBand );
  // The thin rim: a pink outline down the blade (its edge glow sets how pink), full at the tip.
  rxEmit += mix( RX_COBALT * 1.2, RX_PINK, max( rxTip, 0.45 + 0.4 * rxEdgeGlow ) ) * rxRim * ( 0.5 + 0.9 * rxEdgeGlow );
#if RX_CRYSTAL_DETAIL > 1
  // The navy interior's star specks, a little under the surface (parallax).
  vec3 rxVRoot = normalize( transpose( rxRootToView ) * rxV );
  vec3 rxQ = vRxRoot - rxVRoot * 0.01;
  float rxSeedA;
  float rxSpeck = rxStar( rxQ * 340.0, 0.2, 0.22, rxSeedA );
  rxEmit += mix( RX_CYAN, vec3( 1.0 ), rxSeedA ) * rxSpeck * rxInterior * 0.8;
#endif
  float rxSeedB;
  float rxSpark = rxStar( vRxRoot * 110.0, 0.015 + 0.06 * rxSparkle, 0.14, rxSeedB );
  float rxTw = 0.5 + 0.5 * sin( rxTime * ( 0.9 + 1.6 * rxSeedB ) + rxSeedB * 40.0 );
  rxSpark *= mix( 0.25, pow( rxTw, 6.0 ) * 1.4, rxMotion );
  rxEmit += mix( vec3( 0.85, 0.94, 1.0 ), vec3( 1.0, 0.8, 0.95 ), rxSeedB ) * rxSpark * 3.2;
  rxEmit += mix( RX_COBALT, RX_PINK, rxTip ) * rxFres * 0.3;
  totalEmissiveRadiance += rxEmit;
  diffuseColor.rgb = rxCol * 0.05;
}
`;

// A cut jewel: deep blue-violet facets, each its own tint, and a small white-hot centre (the
// one part of it bright enough to bloom).
const GEM_EMISSIVE = /* glsl */ `
{
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  float rxFacet = rxHash13( floor( normalize( vRxRootNormal ) * 7.0 + 0.5 ) );
  vec3 rxHue = mix( vec3( 0.06, 0.2, 1.0 ), vec3( 0.55, 0.16, 1.0 ), rxFacet );
  vec3 rxEmit = rxHue * ( 0.12 + 0.55 * pow( rxNdV, 2.0 ) ) + vec3( 0.95, 0.95, 1.0 ) * pow( rxNdV, 26.0 ) * 4.0;
  totalEmissiveRadiance += rxEmit * ( 1.0 + 0.08 * rxPulse );
}
`;

// The chest core and buckle orb: a white-hot heart (blooms), blue around it, pink at the rim.
const GLOW_EMISSIVE = /* glsl */ `
{
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  vec3 rxCore = mix( vec3( 0.12, 0.3, 1.0 ) * 0.8, vec3( 1.0, 0.92, 1.0 ) * 4.2, pow( rxNdV, 4.0 ) );
  rxCore = mix( rxCore, vec3( 1.0, 0.25, 0.75 ), pow( 1.0 - rxNdV, 2.0 ) * 0.5 );
  totalEmissiveRadiance += rxCore * ( 1.0 + 0.16 * rxPulse );
}
`;

// The V eyes: pink lines with a hot white centre line, blue at the edges.
const VISOR_EMISSIVE = /* glsl */ `
{
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  vec3 rxC = mix( vec3( 0.2, 0.4, 1.0 ), vec3( 1.0, 0.18, 0.7 ), smoothstep( 0.12, 0.7, rxNdV ) ) * 1.6;
  rxC = mix( rxC, vec3( 1.0, 0.85, 1.0 ) * 4.5, pow( rxNdV, 10.0 ) * 0.7 );
  totalEmissiveRadiance += rxC;
}
`;

type Look = {
  params: THREE.MeshPhysicalMaterialParameters;
  emissive?: string;
  /** Strength of the triplanar scales (0 = none). */
  scales?: number;
  /** How far the clear coat follows the scales (0 = a mirror-smooth coat over them). */
  coatFollow?: number;
};

const srgb = (hex: number) => new THREE.Color(hex);

const LOOKS: Record<RexonanceFamily, Look> = {
  // Black with visible scales: each scale's upper rim catches the strips, the coat over it
  // breaks the long highlights into scale-shaped pieces.
  Suit: {
    params: {
      color: new THREE.Color().setRGB(0.01, 0.01, 0.013),
      roughness: 0.3,
      specularIntensity: 0.8,
      clearcoat: 0.8,
      clearcoatRoughness: 0.06,
    },
    scales: 0.95,
    coatFollow: 0.35,
  },
  // Mirror-black lacquer: crisp white strips; a faint scale texture under the smooth coat.
  Black: {
    params: {
      color: new THREE.Color().setRGB(0.004, 0.004, 0.005),
      roughness: 0.16,
      specularIntensity: 0.7,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    },
    scales: 0.3,
  },
  // Polished champagne bronze (#cf9a62): on screen its median matches front-10's gold
  // (~192/136/87); its highlights are its own colour, never white.
  Gold: {
    params: { color: srgb(0xcf9a62), metalness: 1, roughness: 0.2 },
  },
  GoldDark: {
    params: { color: srgb(0x7e5230), metalness: 1, roughness: 0.3 },
  },
  Silver: {
    params: { color: srgb(0xdfe2ea), metalness: 1, roughness: 0.16 },
  },
  Crystal: {
    params: {
      color: new THREE.Color().setRGB(0.01, 0.02, 0.08),
      roughness: 0.1,
      specularIntensity: 0.6,
      clearcoat: 0.7,
      clearcoatRoughness: 0.05,
      envMapIntensity: 0.6,
      side: THREE.DoubleSide,
    },
    emissive: CRYSTAL_EMISSIVE,
  },
  Gem: {
    params: {
      color: new THREE.Color().setRGB(0.03, 0.06, 0.35),
      roughness: 0.03,
      ior: 2.2,
      specularIntensity: 0.7,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      iridescence: 0.5,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [220, 760],
      envMapIntensity: 0.7,
    },
    emissive: GEM_EMISSIVE,
  },
  Glow: {
    params: { color: new THREE.Color().setRGB(0.2, 0.2, 0.3), roughness: 0.18, clearcoat: 1 },
    emissive: GLOW_EMISSIVE,
  },
  Visor: {
    params: {
      color: new THREE.Color().setRGB(0.1, 0.03, 0.08),
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    },
    emissive: VISOR_EMISSIVE,
  },
  Dark: {
    params: { color: new THREE.Color().setRGB(0.004, 0.004, 0.005), roughness: 0.6 },
  },
};

/** One material per mesh (the per-mesh ribbon phase lives in its own uniform); programs are
 * still shared through the cache key. */
export function createRexonanceMaterial(
  family: RexonanceFamily,
  uniforms: RexonanceUniforms,
  options: RexonanceMaterialOptions = {},
) {
  const look = LOOKS[family];
  const material = new THREE.MeshPhysicalMaterial({ ...look.params });
  material.name = `RX_${family}`;
  const ribbon = Boolean(options.ribbon);
  const crystal = family === "Crystal";
  const scales = Boolean(options.scales) && (look.scales ?? 0) > 0;
  const coatFollow = scales ? (look.coatFollow ?? 0) : 0;
  const detail = options.crystalDetail ?? 2;
  const ribbonPhase = { value: options.phase ?? 0 };
  const scaleStrength = { value: look.scales ?? 0 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      rxRibbonPhase: ribbonPhase,
      rxScaleStrength: scaleStrength,
    });
    shader.defines = { ...shader.defines };
    if (ribbon) shader.defines.RX_RIBBON = "";
    if (scales) shader.defines.RX_SCALES = "";
    if (crystal) shader.defines.RX_CRYSTAL_DETAIL = String(detail);
    let vertex = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>\n${COMMON_PARS}\n${
        ribbon ? "uniform float rxRibbonPhase;\n" : ""
      }${crystal ? "attribute vec4 rxTint;\nvarying vec4 vRxTint;\nvarying vec2 vRxUv;\n" : ""}`,
    );
    vertex = vertex.replace("#include <project_vertex>", PROJECT_VERTEX);
    if (crystal)
      vertex = vertex.replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvRxTint = rxTint;\nvRxUv = uv;",
      );
    shader.vertexShader = vertex;

    let fragment = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${COMMON_PARS}\n${HASH}\nuniform sampler2D rxScaleMap;\nuniform float rxScaleTile;\nuniform float rxScaleStrength;\n${
        crystal ? "varying vec4 vRxTint;\nvarying vec2 vRxUv;\n" : ""
      }`,
    );
    fragment = fragment.replace(
      "vec3 totalEmissiveRadiance = emissive;",
      "vec3 totalEmissiveRadiance = emissive;\nfloat rxCavity = 1.0;",
    );
    fragment = fragment.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>\n${SCALE_FRAGMENT}\n${crystal ? CRYSTAL_NORMAL : ""}`,
    );
    if (coatFollow > 0)
      fragment = fragment.replace(
        "#include <clearcoat_normal_fragment_begin>",
        `#ifdef USE_CLEARCOAT\n  vec3 clearcoatNormal = normalize( mix( nonPerturbedNormal, normal, ${coatFollow.toFixed(2)} ) );\n#endif`,
      );
    if (look.emissive)
      fragment = fragment.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${look.emissive}`,
      );
    // The seams between scales hold less of the room's light. Then every reflection is
    // capped (by luminance, so gold stays gold): a lit surface can never reach the bloom
    // threshold, only emission blooms. Without it a directional light's pin-point peak on
    // mirror lacquer or polished gold flared into a white blob.
    fragment = fragment.replace(
      "#include <aomap_fragment>",
      `#include <aomap_fragment>
reflectedLight.indirectSpecular *= mix( 0.3, 1.0, rxCavity );
reflectedLight.directSpecular *= mix( 0.45, 1.0, rxCavity );
{
  // A soft knee: dim reflections pass unchanged, bright ones level out under 1.4.
  const vec3 RX_LUMA = vec3( 0.2126, 0.7152, 0.0722 );
  vec3 rxSpec = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  float rxL = dot( rxSpec, RX_LUMA ) / 1.4;
  float rxK = inversesqrt( 1.0 + rxL * rxL );
  reflectedLight.directSpecular *= rxK;
  reflectedLight.indirectSpecular *= rxK;
#ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= mix( 0.6, 1.0, rxCavity );
  float rxLc = dot( clearcoatSpecularDirect + clearcoatSpecularIndirect, RX_LUMA ) / 1.4;
  float rxKc = inversesqrt( 1.0 + rxLc * rxLc );
  clearcoatSpecularDirect *= rxKc;
  clearcoatSpecularIndirect *= rxKc;
#endif
}`,
    );
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () =>
    `rx3d-v3-${family}-${ribbon ? "r" : ""}${scales ? "s" : ""}${crystal ? detail : ""}`;
  return material;
}
