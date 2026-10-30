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
  rxScaleStrength: { value: number };
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
    rxScaleTile: { value: 0.16 },
    rxScaleStrength: { value: 0.5 },
  };
}

export type RexonanceMaterialOptions = {
  /** RX_Ribbon_* meshes: flutter in the vertex shader, growing toward uv.y = 1. */
  ribbon?: boolean;
  /** Per-mesh phase so neighbouring ribbons do not move as one sheet. */
  phase?: number;
  /** 2 adds the crystals' inner galaxy layer; 1 keeps facets and sparkles only. */
  crystalDetail?: 1 | 2;
  /** The scale map is ready (otherwise the suit is smooth lacquer). */
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
// F1 and F2 of a jittered 3D cell grid, and the nearest cell.
vec2 rxVoronoi( vec3 p, out vec3 nearest ) {
  vec3 b = floor( p );
  vec3 f = fract( p );
  float f1 = 8.0;
  float f2 = 8.0;
  nearest = b;
  for ( int k = -1; k <= 1; k++ )
  for ( int j = -1; j <= 1; j++ )
  for ( int i = -1; i <= 1; i++ ) {
    vec3 o = vec3( float( i ), float( j ), float( k ) );
    vec3 r = o + 0.08 + 0.84 * rxHash33( b + o ) - f;
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

const CRYSTAL_NORMAL = /* glsl */ `
vec3 rxCell;
vec2 rxF = rxVoronoi( vRxRoot * rxFacetDensity, rxCell );
float rxFacet = rxHash13( rxCell );
// Each facet leans its own way, so the env map breaks into cut planes.
normal = normalize( normal + rxRootToView * ( rxHash33( rxCell + 7.0 ) - 0.5 ) * 0.55 );
`;

const CRYSTAL_EMISSIVE = /* glsl */ `
{
  vec3 RX_BLUE = vec3( 0.0, 0.24, 1.0 );
  vec3 RX_VIOLET = vec3( 0.2, 0.08, 1.0 );
  vec3 RX_PINK = vec3( 1.0, 0.1, 0.5 );
  vec3 RX_HOT = vec3( 1.0, 0.3, 0.7 );
  vec3 RX_ICE = vec3( 0.4, 0.85, 1.0 );
  vec3 RX_NAVY = vec3( 0.003, 0.006, 0.045 );
  float rxU = clamp( vRxUv.x, 0.0, 1.0 );
  float rxVv = clamp( vRxUv.y, 0.0, 1.0 );
  float rxPinkBias = vRxTint.r;
  float rxSparkle = vRxTint.g;
  float rxEdgeGlow = vRxTint.b;
  // Blue holds the root half, violet comes in past the middle, pink only toward the tip;
  // the pink bias then mixes toward pink throughout (1 = pink everywhere, README).
  vec3 rxCol = mix( RX_BLUE, RX_VIOLET, smoothstep( 0.4, 0.82, rxVv ) );
  rxCol = mix( rxCol, RX_PINK, smoothstep( 0.72, 1.0, rxVv ) );
  float rxPinkMix = clamp( rxPinkBias * rxPinkBias * 0.7, 0.0, 1.0 );
  rxCol = mix( rxCol, RX_PINK, rxPinkMix );
  float rxG = max( smoothstep( 0.45, 1.0, rxVv ), rxPinkMix );
  float rxEdge = 1.0 - smoothstep( 0.0, 0.12, min( rxU, 1.0 - rxU ) );
  rxCol = mix( rxCol, RX_HOT, rxEdge * ( 0.2 + 0.4 * rxEdgeGlow ) );
  rxCol *= 0.8 + 0.4 * rxFacet;
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  float rxFres = pow( 1.0 - rxNdV, 3.0 );
  float rxLineD = rxF.y - rxF.x;
  float rxAA = fwidth( rxLineD ) + 1e-4;
  float rxLine = 1.0 - smoothstep( 0.02 - rxAA, 0.02 + rxAA, rxLineD );
  // The network shows in patches, as the sheet's facets catch the light, not as a mesh.
  rxLine *= 0.2 + 0.8 * smoothstep( 0.35, 0.75, rxNoise3( vRxRoot * 9.0 + 3.1 ) );
  vec3 rxEmit = rxCol * 0.42;
#if RX_CRYSTAL_DETAIL > 1
  // The inner layer, a little under the surface (parallax): navy clouds and still specks.
  vec3 rxVRoot = normalize( transpose( rxRootToView ) * rxV );
  vec3 rxQ = vRxRoot - rxVRoot * 0.012;
  float rxCloud = rxNoise3( rxQ * 23.0 ) * 0.6 + rxNoise3( rxQ * 61.0 ) * 0.4;
  float rxNavy = smoothstep( 0.38, 0.72, rxCloud );
  rxEmit = mix( rxEmit, RX_NAVY, rxNavy * 0.85 );
  float rxSeedA;
  float rxSpeck = rxStar( rxQ * 260.0, 0.22, 0.2, rxSeedA );
  rxEmit += mix( RX_ICE, vec3( 1.0 ), rxSeedA ) * rxSpeck * ( 0.4 + rxNavy ) * 1.2;
#endif
  rxEmit += mix( vec3( 0.45, 0.85, 1.0 ), RX_HOT, rxG * 0.8 ) * rxLine * ( 0.95 + 0.9 * rxEdge );
  rxEmit += RX_HOT * rxEdge * rxEdgeGlow * 0.45;
  float rxSeedB;
  float rxSpark = rxStar( vRxRoot * 85.0, 0.03 + 0.2 * rxSparkle, 0.15, rxSeedB );
  float rxTw = 0.5 + 0.5 * sin( rxTime * ( 1.4 + 2.6 * rxSeedB ) + rxSeedB * 40.0 );
  rxSpark *= mix( 0.2, pow( rxTw, 4.0 ) * 1.3, rxMotion );
  rxEmit += mix( vec3( 0.85, 0.92, 1.0 ), vec3( 1.0, 0.75, 0.95 ), rxSeedB ) * rxSpark * 6.0;
  rxEmit += mix( RX_ICE, RX_HOT, rxG ) * rxFres * 0.55;
  rxEmit += rxCol * smoothstep( 0.82, 1.0, rxVv ) * 0.45;
  totalEmissiveRadiance += rxEmit * rxCrystalGlow;
  diffuseColor.rgb = rxCol * 0.1;
}
`;

const GEM_EMISSIVE = /* glsl */ `
{
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  float rxFacet = rxHash13( floor( normalize( vRxRootNormal ) * 7.0 + 0.5 ) );
  vec3 rxHue = mix( vec3( 0.18, 0.36, 1.0 ), vec3( 0.85, 0.3, 1.0 ), rxFacet );
  vec3 rxEmit = rxHue * ( 0.24 + 0.75 * pow( rxNdV, 2.0 ) ) + vec3( 0.9, 0.9, 1.0 ) * pow( rxNdV, 30.0 ) * 0.35;
  totalEmissiveRadiance += rxEmit * ( 1.0 + 0.08 * rxPulse );
}
`;

const GLOW_EMISSIVE = /* glsl */ `
{
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  vec3 rxCore = mix( vec3( 0.25, 0.42, 1.0 ), vec3( 1.0, 0.9, 1.0 ), pow( rxNdV, 1.5 ) );
  rxCore = mix( rxCore, vec3( 1.0, 0.36, 0.84 ), pow( 1.0 - rxNdV, 2.0 ) * 0.55 );
  totalEmissiveRadiance += rxCore * 2.0 * ( 1.0 + 0.16 * rxPulse );
}
`;

const VISOR_EMISSIVE = /* glsl */ `
{
  vec3 rxV = normalize( vViewPosition );
  float rxNdV = clamp( dot( normal, rxV ), 0.0, 1.0 );
  vec3 rxC = mix( vec3( 0.3, 0.5, 1.0 ), vec3( 1.0, 0.3, 0.8 ), smoothstep( 0.12, 0.8, rxNdV ) );
  rxC = mix( rxC, vec3( 1.0, 0.86, 1.0 ), pow( rxNdV, 9.0 ) * 0.55 );
  totalEmissiveRadiance += rxC * 2.6;
}
`;

type Look = {
  params: THREE.MeshPhysicalMaterialParameters;
  emissive?: string;
};

const LOOKS: Record<RexonanceFamily, Look> = {
  Suit: {
    params: {
      color: new THREE.Color().setRGB(0.012, 0.012, 0.016),
      roughness: 0.5,
      specularIntensity: 0.45,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      envMapIntensity: 0.85,
    },
  },
  Black: {
    params: {
      color: new THREE.Color().setRGB(0.006, 0.006, 0.008),
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      envMapIntensity: 1.15,
    },
  },
  Gold: {
    params: {
      color: new THREE.Color().setRGB(0.8, 0.48, 0.22),
      metalness: 1,
      roughness: 0.2,
      clearcoat: 0.35,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.05,
    },
  },
  GoldDark: {
    params: {
      color: new THREE.Color().setRGB(0.36, 0.2, 0.09),
      metalness: 1,
      roughness: 0.3,
      envMapIntensity: 1.1,
    },
  },
  Silver: {
    params: {
      color: new THREE.Color().setRGB(0.86, 0.87, 0.92),
      metalness: 1,
      roughness: 0.14,
      clearcoat: 0.3,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.2,
    },
  },
  Crystal: {
    params: {
      color: new THREE.Color().setRGB(0.02, 0.04, 0.12),
      roughness: 0.08,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 0.6,
      side: THREE.DoubleSide,
    },
    emissive: CRYSTAL_EMISSIVE,
  },
  Gem: {
    params: {
      color: new THREE.Color().setRGB(0.06, 0.1, 0.45),
      roughness: 0.03,
      specularIntensity: 0.8,
      ior: 2.2,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      iridescence: 0.55,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [220, 760],
      envMapIntensity: 0.7,
    },
    emissive: GEM_EMISSIVE,
  },
  Glow: {
    params: { color: new THREE.Color().setRGB(0.3, 0.3, 0.4), roughness: 0.18, clearcoat: 1 },
    emissive: GLOW_EMISSIVE,
  },
  Visor: {
    params: {
      color: new THREE.Color().setRGB(0.12, 0.04, 0.1),
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
  const scales = family === "Suit" && Boolean(options.scales);
  const detail = options.crystalDetail ?? 2;
  const ribbonPhase = { value: options.phase ?? 0 };
  const crystalGlow = { value: 1 };
  const facetDensity = { value: 19 };
  material.userData.rexonance = { family, crystalGlow, facetDensity };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, {
      rxRibbonPhase: ribbonPhase,
      rxCrystalGlow: crystalGlow,
      rxFacetDensity: facetDensity,
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
      `#include <common>\n${COMMON_PARS}\n${HASH}\nuniform sampler2D rxScaleMap;\nuniform float rxScaleTile;\nuniform float rxScaleStrength;\nuniform float rxCrystalGlow;\nuniform float rxFacetDensity;\n${
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
    if (look.emissive)
      fragment = fragment.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>\n${look.emissive}`,
      );
    // The seams between scales hold less of the room's light.
    fragment = fragment.replace(
      "#include <aomap_fragment>",
      `#include <aomap_fragment>
reflectedLight.indirectSpecular *= mix( 0.3, 1.0, rxCavity );
reflectedLight.directSpecular *= mix( 0.45, 1.0, rxCavity );
#ifdef USE_CLEARCOAT
  clearcoatSpecularIndirect *= mix( 0.45, 1.0, rxCavity );
#endif`,
    );
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () =>
    `rx3d-v1-${family}-${ribbon ? "r" : ""}${scales ? "s" : ""}${crystal ? detail : ""}`;
  return material;
}

/** Strength of the crystals' emission (the page dims it slightly while the reference panel
 * is open, so the sheet and the model read at the same brightness). */
export function setRexonanceCrystalGlow(material: THREE.Material, value: number) {
  const handles = material.userData.rexonance as
    | { crystalGlow: { value: number } }
    | undefined;
  if (handles) handles.crystalGlow.value = value;
}
