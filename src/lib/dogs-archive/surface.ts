import * as THREE from "three";

/** Shading that reads like the paintings on top of the authored PBR inputs: pale-green bone
 * rims, deep translucent membranes, broad ink mottling, a breathing lattice face and a mouth
 * that glows while the creature breathes. The bone/membrane mask is read from the shaded
 * albedo luminance (COLOR_0 today; a texture mask from the model lead works unchanged). */
export type GuardianSurfaceUniforms = {
  uNoise: { value: THREE.Data3DTexture };
  uTime: { value: number };
  uStrength: { value: number };
  uAnticipation: { value: number };
  uRimDir: { value: THREE.Vector3 };
  uKeyDir: { value: THREE.Vector3 };
  uRimColor: { value: THREE.Color };
  uTransColor: { value: THREE.Color };
  uRimStrength: { value: number };
  uTransStrength: { value: number };
  uBoneRange: { value: THREE.Vector2 };
  /** 1 = full luminance curve on painted albedo (the v8 tiles); lower it for an atlas that
   * already carries the originals' ridge/pit contrast. */
  uPaintedContrast: { value: number };
  /** Translucent wrap glow on pale parts (ridges, bone): 0 disables. */
  uTranslucency: { value: number };
  /** World-space base and tip of the face leaf (HeadPivot → MouthSocket): the lattice
   * brightens toward the tip. */
  uFaceBase: { value: THREE.Vector3 };
  uFaceTip: { value: THREE.Vector3 };
  /** Unsharp mask on painted albedo: 0 off, 1 full (ridges crisp, blotches flattened). */
  uClarity: { value: number };
  /** World units per model unit: the bone veins are sized in world space. */
  uVeinScale: { value: number };
  /** Irradiance at which the toon ramp's light band is fully on (set per light rig). */
  uToonRange: { value: number };
  /** Strength of the GLB's tile normal maps on the body families (Skin, painted, Bone): the
   * baked scales must read as small value steps, not photographic noise. */
  uTileNormal: { value: number };
};

export function createGuardianSurfaceUniforms(noise: THREE.Data3DTexture): GuardianSurfaceUniforms {
  return {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uAnticipation: { value: 0 },
    uRimDir: { value: new THREE.Vector3(-0.5, 0.2, -0.8).normalize() },
    uKeyDir: { value: new THREE.Vector3(0.4, 0.7, 0.6).normalize() },
    uRimColor: { value: new THREE.Color(0.6, 1.0, 0.64) },
    uTransColor: { value: new THREE.Color(0.06, 0.42, 0.14) },
    uRimStrength: { value: 0.55 },
    uTransStrength: { value: 0.4 },
    // Linear albedo luminance: membranes sit below 0.035, bone rims above 0.11.
    uBoneRange: { value: new THREE.Vector2(0.035, 0.11) },
    uPaintedContrast: { value: 1 },
    uTranslucency: { value: 1 },
    uFaceBase: { value: new THREE.Vector3(0, 1, 0) },
    uFaceTip: { value: new THREE.Vector3(0, 0, 1) },
    // Off until the v13 re-projection: on the v12 atlas it read as specks or darkened the body.
    uClarity: { value: 0 },
    uVeinScale: { value: 1 },
    uToonRange: { value: 3.5 },
    uTileNormal: { value: 0.75 },
  };
}

/** Families by the material name's prefix (the part before `|`): `Bone`, `Skin`, `Mouth`,
 * `Rune` (authored emission). Within `Rune`, `lattice` is the face (pulse-driven glow) and
 * `core` any other emitter such as the whorl centres (kept as authored, gently breathing).
 * The prefix decides: "Bone | v3 lattice" is bone, not the face. */
export const guardianSurfaceFamily = (material: THREE.Material) => {
  const name = material.name;
  const prefix = name.split(/[|:]/, 1)[0];
  if (/glass|crystal/i.test(prefix)) return "glass";
  if (/horn|lacquer|obsidian/i.test(prefix)) return "horn";
  if (/bone|ivory|shell|carapace|ridge|teeth/i.test(prefix)) return "bone";
  if (/mouth|cavity/i.test(prefix)) return "mouth";
  if (/rune|emission|glow/i.test(prefix))
    return /face|forehead|lattice/i.test(name) ? "lattice" : "core";
  if (/face|forehead/i.test(prefix)) return "lattice";
  return "skin";
};
const surfaceFamily = guardianSurfaceFamily;

export type GuardianSurfaceHandles = {
  patched: number;
  families: Record<string, number>;
  update(time: number, strength: number, anticipation: number): void;
  restore(): void;
};

// Shared by the body families and the face, so the face is lit exactly like the head skin:
// the rim band (thresholded fresnel toward the rim light) and the three-tone recolouring.
const GUARDIAN_RIM_GLSL = `{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 // A clean rim band (thresholded fresnel toward the rim light), suppressed on thin bars.
 float gThinness=smoothstep(.08,.35,length(fwidth(normal)));
 float gFr=pow(1.-gNdV,1.5)*(saturate(dot(normal,uRimDir))*.6+.4);
 gRimBand=smoothstep(.4,.48,gFr)*(1.-.9*gThinness);
 gWrapLight=saturate((dot(normal,uKeyDir)+.6)/1.6);
}`;
// The face net (05/07): two mirrored families of curves X ± Y = integer around the bright
// point F. X: the angle around F, opened up toward the border (the upward sector gets up to
// 1+FACE_K times the lines, so they run nearly parallel up the face); Y: log distance from F,
// stretched away from F so the cells lengthen into arches. Face-plane units (length = 1).
const GUARDIAN_FACE_NET_GLSL = `
#define FACE_N 16.
#define FACE_M 13.
#define FACE_F .3
#define FACE_K 1.
#define FACE_KR .6
#define FACE_STR .3
#define FACE_RE0 -2.7
#define FACE_R0 .05
#define FACE_LW .0075
varying vec3 vFacePlane;
vec2 gFaceNet(vec2 z){
 vec2 a=vec2(z.x,z.y-FACE_F);
 float r=sqrt(dot(a,a)+FACE_R0*FACE_R0);
 float th=atan(a.x,a.y);
 float k=1.+FACE_K*smoothstep(0.,FACE_KR,length(a));
 float ph=2.*atan(k*tan(clamp(th*.5,-1.5707,1.5707)));
 float re=log(r);float q=max(0.,re-FACE_RE0);
 float h=re<FACE_RE0?re:FACE_RE0+log(1.+FACE_STR*q)/FACE_STR;
 return vec2(ph*FACE_N,h*FACE_M)/6.2831853;
}
// one line's coverage of the pixel (exact box overlap), turning into the mean where its cells
// are under a few pixels wide
float gFaceLine(float d,float g,float pw){
 float cov=clamp((min(d+pw*.5,FACE_LW)-max(d-pw*.5,-FACE_LW))/pw,0.,1.);
 return mix(min(1.,2.*FACE_LW*g),cov,smoothstep(2.*pw,5.*pw,1./g));
}
`;
const GUARDIAN_TONES_GLSL = `{
 // Anime shading: the PBR irradiance (every light, the key's shadow) is quantised into three
 // tones and recoloured from the family's palette; ridge or pit picks the palette.
 float gIrr=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))*PI*2.;
 float gN=gIrr/uToonRange;
 float gMid=smoothstep(.2,.34,gN),gHi=smoothstep(.56,.72,gN),gHiSkin=smoothstep(.66,.8,gN);
 // skin: near-black with only a faint green tint, as 05 — on screen (4,8,6) / (10,18,13), a
 // narrow lit band (28,46,34). The values are pre-compensated for NeutralToneMapping (×1.12
 // exposure), whose dark-end offset subtracts the smallest channel and would otherwise leave a
 // saturated green. Ridges and bone: mint shadow / mint (146,182,143) / near-white mint.
 vec3 gPit=mix(mix(vec3(.0124,.0135,.013),vec3(.0197,.0224,.0206),gMid),vec3(.0385,.0525,.0424),gHiSkin);
 // bone and ridges are the brightest parts, as in 05: pale everywhere with soft shading —
 // shadow (100,140,105), mid = 05's mint (146,182,143), light (178,208,178).
 vec3 gRdg=mix(mix(vec3(.127,.262,.141),vec3(.286,.466,.273),gMid),vec3(.445,.624,.445),gHi);
#ifdef GUARDIAN_HEAD
 // the galaxy crescents are saturated mint in 05, not pale bone
 gRdg=mix(mix(vec3(.08,.26,.12),vec3(.17,.5,.25),gMid),vec3(.3,.66,.38),gHi);
#endif
 vec3 gTone=mix(gPit,gRdg,gBone);
#ifdef GUARDIAN_SCALES
 // The baked snake scales (v22 ORM, R = the free-edge outline): the rims step up a little
 // toward a green-black rim, (16,24,19) on the shadow side and (30,42,33) where lit — one
 // value step in the ramp, faded out before the mask's mip level would turn it into a grey veil.
 gTone=mix(gTone,mix(vec3(.0257,.0292,.0269),vec3(.0407,.0498,.0427),gMid),.6*gScaleRim*(1.-gBone));
#endif
#ifdef GUARDIAN_BONE
 gTone*=mix(vec3(1.),vec3(.62,.8,.65),gVein);
 // a soft inner light on jade-like bone, not a realistic subsurface
 gTone+=vec3(.2,.34,.2)*gWrapLight*.3*uTranslucency*gBone;
#endif
 // the skin rim is a little stronger since the skin went black: the silhouette must hold
 // against the dark green backdrop
 gTone+=uRimColor*gRimBand*mix(.27,.08,gBone)*uRimStrength*1.8;
 reflectedLight.directDiffuse=gTone;
 reflectedLight.indirectDiffuse=vec3(0.);
 // one crisp highlight on the glossy dark membranes, only a soft sheen on bone
 vec3 gV2=normalize(vViewPosition);
 vec3 gH=normalize(uKeyDir+gV2);
 float gNdH=saturate(dot(normal,gH));
 float gSpec=pow(gNdH,48.);
 // Skin: a lacquer sheen like polished black jade — one broad soft band along the lit side of
 // each tube (a wide Blinn lobe, thresholded with a soft edge) and a small brighter core. The
 // GLB's roughness map (v22 ORM G: scales .28–.32 lacquer, rims .42, gaps .8) keeps it on
 // the scales and off the gaps; the scale normals make the band break along the rims.
 float gGloss=mix(.15,1.,1.-smoothstep(.3,.85,roughnessFactor));
 float gSheen=smoothstep(.26,.6,pow(gNdH,mix(4.,10.,gGloss)))*gGloss;
 vec3 gSkinSpec=vec3(.05,.08,.06)*gSheen+vec3(.5,.72,.56)*smoothstep(.55,.65,gSpec)*.12*gGloss;
 reflectedLight.directSpecular=mix(gSkinSpec,vec3(.3,.44,.3)*gSpec*.2,gBone)*gMid;
 reflectedLight.indirectSpecular=vec3(0.);
}`;

export function applyGuardianInkSurface(
  model: THREE.Object3D,
  uniforms: GuardianSurfaceUniforms,
): GuardianSurfaceHandles {
  const seen = new Set<THREE.Material>();
  const lattice: { material: THREE.MeshStandardMaterial; base: number }[] = [];
  const cores: { material: THREE.MeshStandardMaterial; base: number }[] = [];
  const mouths: THREE.MeshStandardMaterial[] = [];
  const families: Record<string, number> = {};
  const previous = new Map<
    THREE.MeshStandardMaterial,
    {
      onBeforeCompile: THREE.MeshStandardMaterial["onBeforeCompile"];
      customProgramCacheKey: THREE.MeshStandardMaterial["customProgramCacheKey"];
      emissive: THREE.Color;
      emissiveIntensity: number;
      color: THREE.Color;
      roughness: number;
      metalness: number;
      metalnessMap: THREE.Texture | null;
      vertexColors: boolean;
      transparent: boolean;
      opacity: number;
      depthWrite: boolean;
      side: THREE.Side;
      envMapIntensity: number;
    }
  >();
  let patched = 0;
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
      seen.add(material);
      const family = surfaceFamily(material);
      families[family] = (families[family] ?? 0) + 1;
      previous.set(material, {
        onBeforeCompile: material.onBeforeCompile,
        customProgramCacheKey: material.customProgramCacheKey,
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity,
        color: material.color.clone(),
        roughness: material.roughness,
        metalness: material.metalness,
        metalnessMap: material.metalnessMap,
        vertexColors: material.vertexColors,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
        side: material.side,
        envMapIntensity: material.envMapIntensity,
      });
      // A projected atlas (2026-10-30 "painted" materials) already carries the baked AO; any
      // vertex colour left on those primitives would darken it a second time.
      if (material.map && /painted/i.test(material.name) && material.vertexColors)
        material.vertexColors = false;
      if (family === "lattice") {
        // An authored emissive texture keeps its own colours and strength; only the pulse is
        // driven here. The legacy wire lattice gets the painting's white-green.
        if (!material.emissiveMap && !material.map) {
          material.color.set("#0d1f14");
          material.emissive.set("#bfffd0");
          lattice.push({ material, base: 1.2 });
        } else lattice.push({ material, base: material.emissiveIntensity });
        // The face: a leaf-shaped lattice glowing saturated green over near-black gaps, the
        // lines brightening toward the tip, a white-hot point at the tip (05/07/08).
        // Lattice source: 2 = the v18 bud's own UV0 (u around, v base→tip); 1 = a temporary
        // parametrisation around the HeadPivot→MouthSocket axis; 0 = the authored mask.
        const faceMode = {
          value: /face lattice/i.test(material.name) && node.geometry.getAttribute("uv") ? 2 : 1,
        };
        // The v17 leaf shows about a quarter turn of the axis parametrisation, so it takes
        // more cells per turn to show 6–8 across; the v18 bud's UV spans the whole bud.
        // 12 petals around (5–6 across the front half), 7 rows from the border to the tip
        const faceCells = { value: faceMode.value === 2 ? 12 : 28 };
        const faceRows = { value: faceMode.value === 2 ? 7 : 12 };
        if (faceMode.value === 2) {
          // The face is one structure with the dark head (owner, 10-30): it is lit exactly like
          // the head skin — same toon ramp, no reflections, the authored relief at half strength.
          material.metalness = 0;
          material.metalnessMap = null;
          material.envMapIntensity = 0;
          material.roughness = Math.min(material.roughness, 0.55);
          if (material.normalMap) material.normalScale.multiplyScalar(0.5);
          // Face-plane coordinates for the pattern (05/07), from the region UV only (u around,
          // 0.5 at the front centre; v along, either end may be the tip — the narrow end is):
          // x = arc length across from the centre line, y = surface distance from the tip, both
          // in units of the face's length, plus the distance to the region border. Bind pose,
          // so they hold in every pose; any reshaped face keeping the UV convention works.
          const geometry = node.geometry;
          const position = geometry.getAttribute("position");
          const faceUv = geometry.getAttribute("uv1") ?? geometry.getAttribute("uv");
          if (position && faceUv && !geometry.getAttribute("aFacePlane")) {
            const bins = 32;
            const across = new Float64Array(bins),
              along = new Float64Array(bins),
              weight = new Float64Array(bins);
            let uMin = Infinity,
              uMax = -Infinity;
            for (let i = 0; i < faceUv.count; i++) {
              uMin = Math.min(uMin, faceUv.getX(i));
              uMax = Math.max(uMax, faceUv.getX(i));
            }
            const pa = new THREE.Vector3(),
              e1 = new THREE.Vector3(),
              e2 = new THREE.Vector3(),
              pu = new THREE.Vector3(),
              pv = new THREE.Vector3();
            const corners = geometry.index ? geometry.index.count : position.count;
            for (let t = 0; t + 2 < corners; t += 3) {
              const [a, b, c] = [0, 1, 2].map((k) => (geometry.index ? geometry.index.getX(t + k) : t + k));
              pa.fromBufferAttribute(position, a);
              e1.fromBufferAttribute(position, b).sub(pa);
              e2.fromBufferAttribute(position, c).sub(pa);
              const du1 = faceUv.getX(b) - faceUv.getX(a),
                dv1 = faceUv.getY(b) - faceUv.getY(a),
                du2 = faceUv.getX(c) - faceUv.getX(a),
                dv2 = faceUv.getY(c) - faceUv.getY(a);
              const det = du1 * dv2 - du2 * dv1;
              if (Math.abs(det) < 1e-12) continue;
              pu.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
              pv.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
              const vm = (faceUv.getY(a) + faceUv.getY(b) + faceUv.getY(c)) / 3;
              const bin = Math.min(bins - 1, Math.max(0, Math.floor(vm * bins)));
              const w = Math.abs(det);
              across[bin] += pu.length() * w;
              along[bin] += pv.length() * w;
              weight[bin] += w;
            }
            const filled = [...weight].map((w) => w > 0);
            if (filled.some(Boolean)) {
              for (let i = 0; i < bins; i++)
                if (filled[i]) {
                  across[i] /= weight[i];
                  along[i] /= weight[i];
                }
              for (let i = 0; i < bins; i++) {
                if (filled[i]) continue;
                let j = 1;
                while (!filled[i - j] && !filled[i + j]) j++;
                const k = filled[i - j] ? i - j : i + j;
                across[i] = across[k];
                along[i] = along[k];
              }
              // the tip is the narrow end
              const tipAtZero = across[0] + across[1] + across[2] < across[bins - 1] + across[bins - 2] + across[bins - 3];
              const acrossS = tipAtZero ? [...across] : [...across].reverse();
              const alongS = tipAtZero ? [...along] : [...along].reverse();
              const ys = [0];
              for (let i = 0; i < bins; i++) ys.push(ys[i] + alongS[i] / bins);
              const length = Math.max(ys[bins], 1e-6);
              const uMid = (uMin + uMax) / 2,
                uHalf = (uMax - uMin) / 2;
              const plane = new Float32Array(faceUv.count * 3);
              for (let i = 0; i < faceUv.count; i++) {
                const v = THREE.MathUtils.clamp(faceUv.getY(i), 0, 1);
                const sAlong = tipAtZero ? v : 1 - v;
                const f = sAlong * bins;
                const lo = Math.min(bins - 1, Math.floor(f));
                const y = (ys[lo] + (ys[lo + 1] - ys[lo]) * (f - lo)) / length;
                const g = THREE.MathUtils.clamp(f - 0.5, 0, bins - 1);
                const g0 = Math.floor(g),
                  g1 = Math.min(bins - 1, g0 + 1);
                const width = (acrossS[g0] + (acrossS[g1] - acrossS[g0]) * (g - g0)) / length;
                const du = faceUv.getX(i) - uMid;
                plane[i * 3] = du * width;
                plane[i * 3 + 1] = y;
                plane[i * 3 + 2] = Math.min((uHalf - Math.abs(du)) * width, 1 - y);
              }
              geometry.setAttribute("aFacePlane", new THREE.BufferAttribute(plane, 3));
            }
          }
        }
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms, {
            uFaceMode: faceMode,
            uFaceCells: faceCells,
            uFaceRows: faceRows,
          });
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vGuardianWorld;varying vec2 vGuardianUv;attribute vec3 aFacePlane;varying vec3 vFacePlane;",
            )
            .replace(
              "#include <skinning_vertex>",
              "#include <skinning_vertex>\nvGuardianWorld=(modelMatrix*vec4(transformed,1.)).xyz;vFacePlane=aFacePlane;\n#ifdef USE_UV1\nvGuardianUv=uv1;\n#else\nvGuardianUv=uv;\n#endif",
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform vec3 uFaceBase,uFaceTip;uniform float uFaceMode,uFaceCells,uFaceRows;uniform float uToonRange,uRimStrength,uTranslucency,uVeinScale;uniform vec3 uRimDir,uKeyDir,uRimColor;uniform vec2 uBoneRange;varying vec3 vGuardianWorld;varying vec2 vGuardianUv;float gBone=0.,gVein=0.,gRimBand=0.,gWrapLight=0.;\n" + GUARDIAN_FACE_NET_GLSL,
            )
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\n if(uFaceMode<.5)diffuseColor.rgb=mix(diffuseColor.rgb*vec3(.35,.7,.45),vec3(.02,.17,.06),.75);else if(uFaceMode>1.5)diffuseColor.rgb=vec3(.5);",
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
${GUARDIAN_RIM_GLSL}
{
 vec3 gAxis=uFaceTip-uFaceBase;float gLen=max(length(gAxis),1e-3);gAxis/=gLen;
 vec3 gRel=vGuardianWorld-uFaceBase;
 float gT=clamp(dot(gRel,gAxis)/gLen,0.,1.);
 float gU=0.;
 float gTa=gT;
 if(uFaceMode>1.5){gU=vGuardianUv.x;gT=clamp(vGuardianUv.y,0.,1.);}
 else{
  vec3 gPerp=gRel-gAxis*dot(gRel,gAxis);
  vec3 gRef=normalize(cross(gAxis,abs(gAxis.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.)));
  vec3 gRef2=cross(gAxis,gRef);
  gU=atan(dot(gPerp,gRef2),dot(gPerp,gRef))/6.2831853+.5;
 }
 float gEdge=pow(1.-saturate(dot(normal,normalize(vViewPosition))),3.);
 float gHot=exp(-pow((1.-gTa)/.14,2.));
 float gPulse=dot(emissive,vec3(.3333))/1.4;
 float gGrad=mix(.35,1.2,pow(gTa,1.5));
 if(uFaceMode<.5){
  float gLine=dot(totalEmissiveRadiance,vec3(.3333));
  diffuseColor.rgb*=1.-.7*gEdge;
  vec3 gCells=vec3(.03,.24,.09)*(.35+.85*gT)*(1.-.8*gEdge);
  totalEmissiveRadiance=gCells+(vec3(.4,1.,.56)*gLine*gGrad*1.3+vec3(.8,1.,.86)*gLine*gHot*1.8+vec3(.78,1.,.84)*gHot*gHot*.45)*(1.-.6*gEdge);
 }else{
  // The face pattern (owner, 10-30 「顔の模様もだいぶ原画から離れている」; measured on 05/07,
  // handoff/goal/ciel3d/face/notes.md): a net of two mirrored families of curves that cross in
  // diamonds and all converge on one bright point F, 30 % of the face's length up from the tip
  // — not on the tip. Around F the cells are small diamonds (16 around); upward the lines
  // straighten and run nearly parallel to the axis, so the cells grow into tall pointed arches
  // (aspect ~2.5, ~9 across the front at the widest, ~8 rows from F to the border). Lines
  // ~1/100 of the face's length wide (constant in surface units), white-mint at F, mint and
  // dimmer toward the border; cells saturated emerald around F, each lighter at its F-side
  // corner, darkening to the black skin by mid-face; below F a few small cells, then the dark
  // beak; the net fades out inside a dark band along the region border. Drawn on the face-plane
  // coordinates (vFacePlane: arc length across, distance from the tip, distance to the border),
  // antialiased by the exact coverage of each line in the pixel (no stripes, no shimmer); where
  // the cells shrink under a few pixels (at F, and at page scale) the net turns into its mean.
  vec2 gZ=vFacePlane.xy;
  float gPw=max(length(fwidth(gZ))*.75,1e-5);
  vec2 gXY=gFaceNet(gZ);
  vec2 gXa=gFaceNet(gZ+vec2(.002,0.)),gXb=gFaceNet(gZ+vec2(0.,.002));
  vec2 gDx=(gXa-gXY)/.002,gDy=(gXb-gXY)/.002;
  gDx.x-=FACE_N*floor(gDx.x*.002/FACE_N+.5)/.002;gDy.x-=FACE_N*floor(gDy.x*.002/FACE_N+.5)/.002;
  float gFa=gXY.x+gXY.y,gFb=gXY.x-gXY.y;
  float gGa=max(length(vec2(gDx.x+gDx.y,gDy.x+gDy.y)),1e-4),gGb=max(length(vec2(gDx.x-gDx.y,gDy.x-gDy.y)),1e-4);
  float gDa=abs(fract(gFa+.5)-.5)/gGa,gDb=abs(fract(gFb+.5)-.5)/gGb;
  float gLines=max(gFaceLine(gDa,gGa,gPw),gFaceLine(gDb,gGb,gPw));
  float gDmin=min(gDa,gDb);
  vec2 gA=vec2(gZ.x,gZ.y-FACE_F);
  float gR=length(gA);
  // inside a cell: lighter at the corner toward F, darker at the far corner
  float gCt=(fract(gFa)-fract(gFb)+1.)*.5;
  float gG=gR>.2?.37*exp(-(gR-.2)/.07):.37+(.2-gR)*1.2;
  vec3 gCellC=vec3(.07,1.,.22)*gG*(1.3-.8*gCt);
  float gHot=1.-smoothstep(.03,.08,gR);
  vec3 gLineC=(vec3(.34,1.05,.5)+vec3(.8,.3,.6)*gHot)*(1.-.35*smoothstep(.35,.75,gR));
  float gTop=1.-.55*smoothstep(.55,1.,gZ.y);
  float gHalo=exp(-gDmin/.014)*.35*exp(-gR/.4);
  // the dark band along the border, the dark beak below F
  float gNetIn=smoothstep(.015,.05,vFacePlane.z)*smoothstep(.1,.2,gZ.y);
  vec3 gRad=gNetIn*(gCellC*(1.-gLines)+gLineC*(gLines*gTop+gHalo))*(1.-.6*gEdge);
  // the burst at F: a small white core and a soft mint halo
  gRad+=vec3(.85,1.,.88)*(1.6*exp(-pow(gR/.03,2.))+.3*exp(-pow(gR/.1,2.)))*smoothstep(0.,.05,vFacePlane.z+.03);
  totalEmissiveRadiance=gRad*gPulse;
 }
}`,
            )
            .replace(
              "#include <aomap_fragment>",
              `#include <aomap_fragment>\nif(uFaceMode>1.5)${GUARDIAN_TONES_GLSL}`,
            )
            // the face is smooth skin: the GLB's baked diamond relief would fight the drawn net
            .replace("#include <normal_fragment_maps>", faceMode.value === 2 ? "" : "#include <normal_fragment_maps>");
        };
        material.customProgramCacheKey = () => "guardian-face-lattice-v7";
        material.needsUpdate = true;
        continue;
      }
      if (family === "core") {
        cores.push({ material, base: material.emissiveIntensity });
        // The galaxy spirals glow from the centre outward along their arms, fading with
        // radius (aCoreRadius, written per vertex below), with a hot centre; no flat disc.
        material.onBeforeCompile = (shader) => {
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute float aCoreRadius;varying float vCoreRadius;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoreRadius=aCoreRadius;");
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float vCoreRadius;")
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\n diffuseColor.rgb*=mix(1.,.55,vCoreRadius);",
            )
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
{
 float gFall=mix(1.,.04,pow(clamp(vCoreRadius,0.,1.),.6));
 totalEmissiveRadiance*=gFall;
 totalEmissiveRadiance+=vec3(.7,1.,.78)*exp(-vCoreRadius*vCoreRadius*12.)*.7;
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-whorl-core-v2";
        material.needsUpdate = true;
        continue;
      }
      if (family === "mouth") {
        material.emissive.set("#39ff7a");
        material.emissiveIntensity = 0;
        mouths.push(material);
        continue;
      }
      if (family === "horn") {
        // Glossy black horns (lacquer / obsidian): near-black, low roughness for a sharp
        // highlight, a faint green rim from the scene light. No lift, no ink tint.
        if (material.color.r + material.color.g + material.color.b > 0.3 && !material.map)
          material.color.setRGB(0.008, 0.011, 0.008);
        material.roughness = Math.min(material.roughness, 0.18);
        material.metalness = 0;
        material.metalnessMap = null;
        material.envMapIntensity = 0;
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uToonRange;uniform vec3 uKeyDir;",
            )
            .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb=vec3(.5);")
            .replace(
              "#include <aomap_fragment>",
              `#include <aomap_fragment>
{
 // Lacquer: near-black in three tones, one crisp highlight band, a thin mint rim.
 float gIrr=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))*PI*2.;
 float gN=gIrr/uToonRange;
 float gMid=smoothstep(.2,.34,gN),gHi=smoothstep(.56,.72,gN);
 vec3 gTone=mix(mix(vec3(.004,.006,.004),vec3(.012,.02,.013),gMid),vec3(.03,.05,.034),gHi);
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 float gRim=smoothstep(.5,.58,pow(1.-gNdV,1.5));
 gTone+=vec3(.18,.5,.26)*gRim*.6;
 vec3 gH=normalize(uKeyDir+gV);
 float gSpec=pow(saturate(dot(normal,gH)),96.);
 reflectedLight.directDiffuse=gTone;
 reflectedLight.indirectDiffuse=vec3(0.);
 reflectedLight.directSpecular=vec3(.78,.95,.84)*smoothstep(.6,.7,gSpec)*.9*gMid;
 reflectedLight.indirectSpecular=vec3(0.);
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-horn-v2";
        material.needsUpdate = true;
        patched++;
        continue;
      }
      if (family === "glass") {
        // Pale translucent green glass (the big arms' ladder rungs and their flame-shaped
        // hooks in 05): alpha-blended over what lies behind, more opaque and lighter at the
        // edges (fresnel), wrap-lit with a faint inner glow, low roughness. No transmission
        // pass, so phones pay only the blend.
        material.transparent = true;
        material.opacity = 0.74;
        material.depthWrite = false;
        material.side = THREE.DoubleSide;
        material.roughness = Math.min(material.roughness, 0.3);
        material.metalness = 0;
        material.metalnessMap = null;
        if (material.color.r > 0.9 && material.color.g > 0.9 && material.color.b > 0.9 && !material.map)
          material.color.setRGB(0.42, 0.78, 0.5);
        material.envMapIntensity = 0.25;
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uToonRange,uTranslucency;uniform vec3 uKeyDir;float gGlassFres;",
            )
            .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb=vec3(.5);")
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
{
 vec3 gV=normalize(vViewPosition);
 float gNdV=saturate(dot(normal,gV));
 gGlassFres=pow(1.-gNdV,2.2);
 float gWrap=saturate((dot(normal,uKeyDir)+.7)/1.7);
 // a soft inner light and a lighter glass rim; the edges denser than the middle
 totalEmissiveRadiance+=vec3(.5,.9,.58)*(.12+.22*gWrap)*uTranslucency;
 totalEmissiveRadiance+=vec3(.78,1.,.84)*smoothstep(.35,.6,gGlassFres)*.45;
 diffuseColor.a*=.72+.28*gGlassFres;
}`,
            )
            .replace(
              "#include <aomap_fragment>",
              `#include <aomap_fragment>
{
 // Jade glass in three tones with one crisp highlight.
 float gIrr=dot(reflectedLight.directDiffuse+reflectedLight.indirectDiffuse,vec3(.2126,.7152,.0722))*PI*2.;
 float gN=gIrr/uToonRange;
 float gMid=smoothstep(.2,.34,gN),gHi=smoothstep(.56,.72,gN);
 reflectedLight.directDiffuse=mix(mix(vec3(.08,.2,.11),vec3(.16,.36,.2),gMid),vec3(.46,.76,.52),smoothstep(.6,.76,gN));
 reflectedLight.indirectDiffuse=vec3(0.);
 vec3 gH=normalize(uKeyDir+normalize(vViewPosition));
 reflectedLight.directSpecular=vec3(.7,.95,.78)*smoothstep(.6,.7,pow(saturate(dot(normal,gH)),64.))*.5*gMid;
 reflectedLight.indirectSpecular*=.5;
}`,
            );
        };
        material.customProgramCacheKey = () => "guardian-glass-v2";
        material.needsUpdate = true;
        patched++;
        continue;
      }
      // Glassy bone and a subtle sheen on the painted skin (the authored 0.58–0.66 stays
      // the upper bound).
      material.roughness = Math.min(
        material.roughness,
        family === "bone" ? 0.5 : material.map ? 0.55 : 0.9,
      );
      // Ink is a dielectric. The 2026-10-28 ORM's blue channel gave the membranes metalness,
      // which mirrored the studio and read as grey.
      material.metalness = 0;
      material.metalnessMap = null;
      // Tile normal maps at uTileNormal (0.75): the sheen band must stay one clean shape, and
      // baked scales read as small value steps in the toon ramp.
      // Anime shading: no environment reflections on the body.
      material.envMapIntensity = 0;
      // The painted head carries the two galaxy domes (aDomeWeight, written per vertex below).
      const head = family === "skin" && /head/i.test(material.name);
      // v22: Blender-baked snake scales (normal + ORM on TEXCOORD_0, R = outline, G = roughness).
      // The roughness factor goes to 1 so G is the roughness itself.
      const scales = family === "skin" && !!material.roughnessMap;
      if (scales) material.roughness = 1;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying vec3 vGuardianLocal;${head ? "attribute float aDomeWeight;varying float vDomeWeight;" : ""}`,
          )
          .replace(
            "#include <skinning_vertex>",
            `#include <skinning_vertex>\nvGuardianLocal=position;${head ? "vDomeWeight=aDomeWeight;" : ""}`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform float uToonRange,uRimStrength,uTranslucency,uVeinScale,uTileNormal;
uniform vec3 uRimDir,uKeyDir,uRimColor;
uniform vec2 uBoneRange;
varying vec3 vGuardianLocal;
float gBone,gLum,gVein,gRimBand,gWrapLight,gScaleRim;
const float gSkinFamily=${family === "bone" ? "0." : "1."};
const float gPainted=${material.map ? "1." : "0."};
${family === "bone" ? "#define GUARDIAN_BONE" : ""}
${scales ? "#define GUARDIAN_SCALES" : ""}
${head ? "#define GUARDIAN_HEAD\nvarying float vDomeWeight;" : ""}
vec3 gvHash3(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float gvEdge(vec3 p){vec3 i=floor(p),f=fract(p);float f1=8.,f2=8.;
 for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec3 g=vec3(float(x),float(y),float(z));vec3 o=gvHash3(i+g);float d=length(g+o-f);if(d<f1){f2=f1;f1=d;}else if(d<f2){f2=d;}}
 return f2-f1;}`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
gVein=0.;
#ifdef GUARDIAN_BONE
{
 // Fine reticulation on bone: Voronoi edges at two scales in the bind-pose surface space
 // (stable on the skin in every pose), each fading before it could alias.
 vec3 gVp=vGuardianLocal*uVeinScale;
 float gVfw=length(fwidth(gVp));
 float gFade1=1.-smoothstep(.02,.06,gVfw),gFade2=1.-smoothstep(.008,.025,gVfw);
 if(gFade1>.01){
  float gE1=gvEdge(gVp*10.);float gV1=(1.-smoothstep(0.,.16,gE1))*gFade1;
  float gV2=0.;
  if(gFade2>.01){float gE2=gvEdge(gVp*25.);gV2=(1.-smoothstep(0.,.18,gE2))*gFade2;}
  gVein=min(1.,gV1*.8+gV2*.35);
 }
}
#endif
if(gPainted>.5){
 // The atlas only places the ridges and the pits: thresholded into clean shapes (a soft
 // edge), never used as photographic colour. Older atlases carry low-frequency blotches, so
 // a ridge is also what rises above the map's own blurred level.
 gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 // Region colours of the anime atlas (sRGB): membrane (10,25,14), head skin (36,55,41),
 // pale bone and scales (125,166,132): the threshold sits between the head skin and the bone.
 gBone=smoothstep(.06,.16,gLum);
 #ifdef USE_MAP
 // The anime tiles are about 42 % pale where 05 is about 21 %: the pale regions are eroded
 // by their own blurred level, so only the cores of the ridges stay light.
 vec2 gTs=vec2(textureSize(map,0));
 vec2 gDx=dFdx(vMapUv*gTs),gDy=dFdy(vMapUv*gTs);
 float gLod=.5*log2(max(max(dot(gDx,gDx),dot(gDy,gDy)),1e-8));
 float gBlurL=dot(textureLod(map,vMapUv,gLod+2.).rgb*diffuse,vec3(.2126,.7152,.0722));
 // Bone geometry (zipper teeth, ribs, blades) keeps its full pale area, and so does the head:
 // its atlas is clean (flat skin plus the galaxy crescents, which are thin and would be eaten).
 // The erosion is for the serpent's skin tiles only.
 #if !defined(GUARDIAN_BONE) && !defined(GUARDIAN_HEAD)
 gBone*=smoothstep(.22,.33,gBlurL);
 #endif
 #endif
}else{
 // Vertex-colour parts: bone is pale OR grey-green (low saturation); ink is saturated green.
 gLum=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
 float gMax=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
 float gSat=(gMax-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)))/max(gMax,1e-4);
 float gBoneMesh=max(smoothstep(uBoneRange.x,uBoneRange.y,gLum)*(1.-smoothstep(.45,.6,gSat)),1.-smoothstep(.3,.5,gSat));
 float gSkinMesh=smoothstep(.2,.42,gLum);
 gBone=mix(gBoneMesh,gSkinMesh,gSkinFamily);
}
// The tones come after the lights: a neutral albedo keeps the lit irradiance recoverable.
diffuseColor.rgb=vec3(.5);`,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>
#ifdef GUARDIAN_SCALES
{
 // the outline mask, faded with the map's footprint (one scale ≈ 128 texels): full while a
 // scale is 8 px or more, gone at 4 px, so the page view never shimmers
 vec2 gRd=fwidth(vRoughnessMapUv)*1024.;
 float gRLod=log2(max(max(gRd.x,gRd.y),1e-4));
 gScaleRim=texelRoughness.r*(1.-smoothstep(4.,5.,gRLod));
}
#endif`,
          )
          .replace(
            "#include <normal_fragment_maps>",
            THREE.ShaderChunk.normal_fragment_maps.replace(
              "mapN.xy *= normalScale;",
              "mapN.xy *= normalScale * uTileNormal;",
            ),
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
#ifdef GUARDIAN_BONE
if(gVein>.001){
 // The veins also bend the normal a little (bump from screen-space derivatives).
 vec3 gSp=-vViewPosition;vec3 gSx=dFdx(gSp),gSy=dFdy(gSp);
 vec2 gHd=vec2(dFdx(gVein),dFdy(gVein))*.02;
 vec3 gR1=cross(gSy,normal),gR2=cross(normal,gSx);
 float gDet=dot(gSx,gR1)*(float(gl_FrontFacing)*2.-1.);
 normal=normalize(abs(gDet)*normal-sign(gDet)*(gHd.x*gR1+gHd.y*gR2));
}
#endif
${GUARDIAN_RIM_GLSL}
#ifdef GUARDIAN_HEAD
{
 // The galaxy domes: in 05 the two head spirals are the brightest thing after the face — the
 // mint crescents brighten toward a softly glowing centre. The arms glow with the crescents,
 // the base only near the centre; both stay under the bloom threshold (the hot dot is the
 // core disc's own).
 float gRho=1.-vDomeWeight;
 float gIn=1.-smoothstep(.9,1.,gRho);
 float gArm=gBone*pow(1.-min(gRho,1.),2.)*gIn;
 totalEmissiveRadiance+=vec3(.38,.85,.48)*gArm*.6+vec3(.22,.6,.3)*exp(-gRho*gRho*22.)*.45;
}
#endif`,
          )
          .replace(
            "#include <aomap_fragment>",
            `#include <aomap_fragment>
${GUARDIAN_TONES_GLSL}`,
          );
      };
      material.customProgramCacheKey = () => `guardian-toon-surface-v4:${family}${head ? ":head" : ""}${scales ? ":scales" : ""}`;
      material.needsUpdate = true;
      patched++;
    }
  });
  writeCoreRadius(model);
  writeDomeWeight(model);
  return {
    patched,
    families,
    update(time, strength, anticipation) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.35);
      const latticeScale = 1.0 + pulse * 0.25 + anticipation * 0.8 + strength * 0.4;
      for (const { material, base } of lattice) material.emissiveIntensity = base * latticeScale;
      // The references' cores glow white-green; the authored strength is modest, so scale it
      // up to the edge of the bloom threshold and let the breath push it over.
      const coreScale = 1.9 + pulse * 0.25 + anticipation * 0.5 + strength * 0.3;
      for (const { material, base } of cores) material.emissiveIntensity = base * coreScale;
      for (const material of mouths) material.emissiveIntensity = strength * 4.5 + anticipation * 0.6;
    },
    restore() {
      previous.forEach((state, material) => {
        material.onBeforeCompile = state.onBeforeCompile;
        material.customProgramCacheKey = state.customProgramCacheKey;
        material.emissive.copy(state.emissive);
        material.emissiveIntensity = state.emissiveIntensity;
        material.color.copy(state.color);
        material.roughness = state.roughness;
        material.metalness = state.metalness;
        material.metalnessMap = state.metalnessMap;
        material.vertexColors = state.vertexColors;
        material.transparent = state.transparent;
        material.opacity = state.opacity;
        material.depthWrite = state.depthWrite;
        material.side = state.side;
        material.envMapIntensity = state.envMapIntensity;
        material.needsUpdate = true;
      });
      previous.clear();
    },
  };
}

/** Per-vertex radial coordinate (0 at a core's centre, 1 at its edge) for the whorl-core
 * primitives, so their glow can fade outward along the spiral arms in every pose. The
 * core vertices are clustered in the rest pose (one cluster per whorl or coil centre). */
type CoreCluster = { centre: THREE.Vector3; n: number; max: number };

/** The vertices a mesh draws with a core-family material (the glowing discs). */
function coreMembers(node: THREE.Mesh): Set<number> {
  const geometry = node.geometry;
  const position = geometry.getAttribute("position");
  const members = new Set<number>();
  if (!position) return members;
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: geometry.index ? geometry.index.count : position.count, materialIndex: 0 }];
  for (const group of groups) {
    const material = materials[group.materialIndex ?? 0];
    if (!material || guardianSurfaceFamily(material) !== "core") continue;
    for (let i = group.start; i < group.start + group.count; i++)
      members.add(geometry.index ? geometry.index.getX(i) : i);
  }
  return members;
}

/** Groups core vertices into discs (centre, vertex count, radius) in the bind pose. */
function clusterCores(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  members: Set<number>,
  merge: number,
): { clusters: CoreCluster[]; owner: Map<number, CoreCluster> } {
  const p = new THREE.Vector3();
  const clusters: CoreCluster[] = [];
  const owner = new Map<number, CoreCluster>();
  for (const v of members) {
      p.fromBufferAttribute(position, v);
      let best: (typeof clusters)[number] | null = null,
        bestDistance = Infinity;
      for (const cluster of clusters) {
        const distance = cluster.centre.distanceTo(p);
        if (distance < bestDistance) {
          best = cluster;
          bestDistance = distance;
        }
      }
      if (best && bestDistance < merge) {
        best.centre.multiplyScalar(best.n).add(p).divideScalar(best.n + 1);
        best.n++;
      } else clusters.push({ centre: p.clone(), n: 1, max: 0 });
  }
  for (const v of members) {
    p.fromBufferAttribute(position, v);
    let best = clusters[0],
      bestDistance = Infinity;
    for (const cluster of clusters) {
      const distance = cluster.centre.distanceTo(p);
      if (distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }
    best.max = Math.max(best.max, bestDistance);
    owner.set(v, best);
  }
  return { clusters, owner };
}

function writeCoreRadius(model: THREE.Object3D) {
  const p = new THREE.Vector3();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute("position");
    if (!position || geometry.getAttribute("aCoreRadius")) return;
    const members = coreMembers(node);
    if (!members.size) return;
    const radius = new Float32Array(position.count).fill(1);
    const { owner } = clusterCores(position, members, 0.55);
    for (const [v, cluster] of owner) {
      p.fromBufferAttribute(position, v);
      radius[v] = Math.min(1, cluster.centre.distanceTo(p) / Math.max(cluster.max, 1e-4));
    }
    geometry.setAttribute("aCoreRadius", new THREE.BufferAttribute(radius, 1));
  });
}

// The head's galaxy domes: each dome's centre is its own small core disc (`Rune | v3 whorl
// core`, a sibling primitive of the painted head), and the disc's outermost vertex sits at
// 0.072 of the dome's radius (the model's log-polar layout lights the centre below 0.08;
// measured against the documented radii 0.34 / 0.52). The painted head gets a per-vertex dome weight (1 at a
// centre, 0 at the rim and everywhere else), in the bind pose so it holds in every pose.
// v21: the welded head has no core discs, so the dome centres are read from the head atlas —
// each galaxy's centre is baked as a solid near-white spot, the brightest thing in the atlas —
// and mapped to the mesh through the atlas UV; the dome's radius is the reach of its island.
function domesFromAtlas(node: THREE.Mesh, material: THREE.MeshStandardMaterial) {
  const domes: { centre: THREE.Vector3; radius: number }[] = [];
  const map = material.map;
  const image = map?.image as CanvasImageSource & { width?: number; height?: number };
  if (!map || !image?.width || typeof document === "undefined") return domes;
  const uv = node.geometry.getAttribute(map.channel === 2 ? "uv2" : map.channel === 1 ? "uv1" : "uv");
  const position = node.geometry.getAttribute("position");
  if (!uv || !position) return domes;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return domes;
  try {
    context.drawImage(image, 0, 0, size, size);
  } catch {
    return domes;
  }
  const { data } = context.getImageData(0, 0, size, size);
  const lum = (x: number, y: number) => {
    const i = (y * size + x) * 4;
    return data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  };
  const spots: { x: number; y: number; l: number }[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = lum(x, y);
    if (l > 200) spots.push({ x, y, l });
  }
  spots.sort((a, b) => b.l - a.l);
  const centres: { x: number; y: number }[] = [];
  for (const spot of spots) {
    if (centres.every((c) => Math.hypot(c.x - spot.x, c.y - spot.y) > 24)) centres.push(spot);
    if (centres.length === 2) break;
  }
  const p = new THREE.Vector3();
  for (const c of centres) {
    // the island's reach: rings around the centre stay about a third mint (the crescents) and
    // drop to nothing on the flat dark skin beyond the island
    let reach = 0;
    for (let d = 2, misses = 0; d < size / 4 && misses < 3; d++) {
      let hits = 0;
      for (let k = 0; k < 24; k++) {
        const x = Math.round(c.x + d * Math.cos((k / 24) * Math.PI * 2));
        const y = Math.round(c.y + d * Math.sin((k / 24) * Math.PI * 2));
        if (x >= 0 && y >= 0 && x < size && y < size && lum(x, y) > 90) hits++;
      }
      if (hits >= 6) { reach = d; misses = 0; } else misses++;
    }
    const cu = c.x / size, cv = c.y / size, ru = reach / size;
    let best = -1, bestDistance = Infinity, radius = 0;
    for (let v = 0; v < uv.count; v++) {
      const distance = Math.hypot(uv.getX(v) - cu, uv.getY(v) - cv);
      if (distance < bestDistance) { bestDistance = distance; best = v; }
    }
    if (best < 0 || bestDistance > 0.02) continue;
    const centre = new THREE.Vector3().fromBufferAttribute(position, best);
    for (let v = 0; v < uv.count; v++) {
      if (Math.hypot(uv.getX(v) - cu, uv.getY(v) - cv) > ru) continue;
      radius = Math.max(radius, p.fromBufferAttribute(position, v).distanceTo(centre));
    }
    // the documented domes are R 0.27 and 0.42 on the head: anything beyond is a merged island
    if (radius > 0.05) domes.push({ centre, radius: Math.min(radius, 0.5) });
  }
  // The island's reach in the atlas only orders the domes; their radii are the documented
  // ones (v21: the upper dome R 0.42, the lower R 0.27, measured along the head's axis).
  domes.sort((a, b) => b.centre.y - a.centre.y);
  domes.forEach((dome, i) => (dome.radius = i === 0 ? 0.42 : 0.27));
  return domes;
}

function writeDomeWeight(model: THREE.Object3D) {
  const p = new THREE.Vector3();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = Array.isArray(node.material) ? node.material[0] : node.material;
    if (!material || guardianSurfaceFamily(material) !== "skin" || !/head/i.test(material.name)) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute("position");
    if (!position || geometry.getAttribute("aDomeWeight")) return;
    const domes: { centre: THREE.Vector3; radius: number }[] = [];
    for (const sibling of node.parent?.children ?? []) {
      if (!(sibling instanceof THREE.Mesh) || sibling === node) continue;
      const members = coreMembers(sibling);
      if (!members.size) continue;
      for (const cluster of clusterCores(sibling.geometry.getAttribute("position"), members, 0.15).clusters)
        domes.push({ centre: cluster.centre, radius: cluster.max / 0.072 });
    }
    if (!domes.length) domes.push(...domesFromAtlas(node, material));
    const weight = new Float32Array(position.count);
    for (let v = 0; v < position.count && domes.length; v++) {
      p.fromBufferAttribute(position, v);
      let w = 0;
      for (const dome of domes) w = Math.max(w, 1 - p.distanceTo(dome.centre) / dome.radius);
      weight[v] = Math.max(0, w);
    }
    geometry.setAttribute("aDomeWeight", new THREE.BufferAttribute(weight, 1));
  });
}
